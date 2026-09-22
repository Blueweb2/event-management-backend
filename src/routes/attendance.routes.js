const express = require("express");

const {
  checkIn,
  checkOut,
  getAttendance,
  markAbsent,
  updateAttendance,
  deleteAttendance,
} = require("../controllers/attendance.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const {
  authorize,
} = require("../middlewares/role.middleware");

const router = express.Router();

/**
 * Check in
 */
router.post(
  "/check-in",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  checkIn
);

/**
 * Check out
 */
router.post(
  "/check-out",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  checkOut
);

/**
 * Attendance list
 */
router.get(
  "/",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  getAttendance
);

/**
 * Mark absent
 */
router.post(
  "/absent",
  authenticate,
  authorize("admin", "Manager"),
  markAbsent
);

/**
 * Manual attendance update (correction)
 */
router.patch(
  "/:id",
  authenticate,
  authorize("admin", "Manager"),
  updateAttendance
);

/**
 * Delete attendance record
 */
router.delete(
  "/:id",
  authenticate,
  authorize("admin", "Manager"),
  deleteAttendance
);

module.exports = router;