const Duty = require("../models/duty.model");
const User = require("../models/user.model");
const Booking = require("../models/booking.model");
const Event = require("../models/event.model");

/**
 * Create a staff assignment / duty
 */
const createAssignment = async ({
  event,
  staff,
  dutyTitle,
  role = "",
  description = "",
  dutyDate,
  startTime,
  endTime,
  notes = "",
  assignedBy,
}) => {
  // ==========================================
  // CHECK EVENT
  // ==========================================

  let booking = await Booking.findById(event);

  // The manager UI works with event records, while Duty.event stores the
  // source booking. Accept either identifier and persist the booking ID.
  if (!booking) {
    const eventRecord = await Event.findById(event).select("booking");
    booking = eventRecord?.booking
      ? await Booking.findById(eventRecord.booking)
      : null;
  }

  if (!booking) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  // ==========================================
  // CHECK STAFF
  // ==========================================

  const staffMember = await User.findOne({
    _id: staff,
    role: "staff",
    isActive: true,
  });

  if (!staffMember) {
    const error = new Error(
      "Active staff member not found"
    );

    error.statusCode = 404;
    throw error;
  }

  // ==========================================
  // CHECK DUPLICATE ASSIGNMENT
  // ==========================================

  const existingAssignment =
    await Duty.findOne({
      event: booking._id,
      staff,
      status: { $ne: "CANCELLED" },
    });

  if (existingAssignment) {
    const error = new Error(
      "This staff member is already assigned to this event"
    );

    error.statusCode = 409;
    throw error;
  }

  const existingDutyOnDate = await Duty.findOne({
    staff,
    dutyDate,
    status: { $ne: "CANCELLED" },
  });

  if (existingDutyOnDate) {
    const error = new Error(
      "This staff member is already assigned to another event on this date"
    );

    error.statusCode = 409;
    throw error;
  }

  // ==========================================
  // CREATE DUTY
  // ==========================================

  const assignment = await Duty.create({
    event: booking._id,
    staff,
    dutyTitle: dutyTitle.trim(),
    role: role?.trim() || "",
    description: description?.trim() || "",
    dutyDate,
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    status: "ASSIGNED",
    notes: notes?.trim() || "",
    assignedBy,
  });

  return getAssignmentById(
    assignment._id
  );
};

/**
 * Get assignments
 */
const getAssignments = async ({
  event,
  staff,
  date,
  startDate,
  endDate,
  status,
  page = 1,
  limit = 20,
}) => {
  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const perPage = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const query = {};

  if (event) {
    try {
      let booking = await Booking.findById(event);
      if (!booking) {
        const eventRecord = await Event.findById(event).select("booking");
        if (eventRecord && eventRecord.booking) {
          query.event = eventRecord.booking;
        } else {
          query.event = event;
        }
      } else {
        query.event = booking._id;
      }
    } catch (err) {
      query.event = event;
    }
  }

  if (staff) {
    query.staff = staff;
  }

  if (status) {
    query.status = status;
  }

  if (date) {
    const start = new Date(date);

    if (Number.isNaN(start.getTime())) {
      const error = new Error(
        "Invalid date"
      );

      error.statusCode = 400;
      throw error;
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    query.dutyDate = {
      $gte: start,
      $lt: end,
    };
  } else if (startDate || endDate) {
    const range = {};

    if (startDate) {
      const start = new Date(startDate);

      if (Number.isNaN(start.getTime())) {
        const error = new Error("Invalid start date");
        error.statusCode = 400;
        throw error;
      }

      start.setHours(0, 0, 0, 0);
      range.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);

      if (Number.isNaN(end.getTime())) {
        const error = new Error("Invalid end date");
        error.statusCode = 400;
        throw error;
      }

      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }

    query.dutyDate = range;
  }

  const skip =
    (currentPage - 1) * perPage;

  const [assignments, total] =
    await Promise.all([
      Duty.find(query)
        .populate(
          "staff",
          "name username email employeeId department"
        )
        .populate(
          "event",
          "eventName eventType eventDate eventTime location status"
        )
        .populate(
          "assignedBy",
          "name username email"
        )
        .sort({
          dutyDate: 1,
          startTime: 1,
        })
        .skip(skip)
        .limit(perPage)
        .lean(),

      Duty.countDocuments(query),
    ]);

  return {
    assignments,
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

/**
 * Get assignment by ID
 */
const getAssignmentById = async (
  assignmentId
) => {
  const assignment =
    await Duty.findById(assignmentId)
      .populate(
        "staff",
        "name username email phone employeeId department location"
      )
      .populate(
        "event",
        "eventName eventType eventDate eventTime guests location status"
      )
      .populate(
        "assignedBy",
        "name username email"
      );

  if (!assignment) {
    const error = new Error(
      "Assignment not found"
    );

    error.statusCode = 404;
    throw error;
  }

  return assignment;
};

/**
 * Update assignment
 */
const updateAssignment = async (
  assignmentId,
  {
    staff,
    dutyTitle,
    role,
    description,
    dutyDate,
    startTime,
    endTime,
    status,
    notes,
  }
) => {
  const assignment =
    await Duty.findById(assignmentId);

  if (!assignment) {
    const error = new Error(
      "Assignment not found"
    );

    error.statusCode = 404;
    throw error;
  }

  // ------------------------------------------
  // STAFF
  // ------------------------------------------

  if (staff !== undefined) {
    const staffMember =
      await User.findOne({
        _id: staff,
        role: "staff",
        isActive: true,
      });

    if (!staffMember) {
      const error = new Error(
        "Active staff member not found"
      );

      error.statusCode = 404;
      throw error;
    }

    assignment.staff = staff;
  }

  // ------------------------------------------
  // TEXT FIELDS
  // ------------------------------------------

  if (dutyTitle !== undefined) {
    assignment.dutyTitle =
      dutyTitle.trim();
  }

  if (role !== undefined) {
    assignment.role =
      role.trim();
  }

  if (description !== undefined) {
    assignment.description =
      description.trim();
  }

  if (notes !== undefined) {
    assignment.notes =
      notes.trim();
  }

  // ------------------------------------------
  // SCHEDULE
  // ------------------------------------------

  if (dutyDate !== undefined) {
    assignment.dutyDate = dutyDate;
  }

  if (startTime !== undefined) {
    assignment.startTime =
      startTime.trim();
  }

  if (endTime !== undefined) {
    assignment.endTime =
      endTime.trim();
  }

  // ------------------------------------------
  // STATUS
  // ------------------------------------------

  if (status !== undefined) {
    const allowedStatuses = [
      "ASSIGNED",
      "ACCEPTED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      const error = new Error(
        "Invalid assignment status"
      );

      error.statusCode = 400;
      throw error;
    }

    assignment.status = status;
  }

  await assignment.save();

  return getAssignmentById(
    assignment._id
  );
};

/**
 * Delete / cancel assignment
 */
const deleteAssignment = async (
  assignmentId
) => {
  const assignment =
    await Duty.findById(assignmentId);

  if (!assignment) {
    const error = new Error(
      "Assignment not found"
    );

    error.statusCode = 404;
    throw error;
  }

  assignment.status = "CANCELLED";

  await assignment.save();

  return assignment;
};

module.exports = {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
};