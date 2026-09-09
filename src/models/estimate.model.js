const mongoose = require("mongoose");

// ==========================================
// Estimate Item Snapshot
// ==========================================

const estimateItemSchema = new mongoose.Schema(
  {
    // ========================================
    // Service Reference
    // ========================================

    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },

    optionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    optionName: {
      type: String,
      default: null,
      trim: true,
    },

    // ========================================
    // Service Snapshot
    // ========================================

    /*
     * These values are copied from the Service
     * at the time the estimate is created.
     *
     * This protects historical estimates from
     * future service changes.
     */

    serviceName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    // ========================================
    // Pricing Configuration Snapshot
    // ========================================

    /*
     * Pricing architecture:
     *
     * PER_GUEST → guest count
     * PER_UNIT  → number of units
     * PER_HOUR  → number of hours
     * PER_DAY   → number of days
     * PER_STAFF → number of staff
     * PER_REEL  → number of reels
     */

    pricingType: {
      type: String,
      enum: [
        "PER_GUEST",
        "PER_UNIT",
        "PER_HOUR",
        "PER_DAY",
        "PER_STAFF",
        "PER_REEL",
      ],
      required: true,
    },

    unitLabel: {
      type: String,
      default: "",
      trim: true,
    },

    // ========================================
    // Quantity Snapshot
    // ========================================

    /*
     * Meaning depends on pricingType:
     *
     * PER_GUEST → number of guests
     * PER_UNIT  → number of units
     * PER_HOUR  → number of hours
     * PER_DAY   → number of days
     * PER_STAFF → number of staff
     * PER_REEL  → number of reels
     */

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    // ========================================
    // Price Snapshot
    // ========================================

    /*
     * IMPORTANT:
     *
     * This price is calculated by the backend
     * from the Service collection.
     *
     * Frontend-provided prices are never trusted.
     *
     * Once saved, this price remains unchanged
     * even if Admin changes the service price later.
     */

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // ========================================
    // Line Total
    // ========================================

    /*
     * quantity × unitPrice
     */

    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: true,
  }
);

// ==========================================
// Estimate Schema
// ==========================================

const estimateSchema = new mongoose.Schema(
  {
    // ========================================
    // Estimate Number
    // ========================================

    estimateNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // ========================================
    // Event Details
    // ========================================

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

    location: {
      type: String,
      required: [true, "Event location is required"],
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      required: [true, "Event description is required"],
      trim: true,
      maxlength: 2000,
    },

    // ========================================
    // Client Details
    // ========================================

    client: {
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
        trim: true,
        lowercase: true,
        maxlength: 150,
      },

      message: {
        type: String,
        default: "",
        trim: true,
        maxlength: 1000,
      },
    },

    // ========================================
    // Services / Estimate Items
    // ========================================

    items: {
      type: [estimateItemSchema],
      required: true,

      validate: {
        validator: (items) =>
          Array.isArray(items) &&
          items.length > 0,

        message:
          "At least one service is required",
      },
    },

    // ========================================
    // Pricing
    // ========================================

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    // ========================================
    // Discount
    // ========================================

    discount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },

    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ========================================
    // Additional Charges
    // ========================================

    additionalCharges: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    // ========================================
    // Tax / GST
    // ========================================

    /*
     * GST is calculated by the backend.
     *
     * We store both the rate and amount so that
     * historical estimates remain accurate even
     * if the GST configuration changes later.
     */

    gstRate: {
      type: Number,
      required: true,
      min: 0,
      default: 18,
    },

    gstAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ========================================
    // Final Total
    // ========================================

    /*
     * Grand total:
     *
     * subtotal
     * - discount
     * + GST
     * + additional charges
     */

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    // ========================================
    // Currency
    // ========================================

    currency: {
      type: String,
      default: "INR",
      trim: true,
      uppercase: true,
    },

    // ========================================
    // Estimate Status
    // ========================================

    status: {
      type: String,
      enum: [
        "DRAFT",
        "SENT",
        "VIEWED",
        "ACCEPTED",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
      ],
      default: "DRAFT",
    },

    // ========================================
    // Created By
    // ========================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ========================================
    // Status Dates
    // ========================================

    sentAt: {
      type: Date,
      default: null,
    },

    viewedAt: {
      type: Date,
      default: null,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
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

estimateSchema.index({
  status: 1,
});

estimateSchema.index({
  "client.email": 1,
});

estimateSchema.index({
  eventDate: 1,
});

estimateSchema.index({
  createdBy: 1,
});

estimateSchema.index({
  createdAt: -1,
});

// ==========================================
// Model
// ==========================================

module.exports = mongoose.model(
  "Estimate",
  estimateSchema
);