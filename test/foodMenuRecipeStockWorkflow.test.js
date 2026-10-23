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
const FoodItem = require("../src/models/foodItem.model");
const Recipe = require("../src/models/recipe.model");
const StockItem = require("../src/models/stockItem.model");
const StockTransaction = require("../src/models/stockTransaction.model");
const Service = require("../src/models/service.model");
const { generateToken } = require("../src/utils/jwt");
const { confirmBooking } = require("../src/services/booking.service");

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

test("Food Menu, Recipe Ingredients & Stock Inventory Comprehensive Verification Suite", async (t) => {
  let server;
  let kitchenManager, decorManager, superadminUser, staffUser;
  let kitchenToken, decorToken, superadminToken, staffToken;

  let testClient, testService;
  let stockRice, stockGhee, stockEquipment, stockChair;
  let testFoodItem1, testFoodItem2;

  const testSuffix = Date.now();

  t.before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // 1. Create Test Users
    kitchenManager = await User.create({
      name: `Chef Antonio ${testSuffix}`,
      username: `chefantonio_${testSuffix}`,
      email: `chefantonio_${testSuffix}@example.com`,
      password: await bcrypt.hash("Password123!", 10),
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
    kitchenToken = generateToken(kitchenManager);

    decorManager = await User.create({
      name: `Decor Lead ${testSuffix}`,
      username: `decorlead_${testSuffix}`,
      email: `decorlead_${testSuffix}@example.com`,
      password: await bcrypt.hash("Password123!", 10),
      role: "manager",
      department: "Decoration",
      permissions: ["decoration:view", "decoration:manage"],
      isActive: true,
    });
    decorToken = generateToken(decorManager);

    superadminUser = await User.create({
      name: `Admin Master ${testSuffix}`,
      username: `admin_${testSuffix}`,
      email: `admin_${testSuffix}@example.com`,
      password: await bcrypt.hash("Password123!", 10),
      role: "superadmin",
      department: "Operations",
      permissions: ["*"],
      isActive: true,
    });
    superadminToken = generateToken(superadminUser);

    staffUser = await User.create({
      name: `Line Cook ${testSuffix}`,
      username: `linecook_${testSuffix}`,
      email: `linecook_${testSuffix}@example.com`,
      password: await bcrypt.hash("Password123!", 10),
      role: "staff",
      department: "Kitchen",
      permissions: ["kitchen:view_recipes"],
      isActive: true,
    });
    staffToken = generateToken(staffUser);

    // 2. Create Stock Items across categories (Raw Ingredients vs Equipment vs Rentable)
    stockRice = await StockItem.create({
      name: `Basmati Supreme Rice ${testSuffix}`,
      category: "Raw Ingredients",
      stockType: "kitchen",
      totalQuantity: 50,
      availableQuantity: 50,
      unit: "kg",
      unitPrice: 80,
      isRentable: false,
      createdBy: kitchenManager._id,
    });

    stockGhee = await StockItem.create({
      name: `Pure Desi Ghee ${testSuffix}`,
      category: "Kitchen Supplies",
      stockType: "kitchen",
      totalQuantity: 20,
      availableQuantity: 20,
      unit: "kg",
      unitPrice: 550,
      isRentable: false,
      createdBy: kitchenManager._id,
    });

    stockEquipment = await StockItem.create({
      name: `Commercial Dough Mixer ${testSuffix}`,
      category: "Kitchen Equipment",
      stockType: "kitchen",
      totalQuantity: 2,
      availableQuantity: 2,
      unit: "pcs",
      isRentable: false,
      createdBy: kitchenManager._id,
    });

    stockChair = await StockItem.create({
      name: `Banquet Chiavari Chair ${testSuffix}`,
      category: "Furniture",
      stockType: "rentable",
      totalQuantity: 200,
      availableQuantity: 200,
      unit: "pcs",
      rentalPrice: 75,
      isRentable: true,
      createdBy: superadminUser._id,
    });

    // 3. Create Client for event testing
    testClient = await Client.create({
      name: `Client Royal ${testSuffix}`,
      phone: "9876543210",
      email: `client_${testSuffix}@example.com`,
    });

    testService = await Service.create({
      name: `Catering Package ${testSuffix}`,
      category: "Catering",
      pricingType: "FIXED",
      basePrice: 5000,
      description: "Standard catering service",
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await User.deleteMany({
      _id: { $in: [kitchenManager?._id, decorManager?._id, superadminUser?._id, staffUser?._id] },
    });
    await StockItem.deleteMany({
      _id: { $in: [stockRice?._id, stockGhee?._id, stockEquipment?._id, stockChair?._id] },
    });
    if (testFoodItem1) {
      await FoodItem.deleteOne({ _id: testFoodItem1._id });
      await Recipe.deleteOne({ foodItem: testFoodItem1._id });
    }
    if (testFoodItem2) {
      await FoodItem.deleteOne({ _id: testFoodItem2._id });
      await Recipe.deleteOne({ foodItem: testFoodItem2._id });
    }
    if (testClient) await Client.deleteOne({ _id: testClient._id });
    if (testService) await Service.deleteOne({ _id: testService._id });
    await mongoose.disconnect();
  });

  // ==========================================
  // TEST 1: Food item creation and editing
  // ==========================================
  await t.test("1. Food item creation, retrieval, and editing via Food Catalog API", async () => {
    // Create new food item
    const createRes = await makeRequest(
      server,
      {
        path: "/api/food",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        name: `Royal Saffron Pulao ${testSuffix}`,
        category: "Main Course",
        dietary: "veg",
        defaultRate: 220,
        description: "Fragrant basmati cooked with pure ghee and saffron",
        isPopular: true,
        active: true,
      }
    );

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.success, true);
    assert.ok(createRes.body.data._id);
    testFoodItem1 = createRes.body.data;
    assert.equal(testFoodItem1.name, `Royal Saffron Pulao ${testSuffix}`);
    assert.equal(testFoodItem1.defaultRate, 220);

    // Update food item
    const updateRes = await makeRequest(
      server,
      {
        path: `/api/food/${testFoodItem1._id}`,
        method: "PUT",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        defaultRate: 240,
        description: "Updated description with cardamom and dry fruits",
      }
    );

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.defaultRate, 240);
    assert.ok(updateRes.body.data.description.includes("cardamom"));
  });

  // ==========================================
  // TEST 2 & 3: Live stock loading & Ineligible equipment exclusion
  // ==========================================
  await t.test("2 & 3. Live stock endpoint returns kitchen items and excludes ineligible rentable/equipment items", async () => {
    const res = await makeRequest(server, {
      path: "/api/stock/items?stockType=kitchen&limit=100",
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const items = res.body.data;
    assert.ok(Array.isArray(items));

    // Kitchen raw ingredients must be returned
    const foundRice = items.find((i) => i._id === stockRice._id.toString());
    assert.ok(foundRice, "Raw ingredient stock item must be returned");
    assert.equal(foundRice.availableQuantity, 50);
    assert.equal(foundRice.unit, "kg");

    const foundGhee = items.find((i) => i._id === stockGhee._id.toString());
    assert.ok(foundGhee, "Kitchen supplies stock item must be returned");

    // Rentable Furniture must NEVER be returned under kitchen inventory
    const foundChair = items.find((i) => i._id === stockChair._id.toString());
    assert.equal(foundChair, undefined, "Rentable furniture must be excluded from kitchen inventory");
  });

  // ==========================================
  // TEST 4 & 6: Link valid stock item & Recipe persistence
  // ==========================================
  await t.test("4 & 6. Link valid stock item to recipe, save, and retrieve with populated stock fields", async () => {
    const saveRes = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        category: testFoodItem1.category,
        yieldServings: 2,
        defaultWastagePercent: 5,
        ingredients: [
          {
            name: stockRice.name,
            quantityPerServing: 0.2,
            unit: "kg",
            stockItem: stockRice._id.toString(),
            notes: "Wash thoroughly and soak 30m",
          },
          {
            name: stockGhee.name,
            quantityPerServing: 0.05,
            unit: "kg",
            stockItem: stockGhee._id.toString(),
            notes: "Heat before adding spices",
          },
        ],
        notes: "Chef special dum cooking procedure",
      }
    );

    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.body.success, true);
    const saved = saveRes.body.data;
    assert.equal(saved.yieldServings, 2);
    assert.equal(saved.defaultWastagePercent, 5);
    assert.equal(saved.ingredients.length, 2);

    // Verify populated stock reference in response
    const firstIng = saved.ingredients[0];
    assert.ok(firstIng.stockItem, "StockItem reference must be populated");
    assert.equal(typeof firstIng.stockItem, "object");
    assert.equal(firstIng.stockItem.availableQuantity, 50);

    // Query recipe by food item ID
    const getRes = await makeRequest(server, {
      path: `/api/departments/kitchen/recipes/${testFoodItem1._id}`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.foodItemName, testFoodItem1.name);
    assert.equal(getRes.body.data.ingredients.length, 2);
    assert.equal(getRes.body.data.ingredients[0].name, stockRice.name);
    assert.equal(getRes.body.data.ingredients[0].quantityPerServing, 0.2);
    assert.equal(getRes.body.data.ingredients[0].stockItem.unit, "kg");
  });

  // ==========================================
  // TEST 5: Reject invalid, deleted, or ineligible stock items
  // ==========================================
  await t.test("5. Reject invalid ObjectIds, deleted stock references, and ineligible equipment as recipe ingredients", async () => {
    // 5a. Invalid ObjectId format
    const resInvalidId = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        ingredients: [
          {
            name: "Faulty Ingredient",
            quantityPerServing: 1,
            unit: "kg",
            stockItem: "not-a-valid-object-id",
          },
        ],
      }
    );
    assert.equal(resInvalidId.status, 400);
    assert.ok(resInvalidId.body.message.includes("Invalid stock item ID"));

    // 5b. Non-existent stock item ID
    const fakeId = new mongoose.Types.ObjectId();
    const resDeletedStock = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        ingredients: [
          {
            name: "Ghost Ingredient",
            quantityPerServing: 1,
            unit: "kg",
            stockItem: fakeId.toString(),
          },
        ],
      }
    );
    assert.equal(resDeletedStock.status, 404);
    assert.ok(resDeletedStock.body.message.includes("not found or has been removed"));

    // 5c. Ineligible Kitchen Equipment item
    const resEquipment = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        ingredients: [
          {
            name: "Dough Mixer",
            quantityPerServing: 1,
            unit: "pcs",
            stockItem: stockEquipment._id.toString(),
          },
        ],
      }
    );
    assert.equal(resEquipment.status, 400);
    assert.ok(resEquipment.body.message.includes("not eligible as a recipe ingredient"));

    // 5d. Ineligible Rentable item (Chiavari Chair)
    const resRentable = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        ingredients: [
          {
            name: "Chair",
            quantityPerServing: 1,
            unit: "pcs",
            stockItem: stockChair._id.toString(),
          },
        ],
      }
    );
    assert.equal(resRentable.status, 400);
    assert.ok(resRentable.body.message.includes("not eligible as a recipe ingredient"));

    // 5e. Duplicate stock item in same recipe
    const resDuplicate = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        ingredients: [
          {
            name: stockRice.name,
            quantityPerServing: 0.1,
            unit: "kg",
            stockItem: stockRice._id.toString(),
          },
          {
            name: stockRice.name,
            quantityPerServing: 0.2,
            unit: "kg",
            stockItem: stockRice._id.toString(),
          },
        ],
      }
    );
    assert.equal(resDuplicate.status, 400);
    assert.ok(resDuplicate.body.message.includes("Duplicate stock item detected"));
  });

  // ==========================================
  // TEST 7 & 8: Recipe editing does NOT duplicate or change stock quantities
  // ==========================================
  await t.test("7 & 8. Recipe editing preserves stock item invariants (no stock created, no quantities changed)", async () => {
    const stockCountBefore = await StockItem.countDocuments();
    const riceBefore = await StockItem.findById(stockRice._id).lean();
    const gheeBefore = await StockItem.findById(stockGhee._id).lean();
    const txCountBefore = await StockTransaction.countDocuments();

    // Re-save recipe with updated notes and quantities
    const updateRes = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        yieldServings: 2,
        defaultWastagePercent: 6,
        ingredients: [
          {
            name: stockRice.name,
            quantityPerServing: 0.25,
            unit: "kg",
            stockItem: stockRice._id.toString(),
          },
        ],
        notes: "Updated chef notes",
      }
    );

    assert.equal(updateRes.status, 200);

    // Verify invariants
    const stockCountAfter = await StockItem.countDocuments();
    assert.equal(stockCountAfter, stockCountBefore, "Total stock items count must NOT change");

    const riceAfter = await StockItem.findById(stockRice._id).lean();
    assert.equal(riceAfter.totalQuantity, riceBefore.totalQuantity, "Stock total quantity must NOT change");
    assert.equal(riceAfter.availableQuantity, riceBefore.availableQuantity, "Stock available quantity must NOT change");

    const gheeAfter = await StockItem.findById(stockGhee._id).lean();
    assert.equal(gheeAfter.availableQuantity, gheeBefore.availableQuantity);

    const txCountAfter = await StockTransaction.countDocuments();
    assert.equal(txCountAfter, txCountBefore, "No stock transactions must be generated by recipe updates");
  });

  // ==========================================
  // TEST 9, 10, 11: Event scaling, shared aggregation & shortages
  // ==========================================
  await t.test("9, 10, 11. Event scaling by guest count, shared ingredient aggregation across dishes, and accurate shortages", async () => {
    // Create second food item with recipe also linking to Basmati Rice
    testFoodItem2 = await FoodItem.create({
      name: `Zafrani Dum Biryani ${testSuffix}`,
      category: "Main Course",
      dietary: "veg",
      defaultRate: 280,
      description: "Layered saffron biryani with golden fried onions",
      active: true,
    });

    // Save recipe for testFoodItem2:
    // Yield = 1 serving. Per serving = 0.15 kg Basmati Rice, 0.05 kg Ghee.
    await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem2._id,
        foodItemName: testFoodItem2.name,
        yieldServings: 1,
        defaultWastagePercent: 5,
        ingredients: [
          {
            name: stockRice.name,
            quantityPerServing: 0.15,
            unit: "kg",
            stockItem: stockRice._id.toString(),
          },
          {
            name: stockGhee.name,
            quantityPerServing: 0.05,
            unit: "kg",
            stockItem: stockGhee._id.toString(),
          },
        ],
      }
    );

    // Reset testFoodItem1 recipe:
    // Yield = 2 servings. Per batch = 0.20 kg Rice (= 0.10 kg / guest).
    await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        yieldServings: 2,
        defaultWastagePercent: 5,
        ingredients: [
          {
            name: stockRice.name,
            quantityPerServing: 0.2,
            unit: "kg",
            stockItem: stockRice._id.toString(),
          },
        ],
      }
    );

    // Create confirmed booking and event with 200 guests:
    // Pulao: (0.20 / 2) * 200 guests * 1.05 = 0.10 * 200 * 1.05 = 21.00 kg Rice
    // Biryani: (0.15 / 1) * 200 guests * 1.05 = 0.15 * 200 * 1.05 = 31.50 kg Rice
    // Total shared Basmati Rice required: 21.00 + 31.50 = 52.50 kg
    // Available in warehouse: 50.00 kg
    // Shortage = 52.50 - 50.00 = 2.50 kg!
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const booking = await Booking.create({
      client: testClient._id,
      eventName: `Saffron Banquet Reception ${testSuffix}`,
      eventType: "Corporate Dinner",
      eventDate: futureDate,
      eventTime: "19:00",
      guests: 200,
      location: "Imperial Hall",
      status: "Pending",
      services: [
        {
          serviceId: testService._id,
          serviceName: testService.name,
          category: "Catering",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 5000,
          total: 5000,
        },
      ],
      subtotal: 5000,
      foodMenu: {
        included: true,
        servingType: "PER_GUEST",
        items: [
          {
            foodItemId: testFoodItem1._id,
            name: testFoodItem1.name,
            category: testFoodItem1.category,
            dietary: "veg",
            quantity: 200,
            rate: 240,
            amount: 48000,
          },
          {
            foodItemId: testFoodItem2._id,
            name: testFoodItem2.name,
            category: testFoodItem2.category,
            dietary: "veg",
            quantity: 200,
            rate: 280,
            amount: 56000,
          },
        ],
      },
    });

    const confirmRes = await confirmBooking(booking._id, kitchenManager._id);
    const event = confirmRes.event;
    assert.ok(event._id);

    // Calculate catering requirements
    const calcRes = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${event._id}?wastageAllowancePercent=5`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });

    assert.equal(calcRes.status, 200);
    const calcData = calcRes.body.data;
    assert.equal(calcData.guests, 200);

    // Verify shared aggregation for Basmati Rice
    const aggRice = calcData.aggregatedIngredients.find((a) => a.name === stockRice.name);
    assert.ok(aggRice, "Aggregated rice must be found");
    assert.equal(aggRice.requiredQuantity, 52.5, "Aggregated rice required must be exactly 52.5 kg");
    assert.equal(aggRice.availableQuantity, 50, "Warehouse available quantity must be 50 kg");
    assert.equal(aggRice.shortageQuantity, 2.5, "Expected shortage of 2.5 kg");
    assert.equal(aggRice.hasShortage, true);
    assert.equal(aggRice.status, "SHORTAGE");
    assert.equal(aggRice.usedInMenuItems.length, 2, "Must list both dishes using the shared ingredient");

    // Clean up event and booking
    await Event.deleteOne({ _id: event._id });
    await Booking.deleteOne({ _id: booking._id });
  });

  // ==========================================
  // TEST 13: RBAC & Permissions Enforcement
  // ==========================================
  await t.test("13. Role & department isolation: Decoration Manager blocked (403) from kitchen recipe endpoints", async () => {
    // Decor Manager attempt to GET kitchen recipes
    const getRes = await makeRequest(server, {
      path: "/api/departments/kitchen/recipes",
      method: "GET",
      headers: { Authorization: `Bearer ${decorToken}` },
    });
    assert.equal(getRes.status, 403, "Decoration Manager must be blocked from kitchen recipes");

    // Decor Manager attempt to POST kitchen recipe
    const postRes = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/recipes",
        method: "POST",
        headers: { Authorization: `Bearer ${decorToken}` },
      },
      {
        foodItemId: testFoodItem1._id,
        foodItemName: testFoodItem1.name,
        ingredients: [],
      }
    );
    assert.equal(postRes.status, 403, "Decoration Manager must be blocked from saving recipes");
  });
});
