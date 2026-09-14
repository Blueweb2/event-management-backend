const {
  getFoodItems,
  getFoodItemById,
  createFoodItem,
  updateFoodItem,
  deleteFoodItem,
} = require("../services/food.service");

// ==========================================
// GET FOOD ITEMS
// ==========================================

const getFoodItemsController = async (req, res) => {
  try {
    const { category, dietary, search, active } = req.query;

    const items = await getFoodItems({
      category,
      dietary,
      search,
      active,
    });

    return res.status(200).json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error("Get food items error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch food items",
    });
  }
};

// ==========================================
// GET FOOD ITEM BY ID
// ==========================================

const getFoodItemByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await getFoodItemById(id);

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Get food item error:", error);
    return res.status(404).json({
      success: false,
      message: error.message || "Food item not found",
    });
  }
};

// ==========================================
// CREATE FOOD ITEM
// ==========================================

const createFoodItemController = async (req, res) => {
  try {
    const userId = req.user?.userId || null;
    const item = await createFoodItem(req.body, userId);

    return res.status(201).json({
      success: true,
      message: "Food item created successfully",
      data: item,
    });
  } catch (error) {
    console.error("Create food item error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create food item",
    });
  }
};

// ==========================================
// UPDATE FOOD ITEM
// ==========================================

const updateFoodItemController = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await updateFoodItem(id, req.body);

    return res.status(200).json({
      success: true,
      message: "Food item updated successfully",
      data: item,
    });
  } catch (error) {
    console.error("Update food item error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update food item",
    });
  }
};

// ==========================================
// DELETE FOOD ITEM
// ==========================================

const deleteFoodItemController = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteFoodItem(id);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Delete food item error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to delete food item",
    });
  }
};

module.exports = {
  getFoodItemsController,
  getFoodItemByIdController,
  createFoodItemController,
  updateFoodItemController,
  deleteFoodItemController,
};
