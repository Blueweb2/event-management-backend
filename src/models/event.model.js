const mongoose = require("mongoose");

const eventStaffSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Confirmed"],
      default: "Pending",
    },
  },
  {
    _id: false,
  }
);

const eventSchema = new mongoose.Schema(
  {
    // Event name
    name: {
      type: String,
      required: [true, "Event name is required"],
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    // Event type
    type: {
      type: String,
      required: [true, "Event type is required"],
      trim: true,
      maxlength: 100,
    },

    // Customer who booked the event
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    // Event date
    date: {
      type: Date,
      required: [true, "Event date is required"],
    },

    // Event time
    time: {
      type: String,
      required: [true, "Event time is required"],
      trim: true,
    },

    // Event location
    location: {
      type: String,
      required: [true, "Event location is required"],
      trim: true,
      maxlength: 200,
    },

    // Number of guests
    guests: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Package selected by customer
    package: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },

    // Event amount
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Overall event status
    status: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Completed",
        "Cancelled",
      ],
      default: "Pending",
    },

    // Additional event information
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    // Staff assigned to this event
    assignedStaff: {
      type: [eventStaffSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Event", eventSchema);