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
// Auto-Cancel Overdue Unstarted Events
// ==========================================

const autoCancelOverdueUnstartedEvents = async () => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Find all events where eventDate < today and event was never started or completed
    const overdueUnstartedEvents = await Event.find({
      eventDate: { $lt: todayStart },
      status: {
        $in: [
          "Upcoming",
          "CONFIRMED",
          "READY_TO_START",
          "upcoming",
          "confirmed",
          "ready_to_start",
        ],
      },
      startedAt: null,
      completedAt: null,
    });

    if (!overdueUnstartedEvents || overdueUnstartedEvents.length === 0) {
      return 0;
    }

    const eventIds = overdueUnstartedEvents.map((e) => e._id);
    const bookingIds = overdueUnstartedEvents
      .map((e) => e.booking)
      .filter(Boolean);

    // Update matching events to CANCELLED
    await Event.updateMany(
      { _id: { $in: eventIds } },
      {
        $set: { status: "CANCELLED" },
        $push: {
          activities: {
            action: "AUTO_CANCELLED",
            description:
              "Event auto-cancelled: Scheduled event date has passed without being started or completed.",
            timestamp: new Date(),
          },
        },
      }
    );

    // Also update associated Bookings
    if (bookingIds.length > 0) {
      await Booking.updateMany(
        {
          _id: { $in: bookingIds },
          status: { $in: ["Confirmed", "Upcoming", "confirmed", "upcoming"] },
        },
        { $set: { status: "Cancelled" } }
      );
    }

    // Cancel uncompleted staff duties for these events
    try {
      const Duty = require("../models/duty.model");
      await Duty.updateMany(
        {
          event: { $in: eventIds },
          status: { $in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "PENDING"] },
        },
        { $set: { status: "CANCELLED" } }
      );
    } catch (dutyErr) {
      console.warn("Non-fatal duty cancellation warning:", dutyErr.message);
    }

    return overdueUnstartedEvents.length;
  } catch (err) {
    console.error("Error auto-cancelling overdue unstarted events:", err);
    return 0;
  }
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
  // Automatically cancel overdue events that were never started or completed
  await autoCancelOverdueUnstartedEvents();

  const query = {};

  // ==========================================
  // Status Filter
  // ==========================================

  if (status && status !== "All") {
    const s = String(status).trim().toLowerCase();
    if (s === "completed") {
      query.status = {
        $in: [
          "Completed",
          "COMPLETED",
          "Settled",
          "Invoiced",
          "SETTLED",
          "INVOICED",
          "completed",
          "settled",
          "invoiced",
        ],
      };
    } else if (s === "ongoing" || s === "in_progress") {
      query.status = {
        $in: [
          "Ongoing",
          "IN_PROGRESS",
          "READY_TO_START",
          "ongoing",
          "in_progress",
          "ready_to_start",
        ],
      };
    } else if (s === "upcoming" || s === "confirmed") {
      query.status = {
        $in: [
          "Upcoming",
          "CONFIRMED",
          "READY_TO_START",
          "upcoming",
          "confirmed",
          "ready_to_start",
        ],
      };
    } else if (s === "cancelled") {
      query.status = {
        $in: ["Cancelled", "CANCELLED", "cancelled"],
      };
    } else {
      query.status = new RegExp(`^${status}$`, "i");
    }
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

  // If the event date is in the past and it was never started or completed, auto-cancel it
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isUnstarted = [
    "Upcoming",
    "CONFIRMED",
    "READY_TO_START",
    "upcoming",
    "confirmed",
    "ready_to_start",
  ].includes(event.status);

  if (
    event.eventDate &&
    new Date(event.eventDate) < todayStart &&
    isUnstarted &&
    !event.startedAt &&
    !event.completedAt
  ) {
    event.status = "CANCELLED";
    if (!Array.isArray(event.activities)) event.activities = [];
    event.activities.push({
      action: "AUTO_CANCELLED",
      description:
        "Event auto-cancelled: Scheduled event date has passed without being started or completed.",
      timestamp: new Date(),
    });
    await event.save();
  }

  return event;
};

// ==========================================
// Update Event
// ==========================================

const updateEvent = async (
  eventId,
  updateData,
  userId = null
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
    "status",
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (
      updateData[field] !== undefined
    ) {
      updates[field] = updateData[field];
    }
  }

  const isMarkingCompleted =
    updates.status && ["Completed", "COMPLETED"].includes(updates.status);

  if (updates.status && ["Invoiced", "Settled"].includes(updates.status)) {
    const currentEvent = await Event.findById(eventId);
    if (currentEvent) {
      const validCurrentStatuses = [
        "IN_PROGRESS",
        "Ongoing",
        "COMPLETED",
        "Completed",
        "Invoiced",
        "Settled",
      ];
      if (!validCurrentStatuses.includes(currentEvent.status)) {
        const error = new Error(
          "Only in-progress or completed events can be marked as paid / settled."
        );
        error.statusCode = 400;
        throw error;
      }
    }
  }

  if (isMarkingCompleted) {
    const now = new Date();
    updates.completedAt = now;
    if (userId) updates.completedBy = userId;
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

  if (isMarkingCompleted) {
    await autoCheckoutEventStaff(eventId, userId);
  }

  return event;
};

/**
 * Automatically check out all active staff attendances and complete duties when an event is completed.
 */
const autoCheckoutEventStaff = async (eventId, managerId = null, now = new Date()) => {
  const Duty = require("../models/duty.model");
  const Attendance = require("../models/attendance.model");

  const eventRecord = await Event.findById(eventId);
  if (!eventRecord) return 0;

  const eventIds = [eventRecord._id];
  if (eventRecord.booking) {
    eventIds.push(
      typeof eventRecord.booking === "object" && eventRecord.booking._id
        ? eventRecord.booking._id
        : eventRecord.booking
    );
  }

  // Find duties assigned to this event
  const duties = await Duty.find({ event: { $in: eventIds } });
  const dutyIds = duties.map((d) => d._id);

  // Find all active attendances for this event or duties
  const activeAttendances = await Attendance.find({
    $or: [{ event: { $in: eventIds } }, { duty: { $in: dutyIds } }],
    checkIn: { $ne: null },
    checkOut: null,
  });

  let checkedOutCount = 0;

  for (const attendance of activeAttendances) {
    if (attendance.isPaused) {
      const pausedAt = new Date(attendance.pausedAt || now);
      const pauseDurationMinutes = Math.max(
        0,
        Math.floor((now.getTime() - pausedAt.getTime()) / 60000)
      );
      attendance.totalPauseMinutes =
        (attendance.totalPauseMinutes || 0) + pauseDurationMinutes;
      attendance.isPaused = false;
      attendance.pausedAt = null;
    }

    const grossMinutes = Math.max(
      0,
      Math.floor((now.getTime() - new Date(attendance.checkIn).getTime()) / 60000)
    );
    const activeMinutes = Math.max(
      0,
      grossMinutes - (attendance.totalPauseMinutes || 0)
    );
    const activeHours = Math.round((activeMinutes / 60) * 100) / 100;

    attendance.checkOut = now;
    if (managerId) attendance.markedBy = managerId;
    attendance.activeMinutes = activeMinutes;
    attendance.totalHours = activeHours;

    if (!Array.isArray(attendance.sessions)) {
      attendance.sessions = [];
    }
    attendance.sessions.push({
      type: "CLOCK_OUT",
      timestamp: now,
      notes: "Auto-checkout upon event completion by manager",
    });

    const autoNote = "Auto-checked out upon event completion";
    attendance.notes = attendance.notes
      ? `${attendance.notes}\n${autoNote}`
      : autoNote;

    await attendance.save();

    // Update associated Duty
    if (attendance.duty) {
      const dutyRecord = await Duty.findById(attendance.duty);
      if (dutyRecord) {
        dutyRecord.totalHours = activeHours;
        if (dutyRecord.hourlyRate) {
          dutyRecord.totalAmount =
            Math.round((activeHours * dutyRecord.hourlyRate) * 100) / 100;
        }
        dutyRecord.status = "COMPLETED";
        await dutyRecord.save();
      }
    }

    checkedOutCount++;
  }

  // Transition all remaining active/assigned duties for this event to COMPLETED
  await Duty.updateMany(
    {
      event: { $in: eventIds },
      status: { $in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] },
    },
    {
      $set: { status: "COMPLETED" },
    }
  );

  return checkedOutCount;
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
  let autoCheckoutCount = 0;

  if (["Completed", "COMPLETED"].includes(status)) {
    if (!existingEvent.completedAt) {
      updateFields.completedAt = now;
      updateFields.completedBy = userId || null;
    }
    // Auto-checkout all currently checked-in staff for this event
    autoCheckoutCount = await autoCheckoutEventStaff(eventId, userId, now);
  }

  if (["Invoiced", "Settled"].includes(status)) {
    const validCurrentStatuses = [
      "IN_PROGRESS",
      "Ongoing",
      "COMPLETED",
      "Completed",
      "Invoiced",
      "Settled",
    ];
    if (!validCurrentStatuses.includes(existingEvent.status)) {
      const error = new Error(
        "Only in-progress or completed events can be marked as paid / settled."
      );
      error.statusCode = 400;
      throw error;
    }

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
    let actionDesc =
      ["Completed", "COMPLETED"].includes(status)
        ? `Event marked as Completed by ${actorName}${
            autoCheckoutCount > 0
              ? ` (${autoCheckoutCount} staff automatically checked out)`
              : ""
          }`
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
  const Duty = require("../models/duty.model");
  const { getIO } = require("../socket");
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
  const eventDateStr = !isNaN(eventDateObj.getTime()) ? eventDateObj.toISOString().slice(0, 10) : "";

  const isToday =
    now.getFullYear() === eventDateObj.getFullYear() &&
    now.getMonth() === eventDateObj.getMonth() &&
    now.getDate() === eventDateObj.getDate();

  if (!isToday && todayStr < eventDateStr) {
    const formattedDate = eventDateObj.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const error = new Error(`This event can only be started on ${formattedDate}.`);
    error.statusCode = 400;
    throw error;
  }

  if (!isToday && todayStr > eventDateStr) {
    event.status = "CANCELLED";
    if (!Array.isArray(event.activities)) event.activities = [];
    event.activities.push({
      action: "AUTO_CANCELLED",
      description: "Event cancelled: Scheduled event date has already passed without being started.",
      timestamp: now,
      performedBy: managerId || null,
    });
    await event.save();

    const error = new Error("Cannot start this event because its scheduled date has passed. The event has been marked as Cancelled.");
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

  // Find associated duties and broadcast real-time socket events to staff
  try {
    const associatedDuties = await Duty.find({
      $or: [
        { event: event._id },
        ...(event.booking ? [{ event: event.booking }] : []),
      ],
      status: { $nin: ["CANCELLED", "REJECTED"] },
    });

    const io = typeof getIO === "function" ? getIO() : null;
    if (io) {
      const payload = {
        eventId: String(event._id),
        bookingId: event.booking ? String(event.booking) : null,
        eventName: event.eventName,
        status: "IN_PROGRESS",
        startedAt: now,
        managerName,
      };

      // Broadcast to specific event room and general channels
      io.to(`event:${event._id}`).emit("event:started", payload);
      if (event.booking) {
        io.to(`event:${event.booking}`).emit("event:started", payload);
      }
      io.emit("event:started", payload);
      io.emit("duty:refresh", payload);

      // Notify individual staff rooms
      associatedDuties.forEach((duty) => {
        if (duty.staff) {
          io.to(`staff:${duty.staff}`).emit("event:started", payload);
          io.to(`staff:${duty.staff}`).emit("duty:updated", {
            dutyId: String(duty._id),
            eventId: String(event._id),
            status: duty.status,
            eventStatus: "IN_PROGRESS",
            canCheckIn: true,
          });
        }
      });
    }
  } catch (socketErr) {
    console.warn("Non-fatal Socket.IO broadcast warning in startEvent:", socketErr.message);
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
// Delete Event
// ==========================================

const deleteEvent = async (eventId) => {
  const Duty = require("../models/duty.model");
  const Attendance = require("../models/attendance.model");
  const Task = require("../models/task.model");

  const event = await Event.findByIdAndDelete(eventId);
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  await Promise.allSettled([
    Duty.deleteMany({ event: eventId }),
    Attendance.deleteMany({ event: eventId }),
    Task.deleteMany({ event: eventId }),
  ]);

  return { success: true, message: "Event deleted successfully" };
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
  deleteEvent,
  autoCancelOverdueUnstartedEvents,
};