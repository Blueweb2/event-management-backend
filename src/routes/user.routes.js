const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const {
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
  changeMyPassword,
} = require("../controllers/user.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const router = express.Router();

const uploadDirectory = path.join(__dirname, "../../uploads/avatars");
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(
        null,
        `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`
      );
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      return callback(new Error("Only image files are allowed"));
    }
    callback(null, true);
  },
});

/**
 * Protected routes
 */

// Get my profile
router.get("/me", authenticate, getMyProfile);

// Update my profile
router.put("/me", authenticate, updateMyProfile);

// Upload my avatar photo
router.post(
  "/me/avatar",
  authenticate,
  upload.single("avatar"),
  uploadMyAvatar
);

router.patch("/me/password", authenticate, changeMyPassword);

module.exports = router;