# Database Migrations

## Quick Setup - Use This File!

**👉 Run `complete_schema.sql` in Supabase SQL Editor**

This single file contains everything you need:
- ✅ All tables (users, videos, api_keys, filler_videos)
- ✅ All required columns (email, auth_method, password_hash, etc.)
- ✅ All indexes for performance
- ✅ Row Level Security (RLS) policies
- ✅ Triggers for updated_at timestamps

## How to Run

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy the **ENTIRE** contents of `complete_schema.sql`
4. Paste into the SQL Editor
5. Click **Run** (or press Ctrl+Enter)
6. Wait for success message

## What It Does

- **Drops** existing tables (if any) - **WARNING: Deletes all data!**
- **Creates** all tables with correct structure
- **Adds** all indexes
- **Sets up** security policies
- **Creates** triggers

## Verify Setup

After running, check in **Table Editor**:
- ✅ `users` table exists
- ✅ `videos` table exists  
- ✅ `api_keys` table exists
- ✅ `filler_videos` table exists

Or run this query:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'videos', 'api_keys', 'filler_videos');
```

## Users Table Columns

After running, the `users` table will have:
- `id` (UUID, primary key)
- `telegram_id` (TEXT, unique)
- `email` (TEXT, unique, required) ✅
- `username` (TEXT, required) ✅
- `password_hash` (TEXT) ✅
- `auth_method` (TEXT, default 'email') ✅
- `is_admin` (BOOLEAN, default false) ✅
- `is_approved` (BOOLEAN, default false) ✅
- `is_email_verified` (BOOLEAN, default false) ✅
- `created_at` (TIMESTAMPTZ) ✅
- `last_login` (TIMESTAMPTZ, nullable) ✅
- `updated_at` (TIMESTAMPTZ) ✅

## Next Steps

After running the migration:
1. Create your first admin: Go to `http://localhost:3001/setup-admin`
2. Set `is_admin = true` in Supabase for that user
3. Test registration and login
4. Delete the setup-admin page for security

## Troubleshooting

### "relation already exists"
- The migration drops tables first, so this shouldn't happen
- If it does, manually drop: `DROP TABLE IF EXISTS users CASCADE;`

### "column does not exist"
- Make sure you ran the **ENTIRE** `complete_schema.sql` file
- Check that all columns exist in Table Editor
- Re-run the migration if needed

### "permission denied"
- Check your Supabase project permissions
- Ensure you're using the correct database user
