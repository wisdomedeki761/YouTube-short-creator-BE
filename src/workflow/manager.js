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
async function handleApproval(videoId, userId, platforms, customTitle = null, customDescription = null, youtubeAccountIds = null, facebookAccountIds = null) {
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
    let youtubeUrls = [];
    let youtubeErrors = [];
    let facebookResult = null;
    let facebookUrls = [];
    let facebookErrors = [];
    const results = [];

    // Get user's API keys from database
    const { data: apiKeys } = await client
      .from('api_keys')
      .select('*')
      .eq('user_id', userId);

    try {
      // Post to YouTube (multiple accounts if specified)
      if (selectedPlatforms.includes('youtube')) {
        const youtubeKeys = (apiKeys || []).filter(k => k.platform === 'youtube');
        if (youtubeKeys.length > 0) {
          try {
            // Determine which accounts to use
            let accountsToUse;
            if (youtubeAccountIds && youtubeAccountIds.length > 0) {
              // Use specified accounts
              accountsToUse = youtubeKeys.filter(k => youtubeAccountIds.includes(k.id));
            } else {
              // Fallback to round-robin (backward compatible)
              const youtubeKey = await getYoutubeKey(userId, youtubeKeys);
              accountsToUse = [youtubeKey];
            }

            console.log(`📤 Posting to ${accountsToUse.length} YouTube account(s)...`);

            // Post to all accounts in parallel
            const youtubeResults = await Promise.allSettled(
              accountsToUse.map(async (apiKey) => {
                console.log(`  → Posting to: ${apiKey.account_tag || 'Unnamed Account'}`);
                const result = await uploadShort(editedPath, title, caption, apiKey);
                return {
                  url: result.url,
                  videoId: result.videoId,
                  accountId: apiKey.id,
                  accountTag: apiKey.account_tag,
                  channelId: apiKey.channel_id,
                  channelTitle: apiKey.channel_title,
                  postedAt: new Date().toISOString(),
                };
              })
            );

            // Separate successes and failures
            youtubeResults.forEach((result, idx) => {
              const account = accountsToUse[idx];
              const accountLabel = account.account_tag || account.channel_title || 'Unknown';

              if (result.status === 'fulfilled') {
                youtubeUrls.push(result.value);
                results.push(`YouTube (${accountLabel}): ${result.value.url}`);
                console.log(`✅ Posted to ${accountLabel}: ${result.value.url}`);
              } else {
                youtubeErrors.push({
                  accountId: account.id,
                  accountTag: account.account_tag,
                  error: result.reason.message,
                });
                results.push(`YouTube (${accountLabel}): Error - ${result.reason.message}`);
                console.error(`⚠️  Error posting to ${accountLabel}:`, result.reason.message);
              }
            });

            // Store first URL for backward compatibility
            if (youtubeUrls.length > 0) {
              youtubeResult = { url: youtubeUrls[0].url };
            }

          } catch (error) {
            console.error('⚠️  Error posting to YouTube:', error.message);
            results.push(`YouTube error: ${error.message}`);
          }
        } else {
          results.push('YouTube: No API keys configured');
        }
      }

      // Post to Facebook (multiple accounts if specified)
      if (selectedPlatforms.includes('facebook')) {
        const facebookKeys = (apiKeys || []).filter(k => k.platform === 'facebook');
        if (facebookKeys.length > 0) {
          try {
            // Determine which accounts to use
            let accountsToUse;
            if (facebookAccountIds && facebookAccountIds.length > 0) {
              // Use specified accounts
              accountsToUse = facebookKeys.filter(k => facebookAccountIds.includes(k.id));
            } else {
              // Fallback to round-robin (backward compatible)
              const facebookKey = await getFacebookKey(userId, facebookKeys);
              accountsToUse = [facebookKey];
            }

            console.log(`📤 Posting to ${accountsToUse.length} Facebook account(s)...`);

            // Post to all accounts in parallel
            const facebookResults = await Promise.allSettled(
              accountsToUse.map(async (apiKey) => {
                console.log(`  → Posting to: ${apiKey.account_tag || 'Unnamed Account'}`);
                const result = await uploadReel(editedPath, caption, 'me', apiKey);
                return {
                  url: result.url,
                  reelId: result.reelId,
                  accountId: apiKey.id,
                  accountTag: apiKey.account_tag,
                  postedAt: new Date().toISOString(),
                };
              })
            );

            // Separate successes and failures
            facebookResults.forEach((result, idx) => {
              const account = accountsToUse[idx];
              const accountLabel = account.account_tag || 'Unknown';

              if (result.status === 'fulfilled') {
                facebookUrls.push(result.value);
                results.push(`Facebook (${accountLabel}): ${result.value.url}`);
                console.log(`✅ Posted to ${accountLabel}: ${result.value.url}`);
              } else {
                facebookErrors.push({
                  accountId: account.id,
                  accountTag: account.account_tag,
                  error: result.reason.message,
                });
                results.push(`Facebook (${accountLabel}): Error - ${result.reason.message}`);
                console.error(`⚠️  Error posting to ${accountLabel}:`, result.reason.message);
              }
            });

            // Store first URL for backward compatibility
            if (facebookUrls.length > 0) {
              facebookResult = { url: facebookUrls[0].url };
            }

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

    // Update status to posted with all URLs
    await client
      .from('videos')
      .update({
        status: VIDEO_STATUS.POSTED,
        youtube_url: youtubeResult?.url || null,
        youtube_urls: youtubeUrls.length > 0 ? youtubeUrls : null,
        facebook_url: facebookResult?.url || null,
        facebook_urls: facebookUrls.length > 0 ? facebookUrls : null,
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
      youtube: youtubeUrls.length > 0 ? {
        urls: youtubeUrls,
        errors: youtubeErrors,
      } : youtubeResult,
      facebook: facebookUrls.length > 0 ? {
        urls: facebookUrls,
        errors: facebookErrors,
      } : facebookResult,
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
