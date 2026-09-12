const express = require("express");

const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  updateEventStatus,
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

// Cancel event
router.delete(
  "/:id",
  authenticate,
  authorize("Manager"),
  cancelEvent
);

module.exports = router;