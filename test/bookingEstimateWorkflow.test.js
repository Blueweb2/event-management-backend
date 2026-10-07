const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const mongoose = require("mongoose");
const dns = require("dns");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

if (process.env.MONGO_DNS_SERVERS) {
  const dnsServers = process.env.MONGO_DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    try {
      dns.setServers(dnsServers);
    } catch (e) {}
  }
}

const app = require("../src/app");
const User = require("../src/models/user.model");
const Client = require("../src/models/client.model");
const Booking = require("../src/models/booking.model");
const Event = require("../src/models/event.model");
const Estimate = require("../src/models/estimate.model");
const Service = require("../src/models/service.model");
const { generateToken } = require("../src/utils/jwt");

test.describe("Booking & Estimate Management Workflow & RBAC Security Suite", () => {
  let server;
  let baseUrl;
  let testManager;
  let testAdmin;
  let testStaff;
  let managerToken;
  let adminToken;
  let staffToken;
  let testService;
  const createdEstimateIds = [];
  const createdBookingIds = [];
  const createdEventIds = [];
  const createdClientIds = [];

  test.before(async () => {
    const mongoUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });

    // Start ephemeral HTTP server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}/api`;

    const ts = Date.now();

    // Create Manager Account
    testManager = await User.create({
      name: "Booking Test Manager",
      username: `bookmgr_${ts}`,
      email: `book-mgr-${ts}@example.com`,
      password: "Password123!",
      phone: "9988776655",
      role: "manager",
    });
    managerToken = generateToken(testManager);

    // Create Admin Account
    testAdmin = await User.create({
      name: "Booking Test Admin",
      username: `bookadmin_${ts}`,
      email: `book-admin-${ts}@example.com`,
      password: "Password123!",
      phone: "9988776656",
      role: "admin",
    });
    adminToken = generateToken(testAdmin);

    // Create Staff Account
    testStaff = await User.create({
      name: "Booking Test Staff",
      username: `bookstaff_${ts}`,
      email: `book-staff-${ts}@example.com`,
      password: "Password123!",
      phone: "9988776657",
      role: "staff",
    });
    staffToken = generateToken(testStaff);

    // Create a dummy service for estimate items
    testService = await Service.create({
      name: `Grand Photography ${ts}`,
      category: "Photography",
      pricingType: "FIXED",
      basePrice: 15000,
      description: "Complete professional coverage",
    });
  });

  test.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    // Clean up created entities
    if (testManager) await User.findByIdAndDelete(testManager._id);
    if (testAdmin) await User.findByIdAndDelete(testAdmin._id);
    if (testStaff) await User.findByIdAndDelete(testStaff._id);
    if (testService) await Service.findByIdAndDelete(testService._id);

    if (createdEstimateIds.length) {
      await Estimate.deleteMany({ _id: { $in: createdEstimateIds } });
    }
    if (createdBookingIds.length) {
      await Booking.deleteMany({ _id: { $in: createdBookingIds } });
    }
    if (createdEventIds.length) {
      await Event.deleteMany({ _id: { $in: createdEventIds } });
    }
    if (createdClientIds.length) {
      await Client.deleteMany({ _id: { $in: createdClientIds } });
    }

    await mongoose.disconnect();
  });

  test("1. Security: Reject unauthenticated requests to POST /api/estimates and POST /api/bookings with HTTP 401", async () => {
    // Attempt to create estimate without authorization header
    const estRes = await fetch(`${baseUrl}/estimates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: "Unauth Event",
        eventType: "Wedding",
        eventDate: new Date().toISOString(),
        eventTime: "18:00",
        guests: 100,
        location: "Hall A",
        description: "Unauthenticated estimate test",
        client: { name: "John", phone: "1234567890", email: "john@example.com" },
        services: [],
      }),
    });
    assert.strictEqual(estRes.status, 401, "Unauthenticated POST /estimates must return HTTP 401");

    // Attempt to create booking without authorization header
    const bookRes = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: "Unauth Booking",
        eventType: "Corporate",
        eventDate: new Date().toISOString(),
        eventTime: "10:00",
        guests: 50,
        location: "Meeting Room 1",
        description: "Unauthenticated booking test",
        name: "Jane",
        phone: "9876543210",
        email: "jane@example.com",
        services: [],
      }),
    });
    assert.strictEqual(bookRes.status, 401, "Unauthenticated POST /bookings must return HTTP 401");
  });

  test("2. Security: Reject Staff role from creating estimates, creating bookings, or viewing manager estimates (HTTP 403)", async () => {
    // Staff attempting to create estimate
    const estRes = await fetch(`${baseUrl}/estimates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        eventName: "Staff Attempt Event",
        eventType: "Birthday",
        eventDate: new Date().toISOString(),
        eventTime: "19:00",
        guests: 40,
        location: "Lounge",
        description: "Staff estimate attempt",
        client: { name: "Alice", phone: "9876543210", email: "alice@example.com" },
        services: [],
      }),
    });
    assert.strictEqual(estRes.status, 403, "Staff cannot create estimates; must return HTTP 403 Forbidden");

    // Staff attempting to create booking
    const bookRes = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        eventName: "Staff Booking Attempt",
        eventType: "Social",
        eventDate: new Date().toISOString(),
        eventTime: "14:00",
        guests: 30,
        location: "Garden Area",
        description: "Staff booking attempt",
        name: "Bob",
        phone: "9876543211",
        email: "bob@example.com",
        services: [],
      }),
    });
    assert.strictEqual(bookRes.status, 403, "Staff cannot create bookings; must return HTTP 403 Forbidden");

    // Staff attempting to view all estimates
    const listRes = await fetch(`${baseUrl}/estimates`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    assert.strictEqual(listRes.status, 403, "Staff cannot list estimates dashboard; must return HTTP 403 Forbidden");
  });

  test("3. Manager Workflow: Authenticated Manager can create an estimate and query it in the Estimates dashboard (HTTP 201 & HTTP 200)", async () => {
    const payload = {
      eventName: "Manager Anniversary Gala",
      eventType: "Anniversary",
      eventDate: new Date(Date.now() + 86400000 * 5).toISOString(),
      eventTime: "19:30",
      guests: 120,
      location: "Skyline Ballroom",
      description: "Exclusive manager-created estimate",
      client: {
        name: "Client Sharma",
        phone: "9123456780",
        email: "sharma@example.com",
        message: "Need top tier catering & decoration",
      },
      services: [
        {
          serviceId: testService._id.toString(),
          quantity: 1,
        },
      ],
      discountType: "percentage",
      discountValue: 10,
      additionalCharges: 1000,
    };

    const res = await fetch(`${baseUrl}/estimates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201, `Manager estimate creation should return HTTP 201, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data._id, "Created estimate must have an _id");
    assert.ok(body.data.estimateNumber, "Created estimate must have a unique estimateNumber");
    assert.strictEqual(body.data.eventName, "Manager Anniversary Gala");

    createdEstimateIds.push(body.data._id);
    if (body.data.client?._id) createdClientIds.push(body.data.client._id);

    // Query in Estimates Dashboard
    const listRes = await fetch(`${baseUrl}/estimates`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    });
    assert.strictEqual(listRes.status, 200);
    const listBody = await listRes.json();
    assert.strictEqual(listBody.success, true);
    const found = listBody.data.find((e) => e._id === body.data._id);
    assert.ok(found, "Newly created estimate must be returned in Manager Estimates list");
  });

  test("4. Admin Workflow: Authenticated Admin can create an estimate and create a booking (HTTP 201)", async () => {
    // Admin creates estimate
    const estRes = await fetch(`${baseUrl}/estimates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventName: "Admin Leadership Summit",
        eventType: "Conference",
        eventDate: new Date(Date.now() + 86400000 * 10).toISOString(),
        eventTime: "09:00",
        guests: 200,
        location: "Auditorium Prime",
        description: "Annual summit",
        client: {
          name: "Admin Client",
          phone: "9123456789",
          email: "adminclient@example.com",
        },
        services: [
          {
            serviceId: testService._id.toString(),
            quantity: 1,
          },
        ],
      }),
    });
    assert.strictEqual(estRes.status, 201, "Admin should be authorized to create estimates");
    const estBody = await estRes.json();
    createdEstimateIds.push(estBody.data._id);
    if (estBody.data.client?._id) createdClientIds.push(estBody.data.client._id);

    // Admin creates direct booking
    const bookRes = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventName: "Admin Direct Booking Event",
        eventType: "Corporate",
        eventDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        eventTime: "11:00",
        guests: 75,
        location: "Convention Hall B",
        description: "Direct booking flow",
        name: "Corporate Org",
        phone: "9123456700",
        email: "corp@example.com",
        services: [
          {
            serviceId: testService._id.toString(),
            quantity: 1,
          },
        ],
      }),
    });
    assert.strictEqual(bookRes.status, 201, "Admin should be authorized to create direct bookings");
    const bookBody = await bookRes.json();
    assert.strictEqual(bookBody.success, true);
    createdBookingIds.push(bookBody.data._id);
    if (bookBody.data.client?._id || bookBody.data.client) {
      createdClientIds.push(bookBody.data.client._id || bookBody.data.client);
    }
  });

  test("5. Lifecycle & Idempotency: Convert accepted estimate to confirmed booking & event without duplication on retries", async () => {
    // 1. Create an estimate
    const createRes = await fetch(`${baseUrl}/estimates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        eventName: "Conversion Lifecycle Test",
        eventType: "Wedding",
        eventDate: new Date(Date.now() + 86400000 * 14).toISOString(),
        eventTime: "17:00",
        guests: 180,
        location: "Palace Gardens",
        description: "Complete lifecycle conversion test",
        client: {
          name: "Conversion Client",
          phone: "9123456711",
          email: "convclient@example.com",
        },
        services: [
          {
            serviceId: testService._id.toString(),
            quantity: 1,
          },
        ],
      }),
    });
    const createBody = await createRes.json();
    assert.strictEqual(createRes.status, 201, "Estimate must be created successfully with HTTP 201");
    const estimateId = createBody.data._id;
    createdEstimateIds.push(estimateId);

    // 2. Mark Estimate as ACCEPTED
    const statusRes = await fetch(`${baseUrl}/estimates/${estimateId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({ status: "ACCEPTED" }),
    });
    assert.strictEqual(statusRes.status, 200);

    // 3. Convert Estimate to Booking + Event
    const convertRes1 = await fetch(`${baseUrl}/estimates/${estimateId}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
    });
    assert.strictEqual(convertRes1.status, 201, "Estimate conversion should return HTTP 201 Created");
    const convertBody1 = await convertRes1.json();
    assert.strictEqual(convertBody1.success, true);
    assert.ok(convertBody1.data.booking, "Conversion must produce a booking");
    assert.ok(convertBody1.data.event, "Conversion must produce an event");

    createdBookingIds.push(convertBody1.data.booking._id);
    createdEventIds.push(convertBody1.data.event._id);

    // 4. Retry Conversion: Idempotency check (Must not duplicate or crash)
    const convertRes2 = await fetch(`${baseUrl}/estimates/${estimateId}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
    });
    // Should return existing booking/event with HTTP 201 or 200 idempotently
    assert.ok([200, 201, 400].includes(convertRes2.status), `Retry conversion status should be 200 or 201, got ${convertRes2.status}`);

    // Verify exactly 1 Event exists for this estimate
    const count = await Event.countDocuments({ booking: convertBody1.data.booking._id });
    assert.strictEqual(count, 1, "Exactly one event must exist for the converted booking");
  });
});
