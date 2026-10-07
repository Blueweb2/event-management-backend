require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDB = require("../config/db");
const User = require("../models/user.model");
const Service = require("../models/service.model");
const Client = require("../models/client.model");
const Booking = require("../models/booking.model");
const Event = require("../models/event.model");

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();

    console.log("Checking seed users...");

    const isProduction = process.env.NODE_ENV === "production";
    const adminEmail = process.env.ADMIN_EMAIL || "admin@eventmanagement.com";
    const adminPassword = process.env.ADMIN_PASSWORD || (isProduction ? null : "admin123");

    if (isProduction && !process.env.ADMIN_PASSWORD) {
      console.warn("⚠️ Production Notice: ADMIN_PASSWORD environment variable not set. Skipping automatic admin provisioning.");
    }

    // 1. Seed Admin/Manager
    let admin = await User.findOne({ email: adminEmail });
    if (!admin && adminPassword) {
      const hashedAdminPassword = await bcrypt.hash(adminPassword, 12);
      admin = await User.create({
        name: process.env.ADMIN_NAME || "Alex Morgan",
        username: process.env.ADMIN_USERNAME || "admin_alex",
        email: adminEmail,
        password: hashedAdminPassword,
        role: "admin",
        phone: process.env.ADMIN_PHONE || "+1 555 019 2831",
        location: "New York, USA",
        department: "Management",
        employmentType: "full-time",
        isActive: true,
      });
      console.log(`Created administrator account: ${adminEmail}`);
    } else if (admin) {
      console.log(`Administrator already exists: ${adminEmail}`);
    }

    // 2. Seed Staff (development/testing only unless explicitly configured)
    if (!isProduction) {
      let staff = await User.findOne({ email: "staff@eventmanagement.com" });
      if (!staff) {
        const hashedStaffPassword = await bcrypt.hash("staff123", 12);
        staff = await User.create({
          name: "Arun Kumar",
          username: "arun_staff",
          email: "staff@eventmanagement.com",
          password: hashedStaffPassword,
          role: "staff",
          phone: "+1 555 019 4482",
          location: "Brooklyn, NY",
          department: "Event Production",
          employmentType: "full-time",
          isActive: true,
          createdBy: admin?._id || null,
        });
        console.log("Created demo staff account: staff@eventmanagement.com");
      } else {
        console.log("Staff already exists: staff@eventmanagement.com");
      }
    }

    // 3. Seed Services if empty
    const serviceCount = await Service.countDocuments();
    if (serviceCount === 0) {
      await Service.create([
        {
          name: "Premium Catering & Beverage",
          category: "catering",
          pricingType: "PER_GUEST",
          basePrice: 45,
          description: "Full-course gourmet buffet and artisan cocktail bar.",
          active: true,
        },
        {
          name: "Live Sound & Concert Lighting",
          category: "sound",
          pricingType: "FIXED",
          basePrice: 1200,
          description: "High-definition PA audio array, line mixer, and stage spotlighting.",
          active: true,
        },
        {
          name: "Event Photography & Cinematography",
          category: "photography",
          pricingType: "FIXED",
          basePrice: 850,
          description: "Full day 4K video recording, drone aerials, and edited photo album.",
          active: true,
        },
        {
          name: "Luxury Floral & Stage Decoration",
          category: "decoration",
          pricingType: "FIXED",
          basePrice: 1500,
          description: "Custom floral arrangements, grand archway, table centerpieces.",
          active: true,
        },
      ]);
      console.log("Created 4 sample services.");
    }

    // 4. Seed Client & Sample Event if empty
    const eventCount = await Event.countDocuments();
    if (eventCount === 0) {
      const client = await Client.create({
        name: "Eleanor Vance",
        email: "eleanor.vance@example.com",
        phone: "+1 555 234 5678",
        city: "New York",
        state: "NY",
        country: "USA",
      });

      const booking = await Booking.create({
        client: client._id,
        eventName: "Annual Corporate Gala 2026",
        eventType: "corporate",
        eventDate: new Date("2026-12-18"),
        eventTime: "18:00",
        guests: 150,
        location: "The Grand Hyatt, Manhattan",
        description: "Year-end awards dinner and keynote presentations.",
        status: "Confirmed",
        name: client.name,
        email: client.email,
        phone: client.phone,
      });

      await Event.create({
        client: client._id,
        booking: booking._id,
        eventName: booking.eventName,
        eventType: booking.eventType,
        eventDate: booking.eventDate,
        eventTime: booking.eventTime,
        guests: booking.guests,
        location: booking.location,
        description: booking.description,
        status: "Upcoming",
        createdBy: admin._id,
      });
      console.log("Created sample confirmed event.");
    }

    console.log("\nDatabase seeded successfully!");
    console.log("==========================================");
    console.log("Manager Login: admin@eventmanagement.com  Password: admin123");
    console.log("Staff Login:   staff@eventmanagement.com  Password: staff123");
    console.log("==========================================\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

seed();
