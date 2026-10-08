const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema(
  {
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
    stockItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockItem",
      required: [true, "Stock item is required"],
    },
    eventStock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventStock",
      default: null,
    },
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Assigned staff is required"],
    },
    expectedQuantity: {
      type: Number,
      required: [true, "Expected quantity is required"],
      min: 0,
    },
    takenQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    returnedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    damagedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    lostQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "ASSIGNED",
        "TAKEN",
        "IN_USE",
        "RETURN_PENDING",
        "RETURNED",
        "VERIFIED",
        "DISCREPANCY",
        "CLOSED",
      ],
      default: "ASSIGNED",
    },
    expectedReturnAt: {
      type: Date,
      default: null,
    },
    managerNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    takenAt: {
      type: Date,
      default: null,
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    takenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    takeNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    returnNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    damagedReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    lostReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    discrepancyNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    resolutionNotes: {
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

stockMovementSchema.index({ event: 1, assignedStaff: 1 });
stockMovementSchema.index({ assignedStaff: 1, status: 1 });
stockMovementSchema.index({ status: 1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
