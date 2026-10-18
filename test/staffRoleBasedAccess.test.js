const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const mongoose = require("mongoose");
const dns = require("dns");
const dotenv = require("dotenv");
const path = require("path");
const bcrypt = require("bcryptjs");

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
const Duty = require("../src/models/duty.model");
const { generateToken } = require("../src/utils/jwt");

test.describe("Role-Based Staff Management & Department Filtering Test Suite", () => {
  let server;
  let baseUrl;

  let superAdminUser;
  let decoManagerUser;
  let chefManagerUser;
  let kitchenStaffUser;
  let decoStaffUser;

  let superAdminToken;
  let decoManagerToken;
  let chefManagerToken;
  let kitchenStaffToken;
  let decoStaffToken;

  const createdUserIds = [];
  const createdDutyIds = [];

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
    const hashedPassword = await bcrypt.hash("Password123!", 10);

    // 1. Super Admin
    superAdminUser = await User.create({
      name: "Global Super Admin",
      username: `superadmin_${ts}`,
      email: `superadmin_${ts}@test.com`,
      password: hashedPassword,
      role: "superadmin",
      isActive: true,
      department: "Management",
    });
    createdUserIds.push(superAdminUser._id);
    superAdminToken = generateToken(superAdminUser);

    // 2. Decoration Manager
    decoManagerUser = await User.create({
      name: "Deco Manager",
      username: `decomgr_${ts}`,
      email: `decomgr_${ts}@test.com`,
      password: hashedPassword,
      role: "manager",
      isActive: true,
      department: "Decoration",
    });
    createdUserIds.push(decoManagerUser._id);
    decoManagerToken = generateToken(decoManagerUser);

    // 3. Chef Manager (Kitchen)
    chefManagerUser = await User.create({
      name: "Chef Head Manager",
      username: `chefmgr_${ts}`,
      email: `chefmgr_${ts}@test.com`,
      password: hashedPassword,
      role: "manager",
      isActive: true,
      department: "Kitchen",
    });
    createdUserIds.push(chefManagerUser._id);
    chefManagerToken = generateToken(chefManagerUser);

    // 4. Kitchen Staff
    kitchenStaffUser = await User.create({
      name: "Line Cook Staff",
      username: `cook_${ts}`,
      email: `cook_${ts}@test.com`,
      password: hashedPassword,
      role: "staff",
      isActive: true,
      department: "Kitchen",
      salary: 35000,
      hourlyRate: 200,
    });
    createdUserIds.push(kitchenStaffUser._id);
    kitchenStaffToken = generateToken(kitchenStaffUser);

    // 5. Decoration Staff
    decoStaffUser = await User.create({
      name: "Florist Deco Staff",
      username: `florist_${ts}`,
      email: `florist_${ts}@test.com`,
      password: hashedPassword,
      role: "staff",
      isActive: true,
      department: "Decoration",
      salary: 28000,
      hourlyRate: 150,
    });
    createdUserIds.push(decoStaffUser._id);
    decoStaffToken = generateToken(decoStaffUser);
  });

  test.after(async () => {
    if (createdDutyIds.length > 0) {
      await Duty.deleteMany({ _id: { $in: createdDutyIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  });

  // Helper request
  async function apiRequest(endpoint, { method = "GET", token, body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  // ==========================================
  // 1. SUPER ADMIN PERMISSIONS
  // ==========================================
  test("Super Admin: Can view all staff and managers across all departments with summary metrics", async () => {
    const res = await apiRequest("/users/staff?includeManagers=true", { token: superAdminToken });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data));

    // Must see staff from multiple departments
    const returnedStaffIds = res.data.data.map((s) => s.id);
    assert.ok(returnedStaffIds.includes(kitchenStaffUser._id.toString()), "Super Admin must see Kitchen staff");
    assert.ok(returnedStaffIds.includes(decoStaffUser._id.toString()), "Super Admin must see Decoration staff");
    assert.ok(returnedStaffIds.includes(decoManagerUser._id.toString()), "Super Admin must see Deco Manager");
    assert.ok(returnedStaffIds.includes(chefManagerUser._id.toString()), "Super Admin must see Chef Manager");

    // Summary metrics check
    assert.ok(res.data.summary, "Super Admin response must include summary");
    assert.ok(typeof res.data.summary.totalManagers === "number");
    assert.ok(typeof res.data.summary.totalStaff === "number");
    assert.ok(typeof res.data.summary.activeEmployees === "number");
    assert.ok(typeof res.data.summary.departmentCounts === "object");
  });

  test("Super Admin: Can filter by department and by role", async () => {
    // Filter role=manager
    const resManagers = await apiRequest("/users/staff?role=manager&includeManagers=true", { token: superAdminToken });
    assert.equal(resManagers.status, 200);
    const roles = resManagers.data.data.map((s) => s.role);
    assert.ok(roles.every((r) => r === "manager" || r === "admin"), "Should only return managers");

    // Filter department=Kitchen
    const resKitchen = await apiRequest("/users/staff?department=Kitchen&includeManagers=true", { token: superAdminToken });
    assert.equal(resKitchen.status, 200);
    const depts = resKitchen.data.data.map((s) => s.department);
    assert.ok(depts.every((d) => d === "Kitchen"), "Should only return Kitchen members");
  });

  // ==========================================
  // 2. DEPARTMENT MANAGER (DECORATION) PERMISSIONS
  // ==========================================
  test("Decoration Manager: Can only see staff in Decoration department", async () => {
    const res = await apiRequest("/users/staff", { token: decoManagerToken });
    assert.equal(res.status, 200);

    const returnedStaff = res.data.data;
    const returnedStaffIds = returnedStaff.map((s) => s.id);

    assert.ok(returnedStaffIds.includes(decoStaffUser._id.toString()), "Deco Manager must see Decoration staff");
    assert.ok(!returnedStaffIds.includes(kitchenStaffUser._id.toString()), "Deco Manager MUST NOT see Kitchen staff");

    // All returned staff must belong to Decoration
    assert.ok(returnedStaff.every((s) => s.department === "Decoration"));
  });

  test("Decoration Manager: Cannot view Kitchen staff profile by ID (403 Forbidden)", async () => {
    const res = await apiRequest(`/users/staff/${kitchenStaffUser._id}`, { token: decoManagerToken });
    assert.equal(res.status, 403, "Must return 403 Forbidden for cross-department staff profile lookup");
  });

  test("Decoration Manager: Cannot update Kitchen staff (403 Forbidden)", async () => {
    const res = await apiRequest(`/users/staff/${kitchenStaffUser._id}`, {
      method: "PUT",
      token: decoManagerToken,
      body: { name: "Hacked Name" },
    });
    assert.equal(res.status, 403, "Must return 403 Forbidden when trying to update cross-department staff");
  });

  test("Decoration Manager: Cannot reassign staff to Kitchen department (403 Forbidden)", async () => {
    const res = await apiRequest(`/users/staff/${decoStaffUser._id}`, {
      method: "PUT",
      token: decoManagerToken,
      body: { department: "Kitchen" },
    });
    assert.equal(res.status, 403, "Must return 403 Forbidden when manager attempts department reassignment");
  });

  // ==========================================
  // 3. CHEF MANAGER (KITCHEN) PERMISSIONS
  // ==========================================
  test("Chef Manager: Can only see Kitchen department employees", async () => {
    const res = await apiRequest("/users/staff", { token: chefManagerToken });
    assert.equal(res.status, 200);

    const returnedStaff = res.data.data;
    const returnedStaffIds = returnedStaff.map((s) => s.id);

    assert.ok(returnedStaffIds.includes(kitchenStaffUser._id.toString()), "Chef Manager must see Kitchen staff");
    assert.ok(!returnedStaffIds.includes(decoStaffUser._id.toString()), "Chef Manager MUST NOT see Decoration staff");

    assert.ok(returnedStaff.every((s) => s.department === "Kitchen"));
  });

  test("Chef Manager: Financial compensation (salary, hourlyRate) is masked/undefined", async () => {
    const res = await apiRequest(`/users/staff/${kitchenStaffUser._id}`, { token: chefManagerToken });
    assert.equal(res.status, 200);

    const staffData = res.data.data;
    assert.equal(staffData.salary, undefined, "Chef Manager must not receive salary field");
    assert.equal(staffData.hourlyRate, undefined, "Chef Manager must not receive hourlyRate field");
  });

  test("Chef Manager: Cannot view Decoration staff profile by ID (403 Forbidden)", async () => {
    const res = await apiRequest(`/users/staff/${decoStaffUser._id}`, { token: chefManagerToken });
    assert.equal(res.status, 403, "Must return 403 Forbidden when Chef Manager accesses non-kitchen staff");
  });

  test("Chef Manager: Cannot create staff in Decoration department (403 Forbidden)", async () => {
    const ts = Date.now();
    const res = await apiRequest("/users/staff", {
      method: "POST",
      token: chefManagerToken,
      body: {
        name: "Test Cross Dept",
        username: `crossdept_${ts}`,
        email: `crossdept_${ts}@test.com`,
        password: "Password123!",
        role: "staff",
        department: "Decoration",
      },
    });
    assert.equal(res.status, 403, "Must return 403 Forbidden when Chef Manager attempts non-kitchen staff creation");
  });

  // ==========================================
  // 4. ASSIGNMENT & DUTY CROSS-DEPARTMENT SCOPING
  // ==========================================
  test("Assignments: Chef Manager cannot view duties from other departments", async () => {
    const dummyEventId = new mongoose.Types.ObjectId();
    // Create a duty for decoration
    const decoDuty = await Duty.create({
      dutyTitle: "Stage Flower Setup",
      department: "Decoration",
      event: dummyEventId,
      assignedBy: decoManagerUser._id,
      dutyDate: new Date(),
      startTime: "10:00",
      endTime: "14:00",
      totalHours: 4,
      hourlyRate: 150,
      totalAmount: 600,
      staff: decoStaffUser._id,
      status: "ASSIGNED",
    });
    createdDutyIds.push(decoDuty._id);

    // Chef Manager attempts to fetch it directly
    const res = await apiRequest(`/assignments/${decoDuty._id}`, { token: chefManagerToken });
    assert.equal(res.status, 403, "Must return 403 Forbidden when Chef Manager queries decoration duty");
  });
});
