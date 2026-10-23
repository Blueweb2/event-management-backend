const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const connectDB = require("../src/config/db");
const Service = require("../src/models/service.model");
const Booking = require("../src/models/booking.model");
const Client = require("../src/models/client.model");
const Event = require("../src/models/event.model");
const eventService = require("../src/services/event.service");
const { MALAPPURAM_VENUES, migrateVenues } = require("../src/scripts/migrateVenues");

test("Venues Migration, CRUD, and Booking Workflow Suite", async (t) => {
  t.before(async () => {
    await connectDB();
  });

  t.after(async () => {
    // Clean up test-only artifacts
    await Service.deleteMany({ name: /^TEST_/ });
    await Booking.deleteMany({ eventName: /^TEST_/ });
    await Event.deleteMany({ eventName: /^TEST_/ });
    await Client.deleteMany({ email: /@test-venue-workflow\.com$/ });
    await mongoose.disconnect();
  });

  await t.test("1. Migration script successfully inserts all 8 Malappuram venues and prevents duplicates", async () => {
    // Run migration first time
    await migrateVenues();

    const initialVenues = await Service.find({ category: "venue", active: true });
    assert.ok(
      initialVenues.length >= 8,
      `Expected at least 8 venues, got ${initialVenues.length}`
    );

    // Verify all 8 names exist
    for (const expected of MALAPPURAM_VENUES) {
      const found = initialVenues.find((v) => v.name === expected.name);
      assert.ok(found, `Venue "${expected.name}" was not found in DB`);
      assert.equal(found.category, "venue");
      assert.equal(found.pricingType, "PER_DAY");
      assert.equal(found.unitLabel, "day");
      assert.equal(found.basePrice, expected.basePrice);
      assert.equal(found.options.length, expected.options.length);

      // Verify each option pricing
      for (const expectedOpt of expected.options) {
        const foundOpt = found.options.find((o) => o.name === expectedOpt.name);
        assert.ok(
          foundOpt,
          `Option "${expectedOpt.name}" not found in venue "${expected.name}"`
        );
        assert.equal(foundOpt.price, expectedOpt.price);
        assert.equal(foundOpt.pricingType, "PER_DAY");
      }
    }

    const countBeforeSecondRun = await Service.countDocuments({ category: "venue" });

    // Run migration a second time to verify duplicate prevention
    await migrateVenues();

    const countAfterSecondRun = await Service.countDocuments({ category: "venue" });
    assert.equal(
      countAfterSecondRun,
      countBeforeSecondRun,
      "Duplicate records were created on second migration run!"
    );
  });

  await t.test("2. Venue CRUD Operations: Create, Retrieve, Update, and Deactivate", async () => {
    // A. CREATE
    const newVenueData = {
      name: `TEST_Malabar Grand Palace, Kottakkal_${Date.now()}`,
      category: "venue",
      pricingType: "PER_DAY",
      basePrice: 180000,
      unitLabel: "day",
      description: "Palatial venue with royal dining and helipad access.",
      imageUrl: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3",
      active: true,
      options: [
        {
          name: "Kohinoor Grand Auditorium",
          description: "Capacity 3,000 with central AC",
          price: 180000,
          pricingType: "PER_DAY",
          unitLabel: "day",
          active: true,
        },
        {
          name: "Lawn Garden Party Deck",
          description: "Scenic evening lawn setup",
          price: 70000,
          pricingType: "PER_DAY",
          unitLabel: "day",
          active: true,
        },
      ],
    };

    const created = await Service.create(newVenueData);
    assert.ok(created._id);
    assert.equal(created.name, newVenueData.name);
    assert.equal(created.basePrice, 180000);
    assert.equal(created.options.length, 2);

    // B. RETRIEVE
    const retrieved = await Service.findById(created._id);
    assert.ok(retrieved);
    assert.equal(retrieved.name, newVenueData.name);
    assert.equal(retrieved.options[0].name, "Kohinoor Grand Auditorium");

    // C. UPDATE (EDIT)
    retrieved.basePrice = 195000;
    retrieved.description = "Updated description with VIP suite";
    retrieved.options[0].price = 195000;
    await retrieved.save();

    const updated = await Service.findById(created._id);
    assert.equal(updated.basePrice, 195000);
    assert.equal(updated.description, "Updated description with VIP suite");
    assert.equal(updated.options[0].price, 195000);

    // D. DEACTIVATE (DELETE / SOFT DELETE)
    updated.active = false;
    await updated.save();

    const deactivated = await Service.findById(created._id);
    assert.equal(deactivated.active, false);

    // Verify it is excluded when querying active services
    const activeList = await Service.find({ _id: created._id, active: true });
    assert.equal(activeList.length, 0);
  });

  await t.test("3. Booking workflow with backend venue selection and pricing calculation", async () => {
    // Fetch a real Malappuram venue from the migrated records
    const venue = await Service.findOne({
      name: "Rose Lounge Convention Centre, Manjeri",
      category: "venue",
    });
    assert.ok(venue, "Rose Lounge venue should exist");
    assert.ok(venue.options.length > 0, "Venue should have options");

    const selectedOption = venue.options[0]; // Main AC Auditorium & Royal Dining Hall

    // Create client
    const client = await Client.create({
      name: "Rashid & Fathima Wedding",
      phone: "+91 98470 12345",
      email: `rashid_${Date.now()}@test-venue-workflow.com`,
      city: "Manjeri",
      state: "Kerala",
      country: "India",
    });

    // Create Booking selecting the venue and its option
    const bookingData = {
      client: client._id,
      eventName: `TEST_Rashid Wedding Reception_${Date.now()}`,
      eventType: "wedding",
      eventDate: new Date("2026-11-20"),
      eventTime: "10:30",
      guests: 800,
      location: venue.name,
      description: "Grand wedding reception at Rose Lounge Manjeri",
      status: "Confirmed",
      services: [
        {
          serviceId: venue._id,
          optionId: selectedOption._id,
          optionName: selectedOption.name,
          serviceName: venue.name,
          category: venue.category,
          quantity: 1, // 1 day
          pricingType: "PER_DAY",
          unitLabel: "day",
          unitPrice: selectedOption.price,
          total: selectedOption.price * 1,
        },
      ],
      subtotal: selectedOption.price,
      total: selectedOption.price,
      advancePayment: 50000,
      paidAmount: 50000,
      paymentStatus: "PARTIAL",
    };

    const booking = await Booking.create(bookingData);
    assert.ok(booking._id);
    assert.equal(booking.services.length, 1);
    assert.equal(booking.services[0].serviceName, venue.name);
    assert.equal(booking.services[0].optionName, selectedOption.name);
    assert.equal(booking.services[0].unitPrice, 150000);
    assert.equal(booking.total, 150000);
    assert.equal(booking.location, venue.name);

    // Convert booking to Event
    const event = await eventService.createEvent({
      bookingId: booking._id,
      createdBy: null,
    });

    assert.ok(event._id);
    assert.equal(event.eventName, booking.eventName);
    assert.equal(event.location, venue.name);
    assert.equal(event.status, "Upcoming");
    assert.equal(event.guests, 800);

    // Verify populated event details
    const populatedEvent = await eventService.getEventById(event._id);
    assert.ok(populatedEvent);
    assert.equal(populatedEvent.client.name, "Rashid & Fathima Wedding");
    assert.equal(populatedEvent.client.phone, "+91 98470 12345");
    assert.equal(populatedEvent.location, venue.name);
    assert.equal(populatedEvent.booking.services[0].serviceName, venue.name);
  });
});
