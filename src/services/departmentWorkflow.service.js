const mongoose = require("mongoose");
const Event = require("../models/event.model");
const Booking = require("../models/booking.model");
const FoodItem = require("../models/foodItem.model");
const Recipe = require("../models/recipe.model");
const StockItem = require("../models/stockItem.model");
const PurchaseRequest = require("../models/purchaseRequest.model");
const Duty = require("../models/duty.model");
const Task = require("../models/task.model");
const User = require("../models/user.model");
const {
  normalizeDepartment,
  DEFAULT_DEPARTMENT_PERMISSIONS,
} = require("../utils/department.constants");
const { convertStockToIngredientUnit } = require("../utils/unitConverter");

// ==========================================
// 1. DEPARTMENT USER INFO
// ==========================================

const getMyDepartmentInfo = async (userId) => {
  const user = await User.findById(userId).select(
    "name username email role department permissions isActive"
  );

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const role = String(user.role || "").toLowerCase();
  const normalizedDept = normalizeDepartment(user.department);
  const permissions =
    user.permissions && user.permissions.length > 0
      ? user.permissions
      : DEFAULT_DEPARTMENT_PERMISSIONS[normalizedDept] || [];

  return {
    id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    department: user.department || normalizedDept,
    normalizedDepartment: normalizedDept,
    permissions,
    isSuperAdmin: role === "superadmin",
    isAdmin: role === "admin" || role === "superadmin",
    isOperationsManager: normalizedDept === "Operations",
  };
};

// ==========================================
// 2. KITCHEN / CHEF WORKFLOW
// ==========================================

/**
 * Get confirmed events relevant to Kitchen
 * Filter: events where booking.foodMenu.included is true, or has food/catering services
 */
const getKitchenEvents = async ({ search = "", status = "" } = {}) => {
  // Query all active/confirmed events
  const eventQuery = {
    status: {
      $nin: ["Cancelled", "CANCELLED"],
    },
  };

  if (status && status !== "All") {
    eventQuery.status = new RegExp(`^${status}$`, "i");
  }

  if (search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    eventQuery.$or = [
      { eventName: regex },
      { eventType: regex },
      { location: regex },
    ];
  }

  const events = await Event.find(eventQuery)
    .populate("client", "name phone email")
    .populate("booking")
    .sort({ eventDate: 1 });

  // Filter to events that have kitchen/food requirements
  const kitchenEvents = events.filter((ev) => {
    const booking = ev.booking;
    if (!booking) return false;

    // Exclude cancelled bookings
    const bookingStatus = String(booking.status || "").toLowerCase();
    if (bookingStatus === "cancelled") return false;

    // Check if foodMenu is included
    if (booking.foodMenu?.included || (booking.foodMenu?.items && booking.foodMenu.items.length > 0)) {
      return true;
    }

    // Check if any selected service is catering/food
    if (Array.isArray(booking.services)) {
      return booking.services.some((s) => {
        const cat = `${s.category || ""} ${s.serviceName || ""}`.toLowerCase();
        return (
          cat.includes("cater") ||
          cat.includes("food") ||
          cat.includes("beverage") ||
          cat.includes("buffet") ||
          cat.includes("dining") ||
          cat.includes("snack")
        );
      });
    }

    return false;
  });

  return kitchenEvents.map((ev) => {
    const booking = ev.booking || {};
    const menuItems = booking.foodMenu?.items || [];
    const guests = ev.guests || booking.guests || 0;

    // Dietary counts
    let vegCount = 0;
    let nonVegCount = 0;
    let veganCount = 0;
    let eggCount = 0;

    menuItems.forEach((item) => {
      const dietary = String(item.dietary || "").toLowerCase();
      if (dietary === "non-veg") nonVegCount++;
      else if (dietary === "vegan") veganCount++;
      else if (dietary === "egg") eggCount++;
      else vegCount++;
    });

    return {
      id: ev._id,
      eventId: ev._id,
      eventName: ev.eventName,
      eventType: ev.eventType,
      eventDate: ev.eventDate,
      eventTime: ev.eventTime,
      guests,
      location: ev.location,
      status: ev.status,
      client: ev.client
        ? {
            name: ev.client.name,
            phone: ev.client.phone,
            email: ev.client.email,
          }
        : null,
      foodMenu: {
        included: booking.foodMenu?.included ?? false,
        servingType: booking.foodMenu?.servingType || "PER_GUEST",
        ratePerGuest: booking.foodMenu?.ratePerGuest || 0,
        notes: booking.foodMenu?.notes || "",
        totalItems: menuItems.length,
        items: menuItems,
      },
      dietarySummary: {
        veg: vegCount,
        nonVeg: nonVegCount,
        vegan: veganCount,
        egg: eggCount,
      },
    };
  });
};

/**
 * Get detailed kitchen event view (read-only confirmed menu, guest count, dietary)
 */
const getKitchenEventDetail = async (eventId) => {
  const event = await Event.findById(eventId)
    .populate("client", "name phone email")
    .populate("booking");

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const booking = event.booking || (await Booking.findById(event._id)) || {};
  const menuItems = booking.foodMenu?.items || [];
  const guests = event.guests || booking.guests || 0;

  // Enhance each menu item with recipe status
  const itemNames = menuItems.map((i) => i.name.trim());
  const itemFoodIds = menuItems.map((i) => i.foodItemId).filter(Boolean);

  const recipes = await Recipe.find({
    $or: [
      { foodItem: { $in: itemFoodIds } },
      { foodItemName: { $in: itemNames } },
    ],
  });

  const recipeMap = new Map();
  recipes.forEach((r) => {
    if (r.foodItem) recipeMap.set(r.foodItem.toString(), r);
    recipeMap.set(r.foodItemName.toLowerCase(), r);
  });

  const enrichedMenuItems = menuItems.map((item) => {
    const recipe =
      (item.foodItemId && recipeMap.get(item.foodItemId.toString())) ||
      recipeMap.get(item.name.toLowerCase()) ||
      null;

    return {
      _id: item._id,
      foodItemId: item.foodItemId,
      name: item.name,
      category: item.category,
      dietary: item.dietary,
      rate: item.rate,
      quantity: item.quantity,
      hasRecipe: Boolean(recipe),
      recipeId: recipe?._id || null,
      ingredientsCount: recipe?.ingredients?.length || 0,
      defaultWastagePercent: recipe?.defaultWastagePercent ?? 5,
    };
  });

  return {
    id: event._id,
    eventId: event._id,
    eventName: event.eventName,
    eventType: event.eventType,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
    guests,
    location: event.location,
    status: event.status,
    notes: event.notes || "",
    client: event.client,
    foodMenu: {
      included: booking.foodMenu?.included ?? false,
      servingType: booking.foodMenu?.servingType || "PER_GUEST",
      ratePerGuest: booking.foodMenu?.ratePerGuest || 0,
      notes: booking.foodMenu?.notes || "",
      items: enrichedMenuItems,
    },
  };
};

/**
 * Recipes Management
 */
const getRecipes = async ({ search = "", category = "" } = {}) => {
  const query = {};
  if (category && category !== "All") {
    query.category = category;
  }
  if (search.trim()) {
    query.foodItemName = new RegExp(search.trim(), "i");
  }

  return Recipe.find(query)
    .populate("foodItem", "name category dietary defaultRate")
    .populate("ingredients.stockItem", "name category availableQuantity unit")
    .sort({ foodItemName: 1 });
};

const getRecipeByFoodItem = async (foodItemId) => {
  let recipe = await Recipe.findOne({ foodItem: foodItemId })
    .populate("foodItem")
    .populate("ingredients.stockItem");

  if (!recipe) {
    // Also try matching by name
    const foodItem = await FoodItem.findById(foodItemId);
    if (foodItem) {
      recipe = await Recipe.findOne({ foodItemName: foodItem.name })
        .populate("foodItem")
        .populate("ingredients.stockItem");
    }
  }

  return recipe;
};

const upsertRecipe = async ({
  foodItemId,
  foodItemName,
  category = "Main Course",
  yieldServings = 1,
  defaultWastagePercent = 5,
  ingredients = [],
  preparationSteps = [],
  notes = "",
  userId = null,
}) => {
  if (!foodItemId && !foodItemName) {
    const error = new Error("Food item or food item name is required");
    error.statusCode = 400;
    throw error;
  }

  let foodItemDoc = null;
  if (foodItemId) {
    foodItemDoc = await FoodItem.findById(foodItemId);
  } else if (foodItemName) {
    foodItemDoc = await FoodItem.findOne({ name: foodItemName.trim() });
  }

  const finalName = foodItemDoc ? foodItemDoc.name : foodItemName.trim();
  const finalCategory = foodItemDoc ? foodItemDoc.category : category;
  const targetFoodItemId = foodItemDoc ? foodItemDoc._id : new mongoose.Types.ObjectId();

  // Validate ingredients format
  const sanitizedIngredients = ingredients.map((ing) => ({
    name: ing.name.trim(),
    quantityPerServing: Math.max(0, Number(ing.quantityPerServing) || 0),
    unit: ing.unit ? ing.unit.trim() : "kg",
    stockItem: ing.stockItem || null,
    notes: ing.notes ? ing.notes.trim() : "",
  }));

  const recipe = await Recipe.findOneAndUpdate(
    {
      $or: [
        { foodItem: targetFoodItemId },
        { foodItemName: finalName },
      ],
    },
    {
      $set: {
        foodItem: targetFoodItemId,
        foodItemName: finalName,
        category: finalCategory,
        yieldServings: Math.max(1, Number(yieldServings) || 1),
        defaultWastagePercent: Math.max(0, Math.min(100, Number(defaultWastagePercent) || 5)),
        ingredients: sanitizedIngredients,
        preparationSteps: Array.isArray(preparationSteps) ? preparationSteps : [],
        notes: notes ? notes.trim() : "",
        updatedBy: userId,
      },
      $setOnInsert: {
        createdBy: userId,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  );

  return recipe;
};

/**
 * Exact Ingredient Requirement Calculation Engine
 * Formula: Required = (quantityPerServing / yieldServings) * guests * (1 + wastageAllowancePercent / 100)
 * Compares against live StockItem availableQuantity without deducting stock!
 */
const calculateKitchenIngredients = async (eventId, { wastageAllowancePercent = 5 } = {}) => {
  const event = await Event.findById(eventId)
    .populate("client", "name phone email")
    .populate("booking");

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const booking = event.booking || (await Booking.findById(event._id)) || {};
  const menuItems = booking.foodMenu?.items || [];
  const eventGuests = Number(event.guests);
  const bookingGuests = Number(booking.guests);
  const guests = Math.max(
    0,
    !isNaN(eventGuests) ? eventGuests : !isNaN(bookingGuests) ? bookingGuests : 0
  );

  if (menuItems.length === 0) {
    return {
      eventId: event._id,
      eventName: event.eventName,
      eventDate: event.eventDate,
      guests,
      hasFoodMenu: false,
      message: "No food menu items configured for this event",
      menuItems: [],
      aggregatedIngredients: [],
      shortages: [],
      missingRecipes: [],
      hasAnyShortage: false,
    };
  }

  // Pre-fetch all recipes for these menu items
  const itemNames = menuItems.map((i) => i.name.trim());
  const itemFoodIds = menuItems.map((i) => i.foodItemId).filter(Boolean);

  const recipes = await Recipe.find({
    $or: [
      { foodItem: { $in: itemFoodIds } },
      { foodItemName: { $in: itemNames } },
    ],
  }).populate("ingredients.stockItem");

  const recipeMap = new Map();
  recipes.forEach((r) => {
    if (r.foodItem) recipeMap.set(r.foodItem.toString(), r);
    recipeMap.set(r.foodItemName.toLowerCase(), r);
  });

  // Pre-fetch all stock items for comparison
  const allStockItems = await StockItem.find().lean();
  const stockMapByName = new Map();
  const stockMapById = new Map();

  allStockItems.forEach((item) => {
    stockMapById.set(item._id.toString(), item);
    stockMapByName.set(item.name.toLowerCase().trim(), item);
  });

  const parsedWastage = Math.max(0, Math.min(100, Number(wastageAllowancePercent) || 5));
  const missingRecipes = [];
  const perItemCalculations = [];
  const aggregatedIngredientsMap = new Map();

  for (const item of menuItems) {
    const recipe =
      (item.foodItemId && recipeMap.get(item.foodItemId.toString())) ||
      recipeMap.get(item.name.toLowerCase()) ||
      null;

    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      missingRecipes.push({
        foodItemId: item.foodItemId,
        name: item.name,
        category: item.category,
        reason: "No recipe configured for this menu item. Please add recipe ingredients to enable exact calculation.",
      });

      perItemCalculations.push({
        name: item.name,
        category: item.category,
        hasRecipe: false,
        ingredients: [],
      });
      continue;
    }

    const itemWastage = parsedWastage;
    const yieldServings = Math.max(1, Number(recipe.yieldServings) || 1);
    const itemIngredients = [];

    for (const ing of recipe.ingredients) {
      const perGuest = Math.max(0, Number(ing.quantityPerServing) || 0) / yieldServings;
      const baseTotal = perGuest * guests;
      const withWastage = baseTotal * (1 + itemWastage / 100);
      const roundedRequired = Math.round(withWastage * 1000) / 1000;

      // Find matched stock item
      let matchedStock = null;
      if (ing.stockItem) {
        matchedStock = stockMapById.get(
          ing.stockItem._id ? ing.stockItem._id.toString() : ing.stockItem.toString()
        );
      }
      if (!matchedStock) {
        matchedStock = stockMapByName.get(ing.name.toLowerCase().trim());
      }

      const hasStockMapping = Boolean(matchedStock);
      let availableQty = null;
      let isUnitCompatible = true;
      let unitMismatchWarning = null;
      let stockItemAvailableQuantity = null;
      let stockItemUnit = null;

      if (matchedStock) {
        stockItemAvailableQuantity = matchedStock.availableQuantity;
        stockItemUnit = matchedStock.unit;
        const unitConv = convertStockToIngredientUnit(
          matchedStock.availableQuantity,
          matchedStock.unit,
          ing.unit
        );
        if (unitConv.isCompatible && unitConv.convertedQuantity !== null) {
          availableQty = unitConv.convertedQuantity;
        } else {
          isUnitCompatible = false;
          unitMismatchWarning =
            unitConv.warning || `Unit mismatch: ${ing.unit} vs ${matchedStock.unit}`;
          availableQty = null;
        }
      }

      let shortageQty = null;
      let hasShortage = false;
      let status = "UNMAPPED";
      let statusLabel = "Missing Stock Mapping";

      if (!hasStockMapping) {
        status = "UNMAPPED";
        statusLabel = "Missing Stock Mapping";
        shortageQty = null;
        hasShortage = false;
      } else if (!isUnitCompatible) {
        status = "UNIT_MISMATCH";
        statusLabel = "Unit Mismatch";
        shortageQty = null;
        hasShortage = false;
      } else {
        const diff = roundedRequired - (availableQty ?? 0);
        shortageQty = Math.max(0, Math.round(diff * 1000) / 1000);
        hasShortage = shortageQty > 0;
        if (hasShortage) {
          status = "SHORTAGE";
          statusLabel = "Shortage";
        } else {
          status = "SUFFICIENT";
          statusLabel = "Sufficient Stock";
        }
      }

      itemIngredients.push({
        name: ing.name,
        unit: ing.unit,
        perGuestQuantity: Math.round(perGuest * 1000) / 1000,
        baseQuantity: Math.round(baseTotal * 1000) / 1000,
        wastagePercent: itemWastage,
        requiredQuantity: roundedRequired,
        availableQuantity: hasStockMapping && isUnitCompatible ? availableQty : null,
        shortageQuantity: shortageQty,
        hasShortage,
        hasStockMapping,
        isUnitCompatible,
        unitMismatchWarning,
        stockItemId: matchedStock?._id || null,
        stockItemName: matchedStock?.name || null,
        stockItemUnit,
        stockItemAvailableQuantity,
        status,
        statusLabel,
      });

      // Aggregate across recipes (by ingredient name and target unit)
      const aggKey = `${ing.name.toLowerCase().trim()}_${ing.unit.toLowerCase().trim()}`;
      if (!aggregatedIngredientsMap.has(aggKey)) {
        aggregatedIngredientsMap.set(aggKey, {
          name: ing.name,
          unit: ing.unit,
          requiredQuantity: 0,
          availableQuantity: availableQty,
          hasStockMapping,
          isUnitCompatible,
          unitMismatchWarning,
          stockItemId: matchedStock?._id || null,
          stockItemName: matchedStock?.name || null,
          stockItemUnit,
          stockItemAvailableQuantity,
          usedInMenuItems: [],
        });
      }

      const agg = aggregatedIngredientsMap.get(aggKey);
      agg.requiredQuantity = Math.round((agg.requiredQuantity + roundedRequired) * 1000) / 1000;
      agg.usedInMenuItems.push(item.name);
      if (!hasStockMapping) {
        agg.hasStockMapping = false;
        agg.availableQuantity = null;
      }
      if (!isUnitCompatible) {
        agg.isUnitCompatible = false;
        agg.unitMismatchWarning = unitMismatchWarning;
        agg.availableQuantity = null;
      }
    }

    perItemCalculations.push({
      name: item.name,
      category: item.category,
      hasRecipe: true,
      recipeId: recipe._id,
      yieldServings,
      ingredients: itemIngredients,
    });
  }

  // Finalize aggregated calculations & shortages
  const aggregatedIngredients = Array.from(aggregatedIngredientsMap.values()).map((agg) => {
    let shortage = null;
    let hasShortage = false;
    let status = "UNMAPPED";
    let statusLabel = "Missing Stock Mapping";

    if (!agg.hasStockMapping) {
      status = "UNMAPPED";
      statusLabel = "Missing Stock Mapping";
      shortage = null;
      hasShortage = false;
    } else if (!agg.isUnitCompatible) {
      status = "UNIT_MISMATCH";
      statusLabel = "Unit Mismatch";
      shortage = null;
      hasShortage = false;
    } else {
      const diff = agg.requiredQuantity - (agg.availableQuantity ?? 0);
      shortage = Math.max(0, Math.round(diff * 1000) / 1000);
      hasShortage = shortage > 0;
      if (hasShortage) {
        status = "SHORTAGE";
        statusLabel = "Shortage";
      } else {
        status = "SUFFICIENT";
        statusLabel = "Sufficient Stock";
      }
    }

    return {
      name: agg.name,
      unit: agg.unit,
      requiredQuantity: agg.requiredQuantity,
      availableQuantity: agg.hasStockMapping && agg.isUnitCompatible ? agg.availableQuantity : null,
      shortageQuantity: shortage,
      hasShortage,
      hasStockMapping: agg.hasStockMapping,
      isUnitCompatible: agg.isUnitCompatible !== false,
      unitMismatchWarning: agg.unitMismatchWarning || null,
      stockItemId: agg.stockItemId,
      stockItemName: agg.stockItemName,
      stockItemUnit: agg.stockItemUnit,
      stockItemAvailableQuantity: agg.stockItemAvailableQuantity,
      status,
      statusLabel,
      usedInMenuItems: Array.from(new Set(agg.usedInMenuItems)),
    };
  });

  const shortages = aggregatedIngredients.filter((ing) => ing.hasShortage && ing.shortageQuantity > 0);

  return {
    eventId: event._id,
    eventName: event.eventName,
    eventType: event.eventType,
    eventDate: event.eventDate,
    guests,
    configuredWastagePercent: parsedWastage,
    hasFoodMenu: true,
    totalMenuItems: menuItems.length,
    missingRecipesCount: missingRecipes.length,
    missingRecipes,
    perItemCalculations,
    aggregatedIngredients,
    shortages,
    hasAnyShortage: shortages.length > 0,
    calculatedAt: new Date(),
  };
};

// ==========================================
// 3. PURCHASE REQUESTS (Shortage Requisitions)
// ==========================================

const createPurchaseRequest = async ({
  department,
  eventId = null,
  items = [],
  notes = "",
  userId,
}) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    const error = new Error("At least one shortage item is required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedDept = normalizeDepartment(department);

  const formattedItems = items.map((item) => ({
    itemName: item.itemName.trim(),
    requiredQuantity: Math.max(0, Number(item.requiredQuantity) || 0),
    availableQuantity: Math.max(0, Number(item.availableQuantity) || 0),
    shortageQuantity: Math.max(0, Number(item.shortageQuantity) || 0),
    unit: item.unit ? item.unit.trim() : "pcs",
    estimatedCost: Math.max(0, Number(item.estimatedCost) || 0),
    urgency: item.urgency || "HIGH",
    stockItem: item.stockItem || null,
    notes: item.notes ? item.notes.trim() : "",
  }));

  const validItems = formattedItems.filter((item) => item.shortageQuantity > 0);
  if (validItems.length === 0) {
    const error = new Error("At least one item with a positive shortage quantity is required");
    error.statusCode = 400;
    throw error;
  }

  // Prevent duplicate unintended pending requisitions for the same event and department
  if (eventId) {
    const existingPending = await PurchaseRequest.findOne({
      department: normalizedDept,
      event: eventId,
      status: "PENDING",
    });

    if (existingPending) {
      existingPending.items = validItems;
      if (notes) existingPending.notes = notes.trim();
      existingPending.requestedBy = userId;
      await existingPending.save();
      return existingPending.populate("requestedBy", "name email role department");
    }
  }

  const purchaseRequest = await PurchaseRequest.create({
    department: normalizedDept,
    event: eventId || null,
    items: validItems,
    notes: notes ? notes.trim() : "",
    requestedBy: userId,
    status: "PENDING",
  });

  return purchaseRequest.populate("requestedBy", "name email role department");
};

const getPurchaseRequests = async ({ department = "", status = "" } = {}) => {
  const query = {};
  if (department && department !== "All") {
    query.department = normalizeDepartment(department);
  }
  if (status && status !== "All") {
    query.status = status;
  }

  return PurchaseRequest.find(query)
    .populate("requestedBy", "name email role department")
    .populate("approvedBy", "name email")
    .populate("event", "eventName eventDate location")
    .sort({ createdAt: -1 });
};

// ==========================================
// 4. PREPARATION / DEPARTMENT TASKS
// ==========================================

const getDepartmentTasks = async ({ department, eventId = null }) => {
  const normDept = normalizeDepartment(department);
  const dutyQuery = {
    status: { $ne: "CANCELLED" },
  };

  if (eventId) {
    dutyQuery.event = eventId;
  }

  // Find duties assigned to this department
  const duties = await Duty.find(dutyQuery)
    .populate("staff", "name phone employeeId")
    .populate("event", "eventName eventDate location")
    .lean();

  const matchingDuties = duties.filter((d) => {
    const dDept = normalizeDepartment(d.department || d.role || "");
    return dDept === normDept || normDept === "Operations";
  });

  // Collect tasks from matching duties
  const allTasks = [];
  matchingDuties.forEach((duty) => {
    if (Array.isArray(duty.tasks)) {
      duty.tasks.forEach((t) => {
        allTasks.push({
          id: t._id,
          dutyId: duty._id,
          dutyTitle: duty.dutyTitle,
          eventId: duty.event?._id || duty.event,
          eventName: duty.event?.eventName || "Event",
          eventDate: duty.event?.eventDate,
          staffName: duty.staff?.name || "Unassigned",
          department: duty.department || normDept,
          title: t.title,
          description: t.description,
          status: t.status,
          plannedStartAt: t.plannedStartAt,
          plannedEndAt: t.plannedEndAt,
          actualStartAt: t.actualStartAt,
          actualEndAt: t.actualEndAt,
          completionNotes: t.completionNotes,
        });
      });
    }
  });

  return allTasks;
};

const createDepartmentTask = async ({
  department,
  eventId,
  dutyTitle,
  staffId = null,
  title,
  description = "",
  plannedStartAt = null,
  plannedEndAt = null,
  userId,
}) => {
  if (!eventId || !title) {
    const error = new Error("Event ID and Task Title are required");
    error.statusCode = 400;
    throw error;
  }

  const normDept = normalizeDepartment(department);

  // Find or create a departmental duty for this event
  let duty = await Duty.findOne({
    event: eventId,
    department: normDept,
    status: { $ne: "CANCELLED" },
  });

  if (!duty) {
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    // Default to the requesting user or assigned staff
    const assignedStaff = staffId || userId;

    duty = await Duty.create({
      event: event._id,
      staff: assignedStaff,
      dutyTitle: dutyTitle || `${normDept} Preparation & Execution`,
      role: `${normDept} Crew`,
      department: normDept,
      dutyDate: event.eventDate,
      startTime: event.eventTime || "09:00 AM",
      endTime: "10:00 PM",
      status: "ASSIGNED",
      assignedBy: userId,
      tasks: [],
    });
  }

  // Add the task to the duty
  duty.tasks.push({
    title: title.trim(),
    description: description ? description.trim() : "",
    plannedStartAt: plannedStartAt ? new Date(plannedStartAt) : null,
    plannedEndAt: plannedEndAt ? new Date(plannedEndAt) : null,
    status: "PENDING",
  });

  await duty.save();
  const newTask = duty.tasks[duty.tasks.length - 1];

  return {
    taskId: newTask._id,
    dutyId: duty._id,
    title: newTask.title,
    description: newTask.description,
    status: newTask.status,
  };
};

const updateDepartmentTaskStatus = async (dutyId, taskId, { status, notes, userId }) => {
  const duty = await Duty.findById(dutyId);
  if (!duty) {
    const error = new Error("Duty not found");
    error.statusCode = 404;
    throw error;
  }

  const task = duty.tasks.id(taskId);
  if (!task) {
    const error = new Error("Task not found in duty");
    error.statusCode = 404;
    throw error;
  }

  if (status) {
    task.status = status;
    if (status === "COMPLETED") {
      task.actualEndAt = new Date();
      task.completedBy = userId;
    } else if (status === "IN_PROGRESS" && !task.actualStartAt) {
      task.actualStartAt = new Date();
      task.startedBy = userId;
    }
  }

  if (notes) {
    task.completionNotes = notes.trim();
  }

  await duty.save();
  return task;
};

// ==========================================
// 5. DECORATION WORKFLOW
// ==========================================

const getDecorationEvents = async ({ search = "", status = "" } = {}) => {
  const eventQuery = {
    status: { $nin: ["Cancelled", "CANCELLED"] },
  };

  if (status && status !== "All") {
    eventQuery.status = new RegExp(`^${status}$`, "i");
  }

  if (search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    eventQuery.$or = [
      { eventName: regex },
      { eventType: regex },
      { location: regex },
    ];
  }

  const events = await Event.find(eventQuery)
    .populate("client", "name phone email")
    .populate("booking")
    .sort({ eventDate: 1 });

  // Filter to events that have decoration services
  const decorEvents = events.filter((ev) => {
    const booking = ev.booking;
    if (!booking || !Array.isArray(booking.services)) return false;

    return booking.services.some((s) => {
      const cat = `${s.category || ""} ${s.serviceName || ""}`.toLowerCase();
      return (
        cat.includes("decor") ||
        cat.includes("stage") ||
        cat.includes("floral") ||
        cat.includes("flower") ||
        cat.includes("balloon") ||
        cat.includes("backdrop") ||
        cat.includes("mandap") ||
        cat.includes("entrance")
      );
    });
  });

  return decorEvents.map((ev) => {
    const booking = ev.booking || {};
    const decorServices = (booking.services || []).filter((s) => {
      const cat = `${s.category || ""} ${s.serviceName || ""}`.toLowerCase();
      return (
        cat.includes("decor") ||
        cat.includes("stage") ||
        cat.includes("floral") ||
        cat.includes("flower") ||
        cat.includes("balloon") ||
        cat.includes("backdrop")
      );
    });

    return {
      id: ev._id,
      eventId: ev._id,
      eventName: ev.eventName,
      eventType: ev.eventType,
      eventDate: ev.eventDate,
      eventTime: ev.eventTime,
      location: ev.location,
      status: ev.status,
      client: ev.client,
      decorServices,
      totalDecorServices: decorServices.length,
    };
  });
};

const getDecorationMaterials = async (eventId) => {
  const event = await Event.findById(eventId)
    .populate("client", "name phone email")
    .populate("booking");

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  // Get Decor, Linen, Furniture stock items
  const decorStockItems = await StockItem.find({
    category: { $in: ["Decor", "Linen", "Furniture", "Lighting"] },
  }).sort({ availableQuantity: 1 });

  return {
    eventId: event._id,
    eventName: event.eventName,
    eventDate: event.eventDate,
    location: event.location,
    materials: decorStockItems.map((item) => ({
      id: item._id,
      name: item.name,
      category: item.category,
      availableQuantity: item.availableQuantity,
      totalQuantity: item.totalQuantity,
      unit: item.unit,
      isLowStock: item.availableQuantity <= item.minStockLevel,
    })),
  };
};

// ==========================================
// 6. PHOTOGRAPHY WORKFLOW
// ==========================================

const getPhotographyEvents = async ({ search = "", status = "" } = {}) => {
  const eventQuery = {
    status: { $nin: ["Cancelled", "CANCELLED"] },
  };

  if (status && status !== "All") {
    eventQuery.status = new RegExp(`^${status}$`, "i");
  }

  if (search.trim()) {
    const regex = new RegExp(search.trim(), "i");
    eventQuery.$or = [
      { eventName: regex },
      { eventType: regex },
      { location: regex },
    ];
  }

  const events = await Event.find(eventQuery)
    .populate("client", "name phone email")
    .populate("booking")
    .sort({ eventDate: 1 });

  const photoEvents = events.filter((ev) => {
    const booking = ev.booking;
    if (!booking || !Array.isArray(booking.services)) return false;

    return booking.services.some((s) => {
      const cat = `${s.category || ""} ${s.serviceName || ""}`.toLowerCase();
      return (
        cat.includes("photo") ||
        cat.includes("video") ||
        cat.includes("media") ||
        cat.includes("reel") ||
        cat.includes("camera") ||
        cat.includes("cinemat")
      );
    });
  });

  return photoEvents.map((ev) => {
    const booking = ev.booking || {};
    const photoServices = (booking.services || []).filter((s) => {
      const cat = `${s.category || ""} ${s.serviceName || ""}`.toLowerCase();
      return (
        cat.includes("photo") ||
        cat.includes("video") ||
        cat.includes("media") ||
        cat.includes("reel") ||
        cat.includes("camera") ||
        cat.includes("cinemat")
      );
    });

    return {
      id: ev._id,
      eventId: ev._id,
      eventName: ev.eventName,
      eventType: ev.eventType,
      eventDate: ev.eventDate,
      eventTime: ev.eventTime,
      location: ev.location,
      status: ev.status,
      client: ev.client,
      photoServices,
    };
  });
};

const getPhotographyEquipment = async () => {
  const equipment = await StockItem.find({
    category: "Audio/Visual",
  }).sort({ availableQuantity: 1 });

  return equipment.map((item) => ({
    id: item._id,
    name: item.name,
    category: item.category,
    availableQuantity: item.availableQuantity,
    totalQuantity: item.totalQuantity,
    unit: item.unit,
    isLowStock: item.availableQuantity <= item.minStockLevel,
  }));
};

module.exports = {
  getMyDepartmentInfo,
  getKitchenEvents,
  getKitchenEventDetail,
  getRecipes,
  getRecipeByFoodItem,
  upsertRecipe,
  calculateKitchenIngredients,
  createPurchaseRequest,
  getPurchaseRequests,
  getDepartmentTasks,
  createDepartmentTask,
  updateDepartmentTaskStatus,
  getDecorationEvents,
  getDecorationMaterials,
  getPhotographyEvents,
  getPhotographyEquipment,
};
