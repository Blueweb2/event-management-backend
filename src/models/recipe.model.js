const mongoose = require("mongoose");

const recipeIngredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Ingredient name is required"],
      trim: true,
      maxlength: 150,
    },
    quantityPerServing: {
      type: Number,
      required: [true, "Quantity per serving is required"],
      min: [0, "Quantity cannot be negative"],
    },
    unit: {
      type: String,
      required: [true, "Unit is required"],
      trim: true,
      default: "kg",
      maxlength: 30,
    },
    stockItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockItem",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
  },
  { _id: true }
);

const recipeStepSchema = new mongoose.Schema(
  {
    stepNumber: {
      type: Number,
      required: true,
    },
    instruction: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
  },
  { _id: true }
);

const recipeSchema = new mongoose.Schema(
  {
    foodItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodItem",
      required: [true, "Food item reference is required"],
      unique: true,
    },
    foodItemName: {
      type: String,
      required: [true, "Food item name is required"],
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: "Main Course",
    },
    yieldServings: {
      type: Number,
      default: 1,
      min: [1, "Yield servings must be at least 1"],
    },
    defaultWastagePercent: {
      type: Number,
      default: 5,
      min: [0, "Wastage percent cannot be negative"],
      max: [100, "Wastage percent cannot exceed 100"],
    },
    ingredients: {
      type: [recipeIngredientSchema],
      default: [],
    },
    preparationSteps: {
      type: [recipeStepSchema],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

recipeSchema.index({ foodItemName: 1 });
recipeSchema.index({ category: 1 });

module.exports = mongoose.model("Recipe", recipeSchema);
