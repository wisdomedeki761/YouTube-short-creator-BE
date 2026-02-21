-- Migration 005: Pinata-only storage with progress tracking
-- Run this in Supabase SQL Editor

-- Add missing columns from earlier migrations that may not have been applied
ALTER TABLE videos ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS edited_video_ipfs_hash TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS edited_video_ipfs_url TEXT;

-- Add progress tracking column
ALTER TABLE videos ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_videos_edited_ipfs_hash ON videos(edited_video_ipfs_hash);

-- Add Pinata columns to filler_videos if missing
ALTER TABLE filler_videos ADD COLUMN IF NOT EXISTS ipfs_hash TEXT;
ALTER TABLE filler_videos ADD COLUMN IF NOT EXISTS ipfs_url TEXT;
ALTER TABLE filler_videos ADD COLUMN IF NOT EXISTS pinata_account INTEGER;
CREATE INDEX IF NOT EXISTS idx_filler_videos_pinata_account ON filler_videos(pinata_account);
CREATE INDEX IF NOT EXISTS idx_filler_videos_ipfs_hash ON filler_videos(ipfs_hash);
