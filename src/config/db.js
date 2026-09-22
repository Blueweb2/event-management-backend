const dns = require("dns");
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const dnsServers = process.env.MONGO_DNS_SERVERS?.split(",")
      .map((server) => server.trim())
      .filter(Boolean);

    if (dnsServers?.length) {
      try {
        dns.setServers(dnsServers);
      } catch (dnsErr) {
        console.warn("Could not override DNS servers:", dnsErr.message);
      }
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    if (error.message.includes("ENOTFOUND")) {
      console.error(
        "💡 DNS/Network Hint: Ensure your internet connection is active and MongoDB Atlas cluster IP access list includes your current IP (or 0.0.0.0/0 for dev)."
      );
    }
    process.exit(1);
  }
};

module.exports = connectDB;