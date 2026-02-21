-- Migration: Admin Multi-Account Support with User Approval Enforcement
-- Adds support for account tagging, channel information, and multi-account posting

-- ============================================
-- 1. Update api_keys table with account metadata
-- ============================================
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS account_tag TEXT,
ADD COLUMN IF NOT EXISTS channel_id TEXT,
ADD COLUMN IF NOT EXISTS channel_title TEXT,
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Create index for efficient account lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_user_platform_tag
ON api_keys(user_id, platform, account_tag);

-- Add comments for documentation
COMMENT ON COLUMN api_keys.account_tag IS 'Custom name/tag for the account (e.g., Main Channel, Backup Account)';
COMMENT ON COLUMN api_keys.channel_id IS 'YouTube channel ID or Facebook page ID';
COMMENT ON COLUMN api_keys.channel_title IS 'YouTube channel name or Facebook page name';
COMMENT ON COLUMN api_keys.is_default IS 'Whether this is the default account for the platform';

-- ============================================
-- 2. Update videos table for multi-URL storage
-- ============================================
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS youtube_urls JSONB,
ADD COLUMN IF NOT EXISTS facebook_urls JSONB;

COMMENT ON COLUMN videos.youtube_urls IS 'Array of all YouTube upload results with account info: [{url, accountTag, channelTitle, postedAt}, ...]';
COMMENT ON COLUMN videos.facebook_urls IS 'Array of all Facebook upload results with account info: [{url, accountTag, pageTitle, postedAt}, ...]';

-- ============================================
-- 3. Update users table to require approval by default
-- ============================================
-- Change default for new user registrations
ALTER TABLE users
ALTER COLUMN is_approved SET DEFAULT false;

-- Create index for efficient approval status lookups
CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved);

-- ============================================
-- 4. Set existing users as approved (backward compatibility)
-- ============================================
-- All existing users should remain approved to not break their access
UPDATE users SET is_approved = true WHERE is_approved IS NULL OR is_approved = false;

-- ============================================
-- Migration complete
-- ============================================
