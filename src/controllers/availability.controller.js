const availabilityService = require("../services/availability.service");

/**
 * Set availability
 * POST /api/availability
 */
const setAvailability = async (
  req,
  res,
  next
) => {
  try {
    let {
      staff,
      date,
      status,
      startTime,
      endTime,
      notes,
    } = req.body;

    // Auto-bind staff ID if logged in user is staff
    if (!staff && (req.user?.role || "").toLowerCase() === "staff") {
      staff = req.user.userId;
    }

    if (!staff || !date || !status) {
      const error = new Error(
        "Staff, date and status are required"
      );

      error.statusCode = 400;
      throw error;
    }

    const allowedStatuses = [
      "AVAILABLE",
      "ON_LEAVE",
      "UNAVAILABLE",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      const error = new Error(
        "Invalid availability status"
      );

      error.statusCode = 400;
      throw error;
    }

    const availability =
      await availabilityService.setAvailability(
        {
          staff,
          date,
          status,
          startTime,
          endTime,
          notes,
          createdBy:
            req.user.userId,
        }
      );

    res.status(200).json({
      success: true,
      message:
        "Staff availability saved successfully",
      data: {
        availability,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get availability
 * GET /api/availability
 */
const getAvailability = async (
  req,
  res,
  next
) => {
  try {
    const filters = { ...req.query };
    // Auto-filter by staff ID if logged in user is staff
    if ((req.user?.role || "").toLowerCase() === "staff") {
      filters.staff = req.user.userId;
    }

    const result =
      await availabilityService.getAvailability(
        filters
      );

    res.status(200).json({
      success: true,
      data: result.availability,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get availability by ID
 */
const getAvailabilityById = async (
  req,
  res,
  next
) => {
  try {
    const availability =
      await availabilityService.getAvailabilityById(
        req.params.id
      );

    res.status(200).json({
      success: true,
      data: {
        availability,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete availability
 */
const deleteAvailability = async (
  req,
  res,
  next
) => {
  try {
    await availabilityService.deleteAvailability(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message:
        "Availability record deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  setAvailability,
  getAvailability,
  getAvailabilityById,
  deleteAvailability,
};