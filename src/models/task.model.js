const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    // The duty this task belongs to
    duty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Duty",
      required: [true, "Duty is required"],
    },

    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      minlength: 2,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    dueDate: {
      type: Date,
      required: [true, "Task due date is required"],
    },

    dueTime: {
      type: String,
      trim: true,
      default: "",
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "PENDING",
    },

    completedAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by is required"],
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Staff task list
 */
taskSchema.index({
  duty: 1,
  status: 1,
});

/**
 * Useful for task/date queries
 */
taskSchema.index({
  dueDate: 1,
  status: 1,
});

module.exports = mongoose.model("Task", taskSchema);