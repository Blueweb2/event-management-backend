const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const eventRoutes = require("./routes/event.routes");
const clientRoutes = require("./routes/client.routes");
const serviceRoutes = require("./routes/service.routes");
const estimateRoutes = require("./routes/estimate.routes");
const staffRoutes = require("./routes/staff.routes");
const assignmentRoutes = require("./routes/assignment.routes");
const taskRoutes = require("./routes/task.routes");
const availabilityRoutes = require("./routes/availability.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const bookingRoutes = require("./routes/booking.routes");
const foodRoutes = require("./routes/food.routes");
const expenseRoutes = require("./routes/expense.routes");
const reportRoutes = require("./routes/report.routes");
const departmentRoutes = require("./routes/department.routes");

const notFound = require("./middlewares/notFound.middleware");
const errorHandler = require("./middlewares/error.middleware");

const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type"],
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api", apiLimiter);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(require("path").join(__dirname, "../uploads")));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Event Management API is running",
  });
});

// Routes
app.use("/api/auth", authRoutes);

app.use(
  "/api/users/staff",
  staffRoutes
);

app.use("/api/users", userRoutes);
app.use(
  "/api/assignments",
  assignmentRoutes
);

app.use(
  "/api/tasks",
  taskRoutes
);

app.use(
  "/api/availability",
  availabilityRoutes
);

app.use(
  "/api/attendance",
  attendanceRoutes
);

app.use(
  "/api/bookings",
  bookingRoutes
);

app.use("/api/events", eventRoutes);
app.use("/api/estimates", estimateRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/food", foodRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/departments", departmentRoutes);

// 404 handler
app.use(notFound);

// Error handler - MUST be last
app.use(errorHandler);

module.exports = app;