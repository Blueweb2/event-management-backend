const { verifyToken } = require("../utils/jwt");

const authenticate = async (req, res, next) => {
  try {
    let authHeader = req.headers.authorization;
    if ((!authHeader || typeof authHeader !== "string") && req.query && typeof req.query.token === "string") {
      authHeader = `Bearer ${req.query.token.trim()}`;
    }

    if (!authHeader || typeof authHeader !== "string") {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    const normalizedHeader = authHeader.trim();
    const parts = normalizedHeader.split(" ");

    if (
      parts.length !== 2 ||
      parts[0].toLowerCase() !== "bearer" ||
      !parts[1] ||
      parts[1].trim().length === 0
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format. Use: Bearer <token>",
      });
    }

    const token = parts[1].trim();
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    let role = (decoded.role || "").toLowerCase();
    let department = decoded.department || "";
    let permissions = decoded.permissions || [];
    let name = decoded.name || "";
    let email = decoded.email || "";

    try {
      const User = require("../models/user.model");
      const dbUser = await User.findById(decoded.userId).select("role department permissions isActive name email");
      if (dbUser) {
        if (!dbUser.isActive) {
          return res.status(403).json({
            success: false,
            message: "Account has been deactivated",
          });
        }
        role = (dbUser.role || role).toLowerCase();
        department = dbUser.department !== undefined ? dbUser.department : department;
        permissions = dbUser.permissions || permissions;
        name = dbUser.name || name;
        email = dbUser.email || email;
      }
    } catch (_dbErr) {
      // Fallback to token decoded attributes in edge cases
    }

    req.user = {
      userId: decoded.userId,
      role,
      department,
      permissions,
      name,
      email,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    next(error);
  }
};

module.exports = {
  authenticate,
};