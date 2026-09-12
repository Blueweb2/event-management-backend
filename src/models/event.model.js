const mongoose = require("mongoose");

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

eventSchema.index({
  booking: 1,
});

module.exports = mongoose.model("Event", eventSchema);