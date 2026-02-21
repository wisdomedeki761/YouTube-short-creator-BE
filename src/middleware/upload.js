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
// Max file size: 200MB
const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB
  },
}).single('video'); // Field name: 'video'

module.exports = {
  uploadVideo,
};
