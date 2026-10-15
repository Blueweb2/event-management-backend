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
const PurchaseRequest = require("../src/models/purchaseRequest.model");
const Duty = require("../src/models/duty.model");

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

test("Department Dashboards & Cross-Department RBAC Test Suite", async (t) => {
  let server;
  let superadminToken = "";
  let kitchenManagerToken = "";
  let decorationManagerToken = "";
  let photographyManagerToken = "";
  let staffToken = "";
  let operationsManagerToken = "";

  let testEventId = "";
  let testFoodItemId = "";
  let testStockItemId = "";
  let createdManagerId = "";

  t.before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // Clean up previous test users and data
    await User.deleteMany({
      email: {
        $in: [
          "superadmin_dept_test@example.com",
          "kitchen_mgr_test@example.com",
          "decor_mgr_test@example.com",
          "photo_mgr_test@example.com",
          "staff_dept_test@example.com",
          "ops_mgr_test@example.com",
        ],
      },
    });

    // 1. Create Superadmin
    const superadmin = await User.create({
      name: "Root Superadmin",
      username: "superadmin_dept_test",
      email: "superadmin_dept_test@example.com",
      password: await bcrypt.hash("Pass123!", 10),
      role: "superadmin",
      department: "Executive",
      isActive: true,
    });

    // 2. Create Kitchen Manager
    const kitchenMgr = await User.create({
      name: "Chef Marco",
      username: "kitchen_mgr_test",
      email: "kitchen_mgr_test@example.com",
      password: await bcrypt.hash("Pass123!", 10),
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

    // 3. Create Decoration Manager
    const decorMgr = await User.create({
      name: "Decor Stylist",
      username: "decor_mgr_test",
      email: "decor_mgr_test@example.com",
      password: await bcrypt.hash("Pass123!", 10),
      role: "manager",
      department: "Decoration",
      permissions: [
        "decoration:view_events",
        "decoration:view_materials",
        "decoration:create_purchase_request",
        "decoration:manage_setup_tasks",
      ],
      isActive: true,
    });

    // 4. Create Photography Manager
    const photoMgr = await User.create({
      name: "Lens Master",
      username: "photo_mgr_test",
      email: "photo_mgr_test@example.com",
      password: await bcrypt.hash("Pass123!", 10),
      role: "manager",
      department: "Photography",
      permissions: [
        "photography:view_events",
        "photography:view_equipment",
        "photography:manage_shoot_tasks",
      ],
      isActive: true,
    });

    // 5. Create Operations Manager (broad oversight)
    const opsMgr = await User.create({
      name: "Ops General",
      username: "ops_mgr_test",
      email: "ops_mgr_test@example.com",
      password: await bcrypt.hash("Pass123!", 10),
      role: "manager",
      department: "Operations",
      permissions: [],
      isActive: true,
    });

    // 6. Create Staff
    const staff = await User.create({
      name: "Line Cook Staff",
      username: "staff_dept_test",
      email: "staff_dept_test@example.com",
      password: await bcrypt.hash("Pass123!", 10),
      role: "staff",
      department: "Kitchen",
      isActive: true,
    });

    // Obtain tokens via login
    const loginUser = async (identifier, password) => {
      const res = await makeRequest(server, { path: "/api/auth/login", method: "POST" }, { identifier, password });
      return res.body.data.token;
    };

    superadminToken = await loginUser("superadmin_dept_test@example.com", "Pass123!");
    kitchenManagerToken = await loginUser("kitchen_mgr_test@example.com", "Pass123!");
    decorationManagerToken = await loginUser("decor_mgr_test@example.com", "Pass123!");
    photographyManagerToken = await loginUser("photo_mgr_test@example.com", "Pass123!");
    operationsManagerToken = await loginUser("ops_mgr_test@example.com", "Pass123!");
    staffToken = await loginUser("staff_dept_test@example.com", "Pass123!");

    // Seed a Stock item for ingredients: Basmati Rice (10 kg available)
    const stockItem = await StockItem.create({
      name: "Basmati Rice Grade A",
      category: "Other",
      totalQuantity: 20,
      availableQuantity: 10,
      unit: "kg",
      unitPrice: 120,
    });
    testStockItemId = stockItem._id.toString();

    // Seed Food Item: Royal Biryani
    const foodItem = await FoodItem.create({
      name: "Royal Mughlai Biryani",
      category: "Main Course",
      dietary: "non-veg",
      defaultRate: 350,
      active: true,
    });
    testFoodItemId = foodItem._id.toString();

    // Seed Recipe for Royal Biryani (0.2 kg rice per guest, 5% default wastage)
    await Recipe.create({
      foodItem: foodItem._id,
      foodItemName: foodItem.name,
      category: "Main Course",
      yieldServings: 1,
      defaultWastagePercent: 5,
      ingredients: [
        {
          name: "Basmati Rice Grade A",
          quantityPerServing: 0.2, // 200g per serving
          unit: "kg",
          stockItem: stockItem._id,
        },
      ],
      preparationSteps: [
        { stepNumber: 1, instruction: "Wash and soak basmati rice for 30 minutes." },
        { stepNumber: 2, instruction: "Dum cooking on slow fire." },
      ],
    });

    // Seed Client, Booking & Event with food menu and decor
    const client = await Client.create({
      name: "Lady Catherine",
      email: "catherine_test@example.com",
      phone: "+1 555 492 8812",
    });

    const booking = await Booking.create({
      client: client._id,
      eventName: "Grand Summer Banquet 2026",
      eventType: "Banquet",
      eventDate: new Date("2026-11-20"),
      eventTime: "19:00",
      guests: 100, // 100 guests: requires 100 * 0.2 * 1.05 = 21 kg. With 10 kg available, shortage is 11 kg!
      location: "Royal Orchid Ballroom",
      description: "Royal evening banquet and gala dinner.",
      status: "Confirmed",
      services: [
        {
          serviceId: new mongoose.Types.ObjectId(),
          serviceName: "Grand Floral Stage Backdrop",
          category: "decoration",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 2000,
          total: 2000,
        },
        {
          serviceId: new mongoose.Types.ObjectId(),
          serviceName: "4K Cinema Recording & Photo Album",
          category: "photography",
          quantity: 1,
          pricingType: "FIXED",
          unitPrice: 1500,
          total: 1500,
        },
      ],
      foodMenu: {
        included: true,
        servingType: "PER_GUEST",
        ratePerGuest: 450,
        notes: "No peanuts, halal meat.",
        items: [
          {
            foodItemId: foodItem._id,
            name: foodItem.name,
            category: foodItem.category,
            dietary: foodItem.dietary,
            rate: 350,
            quantity: 100,
            amount: 35000,
          },
          {
            foodItemId: new mongoose.Types.ObjectId(),
            name: "Unconfigured Gulab Jamun",
            category: "Desserts & Sweets",
            dietary: "veg",
            rate: 80,
            quantity: 100,
            amount: 8000,
          },
        ],
      },
      subtotal: 45000,
      total: 45000,
    });

    const event = await Event.create({
      client: client._id,
      booking: booking._id,
      eventName: booking.eventName,
      eventType: booking.eventType,
      eventDate: booking.eventDate,
      eventTime: booking.eventTime,
      guests: booking.guests,
      location: booking.location,
      description: booking.description,
      status: "CONFIRMED",
      createdBy: superadmin._id,
    });
    testEventId = event._id.toString();
  });

  t.after(async () => {
    // Cleanup created test records
    await User.deleteMany({
      email: {
        $in: [
          "superadmin_dept_test@example.com",
          "kitchen_mgr_test@example.com",
          "decor_mgr_test@example.com",
          "photo_mgr_test@example.com",
          "staff_dept_test@example.com",
          "ops_mgr_test@example.com",
          "new_pastry_chef@example.com",
        ],
      },
    });
    if (testStockItemId) await StockItem.findByIdAndDelete(testStockItemId);
    if (testFoodItemId) await FoodItem.findByIdAndDelete(testFoodItemId);
    await Recipe.deleteMany({ foodItemName: "Royal Mughlai Biryani" });
    if (testEventId) {
      const ev = await Event.findById(testEventId);
      if (ev && ev.booking) await Booking.findByIdAndDelete(ev.booking);
      if (ev && ev.client) await Client.findByIdAndDelete(ev.client);
      await Event.findByIdAndDelete(testEventId);
    }
    await PurchaseRequest.deleteMany({ department: "Kitchen" });
    await Duty.deleteMany({ event: testEventId });

    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  // -------------------------------------------------------------
  // Test 1: Superadmin creates a department-assigned manager
  // -------------------------------------------------------------
  await t.test("1. Superadmin can create a manager with assigned department and custom permissions", async () => {
    const res = await makeRequest(
      server,
      {
        path: "/api/auth/managers",
        method: "POST",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      {
        name: "Chef Pierre",
        username: "chef_pierre",
        email: "new_pastry_chef@example.com",
        password: "Password123!",
        department: "Kitchen",
        permissions: ["kitchen:view_events", "kitchen:view_recipes", "kitchen:calculate_ingredients"],
      }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.role, "manager");
    assert.equal(res.body.data.department, "Kitchen");
    assert.deepEqual(res.body.data.permissions, [
      "kitchen:view_events",
      "kitchen:view_recipes",
      "kitchen:calculate_ingredients",
    ]);
    createdManagerId = res.body.data.id;
  });

  // -------------------------------------------------------------
  // Test 2: Superadmin can edit manager department and permissions
  // -------------------------------------------------------------
  await t.test("2. Superadmin can update manager department and permissions (PUT /api/auth/managers/:id)", async () => {
    const res = await makeRequest(
      server,
      {
        path: `/api/auth/managers/${createdManagerId}`,
        method: "PUT",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      {
        department: "Operations",
        permissions: ["events:view_all", "kitchen:view_events"],
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.department, "Operations");
    assert.deepEqual(res.body.data.permissions, ["events:view_all", "kitchen:view_events"]);
  });

  // -------------------------------------------------------------
  // Test 3: Manager and Staff cannot create or edit managers (403)
  // -------------------------------------------------------------
  await t.test("3. Manager and Staff receive HTTP 403 trying to create or edit managers", async () => {
    // Kitchen Manager tries to create a manager
    const mgrCreateRes = await makeRequest(
      server,
      {
        path: "/api/auth/managers",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenManagerToken}` },
      },
      {
        name: "Unauthorized Mgr",
        username: "unauth_mgr",
        email: "unauth@example.com",
        password: "Password123!",
      }
    );
    assert.equal(mgrCreateRes.status, 403);

    // Staff tries to create a manager
    const staffCreateRes = await makeRequest(
      server,
      {
        path: "/api/auth/managers",
        method: "POST",
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      {
        name: "Unauthorized Staff Mgr",
        username: "staff_mgr",
        email: "staff_mgr@example.com",
        password: "Password123!",
      }
    );
    assert.equal(staffCreateRes.status, 403);

    // Manager tries to edit a manager's department
    const mgrEditRes = await makeRequest(
      server,
      {
        path: `/api/auth/managers/${createdManagerId}`,
        method: "PUT",
        headers: { Authorization: `Bearer ${kitchenManagerToken}` },
      },
      { department: "Executive" }
    );
    assert.equal(mgrEditRes.status, 403);
  });

  // -------------------------------------------------------------
  // Test 4: Unauthenticated request receives HTTP 401
  // -------------------------------------------------------------
  await t.test("4. Unauthenticated requests to department APIs receive HTTP 401", async () => {
    const res = await makeRequest(server, {
      path: "/api/departments/kitchen/events",
      method: "GET",
    });
    assert.equal(res.status, 401);
  });

  // -------------------------------------------------------------
  // Test 5: Kitchen Manager can access Kitchen events & details
  // -------------------------------------------------------------
  await t.test("5. Kitchen Manager can access confirmed Kitchen events and read-only menu details", async () => {
    const res = await makeRequest(server, {
      path: "/api/departments/kitchen/events",
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenManagerToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    const matching = res.body.data.find((e) => e.eventId === testEventId);
    assert.ok(matching, "Should find the confirmed banquet event with food menu");
    assert.equal(matching.guests, 100);
    assert.equal(matching.foodMenu.included, true);

    // Detail endpoint
    const detailRes = await makeRequest(server, {
      path: `/api/departments/kitchen/events/${testEventId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenManagerToken}` },
    });
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.foodMenu.items.length, 2);
  });

  // -------------------------------------------------------------
  // Test 6: Cross-Department Access is strictly blocked with HTTP 403
  // -------------------------------------------------------------
  await t.test("6. Cross-Department Access Protection: Non-kitchen manager is blocked with HTTP 403 from Kitchen APIs", async () => {
    // Decoration Manager attempts to access Kitchen calculation
    const decorRes = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${testEventId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${decorationManagerToken}` },
    });
    assert.equal(decorRes.status, 403);
    assert.match(decorRes.body.message, /Access denied/);

    // Photography Manager attempts to access Kitchen events
    const photoRes = await makeRequest(server, {
      path: "/api/departments/kitchen/events",
      method: "GET",
      headers: { Authorization: `Bearer ${photographyManagerToken}` },
    });
    assert.equal(photoRes.status, 403);

    // Kitchen Manager attempts to access Decoration materials
    const kitchenDecorRes = await makeRequest(server, {
      path: `/api/departments/decoration/materials/${testEventId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenManagerToken}` },
    });
    assert.equal(kitchenDecorRes.status, 403);
    assert.match(kitchenDecorRes.body.message, /Access denied/);

    // Staff member attempts to access Kitchen manager calculation
    const staffRes = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${testEventId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffRes.status, 403);
  });

  // -------------------------------------------------------------
  // Test 7: Superadmin and Operations Manager have oversight
  // -------------------------------------------------------------
  await t.test("7. Superadmin and Operations Manager have broad operational access across departments", async () => {
    // Superadmin accessing Kitchen
    const saKitchenRes = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${testEventId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    assert.equal(saKitchenRes.status, 200);

    // Superadmin accessing Decoration
    const saDecorRes = await makeRequest(server, {
      path: `/api/departments/decoration/materials/${testEventId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    assert.equal(saDecorRes.status, 200);

    // Operations Manager accessing Kitchen
    const opsKitchenRes = await makeRequest(server, {
      path: `/api/departments/kitchen/events`,
      method: "GET",
      headers: { Authorization: `Bearer ${operationsManagerToken}` },
    });
    assert.equal(opsKitchenRes.status, 200);
  });

  // -------------------------------------------------------------
  // Test 8: Ingredient Calculation Engine & Shortages
  // -------------------------------------------------------------
  await t.test("8. Ingredient requirement calculation uses recipe quantities, guests, and wastage, and clearly flags missing recipes", async () => {
    // 100 guests * 0.2 kg/guest = 20 kg base. With 5% wastage allowance: 20 * 1.05 = 21 kg required.
    // Stock item has 10 kg available.
    // Shortage = 21 - 10 = 11 kg!
    const res = await makeRequest(server, {
      path: `/api/departments/kitchen/calculate/${testEventId}?wastageAllowancePercent=5`,
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenManagerToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const data = res.body.data;

    assert.equal(data.guests, 100);
    assert.equal(data.configuredWastagePercent, 5);

    // Check aggregated ingredient calculation
    const riceAgg = data.aggregatedIngredients.find((i) => i.name === "Basmati Rice Grade A");
    assert.ok(riceAgg, "Should calculate aggregated Basmati Rice requirement");
    assert.equal(riceAgg.requiredQuantity, 21);
    assert.equal(riceAgg.availableQuantity, 10);
    assert.equal(riceAgg.shortageQuantity, 11);
    assert.equal(riceAgg.hasShortage, true);

    // Check missing recipe identification: "Unconfigured Gulab Jamun" has no recipe
    assert.equal(data.missingRecipesCount, 1);
    const missing = data.missingRecipes[0];
    assert.equal(missing.name, "Unconfigured Gulab Jamun");
    assert.match(missing.reason, /No recipe configured/);

    // Verify stock was NOT deducted merely by running this calculation
    const currentStock = await StockItem.findById(testStockItemId);
    assert.equal(currentStock.availableQuantity, 10, "Stock item available quantity must remain untouched");
  });

  // -------------------------------------------------------------
  // Test 9: Department Purchase Request creation for shortages
  // -------------------------------------------------------------
  await t.test("9. Kitchen Manager can submit an authorized Purchase Request for ingredient shortages", async () => {
    const res = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/purchase-requests",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenManagerToken}` },
      },
      {
        eventId: testEventId,
        items: [
          {
            itemName: "Basmati Rice Grade A",
            requiredQuantity: 21,
            availableQuantity: 10,
            shortageQuantity: 11,
            unit: "kg",
            estimatedCost: 1320,
            urgency: "HIGH",
            stockItem: testStockItemId,
            notes: "Required for Banquet on 2026-11-20",
          },
        ],
        notes: "Urgent purchase request for 11 kg basmati rice shortage",
      }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.department, "Kitchen");
    assert.equal(res.body.data.status, "PENDING");
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.items[0].shortageQuantity, 11);

    // List purchase requests
    const listRes = await makeRequest(server, {
      path: "/api/departments/kitchen/purchase-requests",
      method: "GET",
      headers: { Authorization: `Bearer ${kitchenManagerToken}` },
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.length >= 1);
  });

  // -------------------------------------------------------------
  // Test 10: Kitchen Prep Tasks management
  // -------------------------------------------------------------
  await t.test("10. Kitchen Manager can create and update kitchen preparation tasks", async () => {
    // Create task
    const createRes = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/tasks",
        method: "POST",
        headers: { Authorization: `Bearer ${kitchenManagerToken}` },
      },
      {
        eventId: testEventId,
        dutyTitle: "Kitchen Prep Crew",
        title: "Marinate chicken and soak biryani rice",
        description: "Must be done 4 hours prior to banquet",
      }
    );

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.success, true);
    assert.equal(createRes.body.data.title, "Marinate chicken and soak biryani rice");
    assert.equal(createRes.body.data.status, "PENDING");

    const dutyId = createRes.body.data.dutyId;
    const taskId = createRes.body.data.taskId;

    // Update status to IN_PROGRESS
    const updateRes = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/tasks/${dutyId}/${taskId}/status`,
        method: "PATCH",
        headers: { Authorization: `Bearer ${kitchenManagerToken}` },
      },
      {
        status: "IN_PROGRESS",
        notes: "Marination started at station 2",
      }
    );

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.status, "IN_PROGRESS");
    assert.equal(updateRes.body.data.completionNotes, "Marination started at station 2");
  });

  // -------------------------------------------------------------
  // Test 11: Decoration and Photography department endpoints
  // -------------------------------------------------------------
  await t.test("11. Decoration and Photography managers can view their respective department events and materials", async () => {
    // Decoration events
    const decorRes = await makeRequest(server, {
      path: "/api/departments/decoration/events",
      method: "GET",
      headers: { Authorization: `Bearer ${decorationManagerToken}` },
    });
    assert.equal(decorRes.status, 200);
    assert.ok(Array.isArray(decorRes.body.data));
    const decorEv = decorRes.body.data.find((e) => e.eventId === testEventId);
    assert.ok(decorEv, "Decoration manager should see banquet event with floral stage service");

    // Photography events
    const photoRes = await makeRequest(server, {
      path: "/api/departments/photography/events",
      method: "GET",
      headers: { Authorization: `Bearer ${photographyManagerToken}` },
    });
    assert.equal(photoRes.status, 200);
    assert.ok(Array.isArray(photoRes.body.data));
    const photoEv = photoRes.body.data.find((e) => e.eventId === testEventId);
    assert.ok(photoEv, "Photography manager should see banquet event with 4K camera package");
  });
});
