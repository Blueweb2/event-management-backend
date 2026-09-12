const eventService = require("../services/event.service");

// ==========================================
// Create Event
// ==========================================

const createEvent = async (req, res, next) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
    }

    const event = await eventService.createEvent({
      bookingId,
      createdBy: req.user?.userId || null,
    });

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Get All Events
// ==========================================

const getEvents = async (req, res, next) => {
  try {
    const {
      search = "",
      status = "",
      startDate = "",
      endDate = "",
      page = 1,
      limit = 20,
    } = req.query;

    const result = await eventService.getEvents({
      search,
      status,
      startDate,
      endDate,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      message: "Events retrieved successfully",
      data: result.events,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Get Event By ID
// ==========================================

const getEventById = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Event retrieved successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Update Event
// ==========================================

const updateEvent = async (req, res, next) => {
  try {
    const event = await eventService.updateEvent(
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Update Event Status
// ==========================================

const updateEventStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Event status is required",
      });
    }

    const event = await eventService.updateEventStatus(
      req.params.id,
      status
    );

    return res.status(200).json({
      success: true,
      message: "Event status updated successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Cancel Event
// ==========================================

const cancelEvent = async (req, res, next) => {
  try {
    const event = await eventService.cancelEvent(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Event cancelled successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Export
// ==========================================

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  updateEventStatus,
  cancelEvent,
};