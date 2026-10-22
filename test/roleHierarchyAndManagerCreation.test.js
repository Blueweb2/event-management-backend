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
const { generateToken } = require("../src/utils/jwt");

test.describe("RBAC Role Hierarchy & Manager Creation Test Suite", () => {
  let server;
  let baseUrl;

  let testSuperAdmin;
  let testManager;
  let testLegacyAdmin;
  let testStaff;

  let superAdminToken;
  let managerToken;
  let legacyAdminToken;
  let staffToken;

  const createdUserIds = [];

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
    const hashedPassword = await bcrypt.hash("Password123!", 12);

    // 1. Create Superadmin
    testSuperAdmin = await User.create({
      name: "Root Superadmin",
      username: `super_${ts}`,
      email: `super_${ts}@example.com`,
      password: hashedPassword,
      role: "superadmin",
      isActive: true,
    });
    createdUserIds.push(testSuperAdmin._id);
    superAdminToken = generateToken(testSuperAdmin);

    // 2. Create Manager
    testManager = await User.create({
      name: "Operations Manager",
      username: `mgr_${ts}`,
      email: `mgr_${ts}@example.com`,
      password: hashedPassword,
      role: "manager",
      isActive: true,
    });
    createdUserIds.push(testManager._id);
    managerToken = generateToken(testManager);

    // 3. Create Legacy Admin
    testLegacyAdmin = await User.create({
      name: "Legacy Admin User",
      username: `legadmin_${ts}`,
      email: `legadmin_${ts}@example.com`,
      password: hashedPassword,
      role: "admin",
      isActive: true,
    });
    createdUserIds.push(testLegacyAdmin._id);
    legacyAdminToken = generateToken(testLegacyAdmin);

    // 4. Create Staff
    testStaff = await User.create({
      name: "Standard Staff",
      username: `staff_${ts}`,
      email: `staff_${ts}@example.com`,
      password: hashedPassword,
      role: "staff",
      isActive: true,
    });
    createdUserIds.push(testStaff._id);
    staffToken = generateToken(testStaff);
  });

  test.after(async () => {
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  });

  // ========================================================
  // 1. MANAGER CREATION BY SUPERADMIN (SUCCESS)
  // ========================================================
  test("1. Superadmin can successfully create a new manager account", async () => {
    const ts = Date.now();
    const payload = {
      name: "Sarah Operations",
      username: `sarah_mgr_${ts}`,
      email: `sarah_${ts}@eventmanagement.com`,
      password: "StrongPassword123!",
      phone: "+91 98765 11111",
      location: "Bangalore",
      department: "Event Production",
    };

    const res = await fetch(`${baseUrl}/auth/managers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(body)}`);
    assert.equal(body.success, true);
    assert.equal(body.data.name, payload.name);
    assert.equal(body.data.username, payload.username.toLowerCase());
    assert.equal(body.data.email, payload.email.toLowerCase());
    assert.equal(body.data.role, "manager", "Backend must enforce role: manager");
    assert.equal(body.data.password, undefined, "Password must not be returned");
    assert.equal(body.data.passwordHash, undefined, "Password hash must not be returned");

    createdUserIds.push(body.data.id);

    // Verify in database
    const dbUser = await User.findById(body.data.id).select("+password");
    assert.ok(dbUser);
    assert.equal(dbUser.role, "manager");
    const isPasswordValid = await bcrypt.compare(payload.password, dbUser.password);
    assert.equal(isPasswordValid, true, "Stored password must be securely bcrypt hashed");
  });

  // ========================================================
  // 2. PRIVILEGE ENFORCEMENT ON MANAGER CREATION (403 & 401)
  // ========================================================
  test("2. Manager receives HTTP 403 when attempting to create a manager", async () => {
    const res = await fetch(`${baseUrl}/auth/managers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        name: "Unauthorized Manager",
        username: `unauth_mgr_${Date.now()}`,
        email: `unauth_mgr_${Date.now()}@example.com`,
        password: "Password123!",
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 403, "Manager must be rejected with 403");
    assert.equal(body.success, false);
  });

  test("3. Staff receives HTTP 403 when attempting to create a manager", async () => {
    const res = await fetch(`${baseUrl}/auth/managers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "Unauthorized Staff",
        username: `unauth_staff_${Date.now()}`,
        email: `unauth_staff_${Date.now()}@example.com`,
        password: "Password123!",
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 403, "Staff must be rejected with 403");
    assert.equal(body.success, false);
  });

  test("4. Legacy Admin receives HTTP 403 when attempting to create a manager (no silent privilege elevation)", async () => {
    const res = await fetch(`${baseUrl}/auth/managers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${legacyAdminToken}`,
      },
      body: JSON.stringify({
        name: "Legacy Admin Attempt",
        username: `leg_attempt_${Date.now()}`,
        email: `leg_attempt_${Date.now()}@example.com`,
        password: "Password123!",
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 403, "Legacy admin must not have superadmin manager creation privilege");
    assert.equal(body.success, false);
  });

  test("5. Unauthenticated request to create manager receives HTTP 401", async () => {
    const res = await fetch(`${baseUrl}/auth/managers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "No Auth",
        username: "noauth",
        email: "noauth@example.com",
        password: "Password123!",
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 401, "Unauthenticated request must return 401");
    assert.equal(body.success, false);
  });

  // ========================================================
  // 6. MANAGERS DIRECTORY LISTING
  // ========================================================
  test("6. Superadmin can list managers, while manager and staff receive HTTP 403", async () => {
    // Superadmin listing
    const resSuper = await fetch(`${baseUrl}/auth/managers`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const bodySuper = await resSuper.json();
    assert.equal(resSuper.status, 200);
    assert.ok(Array.isArray(bodySuper.data));
    assert.ok(bodySuper.data.length >= 1);

    // Manager listing attempt -> 403
    const resMgr = await fetch(`${baseUrl}/auth/managers`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(resMgr.status, 403);

    // Staff listing attempt -> 403
    const resStaff = await fetch(`${baseUrl}/auth/managers`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(resStaff.status, 403);
  });

  // ========================================================
  // 7. PUBLIC REGISTRATION AUDIT & PRIVILEGE ESCALATION PREVENTION
  // ========================================================
  test("7. Public registration rejecting elevated roles and enforcing staff role", async () => {
    const ts = Date.now();

    // Attempt 1: registering as superadmin -> rejected 403
    const resSuper = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Hacker Super",
        username: `hack_super_${ts}`,
        email: `hack_super_${ts}@example.com`,
        password: "Password123!",
        role: "superadmin",
      }),
    });
    assert.equal(resSuper.status, 403, "Public registration as superadmin must be rejected with 403");

    // Attempt 2: registering as admin -> rejected 403
    const resAdmin = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Hacker Admin",
        username: `hack_admin_${ts}`,
        email: `hack_admin_${ts}@example.com`,
        password: "Password123!",
        role: "admin",
      }),
    });
    assert.equal(resAdmin.status, 403, "Public registration as admin must be rejected with 403");

    // Attempt 3: registering as manager -> rejected 403
    const resMgr = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Hacker Manager",
        username: `hack_mgr_${ts}`,
        email: `hack_mgr_${ts}@example.com`,
        password: "Password123!",
        role: "manager",
      }),
    });
    assert.equal(resMgr.status, 403, "Public registration as manager must be rejected with 403");

    // Attempt 4: valid staff public registration -> allowed, role is strictly staff
    const resStaff = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Legit Staff",
        username: `legit_staff_${ts}`,
        email: `legit_staff_${ts}@example.com`,
        password: "Password123!",
      }),
    });
    const bodyStaff = await resStaff.json();
    assert.equal(resStaff.status, 201);
    assert.equal(bodyStaff.data.user.role, "staff");
    createdUserIds.push(bodyStaff.data.user.id);
  });

  // ========================================================
  // 8. ONE-TIME SUPERADMIN BOOTSTRAP INTEGRITY
  // ========================================================
  test("8. Bootstrap superadmin endpoint is locked when superadmin already exists", async () => {
    const res = await fetch(`${baseUrl}/auth/bootstrap-superadmin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Second Superadmin",
        username: `second_super_${Date.now()}`,
        email: `second_super_${Date.now()}@example.com`,
        password: "Password123!",
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 403, "Bootstrap must be permanently disabled once a superadmin exists");
    assert.equal(body.success, false);
    assert.match(body.message, /already exists/i);
  });

  // ========================================================
  // 9. INPUT VALIDATION & CONFLICT CHECKS
  // ========================================================
  test("9. Manager creation enforces unique email, username and validates fields", async () => {
    // Duplicate email
    const resDupEmail = await fetch(`${baseUrl}/auth/managers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        name: "Duplicate Email Test",
        username: `unique_user_${Date.now()}`,
        email: testManager.email, // already exists
        password: "Password123!",
      }),
    });
    assert.equal(resDupEmail.status, 409, "Duplicate email must return 409 Conflict");

    // Duplicate username
    const resDupUsername = await fetch(`${baseUrl}/auth/managers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        name: "Duplicate Username Test",
        username: testManager.username, // already exists
        email: `unique_email_${Date.now()}@example.com`,
        password: "Password123!",
      }),
    });
    assert.equal(resDupUsername.status, 409, "Duplicate username must return 409 Conflict");

    // Missing required fields
    const resMissing = await fetch(`${baseUrl}/auth/managers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        name: "",
        username: "bad",
        email: "notanemail",
        password: "123", // too short
      }),
    });
    assert.equal(resMissing.status, 400, "Invalid fields must return 400 Bad Request");
  });

  // ========================================================
  // 10. LOGIN & ROLE-BASED ACCESS
  // ========================================================
  test("10. Login endpoint returns correct roles for all tiers", async () => {
    // Superadmin login
    const resSuper = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: testSuperAdmin.email,
        password: "Password123!",
      }),
    });
    const bodySuper = await resSuper.json();
    assert.equal(resSuper.status, 200);
    assert.equal(bodySuper.data.user.role, "superadmin");

    // Manager login
    const resMgr = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: testManager.email,
        password: "Password123!",
      }),
    });
    const bodyMgr = await resMgr.json();
    assert.equal(resMgr.status, 200);
    assert.equal(bodyMgr.data.user.role, "manager");

    // Staff login
    const resStaff = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: testStaff.email,
        password: "Password123!",
      }),
    });
    const bodyStaff = await resStaff.json();
    assert.equal(resStaff.status, 200);
    assert.equal(bodyStaff.data.user.role, "staff");
  });

  // ========================================================
  // 11. LEGACY ADMIN OPERATIONAL ACCESS & STAFF CREATION
  // ========================================================
  test("11. Manager and Legacy Admin can manage staff, while Staff cannot create staff", async () => {
    const ts = Date.now();

    // Manager creating staff -> succeeds
    const resMgrCreateStaff = await fetch(`${baseUrl}/users/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        name: "Subordinate Staff",
        username: `sub_staff_${ts}`,
        email: `sub_staff_${ts}@example.com`,
        password: "Password123!",
        role: "Event Staff",
        department: "Event Production",
      }),
    });
    const bodyMgrStaff = await resMgrCreateStaff.json();
    assert.equal(resMgrCreateStaff.status, 201);
    const createdStaff = bodyMgrStaff.data.staff || bodyMgrStaff.data;
    assert.equal(createdStaff.role, "staff");
    createdUserIds.push(createdStaff.id || createdStaff._id);

    // Legacy Admin creating staff -> succeeds (preserves legacy admin operational capability)
    const resLegAdminCreateStaff = await fetch(`${baseUrl}/users/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${legacyAdminToken}`,
      },
      body: JSON.stringify({
        name: "Admin Staff Member",
        username: `adm_staff_${ts}`,
        email: `adm_staff_${ts}@example.com`,
        password: "Password123!",
        role: "Catering Staff",
        department: "Catering",
      }),
    });
    const bodyLegStaff = await resLegAdminCreateStaff.json();
    assert.equal(resLegAdminCreateStaff.status, 201);
    const createdLegStaff = bodyLegStaff.data.staff || bodyLegStaff.data;
    createdUserIds.push(createdLegStaff.id || createdLegStaff._id);

    // Staff attempting to create staff -> receives 403
    const resStaffCreateStaff = await fetch(`${baseUrl}/users/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "Forbidden Staff",
        username: `forbidden_${ts}`,
        email: `forbidden_${ts}@example.com`,
        password: "Password123!",
      }),
    });
    assert.equal(resStaffCreateStaff.status, 403, "Staff cannot create other staff members");
  });

  // ========================================================
  // 12. DEPARTMENT SCOPING & ROLE ESCALATION PREVENTION
  // ========================================================
  test("12. Scoped Manager cannot create staff outside their department or elevate roles", async () => {
    const ts = Date.now();
    const hashedPassword = await bcrypt.hash("Password123!", 12);

    // Create a Decoration Department Manager
    const decorManager = await User.create({
      name: "Decor Manager",
      username: `decormgr_${ts}`,
      email: `decormgr_${ts}@example.com`,
      password: hashedPassword,
      role: "manager",
      department: "Decoration",
      isActive: true,
    });
    createdUserIds.push(decorManager._id);
    const decorManagerToken = generateToken(decorManager);

    // 1. Attempt to create staff with role: "manager" -> 403
    const resElevate = await fetch(`${baseUrl}/users/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${decorManagerToken}`,
      },
      body: JSON.stringify({
        name: "Escalated User",
        username: `esc_${ts}`,
        email: `esc_${ts}@example.com`,
        password: "Password123!",
        role: "manager",
        department: "Decoration",
      }),
    });
    assert.equal(resElevate.status, 403, "Manager cannot create another manager");

    // 2. Attempt to create staff outside authorized department (Kitchen instead of Decoration) -> 403
    const resWrongDept = await fetch(`${baseUrl}/users/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${decorManagerToken}`,
      },
      body: JSON.stringify({
        name: "Kitchen Infiltration",
        username: `kitch_inf_${ts}`,
        email: `kitch_inf_${ts}@example.com`,
        password: "Password123!",
        department: "Kitchen",
      }),
    });
    assert.equal(resWrongDept.status, 403, "Manager cannot create staff outside their authorized department");

    // 3. Valid creation within Decoration scope -> 201
    const resValid = await fetch(`${baseUrl}/users/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${decorManagerToken}`,
      },
      body: JSON.stringify({
        name: "Decor Crew",
        username: `decorcrew_${ts}`,
        email: `decorcrew_${ts}@example.com`,
        password: "Password123!",
        department: "Decoration",
      }),
    });
    const bodyValid = await resValid.json();
    assert.equal(resValid.status, 201);
    const newStaff = bodyValid.data.staff || bodyValid.data;
    assert.equal(newStaff.department, "Decoration");
    assert.equal(newStaff.role, "staff");
    createdUserIds.push(newStaff.id || newStaff._id);

    // 4. Attempt to update staff to manager -> 403
    const resUpdateElevate = await fetch(`${baseUrl}/users/staff/${newStaff.id || newStaff._id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${decorManagerToken}`,
      },
      body: JSON.stringify({
        role: "manager",
      }),
    });
    assert.equal(resUpdateElevate.status, 403, "Manager cannot promote staff to manager via update");
  });

  // ========================================================
  // 13. SUPERADMIN PERMISSION AND DEPARTMENT EDITING
  // ========================================================
  test("13. Superadmin can edit manager permissions and department assignments, non-superadmin is blocked", async () => {
    // Superadmin updates manager department and permissions
    const resEdit = await fetch(`${baseUrl}/auth/managers/${testManager._id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        department: "Photography",
        permissions: ["photography:view_events", "photography:manage_shoot_tasks"],
        location: "South Studio",
      }),
    });

    const bodyEdit = await resEdit.json();
    assert.equal(resEdit.status, 200);
    assert.equal(bodyEdit.data.department, "Photography");
    assert.deepEqual(bodyEdit.data.permissions, ["photography:view_events", "photography:manage_shoot_tasks"]);

    // Manager attempting to edit manager -> 403
    const resMgrAttempt = await fetch(`${baseUrl}/auth/managers/${testManager._id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        department: "Operations",
      }),
    });
    assert.equal(resMgrAttempt.status, 403, "Non-superadmin cannot edit manager configuration");
  });

  // ========================================================
  // 14. SUSPENSION AND AUTHENTICATION ENFORCEMENT
  // ========================================================
  test("14. Suspended accounts are immediately blocked from logging in", async () => {
    const ts = Date.now();
    const hashedPassword = await bcrypt.hash("Password123!", 12);

    const suspendedUser = await User.create({
      name: "Suspended Manager",
      username: `susp_mgr_${ts}`,
      email: `susp_mgr_${ts}@example.com`,
      password: hashedPassword,
      role: "manager",
      department: "Catering",
      isActive: true,
    });
    createdUserIds.push(suspendedUser._id);

    // 1. Initial login succeeds
    const resLogin1 = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: suspendedUser.email,
        password: "Password123!",
      }),
    });
    assert.equal(resLogin1.status, 200);

    // 2. Superadmin suspends the account
    const resStatus = await fetch(`${baseUrl}/auth/managers/${suspendedUser._id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(resStatus.status, 200);

    // 3. Login attempt now fails with 403 Forbidden
    const resLogin2 = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: suspendedUser.email,
        password: "Password123!",
      }),
    });
    assert.equal(resLogin2.status, 403, "Suspended account must be blocked from logging in");

    // 4. Reactivation restores login capability
    await fetch(`${baseUrl}/auth/managers/${suspendedUser._id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ isActive: true }),
    });

    const resLogin3 = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: suspendedUser.email,
        password: "Password123!",
      }),
    });
    assert.equal(resLogin3.status, 200, "Reactivated account can log in normally");
  });
});

