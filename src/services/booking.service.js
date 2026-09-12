const Booking = require("../models/booking.model");
const Client = require("../models/client.model");
const Event = require("../models/event.model");

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
  // Validate Client Details
  // ==========================================

  if (!name || !name.trim()) {
    throw new Error("Client name is required");
  }

  if (!phone || !phone.trim()) {
    throw new Error("Client phone is required");
  }

  if (!email || !email.trim()) {
    throw new Error("Client email is required");
  }

  const normalizedName = name.trim();
  const normalizedPhone = phone.trim();
  const normalizedEmail = email.trim().toLowerCase();

  // ==========================================
  // Find or Create Client
  // ==========================================

  let client = await Client.findOne({
    $or: [
      { email: normalizedEmail },
      { phone: normalizedPhone },
    ],
  });

  if (!client) {
    client = await Client.create({
      name: normalizedName,
      phone: normalizedPhone,
      email: normalizedEmail,
      createdBy,
    });
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
  // Normalize Pricing Values
  // ==========================================

  const normalizedDiscountValue =
    Number(discountValue) || 0;

  const normalizedAdditionalCharges =
    Number(additionalCharges) || 0;

  const normalizedDiscountType =
    discountType || "percentage";

  // ==========================================
  // Calculate Services
  // ==========================================

  /*
   * NEVER trust pricing information from
   * the frontend.
   *
   * pricing.service.js:
   *
   * - Fetches Service
   * - Validates Service
   * - Validates Option
   * - Gets configured price
   * - Calculates quantity
   * - Creates price snapshot
   */

  const pricingResult =
    await calculateServicesTotal({
      selectedServices: services,
      guests: guestCount,
    });

  // ==========================================
  // Calculate Final Total
  // ==========================================

  const totals =
    calculateEstimateTotal({
      subtotal: pricingResult.subtotal,

      discountType:
        normalizedDiscountType,

      discountValue:
        normalizedDiscountValue,

      additionalCharges:
        normalizedAdditionalCharges,
    });

  // ==========================================
  // Create Booking
  // ==========================================

  const booking = await Booking.create({
    // ========================================
    // Client
    // ========================================

    client: client._id,

    // ========================================
    // Event Information
    // ========================================

    eventName: eventName.trim(),

    eventType: eventType.trim(),

    eventDate,

    eventTime: eventTime.trim(),

    guests: guestCount,

    location: location.trim(),

    description: description.trim(),

    // ========================================
    // Booking Message
    // ========================================

    message: message?.trim() || "",

    // ========================================
    // Services Snapshot
    // ========================================

    services:
      pricingResult.lineItems,

    // ========================================
    // Pricing
    // ========================================

    subtotal:
      totals.subtotal,

    discountType:
      normalizedDiscountType,

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

// ==========================================
// Confirm Booking
// ==========================================

const confirmBooking = async (
  bookingId,
  confirmedBy = null
) => {
  // ==========================================
  // Find Booking
  // ==========================================

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  // ==========================================
  // Check Current Status
  // ==========================================

  if (booking.status === "Confirmed") {
    const existingEvent = await Event.findOne({
      booking: booking._id,
    });

    if (existingEvent) {
      return {
        booking,
        event: existingEvent,
      };
    }

    const error = new Error(
      "Booking is already confirmed but no event exists"
    );

    error.statusCode = 409;
    throw error;
  }

  if (booking.status !== "Pending") {
    const error = new Error(
      `Booking cannot be confirmed because its current status is ${booking.status}`
    );

    error.statusCode = 400;
    throw error;
  }

  // ==========================================
  // Confirm Booking
  // ==========================================

  booking.status = "Confirmed";

  await booking.save();

  // ==========================================
  // Create Event
  // ==========================================

  const existingEvent = await Event.findOne({
    booking: booking._id,
  });

  if (existingEvent) {
    return {
      booking,
      event: existingEvent,
    };
  }

  const event = await Event.create({
    client: booking.client,

    booking: booking._id,

    eventName: booking.eventName,

    eventType: booking.eventType,

    eventDate: booking.eventDate,

    eventTime: booking.eventTime,

    guests: booking.guests,

    location: booking.location,

    description: booking.description,

    status: "Upcoming",

    createdBy: confirmedBy,
  });

  // ==========================================
  // Populate Response
  // ==========================================

  await booking.populate(
    "client",
    "name phone email"
  );

  await event.populate([
    {
      path: "client",
      select: "name phone email",
    },
    {
      path: "booking",
      select:
        "eventName eventType eventDate eventTime guests location total status",
    },
    {
      path: "createdBy",
      select: "name email role",
    },
  ]);

  return {
    booking,
    event,
  };
};

module.exports = {
  createBooking,
  confirmBooking,
};