const departmentService = require("../services/department.service");

/**
 * GET /api/departments/event-staffing/:eventId
 */
const getEventStaffingRequirements = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const result = await departmentService.getEventStaffingRequirements(eventId);

    res.status(200).json({
      success: true,
      message: "Event staffing requirements fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/departments/availability?date=YYYY-MM-DD
 */
const getDepartmentDateAvailability = async (req, res, next) => {
  try {
    const { date } = req.query;
    const result = await departmentService.getDepartmentDateAvailability(date);

    res.status(200).json({
      success: true,
      message: "Department availability fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEventStaffingRequirements,
  getDepartmentDateAvailability,
};
