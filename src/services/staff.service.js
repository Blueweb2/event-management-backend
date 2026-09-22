const bcrypt = require("bcryptjs");

const User = require("../models/user.model");

/**
 * Create a new staff account
 */
const createStaff = async ({
  name,
  username,
  email,
  password,
  phone = "",
  location = "",
  employmentType = "full-time",
  employeeId,
  department = "",
  emergencyContact = {},
  createdBy = null,
}) => {
  const normalizedUsername = username
    .trim()
    .toLowerCase();

  const normalizedEmail = email
    .trim()
    .toLowerCase();

  // ==========================================
  // CHECK USERNAME
  // ==========================================

  const existingUsername = await User.findOne({
    username: normalizedUsername,
  });

  if (existingUsername) {
    const error = new Error(
      "Username is already taken"
    );

    error.statusCode = 409;

    throw error;
  }

  // ==========================================
  // CHECK EMAIL
  // ==========================================

  const existingEmail = await User.findOne({
    email: normalizedEmail,
  });

  if (existingEmail) {
    const error = new Error(
      "Email is already registered"
    );

    error.statusCode = 409;

    throw error;
  }

  // ==========================================
  // CHECK EMPLOYEE ID
  // ==========================================

  if (employeeId?.trim()) {
    const existingEmployeeId = await User.findOne({
      employeeId: employeeId.trim(),
    });

    if (existingEmployeeId) {
      const error = new Error(
        "Employee ID is already in use"
      );

      error.statusCode = 409;

      throw error;
    }
  }

  // ==========================================
  // HASH PASSWORD
  // ==========================================

  const hashedPassword = await bcrypt.hash(
    password,
    12
  );

  // ==========================================
  // CREATE STAFF
  // ==========================================

  const staff = await User.create({
    name: name.trim(),
    username: normalizedUsername,
    email: normalizedEmail,
    password: hashedPassword,

    phone: phone?.trim() || "",
    location: location?.trim() || "",

    employmentType,

    // Staff accounts created through this
    // service are ALWAYS staff.
    role: "staff",

    employeeId: employeeId?.trim() || undefined,

    department: department?.trim() || "",

    emergencyContact: {
      name:
        emergencyContact?.name?.trim() || "",
      phone:
        emergencyContact?.phone?.trim() || "",
      relationship:
        emergencyContact?.relationship?.trim() || "",
    },

    isActive: true,

    createdBy,
  });

  return formatStaff(staff);
};

/**
 * Get staff list
 */
const getStaff = async ({
  search = "",
  status = "all",
  department = "",
  page = 1,
  limit = 20,
}) => {
  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const perPage = Math.min(
    Math.max(Number(limit) || 20, 1),
    1000
  );

  const query = {
    role: "staff",
  };

  // ==========================================
  // STATUS FILTER
  // ==========================================

  if (status === "active") {
    query.isActive = true;
  }

  if (status === "inactive") {
    query.isActive = false;
  }

  // ==========================================
  // DEPARTMENT FILTER
  // ==========================================

  if (department?.trim()) {
    query.department = department.trim();
  }

  // ==========================================
  // SEARCH
  // ==========================================

  if (search?.trim()) {
    const searchRegex = new RegExp(
      search.trim(),
      "i"
    );

    query.$or = [
      { name: searchRegex },
      { username: searchRegex },
      { email: searchRegex },
      { employeeId: searchRegex },
      { department: searchRegex },
      { phone: searchRegex },
    ];
  }

  const skip =
    (currentPage - 1) * perPage;

  const [staff, total] = await Promise.all([
    User.find(query)
      .select("-password")
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(perPage)
      .lean(),

    User.countDocuments(query),
  ]);

  return {
    staff: staff.map(formatStaff),
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
 * Get one staff member
 */
const getStaffById = async (staffId) => {
  const staff = await User.findOne({
    _id: staffId,
    role: "staff",
  }).select("-password");

  if (!staff) {
    const error = new Error(
      "Staff member not found"
    );

    error.statusCode = 404;

    throw error;
  }

  return formatStaff(staff);
};

/**
 * Update staff information
 */
const updateStaff = async (
  staffId,
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
) => {
  const staff = await User.findOne({
    _id: staffId,
    role: "staff",
  });

  if (!staff) {
    const error = new Error(
      "Staff member not found"
    );

    error.statusCode = 404;

    throw error;
  }

  // ==========================================
  // USERNAME
  // ==========================================

  if (username !== undefined) {
    const normalizedUsername = username
      .trim()
      .toLowerCase();

    if (normalizedUsername.length < 3) {
      const error = new Error(
        "Username must be at least 3 characters"
      );

      error.statusCode = 400;

      throw error;
    }

    if (
      normalizedUsername !== staff.username
    ) {
      const existingUsername =
        await User.findOne({
          username: normalizedUsername,
          _id: { $ne: staffId },
        });

      if (existingUsername) {
        const error = new Error(
          "Username is already taken"
        );

        error.statusCode = 409;

        throw error;
      }

      staff.username = normalizedUsername;
    }
  }

  // ==========================================
  // EMAIL
  // ==========================================

  if (email !== undefined) {
    const normalizedEmail = email
      .trim()
      .toLowerCase();

    if (
      normalizedEmail !== staff.email
    ) {
      const existingEmail =
        await User.findOne({
          email: normalizedEmail,
          _id: { $ne: staffId },
        });

      if (existingEmail) {
        const error = new Error(
          "Email is already registered"
        );

        error.statusCode = 409;

        throw error;
      }

      staff.email = normalizedEmail;
    }
  }

  // ==========================================
  // BASIC INFORMATION
  // ==========================================

  if (name !== undefined) {
    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      const error = new Error(
        "Name must be at least 2 characters"
      );

      error.statusCode = 400;

      throw error;
    }

    staff.name = trimmedName;
  }

  if (phone !== undefined) {
    staff.phone = phone.trim();
  }

  if (location !== undefined) {
    staff.location = location.trim();
  }

  // ==========================================
  // EMPLOYMENT
  // ==========================================

  if (employmentType !== undefined) {
    const allowedTypes = [
      "full-time",
      "part-time",
      "contract",
      "temporary",
    ];

    if (
      !allowedTypes.includes(employmentType)
    ) {
      const error = new Error(
        "Invalid employment type"
      );

      error.statusCode = 400;

      throw error;
    }

    staff.employmentType =
      employmentType;
  }

  if (department !== undefined) {
    staff.department = department.trim();
  }

  // ==========================================
  // EMPLOYEE ID
  // ==========================================

  if (employeeId !== undefined) {
    const normalizedEmployeeId =
      employeeId.trim();

    if (
      normalizedEmployeeId &&
      normalizedEmployeeId !==
        staff.employeeId
    ) {
      const existingEmployeeId =
        await User.findOne({
          employeeId:
            normalizedEmployeeId,
          _id: { $ne: staffId },
        });

      if (existingEmployeeId) {
        const error = new Error(
          "Employee ID is already in use"
        );

        error.statusCode = 409;

        throw error;
      }

      staff.employeeId =
        normalizedEmployeeId || undefined;
    }
  }

  // ==========================================
  // EMERGENCY CONTACT
  // ==========================================

  if (emergencyContact !== undefined) {
    staff.emergencyContact = {
      name:
        emergencyContact?.name?.trim() || "",
      phone:
        emergencyContact?.phone?.trim() || "",
      relationship:
        emergencyContact?.relationship?.trim() ||
        "",
    };
  }

  await staff.save();

  return formatStaff(staff);
};

/**
 * Activate / deactivate staff
 */
const updateStaffStatus = async (
  staffId,
  isActive
) => {
  const staff = await User.findOne({
    _id: staffId,
    role: "staff",
  });

  if (!staff) {
    const error = new Error(
      "Staff member not found"
    );

    error.statusCode = 404;

    throw error;
  }

  staff.isActive = Boolean(isActive);

  await staff.save();

  return formatStaff(staff);
};

/**
 * Reset staff password
 */
const resetStaffPassword = async (
  staffId,
  newPassword
) => {
  const staff = await User.findOne({
    _id: staffId,
    role: "staff",
  }).select("+password");

  if (!staff) {
    const error = new Error(
      "Staff member not found"
    );

    error.statusCode = 404;

    throw error;
  }

  if (!newPassword || newPassword.length < 6) {
    const error = new Error(
      "Password must be at least 6 characters"
    );

    error.statusCode = 400;

    throw error;
  }

  staff.password = await bcrypt.hash(
    newPassword,
    12
  );

  await staff.save();

  return {
    id: staff._id,
    username: staff.username,
    message:
      "Staff password updated successfully",
  };
};

/**
 * Format staff response
 *
 * Never return password.
 */
const formatStaff = (staff) => {
  return {
    id: staff._id,
    name: staff.name,
    username: staff.username,
    email: staff.email,
    phone: staff.phone || "",
    location: staff.location || "",

    employeeId:
      staff.employeeId || "",

    department:
      staff.department || "",

    employmentType:
      staff.employmentType ||
      "full-time",

    role: staff.role,

    emergencyContact: {
      name:
        staff.emergencyContact?.name ||
        "",
      phone:
        staff.emergencyContact?.phone ||
        "",
      relationship:
        staff.emergencyContact
          ?.relationship || "",
    },

    isActive: staff.isActive,

    status: staff.isActive
      ? "Active"
      : "Inactive",

    createdBy:
      staff.createdBy || null,

    joinedDate: staff.createdAt,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  };
};

module.exports = {
  createStaff,
  getStaff,
  getStaffById,
  updateStaff,
  updateStaffStatus,
  resetStaffPassword,
};