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
  foodMenu = null,

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
  // Process Food Menu & Catering
  // ========================================

  let foodMenuData = {
    included: false,
    servingType: "PER_GUEST",
    ratePerGuest: 0,
    totalFoodAmount: 0,
    notes: "",
    items: [],
  };

  if (foodMenu && foodMenu.included) {
    const servingType = "FIXED";
    const items = Array.isArray(foodMenu.items)
      ? foodMenu.items.map((item) => {
          const rate = Math.max(0, Number(item.rate || 0));
          const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
          const amount = Number((rate * quantity).toFixed(2));

          return {
            foodItemId: item.foodItemId || null,
            name: String(item.name || "").trim(),
            category: String(item.category || "").trim(),
            dietary: item.dietary || "veg",
            rate,
            quantity,
            amount,
          };
        })
      : [];
    const totalFoodAmount = items.reduce((total, item) => total + item.amount, 0);

    foodMenuData = {
      included: true,
      servingType,
      ratePerGuest: 0,
      totalFoodAmount: Number(totalFoodAmount.toFixed(2)),
      notes: foodMenu.notes ? String(foodMenu.notes).trim() : "",
      items,
    };
  }

  // ========================================
  // Calculate estimate totals (Services + Food)
  // ========================================

  const combinedSubtotal =
    Number((pricingResult.subtotal + foodMenuData.totalFoodAmount).toFixed(2));

  const totals =
    calculateEstimateTotal({
      subtotal:
        combinedSubtotal,

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
      // Food Menu & Catering
      // ------------------------------------

      foodMenu: foodMenuData,

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
        referralSource:
          client.referralSource?.trim() ||
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
      1000,
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
// CONVERT ESTIMATE TO BOOKING + EVENT
// ==========================================

/**
 * Converts an ACCEPTED estimate into a confirmed
 * Booking and an Upcoming Event in one atomic step.
 *
 * The manager calls this after marking an estimate
 * as ACCEPTED to create the event in the system.
 *
 * Flow:
 *   Estimate (ACCEPTED)
 *     → Find/create Client
 *     → Create Booking (status: Confirmed)
 *     → Create Event (status: Upcoming)
 *     → Return { booking, event }
 */

const convertEstimateToBooking = async (
  estimateId,
  convertedBy = null
) => {
  if (!estimateId) {
    const error = new Error("Estimate ID is required");
    error.statusCode = 400;
    throw error;
  }

  // ========================================
  // Find Estimate
  // ========================================

  const estimate = await Estimate.findById(estimateId);

  if (!estimate) {
    const error = new Error("Estimate not found");
    error.statusCode = 404;
    throw error;
  }

  // ========================================
  // Must Be ACCEPTED
  // ========================================

  if (estimate.status !== "ACCEPTED") {
    const error = new Error(
      `Only ACCEPTED estimates can be converted to events. Current status: ${estimate.status}`
    );
    error.statusCode = 400;
    throw error;
  }

  // ========================================
  // Require models for booking + event + client
  // ========================================

  const Booking = require("../models/booking.model");
  const Event = require("../models/event.model");
  const Client = require("../models/client.model");

  // ========================================
  // Find or Create Client
  // ========================================

  const normalizedEmail = estimate.client.email
    .trim()
    .toLowerCase();

  const normalizedPhone = estimate.client.phone.trim();

  let client = await Client.findOne({
    $or: [
      { email: normalizedEmail },
      { phone: normalizedPhone },
    ],
  });

  if (!client) {
    client = await Client.create({
      name: estimate.client.name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      referralSource: estimate.client.referralSource || "",
      createdBy: convertedBy,
    });
  }

  // ========================================
  // Check for Duplicate Booking
  //
  // Guard against double-clicking the button.
  // ========================================

  const existingBooking = await Booking.findOne({
    client: client._id,
    eventDate: estimate.eventDate,
    eventName: estimate.eventName,
  });

  if (existingBooking) {
    // If a booking exists and already has an event, return both
    const existingEvent = await Event.findOne({
      booking: existingBooking._id,
    })
      .populate("client", "name phone email")
      .populate(
        "booking",
        "eventName eventType eventDate eventTime guests location total status"
      );

    return {
      booking: existingBooking,
      event: existingEvent,
    };
  }

  // ========================================
  // Build Service Line Items from Estimate
  //
  // The estimate already has fully-calculated
  // price snapshots — no need to re-price.
  // ========================================

  const serviceLineItems = estimate.items.map((item) => ({
    serviceId: item.serviceId,
    optionId: item.optionId ?? null,
    serviceName: item.serviceName,
    category: item.category,
    description: item.description ?? "",
    quantity: item.quantity,
    pricingType: item.pricingType,
    unitLabel: item.unitLabel ?? "",
    unitPrice: item.unitPrice,
    total: item.total,
  }));

  // ========================================
  // Create Booking (immediately Confirmed)
  // ========================================

  const booking = await Booking.create({
    client: client._id,

    eventName: estimate.eventName,
    eventType: estimate.eventType,
    eventDate: estimate.eventDate,
    eventTime: estimate.eventTime,
    guests: estimate.guests,
    location: estimate.location,
    description: estimate.description,

    message: estimate.client.message ?? "",
    referralSource: estimate.client.referralSource ?? "",

    services: serviceLineItems,

    foodMenu: estimate.foodMenu || {
      included: false,
      servingType: "PER_GUEST",
      ratePerGuest: 0,
      totalFoodAmount: 0,
      notes: "",
      items: [],
    },

    subtotal: estimate.subtotal,
    discountType: estimate.discountType,
    discountValue: estimate.discountValue,
    discountAmount: estimate.discount,
    additionalCharges: estimate.additionalCharges,
    total: estimate.total,
    currency: estimate.currency ?? "INR",

    // Confirmed immediately — no manual step needed
    status: "Confirmed",

    createdBy: convertedBy,
  });

  // ========================================
  // Create Event from the Confirmed Booking
  // ========================================

  const event = await Event.create({
    client: client._id,
    booking: booking._id,

    eventName: booking.eventName,
    eventType: booking.eventType,
    eventDate: booking.eventDate,
    eventTime: booking.eventTime,
    guests: booking.guests,
    location: booking.location,
    description: booking.description,

    status: "Upcoming",

    createdBy: convertedBy,
  });

  // ========================================
  // Populate & Return
  // ========================================

  await booking.populate("client", "name phone email");

  await event.populate([
    {
      path: "client",
      select: "name phone email",
    },
    {
      path: "booking",
      select:
        "eventName eventType eventDate eventTime guests location total status",
    },
    {
      path: "createdBy",
      select: "name email role",
    },
  ]);

  return { booking, event };
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createEstimate,
  getEstimateById,
  getEstimates,
  updateEstimateStatus,
  convertEstimateToBooking,
};