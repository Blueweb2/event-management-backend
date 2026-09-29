const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const {
  createService,
  getServices,
  getServiceById,
  getServiceLibraryImages,
  updateService,
  deleteService,
  uploadServiceImage,
} = require("../controllers/service.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

const uploadDirectory = path.join(__dirname, "../../uploads/services");
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `service-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
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

// ==========================================
// SERVICE ROUTES
// ==========================================

// Upload service image
// POST /api/services/upload
router.post(
  "/upload",
  authenticate,
  authorize("admin", "Manager"),
  upload.single("image"),
  uploadServiceImage
);

// Get library images (uploaded & existing service images)
// GET /api/services/library-images
router.get("/library-images", getServiceLibraryImages);

// Get all active services
// GET /api/services
router.get("/", getServices);

// Get a single service
// GET /api/services/:id
router.get("/:id", getServiceById);

// Create a new service
// POST /api/services
router.post("/", authenticate, authorize("admin", "Manager"), createService);

// Update a service
// PUT /api/services/:id
router.put("/:id", authenticate, authorize("admin", "Manager"), updateService);

// Deactivate a service
// DELETE /api/services/:id
router.delete("/:id", authenticate, authorize("admin", "Manager"), deleteService);

module.exports = router;