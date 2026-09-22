const express = require("express");
const {
  getEventStaffingRequirements,
  getDepartmentDateAvailability,
} = require("../controllers/department.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

/**
 * GET /api/departments/event-staffing/:eventId
 */
router.get(
  "/event-staffing/:eventId",
  authenticate,
  authorize("admin", "Manager"),
  getEventStaffingRequirements
);

/**
 * GET /api/departments/availability?date=YYYY-MM-DD
 */
router.get(
  "/availability",
  authenticate,
  authorize("admin", "Manager"),
  getDepartmentDateAvailability
);

module.exports = router;
