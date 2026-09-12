const authService = require("../services/auth.service");

/**
 * Register
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const {
      name,
      username,
      email,
      password,
      role,
    } = req.body;

    if (!name || !username || !email || !password) {
      const error = new Error(
        "Name, username, email and password are required"
      );

      error.statusCode = 400;

      throw error;
    }

    const result = await authService.register({
      name,
      username,
      email,
      password,
      role,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login
 * POST /api/auth/login
 *
 * Login using username OR email
 */
const login = async (req, res, next) => {
  try {
    const { identifier, email, username, password } = req.body;
    const loginIdentifier = identifier || email || username;

    if (!loginIdentifier || !password) {
      const error = new Error(
        "Username/email and password are required"
      );

      error.statusCode = 400;

      throw error;
    }

    const result = await authService.login({
      identifier: loginIdentifier,
      password,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current authenticated user
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(
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

module.exports = {
  register,
  login,
  getMe,
};