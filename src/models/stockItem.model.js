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
        "Other",
      ],
      default: "Other",
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

stockItemSchema.index({ name: 1 });
stockItemSchema.index({ category: 1 });
stockItemSchema.index({ availableQuantity: 1 });

module.exports = mongoose.model("StockItem", stockItemSchema);
