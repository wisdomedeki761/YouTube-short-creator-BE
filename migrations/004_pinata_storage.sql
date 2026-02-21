-- Migration: Add Pinata IPFS storage columns
-- This migration adds support for storing videos in Pinata IPFS instead of Supabase storage

-- Add IPFS columns to filler_videos table
ALTER TABLE filler_videos
ADD COLUMN IF NOT EXISTS ipfs_hash TEXT,
ADD COLUMN IF NOT EXISTS ipfs_url TEXT,
ADD COLUMN IF NOT EXISTS pinata_account INTEGER;

-- Add IPFS columns to videos table for edited videos
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS edited_video_ipfs_hash TEXT,
ADD COLUMN IF NOT EXISTS edited_video_ipfs_url TEXT;

-- Create index for efficient queries by pinata_account
CREATE INDEX IF NOT EXISTS idx_filler_videos_pinata_account ON filler_videos(pinata_account);

-- Create index for IPFS hash lookups
CREATE INDEX IF NOT EXISTS idx_filler_videos_ipfs_hash ON filler_videos(ipfs_hash);
CREATE INDEX IF NOT EXISTS idx_videos_edited_ipfs_hash ON videos(edited_video_ipfs_url);

-- Add comments for documentation
COMMENT ON COLUMN filler_videos.ipfs_hash IS 'IPFS hash (CID) for the filler video stored in Pinata';
COMMENT ON COLUMN filler_videos.ipfs_url IS 'Pinata gateway URL for accessing the filler video';
COMMENT ON COLUMN filler_videos.pinata_account IS 'Pinata account number (1-4) used to store this filler video';
COMMENT ON COLUMN videos.edited_video_ipfs_hash IS 'IPFS hash (CID) for the edited video stored in Pinata account 5';
COMMENT ON COLUMN videos.edited_video_ipfs_url IS 'Pinata gateway URL for accessing the edited video';

