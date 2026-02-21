-- Migration 001: Add authentication fields to users table
-- This migration adds email/password authentication support

-- Add email column (unique)
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;

-- Add password hash column
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Add authentication method column
ALTER TABLE users ADD COLUMN auth_method TEXT DEFAULT 'email';

-- Add google_id for Google OAuth
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;

-- Add last login timestamp
ALTER TABLE users ADD COLUMN last_login TIMESTAMP;

-- Add email verification status
ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN DEFAULT true;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create index on google_id
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Create index on auth_method
CREATE INDEX IF NOT EXISTS idx_users_auth_method ON users(auth_method);

-- Log completion
-- Migration 001 complete: Added auth fields to users table
