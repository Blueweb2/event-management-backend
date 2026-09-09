const bcrypt = require("bcryptjs");

const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");

/**
 * Register a new user
 */
const register = async ({
  name,
  email,
  password,
  role = "staff",
}) => {
  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();

  // Check if user already exists
  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
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

  // Create user
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    role,
  });

  // Generate JWT
  const token = generateToken(user);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  };
};

/**
 * Login user
 */
const login = async ({ email, password }) => {
  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();

  // Password has select:false in the model,
  // so explicitly request it here.
  const user = await User.findOne({
    email: normalizedEmail,
  }).select("+password");

  if (!user) {
    const error = new Error(
      "Invalid email or password"
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
      "Invalid email or password"
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
      email: user.email,
      role: user.role,
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
    email: user.email,
    phone: user.phone || "",
    location: user.location || "",
    employmentType: user.employmentType || "full-time",
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
};