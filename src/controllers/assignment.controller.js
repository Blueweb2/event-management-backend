const assignmentService = require("../services/assignment.service");

/**
 * Create assignment
 * POST /api/assignments
 */
const createAssignment = async (
  req,
  res,
  next
) => {
  try {
    const {
      event,
      staff,
      dutyTitle,
      role,
      description,
      dutyDate,
      startTime,
      endTime,
      notes,
      checklist,
    } = req.body;

    if (
      !event ||
      !staff ||
      !dutyTitle ||
      !dutyDate ||
      !startTime ||
      !endTime
    ) {
      const error = new Error(
        "Event, staff, duty title, date, start time and end time are required"
      );

      error.statusCode = 400;
      throw error;
    }

    const assignment =
      await assignmentService.createAssignment({
        event,
        staff,
        dutyTitle,
        role,
        description,
        dutyDate,
        startTime,
        endTime,
        notes,
        checklist,
        assignedBy:
          req.user.userId,
      });

    res.status(201).json({
      success: true,
      message:
        "Staff assigned successfully",
      data: {
        assignment,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get assignments
 * GET /api/assignments
 */
const getAssignments = async (
  req,
  res,
  next
) => {
  try {
    const filters = { ...req.query };
    const role = (req.user?.role || "").toLowerCase();

    if (role === "staff") {
      filters.staff = req.user.userId;
    }

    const result =
      await assignmentService.getAssignments(
        filters
      );

    res.status(200).json({
      success: true,
      data: result.assignments,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get assignment
 * GET /api/assignments/:id
 */
const getAssignmentById = async (
  req,
  res,
  next
) => {
  try {
    const assignment =
      await assignmentService.getAssignmentById(
        req.params.id
      );

    res.status(200).json({
      success: true,
      data: {
        assignment,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update assignment
 * PUT /api/assignments/:id
 */
const updateAssignment = async (
  req,
  res,
  next
) => {
  try {
    const assignment =
      await assignmentService.updateAssignment(
        req.params.id,
        req.body
      );

    res.status(200).json({
      success: true,
      message:
        "Assignment updated successfully",
      data: {
        assignment,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel assignment
 * DELETE /api/assignments/:id
 */
const deleteAssignment = async (
  req,
  res,
  next
) => {
  try {
    await assignmentService.deleteAssignment(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message:
        "Assignment cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Accept assignment
 * PATCH /api/assignments/:id/accept
 */
const acceptAssignment = async (req, res, next) => {
  try {
    const assignment = await assignmentService.acceptAssignment(
      req.params.id,
      req.user.userId,
      req.user.role
    );

    res.status(200).json({
      success: true,
      message: "Shift accepted successfully",
      data: {
        assignment,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update assignment sub-task checklist
 * PATCH /api/assignments/:id/checklist
 */
const updateChecklist = async (req, res, next) => {
  try {
    const { checklist } = req.body;
    const assignment = await assignmentService.updateAssignmentChecklist(
      req.params.id,
      checklist,
      req.user.userId,
      req.user.role
    );

    res.status(200).json({
      success: true,
      message: "Checklist updated successfully",
      data: {
        assignment,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  acceptAssignment,
  updateChecklist,
};