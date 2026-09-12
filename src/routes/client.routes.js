const express = require("express");

const {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deactivateClient,
  activateClient,
} = require("../controllers/client.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

// ==========================================
// Client Routes
// ==========================================

// Create client
router.post(
  "/",
  authenticate,
  authorize("Manager"),
  createClient
);

// Get all clients
router.get(
  "/",
  authenticate,
  authorize("Manager", "Staff"),
  getClients
);

// Get client by ID
router.get(
  "/:id",
  authenticate,
  authorize("Manager", "Staff"),
  getClientById
);

// Update client
router.put(
  "/:id",
  authenticate,
  authorize("Manager"),
  updateClient
);

// Deactivate client
router.delete(
  "/:id",
  authenticate,
  authorize("Manager"),
  deactivateClient
);

// Activate client
router.patch(
  "/:id/activate",
  authenticate,
  authorize("Manager"),
  activateClient
);

module.exports = router;