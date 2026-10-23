const expenseService = require("../services/expense.service");

const getExpenses = async (req, res, next) => {
  try {
    const data = await expenseService.getExpenses({
      ...req.query,
      requester: req.user,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const createExpense = async (req, res, next) => {
  try {
    const data = await expenseService.createExpense(
      req.body,
      req.user?.userId || null,
      req.file
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updateExpense = async (req, res, next) => {
  try {
    const data = await expenseService.updateExpense(
      req.params.id,
      req.body,
      req.user?.userId || null,
      req.file
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const deleteExpense = async (req, res, next) => {
  try {
    res.json(await expenseService.deleteExpense(req.params.id));
  } catch (error) {
    next(error);
  }
};

const toggleExpenseStatus = async (req, res, next) => {
  try {
    res.json({ success: true, data: await expenseService.toggleExpenseStatus(req.params.id) });
  } catch (error) {
    next(error);
  }
};

const getEventProfitability = async (req, res, next) => {
  try {
    const result = await expenseService.getEventProfitability(req.params.eventId);
    const userRole = (req.user?.role || "").toLowerCase();
    const isSuperAdmin = userRole === "superadmin" || userRole === "admin";

    // Net Operating Profit should only be viewed by Super Admin
    if (!isSuperAdmin && result) {
      result.profitability = {
        netProfit: null,
        profitMargin: null,
        healthStatus: null,
      };
      if (result.revenue) {
        result.revenue = null;
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getExpenseReceipt = async (req, res, next) => {
  try {
    const receipt = await expenseService.getExpenseReceipt(req.params.id, req.user);
    res.setHeader("Content-Type", receipt.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(receipt.originalName)}"`
    );
    if (receipt.size) {
      res.setHeader("Content-Length", receipt.size);
    }
    res.sendFile(receipt.filePath);
  } catch (error) {
    next(error);
  }
};

const getExpenseCreators = async (req, res, next) => {
  try {
    const data = await expenseService.getExpenseCreators(req.query.eventId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  toggleExpenseStatus,
  getEventProfitability,
  getExpenseReceipt,
  getExpenseCreators,
};