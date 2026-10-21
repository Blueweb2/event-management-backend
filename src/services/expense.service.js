const mongoose = require("mongoose");
const Expense = require("../models/expense.model");
const Event = require("../models/event.model");
const Booking = require("../models/booking.model");
const Duty = require("../models/duty.model");
const User = require("../models/user.model");
const path = require("path");
const fs = require("fs");

const categoryAliases = {
  Catering: ["Catering", "Food"],
  Food: ["Catering", "Food"],
  "Equipment Rental": ["Equipment Rental", "Equipment"],
  Equipment: ["Equipment Rental", "Equipment"],
  Miscellaneous: ["Miscellaneous", "Other"],
  Other: ["Miscellaneous", "Other"],
  Transport: ["Transport"],
  Decoration: ["Decoration"],
  Staff: ["Staff"],
  Venue: ["Venue"],
  Cleaning: ["Cleaning"],
};

const calculateDutyDurationHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const parseToMinutes = (timeStr) => {
    const trimmed = String(timeStr).trim();
    if (!trimmed) return NaN;
    const isPM = /pm/i.test(trimmed);
    const isAM = /am/i.test(trimmed);
    const cleanStr = trimmed.replace(/am|pm/i, "").trim();
    const parts = cleanStr.split(":");
    if (parts.length < 2) return NaN;
    let hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return NaN;
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    return hour * 60 + minute;
  };
  const startMins = parseToMinutes(startTime);
  const endMins = parseToMinutes(endTime);
  if (Number.isNaN(startMins) || Number.isNaN(endMins)) return 0;
  let diff = endMins - startMins;
  if (diff < 0) diff += 24 * 60; // In case shift spans across midnight
  return Number((diff / 60).toFixed(2));
};

const normalize = async (data, file) => {
  const result = {
    title: String(data.title || "").trim(),
    category: data.category,
    amount: Number(data.amount),
    event: String(data.event || "").trim(),
    eventId: data.eventId || null,
    date: String(data.date || "").trim(),
    paymentMethod: data.paymentMethod,
    status: data.status || "Pending",
    description: String(data.description || "").trim(),
    vendorName: String(data.vendorName || "").trim(),
  };

  // If eventId is provided, resolve event name if event name is missing
  if (result.eventId && !result.event && mongoose.isValidObjectId(result.eventId)) {
    const eventDoc = await Event.findById(result.eventId).select("eventName").lean();
    if (eventDoc?.eventName) {
      result.event = eventDoc.eventName;
    }
  }

  // If event is an ObjectId string, map to eventId
  if (!result.eventId && result.event && mongoose.isValidObjectId(result.event)) {
    result.eventId = result.event;
    const eventDoc = await Event.findById(result.event).select("eventName").lean();
    if (eventDoc?.eventName) {
      result.event = eventDoc.eventName;
    }
  }

  if (file) {
    result.receiptPath = file.filename;
    result.receiptOriginalName = file.originalname || "";
    result.receiptMimeType = file.mimetype || "";
    result.receiptSize = file.size || 0;
  } else if (data.removeReceipt === "true" || data.removeReceipt === true) {
    result.receiptPath = "";
    result.receiptOriginalName = "";
    result.receiptMimeType = "";
    result.receiptSize = 0;
  }

  return result;
};

const validate = (data) => {
  if (!data.title || !data.event || !data.date)
    throw new Error("Title, event, and date are required");
  if (!Number.isFinite(data.amount) || data.amount <= 0)
    throw new Error("Expense amount must be greater than zero");
};

const formatExpenseDoc = (doc) => {
  if (!doc) return null;
  const createdBy = doc.createdBy
    ? (typeof doc.createdBy === "object" ? doc.createdBy : { _id: String(doc.createdBy) })
    : null;
  const createdByName = createdBy?.name || createdBy?.username || "";
  return {
    ...doc,
    hasReceipt: Boolean(doc.receiptPath),
    createdByName,
  };
};

const getExpenses = async ({
  search = "",
  category = "",
  paymentMethod = "",
  status = "",
  eventId = "",
  createdBy = "",
  startDate = "",
  endDate = "",
  requester = null,
} = {}) => {
  const andConditions = [];

  if (category && category !== "All") {
    const mapped = categoryAliases[category] || [category];
    andConditions.push({ category: { $in: mapped } });
  }

  if (paymentMethod && paymentMethod !== "All") {
    andConditions.push({ paymentMethod });
  }

  if (status && status !== "All") {
    andConditions.push({ status });
  }

  if (createdBy && createdBy !== "All") {
    andConditions.push({ createdBy });
  }

  if (startDate || endDate) {
    const dateQuery = {};
    if (startDate) dateQuery.$gte = startDate;
    if (endDate) dateQuery.$lte = endDate;
    andConditions.push({ date: dateQuery });
  }

  if (eventId && eventId !== "All") {
    if (mongoose.isValidObjectId(eventId)) {
      const eventDoc = await Event.findById(eventId).select("eventName").lean();
      const orClauses = [
        { eventId: new mongoose.Types.ObjectId(eventId) },
        { event: eventId },
      ];
      if (eventDoc && eventDoc.eventName) {
        orClauses.push({ event: eventDoc.eventName });
      }
      andConditions.push({ $or: orClauses });
    } else {
      andConditions.push({
        $or: [{ event: eventId }],
      });
    }
  }

  // Server-side authorization check:
  // Staff members are constrained to expenses they recorded or events they have assignments for
  const requesterRole = (requester?.role || "").toLowerCase();
  if (requesterRole === "staff" && requester?.userId) {
    const staffDuties = await Duty.find({ staff: requester.userId }).select("event").lean();
    const assignedEventIds = staffDuties.map((d) => d.event).filter(Boolean);
    const assignedEventDocs = await Event.find({ _id: { $in: assignedEventIds } }).select("eventName").lean();
    const assignedEventNames = assignedEventDocs.map((e) => e.eventName);

    andConditions.push({
      $or: [
        { createdBy: requester.userId },
        { eventId: { $in: assignedEventIds } },
        { event: { $in: assignedEventNames } },
      ],
    });
  }

  if (search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    andConditions.push({
      $or: [
        { title: regex },
        { event: regex },
        { category: regex },
        { description: regex },
        { vendorName: regex },
      ],
    });
  }

  const query = andConditions.length > 0 ? { $and: andConditions } : {};

  const expenses = await Expense.find(query)
    .populate("createdBy", "name username email role department")
    .populate("eventId", "eventName eventDate location status")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  return expenses.map(formatExpenseDoc);
};

const createExpense = async (data, userId, file) => {
  const payload = await normalize(data, file);
  validate(payload);
  const expense = await Expense.create({ ...payload, createdBy: userId });
  const populated = await Expense.findById(expense._id)
    .populate("createdBy", "name username email role department")
    .populate("eventId", "eventName eventDate location status")
    .lean();
  return formatExpenseDoc(populated);
};

const updateExpense = async (id, data, userId, file) => {
  const payload = await normalize(data, file);
  validate(payload);

  const existing = await Expense.findById(id);
  if (!existing) throw new Error("Expense not found");

  // If a new file is uploaded or receipt is removed, remove old file if present
  if ((file || data.removeReceipt === "true" || data.removeReceipt === true) && existing.receiptPath) {
    try {
      const oldPath = path.join(__dirname, "../../uploads/receipts", existing.receiptPath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    } catch (err) {
      console.warn("Could not remove old receipt file:", err.message);
    }
  }

  const expense = await Expense.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  })
    .populate("createdBy", "name username email role department")
    .populate("eventId", "eventName eventDate location status")
    .lean();

  return formatExpenseDoc(expense);
};

const deleteExpense = async (id) => {
  const expense = await Expense.findById(id);
  if (!expense) throw new Error("Expense not found");

  if (expense.receiptPath) {
    try {
      const filePath = path.join(__dirname, "../../uploads/receipts", expense.receiptPath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn("Could not delete receipt file:", err.message);
    }
  }

  await Expense.findByIdAndDelete(id);
  return { success: true, message: "Expense deleted successfully" };
};

const toggleExpenseStatus = async (id) => {
  const expense = await Expense.findById(id);
  if (!expense) throw new Error("Expense not found");
  expense.status = expense.status === "Paid" ? "Pending" : "Paid";
  await expense.save();
  return Expense.findById(expense._id)
    .populate("createdBy", "name username email role department")
    .populate("eventId", "eventName eventDate location status")
    .lean();
};

/**
 * Calculates event profitability metrics:
 * Compares Event Revenue (from booking services & catering) against direct expenses & automated staff payroll
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

  // Fetch all logged expenses linked to this event (by eventId OR matching eventName)
  const eventQuery = {
    $or: [{ eventId: event._id }, { event: event.eventName }],
  };
  const expenses = await Expense.find(eventQuery)
    .sort({ date: -1, createdAt: -1 })
    .lean();

  // Fetch all staff duty assignments for this event / booking
  const dutyQuery = {
    $or: [
      { event: event._id },
      ...(event.booking ? [{ event: event.booking }] : []),
    ],
    status: { $nin: ["CANCELLED", "REJECTED"] },
  };

  const duties = await Duty.find(dutyQuery)
    .populate("staff", "name email role department")
    .lean();

  // Calculate automatic staff duty payroll deductions
  let autoStaffPayrollTotal = 0;
  let autoStaffPayrollPaid = 0;
  let autoStaffPayrollPending = 0;

  const staffDutyBreakdown = duties.map((duty) => {
    let hours = Number(duty.totalHours) || 0;
    if (hours <= 0) {
      hours = calculateDutyDurationHours(duty.startTime, duty.endTime);
    }
    const hourlyRate = Number(duty.hourlyRate) || 0;
    let amount = Number(duty.totalAmount) || 0;
    if (amount <= 0 && hourlyRate > 0 && hours > 0) {
      amount = Number((hours * hourlyRate).toFixed(2));
    }
    const isPaid = duty.paymentStatus === "PAID";
    autoStaffPayrollTotal += amount;
    if (isPaid) {
      autoStaffPayrollPaid += amount;
    } else {
      autoStaffPayrollPending += amount;
    }
    return {
      id: String(duty._id),
      staffName: duty.staff?.name || "Event Staff",
      role: duty.role || duty.dutyTitle || "Staff",
      department: duty.department || "",
      dutyDate: duty.dutyDate,
      startTime: duty.startTime,
      endTime: duty.endTime,
      hours,
      hourlyRate,
      amount,
      paymentStatus: duty.paymentStatus || "PENDING",
      status: duty.status,
    };
  });

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

  // Add manually logged expenses
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

  // Automatically incorporate staff duty payroll into Staff costs & total costs
  categoryTotals.Staff += autoStaffPayrollTotal;
  totalExpenses += autoStaffPayrollTotal;
  paidExpenses += autoStaffPayrollPaid;
  pendingExpenses += autoStaffPayrollPending;

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
    staffPayroll: {
      total: autoStaffPayrollTotal,
      paid: autoStaffPayrollPaid,
      pending: autoStaffPayrollPending,
      count: duties.length,
      duties: staffDutyBreakdown,
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

const getExpenseReceipt = async (id, requester) => {
  const expense = await Expense.findById(id).lean();
  if (!expense) {
    const error = new Error("Expense not found");
    error.statusCode = 404;
    throw error;
  }

  if (!expense.receiptPath) {
    const error = new Error("No receipt attached to this expense");
    error.statusCode = 404;
    throw error;
  }

  const uploadDir = path.join(__dirname, "../../uploads/receipts");
  const filePath = path.resolve(uploadDir, expense.receiptPath);

  // Security guard against path traversal
  if (!filePath.startsWith(uploadDir)) {
    const error = new Error("Invalid receipt path");
    error.statusCode = 403;
    throw error;
  }

  if (!fs.existsSync(filePath)) {
    const error = new Error("Receipt file not found on disk");
    error.statusCode = 404;
    throw error;
  }

  const mimeType = expense.receiptMimeType || "application/octet-stream";
  const originalName = expense.receiptOriginalName || path.basename(filePath);
  const size = expense.receiptSize || 0;

  return { filePath, mimeType, originalName, size };
};

const getExpenseCreators = async (eventId = null) => {
  if (eventId && eventId !== "All") {
    let eventConditions = [];
    if (mongoose.isValidObjectId(eventId)) {
      const eventDoc = await Event.findById(eventId).select("eventName").lean();
      eventConditions = [
        { eventId: new mongoose.Types.ObjectId(eventId) },
        { event: eventId },
      ];
      if (eventDoc?.eventName) {
        eventConditions.push({ event: eventDoc.eventName });
      }
    } else {
      eventConditions = [{ event: eventId }];
    }

    const expenseCreatorIds = await Expense.distinct("createdBy", {
      $or: eventConditions,
      createdBy: { $ne: null },
    });

    const dutyStaffIds = mongoose.isValidObjectId(eventId)
      ? await Duty.distinct("staff", { event: eventId })
      : [];

    const allowedUserIds = Array.from(
      new Set([...expenseCreatorIds.map(String), ...dutyStaffIds.map(String)])
    ).filter(Boolean);

    const users = await User.find({
      $or: [
        { _id: { $in: allowedUserIds } },
        { role: { $in: ["manager", "admin", "superadmin"] }, isActive: true },
      ],
    })
      .select("name username email role department isActive")
      .sort({ name: 1 })
      .lean();

    return users.map((u) => ({
      id: u._id.toString(),
      _id: u._id.toString(),
      name: u.name || u.username,
      username: u.username,
      email: u.email,
      role: u.role,
      department: u.department,
    }));
  }

  // Find all active staff, managers, and admins plus any users who have created an expense
  const expenseCreatorIds = await Expense.distinct("createdBy", { createdBy: { $ne: null } });
  const users = await User.find({
    $or: [
      { _id: { $in: expenseCreatorIds } },
      { role: { $in: ["manager", "admin", "superadmin", "staff"] }, isActive: true },
    ],
  })
    .select("name username email role department isActive")
    .sort({ name: 1 })
    .lean();

  return users.map((u) => ({
    id: u._id.toString(),
    _id: u._id.toString(),
    name: u.name || u.username,
    username: u.username,
    email: u.email,
    role: u.role,
    department: u.department,
  }));
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