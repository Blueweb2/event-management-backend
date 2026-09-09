const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const eventRoutes = require("./routes/event.routes");
const serviceRoutes = require("./routes/service.routes");
const estimateRoutes = require("./routes/estimate.routes");

const notFound = require("./middlewares/notFound.middleware");
const errorHandler = require("./middlewares/error.middleware");

const app = express();

app.use(cors());

app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Event Management API is running",
  });
});

// Routes
app.use("/api/auth", authRoutes);

app.use("/api/users", userRoutes);

// app.use("/api/events", eventRoutes);

app.use("/api/services", serviceRoutes);

app.use("/api/estimates", estimateRoutes);

// 404 handler
app.use(notFound);

// Error handler - MUST be last
app.use(errorHandler);

module.exports = app;