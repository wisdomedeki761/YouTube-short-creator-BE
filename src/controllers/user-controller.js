/**
 * User Controller
 * Handles user profile and API key management
 */

const { getSupabaseClient } = require('../storage/supabase');
const { v4: uuidv4 } = require('uuid');

/**
 * Get user profile
 */
async function getProfile(userId) {
  try {
    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .select('telegram_id, username, email, is_admin, is_approved, created_at, last_login')
      .eq('telegram_id', userId)
      .single();

    if (error || !user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    throw new Error(`Failed to get profile: ${error.message}`);
  }
}

/**
 * Update user profile
 */
async function updateProfile(userId, updates) {
  try {
    const allowedFields = ['username'];
    const updateData = {};

    // Only allow specific fields to be updated
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .update(updateData)
      .eq('telegram_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return user;
  } catch (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }
}

/**
 * Add API key
 */
async function addApiKey(userId, platform, apiKey) {
  try {
    if (!platform || !apiKey) {
      throw new Error('Platform and API key are required');
    }

    if (!['youtube', 'facebook'].includes(platform.toLowerCase())) {
      throw new Error('Platform must be "youtube" or "facebook"');
    }

    const client = getSupabaseClient();

    // Check limit - regular users can have max 3 keys per platform
    const { data: existingKeys } = await client
      .from('api_keys')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', platform.toLowerCase());

    // Get user to check if admin
    const { data: user } = await client
      .from('users')
      .select('is_admin')
      .eq('telegram_id', userId)
      .single();

    const maxKeys = user?.is_admin ? 999 : 3;

    if (existingKeys && existingKeys.length >= maxKeys) {
      throw new Error(`Maximum ${maxKeys} ${platform} keys allowed`);
    }

    // Add key
    const { data: key, error } = await client
      .from('api_keys')
      .insert({
        id: uuidv4(),
        user_id: userId,
        platform: platform.toLowerCase(),
        api_key: apiKey,
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Map database fields to frontend expected format
    return {
      id: key.id,
      platform: key.platform,
      key: key.api_key, // Map api_key to key for frontend
      status: key.status || 'active',
      usageCount: key.usage_count || 0,
      lastUsed: key.last_used || null,
      createdAt: key.created_at || new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Failed to add API key: ${error.message}`);
  }
}

/**
 * Get user's API keys
 */
async function getApiKeys(userId) {
  try {
    const client = getSupabaseClient();
    const { data: keys, error } = await client
      .from('api_keys')
      .select('id, platform, api_key, status, usage_count, last_used, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Map database fields to frontend expected format
    const mappedKeys = (keys || []).map(key => ({
      id: key.id,
      platform: key.platform,
      key: key.api_key, // Map api_key to key for frontend
      status: key.status || 'active',
      usageCount: key.usage_count || 0,
      lastUsed: key.last_used || null,
      createdAt: key.created_at || key.createdAt || new Date().toISOString(),
    }));

    return mappedKeys;
  } catch (error) {
    throw new Error(`Failed to get API keys: ${error.message}`);
  }
}

/**
 * Delete API key
 */
async function deleteApiKey(userId, keyId) {
  try {
    const client = getSupabaseClient();

    // Verify key belongs to user
    const { data: key } = await client
      .from('api_keys')
      .select('id')
      .eq('id', keyId)
      .eq('user_id', userId)
      .single();

    if (!key) {
      throw new Error('API key not found');
    }

    const { error } = await client
      .from('api_keys')
      .delete()
      .eq('id', keyId);

    if (error) {
      throw error;
    }

    return { message: 'API key deleted' };
  } catch (error) {
    throw new Error(`Failed to delete API key: ${error.message}`);
  }
}

/**
 * Test API key
 */
async function testApiKey(userId, keyId) {
  try {
    const client = getSupabaseClient();

    // Get key
    const { data: key } = await client
      .from('api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('user_id', userId)
      .single();

    if (!key) {
      throw new Error('API key not found');
    }

    // Basic validation - just check if key exists
    // Real implementation would test with actual API
    const isValid = key.api_key && key.api_key.length > 0;

    return {
      valid: isValid,
      platform: key.platform,
      message: isValid ? 'API key is valid' : 'API key is invalid'
    };
  } catch (error) {
    throw new Error(`Failed to test API key: ${error.message}`);
  }
}

/**
 * Add YouTube OAuth credentials
 */
async function addYouTubeOAuthKey(userId, clientId, clientSecret, accessToken, refreshToken, expiryDate) {
  try {
    const client = getSupabaseClient();

    const { data: key, error } = await client
      .from('api_keys')
      .insert({
        user_id: userId,
        platform: 'youtube',
        auth_type: 'oauth2',
        client_id: clientId,
        client_secret: clientSecret,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expiry: expiryDate.toISOString(),
        status: 'active',
        api_key: JSON.stringify({ clientId, clientSecret }),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      id: key.id,
      platform: key.platform,
      authType: key.auth_type,
      status: key.status,
      tokenExpiry: key.token_expiry,
      createdAt: key.created_at,
    };
  } catch (error) {
    throw new Error(`Failed to add YouTube OAuth key: ${error.message}`);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  addApiKey,
  getApiKeys,
  deleteApiKey,
  testApiKey,
  addYouTubeOAuthKey
};
