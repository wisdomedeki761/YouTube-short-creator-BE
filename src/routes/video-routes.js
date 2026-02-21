/**
 * Video Routes
 * POST /api/videos/upload - Upload video
 * GET /api/videos - List videos
 * GET /api/videos/:id - Get video details
 * POST /api/videos/:id/approve - Approve and post
 * POST /api/videos/:id/reject - Reject video
 * DELETE /api/videos/:id - Delete video
 * GET /api/videos/:id/download - Download video
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { uploadVideo: uploadVideoMiddleware } = require('../middleware/upload');
const {
  createVideo,
  getVideos,
  getVideoById,
  approveVideo,
  rejectVideo,
  deleteVideo
} = require('../controllers/video-controller');
const { processVideoWorkflow } = require('../workflow/manager');
const { emitProgress, emitError } = require('../websocket/socket-server');

/**
 * POST /api/videos/upload
 * Upload and process video (Pinata-only, no Supabase storage)
 */
router.post('/upload', uploadVideoMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Video file is required').body
      });
    }

    // Save uploaded file to temp directory
    const file = req.file;
    const tempDir = path.join(__dirname, '../../uploads/temp');
    await fs.ensureDir(tempDir);

    const tempFilePath = path.join(tempDir, `${userId}_${Date.now()}_${file.originalname}`);
    await fs.writeFile(tempFilePath, file.buffer);

    // Parse metadata if provided
    let metadata = {};
    if (req.body.metadata) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch (e) {
        console.warn('Invalid metadata JSON:', e.message);
      }
    }

    // Create video record in database (no Supabase storage for original)
    const video = await createVideo(userId, {
      title: metadata.title,
      description: metadata.description
    });

    // Respond immediately with video ID so frontend can subscribe to progress
    res.status(201).json({
      ...successResponse(video, 'Video uploaded, processing started').body
    });

    // Start async processing with WebSocket progress updates
    emitProgress(video.id, 'upload_complete', 5, 'File received, starting processing...');

    processVideoWorkflow(video.id, userId, tempFilePath)
      .catch(error => {
        console.error(`Error processing video ${video.id}:`, error.message);
        emitError(video.id, error.message);
      });
  } catch (error) {
    console.error('Upload video error:', error.message);
    return res.status(400).json({
      ...errorResponse('UPLOAD_ERROR', error.message).body
    });
  }
});

/**
 * GET /api/videos
 * List user's videos with filters
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    console.log(`📋 GET /api/videos - userId: ${userId}, status: ${status || 'all'}`);

    const result = await getVideos(userId, {
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    console.log(`📋 Found ${result.total} video(s), returning ${result.videos.length} on page ${result.page}`);

    return res.status(200).json({
      ...paginatedResponse(
        result.videos,
        result.page,
        result.limit,
        result.total,
        'Videos retrieved successfully'
      ).body
    });
  } catch (error) {
    console.error('List videos error:', error.message);
    return res.status(400).json({
      ...errorResponse('LIST_ERROR', error.message).body
    });
  }
});

/**
 * GET /api/videos/:id
 * Get video details
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const video = await getVideoById(userId, id);

    return res.status(200).json({
      ...successResponse(video, 'Video retrieved successfully').body
    });
  } catch (error) {
    console.error('Get video error:', error.message);
    return res.status(404).json({
      ...errorResponse('NOT_FOUND', error.message).body
    });
  }
});

/**
 * POST /api/videos/:id/approve
 * Approve and post video to YouTube/Facebook
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { platforms, title, description } = req.body; // platforms: ['youtube', 'facebook'], title: string, description: string

    const result = await approveVideo(userId, id, platforms, title, description);

    return res.status(200).json({
      ...successResponse(result, 'Video approved and posted successfully').body
    });
  } catch (error) {
    console.error('Approve video error:', error.message);
    return res.status(400).json({
      ...errorResponse('APPROVE_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/videos/:id/reject
 * Reject video
 */
router.post('/:id/reject', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await rejectVideo(userId, id);

    return res.status(200).json({
      ...successResponse(result, 'Video rejected successfully').body
    });
  } catch (error) {
    console.error('Reject video error:', error.message);
    return res.status(400).json({
      ...errorResponse('REJECT_ERROR', error.message).body
    });
  }
});

/**
 * DELETE /api/videos/:id
 * Delete video
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await deleteVideo(userId, id);

    return res.status(200).json({
      ...successResponse(result, 'Video deleted successfully').body
    });
  } catch (error) {
    console.error('Delete video error:', error.message);
    return res.status(400).json({
      ...errorResponse('DELETE_ERROR', error.message).body
    });
  }
});

/**
 * GET /api/videos/:id/download
 * Download processed video
 */
router.get('/:id/download', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const video = await getVideoById(userId, id);

    // Prefer IPFS URL, fall back to edited_video_url for backward compatibility
    const downloadUrl = video.edited_video_ipfs_url || video.edited_video_url;

    if (!downloadUrl) {
      return res.status(400).json({
        ...errorResponse('NOT_READY', 'Processed video not available yet').body
      });
    }

    return res.status(200).json({
      ...successResponse(
        { downloadUrl },
        'Download URL retrieved'
      ).body
    });
  } catch (error) {
    console.error('Download video error:', error.message);
    return res.status(404).json({
      ...errorResponse('NOT_FOUND', error.message).body
    });
  }
});

module.exports = router;
