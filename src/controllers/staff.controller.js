const staffService = require("../services/staff.service");

/**
 * Create staff
 * POST /api/users/staff
 */
const createStaff = async (
  req,
  res,
  next
) => {
  try {
    const {
      name,
      username,
      email,
      password,
      phone,
      location,
      employmentType,
      employeeId,
      department,
      emergencyContact,
    } = req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (
      !name ||
      !username ||
      !email ||
      !password
    ) {
      const error = new Error(
        "Name, username, email and password are required"
      );

      error.statusCode = 400;

      throw error;
    }

    if (password.length < 6) {
      const error = new Error(
        "Password must be at least 6 characters"
      );

      error.statusCode = 400;

      throw error;
    }

    const staff =
      await staffService.createStaff({
        name,
        username,
        email,
        password,
        phone,
        location,
        employmentType,
        employeeId,
        department,
        emergencyContact,

        // Manager/admin creating this account
        createdBy:
          req.user?.userId || null,
      });

    return res.status(201).json({
      success: true,
      message:
        "Staff account created successfully",
      data: {
        staff,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all staff
 * GET /api/users/staff
 */
const getStaff = async (
  req,
  res,
  next
) => {
  try {
    const {
      search,
      status,
      department,
      page,
      limit,
    } = req.query;

    const result =
      await staffService.getStaff({
        search,
        status,
        department,
        page,
        limit,
      });

    return res.status(200).json({
      success: true,
      data: result.staff,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get staff by ID
 * GET /api/users/staff/:id
 */
const getStaffById = async (
  req,
  res,
  next
) => {
  try {
    const staff =
      await staffService.getStaffById(
        req.params.id
      );

    return res.status(200).json({
      success: true,
      data: {
        staff,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update staff
 * PUT /api/users/staff/:id
 */
const updateStaff = async (
  req,
  res,
  next
) => {
  try {
    const {
      name,
      username,
      email,
      phone,
      location,
      employmentType,
      employeeId,
      department,
      emergencyContact,
    } = req.body;

    const staff =
      await staffService.updateStaff(
        req.params.id,
        {
          name,
          username,
          email,
          phone,
          location,
          employmentType,
          employeeId,
          department,
          emergencyContact,
        }
      );

    return res.status(200).json({
      success: true,
      message:
        "Staff profile updated successfully",
      data: {
        staff,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate / deactivate staff
 * PATCH /api/users/staff/:id/status
 */
const updateStaffStatus = async (
  req,
  res,
  next
) => {
  try {
    const { isActive } = req.body;

    if (
      typeof isActive !== "boolean"
    ) {
      const error = new Error(
        "isActive must be a boolean"
      );

      error.statusCode = 400;

      throw error;
    }

    const staff =
      await staffService.updateStaffStatus(
        req.params.id,
        isActive
      );

    return res.status(200).json({
      success: true,
      message: isActive
        ? "Staff account activated"
        : "Staff account deactivated",
      data: {
        staff,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset staff password
 * PATCH /api/users/staff/:id/password
 */
const resetStaffPassword = async (
  req,
  res,
  next
) => {
  try {
    const { newPassword } =
      req.body;

    if (!newPassword) {
      const error = new Error(
        "New password is required"
      );

      error.statusCode = 400;

      throw error;
    }

    const result =
      await staffService.resetStaffPassword(
        req.params.id,
        newPassword
      );

    return res.status(200).json({
      success: true,
      message:
        "Staff password updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createStaff,
  getStaff,
  getStaffById,
  updateStaff,
  updateStaffStatus,
  resetStaffPassword,
};