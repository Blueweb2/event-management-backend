const express = require("express");

const {
  getFoodItemsController,
  getFoodItemByIdController,
  createFoodItemController,
  updateFoodItemController,
  deleteFoodItemController,
} = require("../controllers/food.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

// GET all food items (Available for booking & manager)
router.get("/", getFoodItemsController);

// GET single item
router.get("/:id", getFoodItemByIdController);

// Protected routes (Manager only)
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
