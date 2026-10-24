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
const Service = require("../src/models/service.model");
const Client = require("../src/models/client.model");
const StockItem = require("../src/models/stockItem.model");
const StockTransaction = require("../src/models/stockTransaction.model");
const PurchaseRequest = require("../src/models/purchaseRequest.model");
const { generateToken } = require("../src/utils/jwt");

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

test("Grocery Procurement & Restocking Workflow E2E Suite", async (t) => {
  let server;
  let chefManager, superadminUser, staffUser, decorManager;
  let chefToken, superadminToken, staffToken, decorToken;
  let testClient, testEvent, testBooking, testService;
  let stockBasmatiRice, stockCardamom;

  const testSuffix = Date.now();

  t.before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));

    // 1. Create Users
    chefManager = await User.create({
      name: `Chef Joseph ${testSuffix}`,
      username: `chef_proc_${testSuffix}`,
      email: `chef_proc_${testSuffix}@example.com`,
      password: await bcrypt.hash("Pass123!", 10),
      role: "manager",
      department: "Kitchen",
      permissions: [
        "kitchen:view_events",
        "kitchen:create_purchase_request",
        "kitchen:manage_recipes",
      ],
      isActive: true,
    });
    chefToken = generateToken(chefManager);

    superadminUser = await User.create({
      name: `Super Admin ${testSuffix}`,
      username: `super_proc_${testSuffix}`,
      email: `super_proc_${testSuffix}@example.com`,
      password: await bcrypt.hash("Pass123!", 10),
      role: "superadmin",
      department: "Management",
      isActive: true,
    });
    superadminToken = generateToken(superadminUser);

    staffUser = await User.create({
      name: `Kitchen Staff ${testSuffix}`,
      username: `staff_proc_${testSuffix}`,
      email: `staff_proc_${testSuffix}@example.com`,
      password: await bcrypt.hash("Pass123!", 10),
      role: "staff",
      department: "Kitchen",
      isActive: true,
    });
    staffToken = generateToken(staffUser);

    decorManager = await User.create({
      name: `Decor Mgr ${testSuffix}`,
      username: `decor_proc_${testSuffix}`,
      email: `decor_proc_${testSuffix}@example.com`,
      password: await bcrypt.hash("Pass123!", 10),
      role: "manager",
      department: "Decoration",
      isActive: true,
    });
    decorToken = generateToken(decorManager);

    // 2. Create Warehouse Stock Items
    stockBasmatiRice = await StockItem.create({
      name: `Basmati Rice ${testSuffix}`,
      category: "Raw Ingredients",
      totalQuantity: 20,
      availableQuantity: 20,
      minStockLevel: 10,
      unit: "kg",
      unitPrice: 120,
      department: "Kitchen",
      stockType: "kitchen",
      isRentable: false,
    });

    stockCardamom = await StockItem.create({
      name: `Green Cardamom ${testSuffix}`,
      category: "Raw Ingredients",
      totalQuantity: 1, // 1 kg
      availableQuantity: 1,
      minStockLevel: 0.5,
      unit: "kg",
      unitPrice: 2000,
      department: "Kitchen",
      stockType: "kitchen",
      isRentable: false,
    });

    // 3. Create Booking & Event
    testClient = await Client.create({
      name: `Procurement Client ${testSuffix}`,
      email: `client_proc_${testSuffix}@example.com`,
      phone: "9876543210",
    });

    testService = await Service.create({
      name: `Catering Package ${testSuffix}`,
      category: "Catering",
      pricingType: "FIXED",
      basePrice: 5000,
    });

    testBooking = await Booking.create({
      client: testClient._id,
      eventName: `Grand Wedding ${testSuffix}`,
      eventType: "Wedding",
      eventDate: new Date(Date.now() + 86400000 * 7),
      eventTime: "18:00",
      guests: 200,
      location: "Kerala Convention Centre",
      status: "Confirmed",
      services: [
        {
          serviceId: testService._id,
          serviceName: testService.name,
          category: testService.category.toLowerCase(),
          pricingType: "FIXED",
          quantity: 1,
          unitPrice: 5000,
          total: 5000,
        },
      ],
    });

    testEvent = await Event.create({
      eventName: `Grand Wedding ${testSuffix}`,
      eventType: "Wedding",
      eventDate: new Date(Date.now() + 86400000 * 7),
      eventTime: "18:00",
      guests: 200,
      location: "Kerala Convention Centre",
      status: "CONFIRMED",
      client: testClient._id,
      booking: testBooking._id,
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await User.deleteMany({ _id: { $in: [chefManager?._id, superadminUser?._id, staffUser?._id, decorManager?._id] } });
    await StockItem.deleteMany({ _id: { $in: [stockBasmatiRice?._id, stockCardamom?._id] } });
    await StockTransaction.deleteMany({ performedBy: { $in: [chefManager?._id, superadminUser?._id, staffUser?._id] } });
    await PurchaseRequest.deleteMany({ event: testEvent?._id });
    await Event.deleteMany({ _id: testEvent?._id });
    if (testBooking) await Booking.deleteMany({ _id: testBooking._id });
    if (testService) await Service.deleteMany({ _id: testService._id });
    await Client.deleteMany({ _id: testClient?._id });
    await mongoose.disconnect();
  });

  let createdPrId;

  await t.test("1. Chef submits grocery requisition with stockItem linkage", async () => {
    const res = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/purchase-requests",
        method: "POST",
        headers: { Authorization: `Bearer ${chefToken}` },
      },
      {
        eventId: testEvent._id.toString(),
        items: [
          {
            itemName: stockBasmatiRice.name,
            requiredQuantity: 50,
            availableQuantity: 20,
            shortageQuantity: 30,
            unit: "kg",
            stockItem: stockBasmatiRice._id.toString(),
            urgency: "HIGH",
            notes: "Need for biryani",
          },
        ],
        notes: "Wedding banquet groceries",
      }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "PENDING");
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.items[0].stockItem?._id || res.body.data.items[0].stockItem, stockBasmatiRice._id.toString());
    assert.equal(res.body.data.items[0].shortageQuantity, 30);
    createdPrId = res.body.data._id;
  });

  await t.test("2. Non-destructive merge when submitting additional shortage item to pending PR", async () => {
    const res = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/purchase-requests",
        method: "POST",
        headers: { Authorization: `Bearer ${chefToken}` },
      },
      {
        eventId: testEvent._id.toString(),
        items: [
          {
            itemName: stockCardamom.name,
            requiredQuantity: 2,
            availableQuantity: 1,
            shortageQuantity: 1,
            unit: "kg",
            stockItem: stockCardamom._id.toString(),
            urgency: "HIGH",
          },
        ],
        notes: "Added cardamom for desserts",
      }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.data._id, createdPrId, "Must merge into the existing pending request");
    assert.equal(res.body.data.items.length, 2, "Both Basmati Rice and Cardamom must be present");
    const rice = res.body.data.items.find((i) => i.itemName === stockBasmatiRice.name);
    const cardamom = res.body.data.items.find((i) => i.itemName === stockCardamom.name);
    assert.ok(rice, "Basmati rice preserved");
    assert.ok(cardamom, "Cardamom added");
    assert.equal(rice.shortageQuantity, 30);
    assert.equal(cardamom.shortageQuantity, 1);
  });

  await t.test("3. RBAC Enforcement: Staff and unauthorized department blocked from review/receive", async () => {
    // Staff attempt to approve
    const staffReview = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${createdPrId}/review`,
        method: "PATCH",
        headers: { Authorization: `Bearer ${staffToken}` },
      },
      { status: "APPROVED" }
    );
    assert.equal(staffReview.status, 403, "Staff must be rejected with 403 Forbidden");

    // Decor manager attempt to approve kitchen PR
    const decorReview = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${createdPrId}/review`,
        method: "PATCH",
        headers: { Authorization: `Bearer ${decorToken}` },
      },
      { status: "APPROVED" }
    );
    assert.equal(decorReview.status, 403, "Decoration manager must be rejected with 403 Forbidden for Kitchen PR");
  });

  await t.test("4. Cannot receive goods on a PENDING purchase request", async () => {
    const prDoc = await PurchaseRequest.findById(createdPrId);
    const riceItemId = prDoc.items.find((i) => i.itemName === stockBasmatiRice.name)._id.toString();

    const receiveRes = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${createdPrId}/receive`,
        method: "POST",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      {
        idempotencyKey: `rcpt_early_${Date.now()}`,
        receivedItems: [{ itemId: riceItemId, quantityReceived: 10, unit: "kg" }],
      }
    );

    assert.equal(receiveRes.status, 400);
    assert.ok(receiveRes.body.message.includes("PENDING"));
  });

  await t.test("5. Superadmin approves purchase request", async () => {
    const res = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${createdPrId}/review`,
        method: "PATCH",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      { status: "APPROVED" }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "APPROVED");
    assert.ok(res.body.data.approvedBy);
    assert.ok(res.body.data.approvedAt);
    res.body.data.items.forEach((item) => {
      assert.equal(item.status, "APPROVED");
      assert.equal(item.approvedQuantity, item.shortageQuantity);
    });
  });

  await t.test("6. Superadmin receives partial delivery with unit conversion", async () => {
    const prDoc = await PurchaseRequest.findById(createdPrId);
    const riceItem = prDoc.items.find((i) => i.itemName === stockBasmatiRice.name);
    const cardamomItem = prDoc.items.find((i) => i.itemName === stockCardamom.name);

    const idempotencyKey = `rcpt_batch1_${Date.now()}`;

    // Deliver: 15 kg rice (out of 30 kg approved)
    // Deliver: 500 grams cardamom (out of 1 kg approved) -> tests unit conversion from grams to kg!
    const res = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${createdPrId}/receive`,
        method: "POST",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      {
        idempotencyKey,
        notes: "First batch delivery from Metro Cash & Carry",
        receivedItems: [
          { itemId: riceItem._id.toString(), quantityReceived: 15, unit: "kg" },
          { itemId: cardamomItem._id.toString(), quantityReceived: 500, unit: "g" },
        ],
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "PARTIALLY_FULFILLED");

    // Check item progress
    const updatedRice = res.body.data.items.find((i) => i.itemName === stockBasmatiRice.name);
    const updatedCardamom = res.body.data.items.find((i) => i.itemName === stockCardamom.name);

    assert.equal(updatedRice.receivedQuantity, 15);
    assert.equal(updatedRice.status, "PARTIALLY_FULFILLED");

    // Cardamom: 500g converted to 0.5 kg
    assert.equal(updatedCardamom.receivedQuantity, 0.5);
    assert.equal(updatedCardamom.status, "PARTIALLY_FULFILLED");

    // Receipts record
    assert.equal(res.body.data.receipts.length, 1);
    assert.equal(res.body.data.receipts[0].receiptId, idempotencyKey);

    // Verify StockItem quantities in database
    const freshRice = await StockItem.findById(stockBasmatiRice._id);
    assert.equal(freshRice.totalQuantity, 35, "20 initial + 15 received = 35");
    assert.equal(freshRice.availableQuantity, 35, "20 initial + 15 received = 35");

    const freshCardamom = await StockItem.findById(stockCardamom._id);
    assert.equal(freshCardamom.totalQuantity, 1.5, "1 initial + 0.5 kg received = 1.5");
    assert.equal(freshCardamom.availableQuantity, 1.5, "1 initial + 0.5 kg received = 1.5");

    // Verify StockTransaction ledger entries
    const transactions = await StockTransaction.find({ stockItem: stockBasmatiRice._id }).sort({ createdAt: -1 });
    assert.ok(transactions.length > 0);
    assert.equal(transactions[0].type, "ADDED");
    assert.equal(transactions[0].quantity, 15);
    assert.equal(transactions[0].previousTotal, 20);
    assert.equal(transactions[0].newTotal, 35);
    assert.equal(transactions[0].event.toString(), testEvent._id.toString());
  });

  await t.test("7. Idempotency Guard: Resubmitting identical receipt does NOT double-credit stock", async () => {
    const prDoc = await PurchaseRequest.findById(createdPrId);
    const riceItem = prDoc.items.find((i) => i.itemName === stockBasmatiRice.name);
    const cardamomItem = prDoc.items.find((i) => i.itemName === stockCardamom.name);
    const priorReceiptId = prDoc.receipts[0].receiptId;

    const res = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${createdPrId}/receive`,
        method: "POST",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      {
        idempotencyKey: priorReceiptId, // EXACT SAME KEY
        notes: "Retry submission",
        receivedItems: [
          { itemId: riceItem._id.toString(), quantityReceived: 15, unit: "kg" },
          { itemId: cardamomItem._id.toString(), quantityReceived: 500, unit: "g" },
        ],
      }
    );

    assert.equal(res.status, 200);

    // Stock must remain unchanged
    const freshRice = await StockItem.findById(stockBasmatiRice._id);
    assert.equal(freshRice.totalQuantity, 35, "Must still be 35, not 50");
    assert.equal(freshRice.availableQuantity, 35, "Must still be 35, not 50");

    const freshPr = await PurchaseRequest.findById(createdPrId);
    assert.equal(freshPr.receipts.length, 1, "Must not append duplicate receipt record");
  });

  await t.test("8. Complete fulfillment of remaining quantities", async () => {
    const prDoc = await PurchaseRequest.findById(createdPrId);
    const riceItem = prDoc.items.find((i) => i.itemName === stockBasmatiRice.name);
    const cardamomItem = prDoc.items.find((i) => i.itemName === stockCardamom.name);

    const idempotencyKey = `rcpt_batch2_${Date.now()}`;

    // Remaining: 15 kg rice, 500 g cardamom
    const res = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${createdPrId}/receive`,
        method: "POST",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      {
        idempotencyKey,
        notes: "Final delivery",
        receivedItems: [
          { itemId: riceItem._id.toString(), quantityReceived: 15, unit: "kg" },
          { itemId: cardamomItem._id.toString(), quantityReceived: 500, unit: "g" },
        ],
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "FULFILLED", "Entire PR should be FULFILLED");

    const finalRice = res.body.data.items.find((i) => i.itemName === stockBasmatiRice.name);
    const finalCardamom = res.body.data.items.find((i) => i.itemName === stockCardamom.name);

    assert.equal(finalRice.status, "FULFILLED");
    assert.equal(finalRice.receivedQuantity, 30);
    assert.equal(finalCardamom.status, "FULFILLED");
    assert.equal(finalCardamom.receivedQuantity, 1);

    const freshRice = await StockItem.findById(stockBasmatiRice._id);
    assert.equal(freshRice.totalQuantity, 50);
    assert.equal(freshRice.availableQuantity, 50);
  });

  await t.test("9. Rejection Flow: Rejection reason required and recorded", async () => {
    // Create a new PR to test rejection
    const prRes = await makeRequest(
      server,
      {
        path: "/api/departments/kitchen/purchase-requests",
        method: "POST",
        headers: { Authorization: `Bearer ${chefToken}` },
      },
      {
        items: [
          {
            itemName: "Saffron",
            requiredQuantity: 10,
            shortageQuantity: 10,
            unit: "g",
          },
        ],
      }
    );
    const newPrId = prRes.body.data._id;

    // Reject without reason -> 400
    const failReject = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${newPrId}/review`,
        method: "PATCH",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      { status: "REJECTED" }
    );
    assert.equal(failReject.status, 400);

    // Reject with reason -> 200
    const successReject = await makeRequest(
      server,
      {
        path: `/api/departments/kitchen/purchase-requests/${newPrId}/review`,
        method: "PATCH",
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
      { status: "REJECTED", rejectionReason: "Budget limit exceeded for exotic spices" }
    );
    assert.equal(successReject.status, 200);
    assert.equal(successReject.body.data.status, "REJECTED");
    assert.equal(successReject.body.data.rejectionReason, "Budget limit exceeded for exotic spices");

    // Clean up
    await PurchaseRequest.findByIdAndDelete(newPrId);
  });
});
