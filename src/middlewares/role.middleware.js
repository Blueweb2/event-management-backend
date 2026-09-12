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

    // Check user's role: direct match or admin/manager interchangeability
    const isDirectMatch = normalizedAllowed.includes(userRole);
    const isManagerialMatch =
      (userRole === "admin" || userRole === "manager") &&
      (normalizedAllowed.includes("admin") || normalizedAllowed.includes("manager"));

    if (!isDirectMatch && !isManagerialMatch) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
};

module.exports = {
  authorize,
};