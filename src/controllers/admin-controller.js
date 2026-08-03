/**
 * Admin Controller
 * Handles user management, filler videos, and statistics
 */

const { query } = require('../storage/postgres');
const { v4: uuidv4 } = require('uuid');
const { uploadToPinata } = require('../storage/pinata');
const { getNextFillerAccount, updateAccountUsage, getAvailableFillerAccount, STORAGE_THRESHOLD } = require('../storage/storage-manager');
const { getVideoDuration } = require('../video/utils');
const path = require('path');
const fs = require('fs-extra');

// Track accounts that are full locally (since Pinata API doesn't provide storage info)
const fullAccounts = new Set();

/**
 * Upload to Pinata with automatic account rotation on failure
 * If one account is full, automatically tries the next available account
 * @param {string} filePath - Path to file to upload
 * @param {object} options - Upload options (name, contentType, metadata)
 * @returns {Promise<{ipfsHash: string, ipfsUrl: string, accountNumber: number}>}
 */
async function uploadToPinataWithRotation(filePath, options = {}) {
  const availableAccounts = getAvailableFillerAccount();
  const fileSizeBytes = fs.statSync(filePath).size;

  console.log(`\n🔄 Starting upload with account rotation...`);
  console.log(`   File size: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);

  // Try each account
  for (const accountNumber of availableAccounts) {
    // Skip if account is marked as full
    if (fullAccounts.has(accountNumber)) {
      console.log(`⏭️  Skipping account ${accountNumber} (marked as full)`);
      continue;
    }

    try {
      console.log(`\n📤 Attempting upload to account ${accountNumber}...`);
      const result = await uploadToPinata(filePath, accountNumber, options);

      console.log(`✅ Successfully uploaded to account ${accountNumber}`);
      console.log(`   IPFS Hash: ${result.ipfsHash}`);

      // Track the upload in storage cache
      updateAccountUsage(accountNumber, fileSizeBytes);

      return {
        ...result,
        accountNumber
      };
    } catch (error) {
      // Check if it's a storage-related error
      const isStorageError =
        error.message.includes('413') ||  // Payload too large
        error.message.includes('full') ||
        error.message.includes('storage') ||
        error.message.includes('quota') ||
        error.response?.status === 413;

      if (isStorageError) {
        console.warn(`⚠️  Account ${accountNumber} appears to be full`);
        fullAccounts.add(accountNumber);

        // Continue to next account
        continue;
      }

      // For other errors, still try next account but log the error
      console.error(`❌ Error uploading to account ${accountNumber}:`, error.message);
      continue;
    }
  }

  // If we get here, all accounts failed
  throw new Error(
    `Failed to upload to any available Pinata account. ` +
    `Full accounts: [${Array.from(fullAccounts).join(', ')}]. ` +
    `Please check Pinata account status or add more accounts.`
  );
}

/**
 * Get all users
 */
async function getUsers(filters = {}) {
  try {
    const { status, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    let sql = `SELECT * FROM users`;
    const values = [];

    if (status) {
      if (status === 'pending') {
        sql += ` WHERE is_approved = false`;
      } else if (status === 'approved') {
        sql += ` WHERE is_approved = true`;
      }
    }

    sql += ` LIMIT $1 OFFSET $2`;
    const rows = await query(sql, [limit, offset]);

    return rows;
  } catch (error) {
    console.error('getUsers DB error:', error);
    throw error;
  }
}

/**
 * Approve user
 */
async function approveUser(userId) {
  try {
    const result = await query(
      'UPDATE users SET is_approved = true, updated_at = NOW() WHERE id = $1 RETURNING *',
      [userId]
    );
    const user = result[0];

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    throw new Error(`Failed to approve user: ${error.message}`);
  }
}

/**
 * Reject user
 */
async function rejectUser(userId) {
  try {
    const result = await query(
      'UPDATE users SET is_approved = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [userId]
    );
    const user = result[0];

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    throw new Error(`Failed to reject user: ${error.message}`);
  }
}

/**
 * Revoke user access
 */
async function revokeUser(userId) {
  try {
    const result = await query(
      'UPDATE users SET is_approved = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [userId]
    );
    const user = result[0];

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    throw new Error(`Failed to revoke user: ${error.message}`);
  }
}

/**
 * Get statistics
 */
async function getStatistics() {
  try {
    const userRows = await query('SELECT id FROM users');
    const totalUsers = userRows.length;

    const approvedRows = await query('SELECT id FROM users WHERE is_approved = true');
    const approvedCount = approvedRows.length;

    const videoRows = await query('SELECT id FROM videos');
    const totalVideos = videoRows.length;

    const completedRows = await query('SELECT id FROM videos WHERE status = \'completed\'');
    const completedCount = completedRows.length;

    const processingRows = await query('SELECT id FROM videos WHERE status = \'processing\'');
    const processingCount = processingRows.length;

    return {
      users: {
        total: totalUsers,
        approved: approvedCount,
        pending: totalUsers - approvedCount
      },
      videos: {
        total: totalVideos,
        completed: completedCount,
        processing: processingCount,
        pending: totalVideos - completedCount - processingCount
      }
    };
  } catch (error) {
    throw new Error(`Failed to get statistics: ${error.message}`);
  }
}

/**
 * Get next serial number for filler video
 */
async function getNextFillerVideoSerial() {
  try {
    const rows = await query('SELECT count(*) as count FROM filler_videos');
    const count = parseInt(rows[0]?.count || 0);
    return count + 1;
  } catch (error) {
    console.warn('⚠️  Error getting filler video count, starting from 1:', error.message);
    return 1;
  }
}

/**
 * Generate serial name for filler video
 */
function generateFillerVideoName(serialNumber) {
  // Format: filler-video-001, filler-video-002, etc.
  const paddedSerial = String(serialNumber).padStart(3, '0');
  return `filler-video-${paddedSerial}`;
}

/**
 * Upload filler video to Pinata
 */
async function uploadFillerVideo(filePath, originalFilename) {
  try {
    const client = getSupabaseClient();

    console.log('\n' + '='.repeat(60));
    console.log('📤 UPLOADING FILLER VIDEO');
    console.log('='.repeat(60));
    console.log(`📁 Original filename: ${originalFilename}`);
    console.log(`📂 File path: ${filePath}`);

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Get file size
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
    console.log(`📦 File size: ${fileSizeMB} MB (${fileSize} bytes)`);

    // Get next serial number and generate name
    console.log('🔢 Getting next serial number...');
    const serialNumber = await getNextFillerVideoSerial();
    const serialName = generateFillerVideoName(serialNumber);
    console.log(`✅ Serial number: ${serialNumber}`);
    console.log(`📝 Serial name: ${serialName}`);

    // Extract video duration (non-blocking - continue even if ffprobe fails)
    console.log('📊 Extracting video duration...');
    let durationSeconds = 0;
    let minutes = 0;
    let seconds = 0;
    try {
      const duration = await getVideoDuration(filePath);
      durationSeconds = Math.round(duration);
      minutes = Math.floor(durationSeconds / 60);
      seconds = durationSeconds % 60;
      console.log(`⏱️  Duration: ${minutes}m ${seconds}s (${durationSeconds} seconds)`);
    } catch (durationError) {
      console.warn(`⚠️  Could not extract duration: ${durationError.message}`);
      console.warn('⚠️  Continuing upload with duration = 0');
    }

    // Upload to Pinata with automatic account rotation on full storage
    console.log('📦 Starting upload with automatic account rotation...');
    const uploadResult = await uploadToPinataWithRotation(filePath, {
      name: `${serialName}.mp4`, // Use serial name for Pinata
      contentType: 'video/mp4',
      metadata: {
        name: serialName,
        keyvalues: {
          type: 'filler_video',
          serial_number: serialNumber,
          original_filename: originalFilename,
          uploaded_at: new Date().toISOString(),
        },
      },
    });

    const pinataAccount = uploadResult.accountNumber;
    console.log(`✅ Uploaded to Pinata successfully`);
    console.log(`   Account: ${pinataAccount}`);
    console.log(`   IPFS Hash: ${uploadResult.ipfsHash}`);
    console.log(`   IPFS URL: ${uploadResult.ipfsUrl}`);

    // Prepare database record
    const videoId = uuidv4();
    const createdAt = new Date().toISOString();
    const updatedAt = new Date().toISOString();
    
    const dbRecord = {
      id: videoId,
      filename: serialName, // Store serial name as filename
      file_path: uploadResult.ipfsHash, // Store IPFS hash as path for reference
      file_size: fileSize,
      duration: durationSeconds,
      ipfs_hash: uploadResult.ipfsHash,
      ipfs_url: uploadResult.ipfsUrl,
      pinata_account: pinataAccount,
      times_used: 0,
      created_at: createdAt,
      updated_at: updatedAt,
    };

    console.log('💾 Saving to database...');
    console.log('📝 Database Record:');
    console.log(JSON.stringify(dbRecord, null, 2));
    
    const { data: fillerVideo, error } = await client
      .from('filler_videos')
      .insert(dbRecord)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    // Update storage usage tracker
    updateAccountUsage(pinataAccount, fileSize);

    console.log('\n✅ FILLER VIDEO UPLOAD COMPLETE');
    console.log('='.repeat(60));
    console.log('📊 SUMMARY:');
    console.log(`   Database ID: ${fillerVideo.id}`);
    console.log(`   Serial Number: ${serialNumber}`);
    console.log(`   Serial Name: ${serialName}`);
    console.log(`   Original Filename: ${originalFilename}`);
    console.log(`   File Size: ${fileSizeMB} MB (${fileSize} bytes)`);
    console.log(`   Duration: ${minutes}m ${seconds}s (${durationSeconds} seconds)`);
    console.log(`   Pinata Account: ${pinataAccount}`);
    console.log(`   IPFS Hash: ${uploadResult.ipfsHash}`);
    console.log(`   IPFS URL: ${uploadResult.ipfsUrl}`);
    console.log(`   Times Used: 0`);
    console.log(`   Created At: ${createdAt}`);
    console.log('='.repeat(60));
    console.log('📦 SAVED TO DATABASE:');
    console.log(JSON.stringify(fillerVideo, null, 2));
    console.log('='.repeat(60) + '\n');

    return {
      ...fillerVideo,
      serialName,
      serialNumber,
      originalFilename,
      ipfsUrl: uploadResult.ipfsUrl,
      pinataAccount,
    };
  } catch (error) {
    console.error('\n❌ ERROR UPLOADING FILLER VIDEO');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
    });
    console.error('='.repeat(60) + '\n');
    throw new Error(`Failed to upload filler video: ${error.message}`);
  }
}

/**
 * Get all filler videos from database
 */
async function getFillerVideos() {
  try {
    const rows = await query('SELECT * FROM filler_videos ORDER BY created_at DESC');
    return rows;
  } catch (error) {
    throw new Error(`Failed to get filler videos: ${error.message}`);
  }
}

/**
 * Delete filler video from Pinata and database
 */
async function deleteFillerVideo(videoId) {
  try {
    const client = getSupabaseClient();

    // Get video record
    const { data: video, error: fetchError } = await client
      .from('filler_videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (fetchError || !video) {
      throw new Error('Filler video not found');
    }

    // Delete from Pinata if IPFS hash exists
    if (video.ipfs_hash && video.pinata_account) {
      const { deleteFromPinata } = require('../storage/pinata');
      try {
        await deleteFromPinata(video.ipfs_hash, video.pinata_account);
        console.log(`✅ Deleted from Pinata: ${video.ipfs_hash}`);
      } catch (pinataError) {
        console.warn(`⚠️  Failed to delete from Pinata: ${pinataError.message}`);
        // Continue with database deletion even if Pinata deletion fails
      }
    }

    // Delete from database
    const { error: deleteError } = await client
      .from('filler_videos')
      .delete()
      .eq('id', videoId);

    if (deleteError) {
      throw deleteError;
    }

    return { message: 'Filler video deleted successfully' };
  } catch (error) {
    throw new Error(`Failed to delete filler video: ${error.message}`);
  }
}

module.exports = {
  getUsers,
  approveUser,
  rejectUser,
  revokeUser,
  getStatistics,
  uploadFillerVideo,
  getFillerVideos,
  deleteFillerVideo,
  getNextFillerVideoSerial,
  generateFillerVideoName,
};
