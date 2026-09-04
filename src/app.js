const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Event Management API is running",
  });
});

module.exports = app;

// express() → creates our API server
// cors() → allows our Next.js frontend to communicate with the backend
// express.json() → allows the API to receive JSON request bodies
// /api/health → simple endpoint to verify that the backend is working