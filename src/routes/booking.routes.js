const express = require("express");

const {
  createBooking,
  confirmBooking,
  recordPayment,
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

router.patch(
  "/:id/confirm",
  authenticate,
  authorize("Manager"),
  confirmBooking
);

// ==========================================
// Record Payment / Advance Deposit
// ==========================================

router.post(
  "/:id/payments",
  authenticate,
  authorize("Manager"),
  recordPayment
);

module.exports = router;