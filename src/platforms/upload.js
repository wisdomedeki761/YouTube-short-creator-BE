/**
 * File Upload Middleware
 * Handles multipart/form-data file uploads
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
fs.ensureDirSync(uploadsDir);

// Configure multer for memory storage (we'll upload to Supabase)
const storage = multer.memoryStorage();

// File filter - only allow video files
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/mpeg'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only video files are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB max file size
  }
});

// Middleware for single video file upload
const uploadVideo = upload.single('video');

// Middleware for multiple files (for filler videos)
const uploadMultiple = upload.array('videos', 10);

module.exports = {
  uploadVideo,
  uploadMultiple
};

