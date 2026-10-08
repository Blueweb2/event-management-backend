const stockService = require("../services/stock.service");

// ==========================================
// Master Stock Handlers (Manager)
// ==========================================

const createStockItem = async (req, res, next) => {
  try {
    const item = await stockService.createStockItem(req.body, req.user.userId);
    res.status(201).json({
      success: true,
      message: "Stock item created successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

const getStockItems = async (req, res, next) => {
  try {
    const data = await stockService.getStockItems(req.query);
    res.status(200).json({
      success: true,
      data: data.items,
      pagination: {
        total: data.total,
        page: data.page,
        totalPages: data.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getStockItemById = async (req, res, next) => {
  try {
    const data = await stockService.getStockItemById(req.params.id);
    res.status(200).json({
      success: true,
      data: data.item,
      recentTransactions: data.recentTransactions,
    });
  } catch (error) {
    next(error);
  }
};

const updateStockItem = async (req, res, next) => {
  try {
    const item = await stockService.updateStockItem(req.params.id, req.body, req.user.userId);
    res.status(200).json({
      success: true,
      message: "Stock item updated successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

const addStock = async (req, res, next) => {
  try {
    const item = await stockService.addStock(req.params.id, req.body, req.user.userId);
    res.status(200).json({
      success: true,
      message: "Stock added successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

const adjustInventory = async (req, res, next) => {
  try {
    const item = await stockService.adjustInventory(req.params.id, req.body, req.user.userId);
    res.status(200).json({
      success: true,
      message: "Inventory adjusted successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

const deleteStockItem = async (req, res, next) => {
  try {
    await stockService.deleteStockItem(req.params.id);
    res.status(200).json({
      success: true,
      message: "Stock item deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Event Stock Allocation Handlers (Manager)
// ==========================================

const getEventStock = async (req, res, next) => {
  try {
    const data = await stockService.getEventStock(req.params.eventId, req.user);
    res.status(200).json({
      success: true,
      data: data.allocations,
      event: data.event,
    });
  } catch (error) {
    next(error);
  }
};

const addEventStockRequirement = async (req, res, next) => {
  try {
    const allocation = await stockService.addEventStockRequirement(
      req.params.eventId,
      req.body,
      req.user.userId
    );
    res.status(201).json({
      success: true,
      message: "Stock requirement added to event",
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
};

const assignStaffToStock = async (req, res, next) => {
  try {
    const allocation = await stockService.assignStaffToStock(
      req.params.eventStockId,
      req.body,
      req.user.userId
    );
    res.status(200).json({
      success: true,
      message: "Staff member assigned to stock allocation",
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
};

const removeEventStockRequirement = async (req, res, next) => {
  try {
    await stockService.removeEventStockRequirement(req.params.eventStockId, req.user.userId);
    res.status(200).json({
      success: true,
      message: "Stock requirement removed and reservation released",
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Staff Take & Return Stock Handlers
// ==========================================

const getStaffAssignedStock = async (req, res, next) => {
  try {
    const staffId = req.user.role === "staff" ? req.user.userId : req.query.staffId || req.user.userId;
    const data = await stockService.getStaffAssignedStock(staffId, req.query);
    res.status(200).json({
      success: true,
      data: data.allocations,
      movements: data.movements,
    });
  } catch (error) {
    next(error);
  }
};

const holdStock = async (req, res, next) => {
  try {
    const result = await stockService.holdStock(req.body, req.user);
    res.status(201).json({
      success: true,
      message: "Stock successfully held and email notification sent to manager",
      data: result.allocation,
      movement: result.movement,
    });
  } catch (error) {
    next(error);
  }
};

const releaseStockHold = async (req, res, next) => {
  try {
    const result = await stockService.releaseStockHold(req.params.eventStockId, req.user);
    res.status(200).json({
      success: true,
      message: "Stock hold released back to available inventory",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const takeStock = async (req, res, next) => {
  try {
    const result = await stockService.takeStock(req.params.eventStockId, req.body, req.user);
    res.status(200).json({
      success: true,
      message: "Stock confirmed as taken for event",
      data: result.allocation,
      movement: result.movement,
    });
  } catch (error) {
    next(error);
  }
};

const returnStock = async (req, res, next) => {
  try {
    const result = await stockService.returnStock(req.params.eventStockId, req.body, req.user);
    res.status(200).json({
      success: true,
      message: "Stock return submitted for manager verification",
      data: result.allocation,
      movement: result.movement,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Manager Verification & Discrepancy
// ==========================================

const verifyStockReturn = async (req, res, next) => {
  try {
    const result = await stockService.verifyStockReturn(req.params.eventStockId, req.body, req.user);
    res.status(200).json({
      success: true,
      message: "Stock return verified and inventory updated",
      data: result.allocation,
      movement: result.movement,
    });
  } catch (error) {
    next(error);
  }
};

const reportDiscrepancy = async (req, res, next) => {
  try {
    const result = await stockService.reportDiscrepancy(req.params.eventStockId, req.body, req.user);
    res.status(200).json({
      success: true,
      message: "Discrepancy recorded on stock return",
      data: result.allocation,
      movement: result.movement,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Transactions & Summaries
// ==========================================

const getStockTransactions = async (req, res, next) => {
  try {
    const data = await stockService.getStockTransactions(req.query);
    res.status(200).json({
      success: true,
      data: data.transactions,
      pagination: {
        total: data.total,
        page: data.page,
        totalPages: data.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getStaffStockSummary = async (req, res, next) => {
  try {
    const staffId = req.user.role === "staff" ? req.user.userId : req.query.staffId || req.user.userId;
    const summary = await stockService.getStaffStockSummary(staffId);
    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

const getManagerStockDashboardSummary = async (req, res, next) => {
  try {
    const summary = await stockService.getManagerStockDashboardSummary();
    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
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
  getManagerStockDashboardSummary,
};
