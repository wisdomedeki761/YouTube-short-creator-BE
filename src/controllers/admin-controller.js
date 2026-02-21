/**
 * Admin Controller
 * Handles user management, filler videos, and statistics
 */

const { getSupabaseClient } = require('../storage/supabase');
const { v4: uuidv4 } = require('uuid');
const { uploadToPinata } = require('../storage/pinata');
const { getNextFillerAccount, updateAccountUsage } = require('../storage/storage-manager');
const { getVideoDuration } = require('../video/utils');
const path = require('path');
const fs = require('fs-extra');

/**
 * Get all users
 */
async function getUsers(filters = {}) {
  try {
    const { status, page = 1, limit = 10 } = filters;

    const client = getSupabaseClient();
    let query = client.from('users').select('*');

    if (status) {
      if (status === 'pending') {
        query = query.eq('is_approved', false);
      } else if (status === 'approved') {
        query = query.eq('is_approved', true);
      }
    }

    // Get total count
    const { data: countData } = await query;
    const total = countData ? countData.length : 0;

    // Pagination
    const offset = (page - 1) * limit;
    const { data: users, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return {
      users: users || [],
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    };
  } catch (error) {
    throw new Error(`Failed to get users: ${error.message}`);
  }
}

/**
 * Approve user
 */
async function approveUser(userId) {
  try {
    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .update({
        is_approved: true,
        approved_at: new Date().toISOString()
      })
      .eq('telegram_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
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
    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .update({
        is_approved: false
      })
      .eq('telegram_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
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
    const client = getSupabaseClient();

    // Update user status
    const { data: user, error } = await client
      .from('users')
      .update({
        is_approved: false
      })
      .eq('telegram_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
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
    const client = getSupabaseClient();

    // Get total users
    const { data: users } = await client.from('users').select('id');
    const totalUsers = users ? users.length : 0;

    // Get approved users
    const { data: approvedUsers } = await client
      .from('users')
      .select('id')
      .eq('is_approved', true);
    const approvedCount = approvedUsers ? approvedUsers.length : 0;

    // Get total videos
    const { data: videos } = await client.from('videos').select('id');
    const totalVideos = videos ? videos.length : 0;

    // Get completed videos
    const { data: completedVideos } = await client
      .from('videos')
      .select('id')
      .eq('status', 'completed');
    const completedCount = completedVideos ? completedVideos.length : 0;

    // Get processing videos
    const { data: processingVideos } = await client
      .from('videos')
      .select('id')
      .eq('status', 'processing');
    const processingCount = processingVideos ? processingVideos.length : 0;

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
    const client = getSupabaseClient();
    
    // Get count of existing filler videos
    const { count, error } = await client
      .from('filler_videos')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.warn('⚠️  Error getting filler video count, starting from 1:', error.message);
      return 1;
    }

    const nextSerial = (count || 0) + 1;
    return nextSerial;
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

    // Get next available Pinata account (1-4)
    console.log('📦 Selecting Pinata account for filler video...');
    const pinataAccount = await getNextFillerAccount();
    console.log(`✅ Selected Pinata account: ${pinataAccount}`);

    // Upload to Pinata with serial name
    console.log(`📤 Uploading to Pinata account ${pinataAccount}...`);
    const uploadResult = await uploadToPinata(filePath, pinataAccount, {
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

    console.log(`✅ Uploaded to Pinata successfully`);
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
    const client = getSupabaseClient();
    const { data: videos, error } = await client
      .from('filler_videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return videos || [];
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
