const attendanceService = require("../services/attendance.service");

/**
 * Check in
 * POST /api/attendance/check-in
 */
const checkIn = async (
  req,
  res,
  next
) => {
  try {
    const { duty, notes } = req.body;

    if (!duty) {
      const error = new Error(
        "Duty is required"
      );

      error.statusCode = 400;
      throw error;
    }

    const attendance =
      await attendanceService.checkIn({
        duty,
        markedBy:
          req.user.userId,
        staffId:
          (req.user.role || "").toLowerCase() === "staff"
            ? req.user.userId
            : null,
        notes,
      });

    res.status(200).json({
      success: true,
      message:
        "Staff checked in successfully",
      data: {
        attendance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check out
 * POST /api/attendance/check-out
 */
const checkOut = async (
  req,
  res,
  next
) => {
  try {
    const { duty, notes } = req.body;

    if (!duty) {
      const error = new Error(
        "Duty is required"
      );

      error.statusCode = 400;
      throw error;
    }

    const attendance =
      await attendanceService.checkOut({
        duty,
        markedBy:
          req.user.userId,
        staffId:
          (req.user.role || "").toLowerCase() === "staff"
            ? req.user.userId
            : null,
        notes,
      });

    res.status(200).json({
      success: true,
      message:
        "Staff checked out successfully",
      data: {
        attendance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pause Shift
 * POST /api/attendance/pause
 */
const pauseShift = async (req, res, next) => {
  try {
    const { duty, reason, notes } = req.body;
    if (!duty) {
      const error = new Error("Duty is required");
      error.statusCode = 400;
      throw error;
    }
    const attendance = await attendanceService.pauseShift({
      duty,
      markedBy: req.user.userId,
      staffId: (req.user.role || "").toLowerCase() === "staff" ? req.user.userId : null,
      reason: reason || "Break",
      notes,
    });
    res.status(200).json({
      success: true,
      message: "Shift paused successfully",
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resume Shift
 * POST /api/attendance/resume
 */
const resumeShift = async (req, res, next) => {
  try {
    const { duty, notes } = req.body;
    if (!duty) {
      const error = new Error("Duty is required");
      error.statusCode = 400;
      throw error;
    }
    const attendance = await attendanceService.resumeShift({
      duty,
      markedBy: req.user.userId,
      staffId: (req.user.role || "").toLowerCase() === "staff" ? req.user.userId : null,
      notes,
    });
    res.status(200).json({
      success: true,
      message: "Shift resumed successfully",
      data: { attendance },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get attendance
 * GET /api/attendance
 */
const getAttendance = async (
  req,
  res,
  next
) => {
  try {
    const filters = { ...req.query };
    if ((req.user?.role || "").toLowerCase() === "staff") {
      filters.staff = req.user.userId;
    }

    const result =
      await attendanceService.getAttendance(
        filters
      );

    res.status(200).json({
      success: true,
      data: result.attendance,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark absent
 * POST /api/attendance/absent
 */
const markAbsent = async (
  req,
  res,
  next
) => {
  try {
    const { duty, notes } =
      req.body;

    if (!duty) {
      const error = new Error(
        "Duty is required"
      );

      error.statusCode = 400;
      throw error;
    }

    const attendance =
      await attendanceService.markAbsent({
        duty,
        markedBy:
          req.user.userId,
        notes,
      });

    res.status(200).json({
      success: true,
      message:
        "Staff marked as absent",
      data: {
        attendance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update attendance (manual correction)
 * PATCH /api/attendance/:id
 */
const updateAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const attendance = await attendanceService.updateAttendance(
      id,
      updates,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: {
        attendance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete attendance
 * DELETE /api/attendance/:id
 */
const deleteAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    await attendanceService.deleteAttendance(id);

    res.status(200).json({
      success: true,
      message: "Attendance record deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Event Staff Attendance Timeline & Stats
 * GET /api/attendance/event/:eventId
 */
const getEventStaffAttendance = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const staffList = await attendanceService.getEventStaffAttendance(eventId);

    res.status(200).json({
      success: true,
      message: "Event staff attendance retrieved successfully",
      data: staffList,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkIn,
  checkOut,
  pauseShift,
  resumeShift,
  getAttendance,
  markAbsent,
  updateAttendance,
  deleteAttendance,
  getEventStaffAttendance,
};