const mongoose = require("mongoose");

const availabilitySchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Staff member is required"],
    },

    date: {
      type: Date,
      required: [true, "Availability date is required"],
    },

    status: {
      type: String,
      enum: [
        "AVAILABLE",
        "ON_LEAVE",
        "UNAVAILABLE",
      ],
      required: true,
      default: "AVAILABLE",
    },

    startTime: {
      type: String,
      trim: true,
      default: "",
    },

    endTime: {
      type: String,
      trim: true,
      default: "",
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
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * One availability record per staff member per day.
 */
availabilitySchema.index(
  {
    staff: 1,
    date: 1,
  },
  {
    unique: true,
  }
);

/**
 * Useful for manager availability calendar
 */
availabilitySchema.index({
  date: 1,
  status: 1,
});

module.exports = mongoose.model(
  "Availability",
  availabilitySchema
);