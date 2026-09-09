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

    // ========================================
    // Event Validation
    // ========================================

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

    // ========================================
    // Client Validation
    // ========================================

    if (!name || !phone || !email) {
      const error = new Error(
        "Name, phone and email are required"
      );

      error.statusCode = 400;
      throw error;
    }

    // ========================================
    // Services Validation
    // ========================================

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

    // ========================================
    // Validate Service Items
    // ========================================

    for (const item of services) {
      if (!item.serviceId) {
        const error = new Error(
          "Each selected service must have a serviceId"
        );

        error.statusCode = 400;
        throw error;
      }

      /*
       * Quantity is required for all variable
       * pricing types.
       *
       * FIXED services will automatically use
       * quantity = 1 in pricing.service.js.
       */
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

    // ========================================
    // Create Booking
    // ========================================

    const booking =
      await bookingService.createBooking({
        eventName,
        eventType,
        eventDate,
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
          discountType || "percentage",

        discountValue:
          discountValue ?? 0,

        additionalCharges:
          additionalCharges ?? 0,

        createdBy:
          req.user?._id || null,
      });

    // ========================================
    // Response
    // ========================================

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

module.exports = {
  createBooking,
};