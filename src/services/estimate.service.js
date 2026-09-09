const Estimate = require("../models/estimate.model");

const {
  calculateServicesTotal,
  calculateEstimateTotal,
} = require("./pricing.service");

const generateEstimateNumber = require("../utils/generateEstimateNumber");

// ==========================================
// CREATE ESTIMATE
// ==========================================

/**
 * Create a new estimate.
 *
 * IMPORTANT:
 * - Never trust unitPrice from frontend.
 * - Never trust serviceName from frontend.
 * - Never trust totals from frontend.
 * - Prices come from Service collection.
 * - Pricing is calculated by pricing.service.js.
 * - Calculated prices are stored as snapshots.
 */

const createEstimate = async ({
  eventName,
  eventType,
  eventDate,
  eventTime,
  guests,
  location,
  description,

  client,

  services,

  discountType = "percentage",
  discountValue = 0,
  additionalCharges = 0,

  createdBy = null,
}) => {
  // ========================================
  // Event validation
  // ========================================

  if (!eventName?.trim()) {
    throw new Error(
      "Event name is required",
    );
  }

  if (!eventType?.trim()) {
    throw new Error(
      "Event type is required",
    );
  }

  if (!eventDate) {
    throw new Error(
      "Event date is required",
    );
  }

  if (!eventTime?.trim()) {
    throw new Error(
      "Event time is required",
    );
  }

  const guestCount =
    Number(guests);

  if (
    !Number.isInteger(
      guestCount,
    ) ||
    guestCount < 1
  ) {
    throw new Error(
      "Guest count must be a positive integer",
    );
  }

  if (!location?.trim()) {
    throw new Error(
      "Event location is required",
    );
  }

  if (!description?.trim()) {
    throw new Error(
      "Event description is required",
    );
  }

  // ========================================
  // Client validation
  // ========================================

  if (!client) {
    throw new Error(
      "Client details are required",
    );
  }

  if (!client.name?.trim()) {
    throw new Error(
      "Client name is required",
    );
  }

  if (!client.phone?.trim()) {
    throw new Error(
      "Client phone is required",
    );
  }

  if (!client.email?.trim()) {
    throw new Error(
      "Client email is required",
    );
  }

  // ========================================
  // Services validation
  // ========================================

  if (
    !Array.isArray(services) ||
    services.length === 0
  ) {
    throw new Error(
      "At least one service must be selected",
    );
  }

  for (
    const item of services
  ) {
    if (!item.serviceId) {
      throw new Error(
        "Each selected service must have a serviceId",
      );
    }

    // Quantity is required for
    // variable pricing types.
    if (
      item.quantity !==
        undefined &&
      item.quantity !== null
    ) {
      const quantity =
        Number(
          item.quantity,
        );

      if (
        !Number.isFinite(
          quantity,
        ) ||
        quantity < 1
      ) {
        throw new Error(
          "Service quantity must be at least 1",
        );
      }
    }
  }

  // ========================================
  // Calculate service pricing
  // ========================================

  /**
   * IMPORTANT:
   *
   * The frontend may send:
   *
   * serviceId
   * optionId
   * quantity
   *
   * But it cannot control:
   *
   * unitPrice
   * total
   * serviceName
   * category
   *
   * pricing.service.js gets those
   * values from MongoDB.
   */

  const pricingResult =
    await calculateServicesTotal({
      selectedServices:
        services,

      guests:
        guestCount,
    });

  // ========================================
  // Calculate estimate totals
  // ========================================

  const totals =
    calculateEstimateTotal({
      subtotal:
        pricingResult.subtotal,

      discountType,

      discountValue,

      additionalCharges,
    });

  // ========================================
  // Generate estimate number
  // ========================================

  const estimateNumber =
    await generateEstimateNumber();

  // ========================================
  // Create Estimate
  // ========================================

  const estimate =
    await Estimate.create({
      // ------------------------------------
      // Estimate number
      // ------------------------------------

      estimateNumber,

      // ------------------------------------
      // Event details
      // ------------------------------------

      eventName:
        eventName.trim(),

      eventType:
        eventType.trim(),

      eventDate,

      eventTime:
        eventTime.trim(),

      guests:
        guestCount,

      location:
        location.trim(),

      description:
        description.trim(),

      // ------------------------------------
      // Client
      // ------------------------------------

      client: {
        name:
          client.name.trim(),

        phone:
          client.phone.trim(),

        email:
          client.email
            .trim()
            .toLowerCase(),

        message:
          client.message?.trim() ||
          "",
      },

      // ------------------------------------
      // Price snapshots
      // ------------------------------------

      items:
        pricingResult.lineItems,

      // ------------------------------------
      // Pricing
      // ------------------------------------

      subtotal:
        totals.subtotal,

      discount:
        totals.discount,

      discountType:
        totals.discountType,

      discountValue:
        totals.discountValue,

      additionalCharges:
        totals.additionalCharges,

      // ------------------------------------
      // GST
      // ------------------------------------

      gstRate:
        totals.gstRate,

      gstAmount:
        totals.gstAmount,

      // ------------------------------------
      // Grand total
      // ------------------------------------

      total:
        totals.total,

      currency: "INR",

      // ------------------------------------
      // Status
      // ------------------------------------

      status: "DRAFT",

      // ------------------------------------
      // Created by
      // ------------------------------------

      createdBy,
    });

  return estimate;
};

// ==========================================
// GET ESTIMATE BY ID
// ==========================================

const getEstimateById = async (
  estimateId,
) => {
  if (!estimateId) {
    throw new Error(
      "Estimate ID is required",
    );
  }

  const estimate =
    await Estimate.findById(
      estimateId,
    )
      .populate(
        "createdBy",
        "name email role",
      )
      .populate(
        "items.serviceId",
        "name category",
      );

  if (!estimate) {
    throw new Error(
      "Estimate not found",
    );
  }

  return estimate;
};

// ==========================================
// GET ESTIMATES
// ==========================================

const getEstimates = async ({
  status,
  createdBy,
  page = 1,
  limit = 20,
}) => {
  const filter = {};

  // ========================================
  // Filters
  // ========================================

  if (status) {
    filter.status = status;
  }

  if (createdBy) {
    filter.createdBy =
      createdBy;
  }

  // ========================================
  // Pagination
  // ========================================

  const pageNumber =
    Math.max(
      Number(page) || 1,
      1,
    );

  const limitNumber =
    Math.min(
      Math.max(
        Number(limit) || 20,
        1,
      ),
      100,
    );

  const skip =
    (pageNumber - 1) *
    limitNumber;

  // ========================================
  // Query
  // ========================================

  const [
    estimates,
    total,
  ] = await Promise.all([
    Estimate.find(filter)
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limitNumber)
      .populate(
        "createdBy",
        "name email role",
      ),

    Estimate.countDocuments(
      filter,
    ),
  ]);

  // ========================================
  // Response
  // ========================================

  return {
    estimates,

    pagination: {
      page: pageNumber,

      limit: limitNumber,

      total,

      totalPages:
        Math.ceil(
          total / limitNumber,
        ),
    },
  };
};

// ==========================================
// UPDATE ESTIMATE STATUS
// ==========================================

const updateEstimateStatus = async ({
  estimateId,
  status,
}) => {
  if (!estimateId) {
    throw new Error(
      "Estimate ID is required",
    );
  }

  const allowedStatuses = [
    "DRAFT",
    "SENT",
    "VIEWED",
    "ACCEPTED",
    "REJECTED",
    "EXPIRED",
    "CANCELLED",
  ];

  if (
    !allowedStatuses.includes(
      status,
    )
  ) {
    throw new Error(
      `Invalid estimate status: ${status}`,
    );
  }

  const updateData = {
    status,
  };

  // ========================================
  // Status timestamps
  // ========================================

  if (status === "SENT") {
    updateData.sentAt =
      new Date();
  }

  if (status === "VIEWED") {
    updateData.viewedAt =
      new Date();
  }

  if (status === "ACCEPTED") {
    updateData.acceptedAt =
      new Date();
  }

  if (status === "REJECTED") {
    updateData.rejectedAt =
      new Date();
  }

  // ========================================
  // Update
  // ========================================

  const estimate =
    await Estimate.findByIdAndUpdate(
      estimateId,
      updateData,
      {
        new: true,
        runValidators: true,
      },
    );

  if (!estimate) {
    throw new Error(
      "Estimate not found",
    );
  }

  return estimate;
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createEstimate,
  getEstimateById,
  getEstimates,
  updateEstimateStatus,
};