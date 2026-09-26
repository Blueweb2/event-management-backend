const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    // ==========================================
    // Client Details
    // ==========================================

    name: {
      type: String,
      required: [true, "Client name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    phone: {
      type: String,
      required: [true, "Client phone is required"],
      trim: true,
      maxlength: 30,
    },

    email: {
      type: String,
      required: [true, "Client email is required"],
      lowercase: true,
      trim: true,
      maxlength: 150,
    },

    alternatePhone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },

    // ==========================================
    // Address
    // ==========================================

    address: {
      type: String,
      trim: true,
      default: "",
      maxlength: 300,
    },

    city: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    state: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    country: {
      type: String,
      trim: true,
      default: "India",
      maxlength: 100,
    },

    // ==========================================
    // Additional Information
    // ==========================================

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },

    referralSource: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },

    // ==========================================
    // Client Status
    // ==========================================

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
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

clientSchema.index({
  phone: 1,
});

clientSchema.index({
  email: 1,
});

clientSchema.index({
  status: 1,
});

clientSchema.index({
  createdBy: 1,
});

module.exports = mongoose.model("Client", clientSchema);