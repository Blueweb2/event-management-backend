const User = require("../models/user.model");
const {
  normalizeDepartment,
  DEFAULT_DEPARTMENT_PERMISSIONS,
} = require("../utils/department.constants");

/**
 * Middleware to enforce department-level access control.
 *
 * Rules:
 * - Superadmin and legacy Admin: Full cross-department administrative access.
 * - Operations / General Operations Manager: Broad operations overview.
 * - Department-Specific Manager (e.g. Kitchen, Decoration, Photography):
 *   Only permitted to access their assigned department's data and workflows.
 *   Access to other departments is rejected with HTTP 403 Forbidden.
 * - Staff: Rejected with HTTP 403 Forbidden.
 * - Unauthenticated: Rejected with HTTP 401 Unauthorized (handled by authenticate).
 */
const requireDepartmentAccess = (targetDepartment, requiredPermission = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const role = String(req.user.role || "").toLowerCase();

      // Superadmin and legacy Admin have unrestricted access
      if (role === "superadmin" || role === "admin") {
        return next();
      }

      // Only managers and admins can proceed
      if (role !== "manager") {
        return res.status(403).json({
          success: false,
          message: "Access forbidden: Manager privileges required",
        });
      }

      // Fetch fresh user profile to ensure up-to-date department & permissions
      const user = await User.findById(req.user.userId).select(
        "department permissions isActive role"
      );

      if (!user || !user.isActive) {
        return res.status(403).json({
          success: false,
          message: "Account is inactive or not found",
        });
      }

      const userDept = normalizeDepartment(user.department || req.user.department || "");
      const targetDept = normalizeDepartment(targetDepartment);

      // Operations managers have broad operational oversight across departments
      if (userDept === "Operations") {
        req.managerDepartment = userDept;
        req.managerPermissions = user.permissions || [];
        return next();
      }

      // Check department match
      if (userDept !== targetDept) {
        return res.status(403).json({
          success: false,
          message: `Access denied: Your account is assigned to the "${user.department || userDept}" department and cannot access the "${targetDepartment}" department.`,
        });
      }

      // Check granular permission if specified
      if (requiredPermission) {
        const userPermissions =
          user.permissions && user.permissions.length > 0
            ? user.permissions
            : DEFAULT_DEPARTMENT_PERMISSIONS[userDept] || [];

        const hasPermission =
          userPermissions.includes(requiredPermission) ||
          userPermissions.includes("*") ||
          userPermissions.includes(`${targetDept.toLowerCase()}:*`);

        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            message: `Access denied: Missing required permission "${requiredPermission}".`,
          });
        }
      }

      req.managerDepartment = userDept;
      req.managerPermissions = user.permissions || [];
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  requireDepartmentAccess,
};
