# Video Editor - Split-Screen Video Editor with Multi-Platform Posting

A production-ready application that automates video editing with split-screen effects and posts to YouTube Shorts and Facebook Reels. Includes user approval system, API key management, cloud storage, and automatic cleanup.

## Features

✅ **Web Interface** - Upload videos through the application
✅ **Split-Screen Editing** - 75% main video + 25% filler video automatically
✅ **Cloud-Based Filler Videos** - Upload/manage filler video library
✅ **User Approval System** - Admin controls who can use the application
✅ **YouTube Shorts** - Auto-post with multiple API key support
✅ **Facebook Reels** - Auto-post with auto-generated captions
✅ **Supabase Storage** - Secure cloud storage with automatic cleanup
✅ **PM2 Management** - Auto-restart and monitoring
✅ **API Key Encryption** - Protect YouTube and Facebook credentials
✅ **Auto-Cleanup** - Videos deleted after posting/rejection

---

## Prerequisites

- **Node.js** v14+
- **FFmpeg** installed and in PATH
- **PM2** installed globally (`npm install -g pm2`)
- **Supabase** account (free tier works)
- **YouTube API** credentials
- **Facebook** access token

---

## Complete Setup Guide

### Phase 1: Project Setup

1. **Clone/download project**
   ```bash
   cd C:\Projects\Video-Editor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create .env file**
   ```
   cp .env.example .env
   ```

4. **Edit .env with your credentials**
   ```env
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_KEY=eyJhbGc...
   ENCRYPTION_KEY=a3f8d9e2c1b5f7a9d4e8c3f1b9a5d7e2
   ```

   **Generate encryption key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```

### Phase 2: Supabase Setup

1. **Create project**
   - Go to https://supabase.com
   - Click "New Project"
   - Fill in details and create

2. **Get credentials**
   - Go to **Project Settings** → **API**
   - Copy **Project URL** and **Anon/Public Key**

3. **Create storage buckets**
   - Go to **Storage**
   - Create bucket `videos` (for processing)
   - Create bucket `filler_videos` (for 3filler content)
   - Make both **Public**

4. **Create database tables**
   - Go to **SQL Editor**
   - Run the SQL from "Database Schema" section below

### Phase 3: YouTube API Setup

1. **Create Google Cloud project**
   - Go to https://console.cloud.google.com
   - Create new project
   - Search "YouTube Data API v3" → Enable it
   - Go to **Credentials** → Create OAuth 2.0 credentials
   - Download credentials JSON

2. **Get API Key**
   - Save your API key (you'll add it via the application later)

### Phase 4: Facebook Setup

1. **Create Facebook App**
   - Go to https://developers.facebook.com
   - Create new app → Choose "Consumer"
   - Add "Facebook Login" product

2. **Get Access Token**
   - Get **Page Access Token** from Business Manager
   - You'll add it via the application later

### Phase 5: Add Filler Videos

- Upload via the application interface
- Or place MP4 files in `filler_videos/` folder manually

---

## Database Schema

Run this SQL in Supabase SQL Editor:

```sql
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP
);

-- Videos Table
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT REFERENCES users(telegram_id) ON DELETE CASCADE,
  original_video_url TEXT,
  original_video_path TEXT,
  edited_video_url TEXT,
  edited_video_path TEXT,
  status TEXT DEFAULT 'processing',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

-- API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT REFERENCES users(telegram_id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_status_created ON videos(status, created_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_platform ON api_keys(platform);
CREATE INDEX IF NOT EXISTS idx_users_approved ON users(is_approved);
```

---

## PM2 Setup & Management

### Start Bot with PM2

```bash
# Start bot with ecosystem config
pm2 start ecosystem.config.js

# Save PM2 process list (auto-restart on reboot)
pm2 save

# Setup auto-restart on system reboot
pm2 startup

# Monitor bot status
pm2 monit

# View logs
pm2 logs video-editor-bot

# Restart bot
pm2 restart video-editor-bot

# Stop bot
pm2 stop video-editor-bot

# Delete from PM2
pm2 delete video-editor-bot
```

### View Logs

```bash
# Real-time logs
pm2 logs video-editor-bot

# Last 100 lines
pm2 logs video-editor-bot --lines 100

# Error logs only
pm2 logs video-editor-bot --err

# Clear logs
pm2 flush
```

---

## How to Use

### Step 1: Start the Server

**With PM2** (Recommended for production):
```bash
pm2 start ecosystem.config.js
```

**Direct** (For testing):
```bash
npm start
```

### Step 2: Access the Application

1. Open your web browser
2. Navigate to `http://localhost:3000` (or configured port)
3. Log in or register for an account
4. If you're a new user: Submit approval request
5. Admin will review and approve/reject

### Step 3: Add API Keys

**Once approved:**
- Navigate to Settings or Account page
- Add YouTube API key (max 3 keys per user)
- Add Facebook access token (max 3 tokens per user)

**Admin users:** Can add unlimited API keys

### Step 4: Upload and Process Video

**For Regular Users** (1 at a time):
1. **Upload video**
   - Via the upload interface (MP4, MOV, AVI, or MKV)
   - 10 seconds to 5 minutes duration

2. **Application processes**
   - Adds filler video automatically
   - Creates split-screen preview
   - Sends notification in 2-10 minutes

3. **Approve or Reject**
   - ✅ Approve: Posts to YouTube & Facebook, deletes from storage
   - ❌ Reject: Deletes from storage
   - Then can upload next video

**For Admin** (Unlimited concurrent):
- Upload as many videos as you want
- All process simultaneously
- No waiting between videos

---

## API Key Encryption

### Why Encrypt?

Plain text API keys in database = security risk if breached.

### Setup Encryption

1. **Generate encryption key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```

2. **Add to .env:**
   ```env
   ENCRYPTION_KEY=a3f8d9e2c1b5f7a9d4e8c3f1b9a5d7e2
   ```

3. **Install crypto:**
   ```bash
   npm install crypto-js
   ```

4. **Create src/security/encryption.js:**
   ```javascript
   const crypto = require('crypto');
   const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

   function encryptApiKey(apiKey) {
     const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
     let encrypted = cipher.update(apiKey, 'utf8', 'hex');
     encrypted += cipher.final('hex');
     return encrypted;
   }

   function decryptApiKey(encryptedKey) {
     const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
     let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
     decrypted += decipher.final('utf8');
     return decrypted;
   }

   module.exports = { encryptApiKey, decryptApiKey };
   ```

5. **Update src/storage/supabase.js:**
   ```javascript
   const { encryptApiKey, decryptApiKey } = require('../security/encryption');

   // In addApiKey():
   const encryptedKey = encryptApiKey(apiKey);

   // In getUserApiKeys():
   return (data || []).map(key => ({
     ...key,
     api_key: decryptApiKey(key.api_key),
   }));
   ```

---

## Automatic Video Cleanup

### How It Works

1. **After Approval**
   - ✅ Posts to YouTube
   - ✅ Posts to Facebook
   - 🗑️ Deletes original video
   - 🗑️ Deletes edited video

2. **After Rejection**
   - 🗑️ Deletes original video
   - 🗑️ Deletes edited video

3. **Automatic Cleanup** (Every 30 minutes)
   - Finds videos stuck in "processing" > 1 hour old
   - Finds videos stuck in "pending_approval" > 1 hour old
   - Automatically deletes them

### Storage Savings

```
Before: 100 rejected videos = 10GB wasted
After:  100 rejected videos = 0GB wasted ✅
```

---

## Project Structure

```
Video-Editor/
├── src/
│   ├── controllers/
│   │   ├── auth-controller.js   # Authentication
│   │   ├── user-controller.js   # User management
│   │   └── video-controller.js  # Video operations
│   ├── routes/
│   │   ├── auth-routes.js
│   │   ├── user-routes.js
│   │   └── video-routes.js
│   ├── video/
│   │   ├── processor.js        # Split-screen editing
│   │   └── utils.js            # Video utilities
│   ├── storage/
│   │   ├── supabase.js         # Cloud storage
│   │   └── cleanup.js          # Automatic cleanup job
│   ├── platforms/
│   │   ├── youtube.js          # YouTube upload
│   │   └── facebook.js         # Facebook upload
│   ├── workflow/
│   │   └── manager.js          # Workflow orchestration
│   ├── auth/
│   │   ├── email-auth.js
│   │   ├── token-manager.js
│   │   └── password-utils.js
│   ├── middleware/
│   │   ├── jwt-middleware.js
│   │   ├── error-handler.js
│   │   └── rate-limit.js
│   └── config/
│       └── constants.js        # Configuration
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_add_video_paths.sql
├── filler_videos/              # Filler video library
├── temp/                       # Temporary files
├── uploads/                    # Upload storage
├── ecosystem.config.js         # PM2 configuration
├── .env                        # Credentials (in .gitignore)
├── .env.example                # Template
├── .gitignore
├── package.json
├── server.js                   # Main entry point
└── README.md                   # This file
```

---

## Troubleshooting

### Server Doesn't Start

```bash
# Check for errors
npm start

# Check logs
pm2 logs

# Common issues:
# 1. Missing environment variables in .env
# 2. Supabase not initialized
# 3. FFmpeg not installed/in PATH
# 4. Port already in use
```

### "No filler videos found"

```bash
# Upload filler videos via web interface
# Or check Supabase:
# Storage → filler_videos bucket should have videos
```

### Videos Not Deleting

```bash
# Check database migration ran:
# Supabase → Tables → videos
# Should have: original_video_path, edited_video_path

# Check cleanup job is running:
pm2 logs | grep "cleanup"
```

### API Keys Not Working

```bash
# Verify in database:
# Supabase → Tables → api_keys
# Keys should be encrypted (not readable as plain text)

# If decryption fails:
# Check ENCRYPTION_KEY in .env
# Re-add the API key via the application
```

### FFmpeg Error

```bash
# Verify FFmpeg installed:
ffmpeg -version

# If not found:
# Windows: Download from https://ffmpeg.org/download.html
# Add to PATH: C:\ffmpeg\bin
# Restart terminal/IDE
```

---

## Video Requirements

| Spec | Value |
|------|-------|
| Format | MP4, MOV, AVI, MKV |
| Duration | 10 seconds - 5 minutes |
| Resolution | 1080x1920 recommended |
| Frame Rate | 24-60 FPS |

---

## API Key & Upload Limits

| Restriction | Regular User | Admin |
|------------|-------------|-------|
| **Concurrent Videos** | 1 (must finish before next) | Unlimited |
| **YouTube API Keys** | 3 max | Unlimited |
| **Facebook API Keys** | 3 max | Unlimited |

### How It Works

**Regular Users:**
```
User uploads video 1
    ↓
App processes (2-10 min)
    ↓
User approves/rejects
    ↓
NOW can upload video 2
```

**Admin:**
```
Admin uploads video 1, 2, 3...
    ↓
All process simultaneously
    ↓
No waiting required
```

**API Keys:**
```
Regular User:    Add via Settings   (max 3 keys each)
                 YouTube: max 3
                 Facebook: max 3

Admin:           Add via Settings   (unlimited)
                 YouTube: unlimited
                 Facebook: unlimited
```

---

## Performance & Limits

| Aspect | Limit | Notes |
|--------|-------|-------|
| Concurrent Videos | 1 per user | Sequential processing |
| Video File Size | No hard limit | Limited by storage |
| Processing Time | 2-15 min | Depends on length |
| Filler Videos | Unlimited | Upload via application |
| Users | Unlimited | Admin approval required |

---

## Deployment

### For Production Use

1. **Use PM2** (auto-restart, monitoring)
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```

2. **Use strong encryption key**
   ```bash
   # 32+ character random key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Enable RLS in Supabase** (Row Level Security)
   - Prevent admin seeing user API keys
   - Secure database access

4. **Monitor logs**
   ```bash
   pm2 logs video-editor-bot
   ```

5. **Set resource limits**
   - In ecosystem.config.js: `max_memory_restart: '500M'`
   - Prevents memory leaks

### On VPS/Cloud

1. Install Node.js
2. Install FFmpeg
3. Install PM2 globally
4. Clone repo
5. Configure .env
6. Run migrations
7. Start with PM2
8. Setup PM2 auto-startup

---

## Support & Troubleshooting

### Common Issues

1. **Environment variables missing** → Check .env, ensure all required variables are set
2. **Supabase connection fails** → Check URL and key, verify project active
3. **FFmpeg not found** → Install and add to PATH
4. **Videos not deleting** → Run database migration, check cleanup logs
5. **Slow processing** → Close other apps, increase timeout in ecosystem.config.js

### Get Help

- Check logs: `pm2 logs`
- Verify .env: All credentials correct?
- Test Supabase: Can you connect from other tools?
- Test FFmpeg: Run `ffmpeg -version`

---

## Security Notes

- ✅ API keys encrypted in database (implement SECURITY_GUIDE.md)
- ✅ Videos auto-deleted after processing
- ✅ User approval controls access
- ✅ Admin-only endpoints protected with authentication
- ⚠️ Keep .env private (never commit to Git)
- ⚠️ Rotate API keys periodically
- ⚠️ Monitor API usage for unusual activity

---

## Architecture

```
User → Web App → API Server → Supabase Storage → Processing → YouTube + Facebook
                                  ↓
                            Video Database
                            User Profiles
                            API Keys (encrypted)

Cleanup Job (every 30 min):
- Finds stuck videos (> 1 hour)
- Auto-deletes from storage
- Prevents storage bloat
```

---

## File Size & Performance

- **Temp Storage Needed**: ~5x video size
- **Processing Speed**: ~10 seconds per MB
- **Filler Videos**: Keep 5-10, 30-90 seconds each
- **Recommended Specs**: 2GB RAM minimum, 10GB disk

---

## API Documentation

### Base URL
```
http://localhost:8080/api
```

All endpoints return JSON responses in the following format:
```json
{
  "success": true,
  "data": { ... },
  "message": "Success message"
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "status": 400
  }
}
```

---

### Authentication Endpoints

#### POST `/api/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "username": "johndoe"
}
```

**Required Fields:**
- `email` (string): Valid email address
- `password` (string): Minimum 8 characters, must contain uppercase, lowercase, number, and special character
- `username` (string): Display name for the user

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "username": "johndoe",
      "is_admin": false,
      "is_approved": true
    },
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token"
  },
  "message": "User registered successfully"
}
```

---

#### POST `/api/auth/login`
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Required Fields:**
- `email` (string): User email
- `password` (string): User password

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "username": "johndoe",
      "is_admin": false,
      "is_approved": true
    },
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token"
  },
  "message": "Login successful"
}
```

---

#### POST `/api/auth/logout`
Logout user (requires authentication).

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "success": true,
  "data": {},
  "message": "Logout successful"
}
```

---

#### POST `/api/auth/refresh-token`
Get new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

**Required Fields:**
- `refreshToken` (string): Valid refresh token

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "new-jwt-access-token",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "username": "johndoe",
      "is_admin": false,
      "is_approved": true
    }
  },
  "message": "Token refreshed successfully"
}
```

---

#### POST `/api/auth/change-password`
Change user password (requires authentication).

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Request Body:**
```json
{
  "oldPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}
```

**Required Fields:**
- `oldPassword` (string): Current password
- `newPassword` (string): New password (must meet password requirements)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully"
  },
  "message": "Password changed successfully"
}
```

---

### Google OAuth Endpoints

#### GET `/api/auth/google`
Get Google OAuth authorization URL.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
  },
  "message": "Redirect to this URL to login with Google"
}
```

---

#### POST `/api/auth/google/callback`
Complete Google OAuth login with ID token.

**Request Body:**
```json
{
  "idToken": "google-id-token"
}
```

**Required Fields:**
- `idToken` (string): Google ID token from OAuth flow

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@gmail.com",
      "username": "User Name",
      "is_admin": false,
      "is_approved": true
    },
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token"
  },
  "message": "Google login successful"
}
```

---

### User Endpoints (Requires Authentication)

All user endpoints require the `Authorization` header:
```
Authorization: Bearer <accessToken>
```

#### GET `/api/users/profile`
Get current user profile.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "is_admin": false,
    "is_approved": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "last_login": "2024-01-01T00:00:00.000Z"
  },
  "message": "Profile retrieved successfully"
}
```

---

#### PUT `/api/users/profile`
Update user profile.

**Request Body:**
```json
{
  "username": "newusername"
}
```

**Required Fields:**
- `username` (string): New username

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "username": "newusername",
    "is_admin": false,
    "is_approved": true
  },
  "message": "Profile updated successfully"
}
```

---

#### GET `/api/users/api-keys`
List user's API keys.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "key-uuid",
      "platform": "youtube",
      "api_key": "encrypted-key",
      "status": "active",
      "created_at": "2024-01-01T00:00:00.000Z",
      "last_used": "2024-01-01T00:00:00.000Z"
    }
  ],
  "message": "API keys retrieved successfully"
}
```

---

#### POST `/api/users/api-keys`
Add new API key.

**Request Body:**
```json
{
  "platform": "youtube",
  "apiKey": "your-api-key-here"
}
```

**Required Fields:**
- `platform` (string): Either `"youtube"` or `"facebook"`
- `apiKey` (string): API key for the platform

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "key-uuid",
    "platform": "youtube",
    "status": "active",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "message": "API key added successfully"
}
```

---

#### DELETE `/api/users/api-keys/:id`
Delete API key.

**URL Parameters:**
- `id` (string): API key ID

**Response (200):**
```json
{
  "success": true,
  "data": {},
  "message": "API key deleted successfully"
}
```

---

#### POST `/api/users/api-keys/:id/test`
Test API key validity.

**URL Parameters:**
- `id` (string): API key ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "message": "API key is valid"
  },
  "message": "API key test completed"
}
```

---

### Video Endpoints (Requires Authentication)

All video endpoints require the `Authorization` header:
```
Authorization: Bearer <accessToken>
```

#### POST `/api/videos/upload`
Upload and process video.

**Request Body:**
```json
{
  "originalVideoUrl": "https://storage.example.com/video.mp4",
  "originalVideoPath": "/path/to/video.mp4"
}
```

**Required Fields (one of):**
- `originalVideoUrl` (string): URL to video file
- `originalVideoPath` (string): Local path to video file

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "video-uuid",
    "user_id": "user-uuid",
    "status": "processing",
    "original_video_url": "https://storage.example.com/video.mp4",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "message": "Video uploaded and processing started"
}
```

---

#### GET `/api/videos`
List user's videos with filters.

**Query Parameters:**
- `status` (string, optional): Filter by status (`processing`, `completed`, `pending_approval`, `rejected`)
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 10)

**Example:**
```
GET /api/videos?status=completed&page=1&limit=10
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "video-uuid",
      "user_id": "user-uuid",
      "status": "completed",
      "original_video_url": "https://storage.example.com/video.mp4",
      "edited_video_url": "https://storage.example.com/edited-video.mp4",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  },
  "message": "Videos retrieved successfully"
}
```

---

#### GET `/api/videos/:id`
Get video details.

**URL Parameters:**
- `id` (string): Video ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "video-uuid",
    "user_id": "user-uuid",
    "status": "completed",
    "original_video_url": "https://storage.example.com/video.mp4",
    "edited_video_url": "https://storage.example.com/edited-video.mp4",
    "youtube_url": "https://youtube.com/watch?v=...",
    "facebook_url": "https://facebook.com/...",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "message": "Video retrieved successfully"
}
```

---

#### POST `/api/videos/:id/approve`
Approve and post video to YouTube/Facebook.

**URL Parameters:**
- `id` (string): Video ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "video-uuid",
    "status": "completed",
    "youtube_url": "https://youtube.com/watch?v=...",
    "facebook_url": "https://facebook.com/..."
  },
  "message": "Video approved and posted successfully"
}
```

---

#### POST `/api/videos/:id/reject`
Reject video.

**URL Parameters:**
- `id` (string): Video ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "video-uuid",
    "status": "rejected"
  },
  "message": "Video rejected successfully"
}
```

---

#### DELETE `/api/videos/:id`
Delete video.

**URL Parameters:**
- `id` (string): Video ID

**Response (200):**
```json
{
  "success": true,
  "data": {},
  "message": "Video deleted successfully"
}
```

---

#### GET `/api/videos/:id/download`
Get download URL for processed video.

**URL Parameters:**
- `id` (string): Video ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://storage.example.com/edited-video.mp4"
  },
  "message": "Download URL retrieved"
}
```

---

### Admin Endpoints (Requires Admin Authentication)

All admin endpoints require:
1. `Authorization` header with valid access token
2. User must have `is_admin: true`

```
Authorization: Bearer <accessToken>
```

#### GET `/api/admin/users`
List all users with filters.

**Query Parameters:**
- `status` (string, optional): Filter by approval status (`pending`, `approved`, `rejected`, `revoked`)
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 10)

**Example:**
```
GET /api/admin/users?status=pending&page=1&limit=10
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "user-uuid",
      "email": "user@example.com",
      "username": "johndoe",
      "is_admin": false,
      "is_approved": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "last_login": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  },
  "message": "Users retrieved successfully"
}
```

---

#### POST `/api/admin/users/:id/approve`
Approve user account.

**URL Parameters:**
- `id` (string): User ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "is_approved": true
  },
  "message": "User approved successfully"
}
```

---

#### POST `/api/admin/users/:id/reject`
Reject user account.

**URL Parameters:**
- `id` (string): User ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "is_approved": false
  },
  "message": "User rejected successfully"
}
```

---

#### POST `/api/admin/users/:id/revoke`
Revoke user access.

**URL Parameters:**
- `id` (string): User ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "is_approved": false
  },
  "message": "User access revoked successfully"
}
```

---

#### GET `/api/admin/stats`
Get platform statistics.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalUsers": 150,
    "totalVideos": 500,
    "storageUsed": "25.5 GB",
    "growthRate": "15%",
    "recentActivity": [
      {
        "action": "Video uploaded",
        "user": "johndoe",
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
    ]
  },
  "message": "Statistics retrieved successfully"
}
```

---

### Health Check

#### GET `/api/health`
Check API health status.

**Response (200):**
```json
{
  "success": true,
  "message": "API is healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

---

## Future Enhancements

- [ ] Custom titles/captions per video
- [ ] Multiple filler video sets
- [ ] Video scheduling
- [ ] Web dashboard
- [ ] Instagram integration
- [ ] Watermark support
- [ ] Video effects library

---

**Version**: 1.0.0
**Last Updated**: 2024
**License**: ISC

For questions or issues, check logs with: `pm2 logs video-editor-bot`
