const express = require("express");

const {
  register,
  login,
  getMe,
  createManager,
  getManagers,
  updateManager,
  updateManagerStatus,
  bootstrapSuperAdmin,
} = require("../controllers/auth.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { requireSuperAdmin } = require("../middlewares/role.middleware");

const router = express.Router();

/**
 * Public routes
 */

// Register (forces role: "staff", blocks elevated role attempts)
router.post("/register", register);

// Login (supports all roles: superadmin, manager, staff, admin)
router.post("/login", login);

// One-time superadmin bootstrap (permanently locked down once 1 superadmin exists)
router.post("/bootstrap-superadmin", bootstrapSuperAdmin);

/**
 * Protected routes
 */

// Get currently logged-in user
router.get("/me", authenticate, getMe);

/**
 * Superadmin-only Manager Management routes
 */

// Create a new manager (server-enforced role: "manager")
router.post("/managers", authenticate, requireSuperAdmin, createManager);

// List all managers
router.get("/managers", authenticate, requireSuperAdmin, getManagers);

// Edit manager department, permissions, or profile
router.put("/managers/:id", authenticate, requireSuperAdmin, updateManager);
router.patch("/managers/:id", authenticate, requireSuperAdmin, updateManager);

// Toggle/update manager active status
router.patch("/managers/:id/status", authenticate, requireSuperAdmin, updateManagerStatus);

module.exports = router;