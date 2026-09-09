const eventService = require("../services/event.service");

/**
 * Get all events
 * Manager/Admin
 */
const getAllEvents = async (req, res, next) => {
  try {
    const {
      search,
      type,
      status,
      date,
    } = req.query;

    const events =
      await eventService.getAllEvents({
        search,
        type,
        status,
        date,
      });

    res.status(200).json({
      success: true,
      data: {
        events,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get event statistics
 * Manager/Admin
 */
const getEventStats = async (
  req,
  res,
  next
) => {
  try {
    const stats =
      await eventService.getEventStats();

    res.status(200).json({
      success: true,
      data: {
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single event
 * Manager/Admin
 */
const getEventById = async (
  req,
  res,
  next
) => {
  try {
    const event =
      await eventService.getEventById(
        req.params.id
      );

    res.status(200).json({
      success: true,
      data: {
        event,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create event
 * Manager/Admin
 */
const createEvent = async (
  req,
  res,
  next
) => {
  try {
    const {
      name,
      type,
      customer,
      date,
      time,
      location,
      guests,
      package: eventPackage,
      amount,
      status,
      description,
      assignedStaff,
    } = req.body;

    // Required fields
    if (
      !name ||
      !type ||
      !date ||
      !time ||
      !location
    ) {
      const error = new Error(
        "Name, type, date, time and location are required"
      );

      error.statusCode = 400;

      throw error;
    }

    const event =
      await eventService.createEvent({
        name,
        type,
        customer,
        date,
        time,
        location,
        guests,
        package: eventPackage,
        amount,
        status,
        description,
        assignedStaff,
      });

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: {
        event,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update event
 * Manager/Admin
 */
const updateEvent = async (
  req,
  res,
  next
) => {
  try {
    const {
      name,
      type,
      customer,
      date,
      time,
      location,
      guests,
      package: eventPackage,
      amount,
      status,
      description,
      assignedStaff,
    } = req.body;

    const event =
      await eventService.updateEvent(
        req.params.id,
        {
          name,
          type,
          customer,
          date,
          time,
          location,
          guests,
          package: eventPackage,
          amount,
          status,
          description,
          assignedStaff,
        }
      );

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: {
        event,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update event status
 * Manager/Admin
 */
const updateEventStatus = async (
  req,
  res,
  next
) => {
  try {
    const { status } = req.body;

    if (!status) {
      const error = new Error(
        "Event status is required"
      );

      error.statusCode = 400;

      throw error;
    }

    const event =
      await eventService.updateEventStatus(
        req.params.id,
        status
      );

    res.status(200).json({
      success: true,
      message: "Event status updated successfully",
      data: {
        event,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete event
 * Manager/Admin
 */
const deleteEvent = async (
  req,
  res,
  next
) => {
  try {
    await eventService.deleteEvent(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign staff to event
 * Manager/Admin
 */
const assignStaff = async (
  req,
  res,
  next
) => {
  try {
    const { assignedStaff } = req.body;

    if (!Array.isArray(assignedStaff)) {
      const error = new Error(
        "assignedStaff must be an array"
      );

      error.statusCode = 400;

      throw error;
    }

    const event =
      await eventService.assignStaff(
        req.params.id,
        assignedStaff
      );

    res.status(200).json({
      success: true,
      message: "Staff assigned successfully",
      data: {
        event,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get events assigned to logged-in staff
 */
const getMyEvents = async (
  req,
  res,
  next
) => {
  try {
    const events =
      await eventService.getMyEvents(
        req.user.userId
      );

    res.status(200).json({
      success: true,
      data: {
        events,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllEvents,
  getEventStats,
  getEventById,
  createEvent,
  updateEvent,
  updateEventStatus,
  deleteEvent,
  assignStaff,
  getMyEvents,
};