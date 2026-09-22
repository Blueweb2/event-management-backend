const Expense = require("../models/expense.model");
const Event = require("../models/event.model");
const Booking = require("../models/booking.model");

const normalize = (data) => ({
  title: String(data.title || "").trim(),
  category: data.category,
  amount: Number(data.amount),
  event: String(data.event || "").trim(),
  eventId: data.eventId || null,
  date: String(data.date || "").trim(),
  paymentMethod: data.paymentMethod,
  status: data.status || "Pending",
  description: String(data.description || "").trim(),
});

const validate = (data) => {
  if (!data.title || !data.event || !data.date)
    throw new Error("Title, event, and date are required");
  if (!Number.isFinite(data.amount) || data.amount <= 0)
    throw new Error("Expense amount must be greater than zero");
};

const getExpenses = async ({
  search = "",
  category = "",
  paymentMethod = "",
  status = "",
  eventId = "",
} = {}) => {
  const query = {};
  if (category) query.category = category;
  if (paymentMethod) query.paymentMethod = paymentMethod;
  if (status) query.status = status;
  if (eventId) {
    query.$or = [{ eventId }, { event: eventId }];
  }

  if (search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    const searchFilter = [
      { title: regex },
      { event: regex },
      { category: regex },
      { description: regex },
    ];
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchFilter }];
      delete query.$or;
    } else {
      query.$or = searchFilter;
    }
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
  const expense = await Expense.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).lean();
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

/**
 * Calculates event profitability metrics:
 * Compares Event Revenue (from booking services & catering) against direct expenses
 */
const getEventProfitability = async (eventId) => {
  const event = await Event.findById(eventId)
    .populate("client", "name phone email")
    .populate("booking");

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const booking = event.booking || (await Booking.findById(event._id)) || {};

  // Fetch all expenses linked to this event (by eventId OR matching eventName)
  const eventQuery = {
    $or: [{ eventId: event._id }, { event: event.eventName }],
  };
  const expenses = await Expense.find(eventQuery)
    .sort({ date: -1, createdAt: -1 })
    .lean();

  // Revenue Breakdown
  const totalRevenue = Number(booking.total) || 0;
  const foodMenu = booking.foodMenu;
  const cateringRevenue =
    foodMenu && (foodMenu.included || (Array.isArray(foodMenu.items) && foodMenu.items.length > 0))
      ? Number(foodMenu.totalFoodAmount) || 0
      : 0;

  const bookedServices = Array.isArray(booking.services) ? booking.services : [];
  const servicesBreakdown = bookedServices.map((svc) => ({
    name: svc.serviceName,
    category: svc.category,
    amount: Number(svc.total) || 0,
    quantity: svc.quantity || 1,
    pricingType: svc.pricingType || "FIXED",
  }));

  const calculatedServicesRevenue = servicesBreakdown.reduce(
    (sum, s) => sum + s.amount,
    0
  );
  const servicesRevenue =
    calculatedServicesRevenue > 0
      ? calculatedServicesRevenue
      : Math.max(totalRevenue - cateringRevenue, 0);

  // Expenses Breakdown
  let totalExpenses = 0;
  let paidExpenses = 0;
  let pendingExpenses = 0;

  const categoryTotals = {
    Food: 0,
    Decoration: 0,
    Staff: 0,
    Transport: 0,
    Venue: 0,
    Equipment: 0,
    Other: 0,
  };

  expenses.forEach((exp) => {
    const amt = Number(exp.amount) || 0;
    totalExpenses += amt;
    if (exp.status === "Paid") paidExpenses += amt;
    else pendingExpenses += amt;

    const cat = categoryTotals.hasOwnProperty(exp.category)
      ? exp.category
      : "Other";
    categoryTotals[cat] += amt;
  });

  const cateringExpenses = categoryTotals.Food;
  const servicesExpenses = totalExpenses - cateringExpenses;

  // Profitability Metrics
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin =
    totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

  const cateringProfit = cateringRevenue - cateringExpenses;
  const cateringMargin =
    cateringRevenue > 0
      ? Number(((cateringProfit / cateringRevenue) * 100).toFixed(1))
      : 0;

  const servicesProfit = servicesRevenue - servicesExpenses;
  const servicesMargin =
    servicesRevenue > 0
      ? Number(((servicesProfit / servicesRevenue) * 100).toFixed(1))
      : 0;

  let healthStatus = "HEALTHY";
  if (netProfit < 0 || profitMargin < 15) {
    healthStatus = "RISK";
  } else if (profitMargin < 30) {
    healthStatus = "MODERATE";
  }

  // Cost distribution percentages
  const categoryDistribution = Object.entries(categoryTotals).map(
    ([cat, amount]) => ({
      category: cat,
      amount,
      percentage:
        totalExpenses > 0
          ? Number(((amount / totalExpenses) * 100).toFixed(1))
          : 0,
    })
  );

  return {
    event: {
      id: event._id,
      eventName: event.eventName,
      eventType: event.eventType,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      guests: event.guests,
      location: event.location,
      status: event.status,
      client: event.client,
    },
    revenue: {
      total: totalRevenue,
      cateringRevenue,
      servicesRevenue,
      servicesBreakdown,
      currency: booking.currency || "INR",
    },
    expenses: {
      total: totalExpenses,
      paid: paidExpenses,
      pending: pendingExpenses,
      cateringExpenses,
      servicesExpenses,
      byCategory: categoryTotals,
      distribution: categoryDistribution,
      count: expenses.length,
      list: expenses,
    },
    profitability: {
      netProfit,
      profitMargin,
      cateringProfit,
      cateringMargin,
      servicesProfit,
      servicesMargin,
      healthStatus,
    },
  };
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  toggleExpenseStatus,
  getEventProfitability,
};