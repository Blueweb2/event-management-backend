const clientService = require("../services/client.service");

// ==========================================
// Create Client
// ==========================================

const createClient = async (req, res, next) => {
  try {
    const client = await clientService.createClient(
      req.body,
      req.user?.userId || null
    );

    return res.status(201).json({
      success: true,
      message: "Client created successfully",
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Get All Clients
// ==========================================

const getClients = async (req, res, next) => {
  try {
    const {
      search = "",
      status = "",
      page = 1,
      limit = 20,
    } = req.query;

    const result = await clientService.getClients({
      search,
      status,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      message: "Clients retrieved successfully",
      data: result.clients,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Get Client By ID
// ==========================================

const getClientById = async (req, res, next) => {
  try {
    const client = await clientService.getClientById(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Client retrieved successfully",
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Update Client
// ==========================================

const updateClient = async (req, res, next) => {
  try {
    const client = await clientService.updateClient(
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Client updated successfully",
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Deactivate Client
// ==========================================

const deactivateClient = async (req, res, next) => {
  try {
    const client = await clientService.deactivateClient(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Client deactivated successfully",
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Activate Client
// ==========================================

const activateClient = async (req, res, next) => {
  try {
    const client = await clientService.activateClient(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Client activated successfully",
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Export
// ==========================================

module.exports = {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deactivateClient,
  activateClient,
};