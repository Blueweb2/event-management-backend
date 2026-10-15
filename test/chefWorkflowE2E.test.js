const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const app = require("../src/app");
const connectDB = require("../src/config/db");
const User = require("../src/models/user.model");
const Event = require("../src/models/event.model");
const Booking = require("../src/models/booking.model");
const Client = require("../src/models/client.model");
const Service = require("../src/models/service.model");
const FoodItem = require("../src/models/foodItem.model");
const Recipe = require("../src/models/recipe.model");
const StockItem = require("../src/models/stockItem.model");
const StockTransaction = require("../src/models/stockTransaction.model");
const PurchaseRequest = require("../src/models/purchaseRequest.model");
const { generateToken } = require("../src/utils/jwt");
const { confirmBooking } = require("../src/services/booking.service");

// Helper to make HTTP requests against express app instance
function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: "127.0.0.1",
      port,
      path: options.path,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test("Chef Manager Complete Workflow E2E Verification Suite", async (t) => {
  let server;
  let kitchenManager, decorManager, photoManager, staffUser, superadminUser, suspendedKitchenMgr;
  let kitchenMgrToken, decorMgrToken, photoMgrToken, staffToken, superadminToken, suspendedKitchenToken;

  let testClient, testService;
  let confirmedBooking, confirmedEvent;
  let pendingBooking;
  let cancelledBooking, cancelledEvent;
  let zeroGuestBooking, zeroGuestEvent;

  let foodBiryani, foodPulao, foodPaneerTikka, foodSpecialItem;
  let stockRice, stockChicken, stockCumin, stockIncompatibleItem;
  let recipeBiryani, recipePulao;

  const testSuffix = Date.now();

  t.before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // 1. Create Test Users
    kitchenManager = await User.create({
      name: `Chef Marco ${testSuffix}`,
      username: `chef_${testSuffix}`,
      email: `chef_${testSuffix}@example.com`,
      password: await bcrypt.hash("ChefPass123!", 10),
      role: "manager",
      department: "Kitchen",
      permissions: [
        "kitchen:view_events",
        "kitchen:view_recipes",
        "kitchen:manage_recipes",
        "kitchen:calculate_ingredients",
        "kitchen:create_purchase_request",
        "kitchen:manage_prep_tasks",
      ],
      isActive: true,
    });
    kitchenMgrToken = generateToken(kitchenManager);

    decorManager = await User.create({
      name: `Decor Mgr ${testSuffix}`,
      username: `decor_${testSuffix}`,
      email: `decor_${testSuffix}@example.com`,
      password: await bcrypt.hash("Pass123!", 10),
      role: "manager",
      department: "Decoration",
      permissions: ["decoration:view_events"],
      isActive: true,
    });
    decorMgrToken = generateToken(decorManager);

    photoManager = await User.create({
      name: `Photo Mgr ${testSuffix}`,
      username: `photo_${testSuffix}`,
      email: `photo_${testSuffix}@example.com`,
      password: await bcrypt.hash("Pass123!", 10),
      role: "manager",
      department: "Photography",
      permissions: ["photography:view_events"],
      isActive: true,
    });
    photoMgrToken = generateToken(photoManager);

    staffUser = await User.create({
      name: `Kitchen Staff ${testSuffix}`,
      username: `staff_${testSuffix}`,
      email: `staff_${testSuffix}@example.com`,
      password: await bcrypt.hash("Pass123!", 10),
      role: "staff",
      department: "Kitchen",
      isActive: true,
    });
    staffToken = generateToken(staffUser);

    superadminUser = await User.create({
      name: `Super Admin ${testSuffix}`,
      username: `super_${testSuffix}`,
      email: `super_${testSuffix}@example.com`,
      password: await bcrypt.hash("Pass123!", 10),
      role: "superadmin",
      department: "Executive",
      isActive: true,
    });
    superadminToken = generateToken(superadminUser);

    suspendedKitchenMgr = await User.create({
      name: `Suspended Chef ${testSuffix}`,
      username: `susp_chef_${testSuffix}`,
      email: `susp_chef_${testSuffix}@example.com`,
      password: await bcrypt.hash("ChefPass123!", 10),
      role: "manager",
      department: "Kitchen",
      permissions: ["kitchen:view_events", "kitchen:calculate_ingredients"],
      isActive: false, // Suspended!
    });
    suspendedKitchenToken = generateToken(suspendedKitchenMgr);

    // 2. Create Test Client & Test Service
    testClient = await Client.create({
      name: `Gourmet Royal Events ${testSuffix}`,
      email: `gourmet_${testSuffix}@example.com`,
      phone: "9876543210",
      address: "123 Culinary Boulevard",
    });

    testService = await Service.create({
      name: `Royal Catering Service ${testSuffix}`,
      category: "Catering",
      pricingType: "FIXED",
      basePrice: 5000,
      description: "Full service catering package",
    });

    // 3. Create Inventory Stock Items
    // Rice: available 20 kg
    stockRice = await StockItem.create({
      name: `Basmati Rice ${testSuffix}`,
      category: "Other",
      totalQuantity: 30,
      availableQuantity: 20,
      reservedQuantity: 5,
      damagedQuantity: 3,
      lostQuantity: 2,
      unit: "kg",
      minThreshold: 10,
      costPerUnit: 120,
    });

    // Chicken: 25,000 g (Gram unit testing: 25,000 g == 25 kg)
    stockChicken = await StockItem.create({
      name: `Fresh Chicken ${testSuffix}`,
      category: "Other",
      totalQuantity: 25000,
      availableQuantity: 25000,
      unit: "g",
      minThreshold: 5000,
      costPerUnit: 0.25,
    });

    // Cumin Seeds: 0 kg (Zero stock testing)
    stockCumin = await StockItem.create({
      name: `Cumin Seeds ${testSuffix}`,
      category: "Other",
      totalQuantity: 0,
      availableQuantity: 0,
      unit: "kg",
      minThreshold: 1,
      costPerUnit: 500,
    });

    // Incompatible Stock Item: unit "pcs" vs recipe "kg"
    stockIncompatibleItem = await StockItem.create({
      name: `Special Spice Pods ${testSuffix}`,
      category: "Other",
      totalQuantity: 50,
      availableQuantity: 50,
      unit: "pcs",
      minThreshold: 5,
      costPerUnit: 10,
    });

    // 4. Create Food Items
    foodBiryani = await FoodItem.create({
      name: `Hyderabadi Dum Biryani ${testSuffix}`,
      category: "Main Course",
      dietary: "non-veg",
      defaultRate: 350,
      description: "Authentic dum biryani",
    });

    foodPulao = await FoodItem.create({
      name: `Royal Jeera Pulao ${testSuffix}`,
      category: "Main Course",
      dietary: "veg",
      defaultRate: 200,
      description: "Aromatic basmati pulao with cumin",
    });

    foodPaneerTikka = await FoodItem.create({
      name: `Paneer Tikka ${testSuffix}`,
      category: "Starters / Appetizers",
      dietary: "veg",
      defaultRate: 180,
      description: "Grilled cottage cheese cubes",
    });

    foodSpecialItem = await FoodItem.create({
      name: `Signature Spice Curry ${testSuffix}`,
      category: "Main Course",
      dietary: "veg",
      defaultRate: 250,
      description: "Dish with incompatible stock unit",
    });

    // 5. Create Recipes
    // Recipe 1: Biryani (yield: 1 serving, wastage: 5%)
    // - Basmati Rice: 0.15 kg / guest
    // - Chicken: 0.20 kg / guest
    recipeBiryani = await Recipe.create({
      foodItem: foodBiryani._id,
      foodItemName: foodBiryani.name,
      category: "Main Course",
      yieldServings: 1,
      defaultWastagePercent: 5,
      ingredients: [
        {
          name: stockRice.name,
          quantityPerServing: 0.15,
          unit: "kg",
          stockItem: stockRice._id,
        },
        {
          name: stockChicken.name,
          quantityPerServing: 0.20,
          unit: "kg",
          stockItem: stockChicken._id,
        },
      ],
      createdBy: kitchenManager._id,
    });

    // Recipe 2: Pulao (batch yield: 2 servings, wastage: 5%)
    // - Basmati Rice: 0.20 kg / 2 servings = 0.10 kg / guest
    // - Cumin Seeds: 0.010 kg / 2 servings = 0.005 kg / guest
    recipePulao = await Recipe.create({
      foodItem: foodPulao._id,
      foodItemName: foodPulao.name,
      category: "Main Course",
      yieldServings: 2,
      defaultWastagePercent: 5,
      ingredients: [
        {
          name: stockRice.name,
          quantityPerServing: 0.20,
          unit: "kg",
          stockItem: stockRice._id,
        },
        {
          name: stockCumin.name,
          quantityPerServing: 0.010,
          unit: "kg",
          stockItem: stockCumin._id,
        },
      ],
      createdBy: kitchenManager._id,
    });

    // Note: foodPaneerTikka is intentionally left WITHOUT a recipe to verify missing recipe handling!
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    // Cleanup test data
    await User.deleteMany({
      _id: {
        $in: [
          kitchenManager?._id,
          decorManager?._id,
          photoManager?._id,
          staffUser?._id,
          superadminUser?._id,
          suspendedKitchenMgr?._id,
        ],
      },
    });
    if (testClient) await Client.deleteOne({ _id: testClient._id });
    if (testService) await Service.deleteOne({ _id: testService._id });
    await StockItem.deleteMany({
      _id: {
        $in: [stockRice?._id, stockChicken?._id, stockCumin?._id, stockIncompatibleItem?._id],
      },
    });
    await FoodItem.deleteMany({
      _id: {
        $in: [foodBiryani?._id, foodPulao?._id, foodPaneerTikka?._id, foodSpecialItem?._id],
      },
    });
    await Recipe.deleteMany({ _id: { $in: [recipeBiryani?._id, recipePulao?._id] } });
    await PurchaseRequest.deleteMany({ requestedBy: { $in: [kitchenManager?._id, decorManager?._id] } });
    if (confirmedBooking) await Booking.deleteOne({ _id: confirmedBooking._id });
    if (confirmedEvent) await Event.deleteOne({ _id: confirmedEvent._id });
    if (pendingBooking) await Booking.deleteOne({ _id: pendingBooking._id });
    if (cancelledBooking) await Booking.deleteOne({ _id: cancelledBooking._id });
    if (cancelledEvent) await Event.deleteOne({ _id: cancelledEvent._id });
    if (zeroGuestBooking) await Booking.deleteOne({ _id: zeroGuestBooking._id });
    if (zeroGuestEvent) await Event.deleteOne({ _id: zeroGuestEvent._id });
    await mongoose.disconnect();
  });

  // ==========================================
  // PHASE 1 & 2: Real Data Flow & Confirmed Menu Workflow
  // ==========================================

  await t.test("Phase 1 & 2: Booking creation, confirmation, and Chef Dashboard exclusion rules", async () => {
    // 1. Create a confirmed booking with 100 guests and 3 menu items (2 veg, 1 non-veg)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);

    confirmedBooking = await Booking.create({
      client: testClient._id,
      eventName: `Grand Gala Reception ${testSuffix}`,
      eventType: "Wedding Reception",
      eventDate: futureDate,
      eventTime: "19:00",
      guests: 100,
      location: "Crystal Ballroom",
      description: "Grand reception with multi-course dinner",
      services: [
        {
          serviceId: testService._id,
          serviceName: testService.name,
          category: "catering",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 5000,
          total: 5000,
        },
      ],
      subtotal: 5000,
      status: "Pending",
      foodMenu: {
        included: true,
        servingType: "PER_GUEST",
        ratePerGuest: 500,
        items: [
          {
            foodItemId: foodBiryani._id,
            name: foodBiryani.name,
            category: "Main Course",
            dietary: "non-veg",
            rate: 350,
            quantity: 100,
            amount: 35000,
          },
          {
            foodItemId: foodPulao._id,
            name: foodPulao.name,
            category: "Main Course",
            dietary: "veg",
            rate: 200,
            quantity: 100,
            amount: 20000,
          },
          {
            foodItemId: foodPaneerTikka._id,
            name: foodPaneerTikka.name,
            category: "Starters / Appetizers",
            dietary: "veg",
            rate: 180,
            quantity: 100,
            amount: 18000,
          },
        ],
      },
    });

    // Confirm booking using existing workflow service
    const confirmResult = await confirmBooking(confirmedBooking._id, kitchenManager._id);
    assert.equal(confirmResult.booking.status, "Confirmed");
    confirmedEvent = confirmResult.event;
    assert.ok(confirmedEvent._id, "Event must be created on booking confirmation");
    assert.equal(confirmedEvent.guests, 100);

    // 2. Create an UNCONFIRMED (Pending) booking - must be excluded from Chef Dashboard
    pendingBooking = await Booking.create({
      client: testClient._id,
      eventName: `Unconfirmed Inquiry ${testSuffix}`,
      eventType: "Corporate",
      eventDate: futureDate,
      eventTime: "12:00",
      guests: 50,
      location: "Room A",
      description: "Pending corporate inquiry",
      services: [
        {
          serviceId: testService._id,
          serviceName: testService.name,
          category: "catering",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 5000,
          total: 5000,
        },
      ],
      subtotal: 5000,
      status: "Pending",
      foodMenu: {
        included: true,
        items: [{ foodItemId: foodBiryani._id, name: foodBiryani.name, category: "Main Course", dietary: "non-veg" }],
      },
    });

    // 3. Create a CANCELLED booking and event - must be excluded from Chef Dashboard
    cancelledBooking = await Booking.create({
      client: testClient._id,
      eventName: `Cancelled Party ${testSuffix}`,
      eventType: "Birthday",
      eventDate: futureDate,
      eventTime: "15:00",
      guests: 40,
      location: "Garden",
      description: "Cancelled birthday party",
      services: [
        {
          serviceId: testService._id,
          serviceName: testService.name,
          category: "catering",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 5000,
          total: 5000,
        },
      ],
      subtotal: 5000,
      status: "Cancelled",
      foodMenu: {
        included: true,
        items: [{ foodItemId: foodBiryani._id, name: foodBiryani.name, category: "Main Course", dietary: "non-veg" }],
      },
    });
    cancelledEvent = await Event.create({
      client: testClient._id,
      booking: cancelledBooking._id,
      eventName: cancelledBooking.eventName,
      eventType: cancelledBooking.eventType,
      eventDate: cancelledBooking.eventDate,
      eventTime: cancelledBooking.eventTime,
      guests: 40,
      location: "Garden",
      description: "Cancelled birthday party",
      status: "Cancelled",
    });

    // 4. Query Kitchen Dashboard events as Kitchen Manager
    const res = await makeRequest(server, {
      path: "/api/departments/kitchen/events",
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenMgrToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const events = res.body.data;
    assert.ok(Array.isArray(events), "Events must be returned as an array");

    // Verify confirmed event is present
    const matchedEvent = events.find((e) => e.eventId === confirmedEvent._id.toString());
    assert.ok(matchedEvent, "Confirmed event must be included in Kitchen Dashboard");
    assert.equal(matchedEvent.guests, 100);
    assert.equal(matchedEvent.foodMenu.items.length, 3);
    assert.equal(matchedEvent.dietarySummary.nonVeg, 1, "1 non-veg item");
    assert.equal(matchedEvent.dietarySummary.veg, 2, "2 veg items");

    // Verify pending booking is NOT present
    const matchedPending = events.find((e) => e.eventName === pendingBooking.eventName);
    assert.equal(matchedPending, undefined, "Pending/unconfirmed booking must be excluded");

    // Verify cancelled booking/event is NOT present
    const matchedCancelled = events.find((e) => e.eventId === cancelledEvent._id.toString());
    assert.equal(matchedCancelled, undefined, "Cancelled booking/event must be excluded");

    // 5. Test Event Detail endpoint & verify data persistence on refresh
    const detailRes1 = await makeRequest(server, {
      path: `/api/departments/kitchen/events/${confirmedEvent._id}`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenMgrToken}` },
    });
    assert.equal(detailRes1.status, 200);
    assert.equal(detailRes1.body.data.guests, 100);
    assert.equal(detailRes1.body.data.foodMenu.items.length, 3);

    // Refresh simulation: re-querying returns identical persistent data
    const detailRes2 = await makeRequest(server, {
      path: `/api/departments/kitchen/events/${confirmedEvent._id}`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenMgrToken}` },
    });
    assert.equal(detailRes2.status, 200);
    assert.deepEqual(detailRes1.body.data.foodMenu.items, detailRes2.body.data.foodMenu.items);
  });

  // ==========================================
  // PHASE 3: Exact Recipe Calculations Engine
  // ==========================================

  await t.test("Phase 3: Recipe calculations formula, batch yield, wastage, shared aggregation & missing recipes", async () => {
    // Exact Test Fixture:
    // Event guests = 100, Wastage = 5%
    // Biryani: 0.15 kg rice / 1 yield * 100 guests * 1.05 = 15.75 kg rice
    //          0.20 kg chicken / 1 yield * 100 guests * 1.05 = 21.00 kg chicken
    // Pulao:   0.20 kg rice / 2 yield * 100 guests * 1.05 = 0.10 * 100 * 1.05 = 10.50 kg rice
    //          0.010 kg cumin / 2 yield * 100 guests * 1.05 = 0.005 * 100 * 1.05 = 0.525 kg cumin
    // Shared Basmati Rice Aggregated: 15.75 + 10.50 = 26.25 kg rice!

    const calcRes = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${confirmedEvent._id}?wastageAllowancePercent=5`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenMgrToken}` },
    });

    assert.equal(calcRes.status, 200);
    const data = calcRes.body.data;
    assert.equal(data.guests, 100);
    assert.equal(data.configuredWastagePercent, 5);

    // 1. Verify per-item calculations
    const biryaniCalc = data.perItemCalculations.find((p) => p.name === foodBiryani.name);
    assert.ok(biryaniCalc, "Biryani calculation must exist");
    assert.equal(biryaniCalc.hasRecipe, true);

    const biryaniRice = biryaniCalc.ingredients.find((i) => i.name === stockRice.name);
    assert.ok(biryaniRice, "Biryani rice calculation must exist");
    // Required = 0.15 * 100 * 1.05 = 15.75 kg
    assert.equal(biryaniRice.requiredQuantity, 15.75, "Expected exactly 15.75 kg rice for 100 guests @ 5% wastage");

    const biryaniChicken = biryaniCalc.ingredients.find((i) => i.name === stockChicken.name);
    // Required = 0.20 * 100 * 1.05 = 21.00 kg
    assert.equal(biryaniChicken.requiredQuantity, 21.00, "Expected exactly 21.00 kg chicken");

    // 2. Verify batch yield formula on Pulao (yieldServings = 2)
    const pulaoCalc = data.perItemCalculations.find((p) => p.name === foodPulao.name);
    assert.ok(pulaoCalc, "Pulao calculation must exist");
    assert.equal(pulaoCalc.yieldServings, 2);

    const pulaoRice = pulaoCalc.ingredients.find((i) => i.name === stockRice.name);
    // Required = (0.20 / 2) * 100 * 1.05 = 10.50 kg
    assert.equal(pulaoRice.requiredQuantity, 10.50, "Expected exactly 10.50 kg rice for Pulao (batch yield 2)");

    const pulaoCumin = pulaoCalc.ingredients.find((i) => i.name === stockCumin.name);
    // Required = (0.010 / 2) * 100 * 1.05 = 0.525 kg
    assert.equal(pulaoCumin.requiredQuantity, 0.525, "Expected exactly 0.525 kg cumin");

    // 3. Verify Shared Ingredient Aggregation (Basmati Rice used in both Biryani and Pulao)
    const aggregatedRice = data.aggregatedIngredients.find((a) => a.name === stockRice.name);
    assert.ok(aggregatedRice, "Aggregated rice must be present");
    // Total aggregated required = 15.75 + 10.50 = 26.25 kg
    assert.equal(
      aggregatedRice.requiredQuantity,
      26.25,
      "Aggregated rice requirement must be exactly 26.25 kg without double-counting"
    );
    assert.equal(aggregatedRice.usedInMenuItems.length, 2);
    assert.ok(aggregatedRice.usedInMenuItems.includes(foodBiryani.name));
    assert.ok(aggregatedRice.usedInMenuItems.includes(foodPulao.name));

    // 4. Missing Recipe Handling (foodPaneerTikka has no recipe)
    assert.equal(data.missingRecipesCount, 1);
    const missingPaneer = data.missingRecipes.find((m) => m.name === foodPaneerTikka.name);
    assert.ok(missingPaneer, "Missing recipe for Paneer Tikka must be reported");
    assert.ok(missingPaneer.reason.includes("No recipe configured"));

    const paneerCalc = data.perItemCalculations.find((p) => p.name === foodPaneerTikka.name);
    assert.equal(paneerCalc.hasRecipe, false);
    assert.equal(paneerCalc.ingredients.length, 0, "Must NEVER invent ingredients or quantities for missing recipes");

    // 5. Zero Guests Edge Case
    zeroGuestBooking = await Booking.create({
      client: testClient._id,
      eventName: `Zero Guest Edge Case ${testSuffix}`,
      eventType: "Trial",
      eventDate: new Date(),
      eventTime: "12:00",
      guests: 1, // Valid for schema creation
      location: "Kitchen Lab",
      description: "Zero guest edge testing",
      services: [
        {
          serviceId: testService._id,
          serviceName: testService.name,
          category: "catering",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 5000,
          total: 5000,
        },
      ],
      subtotal: 5000,
      status: "Confirmed",
      foodMenu: {
        included: true,
        items: [{ foodItemId: foodBiryani._id, name: foodBiryani.name, category: "Main Course", dietary: "non-veg" }],
      },
    });
    zeroGuestEvent = await Event.create({
      client: testClient._id,
      booking: zeroGuestBooking._id,
      eventName: zeroGuestBooking.eventName,
      eventType: zeroGuestBooking.eventType,
      eventDate: zeroGuestBooking.eventDate,
      eventTime: zeroGuestBooking.eventTime,
      guests: 1,
      location: "Kitchen Lab",
      description: "Zero guest edge testing",
      status: "Upcoming",
    });

    // Update guests to 0 in database to test the calculation engine with 0 guests
    await Event.updateOne({ _id: zeroGuestEvent._id }, { guests: 0 });
    await Booking.updateOne({ _id: zeroGuestBooking._id }, { guests: 0 });

    const zeroCalcRes = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${zeroGuestEvent._id}`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenMgrToken}` },
    });
    assert.equal(zeroCalcRes.status, 200);
    assert.equal(zeroCalcRes.body.data.guests, 0);
    const zeroBiryani = zeroCalcRes.body.data.perItemCalculations[0];
    assert.equal(zeroBiryani.ingredients[0].requiredQuantity, 0, "Zero guests must produce 0 required quantity");
  });

  // ==========================================
  // PHASE 4: Stock Availability & Invariant Integrity
  // ==========================================

  await t.test(
    "Phase 4: Stock shortage calculation, unit conversion, incompatible units, and non-deduction invariant",
    async () => {
      // Record baseline stock item values before calculation
      const initialRice = await StockItem.findById(stockRice._id).lean();
      const initialChicken = await StockItem.findById(stockChicken._id).lean();
      const initialCumin = await StockItem.findById(stockCumin._id).lean();
      const initialTxCount = await StockTransaction.countDocuments();

      const calcRes = await makeRequest(server, {
        path: `/api/departments/kitchen/calculate/${confirmedEvent._id}?wastageAllowancePercent=5`,
        method: "GET",
        headers: { Authorization: `Bearer ${kitchenMgrToken}` },
      });
      assert.equal(calcRes.status, 200);
      const data = calcRes.body.data;

      // 1. Required > Available: Basmati Rice: Required 26.25 kg, Available 20 kg -> Shortage = 6.25 kg
      const aggRice = data.aggregatedIngredients.find((a) => a.name === stockRice.name);
      assert.equal(aggRice.availableQuantity, 20);
      assert.equal(aggRice.shortageQuantity, 6.25, "Shortage must be max(0, 26.25 - 20) = 6.25 kg");
      assert.equal(aggRice.hasShortage, true);
      assert.equal(aggRice.isUnitCompatible, true);
      assert.equal(aggRice.hasStockMapping, true);
      assert.equal(aggRice.status, "SHORTAGE");
      assert.equal(aggRice.statusLabel, "Shortage");

      // 2. Required < Available: Fresh Chicken: Required 21.00 kg. Stock is 25,000 g -> converted to 25 kg.
      // Available = 25 kg > Required 21.00 kg -> Shortage = 0 kg! Status = Sufficient Stock!
      const aggChicken = data.aggregatedIngredients.find((a) => a.name === stockChicken.name);
      assert.equal(aggChicken.availableQuantity, 25, "25,000 g stock must convert safely to 25 kg");
      assert.equal(aggChicken.shortageQuantity, 0, "No shortage when available 25 kg >= required 21 kg");
      assert.equal(aggChicken.hasShortage, false);
      assert.equal(aggChicken.isUnitCompatible, true);
      assert.equal(aggChicken.hasStockMapping, true);
      assert.equal(aggChicken.status, "SUFFICIENT");
      assert.equal(aggChicken.statusLabel, "Sufficient Stock");

      // 3. Zero Stock: Cumin Seeds: Required 0.525 kg, Available 0 kg -> Shortage = 0.525 kg
      const aggCumin = data.aggregatedIngredients.find((a) => a.name === stockCumin.name);
      assert.equal(aggCumin.availableQuantity, 0);
      assert.equal(aggCumin.shortageQuantity, 0.525);
      assert.equal(aggCumin.hasShortage, true);
      assert.equal(aggCumin.hasStockMapping, true);
      assert.equal(aggCumin.status, "SHORTAGE");
      assert.equal(aggCumin.statusLabel, "Shortage");

      // 4. Required == Available: Create item with exact available quantity equal to required demand
      // Required = (0.05 / 1) * 100 * 1.05 = 5.25 kg, Available = 5.25 kg
      const stockExactItem = await StockItem.create({
        name: `Exact Match Herb ${testSuffix}`,
        category: "Other",
        totalQuantity: 5.25,
        availableQuantity: 5.25,
        unit: "kg",
      });

      // 5. Incompatible Unit Item & 6. Missing Stock Mapping Item in test dish
      const testDishItem = await FoodItem.create({
        name: `Multi Status Dish ${testSuffix}`,
        category: "Main Course",
        dietary: "veg",
        defaultRate: 200,
        description: "Test dish for exact stock, incompatible units and missing stock mapping",
      });

      const multiTestRecipe = await Recipe.create({
        foodItem: testDishItem._id,
        foodItemName: testDishItem.name,
        category: "Main Course",
        yieldServings: 1,
        ingredients: [
          {
            name: stockExactItem.name,
            quantityPerServing: 0.05,
            unit: "kg",
            stockItem: stockExactItem._id,
          },
          {
            name: stockIncompatibleItem.name,
            quantityPerServing: 0.05,
            unit: "kg", // Recipe demands kg, stock is in pcs
            stockItem: stockIncompatibleItem._id,
          },
          {
            name: `Unmapped Secret Seasoning ${testSuffix}`,
            quantityPerServing: 0.02,
            unit: "kg",
            stockItem: null, // No stock mapping!
          },
        ],
      });

      // Add this item to confirmedBooking via updateOne
      await Booking.updateOne(
        { _id: confirmedBooking._id },
        {
          $push: {
            "foodMenu.items": {
              foodItemId: testDishItem._id,
              name: testDishItem.name,
              category: "Main Course",
              dietary: "veg",
              rate: 200,
              quantity: 100,
              amount: 20000,
            },
          },
        }
      );

      const multiCalcRes = await makeRequest(server, {
        path: `/api/departments/kitchen/calculate/${confirmedEvent._id}?wastageAllowancePercent=5`,
        method: "GET",
        headers: { Authorization: `Bearer ${kitchenMgrToken}` },
      });
      const multiData = multiCalcRes.body.data;

      // Verification of Required == Available
      const aggExact = multiData.aggregatedIngredients.find((a) => a.name === stockExactItem.name);
      assert.ok(aggExact, "Exact match stock item must be calculated");
      assert.equal(aggExact.requiredQuantity, 5.25);
      assert.equal(aggExact.availableQuantity, 5.25);
      assert.equal(aggExact.shortageQuantity, 0, "Shortage must be exactly 0 when required equals available stock");
      assert.equal(aggExact.hasShortage, false);
      assert.equal(aggExact.status, "SUFFICIENT");
      assert.equal(aggExact.statusLabel, "Sufficient Stock");

      // Verification of Incompatible Units
      const incompAgg = multiData.aggregatedIngredients.find((a) => a.name === stockIncompatibleItem.name);
      assert.ok(incompAgg, "Incompatible unit item must be calculated");
      assert.equal(incompAgg.isUnitCompatible, false, "Must flag unit incompatibility");
      assert.ok(incompAgg.unitMismatchWarning, "Explicit warning message must be provided");
      assert.equal(incompAgg.shortageQuantity, null, "Must never present an incorrect shortage calculation for incompatible units");
      assert.equal(incompAgg.hasShortage, false, "Incompatible units must not be flagged as genuine shortage requisitions");
      assert.equal(incompAgg.status, "UNIT_MISMATCH");
      assert.equal(incompAgg.statusLabel, "Unit Mismatch");

      // Verification of Missing Stock Mapping (must NOT be treated as verified zero inventory)
      const unmappedAgg = multiData.aggregatedIngredients.find((a) => a.name.includes("Unmapped Secret Seasoning"));
      assert.ok(unmappedAgg, "Unmapped item must be calculated");
      assert.equal(unmappedAgg.hasStockMapping, false, "Must flag missing stock mapping");
      assert.equal(unmappedAgg.availableQuantity, null, "Must NOT treat missing stock mapping as verified zero inventory (availableQuantity must be null)");
      assert.equal(unmappedAgg.shortageQuantity, null, "Cannot compute shortage against unmapped stock");
      assert.equal(unmappedAgg.hasShortage, false);
      assert.equal(unmappedAgg.status, "UNMAPPED");
      assert.equal(unmappedAgg.statusLabel, "Missing Stock Mapping");

      // Clean up test fixtures from Booking, Recipe, StockItem, FoodItem
      await Booking.updateOne(
        { _id: confirmedBooking._id },
        { $pull: { "foodMenu.items": { foodItemId: testDishItem._id } } }
      );
      await Recipe.deleteOne({ _id: multiTestRecipe._id });
      await FoodItem.deleteOne({ _id: testDishItem._id });
      await StockItem.deleteOne({ _id: stockExactItem._id });

      // 5. CRITICAL INVARIANT: Verify stock quantities and transactions are COMPLETELY UNCHANGED
      const postRice = await StockItem.findById(stockRice._id).lean();
      const postChicken = await StockItem.findById(stockChicken._id).lean();
      const postCumin = await StockItem.findById(stockCumin._id).lean();
      const postTxCount = await StockTransaction.countDocuments();

      assert.equal(postRice.availableQuantity, initialRice.availableQuantity, "Rice availableQuantity must not change");
      assert.equal(postRice.reservedQuantity, initialRice.reservedQuantity, "Rice reservedQuantity must not change");
      assert.equal(postRice.totalQuantity, initialRice.totalQuantity, "Rice totalQuantity must not change");

      assert.equal(postChicken.availableQuantity, initialChicken.availableQuantity, "Chicken availableQuantity must not change");
      assert.equal(postCumin.availableQuantity, initialCumin.availableQuantity, "Cumin availableQuantity must not change");
      assert.equal(postTxCount, initialTxCount, "Opening/calculating dashboard must NEVER create stock transactions!");
    }
  );

  // ==========================================
  // PHASE 5: Purchase Requisitions Workflow
  // ==========================================

  await t.test(
    "Phase 5: Purchase requisition creation, persistence, duplicate prevention, and inventory non-alteration",
    async () => {
      // 1. Submit purchase requisition for shortages (Rice: 6.25 kg, Cumin: 0.525 kg)
      const reqBody = {
        eventId: confirmedEvent._id.toString(),
        items: [
          {
            itemName: stockRice.name,
            requiredQuantity: 26.25,
            availableQuantity: 20,
            shortageQuantity: 6.25,
            unit: "kg",
            estimatedCost: 6.25 * 120, // 750
            urgency: "HIGH",
            stockItem: stockRice._id.toString(),
          },
          {
            itemName: stockCumin.name,
            requiredQuantity: 0.525,
            availableQuantity: 0,
            shortageQuantity: 0.525,
            unit: "kg",
            estimatedCost: 0.525 * 500, // 262.5
            urgency: "MEDIUM",
            stockItem: stockCumin._id.toString(),
          },
        ],
        notes: "Urgent shortage for Gala event",
      };

      const submitRes = await makeRequest(
        server,
        {
          path: "/api/departments/kitchen/purchase-requests",
          method: "POST",
          headers: { Authorization: `Bearer ${kitchenMgrToken}` },
        },
        reqBody
      );

      assert.equal(submitRes.status, 201);
      assert.equal(submitRes.body.success, true);
      const createdReq = submitRes.body.data;
      assert.equal(createdReq.department, "Kitchen");
      assert.equal(createdReq.status, "PENDING");
      assert.equal(createdReq.items.length, 2);
      assert.equal(createdReq.items[0].shortageQuantity, 6.25);
      assert.equal(createdReq.requestedBy._id.toString(), kitchenManager._id.toString());

      // 2. Re-query purchase requests to verify persistence
      const listRes = await makeRequest(server, {
        path: "/api/departments/kitchen/purchase-requests?status=PENDING",
        method: "GET",
        headers: { Authorization: `Bearer ${kitchenMgrToken}` },
      });

      assert.equal(listRes.status, 200);
      assert.ok(Array.isArray(listRes.body.data));
      const persisted = listRes.body.data.find((r) => r._id === createdReq._id);
      assert.ok(persisted, "Purchase request must persist in database");
      assert.equal(persisted.department, "Kitchen");

      // 3. Duplicate Prevention Test: Re-submitting for same event should update existing PENDING request, not create duplicates
      const resubmitRes = await makeRequest(
        server,
        {
          path: "/api/departments/kitchen/purchase-requests",
          method: "POST",
          headers: { Authorization: `Bearer ${kitchenMgrToken}` },
        },
        {
          ...reqBody,
          notes: "Updated note on re-submission",
        }
      );

      assert.equal(resubmitRes.status, 201);
      const totalPendingForEvent = await PurchaseRequest.countDocuments({
        event: confirmedEvent._id,
        department: "Kitchen",
        status: "PENDING",
      });
      assert.equal(totalPendingForEvent, 1, "Must prevent duplicate pending purchase requests for same event");

      // 4. Verify StockItem was NOT altered by purchase requisition
      const stockAfterRequisition = await StockItem.findById(stockRice._id).lean();
      assert.equal(stockAfterRequisition.availableQuantity, 20, "Requisition must not change available quantity");
      assert.equal(stockAfterRequisition.totalQuantity, 30, "Requisition must not change total quantity");
    }
  );

  // ==========================================
  // PHASE 6: Department Security & Boundary Verification
  // ==========================================

  await t.test(
    "Phase 6: Multi-tier RBAC, Cross-department 403, Unauthenticated 401, Suspended 403, and Tamper Resistance",
    async () => {
      // 1. Kitchen Manager -> Allowed (200)
      const kmRes = await makeRequest(server, {
        path: "/api/departments/kitchen/events",
        method: "GET",
        headers: { Authorization: `Bearer ${kitchenMgrToken}` },
      });
      assert.equal(kmRes.status, 200, "Kitchen manager must access kitchen endpoints");

      // 2. Decoration Manager -> Forbidden (403)
      const dmRes = await makeRequest(server, {
        path: "/api/departments/kitchen/events",
        method: "GET",
        headers: { Authorization: `Bearer ${decorMgrToken}` },
      });
      assert.equal(dmRes.status, 403, "Decoration manager must receive 403 Forbidden for kitchen endpoints");

      const dmCalcRes = await makeRequest(server, {
        path: `/api/departments/kitchen/calculate/${confirmedEvent._id}`,
        method: "GET",
        headers: { Authorization: `Bearer ${decorMgrToken}` },
      });
      assert.equal(dmCalcRes.status, 403, "Decoration manager must receive 403 Forbidden for kitchen calculation");

      // 3. Photography Manager -> Forbidden (403)
      const pmRes = await makeRequest(server, {
        path: "/api/departments/kitchen/events",
        method: "GET",
        headers: { Authorization: `Bearer ${photoMgrToken}` },
      });
      assert.equal(pmRes.status, 403, "Photography manager must receive 403 Forbidden for kitchen endpoints");

      // 4. Staff -> Forbidden (403)
      const staffRes = await makeRequest(server, {
        path: "/api/departments/kitchen/events",
        method: "GET",
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      assert.equal(staffRes.status, 403, "Staff must receive 403 Forbidden for manager department endpoints");

      // 5. Unauthenticated -> Unauthorized (401)
      const unauthRes = await makeRequest(server, {
        path: "/api/departments/kitchen/events",
        method: "GET",
      });
      assert.equal(unauthRes.status, 401, "Unauthenticated request must receive 401 Unauthorized");

      // 6. Suspended Kitchen Manager (`isActive: false`) -> Forbidden (403)
      const suspRes = await makeRequest(server, {
        path: "/api/departments/kitchen/events",
        method: "GET",
        headers: { Authorization: `Bearer ${suspendedKitchenToken}` },
      });
      assert.equal(suspRes.status, 403, "Suspended manager must be blocked with 403 Forbidden");

      // 7. Superadmin -> Full Access (200)
      const superRes = await makeRequest(server, {
        path: "/api/departments/kitchen/events",
        method: "GET",
        headers: { Authorization: `Bearer ${superadminToken}` },
      });
      assert.equal(superRes.status, 200, "Superadmin must have full administrative access");

      // 8. Parameter Tampering Resistance:
      // Decoration manager sends a purchase request trying to forge { department: "Kitchen" }
      const forgedReq = await makeRequest(
        server,
        {
          path: "/api/departments/kitchen/purchase-requests",
          method: "POST",
          headers: { Authorization: `Bearer ${decorMgrToken}` },
        },
        {
          department: "Kitchen", // Client-side forge attempt
          eventId: confirmedEvent._id.toString(),
          items: [{ itemName: "Forged Item", requiredQuantity: 10, shortageQuantity: 10 }],
        }
      );
      assert.equal(forgedReq.status, 403, "Server must reject forged department access attempt with 403");
    }
  );
});
