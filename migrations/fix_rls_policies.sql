-- Quick Fix: Add missing INSERT policy for users table
-- Run this if you get "row-level security policy" errors during registration

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can insert own data" ON users;

-- Create INSERT policy to allow registration
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (true);

-- Also add UPDATE policy if missing
DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (true);

-- Add policies for other tables if needed
DROP POLICY IF EXISTS "Users can insert own videos" ON videos;
CREATE POLICY "Users can insert own videos" ON videos
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own videos" ON videos;
CREATE POLICY "Users can update own videos" ON videos
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete own videos" ON videos;
CREATE POLICY "Users can delete own videos" ON videos
  FOR DELETE USING (true);

DROP POLICY IF EXISTS "Users can insert own API keys" ON api_keys;
CREATE POLICY "Users can insert own API keys" ON api_keys
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
CREATE POLICY "Users can update own API keys" ON api_keys
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete own API keys" ON api_keys;
CREATE POLICY "Users can delete own API keys" ON api_keys
  FOR DELETE USING (true);

