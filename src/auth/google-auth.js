/**
 * Google OAuth Authentication Module
 * Handles Google account linking and authentication
 */

const { getSupabaseClient } = require('../storage/supabase');
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

    const client = getSupabaseClient();

    // Check if user exists by google_id
    const { data: existingUser } = await client
      .from('users')
      .select('*')
      .eq('google_id', profile.id)
      .single();

    if (existingUser) {
      // Update last login
      await client
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('telegram_id', existingUser.telegram_id);

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
    const { data: emailUser } = await client
      .from('users')
      .select('*')
      .eq('email', profile.email)
      .single();

    if (emailUser && emailUser.auth_method === 'email') {
      throw new Error('This email is already registered with email/password auth');
    }

    // Create new user with Google OAuth
    const userId = uuidv4();

    const { data: newUser, error } = await client
      .from('users')
      .insert({
        telegram_id: userId,
        email: profile.email,
        username: profile.displayName || profile.name || profile.email.split('@')[0],
        google_id: profile.id,
        auth_method: 'google',
        is_approved: true,
        is_email_verified: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
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
