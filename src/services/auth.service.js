const bcrypt = require("bcryptjs");

const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");
const {
  DEFAULT_DEPARTMENT_PERMISSIONS,
  normalizeDepartment,
} = require("../utils/department.constants");

/**
 * Register a new user (Public endpoint)
 * Enforces role: "staff" and prevents unauthenticated privilege escalation.
 */
const register = async ({
  name,
  username,
  email,
  password,
  role,
}) => {
  // Reject attempts by public unauthenticated callers to acquire privileged roles
  if (role && role.toString().toLowerCase().trim() !== "staff") {
    const error = new Error(
      "Registration with elevated roles is not permitted"
    );
    error.statusCode = 403;
    throw error;
  }

  const normalizedUsername = username
    .trim()
    .toLowerCase();

  const normalizedEmail = email
    .trim()
    .toLowerCase();

  // Check username
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

  // Check email
  const existingEmail = await User.findOne({
    email: normalizedEmail,
  });

  if (existingEmail) {
    const error = new Error(
      "User with this email already exists"
    );

    error.statusCode = 409;

    throw error;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(
    password,
    12
  );

  // Create user - Always force role "staff" for public registrations
  const user = await User.create({
    name: name.trim(),
    username: normalizedUsername,
    email: normalizedEmail,
    password: hashedPassword,
    role: "staff",
  });

  // Generate JWT
  const token = generateToken(user);

  return {
    user: {
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    token,
  };
};

/**
 * Create a new Manager account
 * Authenticated Superadmin only.
 * The backend enforces role: "manager" and never trusts a client-supplied role.
 */
const createManager = async ({
  name,
  username,
  email,
  password,
  phone = "",
  location = "",
  department = "Operations",
  permissions = [],
  createdBy = null,
}) => {
  if (!name || !username || !email || !password) {
    const error = new Error(
      "Name, username, email, and password are required"
    );
    error.statusCode = 400;
    throw error;
  }

  if (typeof password !== "string" || password.length < 6) {
    const error = new Error(
      "Password must be at least 6 characters long"
    );
    error.statusCode = 400;
    throw error;
  }

  const trimmedName = name.trim();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  const usernameRegex = /^[a-z0-9._-]+$/;
  if (
    normalizedUsername.length < 3 ||
    normalizedUsername.length > 30 ||
    !usernameRegex.test(normalizedUsername)
  ) {
    const error = new Error(
      "Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens"
    );
    error.statusCode = 400;
    throw error;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    const error = new Error("Please provide a valid email address");
    error.statusCode = 400;
    throw error;
  }

  const existingUsername = await User.findOne({
    username: normalizedUsername,
  });
  if (existingUsername) {
    const error = new Error("Username is already taken");
    error.statusCode = 409;
    throw error;
  }

  const existingEmail = await User.findOne({
    email: normalizedEmail,
  });
  if (existingEmail) {
    const error = new Error("User with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const normalizedDept = normalizeDepartment(department || "Operations");
  const assignedPermissions =
    Array.isArray(permissions) && permissions.length > 0
      ? permissions
      : DEFAULT_DEPARTMENT_PERMISSIONS[normalizedDept] || [];

  const manager = await User.create({
    name: trimmedName,
    username: normalizedUsername,
    email: normalizedEmail,
    password: hashedPassword,
    role: "manager", // Enforced server-side, never trusted from client
    phone: phone ? phone.trim() : "",
    location: location ? location.trim() : "",
    department: normalizedDept,
    permissions: assignedPermissions,
    employmentType: "full-time",
    isActive: true,
    createdBy: createdBy || null,
  });

  return {
    id: manager._id,
    name: manager.name,
    username: manager.username,
    email: manager.email,
    phone: manager.phone || "",
    location: manager.location || "",
    department: manager.department || "",
    permissions: manager.permissions || [],
    employmentType: manager.employmentType,
    role: manager.role,
    isActive: manager.isActive,
    createdAt: manager.createdAt,
  };
};

/**
 * List all managers (Superadmin only)
 */
const getManagers = async () => {
  const managers = await User.find({
    role: { $in: ["manager", "admin"] },
  })
    .select("-password")
    .sort({ createdAt: -1 });

  return managers.map((m) => ({
    id: m._id,
    name: m.name,
    username: m.username,
    email: m.email,
    phone: m.phone || "",
    location: m.location || "",
    department: m.department || "",
    permissions: m.permissions || [],
    employmentType: m.employmentType,
    role: m.role,
    isActive: m.isActive,
    createdAt: m.createdAt,
  }));
};

/**
 * Update manager department, permissions, or profile (Superadmin only)
 */
const updateManager = async (
  managerId,
  { name, phone, location, department, permissions, isActive }
) => {
  const manager = await User.findOne({
    _id: managerId,
    role: { $in: ["manager", "admin"] },
  });

  if (!manager) {
    const error = new Error("Manager not found");
    error.statusCode = 404;
    throw error;
  }

  if (name && typeof name === "string") {
    manager.name = name.trim();
  }
  if (phone !== undefined) {
    manager.phone = String(phone).trim();
  }
  if (location !== undefined) {
    manager.location = String(location).trim();
  }
  if (isActive !== undefined) {
    manager.isActive = Boolean(isActive);
  }

  if (department !== undefined) {
    const normalizedDept = normalizeDepartment(department);
    manager.department = normalizedDept;

    // If permissions not explicitly passed when department changed, assign default permissions for department
    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      manager.permissions = DEFAULT_DEPARTMENT_PERMISSIONS[normalizedDept] || [];
    }
  }

  if (permissions !== undefined && Array.isArray(permissions)) {
    manager.permissions = permissions;
  }

  await manager.save();

  return {
    id: manager._id,
    name: manager.name,
    username: manager.username,
    email: manager.email,
    phone: manager.phone || "",
    location: manager.location || "",
    department: manager.department || "",
    permissions: manager.permissions || [],
    employmentType: manager.employmentType,
    role: manager.role,
    isActive: manager.isActive,
    updatedAt: manager.updatedAt,
  };
};

/**
 * Update manager status (activate/deactivate)
 */
const updateManagerStatus = async (managerId, isActive) => {
  const manager = await User.findOne({
    _id: managerId,
    role: { $in: ["manager", "admin"] },
  });

  if (!manager) {
    const error = new Error("Manager not found");
    error.statusCode = 404;
    throw error;
  }

  manager.isActive = Boolean(isActive);
  await manager.save();

  return {
    id: manager._id,
    name: manager.name,
    username: manager.username,
    email: manager.email,
    role: manager.role,
    department: manager.department || "",
    permissions: manager.permissions || [],
    isActive: manager.isActive,
  };
};

/**
 * One-time bootstrap process for the first superadmin.
 * Permanently locks down and returns 403 once any superadmin exists.
 */
const bootstrapSuperAdmin = async ({
  name,
  username,
  email,
  password,
  phone = "",
  location = "",
  secret = "",
}) => {
  const superAdminCount = await User.countDocuments({ role: "superadmin" });
  if (superAdminCount > 0) {
    const error = new Error(
      "Superadmin already exists. Bootstrap is permanently disabled."
    );
    error.statusCode = 403;
    throw error;
  }

  if (process.env.SUPERADMIN_BOOTSTRAP_SECRET) {
    if (secret !== process.env.SUPERADMIN_BOOTSTRAP_SECRET) {
      const error = new Error("Invalid bootstrap secret");
      error.statusCode = 403;
      throw error;
    }
  }

  if (!name || !username || !email || !password) {
    const error = new Error(
      "Name, username, email, and password are required"
    );
    error.statusCode = 400;
    throw error;
  }

  if (typeof password !== "string" || password.length < 6) {
    const error = new Error(
      "Password must be at least 6 characters long"
    );
    error.statusCode = 400;
    throw error;
  }

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  const existingUsername = await User.findOne({
    username: normalizedUsername,
  });
  if (existingUsername) {
    const error = new Error("Username is already taken");
    error.statusCode = 409;
    throw error;
  }

  const existingEmail = await User.findOne({
    email: normalizedEmail,
  });
  if (existingEmail) {
    const error = new Error("User with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const superAdmin = await User.create({
    name: name.trim(),
    username: normalizedUsername,
    email: normalizedEmail,
    password: hashedPassword,
    role: "superadmin", // Server assigned
    phone: phone ? phone.trim() : "",
    location: location ? location.trim() : "",
    department: "Executive System Administration",
    employmentType: "full-time",
    isActive: true,
  });

  const token = generateToken(superAdmin);

  return {
    user: {
      id: superAdmin._id,
      name: superAdmin.name,
      username: superAdmin.username,
      email: superAdmin.email,
      role: superAdmin.role,
    },
    token,
  };
};

/**
 * Login user
 *
 * Login can be done using:
 * - username
 * - email
 */
const login = async ({
  identifier,
  password,
}) => {
  const normalizedIdentifier = identifier
    .trim()
    .toLowerCase();

  // Find by username OR email.
  //
  // password has select:false in User model,
  // so explicitly include it.
  const user = await User.findOne({
    $or: [
      {
        username: normalizedIdentifier,
      },
      {
        email: normalizedIdentifier,
      },
    ],
  }).select("+password");

  if (!user) {
    const error = new Error(
      "Invalid username/email or password"
    );

    error.statusCode = 401;

    throw error;
  }

  // Check account status
  if (!user.isActive) {
    const error = new Error(
      "Your account has been deactivated"
    );

    error.statusCode = 403;

    throw error;
  }

  // Compare password
  const passwordMatch = await bcrypt.compare(
    password,
    user.password
  );

  if (!passwordMatch) {
    const error = new Error(
      "Invalid username/email or password"
    );

    error.statusCode = 401;

    throw error;
  }

  // Generate JWT
  const token = generateToken(user);

  return {
    user: {
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      department: user.department || "",
      permissions: user.permissions || [],
    },
    token,
  };
};

/**
 * Get currently authenticated user
 */
const getMe = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found");

    error.statusCode = 404;

    throw error;
  }

  return {
    id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone || "",
    location: user.location || "",
    department: user.department || "",
    permissions: user.permissions || [],
    employmentType:
      user.employmentType || "full-time",
    role: user.role,
    status: user.isActive
      ? "Active"
      : "Inactive",
    joinedDate: user.createdAt,
  };
};

module.exports = {
  register,
  login,
  getMe,
  createManager,
  getManagers,
  updateManager,
  updateManagerStatus,
  bootstrapSuperAdmin,
};