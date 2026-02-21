-- Storage Bucket RLS Policies
-- Run this in Supabase SQL Editor to allow video uploads
-- 
-- IMPORTANT: Make sure your buckets exist first:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Create buckets: 'videos' and 'filler_videos' (or 'filler-videos')
-- 3. Then run this SQL

-- ============================================
-- DROP EXISTING POLICIES (if any)
-- ============================================
DROP POLICY IF EXISTS "Users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read filler videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload filler videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete filler videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read filler videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage filler videos" ON storage.objects;

-- ============================================
-- VIDEOS BUCKET POLICIES
-- ============================================
-- Allow all authenticated users to upload/read/update/delete in videos bucket
-- This is for development - you can restrict later based on user_id in path

CREATE POLICY "Authenticated users can manage videos" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'videos' AND
    auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'videos' AND
    auth.role() = 'authenticated'
  );

-- ============================================
-- FILLER VIDEOS BUCKET POLICIES  
-- ============================================
-- Allow all authenticated users to read filler videos
CREATE POLICY "Authenticated users can read filler videos" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'filler_videos' AND
    auth.role() = 'authenticated'
  );

-- Allow all authenticated users to manage filler videos (for admin uploads)
CREATE POLICY "Authenticated users can manage filler videos" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'filler_videos' AND
    auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'filler_videos' AND
    auth.role() = 'authenticated'
  );

-- ============================================
-- ALTERNATIVE: DISABLE RLS ON STORAGE (Development Only)
-- ============================================
-- If the above policies don't work, you can disable RLS on storage objects
-- WARNING: This is less secure - only use for development!
-- 
-- ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
--
-- To re-enable later:
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
