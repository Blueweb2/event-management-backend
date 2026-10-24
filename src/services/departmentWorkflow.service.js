const mongoose = require("mongoose");
const Event = require("../models/event.model");
const Booking = require("../models/booking.model");
const FoodItem = require("../models/foodItem.model");
const Recipe = require("../models/recipe.model");
const StockItem = require("../models/stockItem.model");
const StockTransaction = require("../models/stockTransaction.model");
const PurchaseRequest = require("../models/purchaseRequest.model");
const Duty = require("../models/duty.model");
const Task = require("../models/task.model");
const User = require("../models/user.model");
const {
  normalizeDepartment,
  DEFAULT_DEPARTMENT_PERMISSIONS,
} = require("../utils/department.constants");
const {
  convertStockToIngredientUnit,
  normalizeUnitString,
} = require("../utils/unitConverter");
const { isAuthorizedForKitchenStock } = require("../utils/stockAuth");
const { getIO } = require("../socket");

// Helper to safely emit socket events if available
const emitStockEvent = (eventName, data) => {
  try {
    const io = getIO();
    if (io) {
      io.emit(eventName, data);
    }
  } catch (err) {
    // Non-fatal if socket not ready
  }
};

/**
 * Helper to run operations within a MongoDB transaction if replica set is active,
 * with graceful fallback to standard execution for standalone MongoDB instances.
 */
const runInTransaction = async (operation) => {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // Ignore abort failure
      }
    }
    if (
      err.message &&
      (err.message.includes("replica set") ||
        err.message.includes("Transaction numbers are only allowed") ||
        err.message.includes("standalone") ||
        err.message.includes("This MongoDB deployment does not support retryable writes"))
    ) {
      return await operation(null);
    }
    throw err;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

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
    .populate("foodItem", "name category dietary defaultRate active imageUrl")
    .populate("ingredients.stockItem", "name category availableQuantity unit totalQuantity stockType isRentable")
    .sort({ foodItemName: 1 });
};

const getRecipeByFoodItem = async (foodItemId) => {
  let recipe = null;
  if (mongoose.Types.ObjectId.isValid(foodItemId)) {
    recipe = await Recipe.findOne({ foodItem: foodItemId })
      .populate("foodItem", "name category dietary defaultRate active imageUrl")
      .populate("ingredients.stockItem", "name category availableQuantity unit totalQuantity stockType isRentable");
  }

  if (!recipe) {
    let foodItem = null;
    if (mongoose.Types.ObjectId.isValid(foodItemId)) {
      foodItem = await FoodItem.findById(foodItemId);
    }
    if (!foodItem && typeof foodItemId === "string") {
      foodItem = await FoodItem.findOne({ name: foodItemId.trim() });
    }
    if (foodItem) {
      recipe = await Recipe.findOne({
        $or: [{ foodItem: foodItem._id }, { foodItemName: foodItem.name }],
      })
        .populate("foodItem", "name category dietary defaultRate active imageUrl")
        .populate("ingredients.stockItem", "name category availableQuantity unit totalQuantity stockType isRentable");
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
  user = null,
}) => {
  if (!foodItemId && !foodItemName) {
    const error = new Error("Food item or food item name is required");
    error.statusCode = 400;
    throw error;
  }

  // 1. Resolve Food Item document
  let foodItemDoc = null;
  if (foodItemId) {
    if (!mongoose.Types.ObjectId.isValid(foodItemId)) {
      const error = new Error("Invalid food item ID format");
      error.statusCode = 400;
      throw error;
    }
    foodItemDoc = await FoodItem.findById(foodItemId);
    if (!foodItemDoc) {
      const error = new Error("Food item not found");
      error.statusCode = 404;
      throw error;
    }
  } else if (foodItemName) {
    foodItemDoc = await FoodItem.findOne({ name: foodItemName.trim() });
    if (!foodItemDoc) {
      const error = new Error(`Food item "${foodItemName}" not found`);
      error.statusCode = 404;
      throw error;
    }
  }

  // 2. Department authorization check if user context is provided
  if (user && !isAuthorizedForKitchenStock(user)) {
    const error = new Error(
      "Access denied: Only authorized kitchen personnel or administrators can manage recipes."
    );
    error.statusCode = 403;
    throw error;
  }

  const finalName = foodItemDoc ? foodItemDoc.name : foodItemName.trim();
  const finalCategory = foodItemDoc ? foodItemDoc.category : category;
  const targetFoodItemId = foodItemDoc ? foodItemDoc._id : new mongoose.Types.ObjectId();

  // 3. Validate Yield Servings (must be >= 1)
  const parsedYield = Number(yieldServings);
  if (!Number.isFinite(parsedYield) || parsedYield < 1) {
    const error = new Error("Yield servings must be a number of at least 1");
    error.statusCode = 400;
    throw error;
  }

  // 4. Validate Wastage Percent (must be between 0 and 100)
  const parsedWastage = Number(defaultWastagePercent);
  if (!Number.isFinite(parsedWastage) || parsedWastage < 0 || parsedWastage > 100) {
    const error = new Error("Default wastage percent must be between 0 and 100");
    error.statusCode = 400;
    throw error;
  }

  // 5. Validate Ingredients
  if (!Array.isArray(ingredients)) {
    const error = new Error("Ingredients must be provided as an array");
    error.statusCode = 400;
    throw error;
  }

  const INGREDIENT_CATEGORIES = ["Raw Ingredients", "Kitchen Supplies"];
  const seenStockIds = new Set();
  const sanitizedIngredients = [];

  for (let idx = 0; idx < ingredients.length; idx++) {
    const ing = ingredients[idx];
    const name = (ing.name || "").trim();
    if (!name && !ing.stockItem && !ing.stockItemId) {
      const error = new Error(`Ingredient #${idx + 1} requires a valid name`);
      error.statusCode = 400;
      throw error;
    }

    const qty = Number(ing.quantityPerServing);
    if (!Number.isFinite(qty) || qty <= 0) {
      const error = new Error(
        `Quantity per serving for ingredient "${name || `#${idx + 1}`}" must be greater than zero`
      );
      error.statusCode = 400;
      throw error;
    }

    const unit = (ing.unit || "kg").trim();
    if (!unit) {
      const error = new Error(`Unit is required for ingredient "${name || `#${idx + 1}`}"`);
      error.statusCode = 400;
      throw error;
    }

    let resolvedStockId = null;
    let resolvedStockName = name;

    const rawStockRef = ing.stockItem || ing.stockItemId;
    if (rawStockRef) {
      const stockIdStr =
        typeof rawStockRef === "object" && rawStockRef._id
          ? rawStockRef._id.toString()
          : String(rawStockRef).trim();

      if (!mongoose.Types.ObjectId.isValid(stockIdStr)) {
        const error = new Error(
          `Invalid stock item ID format for ingredient "${name || `#${idx + 1}`}"`
        );
        error.statusCode = 400;
        throw error;
      }

      if (seenStockIds.has(stockIdStr)) {
        const error = new Error(
          `Duplicate stock item detected: Stock item is already linked in this recipe`
        );
        error.statusCode = 400;
        throw error;
      }
      seenStockIds.add(stockIdStr);

      const stockDoc = await StockItem.findById(stockIdStr);
      if (!stockDoc) {
        const error = new Error(
          `Linked stock item for ingredient "${name || stockIdStr}" was not found or has been removed from inventory`
        );
        error.statusCode = 404;
        throw error;
      }

      // Check eligibility: must be kitchen stock (Raw Ingredients or Kitchen Supplies, not Equipment, not rentable)
      const isKitchenEligible =
        (stockDoc.stockType === "kitchen" || INGREDIENT_CATEGORIES.includes(stockDoc.category)) &&
        stockDoc.category !== "Kitchen Equipment" &&
        !stockDoc.isRentable;

      if (!isKitchenEligible) {
        const error = new Error(
          `Stock item "${stockDoc.name}" (${stockDoc.category}) is not eligible as a recipe ingredient. Only raw ingredients and consumable kitchen supplies can be linked.`
        );
        error.statusCode = 400;
        throw error;
      }

      resolvedStockId = stockDoc._id;
      if (!resolvedStockName) {
        resolvedStockName = stockDoc.name;
      }
    }

    sanitizedIngredients.push({
      name: resolvedStockName,
      quantityPerServing: qty,
      unit,
      stockItem: resolvedStockId,
      notes: ing.notes ? String(ing.notes).trim() : "",
    });
  }

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
        yieldServings: parsedYield,
        defaultWastagePercent: parsedWastage,
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
  )
    .populate("foodItem", "name category dietary defaultRate active imageUrl")
    .populate("ingredients.stockItem", "name category availableQuantity unit totalQuantity stockType isRentable");

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

      // Aggregate across recipes (by matched stock item if linked, or by ingredient name + target unit)
      const aggKey = matchedStock
        ? `stock_${matchedStock._id.toString()}_${ing.unit.toLowerCase().trim()}`
        : `${ing.name.toLowerCase().trim()}_${ing.unit.toLowerCase().trim()}`;
      if (!aggregatedIngredientsMap.has(aggKey)) {
        aggregatedIngredientsMap.set(aggKey, {
          name: matchedStock ? matchedStock.name : ing.name,
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
      // Merge items non-destructively: update matching items or append new items
      for (const newItem of validItems) {
        const existingIdx = existingPending.items.findIndex((ex) => {
          if (newItem.stockItem && ex.stockItem) {
            return String(ex.stockItem) === String(newItem.stockItem);
          }
          return ex.itemName.trim().toLowerCase() === newItem.itemName.trim().toLowerCase();
        });

        if (existingIdx !== -1) {
          const matched = existingPending.items[existingIdx];
          matched.requiredQuantity = newItem.requiredQuantity;
          matched.availableQuantity = newItem.availableQuantity;
          matched.shortageQuantity = newItem.shortageQuantity;
          matched.unit = newItem.unit || matched.unit;
          matched.estimatedCost = newItem.estimatedCost || matched.estimatedCost;
          matched.urgency = newItem.urgency || matched.urgency;
          matched.stockItem = newItem.stockItem || matched.stockItem;
          if (newItem.notes) matched.notes = newItem.notes;
        } else {
          existingPending.items.push(newItem);
        }
      }

      if (notes) existingPending.notes = notes.trim();
      existingPending.requestedBy = userId;
      await existingPending.save();
      return existingPending.populate([
        { path: "requestedBy", select: "name email role department" },
        { path: "approvedBy", select: "name email role department" },
        { path: "event", select: "eventName eventDate location" },
        { path: "items.stockItem", select: "name category unit totalQuantity availableQuantity" },
      ]);
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

  return purchaseRequest.populate([
    { path: "requestedBy", select: "name email role department" },
    { path: "approvedBy", select: "name email role department" },
    { path: "event", select: "eventName eventDate location" },
    { path: "items.stockItem", select: "name category unit totalQuantity availableQuantity" },
  ]);
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
    .populate("approvedBy", "name email role department")
    .populate("event", "eventName eventDate location")
    .populate("receipts.receivedBy", "name email role department")
    .populate("items.stockItem", "name category unit totalQuantity availableQuantity")
    .sort({ createdAt: -1 });
};

const getPurchaseRequestById = async (id) => {
  const purchaseRequest = await PurchaseRequest.findById(id)
    .populate("requestedBy", "name email role department")
    .populate("approvedBy", "name email role department")
    .populate("event", "eventName eventDate location")
    .populate("receipts.receivedBy", "name email role department")
    .populate("items.stockItem", "name category unit totalQuantity availableQuantity");

  if (!purchaseRequest) {
    const error = new Error("Purchase request not found");
    error.statusCode = 404;
    throw error;
  }

  return purchaseRequest;
};

const reviewPurchaseRequest = async ({
  requestId,
  status, // "APPROVED", "REJECTED", "CANCELLED"
  rejectionReason = "",
  itemApprovals = [], // optional array of { itemId, approvedQuantity, status }
  user,
}) => {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(normalizedStatus)) {
    const error = new Error("Invalid review status. Must be APPROVED, REJECTED, or CANCELLED");
    error.statusCode = 400;
    throw error;
  }

  // Authorization: Only admin, superadmin, or manager can review purchase requests
  const role = String(user?.role || "").toLowerCase();
  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isManager = role === "manager";

  if (!isSuperAdmin && !isAdmin && !isManager) {
    const error = new Error("Access denied: You are not authorized to review purchase requests");
    error.statusCode = 403;
    throw error;
  }

  const purchaseRequest = await PurchaseRequest.findById(requestId);
  if (!purchaseRequest) {
    const error = new Error("Purchase request not found");
    error.statusCode = 404;
    throw error;
  }

  if (normalizedStatus === "APPROVED" || normalizedStatus === "REJECTED") {
    if (purchaseRequest.status !== "PENDING") {
      const error = new Error(
        `Cannot review request with status "${purchaseRequest.status}". Only PENDING requests can be approved or rejected`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  if (normalizedStatus === "CANCELLED") {
    if (["FULFILLED", "CANCELLED"].includes(purchaseRequest.status)) {
      const error = new Error(`Cannot cancel a request that is already ${purchaseRequest.status}`);
      error.statusCode = 400;
      throw error;
    }
  }

  if (normalizedStatus === "REJECTED" && (!rejectionReason || !rejectionReason.trim())) {
    const error = new Error("Rejection reason is required when rejecting a purchase request");
    error.statusCode = 400;
    throw error;
  }

  purchaseRequest.status = normalizedStatus;
  purchaseRequest.approvedBy = user._id || user.userId || user.id;
  purchaseRequest.approvedAt = new Date();
  if (rejectionReason) {
    purchaseRequest.rejectionReason = rejectionReason.trim();
  }

  // Update item level status and approved quantities
  const approvalMap = new Map();
  if (Array.isArray(itemApprovals)) {
    itemApprovals.forEach((appr) => {
      if (appr && appr.itemId) approvalMap.set(String(appr.itemId), appr);
    });
  }

  purchaseRequest.items.forEach((item) => {
    const itemOverride = approvalMap.get(String(item._id));
    if (normalizedStatus === "APPROVED") {
      const approvedQty =
        itemOverride && itemOverride.approvedQuantity !== undefined
          ? Math.max(0, Number(itemOverride.approvedQuantity))
          : (item.approvedQuantity !== null && item.approvedQuantity !== undefined
              ? item.approvedQuantity
              : item.shortageQuantity);
      item.approvedQuantity = approvedQty;
      item.status = "APPROVED";
    } else if (normalizedStatus === "REJECTED") {
      item.status = "REJECTED";
    }
  });

  await purchaseRequest.save();

  return purchaseRequest.populate([
    { path: "requestedBy", select: "name email role department" },
    { path: "approvedBy", select: "name email role department" },
    { path: "event", select: "eventName eventDate location" },
    { path: "receipts.receivedBy", select: "name email role department" },
    { path: "items.stockItem", select: "name category unit totalQuantity availableQuantity" },
  ]);
};

const receivePurchaseRequestItems = async ({
  requestId,
  receivedItems = [], // [{ itemId, quantityReceived, unit, notes }]
  notes = "",
  idempotencyKey,
  user,
}) => {
  if (!idempotencyKey || !String(idempotencyKey).trim()) {
    const error = new Error("Idempotency key is required to prevent duplicate stock receipts");
    error.statusCode = 400;
    throw error;
  }

  if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
    const error = new Error("At least one received item is required");
    error.statusCode = 400;
    throw error;
  }

  const role = String(user?.role || "").toLowerCase();
  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isManager = role === "manager";

  if (!isSuperAdmin && !isAdmin && !isManager) {
    const error = new Error(
      "Access denied: You are not authorized to receive goods against purchase requests"
    );
    error.statusCode = 403;
    throw error;
  }

  const userId = user._id || user.userId || user.id;

  return await runInTransaction(async (session) => {
    const purchaseRequest = await PurchaseRequest.findById(requestId).session(session);
    if (!purchaseRequest) {
      const error = new Error("Purchase request not found");
      error.statusCode = 404;
      throw error;
    }

    if (!["APPROVED", "PARTIALLY_FULFILLED"].includes(purchaseRequest.status)) {
      const error = new Error(
        `Cannot receive goods for purchase request in "${purchaseRequest.status}" status. Only APPROVED or PARTIALLY_FULFILLED requests can be received.`
      );
      error.statusCode = 400;
      throw error;
    }

    // Idempotency check: Has this receiptId already been processed?
    const existingReceipt = purchaseRequest.receipts.find(
      (r) => r.receiptId === String(idempotencyKey).trim()
    );
    if (existingReceipt) {
      return purchaseRequest.populate([
        { path: "requestedBy", select: "name email role department" },
        { path: "approvedBy", select: "name email role department" },
        { path: "event", select: "eventName eventDate location" },
        { path: "receipts.receivedBy", select: "name email role department" },
        { path: "items.stockItem", select: "name category unit totalQuantity availableQuantity" },
      ]);
    }

    const receiptItemsRecord = [];
    const updatedStockItems = [];

    for (const rec of receivedItems) {
      const reqItem = purchaseRequest.items.id(rec.itemId);
      if (!reqItem) {
        const error = new Error(`Item ${rec.itemId} does not belong to this purchase request`);
        error.statusCode = 400;
        throw error;
      }

      const rawQty = Number(rec.quantityReceived);
      if (!Number.isFinite(rawQty) || rawQty <= 0) {
        continue;
      }

      const receivedUnit = rec.unit ? rec.unit.trim() : reqItem.unit;

      // Find or link stock item
      let stockItemDoc = null;
      if (reqItem.stockItem) {
        stockItemDoc = await StockItem.findById(reqItem.stockItem).session(session);
      }
      if (!stockItemDoc) {
        stockItemDoc = await StockItem.findOne({
          name: { $regex: new RegExp(`^${reqItem.itemName.trim()}$`, "i") },
          $or: [
            { category: { $in: ["Raw Ingredients", "Kitchen Supplies", "Kitchen Equipment"] } },
            { stockType: "kitchen" },
            { department: "Kitchen" },
          ],
        }).session(session);
      }

      let quantityToAdd = rawQty;
      if (stockItemDoc) {
        // Convert unit if different
        if (
          receivedUnit &&
          stockItemDoc.unit &&
          normalizeUnitString(receivedUnit) !== normalizeUnitString(stockItemDoc.unit)
        ) {
          const conv = convertStockToIngredientUnit(rawQty, receivedUnit, stockItemDoc.unit);
          if (!conv.isCompatible) {
            const err = new Error(
              `Cannot receive item "${stockItemDoc.name}" in unit "${receivedUnit}". Warehouse inventory is tracked in "${stockItemDoc.unit}". ${conv.warning || ""}`
            );
            err.statusCode = 400;
            throw err;
          }
          quantityToAdd = conv.convertedQuantity;
        }

        const prevTotal = stockItemDoc.totalQuantity;
        const prevAvailable = stockItemDoc.availableQuantity;

        stockItemDoc.totalQuantity =
          Math.round((stockItemDoc.totalQuantity + quantityToAdd) * 10000) / 10000;
        stockItemDoc.availableQuantity =
          Math.round((stockItemDoc.availableQuantity + quantityToAdd) * 10000) / 10000;
        stockItemDoc.updatedBy = userId;
        await stockItemDoc.save({ session });

        await StockTransaction.create(
          [
            {
              stockItem: stockItemDoc._id,
              event: purchaseRequest.event || null,
              type: "ADDED",
              quantity: quantityToAdd,
              previousAvailable: prevAvailable,
              newAvailable: stockItemDoc.availableQuantity,
              previousTotal: prevTotal,
              newTotal: stockItemDoc.totalQuantity,
              performedBy: userId,
              notes: notes
                ? `Received against PR #${purchaseRequest._id.toString().slice(-6)}: ${notes}`
                : `Received ${rawQty} ${receivedUnit} against Purchase Request`,
            },
          ],
          { session }
        );

        updatedStockItems.push(stockItemDoc);
        reqItem.stockItem = stockItemDoc._id;
      }

      // Convert quantity to reqItem.unit if needed for accurate tracking
      let qtyInItemUnit = rawQty;
      if (
        receivedUnit &&
        reqItem.unit &&
        normalizeUnitString(receivedUnit) !== normalizeUnitString(reqItem.unit)
      ) {
        const convItem = convertStockToIngredientUnit(rawQty, receivedUnit, reqItem.unit);
        if (convItem.isCompatible && convItem.convertedQuantity !== null) {
          qtyInItemUnit = convItem.convertedQuantity;
        }
      }

      reqItem.receivedQuantity =
        Math.round(((reqItem.receivedQuantity || 0) + qtyInItemUnit) * 10000) / 10000;
      const targetQty =
        reqItem.approvedQuantity !== null && reqItem.approvedQuantity !== undefined
          ? reqItem.approvedQuantity
          : reqItem.shortageQuantity;

      if (reqItem.receivedQuantity >= targetQty) {
        reqItem.status = "FULFILLED";
      } else {
        reqItem.status = "PARTIALLY_FULFILLED";
      }

      receiptItemsRecord.push({
        itemId: reqItem._id,
        itemName: reqItem.itemName,
        quantityReceived: rawQty,
        unit: receivedUnit,
        stockItem: stockItemDoc ? stockItemDoc._id : null,
      });
    }

    if (receiptItemsRecord.length === 0) {
      const error = new Error("No valid positive received quantities provided");
      error.statusCode = 400;
      throw error;
    }

    // Determine overall request status
    const allFulfilled = purchaseRequest.items.every(
      (item) =>
        item.status === "FULFILLED" ||
        item.receivedQuantity >= (item.approvedQuantity ?? item.shortageQuantity)
    );
    purchaseRequest.status = allFulfilled ? "FULFILLED" : "PARTIALLY_FULFILLED";

    // Append receipt history
    purchaseRequest.receipts.push({
      receiptId: String(idempotencyKey).trim(),
      receivedBy: userId,
      receivedAt: new Date(),
      items: receiptItemsRecord,
      notes: notes ? notes.trim() : "",
    });

    await purchaseRequest.save({ session });

    // Emit live socket updates
    updatedStockItems.forEach((item) => {
      emitStockEvent("stock:itemUpdated", item);
    });

    return purchaseRequest.populate([
      { path: "requestedBy", select: "name email role department" },
      { path: "approvedBy", select: "name email role department" },
      { path: "event", select: "eventName eventDate location" },
      { path: "receipts.receivedBy", select: "name email role department" },
      { path: "items.stockItem", select: "name category unit totalQuantity availableQuantity" },
    ]);
  });
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

  // Collect tasks from matching duties (including duty.tasks and duty.checklist)
  const allTasks = [];
  matchingDuties.forEach((duty) => {
    if (Array.isArray(duty.tasks) && duty.tasks.length > 0) {
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
          description: t.description || "",
          status: t.status,
          plannedStartAt: t.plannedStartAt,
          plannedEndAt: t.plannedEndAt,
          actualStartAt: t.actualStartAt,
          actualEndAt: t.actualEndAt,
          completionNotes: t.completionNotes,
        });
      });
    }

    if (Array.isArray(duty.checklist) && duty.checklist.length > 0) {
      duty.checklist.forEach((c) => {
        allTasks.push({
          id: c._id,
          dutyId: duty._id,
          dutyTitle: duty.dutyTitle,
          eventId: duty.event?._id || duty.event,
          eventName: duty.event?.eventName || "Event",
          eventDate: duty.event?.eventDate,
          staffName: duty.staff?.name || "Unassigned",
          department: duty.department || normDept,
          title: c.text,
          description: "",
          status: c.completed ? "COMPLETED" : "PENDING",
          plannedStartAt: null,
          plannedEndAt: null,
          actualStartAt: null,
          actualEndAt: null,
          completionNotes: "",
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
  let duty = await Duty.findById(dutyId);
  if (!duty) {
    duty = await Duty.findOne({
      $or: [
        { "tasks._id": taskId },
        { "checklist._id": taskId },
      ],
    });
  }

  if (!duty) {
    const error = new Error("Duty not found");
    error.statusCode = 404;
    throw error;
  }

  // 1. Try finding in duty.tasks
  let task = typeof duty.tasks?.id === "function" ? duty.tasks.id(taskId) : null;
  if (!task && Array.isArray(duty.tasks)) {
    task = duty.tasks.find((t) => String(t._id || t.id) === String(taskId));
  }

  if (task) {
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
  }

  // 2. Try finding in duty.checklist
  let checkItem = typeof duty.checklist?.id === "function" ? duty.checklist.id(taskId) : null;
  if (!checkItem && Array.isArray(duty.checklist)) {
    checkItem = duty.checklist.find((c) => String(c._id || c.id) === String(taskId));
  }

  if (checkItem) {
    if (status) {
      checkItem.completed = status === "COMPLETED";
    }
    await duty.save();
    return {
      _id: checkItem._id,
      title: checkItem.text,
      status: checkItem.completed ? "COMPLETED" : "PENDING",
    };
  }

  // 3. Fallback: Check standalone Task collection
  try {
    const standaloneTask = await Task.findById(taskId);
    if (standaloneTask) {
      if (status) standaloneTask.status = status;
      if (notes) standaloneTask.notes = notes.trim();
      await standaloneTask.save();
      return standaloneTask;
    }
  } catch (_) {}

  const error = new Error("Task not found in duty");
  error.statusCode = 404;
  throw error;
};

const deleteDepartmentTask = async (dutyId, taskId) => {
  let duty = await Duty.findById(dutyId);

  // If duty not found by dutyId, try finding duty containing this task
  if (!duty) {
    duty = await Duty.findOne({
      $or: [
        { "tasks._id": taskId },
        { "checklist._id": taskId },
      ],
    });
  }

  if (duty) {
    // 1. Try finding in duty.tasks
    const taskIndex = duty.tasks?.findIndex(
      (t) => String(t._id || t.id) === String(taskId)
    );
    if (taskIndex !== undefined && taskIndex !== -1) {
      duty.tasks.splice(taskIndex, 1);
      await duty.save();
      return { message: "Task deleted successfully", taskId };
    }

    if (typeof duty.tasks?.id === "function") {
      const taskDoc = duty.tasks.id(taskId);
      if (taskDoc) {
        duty.tasks.pull(taskId);
        await duty.save();
        return { message: "Task deleted successfully", taskId };
      }
    }

    // 2. Try finding in duty.checklist
    const checkIndex = duty.checklist?.findIndex(
      (c) => String(c._id || c.id) === String(taskId)
    );
    if (checkIndex !== undefined && checkIndex !== -1) {
      duty.checklist.splice(checkIndex, 1);
      await duty.save();
      return { message: "Task deleted successfully", taskId };
    }

    if (typeof duty.checklist?.id === "function") {
      const checkDoc = duty.checklist.id(taskId);
      if (checkDoc) {
        duty.checklist.pull(taskId);
        await duty.save();
        return { message: "Task deleted successfully", taskId };
      }
    }
  }

  // 3. Fallback: Search all duties in case dutyId was mismatched
  const anyDuty = await Duty.findOne({
    $or: [
      { "tasks._id": taskId },
      { "checklist._id": taskId },
    ],
  });
  if (anyDuty) {
    const tIdx = anyDuty.tasks?.findIndex(
      (t) => String(t._id || t.id) === String(taskId)
    );
    if (tIdx !== undefined && tIdx !== -1) {
      anyDuty.tasks.splice(tIdx, 1);
      await anyDuty.save();
      return { message: "Task deleted successfully", taskId };
    }

    const cIdx = anyDuty.checklist?.findIndex(
      (c) => String(c._id || c.id) === String(taskId)
    );
    if (cIdx !== undefined && cIdx !== -1) {
      anyDuty.checklist.splice(cIdx, 1);
      await anyDuty.save();
      return { message: "Task deleted successfully", taskId };
    }
  }

  // 4. Try finding in standalone Task collection
  try {
    const deleted = await Task.findByIdAndDelete(taskId);
    if (deleted) {
      return { message: "Task deleted successfully", taskId };
    }
  } catch (_) {}

  // 5. If task is already gone from database, return success (DELETE is idempotent)
  return { message: "Task deleted successfully", taskId };
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
  getPurchaseRequestById,
  reviewPurchaseRequest,
  receivePurchaseRequestItems,
  getDepartmentTasks,
  createDepartmentTask,
  updateDepartmentTaskStatus,
  deleteDepartmentTask,
  getDecorationEvents,
  getDecorationMaterials,
  getPhotographyEvents,
  getPhotographyEquipment,
};
