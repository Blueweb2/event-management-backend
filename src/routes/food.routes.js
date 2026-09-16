const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const {
  getFoodItemsController,
  getFoodItemByIdController,
  uploadFoodImageController,
  createFoodItemController,
  updateFoodItemController,
  deleteFoodItemController,
} = require("../controllers/food.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

const uploadDirectory = path.join(__dirname, "../../uploads/food");
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `food-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
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

// GET all food items (Available for booking & manager)
router.get("/", getFoodItemsController);

// GET single item
router.get("/:id", getFoodItemByIdController);

// Protected routes (Manager only)
router.post(
  "/upload",
  authenticate,
  authorize("Manager"),
  upload.single("image"),
  uploadFoodImageController
);

router.post(
  "/",
  authenticate,
  authorize("Manager"),
  createFoodItemController
);

router.put(
  "/:id",
  authenticate,
  authorize("Manager"),
  updateFoodItemController
);

router.delete(
  "/:id",
  authenticate,
  authorize("Manager"),
  deleteFoodItemController
);

module.exports = router;
