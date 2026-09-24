const Duty = require("../models/duty.model");
const User = require("../models/user.model");
const Booking = require("../models/booking.model");
const Event = require("../models/event.model");
const {
  sendDutyAssignmentNotification,
  sendDutyResponseNotificationToManager,
} = require("../utils/notification.util");

/**
 * Calculates duty duration in decimal hours and total payout amount
 */
const computeDutyHoursAndAmount = (startTime = "", endTime = "", hourlyRate = 0) => {
  if (!startTime || !endTime) {
    const rate = Math.max(0, Number(hourlyRate) || 0);
    return { totalHours: 0, totalAmount: 0, hourlyRate: rate };
  }

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  if (isNaN(startH) || isNaN(endH)) {
    const rate = Math.max(0, Number(hourlyRate) || 0);
    return { totalHours: 0, totalAmount: 0, hourlyRate: rate };
  }

  let startMinutes = startH * 60 + (startM || 0);
  let endMinutes = endH * 60 + (endM || 0);

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60; // Overnight shift
  }

  const diffMinutes = Math.max(0, endMinutes - startMinutes);
  const totalHours = Math.round((diffMinutes / 60) * 100) / 100;
  const rate = Math.max(0, Number(hourlyRate) || 0);
  const totalAmount = Math.round(totalHours * rate * 100) / 100;

  return { totalHours, totalAmount, hourlyRate: rate };
};

/**
 * Create a staff assignment / duty
 */
const createAssignment = async ({
  event,
  staff,
  dutyTitle,
  role = "",
  department = "",
  serviceName = "",
  description = "",
  dutyDate,
  startTime,
  endTime,
  hourlyRate = 0,
  notes = "",
  checklist = [],
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
      status: { $nin: ["CANCELLED", "REJECTED"] },
    });

  if (existingAssignment) {
    const error = new Error(
      "This staff member is already actively assigned to this event"
    );

    error.statusCode = 409;
    throw error;
  }

  const existingDutyOnDate = await Duty.findOne({
    staff,
    dutyDate,
    status: { $nin: ["CANCELLED", "REJECTED"] },
  });

  if (existingDutyOnDate) {
    const error = new Error(
      "This staff member is already actively assigned to another event on this date"
    );

    error.statusCode = 409;
    throw error;
  }

  // Calculate working hours & total salary for this shift
  const { totalHours, totalAmount, hourlyRate: rate } =
    computeDutyHoursAndAmount(startTime, endTime, hourlyRate);

  // ==========================================
  // CREATE DUTY
  // ==========================================

  const assignment = await Duty.create({
    event: booking._id,
    staff,
    dutyTitle: dutyTitle.trim(),
    role: role?.trim() || "",
    department: department?.trim() || staffMember.department || "",
    serviceName: serviceName?.trim() || "",
    description: description?.trim() || "",
    dutyDate,
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    hourlyRate: rate,
    totalHours,
    totalAmount,
    paymentStatus: "PENDING",
    status: "ASSIGNED",
    notes: notes?.trim() || "",
    checklist: Array.isArray(checklist) ? checklist : [],
    assignedBy,
  });

  // Dispatch email & in-app notification to staff
  sendDutyAssignmentNotification({
    staff: staffMember,
    event: booking,
    duty: assignment,
    assignedBy,
  }).catch(() => {});

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
  dutyDate,
  startDate,
  endDate,
  status,
  paymentStatus,
  page = 1,
  limit = 20,
} = {}) => {
  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const perPage = Math.min(
    Math.max(Number(limit) || 20, 1),
    1000
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

  if (paymentStatus) {
    query.paymentStatus = paymentStatus;
  }

  const queryDate = date || dutyDate;
  if (queryDate) {
    const start = new Date(queryDate);

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
    department,
    serviceName,
    description,
    dutyDate,
    startTime,
    endTime,
    hourlyRate,
    status,
    notes,
    checklist,
    rejectionReason,
    paymentStatus,
    paymentReference,
    paidAt,
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

  if (checklist !== undefined) {
    assignment.checklist = checklist;
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
    if (staffMember.department && !department) {
      assignment.department = staffMember.department;
    }
  }

  // ------------------------------------------
  // TEXT FIELDS
  // ------------------------------------------

  if (dutyTitle !== undefined) {
    assignment.dutyTitle = dutyTitle.trim();
  }

  if (role !== undefined) {
    assignment.role = role.trim();
  }

  if (department !== undefined) {
    assignment.department = department.trim();
  }

  if (serviceName !== undefined) {
    assignment.serviceName = serviceName.trim();
  }

  if (description !== undefined) {
    assignment.description = description.trim();
  }

  if (notes !== undefined) {
    assignment.notes = notes.trim();
  }

  if (rejectionReason !== undefined) {
    assignment.rejectionReason = rejectionReason.trim();
  }

  // ------------------------------------------
  // SCHEDULE & SALARY
  // ------------------------------------------

  if (dutyDate !== undefined) {
    assignment.dutyDate = dutyDate;
  }

  let scheduleChanged = false;

  if (startTime !== undefined) {
    assignment.startTime = startTime.trim();
    scheduleChanged = true;
  }

  if (endTime !== undefined) {
    assignment.endTime = endTime.trim();
    scheduleChanged = true;
  }

  if (hourlyRate !== undefined) {
    assignment.hourlyRate = Math.max(0, Number(hourlyRate) || 0);
    scheduleChanged = true;
  }

  if (scheduleChanged) {
    const { totalHours, totalAmount, hourlyRate: rate } = computeDutyHoursAndAmount(
      assignment.startTime,
      assignment.endTime,
      assignment.hourlyRate
    );
    assignment.totalHours = totalHours;
    assignment.totalAmount = totalAmount;
    assignment.hourlyRate = rate;
  }

  // ------------------------------------------
  // STATUS
  // ------------------------------------------

  if (status !== undefined) {
    const allowedStatuses = [
      "ASSIGNED",
      "ACCEPTED",
      "REJECTED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];

    if (!allowedStatuses.includes(status)) {
      const error = new Error("Invalid assignment status");
      error.statusCode = 400;
      throw error;
    }

    assignment.status = status;
  }

  // ------------------------------------------
  // PAYMENT STATUS & REFERENCE
  // ------------------------------------------

  if (paymentStatus !== undefined) {
    if (!["PENDING", "PAID", "PROCESSING"].includes(paymentStatus)) {
      const error = new Error("Invalid payment status");
      error.statusCode = 400;
      throw error;
    }
    assignment.paymentStatus = paymentStatus;
    if (paymentStatus === "PAID" && !assignment.paidAt) {
      assignment.paidAt = paidAt ? new Date(paidAt) : new Date();
    } else if (paymentStatus === "PENDING") {
      assignment.paidAt = null;
    }
  }

  if (paymentReference !== undefined) {
    assignment.paymentReference = paymentReference.trim();
  }

  if (paidAt !== undefined && paidAt) {
    assignment.paidAt = new Date(paidAt);
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

/**
 * Accept an assigned shift (Staff or Manager)
 * Enforces:
 * 1. Only first-come staff can accept up to the event required staff capacity
 * 2. If accepted on this event for that day, staff becomes unavailable for other events that day
 */
const acceptAssignment = async (assignmentId, userId, userRole = "") => {
  const assignment = await Duty.findById(assignmentId);

  if (!assignment) {
    const error = new Error("Assignment not found");
    error.statusCode = 404;
    throw error;
  }

  const role = (userRole || "").toLowerCase();
  const isOwner = assignment.staff?.toString() === userId?.toString();
  const isManager = role === "admin" || role === "manager";

  if (!isOwner && !isManager) {
    const error = new Error("You are not authorized to accept this assignment");
    error.statusCode = 403;
    throw error;
  }

  if (assignment.status === "CANCELLED") {
    const error = new Error("Cannot accept a cancelled assignment");
    error.statusCode = 400;
    throw error;
  }

  // 1. Check if staff already has an ACCEPTED / IN_PROGRESS duty on this date for another event
  const conflictDuty = await Duty.findOne({
    _id: { $ne: assignment._id },
    staff: assignment.staff,
    dutyDate: assignment.dutyDate,
    status: { $in: ["ACCEPTED", "IN_PROGRESS", "COMPLETED"] },
  }).populate("event", "eventName");

  if (conflictDuty) {
    const otherEventName = conflictDuty.event?.eventName || "another event";
    const error = new Error(
      `You are already confirmed on duty for ${otherEventName} on this date. A staff member can only accept duties for one event per day.`
    );
    error.statusCode = 409;
    throw error;
  }

  // 2. Check Event Staff Capacity / Quota
  const booking = await Booking.findById(assignment.event);
  if (booking && booking.requiredStaff && booking.requiredStaff > 0) {
    const acceptedCount = await Duty.countDocuments({
      event: assignment.event,
      status: { $in: ["ACCEPTED", "IN_PROGRESS", "COMPLETED"] },
    });

    if (acceptedCount >= booking.requiredStaff && assignment.status !== "ACCEPTED") {
      const error = new Error(
        `All ${booking.requiredStaff} required staff positions for this event have already been filled by earlier team confirmations.`
      );
      error.statusCode = 409;
      throw error;
    }
  }

  assignment.status = "ACCEPTED";
  assignment.respondedAt = new Date();
  await assignment.save();

  const populated = await getAssignmentById(assignment._id);

  // Notify manager that staff has accepted
  sendDutyResponseNotificationToManager({
    staff: populated.staff,
    event: populated.event,
    duty: populated,
    status: "ACCEPTED",
  }).catch(() => {});

  return populated;
};

/**
 * Reject an assigned shift with reason notes (Staff or Manager)
 */
const rejectAssignment = async (assignmentId, reason, userId, userRole = "") => {
  const assignment = await Duty.findById(assignmentId);

  if (!assignment) {
    const error = new Error("Assignment not found");
    error.statusCode = 404;
    throw error;
  }

  const role = (userRole || "").toLowerCase();
  const isOwner = assignment.staff?.toString() === userId?.toString();
  const isManager = role === "admin" || role === "manager";

  if (!isOwner && !isManager) {
    const error = new Error("You are not authorized to decline this assignment");
    error.statusCode = 403;
    throw error;
  }

  if (assignment.status === "CANCELLED" || assignment.status === "COMPLETED") {
    const error = new Error("Cannot decline an assignment that is cancelled or completed");
    error.statusCode = 400;
    throw error;
  }

  const normalizedReason = (reason || "").trim();
  if (!normalizedReason) {
    const error = new Error("Please provide a reason for declining this duty");
    error.statusCode = 400;
    throw error;
  }

  assignment.status = "REJECTED";
  assignment.rejectionReason = normalizedReason;
  assignment.respondedAt = new Date();
  await assignment.save();

  const populated = await getAssignmentById(assignment._id);

  // Notify manager that staff has rejected with reason
  sendDutyResponseNotificationToManager({
    staff: populated.staff,
    event: populated.event,
    duty: populated,
    status: "REJECTED",
    reason: normalizedReason,
  }).catch(() => {});

  return populated;
};

/**
 * Update assignment payment status (Manager Only)
 */
const updateAssignmentPayment = async (
  assignmentId,
  { paymentStatus, paymentReference, paidAt }
) => {
  const assignment = await Duty.findById(assignmentId);

  if (!assignment) {
    const error = new Error("Assignment not found");
    error.statusCode = 404;
    throw error;
  }

  if (paymentStatus !== undefined) {
    if (!["PENDING", "PAID", "PROCESSING"].includes(paymentStatus)) {
      const error = new Error("Invalid payment status");
      error.statusCode = 400;
      throw error;
    }
    assignment.paymentStatus = paymentStatus;
    if (paymentStatus === "PAID" && !assignment.paidAt) {
      assignment.paidAt = paidAt ? new Date(paidAt) : new Date();
    } else if (paymentStatus === "PENDING") {
      assignment.paidAt = null;
    }
  }

  if (paymentReference !== undefined) {
    assignment.paymentReference = paymentReference.trim();
  }

  if (paidAt !== undefined && paidAt) {
    assignment.paidAt = new Date(paidAt);
  }

  await assignment.save();
  return getAssignmentById(assignment._id);
};

/**
 * Update assignment sub-task checklist
 */
const updateAssignmentChecklist = async (
  assignmentId,
  checklist,
  userId,
  userRole = ""
) => {
  const assignment = await Duty.findById(assignmentId);

  if (!assignment) {
    const error = new Error("Assignment not found");
    error.statusCode = 404;
    throw error;
  }

  const role = (userRole || "").toLowerCase();
  const isOwner = assignment.staff?.toString() === userId?.toString();
  const isManager = role === "admin" || role === "manager";

  if (!isOwner && !isManager) {
    const error = new Error("You are not authorized to update this checklist");
    error.statusCode = 403;
    throw error;
  }

  assignment.checklist = Array.isArray(checklist) ? checklist : [];
  await assignment.save();

  return getAssignmentById(assignment._id);
};

module.exports = {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  acceptAssignment,
  rejectAssignment,
  updateAssignmentPayment,
  updateAssignmentChecklist,
  computeDutyHoursAndAmount,
};