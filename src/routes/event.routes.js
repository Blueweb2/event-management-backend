const express = require("express");

const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  updateEventStatus,
  startEvent,
  getActivityTimeline,
  cancelEvent,
} = require("../controllers/event.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

// ==========================================
// Event Routes
// ==========================================

// Create event from confirmed booking
router.post(
  "/",
  authenticate,
  authorize("Manager"),
  createEvent
);

// Get all events
router.get(
  "/",
  authenticate,
  authorize("Manager", "Staff"),
  getEvents
);

// Get event by ID
router.get(
  "/:id",
  authenticate,
  authorize("Manager", "Staff"),
  getEventById
);

// Get event activity operational timeline
router.get(
  "/:id/activity-timeline",
  authenticate,
  authorize("Manager", "Staff"),
  getActivityTimeline
);

// Update event details
router.put(
  "/:id",
  authenticate,
  authorize("Manager"),
  updateEvent
);

// Update event status
router.patch(
  "/:id/status",
  authenticate,
  authorize("Manager"),
  updateEventStatus
);

// Start event (Manager action on event date)
router.patch(
  "/:id/start",
  authenticate,
  authorize("Manager"),
  startEvent
);

// Cancel event
router.delete(
  "/:id",
  authenticate,
  authorize("Manager"),
  cancelEvent
);

module.exports = router;