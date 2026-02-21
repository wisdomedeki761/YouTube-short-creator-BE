/**
 * Upload Middleware
 * Handles multipart/form-data file uploads using multer
 */

const multer = require('multer');

// Use memory storage so we get the file buffer in req.file.buffer
const storage = multer.memoryStorage();

// File filter - only accept video files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'video/mp4',
    'video/quicktime',   // .mov
    'video/x-msvideo',   // .avi
    'video/x-matroska',  // .mkv
    'video/webm',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only video files are allowed.`), false);
  }
};

// Configure multer for video uploads
// Max file size: 100MB
const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
}).single('video'); // Field name: 'video'

module.exports = {
  uploadVideo,
};
