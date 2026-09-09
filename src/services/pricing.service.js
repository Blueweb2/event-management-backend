
const Service = require("../models/service.model");

// ==========================================
// Constants
// ==========================================

const GST_RATE = 18;

// ==========================================
// Helpers
// ==========================================

const roundMoney = (value) =>
  Number(Number(value || 0).toFixed(2));

// ==========================================
// Calculate Single Service Item
// ==========================================

/**
 * Calculate the price for a single service item.
 *
 * IMPORTANT:
 * - Price always comes from MongoDB.
 * - Frontend unitPrice is NEVER trusted.
 * - Quantity is interpreted according to pricingType.
 *
 * Pricing types:
 *
 * FIXED      → quantity = 1
 * PER_GUEST  → quantity = guests
 * PER_UNIT   → quantity = quantity
 * PER_HOUR   → quantity = quantity
 * PER_DAY    → quantity = quantity
 * PER_STAFF  → quantity = quantity
 * PER_REEL   → quantity = quantity
 */

const calculateServiceItemPrice = ({
  service,
  option = null,
  quantity = 1,
  guests = 0,
}) => {
  if (!service) {
    throw new Error("Service is required");
  }

  // ========================================
  // Determine pricing source
  // ========================================

  const pricingSource =
    option || service;

  const pricingType =
    pricingSource.pricingType;

  // ========================================
  // Validate pricing type
  // ========================================

  const allowedPricingTypes = [
    "FIXED",
    "PER_GUEST",
    "PER_UNIT",
    "PER_HOUR",
    "PER_DAY",
    "PER_STAFF",
    "PER_REEL",
  ];

  if (
    !allowedPricingTypes.includes(
      pricingType,
    )
  ) {
    throw new Error(
      `Unsupported pricing type: ${pricingType}`,
    );
  }

  // ========================================
  // Get price from database
  // ========================================

  const unitPrice = Number(
    pricingSource.price ??
      pricingSource.basePrice ??
      0,
  );

  if (
    !Number.isFinite(unitPrice) ||
    unitPrice < 0
  ) {
    throw new Error(
      `Invalid price for service "${service.name}"`,
    );
  }

  // ========================================
  // Calculate quantity
  // ========================================

  let calculatedQuantity;

  switch (pricingType) {
    case "FIXED":
      calculatedQuantity = 1;
      break;

    case "PER_GUEST":
      calculatedQuantity = Number(guests);
      break;

    case "PER_UNIT":
    case "PER_HOUR":
    case "PER_DAY":
    case "PER_STAFF":
    case "PER_REEL":
      calculatedQuantity = Number(quantity);
      break;

    default:
      throw new Error(
        `Unsupported pricing type: ${pricingType}`,
      );
  }

  // ========================================
  // Validate quantity
  // ========================================

  if (
    !Number.isFinite(
      calculatedQuantity,
    ) ||
    calculatedQuantity < 1
  ) {
    throw new Error(
      `Quantity must be at least 1 for "${service.name}"`,
    );
  }

  // ========================================
  // Calculate total
  // ========================================

  const total =
    unitPrice * calculatedQuantity;

  // ========================================
  // Return price snapshot
  // ========================================

  return {
    serviceId: service._id,

    serviceName: service.name,

    category: service.category,

    optionId:
      option?._id || null,

    optionName:
      option?.name || null,

    description:
      option?.description ||
      service.description ||
      "",

    pricingType,

    unitLabel:
      pricingSource.unitLabel ||
      service.unitLabel ||
      "",

    quantity:
      calculatedQuantity,

    unitPrice:
      roundMoney(unitPrice),

    total:
      roundMoney(total),
  };
};

// ==========================================
// Calculate All Selected Services
// ==========================================

/**
 * selectedServices example:
 *
 * [
 *   {
 *     serviceId: "...",
 *     optionId: "...",
 *     quantity: 6
 *   },
 *   {
 *     serviceId: "...",
 *     quantity: 100
 *   }
 * ]
 *
 * For PER_GUEST services,
 * guest count is used automatically.
 */

const calculateServicesTotal = async ({
  selectedServices = [],
  guests = 0,
}) => {
  if (!Array.isArray(selectedServices)) {
    throw new Error(
      "selectedServices must be an array",
    );
  }

  if (
    selectedServices.length === 0
  ) {
    throw new Error(
      "At least one service must be selected",
    );
  }

  const guestCount = Number(guests);

  if (
    !Number.isInteger(guestCount) ||
    guestCount < 1
  ) {
    throw new Error(
      "Guest count must be a positive integer",
    );
  }

  const lineItems = [];

  // ========================================
  // Process every selected service
  // ========================================

  for (
    const selectedItem
    of selectedServices
  ) {
    const {
      serviceId,
      optionId,
      quantity = 1,
    } = selectedItem;

    if (!serviceId) {
      throw new Error(
        "serviceId is required",
      );
    }

    // ======================================
    // Fetch actual service
    // ======================================

    const service =
      await Service.findById(
        serviceId,
      );

    if (!service) {
      throw new Error(
        `Service not found: ${serviceId}`,
      );
    }

    // ======================================
    // Service must be active
    // ======================================

    if (!service.active) {
      throw new Error(
        `Service "${service.name}" is no longer available`,
      );
    }

    // ======================================
    // Resolve option
    // ======================================

    let selectedOption = null;

    if (optionId) {
      selectedOption =
        service.options.id(
          optionId,
        );

      if (!selectedOption) {
        throw new Error(
          `Option not found for service "${service.name}"`,
        );
      }

      if (!selectedOption.active) {
        throw new Error(
          `Option "${selectedOption.name}" is no longer available`,
        );
      }
    }

    // ======================================
    // If service has options,
    // an option must be selected
    // ======================================

    if (
      service.options?.length > 0 &&
      !selectedOption
    ) {
      throw new Error(
        `Please select an option for service "${service.name}"`,
      );
    }

    // ======================================
    // Calculate item
    // ======================================

    const lineItem =
      calculateServiceItemPrice({
        service,
        option: selectedOption,
        quantity,
        guests: guestCount,
      });

    lineItems.push(
      lineItem,
    );
  }

  // ========================================
  // Calculate subtotal
  // ========================================

  const subtotal =
    lineItems.reduce(
      (sum, item) =>
        sum + item.total,
      0,
    );

  return {
    lineItems,

    subtotal:
      roundMoney(subtotal),
  };
};

// ==========================================
// Calculate Discount
// ==========================================

const calculateDiscount = ({
  subtotal,
  discountType = "percentage",
  discountValue = 0,
}) => {
  const safeSubtotal =
    Number(subtotal);

  const amount =
    Number(discountValue);

  // ========================================
  // Validate subtotal
  // ========================================

  if (
    !Number.isFinite(
      safeSubtotal,
    ) ||
    safeSubtotal < 0
  ) {
    throw new Error(
      "Invalid subtotal",
    );
  }

  // ========================================
  // Validate discount
  // ========================================

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new Error(
      "Discount cannot be negative",
    );
  }

  let discount = 0;

  // ========================================
  // Percentage discount
  // ========================================

  if (
    discountType ===
    "percentage"
  ) {
    if (amount > 100) {
      throw new Error(
        "Percentage discount cannot exceed 100%",
      );
    }

    discount =
      (safeSubtotal * amount) /
      100;
  }

  // ========================================
  // Fixed discount
  // ========================================

  else if (
    discountType === "fixed"
  ) {
    discount = amount;
  }

  // ========================================
  // Invalid discount type
  // ========================================

  else {
    throw new Error(
      "Invalid discount type",
    );
  }

  // Discount cannot exceed subtotal
  discount = Math.min(
    discount,
    safeSubtotal,
  );

  return roundMoney(
    discount,
  );
};

// ==========================================
// Calculate Complete Estimate Total
// ==========================================

const calculateEstimateTotal = ({
  subtotal,
  discountType = "percentage",
  discountValue = 0,
  additionalCharges = 0,
}) => {
  const safeSubtotal =
    Number(subtotal);

  const safeAdditionalCharges =
    Number(additionalCharges);

  // ========================================
  // Validate subtotal
  // ========================================

  if (
    !Number.isFinite(
      safeSubtotal,
    ) ||
    safeSubtotal < 0
  ) {
    throw new Error(
      "Invalid subtotal",
    );
  }

  // ========================================
  // Validate additional charges
  // ========================================

  if (
    !Number.isFinite(
      safeAdditionalCharges,
    ) ||
    safeAdditionalCharges < 0
  ) {
    throw new Error(
      "Additional charges cannot be negative",
    );
  }

  // ========================================
  // Discount
  // ========================================

  const discount =
    calculateDiscount({
      subtotal:
        safeSubtotal,

      discountType,

      discountValue,
    });

  // ========================================
  // Taxable amount
  // ========================================

  const taxableAmount =
    Math.max(
      0,
      safeSubtotal -
        discount,
    );

  // ========================================
  // GST
  // ========================================

  const gstAmount =
    taxableAmount *
    (GST_RATE / 100);

  // ========================================
  // Grand total
  // ========================================

  const total =
    taxableAmount +
    gstAmount +
    safeAdditionalCharges;

  // ========================================
  // Return totals
  // ========================================

  return {
    subtotal:
      roundMoney(
        safeSubtotal,
      ),

    discount:
      roundMoney(
        discount,
      ),

    discountType,

    discountValue:
      Number(
        discountValue,
      ) || 0,

    taxableAmount:
      roundMoney(
        taxableAmount,
      ),

    gstRate:
      GST_RATE,

    gstAmount:
      roundMoney(
        gstAmount,
      ),

    additionalCharges:
      roundMoney(
        safeAdditionalCharges,
      ),

    total:
      roundMoney(
        Math.max(0, total),
      ),
  };
};

// ==========================================
// Exports
// ==========================================

module.exports = {
  GST_RATE,
  calculateServiceItemPrice,
  calculateServicesTotal,
  calculateDiscount,
  calculateEstimateTotal,
};
