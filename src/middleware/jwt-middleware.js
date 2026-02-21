/**
 * JWT Authentication Middleware
 * Verifies and validates JWT tokens
 */

const jwt = require('jsonwebtoken');

/**
 * Verify JWT token and attach user to request
 */
const jwtAuthMiddleware = (req, res, next) => {
  try {
    // Get token from Authorization header
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: 'No authentication token provided',
          status: 401
        }
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request
    req.user = decoded;
    req.token = token;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired',
          status: 401
        }
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token',
          status: 401
        }
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed',
        status: 401
      }
    });
  }
};

/**
 * Verify JWT token is admin
 */
const adminOnlyMiddleware = (req, res, next) => {
  if (!req.user.is_admin) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'ADMIN_REQUIRED',
        message: 'Admin access required',
        status: 403
      }
    });
  }

  next();
};

/**
 * Optional JWT authentication
 * Verifies token if provided, but doesn't require it
 */
const optionalJwtMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      req.token = token;
    }

    next();
  } catch (error) {
    // Token is invalid but it's optional, so continue
    next();
  }
};

module.exports = {
  jwtAuthMiddleware,
  adminOnlyMiddleware,
  optionalJwtMiddleware
};
