const expenseService = require("../services/expense.service");

const getExpenses = async (req, res, next) => {
  try { res.json({ success: true, data: await expenseService.getExpenses(req.query) }); }
  catch (error) { next(error); }
};

const createExpense = async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await expenseService.createExpense(req.body, req.user?.userId || null) }); }
  catch (error) { next(error); }
};

const updateExpense = async (req, res, next) => {
  try { res.json({ success: true, data: await expenseService.updateExpense(req.params.id, req.body) }); }
  catch (error) { next(error); }
};

const deleteExpense = async (req, res, next) => {
  try { res.json(await expenseService.deleteExpense(req.params.id)); }
  catch (error) { next(error); }
};

const toggleExpenseStatus = async (req, res, next) => {
  try { res.json({ success: true, data: await expenseService.toggleExpenseStatus(req.params.id) }); }
  catch (error) { next(error); }
};

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense, toggleExpenseStatus };