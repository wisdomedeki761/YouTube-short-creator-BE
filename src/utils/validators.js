/**
 * Input Validation Utilities
 */

const validator = require('validator');

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
const validateEmail = (email) => {
  return validator.isEmail(email);
};

/**
 * Validate password strength
 * Requirements: 8+ chars, 1 uppercase, 1 number, 1 special char
 * @param {string} password
 * @returns {{valid: boolean, errors: Array}}
 */
const validatePasswordStrength = (password) => {
  const errors = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate video file type
 * @param {string} mimeType
 * @returns {boolean}
 */
const validateVideoType = (mimeType) => {
  const allowedTypes = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/mpeg'
  ];
  return allowedTypes.includes(mimeType);
};

/**
 * Validate file extension
 * @param {string} filename
 * @returns {boolean}
 */
const validateVideoExtension = (filename) => {
  const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.mpeg'];
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return allowedExtensions.includes(ext);
};

/**
 * Validate file size
 * @param {number} sizeInBytes
 * @param {number} maxSizeInMB (default 2GB = 2048MB)
 * @returns {boolean}
 */
const validateFileSize = (sizeInBytes, maxSizeInMB = 2048) => {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return sizeInBytes <= maxSizeInBytes;
};

/**
 * Validate required fields
 * @param {Object} obj
 * @param {Array} requiredFields
 * @returns {{valid: boolean, missingFields: Array}}
 */
const validateRequiredFields = (obj, requiredFields) => {
  const missingFields = [];

  requiredFields.forEach(field => {
    if (!obj[field] || (typeof obj[field] === 'string' && obj[field].trim() === '')) {
      missingFields.push(field);
    }
  });

  return {
    valid: missingFields.length === 0,
    missingFields
  };
};

/**
 * Validate UUID format
 * @param {string} uuid
 * @returns {boolean}
 */
const validateUUID = (uuid) => {
  return validator.isUUID(uuid);
};

/**
 * Sanitize email
 * @param {string} email
 * @returns {string}
 */
const sanitizeEmail = (email) => {
  return validator.normalizeEmail(email);
};

/**
 * Escape HTML characters
 * @param {string} str
 * @returns {string}
 */
const escapeHtml = (str) => {
  return validator.escape(str);
};

module.exports = {
  validateEmail,
  validatePasswordStrength,
  validateVideoType,
  validateVideoExtension,
  validateFileSize,
  validateRequiredFields,
  validateUUID,
  sanitizeEmail,
  escapeHtml
};
