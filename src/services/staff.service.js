const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const { deleteAvatarFile } = require("../utils/avatar.util");
const { normalizeDepartment } = require("../utils/department.constants");

/**
 * Helper: Identify role scopes
 */
const isSuperAdmin = (requester) => {
  const r = (requester?.role || "").toLowerCase();
  return r === "superadmin" || r === "admin";
};

const isChefManager = (requester) => {
  const r = (requester?.role || "").toLowerCase();
  return r === "manager" && normalizeDepartment(requester?.department) === "Kitchen";
};

const isDepartmentManager = (requester) => {
  const r = (requester?.role || "").toLowerCase();
  return r === "manager";
};

const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Format staff response
 * Never return password.
 * Masks compensation when hideCompensation is true (e.g. for Chef Managers).
 */
const formatStaff = (staff, options = {}) => {
  const { hideCompensation = false } = options;
  const isCompensationHidden = hideCompensation;

  const rawSalary = typeof staff.salary === "number" ? staff.salary : (typeof staff.hourlyRate === "number" ? staff.hourlyRate : 0);
  const rawHourlyRate = typeof staff.hourlyRate === "number" ? staff.hourlyRate : (staff.salaryType === "hourly" && typeof staff.salary === "number" ? staff.salary : 0);

  return {
    id: staff._id,
    name: staff.name,
    username: staff.username,
    email: staff.email,
    avatar: staff.avatar || "",
    phone: staff.phone || "",
    location: staff.location || "",
    employeeId: staff.employeeId || "",
    department: staff.department || "",
    employmentType: staff.employmentType || "full-time",

    // Financial / Payroll details
    salary: isCompensationHidden ? undefined : rawSalary,
    salaryType: isCompensationHidden ? undefined : (staff.salaryType || "hourly"),
    hourlyRate: isCompensationHidden ? undefined : rawHourlyRate,

    role: staff.role,
    permissions: staff.permissions || [],

    emergencyContact: {
      name: staff.emergencyContact?.name || "",
      phone: staff.emergencyContact?.phone || "",
      relationship: staff.emergencyContact?.relationship || "",
    },

    isActive: staff.isActive,
    status: staff.isActive ? "Active" : "Inactive",
    createdBy: staff.createdBy || null,
    joinedDate: staff.createdAt,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  };
};

/**
 * Create a new staff or manager account
 */
const createStaff = async ({
  name,
  username,
  email,
  password,
  avatar = "",
  phone = "",
  location = "",
  employmentType = "full-time",
  salary = 0,
  salaryType = "hourly",
  hourlyRate = 0,
  employeeId,
  department = "",
  role = "staff",
  emergencyContact = {},
  createdBy = null,
  requester = null,
}) => {
  // Authorization check on creation
  let targetRole = "staff";
  let targetDepartment = (department || "").trim();

  const isManagerialRoleAttempt = (r) => {
    if (!r) return false;
    const lower = String(r).toLowerCase().trim();
    return lower === "manager" || lower === "admin" || lower === "superadmin";
  };

  if (isSuperAdmin(requester)) {
    targetRole = "staff"; // Staff creation endpoint strictly provisions regular staff accounts
    targetDepartment = (department || "").trim();
  } else if (isChefManager(requester)) {
    if (isManagerialRoleAttempt(role)) {
      const error = new Error("Access denied: Chef Managers cannot create manager accounts");
      error.statusCode = 403;
      throw error;
    }
    if (department && normalizeDepartment(department) !== "Kitchen") {
      const error = new Error("Access denied: Chef Managers can only create kitchen staff accounts");
      error.statusCode = 403;
      throw error;
    }
    targetRole = "staff";
    targetDepartment = "Kitchen";
    salary = 0;
    hourlyRate = 0;
  } else if (isDepartmentManager(requester)) {
    const authDept = requester?.department ? String(requester.department).trim() : "";
    if (isManagerialRoleAttempt(role)) {
      const error = new Error("Access denied: Managers cannot create manager accounts");
      error.statusCode = 403;
      throw error;
    }
    if (authDept && department && normalizeDepartment(department) !== normalizeDepartment(authDept)) {
      const error = new Error(`Access denied: Cannot create staff outside your assigned department ("${authDept}")`);
      error.statusCode = 403;
      throw error;
    }
    targetRole = "staff";
    targetDepartment = authDept || (department || "").trim();
  }

  // Normalize and sanitize username
  let normalizedUsername = (username || email || "")
    .trim()
    .toLowerCase();

  if (normalizedUsername.includes("@")) {
    normalizedUsername = normalizedUsername.split("@")[0];
  }

  normalizedUsername = normalizedUsername.replace(/[^a-z0-9._-]/g, "_");

  if (normalizedUsername.length < 3) {
    normalizedUsername = (normalizedUsername + "staff").slice(0, 30);
  } else if (normalizedUsername.length > 30) {
    normalizedUsername = normalizedUsername.slice(0, 30);
  }

  // Check unique username
  const existingUsername = await User.findOne({ username: normalizedUsername });
  if (existingUsername) {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    normalizedUsername = `${normalizedUsername.slice(0, 26)}_${randomSuffix}`;
  }

  // Check unique email
  const normalizedEmail = email.trim().toLowerCase();
  const existingEmail = await User.findOne({ email: normalizedEmail });
  if (existingEmail) {
    const error = new Error("Email is already registered");
    error.statusCode = 409;
    throw error;
  }

  // Check unique employee ID
  if (employeeId?.trim()) {
    const existingEmployeeId = await User.findOne({ employeeId: employeeId.trim() });
    if (existingEmployeeId) {
      const error = new Error("Employee ID is already in use");
      error.statusCode = 409;
      throw error;
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  const staff = await User.create({
    name: name.trim(),
    username: normalizedUsername,
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone?.trim() || "",
    location: location?.trim() || "",
    avatar: avatar?.trim() || "",
    employmentType,
    salary: Number(salary) || Number(hourlyRate) || 0,
    salaryType: salaryType || "hourly",
    hourlyRate: salaryType === "hourly" ? (Number(hourlyRate) || Number(salary) || 0) : (Number(hourlyRate) || 0),
    role: targetRole,
    employeeId: employeeId?.trim() || undefined,
    department: targetDepartment,
    emergencyContact: {
      name: emergencyContact?.name?.trim() || "",
      phone: emergencyContact?.phone?.trim() || "",
      relationship: emergencyContact?.relationship?.trim() || "",
    },
    isActive: true,
    createdBy: createdBy || requester?.userId || null,
  });

  return formatStaff(staff, { hideCompensation: isChefManager(requester) });
};

/**
 * Get staff list with role-based scoping and metrics
 */
const getStaff = async ({
  requester = null,
  search = "",
  status = "all",
  department = "",
  role = "",
  employmentType = "",
  page = 1,
  limit = 20,
}) => {
  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = Math.min(Math.max(Number(limit) || 20, 1), 1000);

  const query = {};
  const isSuper = isSuperAdmin(requester);
  const isChef = isChefManager(requester);
  const isMgr = !isSuper && isDepartmentManager(requester);

  // 1. Role and Department scoping
  if (isSuper) {
    // Superadmin: Can view all managers and staff across all departments
    if (role && role !== "all") {
      query.role = role.toLowerCase().trim();
    } else {
      query.role = { $in: ["superadmin", "admin", "manager", "staff"] };
    }

    if (department && department !== "all") {
      query.department = { $regex: new RegExp(`^${escapeRegex(department.trim())}$`, "i") };
    }
  } else if (isChef) {
    // Chef Manager: Strictly kitchen department staff
    if (department && department !== "all" && normalizeDepartment(department) !== "Kitchen") {
      const error = new Error(`Access denied: Chef Manager cannot view staff from "${department}" department`);
      error.statusCode = 403;
      throw error;
    }
    query.role = "staff";
    query.department = { $regex: /kitchen|chef|cook/i };
  } else if (isMgr) {
    // Department Manager: Strictly their authorized department scope
    const authDept = requester?.department || "";
    if (department && department !== "all" && normalizeDepartment(department) !== normalizeDepartment(authDept)) {
      const error = new Error(`Access denied: You can only view staff from the "${authDept}" department`);
      error.statusCode = 403;
      throw error;
    }
    query.role = "staff";
    if (authDept) {
      query.department = { $regex: new RegExp(`^${escapeRegex(authDept)}$`, "i") };
    }
  } else {
    // Default safe fallback for other/unspecified roles
    query.role = "staff";
  }

  // 2. Status filter
  if (status === "active") {
    query.isActive = true;
  } else if (status === "inactive") {
    query.isActive = false;
  }

  // 3. Employment type filter
  if (employmentType && employmentType !== "all") {
    query.employmentType = employmentType;
  }

  // 4. Search filter across relevant fields
  if (search?.trim()) {
    const searchRegex = new RegExp(escapeRegex(search.trim()), "i");
    query.$or = [
      { name: searchRegex },
      { username: searchRegex },
      { email: searchRegex },
      { employeeId: searchRegex },
      { department: searchRegex },
      { phone: searchRegex },
      { role: searchRegex },
    ];
  }

  const skip = (currentPage - 1) * perPage;

  // 5. Query records
  const [staffList, total] = await Promise.all([
    User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean(),
    User.countDocuments(query),
  ]);

  // 6. Compute summary metrics based on authorized organizational scope
  let summary = {
    totalManagers: 0,
    totalStaff: 0,
    activeEmployees: 0,
    inactiveEmployees: 0,
    departmentCounts: {},
  };

  try {
    if (isSuper) {
      const [totalManagers, totalStaff, activeEmployees, inactiveEmployees, deptGroups] = await Promise.all([
        User.countDocuments({ role: { $in: ["manager", "admin"] } }),
        User.countDocuments({ role: "staff" }),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ isActive: false }),
        User.aggregate([
          { $match: { department: { $exists: true, $ne: "" } } },
          { $group: { _id: "$department", count: { $sum: 1 } } },
        ]),
      ]);

      const departmentCounts = {};
      deptGroups.forEach((g) => {
        if (g._id) departmentCounts[g._id] = g.count;
      });

      summary = {
        totalManagers,
        totalStaff,
        activeEmployees,
        inactiveEmployees,
        departmentCounts,
      };
    } else if (isChef) {
      const kitchenFilter = { department: { $regex: /kitchen|chef|cook/i } };
      const [totalStaff, activeEmployees, inactiveEmployees] = await Promise.all([
        User.countDocuments({ ...kitchenFilter, role: "staff" }),
        User.countDocuments({ ...kitchenFilter, role: "staff", isActive: true }),
        User.countDocuments({ ...kitchenFilter, role: "staff", isActive: false }),
      ]);
      summary = {
        totalManagers: 1,
        totalStaff,
        activeEmployees,
        inactiveEmployees,
        departmentCounts: { Kitchen: totalStaff },
      };
    } else if (isMgr) {
      const authDept = requester?.department || "";
      const deptFilter = authDept ? { department: { $regex: new RegExp(`^${escapeRegex(authDept)}$`, "i") } } : {};
      const [totalStaff, activeEmployees, inactiveEmployees] = await Promise.all([
        User.countDocuments({ ...deptFilter, role: "staff" }),
        User.countDocuments({ ...deptFilter, role: "staff", isActive: true }),
        User.countDocuments({ ...deptFilter, role: "staff", isActive: false }),
      ]);
      summary = {
        totalManagers: 1,
        totalStaff,
        activeEmployees,
        inactiveEmployees,
        departmentCounts: authDept ? { [authDept]: totalStaff } : {},
      };
    }
  } catch (_metricsErr) {
    // Fallback gracefully if metrics aggregation fails
  }

  return {
    staff: staffList.map((s) => formatStaff(s, { hideCompensation: isChef })),
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
    summary,
  };
};

/**
 * Get one staff member by ID
 */
const getStaffById = async (staffId, requester = null) => {
  const staff = await User.findById(staffId).select("-password").lean();

  if (!staff) {
    const error = new Error("Staff member not found");
    error.statusCode = 404;
    throw error;
  }

  // Authorization check
  if (isSuperAdmin(requester)) {
    return formatStaff(staff);
  }

  if (isChefManager(requester)) {
    if (staff.role !== "staff" || normalizeDepartment(staff.department) !== "Kitchen") {
      const error = new Error("Access denied: You do not have permission to view staff outside the Kitchen department");
      error.statusCode = 403;
      throw error;
    }
    return formatStaff(staff, { hideCompensation: true });
  }

  if (isDepartmentManager(requester)) {
    const authDept = requester?.department || "";
    if (staff.role !== "staff" || normalizeDepartment(staff.department) !== normalizeDepartment(authDept)) {
      const error = new Error(`Access denied: You do not have permission to view staff outside your department ("${authDept}")`);
      error.statusCode = 403;
      throw error;
    }
    return formatStaff(staff);
  }

  // If requester is the staff member themselves
  if (requester?.userId && String(requester.userId) === String(staffId)) {
    return formatStaff(staff);
  }

  const error = new Error("Access denied: Insufficient permissions to view this user profile");
  error.statusCode = 403;
  throw error;
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
    avatar,
    phone,
    location,
    employmentType,
    salary,
    salaryType,
    hourlyRate,
    employeeId,
    department,
    role,
    emergencyContact,
  },
  requester = null
) => {
  const staff = await User.findById(staffId);

  if (!staff) {
    const error = new Error("Staff member not found");
    error.statusCode = 404;
    throw error;
  }

  const isSuper = isSuperAdmin(requester);
  const isChef = isChefManager(requester);
  const isMgr = !isSuper && isDepartmentManager(requester);

  // Authorization checks on update
  if (!isSuper) {
    if (staff.role !== "staff") {
      const error = new Error("Access denied: Cannot modify manager accounts");
      error.statusCode = 403;
      throw error;
    }

    if (isChef) {
      if (normalizeDepartment(staff.department) !== "Kitchen") {
        const error = new Error("Access denied: Staff member belongs to another department");
        error.statusCode = 403;
        throw error;
      }
      if (department !== undefined && normalizeDepartment(department) !== "Kitchen") {
        const error = new Error("Access denied: Cannot reassign kitchen staff to a different department");
        error.statusCode = 403;
        throw error;
      }
    } else if (isMgr) {
      const authDept = requester?.department ? String(requester.department).trim() : "";
      if (authDept && normalizeDepartment(staff.department) !== normalizeDepartment(authDept)) {
        const error = new Error("Access denied: Staff member belongs to another department");
        error.statusCode = 403;
        throw error;
      }
      if (authDept && department !== undefined && normalizeDepartment(department) !== normalizeDepartment(authDept)) {
        const error = new Error(`Access denied: Cannot reassign staff to a different department (must remain "${authDept}")`);
        error.statusCode = 403;
        throw error;
      }
    }

    const isManagerialRoleAttempt = (r) => {
      if (!r) return false;
      const lower = String(r).toLowerCase().trim();
      return lower === "manager" || lower === "admin" || lower === "superadmin";
    };

    if (isManagerialRoleAttempt(role)) {
      const error = new Error("Access denied: Managers cannot promote staff or change roles");
      error.statusCode = 403;
      throw error;
    }
  }

  // Update username
  if (username !== undefined) {
    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername.length < 3) {
      const error = new Error("Username must be at least 3 characters");
      error.statusCode = 400;
      throw error;
    }

    if (normalizedUsername !== staff.username) {
      const existingUsername = await User.findOne({
        username: normalizedUsername,
        _id: { $ne: staffId },
      });
      if (existingUsername) {
        const error = new Error("Username is already taken");
        error.statusCode = 409;
        throw error;
      }
      staff.username = normalizedUsername;
    }
  }

  // Update email
  if (email !== undefined) {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== staff.email) {
      const existingEmail = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: staffId },
      });
      if (existingEmail) {
        const error = new Error("Email is already registered");
        error.statusCode = 409;
        throw error;
      }
      staff.email = normalizedEmail;
    }
  }

  // Update basic info
  if (name !== undefined) {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      const error = new Error("Name must be at least 2 characters");
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

  if (employmentType !== undefined) {
    const allowedTypes = ["full-time", "part-time", "contract", "temporary"];
    if (!allowedTypes.includes(employmentType)) {
      const error = new Error("Invalid employment type");
      error.statusCode = 400;
      throw error;
    }
    staff.employmentType = employmentType;
  }

  // Salary & Compensation (Protected: Chef Manager cannot alter compensation)
  if (!isChef) {
    if (salary !== undefined) {
      staff.salary = Math.max(0, Number(salary) || 0);
    }
    if (salaryType !== undefined) {
      staff.salaryType = salaryType;
    }
    if (hourlyRate !== undefined) {
      staff.hourlyRate = Math.max(0, Number(hourlyRate) || 0);
    } else if (staff.salaryType === "hourly" && salary !== undefined) {
      staff.hourlyRate = staff.salary;
    }
  }

  // Department reassignment (Authorized check passed above)
  if (department !== undefined) {
    staff.department = department.trim();
  }

  // Role modification (Only Superadmin allowed)
  if (isSuper && role !== undefined) {
    const allowedRoles = ["superadmin", "admin", "manager", "staff"];
    if (allowedRoles.includes(role.toLowerCase())) {
      staff.role = role.toLowerCase();
    }
  }

  // Employee ID
  if (employeeId !== undefined) {
    const normalizedEmployeeId = employeeId.trim();
    if (normalizedEmployeeId && normalizedEmployeeId !== staff.employeeId) {
      const existingEmployeeId = await User.findOne({
        employeeId: normalizedEmployeeId,
        _id: { $ne: staffId },
      });
      if (existingEmployeeId) {
        const error = new Error("Employee ID is already in use");
        error.statusCode = 409;
        throw error;
      }
      staff.employeeId = normalizedEmployeeId || undefined;
    }
  }

  // Emergency contact
  if (emergencyContact !== undefined) {
    staff.emergencyContact = {
      name: emergencyContact?.name?.trim() || "",
      phone: emergencyContact?.phone?.trim() || "",
      relationship: emergencyContact?.relationship?.trim() || "",
    };
  }

  let oldAvatar = null;
  if (avatar !== undefined) {
    const newAvatar = String(avatar).trim();
    oldAvatar = staff.avatar;
    staff.avatar = newAvatar;
  }

  await staff.save();

  if (oldAvatar && oldAvatar !== staff.avatar) {
    deleteAvatarFile(oldAvatar);
  }

  return formatStaff(staff, { hideCompensation: isChef });
};

/**
 * Upload and update staff avatar
 */
const uploadStaffAvatar = async (staffId, avatarUrl, requester = null) => {
  const staff = await User.findById(staffId);

  if (!staff) {
    const error = new Error("Staff member not found");
    error.statusCode = 404;
    throw error;
  }

  // Authorization check
  if (!isSuperAdmin(requester)) {
    if (staff.role !== "staff") {
      const error = new Error("Access denied: Cannot modify manager accounts");
      error.statusCode = 403;
      throw error;
    }
    if (isChefManager(requester) && normalizeDepartment(staff.department) !== "Kitchen") {
      const error = new Error("Access denied: Staff member belongs to another department");
      error.statusCode = 403;
      throw error;
    }
    if (isDepartmentManager(requester) && normalizeDepartment(staff.department) !== normalizeDepartment(requester?.department)) {
      const error = new Error("Access denied: Staff member belongs to another department");
      error.statusCode = 403;
      throw error;
    }
  }

  const oldAvatar = staff.avatar;
  const newAvatar = String(avatarUrl).trim();
  staff.avatar = newAvatar;
  await staff.save();

  if (oldAvatar && oldAvatar !== newAvatar) {
    deleteAvatarFile(oldAvatar);
  }

  return formatStaff(staff, { hideCompensation: isChefManager(requester) });
};

/**
 * Activate / deactivate staff
 */
const updateStaffStatus = async (staffId, isActive, requester = null) => {
  const staff = await User.findById(staffId);

  if (!staff) {
    const error = new Error("Staff member not found");
    error.statusCode = 404;
    throw error;
  }

  // Authorization check
  if (!isSuperAdmin(requester)) {
    if (staff.role !== "staff") {
      const error = new Error("Access denied: Cannot modify manager accounts");
      error.statusCode = 403;
      throw error;
    }
    if (isChefManager(requester) && normalizeDepartment(staff.department) !== "Kitchen") {
      const error = new Error("Access denied: Staff member belongs to another department");
      error.statusCode = 403;
      throw error;
    }
    if (isDepartmentManager(requester) && normalizeDepartment(staff.department) !== normalizeDepartment(requester?.department)) {
      const error = new Error("Access denied: Staff member belongs to another department");
      error.statusCode = 403;
      throw error;
    }
  }

  staff.isActive = Boolean(isActive);
  await staff.save();

  return formatStaff(staff, { hideCompensation: isChefManager(requester) });
};

/**
 * Reset staff password
 */
const resetStaffPassword = async (staffId, newPassword, requester = null) => {
  const staff = await User.findById(staffId).select("+password");

  if (!staff) {
    const error = new Error("Staff member not found");
    error.statusCode = 404;
    throw error;
  }

  // Authorization check
  if (!isSuperAdmin(requester)) {
    if (staff.role !== "staff") {
      const error = new Error("Access denied: Cannot modify manager accounts");
      error.statusCode = 403;
      throw error;
    }
    if (isChefManager(requester) && normalizeDepartment(staff.department) !== "Kitchen") {
      const error = new Error("Access denied: Staff member belongs to another department");
      error.statusCode = 403;
      throw error;
    }
    if (isDepartmentManager(requester) && normalizeDepartment(staff.department) !== normalizeDepartment(requester?.department)) {
      const error = new Error("Access denied: Staff member belongs to another department");
      error.statusCode = 403;
      throw error;
    }
  }

  if (!newPassword || newPassword.length < 6) {
    const error = new Error("Password must be at least 6 characters");
    error.statusCode = 400;
    throw error;
  }

  staff.password = await bcrypt.hash(newPassword, 12);
  await staff.save();

  return {
    id: staff._id,
    username: staff.username,
    message: "Staff password updated successfully",
  };
};

module.exports = {
  createStaff,
  getStaff,
  getStaffById,
  updateStaff,
  uploadStaffAvatar,
  updateStaffStatus,
  resetStaffPassword,
  formatStaff,
  isSuperAdmin,
  isChefManager,
  isDepartmentManager,
};