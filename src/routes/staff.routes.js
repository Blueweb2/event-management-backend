const express = require("express");

const {
  createStaff,
  getStaff,
  getStaffById,
  updateStaff,
  updateStaffStatus,
  resetStaffPassword,
} = require("../controllers/staff.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const {
  authorize,
} = require("../middlewares/role.middleware");

const router = express.Router();

/**
 * ==========================================
 * STAFF MANAGEMENT
 * ==========================================
 *
 * Admin only
 */

/**
 * Create staff
 * POST /api/users/staff
 */
router.post(
  "/",
  authenticate,
  authorize("admin"),
  createStaff
);

/**
 * Get all staff
 * GET /api/users/staff
 */
router.get(
  "/",
  authenticate,
  authorize("admin"),
  getStaff
);

/**
 * Get staff by ID
 * GET /api/users/staff/:id
 */
router.get(
  "/:id",
  authenticate,
  authorize("admin"),
  getStaffById
);

/**
 * Update staff
 * PUT /api/users/staff/:id
 */
router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  updateStaff
);

/**
 * Activate / deactivate staff
 * PATCH /api/users/staff/:id/status
 */
router.patch(
  "/:id/status",
  authenticate,
  authorize("admin"),
  updateStaffStatus
);

/**
 * Reset staff password
 * PATCH /api/users/staff/:id/password
 */
router.patch(
  "/:id/password",
  authenticate,
  authorize("admin"),
  resetStaffPassword
);

module.exports = router;