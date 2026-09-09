const express = require("express");

const {
  getAllEvents,
  getEventStats,
  getEventById,
  createEvent,
  updateEvent,
  updateEventStatus,
  deleteEvent,
  assignStaff,
  getMyEvents,
} = require("../controllers/event.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const {
  authorize,
} = require("../middlewares/role.middleware");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Staff Routes
|--------------------------------------------------------------------------
*/

// Get events assigned to logged-in staff
// GET /api/events/my-events
router.get(
  "/my-events",
  authenticate,
  getMyEvents
);


/*
|--------------------------------------------------------------------------
| Manager/Admin Routes
|--------------------------------------------------------------------------
*/

// Get all events
// GET /api/events
router.get(
  "/",
  authenticate,
  authorize("admin"),
  getAllEvents
);

// Get event statistics
// GET /api/events/stats
router.get(
  "/stats",
  authenticate,
  authorize("admin"),
  getEventStats
);

// Get single event
// GET /api/events/:id
router.get(
  "/:id",
  authenticate,
  authorize("admin"),
  getEventById
);

// Create event
// POST /api/events
router.post(
  "/",
  authenticate,
  authorize("admin"),
  createEvent
);

// Update event
// PUT /api/events/:id
router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  updateEvent
);

// Update event status
// PATCH /api/events/:id/status
router.patch(
  "/:id/status",
  authenticate,
  authorize("admin"),
  updateEventStatus
);

// Assign staff to event
// PUT /api/events/:id/staff
router.put(
  "/:id/staff",
  authenticate,
  authorize("admin"),
  assignStaff
);

// Delete event
// DELETE /api/events/:id
router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  deleteEvent
);

module.exports = router;