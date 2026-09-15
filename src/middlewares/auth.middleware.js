const { verifyToken } = require("../utils/jwt");

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

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

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
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