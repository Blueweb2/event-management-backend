const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dns = require("dns");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

if (process.env.MONGO_DNS_SERVERS) {
  const dnsServers = process.env.MONGO_DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) {
    try {
      dns.setServers(dnsServers);
    } catch (e) {}
  }
}

const notificationUtil = require("../src/utils/notification.util");
const {
  escapeHtml,
  sendStockHoldNotificationToManager,
  sendStockReturnNotificationToManager,
  setResendClientForTesting,
} = notificationUtil;

const StockItem = require("../src/models/stockItem.model");
const EventStock = require("../src/models/eventStock.model");
const StockMovement = require("../src/models/stockMovement.model");
const User = require("../src/models/user.model");
const stockService = require("../src/services/stock.service");

test.describe("Resend Stock Email Notifications & Resilience Test Suite", () => {
  let testManager;
  let testStaff;
  let testStockItem;

  test.before(async () => {
    // Strictly require a valid test database URI
    const mongoUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    assert.ok(mongoUri, "Database URI must be defined for running tests");

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });

    const ts = Date.now();
    testManager = await User.create({
      name: "Warehouse Manager",
      username: `wm_mgr_${ts}`,
      email: `manager-${ts}@example.com`,
      password: "Password123!",
      phone: "9876543210",
      role: "manager",
    });

    testStaff = await User.create({
      name: "Field Technician <script>alert(1)</script>",
      username: `tech_${ts}`,
      email: `tech-${ts}@example.com`,
      password: "Password123!",
      phone: "9876543211",
      role: "staff",
    });

    testStockItem = await StockItem.create({
      name: 'Stage Spotlight & "Strobe" <FX>',
      category: "Lighting",
      sku: `SKU-FX-${ts}`,
      totalQuantity: 20,
      availableQuantity: 20,
      reservedQuantity: 0,
      inUseQuantity: 0,
      damagedQuantity: 0,
      lostQuantity: 0,
      unit: "units",
      status: "AVAILABLE",
    });
  });

  test.after(async () => {
    // Reset test client
    setResendClientForTesting(null);
    if (testStockItem?._id) await StockItem.findByIdAndDelete(testStockItem._id);
    if (testManager?._id) await User.findByIdAndDelete(testManager._id);
    if (testStaff?._id) await User.findByIdAndDelete(testStaff._id);
    await mongoose.disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. HTML Escaping Utility Tests
  // --------------------------------------------------------------------------
  test.it("HTML escaping helper correctly sanitizes HTML special characters", () => {
    assert.strictEqual(
      escapeHtml('<script>alert("XSS & Injection")</script>'),
      "&lt;script&gt;alert(&quot;XSS &amp; Injection&quot;)&lt;/script&gt;"
    );
    assert.strictEqual(escapeHtml("John's Stage & Sound"), "John&#039;s Stage &amp; Sound");
    assert.strictEqual(escapeHtml(null), "");
    assert.strictEqual(escapeHtml(undefined), "");
    assert.strictEqual(escapeHtml(123), "123");
  });

  // --------------------------------------------------------------------------
  // 2. Missing Configuration Handling
  // --------------------------------------------------------------------------
  test.it("Stock notifications return SKIPPED_NOT_CONFIGURED when RESEND_API_KEY is not set", async () => {
    const origKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    setResendClientForTesting(null);

    try {
      const holdResult = await sendStockHoldNotificationToManager({
        staff: testStaff,
        stockItem: testStockItem,
        quantity: 3,
        notes: "Needed for concert setup",
      });

      assert.strictEqual(holdResult.success, false);
      assert.strictEqual(holdResult.status, "SKIPPED_NOT_CONFIGURED");
      assert.ok(holdResult.reason.includes("RESEND_API_KEY is not configured"));

      const returnResult = await sendStockReturnNotificationToManager({
        staff: testStaff,
        stockItem: testStockItem,
        returnedQuantity: 3,
        notes: "All packed nicely",
      });

      assert.strictEqual(returnResult.success, false);
      assert.strictEqual(returnResult.status, "SKIPPED_NOT_CONFIGURED");
    } finally {
      if (origKey) process.env.RESEND_API_KEY = origKey;
    }
  });

  // --------------------------------------------------------------------------
  // 3. Successful Provider Dispatch (Mocked SDK)
  // --------------------------------------------------------------------------
  test.it("Stock hold notification dispatches successfully with mocked Resend client and escapes content", async () => {
    let capturedPayload = null;

    const mockResend = {
      emails: {
        send: async (payload) => {
          capturedPayload = payload;
          return { data: { id: "resend_msg_hold_999" }, error: null };
        },
      },
    };

    setResendClientForTesting(mockResend);

    const result = await sendStockHoldNotificationToManager({
      staff: testStaff,
      stockItem: testStockItem,
      quantity: 5,
      notes: 'Need urgently for "Main Stage" & <Live> broadcast',
      expectedDate: new Date("2026-12-01"),
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, "SENT_ACCEPTED");
    assert.strictEqual(result.messageId, "resend_msg_hold_999");
    assert.ok(capturedPayload, "Resend send payload must be generated");

    // Verify HTML escaping of dynamic strings
    assert.ok(capturedPayload.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(capturedPayload.html.includes("Stage Spotlight &amp; &quot;Strobe&quot; &lt;FX&gt;"));
    assert.ok(capturedPayload.html.includes("Need urgently for &quot;Main Stage&quot; &amp; &lt;Live&gt; broadcast"));
    // Verify plain text alternative exists
    assert.ok(capturedPayload.text.includes("Quantity Reserved: 5 units"));
    assert.ok(capturedPayload.text.includes("Expected Date:"));
  });

  test.it("Stock return notification dispatches successfully with condition breakdown", async () => {
    let capturedPayload = null;

    const mockResend = {
      emails: {
        send: async (payload) => {
          capturedPayload = payload;
          return { data: { id: "resend_msg_return_888" }, error: null };
        },
      },
    };

    setResendClientForTesting(mockResend);

    const result = await sendStockReturnNotificationToManager({
      staff: testStaff,
      stockItem: testStockItem,
      returnedQuantity: 4,
      damagedQuantity: 1,
      lostQuantity: 0,
      notes: "1 bulb cracked during transit",
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, "SENT_ACCEPTED");
    assert.strictEqual(result.messageId, "resend_msg_return_888");

    // Verify condition breakdown in HTML & text
    assert.ok(capturedPayload.html.includes("Good Condition"));
    assert.ok(capturedPayload.html.includes("4 units"));
    assert.ok(capturedPayload.html.includes("Damaged"));
    assert.ok(capturedPayload.html.includes("1 units"));
    assert.ok(capturedPayload.text.includes("- Good Condition (Restocked): 4 units"));
    assert.ok(capturedPayload.text.includes("- ⚠️ Damaged: 1 units"));
  });

  // --------------------------------------------------------------------------
  // 4. Provider Error & Exception Handling
  // --------------------------------------------------------------------------
  test.it("Handles provider API rejection gracefully without throwing", async () => {
    const mockResend = {
      emails: {
        send: async () => {
          return { data: null, error: { message: "Invalid API key or unauthorized domain" } };
        },
      },
    };

    setResendClientForTesting(mockResend);

    const result = await sendStockHoldNotificationToManager({
      staff: testStaff,
      stockItem: testStockItem,
      quantity: 2,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, "FAILED");
    assert.strictEqual(result.error, "Invalid API key or unauthorized domain");
  });

  test.it("Handles provider network exceptions gracefully without throwing", async () => {
    const mockResend = {
      emails: {
        send: async () => {
          throw new Error("Resend server connection timeout (ECONNRESET)");
        },
      },
    };

    setResendClientForTesting(mockResend);

    const result = await sendStockReturnNotificationToManager({
      staff: testStaff,
      stockItem: testStockItem,
      returnedQuantity: 2,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, "FAILED");
    assert.ok(result.error.includes("timeout"));
  });

  // --------------------------------------------------------------------------
  // 5. Transaction Safety: Email Failure Does NOT Revert Stock Changes
  // --------------------------------------------------------------------------
  test.it("Stock hold operation commits database updates even if email provider throws an error", async () => {
    // Configure mock to throw an unhandled error
    const mockResend = {
      emails: {
        send: async () => {
          throw new Error("Fatal network partition in email provider");
        },
      },
    };

    setResendClientForTesting(mockResend);

    const initialAvailable = testStockItem.availableQuantity;
    const holdQty = 4;

    // Execute holdStock service call
    const holdResult = await stockService.holdStock(
      {
        stockItemId: testStockItem._id,
        quantity: holdQty,
        notes: "Hold during provider outage",
        expectedReturnAt: new Date(Date.now() + 86400000),
      },
      { userId: testStaff._id, role: "staff", name: testStaff.name }
    );

    assert.ok(holdResult.allocation, "Allocation must be created");
    assert.strictEqual(holdResult.allocation.status, "READY_FOR_COLLECTION");
    assert.strictEqual(holdResult.allocation.reservedQuantity, holdQty);

    // Verify stock item inventory was atomically updated in the database
    const reloadedItem = await StockItem.findById(testStockItem._id);
    assert.strictEqual(
      reloadedItem.availableQuantity,
      initialAvailable - holdQty,
      "Available quantity must be decremented despite email failure"
    );
    assert.strictEqual(
      reloadedItem.reservedQuantity,
      holdQty,
      "Reserved quantity must be incremented despite email failure"
    );

    // Clean up allocation
    await stockService.releaseStockHold(holdResult.allocation._id, {
      userId: testStaff._id,
      role: "staff",
    });
  });
});
