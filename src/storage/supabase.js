const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_CONFIG, VIDEO_STATUS, USER_STATUS } = require('../config/constants');
const path = require('path');
const fs = require('fs-extra');

let supabase;
let supabaseService; // Service role client for admin operations

/**
 * Initialize Supabase client
 */
async function initSupabase() {
  if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in .env');
  }

  // Regular client (anon key) for user operations
  supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);
  
  // Service role client (bypasses RLS) for admin/storage operations
  // Check for both SUPABASE_SERVICE_KEY and SUPABASE_SERVICE_ROLE
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || 
                    process.env.SUPABASE_SERVICE_ROLE || 
                    SUPABASE_CONFIG.SERVICE_KEY;
  
  if (serviceKey && serviceKey !== SUPABASE_CONFIG.KEY) {
    supabaseService = createClient(SUPABASE_CONFIG.URL, serviceKey);
    console.log('✅ Supabase initialized (with service role key - RLS bypassed)');
  } else {
    supabaseService = supabase; // Fallback to regular client
    console.log('⚠️  WARNING: SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE not set in .env');
    console.log('⚠️  Using regular key - storage uploads may fail with RLS errors');
    console.log('⚠️  Solution: Add SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE to Backend/.env');
  }
}

/**
 * Get Supabase client (regular - respects RLS)
 */
function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase not initialized. Call initSupabase() first.');
  }
  return supabase;
}

/**
 * Get Supabase service client (bypasses RLS - for admin operations)
 */
function getSupabaseServiceClient() {
  if (!supabaseService) {
    throw new Error('Supabase not initialized. Call initSupabase() first.');
  }
  return supabaseService;
}

/**
 * Create or get user
 */
async function createOrGetUser(telegramId, username) {
  const client = getSupabaseClient();

  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await client
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (existingUser) {
      return existingUser;
    }

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    // Create new user
    const { data: newUser, error: insertError } = await client
      .from('users')
      .insert([{
        telegram_id: telegramId,
        username: username,
        is_approved: false,
        is_admin: false,
      }])
      .select()
      .single();

    if (insertError) throw insertError;
    return newUser;
  } catch (error) {
    console.error('Error creating/getting user:', error);
    throw error;
  }
}

/**
 * Check if user is approved
 */
async function isUserApproved(telegramId) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('users')
      .select('is_approved')
      .eq('telegram_id', telegramId)
      .single();

    if (error) throw error;
    return data?.is_approved || false;
  } catch (error) {
    console.error('Error checking user approval:', error);
    return false;
  }
}

/**
 * Check if user is admin
 */
async function isUserAdmin(telegramId) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('users')
      .select('is_admin')
      .eq('telegram_id', telegramId)
      .single();

    if (error) throw error;
    return data?.is_admin || false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Approve user
 */
async function approveUser(telegramId) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('users')
      .update({
        is_approved: true,
        approved_at: new Date().toISOString(),
      })
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error approving user:', error);
    throw error;
  }
}

/**
 * Revoke user access
 */
async function revokeUser(telegramId) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('users')
      .update({
        is_approved: false,
      })
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error revoking user:', error);
    throw error;
  }
}

/**
 * Get all unapproved users
 */
async function getUnapprovedUsers() {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting unapproved users:', error);
    return [];
  }
}

/**
 * Get all approved users
 */
async function getAllApprovedUsers() {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('is_approved', true);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting approved users:', error);
    return [];
  }
}

/**
 * Save video metadata
 */
async function saveVideoMetadata(videoData) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('videos')
      .insert([{
        user_id: videoData.userId,
        original_video_url: videoData.originalVideoUrl,
        original_video_path: videoData.originalVideoPath || null,
        edited_video_url: videoData.editedVideoUrl || null,
        edited_video_path: videoData.editedVideoPath || null,
        status: videoData.status || VIDEO_STATUS.PROCESSING,
        created_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving video metadata:', error);
    throw error;
  }
}

/**
 * Update video status
 */
async function updateVideoStatus(videoId, status, editedVideoUrl = null, editedVideoPath = null) {
  const client = getSupabaseClient();

  try {
    const updateData = {
      status: status,
      processed_at: new Date().toISOString(),
    };

    if (editedVideoUrl) {
      updateData.edited_video_url = editedVideoUrl;
    }

    if (editedVideoPath) {
      updateData.edited_video_path = editedVideoPath;
    }

    const { data, error } = await client
      .from('videos')
      .update(updateData)
      .eq('id', videoId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating video status:', error);
    throw error;
  }
}

/**
 * Upload video to Supabase storage
 */
async function uploadVideo(filePath, userId, videoType = 'original') {
  // Use service client to bypass RLS for storage operations
  const client = getSupabaseServiceClient();
  
  // Verify we're using service client (not regular client)
  const isServiceClient = client !== supabase;
  console.log(`🔑 Using service client: ${isServiceClient ? 'YES ✅' : 'NO ⚠️ (RLS may block uploads)'}`);

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileName = `${userId}/${videoType}_${Date.now()}_${path.basename(filePath)}`;
    const fileBuffer = fs.readFileSync(filePath);

    console.log(`📤 Uploading to bucket: ${SUPABASE_CONFIG.BUCKET_NAME}`);
    console.log(`📁 File path: ${fileName}`);
    console.log(`📦 File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    const { data, error } = await client.storage
      .from(SUPABASE_CONFIG.BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('❌ Storage upload error:', error);
      console.error('Error code:', error.statusCode);
      console.error('Error message:', error.message);
      console.error('Using service client:', isServiceClient);
      if (!isServiceClient) {
        console.error('⚠️  CRITICAL: Not using service client! Check SUPABASE_SERVICE_ROLE in .env');
      }
      throw error;
    }
    
    console.log('✅ Video uploaded successfully to storage:', data.path);

    const { data: publicUrlData } = client.storage
      .from(SUPABASE_CONFIG.BUCKET_NAME)
      .getPublicUrl(fileName);

    return {
      path: data.path,
      fullPath: data.fullPath,
      publicUrl: publicUrlData.publicUrl,
    };
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
}

/**
 * Download video from Supabase storage
 */
async function downloadVideo(filePath, outputPath) {
  // Use service client for storage operations
  const client = getSupabaseServiceClient();

  try {
    const { data, error } = await client.storage
      .from(SUPABASE_CONFIG.BUCKET_NAME)
      .download(filePath);

    if (error) throw error;

    // Convert blob to buffer and write to file
    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
  } catch (error) {
    console.error('Error downloading video:', error);
    throw error;
  }
}

/**
 * Delete video from storage
 */
async function deleteVideo(filePath) {
  const client = getSupabaseClient();

  try {
    const { error } = await client.storage
      .from(SUPABASE_CONFIG.BUCKET_NAME)
      .remove([filePath]);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting video:', error);
    throw error;
  }
}

/**
 * Add API key
 */
async function addApiKey(userId, platform, apiKey) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('api_keys')
      .insert([{
        user_id: userId,
        platform: platform.toLowerCase(),
        api_key: apiKey,
        status: 'active',
        usage_count: 0,
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding API key:', error);
    throw error;
  }
}

/**
 * Get user API keys for a platform
 */
async function getUserApiKeys(userId, platform) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform.toLowerCase())
      .eq('status', 'active');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting API keys:', error);
    return [];
  }
}

/**
 * Delete API key
 */
async function deleteApiKey(keyId) {
  const client = getSupabaseClient();

  try {
    const { error } = await client
      .from('api_keys')
      .delete()
      .eq('id', keyId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting API key:', error);
    throw error;
  }
}

/**
 * Get API key by ID
 */
async function getApiKeyById(keyId) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('api_keys')
      .select('*')
      .eq('id', keyId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
}

/**
 * Upload filler video to Supabase
 */
async function uploadFillerVideo(filePath, videoName) {
  // Use service client for storage operations
  const client = getSupabaseServiceClient();
  const bucketName = SUPABASE_CONFIG.FILLER_BUCKET_NAME;

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileName = `filler_${Date.now()}_${videoName}`;
    const fileBuffer = fs.readFileSync(filePath);

    const { data, error } = await client.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data: publicUrlData } = client.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return {
      path: data.path,
      fullPath: data.fullPath,
      publicUrl: publicUrlData.publicUrl,
      name: videoName,
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error uploading filler video:', error);
    throw error;
  }
}

/**
 * Get all filler videos from Supabase
 */
async function getFillerVideos() {
  // Use service client for storage operations
  const client = getSupabaseServiceClient();
  const bucketName = SUPABASE_CONFIG.FILLER_BUCKET_NAME;

  try {
    const { data, error } = await client.storage
      .from(bucketName)
      .list();

    if (error) throw error;

    return (data || []).filter(file => file.name.match(/\.(mp4|mov|avi|mkv)$/i));
  } catch (error) {
    console.error('Error getting filler videos:', error);
    return [];
  }
}

/**
 * Download filler video from Supabase
 */
async function downloadFillerVideo(filePath, outputPath) {
  const client = getSupabaseClient();
  const bucketName = SUPABASE_CONFIG.FILLER_BUCKET_NAME;

  try {
    const { data, error } = await client.storage
      .from(bucketName)
      .download(filePath);

    if (error) throw error;

    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
  } catch (error) {
    console.error('Error downloading filler video:', error);
    throw error;
  }
}

/**
 * Delete filler video from Supabase
 */
async function deleteFillerVideo(filePath) {
  const client = getSupabaseClient();
  const bucketName = SUPABASE_CONFIG.FILLER_BUCKET_NAME;

  try {
    const { error } = await client.storage
      .from(bucketName)
      .remove([filePath]);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting filler video:', error);
    throw error;
  }
}

/**
 * Add OAuth credentials for a user
 */
async function addOAuthCredentials(userId, platform, clientId, clientSecret, accessToken = null, refreshToken = null, tokenExpiry = null) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('api_keys')
      .insert([{
        user_id: userId,
        platform: platform.toLowerCase(),
        auth_type: 'oauth2',
        client_id: clientId,
        client_secret: clientSecret,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expiry: tokenExpiry,
        status: 'active',
        usage_count: 0,
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding OAuth credentials:', error);
    throw error;
  }
}

/**
 * Update OAuth tokens (after refresh or initial authorization)
 */
async function updateOAuthTokens(keyId, accessToken, refreshToken = null, tokenExpiry = null) {
  const client = getSupabaseClient();

  try {
    const updateData = {
      access_token: accessToken,
      token_expiry: tokenExpiry,
    };

    if (refreshToken) {
      updateData.refresh_token = refreshToken;
    }

    const { data, error } = await client
      .from('api_keys')
      .update(updateData)
      .eq('id', keyId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating OAuth tokens:', error);
    throw error;
  }
}

/**
 * Refresh OAuth token using refresh token
 */
async function refreshOAuthToken(keyId) {
  const client = getSupabaseClient();
  const { google } = require('googleapis');

  try {
    // Get the OAuth credentials
    const { data: keyData, error: fetchError } = await client
      .from('api_keys')
      .select('*')
      .eq('id', keyId)
      .single();

    if (fetchError || !keyData) {
      throw new Error('OAuth credentials not found');
    }

    if (!keyData.refresh_token) {
      throw new Error('Refresh token not available');
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      keyData.client_id,
      keyData.client_secret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
      refresh_token: keyData.refresh_token,
    });

    // Refresh the token
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Calculate expiry time (tokens typically expire in 1 hour)
    const expiryDate = credentials.expiry_date 
      ? new Date(credentials.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // Default to 1 hour

    // Update in database
    await updateOAuthTokens(
      keyId,
      credentials.access_token,
      credentials.refresh_token || keyData.refresh_token, // Keep existing if not provided
      expiryDate.toISOString()
    );

    return true;
  } catch (error) {
    console.error('Error refreshing OAuth token:', error);
    return false;
  }
}

module.exports = {
  initSupabase,
  getSupabaseClient,
  getSupabaseServiceClient,
  createOrGetUser,
  isUserApproved,
  isUserAdmin,
  approveUser,
  revokeUser,
  getUnapprovedUsers,
  getAllApprovedUsers,
  saveVideoMetadata,
  updateVideoStatus,
  uploadVideo,
  downloadVideo,
  deleteVideo,
  addApiKey,
  getUserApiKeys,
  deleteApiKey,
  getApiKeyById,
  uploadFillerVideo,
  getFillerVideos,
  downloadFillerVideo,
  deleteFillerVideo,
  addOAuthCredentials,
  updateOAuthTokens,
  refreshOAuthToken,
};
