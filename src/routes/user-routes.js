/**
 * User Routes
 * GET /api/users/profile - Get user profile
 * PUT /api/users/profile - Update profile
 * GET /api/users/api-keys - List API keys
 * POST /api/users/api-keys - Add API key
 * DELETE /api/users/api-keys/:id - Delete API key
 * POST /api/users/api-keys/:id/test - Test API key
 */

const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../utils/response');
const { approvedUserMiddleware } = require('../middleware/approval-middleware');
const {
  getProfile,
  updateProfile,
  addApiKey,
  getApiKeys,
  deleteApiKey,
  testApiKey,
  addYouTubeOAuthKey,
  updateAccountTag
} = require('../controllers/user-controller');

/**
 * GET /api/users/profile
 * Get current user profile
 */
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await getProfile(userId);

    return res.status(200).json({
      ...successResponse(profile, 'Profile retrieved successfully').body
    });
  } catch (error) {
    console.error('Get profile error:', error.message);
    return res.status(400).json({
      ...errorResponse('PROFILE_ERROR', error.message).body
    });
  }
});

/**
 * PUT /api/users/profile
 * Update user profile
 */
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Username is required').body
      });
    }

    const updated = await updateProfile(userId, { username });

    return res.status(200).json({
      ...successResponse(updated, 'Profile updated successfully').body
    });
  } catch (error) {
    console.error('Update profile error:', error.message);
    return res.status(400).json({
      ...errorResponse('UPDATE_ERROR', error.message).body
    });
  }
});

/**
 * GET /api/users/api-keys
 * List user's API keys
 */
router.get('/api-keys', approvedUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const keys = await getApiKeys(userId);

    return res.status(200).json({
      ...successResponse(keys, 'API keys retrieved successfully').body
    });
  } catch (error) {
    console.error('Get API keys error:', error.message);
    return res.status(400).json({
      ...errorResponse('KEYS_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/users/api-keys
 * Add new API key
 */
router.post('/api-keys', approvedUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, apiKey } = req.body;

    if (!platform || !apiKey) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Platform and apiKey are required').body
      });
    }

    const key = await addApiKey(userId, platform, apiKey);

    return res.status(201).json({
      ...successResponse(key, 'API key added successfully').body
    });
  } catch (error) {
    console.error('Add API key error:', error.message);
    return res.status(400).json({
      ...errorResponse('ADD_KEY_ERROR', error.message).body
    });
  }
});

/**
 * DELETE /api/users/api-keys/:id
 * Delete API key
 */
router.delete('/api-keys/:id', approvedUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await deleteApiKey(userId, id);

    return res.status(200).json({
      ...successResponse(result, 'API key deleted successfully').body
    });
  } catch (error) {
    console.error('Delete API key error:', error.message);
    return res.status(400).json({
      ...errorResponse('DELETE_KEY_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/users/api-keys/:id/test
 * Test API key validity
 */
router.post('/api-keys/:id/test', approvedUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await testApiKey(userId, id);

    return res.status(200).json({
      ...successResponse(result, 'API key test completed').body
    });
  } catch (error) {
    console.error('Test API key error:', error.message);
    return res.status(400).json({
      ...errorResponse('TEST_KEY_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/users/youtube/oauth/start
 * Generate YouTube OAuth authorization URL
 */
router.post('/youtube/oauth/start', approvedUserMiddleware, async (req, res) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body;

    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'clientId, clientSecret, and redirectUri are required').body
      });
    }

    const { getOAuth2AuthUrl } = require('../platforms/youtube');
    const authUrl = getOAuth2AuthUrl(clientId, clientSecret, redirectUri);

    return res.status(200).json({
      ...successResponse({ authUrl }, 'OAuth URL generated').body
    });
  } catch (error) {
    console.error('YouTube OAuth start error:', error.message);
    return res.status(400).json({
      ...errorResponse('OAUTH_START_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/users/youtube/oauth/callback
 * Exchange OAuth code for tokens and store credentials
 */
router.post('/youtube/oauth/callback', approvedUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { code, clientId, clientSecret, redirectUri, accountTag } = req.body;

    if (!code || !clientId || !clientSecret || !redirectUri) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'code, clientId, clientSecret, and redirectUri are required').body
      });
    }

    const { exchangeCodeForTokens } = require('../platforms/youtube');
    const tokens = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);

    const apiKey = await addYouTubeOAuthKey(
      userId,
      clientId,
      clientSecret,
      tokens.access_token,
      tokens.refresh_token,
      new Date(tokens.expiry_date),
      accountTag
    );

    return res.status(201).json({
      ...successResponse(apiKey, 'YouTube authorized successfully').body
    });
  } catch (error) {
    console.error('YouTube OAuth callback error:', error.message);
    return res.status(400).json({
      ...errorResponse('OAUTH_CALLBACK_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/users/api-keys/youtube/manual
 * Add YouTube OAuth credentials manually (advanced users)
 */
router.post('/api-keys/youtube/manual', approvedUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { clientId, clientSecret, accessToken, refreshToken, accountTag } = req.body;

    if (!clientId || !clientSecret || !accessToken || !refreshToken) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'clientId, clientSecret, accessToken, and refreshToken are required').body
      });
    }

    // Calculate default expiry (1 hour from now)
    const expiryDate = new Date(Date.now() + 3600 * 1000);

    const apiKey = await addYouTubeOAuthKey(
      userId,
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      expiryDate,
      accountTag
    );

    return res.status(201).json({
      ...successResponse(apiKey, 'YouTube credentials added successfully').body
    });
  } catch (error) {
    console.error('Add manual YouTube credentials error:', error.message);
    return res.status(400).json({
      ...errorResponse('ADD_YOUTUBE_ERROR', error.message).body
    });
  }
});

/**
 * PUT /api/users/api-keys/:id/tag
 * Update account tag/name
 */
router.put('/api-keys/:id/tag', approvedUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { tag } = req.body;

    if (!tag || !tag.trim()) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Account tag is required').body
      });
    }

    const updated = await updateAccountTag(userId, id, tag.trim());

    return res.status(200).json({
      ...successResponse(updated, 'Account tag updated').body
    });
  } catch (error) {
    console.error('Update tag error:', error.message);
    return res.status(400).json({
      ...errorResponse('UPDATE_TAG_ERROR', error.message).body
    });
  }
});

module.exports = router;
