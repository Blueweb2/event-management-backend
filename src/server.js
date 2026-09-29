require("dotenv").config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const initializeSocket = require("./socket");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);
    const io = initializeSocket(server);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`⚡ Socket.IO server initialized successfully`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();