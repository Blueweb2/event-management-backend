const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");
const fs = require("fs");
const dns = require("dns");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e) {}

dotenv.config({ path: path.join(__dirname, "../.env") });

const app = require("../src/app");
const User = require("../src/models/user.model");
const Client = require("../src/models/client.model");
const Expense = require("../src/models/expense.model");
const Event = require("../src/models/event.model");
const { generateToken } = require("../src/utils/jwt");

test.describe("Operational Expenses & Receipt Attachment Test Suite", () => {
  let server;
  let baseUrl;
  let superadminUser, managerUser, staffUser;
  let superadminToken, managerToken, staffToken;
  let testEvent;
  let testClient;

  test.before(async () => {
    const mongoUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    }

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}/api`;

    // Clean up test data
    await Expense.deleteMany({ title: { $regex: /^TEST_OP_/ } });
    await User.deleteMany({ email: { $regex: /@optest\.local$/ } });
    await Event.deleteMany({ eventName: "TEST_OP_EVENT" });
    await Client.deleteMany({ email: "corp@optest.local" });

    // 1. Create Superadmin
    superadminUser = await User.create({
      name: "Superadmin Sarah",
      username: "sarah_superadmin",
      email: "sarah@optest.local",
      phone: "9988771101",
      password: "Password123!",
      role: "superadmin",
      isActive: true,
    });
    superadminToken = generateToken(superadminUser);

    // 2. Create Manager
    managerUser = await User.create({
      name: "Manager Mike",
      username: "mike_manager",
      email: "mike@optest.local",
      phone: "9988771102",
      password: "Password123!",
      role: "manager",
      department: "Operations",
      permissions: ["expenses_manage", "events_manage"],
      isActive: true,
    });
    managerToken = generateToken(managerUser);

    // 3. Create Staff
    staffUser = await User.create({
      name: "Staff Sam",
      username: "sam_staff",
      email: "sam@optest.local",
      phone: "9988771103",
      password: "Password123!",
      role: "staff",
      department: "Operations",
      permissions: ["expenses_create"],
      isActive: true,
    });
    staffToken = generateToken(staffUser);
  });

  test.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await Expense.deleteMany({ title: { $regex: /^TEST_OP_/ } });
    await User.deleteMany({ email: { $regex: /@optest\.local$/ } });
  });

  test("1. Add an expense without receipt (backward compatibility)", async () => {
    const res = await fetch(`${baseUrl}/expenses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: "TEST_OP_Decor flowers",
        category: "Decoration",
        amount: 12000,
        event: "TEST_OP_EVENT",
        date: "2026-11-10",
        paymentMethod: "Bank Transfer",
        status: "Paid",
        description: "Fresh orchids and floral garlands",
        vendorName: "Bloom Florals",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.category, "Decoration");
    assert.equal(body.data.vendorName, "Bloom Florals");
    assert.equal(body.data.hasReceipt, false);
    assert.equal(body.data.createdByName, "Manager Mike");
  });

  test("2. Add an expense with a JPG receipt", async () => {
    const form = new FormData();
    form.append("title", "TEST_OP_Van Transport Fuel");
    form.append("category", "Transport");
    form.append("amount", "4500");
    form.append("event", "TEST_OP_EVENT");
    form.append("date", "2026-11-12");
    form.append("paymentMethod", "UPI");
    form.append("status", "Paid");
    form.append("vendorName", "City Fuel Station");
    form.append("description", "Fuel for logistical van");

    const fileBlob = new Blob([Buffer.from("FAKE_JPG_CONTENT")], { type: "image/jpeg" });
    form.append("receipt", fileBlob, "invoice_fuel.jpg");

    const res = await fetch(`${baseUrl}/expenses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
      body: form,
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.category, "Transport");
    assert.equal(body.data.hasReceipt, true);
    assert.equal(body.data.receiptOriginalName, "invoice_fuel.jpg");
    assert.ok(body.data.receiptPath);
    assert.equal(body.data.createdByName, "Staff Sam");
  });

  test("3. Add an expense with a PDF receipt", async () => {
    const form = new FormData();
    form.append("title", "TEST_OP_Catering Supplies");
    form.append("category", "Catering");
    form.append("amount", "25000");
    form.append("event", "TEST_OP_EVENT");
    form.append("date", "2026-11-15");
    form.append("paymentMethod", "Bank Transfer");
    form.append("status", "Pending");
    form.append("vendorName", "Metro Gourmet Wholesale");
    form.append("description", "Organic vegetables and spices wholesale invoice");

    const pdfBlob = new Blob([Buffer.from("%PDF-1.4 FAKE_PDF_CONTENT")], { type: "application/pdf" });
    form.append("receipt", pdfBlob, "catering_bill.pdf");

    const res = await fetch(`${baseUrl}/expenses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
      body: form,
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.category, "Catering");
    assert.equal(body.data.hasReceipt, true);
    assert.equal(body.data.receiptOriginalName, "catering_bill.pdf");
    assert.ok(body.data.receiptMimeType.includes("pdf"));
  });

  test("4. View image and PDF receipts via authenticated GET /:id/receipt", async () => {
    const expense = await Expense.findOne({ title: "TEST_OP_Catering Supplies" });
    assert.ok(expense);

    const res = await fetch(`${baseUrl}/expenses/${expense._id}/receipt`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.ok((res.headers.get("content-disposition") || "").includes("inline"));

    // Also test query token fallback
    const resWithQueryToken = await fetch(
      `${baseUrl}/expenses/${expense._id}/receipt?token=${encodeURIComponent(staffToken)}`
    );

    assert.equal(resWithQueryToken.status, 200);
    assert.equal(resWithQueryToken.headers.get("content-type"), "application/pdf");
  });

  test("5. Handle missing receipt on expense without attachment", async () => {
    const expense = await Expense.findOne({ title: "TEST_OP_Decor flowers" });
    assert.ok(expense);

    const res = await fetch(`${baseUrl}/expenses/${expense._id}/receipt`, {
      headers: {
        Authorization: `Bearer ${superadminToken}`,
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.message, "No receipt attached to this expense");
  });

  test("6. Fetch creators list via GET /api/expenses/creators", async () => {
    const res = await fetch(`${baseUrl}/expenses/creators`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    const ids = body.data.map((c) => String(c._id || c.id));
    assert.ok(ids.includes(managerUser._id.toString()));
    assert.ok(ids.includes(staffUser._id.toString()));
  });

  test("7. Filter expenses by category (including category aliases Catering <-> Food)", async () => {
    const resCatering = await fetch(
      `${baseUrl}/expenses?category=Catering&search=TEST_OP_`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
      }
    );

    assert.equal(resCatering.status, 200);
    const cateringBody = await resCatering.json();
    assert.ok(cateringBody.data.some((e) => e.title === "TEST_OP_Catering Supplies"));

    const resTransport = await fetch(
      `${baseUrl}/expenses?category=Transport&search=TEST_OP_`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
      }
    );

    assert.equal(resTransport.status, 200);
    const transportBody = await resTransport.json();
    assert.equal(transportBody.data.length, 1);
    assert.equal(transportBody.data[0].title, "TEST_OP_Van Transport Fuel");
  });

  test("8. Filter expenses by createdBy, date range, and vendor name search", async () => {
    // 1. Filter by Staff Sam
    const resCreatedBy = await fetch(
      `${baseUrl}/expenses?createdBy=${staffUser._id}&search=TEST_OP_`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
      }
    );

    assert.equal(resCreatedBy.status, 200);
    const createdByBody = await resCreatedBy.json();
    assert.equal(createdByBody.data.length, 1);
    assert.equal(createdByBody.data[0].title, "TEST_OP_Van Transport Fuel");

    // 2. Date range filter (2026-11-11 to 2026-11-13) -> only Nov 12 fuel expense
    const resDate = await fetch(
      `${baseUrl}/expenses?startDate=2026-11-11&endDate=2026-11-13&search=TEST_OP_`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
      }
    );

    assert.equal(resDate.status, 200);
    const dateBody = await resDate.json();
    assert.equal(dateBody.data.length, 1);
    assert.equal(dateBody.data[0].title, "TEST_OP_Van Transport Fuel");

    // 3. Search by Vendor Name ("Metro Gourmet")
    const resVendor = await fetch(
      `${baseUrl}/expenses?search=Metro Gourmet`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
      }
    );

    assert.equal(resVendor.status, 200);
    const vendorBody = await resVendor.json();
    assert.equal(vendorBody.data.length, 1);
    assert.equal(vendorBody.data[0].title, "TEST_OP_Catering Supplies");
  });

  test("9. Event A displays only Event A expenses and Event B displays only Event B expenses", async () => {
    const eventA = await Event.create({
      client: new mongoose.Types.ObjectId(),
      booking: new mongoose.Types.ObjectId(),
      eventName: "TEST_OP_EVENT_A",
      eventType: "Wedding",
      eventDate: new Date("2026-11-20"),
      eventTime: "18:00",
      guests: 100,
      location: "Hall A",
      status: "CONFIRMED",
      createdBy: managerUser._id,
    });

    const eventB = await Event.create({
      client: new mongoose.Types.ObjectId(),
      booking: new mongoose.Types.ObjectId(),
      eventName: "TEST_OP_EVENT_B",
      eventType: "Conference",
      eventDate: new Date("2026-11-25"),
      eventTime: "09:00",
      guests: 50,
      location: "Hall B",
      status: "CONFIRMED",
      createdBy: managerUser._id,
    });

    // Create expense for Event A
    const resA = await fetch(`${baseUrl}/expenses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: "TEST_OP_Sound System A",
        category: "Equipment Rental",
        amount: 8000,
        event: "TEST_OP_EVENT_A",
        eventId: eventA._id.toString(),
        date: "2026-11-20",
        paymentMethod: "Bank Transfer",
        status: "Paid",
        vendorName: "Audio Pros",
      }),
    });
    assert.equal(resA.status, 201);

    // Create expense for Event B
    const resB = await fetch(`${baseUrl}/expenses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        title: "TEST_OP_Projector Rental B",
        category: "Equipment Rental",
        amount: 5000,
        event: "TEST_OP_EVENT_B",
        eventId: eventB._id.toString(),
        date: "2026-11-25",
        paymentMethod: "UPI",
        status: "Pending",
        vendorName: "Visuals Inc",
      }),
    });
    assert.equal(resB.status, 201);

    // Query for Event A expenses only
    const queryA = await fetch(`${baseUrl}/expenses?eventId=${eventA._id}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(queryA.status, 200);
    const bodyA = await queryA.json();
    assert.ok(bodyA.data.length >= 1);
    assert.ok(bodyA.data.every((e) => String(e.eventId?._id || e.eventId) === eventA._id.toString() || e.event === "TEST_OP_EVENT_A"));
    assert.ok(bodyA.data.some((e) => e.title === "TEST_OP_Sound System A"));
    assert.ok(!bodyA.data.some((e) => e.title === "TEST_OP_Projector Rental B"));

    // Query for Event B expenses only
    const queryB = await fetch(`${baseUrl}/expenses?eventId=${eventB._id}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(queryB.status, 200);
    const bodyB = await queryB.json();
    assert.ok(bodyB.data.length >= 1);
    assert.ok(bodyB.data.every((e) => String(e.eventId?._id || e.eventId) === eventB._id.toString() || e.event === "TEST_OP_EVENT_B"));
    assert.ok(bodyB.data.some((e) => e.title === "TEST_OP_Projector Rental B"));
    assert.ok(!bodyB.data.some((e) => e.title === "TEST_OP_Sound System A"));

    // Clean up
    await Event.deleteMany({ _id: { $in: [eventA._id, eventB._id] } });
  });

  test("10. Event-scoped creators and combined multi-filter evaluation", async () => {
    // Check creators endpoint with eventId
    const resCreators = await fetch(`${baseUrl}/expenses/creators?eventId=nonexistent`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(resCreators.status, 200);
    const creatorsBody = await resCreators.json();
    assert.ok(Array.isArray(creatorsBody.data));
    // Managers & superadmins are always authorized
    assert.ok(creatorsBody.data.some((c) => c.role === "manager"));

    // Multi-filter: Category=Transport, createdBy=Staff Sam, search=Fuel
    const resMulti = await fetch(
      `${baseUrl}/expenses?category=Transport&createdBy=${staffUser._id}&search=Fuel`,
      {
        headers: { Authorization: `Bearer ${managerToken}` },
      }
    );
    assert.equal(resMulti.status, 200);
    const multiBody = await resMulti.json();
    assert.equal(multiBody.data.length, 1);
    assert.equal(multiBody.data[0].title, "TEST_OP_Van Transport Fuel");
  });
});
