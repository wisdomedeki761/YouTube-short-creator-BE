/**
 * Token Manager
 * Handles JWT token generation, verification, and refresh
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

/**
 * Generate access token (short-lived)
 * @param {Object} user - User object with id, email, is_admin
 * @returns {string} - JWT access token
 */
function generateAccessToken(user) {
  try {
    const payload = {
      id: user.telegram_id || user.id,
      email: user.email,
      is_admin: user.is_admin || false,
      auth_method: user.auth_method
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
      algorithm: 'HS256'
    });

    return token;
  } catch (error) {
    throw new Error(`Failed to generate access token: ${error.message}`);
  }
}

/**
 * Generate refresh token (long-lived)
 * @param {Object} user - User object with id
 * @returns {string} - JWT refresh token
 */
function generateRefreshToken(user) {
  try {
    const payload = {
      id: user.telegram_id || user.id,
      type: 'refresh'
    };

    const token = jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      algorithm: 'HS256'
    });

    return token;
  } catch (error) {
    throw new Error(`Failed to generate refresh token: ${error.message}`);
  }
}

/**
 * Verify and decode access token
 * @param {string} token - JWT access token
 * @returns {Object} - Decoded payload
 */
function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token has expired');
    }
    throw new Error(`Invalid access token: ${error.message}`);
  }
}

/**
 * Verify and decode refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} - Decoded payload
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      algorithms: ['HS256']
    });
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token has expired');
    }
    throw new Error(`Invalid refresh token: ${error.message}`);
  }
}

/**
 * Get token expiration time
 * @param {string} token - JWT token
 * @returns {number} - Expiration timestamp (ms)
 */
function getTokenExpiration(token) {
  try {
    const decoded = jwt.decode(token);
    return decoded.exp * 1000; // Convert to milliseconds
  } catch (error) {
    return null;
  }
}

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} - True if expired
 */
function isTokenExpired(token) {
  try {
    const expTime = getTokenExpiration(token);
    return expTime && Date.now() >= expTime;
  } catch (error) {
    return true; // Assume expired if we can't check
  }
}

/**
 * Get time until token expires
 * @param {string} token - JWT token
 * @returns {number} - Milliseconds until expiration
 */
function getTimeUntilExpiry(token) {
  try {
    const expTime = getTokenExpiration(token);
    const msUntilExpiry = expTime - Date.now();
    return Math.max(0, msUntilExpiry);
  } catch (error) {
    return 0;
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getTokenExpiration,
  isTokenExpired,
  getTimeUntilExpiry
};
