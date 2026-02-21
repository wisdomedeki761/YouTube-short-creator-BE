/**
 * Password Utilities
 * Handles password hashing, verification, and validation
 */

const bcrypt = require('bcryptjs');
const { validatePasswordStrength } = require('../utils/validators');

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (error) {
    throw new Error(`Failed to hash password: ${error.message}`);
  }
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password from database
 * @returns {Promise<boolean>} - True if password matches
 */
async function verifyPassword(password, hash) {
  try {
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
  } catch (error) {
    console.error('Password verification error:', error.message);
    return false;
  }
}

/**
 * Validate password meets security requirements
 * @param {string} password - Password to validate
 * @returns {{valid: boolean, errors: Array}} - Validation result
 */
function validatePassword(password) {
  return validatePasswordStrength(password);
}

/**
 * Generate a strong random password (for admin-generated accounts)
 * @param {number} length - Password length (default 16)
 * @returns {string} - Random password
 */
function generateRandomPassword(length = 16) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';

  const allChars = uppercase + lowercase + numbers + special;
  let password = '';

  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePassword,
  generateRandomPassword
};
