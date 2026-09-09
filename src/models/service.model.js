const mongoose = require("mongoose");

const serviceOptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    price: {
      type: Number,
      required: true,
      min: 0,
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
      default: "FIXED",
    },

    unitLabel: {
      type: String,
      trim: true,
      default: "",
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true },
);

const serviceSchema = new mongoose.Schema(
  {
    name: {
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
      trim: true,
      default: "",
    },

    /**
     * How the main service is priced.
     */
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

    /**
     * Main/default price of the service.
     */
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    /**
     * Display unit.
     *
     * Examples:
     * guest
     * hour
     * day
     * person
     * reel
     * unit
     */
    unitLabel: {
      type: String,
      trim: true,
      default: "",
    },

    /**
     * Optional service variations.
     *
     * Example:
     *
     * Photography
     * ├── Photography Only
     * ├── Videography Only
     * └── Photography + Videography
     */
    options: {
      type: [serviceOptionSchema],
      default: [],
    },

    /**
     * Whether clients can currently select this service.
     */
    active: {
      type: Boolean,
      default: true,
    },

    /**
     * Controls the order in which services
     * appear in the admin/booking UI.
     */
    sortOrder: {
      type: Number,
      default: 0,
    },

    /**
     * Admin who created the service.
     *
     * We will connect this to User later.
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

serviceSchema.index({
  category: 1,
  active: 1,
});

serviceSchema.index({
  name: 1,
});

module.exports = mongoose.model(
  "Service",
  serviceSchema,
);