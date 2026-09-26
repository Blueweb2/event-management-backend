const Attendance = require("../models/attendance.model");
const Duty = require("../models/duty.model");

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Populate fields shared across most queries.
 */
const defaultPopulate = (query) =>
  query
    .populate("staff", "name username employeeId department phone")
    .populate("event", "eventName eventType eventDate location")
    .populate("duty", "dutyTitle role dutyDate startTime endTime status")
    .populate("markedBy", "name username role");

/**
 * Determine PRESENT vs LATE based on duty startTime.
 */
const resolveStatus = (dutyRecord, now) => {
  if (!dutyRecord.startTime) return "PRESENT";
  const [hours, minutes] = dutyRecord.startTime.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "PRESENT";
  const expected = new Date(dutyRecord.dutyDate);
  expected.setHours(hours, minutes, 0, 0);
  return now > expected ? "LATE" : "PRESENT";
};

const assertDutyIsToday = (dutyRecord) => {
  const today = new Date();
  const dutyDate = new Date(dutyRecord.dutyDate);

  const isToday =
    today.getFullYear() === dutyDate.getFullYear() &&
    today.getMonth() === dutyDate.getMonth() &&
    today.getDate() === dutyDate.getDate();

  if (!isToday) {
    const error = new Error("Attendance can only be recorded on the duty date");
    error.statusCode = 400;
    throw error;
  }
};

/**
 * Enforce check-in window: Only allowed on event date, starting 15 minutes before startTime.
 */
const assertCheckInWindow = (dutyRecord) => {
  assertDutyIsToday(dutyRecord);

  const now = new Date();
  const dutyDate = new Date(dutyRecord.dutyDate);

  if (dutyRecord.startTime) {
    const [hours, minutes] = dutyRecord.startTime.split(":").map(Number);
    if (Number.isInteger(hours) && Number.isInteger(minutes)) {
      const windowStart = new Date(dutyDate);
      windowStart.setHours(hours, minutes - 15, 0, 0);

      if (now < windowStart) {
        const timeStr = windowStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const error = new Error(`Check-in opens 15 minutes before the event start time (at ${timeStr})`);
        error.statusCode = 400;
        throw error;
      }
    }
  }
};

const assertDutyHasStarted = (dutyRecord) => {
  const today = new Date();
  const dutyDate = new Date(dutyRecord.dutyDate);
  today.setHours(0, 0, 0, 0);
  dutyDate.setHours(0, 0, 0, 0);

  if (dutyDate > today) {
    const error = new Error("A future duty cannot be marked absent");
    error.statusCode = 400;
    throw error;
  }
};

// ─────────────────────────────────────────────
// CHECK IN
// POST /api/attendance/check-in
// ─────────────────────────────────────────────

const checkIn = async ({ duty, markedBy = null, staffId = null, notes = "" }) => {
  const Event = require("../models/event.model");
  const User = require("../models/user.model");

  const dutyRecord = await Duty.findById(duty);
  if (!dutyRecord) {
    const e = new Error("Duty not found");
    e.statusCode = 404;
    throw e;
  }

  if (staffId && String(dutyRecord.staff) !== String(staffId)) {
    const e = new Error("You can only check in for your assigned duty");
    e.statusCode = 403;
    throw e;
  }

  // 1. Verify event exists and is started by manager
  const eventRecord = await Event.findOne({
    $or: [{ _id: dutyRecord.event }, { booking: dutyRecord.event }],
  });

  if (!eventRecord) {
    const e = new Error("The event does not exist.");
    e.statusCode = 404;
    throw e;
  }

  const isEventStarted =
    (eventRecord.status === "IN_PROGRESS" || eventRecord.status === "Ongoing") &&
    Boolean(eventRecord.startedAt);

  if (!isEventStarted) {
    const e = new Error("The event has not been started by the manager yet.");
    e.statusCode = 400;
    throw e;
  }

  assertCheckInWindow(dutyRecord);

  const existing = await Attendance.findOne({ duty });
  if (existing?.checkIn) {
    const e = new Error("Staff member has already checked in");
    e.statusCode = 409;
    throw e;
  }

  const now = new Date();
  const status = resolveStatus(dutyRecord, now);

  const attendance =
    existing ||
    new Attendance({
      duty,
      staff: dutyRecord.staff,
      event: dutyRecord.event,
      date: dutyRecord.dutyDate,
    });

  attendance.checkIn = now;
  attendance.status = status;
  attendance.isPaused = false;
  attendance.totalPauseMinutes = 0;
  attendance.markedBy = markedBy;
  
  if (notes) {
    attendance.notes = notes;
  }

  if (!Array.isArray(attendance.sessions)) {
    attendance.sessions = [];
  }
  attendance.sessions.push({
    type: "CLOCK_IN",
    timestamp: now,
    notes: notes || "Staff checked in",
  });

  await attendance.save();

  dutyRecord.status = "IN_PROGRESS";
  await dutyRecord.save();

  // Log Event Audit Activity
  const staffUser = await User.findById(dutyRecord.staff).select("name");
  const staffName = staffUser?.name || "Staff";
  if (!Array.isArray(eventRecord.activities)) {
    eventRecord.activities = [];
  }
  eventRecord.activities.push({
    action: "STAFF_CLOCK_IN",
    description: `${staffName} clocked in`,
    timestamp: now,
    performedBy: dutyRecord.staff,
  });
  await eventRecord.save();

  return defaultPopulate(Attendance.findById(attendance._id));
};

// ─────────────────────────────────────────────
// PAUSE SHIFT
// POST /api/attendance/pause
// ─────────────────────────────────────────────

const pauseShift = async ({ duty, markedBy = null, staffId = null, reason = "Break", notes = "" }) => {
  const Event = require("../models/event.model");
  const User = require("../models/user.model");

  const dutyRecord = await Duty.findById(duty);
  if (!dutyRecord) {
    const e = new Error("Duty not found");
    e.statusCode = 404;
    throw e;
  }

  if (staffId && String(dutyRecord.staff) !== String(staffId)) {
    const e = new Error("You can only pause your assigned duty");
    e.statusCode = 403;
    throw e;
  }

  const attendance = await Attendance.findOne({ duty });
  if (!attendance || !attendance.checkIn) {
    const e = new Error("Staff member must check in before pausing the shift");
    e.statusCode = 400;
    throw e;
  }
  if (attendance.checkOut) {
    const e = new Error("Cannot pause a completed shift");
    e.statusCode = 400;
    throw e;
  }
  if (attendance.isPaused) {
    const e = new Error("Shift is already paused");
    e.statusCode = 409;
    throw e;
  }

  const now = new Date();
  attendance.isPaused = true;
  attendance.pausedAt = now;

  if (!Array.isArray(attendance.sessions)) {
    attendance.sessions = [];
  }
  attendance.sessions.push({
    type: "PAUSE",
    timestamp: now,
    reason: reason || "Break",
    notes: notes || "",
  });

  if (notes) {
    attendance.notes = attendance.notes ? `${attendance.notes}\n[Pause - ${reason}]: ${notes}` : `[Pause - ${reason}]: ${notes}`;
  }

  await attendance.save();

  // Log Event Audit Activity
  const staffUser = await User.findById(dutyRecord.staff).select("name");
  const staffName = staffUser?.name || "Staff";
  const eventRecord = await Event.findOne({
    $or: [{ _id: dutyRecord.event }, { booking: dutyRecord.event }],
  });
  if (eventRecord) {
    if (!Array.isArray(eventRecord.activities)) eventRecord.activities = [];
    eventRecord.activities.push({
      action: "STAFF_PAUSE",
      description: `${staffName} paused shift (${reason || "Break"})`,
      timestamp: now,
      performedBy: dutyRecord.staff,
    });
    await eventRecord.save();
  }

  return defaultPopulate(Attendance.findById(attendance._id));
};

// ─────────────────────────────────────────────
// RESUME SHIFT
// POST /api/attendance/resume
// ─────────────────────────────────────────────

const resumeShift = async ({ duty, markedBy = null, staffId = null, notes = "" }) => {
  const Event = require("../models/event.model");
  const User = require("../models/user.model");

  const dutyRecord = await Duty.findById(duty);
  if (!dutyRecord) {
    const e = new Error("Duty not found");
    e.statusCode = 404;
    throw e;
  }

  if (staffId && String(dutyRecord.staff) !== String(staffId)) {
    const e = new Error("You can only resume your assigned duty");
    e.statusCode = 403;
    throw e;
  }

  const attendance = await Attendance.findOne({ duty });
  if (!attendance || !attendance.isPaused) {
    const e = new Error("Shift is not currently paused");
    e.statusCode = 400;
    throw e;
  }

  const now = new Date();
  const pausedAt = new Date(attendance.pausedAt || now);
  const pauseDurationMinutes = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 60000));

  const lastPauseSession = Array.isArray(attendance.sessions)
    ? [...attendance.sessions].reverse().find((s) => s.type === "PAUSE")
    : null;
  const pauseReason = lastPauseSession?.reason || "Break";

  attendance.isPaused = false;
  attendance.totalPauseMinutes = (attendance.totalPauseMinutes || 0) + pauseDurationMinutes;
  attendance.pausedAt = null;

  if (!Array.isArray(attendance.pauseHistory)) {
    attendance.pauseHistory = [];
  }
  attendance.pauseHistory.push({
    pausedAt,
    resumedAt: now,
    durationMinutes: pauseDurationMinutes,
    reason: pauseReason,
  });

  if (!Array.isArray(attendance.sessions)) {
    attendance.sessions = [];
  }
  attendance.sessions.push({
    type: "RESUME",
    timestamp: now,
    notes: notes || "",
  });

  if (notes) {
    attendance.notes = attendance.notes ? `${attendance.notes}\n[Resume]: ${notes}` : `[Resume]: ${notes}`;
  }

  await attendance.save();

  // Log Event Audit Activity
  const staffUser = await User.findById(dutyRecord.staff).select("name");
  const staffName = staffUser?.name || "Staff";
  const eventRecord = await Event.findOne({
    $or: [{ _id: dutyRecord.event }, { booking: dutyRecord.event }],
  });
  if (eventRecord) {
    if (!Array.isArray(eventRecord.activities)) eventRecord.activities = [];
    eventRecord.activities.push({
      action: "STAFF_RESUME",
      description: `${staffName} resumed shift`,
      timestamp: now,
      performedBy: dutyRecord.staff,
    });
    await eventRecord.save();
  }

  return defaultPopulate(Attendance.findById(attendance._id));
};

// ─────────────────────────────────────────────
// CHECK OUT
// POST /api/attendance/check-out
// ─────────────────────────────────────────────

const checkOut = async ({ duty, markedBy = null, staffId = null, notes = "" }) => {
  const Event = require("../models/event.model");
  const User = require("../models/user.model");

  const dutyRecord = await Duty.findById(duty);
  if (!dutyRecord) {
    const e = new Error("Duty not found");
    e.statusCode = 404;
    throw e;
  }

  if (staffId && String(dutyRecord.staff) !== String(staffId)) {
    const e = new Error("You can only check out for your assigned duty");
    e.statusCode = 403;
    throw e;
  }

  assertDutyIsToday(dutyRecord);

  const attendance = await Attendance.findOne({ duty });

  if (!attendance) {
    const e = new Error("Attendance record not found. Staff must check in first.");
    e.statusCode = 404;
    throw e;
  }
  if (!attendance.checkIn) {
    const e = new Error("Staff member has not checked in yet");
    e.statusCode = 400;
    throw e;
  }
  if (attendance.checkOut) {
    const e = new Error("Staff member has already checked out");
    e.statusCode = 409;
    throw e;
  }

  const now = new Date();

  if (attendance.isPaused) {
    const pausedAt = new Date(attendance.pausedAt || now);
    const pauseDurationMinutes = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 60000));
    attendance.totalPauseMinutes = (attendance.totalPauseMinutes || 0) + pauseDurationMinutes;
    attendance.isPaused = false;
    attendance.pausedAt = null;
  }

  attendance.checkOut = now;
  attendance.markedBy = markedBy || attendance.markedBy;

  const grossMinutes = Math.max(0, Math.floor((now.getTime() - new Date(attendance.checkIn).getTime()) / 60000));
  const activeMinutes = Math.max(0, grossMinutes - (attendance.totalPauseMinutes || 0));
  const activeHours = Math.round((activeMinutes / 60) * 100) / 100;

  attendance.activeMinutes = activeMinutes;
  attendance.totalHours = activeHours;

  if (!Array.isArray(attendance.sessions)) {
    attendance.sessions = [];
  }
  attendance.sessions.push({
    type: "CLOCK_OUT",
    timestamp: now,
    notes: notes || "",
  });

  if (notes) {
    attendance.notes = attendance.notes 
      ? attendance.notes + "\n" + notes 
      : notes;
  }

  await attendance.save();

  // Recalculate Duty record total hours & total compensation
  dutyRecord.totalHours = activeHours;
  if (dutyRecord.hourlyRate) {
    dutyRecord.totalAmount = Math.round((activeHours * dutyRecord.hourlyRate) * 100) / 100;
  }
  dutyRecord.status = "COMPLETED";
  await dutyRecord.save();

  // Log Event Audit Activity
  const staffUser = await User.findById(dutyRecord.staff).select("name");
  const staffName = staffUser?.name || "Staff";
  const eventRecord = await Event.findOne({
    $or: [{ _id: dutyRecord.event }, { booking: dutyRecord.event }],
  });
  if (eventRecord) {
    if (!Array.isArray(eventRecord.activities)) eventRecord.activities = [];
    eventRecord.activities.push({
      action: "STAFF_CLOCK_OUT",
      description: `${staffName} clocked out (${activeHours} active hrs logged)`,
      timestamp: now,
      performedBy: dutyRecord.staff,
    });
    await eventRecord.save();
  }

  return defaultPopulate(Attendance.findById(attendance._id));
};

// ─────────────────────────────────────────────
// MARK ABSENT
// POST /api/attendance/absent
// ─────────────────────────────────────────────

const markAbsent = async ({ duty, markedBy = null, notes = "" }) => {
  const dutyRecord = await Duty.findById(duty);
  if (!dutyRecord) {
    const e = new Error("Duty not found");
    e.statusCode = 404;
    throw e;
  }

  assertDutyHasStarted(dutyRecord);

  const attendance = await Attendance.findOneAndUpdate(
    { duty },
    {
      $set: {
        duty,
        staff: dutyRecord.staff,
        event: dutyRecord.event,
        date: dutyRecord.dutyDate,
        status: "ABSENT",
        notes: notes?.trim() || "",
        markedBy,
        checkIn: null,
        checkOut: null,
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

  return defaultPopulate(Attendance.findById(attendance._id));
};

// ─────────────────────────────────────────────
// BULK MARK
// POST /api/attendance/bulk
// ─────────────────────────────────────────────

const bulkMark = async ({
  duties = [],
  status = "ABSENT",
  notes = "",
  markedBy = null,
}) => {
  if (!duties.length) {
    const e = new Error("At least one duty ID is required");
    e.statusCode = 400;
    throw e;
  }

  if (!["ABSENT", "PRESENT"].includes(status)) {
    const e = new Error('Status must be "ABSENT" or "PRESENT"');
    e.statusCode = 400;
    throw e;
  }

  const dutyRecords = await Duty.find({ _id: { $in: duties } });

  if (!dutyRecords.length) {
    const e = new Error("No valid duties found");
    e.statusCode = 404;
    throw e;
  }

  const results = await Promise.allSettled(
    dutyRecords.map(async (dr) => {
      const setFields = {
        duty: dr._id,
        staff: dr.staff,
        event: dr.event,
        date: dr.dutyDate,
        status,
        notes: notes?.trim() || "",
        markedBy,
      };

      if (status === "ABSENT") {
        setFields.checkIn = null;
        setFields.checkOut = null;
      }

      return Attendance.findOneAndUpdate(
        { duty: dr._id },
        { $set: setFields },
        { new: true, upsert: true, runValidators: true }
      );
    })
  );

  const succeeded = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  const failed = results
    .filter((r) => r.status === "rejected")
    .map((r, i) => ({ dutyId: String(duties[i]), reason: r.reason?.message }));

  return { succeeded, failed, total: duties.length };
};

// ─────────────────────────────────────────────
// GET ATTENDANCE LIST
// GET /api/attendance
// ─────────────────────────────────────────────

const getAttendance = async ({
  staff,
  event,
  duty,
  date,
  dateFrom,
  dateTo,
  status,
  page = 1,
  limit = 50,
} = {}) => {
  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = Math.min(Math.max(Number(limit) || 50, 1), 1000);

  const query = {};

  if (staff) query.staff = staff;
  if (event) query.event = event;
  if (duty) query.duty = duty;
  if (status) query.status = status;

  if (date && !dateFrom && !dateTo) {
    const start = new Date(date);
    if (Number.isNaN(start.getTime())) {
      const e = new Error("Invalid date");
      e.statusCode = 400;
      throw e;
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    query.date = { $gte: start, $lt: end };
  }

  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (Number.isNaN(from.getTime())) {
        const e = new Error("Invalid dateFrom");
        e.statusCode = 400;
        throw e;
      }
      query.date.$gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (Number.isNaN(to.getTime())) {
        const e = new Error("Invalid dateTo");
        e.statusCode = 400;
        throw e;
      }
      to.setDate(to.getDate() + 1);
      query.date.$lt = to;
    }
  }

  const skip = (currentPage - 1) * perPage;

  const [attendance, total] = await Promise.all([
    defaultPopulate(
      Attendance.find(query).sort({ date: -1, checkIn: 1 }).skip(skip).limit(perPage)
    ).lean(),
    Attendance.countDocuments(query),
  ]);

  return {
    attendance,
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
};

// ─────────────────────────────────────────────
// GET SINGLE ATTENDANCE RECORD
// GET /api/attendance/:id
// ─────────────────────────────────────────────

const getAttendanceById = async (id) => {
  const attendance = await defaultPopulate(Attendance.findById(id));

  if (!attendance) {
    const e = new Error("Attendance record not found");
    e.statusCode = 404;
    throw e;
  }

  return attendance;
};

// ─────────────────────────────────────────────
// UPDATE ATTENDANCE (manual correction)
// PATCH /api/attendance/:id
// ─────────────────────────────────────────────

const updateAttendance = async (id, updates, markedBy = null) => {
  const attendance = await Attendance.findById(id);

  if (!attendance) {
    const e = new Error("Attendance record not found");
    e.statusCode = 404;
    throw e;
  }

  const allowed = ["checkIn", "checkOut", "status", "notes"];

  allowed.forEach((field) => {
    if (updates[field] !== undefined) {
      if (
        (field === "checkIn" || field === "checkOut") &&
        updates[field]
      ) {
        attendance[field] = new Date(updates[field]);
      } else {
        attendance[field] = updates[field];
      }
    }
  });

  if (markedBy) attendance.markedBy = markedBy;

  await attendance.save();

  return defaultPopulate(Attendance.findById(attendance._id));
};

// ─────────────────────────────────────────────
// DELETE ATTENDANCE
// DELETE /api/attendance/:id
// ─────────────────────────────────────────────

const deleteAttendance = async (id) => {
  const attendance = await Attendance.findByIdAndDelete(id);

  if (!attendance) {
    const e = new Error("Attendance record not found");
    e.statusCode = 404;
    throw e;
  }

  return attendance;
};

// ─────────────────────────────────────────────
// STAFF SUMMARY
// GET /api/attendance/summary/staff/:staffId
// ─────────────────────────────────────────────

const getStaffSummary = async ({ staffId, dateFrom, dateTo } = {}) => {
  if (!staffId) {
    const e = new Error("Staff ID is required");
    e.statusCode = 400;
    throw e;
  }

  const match = { staff: staffId };

  if (dateFrom || dateTo) {
    match.date = {};
    if (dateFrom) match.date.$gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      match.date.$lt = to;
    }
  }

  const [summary] = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$staff",
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "PRESENT"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "LATE"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "ABSENT"] }, 1, 0] } },
        avgDurationMinutes: {
          $avg: {
            $cond: [
              { $and: [{ $ne: ["$checkIn", null] }, { $ne: ["$checkOut", null] }] },
              { $divide: [{ $subtract: ["$checkOut", "$checkIn"] }, 60000] },
              null,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        staffId: "$_id",
        total: 1,
        present: 1,
        late: 1,
        absent: 1,
        attendanceRate: {
          $cond: [
            { $gt: ["$total", 0] },
            {
              $multiply: [
                { $divide: [{ $add: ["$present", "$late"] }, "$total"] },
                100,
              ],
            },
            0,
          ],
        },
        avgDurationMinutes: 1,
      },
    },
  ]);

  return (
    summary || {
      staffId,
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
      attendanceRate: 0,
      avgDurationMinutes: null,
    }
  );
};

// ─────────────────────────────────────────────
// EVENT SUMMARY
// GET /api/attendance/summary/event/:eventId
// ─────────────────────────────────────────────

const getEventSummary = async ({ eventId } = {}) => {
  if (!eventId) {
    const e = new Error("Event ID is required");
    e.statusCode = 400;
    throw e;
  }

  const [summary] = await Attendance.aggregate([
    { $match: { event: eventId } },
    {
      $group: {
        _id: "$event",
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "PRESENT"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "LATE"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "ABSENT"] }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        eventId: "$_id",
        total: 1,
        present: 1,
        late: 1,
        absent: 1,
        attendanceRate: {
          $cond: [
            { $gt: ["$total", 0] },
            {
              $multiply: [
                { $divide: [{ $add: ["$present", "$late"] }, "$total"] },
                100,
              ],
            },
            0,
          ],
        },
      },
    },
  ]);

  return (
    summary || {
      eventId,
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
      attendanceRate: 0,
    }
  );
};

// ─────────────────────────────────────────────
// MY ATTENDANCE (Staff self-view)
// GET /api/attendance/me
// ─────────────────────────────────────────────

const getMyAttendance = async ({
  staffId,
  dateFrom,
  dateTo,
  status,
  page = 1,
  limit = 20,
} = {}) => {
  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = Math.min(Math.max(Number(limit) || 20, 1), 1000);

  const query = { staff: staffId };

  if (status) query.status = status;

  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      query.date.$lt = to;
    }
  }

  const skip = (currentPage - 1) * perPage;

  const [attendance, total] = await Promise.all([
    defaultPopulate(
      Attendance.find(query).sort({ date: -1 }).skip(skip).limit(perPage)
    ).lean(),
    Attendance.countDocuments(query),
  ]);

  return {
    attendance,
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
};

// ─────────────────────────────────────────────
// GET EVENT STAFF ATTENDANCE TIMELINE & STATS
// GET /api/attendance/event/:eventId
// ─────────────────────────────────────────────

const getEventStaffAttendance = async (eventId) => {
  const Event = require("../models/event.model");
  const Duty = require("../models/duty.model");

  const eventRecord = await Event.findOne({
    $or: [{ _id: eventId }, { booking: eventId }],
  });

  const searchBookingId = eventRecord ? eventRecord.booking : eventId;

  const duties = await Duty.find({ event: searchBookingId })
    .populate("staff", "name username employeeId department phone email role")
    .populate("assignedBy", "name username email")
    .lean();

  const dutyIds = duties.map((d) => d._id);
  const attendances = await Attendance.find({ duty: { $in: dutyIds } }).lean();

  const attMap = new Map();
  attendances.forEach((a) => attMap.set(String(a.duty), a));

  const staffList = duties.map((d) => {
    const att = attMap.get(String(d._id));
    const now = new Date();

    let currentStatus = "NOT_CLOCKED_IN";
    let activeMinutes = 0;
    let totalPausedMinutes = att?.totalPauseMinutes || 0;

    if (att?.checkIn) {
      if (att.checkOut) {
        currentStatus = "CLOCKED_OUT";
        const grossSecs = Math.max(0, Math.floor((new Date(att.checkOut).getTime() - new Date(att.checkIn).getTime()) / 1000));
        const pauseSecs = totalPausedMinutes * 60;
        activeMinutes = Math.max(0, Math.round((grossSecs - pauseSecs) / 60));
      } else if (att.isPaused) {
        currentStatus = "PAUSED";
        const pauseNowSecs = att.pausedAt ? Math.max(0, Math.floor((now.getTime() - new Date(att.pausedAt).getTime()) / 1000)) : 0;
        const grossSecs = Math.max(0, Math.floor((now.getTime() - new Date(att.checkIn).getTime()) / 1000));
        const pauseSecs = totalPausedMinutes * 60 + pauseNowSecs;
        activeMinutes = Math.max(0, Math.round((grossSecs - pauseSecs) / 60));
        totalPausedMinutes += Math.round(pauseNowSecs / 60);
      } else {
        currentStatus = "ACTIVE";
        const grossSecs = Math.max(0, Math.floor((now.getTime() - new Date(att.checkIn).getTime()) / 1000));
        const pauseSecs = totalPausedMinutes * 60;
        activeMinutes = Math.max(0, Math.round((grossSecs - pauseSecs) / 60));
      }
    }

    return {
      dutyId: d._id,
      dutyTitle: d.dutyTitle,
      role: d.role,
      department: d.department,
      staff: d.staff,
      dutyDate: d.dutyDate,
      startTime: d.startTime,
      endTime: d.endTime,
      hourlyRate: d.hourlyRate || 0,
      paymentStatus: d.paymentStatus || "PENDING",
      attendanceId: att?._id || null,
      checkIn: att?.checkIn || null,
      checkOut: att?.checkOut || null,
      currentStatus,
      isPaused: Boolean(att?.isPaused),
      pausedAt: att?.pausedAt || null,
      activeMinutes,
      activeHours: Math.round((activeMinutes / 60) * 100) / 100,
      totalPausedMinutes,
      earnings: Math.round(((activeMinutes / 60) * (d.hourlyRate || 0)) * 100) / 100,
      sessions: att?.sessions || [],
      pauseHistory: att?.pauseHistory || [],
      notes: att?.notes || "",
    };
  });

  return staffList;
};

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  checkIn,
  checkOut,
  pauseShift,
  resumeShift,
  markAbsent,
  bulkMark,
  getAttendance,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getStaffSummary,
  getEventSummary,
  getMyAttendance,
  getEventStaffAttendance,
};
