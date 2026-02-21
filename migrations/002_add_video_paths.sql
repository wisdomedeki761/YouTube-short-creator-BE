-- Migration: Add video path columns for cleanup functionality
-- This migration is for updating existing databases

-- Add path columns if they don't exist
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS original_video_path TEXT,
ADD COLUMN IF NOT EXISTS edited_video_path TEXT;

-- Add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_videos_status_created ON videos(status, created_at);

-- Update status column to have a check constraint
ALTER TABLE videos
ADD CONSTRAINT check_valid_status CHECK (
  status IN ('processing', 'pending_approval', 'approved', 'rejected', 'posted', 'deleted')
);
