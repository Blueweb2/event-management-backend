const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // ==========================================
    // BASIC INFORMATION
    // ==========================================

    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [
        /^[a-z0-9._-]+$/,
        "Username can only contain letters, numbers, dots, underscores and hyphens",
      ],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 150,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },

    location: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },

    // ==========================================
    // EMPLOYEE INFORMATION
    // ==========================================

    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      maxlength: 30,
    },

    department: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    // ==========================================
    // EMPLOYMENT
    // ==========================================

    employmentType: {
      type: String,
      enum: [
        "full-time",
        "part-time",
        "contract",
        "temporary",
      ],
      default: "full-time",
    },

    // ==========================================
    // ROLE
    // ==========================================

    role: {
      type: String,
      enum: ["admin", "manager", "staff"],
      default: "staff",
    },

    // ==========================================
    // PASSWORD
    // ==========================================

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },

    // ==========================================
    // ACCOUNT STATUS
    // ==========================================

    isActive: {
      type: Boolean,
      default: true,
    },

    // ==========================================
    // EMERGENCY CONTACT
    // ==========================================

    emergencyContact: {
      name: {
        type: String,
        trim: true,
        default: "",
        maxlength: 100,
      },

      phone: {
        type: String,
        trim: true,
        default: "",
        maxlength: 30,
      },

      relationship: {
        type: String,
        trim: true,
        default: "",
        maxlength: 50,
      },
    },

    // ==========================================
    // CREATED BY
    // ==========================================
    // Useful when a manager/admin creates
    // a staff account.

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
// INDEXES
// ==========================================

// Staff/admin filtering
userSchema.index({
  role: 1,
  isActive: 1,
});

// Staff department filtering
userSchema.index({
  department: 1,
  isActive: 1,
});

// Staff location filtering
userSchema.index({
  location: 1,
  isActive: 1,
});

// Accounts created by a particular manager/admin
userSchema.index({
  createdBy: 1,
});

module.exports = mongoose.model("User", userSchema);