/**
 * Video Controller
 * Handles video upload, processing, and management
 */

const { getSupabaseClient } = require('../storage/supabase');
const { v4: uuidv4 } = require('uuid');

/**
 * Create video record
 */
async function createVideo(userId, videoData) {
  try {
    const client = getSupabaseClient();
    const insertData = {
      id: uuidv4(),
      user_id: userId,
      status: 'processing',
      processing_progress: 0,
      created_at: new Date().toISOString()
    };

    // Add optional fields if provided
    if (videoData.title) {
      insertData.title = videoData.title;
    }
    if (videoData.description) {
      insertData.description = videoData.description;
    }

    const { data: video, error } = await client
      .from('videos')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw error;
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

    const client = getSupabaseClient();

    // Single query with count
    let query = client
      .from('videos')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (status) {
      query = query.eq('status', status);
    }

    const offset = (page - 1) * limit;
    const { data: videos, count: total, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('getVideos DB error:', error);
      throw error;
    }

    console.log(`📋 DB returned ${videos?.length || 0} videos for user ${userId} (total: ${total})`);

    return {
      videos: (videos || []).map(mapVideoToFrontend),
      total: total || 0,
      page,
      limit,
      pages: Math.ceil((total || 0) / limit)
    };
  } catch (error) {
    throw new Error(`Failed to get videos: ${error.message}`);
  }
}

/**
 * Get video by ID
 */
async function getVideoById(userId, videoId) {
  try {
    const client = getSupabaseClient();
    const { data: video, error } = await client
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

    if (error || !video) {
      throw new Error('Video not found');
    }

    return mapVideoToFrontend(video);
  } catch (error) {
    throw new Error(`Failed to get video: ${error.message}`);
  }
}

/**
 * Update video status
 */
async function updateVideoStatus(userId, videoId, status) {
  try {
    const client = getSupabaseClient();

    // Verify video belongs to user
    const { data: video } = await client
      .from('videos')
      .select('id')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

    if (!video) {
      throw new Error('Video not found');
    }

    const updateData = { status };

    if (status === 'completed' || status === 'rejected') {
      updateData.processed_at = new Date().toISOString();
    }

    const { data: updated, error } = await client
      .from('videos')
      .update(updateData)
      .eq('id', videoId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return updated;
  } catch (error) {
    throw new Error(`Failed to update video status: ${error.message}`);
  }
}

/**
 * Approve video and post to platforms
 */
async function approveVideo(userId, videoId, platforms, title = null, description = null) {
  try {
    const { handleApproval } = require('../workflow/manager');
    const result = await handleApproval(videoId, userId, platforms, title, description);

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
    const client = getSupabaseClient();

    // Verify video belongs to user
    const { data: video } = await client
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

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
    const { error } = await client
      .from('videos')
      .delete()
      .eq('id', videoId);

    if (error) {
      throw error;
    }

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
