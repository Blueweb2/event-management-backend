const bookingService = require("../services/booking.service");

// ==========================================
// Create Booking
// ==========================================

const createBooking = async (req, res, next) => {
  try {
    const {
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

      discountType,
      discountValue,
      additionalCharges,
    } = req.body;

    // ==========================================
    // Event Validation
    // ==========================================

    if (
      !eventName ||
      !eventType ||
      !eventDate ||
      !eventTime ||
      guests === undefined ||
      guests === null ||
      !location ||
      !description
    ) {
      const error = new Error(
        "Event name, type, date, time, guests, location and description are required"
      );

      error.statusCode = 400;
      throw error;
    }

    // ==========================================
    // Event Date Validation
    // ==========================================

    const parsedEventDate = new Date(eventDate);

    if (Number.isNaN(parsedEventDate.getTime())) {
      const error = new Error(
        "A valid event date is required"
      );

      error.statusCode = 400;
      throw error;
    }

    // ==========================================
    // Guest Validation
    // ==========================================

    const guestCount = Number(guests);

    if (
      !Number.isInteger(guestCount) ||
      guestCount < 1
    ) {
      const error = new Error(
        "Guest count must be a positive integer"
      );

      error.statusCode = 400;
      throw error;
    }

    // ==========================================
    // Client Validation
    // ==========================================

    if (!name || !phone || !email) {
      const error = new Error(
        "Name, phone and email are required"
      );

      error.statusCode = 400;
      throw error;
    }

    // ==========================================
    // Services Validation
    // ==========================================

    if (
      !Array.isArray(services) ||
      services.length === 0
    ) {
      const error = new Error(
        "At least one service must be selected"
      );

      error.statusCode = 400;
      throw error;
    }

    // ==========================================
    // Validate Service Items
    // ==========================================

    for (const item of services) {
      if (!item.serviceId) {
        const error = new Error(
          "Each selected service must have a serviceId"
        );

        error.statusCode = 400;
        throw error;
      }

      if (
        item.quantity !== undefined &&
        item.quantity !== null
      ) {
        const quantity = Number(item.quantity);

        if (
          !Number.isFinite(quantity) ||
          quantity < 1
        ) {
          const error = new Error(
            "Service quantity must be at least 1"
          );

          error.statusCode = 400;
          throw error;
        }
      }
    }

    // ==========================================
    // Validate Discount
    // ==========================================

    const normalizedDiscountValue =
      Number(discountValue ?? 0);

    if (
      !Number.isFinite(normalizedDiscountValue) ||
      normalizedDiscountValue < 0
    ) {
      const error = new Error(
        "Discount value must be a valid non-negative number"
      );

      error.statusCode = 400;
      throw error;
    }

    // ==========================================
    // Validate Additional Charges
    // ==========================================

    const normalizedAdditionalCharges =
      Number(additionalCharges ?? 0);

    if (
      !Number.isFinite(
        normalizedAdditionalCharges
      ) ||
      normalizedAdditionalCharges < 0
    ) {
      const error = new Error(
        "Additional charges must be a valid non-negative number"
      );

      error.statusCode = 400;
      throw error;
    }

    // ==========================================
    // Validate Discount Type
    // ==========================================

    const normalizedDiscountType =
      discountType || "percentage";

    if (
      !["percentage", "fixed"].includes(
        normalizedDiscountType
      )
    ) {
      const error = new Error(
        "Discount type must be either percentage or fixed"
      );

      error.statusCode = 400;
      throw error;
    }

    // ==========================================
    // Create Booking
    // ==========================================

    const booking =
      await bookingService.createBooking({
        eventName,
        eventType,
        eventDate: parsedEventDate,
        eventTime,
        guests: guestCount,
        location,
        description,

        name,
        phone,
        email,
        message,

        services,

        discountType:
          normalizedDiscountType,

        discountValue:
          normalizedDiscountValue,

        additionalCharges:
          normalizedAdditionalCharges,

        createdBy:
          req.user?.userId || null,
      });

    // ==========================================
    // Response
    // ==========================================

    return res.status(201).json({
      success: true,
      message:
        "Booking request submitted successfully",

      data: {
        booking,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Confirm Booking
// ==========================================

const confirmBooking = async (req, res, next) => {
  try {
    const result =
      await bookingService.confirmBooking(
        req.params.id,
        req.user?.userId || null
      );

    return res.status(200).json({
      success: true,
      message:
        "Booking confirmed and event created successfully",
      data: {
        booking: result.booking,
        event: result.event,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBooking,
  confirmBooking,
};