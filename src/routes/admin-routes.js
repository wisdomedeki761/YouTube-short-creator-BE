/**
 * Admin Routes (Admin only)
 * GET /api/admin/users - List users
 * POST /api/admin/users/:id/approve - Approve user
 * POST /api/admin/users/:id/reject - Reject user
 * POST /api/admin/users/:id/revoke - Revoke access
 * GET /api/admin/stats - Get statistics
 */

const express = require('express');
const router = express.Router();
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { adminOnlyMiddleware } = require('../middleware/jwt-middleware');
const {
  getUsers,
  approveUser,
  rejectUser,
  revokeUser,
  getStatistics,
  uploadFillerVideo,
  getFillerVideos,
  deleteFillerVideo
} = require('../controllers/admin-controller');
const { uploadVideo: uploadVideoMiddleware } = require('../middleware/upload');
const path = require('path');
const fs = require('fs-extra');

// Apply admin check to all routes
router.use(adminOnlyMiddleware);

/**
 * GET /api/admin/users
 * List all users with filters
 */
router.get('/users', async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const result = await getUsers({
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return res.status(200).json({
      ...paginatedResponse(
        result.users,
        result.page,
        result.limit,
        result.total,
        'Users retrieved successfully'
      ).body
    });
  } catch (error) {
    console.error('List users error:', error.message);
    return res.status(400).json({
      ...errorResponse('LIST_USERS_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/admin/users/:id/approve
 * Approve user
 */
router.post('/users/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await approveUser(id);

    return res.status(200).json({
      ...successResponse(user, 'User approved successfully').body
    });
  } catch (error) {
    console.error('Approve user error:', error.message);
    return res.status(400).json({
      ...errorResponse('APPROVE_USER_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/admin/users/:id/reject
 * Reject user
 */
router.post('/users/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await rejectUser(id);

    return res.status(200).json({
      ...successResponse(user, 'User rejected successfully').body
    });
  } catch (error) {
    console.error('Reject user error:', error.message);
    return res.status(400).json({
      ...errorResponse('REJECT_USER_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/admin/users/:id/revoke
 * Revoke user access
 */
router.post('/users/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await revokeUser(id);

    return res.status(200).json({
      ...successResponse(user, 'User access revoked successfully').body
    });
  } catch (error) {
    console.error('Revoke user error:', error.message);
    return res.status(400).json({
      ...errorResponse('REVOKE_USER_ERROR', error.message).body
    });
  }
});

/**
 * GET /api/admin/stats
 * Get platform statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStatistics();

    return res.status(200).json({
      ...successResponse(stats, 'Statistics retrieved successfully').body
    });
  } catch (error) {
    console.error('Get statistics error:', error.message);
    return res.status(400).json({
      ...errorResponse('STATS_ERROR', error.message).body
    });
  }
});

/**
 * GET /api/admin/filler-videos
 * Get all filler videos from database
 */
router.get('/filler-videos', async (req, res) => {
  try {
    console.log('📋 Fetching filler videos from database...');
    const fillerVideos = await getFillerVideos();
    console.log(`✅ Found ${fillerVideos?.length || 0} filler video(s) in database`);
    
    // Map database records to expected format
    const mappedVideos = (fillerVideos || []).map((video) => ({
      id: video.id,
      filename: video.filename, // This is now the serial name (e.g., "filler-video-001")
      fileSize: video.file_size || 0,
      duration: video.duration || 0,
      ipfsHash: video.ipfs_hash || null,
      ipfsUrl: video.ipfs_url || null,
      pinataAccount: video.pinata_account || null,
      timesUsed: video.times_used || 0,
      createdAt: video.created_at || video.createdAt || new Date().toISOString(),
    }));
    
    return res.status(200).json({
      ...successResponse(mappedVideos, 'Filler videos retrieved successfully').body
    });
  } catch (error) {
    console.error('❌ Get filler videos error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(400).json({
      ...errorResponse('GET_FILLER_VIDEOS_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/admin/filler-videos
 * Upload filler video to Pinata
 */
router.post('/filler-videos', uploadVideoMiddleware, async (req, res) => {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🚀 FILLER VIDEO UPLOAD REQUEST RECEIVED');
  console.log('='.repeat(60));
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  
  try {
    if (!req.file) {
      console.error('❌ No file provided in request');
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Video file is required').body
      });
    }

    console.log(`📁 Received file: ${req.file.originalname}`);
    console.log(`📦 File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📋 MIME type: ${req.file.mimetype}`);

    // Save uploaded file to temp location
    const tempDir = path.join(__dirname, '../../temp');
    await fs.ensureDir(tempDir);
    const tempFilePath = path.join(tempDir, `filler_${Date.now()}_${req.file.originalname}`);
    console.log(`💾 Saving to temp location: ${tempFilePath}`);
    await fs.writeFile(tempFilePath, req.file.buffer);
    console.log(`✅ File saved to temp location`);

    try {
      // Upload to Pinata and save to database
      const result = await uploadFillerVideo(tempFilePath, req.file.originalname);

      // Clean up temp file
      console.log('🧹 Cleaning up temp file...');
      await fs.remove(tempFilePath).catch(() => {});
      console.log('✅ Temp file cleaned up');

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n⏱️  Total upload time: ${duration} seconds`);
      console.log('='.repeat(60) + '\n');

      return res.status(201).json({
        ...successResponse(result, 'Filler video uploaded successfully').body
      });
    } catch (uploadError) {
      console.error('\n❌ UPLOAD ERROR:');
      console.error('Error message:', uploadError.message);
      console.error('Error stack:', uploadError.stack);
      console.error('='.repeat(60) + '\n');
      
      // Clean up temp file on error
      await fs.remove(tempFilePath).catch(() => {});
      throw uploadError;
    }
  } catch (error) {
    console.error('\n❌ REQUEST ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('='.repeat(60) + '\n');
    return res.status(400).json({
      ...errorResponse('UPLOAD_FILLER_VIDEO_ERROR', error.message).body
    });
  }
});

/**
 * DELETE /api/admin/filler-videos/:id
 * Delete filler video from Pinata and database
 */
router.delete('/filler-videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteFillerVideo(id);

    return res.status(200).json({
      ...successResponse(result, 'Filler video deleted successfully').body
    });
  } catch (error) {
    console.error('Delete filler video error:', error.message);
    return res.status(400).json({
      ...errorResponse('DELETE_FILLER_VIDEO_ERROR', error.message).body
    });
  }
});

module.exports = router;
