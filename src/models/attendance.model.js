const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    // Staff assignment
    duty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Duty",
      required: [true, "Duty is required"],
    },

    // Staff member
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Staff member is required"],
    },

    // Event / Booking
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Event is required"],
    },

    date: {
      type: Date,
      required: [true, "Attendance date is required"],
    },

    checkIn: {
      type: Date,
      default: null,
    },

    checkOut: {
      type: Date,
      default: null,
    },

    isPaused: {
      type: Boolean,
      default: false,
    },

    pausedAt: {
      type: Date,
      default: null,
    },

    totalPauseMinutes: {
      type: Number,
      default: 0,
    },

    activeMinutes: {
      type: Number,
      default: 0,
    },

    totalHours: {
      type: Number,
      default: 0,
    },

    sessions: [
      {
        type: {
          type: String,
          enum: ["CLOCK_IN", "PAUSE", "RESUME", "CLOCK_OUT"],
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        reason: {
          type: String,
          default: "",
        },
        notes: {
          type: String,
          default: "",
        },
      },
    ],

    pauseHistory: [
      {
        pausedAt: Date,
        resumedAt: Date,
        durationMinutes: Number,
        reason: String,
      },
    ],

    status: {
      type: String,
      enum: [
        "PRESENT",
        "LATE",
        "ABSENT",
      ],
      default: "PRESENT",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * One attendance record for one duty.
 */
attendanceSchema.index(
  {
    duty: 1,
  },
  {
    unique: true,
  }
);

/**
 * Useful for staff attendance history
 */
attendanceSchema.index({
  staff: 1,
  date: 1,
});

/**
 * Useful for manager attendance screen
 */
attendanceSchema.index({
  event: 1,
  date: 1,
});

module.exports = mongoose.model(
  "Attendance",
  attendanceSchema
);