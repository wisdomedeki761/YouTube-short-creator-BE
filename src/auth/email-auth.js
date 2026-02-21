/**
 * Email/Password Authentication Module
 * Handles user registration, login, and password management
 */

const { getSupabaseClient } = require('../storage/supabase');
const { hashPassword, verifyPassword, validatePassword } = require('./password-utils');
const { generateAccessToken, generateRefreshToken } = require('./token-manager');
const { validateEmail, sanitizeEmail } = require('../utils/validators');

/**
 * Register new user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} username - Display name
 * @returns {Promise<Object>} - User object and tokens
 */
async function registerUser(email, password, username) {
  try {
    // Validate inputs
    if (!email || !password || !username) {
      throw new Error('Email, password, and username are required');
    }

    // Validate email format
    if (!validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Sanitize email
    const sanitizedEmail = sanitizeEmail(email);

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(`Password does not meet requirements: ${passwordValidation.errors.join(', ')}`);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Check if email already exists
    const client = getSupabaseClient();
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('email', sanitizedEmail)
      .single();

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Create new user
    const { v4: uuidv4 } = require('uuid');
    const userId = uuidv4(); // Generate new ID for non-Telegram users

    const { data: newUser, error } = await client
      .from('users')
      .insert({
        telegram_id: userId,
        email: sanitizedEmail,
        username: username.trim(),
        password_hash: passwordHash,
        auth_method: 'email',
        is_approved: true, // Auto-approve email users (admin can manage)
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
      message: 'User registered successfully'
    };

  } catch (error) {
    throw new Error(`Registration failed: ${error.message}`);
  }
}

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} - User object and tokens
 */
async function loginUser(email, password) {
  try {
    // Validate inputs
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Sanitize email
    const sanitizedEmail = sanitizeEmail(email);

    // Get user from database
    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .select('*')
      .eq('email', sanitizedEmail)
      .single();

    if (error || !user) {
      throw new Error('Invalid email or password');
    }

    // Check if auth method is email
    if (user.auth_method !== 'email') {
      throw new Error(`This account uses ${user.auth_method} authentication`);
    }

    // Check if user is approved
    if (!user.is_approved) {
      throw new Error('Your account is not approved yet');
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await client
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('telegram_id', user.telegram_id);

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return {
      user: {
        id: user.telegram_id,
        email: user.email,
        username: user.username,
        is_admin: user.is_admin,
        is_approved: user.is_approved
      },
      accessToken,
      refreshToken,
      message: 'Login successful'
    };

  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
}

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} - Success message
 */
async function changePassword(userId, oldPassword, newPassword) {
  try {
    if (!userId || !oldPassword || !newPassword) {
      throw new Error('User ID, old password, and new password are required');
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(`New password does not meet requirements: ${passwordValidation.errors.join(', ')}`);
    }

    // Get user from database
    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .select('*')
      .eq('telegram_id', userId)
      .single();

    if (error || !user) {
      throw new Error('User not found');
    }

    // Verify old password
    const isOldPasswordValid = await verifyPassword(oldPassword, user.password_hash);
    if (!isOldPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    const { error: updateError } = await client
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('telegram_id', userId);

    if (updateError) {
      throw updateError;
    }

    return {
      message: 'Password changed successfully'
    };

  } catch (error) {
    throw new Error(`Password change failed: ${error.message}`);
  }
}

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Promise<Object>} - User object
 */
async function getUserByEmail(email) {
  try {
    const sanitizedEmail = sanitizeEmail(email);

    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .select('*')
      .eq('email', sanitizedEmail)
      .single();

    if (error || !user) {
      return null;
    }

    return user;

  } catch (error) {
    console.error('Error fetching user by email:', error.message);
    return null;
  }
}

/**
 * Get user by ID
 * @param {string} userId - User ID (telegram_id)
 * @returns {Promise<Object>} - User object
 */
async function getUserById(userId) {
  try {
    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .select('*')
      .eq('telegram_id', userId)
      .single();

    if (error || !user) {
      return null;
    }

    return user;

  } catch (error) {
    console.error('Error fetching user by ID:', error.message);
    return null;
  }
}

module.exports = {
  registerUser,
  loginUser,
  changePassword,
  getUserByEmail,
  getUserById
};
