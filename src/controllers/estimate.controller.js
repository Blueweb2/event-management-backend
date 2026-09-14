const {
  createEstimate,
  getEstimateById,
  getEstimates,
  updateEstimateStatus,
  convertEstimateToBooking,
} = require("../services/estimate.service");

// ==========================================
// CREATE ESTIMATE
// POST /api/estimates
// ==========================================

const createEstimateController = async (
  req,
  res,
  next
) => {
  try {
    const {
      eventName,
      eventType,
      eventDate,
      eventTime,
      guests,
      location,
      description,

      client,

      services,
      foodMenu,

      discountType,
      discountValue,
      additionalCharges,
    } = req.body;

    // ========================================
    // Event Validation
    // ========================================

    if (!eventName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Event name is required",
      });
    }

    if (!eventType?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Event type is required",
      });
    }

    if (!eventDate) {
      return res.status(400).json({
        success: false,
        message: "Event date is required",
      });
    }

    if (!eventTime?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Event time is required",
      });
    }

    if (
      guests === undefined ||
      guests === null ||
      guests === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Guest count is required",
      });
    }

    const guestCount = Number(guests);

    if (
      !Number.isInteger(guestCount) ||
      guestCount < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Guest count must be a positive integer",
      });
    }

    if (!location?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Event location is required",
      });
    }

    if (!description?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Event description is required",
      });
    }

    // ========================================
    // Client Validation
    // ========================================

    if (!client) {
      return res.status(400).json({
        success: false,
        message: "Client details are required",
      });
    }

    if (!client.name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Client name is required",
      });
    }

    if (!client.phone?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Client phone is required",
      });
    }

    if (!client.email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Client email is required",
      });
    }

    // ========================================
    // Services Validation
    // ========================================

    if (
      !Array.isArray(services) ||
      services.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one service must be selected",
      });
    }

    // ----------------------------------------
    // Validate each selected service
    // ----------------------------------------

    for (const item of services) {
      if (!item?.serviceId) {
        return res.status(400).json({
          success: false,
          message:
            "Each selected service must have a serviceId",
        });
      }

      // --------------------------------------
      // optionId is optional
      // --------------------------------------

      if (
        item.optionId !== undefined &&
        item.optionId !== null &&
        typeof item.optionId !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid service option",
        });
      }

      // --------------------------------------
      // Quantity
      // --------------------------------------

      if (
        item.quantity !== undefined &&
        item.quantity !== null
      ) {
        const quantity =
          Number(item.quantity);

        if (
          !Number.isFinite(quantity) ||
          quantity < 1
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Service quantity must be at least 1",
          });
        }
      }
    }

    // ========================================
    // Create Estimate
    // ========================================

    const estimate =
      await createEstimate({
        // ------------------------------------
        // Event
        // ------------------------------------

        eventName:
          eventName.trim(),

        eventType:
          eventType.trim(),

        eventDate,

        eventTime:
          eventTime.trim(),

        guests:
          guestCount,

        location:
          location.trim(),

        description:
          description.trim(),

        // ------------------------------------
        // Client
        // ------------------------------------

        client: {
          name:
            client.name.trim(),

          phone:
            client.phone.trim(),

          email:
            client.email
              .trim()
              .toLowerCase(),

          message:
            client.message?.trim() ||
            "",
        },

        // ------------------------------------
        // Services
        // ------------------------------------

        services,
        foodMenu,

        // ------------------------------------
        // Pricing adjustments
        // ------------------------------------

        discountType:
          discountType ||
          "percentage",

        discountValue:
          discountValue ?? 0,

        additionalCharges:
          additionalCharges ?? 0,

        // ------------------------------------
        // Authenticated user
        // ------------------------------------

        createdBy:
          req.user?._id || null,
      });

    // ========================================
    // Success
    // ========================================

    return res.status(201).json({
      success: true,

      message:
        "Estimate created successfully",

      data: estimate,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET ESTIMATES
// GET /api/estimates
// ==========================================

const getEstimatesController = async (
  req,
  res,
  next
) => {
  try {
    const {
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const result =
      await getEstimates({
        status,
        page,
        limit,
      });

    return res.status(200).json({
      success: true,

      data: result.estimates,

      pagination:
        result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET SINGLE ESTIMATE
// GET /api/estimates/:id
// ==========================================

const getEstimateByIdController =
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const estimate =
        await getEstimateById(id);

      return res.status(200).json({
        success: true,
        data: estimate,
      });
    } catch (error) {
      next(error);
    }
  };

// ==========================================
// UPDATE ESTIMATE STATUS
// PATCH /api/estimates/:id/status
// ==========================================

const updateEstimateStatusController =
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const { status } =
        req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Status is required",
        });
      }

      const estimate =
        await updateEstimateStatus({
          estimateId: id,
          status,
        });

      return res.status(200).json({
        success: true,

        message:
          "Estimate status updated successfully",

        data: estimate,
      });
    } catch (error) {
      next(error);
    }
  };

// ==========================================
// CONVERT ESTIMATE TO BOOKING + EVENT
// POST /api/estimates/:id/convert
// ==========================================

const convertEstimateToBookingController =
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Estimate ID is required",
        });
      }

      const result = await convertEstimateToBooking(
        id,
        req.user?._id || null
      );

      return res.status(201).json({
        success: true,
        message:
          "Estimate converted to event successfully",
        data: {
          booking: result.booking,
          event: result.event,
        },
      });
    } catch (error) {
      next(error);
    }
  };

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createEstimateController,
  getEstimatesController,
  getEstimateByIdController,
  updateEstimateStatusController,
  convertEstimateToBookingController,
};