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
    const { duty } = req.body;

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
    const { duty } = req.body;

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

module.exports = {
  checkIn,
  checkOut,
  getAttendance,
  markAbsent,
};