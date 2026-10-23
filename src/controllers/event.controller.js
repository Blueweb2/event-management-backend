const eventService = require("../services/event.service");
const bookingService = require("../services/booking.service");
const Event = require("../models/event.model");

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
      req.body,
      req.user?.userId || req.user?.id
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
      status,
      req.user?.userId || req.user?.id
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
// Delete Event
// ==========================================

const deleteEvent = async (req, res, next) => {
  try {
    const result = await eventService.deleteEvent(req.params.id);
    return res.status(200).json({
      success: true,
      message: result.message || "Event deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Start Event
// ==========================================

const startEvent = async (req, res, next) => {
  try {
    const event = await eventService.startEvent(
      req.params.id,
      req.user?.userId
    );

    return res.status(200).json({
      success: true,
      message: "Event started successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Get Event Operational Activity Timeline
// ==========================================

const getActivityTimeline = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    return res.status(200).json({
      success: true,
      data: {
        eventId: event._id,
        eventName: event.eventName,
        activities: event.activities || [],
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Record Client Payment for Event
// POST /api/events/:id/payments
// ==========================================

const recordEventPayment = async (req, res, next) => {
  try {
    // Only Super Admin can record client payments
    const userRole = (req.user?.role || "").toLowerCase();
    const isSuperAdmin = userRole === "superadmin" || userRole === "admin";

    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only Super Admin is authorized to record client payments.",
      });
    }

    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const bookingId = event.booking?._id || event.booking;
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Source booking not linked to this event",
      });
    }

    const result = await bookingService.recordPayment(
      bookingId,
      req.body,
      req.user?._id || req.user?.userId || null
    );

    return res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      data: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
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
  startEvent,
  getActivityTimeline,
  cancelEvent,
  deleteEvent,
  recordEventPayment,
};