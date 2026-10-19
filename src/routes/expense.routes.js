const express = require("express");
const {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  toggleExpenseStatus,
  getEventProfitability,
} = require("../controllers/expense.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

// Restrict Chef Manager and specific non-financial department managers from general expenses
const requireExpenseAccess = (req, res, next) => {
  const role = (req.user?.role || "").toLowerCase();
  if (role === "superadmin" || role === "admin") return next();
  const dept = (req.user?.department || "").toLowerCase();
  if (
    dept.includes("kitchen") ||
    dept.includes("catering") ||
    dept.includes("chef") ||
    dept.includes("cook")
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied: Chef Managers do not have permission to view or manage expenses",
    });
  }
  next();
};

const router = express.Router();
router.use(authenticate, authorize("Manager"), requireExpenseAccess);
router.get("/", getExpenses);
router.get("/event/:eventId/profitability", getEventProfitability);
router.post("/", createExpense);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);
router.patch("/:id/status", toggleExpenseStatus);

module.exports = router;