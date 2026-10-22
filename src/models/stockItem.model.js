const mongoose = require("mongoose");

const stockItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Stock item name is required"],
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: [
        "Crockery",
        "Glassware",
        "Cutlery",
        "Furniture",
        "Audio/Visual",
        "Linen",
        "Kitchen Equipment",
        "Decor",
        "Lighting",
        "Raw Ingredients",
        "Kitchen Supplies",
        "Other",
      ],
      default: "Other",
    },
    stockType: {
      type: String,
      enum: ["kitchen", "rentable"],
      default: function () {
        return ["Raw Ingredients", "Kitchen Supplies", "Kitchen Equipment"].includes(this.category)
          ? "kitchen"
          : "rentable";
      },
    },
    totalQuantity: {
      type: Number,
      required: [true, "Total quantity is required"],
      min: [0, "Total quantity cannot be negative"],
      default: 0,
    },
    availableQuantity: {
      type: Number,
      required: [true, "Available quantity is required"],
      min: [0, "Available quantity cannot be negative"],
      default: 0,
    },
    reservedQuantity: {
      type: Number,
      min: [0, "Reserved quantity cannot be negative"],
      default: 0,
    },
    inUseQuantity: {
      type: Number,
      min: [0, "In-use quantity cannot be negative"],
      default: 0,
    },
    damagedQuantity: {
      type: Number,
      min: [0, "Damaged quantity cannot be negative"],
      default: 0,
    },
    lostQuantity: {
      type: Number,
      min: [0, "Lost quantity cannot be negative"],
      default: 0,
    },
    minStockLevel: {
      type: Number,
      default: 10,
      min: [0, "Minimum stock level cannot be negative"],
    },
    unit: {
      type: String,
      trim: true,
      default: "pcs",
      maxlength: 30,
    },
    unitPrice: {
      type: Number,
      default: 0,
      min: [0, "Unit price cannot be negative"],
    },
    rentalPrice: {
      type: Number,
      default: 0,
      min: [0, "Rental price cannot be negative"],
    },
    isRentable: {
      type: Boolean,
      default: false,
    },
    location: {
      type: String,
      trim: true,
      default: "Central Warehouse",
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
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

stockItemSchema.pre("validate", function () {
  const KITCHEN_CATEGORIES = [
    "Raw Ingredients",
    "Kitchen Supplies",
    "Kitchen Equipment",
  ];
  const isKitchen =
    this.stockType === "kitchen" || KITCHEN_CATEGORIES.includes(this.category);

  if (isKitchen) {
    if (this.isRentable === true) {
      throw new Error(
        `Kitchen stock items (${this.category || "Kitchen"}) are for internal kitchen use only and cannot be marked as rentable.`
      );
    }
    this.stockType = "kitchen";
    this.isRentable = false;
    this.rentalPrice = 0;
  } else {
    this.stockType = "rentable";
    if (this.isRentable === undefined || this.isRentable === null) {
      this.isRentable = false;
    }
  }
});

stockItemSchema.index({ name: 1 });
stockItemSchema.index({ category: 1 });
stockItemSchema.index({ stockType: 1 });
stockItemSchema.index({ availableQuantity: 1 });
stockItemSchema.index({ isRentable: 1 });
stockItemSchema.index({ stockType: 1, isRentable: 1 });

module.exports = mongoose.model("StockItem", stockItemSchema);
