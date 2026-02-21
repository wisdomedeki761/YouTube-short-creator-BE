-- QUICK FIX: Disable RLS on Storage (Development Only)
-- Run this ENTIRE file in Supabase SQL Editor
-- This will allow video uploads to work immediately

-- Disable RLS on storage.objects table
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Verify it worked (optional - you can run this to check)
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'storage' AND tablename = 'objects';
-- Should return: rowsecurity = false

-- ============================================
-- DONE! 
-- ============================================
-- Now try uploading a video - it should work!
-- 
-- For production, you'll want to:
-- 1. Re-enable RLS: ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- 2. Add proper policies from 003_storage_policies.sql
-- 3. Use SUPABASE_SERVICE_KEY in backend .env

