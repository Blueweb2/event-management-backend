const mongoose = require("mongoose");

const stockTransactionSchema = new mongoose.Schema(
  {
    stockItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockItem",
      required: [true, "Stock item is required"],
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    movement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockMovement",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "CREATED",
        "ADDED",
        "ADJUSTED",
        "RESERVED",
        "UNRESERVED",
        "TAKEN",
        "RETURNED",
        "DAMAGED",
        "LOST",
        "VERIFIED",
        "DISCREPANCY_RESOLVED",
      ],
      required: [true, "Transaction type is required"],
    },
    quantity: {
      type: Number,
      required: true,
    },
    previousAvailable: {
      type: Number,
      default: 0,
    },
    newAvailable: {
      type: Number,
      default: 0,
    },
    previousTotal: {
      type: Number,
      default: 0,
    },
    newTotal: {
      type: Number,
      default: 0,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

stockTransactionSchema.index({ stockItem: 1, createdAt: -1 });
stockTransactionSchema.index({ event: 1 });
stockTransactionSchema.index({ type: 1 });

module.exports = mongoose.model("StockTransaction", stockTransactionSchema);
