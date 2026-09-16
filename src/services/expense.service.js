const Expense = require("../models/expense.model");

const normalize = (data) => ({
  title: String(data.title || "").trim(),
  category: data.category,
  amount: Number(data.amount),
  event: String(data.event || "").trim(),
  date: String(data.date || "").trim(),
  paymentMethod: data.paymentMethod,
  status: data.status || "Pending",
  description: String(data.description || "").trim(),
});

const validate = (data) => {
  if (!data.title || !data.event || !data.date) throw new Error("Title, event, and date are required");
  if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error("Expense amount must be greater than zero");
};

const getExpenses = async ({ search = "", category = "", paymentMethod = "", status = "" } = {}) => {
  const query = {};
  if (category) query.category = category;
  if (paymentMethod) query.paymentMethod = paymentMethod;
  if (status) query.status = status;
  if (search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [{ title: regex }, { event: regex }, { category: regex }, { description: regex }];
  }
  return Expense.find(query).sort({ date: -1, createdAt: -1 }).lean();
};

const createExpense = async (data, userId) => {
  const payload = normalize(data);
  validate(payload);
  return (await Expense.create({ ...payload, createdBy: userId })).toObject();
};

const updateExpense = async (id, data) => {
  const payload = normalize(data);
  validate(payload);
  const expense = await Expense.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).lean();
  if (!expense) throw new Error("Expense not found");
  return expense;
};

const deleteExpense = async (id) => {
  const expense = await Expense.findByIdAndDelete(id);
  if (!expense) throw new Error("Expense not found");
  return { success: true, message: "Expense deleted successfully" };
};

const toggleExpenseStatus = async (id) => {
  const expense = await Expense.findById(id);
  if (!expense) throw new Error("Expense not found");
  expense.status = expense.status === "Paid" ? "Pending" : "Paid";
  await expense.save();
  return expense.toObject();
};

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense, toggleExpenseStatus };