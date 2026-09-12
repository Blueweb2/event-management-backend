const express = require("express");

const {
  createBooking,
  confirmBooking,
} = require("../controllers/booking.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

// ==========================================
// Booking Routes
// ==========================================

// Create booking
// Public booking form can submit a booking
router.post(
  "/",
  createBooking
);

// ==========================================
// Confirm Booking
// ==========================================

// Only Manager can confirm a booking
//
// Pending Booking
//      ↓
// Confirm
//      ↓
// Booking = Confirmed
//      ↓
// Event automatically created

router.patch(
  "/:id/confirm",
  authenticate,
  authorize("Manager"),
  confirmBooking
);

module.exports = router;