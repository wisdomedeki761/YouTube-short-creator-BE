const axios = require('axios');
const fs = require('fs-extra');
const FormData = require('form-data');
const { PLATFORM_CONFIG } = require('../config/constants');
const { getSupabaseClient } = require('../storage/supabase');

const API_VERSION = PLATFORM_CONFIG.FACEBOOK.API_VERSION;
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Initialize Facebook client
 */
function initFacebookClient(accessToken) {
  if (!accessToken) {
    throw new Error('Facebook access token is required');
  }

  return {
    accessToken,
    apiVersion: API_VERSION,
  };
}

/**
 * Upload video to Facebook as Reel
 */
async function uploadReel(videoPath, caption, pageId, accessTokenData) {
  try {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const accessToken = accessTokenData.api_key;

    console.log('📤 Uploading to Facebook Reels...');

    // Create form data for the video
    const form = new FormData();
    form.append('file', fs.createReadStream(videoPath));
    form.append('description', caption || 'Amazing split-screen video!');
    form.append('access_token', accessToken);

    // Upload video initialization
    const initResponse = await axios.post(
      `${BASE_URL}/${pageId}/video_reels`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          process.stdout.write(`\r⏳ Upload Progress: ${percentCompleted}%`);
        },
      }
    );

    console.log('\n✅ Video uploaded to Facebook!');

    const reelId = initResponse.data.id;
    const reelUrl = `https://www.facebook.com/reel/${reelId}`;

    // Update API key usage count
    await updateApiKeyUsage(accessTokenData.id);

    return {
      reelId: reelId,
      url: reelUrl,
      description: caption,
    };
  } catch (error) {
    console.error('❌ Error uploading to Facebook:', error.message);

    // Handle specific Facebook errors
    if (error.response?.data?.error?.message) {
      const errorMsg = error.response.data.error.message;

      if (errorMsg.includes('token')) {
        throw new Error('Invalid Facebook access token. Please verify and try again.');
      }

      if (errorMsg.includes('limit') || errorMsg.includes('quota')) {
        throw new Error('Facebook API limit exceeded. Please try again later.');
      }
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

    const { error } = await client
      .from('api_keys')
      .update({
        usage_count: client.raw(`usage_count + 1`),
        last_used: new Date().toISOString(),
      })
      .eq('id', apiKeyId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating API key usage:', error);
  }
}

/**
 * Validate Facebook access token
 */
async function validateAccessToken(accessToken) {
  try {
    const response = await axios.get(`${BASE_URL}/me`, {
      params: {
        access_token: accessToken,
      },
    });

    return {
      valid: true,
      userId: response.data.id,
      name: response.data.name,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Get available Facebook API key for user (round-robin or least used)
 */
async function getAvailableApiKey(userId, apiKeys) {
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error('No Facebook API keys available');
  }

  // Get the key with least usage
  const sortedKeys = [...apiKeys].sort((a, b) => {
    return (a.usage_count || 0) - (b.usage_count || 0);
  });

  return sortedKeys[0];
}

/**
 * Get user's Facebook pages
 */
async function getUserPages(accessToken) {
  try {
    const response = await axios.get(`${BASE_URL}/me/accounts`, {
      params: {
        access_token: accessToken,
        limit: 100,
      },
    });

    return response.data.data || [];
  } catch (error) {
    console.error('Error getting Facebook pages:', error.message);
    throw error;
  }
}

/**
 * Get reel status on Facebook
 */
async function getReelStatus(reelId, accessToken) {
  try {
    const response = await axios.get(`${BASE_URL}/${reelId}`, {
      params: {
        fields: 'created_time,status,story,views,comments,likes',
        access_token: accessToken,
      },
    });

    const reel = response.data;

    return {
      found: true,
      id: reel.id,
      status: reel.status,
      createdTime: reel.created_time,
      views: reel.views || 0,
      comments: reel.comments?.summary?.total_count || 0,
      likes: reel.likes?.summary?.total_count || 0,
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return { found: false };
    }

    console.error('Error getting reel status:', error);
    throw error;
  }
}

/**
 * Delete reel from Facebook
 */
async function deleteReel(reelId, accessToken) {
  try {
    await axios.delete(`${BASE_URL}/${reelId}`, {
      params: {
        access_token: accessToken,
      },
    });

    return true;
  } catch (error) {
    console.error('Error deleting reel:', error);
    throw error;
  }
}

module.exports = {
  initFacebookClient,
  uploadReel,
  validateAccessToken,
  getAvailableApiKey,
  getUserPages,
  getReelStatus,
  deleteReel,
  updateApiKeyUsage,
};
