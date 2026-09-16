const express = require("express");

const {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
} = require("../controllers/user.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const router = express.Router();

/**
 * Protected routes
 */

// Get my profile
router.get("/me", authenticate, getMyProfile);

// Update my profile
router.put("/me", authenticate, updateMyProfile);
router.patch("/me/password", authenticate, changeMyPassword);

module.exports = router;