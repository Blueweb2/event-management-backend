const express = require("express");

const {
  register,
  login,
  getMe,
} = require("../controllers/auth.controller");

const { authenticate } = require("../middlewares/auth.middleware");

const router = express.Router();

/**
 * Public routes
 */

// Register
router.post("/register", register);

// Login
router.post("/login", login);

/**
 * Protected routes
 */

// Get currently logged-in user
router.get("/me", authenticate, getMe);

module.exports = router;