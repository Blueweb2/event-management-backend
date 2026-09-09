const Booking = require("../models/booking.model");

const {
  calculateServicesTotal,
  calculateEstimateTotal,
} = require("./pricing.service");

// ==========================================
// Create Booking
// ==========================================

const createBooking = async ({
  eventName,
  eventType,
  eventDate,
  eventTime,
  guests,
  location,
  description,

  name,
  phone,
  email,
  message,

  services,

  discountType = "percentage",
  discountValue = 0,
  additionalCharges = 0,

  createdBy = null,
}) => {
  // ==========================================
  // Normalize Guest Count
  // ==========================================

  const guestCount = Number(guests);

  if (
    !Number.isInteger(guestCount) ||
    guestCount < 1
  ) {
    throw new Error(
      "Guest count must be a positive integer"
    );
  }

  // ==========================================
  // Validate Services
  // ==========================================

  if (
    !Array.isArray(services) ||
    services.length === 0
  ) {
    throw new Error(
      "At least one service must be selected"
    );
  }

  // ==========================================
  // Calculate Service Pricing
  // ==========================================

  /*
   * IMPORTANT:
   *
   * We NEVER trust unitPrice from the frontend.
   *
   * pricing.service.js:
   *
   * 1. Fetches the Service from MongoDB
   * 2. Validates the Service
   * 3. Validates the selected Option
   * 4. Gets the Admin-configured price
   * 5. Determines quantity based on pricingType
   * 6. Calculates the line-item total
   */

  const pricingResult =
    await calculateServicesTotal({
      selectedServices: services,
      guests: guestCount,
    });

  // ==========================================
  // Calculate Final Pricing
  // ==========================================

  const totals =
    calculateEstimateTotal({
      subtotal: pricingResult.subtotal,
      discountType,
      discountValue,
      additionalCharges,
    });

  // ==========================================
  // Normalize Discount Values
  // ==========================================

  const normalizedDiscountValue =
    Number(discountValue) || 0;

  const normalizedAdditionalCharges =
    Number(additionalCharges) || 0;

  // ==========================================
  // Create Booking
  // ==========================================

  const booking = await Booking.create({
    // ========================================
    // Event Details
    // ========================================

    eventName: eventName.trim(),

    eventType: eventType.trim(),

    eventDate,

    eventTime: eventTime.trim(),

    guests: guestCount,

    location: location.trim(),

    description: description.trim(),

    // ========================================
    // Client Details
    // ========================================

    name: name.trim(),

    phone: phone.trim(),

    email: email.trim().toLowerCase(),

    message: message?.trim() || "",

    // ========================================
    // Services
    // ========================================

    /*
     * These are the price snapshots returned
     * by pricing.service.js.
     *
     * The frontend's unitPrice is NOT stored.
     */
    services: pricingResult.lineItems,

    // ========================================
    // Pricing
    // ========================================

    subtotal: totals.subtotal,

    discountType:
      discountType || "percentage",

    discountValue:
      normalizedDiscountValue,

    discountAmount:
      totals.discount,

    additionalCharges:
      normalizedAdditionalCharges,

    total:
      totals.total,

    currency: "INR",

    // ========================================
    // Booking Status
    // ========================================

    status: "Pending",

    // ========================================
    // User
    // ========================================

    createdBy,
  });

  return booking;
};

module.exports = {
  createBooking,
};