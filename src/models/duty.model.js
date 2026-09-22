const mongoose = require("mongoose");

const dutySchema = new mongoose.Schema(
  {
    // Event / Booking
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Event is required"],
    },

    // Assigned staff member
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Staff member is required"],
    },

    // What is the staff member's responsibility?
    dutyTitle: {
      type: String,
      required: [true, "Duty title is required"],
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    // Example: Event Manager, Technical Crew, Catering Staff
    role: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    dutyDate: {
      type: Date,
      required: [true, "Duty date is required"],
    },

    startTime: {
      type: String,
      required: [true, "Start time is required"],
      trim: true,
    },

    endTime: {
      type: String,
      required: [true, "End time is required"],
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "ASSIGNED",
        "ACCEPTED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "ASSIGNED",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    checklist: [
      {
        text: { type: String, required: true },
        completed: { type: Boolean, default: false },
      },
    ],

    // Manager who assigned this duty
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Assigned by is required"],
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Useful for:
 * - Finding all staff assigned to an event
 * - Checking whether a staff member is already assigned
 */
dutySchema.index({
  event: 1,
  staff: 1,
});

/**
 * Useful for:
 * - Staff schedule
 * - Finding a staff member's duties by date
 */
dutySchema.index({
  staff: 1,
  dutyDate: 1,
});

/**
 * Useful for manager schedule/calendar
 */
dutySchema.index({
  dutyDate: 1,
  status: 1,
});

module.exports = mongoose.model("Duty", dutySchema);