/**
 * Response Utilities
 * Standardized response formatting
 */

/**
 * Success response
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default 200)
 * @returns {Object} Formatted response
 */
const successResponse = (data, message = 'Success', statusCode = 200) => {
  return {
    statusCode,
    body: {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * Error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default 400)
 * @returns {Object} Formatted response
 */
const errorResponse = (code, message, statusCode = 400) => {
  return {
    statusCode,
    body: {
      success: false,
      error: {
        code,
        message,
        status: statusCode
      },
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * Paginated response
 * @param {Array} data - Array of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @param {string} message - Success message
 * @returns {Object} Formatted response
 */
const paginatedResponse = (data, page, limit, total, message = 'Success') => {
  return {
    statusCode: 200,
    body: {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      message,
      timestamp: new Date().toISOString()
    }
  };
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse
};
