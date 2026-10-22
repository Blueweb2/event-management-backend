const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const connectDB = require("../src/config/db");
const User = require("../src/models/user.model");
const Event = require("../src/models/event.model");
const Booking = require("../src/models/booking.model");
const Client = require("../src/models/client.model");
const Service = require("../src/models/service.model");
const departmentService = require("../src/services/department.service");

test("Event Service Client Selections Test Suite", async (t) => {
  let clientUser;
  let testServiceDecor;
  let testServicePhoto;
  let decorOptionId;
  let photoOptionId;
  let testEventId;
  let emptyEventId;

  t.before(async () => {
    await connectDB();

    // 1. Create client
    clientUser = await Client.create({
      name: "Rohan & Priya Wedding",
      phone: "+91 99887 76655",
      email: `client_selections_${Date.now()}@example.com`,
    });

    // 2. Create Services with options
    decorOptionId = new mongoose.Types.ObjectId();
    testServiceDecor = await Service.create({
      name: "Wedding Stage & Floral Decoration",
      category: "decoration",
      description: "Grand stage, mandap, and entrance floral styling",
      basePrice: 50000,
      pricingType: "FIXED",
      unitLabel: "setup",
      options: [
        {
          _id: decorOptionId,
          name: "Royal Velvet Floral Mandap",
          description: "Fresh orchids, marigolds, and royal velvet backdrop",
          price: 65000,
          pricingType: "FIXED",
          unitLabel: "setup",
          active: true,
        },
      ],
      active: true,
    });

    photoOptionId = new mongoose.Types.ObjectId();
    testServicePhoto = await Service.create({
      name: "Wedding Photography & Media",
      category: "photography",
      description: "Professional multi-camera photography and videography",
      basePrice: 40000,
      pricingType: "FIXED",
      unitLabel: "package",
      options: [
        {
          _id: photoOptionId,
          name: "4K Cinematic Video + Drone + Candid Stills",
          description: "Full day coverage with 2 candid photographers and 1 drone operator",
          price: 55000,
          pricingType: "FIXED",
          unitLabel: "package",
          active: true,
        },
      ],
      active: true,
    });

    // 3. Create Booking with multiple services and catering
    const testBooking = await Booking.create({
      client: clientUser._id,
      eventName: "Rohan & Priya Grand Wedding",
      eventType: "Wedding",
      eventDate: new Date(Date.now() + 86400000 * 7),
      eventTime: "18:00",
      guests: 250,
      location: "Imperial Grand Palace Ballroom",
      description: "Traditional evening wedding reception",
      status: "Confirmed",
      services: [
        {
          serviceId: testServiceDecor._id,
          optionId: decorOptionId,
          optionName: "Royal Velvet Floral Mandap",
          serviceName: "Wedding Stage & Floral Decoration",
          category: "decoration",
          description: "Fresh orchids, marigolds, and royal velvet backdrop",
          quantity: 1,
          pricingType: "FIXED",
          unitLabel: "setup",
          unitPrice: 65000,
          total: 65000,
        },
        {
          serviceId: testServicePhoto._id,
          optionId: photoOptionId,
          optionName: "4K Cinematic Video + Drone + Candid Stills",
          serviceName: "Wedding Photography & Media",
          category: "photography",
          description: "Full day coverage with 2 candid photographers and 1 drone operator",
          quantity: 1,
          pricingType: "FIXED",
          unitLabel: "package",
          unitPrice: 55000,
          total: 55000,
        },
        {
          serviceId: new mongoose.Types.ObjectId(),
          optionId: null,
          serviceName: "DJ & Intelligent Moving Head Lighting",
          category: "sound",
          description: "10kW JBL sound system with truss lights and haze machine",
          quantity: 1,
          pricingType: "FIXED",
          unitLabel: "setup",
          unitPrice: 25000,
          total: 25000,
        },
      ],
      foodMenu: {
        included: true,
        servingType: "PER_GUEST",
        ratePerGuest: 850,
        totalFoodAmount: 212500,
        notes: "Live chaat and tandoor counters",
        items: [
          {
            name: "Paneer Tikka Angara",
            category: "Starters",
            dietary: "veg",
            rate: 150,
            quantity: 250,
            amount: 37500,
          },
          {
            name: "Dal Makhani Dum Pukht",
            category: "Main Course",
            dietary: "veg",
            rate: 200,
            quantity: 250,
            amount: 50000,
          },
        ],
      },
      subtotal: 357500,
      total: 357500,
    });

    // 4. Create Event linked to booking
    const testEvent = await Event.create({
      client: clientUser._id,
      booking: testBooking._id,
      eventName: "Rohan & Priya Grand Wedding",
      eventType: "Wedding",
      eventDate: testBooking.eventDate,
      eventTime: "18:00",
      guests: 250,
      location: "Imperial Grand Palace Ballroom",
      description: "Traditional evening wedding reception",
      status: "CONFIRMED",
    });
    testEventId = testEvent._id.toString();

    // 5. Create an event with no client services (edge case)
    const emptyBooking = await Booking.create({
      client: clientUser._id,
      eventName: "Empty Corporate Meeting",
      eventType: "Corporate",
      eventDate: new Date(Date.now() + 86400000 * 10),
      eventTime: "10:00",
      guests: 30,
      location: "Boardroom A",
      description: "Simple corporate meeting",
      status: "Confirmed",
      services: [
        {
          serviceId: new mongoose.Types.ObjectId(),
          serviceName: "Conference AV",
          category: "operations",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 5000,
          total: 5000,
        },
      ],
      subtotal: 5000,
      total: 5000,
    });

    const emptyEvent = await Event.create({
      client: clientUser._id,
      booking: emptyBooking._id,
      eventName: "Empty Corporate Meeting",
      eventType: "Corporate",
      eventDate: emptyBooking.eventDate,
      eventTime: "10:00",
      guests: 30,
      location: "Boardroom A",
      description: "Simple corporate meeting",
      status: "CONFIRMED",
    });
    emptyEventId = emptyEvent._id.toString();
  });

  t.after(async () => {
    if (clientUser) await Client.findByIdAndDelete(clientUser._id);
    if (testServiceDecor) await Service.findByIdAndDelete(testServiceDecor._id);
    if (testServicePhoto) await Service.findByIdAndDelete(testServicePhoto._id);
    if (testEventId) {
      const ev = await Event.findById(testEventId);
      if (ev?.booking) await Booking.findByIdAndDelete(ev.booking);
      await Event.findByIdAndDelete(testEventId);
    }
    if (emptyEventId) {
      const ev = await Event.findById(emptyEventId);
      if (ev?.booking) await Booking.findByIdAndDelete(ev.booking);
      await Event.findByIdAndDelete(emptyEventId);
    }
  });

  await t.test("1. getEventStaffingRequirements populates client selections for every service card", async () => {
    const result = await departmentService.getEventStaffingRequirements(testEventId);

    assert.ok(result, "Staffing result should be returned");
    assert.ok(Array.isArray(result.staffingStreams), "staffingStreams should be an array");

    // Check Catering Stream
    const cateringStream = result.staffingStreams.find(
      (s) => s.streamType === "CATERING" || s.streamId === "catering"
    );
    assert.ok(cateringStream, "Catering stream should be present");
    assert.equal(cateringStream.specDetails.items.length, 2, "Catering should have 2 dishes");
    assert.equal(cateringStream.specDetails.servingType, "PER_GUEST");
    assert.equal(cateringStream.specDetails.ratePerGuest, 850);

    // Check Decoration Stream
    const decorStream = result.staffingStreams.find(
      (s) => s.category.toLowerCase().includes("decor") || s.department.toLowerCase().includes("decor")
    );
    assert.ok(decorStream, "Decoration stream should be present");
    assert.equal(decorStream.specDetails.serviceName, "Wedding Stage & Floral Decoration");
    assert.equal(decorStream.specDetails.packageName, "Royal Velvet Floral Mandap");
    assert.equal(decorStream.specDetails.optionName, "Royal Velvet Floral Mandap");
    assert.equal(decorStream.specDetails.quantity, 1);
    assert.equal(decorStream.specDetails.unitPrice, 65000);
    assert.equal(decorStream.specDetails.total, 65000);

    // Check Photography Stream
    const photoStream = result.staffingStreams.find(
      (s) => s.category.toLowerCase().includes("photo") || s.department.toLowerCase().includes("photo")
    );
    assert.ok(photoStream, "Photography stream should be present");
    assert.equal(photoStream.specDetails.serviceName, "Wedding Photography & Media");
    assert.equal(photoStream.specDetails.packageName, "4K Cinematic Video + Drone + Candid Stills");
    assert.equal(photoStream.specDetails.optionName, "4K Cinematic Video + Drone + Candid Stills");
    assert.equal(photoStream.specDetails.unitPrice, 55000);
    assert.equal(photoStream.specDetails.total, 55000);

    // Check Sound Stream
    const soundStream = result.staffingStreams.find(
      (s) => s.category.toLowerCase().includes("sound") || s.department.toLowerCase().includes("sound")
    );
    assert.ok(soundStream, "Sound stream should be present");
    assert.equal(soundStream.specDetails.serviceName, "DJ & Intelligent Moving Head Lighting");
    assert.equal(soundStream.specDetails.unitPrice, 25000);
    assert.equal(soundStream.specDetails.total, 25000);

    // Check event.bookedServices summary array
    assert.ok(Array.isArray(result.event.bookedServices), "event.bookedServices should be populated");
    assert.equal(result.event.bookedServices.length, 3, "All 3 services should be present in event.bookedServices");
  });

  await t.test("2. getEventStaffingRequirements handles event with empty or minimal services gracefully", async () => {
    const result = await departmentService.getEventStaffingRequirements(emptyEventId);

    assert.ok(result, "Result should return without error");
    assert.ok(Array.isArray(result.staffingStreams), "Streams should be returned");
    // Catering stream should NOT be created when no catering is included
    const cateringStream = result.staffingStreams.find((s) => s.streamType === "CATERING");
    assert.equal(cateringStream, undefined, "Catering stream should not exist when not booked");
  });
});
