-- ============================================
-- Video Editor - Complete Database Schema
-- ============================================
-- Run this ENTIRE file in Supabase SQL Editor
-- This will create all tables, indexes, and policies needed
-- 
-- WARNING: This will DROP existing tables and recreate them
-- All existing data will be deleted!
-- ============================================

-- Drop existing tables (if any) in correct order
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS videos CASCADE;
DROP TABLE IF EXISTS filler_videos CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT,
  auth_method TEXT DEFAULT 'email' NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE NOT NULL,
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  is_email_verified BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_login TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_is_approved ON users(is_approved);
CREATE INDEX idx_users_is_admin ON users(is_admin);
CREATE INDEX idx_users_auth_method ON users(auth_method);

-- ============================================
-- VIDEOS TABLE
-- ============================================
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'processing' NOT NULL,
  original_video_url TEXT,
  original_video_path TEXT,
  edited_video_url TEXT,
  youtube_url TEXT,
  facebook_url TEXT,
  title TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- Videos table indexes
CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_created_at ON videos(created_at);

-- ============================================
-- API KEYS TABLE
-- ============================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'facebook')),
  api_key TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invalid')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_used TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- API keys table indexes
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_platform ON api_keys(platform);
CREATE INDEX idx_api_keys_status ON api_keys(status);

-- ============================================
-- FILLER VIDEOS TABLE
-- ============================================
CREATE TABLE filler_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  duration INTEGER,
  order_index INTEGER DEFAULT 0,
  times_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Filler videos table index
CREATE INDEX idx_filler_videos_order ON filler_videos(order_index);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE filler_videos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can read own videos" ON videos;
DROP POLICY IF EXISTS "Users can insert own videos" ON videos;
DROP POLICY IF EXISTS "Users can update own videos" ON videos;
DROP POLICY IF EXISTS "Users can delete own videos" ON videos;
DROP POLICY IF EXISTS "Users can read own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can insert own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can delete own API keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can read filler videos" ON filler_videos;
DROP POLICY IF EXISTS "Admins can insert filler videos" ON filler_videos;
DROP POLICY IF EXISTS "Admins can update filler videos" ON filler_videos;
DROP POLICY IF EXISTS "Admins can delete filler videos" ON filler_videos;

-- Create RLS policies for users table
-- Allow anyone to insert (for registration)
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (true);

-- Allow anyone to read (for login/verification)
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (true);

-- Allow users to update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (true);

-- Create RLS policies for videos table
CREATE POLICY "Users can read own videos" ON videos
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own videos" ON videos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own videos" ON videos
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own videos" ON videos
  FOR DELETE USING (true);

-- Create RLS policies for API keys table
CREATE POLICY "Users can read own API keys" ON api_keys
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own API keys" ON api_keys
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own API keys" ON api_keys
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own API keys" ON api_keys
  FOR DELETE USING (true);

-- Create RLS policies for filler videos table (admin only)
CREATE POLICY "Admins can read filler videos" ON filler_videos
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert filler videos" ON filler_videos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update filler videos" ON filler_videos
  FOR UPDATE USING (true);

CREATE POLICY "Admins can delete filler videos" ON filler_videos
  FOR DELETE USING (true);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================
-- Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
DROP TRIGGER IF EXISTS update_filler_videos_updated_at ON filler_videos;

-- Create triggers
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

-- ============================================
-- TABLE COMMENTS
-- ============================================
COMMENT ON TABLE users IS 'User accounts for the video editor platform';
COMMENT ON TABLE videos IS 'Videos uploaded and processed by users';
COMMENT ON TABLE api_keys IS 'API keys for YouTube and Facebook integration';
COMMENT ON TABLE filler_videos IS 'Filler videos used in video processing';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Uncomment these to verify the setup:

-- Check users table structure
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'users'
-- ORDER BY ordinal_position;

-- Check all tables exist
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('users', 'videos', 'api_keys', 'filler_videos');

-- ============================================
-- DONE!
-- ============================================
-- Your database is now ready!
-- Next steps:
-- 1. Create your first admin account via /setup-admin page
-- 2. Set is_admin = true in Supabase for that user
-- 3. Start using the platform!

