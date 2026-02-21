/**
 * Global Error Handler Middleware
 * Catches and standardizes all error responses
 */

const errorHandler = (err, req, res, next) => {
  // Log error
  console.error('❌ Error:', {
    message: err.message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Default error response
  let statusCode = err.status || err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = err.message || 'Validation failed';
  }

  if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = 'Authentication failed';
  }

  if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    message = 'You do not have permission to access this resource';
  }

  if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    message = err.message || 'Resource not found';
  }

  // Return standardized error response
  return res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: message,
      status: statusCode,
      ...(process.env.NODE_ENV === 'development' && { details: err.message })
    }
  });
};

module.exports = { errorHandler };
