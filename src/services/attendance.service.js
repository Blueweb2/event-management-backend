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

const checkIn = async ({ duty, markedBy = null, staffId = null }) => {
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

  assertDutyIsToday(dutyRecord);

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
  attendance.markedBy = markedBy;

  await attendance.save();

  return defaultPopulate(Attendance.findById(attendance._id));
};

// ─────────────────────────────────────────────
// CHECK OUT
// POST /api/attendance/check-out
// ─────────────────────────────────────────────

const checkOut = async ({ duty, markedBy = null, staffId = null }) => {
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

  attendance.checkOut = new Date();
  attendance.markedBy = markedBy || attendance.markedBy;

  await attendance.save();

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
  const perPage = Math.min(Math.max(Number(limit) || 50, 1), 100);

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
  const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);

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
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  checkIn,
  checkOut,
  markAbsent,
  bulkMark,
  getAttendance,
  getAttendanceById,
  updateAttendance,
  deleteAttendance,
  getStaffSummary,
  getEventSummary,
  getMyAttendance,
};
