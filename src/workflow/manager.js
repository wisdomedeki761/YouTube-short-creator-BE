const path = require('path');
const fs = require('fs-extra');
const { processVideo, generateVideoTitle, generateVideoCaption } = require('../video/processor');
const { getSupabaseClient } = require('../storage/supabase');
const { uploadToPinata, deleteFromPinata, getEditedVideoAccount } = require('../storage/pinata');
const axios = require('axios');
const { uploadShort, getAvailableApiKey: getYoutubeKey } = require('../platforms/youtube');
const { uploadReel, getAvailableApiKey: getFacebookKey } = require('../platforms/facebook');
const { VIDEO_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } = require('../config/constants');
const { emitProgress, emitError } = require('../websocket/socket-server');

/**
 * Clean up all temp files (filler downloads, concat files, etc.)
 */
async function cleanupTempFiles() {
  const tempDir = path.join(process.cwd(), 'temp');
  try {
    if (!fs.existsSync(tempDir)) {
      return; // temp dir doesn't exist
    }

    const files = await fs.readdir(tempDir);
    let deleted = 0;

    for (const file of files) {
      // Delete filler downloads, concat files, edited outputs, and download files
      if (
        file.startsWith('filler_') ||
        file.startsWith('concat_') ||
        file.startsWith('edited_') ||
        file.startsWith('download_')
      ) {
        try {
          const filePath = path.join(tempDir, file);
          await fs.remove(filePath);
          deleted++;
        } catch (err) {
          console.warn(`⚠️  Failed to delete ${file}:`, err.message);
        }
      }
    }

    if (deleted > 0) {
      console.log(`🗑️  Cleaned up ${deleted} temp file(s)`);
    }
  } catch (err) {
    console.warn(`⚠️  Error during temp file cleanup:`, err.message);
  }
}

/**
 * Update processing progress in database and emit via WebSocket
 */
async function updateProgress(videoId, stage, progress, message) {
  emitProgress(videoId, stage, progress, message);

  try {
    const client = getSupabaseClient();
    await client
      .from('videos')
      .update({ processing_progress: Math.round(progress) })
      .eq('id', videoId);
  } catch (err) {
    console.warn(`Failed to update progress in DB for ${videoId}:`, err.message);
  }
}

/**
 * Process video workflow (editing with filler + upload to Pinata)
 * Called after user uploads a video from the web dashboard
 */
async function processVideoWorkflow(videoId, userId, mainVideoPath) {
  try {
    console.log(`\n🎬 Starting video processing for ${videoId}...`);

    // Stage: Analyzing
    await updateProgress(videoId, 'analyzing', 5, 'Analyzing video...');

    // Process video with split-screen (processor handles filler download, chain, split-screen)
    const editedVideoPath = await processVideo(mainVideoPath, null, videoId);

    // Stage: Uploading to Pinata
    await updateProgress(videoId, 'uploading', 90, 'Uploading to storage...');

    console.log('📦 Uploading edited video to Pinata account 5...');
    const pinataAccount = getEditedVideoAccount();
    const uploadResult = await uploadToPinata(editedVideoPath, pinataAccount, {
      name: `edited_${videoId}.mp4`,
      contentType: 'video/mp4',
      metadata: {
        name: `Edited Video ${videoId}`,
        keyvalues: {
          video_id: videoId,
          user_id: userId,
          type: 'edited_video',
          uploaded_at: new Date().toISOString(),
        },
      },
    });

    // Update video status with IPFS URL and hash
    const client = getSupabaseClient();
    const { error: updateError } = await client
      .from('videos')
      .update({
        status: VIDEO_STATUS.PENDING_APPROVAL,
        processing_progress: 100,
        edited_video_ipfs_hash: uploadResult.ipfsHash,
        edited_video_ipfs_url: uploadResult.ipfsUrl,
        edited_video_url: uploadResult.ipfsUrl,
        processed_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    if (updateError) {
      throw updateError;
    }

    // Clean up ALL temp files (original, edited, and downloaded fillers)
    try {
      if (mainVideoPath && fs.existsSync(mainVideoPath)) {
        await fs.remove(mainVideoPath);
        console.log(`🗑️  Deleted main video: ${mainVideoPath}`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to delete main video:`, err.message);
    }

    try {
      if (editedVideoPath && fs.existsSync(editedVideoPath)) {
        await fs.remove(editedVideoPath);
        console.log(`🗑️  Deleted edited video: ${editedVideoPath}`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to delete edited video:`, err.message);
    }

    try {
      await cleanupTempFiles();
    } catch (err) {
      console.warn(`⚠️  Failed to clean up temp files:`, err.message);
    }

    // Stage: Complete
    await updateProgress(videoId, 'complete', 100, 'Ready for review!');

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ VIDEO PROCESSING COMPLETE`);
    console.log(`${'='.repeat(50)}`);
    console.log(`📹 Video ID: ${videoId}`);
    console.log(`🗑️  ✓ Local temp files deleted`);
    console.log(`📦 ✓ Uploaded to Pinata (IPFS)`);
    console.log(`⏳ Waiting for approval...`);
    console.log(`${'='.repeat(50)}\n`);

    return {
      videoId: videoId,
      previewUrl: uploadResult.ipfsUrl,
      message: SUCCESS_MESSAGES.VIDEO_READY,
    };
  } catch (error) {
    console.error(`❌ Error processing video ${videoId}:`, error);

    // Update status to rejected on failure
    try {
      const client = getSupabaseClient();
      await client
        .from('videos')
        .update({
          status: VIDEO_STATUS.REJECTED,
          processing_progress: -1,
        })
        .eq('id', videoId);
    } catch (dbErr) {
      console.error('Failed to update video status:', dbErr.message);
    }

    // Clean up temp files on error
    try {
      if (mainVideoPath && fs.existsSync(mainVideoPath)) {
        await fs.remove(mainVideoPath);
        console.log(`🗑️  Deleted main video (on error): ${mainVideoPath}`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to delete main video on error:`, err.message);
    }

    try {
      await cleanupTempFiles();
    } catch (err) {
      console.warn(`⚠️  Failed to clean up temp files on error:`, err.message);
    }

    emitError(videoId, ERROR_MESSAGES.PROCESSING_ERROR);
    throw new Error(ERROR_MESSAGES.PROCESSING_ERROR);
  }
}

/**
 * Handle user approval - post to platforms
 */
async function handleApproval(videoId, userId, platforms, customTitle = null, customDescription = null) {
  try {
    // Default to both if not specified
    const selectedPlatforms = Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : ['youtube', 'facebook'];

    console.log(`\n✅ User approved video ${videoId} for platforms: ${selectedPlatforms.join(', ')}`);

    // Get video record from database
    const client = getSupabaseClient();
    const { data: videoRecord, error: fetchError } = await client
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (fetchError || !videoRecord) {
      throw new Error('Video not found');
    }

    // Download from IPFS
    const ipfsUrl = videoRecord.edited_video_ipfs_url || videoRecord.edited_video_url;
    if (!ipfsUrl) {
      throw new Error('Edited video IPFS URL not found');
    }

    const editedPath = path.join(process.cwd(), 'temp', `download_${videoId}.mp4`);
    fs.ensureDirSync(path.dirname(editedPath));

    console.log(`⬇️  Downloading edited video from IPFS: ${ipfsUrl}`);
    const response = await axios({
      method: 'GET',
      url: ipfsUrl,
      responseType: 'stream',
      timeout: 300000,
    });

    const writer = fs.createWriteStream(editedPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`✅ Downloaded edited video to ${editedPath}`);

    // Use provided title and caption, or generate defaults if not provided
    const title = customTitle || generateVideoTitle();
    const caption = customDescription || generateVideoCaption();

    let youtubeResult = null;
    let facebookResult = null;
    const results = [];

    // Get user's API keys from database
    const { data: apiKeys } = await client
      .from('api_keys')
      .select('*')
      .eq('user_id', userId);

    try {
      // Post to YouTube (only if selected)
      if (selectedPlatforms.includes('youtube')) {
        const youtubeKeys = (apiKeys || []).filter(k => k.platform === 'youtube');
        if (youtubeKeys.length > 0) {
          try {
            const youtubeKey = await getYoutubeKey(userId, youtubeKeys);
            youtubeResult = await uploadShort(editedPath, title, caption, youtubeKey);
            results.push(`YouTube: ${youtubeResult.url}`);
            console.log(`✅ Posted to YouTube Shorts: ${youtubeResult.url}`);
          } catch (error) {
            console.error('⚠️  Error posting to YouTube:', error.message);
            results.push(`YouTube error: ${error.message}`);
          }
        } else {
          results.push('YouTube: No API keys configured');
        }
      }

      // Post to Facebook (only if selected)
      if (selectedPlatforms.includes('facebook')) {
        const facebookKeys = (apiKeys || []).filter(k => k.platform === 'facebook');
        if (facebookKeys.length > 0) {
          try {
            const facebookKey = await getFacebookKey(userId, facebookKeys);
            const pageId = 'me';
            facebookResult = await uploadReel(editedPath, caption, pageId, facebookKey);
            results.push(`Facebook: ${facebookResult.url}`);
            console.log(`✅ Posted to Facebook Reels: ${facebookResult.url}`);
          } catch (error) {
            console.error('⚠️  Error posting to Facebook:', error.message);
            results.push(`Facebook error: ${error.message}`);
          }
        } else {
          results.push('Facebook: No API keys configured');
        }
      }
    } catch (error) {
      console.error('❌ Error during posting:', error);
      results.push(`Error: ${error.message}`);
    }

    // Delete edited video from Pinata
    try {
      if (videoRecord.edited_video_ipfs_hash) {
        const pinataAccount = getEditedVideoAccount();
        await deleteFromPinata(videoRecord.edited_video_ipfs_hash, pinataAccount);
        console.log('🗑️  Edited video deleted from Pinata');
      }
    } catch (error) {
      console.error('⚠️  Error deleting from Pinata:', error);
    }

    // Update status to posted
    await client
      .from('videos')
      .update({
        status: VIDEO_STATUS.POSTED,
        youtube_url: youtubeResult?.url || null,
        facebook_url: facebookResult?.url || null,
      })
      .eq('id', videoId);

    // Clean up temp files from download
    try {
      if (editedPath && fs.existsSync(editedPath)) {
        await fs.remove(editedPath);
        console.log(`🗑️  Deleted downloaded video: ${editedPath}`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to delete downloaded video:`, err.message);
    }

    return {
      success: true,
      videoId: videoId,
      results: results,
      youtube: youtubeResult,
      facebook: facebookResult,
      message: `${SUCCESS_MESSAGES.VIDEO_POSTED}\n\n${results.join('\n')}`,
    };
  } catch (error) {
    console.error('❌ Error in approval workflow:', error);

    // Cleanup on error
    try {
      if (editedPath && fs.existsSync(editedPath)) {
        await fs.remove(editedPath);
        console.log(`🗑️  Deleted downloaded video on error: ${editedPath}`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to delete downloaded video on error:`, err.message);
    }

    throw error;
  }
}

/**
 * Handle user rejection
 */
async function handleRejection(videoId, userId) {
  try {
    console.log(`\n❌ User rejected video ${videoId}`);

    // Get video record
    const client = getSupabaseClient();
    const { data: videoRecord, error: fetchError } = await client
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (fetchError || !videoRecord) {
      throw new Error('Video not found');
    }

    // Delete edited video from Pinata
    try {
      if (videoRecord.edited_video_ipfs_hash) {
        const pinataAccount = getEditedVideoAccount();
        await deleteFromPinata(videoRecord.edited_video_ipfs_hash, pinataAccount);
        console.log('🗑️  Edited video deleted from Pinata');
      }
    } catch (error) {
      console.error('⚠️  Error deleting from Pinata:', error);
    }

    // Update status to rejected
    await client
      .from('videos')
      .update({
        status: VIDEO_STATUS.REJECTED,
        processed_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    return {
      success: true,
      videoId: videoId,
      message: SUCCESS_MESSAGES.VIDEO_REJECTED,
    };
  } catch (error) {
    console.error('❌ Error in rejection workflow:', error);
    throw error;
  }
}

module.exports = {
  processVideoWorkflow,
  handleApproval,
  handleRejection,
};
