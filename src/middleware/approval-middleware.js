/**
 * User Approval Middleware
 * Checks if user is approved before accessing protected features
 * Admins bypass this check automatically
 */

/**
 * Middleware to enforce user approval
 * Blocks unapproved users from accessing features
 * Admins (is_admin = true) bypass this check
 */
function approvedUserMiddleware(req, res, next) {
  const user = req.user;

  // Admins bypass approval check
  if (user && user.is_admin) {
    return next();
  }

  // Check if user exists and is approved
  if (!user || !user.is_approved) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'USER_NOT_APPROVED',
        message: 'Your account is pending admin approval. You cannot access this feature yet.',
        requiresApproval: true
      }
    });
  }

  next();
}

module.exports = { approvedUserMiddleware };
