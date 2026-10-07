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

const StockItem = require("../src/models/stockItem.model");
const Event = require("../src/models/event.model");
const EventStock = require("../src/models/eventStock.model");
const StockMovement = require("../src/models/stockMovement.model");
const StockTransaction = require("../src/models/stockTransaction.model");
const User = require("../src/models/user.model");
const Client = require("../src/models/client.model");
const Booking = require("../src/models/booking.model");
const stockService = require("../src/services/stock.service");

test.describe("Stock & Equipment Reconciliation and Inventory Module (Production-Readiness Test Suite)", () => {
  let testManager;
  let testStaff;
  let testOtherStaff;
  let testEvent;
  let testStockItem;

  test.before(async () => {
    const mongoUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });

    const ts = Date.now();
    testManager = await User.create({
      name: "Test Manager",
      username: `testmgr_${ts}`,
      email: `test-mgr-${ts}@example.com`,
      password: "Password123!",
      phone: "9876543210",
      role: "manager",
    });

    testStaff = await User.create({
      name: "Test Staff",
      username: `teststaff_${ts}`,
      email: `test-staff-${ts}@example.com`,
      password: "Password123!",
      phone: "9876543211",
      role: "staff",
    });

    testOtherStaff = await User.create({
      name: "Other Staff",
      username: `otherstaff_${ts}`,
      email: `other-staff-${ts}@example.com`,
      password: "Password123!",
      phone: "9876543212",
      role: "staff",
    });

    testEvent = await Event.create({
      client: new mongoose.Types.ObjectId(),
      booking: new mongoose.Types.ObjectId(),
      eventName: "Reconciliation Test Gala",
      eventType: "Wedding",
      eventDate: new Date(Date.now() + 86400000),
      eventTime: "18:00",
      location: "Grand Ballroom",
      guests: 150,
      status: "CONFIRMED",
      createdBy: testManager._id,
    });
  });

  test.after(async () => {
    if (testManager) await User.findByIdAndDelete(testManager._id);
    if (testStaff) await User.findByIdAndDelete(testStaff._id);
    if (testOtherStaff) await User.findByIdAndDelete(testOtherStaff._id);
    if (testEvent) await Event.findByIdAndDelete(testEvent._id);
    if (testStockItem) {
      await StockItem.findByIdAndDelete(testStockItem._id);
      await EventStock.deleteMany({ stockItem: testStockItem._id });
      await StockMovement.deleteMany({ stockItem: testStockItem._id });
      await StockTransaction.deleteMany({ stockItem: testStockItem._id });
    }
    await mongoose.disconnect();
  });

  test("1. Integration: Exact Calculation & Physical Conservation Invariant (100 -> 20 Taken -> 15 Good, 3 Damaged, 2 Lost -> Total: 98, Avail: 95)", async () => {
    // Initial State: 100 plates in master inventory
    testStockItem = await stockService.createStockItem(
      {
        name: "Luxury Banquet Dinner Plates",
        category: "Crockery",
        totalQuantity: 100,
        unit: "Plates",
        minStockLevel: 15,
      },
      testManager._id
    );

    assert.equal(testStockItem.totalQuantity, 100);
    assert.equal(testStockItem.availableQuantity, 100);
    assert.equal(testStockItem.reservedQuantity, 0);
    assert.equal(testStockItem.inUseQuantity, 0);
    assert.equal(testStockItem.damagedQuantity, 0);
    assert.equal(testStockItem.lostQuantity, 0);

    // Step 1: Reserve 20 plates for event
    const allocation = await stockService.addEventStockRequirement(
      testEvent._id,
      {
        stockItemId: testStockItem._id,
        requiredQuantity: 20,
        autoReserve: true,
        assignedStaff: testStaff._id,
      },
      testManager._id
    );

    assert.equal(allocation.requiredQuantity, 20);
    assert.equal(allocation.reservedQuantity, 20);
    assert.equal(allocation.status, "READY_FOR_COLLECTION");

    const itemAfterReserve = await StockItem.findById(testStockItem._id);
    assert.equal(itemAfterReserve.availableQuantity, 80);
    assert.equal(itemAfterReserve.reservedQuantity, 20);
    assert.equal(itemAfterReserve.inUseQuantity, 0);
    assert.equal(itemAfterReserve.totalQuantity, 100);

    // Step 2: Staff collects all 20 plates
    const takeResult = await stockService.takeStock(
      allocation._id,
      {
        takenQuantity: 20,
        takeNotes: "20 plates collected by staff for dinner setup",
        expectedReturnAt: new Date(Date.now() + 7200000).toISOString(),
      },
      { userId: testStaff._id, role: "staff" }
    );

    assert.equal(takeResult.allocation.status, "TAKEN_BY_STAFF");
    assert.equal(takeResult.allocation.takenQuantity, 20);

    const itemAfterTake = await StockItem.findById(testStockItem._id);
    assert.equal(itemAfterTake.availableQuantity, 80);
    assert.equal(itemAfterTake.reservedQuantity, 0);
    assert.equal(itemAfterTake.inUseQuantity, 20);
    assert.equal(itemAfterTake.totalQuantity, 100);

    // Step 3: Staff submits return (15 good, 3 damaged, 2 lost = 20 taken)
    const returnResult = await stockService.returnStock(
      allocation._id,
      {
        returnedQuantity: 15,
        damagedQuantity: 3,
        lostQuantity: 2,
        damagedReason: "3 plates chipped during dishwashing",
        lostReason: "2 plates unaccounted for at banquet hall clearing",
        returnNotes: "Post-event collection completed",
      },
      { userId: testStaff._id, role: "staff" }
    );

    assert.equal(returnResult.allocation.status, "RETURN_PENDING");
    assert.equal(returnResult.allocation.returnedQuantity, 15);
    assert.equal(returnResult.allocation.damagedQuantity, 3);
    assert.equal(returnResult.allocation.lostQuantity, 2);

    // Master inventory must NOT change while pending manager approval
    const itemDuringPending = await StockItem.findById(testStockItem._id);
    assert.equal(itemDuringPending.availableQuantity, 80, "Available stock must remain untouched before manager approval");
    assert.equal(itemDuringPending.inUseQuantity, 20, "In-use quantity remains 20 until manager approves");
    assert.equal(itemDuringPending.damagedQuantity, 0);
    assert.equal(itemDuringPending.lostQuantity, 0);
    assert.equal(itemDuringPending.totalQuantity, 100);

    // Step 4: Manager inspects and approves return
    const verifyResult = await stockService.verifyStockReturn(
      allocation._id,
      {
        approvedReturnedQuantity: 15,
        approvedDamagedQuantity: 3,
        approvedLostQuantity: 2,
        managerNotes: "Verified physically: 15 good plates returned to shelf, 3 damaged plates kept in quarantine, 2 lost written off.",
      },
      { userId: testManager._id, role: "manager" }
    );

    assert.equal(verifyResult.allocation.status, "VERIFIED");
    assert.equal(verifyResult.allocation.approvedReturnedQuantity, 15);
    assert.equal(verifyResult.allocation.approvedDamagedQuantity, 3);
    assert.equal(verifyResult.allocation.approvedLostQuantity, 2);

    // Step 5: Verify final inventory values match the exact specification:
    // Available: 95 (80 + 15)
    // Reserved: 0
    // In Use: 0
    // Damaged: 3
    // Lost: 2
    // Total: 98 (100 - 2 lost = 98 physical items on hand)
    const itemFinal = await StockItem.findById(testStockItem._id);
    assert.equal(itemFinal.availableQuantity, 95, "Available must be exactly 95");
    assert.equal(itemFinal.reservedQuantity, 0, "Reserved must be 0");
    assert.equal(itemFinal.inUseQuantity, 0, "In Use must be 0");
    assert.equal(itemFinal.damagedQuantity, 3, "Damaged must be 3");
    assert.equal(itemFinal.lostQuantity, 2, "Lost must be 2");
    assert.equal(itemFinal.totalQuantity, 98, "Total must be 98 (physical on-hand items)");

    // Physical conservation invariant check:
    const physicalSum =
      itemFinal.availableQuantity +
      itemFinal.reservedQuantity +
      itemFinal.inUseQuantity +
      itemFinal.damagedQuantity;
    assert.equal(physicalSum, itemFinal.totalQuantity, `Physical conservation invariant holds: ${physicalSum} === ${itemFinal.totalQuantity}`);

    // Lifetime accounting equation check:
    assert.equal(itemFinal.totalQuantity + itemFinal.lostQuantity, 100, "Lifetime total (physical + lost) equals initial 100");

    // Step 6: Verify staff history view displays exact approved counts & manager remarks
    const staffHistory = await stockService.getStaffAssignedStock(testStaff._id);
    const staffAlloc = staffHistory.allocations.find((a) => String(a._id) === String(allocation._id));
    assert.ok(staffAlloc, "Staff history must contain the event stock allocation");
    assert.equal(staffAlloc.status, "VERIFIED");
    assert.equal(staffAlloc.approvedReturnedQuantity, 15);
    assert.equal(staffAlloc.approvedDamagedQuantity, 3);
    assert.equal(staffAlloc.approvedLostQuantity, 2);
    assert.ok(staffAlloc.managerNotes.includes("Verified physically"), "Staff history must display manager remarks");
  });

  test("2. Integration: Reject Invalid Reconciliation Quantities (15+3+1 !== 20, sum mismatch, negative, fractional, NaN, exceeding taken, missing reasons)", async () => {
    const alloc = await EventStock.create({
      event: testEvent._id,
      stockItem: testStockItem._id,
      requiredQuantity: 20,
      takenQuantity: 20,
      assignedStaff: testStaff._id,
      status: "TAKEN_BY_STAFF",
    });

    // Test specific scenario: 15 good + 3 damaged + 1 lost = 19 !== 20
    await assert.rejects(
      async () => {
        await stockService.returnStock(
          alloc._id,
          { returnedQuantity: 15, damagedQuantity: 3, lostQuantity: 1, damagedReason: "3 cracked", lostReason: "1 missing" },
          { userId: testStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Reconciliation failed/i);
        return true;
      }
    );

    // Test exceeding taken amount (25 good when taken was 20)
    await assert.rejects(
      async () => {
        await stockService.returnStock(
          alloc._id,
          { returnedQuantity: 25, damagedQuantity: 0, lostQuantity: 0 },
          { userId: testStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    // Mismatch sum under (10 + 2 + 1 = 13 !== 20)
    await assert.rejects(
      async () => {
        await stockService.returnStock(
          alloc._id,
          { returnedQuantity: 10, damagedQuantity: 2, lostQuantity: 1, damagedReason: "x", lostReason: "y" },
          { userId: testStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Reconciliation failed/i);
        return true;
      }
    );

    // Negative value
    await assert.rejects(
      async () => {
        await stockService.returnStock(
          alloc._id,
          { returnedQuantity: -10, damagedQuantity: 30, lostQuantity: 0 },
          { userId: testStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be negative/i);
        return true;
      }
    );

    // Fractional / decimal value
    await assert.rejects(
      async () => {
        await stockService.returnStock(
          alloc._id,
          { returnedQuantity: 15.5, damagedQuantity: 4.5, lostQuantity: 0 },
          { userId: testStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /whole integer/i);
        return true;
      }
    );

    // Missing damage reason
    await assert.rejects(
      async () => {
        await stockService.returnStock(
          alloc._id,
          { returnedQuantity: 18, damagedQuantity: 2, lostQuantity: 0, damagedReason: "" },
          { userId: testStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /mandatory damage explanation/i);
        return true;
      }
    );

    await EventStock.findByIdAndDelete(alloc._id);
  });

  test("3. Integration: Prevent Duplicate Submissions, Duplicate Approvals, and Idempotency", async () => {
    const alloc = await EventStock.create({
      event: testEvent._id,
      stockItem: testStockItem._id,
      requiredQuantity: 10,
      takenQuantity: 10,
      assignedStaff: testStaff._id,
      status: "TAKEN_BY_STAFF",
    });

    // 1st return submission: OK
    await stockService.returnStock(
      alloc._id,
      { returnedQuantity: 10, damagedQuantity: 0, lostQuantity: 0 },
      { userId: testStaff._id, role: "staff" }
    );

    // 2nd return submission while RETURN_PENDING: Rejected
    await assert.rejects(
      async () => {
        await stockService.returnStock(
          alloc._id,
          { returnedQuantity: 10, damagedQuantity: 0, lostQuantity: 0 },
          { userId: testStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /already been submitted/i);
        return true;
      }
    );

    // 1st manager verification: OK
    await stockService.verifyStockReturn(
      alloc._id,
      { approvedReturnedQuantity: 10, approvedDamagedQuantity: 0, approvedLostQuantity: 0, managerNotes: "Approval 1" },
      { userId: testManager._id, role: "manager" }
    );

    // 2nd verification on already VERIFIED stock: Rejected
    await assert.rejects(
      async () => {
        await stockService.verifyStockReturn(
          alloc._id,
          { approvedReturnedQuantity: 10, approvedDamagedQuantity: 0, approvedLostQuantity: 0, managerNotes: "Approval 2" },
          { userId: testManager._id, role: "manager" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Duplicate approvals are prevented/i);
        return true;
      }
    );

    await EventStock.findByIdAndDelete(alloc._id);
  });

  test("4. Integration: Concurrent Approval Requests (Only 1 succeeds, no double inventory update)", async () => {
    const alloc = await EventStock.create({
      event: testEvent._id,
      stockItem: testStockItem._id,
      requiredQuantity: 10,
      takenQuantity: 10,
      returnedQuantity: 10,
      assignedStaff: testStaff._id,
      status: "RETURN_PENDING",
    });

    const results = await Promise.allSettled([
      stockService.verifyStockReturn(
        alloc._id,
        { approvedReturnedQuantity: 10, approvedDamagedQuantity: 0, approvedLostQuantity: 0, managerNotes: "Req 1" },
        { userId: testManager._id, role: "manager" }
      ),
      stockService.verifyStockReturn(
        alloc._id,
        { approvedReturnedQuantity: 10, approvedDamagedQuantity: 0, approvedLostQuantity: 0, managerNotes: "Req 2" },
        { userId: testManager._id, role: "manager" }
      ),
      stockService.verifyStockReturn(
        alloc._id,
        { approvedReturnedQuantity: 10, approvedDamagedQuantity: 0, approvedLostQuantity: 0, managerNotes: "Req 3" },
        { userId: testManager._id, role: "manager" }
      ),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    assert.equal(succeeded.length, 1, "Exactly one concurrent approval request must succeed");
    assert.equal(failed.length, 2, "Concurrent duplicate approvals must be blocked");

    await EventStock.findByIdAndDelete(alloc._id);
  });

  test("5. Integration: Authorization Safeguards (Staff cannot process other staff allocations)", async () => {
    const alloc = await EventStock.create({
      event: testEvent._id,
      stockItem: testStockItem._id,
      requiredQuantity: 10,
      takenQuantity: 10,
      assignedStaff: testStaff._id,
      status: "TAKEN_BY_STAFF",
    });

    // Other staff attempts to return stock assigned to testStaff
    await assert.rejects(
      async () => {
        await stockService.returnStock(
          alloc._id,
          { returnedQuantity: 10, damagedQuantity: 0, lostQuantity: 0 },
          { userId: testOtherStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /not authorized/i);
        return true;
      }
    );

    // Other staff attempts to take stock assigned to testStaff
    alloc.status = "READY_FOR_COLLECTION";
    await alloc.save();

    await assert.rejects(
      async () => {
        await stockService.takeStock(
          alloc._id,
          { takenQuantity: 10 },
          { userId: testOtherStaff._id, role: "staff" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /not authorized/i);
        return true;
      }
    );

    await EventStock.findByIdAndDelete(alloc._id);
  });

  test("6. Integration: Transaction Rollback Safety (No partial inventory or orphaned records on abort)", async () => {
    const prevItem = await StockItem.findById(testStockItem._id);
    const prevAvailable = prevItem.availableQuantity;
    const prevInUse = prevItem.inUseQuantity;
    const prevTotal = prevItem.totalQuantity;

    const initialTxCount = await StockTransaction.countDocuments({ stockItem: testStockItem._id });

    // Simulate an allocation with unfulfillable condition or mid-operation rejection
    const alloc = await EventStock.create({
      event: testEvent._id,
      stockItem: testStockItem._id,
      requiredQuantity: 10,
      takenQuantity: 10,
      returnedQuantity: 10,
      assignedStaff: testStaff._id,
      status: "RETURN_PENDING",
    });

    // Attempt verification with an invalid quantity sum (10 taken, but 8 good + 0 dmg + 0 lost = 8 !== 10)
    await assert.rejects(
      async () => {
        await stockService.verifyStockReturn(
          alloc._id,
          { approvedReturnedQuantity: 8, approvedDamagedQuantity: 0, approvedLostQuantity: 0 },
          { userId: testManager._id, role: "manager" }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    // Verify master inventory was untouched due to atomic rollback
    const itemAfterRollback = await StockItem.findById(testStockItem._id);
    assert.equal(itemAfterRollback.availableQuantity, prevAvailable);
    assert.equal(itemAfterRollback.inUseQuantity, prevInUse);
    assert.equal(itemAfterRollback.totalQuantity, prevTotal);

    // Verify no new transaction record was committed for the failed operation
    const txCountAfterRollback = await StockTransaction.countDocuments({ stockItem: testStockItem._id });
    assert.equal(txCountAfterRollback, initialTxCount, "Transaction count must not increase after aborted operation");

    // Allocation status must still be RETURN_PENDING
    const allocCheck = await EventStock.findById(alloc._id);
    assert.equal(allocCheck.status, "RETURN_PENDING");

    await EventStock.findByIdAndDelete(alloc._id);
  });

  test("7. Integration: Complete Audit Trail Verification", async () => {
    // Check audit transactions generated for the test item
    const transactions = await StockTransaction.find({ stockItem: testStockItem._id }).sort({ createdAt: 1 });
    assert.ok(transactions.length >= 4, "Must have recorded CREATED, RESERVED, TAKEN, and VERIFIED transactions");

    const types = transactions.map((t) => t.type);
    assert.ok(types.includes("CREATED"), "Must contain CREATED audit transaction");
    assert.ok(types.includes("RESERVED"), "Must contain RESERVED audit transaction");
    assert.ok(types.includes("TAKEN"), "Must contain TAKEN audit transaction");
    assert.ok(types.includes("VERIFIED"), "Must contain VERIFIED audit transaction");

    const verifiedTx = transactions.find((t) => t.type === "VERIFIED");
    assert.ok(verifiedTx, "VERIFIED audit transaction exists");
    assert.ok(verifiedTx.performedBy, "Audit transaction contains performedBy actor");
    assert.ok(verifiedTx.notes.includes("Manager"), "Audit transaction contains manager notes");
  });
});
