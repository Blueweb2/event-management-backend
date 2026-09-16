const express = require("express");
const {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  toggleExpenseStatus,
} = require("../controllers/expense.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();
router.use(authenticate, authorize("Manager"));
router.get("/", getExpenses);
router.post("/", createExpense);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);
router.patch("/:id/status", toggleExpenseStatus);

module.exports = router;