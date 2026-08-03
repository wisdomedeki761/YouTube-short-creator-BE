/**
 * Google OAuth Authentication Module
 * Handles Google account linking and authentication
 */

const { query } = require('../storage/postgres');
const { generateAccessToken, generateRefreshToken } = require('./token-manager');
const { v4: uuidv4 } = require('uuid');

/**
 * Login or create user with Google OAuth
 * @param {Object} profile - Google profile from OAuth
 * @returns {Promise<Object>} - User object and tokens
 */
async function googleLogin(profile) {
  try {
    if (!profile || !profile.id || !profile.email) {
      throw new Error('Invalid Google profile');
    }

    // Check if user exists by google_id
    const rows = await query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
    const existingUser = rows[0];

    if (existingUser) {
      // Update last login
      await query(
        'UPDATE users SET last_login = $1 WHERE telegram_id = $2',
        [new Date().toISOString(), existingUser.telegram_id]
      );

      // Generate tokens
      const accessToken = generateAccessToken(existingUser);
      const refreshToken = generateRefreshToken(existingUser);

      return {
        user: {
          id: existingUser.telegram_id,
          email: existingUser.email,
          username: existingUser.username,
          is_admin: existingUser.is_admin,
          is_approved: existingUser.is_approved
        },
        accessToken,
        refreshToken,
        message: 'Login successful'
      };
    }

    // Check if email already registered with email auth
    const emailRows = await query('SELECT * FROM users WHERE email = $1', [profile.email]);
    const emailUser = emailRows[0];

    if (emailUser && emailUser.auth_method === 'email') {
      throw new Error('This email is already registered with email/password auth');
    }

    // Create new user with Google OAuth
    const userId = uuidv4();

    const insertSql = `
      INSERT INTO users (telegram_id, email, username, google_id, auth_method, is_approved, is_email_verified, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const insertValues = [
      userId,
      profile.email,
      profile.displayName || profile.name || profile.email.split('@')[0],
      profile.id,
      'google',
      true,
      true,
      new Date().toISOString()
    ];

    const result = await query(insertSql, insertValues);
    const newUser = result[0];

    if (!newUser) {
      throw new Error('Failed to create Google user record');
    }

    // Generate tokens
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    return {
      user: {
        id: newUser.telegram_id,
        email: newUser.email,
        username: newUser.username,
        is_admin: newUser.is_admin,
        is_approved: newUser.is_approved
      },
      accessToken,
      refreshToken,
      message: 'User created and logged in with Google'
    };

  } catch (error) {
    throw new Error(`Google login failed: ${error.message}`);
  }
}

/**
 * Get user by Google ID
 * @param {string} googleId - Google OAuth ID
 * @returns {Promise<Object>} - User object
 */
async function getUserByGoogleId(googleId) {
  try {
    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .select('*')
      .eq('google_id', googleId)
      .single();

    if (error || !user) {
      return null;
    }

    return user;

  } catch (error) {
    console.error('Error fetching user by Google ID:', error.message);
    return null;
  }
}

module.exports = {
  googleLogin,
  getUserByGoogleId
};
