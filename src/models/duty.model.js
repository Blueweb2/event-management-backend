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
        "REJECTED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "ASSIGNED",
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    department: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    serviceName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },

    respondedAt: {
      type: Date,
      default: null,
    },

    hourlyRate: {
      type: Number,
      default: 0,
      min: [0, "Salary per hour cannot be negative"],
    },

    totalHours: {
      type: Number,
      default: 0,
      min: [0, "Total hours cannot be negative"],
    },

    totalAmount: {
      type: Number,
      default: 0,
      min: [0, "Total amount cannot be negative"],
    },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "PROCESSING"],
      default: "PENDING",
    },

    paidAt: {
      type: Date,
      default: null,
    },

    paymentReference: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
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

    tasks: [
      {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: "" },
        plannedStartAt: { type: Date, default: null },
        plannedEndAt: { type: Date, default: null },
        actualStartAt: { type: Date, default: null },
        actualEndAt: { type: Date, default: null },
        status: {
          type: String,
          enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "SKIPPED"],
          default: "PENDING",
        },
        completionNotes: { type: String, trim: true, default: "" },
        startedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        completedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        wasOverdue: { type: Boolean, default: false },
        delayMinutes: { type: Number, default: 0 },
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