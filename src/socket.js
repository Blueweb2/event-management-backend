const { Server } = require("socket.io");

const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: ["GET", "POST"],
    },
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

    socket.on("disconnect", () => {
      console.log("🔌 Client disconnected:", socket.id);
    });
  });

  return io;
};

module.exports = initializeSocket;