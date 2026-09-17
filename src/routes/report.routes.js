const express = require("express");

const {
  getDashboardAnalytics,
} = require("../controllers/report.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

/**
 * Get dashboard analytics
 */
router.get(
  "/analytics",
  authenticate,
  authorize("admin", "Manager"),
  getDashboardAnalytics
);

module.exports = router;
