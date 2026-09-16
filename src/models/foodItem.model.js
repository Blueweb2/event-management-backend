const mongoose = require("mongoose");

const foodItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Food item name is required"],
      trim: true,
    },

    category: {
      type: String,
      required: [true, "Food category is required"],
      enum: [
        "Welcome Drinks",
        "Starters / Appetizers",
        "Main Course",
        "Breads & Rice",
        "Desserts & Sweets",
        "Live Counters",
        "Beverages",
        "Salads & Soups",
      ],
      trim: true,
    },

    dietary: {
      type: String,
      required: [true, "Dietary classification is required"],
      enum: ["veg", "non-veg", "vegan", "egg"],
      default: "veg",
    },

    defaultRate: {
      type: Number,
      required: [true, "Default rate is required"],
      min: [0, "Rate cannot be negative"],
      default: 0,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },

    isPopular: {
      type: Boolean,
      default: false,
    },

    active: {
      type: Boolean,
      default: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

foodItemSchema.index({ category: 1, active: 1 });
foodItemSchema.index({ name: 1 });

module.exports = mongoose.model("FoodItem", foodItemSchema);
