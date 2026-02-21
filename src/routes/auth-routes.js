/**
 * Authentication Routes
 * POST /api/auth/register - Register new user
 * POST /api/auth/login - Login user
 * POST /api/auth/logout - Logout user
 * POST /api/auth/refresh-token - Refresh access token
 * POST /api/auth/change-password - Change password
 */

const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../utils/response');
const { jwtAuthMiddleware } = require('../middleware/jwt-middleware');
const { registerUser, loginUser, changePassword } = require('../auth/email-auth');
const { verifyRefreshToken, generateAccessToken } = require('../auth/token-manager');
const { getUserById } = require('../auth/email-auth');

/**
 * POST /api/auth/register
 * Register new user with email and password
 * Body: { email, password, username }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // Validate required fields
    if (!email || !password || !username) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Email, password, and username are required').body
      });
    }

    // Register user
    const result = await registerUser(email, password, username);

    return res.status(201).json({
      ...successResponse(result, 'User registered successfully').body
    });

  } catch (error) {
    console.error('Registration error:', error.message);
    return res.status(400).json({
      ...errorResponse('REGISTRATION_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Email and password are required').body
      });
    }

    // Login user
    const result = await loginUser(email, password);

    return res.status(200).json({
      ...successResponse(result, 'Login successful').body
    });

  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(401).json({
      ...errorResponse('LOGIN_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (invalidate session)
 * Requires: Authorization header with JWT
 */
router.post('/logout', jwtAuthMiddleware, async (req, res) => {
  try {
    // In a real implementation, we would:
    // 1. Revoke the refresh token in the database
    // 2. Invalidate any sessions
    // For now, client just discards the token

    return res.status(200).json({
      ...successResponse({}, 'Logout successful').body
    });

  } catch (error) {
    console.error('Logout error:', error.message);
    return res.status(400).json({
      ...errorResponse('LOGOUT_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/auth/refresh-token
 * Get new access token using refresh token
 * Body: { refreshToken }
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Validate refresh token provided
    if (!refreshToken) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Refresh token is required').body
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Get user
    const user = await getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({
        ...errorResponse('INVALID_TOKEN', 'User not found').body
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user);

    return res.status(200).json({
      ...successResponse(
        {
          accessToken: newAccessToken,
          user: {
            id: user.telegram_id,
            email: user.email,
            username: user.username,
            is_admin: user.is_admin,
            is_approved: user.is_approved
          }
        },
        'Token refreshed successfully'
      ).body
    });

  } catch (error) {
    console.error('Token refresh error:', error.message);
    return res.status(401).json({
      ...errorResponse('REFRESH_ERROR', error.message).body
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password (requires authentication)
 * Requires: Authorization header with JWT
 * Body: { oldPassword, newPassword }
 */
router.post('/change-password', jwtAuthMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        ...errorResponse('VALIDATION_ERROR', 'Old password and new password are required').body
      });
    }

    // Change password
    const result = await changePassword(userId, oldPassword, newPassword);

    return res.status(200).json({
      ...successResponse(result, 'Password changed successfully').body
    });

  } catch (error) {
    console.error('Change password error:', error.message);
    return res.status(400).json({
      ...errorResponse('CHANGE_PASSWORD_ERROR', error.message).body
    });
  }
});

module.exports = router;
