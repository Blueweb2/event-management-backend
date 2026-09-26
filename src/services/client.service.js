const Client = require("../models/client.model");
const Booking = require("../models/booking.model");
const Event = require("../models/event.model");

// ==========================================
// Create Client
// ==========================================

const createClient = async (clientData, userId = null) => {
  const client = await Client.create({
    ...clientData,
    createdBy: userId,
  });

  return client;
};

// ==========================================
// Get All Clients
// ==========================================

const getClients = async ({
  search = "",
  status = "",
  page = 1,
  limit = 20,
} = {}) => {
  const query = {};

  // ------------------------------------------
  // Status filter
  // ------------------------------------------

  if (status) {
    query.status = status;
  }

  // ------------------------------------------
  // Search
  // ------------------------------------------

  if (search.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");

    query.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { alternatePhone: searchRegex },
      { city: searchRegex },
    ];
  }

  // ------------------------------------------
  // Pagination
  // ------------------------------------------

  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = Math.min(
    Math.max(Number(limit) || 20, 1),
    1000
  );

  const skip = (currentPage - 1) * perPage;

  const [clients, total] = await Promise.all([
    Client.find(query)
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage),

    Client.countDocuments(query),
  ]);

  return {
    clients,
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
};

// ==========================================
// Get Client By ID
// ==========================================

const getClientById = async (clientId) => {
  const client = await Client.findById(clientId).populate(
    "createdBy",
    "name email role"
  );

  if (!client) {
    const error = new Error("Client not found");
    error.statusCode = 404;
    throw error;
  }

  return client;
};

// ==========================================
// Get Client Details with Events & Payment Breakdown
// ==========================================

const getClientDetailsWithEventsAndPayments = async (clientId) => {
  const client = await Client.findById(clientId).populate(
    "createdBy",
    "name email role"
  );

  if (!client) {
    const error = new Error("Client not found");
    error.statusCode = 404;
    throw error;
  }

  // Fetch Bookings for this client
  const bookings = await Booking.find({ client: clientId })
    .sort({ createdAt: -1 })
    .lean();

  // Fetch Events for this client
  const events = await Event.find({ client: clientId })
    .populate("booking")
    .sort({ eventDate: -1 })
    .lean();

  // Compute overall client financial summary
  let totalContractValue = 0;
  let totalPaidAmount = 0;
  let totalAdvancePayment = 0;

  bookings.forEach((b) => {
    totalContractValue += b.total || 0;
    totalPaidAmount += b.paidAmount || 0;
    totalAdvancePayment += b.advancePayment || 0;
  });

  const totalBalanceDue = Math.max(0, Number((totalContractValue - totalPaidAmount).toFixed(2)));
  let overallPaymentStatus = "UNPAID";
  if (totalPaidAmount >= totalContractValue && totalContractValue > 0) {
    overallPaymentStatus = "PAID";
  } else if (totalPaidAmount > 0) {
    overallPaymentStatus = "PARTIAL";
  }

  return {
    client,
    bookings,
    events,
    financialSummary: {
      totalBookingsCount: bookings.length,
      totalEventsCount: events.length,
      totalContractValue: Number(totalContractValue.toFixed(2)),
      totalPaidAmount: Number(totalPaidAmount.toFixed(2)),
      totalAdvancePayment: Number(totalAdvancePayment.toFixed(2)),
      totalBalanceDue,
      overallPaymentStatus,
    },
  };
};

// ==========================================
// Update Client
// ==========================================

const updateClient = async (clientId, updateData) => {
  // Don't allow these fields to be changed
  // through the normal update API.
  delete updateData.createdBy;

  const client = await Client.findByIdAndUpdate(
    clientId,
    updateData,
    {
      new: true,
      runValidators: true,
    }
  ).populate("createdBy", "name email role");

  if (!client) {
    const error = new Error("Client not found");
    error.statusCode = 404;
    throw error;
  }

  return client;
};

// ==========================================
// Deactivate Client
// ==========================================

const deactivateClient = async (clientId) => {
  const client = await Client.findByIdAndUpdate(
    clientId,
    {
      status: "Inactive",
    },
    {
      new: true,
      runValidators: true,
    }
  ).populate("createdBy", "name email role");

  if (!client) {
    const error = new Error("Client not found");
    error.statusCode = 404;
    throw error;
  }

  return client;
};

// ==========================================
// Activate Client
// ==========================================

const activateClient = async (clientId) => {
  const client = await Client.findByIdAndUpdate(
    clientId,
    {
      status: "Active",
    },
    {
      new: true,
      runValidators: true,
    }
  ).populate("createdBy", "name email role");

  if (!client) {
    const error = new Error("Client not found");
    error.statusCode = 404;
    throw error;
  }

  return client;
};

// ==========================================
// Export
// ==========================================

module.exports = {
  createClient,
  getClients,
  getClientById,
  getClientDetailsWithEventsAndPayments,
  updateClient,
  deactivateClient,
  activateClient,
};