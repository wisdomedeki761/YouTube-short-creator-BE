/**
 * Video Controller
 * Handles video upload, processing, and management
 */

const { query } = require('../storage/postgres');
const { v4: uuidv4 } = require('uuid');

/**
 * Create video record
 */
async function createVideo(userId, videoData) {
  try {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    
    const sql = `
      INSERT INTO videos (id, user_id, status, processing_progress, title, description, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      id, 
      userId, 
      'processing', 
      0, 
      videoData.title || null, 
      videoData.description || null, 
      createdAt
    ];

    const rows = await query(sql, values);
    const video = rows[0];

    if (!video) {
      throw new Error('Failed to insert video record');
    }

    return mapVideoToFrontend(video);
  } catch (error) {
    throw new Error(`Failed to create video: ${error.message}`);
  }
}

/**
 * Map database row (snake_case) to frontend format (camelCase)
 */
function mapVideoToFrontend(video) {
  return {
    id: video.id,
    userId: video.user_id,
    title: video.title || 'Untitled Video',
    status: video.status,
    processingProgress: video.processing_progress || 0,
    editedVideoUrl: video.edited_video_ipfs_url || video.edited_video_url || null,
    editedVideoIpfsHash: video.edited_video_ipfs_hash || null,
    youtubeUrl: video.youtube_url || null,
    facebookUrl: video.facebook_url || null,
    createdAt: video.created_at,
    updatedAt: video.updated_at,
    processedAt: video.processed_at || null,
  };
}

/**
 * Get user's videos
 */
async function getVideos(userId, filters = {}) {
  try {
    const { status, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    let sql = `SELECT *, count(*) OVER() as total_count FROM videos WHERE user_id = $1`;
    const values = [userId];

    if (status) {
      sql += ` AND status = $${values.length + 1}`;
      values.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const rows = await query(sql, values);
    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

    console.log(`📋 DB returned ${rows.length} videos for user ${userId} (total: ${total})`);

    return {
      videos: rows.map(mapVideoToFrontend),
      total: total,
    };
  } catch (error) {
    console.error('getVideos DB error:', error);
    throw error;
  }
}

/**
 * Get video by ID
 */
async function getVideoById(userId, videoId) {
  try {
    const rows = await query(
      'SELECT * FROM videos WHERE id = $1 AND user_id = $2',
      [videoId, userId]
    );
    const video = rows[0];

    if (!video) {
      throw new Error('Video not found');
    }

    return mapVideoToFrontend(video);
  } catch (error) {
    throw new Error(`Failed to get video: ${error.message}`);
  }
}

async function updateVideoStatus(userId, videoId, status) {
  try {
    // Verify video belongs to user and update status
    const result = await query(
      'UPDATE videos SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id',
      [status, videoId, userId]
    );

    if (result.length === 0) {
      throw new Error('Video not found or unauthorized');
    }

    return { success: true, message: `Video status updated to ${status}` };
  } catch (error) {
    throw new Error(`Failed to update video status: ${error.message}`);
  }
}

/**
 * Approve video and post to platforms
 */
async function approveVideo(userId, videoId, platforms, title = null, description = null, youtubeAccounts = null, facebookAccounts = null) {
  try {
    const { handleApproval } = require('../workflow/manager');
    const result = await handleApproval(
      videoId,
      userId,
      platforms,
      title,
      description,
      youtubeAccounts,
      facebookAccounts
    );

    return result;
  } catch (error) {
    throw new Error(`Failed to approve video: ${error.message}`);
  }
}

/**
 * Reject video
 */
async function rejectVideo(userId, videoId) {
  try {
    // Use workflow manager to handle rejection (deletes from Pinata)
    const { handleRejection } = require('../workflow/manager');
    const result = await handleRejection(videoId, userId);

    return result;
  } catch (error) {
    throw new Error(`Failed to reject video: ${error.message}`);
  }
}

/**
 * Delete video
 */
async function deleteVideo(userId, videoId) {
  try {
    // Verify video belongs to user
    const rows = await query(
      'SELECT id, edited_video_ipfs_hash FROM videos WHERE id = $1 AND user_id = $2',
      [videoId, userId]
    );
    const video = rows[0];

    if (!video) {
      throw new Error('Video not found');
    }

    // Delete edited video from Pinata if it exists
    if (video.edited_video_ipfs_hash) {
      try {
        const { deleteFromPinata, getEditedVideoAccount } = require('../storage/pinata');
        const pinataAccount = getEditedVideoAccount();
        await deleteFromPinata(video.edited_video_ipfs_hash, pinataAccount);
        console.log(`🗑️  Deleted video ${videoId} from Pinata`);
      } catch (pinataErr) {
        console.error(`⚠️  Failed to delete from Pinata (continuing with DB delete):`, pinataErr.message);
      }
    }

    // Delete from database
    await query('DELETE FROM videos WHERE id = $1 AND user_id = $2', [videoId, userId]);

    return { message: 'Video deleted successfully' };
  } catch (error) {
    throw new Error(`Failed to delete video: ${error.message}`);
  }
}

module.exports = {
  createVideo,
  getVideos,
  getVideoById,
  updateVideoStatus,
  approveVideo,
  rejectVideo,
  deleteVideo
};
