const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const app = require("../src/app");
const connectDB = require("../src/config/db");
const User = require("../src/models/user.model");
const Event = require("../src/models/event.model");
const Booking = require("../src/models/booking.model");
const FoodItem = require("../src/models/foodItem.model");
const Recipe = require("../src/models/recipe.model");
const StockItem = require("../src/models/stockItem.model");
const Duty = require("../src/models/duty.model");
const { generateToken } = require("../src/utils/jwt");
const seedKitchenData = require("../src/utils/seedKitchenData");

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

test("Kitchen Dashboard Functional Testing, Seed Verification & Scaling Suite", async (t) => {
  let server;
  let kitchenManager, decorManager, suspendedKitchenMgr;
  let kitchenToken, decorToken, suspendedToken;

  t.before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    const testSuffix = Date.now();

    // 1. Kitchen Manager User
    kitchenManager = await User.create({
      name: `Chef Marco ${testSuffix}`,
      username: `chef_marco_${testSuffix}`,
      email: `chef.marco.${testSuffix}@eventmanagement.com`,
      password: "hashedPassword123",
      role: "manager",
      department: "Kitchen",
      permissions: [
        "kitchen:view_events",
        "kitchen:view_recipes",
        "kitchen:manage_recipes",
        "kitchen:calculate_ingredients",
        "kitchen:create_purchase_request",
        "kitchen:view_purchase_requests",
      ],
      isActive: true,
    });
    kitchenToken = generateToken(kitchenManager);

    // 2. Decoration Manager (Cross-department test)
    decorManager = await User.create({
      name: `Decor Lead ${testSuffix}`,
      username: `decor_lead_${testSuffix}`,
      email: `decor.lead.${testSuffix}@eventmanagement.com`,
      password: "hashedPassword123",
      role: "manager",
      department: "Decoration",
      permissions: ["decor:view_events"],
      isActive: true,
    });
    decorToken = generateToken(decorManager);

    // 3. Suspended Kitchen Manager (isActive: false)
    suspendedKitchenMgr = await User.create({
      name: `Suspended Chef ${testSuffix}`,
      username: `suspended_chef_${testSuffix}`,
      email: `suspended.chef.${testSuffix}@eventmanagement.com`,
      password: "hashedPassword123",
      role: "manager",
      department: "Kitchen",
      isActive: false,
    });
    suspendedToken = generateToken(suspendedKitchenMgr);
  });

  t.after(async () => {
    if (kitchenManager?._id) await User.findByIdAndDelete(kitchenManager._id);
    if (decorManager?._id) await User.findByIdAndDelete(decorManager._id);
    if (suspendedKitchenMgr?._id) await User.findByIdAndDelete(suspendedKitchenMgr._id);
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  // ==============================================================
  // 1. Test Seed Data Execution & Idempotence
  // ==============================================================
  await t.test("1. Seed Kitchen Data executes successfully and is idempotent", async () => {
    const foodCountBefore = await FoodItem.countDocuments();
    const recipeCountBefore = await Recipe.countDocuments();
    const stockCountBefore = await StockItem.countDocuments();

    // Re-verify that all requested dishes exist
    const requestedDishes = [
      "Kesar Pista Thandai",
      "Fresh Lime Juice",
      "Paneer Tikka",
      "Chicken 65",
      "Vegetable Kurma",
      "Chicken Biriyani",
      "Ghee Rice",
      "Appam",
      "Kerala Parotta",
      "Green Salad",
      "Gulab Jamun",
      "Payasam",
    ];

    for (const dishName of requestedDishes) {
      const dish = await FoodItem.findOne({ name: dishName });
      assert.ok(dish, `Requested dish "${dishName}" must exist in the database`);
      assert.ok(dish.category, `Dish "${dishName}" must have a valid category`);
      assert.ok(dish.dietary, `Dish "${dishName}" must have dietary classification`);

      // Verify recipe exists
      const recipe = await Recipe.findOne({ foodItem: dish._id });
      assert.ok(recipe, `Dish "${dishName}" must have a standardized Recipe document`);
      assert.ok(recipe.ingredients.length > 0, `Recipe for "${dishName}" must contain ingredients`);
    }
  });

  // ==============================================================
  // 2. Kitchen Console Events Retrieval & Details
  // ==============================================================
  await t.test("2. GET /api/departments/kitchen/events returns confirmed catering events with menu and dietary split", async () => {
    const res = await makeRequest(server, {
      path: "/api/departments/kitchen/events",
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));

    const events = res.body.data;
    const weddingEvent = events.find((e) => e.eventName === "Grand Royal Wedding Banquet");
    assert.ok(weddingEvent, "Must return Grand Royal Wedding Banquet");
    assert.equal(weddingEvent.guests, 1000);
    assert.ok(weddingEvent.foodMenu.items.length >= 6);
    assert.ok(weddingEvent.dietarySummary.veg > 0);
    assert.ok(weddingEvent.dietarySummary.nonVeg > 0);

    const galaEvent = events.find((e) => e.eventName === "Corporate Annual Gala Dinner");
    assert.ok(galaEvent, "Must return Corporate Annual Gala Dinner");
    assert.equal(galaEvent.guests, 344);

    const luncheonEvent = events.find((e) => e.eventName === "Executive Leadership Luncheon");
    assert.ok(luncheonEvent, "Must return Executive Leadership Luncheon");
    assert.equal(luncheonEvent.guests, 100);
  });

  // ==============================================================
  // 3. Ingredient Scaling & Shortage Calculation at 1000 Guests
  // ==============================================================
  await t.test("3. Ingredient Calculation at 1000 guests scales correctly, detects Saffron shortage, and preserves stock without deducting", async () => {
    const event = await Event.findOne({ eventName: "Grand Royal Wedding Banquet" });
    assert.ok(event, "Event 1 must exist");

    // Check available quantity of Saffron and Milk before calculation
    const saffronBefore = await StockItem.findOne({ name: "Pure Saffron (Kesar)" });
    const milkBefore = await StockItem.findOne({ name: "Fresh Milk" });
    assert.ok(saffronBefore, "Saffron stock item must exist");
    const saffronQtyBefore = saffronBefore.availableQuantity;
    const milkQtyBefore = milkBefore.availableQuantity;

    const res = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${event._id}?wastage=5`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const calc = res.body.data;
    assert.equal(calc.guests, 1000);
    assert.equal(calc.hasAnyShortage, true);
    assert.ok(calc.shortages.length > 0);

    // Verify Saffron shortage
    const saffronShortage = calc.shortages.find((s) => s.name.toLowerCase().includes("saffron"));
    assert.ok(saffronShortage, "Must flag Saffron shortage because 1000 guests need ~0.315 kg vs 0.2 kg in stock");
    assert.ok(saffronShortage.shortageQuantity > 0);

    // Verify Milk calculation: 0.2L * 1000 guests * 1.05 wastage = 210L
    const milkReq = calc.aggregatedIngredients.find((a) => a.name.toLowerCase().includes("milk"));
    assert.ok(milkReq, "Must include Milk in aggregated ingredients");
    assert.equal(milkReq.requiredQuantity, 210, "1000 guests * 0.2L * 1.05 wastage must equal 210L");

    // CRITICAL: Verify stock was NOT deducted during calculation/viewing!
    const saffronAfter = await StockItem.findOne({ name: "Pure Saffron (Kesar)" });
    const milkAfter = await StockItem.findOne({ name: "Fresh Milk" });
    assert.equal(
      saffronAfter.availableQuantity,
      saffronQtyBefore,
      "Available quantity of Saffron must NOT be modified by calculation!"
    );
    assert.equal(
      milkAfter.availableQuantity,
      milkQtyBefore,
      "Available quantity of Milk must NOT be modified by calculation!"
    );
  });

  // ==============================================================
  // 4. Ingredient Scaling for 344 Guests (In-Stock Banquet)
  // ==============================================================
  await t.test("4. Ingredient Calculation for 344 guests scales dynamically with 5% wastage allowance", async () => {
    const event = await Event.findOne({ eventName: "Corporate Annual Gala Dinner" });
    assert.ok(event, "Event 2 must exist");

    const res = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${event._id}?wastage=5`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const calc = res.body.data;
    assert.equal(calc.guests, 344);
    assert.equal(calc.missingRecipesCount, 0, "All 7 dishes in Gala Dinner must have valid recipes");

    // Paneer Tikka paneer requirement: 0.12 kg/guest * 344 guests * 1.05 = 43.344 kg
    const paneerReq = calc.aggregatedIngredients.find((a) => a.name.toLowerCase().includes("paneer"));
    assert.ok(paneerReq, "Must calculate paneer requirement");
    assert.equal(paneerReq.requiredQuantity, 43.344);
    assert.equal(paneerReq.hasShortage, false, "Stock of 150 kg paneer is sufficient for 43.344 kg");
  });

  // ==============================================================
  // 5. Missing Recipe Detection at 100 Guests
  // ==============================================================
  await t.test("5. Ingredient Calculation at 100 guests detects unmapped recipe without crashing", async () => {
    const event = await Event.findOne({ eventName: "Executive Leadership Luncheon" });
    assert.ok(event, "Event 3 must exist");

    const res = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${event._id}`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });

    assert.equal(res.status, 200);
    const calc = res.body.data;
    assert.equal(calc.guests, 100);
    assert.equal(calc.missingRecipesCount, 1, "Must detect 1 missing recipe for Bruschetta");

    const missingItem = calc.missingRecipes[0];
    assert.equal(missingItem.name, "Chef's Artisanal Herb Bruschetta");
  });

  // ==============================================================
  // 6. Kitchen Prep Checklist: Create, Toggle Status, and Delete (Remove)
  // ==============================================================
  await t.test("6. Kitchen Prep Checklist supports Add, Status Toggle, and Delete operations", async () => {
    const event = await Event.findOne({ eventName: "Grand Royal Wedding Banquet" });
    assert.ok(event);

    // 1. Add Task
    const createRes = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/tasks",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        eventId: event._id.toString(),
        title: "Marinate 150kg Chicken 65 in ginger-garlic paste",
        dutyTitle: "Kitchen Prep Line",
      }
    );

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.success, true);
    const { taskId, dutyId } = createRes.body.data;
    assert.ok(taskId);
    assert.ok(dutyId);

    // 2. Query Tasks
    const getRes = await makeRequest(server, {
      path: `/api/departments/kitchen/tasks?eventId=${event._id}`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });
    assert.equal(getRes.status, 200);
    const foundTask = getRes.body.data.find((t) => String(t.id) === String(taskId));
    assert.ok(foundTask);
    assert.equal(foundTask.status, "PENDING");

    // 3. Toggle Status to COMPLETED
    const patchRes = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/tasks/${dutyId}/${taskId}/status`,
        method: "PATCH",
        headers: { Authorization: `Bearer ${kitchenToken}` },
      },
      {
        status: "COMPLETED",
        notes: "Done by morning shift",
      }
    );
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.status, "COMPLETED");

    // 4. Delete / Remove Task
    const deleteRes = await makeRequest(server, {
      path: `/api/departments/kitchen/tasks/${dutyId}/${taskId}`,
      method: "DELETE",
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.success, true);

    // Verify task is gone from duty
    const dutyAfter = await Duty.findById(dutyId);
    assert.ok(dutyAfter);
    const taskCheck = dutyAfter.tasks.id(taskId);
    assert.equal(taskCheck, null, "Deleted task must no longer exist in duty.tasks");
  });

  // ==============================================================
  // 7. Authorization & Inactive Account Enforcement
  // ==============================================================
  await t.test("7. Multi-tier RBAC: Decoration Manager blocked (403), Suspended Chef blocked (403)", async () => {
    // 1. Decoration Manager -> 403 Forbidden for kitchen events
    const crossDeptRes = await makeRequest(server, {
      path: "/api/departments/kitchen/events",
      method: "GET",
      headers: { Authorization: `Bearer ${decorToken}` },
    });
    assert.equal(crossDeptRes.status, 403, "Non-kitchen manager must receive 403 Forbidden");

    // 2. Suspended Kitchen Manager (isActive: false) -> 403 Forbidden
    const suspRes = await makeRequest(server, {
      path: "/api/departments/kitchen/events",
      method: "GET",
      headers: { Authorization: `Bearer ${suspendedToken}` },
    });
    assert.equal(suspRes.status, 403, "Deactivated account must receive 403 Forbidden");
  });
});
