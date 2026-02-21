// Video Processing Configuration
const VIDEO_CONFIG = {
  MAIN_VIDEO_HEIGHT_PERCENT: parseInt(process.env.MAIN_VIDEO_HEIGHT_PERCENT) || 75,
  SPLIT_POSITIONS: (process.env.SPLIT_POSITIONS || 'top,bottom').split(','),
  OUTPUT_WIDTH: 1080,
  OUTPUT_HEIGHT: 1920,
  VIDEO_CODEC: 'libx264',
  PRESET: 'medium',
  CRF: 23,
  AUDIO_CODEC: 'aac',
  AUDIO_BITRATE: '128k',
};

// Supabase Configuration
const SUPABASE_CONFIG = {
  URL: process.env.SUPABASE_URL,
  KEY: process.env.SUPABASE_KEY, // Anon key for client operations
  SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY, // Service role key for admin operations
  BUCKET_NAME: 'videos',
  FILLER_BUCKET_NAME: 'filler_videos',
};

// User Configuration
const USER_CONFIG = {
  MAX_API_KEYS_PER_PLATFORM: 3,
};

// Platform Configuration
const PLATFORM_CONFIG = {
  YOUTUBE: {
    CATEGORY_ID: 22, // People & Blogs
    PRIVACY_STATUS: 'public',
  },
  FACEBOOK: {
    API_VERSION: 'v19.0',
  },
};

// Status Constants
const VIDEO_STATUS = {
  PROCESSING: 'processing',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  POSTED: 'posted',
};

const USER_STATUS = {
  PENDING: false,
  APPROVED: true,
};

// Errors
const ERROR_MESSAGES = {
  NOT_APPROVED: '❌ You are not approved yet. Please contact admin for approval.',
  NO_FILLER_VIDEOS: '❌ No filler videos available. Admin needs to add filler videos to the library.',
  PROCESSING_ERROR: '❌ Error processing video. Please try again.',
  UPLOAD_ERROR: '❌ Error uploading to platform. Please try again.',
  API_KEY_LIMIT: (platform) => `❌ You can add maximum 3 API keys per platform (${platform}). Remove one to add another.`,
  INVALID_API_KEY: (platform) => `❌ Invalid ${platform} API key. Please verify and try again.`,
  NOT_ADMIN: '❌ Admin access required.',
};

// Success Messages
const SUCCESS_MESSAGES = {
  APPROVAL_REQUESTED: '✅ Approval request sent to admin.',
  USER_APPROVED: '✅ You have been approved! You can now upload videos.',
  API_KEY_ADDED: (platform) => `✅ ${platform} API key added successfully.`,
  API_KEY_REMOVED: '✅ API key removed successfully.',
  VIDEO_PROCESSING: '⏳ Processing your video... This may take a few minutes.',
  VIDEO_READY: '🎬 Your edited video is ready! Review and approve or reject:',
  VIDEO_POSTED: '✅ Video posted successfully!\n📱 YouTube: {youtubeUrl}\n📘 Facebook: {facebookUrl}',
  VIDEO_REJECTED: '✅ Video rejected and deleted.',
};

module.exports = {
  VIDEO_CONFIG,
  SUPABASE_CONFIG,
  USER_CONFIG,
  PLATFORM_CONFIG,
  VIDEO_STATUS,
  USER_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
};
