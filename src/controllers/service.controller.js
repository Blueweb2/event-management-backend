const Service = require("../models/service.model");

// ==========================================
// Allowed Pricing Types
// ==========================================

const PRICING_TYPES = [
  "FIXED",
  "PER_GUEST",
  "PER_UNIT",
  "PER_HOUR",
  "PER_DAY",
  "PER_STAFF",
  "PER_REEL",
];

// ==========================================
// CREATE SERVICE
// POST /api/services
// ==========================================

const createService = async (req, res, next) => {
  try {
    const {
      name,
      category,
      description,
      pricingType,
      basePrice,
      unitLabel,
      options,
      sortOrder,
    } = req.body;

    // ========================================
    // Basic Validation
    // ========================================

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Service name is required.",
      });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({
        success: false,
        message: "Service category is required.",
      });
    }

    if (!pricingType) {
      return res.status(400).json({
        success: false,
        message: "Pricing type is required.",
      });
    }

    if (!PRICING_TYPES.includes(pricingType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid pricing type. Allowed values: ${PRICING_TYPES.join(
          ", "
        )}`,
      });
    }

    // ========================================
    // Validate Base Price
    // ========================================

    const price = Number(basePrice);

    if (
      basePrice === undefined ||
      basePrice === null ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid non-negative base price is required.",
      });
    }

    // ========================================
    // Validate Options
    // ========================================

    if (
      options !== undefined &&
      !Array.isArray(options)
    ) {
      return res.status(400).json({
        success: false,
        message: "Options must be an array.",
      });
    }

    // ========================================
    // Check Duplicate Service
    // ========================================

    const serviceName = name.trim();
    const serviceCategory =
      category.trim().toLowerCase();

    const existingService = await Service.findOne({
      name: serviceName,
      category: serviceCategory,
    });

    if (existingService) {
      return res.status(409).json({
        success: false,
        message:
          "A service with this name already exists in this category.",
      });
    }

    // ========================================
    // Create Service
    // ========================================

    const service = await Service.create({
      name: serviceName,
      category: serviceCategory,
      description:
        description?.trim() || "",

      pricingType,

      basePrice: price,

      unitLabel:
        unitLabel?.trim() || "",

      options:
        Array.isArray(options)
          ? options
          : [],

      sortOrder:
        sortOrder !== undefined
          ? Number(sortOrder)
          : 0,

      createdBy:
        req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Service created successfully.",
      data: service,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET ALL SERVICES
// GET /api/services
//
// Default:
// active services only
//
// ?all=true:
// active + inactive
// ==========================================

const getServices = async (req, res, next) => {
  try {
    const showAll =
      req.query.all === "true";

    const filter = showAll
      ? {}
      : { active: true };

    const services = await Service.find(filter)
      .sort({
        sortOrder: 1,
        category: 1,
        name: 1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      count: services.length,
      data: services,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET SINGLE SERVICE
// GET /api/services/:id
// ==========================================

const getServiceById = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    const service =
      await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: service,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// UPDATE SERVICE
// PUT /api/services/:id
// ==========================================

const updateService = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    const {
      name,
      category,
      description,
      pricingType,
      basePrice,
      unitLabel,
      options,
      active,
      sortOrder,
    } = req.body;

    // ========================================
    // Find Service
    // ========================================

    const service =
      await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    // ========================================
    // Name / Category
    // ========================================

    if (
      name !== undefined ||
      category !== undefined
    ) {
      const updatedName =
        name !== undefined
          ? name.trim()
          : service.name;

      const updatedCategory =
        category !== undefined
          ? category.trim().toLowerCase()
          : service.category;

      if (!updatedName) {
        return res.status(400).json({
          success: false,
          message: "Service name cannot be empty.",
        });
      }

      if (!updatedCategory) {
        return res.status(400).json({
          success: false,
          message:
            "Service category cannot be empty.",
        });
      }

      const duplicate =
        await Service.findOne({
          _id: { $ne: id },
          name: updatedName,
          category: updatedCategory,
        });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message:
            "Another service with this name already exists in this category.",
        });
      }

      service.name = updatedName;
      service.category =
        updatedCategory;
    }

    // ========================================
    // Description
    // ========================================

    if (description !== undefined) {
      service.description =
        description.trim();
    }

    // ========================================
    // Pricing Type
    // ========================================

    if (pricingType !== undefined) {
      if (
        !PRICING_TYPES.includes(
          pricingType
        )
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid pricing type. Allowed values: ${PRICING_TYPES.join(
            ", "
          )}`,
        });
      }

      service.pricingType =
        pricingType;
    }

    // ========================================
    // Base Price
    // ========================================

    if (basePrice !== undefined) {
      const price = Number(basePrice);

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Base price must be a valid non-negative number.",
        });
      }

      service.basePrice = price;
    }

    // ========================================
    // Unit Label
    // ========================================

    if (unitLabel !== undefined) {
      service.unitLabel =
        unitLabel.trim();
    }

    // ========================================
    // Options
    // ========================================

    if (options !== undefined) {
      if (!Array.isArray(options)) {
        return res.status(400).json({
          success: false,
          message:
            "Options must be an array.",
        });
      }

      service.options = options;
    }

    // ========================================
    // Active Status
    // ========================================

    if (active !== undefined) {
      service.active =
        Boolean(active);
    }

    // ========================================
    // Sort Order
    // ========================================

    if (sortOrder !== undefined) {
      const order = Number(sortOrder);

      if (
        !Number.isFinite(order)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Sort order must be a valid number.",
        });
      }

      service.sortOrder = order;
    }

    // ========================================
    // Save
    // ========================================

    await service.save();

    return res.status(200).json({
      success: true,
      message:
        "Service updated successfully.",
      data: service,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// DELETE / DEACTIVATE SERVICE
// DELETE /api/services/:id
//
// Soft delete only.
// Historical bookings/estimates remain safe.
// ==========================================

const deleteService = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    const service =
      await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    service.active = false;

    await service.save();

    return res.status(200).json({
      success: true,
      message:
        "Service deactivated successfully.",
      data: service,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
};