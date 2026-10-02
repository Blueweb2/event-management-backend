const userService = require("../services/user.service");

/**
 * Get my profile
 * GET /api/users/me
 */
const getMyProfile = async (req, res, next) => {
  try {
    const user = await userService.getMyProfile(
      req.user.userId
    );

    res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update my profile
 * PUT /api/users/me
 */
const updateMyProfile = async (req, res, next) => {
  try {
    const { name, phone, location } = req.body;

    const user = await userService.updateMyProfile(
      req.user.userId,
      {
        name,
        phone,
        location,
      }
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

const changeMyPassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await userService.changeMyPassword(
      req.user.userId,
      currentPassword,
      newPassword
    );

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload avatar for current user
 * POST /api/users/me/avatar
 */
const uploadMyAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("Please select an image file to upload");
      error.statusCode = 400;
      throw error;
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await userService.uploadMyAvatar(req.user.userId, avatarUrl);

    res.status(200).json({
      success: true,
      message: "Avatar uploaded successfully",
      data: {
        avatarUrl,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
  changeMyPassword,
};