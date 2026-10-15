/**
 * Strict superadmin-only middleware.
 * Only authenticated users with role "superadmin" can proceed.
 * Legacy "admin", "manager", and "staff" receive 403 Forbidden.
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const userRole = (req.user.role || "").toString().toLowerCase().trim();

  if (userRole !== "superadmin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Superadmin privileges required.",
    });
  }

  next();
};

/**
 * Authorize allowed roles with backward-compatible role mapping.
 *
 * Rules:
 * 1. Direct match: if userRole is explicitly in allowedRoles, allow.
 * 2. Superadmin: has access to managerial operations (any route allowing "manager" or "admin").
 * 3. Legacy Admin / Manager: treated as managerial level. Legacy "admin" preserves
 *    all managerial permissions alongside "manager", but NEVER inherits superadmin privileges.
 * 4. Staff: restricted to routes explicitly allowing "staff".
 */
const authorize = (...allowedRoles) => {
  const normalizedAllowed = allowedRoles.map((r) =>
    r.toString().toLowerCase().trim()
  );

  return (req, res, next) => {
    // Authentication middleware should run first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userRole = (req.user.role || "").toString().toLowerCase().trim();

    // 1. Direct match
    if (normalizedAllowed.includes(userRole)) {
      return next();
    }

    // 2. Superadmin has oversight access to managerial operations
    const isManagerialAllowed =
      normalizedAllowed.includes("admin") || normalizedAllowed.includes("manager");

    if (userRole === "superadmin" && isManagerialAllowed) {
      return next();
    }

    // 3. Managerial interchangeability: legacy "admin" and "manager" can access managerial endpoints
    const isManagerialUser = userRole === "admin" || userRole === "manager";
    if (isManagerialAllowed && isManagerialUser) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource",
    });
  };
};

module.exports = {
  authorize,
  requireSuperAdmin,
};