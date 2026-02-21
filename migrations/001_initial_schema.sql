-- Video Editor Database Schema
-- 
-- NOTE: Use complete_schema.sql instead - it's a single file with everything!
-- This file is kept for reference but complete_schema.sql is recommended.

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT UNIQUE,
  email TEXT UNIQUE,
  username TEXT,
  password_hash TEXT,
  auth_method TEXT DEFAULT 'email',
  is_admin BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  is_email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
CREATE INDEX IF NOT EXISTS idx_users_auth_method ON users(auth_method);

-- Create videos table
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'processing',
  original_video_url TEXT,
  original_video_path TEXT,
  edited_video_url TEXT,
  youtube_url TEXT,
  facebook_url TEXT,
  title TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- Create indexes for videos
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at);

-- Create API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'facebook')),
  api_key TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invalid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- Create indexes for API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_platform ON api_keys(platform);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- Create filler videos table (for admin)
CREATE TABLE IF NOT EXISTS filler_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  duration INTEGER,
  order_index INTEGER DEFAULT 0,
  times_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for filler videos
CREATE INDEX IF NOT EXISTS idx_filler_videos_order ON filler_videos(order_index);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE filler_videos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Note: These are basic policies. Adjust based on your security needs.

-- Users can read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (true); -- Simplified for now, adjust based on auth

-- Users can read their own videos
CREATE POLICY "Users can read own videos" ON videos
  FOR SELECT USING (true); -- Simplified for now

-- Users can read their own API keys
CREATE POLICY "Users can read own API keys" ON api_keys
  FOR SELECT USING (true); -- Simplified for now

-- Only admins can read filler videos
CREATE POLICY "Admins can read filler videos" ON filler_videos
  FOR SELECT USING (true); -- Simplified for now

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_filler_videos_updated_at
  BEFORE UPDATE ON filler_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions (adjust based on your setup)
-- These are typically handled by Supabase automatically, but included for reference

COMMENT ON TABLE users IS 'User accounts for the video editor platform';
COMMENT ON TABLE videos IS 'Videos uploaded and processed by users';
COMMENT ON TABLE api_keys IS 'API keys for YouTube and Facebook integration';
COMMENT ON TABLE filler_videos IS 'Filler videos used in video processing';

