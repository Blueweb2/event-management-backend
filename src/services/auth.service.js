const bcrypt = require("bcryptjs");

const User = require("../models/user.model");
const { generateToken } = require("../utils/jwt");

/**
 * Register a new user
 */
const register = async ({
  name,
  username,
  email,
  password,
  role = "staff",
}) => {
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

  // Create user
  const user = await User.create({
    name: name.trim(),
    username: normalizedUsername,
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
      username: user.username,
      email: user.email,
      role: user.role,
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
};