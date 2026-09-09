const mongoose = require("mongoose");

const Event = require("../models/event.model");
const User = require("../models/user.model");

/**
 * Check whether an ID is a valid MongoDB ObjectId
 */
const validateObjectId = (id, fieldName = "ID") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }
};

/**
 * Get all events for Manager dashboard
 *
 * Supports:
 * - search
 * - event type
 * - status
 * - date
 */
const getAllEvents = async ({
  search,
  type,
  status,
  date,
} = {}) => {
  const filter = {};

  // Search by event name
  if (search?.trim()) {
    filter.name = {
      $regex: search.trim(),
      $options: "i",
    };
  }

  // Filter by event type
  if (type && type !== "All Event Types") {
    filter.type = type;
  }

  // Filter by event status
  if (status && status !== "All Statuses") {
    filter.status = status;
  }

  // Filter by exact date
  if (date) {
    const startDate = new Date(date);

    if (Number.isNaN(startDate.getTime())) {
      const error = new Error("Invalid event date");
      error.statusCode = 400;
      throw error;
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    filter.date = {
      $gte: startDate,
      $lt: endDate,
    };
  }

  const events = await Event.find(filter)
    .populate(
      "customer",
      "name email phone"
    )
    .populate(
      "assignedStaff.staff",
      "name email phone"
    )
    .sort({
      date: 1,
      createdAt: -1,
    })
    .lean();

  return events;
};

/**
 * Get event statistics for Manager dashboard
 */
const getEventStats = async () => {
  const now = new Date();

  const [
    total,
    upcoming,
    confirmed,
    pending,
  ] = await Promise.all([
    Event.countDocuments(),

    Event.countDocuments({
      date: {
        $gte: now,
      },
      status: {
        $ne: "Cancelled",
      },
    }),

    Event.countDocuments({
      status: "Confirmed",
    }),

    Event.countDocuments({
      status: "Pending",
    }),
  ]);

  return {
    total,
    upcoming,
    confirmed,
    pending,
  };
};

/**
 * Get a single event by ID
 */
const getEventById = async (eventId) => {
  validateObjectId(eventId, "event ID");

  const event = await Event.findById(eventId)
    .populate(
      "customer",
      "name email phone location"
    )
    .populate(
      "assignedStaff.staff",
      "name email phone"
    )
    .lean();

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  return event;
};

/**
 * Create a new event
 */
const createEvent = async ({
  name,
  type,
  customer,
  date,
  time,
  location,
  guests,
  package: eventPackage,
  amount,
  status = "Pending",
  description,
  assignedStaff = [],
}) => {
  // Validate customer ID if provided
  if (customer) {
    validateObjectId(customer, "customer ID");
  }

  // Validate assigned staff
  const validatedStaff = await validateAssignedStaff(
    assignedStaff
  );

  const event = await Event.create({
    name: name.trim(),
    type: type.trim(),
    customer: customer || undefined,
    date,
    time: time.trim(),
    location: location.trim(),
    guests: guests ?? 0,
    package: eventPackage?.trim() || "",
    amount: amount ?? 0,
    status,
    description: description?.trim() || "",
    assignedStaff: validatedStaff,
  });

  return event;
};

/**
 * Update an existing event
 */
const updateEvent = async (
  eventId,
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
) => {
  validateObjectId(eventId, "event ID");

  const event = await Event.findById(eventId);

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  if (customer !== undefined && customer !== null && customer !== "") {
    validateObjectId(customer, "customer ID");
    event.customer = customer;
  }

  if (customer === null || customer === "") {
    event.customer = undefined;
  }

  if (name !== undefined) {
    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      const error = new Error(
        "Event name must be at least 2 characters"
      );

      error.statusCode = 400;
      throw error;
    }

    event.name = trimmedName;
  }

  if (type !== undefined) {
    event.type = type.trim();
  }

  if (date !== undefined) {
    event.date = date;
  }

  if (time !== undefined) {
    event.time = time.trim();
  }

  if (location !== undefined) {
    event.location = location.trim();
  }

  if (guests !== undefined) {
    event.guests = guests;
  }

  if (eventPackage !== undefined) {
    event.package = eventPackage.trim();
  }

  if (amount !== undefined) {
    event.amount = amount;
  }

  if (status !== undefined) {
    event.status = status;
  }

  if (description !== undefined) {
    event.description = description.trim();
  }

  if (assignedStaff !== undefined) {
    event.assignedStaff =
      await validateAssignedStaff(
        assignedStaff
      );
  }

  await event.save();

  return event;
};

/**
 * Update only the overall event status
 */
const updateEventStatus = async (
  eventId,
  status
) => {
  validateObjectId(eventId, "event ID");

  const allowedStatuses = [
    "Pending",
    "Confirmed",
    "Completed",
    "Cancelled",
  ];

  if (!allowedStatuses.includes(status)) {
    const error = new Error(
      `Invalid event status. Allowed values: ${allowedStatuses.join(
        ", "
      )}`
    );

    error.statusCode = 400;
    throw error;
  }

  const event = await Event.findById(eventId);

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  event.status = status;

  await event.save();

  return event;
};

/**
 * Delete an event
 */
const deleteEvent = async (eventId) => {
  validateObjectId(eventId, "event ID");

  const event = await Event.findById(eventId);

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  await event.deleteOne();

  return {
    id: event._id,
  };
};

/**
 * Assign staff to an event
 */
const assignStaff = async (
  eventId,
  assignedStaff
) => {
  validateObjectId(eventId, "event ID");

  const event = await Event.findById(eventId);

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const validatedStaff =
    await validateAssignedStaff(
      assignedStaff
    );

  event.assignedStaff = validatedStaff;

  await event.save();

  return event;
};

/**
 * Validate staff assignments
 */
const validateAssignedStaff = async (
  assignedStaff = []
) => {
  if (!Array.isArray(assignedStaff)) {
    const error = new Error(
      "assignedStaff must be an array"
    );

    error.statusCode = 400;
    throw error;
  }

  if (assignedStaff.length === 0) {
    return [];
  }

  const staffIds = assignedStaff.map(
    (assignment) => {
      if (
        !assignment ||
        !assignment.staff
      ) {
        const error = new Error(
          "Each staff assignment must contain a staff ID"
        );

        error.statusCode = 400;
        throw error;
      }

      validateObjectId(
        assignment.staff,
        "staff ID"
      );

      return assignment.staff.toString();
    }
  );

  // Prevent duplicate staff assignments
  const uniqueStaffIds = [
    ...new Set(staffIds),
  ];

  if (
    uniqueStaffIds.length !== staffIds.length
  ) {
    const error = new Error(
      "A staff member cannot be assigned to the same event more than once"
    );

    error.statusCode = 400;
    throw error;
  }

  // Make sure every staff member exists
  // and is actually a staff account
  const staffUsers = await User.find({
    _id: {
      $in: uniqueStaffIds,
    },
    role: "staff",
    isActive: true,
  }).select("_id");

  if (
    staffUsers.length !== uniqueStaffIds.length
  ) {
    const error = new Error(
      "One or more assigned staff members are invalid or inactive"
    );

    error.statusCode = 400;
    throw error;
  }

  return assignedStaff.map(
    (assignment) => ({
      staff: assignment.staff,
      status:
        assignment.status || "Pending",
    })
  );
};

/**
 * Get events assigned to the logged-in staff member
 */
const getMyEvents = async (userId) => {
  validateObjectId(userId, "user ID");

  const events = await Event.find({
    "assignedStaff.staff": userId,
  })
    .sort({
      date: 1,
    })
    .lean();

  return events.map((event) => {
    const assignment =
      event.assignedStaff.find(
        (item) =>
          item.staff.toString() ===
          userId.toString()
      );

    return {
      id: event._id,
      name: event.name,
      type: event.type,
      date: event.date,
      time: event.time,
      location: event.location,
      guests: event.guests,
      status:
        assignment?.status || "Pending",
    };
  });
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