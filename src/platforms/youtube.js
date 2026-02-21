const { google } = require('googleapis');
const fs = require('fs-extra');
const { PLATFORM_CONFIG } = require('../config/constants');
const { getSupabaseClient, refreshOAuthToken } = require('../storage/supabase');

/**
 * Initialize YouTube client with API key or OAuth
 */
async function initYouTubeClient(apiKeyData) {
  if (!apiKeyData) {
    throw new Error('YouTube credentials are required');
  }

  // Check if this is OAuth2 or API key
  if (apiKeyData.auth_type === 'oauth2') {
    // Use OAuth2 authentication
    const oauth2Client = new google.auth.OAuth2(
      apiKeyData.client_id,
      apiKeyData.client_secret,
      'urn:ietf:wg:oauth:2.0:oob' // Out-of-band redirect
    );

    // Check if access token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiryTime = apiKeyData.token_expiry ? new Date(apiKeyData.token_expiry) : null;
    
    if (!apiKeyData.access_token || (expiryTime && expiryTime <= now)) {
      // Token expired or missing, refresh it
      if (!apiKeyData.refresh_token) {
        throw new Error('OAuth refresh token is missing. Please re-authorize.');
      }

      console.log('🔄 Refreshing OAuth token...');
      const refreshed = await refreshOAuthToken(apiKeyData.id);
      
      if (!refreshed) {
        throw new Error('Failed to refresh OAuth token. Please re-authorize.');
      }

      // Get updated token data
      const client = getSupabaseClient();
      const { data: updatedKey } = await client
        .from('api_keys')
        .select('*')
        .eq('id', apiKeyData.id)
        .single();

      oauth2Client.setCredentials({
        access_token: updatedKey.access_token,
        refresh_token: updatedKey.refresh_token,
      });
    } else {
      // Use existing token
      oauth2Client.setCredentials({
        access_token: apiKeyData.access_token,
        refresh_token: apiKeyData.refresh_token,
      });
    }

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client,
    });

    return youtube;
  } else {
    // Use API key authentication (legacy)
    if (!apiKeyData.api_key) {
      throw new Error('YouTube API key is required');
    }

    const youtube = google.youtube({
      version: 'v3',
      auth: apiKeyData.api_key,
    });

    return youtube;
  }
}

/**
 * Get available YouTube API key for user (round-robin or least used)
 */
async function getAvailableApiKey(userId, apiKeys) {
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error('No YouTube API keys available');
  }

  // Get the key with least usage
  const sortedKeys = [...apiKeys].sort((a, b) => {
    return (a.usage_count || 0) - (b.usage_count || 0);
  });

  return sortedKeys[0];
}

/**
 * Upload video to YouTube Shorts
 */
async function uploadShort(videoPath, title, description, apiKeyData) {
  try {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const youtube = await initYouTubeClient(apiKeyData);

    console.log('📤 Uploading to YouTube Shorts...');

    const fileSize = fs.statSync(videoPath).size;

    // Create the video metadata
    const videoMetadata = {
      snippet: {
        title: title || 'Split-Screen Short',
        description: description || 'Amazing split-screen short video',
        tags: ['Shorts', 'Split-Screen', 'Gaming', 'Viral', 'TikTok'],
        categoryId: PLATFORM_CONFIG.YOUTUBE.CATEGORY_ID.toString(),
      },
      status: {
        privacyStatus: PLATFORM_CONFIG.YOUTUBE.PRIVACY_STATUS,
      },
    };

    const response = await youtube.videos.insert(
      {
        part: 'snippet,status',
        requestBody: videoMetadata,
        media: {
          body: fs.createReadStream(videoPath),
        },
      },
      {
        onUploadProgress: (evt) => {
          const progress = (evt.bytesProcessed / fileSize) * 100;
          process.stdout.write(`\r⏳ Upload Progress: ${Math.round(progress)}%`);
        },
      }
    );

    console.log('\n✅ Video uploaded to YouTube!');

    const videoId = response.data.id;
    const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

    // Update API key usage count
    await updateApiKeyUsage(apiKeyData.id);

    return {
      videoId: videoId,
      url: videoUrl,
      title: response.data.snippet.title,
    };
  } catch (error) {
    console.error('❌ Error uploading to YouTube:', error.message);

    // Check for quota exceeded error
    if (error.message.includes('quotaExceeded')) {
      throw new Error('YouTube API quota exceeded. Try another API key.');
    }

    throw error;
  }
}

/**
 * Update API key usage count
 */
async function updateApiKeyUsage(apiKeyId) {
  try {
    const client = getSupabaseClient();

    // Fetch current usage count
    const { data: apiKey, error: fetchError } = await client
      .from('api_keys')
      .select('usage_count')
      .eq('id', apiKeyId)
      .single();

    if (fetchError) throw fetchError;

    // Update with incremented count
    const { error: updateError } = await client
      .from('api_keys')
      .update({
        usage_count: (apiKey?.usage_count || 0) + 1,
        last_used: new Date().toISOString(),
      })
      .eq('id', apiKeyId);

    if (updateError) throw updateError;
  } catch (error) {
    console.error('Error updating API key usage:', error);
  }
}

/**
 * Validate YouTube API key or OAuth credentials
 */
async function validateApiKey(apiKeyData) {
  try {
    const youtube = await initYouTubeClient(apiKeyData);

    // Try a simple API call to validate
    const response = await youtube.channels.list({
      part: 'id,snippet',
      mine: true,
    });

    return {
      valid: true,
      channelId: response.data.items[0]?.id,
      channelTitle: response.data.items[0]?.snippet?.title,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Get video status on YouTube
 */
async function getVideoStatus(videoId, apiKeyData) {
  try {
    const youtube = await initYouTubeClient(apiKeyData);

    const response = await youtube.videos.list({
      part: 'status,statistics',
      id: videoId,
    });

    const video = response.data.items[0];

    if (!video) {
      return { found: false };
    }

    return {
      found: true,
      status: video.status.uploadStatus,
      publicationStatus: video.status.publicationStatus,
      views: video.statistics?.viewCount || 0,
      likes: video.statistics?.likeCount || 0,
      comments: video.statistics?.commentCount || 0,
    };
  } catch (error) {
    console.error('Error getting video status:', error);
    throw error;
  }
}

/**
 * Delete video from YouTube
 */
async function deleteVideo(videoId, apiKeyData) {
  try {
    const youtube = await initYouTubeClient(apiKeyData);

    await youtube.videos.delete({
      id: videoId,
    });

    return true;
  } catch (error) {
    console.error('Error deleting video:', error);
    throw error;
  }
}

/**
 * Generate OAuth2 authorization URL
 */
function getOAuth2AuthUrl(clientId, clientSecret, redirectUri = 'urn:ietf:wg:oauth:2.0:oob') {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // Force consent to get refresh token
  });

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(clientId, clientSecret, code, redirectUri = 'urn:ietf:wg:oauth:2.0:oob') {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const { tokens } = await oauth2Client.getToken(code);
  
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  };
}

module.exports = {
  initYouTubeClient,
  getAvailableApiKey,
  uploadShort,
  validateApiKey,
  getVideoStatus,
  deleteVideo,
  updateApiKeyUsage,
  getOAuth2AuthUrl,
  exchangeCodeForTokens,
};
