const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const {
  createStaff,
  getStaff,
  getStaffById,
  updateStaff,
  uploadStaffAvatar,
  updateStaffStatus,
  resetStaffPassword,
} = require("../controllers/staff.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const {
  authorize,
} = require("../middlewares/role.middleware");

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
 * ==========================================
 * STAFF MANAGEMENT
 * ==========================================
 *
 * Admin only
 */

/**
 * Upload general staff photo
 * POST /api/users/staff/upload-avatar
 */
router.post(
  "/upload-avatar",
  authenticate,
  authorize("admin"),
  upload.single("avatar"),
  (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select an image file to upload",
        });
      }
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      return res.status(200).json({
        success: true,
        message: "Staff photo uploaded successfully",
        data: {
          avatarUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Upload & assign staff avatar
 * POST /api/users/staff/:id/avatar
 */
router.post(
  "/:id/avatar",
  authenticate,
  authorize("admin"),
  upload.single("avatar"),
  uploadStaffAvatar
);

/**
 * Create staff
 * POST /api/users/staff
 */
router.post(
  "/",
  authenticate,
  authorize("admin"),
  createStaff
);

/**
 * Get all staff
 * GET /api/users/staff
 */
router.get(
  "/",
  authenticate,
  authorize("admin"),
  getStaff
);

/**
 * Get staff by ID
 * GET /api/users/staff/:id
 */
router.get(
  "/:id",
  authenticate,
  authorize("admin"),
  getStaffById
);

/**
 * Update staff
 * PUT /api/users/staff/:id
 */
router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  updateStaff
);

/**
 * Activate / deactivate staff
 * PATCH /api/users/staff/:id/status
 */
router.patch(
  "/:id/status",
  authenticate,
  authorize("admin"),
  updateStaffStatus
);

/**
 * Reset staff password
 * PATCH /api/users/staff/:id/password
 */
router.patch(
  "/:id/password",
  authenticate,
  authorize("admin"),
  resetStaffPassword
);

module.exports = router;