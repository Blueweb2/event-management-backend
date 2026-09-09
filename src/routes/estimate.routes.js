const express = require("express");

const {
  createEstimateController,
  getEstimatesController,
  getEstimateByIdController,
  updateEstimateStatusController,
} = require("../controllers/estimate.controller");

const router = express.Router();

// ==========================================
// CREATE ESTIMATE
// POST /api/estimates
// ==========================================

router.post("/", createEstimateController);

// ==========================================
// GET ALL ESTIMATES
// GET /api/estimates
// ==========================================

router.get("/", getEstimatesController);

// ==========================================
// GET SINGLE ESTIMATE
// GET /api/estimates/:id
// ==========================================

router.get(
  "/:id",
  getEstimateByIdController
);

// ==========================================
// UPDATE ESTIMATE STATUS
// PATCH /api/estimates/:id/status
// ==========================================

router.patch(
  "/:id/status",
  updateEstimateStatusController
);

module.exports = router;