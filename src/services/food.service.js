const FoodItem = require("../models/foodItem.model");

// ==========================================
// Default Seed Menu
// ==========================================

const DEFAULT_FOOD_ITEMS = [
  // Welcome Drinks
  {
    name: "Virgin Mint Mojito",
    category: "Welcome Drinks",
    dietary: "veg",
    defaultRate: 70,
    description: "Refreshing crushed fresh mint, lime juice, and soda.",
    isPopular: true,
  },
  {
    name: "Blue Lagoon Punch",
    category: "Welcome Drinks",
    dietary: "veg",
    defaultRate: 75,
    description: "Curacao citrus punch with lemon and sprite.",
    isPopular: false,
  },
  {
    name: "Kesar Pista Thandai",
    category: "Welcome Drinks",
    dietary: "veg",
    defaultRate: 90,
    description: "Traditional saffron and pistachio milk cooler.",
    isPopular: true,
  },

  // Starters
  {
    name: "Paneer Tikka Angara",
    category: "Starters / Appetizers",
    dietary: "veg",
    defaultRate: 180,
    description: "Smoky tandoori marinated cottage cheese with bell peppers.",
    isPopular: true,
  },
  {
    name: "Crispy Corn & Waterchestnut",
    category: "Starters / Appetizers",
    dietary: "veg",
    defaultRate: 150,
    description: "Wok-tossed sweet corn kernels with oriental spices.",
    isPopular: false,
  },
  {
    name: "Chicken Malai Tikka",
    category: "Starters / Appetizers",
    dietary: "non-veg",
    defaultRate: 220,
    description: "Tender chicken morsels in rich cashew cream and cardamom marinade.",
    isPopular: true,
  },
  {
    name: "Amritsari Fish Fry",
    category: "Starters / Appetizers",
    dietary: "non-veg",
    defaultRate: 250,
    description: "Crispy carom-spiced batter fried river fish with mint chutney.",
    isPopular: false,
  },
  {
    name: "Dahi Ke Kebab",
    category: "Starters / Appetizers",
    dietary: "veg",
    defaultRate: 160,
    description: "Crispy hung curd patties with coriander and mild green chillies.",
    isPopular: false,
  },

  // Main Course
  {
    name: "Dal Makhani Royal",
    category: "Main Course",
    dietary: "veg",
    defaultRate: 180,
    description: "Slow-cooked overnight black lentils enriched with butter and cream.",
    isPopular: true,
  },
  {
    name: "Paneer Butter Masala",
    category: "Main Course",
    dietary: "veg",
    defaultRate: 210,
    description: "Succulent paneer cubes simmered in velvety tomato-butter gravy.",
    isPopular: true,
  },
  {
    name: "Murg Makhani (Butter Chicken)",
    category: "Main Course",
    dietary: "non-veg",
    defaultRate: 280,
    description: "Roasted shredded chicken in silky makhani tomato sauce.",
    isPopular: true,
  },
  {
    name: "Mutton Rogan Josh",
    category: "Main Course",
    dietary: "non-veg",
    defaultRate: 350,
    description: "Slow-braised tender goat meat in Kashmiri aromatic gravy.",
    isPopular: true,
  },
  {
    name: "Subz Handi Diwani",
    category: "Main Course",
    dietary: "veg",
    defaultRate: 170,
    description: "Seasonal farm-fresh vegetables tossed in rich yellow gravy.",
    isPopular: false,
  },

  // Breads & Rice
  {
    name: "Awadhi Dum Biryani (Veg)",
    category: "Breads & Rice",
    dietary: "veg",
    defaultRate: 190,
    description: "Fragrant basmati rice cooked on dum with marinated vegetables and saffron.",
    isPopular: true,
  },
  {
    name: "Hyderabadi Chicken Biryani",
    category: "Breads & Rice",
    dietary: "non-veg",
    defaultRate: 270,
    description: "Classic spiced chicken dum biryani served with salan and raita.",
    isPopular: true,
  },
  {
    name: "Assorted Indian Bread Basket",
    category: "Breads & Rice",
    dietary: "veg",
    defaultRate: 80,
    description: "Butter Naan, Garlic Naan, Laccha Paratha, and Tandoori Roti.",
    isPopular: true,
  },
  {
    name: "Jeera Pulao",
    category: "Breads & Rice",
    dietary: "veg",
    defaultRate: 110,
    description: "Cumin-tempered fragrant long-grain basmati rice.",
    isPopular: false,
  },

  // Desserts
  {
    name: "Warm Gulab Jamun with Rabri",
    category: "Desserts & Sweets",
    dietary: "veg",
    defaultRate: 110,
    description: "Ghee-fried milk dumplings served with slow-reduced creamy rabri.",
    isPopular: true,
  },
  {
    name: "Moong Dal Halwa",
    category: "Desserts & Sweets",
    dietary: "veg",
    defaultRate: 130,
    description: "Rich roasted yellow lentil pudding with pure desi ghee and almonds.",
    isPopular: true,
  },
  {
    name: "Angoori Rasmalai",
    category: "Desserts & Sweets",
    dietary: "veg",
    defaultRate: 120,
    description: "Soft mini cottage cheese disks in chilled saffron-pistachio milk.",
    isPopular: true,
  },

  // Live Counters
  {
    name: "Chaat Street Counter",
    category: "Live Counters",
    dietary: "veg",
    defaultRate: 140,
    description: "Live station serving Pani Puri, Dahi Puri, Papdi Chaat, and Aloo Tikki.",
    isPopular: true,
  },
  {
    name: "Italian Pasta Live Station",
    category: "Live Counters",
    dietary: "veg",
    defaultRate: 160,
    description: "Live pasta counter featuring Penne and Fusilli in Arrabbiata and Alfredo sauce.",
    isPopular: true,
  },
];

// ==========================================
// Seed Default Items
// ==========================================

const ensureSeedData = async () => {
  const count = await FoodItem.countDocuments();
  if (count === 0) {
    await FoodItem.insertMany(
      DEFAULT_FOOD_ITEMS.map((item, index) => ({
        ...item,
        sortOrder: index,
      }))
    );
  }
};

// ==========================================
// GET ALL FOOD ITEMS
// ==========================================

const getFoodItems = async ({
  category,
  dietary,
  search,
  active,
} = {}) => {
  await ensureSeedData();

  const query = {};

  if (active !== undefined) {
    query.active = active === "true" || active === true;
  }

  if (category && category !== "all") {
    query.category = category;
  }

  if (dietary && dietary !== "all") {
    query.dietary = dietary.toLowerCase();
  }

  if (search && search.trim()) {
    query.name = { $regex: search.trim(), $options: "i" };
  }

  return FoodItem.find(query)
    .sort({ sortOrder: 1, category: 1, name: 1 })
    .lean();
};

// ==========================================
// GET BY ID
// ==========================================

const getFoodItemById = async (id) => {
  const item = await FoodItem.findById(id).lean();
  if (!item) {
    throw new Error(`Food item not found: ${id}`);
  }
  return item;
};

// ==========================================
// CREATE FOOD ITEM
// ==========================================

const createFoodItem = async (data, userId = null) => {
  if (!data.name?.trim()) {
    throw new Error("Food item name is required");
  }

  if (!data.category?.trim()) {
    throw new Error("Category is required");
  }

  const rate = Number(data.defaultRate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Valid default rate is required");
  }

  const created = await FoodItem.create({
    name: data.name.trim(),
    category: data.category.trim(),
    dietary: data.dietary || "veg",
    defaultRate: rate,
    description: data.description?.trim() || "",
    isPopular: Boolean(data.isPopular),
    active: data.active !== undefined ? Boolean(data.active) : true,
    sortOrder: Number(data.sortOrder) || 0,
    createdBy: userId,
  });

  return created.toObject();
};

// ==========================================
// UPDATE FOOD ITEM
// ==========================================

const updateFoodItem = async (id, data) => {
  const item = await FoodItem.findById(id);
  if (!item) {
    throw new Error(`Food item not found: ${id}`);
  }

  if (data.name !== undefined) item.name = data.name.trim();
  if (data.category !== undefined) item.category = data.category.trim();
  if (data.dietary !== undefined) item.dietary = data.dietary;
  if (data.defaultRate !== undefined) {
    const rate = Number(data.defaultRate);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error("Valid default rate is required");
    }
    item.defaultRate = rate;
  }
  if (data.description !== undefined) item.description = data.description.trim();
  if (data.isPopular !== undefined) item.isPopular = Boolean(data.isPopular);
  if (data.active !== undefined) item.active = Boolean(data.active);
  if (data.sortOrder !== undefined) item.sortOrder = Number(data.sortOrder);

  await item.save();
  return item.toObject();
};

// ==========================================
// DELETE FOOD ITEM
// ==========================================

const deleteFoodItem = async (id) => {
  const item = await FoodItem.findByIdAndDelete(id);
  if (!item) {
    throw new Error(`Food item not found: ${id}`);
  }
  return { success: true, message: "Food item deleted successfully" };
};

module.exports = {
  getFoodItems,
  getFoodItemById,
  createFoodItem,
  updateFoodItem,
  deleteFoodItem,
  DEFAULT_FOOD_ITEMS,
};
