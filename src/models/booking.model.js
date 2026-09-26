const mongoose = require("mongoose");

// ==========================================
// Booking Service Snapshot
// ==========================================

const bookingServiceSchema = new mongoose.Schema(
  {
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },

    optionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ==========================================
    // Service Snapshot
    // ==========================================

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

    // Meaning depends on pricingType:
    //
    // FIXED      → 1
    // PER_GUEST  → number of guests
    // PER_UNIT   → number of units
    // PER_HOUR   → number of hours
    // PER_DAY    → number of days
    // PER_STAFF  → number of staff
    // PER_REEL   → number of reels

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    pricingType: {
      type: String,
      enum: [
        "FIXED",
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

    // ==========================================
    // Price Snapshot
    // ==========================================

    // Price taken from Service / Service Option
    // at the time of booking.

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // quantity × unitPrice
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
// Food Menu Snapshot Schema
// ==========================================

const foodMenuItemSnapshotSchema = new mongoose.Schema(
  {
    foodItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodItem",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    dietary: {
      type: String,
      enum: ["veg", "non-veg", "vegan", "egg"],
      default: "veg",
    },
    rate: {
      type: Number,
      default: 0,
      min: 0,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    _id: true,
  }
);

const foodMenuSchema = new mongoose.Schema(
  {
    included: {
      type: Boolean,
      default: false,
    },
    servingType: {
      type: String,
      enum: ["PER_GUEST", "PER_PLATE", "FIXED"],
      default: "PER_GUEST",
    },
    ratePerGuest: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalFoodAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    items: {
      type: [foodMenuItemSnapshotSchema],
      default: [],
    },
  },
  {
    _id: false,
  }
);

// ==========================================
// Payment Log Schema
// ==========================================

const paymentLogSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Bank Transfer", "UPI / GPay", "Credit/Debit Card", "Cheque", "Other"],
      default: "Cash",
    },
    transactionId: {
      type: String,
      default: "",
      trim: true,
    },
    paymentType: {
      type: String,
      enum: ["ADVANCE", "INSTALLMENT", "FINAL_BALANCE"],
      default: "ADVANCE",
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    recordedBy: {
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
// Booking
// ==========================================

const bookingSchema = new mongoose.Schema(
  {
    foodMenu: {
      type: foodMenuSchema,
      default: () => ({
        included: false,
        servingType: "PER_GUEST",
        ratePerGuest: 0,
        totalFoodAmount: 0,
        notes: "",
        items: [],
      }),
    },
    // ==========================================
    // Client
    // ==========================================

    // Reference to the actual Client record.
    //
    // Booking no longer stores:
    // name
    // phone
    // email
    //
    // Those details come from the Client model.

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: [true, "Client is required"],
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

    // ==========================================
    // Booking Message
    // ==========================================

    message: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    referralSource: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },

    // ==========================================
    // Selected Services
    // ==========================================

    services: {
      type: [bookingServiceSchema],
      required: true,

      validate: {
        validator: (value) =>
          Array.isArray(value) && value.length > 0,

        message: "At least one service must be selected",
      },
    },

    // ==========================================
    // Pricing
    // ==========================================

    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },

    discountValue: {
      type: Number,
      min: 0,
      default: 0,
    },

    discountAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    additionalCharges: {
      type: Number,
      min: 0,
      default: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    // ==========================================
    // Booking Status
    // ==========================================

    status: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Rejected",
        "Cancelled",
      ],
      default: "Pending",
    },

    // ==========================================
    // Client Advance Payment & Payment History
    // ==========================================

    advancePayment: {
      type: Number,
      default: 0,
      min: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID", "REFUNDED"],
      default: "UNPAID",
    },

    paymentHistory: {
      type: [paymentLogSchema],
      default: [],
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

bookingSchema.index({
  client: 1,
});

bookingSchema.index({
  eventDate: 1,
});

bookingSchema.index({
  status: 1,
});

bookingSchema.index({
  createdBy: 1,
});

module.exports = mongoose.model("Booking", bookingSchema);