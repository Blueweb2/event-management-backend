const express = require("express");

const {
  getDashboardAnalytics,
} = require("../controllers/report.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

const requireReportAccess = (req, res, next) => {
  const role = (req.user?.role || "").toLowerCase();
  if (role === "superadmin" || role === "admin") return next();
  return res.status(403).json({
    success: false,
    message: "Access denied: Financial and executive reports are restricted to Super Admin only.",
  });
};

/**
 * Get dashboard analytics
 */
router.get(
  "/analytics",
  authenticate,
  authorize("admin", "Manager"),
  requireReportAccess,
  getDashboardAnalytics
);

module.exports = router;
