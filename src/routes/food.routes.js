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

// Department restriction: Only Kitchen/Catering managers or Super Admin can mutate food items
const requireFoodManageAccess = (req, res, next) => {
  const role = (req.user?.role || "").toLowerCase();
  if (role === "superadmin" || role === "admin") return next();
  const dept = (req.user?.department || "").toLowerCase();
  if (
    dept.includes("kitchen") ||
    dept.includes("catering") ||
    dept.includes("chef") ||
    dept.includes("cook") ||
    dept.includes("food") ||
    dept.includes("operation")
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Access denied: Food catalog management is restricted to Kitchen Department and Super Admin",
  });
};

// Protected routes (Manager only)
router.post(
  "/upload",
  authenticate,
  authorize("Manager"),
  requireFoodManageAccess,
  upload.single("image"),
  uploadFoodImageController
);

router.post(
  "/",
  authenticate,
  authorize("Manager"),
  requireFoodManageAccess,
  createFoodItemController
);

router.put(
  "/:id",
  authenticate,
  authorize("Manager"),
  requireFoodManageAccess,
  updateFoodItemController
);

router.delete(
  "/:id",
  authenticate,
  authorize("Manager"),
  requireFoodManageAccess,
  deleteFoodItemController
);

module.exports = router;
