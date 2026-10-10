const { Server } = require("socket.io");
const { verifyToken } = require("./utils/jwt");

let ioInstance = null;

const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  ioInstance = io;

  // Socket authentication middleware to reject expired/invalid tokens
  io.use((socket, next) => {
    const rawToken =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

    if (rawToken) {
      try {
        const decoded = verifyToken(rawToken);
        if (!decoded || !decoded.userId) {
          return next(new Error("Authentication failed: Invalid token payload"));
        }
        socket.user = decoded;
      } catch (err) {
        if (err.name === "TokenExpiredError") {
          return next(new Error("Authentication failed: Token has expired"));
        }
        return next(new Error("Authentication failed: Invalid token"));
      }
    }

    next();
  });

  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    // Join room for a specific event
    socket.on("join:event", (eventId) => {
      if (!eventId) {
        return;
      }

      const room = `event:${eventId}`;
      socket.join(room);
      console.log(`👥 Socket ${socket.id} joined event room: ${room}`);

      socket.emit("event:joined", {
        eventId,
        room,
      });
    });

    // Join room for a specific staff user
    socket.on("join:staff", (staffId) => {
      if (!staffId) return;
      const room = `staff:${staffId}`;
      socket.join(room);
      console.log(`👥 Socket ${socket.id} joined staff room: ${room}`);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Client disconnected:", socket.id);
    });
  });

  return io;
};

const getIO = () => ioInstance;

initializeSocket.initializeSocket = initializeSocket;
initializeSocket.getIO = getIO;

module.exports = initializeSocket;