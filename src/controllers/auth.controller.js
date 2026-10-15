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

/**
 * Create a new manager account
 * POST /api/auth/managers
 * Protected: Superadmin only
 */
const createManager = async (req, res, next) => {
  try {
    const {
      name,
      username,
      email,
      password,
      phone,
      location,
      department,
      permissions,
    } = req.body;

    const manager = await authService.createManager({
      name,
      username,
      email,
      password,
      phone,
      location,
      department,
      permissions,
      createdBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Manager account created successfully",
      data: manager,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update manager department, permissions, or profile
 * PUT /api/auth/managers/:id
 * Protected: Superadmin only
 */
const updateManager = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      location,
      department,
      permissions,
      isActive,
    } = req.body;

    const updated = await authService.updateManager(id, {
      name,
      phone,
      location,
      department,
      permissions,
      isActive,
    });

    res.status(200).json({
      success: true,
      message: "Manager account updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all managers
 * GET /api/auth/managers
 * Protected: Superadmin only
 */
const getManagers = async (req, res, next) => {
  try {
    const managers = await authService.getManagers();

    res.status(200).json({
      success: true,
      data: managers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update manager status
 * PATCH /api/auth/managers/:id/status
 * Protected: Superadmin only
 */
const updateManagerStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive === undefined) {
      const error = new Error("isActive boolean value is required");
      error.statusCode = 400;
      throw error;
    }

    const updated = await authService.updateManagerStatus(id, isActive);

    res.status(200).json({
      success: true,
      message: `Manager ${updated.isActive ? "activated" : "deactivated"} successfully`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bootstrap the initial superadmin
 * POST /api/auth/bootstrap-superadmin
 * One-time setup: locked permanently once a superadmin exists
 */
const bootstrapSuperAdmin = async (req, res, next) => {
  try {
    const {
      name,
      username,
      email,
      password,
      phone,
      location,
      secret,
    } = req.body;

    const headerSecret = req.headers["x-bootstrap-secret"] || secret;

    const result = await authService.bootstrapSuperAdmin({
      name,
      username,
      email,
      password,
      phone,
      location,
      secret: headerSecret,
    });

    res.status(201).json({
      success: true,
      message: "Superadmin account provisioned successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
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