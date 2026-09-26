const mongoose = require("mongoose");

const paymentLogSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Bank Transfer", "UPI / GPay", "Credit/Debit Card", "Cheque", "Other"],
      default: "Cash",
    },
    transactionId: {
      type: String,
      default: "",
      trim: true,
    },
    paymentType: {
      type: String,
      enum: ["ADVANCE", "INSTALLMENT", "FINAL_BALANCE"],
      default: "ADVANCE",
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const eventSchema = new mongoose.Schema(
  {
    // ==========================================
    // Client
    // ==========================================

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: [true, "Client is required"],
    },

    // ==========================================
    // Source Booking
    // ==========================================

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Booking is required"],
      unique: true,
    },

    // ==========================================
    // Event Details
    // ==========================================

    eventName: {
      type: String,
      required: [true, "Event name is required"],
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    eventType: {
      type: String,
      required: [true, "Event type is required"],
      trim: true,
      maxlength: 100,
    },

    eventDate: {
      type: Date,
      required: [true, "Event date is required"],
    },

    eventTime: {
      type: String,
      required: [true, "Event time is required"],
      trim: true,
    },

    guests: {
      type: Number,
      required: [true, "Number of guests is required"],
      min: 1,
    },

    // ==========================================
    // Location
    // ==========================================

    location: {
      type: String,
      required: [true, "Event location is required"],
      trim: true,
      maxlength: 200,
    },

    // ==========================================
    // Description
    // ==========================================

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },

    // ==========================================
    // Event Status
    // ==========================================

    status: {
      type: String,
      enum: [
        "Upcoming",
        "Ongoing",
        "Completed",
        "Cancelled",
      ],
      default: "Upcoming",
    },

    // ==========================================
    // Internal Notes
    // ==========================================

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },

    // ==========================================
    // Client Advance Payment & Payment History
    // ==========================================

    advancePayment: {
      type: Number,
      default: 0,
      min: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID", "REFUNDED"],
      default: "UNPAID",
    },

    paymentHistory: {
      type: [paymentLogSchema],
      default: [],
    },

    // ==========================================
    // Created By
    // ==========================================

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

// ==========================================
// Indexes
// ==========================================

eventSchema.index({
  eventDate: 1,
});

eventSchema.index({
  status: 1,
});

eventSchema.index({
  client: 1,
});

module.exports = mongoose.model("Event", eventSchema);