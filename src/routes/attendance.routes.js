const express = require("express");

const {
  checkIn,
  checkOut,
  pauseShift,
  resumeShift,
  getAttendance,
  markAbsent,
  updateAttendance,
  deleteAttendance,
  getEventStaffAttendance,
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
 * Pause shift
 */
router.post(
  "/pause",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  pauseShift
);

/**
 * Resume shift
 */
router.post(
  "/resume",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  resumeShift
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
 * Event staff attendance timeline & stats
 * GET /api/attendance/event/:eventId
 */
router.get(
  "/event/:eventId",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  getEventStaffAttendance
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