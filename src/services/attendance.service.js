const Attendance = require("../models/attendance.model");
const Duty = require("../models/duty.model");
const User = require("../models/user.model");

/**
 * Check in staff
 */
const checkIn = async ({
  duty,
  markedBy = null,
}) => {
  const dutyRecord =
    await Duty.findById(duty);

  if (!dutyRecord) {
    const error = new Error(
      "Duty not found"
    );

    error.statusCode = 404;
    throw error;
  }

  const existing =
    await Attendance.findOne({
      duty,
    });

  if (existing?.checkIn) {
    const error = new Error(
      "Staff member has already checked in"
    );

    error.statusCode = 409;
    throw error;
  }

  const now = new Date();

  let status = "PRESENT";

  // Simple late detection.
  // Expected startTime format: HH:mm
  if (dutyRecord.startTime) {
    const [hours, minutes] =
      dutyRecord.startTime
        .split(":")
        .map(Number);

    if (
      Number.isInteger(hours) &&
      Number.isInteger(minutes)
    ) {
      const expected = new Date(
        dutyRecord.dutyDate
      );

      expected.setHours(
        hours,
        minutes,
        0,
        0
      );

      if (now > expected) {
        status = "LATE";
      }
    }
  }

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

  return attendance.populate([
    {
      path: "staff",
      select:
        "name username employeeId department",
    },
    {
      path: "event",
      select:
        "eventName eventDate location",
    },
    {
      path: "duty",
      select:
        "dutyTitle role startTime endTime status",
    },
  ]);
};

/**
 * Check out staff
 */
const checkOut = async ({
  duty,
  markedBy = null,
}) => {
  const attendance =
    await Attendance.findOne({
      duty,
    });

  if (!attendance) {
    const error = new Error(
      "Attendance record not found. Staff must check in first."
    );

    error.statusCode = 404;
    throw error;
  }

  if (!attendance.checkIn) {
    const error = new Error(
      "Staff member has not checked in"
    );

    error.statusCode = 400;
    throw error;
  }

  if (attendance.checkOut) {
    const error = new Error(
      "Staff member has already checked out"
    );

    error.statusCode = 409;
    throw error;
  }

  attendance.checkOut =
    new Date();

  attendance.markedBy =
    markedBy || attendance.markedBy;

  await attendance.save();

  return attendance.populate([
    {
      path: "staff",
      select:
        "name username employeeId department",
    },
    {
      path: "event",
      select:
        "eventName eventDate location",
    },
    {
      path: "duty",
      select:
        "dutyTitle role startTime endTime status",
    },
  ]);
};

/**
 * Get attendance records
 */
const getAttendance = async ({
  staff,
  event,
  duty,
  date,
  status,
  page = 1,
  limit = 50,
}) => {
  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const perPage = Math.min(
    Math.max(Number(limit) || 50, 1),
    100
  );

  const query = {};

  if (staff) {
    query.staff = staff;
  }

  if (event) {
    query.event = event;
  }

  if (duty) {
    query.duty = duty;
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

    query.date = {
      $gte: start,
      $lt: end,
    };
  }

  const skip =
    (currentPage - 1) * perPage;

  const [attendance, total] =
    await Promise.all([
      Attendance.find(query)
        .populate(
          "staff",
          "name username employeeId department"
        )
        .populate(
          "event",
          "eventName eventType eventDate location"
        )
        .populate(
          "duty",
          "dutyTitle role dutyDate startTime endTime"
        )
        .sort({
          date: -1,
          checkIn: 1,
        })
        .skip(skip)
        .limit(perPage)
        .lean(),

      Attendance.countDocuments(query),
    ]);

  return {
    attendance,
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
 * Mark staff absent
 */
const markAbsent = async ({
  duty,
  markedBy = null,
  notes = "",
}) => {
  const dutyRecord =
    await Duty.findById(duty);

  if (!dutyRecord) {
    const error = new Error(
      "Duty not found"
    );

    error.statusCode = 404;
    throw error;
  }

  const attendance =
    await Attendance.findOneAndUpdate(
      { duty },
      {
        duty,
        staff: dutyRecord.staff,
        event: dutyRecord.event,
        date: dutyRecord.dutyDate,
        status: "ABSENT",
        notes: notes?.trim() || "",
        markedBy,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

  return attendance;
};

module.exports = {
  checkIn,
  checkOut,
  getAttendance,
  markAbsent,
};