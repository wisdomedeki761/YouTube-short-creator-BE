-- Migration: Add OAuth fields to api_keys table for Google OAuth support
-- Run this in Supabase SQL Editor

-- Add OAuth-related columns to api_keys table
ALTER TABLE api_keys 
ADD COLUMN IF NOT EXISTS client_id TEXT,
ADD COLUMN IF NOT EXISTS client_secret TEXT,
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS token_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'api_key'; -- 'api_key' or 'oauth2'

-- Add index for OAuth lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_auth_type ON api_keys(auth_type);

-- Add comment to explain the new fields
COMMENT ON COLUMN api_keys.client_id IS 'OAuth 2.0 Client ID (for Google OAuth)';
COMMENT ON COLUMN api_keys.client_secret IS 'OAuth 2.0 Client Secret (for Google OAuth)';
COMMENT ON COLUMN api_keys.access_token IS 'OAuth 2.0 Access Token';
COMMENT ON COLUMN api_keys.refresh_token IS 'OAuth 2.0 Refresh Token (for getting new access tokens)';
COMMENT ON COLUMN api_keys.token_expiry IS 'When the access token expires';
COMMENT ON COLUMN api_keys.auth_type IS 'Authentication type: api_key or oauth2';

