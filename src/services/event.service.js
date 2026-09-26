const Event = require("../models/event.model");
const Booking = require("../models/booking.model");

// ==========================================
// Create Event
// ==========================================

const createEvent = async ({
  bookingId,
  createdBy = null,
}) => {
  // ==========================================
  // Find Booking
  // ==========================================

  const booking = await Booking.findById(bookingId)
    .populate("client");

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  // ==========================================
  // Booking Must Be Confirmed
  // ==========================================

  if (booking.status !== "Confirmed") {
    const error = new Error(
      "Event can only be created from a confirmed booking"
    );

    error.statusCode = 400;
    throw error;
  }

  // ==========================================
  // Check Existing Event
  // ==========================================

  const existingEvent = await Event.findOne({
    booking: booking._id,
  });

  if (existingEvent) {
    const error = new Error(
      "An event already exists for this booking"
    );

    error.statusCode = 409;
    throw error;
  }

  // ==========================================
  // Create Event
  // ==========================================

  const event = await Event.create({
    client: booking.client._id,

    booking: booking._id,

    eventName: booking.eventName,

    eventType: booking.eventType,

    eventDate: booking.eventDate,

    eventTime: booking.eventTime,

    guests: booking.guests,

    location: booking.location,

    description: booking.description,

    status: "Upcoming",

    createdBy,
  });

  // ==========================================
  // Return Populated Event
  // ==========================================

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

  return event;
};

// ==========================================
// Get All Events
// ==========================================

const getEvents = async ({
  search = "",
  status = "",
  startDate = "",
  endDate = "",
  page = 1,
  limit = 20,
} = {}) => {
  const query = {};

  // ==========================================
  // Status Filter
  // ==========================================

  if (status) {
    query.status = status;
  }

  // ==========================================
  // Date Filter
  // ==========================================

  if (startDate || endDate) {
    query.eventDate = {};

    if (startDate) {
      query.eventDate.$gte = new Date(startDate);
    }

    if (endDate) {
      const end = new Date(endDate);

      // Include the entire end date
      end.setHours(23, 59, 59, 999);

      query.eventDate.$lte = end;
    }
  }

  // ==========================================
  // Search
  // ==========================================

  if (search.trim()) {
    const searchRegex = new RegExp(
      search.trim(),
      "i"
    );

    query.$or = [
      {
        eventName: searchRegex,
      },
      {
        eventType: searchRegex,
      },
      {
        location: searchRegex,
      },
    ];
  }

  // ==========================================
  // Pagination
  // ==========================================

  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const perPage = Math.min(
    Math.max(Number(limit) || 20, 1),
    1000
  );

  const skip =
    (currentPage - 1) * perPage;

  // ==========================================
  // Fetch Events
  // ==========================================

  const [events, total] = await Promise.all([
    Event.find(query)
      .populate("client", "name phone email")
      .populate(
        "booking",
        "eventName eventType eventDate eventTime guests location total status foodMenu services"
      )
      .populate(
        "createdBy",
        "name email role"
      )
      .sort({
        eventDate: 1,
        createdAt: 1,
      })
      .skip(skip)
      .limit(perPage),

    Event.countDocuments(query),
  ]);

  return {
    events,

    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(
        total / perPage
      ),
    },
  };
};

// ==========================================
// Get Event By ID
// ==========================================

const getEventById = async (eventId) => {
  const event = await Event.findById(eventId)
    .populate(
      "client",
      "name phone email alternatePhone address city state country"
    )
    .populate(
      "booking",
      "eventName eventType eventDate eventTime guests location description services foodMenu subtotal discountAmount additionalCharges total currency status"
    )
    .populate(
      "createdBy",
      "name email role"
    )
    .populate(
      "startedBy",
      "name email role"
    );

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  return event;
};

// ==========================================
// Update Event
// ==========================================

const updateEvent = async (
  eventId,
  updateData
) => {
  // ==========================================
  // Fields That Can Be Updated
  // ==========================================

  const allowedFields = [
    "eventName",
    "eventType",
    "eventDate",
    "eventTime",
    "guests",
    "location",
    "description",
    "notes",
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (
      updateData[field] !== undefined
    ) {
      updates[field] = updateData[field];
    }
  }

  // ==========================================
  // Update Event
  // ==========================================

  const event =
    await Event.findByIdAndUpdate(
      eventId,
      updates,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate(
        "client",
        "name phone email"
      )
      .populate(
        "booking",
        "eventName eventType eventDate eventTime guests location total status"
      );

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  return event;
};

// ==========================================
// Update Event Status
// ==========================================

const updateEventStatus = async (
  eventId,
  status,
  userId = null
) => {
  const allowedStatuses = [
    "CONFIRMED",
    "READY_TO_START",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "Upcoming",
    "Ongoing",
    "Completed",
    "Cancelled",
    "Invoiced",
    "Settled",
  ];

  if (!allowedStatuses.includes(status)) {
    const error = new Error("Invalid event status");
    error.statusCode = 400;
    throw error;
  }

  const existingEvent = await Event.findById(eventId);
  if (!existingEvent) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const User = require("../models/user.model");
  let actorName = "Manager";
  if (userId) {
    const u = await User.findById(userId).select("name");
    if (u?.name) actorName = u.name;
  }

  const updateFields = { status };
  const now = new Date();

  if (["Completed", "COMPLETED"].includes(status)) {
    if (!existingEvent.completedAt) {
      updateFields.completedAt = now;
      updateFields.completedBy = userId || null;
    }
  }

  if (["Invoiced", "Settled"].includes(status)) {
    if (!existingEvent.invoicedAt) {
      updateFields.invoicedAt = now;
      updateFields.invoicedBy = userId || null;
    }
  }

  const event = await Event.findByIdAndUpdate(
    eventId,
    { $set: updateFields },
    { new: true, runValidators: true }
  )
    .populate("client", "name phone email")
    .populate("booking", "eventName eventType eventDate eventTime guests location total status")
    .populate("startedBy", "name email")
    .populate("completedBy", "name email")
    .populate("invoicedBy", "name email");

  if (event) {
    if (!Array.isArray(event.activities)) event.activities = [];
    const actionDesc =
      ["Completed", "COMPLETED"].includes(status)
        ? `Event marked as Completed by ${actorName}`
        : ["Invoiced", "Settled"].includes(status)
        ? `Event invoice generated and settled by ${actorName}`
        : `Event status updated to ${status} by ${actorName}`;

    event.activities.push({
      action: `STATUS_CHANGED_${status.toUpperCase()}`,
      description: actionDesc,
      timestamp: now,
      performedBy: userId || null,
    });
    await event.save();
  }

  return event;
};

// ==========================================
// Start Event (Manager Action)
// PATCH /api/events/:id/start
// ==========================================

const startEvent = async (eventId, managerId) => {
  const User = require("../models/user.model");
  const event = await Event.findById(eventId);

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  // Verify event is not already started
  if (
    event.status === "IN_PROGRESS" ||
    event.status === "Ongoing" ||
    event.status === "COMPLETED" ||
    event.status === "Completed"
  ) {
    const error = new Error("This event has already been started or completed.");
    error.statusCode = 400;
    throw error;
  }

  // Date validation: Current Date must match or be on Event Date
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const eventDateObj = new Date(event.eventDate);
  const eventDateStr = eventDateObj.toISOString().slice(0, 10);

  if (todayStr < eventDateStr) {
    const formattedDate = eventDateObj.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const error = new Error(`This event can only be started on ${formattedDate}.`);
    error.statusCode = 400;
    throw error;
  }

  // Find manager details for activity log
  let managerName = "Manager";
  if (managerId) {
    const managerUser = await User.findById(managerId).select("name");
    if (managerUser?.name) managerName = managerUser.name;
  }

  // Transition status to IN_PROGRESS & save timestamps
  event.status = "IN_PROGRESS";
  event.startedAt = now;
  event.startedBy = managerId || null;

  if (!Array.isArray(event.activities)) {
    event.activities = [];
  }

  event.activities.push({
    action: "EVENT_STARTED",
    description: `Event started by ${managerName}`,
    timestamp: now,
    performedBy: managerId || null,
  });

  await event.save();

  // Also keep associated booking in sync
  if (event.booking) {
    await Booking.findByIdAndUpdate(event.booking, { status: "Confirmed" });
  }

  return getEventById(event._id);
};

// ==========================================
// Cancel Event
// ==========================================

const cancelEvent = async (eventId) => {
  return updateEventStatus(
    eventId,
    "CANCELLED"
  );
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
  cancelEvent,
};