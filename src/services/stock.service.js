const mongoose = require("mongoose");
const StockItem = require("../models/stockItem.model");
const EventStock = require("../models/eventStock.model");
const StockMovement = require("../models/stockMovement.model");
const StockTransaction = require("../models/stockTransaction.model");
const Event = require("../models/event.model");
const User = require("../models/user.model");
const { getIO } = require("../socket");

// Helper to safely emit socket events if available
const emitStockEvent = (eventName, data) => {
  try {
    const io = getIO();
    if (io) {
      io.emit(eventName, data);
    }
  } catch (err) {
    // Non-fatal if socket not ready
  }
};

/**
 * Strict non-negative integer validator.
 * Rejects negative numbers, floating points / fractions, NaN, null, undefined,
 * empty strings, non-numeric values, or numbers exceeding max.
 */
const validateNonNegativeInteger = (value, fieldName, { max = null } = {}) => {
  if (value === undefined || value === null || value === "") {
    const err = new Error(`${fieldName} is required`);
    err.statusCode = 400;
    throw err;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || isNaN(num)) {
    const err = new Error(`${fieldName} must be a valid numeric quantity`);
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(num)) {
    const err = new Error(`${fieldName} must be a whole integer quantity (fractions/decimals not allowed)`);
    err.statusCode = 400;
    throw err;
  }
  if (num < 0) {
    const err = new Error(`${fieldName} cannot be negative`);
    err.statusCode = 400;
    throw err;
  }
  if (max !== null && num > max) {
    const err = new Error(`${fieldName} (${num}) cannot exceed the taken quantity (${max})`);
    err.statusCode = 400;
    throw err;
  }
  return num;
};

/**
 * Strict positive integer validator (>= 1).
 */
const validatePositiveInteger = (value, fieldName) => {
  const num = validateNonNegativeInteger(value, fieldName);
  if (num <= 0) {
    const err = new Error(`${fieldName} must be at least 1`);
    err.statusCode = 400;
    throw err;
  }
  return num;
};

/**
 * Helper to run operations within a MongoDB transaction if replica set is active,
 * with graceful fallback to standard execution for standalone MongoDB instances.
 */
const runInTransaction = async (operation) => {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // Ignore abort failure
      }
    }
    // If transaction failed because MongoDB is running in standalone mode (no replica set)
    if (
      err.message &&
      (err.message.includes("replica set") ||
        err.message.includes("Transaction numbers are only allowed") ||
        err.message.includes("standalone") ||
        err.message.includes("This MongoDB deployment does not support retryable writes"))
    ) {
      // Fallback: execute operation without session
      return await operation(null);
    }
    throw err;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

/**
 * Helper to find allocation by ID or fallback to { event, stockItem }
 */
const findAllocation = async (eventStockId, stockItemId = null, session = null) => {
  const options = session ? { session } : {};
  if (mongoose.Types.ObjectId.isValid(eventStockId)) {
    let alloc = await EventStock.findById(eventStockId, null, options).populate("stockItem").populate("event");
    if (alloc) return alloc;
  }
  if (stockItemId && mongoose.Types.ObjectId.isValid(stockItemId) && mongoose.Types.ObjectId.isValid(eventStockId)) {
    return await EventStock.findOne({ event: eventStockId, stockItem: stockItemId }, null, options)
      .populate("stockItem")
      .populate("event");
  }
  return null;
};

/**
 * ==========================================
 * MASTER STOCK ITEM CRUD (Manager)
 * ==========================================
 */

const createStockItem = async (data, userId) => {
  const total = validateNonNegativeInteger(data.totalQuantity !== undefined ? data.totalQuantity : 0, "Total quantity");
  const available = total; // Initial available equals total

  const item = await StockItem.create({
    ...data,
    totalQuantity: total,
    availableQuantity: available,
    reservedQuantity: 0,
    inUseQuantity: 0,
    damagedQuantity: 0,
    lostQuantity: 0,
    createdBy: userId,
    updatedBy: userId,
  });

  // Log creation transaction
  await StockTransaction.create({
    stockItem: item._id,
    type: "CREATED",
    quantity: total,
    previousAvailable: 0,
    newAvailable: available,
    previousTotal: 0,
    newTotal: total,
    performedBy: userId,
    notes: "Initial item creation in master inventory",
  });

  emitStockEvent("stock:itemCreated", item);
  return item;
};

const getStockItems = async (query = {}) => {
  const { search, category, lowStock, page = 1, limit = 100 } = query;
  const filter = {};

  if (category && category !== "ALL") {
    filter.category = category;
  }

  if (search && search.trim()) {
    filter.name = { $regex: search.trim(), $options: "i" };
  }

  const items = await StockItem.find(filter)
    .sort({ name: 1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");

  const total = await StockItem.countDocuments(filter);

  let filteredItems = items;
  if (lowStock === "true" || lowStock === true) {
    filteredItems = items.filter((i) => i.availableQuantity <= (i.minStockLevel || 10));
  }

  return {
    items: filteredItems,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

const getStockItemById = async (id) => {
  const item = await StockItem.findById(id)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");

  if (!item) {
    const error = new Error("Stock item not found");
    error.statusCode = 404;
    throw error;
  }

  const recentTransactions = await StockTransaction.find({ stockItem: id })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate("performedBy", "name email role")
    .populate("event", "eventName eventDate location");

  return {
    item,
    recentTransactions,
  };
};

const updateStockItem = async (id, data, userId) => {
  const item = await StockItem.findById(id);
  if (!item) {
    const error = new Error("Stock item not found");
    error.statusCode = 404;
    throw error;
  }

  // Prevent direct tampering with quantities through simple update
  delete data.totalQuantity;
  delete data.availableQuantity;
  delete data.reservedQuantity;
  delete data.inUseQuantity;
  delete data.damagedQuantity;
  delete data.lostQuantity;

  Object.assign(item, data, { updatedBy: userId });
  await item.save();

  emitStockEvent("stock:itemUpdated", item);
  return item;
};

const addStock = async (id, { quantity, notes }, userId) => {
  const addQty = validatePositiveInteger(quantity, "Quantity to add");

  return await runInTransaction(async (session) => {
    const item = await StockItem.findById(id).session(session);
    if (!item) {
      const error = new Error("Stock item not found");
      error.statusCode = 404;
      throw error;
    }

    const prevTotal = item.totalQuantity;
    const prevAvailable = item.availableQuantity;

    item.totalQuantity += addQty;
    item.availableQuantity += addQty;
    item.updatedBy = userId;
    await item.save({ session });

    await StockTransaction.create(
      [
        {
          stockItem: item._id,
          type: "ADDED",
          quantity: addQty,
          previousAvailable: prevAvailable,
          newAvailable: item.availableQuantity,
          previousTotal: prevTotal,
          newTotal: item.totalQuantity,
          performedBy: userId,
          notes: notes || `Restocked ${addQty} ${item.unit || "units"}`,
        },
      ],
      { session }
    );

    emitStockEvent("stock:itemUpdated", item);
    return item;
  });
};

const adjustInventory = async (id, { newTotal, newAvailable, damaged, lost, reason }, userId) => {
  if (!reason || !reason.trim()) {
    const error = new Error("Adjustment reason is required for audit trail");
    error.statusCode = 400;
    throw error;
  }

  return await runInTransaction(async (session) => {
    const item = await StockItem.findById(id).session(session);
    if (!item) {
      const error = new Error("Stock item not found");
      error.statusCode = 404;
      throw error;
    }

    const prevTotal = item.totalQuantity;
    const prevAvailable = item.availableQuantity;

    if (newTotal !== undefined) {
      item.totalQuantity = validateNonNegativeInteger(newTotal, "New total quantity");
    }
    if (newAvailable !== undefined) {
      item.availableQuantity = validateNonNegativeInteger(newAvailable, "New available quantity");
    }
    if (damaged !== undefined) {
      item.damagedQuantity = validateNonNegativeInteger(damaged, "Damaged quantity");
    }
    if (lost !== undefined) {
      item.lostQuantity = validateNonNegativeInteger(lost, "Lost quantity");
    }

    item.updatedBy = userId;
    await item.save({ session });

    await StockTransaction.create(
      [
        {
          stockItem: item._id,
          type: "ADJUSTED",
          quantity: item.availableQuantity - prevAvailable,
          previousAvailable: prevAvailable,
          newAvailable: item.availableQuantity,
          previousTotal: prevTotal,
          newTotal: item.totalQuantity,
          performedBy: userId,
          notes: reason.trim(),
        },
      ],
      { session }
    );

    emitStockEvent("stock:itemUpdated", item);
    return item;
  });
};

const deleteStockItem = async (id) => {
  const item = await StockItem.findById(id);
  if (!item) {
    const error = new Error("Stock item not found");
    error.statusCode = 404;
    throw error;
  }

  if (item.reservedQuantity > 0 || item.inUseQuantity > 0) {
    const error = new Error(
      `Cannot delete item while it is currently reserved (${item.reservedQuantity}) or in-use at events (${item.inUseQuantity})`
    );
    error.statusCode = 400;
    throw error;
  }

  await StockItem.findByIdAndDelete(id);
  emitStockEvent("stock:itemDeleted", { id });
  return { success: true };
};

/**
 * ==========================================
 * EVENT STOCK ALLOCATION (Manager)
 * ==========================================
 */

const getEventStock = async (eventId, user) => {
  const event = await Event.findById(eventId).populate("client", "name email phone");
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const filter = { event: eventId };

  // If staff user, only return stock allocated to this staff
  if (user && user.role === "staff") {
    filter.assignedStaff = user.userId;
  }

  const allocations = await EventStock.find(filter)
    .populate("stockItem")
    .populate("assignedStaff", "name email role phone")
    .populate("assignedBy", "name email")
    .populate("verifiedBy", "name email")
    .sort({ createdAt: -1 });

  return {
    event,
    allocations,
  };
};

const addEventStockRequirement = async (eventId, { stockItemId, requiredQuantity, autoReserve = true, assignedStaff }, userId) => {
  const qty = validatePositiveInteger(requiredQuantity, "Required quantity");

  return await runInTransaction(async (session) => {
    const event = await Event.findById(eventId).session(session);
    if (!event) {
      const error = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    const stockItem = await StockItem.findById(stockItemId).session(session);
    if (!stockItem) {
      const error = new Error("Stock item not found");
      error.statusCode = 404;
      throw error;
    }

    // Check if requirement already exists for this event + item
    let allocation = await EventStock.findOne({ event: eventId, stockItem: stockItemId }).session(session);

    if (allocation) {
      const error = new Error(
        "Stock requirement for this item is already added to this event. Update the existing allocation instead."
      );
      error.statusCode = 400;
      throw error;
    }

    let status = "PLANNED";
    let reservedQty = 0;

    if (autoReserve) {
      if (stockItem.availableQuantity < qty) {
        const error = new Error(
          `Insufficient available stock for ${stockItem.name}. Available: ${stockItem.availableQuantity} ${stockItem.unit || "units"}, Requested: ${qty} ${stockItem.unit || "units"}`
        );
        error.statusCode = 400;
        throw error;
      }

      // Atomically reserve
      stockItem.availableQuantity -= qty;
      stockItem.reservedQuantity += qty;
      stockItem.updatedBy = userId;
      await stockItem.save({ session });

      reservedQty = qty;
      status = assignedStaff ? "READY_FOR_COLLECTION" : "RESERVED";

      await StockTransaction.create(
        [
          {
            stockItem: stockItem._id,
            event: eventId,
            type: "RESERVED",
            quantity: qty,
            previousAvailable: stockItem.availableQuantity + qty,
            newAvailable: stockItem.availableQuantity,
            previousTotal: stockItem.totalQuantity,
            newTotal: stockItem.totalQuantity,
            performedBy: userId,
            notes: `Reserved ${qty} ${stockItem.unit || "units"} for event "${event.eventName}"`,
          },
        ],
        { session }
      );
    }

    const createdAllocations = await EventStock.create(
      [
        {
          event: eventId,
          booking: event.booking || null,
          stockItem: stockItemId,
          requiredQuantity: qty,
          reservedQuantity: reservedQty,
          assignedStaff: assignedStaff || null,
          status: assignedStaff && autoReserve ? "READY_FOR_COLLECTION" : status,
          assignedBy: userId,
          assignedAt: assignedStaff ? new Date() : null,
        },
      ],
      { session }
    );
    allocation = createdAllocations[0];

    // If staff is assigned, also prepare movement record
    if (assignedStaff) {
      await StockMovement.create(
        [
          {
            event: eventId,
            booking: event.booking || null,
            stockItem: stockItemId,
            eventStock: allocation._id,
            assignedStaff,
            expectedQuantity: qty,
            status: "ASSIGNED",
          },
        ],
        { session }
      );
    }

    const populated = await EventStock.findById(allocation._id, null, session ? { session } : {})
      .populate("stockItem")
      .populate("assignedStaff", "name email role")
      .populate("assignedBy", "name email");

    emitStockEvent("stock:requirementAdded", { eventId, allocation: populated });
    return populated;
  });
};

const assignStaffToStock = async (eventStockId, { staffId, expectedReturnAt, notes, stockItemId }, userId) => {
  return await runInTransaction(async (session) => {
    const allocation = await findAllocation(eventStockId, stockItemId, session);
    if (!allocation) {
      const error = new Error("Stock allocation not found");
      error.statusCode = 404;
      throw error;
    }

    if (allocation.status === "VERIFIED" || allocation.status === "CLOSED") {
      const error = new Error("Cannot reassign staff to a verified or closed stock allocation");
      error.statusCode = 400;
      throw error;
    }

    const staff = await User.findById(staffId).session(session);
    if (!staff) {
      const error = new Error("Staff member not found");
      error.statusCode = 404;
      throw error;
    }

    allocation.assignedStaff = staffId;
    allocation.assignedBy = userId;
    allocation.assignedAt = new Date();
    if (expectedReturnAt) {
      allocation.expectedReturnAt = new Date(expectedReturnAt);
    }
    if (notes !== undefined) {
      allocation.takeNotes = (notes || "").trim();
    }
    if (allocation.status === "PLANNED" || allocation.status === "RESERVED") {
      allocation.status = "READY_FOR_COLLECTION";
    }
    await allocation.save({ session });

    // Create or update movement record
    let movement = await StockMovement.findOne({ eventStock: allocation._id }).session(session);
    if (!movement) {
      movement = new StockMovement({
        event: allocation.event._id || allocation.event,
        booking: allocation.booking,
        stockItem: allocation.stockItem._id || allocation.stockItem,
        eventStock: allocation._id,
        assignedStaff: staffId,
        expectedQuantity: allocation.requiredQuantity,
        expectedReturnAt: allocation.expectedReturnAt || null,
        takeNotes: notes ? notes.trim() : "",
        status: "ASSIGNED",
      });
    } else {
      movement.assignedStaff = staffId;
      if (allocation.expectedReturnAt) movement.expectedReturnAt = allocation.expectedReturnAt;
      if (notes !== undefined) movement.takeNotes = (notes || "").trim();
      if (movement.status === "PLANNED") movement.status = "ASSIGNED";
    }
    await movement.save({ session });

    const populated = await EventStock.findById(allocation._id, null, session ? { session } : {})
      .populate("stockItem")
      .populate("assignedStaff", "name email role phone")
      .populate("assignedBy", "name email");

    emitStockEvent("stock:allocationUpdated", { eventId: allocation.event._id || allocation.event, allocation: populated });
    return populated;
  });
};

const removeEventStockRequirement = async (eventStockId, userId) => {
  return await runInTransaction(async (session) => {
    const allocation = await findAllocation(eventStockId, null, session);
    if (!allocation) {
      const error = new Error("Stock allocation not found");
      error.statusCode = 404;
      throw error;
    }

    if (["TAKEN_BY_STAFF", "AT_EVENT", "RETURN_PENDING", "RETURNED", "VERIFIED", "CLOSED"].includes(allocation.status)) {
      const error = new Error(`Cannot remove allocation while stock is in status "${allocation.status}"`);
      error.statusCode = 400;
      throw error;
    }

    // Release reserved quantity back to available
    if (allocation.reservedQuantity > 0 && allocation.stockItem) {
      const stockItem = await StockItem.findById(allocation.stockItem._id || allocation.stockItem).session(session);
      if (stockItem) {
        const prevAvailable = stockItem.availableQuantity;
        stockItem.reservedQuantity = Math.max(0, stockItem.reservedQuantity - allocation.reservedQuantity);
        stockItem.availableQuantity += allocation.reservedQuantity;
        stockItem.updatedBy = userId;
        await stockItem.save({ session });

        await StockTransaction.create(
          [
            {
              stockItem: stockItem._id,
              event: allocation.event._id || allocation.event,
              type: "UNRESERVED",
              quantity: allocation.reservedQuantity,
              previousAvailable: prevAvailable,
              newAvailable: stockItem.availableQuantity,
              previousTotal: stockItem.totalQuantity,
              newTotal: stockItem.totalQuantity,
              performedBy: userId,
              notes: `Released ${allocation.reservedQuantity} ${stockItem.unit || "units"} allocation from event`,
            },
          ],
          { session }
        );
      }
    }

    await StockMovement.deleteMany({ eventStock: allocation._id, status: "ASSIGNED" }).session(session);
    await EventStock.findByIdAndDelete(allocation._id).session(session);

    emitStockEvent("stock:allocationRemoved", { eventId: allocation.event._id || allocation.event, eventStockId: allocation._id });
    return { success: true };
  });
};

/**
 * ==========================================
 * STAFF TAKE STOCK HANDOVER (Staff)
 * ==========================================
 */

const getStaffAssignedStock = async (staffId, query = {}) => {
  const allocations = await EventStock.find({ assignedStaff: staffId })
    .populate("stockItem")
    .populate({
      path: "event",
      select: "eventName eventDate eventTime location status client",
      populate: { path: "client", select: "name phone" },
    })
    .sort({ updatedAt: -1 });

  const movements = await StockMovement.find({ assignedStaff: staffId })
    .populate("stockItem")
    .populate("event", "eventName eventDate location")
    .sort({ createdAt: -1 });

  return {
    allocations,
    movements,
  };
};

const takeStock = async (eventStockId, { takenQuantity, takeNotes, expectedReturnAt, stockItemId }, user) => {
  return await runInTransaction(async (session) => {
    const allocation = await findAllocation(eventStockId, stockItemId, session);

    if (!allocation) {
      const error = new Error("Stock allocation record not found");
      error.statusCode = 404;
      throw error;
    }

    // Verify staff authorization
    if (user.role !== "manager" && user.role !== "admin") {
      const assignedId = String(allocation.assignedStaff?._id || allocation.assignedStaff || "");
      const currentUserId = String(user.userId || user._id || user || "");
      if (assignedId !== currentUserId) {
        const error = new Error("You are not authorized to take stock assigned to another staff member");
        error.statusCode = 403;
        throw error;
      }
    }

    // Status transition validation
    if (allocation.status === "TAKEN_BY_STAFF" || allocation.status === "AT_EVENT") {
      const error = new Error("Stock has already been collected/taken by staff");
      error.statusCode = 400;
      throw error;
    }

    if (
      allocation.status === "RETURN_PENDING" ||
      allocation.status === "RETURNED" ||
      allocation.status === "VERIFIED" ||
      allocation.status === "CLOSED"
    ) {
      const error = new Error(`Cannot collect stock. Allocation is already in status: "${allocation.status}"`);
      error.statusCode = 400;
      throw error;
    }

    const actualTaken = validatePositiveInteger(takenQuantity, "Actual taken quantity");

    // If taken differs from expected, require note
    if (actualTaken !== allocation.requiredQuantity && (!takeNotes || !takeNotes.trim())) {
      const error = new Error(
        `Actual taken quantity (${actualTaken}) differs from expected (${allocation.requiredQuantity}). A reason note is mandatory.`
      );
      error.statusCode = 400;
      throw error;
    }

    const stockItem = await StockItem.findById(allocation.stockItem._id || allocation.stockItem).session(session);
    if (!stockItem) {
      const error = new Error("Stock item not found in master inventory");
      error.statusCode = 404;
      throw error;
    }

    // Atomic update to master stock item
    const prevReserved = stockItem.reservedQuantity;
    const prevInUse = stockItem.inUseQuantity;
    const prevAvailable = stockItem.availableQuantity;
    const prevTotal = stockItem.totalQuantity;

    const reservedForThis = typeof allocation.reservedQuantity === "number" && allocation.reservedQuantity > 0
      ? allocation.reservedQuantity
      : 0;

    stockItem.reservedQuantity = Math.max(0, stockItem.reservedQuantity - reservedForThis);
    stockItem.inUseQuantity += actualTaken;

    if (actualTaken < reservedForThis) {
      const uncollectedDifference = reservedForThis - actualTaken;
      stockItem.availableQuantity += uncollectedDifference;
    } else if (actualTaken > reservedForThis) {
      const extraTaken = actualTaken - reservedForThis;
      if (stockItem.availableQuantity < extraTaken) {
        const error = new Error(
          `Cannot take ${actualTaken} items. Only ${stockItem.availableQuantity} additional items available in warehouse.`
        );
        error.statusCode = 400;
        throw error;
      }
      stockItem.availableQuantity -= extraTaken;
    }

    stockItem.updatedBy = user.userId || user._id;
    await stockItem.save({ session });

    // Update allocation
    allocation.takenQuantity = actualTaken;
    allocation.reservedQuantity = 0;
    allocation.status = "TAKEN_BY_STAFF";
    allocation.takenAt = new Date();
    if (expectedReturnAt) {
      allocation.expectedReturnAt = new Date(expectedReturnAt);
    }
    allocation.takeNotes = (takeNotes || "").trim();
    await allocation.save({ session });

    // Update or create movement record
    let movement = await StockMovement.findOne({ eventStock: allocation._id }).session(session);
    if (!movement) {
      movement = new StockMovement({
        event: allocation.event._id || allocation.event,
        booking: allocation.booking,
        stockItem: stockItem._id,
        eventStock: allocation._id,
        assignedStaff: allocation.assignedStaff || user.userId || user._id,
        expectedQuantity: allocation.requiredQuantity,
      });
    }

    movement.takenQuantity = actualTaken;
    movement.status = "IN_USE";
    movement.takenAt = new Date();
    movement.takenBy = user.userId || user._id;
    if (expectedReturnAt) {
      movement.expectedReturnAt = new Date(expectedReturnAt);
    }
    movement.takeNotes = (takeNotes || "").trim();
    await movement.save({ session });

    // Audit Transaction record
    await StockTransaction.create(
      [
        {
          stockItem: stockItem._id,
          event: allocation.event._id || allocation.event,
          movement: movement._id,
          type: "TAKEN",
          quantity: actualTaken,
          previousAvailable: prevAvailable,
          newAvailable: stockItem.availableQuantity,
          previousTotal: prevTotal,
          newTotal: stockItem.totalQuantity,
          performedBy: user.userId || user._id,
          notes: `Staff took ${actualTaken} ${stockItem.unit || "items"} for event "${allocation.event?.eventName || "Event"}". ${takeNotes ? `Note: ${takeNotes}` : ""}`,
        },
      ],
      { session }
    );

    const populated = await EventStock.findById(allocation._id, null, session ? { session } : {})
      .populate("stockItem")
      .populate("assignedStaff", "name email role phone")
      .populate("assignedBy", "name email");

    emitStockEvent("stock:taken", { allocation: populated, movement });
    return { allocation: populated, movement };
  });
};

/**
 * ==========================================
 * STAFF RETURN STOCK (Staff)
 * ==========================================
 */

const returnStock = async (
  eventStockId,
  { returnedQuantity, damagedQuantity = 0, lostQuantity = 0, returnNotes, damagedReason, lostReason, returnedAt, stockItemId },
  user
) => {
  return await runInTransaction(async (session) => {
    const allocation = await findAllocation(eventStockId, stockItemId, session);

    if (!allocation) {
      const error = new Error("Stock allocation record not found");
      error.statusCode = 404;
      throw error;
    }

    // Verify staff ownership
    if (user.role !== "manager" && user.role !== "admin") {
      const assignedId = String(allocation.assignedStaff?._id || allocation.assignedStaff || "");
      const currentUserId = String(user.userId || user._id || user || "");
      if (assignedId !== currentUserId) {
        const error = new Error("You are not authorized to return stock assigned to another staff member");
        error.statusCode = 403;
        throw error;
      }
    }

    // Status transition validation & Duplicate submission prevention
    if (allocation.status === "RETURN_PENDING") {
      const error = new Error("Stock return has already been submitted and is currently pending manager approval");
      error.statusCode = 400;
      throw error;
    }

    if (allocation.status === "VERIFIED" || allocation.status === "CLOSED") {
      const error = new Error("Stock return has already been approved and verified by the manager. Cannot resubmit.");
      error.statusCode = 400;
      throw error;
    }

    if (allocation.status !== "TAKEN_BY_STAFF" && allocation.status !== "AT_EVENT") {
      const error = new Error(
        `Cannot return stock with status "${allocation.status}". Stock must be collected before it can be returned.`
      );
      error.statusCode = 400;
      throw error;
    }

    const takenQty = allocation.takenQuantity || 0;
    if (takenQty <= 0) {
      const error = new Error("Cannot return stock with zero taken quantity");
      error.statusCode = 400;
      throw error;
    }

    // Strict validation of input quantities: reject negative, fraction, NaN, exceeding taken
    const retQty = validateNonNegativeInteger(returnedQuantity, "Good returned quantity", { max: takenQty });
    const dmgQty = validateNonNegativeInteger(damagedQuantity !== undefined ? damagedQuantity : 0, "Damaged quantity", { max: takenQty });
    const lstQty = validateNonNegativeInteger(lostQuantity !== undefined ? lostQuantity : 0, "Lost quantity", { max: takenQty });

    // MANDATORY RECONCILIATION INVARIANT: returned + damaged + lost === taken
    const accounted = retQty + dmgQty + lstQty;
    if (accounted !== takenQty) {
      const diff = Math.abs(takenQty - accounted);
      const error = new Error(
        `Reconciliation failed: The sum of good (${retQty}), damaged (${dmgQty}), and lost (${lstQty}) quantities (${accounted}) must equal the actual taken quantity (${takenQty}). ${diff} item(s) are unaccounted for.`
      );
      error.statusCode = 400;
      throw error;
    }

    // If damaged, mandatory explanation
    if (dmgQty > 0 && (!damagedReason || !damagedReason.trim())) {
      const error = new Error(`Damaged quantity (${dmgQty}) reported without mandatory damage explanation`);
      error.statusCode = 400;
      throw error;
    }

    // If lost, mandatory explanation
    if (lstQty > 0 && (!lostReason || !lostReason.trim())) {
      const error = new Error(`Lost/missing quantity (${lstQty}) reported without mandatory loss explanation`);
      error.statusCode = 400;
      throw error;
    }

    const timestamp = returnedAt ? new Date(returnedAt) : new Date();

    // Master inventory is NOT changed here. Master inventory updates ONLY on manager approval.
    allocation.returnedQuantity = retQty;
    allocation.damagedQuantity = dmgQty;
    allocation.lostQuantity = lstQty;
    allocation.status = "RETURN_PENDING";
    allocation.returnedAt = timestamp;
    allocation.returnNotes = (returnNotes || "").trim();
    allocation.damagedReason = (damagedReason || "").trim();
    allocation.lostReason = (lostReason || "").trim();
    await allocation.save({ session });

    let movement = await StockMovement.findOne({ eventStock: allocation._id }).session(session);
    if (movement) {
      movement.returnedQuantity = retQty;
      movement.damagedQuantity = dmgQty;
      movement.lostQuantity = lstQty;
      movement.status = "RETURN_PENDING";
      movement.returnedAt = timestamp;
      movement.returnedBy = user.userId || user._id;
      movement.returnNotes = (returnNotes || "").trim();
      movement.damagedReason = (damagedReason || "").trim();
      movement.lostReason = (lostReason || "").trim();
      await movement.save({ session });
    }

    const populated = await EventStock.findById(allocation._id, null, session ? { session } : {})
      .populate("stockItem")
      .populate("assignedStaff", "name email role phone")
      .populate("assignedBy", "name email");

    const { sendStockReturnNotificationToManager } = require("../utils/notification.util");
    const staffUser = await User.findById(user.userId || user._id).session(session);
    await sendStockReturnNotificationToManager({
      staff: staffUser,
      stockItem: populated?.stockItem || allocation.stockItem,
      returnedQuantity: retQty,
      damagedQuantity: dmgQty,
      lostQuantity: lstQty,
      notes: returnNotes,
    });

    emitStockEvent("stock:returnSubmitted", { allocation: populated, movement });
    return { allocation: populated, movement };
  });
};

/**
 * ==========================================
 * STAFF HOLD / RESERVE STOCK FROM INVENTORY
 * ==========================================
 */

const holdStock = async ({ stockItemId, quantity, eventId, notes, expectedReturnAt }, user) => {
  const qty = validatePositiveInteger(quantity, "Hold quantity");

  return await runInTransaction(async (session) => {
    const stockItem = await StockItem.findById(stockItemId).session(session);
    if (!stockItem) {
      const error = new Error("Stock item not found");
      error.statusCode = 404;
      throw error;
    }

    if (stockItem.availableQuantity < qty) {
      const error = new Error(
        `Insufficient available stock for ${stockItem.name}. Available: ${stockItem.availableQuantity} ${stockItem.unit || "units"}, Requested hold: ${qty} ${stockItem.unit || "units"}`
      );
      error.statusCode = 400;
      throw error;
    }

    let eventDoc = null;
    if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
      eventDoc = await Event.findById(eventId).session(session);
    }

    const staffUser = await User.findById(user.userId || user._id).session(session);

    // Atomically reserve stock in inventory
    const prevAvailable = stockItem.availableQuantity;
    stockItem.availableQuantity -= qty;
    stockItem.reservedQuantity += qty;
    stockItem.updatedBy = user.userId || user._id;
    await stockItem.save({ session });

    // Create EventStock allocation for the staff
    const createdAllocations = await EventStock.create(
      [
        {
          event: eventDoc ? eventDoc._id : null,
          booking: eventDoc?.booking || null,
          stockItem: stockItemId,
          requiredQuantity: qty,
          reservedQuantity: qty,
          assignedStaff: user.userId || user._id,
          status: "READY_FOR_COLLECTION",
          assignedBy: user.userId || user._id,
          assignedAt: new Date(),
          expectedReturnAt: expectedReturnAt ? new Date(expectedReturnAt) : null,
          takeNotes: (notes || "").trim(),
        },
      ],
      { session }
    );
    const allocation = createdAllocations[0];

    // Create StockMovement record
    const movement = await StockMovement.create(
      [
        {
          event: eventDoc ? eventDoc._id : null,
          booking: eventDoc?.booking || null,
          stockItem: stockItemId,
          eventStock: allocation._id,
          assignedStaff: user.userId || user._id,
          expectedQuantity: qty,
          expectedReturnAt: expectedReturnAt ? new Date(expectedReturnAt) : null,
          takeNotes: (notes || "").trim(),
          status: "ASSIGNED",
        },
      ],
      { session }
    );

    // Audit log
    await StockTransaction.create(
      [
        {
          stockItem: stockItem._id,
          event: eventDoc ? eventDoc._id : null,
          type: "RESERVED",
          quantity: qty,
          previousAvailable: prevAvailable,
          newAvailable: stockItem.availableQuantity,
          previousTotal: stockItem.totalQuantity,
          newTotal: stockItem.totalQuantity,
          performedBy: user.userId || user._id,
          notes: `Staff ${staffUser?.name || "Staff"} placed a hold on ${qty} ${stockItem.unit || "units"}. Notes: ${notes || "None"}`,
        },
      ],
      { session }
    );

    const populated = await EventStock.findById(allocation._id, null, session ? { session } : {})
      .populate("stockItem")
      .populate("assignedStaff", "name email role phone")
      .populate("event", "eventName eventDate location");

    // Trigger email notification to manager
    const { sendStockHoldNotificationToManager } = require("../utils/notification.util");
    await sendStockHoldNotificationToManager({
      staff: staffUser,
      stockItem,
      quantity: qty,
      event: eventDoc,
      notes,
      expectedDate: expectedReturnAt,
    });

    emitStockEvent("stock:held", { allocation: populated, stockItem });
    emitStockEvent("stock:itemUpdated", stockItem);

    return { allocation: populated, movement: movement[0] };
  });
};

const releaseStockHold = async (eventStockId, user) => {
  return await runInTransaction(async (session) => {
    const allocation = await EventStock.findById(eventStockId).session(session).populate("stockItem");
    if (!allocation) {
      const error = new Error("Stock hold allocation record not found");
      error.statusCode = 404;
      throw error;
    }

    if (user.role !== "manager" && user.role !== "admin") {
      const assignedId = String(allocation.assignedStaff?._id || allocation.assignedStaff || "");
      const currentUserId = String(user.userId || user._id || "");
      if (assignedId !== currentUserId) {
        const error = new Error("You are not authorized to release another staff member's hold");
        error.statusCode = 403;
        throw error;
      }
    }

    if (allocation.status !== "READY_FOR_COLLECTION" && allocation.status !== "RESERVED" && allocation.status !== "PLANNED") {
      const error = new Error(`Cannot release hold on stock with status "${allocation.status}". Only uncollected holds can be released.`);
      error.statusCode = 400;
      throw error;
    }

    const stockItem = await StockItem.findById(allocation.stockItem._id || allocation.stockItem).session(session);
    if (stockItem && allocation.reservedQuantity > 0) {
      const prevAvailable = stockItem.availableQuantity;
      stockItem.reservedQuantity = Math.max(0, stockItem.reservedQuantity - allocation.reservedQuantity);
      stockItem.availableQuantity += allocation.reservedQuantity;
      stockItem.updatedBy = user.userId || user._id;
      await stockItem.save({ session });

      await StockTransaction.create(
        [
          {
            stockItem: stockItem._id,
            event: allocation.event || null,
            type: "UNRESERVED",
            quantity: allocation.reservedQuantity,
            previousAvailable: prevAvailable,
            newAvailable: stockItem.availableQuantity,
            previousTotal: stockItem.totalQuantity,
            newTotal: stockItem.totalQuantity,
            performedBy: user.userId || user._id,
            notes: `Staff hold of ${allocation.reservedQuantity} ${stockItem.unit || "units"} released back to available warehouse inventory.`,
          },
        ],
        { session }
      );
    }

    await StockMovement.deleteMany({ eventStock: allocation._id, status: "ASSIGNED" }).session(session);
    await EventStock.findByIdAndDelete(allocation._id).session(session);

    emitStockEvent("stock:holdReleased", { eventStockId: allocation._id, stockItem });
    if (stockItem) emitStockEvent("stock:itemUpdated", stockItem);

    return { success: true };
  });
};

/**
 * ==========================================
 * MANAGER VERIFICATION & APPROVAL (Manager)
 * ==========================================
 */

const verifyStockReturn = async (
  eventStockId,
  { approvedReturnedQuantity, approvedDamagedQuantity, approvedLostQuantity, managerNotes, verificationNotes, stockItemId },
  managerUser
) => {
  return await runInTransaction(async (session) => {
    const allocation = await findAllocation(eventStockId, stockItemId, session);

    if (!allocation) {
      const error = new Error("Stock allocation record not found");
      error.statusCode = 404;
      throw error;
    }

    // Prevent duplicate approvals & repeated inventory adjustments
    if (allocation.status === "VERIFIED" || allocation.status === "CLOSED") {
      const error = new Error("Stock return has already been approved and verified. Duplicate approvals are prevented.");
      error.statusCode = 400;
      throw error;
    }

    if (
      allocation.status !== "RETURN_PENDING" &&
      allocation.status !== "RETURNED" &&
      allocation.status !== "DISCREPANCY"
    ) {
      const error = new Error(
        `Cannot verify stock return with status "${allocation.status}". Stock return must be submitted first.`
      );
      error.statusCode = 400;
      throw error;
    }

    const stockItem = await StockItem.findById(allocation.stockItem._id || allocation.stockItem).session(session);
    if (!stockItem) {
      const error = new Error("Stock item not found in master inventory");
      error.statusCode = 404;
      throw error;
    }

    const takenQty = allocation.takenQuantity || 0;
    if (takenQty <= 0) {
      const error = new Error("Cannot verify return on allocation with zero taken quantity");
      error.statusCode = 400;
      throw error;
    }

    // Default to staff submitted numbers if not explicitly overridden by manager
    const rawApprovedRet = approvedReturnedQuantity !== undefined ? approvedReturnedQuantity : allocation.returnedQuantity;
    const rawApprovedDmg = approvedDamagedQuantity !== undefined ? approvedDamagedQuantity : allocation.damagedQuantity;
    const rawApprovedLst = approvedLostQuantity !== undefined ? approvedLostQuantity : allocation.lostQuantity;

    const finalApprovedRet = validateNonNegativeInteger(rawApprovedRet, "Approved good returned quantity", { max: takenQty });
    const finalApprovedDmg = validateNonNegativeInteger(rawApprovedDmg, "Approved damaged quantity", { max: takenQty });
    const finalApprovedLst = validateNonNegativeInteger(rawApprovedLst, "Approved lost quantity", { max: takenQty });

    // MANDATORY RECONCILIATION INVARIANT:
    // approved good quantity + approved damaged quantity + approved lost quantity === actual taken quantity
    const totalApproved = finalApprovedRet + finalApprovedDmg + finalApprovedLst;
    if (totalApproved !== takenQty) {
      const diff = Math.abs(takenQty - totalApproved);
      const error = new Error(
        `Reconciliation failed: Sum of approved good (${finalApprovedRet}), damaged (${finalApprovedDmg}), and lost (${finalApprovedLst}) items (${totalApproved}) must equal the taken quantity (${takenQty}). ${diff} item(s) are unaccounted for.`
      );
      error.statusCode = 400;
      throw error;
    }

    const notes = (managerNotes || verificationNotes || "").trim();
    const prevAvailable = stockItem.availableQuantity;
    const prevInUse = stockItem.inUseQuantity;
    const prevDamaged = stockItem.damagedQuantity;
    const prevLost = stockItem.lostQuantity;
    const prevTotal = stockItem.totalQuantity;

    // MASTER INVENTORY UPDATE:
    // 1. Release in-use quantity by taken amount
    // 2. Good returned items restocked into available inventory
    // 3. Damaged items recorded in damaged inventory (NOT available)
    // 4. Lost items recorded in lost inventory and written off from physical totalQuantity
    // Invariant: availableQuantity + reservedQuantity + inUseQuantity + damagedQuantity === totalQuantity
    stockItem.inUseQuantity = Math.max(0, stockItem.inUseQuantity - takenQty);
    stockItem.availableQuantity += finalApprovedRet;
    stockItem.damagedQuantity += finalApprovedDmg;
    stockItem.lostQuantity += finalApprovedLst;
    stockItem.totalQuantity = Math.max(0, stockItem.totalQuantity - finalApprovedLst);
    stockItem.updatedBy = managerUser.userId || managerUser._id;
    await stockItem.save({ session });

    allocation.status = "VERIFIED";
    allocation.approvedReturnedQuantity = finalApprovedRet;
    allocation.approvedDamagedQuantity = finalApprovedDmg;
    allocation.approvedLostQuantity = finalApprovedLst;
    allocation.verifiedAt = new Date();
    allocation.verifiedBy = managerUser.userId || managerUser._id;
    allocation.managerNotes = notes;
    allocation.resolutionNotes = notes;
    await allocation.save({ session });

    let movement = await StockMovement.findOne({ eventStock: allocation._id }).session(session);
    if (movement) {
      movement.status = "VERIFIED";
      movement.verifiedAt = new Date();
      movement.verifiedBy = managerUser.userId || managerUser._id;
      movement.managerNotes = notes;
      movement.resolutionNotes = notes;
      await movement.save({ session });
    }

    // Complete audit trail
    await StockTransaction.create(
      [
        {
          stockItem: stockItem._id,
          event: allocation.event._id || allocation.event,
          movement: movement?._id || null,
          type: "VERIFIED",
          quantity: finalApprovedRet,
          previousAvailable: prevAvailable,
          newAvailable: stockItem.availableQuantity,
          previousTotal: prevTotal,
          newTotal: stockItem.totalQuantity,
          performedBy: managerUser.userId || managerUser._id,
          notes: `Manager approved return: ${finalApprovedRet} good items restocked to available inventory. ${notes ? `Remarks: ${notes}` : ""}`,
        },
      ],
      { session }
    );

    if (finalApprovedDmg > 0) {
      await StockTransaction.create(
        [
          {
            stockItem: stockItem._id,
            event: allocation.event._id || allocation.event,
            movement: movement?._id || null,
            type: "DAMAGED",
            quantity: finalApprovedDmg,
            previousAvailable: stockItem.availableQuantity,
            newAvailable: stockItem.availableQuantity,
            previousTotal: prevTotal,
            newTotal: stockItem.totalQuantity,
            performedBy: managerUser.userId || managerUser._id,
            notes: `Manager confirmed ${finalApprovedDmg} damaged item(s) logged in damaged inventory. Reason: ${allocation.damagedReason || "Damaged during event"}`,
          },
        ],
        { session }
      );
    }

    if (finalApprovedLst > 0) {
      await StockTransaction.create(
        [
          {
            stockItem: stockItem._id,
            event: allocation.event._id || allocation.event,
            movement: movement?._id || null,
            type: "LOST",
            quantity: finalApprovedLst,
            previousAvailable: stockItem.availableQuantity,
            newAvailable: stockItem.availableQuantity,
            previousTotal: prevTotal,
            newTotal: stockItem.totalQuantity,
            performedBy: managerUser.userId || managerUser._id,
            notes: `Manager confirmed ${finalApprovedLst} lost item(s) logged in lost inventory. Reason: ${allocation.lostReason || "Lost during event"}`,
          },
        ],
        { session }
      );
    }

    const populated = await EventStock.findById(allocation._id, null, session ? { session } : {})
      .populate("stockItem")
      .populate("assignedStaff", "name email role phone")
      .populate("assignedBy", "name email")
      .populate("verifiedBy", "name email");

    emitStockEvent("stock:verified", { allocation: populated, movement });
    return { allocation: populated, movement };
  });
};

const reportDiscrepancy = async (eventStockId, { discrepancyNotes, notes: altNotes, stockItemId }, managerUser) => {
  return await runInTransaction(async (session) => {
    const allocation = await findAllocation(eventStockId, stockItemId, session);
    if (!allocation) {
      const error = new Error("Stock allocation record not found");
      error.statusCode = 404;
      throw error;
    }

    if (allocation.status === "VERIFIED" || allocation.status === "CLOSED") {
      const error = new Error("Cannot report discrepancy on already verified and closed stock allocation");
      error.statusCode = 400;
      throw error;
    }

    const finalNotes = (discrepancyNotes || altNotes || "").trim();
    if (!finalNotes) {
      const error = new Error("Discrepancy notes/explanation is required");
      error.statusCode = 400;
      throw error;
    }

    allocation.status = "DISCREPANCY";
    allocation.discrepancyNotes = finalNotes;
    await allocation.save({ session });

    let movement = await StockMovement.findOne({ eventStock: allocation._id }).session(session);
    if (movement) {
      movement.status = "DISCREPANCY";
      movement.discrepancyNotes = finalNotes;
      await movement.save({ session });
    }

    await StockTransaction.create(
      [
        {
          stockItem: allocation.stockItem._id || allocation.stockItem,
          event: allocation.event._id || allocation.event,
          movement: movement?._id || null,
          type: "DISCREPANCY_RESOLVED",
          quantity: 0,
          previousAvailable: allocation.stockItem?.availableQuantity || 0,
          newAvailable: allocation.stockItem?.availableQuantity || 0,
          previousTotal: allocation.stockItem?.totalQuantity || 0,
          newTotal: allocation.stockItem?.totalQuantity || 0,
          performedBy: managerUser.userId || managerUser._id,
          notes: `Discrepancy reported by manager: ${finalNotes}`,
        },
      ],
      { session }
    );

    const populated = await EventStock.findById(allocation._id, null, session ? { session } : {})
      .populate("stockItem")
      .populate("assignedStaff", "name email role phone")
      .populate("assignedBy", "name email");

    emitStockEvent("stock:discrepancyReported", { allocation: populated, movement });
    return { allocation: populated, movement };
  });
};

/**
 * ==========================================
 * AUDIT TRANSACTIONS & SUMMARY
 * ==========================================
 */

const getStockTransactions = async (query = {}) => {
  const { stockItemId, eventId, type, page = 1, limit = 50 } = query;
  const filter = {};

  if (stockItemId) filter.stockItem = stockItemId;
  if (eventId) filter.event = eventId;
  if (type && type !== "ALL") filter.type = type;

  const transactions = await StockTransaction.find(filter)
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .populate("stockItem", "name category unit")
    .populate("event", "eventName eventDate location")
    .populate("performedBy", "name email role");

  const total = await StockTransaction.countDocuments(filter);

  return {
    transactions,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

const getStaffStockSummary = async (staffId) => {
  const activeAllocations = await EventStock.find({
    assignedStaff: staffId,
    status: { $in: ["READY_FOR_COLLECTION", "TAKEN_BY_STAFF", "AT_EVENT", "RETURN_PENDING", "DISCREPANCY"] },
  }).populate("stockItem").populate("event");

  const totalAssigned = await EventStock.countDocuments({ assignedStaff: staffId });
  const pendingCollection = await EventStock.countDocuments({
    assignedStaff: staffId,
    status: { $in: ["READY_FOR_COLLECTION", "RESERVED"] },
  });
  const inCustody = await EventStock.countDocuments({
    assignedStaff: staffId,
    status: { $in: ["TAKEN_BY_STAFF", "AT_EVENT"] },
  });
  const pendingReturnVerification = await EventStock.countDocuments({
    assignedStaff: staffId,
    status: "RETURN_PENDING",
  });
  const verifiedReturned = await EventStock.countDocuments({
    assignedStaff: staffId,
    status: "VERIFIED",
  });
  const discrepancies = await EventStock.countDocuments({
    assignedStaff: staffId,
    status: "DISCREPANCY",
  });

  return {
    summary: {
      totalAssigned,
      pendingCollection,
      inCustody,
      pendingReturnVerification,
      verifiedReturned,
      discrepancies,
    },
    activeAllocations,
  };
};

const getManagerStockSummary = async () => {
  const totalItems = await StockItem.countDocuments();
  const lowStockItems = await StockItem.find({
    $expr: { $lte: ["$availableQuantity", "$minStockLevel"] },
  }).limit(10);

  const pendingReturns = await EventStock.find({ status: "RETURN_PENDING" })
    .populate("stockItem")
    .populate("assignedStaff", "name email role")
    .populate("event", "eventName eventDate location");

  const activeDiscrepancies = await EventStock.find({ status: "DISCREPANCY" })
    .populate("stockItem")
    .populate("assignedStaff", "name email role")
    .populate("event", "eventName eventDate location");

  const inUseAllocations = await EventStock.find({ status: { $in: ["TAKEN_BY_STAFF", "AT_EVENT"] } })
    .populate("stockItem")
    .populate("assignedStaff", "name email role")
    .populate("event", "eventName eventDate location");

  const aggregateStats = await StockItem.aggregate([
    {
      $group: {
        _id: null,
        totalStock: { $sum: "$totalQuantity" },
        totalAvailable: { $sum: "$availableQuantity" },
        totalReserved: { $sum: "$reservedQuantity" },
        totalInUse: { $sum: "$inUseQuantity" },
        totalDamaged: { $sum: "$damagedQuantity" },
        totalLost: { $sum: "$lostQuantity" },
      },
    },
  ]);

  const stats = aggregateStats[0] || {
    totalStock: 0,
    totalAvailable: 0,
    totalReserved: 0,
    totalInUse: 0,
    totalDamaged: 0,
    totalLost: 0,
  };

  return {
    stats,
    totalItems,
    lowStockCount: lowStockItems.length,
    lowStockItems,
    pendingReturnsCount: pendingReturns.length,
    pendingReturns,
    activeDiscrepanciesCount: activeDiscrepancies.length,
    activeDiscrepancies,
    inUseCount: inUseAllocations.length,
  };
};

module.exports = {
  createStockItem,
  getStockItems,
  getStockItemById,
  updateStockItem,
  addStock,
  adjustInventory,
  deleteStockItem,
  getEventStock,
  addEventStockRequirement,
  assignStaffToStock,
  removeEventStockRequirement,
  getStaffAssignedStock,
  holdStock,
  releaseStockHold,
  takeStock,
  returnStock,
  verifyStockReturn,
  reportDiscrepancy,
  getStockTransactions,
  getStaffStockSummary,
  getManagerStockSummary,
  getManagerStockDashboardSummary: getManagerStockSummary,
};
