const mongoose = require("mongoose");

const eventStockSchema = new mongoose.Schema(
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
    requiredQuantity: {
      type: Number,
      required: [true, "Required quantity is required"],
      min: [1, "Required quantity must be at least 1"],
    },
    reservedQuantity: {
      type: Number,
      default: 0,
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
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "PLANNED",
        "RESERVED",
        "READY_FOR_COLLECTION",
        "TAKEN_BY_STAFF",
        "AT_EVENT",
        "RETURN_PENDING",
        "RETURNED",
        "VERIFIED",
        "DISCREPANCY",
        "CLOSED",
      ],
      default: "PLANNED",
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
    expectedReturnAt: {
      type: Date,
      default: null,
    },
    approvedReturnedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    approvedDamagedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    approvedLostQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    managerNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
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
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

eventStockSchema.index({ event: 1, stockItem: 1 });
eventStockSchema.index({ assignedStaff: 1, status: 1 });
eventStockSchema.index({ status: 1 });

module.exports = mongoose.model("EventStock", eventStockSchema);
