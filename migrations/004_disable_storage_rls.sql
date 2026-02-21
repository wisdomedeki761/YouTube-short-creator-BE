-- DISABLE RLS ON STORAGE (Quick Fix for Development)
-- Run this in Supabase SQL Editor
-- 
-- This disables RLS on storage.objects table, allowing uploads to work
-- WARNING: Only use for development! Re-enable RLS for production.

-- Disable RLS on storage.objects
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Verify it's disabled (optional check)
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'storage' AND tablename = 'objects';
-- Should show: rowsecurity = false

-- ============================================
-- TO RE-ENABLE LATER (for production):
-- ============================================
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Then run 003_storage_policies.sql to add proper policies
