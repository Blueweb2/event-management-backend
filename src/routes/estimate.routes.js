const express = require("express");

const {
  createEstimateController,
  getEstimatesController,
  getEstimateByIdController,
  updateEstimateStatusController,
  convertEstimateToBookingController,
} = require("../controllers/estimate.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

// ==========================================
// CREATE ESTIMATE
// POST /api/estimates
// Public — booking form submits without auth
// ==========================================

router.post("/", createEstimateController);

// ==========================================
// GET ALL ESTIMATES
// GET /api/estimates
// ==========================================

router.get(
  "/",
  authenticate,
  authorize("Manager"),
  getEstimatesController
);

// ==========================================
// GET SINGLE ESTIMATE
// GET /api/estimates/:id
// ==========================================

router.get(
  "/:id",
  authenticate,
  authorize("Manager"),
  getEstimateByIdController
);

// ==========================================
// UPDATE ESTIMATE STATUS
// PATCH /api/estimates/:id/status
// ==========================================

router.patch(
  "/:id/status",
  authenticate,
  authorize("Manager"),
  updateEstimateStatusController
);

// ==========================================
// CONVERT ESTIMATE → BOOKING + EVENT
// POST /api/estimates/:id/convert
//
// Takes an ACCEPTED estimate and creates a
// Confirmed Booking + Upcoming Event in one shot.
// ==========================================

router.post(
  "/:id/convert",
  authenticate,
  authorize("Manager"),
  convertEstimateToBookingController
);

module.exports = router;