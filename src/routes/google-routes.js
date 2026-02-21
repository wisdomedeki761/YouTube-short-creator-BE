/**
 * Google OAuth Routes
 * GET /api/auth/google - Initiate Google OAuth
 * GET /api/auth/google/callback - Google OAuth callback
 */

const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../utils/response');
const { googleLogin } = require('../auth/google-auth');

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 * Frontend should redirect to Google with client_id
 */
router.get('/google', (req, res) => {
  try {
    // This is handled by frontend redirecting to Google OAuth
    // Backend just provides the OAuth configuration
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${process.env.GOOGLE_CALLBACK_URL}&` +
      `response_type=code&` +
      `scope=openid profile email`;

    return res.status(200).json({
      ...successResponse(
        { authUrl: googleAuthUrl },
        'Redirect to this URL to login with Google'
      ).body
    });

  } catch (error) {
    return res.status(400).json({
      ...errorResponse('GOOGLE_AUTH_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/auth/google/callback
 * Handle Google OAuth callback with ID token
 * Body: { idToken } - from Google OAuth frontend flow
 */
router.post('/google/callback', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'ID token is required').body
      });
    }

    // Verify ID token with Google
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    // Login/create user
    const result = await googleLogin({
      id: payload.sub,
      email: payload.email,
      displayName: payload.name,
      picture: payload.picture
    });

    return res.status(200).json({
      ...successResponse(result, 'Google login successful').body
    });

  } catch (error) {
    console.error('Google callback error:', error.message);
    return res.status(401).json({
      ...errorResponse('GOOGLE_AUTH_ERROR', error.message).body
    });
  }
});

module.exports = router;
