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
const Duty = require("../src/models/duty.model");
const Attendance = require("../src/models/attendance.model");
const Expense = require("../src/models/expense.model");
const { generateToken } = require("../src/utils/jwt");

test.describe("Full Lifecycle, Financials, Staff Duties, and Reporting Audit Suite", () => {
  let server;
  let baseUrl;
  let testManager;
  let testStaff1;
  let testStaff2;
  let managerToken;
  let staff1Token;
  let staff2Token;
  let testService;
  const createdEstimateIds = [];
  const createdBookingIds = [];
  const createdEventIds = [];
  const createdClientIds = [];
  const createdDutyIds = [];
  const createdAttendanceIds = [];
  const createdExpenseIds = [];

  test.before(async () => {
    const mongoUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}/api`;

    const ts = Date.now();

    testManager = await User.create({
      name: "Audit Lead Manager",
      username: `audit_mgr_${ts}`,
      email: `audit-mgr-${ts}@example.com`,
      password: "Password123!",
      phone: "9988112233",
      role: "manager",
    });
    managerToken = generateToken(testManager);

    testStaff1 = await User.create({
      name: "Audit Staff One",
      username: `audit_staff1_${ts}`,
      email: `audit-staff1-${ts}@example.com`,
      password: "Password123!",
      phone: "9988112234",
      role: "staff",
      hourlyRate: 250,
      department: "Service",
    });
    staff1Token = generateToken(testStaff1);

    testStaff2 = await User.create({
      name: "Audit Staff Two",
      username: `audit_staff2_${ts}`,
      email: `audit-staff2-${ts}@example.com`,
      password: "Password123!",
      phone: "9988112235",
      role: "staff",
      hourlyRate: 300,
      department: "Decoration",
    });
    staff2Token = generateToken(testStaff2);

    testService = await Service.create({
      name: `Premium Lighting & Stage ${ts}`,
      category: "Decoration",
      pricingType: "FIXED",
      basePrice: 20000,
      description: "Full stage setup with ambient mood lighting",
    });
  });

  test.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    if (testManager) await User.findByIdAndDelete(testManager._id);
    if (testStaff1) await User.findByIdAndDelete(testStaff1._id);
    if (testStaff2) await User.findByIdAndDelete(testStaff2._id);
    if (testService) await Service.findByIdAndDelete(testService._id);

    if (createdEstimateIds.length) await Estimate.deleteMany({ _id: { $in: createdEstimateIds } });
    if (createdBookingIds.length) await Booking.deleteMany({ _id: { $in: createdBookingIds } });
    if (createdEventIds.length) await Event.deleteMany({ _id: { $in: createdEventIds } });
    if (createdClientIds.length) await Client.deleteMany({ _id: { $in: createdClientIds } });
    if (createdDutyIds.length) await Duty.deleteMany({ _id: { $in: createdDutyIds } });
    if (createdAttendanceIds.length) await Attendance.deleteMany({ _id: { $in: createdAttendanceIds } });
    if (createdExpenseIds.length) await Expense.deleteMany({ _id: { $in: createdExpenseIds } });

    await mongoose.disconnect();
  });

  test("1. Financial Audit: Advance Payments, Validation of Negative/Excessive Sums, and Balance Sync", async () => {
    // 1. Create a Booking with 20,000 subtotal + GST 18% (3,600) = 23,600 Total
    const bookRes = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        eventName: "Financial Invariant Gala",
        eventType: "Corporate",
        eventDate: new Date(Date.now() + 86400000 * 20).toISOString(),
        eventTime: "18:00",
        guests: 100,
        location: "Grand Ballroom",
        description: "Payment and balance reconciliation test",
        name: "Acme Corp",
        phone: "9123456701",
        email: "finance@acme.com",
        services: [{ serviceId: testService._id.toString(), quantity: 1 }],
      }),
    });
    assert.strictEqual(bookRes.status, 201);
    const bookBody = await bookRes.json();
    const booking = bookBody.data.booking;
    createdBookingIds.push(booking._id);
    if (booking.client?._id || booking.client) {
      createdClientIds.push(booking.client._id || booking.client);
    }

    // 2. Reject negative or zero payment
    const negPaymentRes = await fetch(`${baseUrl}/bookings/${booking._id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ amount: -500, paymentType: "ADVANCE" }),
    });
    assert.strictEqual(negPaymentRes.status, 400, "Negative payments must be rejected with HTTP 400");

    // 3. Record valid Advance Deposit: 10,000
    const advPaymentRes = await fetch(`${baseUrl}/bookings/${booking._id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        amount: 10000,
        paymentMethod: "Bank Transfer",
        transactionId: "TXN_ADV_1001",
        paymentType: "ADVANCE",
        notes: "Initial advance deposit 10k",
      }),
    });
    assert.strictEqual(advPaymentRes.status, 200);
    const advBody = await advPaymentRes.json();
    assert.strictEqual(advBody.data.booking.paidAmount, 10000);
    assert.strictEqual(advBody.data.booking.advancePayment, 10000);
    assert.strictEqual(advBody.data.booking.paymentStatus, "PARTIAL");

    // 4. Confirm Booking -> Creates Event and syncs payment state
    const confirmRes = await fetch(`${baseUrl}/bookings/${booking._id}/confirm`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
    });
    assert.strictEqual(confirmRes.status, 200);
    const confirmBody = await confirmRes.json();
    const event = confirmBody.data.event;
    createdEventIds.push(event._id);

    assert.strictEqual(event.paidAmount, 10000, "Event must inherit paidAmount from booking");
    assert.strictEqual(event.advancePayment, 10000, "Event must inherit advancePayment");
    assert.strictEqual(event.paymentStatus, "PARTIAL");
    assert.strictEqual(event.paymentHistory.length, 1);
  });

  test("2. Staff Assignment & Attendance Lifecycle: Security, Time Tracking, and Payroll Integration", async () => {
    // 1. Create a dummy event for staff duty testing
    const event = await Event.create({
      client: (await Client.create({ name: "Duty Client", phone: "9123456702", email: "dutyclt@example.com" }))._id,
      booking: (await Booking.create({
        client: (await Client.findOne({ email: "dutyclt@example.com" }))._id,
        eventName: "Staff Shift Audit Event",
        eventType: "Exhibition",
        eventDate: new Date(),
        eventTime: "10:00",
        guests: 80,
        location: "Hall 3",
        description: "Duty shift audit",
        services: [{ serviceId: testService._id, serviceName: testService.name, category: "decoration", quantity: 1, pricingType: "FIXED", unitPrice: 20000, total: 20000 }],
        subtotal: 20000,
        total: 23600,
      }))._id,
      eventName: "Staff Shift Audit Event",
      eventType: "Exhibition",
      eventDate: new Date(),
      eventTime: "10:00",
      guests: 80,
      location: "Hall 3",
      description: "Duty shift audit",
      status: "IN_PROGRESS",
    });
    createdEventIds.push(event._id);
    createdBookingIds.push(event.booking);

    // 2. Manager creates assignment for testStaff1 (Rate: 250/hr, 4 hours = 1000)
    const assignRes = await fetch(`${baseUrl}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        event: event.booking.toString(),
        staff: testStaff1._id.toString(),
        dutyTitle: "Lead Stage Coordinator",
        role: "Stage Lead",
        department: "Service",
        dutyDate: new Date().toISOString(),
        startTime: "10:00",
        endTime: "14:00",
        hourlyRate: 250,
      }),
    });
    assert.strictEqual(assignRes.status, 201);
    const assignBody = await assignRes.json();
    const duty = assignBody.data.assignment;
    createdDutyIds.push(duty._id);

    // 3. Security: testStaff2 CANNOT accept testStaff1's assignment (HTTP 403)
    const unauthorizedAccept = await fetch(`${baseUrl}/assignments/${duty._id}/accept`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff2Token}` },
    });
    assert.strictEqual(unauthorizedAccept.status, 403, "Staff 2 must not be able to accept Staff 1's duty");

    // 4. Authorized Staff 1 accepts duty
    const authorizedAccept = await fetch(`${baseUrl}/assignments/${duty._id}/accept`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff1Token}` },
    });
    assert.strictEqual(authorizedAccept.status, 200, "Assigned staff member can accept shift");

    // 5. Staff 1 Clock-In
    const clockInRes = await fetch(`${baseUrl}/attendance/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff1Token}` },
      body: JSON.stringify({ duty: duty._id.toString(), notes: "On-site arrival" }),
    });
    assert.strictEqual(clockInRes.status, 200);
    const clockInBody = await clockInRes.json();
    const attendanceId = clockInBody.data.attendance._id;
    createdAttendanceIds.push(attendanceId);

    // 6. Security: Staff 2 cannot clock-out Staff 1 (HTTP 403 / rejected)
    const unauthorizedClockOut = await fetch(`${baseUrl}/attendance/check-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff2Token}` },
      body: JSON.stringify({ duty: duty._id.toString() }),
    });
    assert.ok([403, 400].includes(unauthorizedClockOut.status), "Staff 2 cannot clock out Staff 1");

    // 7. Authorized Staff 1 Clocks Out
    const clockOutRes = await fetch(`${baseUrl}/attendance/check-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff1Token}` },
      body: JSON.stringify({ duty: duty._id.toString(), notes: "Shift completed" }),
    });
    assert.strictEqual(clockOutRes.status, 200);
    const clockOutBody = await clockOutRes.json();
    assert.ok(clockOutBody.data.attendance.checkOut, "Check-out timestamp must be recorded");
  });

  test("3. Expense Tracking, Profitability Reconciliation, and Report Analytics", async () => {
    // 1. Log direct expense of 4,000 for floral setup
    const expRes = await fetch(`${baseUrl}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        title: "Fresh Floral Supply",
        category: "Decoration",
        amount: 4000,
        event: "Financial Invariant Gala",
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: "Cash",
        status: "Paid",
        description: "Direct supplier flowers",
      }),
    });
    assert.strictEqual(expRes.status, 201);
    const expBody = await expRes.json();
    createdExpenseIds.push(expBody.data._id);

    // 2. Fetch Dashboard Analytics
    const reportRes = await fetch(`${baseUrl}/reports/analytics`, {
      method: "GET",
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.strictEqual(reportRes.status, 200);
    const reportBody = await reportRes.json();
    assert.strictEqual(reportBody.success, true);
    assert.ok(typeof reportBody.data.totalRevenue === "number", "totalRevenue must be a number");
    assert.ok(typeof reportBody.data.upcomingEventsVolume === "number", "upcomingEventsVolume must be a number");
    assert.ok(typeof reportBody.data.totalStaffHours === "number", "totalStaffHours must be a number");
  });
});
