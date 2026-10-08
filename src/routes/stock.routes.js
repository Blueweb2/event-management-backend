const express = require("express");
const {
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
} = require("../controllers/stock.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();

// ==========================================
// Staff Dedicated Routes
// ==========================================

router.get(
  "/staff/my-stock",
  authenticate,
  authorize("admin", "manager", "staff"),
  getStaffAssignedStock
);

router.get(
  "/staff/summary",
  authenticate,
  authorize("admin", "manager", "staff"),
  getStaffStockSummary
);

// Staff Hold & Release Hold Actions
router.post(
  "/staff/hold",
  authenticate,
  authorize("admin", "manager", "staff"),
  holdStock
);

router.post(
  "/staff/hold/:eventStockId/release",
  authenticate,
  authorize("admin", "manager", "staff"),
  releaseStockHold
);

router.post(
  "/allocations/:eventStockId/release",
  authenticate,
  authorize("admin", "manager", "staff"),
  releaseStockHold
);

// Staff Take & Return Actions
router.post(
  "/allocations/:eventStockId/take",
  authenticate,
  authorize("admin", "manager", "staff"),
  takeStock
);

router.post(
  "/allocations/:eventStockId/return",
  authenticate,
  authorize("admin", "manager", "staff"),
  returnStock
);

// ==========================================
// Manager Event Stock Allocations & Verifications
// ==========================================

router.get(
  "/events/:eventId",
  authenticate,
  authorize("admin", "manager", "staff"),
  getEventStock
);

router.post(
  "/events/:eventId/requirements",
  authenticate,
  authorize("admin", "manager"),
  addEventStockRequirement
);

router.post(
  "/allocations/:eventStockId/assign",
  authenticate,
  authorize("admin", "manager"),
  assignStaffToStock
);

router.delete(
  "/allocations/:eventStockId",
  authenticate,
  authorize("admin", "manager"),
  removeEventStockRequirement
);

router.post(
  "/allocations/:eventStockId/verify",
  authenticate,
  authorize("admin", "manager"),
  verifyStockReturn
);

router.post(
  "/allocations/:eventStockId/discrepancy",
  authenticate,
  authorize("admin", "manager"),
  reportDiscrepancy
);

// ==========================================
// Master Inventory & Management
// ==========================================

router.get(
  "/dashboard-summary",
  authenticate,
  authorize("admin", "manager"),
  getManagerStockDashboardSummary
);

router.get(
  "/transactions",
  authenticate,
  authorize("admin", "manager"),
  getStockTransactions
);

router.get(
  "/items",
  authenticate,
  authorize("admin", "manager", "staff"),
  getStockItems
);

router.post(
  "/items",
  authenticate,
  authorize("admin", "manager"),
  createStockItem
);

router.get(
  "/items/:id",
  authenticate,
  authorize("admin", "manager", "staff"),
  getStockItemById
);

router.put(
  "/items/:id",
  authenticate,
  authorize("admin", "manager"),
  updateStockItem
);

router.post(
  "/items/:id/add",
  authenticate,
  authorize("admin", "manager"),
  addStock
);

router.post(
  "/items/:id/adjust",
  authenticate,
  authorize("admin", "manager"),
  adjustInventory
);

router.delete(
  "/items/:id",
  authenticate,
  authorize("admin", "manager"),
  deleteStockItem
);

module.exports = router;
