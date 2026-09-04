const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    // Check password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "staff",
    });

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
};