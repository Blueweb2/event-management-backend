const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseTimeToHoursAndMinutes,
  getEventOrDutyEndDateTime,
} = require("../src/services/autoCheckout.service");

test.describe("Auto-Checkout Service - Parsing and Date-Time Calculations", () => {
  test("parseTimeToHoursAndMinutes parses 24-hour military time correctly", () => {
    assert.deepEqual(parseTimeToHoursAndMinutes("18:00"), { hours: 18, minutes: 0 });
    assert.deepEqual(parseTimeToHoursAndMinutes("09:30"), { hours: 9, minutes: 30 });
    assert.deepEqual(parseTimeToHoursAndMinutes("00:00"), { hours: 0, minutes: 0 });
    assert.deepEqual(parseTimeToHoursAndMinutes("23:59"), { hours: 23, minutes: 59 });
  });

  test("parseTimeToHoursAndMinutes parses 12-hour AM/PM time correctly", () => {
    assert.deepEqual(parseTimeToHoursAndMinutes("6:00 PM"), { hours: 18, minutes: 0 });
    assert.deepEqual(parseTimeToHoursAndMinutes("6 PM"), { hours: 18, minutes: 0 });
    assert.deepEqual(parseTimeToHoursAndMinutes("11:30 AM"), { hours: 11, minutes: 30 });
    assert.deepEqual(parseTimeToHoursAndMinutes("12:00 PM"), { hours: 12, minutes: 0 });
    assert.deepEqual(parseTimeToHoursAndMinutes("12:00 AM"), { hours: 0, minutes: 0 });
  });

  test("parseTimeToHoursAndMinutes returns null on invalid or empty input", () => {
    assert.equal(parseTimeToHoursAndMinutes(""), null);
    assert.equal(parseTimeToHoursAndMinutes(null), null);
    assert.equal(parseTimeToHoursAndMinutes(undefined), null);
    assert.equal(parseTimeToHoursAndMinutes("invalid-string"), null);
    assert.equal(parseTimeToHoursAndMinutes("25:00"), null);
  });

  test("getEventOrDutyEndDateTime resolves duty endTime when provided", () => {
    const baseDate = new Date("2026-10-20T00:00:00.000Z");
    const endDateTime = getEventOrDutyEndDateTime(baseDate, "10:00 - 18:00", "17:30");
    assert.ok(endDateTime instanceof Date);
    assert.equal(endDateTime.getHours(), 17);
    assert.equal(endDateTime.getMinutes(), 30);
  });

  test("getEventOrDutyEndDateTime resolves event time range when duty end time is missing", () => {
    const baseDate = new Date("2026-10-20T00:00:00.000Z");
    const endDateTime = getEventOrDutyEndDateTime(baseDate, "14:00 - 20:00", null);
    assert.ok(endDateTime instanceof Date);
    assert.equal(endDateTime.getHours(), 20);
    assert.equal(endDateTime.getMinutes(), 0);
  });

  test("getEventOrDutyEndDateTime resolves 12-hr event time range (e.g. 2:00 PM to 8:00 PM)", () => {
    const baseDate = new Date("2026-10-20T00:00:00.000Z");
    const endDateTime = getEventOrDutyEndDateTime(baseDate, "2:00 PM to 8:00 PM", null);
    assert.ok(endDateTime instanceof Date);
    assert.equal(endDateTime.getHours(), 20);
    assert.equal(endDateTime.getMinutes(), 0);
  });

  test("getEventOrDutyEndDateTime resolves single event time with standard duration", () => {
    const baseDate = new Date("2026-10-20T00:00:00.000Z");
    const endDateTime = getEventOrDutyEndDateTime(baseDate, "14:00", null);
    assert.ok(endDateTime instanceof Date);
    // 14:00 + 4 hours = 18:00
    assert.equal(endDateTime.getHours(), 18);
    assert.equal(endDateTime.getMinutes(), 0);
  });

  test("getEventOrDutyEndDateTime falls back to end of day if no time string provided", () => {
    const baseDate = new Date("2026-10-20T00:00:00.000Z");
    const endDateTime = getEventOrDutyEndDateTime(baseDate, null, null);
    assert.ok(endDateTime instanceof Date);
    assert.equal(endDateTime.getHours(), 23);
    assert.equal(endDateTime.getMinutes(), 59);
  });
});

test.describe("Auto-Checkout Service - Database End-to-End Workflow", () => {
  const mongoose = require("mongoose");
  const path = require("path");
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
  const connectDB = require("../src/config/db");
  const User = require("../src/models/user.model");
  const Client = require("../src/models/client.model");
  const Booking = require("../src/models/booking.model");
  const Duty = require("../src/models/duty.model");
  const Event = require("../src/models/event.model");
  const Attendance = require("../src/models/attendance.model");
  const { autoCheckoutEndedEventsStaff } = require("../src/services/autoCheckout.service");

  let testUserId;
  let testClientId;
  let testBookingId;
  let testDutyId;
  let testEventId;
  let testAttendanceId;

  test.before(async () => {
    await connectDB();
  });

  test.after(async () => {
    if (testAttendanceId) await Attendance.findByIdAndDelete(testAttendanceId);
    if (testDutyId) await Duty.findByIdAndDelete(testDutyId);
    if (testEventId) await Event.findByIdAndDelete(testEventId);
    if (testBookingId) await Booking.findByIdAndDelete(testBookingId);
    if (testClientId) await Client.findByIdAndDelete(testClientId);
    if (testUserId) await User.findByIdAndDelete(testUserId);
    await mongoose.connection.close();
  });

  test("autoCheckoutEndedEventsStaff automatically checks out staff when event date/time has ended", async () => {
    const testSuffix = Date.now();

    // 1. Create a dummy staff user
    const user = await User.create({
      name: "Auto Checkout Test Staff",
      username: `autotest_${testSuffix}`,
      email: `autotest_${testSuffix}@example.com`,
      password: "Password123!",
      role: "staff",
      department: "Service",
    });
    testUserId = user._id;

    // 2. Create client & booking
    const pastEventDate = new Date();
    pastEventDate.setHours(0, 0, 0, 0);

    const client = await Client.create({
      name: `Auto Client ${testSuffix}`,
      email: `autoclient_${testSuffix}@example.com`,
      phone: "1234567890",
      address: "123 Street",
    });
    testClientId = client._id;

    const booking = await Booking.create({
      client: client._id,
      eventName: "Past Auto-Checkout Test Event",
      eventType: "Wedding",
      eventDate: pastEventDate,
      eventTime: "10:00 - 13:00",
      guests: 50,
      location: "Main Hall",
      description: "Test wedding event description",
      services: [
        {
          serviceId: new mongoose.Types.ObjectId(),
          serviceName: "Catering",
          category: "catering",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 1000,
          total: 1000,
        },
      ],
      subtotal: 1000,
      total: 1000,
      status: "Confirmed",
    });
    testBookingId = booking._id;

    // 3. Create an event that ended 2 hours ago
    const event = await Event.create({
      client: client._id,
      booking: booking._id,
      eventName: "Past Auto-Checkout Test Event",
      eventType: "Wedding",
      eventDate: pastEventDate,
      eventTime: "10:00 - 13:00",
      guests: 50,
      location: "Main Hall",
      status: "IN_PROGRESS",
      createdBy: testUserId,
    });
    testEventId = event._id;

    // 4. Create a duty for the staff
    const duty = await Duty.create({
      event: event._id,
      staff: user._id,
      role: "Waiter",
      dutyTitle: "Hall Waiter",
      dutyDate: pastEventDate,
      startTime: "10:00",
      endTime: "13:00",
      hourlyRate: 50,
      status: "ASSIGNED",
      assignedBy: user._id,
    });
    testDutyId = duty._id;

    // 5. Create an active attendance (checked in at 10:00, not checked out)
    const checkInTime = new Date(pastEventDate);
    checkInTime.setHours(10, 0, 0, 0);

    const attendance = await Attendance.create({
      staff: user._id,
      event: event._id,
      duty: duty._id,
      date: pastEventDate,
      checkIn: checkInTime,
      checkOut: null,
      status: "PRESENT",
      sessions: [
        {
          type: "CLOCK_IN",
          timestamp: checkInTime,
        },
      ],
    });
    testAttendanceId = attendance._id;

    // 6. Run autoCheckoutEndedEventsStaff
    const checkTime = new Date(pastEventDate);
    checkTime.setHours(15, 0, 0, 0); // 2 hours after event ended at 13:00

    const checkedOutCount = await autoCheckoutEndedEventsStaff(checkTime);
    assert.ok(checkedOutCount >= 1, "Should have checked out at least 1 staff member");

    // 7. Verify attendance updated
    const updatedAtt = await Attendance.findById(testAttendanceId);
    assert.ok(updatedAtt.checkOut !== null, "Attendance should have checkOut date");
    assert.ok(updatedAtt.totalHours >= 3, "Total hours should be at least 3 hours (10:00 to 13:00)");
    assert.ok(updatedAtt.notes.includes("Auto-checked out: Event date and time ended"));
    const lastSession = updatedAtt.sessions[updatedAtt.sessions.length - 1];
    assert.equal(lastSession.type, "CLOCK_OUT");

    // 8. Verify duty updated
    const updatedDuty = await Duty.findById(testDutyId);
    assert.equal(updatedDuty.status, "COMPLETED");
    assert.ok(updatedDuty.totalHours >= 3);
    assert.ok(updatedDuty.totalAmount >= 150); // 3 hrs * 50/hr = 150
  });
});
