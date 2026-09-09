const express = require("express");

const {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
} = require("../controllers/service.controller");

const router = express.Router();

// ==========================================
// SERVICE ROUTES
// ==========================================

// Get all active services
// GET /api/services
router.get("/", getServices);

// Get a single service
// GET /api/services/:id
router.get("/:id", getServiceById);

// Create a new service
// POST /api/services
router.post("/", createService);

// Update a service
// PUT /api/services/:id
router.put("/:id", updateService);

// Deactivate a service
// DELETE /api/services/:id
router.delete("/:id", deleteService);

module.exports = router;