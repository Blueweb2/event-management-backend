const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const { deleteAvatarFile } = require("../utils/avatar.util");

/**
 * Get the currently authenticated user's profile
 */
const getMyProfile = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    id: user._id,
    username: user.username || "",
    employeeId: user.employeeId || "",
    department: user.department || "Event Operations",
    name: user.name,
    email: user.email,
    avatar: user.avatar || "",
    phone: user.phone || "",
    location: user.location || "",
    employmentType: user.employmentType || "full-time",
    role: user.role,
    status: user.isActive ? "Active" : "Inactive",
    joinedDate: user.createdAt,
  };
};

/**
 * Update the currently authenticated user's profile
 */
const updateMyProfile = async (
  userId,
  { name, phone, location, avatar }
) => {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  // Update only fields that were provided
  if (name !== undefined) {
    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      const error = new Error(
        "Name must be at least 2 characters"
      );

      error.statusCode = 400;
      throw error;
    }

    user.name = trimmedName;
  }

  if (phone !== undefined) {
    user.phone = phone.trim();
  }

  if (location !== undefined) {
    user.location = location.trim();
  }

  if (avatar !== undefined) {
    const newAvatar = String(avatar).trim();
    const oldAvatar = user.avatar;
    user.avatar = newAvatar;
    if (oldAvatar && oldAvatar !== newAvatar) {
      deleteAvatarFile(oldAvatar);
    }
  }

  await user.save();

  return {
    id: user._id,
    username: user.username || "",
    employeeId: user.employeeId || "",
    department: user.department || "Event Operations",
    name: user.name,
    email: user.email,
    avatar: user.avatar || "",
    phone: user.phone || "",
    location: user.location || "",
    employmentType: user.employmentType || "full-time",
    role: user.role,
    status: user.isActive ? "Active" : "Inactive",
    joinedDate: user.createdAt,
  };
};

const uploadMyAvatar = async (userId, avatarUrl) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const oldAvatar = user.avatar;
  const newAvatar = String(avatarUrl).trim();
  user.avatar = newAvatar;
  await user.save();

  if (oldAvatar && oldAvatar !== newAvatar) {
    deleteAvatarFile(oldAvatar);
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
  };
};

const changeMyPassword = async (
  userId,
  currentPassword,
  newPassword
) => {
  if (!currentPassword || !newPassword) {
    const error = new Error("Current and new passwords are required");
    error.statusCode = 400;
    throw error;
  }

  if (newPassword.length < 6) {
    const error = new Error("New password must be at least 6 characters");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(userId).select("+password");
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (!(await bcrypt.compare(currentPassword, user.password))) {
    const error = new Error("Current password is incorrect");
    error.statusCode = 400;
    throw error;
  }

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
  changeMyPassword,
};