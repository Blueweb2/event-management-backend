const mongoose = require("mongoose");

const purchaseRequestItemSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
      maxlength: 150,
    },
    requiredQuantity: {
      type: Number,
      required: [true, "Required quantity is required"],
      min: 0,
    },
    availableQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    shortageQuantity: {
      type: Number,
      required: [true, "Shortage quantity is required"],
      min: 0,
    },
    unit: {
      type: String,
      trim: true,
      default: "pcs",
      maxlength: 30,
    },
    estimatedCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    urgency: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "HIGH",
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

const purchaseRequestSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: [true, "Department is required"],
      trim: true,
      maxlength: 100,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    items: {
      type: [purchaseRequestItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one item must be included in the purchase request",
      },
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "ORDERED", "FULFILLED", "REJECTED"],
      default: "PENDING",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Requested by is required"],
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

purchaseRequestSchema.index({ department: 1, status: 1 });
purchaseRequestSchema.index({ event: 1 });
purchaseRequestSchema.index({ requestedBy: 1 });
purchaseRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PurchaseRequest", purchaseRequestSchema);
