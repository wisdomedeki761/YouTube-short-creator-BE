 ALTER TABLE videos ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS edited_video_ipfs_hash TEXT;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS edited_video_ipfs_url TEXT;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_videos_edited_ipfs_hash ON videos(edited_video_ipfs_hash);
  ALTER TABLE filler_videos ADD COLUMN IF NOT EXISTS ipfs_hash TEXT;
  ALTER TABLE filler_videos ADD COLUMN IF NOT EXISTS ipfs_url TEXT;
  ALTER TABLE filler_videos ADD COLUMN IF NOT EXISTS pinata_account INTEGER;
  CREATE INDEX IF NOT EXISTS idx_filler_videos_pinata_account ON
  filler_videos(pinata_account);
  CREATE INDEX IF NOT EXISTS idx_filler_videos_ipfs_hash ON filler_videos(ipfs_hash);