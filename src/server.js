require("dotenv").config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const initializeSocket = require("./socket");
const { autoCheckoutEndedEventsStaff } = require("./services/autoCheckout.service");
const { autoCancelOverdueEstimates } = require("./services/estimate.service");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);
    const io = initializeSocket(server);

    // Initial check on server start for events/duties whose end time has already passed
    autoCheckoutEndedEventsStaff().catch((err) => {
      console.error("[Auto-Checkout] Initial run error:", err);
    });

    // Initial check to auto-cancel overdue unconverted estimates
    autoCancelOverdueEstimates().catch((err) => {
      console.error("[Auto-Cancel Estimates] Initial run error:", err);
    });

    // Check periodically every 60 seconds
    const AUTO_CHECKOUT_INTERVAL_MS = 60 * 1000;
    setInterval(() => {
      autoCheckoutEndedEventsStaff().catch((err) => {
        console.error("[Auto-Checkout] Periodic check error:", err);
      });
      autoCancelOverdueEstimates().catch((err) => {
        console.error("[Auto-Cancel Estimates] Periodic check error:", err);
      });
    }, AUTO_CHECKOUT_INTERVAL_MS);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`⚡ Socket.IO server initialized successfully`);
      console.log(`🕒 Auto-checkout service active (checking every 60s)`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();