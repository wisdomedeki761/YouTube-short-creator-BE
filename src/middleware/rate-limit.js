/**
 * Rate Limiting Configuration
 * Prevents API abuse by limiting requests
 */

const rateLimit = require('express-rate-limit');

/**
 * Auth endpoints rate limiter
 * Stricter limits to prevent brute force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window (increased from 5 for better UX)
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
      status: 429
    }
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skip: (req, res) => {
    // Skip rate limiting for health check
    return req.path === '/api/health';
  },
  // Use default store that handles IPv6 properly
  skipSuccessfulRequests: true, // Don't count successful logins against limit
  skipFailedRequests: false
});

/**
 * Upload endpoints rate limiter
 * Moderate limits for file uploads
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many uploads. Please try again later.',
      status: 429
    }
  },
  standardHeaders: false,
  legacyHeaders: false
});

/**
 * General API rate limiter
 * Loose limits for normal API usage
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      status: 429
    }
  },
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req, res) => {
    // Skip rate limiting for health check
    return req.path === '/api/health';
  }
});

/**
 * Setup rate limiting for the app
 * @param {Express.Application} app - Express app instance
 */
function setupRateLimiting(app) {
  // Skip rate limiting in development mode or if DISABLE_RATE_LIMIT is set
  if (process.env.NODE_ENV === 'development' || process.env.DISABLE_RATE_LIMIT === 'true') {
    console.log('⚠️  Rate limiting disabled (development mode or DISABLE_RATE_LIMIT=true)');
    return;
  }

  console.log('🔒 Rate limiting enabled');
  
  // Auth endpoints - strict limiting
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/refresh-token', authLimiter);

  // Upload endpoints - moderate limiting (only POST, not GET)
  app.use('/api/videos/upload', uploadLimiter);
  app.use('/api/admin/filler-videos', (req, res, next) => {
    // Only apply rate limiting to POST requests (uploads), not GET requests
    if (req.method === 'POST') {
      return uploadLimiter(req, res, next);
    }
    next();
  });

  // All other endpoints - general limiting
  app.use(generalLimiter);
}

module.exports = {
  authLimiter,
  uploadLimiter,
  generalLimiter,
  setupRateLimiting
};
