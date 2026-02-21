const { getSupabaseClient, deleteVideo } = require('./supabase');
const { VIDEO_STATUS } = require('../config/constants');

/**
 * Clean up orphaned videos that are stuck in processing or pending approval
 * Runs periodically to free up storage space
 */
async function cleanupOrphanedVideos() {
  try {
    const client = getSupabaseClient();

    // Find videos that have been in processing for more than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: orphanedVideos, error } = await client
      .from('videos')
      .select('*')
      .in('status', [VIDEO_STATUS.PROCESSING, VIDEO_STATUS.PENDING_APPROVAL])
      .lt('created_at', oneHourAgo);

    if (error) {
      console.error('Error fetching orphaned videos:', error);
      return;
    }

    if (!orphanedVideos || orphanedVideos.length === 0) {
      console.log('✅ No orphaned videos found');
      return;
    }

    console.log(`🗑️  Found ${orphanedVideos.length} orphaned video(s). Cleaning up...`);

    let deletedCount = 0;

    for (const video of orphanedVideos) {
      try {
        // Delete original video
        if (video.original_video_path) {
          try {
            await deleteVideo(video.original_video_path);
            console.log(`  ✓ Deleted original video: ${video.id}`);
          } catch (err) {
            console.error(`  ✗ Failed to delete original video ${video.id}:`, err.message);
          }
        }

        // Delete edited video
        if (video.edited_video_path) {
          try {
            await deleteVideo(video.edited_video_path);
            console.log(`  ✓ Deleted edited video: ${video.id}`);
          } catch (err) {
            console.error(`  ✗ Failed to delete edited video ${video.id}:`, err.message);
          }
        }

        // Update status to deleted
        await client
          .from('videos')
          .update({ status: 'deleted' })
          .eq('id', video.id);

        deletedCount++;
      } catch (error) {
        console.error(`Error cleaning up video ${video.id}:`, error);
      }
    }

    console.log(`✅ Cleanup complete. Removed ${deletedCount} orphaned video(s).`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Start periodic cleanup job (runs every 30 minutes)
 */
function startCleanupJob() {
  try {
    // Run cleanup on startup
    cleanupOrphanedVideos();

    // Schedule periodic cleanup every 30 minutes
    setInterval(async () => {
      try {
        await cleanupOrphanedVideos();
      } catch (error) {
        console.error('Error in scheduled cleanup job:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes

    console.log('✅ Cleanup job scheduled (every 30 minutes)');
  } catch (error) {
    console.error('Error starting cleanup job:', error);
  }
}

module.exports = {
  cleanupOrphanedVideos,
  startCleanupJob,
};
