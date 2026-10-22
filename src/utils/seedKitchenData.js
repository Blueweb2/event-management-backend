require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const User = require("../models/user.model");
const Client = require("../models/client.model");
const Booking = require("../models/booking.model");
const Event = require("../models/event.model");
const Service = require("../models/service.model");
const FoodItem = require("../models/foodItem.model");
const Recipe = require("../models/recipe.model");
const StockItem = require("../models/stockItem.model");

// ==========================================
// 1. RAW INGREDIENT STOCK ITEMS DEFINITIONS
// ==========================================
const STOCK_INGREDIENTS = [
  // Dairy & Liquids
  { name: "Fresh Milk", category: "Raw Ingredients", totalQuantity: 300, availableQuantity: 300, minStockLevel: 50, unit: "liters", unitPrice: 60 },
  { name: "Pure Desi Ghee", category: "Raw Ingredients", totalQuantity: 80, availableQuantity: 80, minStockLevel: 15, unit: "kg", unitPrice: 650 },
  { name: "Fresh Paneer", category: "Raw Ingredients", totalQuantity: 150, availableQuantity: 150, minStockLevel: 25, unit: "kg", unitPrice: 380 },
  { name: "Thick Yogurt / Curd", category: "Raw Ingredients", totalQuantity: 120, availableQuantity: 120, minStockLevel: 20, unit: "kg", unitPrice: 70 },
  { name: "Coconut Milk", category: "Raw Ingredients", totalQuantity: 60, availableQuantity: 60, minStockLevel: 10, unit: "liters", unitPrice: 180 },
  { name: "Cooking Oil", category: "Raw Ingredients", totalQuantity: 200, availableQuantity: 200, minStockLevel: 40, unit: "liters", unitPrice: 140 },
  { name: "Rose Water", category: "Raw Ingredients", totalQuantity: 10, availableQuantity: 10, minStockLevel: 2, unit: "liters", unitPrice: 220 },

  // Grains & Flours
  { name: "Basmati Rice (Long Grain)", category: "Raw Ingredients", totalQuantity: 400, availableQuantity: 400, minStockLevel: 50, unit: "kg", unitPrice: 120 },
  { name: "Maida (All Purpose Flour)", category: "Raw Ingredients", totalQuantity: 150, availableQuantity: 150, minStockLevel: 20, unit: "kg", unitPrice: 45 },
  { name: "Raw Rice Flour", category: "Raw Ingredients", totalQuantity: 100, availableQuantity: 100, minStockLevel: 20, unit: "kg", unitPrice: 55 },
  { name: "Corn Flour", category: "Raw Ingredients", totalQuantity: 50, availableQuantity: 50, minStockLevel: 10, unit: "kg", unitPrice: 60 },
  { name: "Roasted Vermicelli", category: "Raw Ingredients", totalQuantity: 60, availableQuantity: 60, minStockLevel: 15, unit: "kg", unitPrice: 90 },
  { name: "Khoya / Mawa", category: "Raw Ingredients", totalQuantity: 70, availableQuantity: 70, minStockLevel: 15, unit: "kg", unitPrice: 420 },

  // Meats & Poultry
  { name: "Fresh Chicken (Curry Cut)", category: "Raw Ingredients", totalQuantity: 350, availableQuantity: 350, minStockLevel: 50, unit: "kg", unitPrice: 240 },

  // Fresh Vegetables
  { name: "Onion", category: "Raw Ingredients", totalQuantity: 250, availableQuantity: 250, minStockLevel: 40, unit: "kg", unitPrice: 35 },
  { name: "Tomato", category: "Raw Ingredients", totalQuantity: 200, availableQuantity: 200, minStockLevel: 30, unit: "kg", unitPrice: 40 },
  { name: "Ginger-Garlic Paste", category: "Raw Ingredients", totalQuantity: 80, availableQuantity: 80, minStockLevel: 15, unit: "kg", unitPrice: 180 },
  { name: "Green Chilli", category: "Raw Ingredients", totalQuantity: 30, availableQuantity: 30, minStockLevel: 5, unit: "kg", unitPrice: 80 },
  { name: "Capsicum (Bell Pepper)", category: "Raw Ingredients", totalQuantity: 60, availableQuantity: 60, minStockLevel: 10, unit: "kg", unitPrice: 70 },
  { name: "Fresh Mint Leaves", category: "Raw Ingredients", totalQuantity: 25, availableQuantity: 25, minStockLevel: 5, unit: "kg", unitPrice: 90 },
  { name: "Fresh Coriander Leaves", category: "Raw Ingredients", totalQuantity: 25, availableQuantity: 25, minStockLevel: 5, unit: "kg", unitPrice: 70 },
  { name: "Curry Leaves", category: "Raw Ingredients", totalQuantity: 10, availableQuantity: 10, minStockLevel: 2, unit: "kg", unitPrice: 120 },
  { name: "Fresh Lemons", category: "Raw Ingredients", totalQuantity: 40, availableQuantity: 40, minStockLevel: 5, unit: "kg", unitPrice: 90 },
  { name: "Mixed Vegetables (Carrot, Beans, Peas)", category: "Raw Ingredients", totalQuantity: 180, availableQuantity: 180, minStockLevel: 30, unit: "kg", unitPrice: 65 },
  { name: "Fresh Cucumber", category: "Raw Ingredients", totalQuantity: 80, availableQuantity: 80, minStockLevel: 15, unit: "kg", unitPrice: 40 },
  { name: "Fresh Carrot", category: "Raw Ingredients", totalQuantity: 80, availableQuantity: 80, minStockLevel: 15, unit: "kg", unitPrice: 45 },
  { name: "Grated Coconut", category: "Raw Ingredients", totalQuantity: 50, availableQuantity: 50, minStockLevel: 10, unit: "kg", unitPrice: 110 },

  // Dry Fruits & Nuts
  { name: "Almonds (Badam)", category: "Raw Ingredients", totalQuantity: 40, availableQuantity: 40, minStockLevel: 5, unit: "kg", unitPrice: 850 },
  { name: "Pistachios (Pista)", category: "Raw Ingredients", totalQuantity: 25, availableQuantity: 25, minStockLevel: 5, unit: "kg", unitPrice: 1200 },
  { name: "Cashews (Kaju)", category: "Raw Ingredients", totalQuantity: 40, availableQuantity: 40, minStockLevel: 5, unit: "kg", unitPrice: 900 },
  { name: "Golden Raisins (Kismis)", category: "Raw Ingredients", totalQuantity: 30, availableQuantity: 30, minStockLevel: 5, unit: "kg", unitPrice: 350 },

  // Spices & Seasonings
  { name: "Granulated Sugar", category: "Raw Ingredients", totalQuantity: 250, availableQuantity: 250, minStockLevel: 40, unit: "kg", unitPrice: 45 },
  { name: "Iodized Salt", category: "Raw Ingredients", totalQuantity: 100, availableQuantity: 100, minStockLevel: 20, unit: "kg", unitPrice: 22 },
  { name: "Kashmiri Chilli Powder", category: "Raw Ingredients", totalQuantity: 30, availableQuantity: 30, minStockLevel: 5, unit: "kg", unitPrice: 320 },
  { name: "Turmeric Powder", category: "Raw Ingredients", totalQuantity: 25, availableQuantity: 25, minStockLevel: 5, unit: "kg", unitPrice: 220 },
  { name: "Garam Masala Powder", category: "Raw Ingredients", totalQuantity: 20, availableQuantity: 20, minStockLevel: 4, unit: "kg", unitPrice: 450 },
  { name: "Biriyani Masala", category: "Raw Ingredients", totalQuantity: 35, availableQuantity: 35, minStockLevel: 5, unit: "kg", unitPrice: 400 },
  { name: "Green Cardamom (Elaichi)", category: "Raw Ingredients", totalQuantity: 10, availableQuantity: 10, minStockLevel: 2, unit: "kg", unitPrice: 2800 },
  { name: "Fennel Seeds (Saunf)", category: "Raw Ingredients", totalQuantity: 15, availableQuantity: 15, minStockLevel: 3, unit: "kg", unitPrice: 280 },
  { name: "Whole Garam Spices (Cloves, Cinnamon, Bayleaf)", category: "Raw Ingredients", totalQuantity: 20, availableQuantity: 20, minStockLevel: 4, unit: "kg", unitPrice: 850 },
  { name: "Dry Yeast", category: "Raw Ingredients", totalQuantity: 10, availableQuantity: 10, minStockLevel: 2, unit: "kg", unitPrice: 450 },

  // DELIBERATE SHORTAGE TEST ITEM (Low stock: only 0.2 kg available, but banquet needs 0.5 kg+)
  { name: "Pure Saffron (Kesar)", category: "Raw Ingredients", totalQuantity: 0.2, availableQuantity: 0.2, minStockLevel: 1.0, unit: "kg", unitPrice: 180000 },
];

// ==========================================
// 2. REALISTIC FOOD MENU DISHES
// ==========================================
const MENU_DISHES = [
  // 1. Beverages
  {
    name: "Kesar Pista Thandai",
    category: "Beverages",
    dietary: "veg",
    defaultRate: 95,
    description: "Traditional chilled royal milk drink infused with Kashmiri saffron, crushed pistachios, almonds, and fennel.",
    isPopular: true,
  },
  {
    name: "Fresh Lime Juice",
    category: "Beverages",
    dietary: "veg",
    defaultRate: 50,
    description: "Zesty freshly squeezed lime juice with mint sprigs, rock salt, and chilled soda or water.",
    isPopular: false,
  },

  // 2. Starters
  {
    name: "Paneer Tikka",
    category: "Starters",
    dietary: "veg",
    defaultRate: 190,
    description: "Cubes of malai paneer and crisp bell peppers marinated in spiced hung yogurt and chargrilled in tandoor.",
    isPopular: true,
  },
  {
    name: "Chicken 65",
    category: "Starters",
    dietary: "non-veg",
    defaultRate: 230,
    description: "Crispy South Indian fried chicken tossed with curry leaves, ginger-garlic paste, and crushed red chillies.",
    isPopular: true,
  },

  // 3. Main Course
  {
    name: "Vegetable Kurma",
    category: "Main Course",
    dietary: "veg",
    defaultRate: 175,
    description: "Diced garden-fresh vegetables slow-simmered in a rich, mildly spiced coconut-cashew gravy.",
    isPopular: false,
  },

  // 4. Rice and Biriyani
  {
    name: "Chicken Biriyani",
    category: "Rice and Biriyani",
    dietary: "non-veg",
    defaultRate: 290,
    description: "Fragrant long-grain aged Basmati rice and succulent chicken pieces slow-cooked on dum with saffron and herbs.",
    isPopular: true,
  },
  {
    name: "Ghee Rice",
    category: "Rice and Biriyani",
    dietary: "veg",
    defaultRate: 160,
    description: "Aromatic Malabar jeerakasala or Basmati rice tempered in pure desi ghee with golden fried cashews and raisins.",
    isPopular: false,
  },

  // 5. Breads
  {
    name: "Appam",
    category: "Breads",
    dietary: "veg",
    defaultRate: 40,
    description: "Soft, lacy fermented rice pancakes with an airy pillowy center, made fresh on hot appachatti pans.",
    isPopular: true,
  },
  {
    name: "Kerala Parotta",
    category: "Breads",
    dietary: "veg",
    defaultRate: 45,
    description: "Layered, flaky, golden-brown griddled flatbread made from kneaded dough with light ghee glaze.",
    isPopular: true,
  },

  // 6. Side Dishes
  {
    name: "Green Salad",
    category: "Side Dishes",
    dietary: "veg",
    defaultRate: 60,
    description: "Crisp garden cucumbers, ripe tomatoes, red onions, and sweet carrots tossed with lemon dressing and mild green chillies.",
    isPopular: false,
  },

  // 7. Desserts
  {
    name: "Gulab Jamun",
    category: "Desserts",
    dietary: "veg",
    defaultRate: 90,
    description: "Golden fried milk solid dumplings soaked in fragrant cardamom and rose-scented saffron sugar syrup.",
    isPopular: true,
  },
  {
    name: "Payasam",
    category: "Desserts",
    dietary: "veg",
    defaultRate: 85,
    description: "Rich South Indian semiya payasam cooked in condensed milk, ghee, cardamom, golden raisins, and roasted cashews.",
    isPopular: true,
  },

  // 8. Live Counters
  {
    name: "Live Dosa & Appam Station",
    category: "Live Counters",
    dietary: "veg",
    defaultRate: 150,
    description: "Interactive chef counter preparing hot, paper-thin crispy dosas and steaming lacy appams on order.",
    isPopular: true,
  },

  // Unmapped dish for missing recipe warning test
  {
    name: "Chef's Artisanal Herb Bruschetta",
    category: "Starters",
    dietary: "veg",
    defaultRate: 120,
    description: "Toasted country baguette slices topped with balsamic roma tomatoes, fresh basil, and extra virgin olive oil.",
    isPopular: false,
  },
];

// ==========================================
// 3. RECIPES & INGREDIENT RATIOS (PER 1 SERVING)
// ==========================================
const RECIPE_DEFINITIONS = [
  {
    dishName: "Kesar Pista Thandai",
    yieldServings: 1,
    defaultWastagePercent: 5,
    ingredients: [
      { name: "Fresh Milk", quantityPerServing: 0.2, unit: "liters", notes: "Chilled whole milk" },
      { name: "Granulated Sugar", quantityPerServing: 0.02, unit: "kg" },
      { name: "Almonds (Badam)", quantityPerServing: 0.01, unit: "kg", notes: "Blanched and peeled" },
      { name: "Pistachios (Pista)", quantityPerServing: 0.005, unit: "kg", notes: "Finely slivered" },
      { name: "Cashews (Kaju)", quantityPerServing: 0.005, unit: "kg" },
      { name: "Fennel Seeds (Saunf)", quantityPerServing: 0.002, unit: "kg" },
      { name: "Green Cardamom (Elaichi)", quantityPerServing: 0.001, unit: "kg" },
      { name: "Pure Saffron (Kesar)", quantityPerServing: 0.0003, unit: "kg", notes: "Warm milk steeped" },
    ],
    notes: "Grind soaked nuts and fennel into a fine paste. Whisk into chilled saffron milk.",
  },
  {
    dishName: "Fresh Lime Juice",
    yieldServings: 1,
    defaultWastagePercent: 3,
    ingredients: [
      { name: "Fresh Lemons", quantityPerServing: 0.05, unit: "kg", notes: "Freshly squeezed juice" },
      { name: "Granulated Sugar", quantityPerServing: 0.025, unit: "kg" },
      { name: "Fresh Mint Leaves", quantityPerServing: 0.005, unit: "kg", notes: "Crushed sprigs" },
      { name: "Iodized Salt", quantityPerServing: 0.002, unit: "kg" },
    ],
    notes: "Muddle mint lightly with sugar syrup and fresh lemon juice. Top with ice water.",
  },
  {
    dishName: "Paneer Tikka",
    yieldServings: 1,
    defaultWastagePercent: 6,
    ingredients: [
      { name: "Fresh Paneer", quantityPerServing: 0.12, unit: "kg", notes: "3cm cubes" },
      { name: "Thick Yogurt / Curd", quantityPerServing: 0.04, unit: "kg", notes: "Hung curd base" },
      { name: "Ginger-Garlic Paste", quantityPerServing: 0.012, unit: "kg" },
      { name: "Kashmiri Chilli Powder", quantityPerServing: 0.005, unit: "kg" },
      { name: "Turmeric Powder", quantityPerServing: 0.002, unit: "kg" },
      { name: "Garam Masala Powder", quantityPerServing: 0.003, unit: "kg" },
      { name: "Fresh Lemons", quantityPerServing: 0.01, unit: "kg" },
      { name: "Cooking Oil", quantityPerServing: 0.015, unit: "liters", notes: "Mustard or cooking oil" },
      { name: "Iodized Salt", quantityPerServing: 0.004, unit: "kg" },
      { name: "Capsicum (Bell Pepper)", quantityPerServing: 0.03, unit: "kg", notes: "Square cuts" },
      { name: "Onion", quantityPerServing: 0.03, unit: "kg", notes: "Petal layers" },
    ],
    notes: "Marinate paneer for at least 45 minutes before skewering and cooking in tandoor.",
  },
  {
    dishName: "Chicken 65",
    yieldServings: 1,
    defaultWastagePercent: 5,
    ingredients: [
      { name: "Fresh Chicken (Curry Cut)", quantityPerServing: 0.15, unit: "kg", notes: "Boneless bite pieces" },
      { name: "Ginger-Garlic Paste", quantityPerServing: 0.015, unit: "kg" },
      { name: "Kashmiri Chilli Powder", quantityPerServing: 0.008, unit: "kg" },
      { name: "Corn Flour", quantityPerServing: 0.015, unit: "kg" },
      { name: "Thick Yogurt / Curd", quantityPerServing: 0.025, unit: "kg" },
      { name: "Curry Leaves", quantityPerServing: 0.003, unit: "kg" },
      { name: "Cooking Oil", quantityPerServing: 0.03, unit: "liters", notes: "For deep frying" },
      { name: "Iodized Salt", quantityPerServing: 0.005, unit: "kg" },
    ],
    notes: "Deep fry till crisp and immediately toss with crackled curry leaves and green chillies.",
  },
  {
    dishName: "Vegetable Kurma",
    yieldServings: 1,
    defaultWastagePercent: 5,
    ingredients: [
      { name: "Mixed Vegetables (Carrot, Beans, Peas)", quantityPerServing: 0.15, unit: "kg" },
      { name: "Onion", quantityPerServing: 0.04, unit: "kg" },
      { name: "Tomato", quantityPerServing: 0.03, unit: "kg" },
      { name: "Grated Coconut", quantityPerServing: 0.025, unit: "kg" },
      { name: "Ginger-Garlic Paste", quantityPerServing: 0.01, unit: "kg" },
      { name: "Green Chilli", quantityPerServing: 0.003, unit: "kg" },
      { name: "Whole Garam Spices (Cloves, Cinnamon, Bayleaf)", quantityPerServing: 0.002, unit: "kg" },
      { name: "Cooking Oil", quantityPerServing: 0.015, unit: "liters" },
      { name: "Iodized Salt", quantityPerServing: 0.004, unit: "kg" },
    ],
    notes: "Simmer vegetables in coconut poppy seed paste until tender.",
  },
  {
    dishName: "Chicken Biriyani",
    yieldServings: 1,
    defaultWastagePercent: 5,
    ingredients: [
      { name: "Fresh Chicken (Curry Cut)", quantityPerServing: 0.18, unit: "kg", notes: "Tender bone-in cuts" },
      { name: "Basmati Rice (Long Grain)", quantityPerServing: 0.15, unit: "kg", notes: "Aged basmati" },
      { name: "Onion", quantityPerServing: 0.06, unit: "kg", notes: "Deep fried birista" },
      { name: "Tomato", quantityPerServing: 0.04, unit: "kg" },
      { name: "Ginger-Garlic Paste", quantityPerServing: 0.015, unit: "kg" },
      { name: "Green Chilli", quantityPerServing: 0.005, unit: "kg" },
      { name: "Thick Yogurt / Curd", quantityPerServing: 0.03, unit: "kg" },
      { name: "Biriyani Masala", quantityPerServing: 0.008, unit: "kg" },
      { name: "Fresh Mint Leaves", quantityPerServing: 0.005, unit: "kg" },
      { name: "Fresh Coriander Leaves", quantityPerServing: 0.005, unit: "kg" },
      { name: "Pure Desi Ghee", quantityPerServing: 0.02, unit: "kg" },
      { name: "Iodized Salt", quantityPerServing: 0.005, unit: "kg" },
    ],
    notes: "Layer half-cooked rice over marinated chicken and seal pot with dough for dum cooking.",
  },
  {
    dishName: "Ghee Rice",
    yieldServings: 1,
    defaultWastagePercent: 4,
    ingredients: [
      { name: "Basmati Rice (Long Grain)", quantityPerServing: 0.14, unit: "kg" },
      { name: "Pure Desi Ghee", quantityPerServing: 0.025, unit: "kg" },
      { name: "Onion", quantityPerServing: 0.03, unit: "kg", notes: "Thinly sliced" },
      { name: "Cashews (Kaju)", quantityPerServing: 0.008, unit: "kg", notes: "Golden fried" },
      { name: "Golden Raisins (Kismis)", quantityPerServing: 0.005, unit: "kg" },
      { name: "Whole Garam Spices (Cloves, Cinnamon, Bayleaf)", quantityPerServing: 0.003, unit: "kg" },
      { name: "Iodized Salt", quantityPerServing: 0.004, unit: "kg" },
    ],
    notes: "Fry spices in pure ghee before adding rice. Garnish with golden fried cashews and raisins.",
  },
  {
    dishName: "Appam",
    yieldServings: 1,
    defaultWastagePercent: 5,
    ingredients: [
      { name: "Raw Rice Flour", quantityPerServing: 0.08, unit: "kg" },
      { name: "Coconut Milk", quantityPerServing: 0.05, unit: "liters" },
      { name: "Dry Yeast", quantityPerServing: 0.001, unit: "kg" },
      { name: "Granulated Sugar", quantityPerServing: 0.005, unit: "kg" },
      { name: "Iodized Salt", quantityPerServing: 0.002, unit: "kg" },
    ],
    notes: "Ferment batter for 8 hours. Swirl quickly in curved appam kadai.",
  },
  {
    dishName: "Kerala Parotta",
    yieldServings: 1,
    defaultWastagePercent: 5,
    ingredients: [
      { name: "Maida (All Purpose Flour)", quantityPerServing: 0.1, unit: "kg" },
      { name: "Cooking Oil", quantityPerServing: 0.02, unit: "liters" },
      { name: "Pure Desi Ghee", quantityPerServing: 0.01, unit: "kg" },
      { name: "Granulated Sugar", quantityPerServing: 0.003, unit: "kg" },
      { name: "Iodized Salt", quantityPerServing: 0.003, unit: "kg" },
    ],
    notes: "Rest dough balls in oil for 2 hours. Stretch paper-thin, spiral, roll and cook on tawa.",
  },
  {
    dishName: "Green Salad",
    yieldServings: 1,
    defaultWastagePercent: 5,
    ingredients: [
      { name: "Fresh Cucumber", quantityPerServing: 0.04, unit: "kg" },
      { name: "Tomato", quantityPerServing: 0.03, unit: "kg" },
      { name: "Onion", quantityPerServing: 0.03, unit: "kg" },
      { name: "Fresh Carrot", quantityPerServing: 0.03, unit: "kg" },
      { name: "Fresh Lemons", quantityPerServing: 0.01, unit: "kg" },
      { name: "Green Chilli", quantityPerServing: 0.002, unit: "kg" },
      { name: "Iodized Salt", quantityPerServing: 0.002, unit: "kg" },
    ],
    notes: "Slice chilled vegetables neatly on platters. Serve with lemon halves and rock salt.",
  },
  {
    dishName: "Gulab Jamun",
    yieldServings: 1,
    defaultWastagePercent: 4,
    ingredients: [
      { name: "Khoya / Mawa", quantityPerServing: 0.05, unit: "kg" },
      { name: "Maida (All Purpose Flour)", quantityPerServing: 0.015, unit: "kg" },
      { name: "Granulated Sugar", quantityPerServing: 0.08, unit: "kg", notes: "For warm sugar syrup" },
      { name: "Green Cardamom (Elaichi)", quantityPerServing: 0.001, unit: "kg" },
      { name: "Pure Desi Ghee", quantityPerServing: 0.03, unit: "kg", notes: "For slow deep frying" },
      { name: "Rose Water", quantityPerServing: 0.002, unit: "liters" },
    ],
    notes: "Fry gently on medium-low heat until mahogany brown. Soak in warm rose-cardamom syrup.",
  },
  {
    dishName: "Payasam",
    yieldServings: 1,
    defaultWastagePercent: 4,
    ingredients: [
      { name: "Fresh Milk", quantityPerServing: 0.18, unit: "liters", notes: "Whole milk base" },
      { name: "Granulated Sugar", quantityPerServing: 0.04, unit: "kg" },
      { name: "Roasted Vermicelli", quantityPerServing: 0.03, unit: "kg" },
      { name: "Pure Desi Ghee", quantityPerServing: 0.015, unit: "kg" },
      { name: "Cashews (Kaju)", quantityPerServing: 0.008, unit: "kg" },
      { name: "Golden Raisins (Kismis)", quantityPerServing: 0.006, unit: "kg" },
      { name: "Green Cardamom (Elaichi)", quantityPerServing: 0.001, unit: "kg" },
    ],
    notes: "Simmer roasted vermicelli in sweetened milk until thick and creamy. Garnish with fried nuts.",
  },
];

async function seedKitchenData() {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();

    console.log("\n=======================================================");
    console.log("1. SEEDING RAW INGREDIENT INVENTORY (StockItem)");
    console.log("=======================================================");
    const stockMap = new Map();

    for (const item of STOCK_INGREDIENTS) {
      let existing = await StockItem.findOne({ name: item.name });
      if (!existing) {
        existing = await StockItem.create(item);
        console.log(`+ Created Stock Item: ${item.name} (${item.availableQuantity} ${item.unit})`);
      } else {
        // Safe update of available quantity and unit if needed
        existing.category = item.category;
        existing.unit = item.unit;
        existing.unitPrice = item.unitPrice;
        await existing.save();
        console.log(`* Verified Stock Item: ${item.name} (${existing.availableQuantity} ${existing.unit})`);
      }
      stockMap.set(existing.name.toLowerCase().trim(), existing);
    }

    console.log("\n=======================================================");
    console.log("2. SEEDING REALISTIC FOOD MENU DISHES (FoodItem)");
    console.log("=======================================================");
    const foodItemMap = new Map();

    for (const dish of MENU_DISHES) {
      let existing = await FoodItem.findOne({ name: dish.name });
      if (!existing) {
        existing = await FoodItem.create({
          ...dish,
          active: true,
        });
        console.log(`+ Created Food Item: [${dish.category}] ${dish.name} - ₹${dish.defaultRate}`);
      } else {
        existing.category = dish.category;
        existing.dietary = dish.dietary;
        existing.defaultRate = dish.defaultRate;
        existing.description = dish.description;
        existing.active = true;
        await existing.save();
        console.log(`* Updated Food Item: [${dish.category}] ${dish.name} - ₹${dish.defaultRate}`);
      }
      foodItemMap.set(existing.name.toLowerCase().trim(), existing);
    }

    console.log("\n=======================================================");
    console.log("3. SEEDING STANDARDIZED KITCHEN RECIPES (Recipe)");
    console.log("=======================================================");
    for (const rec of RECIPE_DEFINITIONS) {
      const foodItem = foodItemMap.get(rec.dishName.toLowerCase().trim());
      if (!foodItem) {
        console.warn(`! Warning: Food item "${rec.dishName}" not found. Skipping recipe.`);
        continue;
      }

      // Map stockItem references
      const ingredientsWithStock = rec.ingredients.map((ing) => {
        const matchedStock = stockMap.get(ing.name.toLowerCase().trim());
        return {
          name: ing.name,
          quantityPerServing: ing.quantityPerServing,
          unit: ing.unit,
          stockItem: matchedStock ? matchedStock._id : null,
          notes: ing.notes || "",
        };
      });

      let existingRecipe = await Recipe.findOne({ foodItem: foodItem._id });
      if (!existingRecipe) {
        existingRecipe = await Recipe.create({
          foodItem: foodItem._id,
          foodItemName: foodItem.name,
          category: foodItem.category,
          yieldServings: rec.yieldServings,
          defaultWastagePercent: rec.defaultWastagePercent,
          ingredients: ingredientsWithStock,
          notes: rec.notes,
        });
        console.log(`+ Created Recipe for: ${foodItem.name} (${ingredientsWithStock.length} ingredients)`);
      } else {
        existingRecipe.foodItemName = foodItem.name;
        existingRecipe.category = foodItem.category;
        existingRecipe.yieldServings = rec.yieldServings;
        existingRecipe.defaultWastagePercent = rec.defaultWastagePercent;
        existingRecipe.ingredients = ingredientsWithStock;
        existingRecipe.notes = rec.notes;
        await existingRecipe.save();
        console.log(`* Updated Recipe for: ${foodItem.name} (${ingredientsWithStock.length} ingredients)`);
      }
    }

    console.log("\n=======================================================");
    console.log("4. SEEDING TEST BOOKINGS & EVENTS FOR KITCHEN WORKFLOW");
    console.log("=======================================================");

    // Client for test events
    let testClient = await Client.findOne({ email: "royal.banquets@testevents.com" });
    if (!testClient) {
      testClient = await Client.create({
        name: "Maharaja Heritage & Banquet Host",
        email: "royal.banquets@testevents.com",
        phone: "+91 98765 43210",
        address: "Palace Road, Bengaluru, Karnataka",
      });
      console.log(`+ Created Test Client: ${testClient.name}`);
    }

    // Standard Catering Service reference
    let cateringService = await Service.findOne({ category: "catering" });
    if (!cateringService) {
      cateringService = await Service.create({
        name: "Catering & Culinary Experience",
        category: "catering",
        pricingType: "PER_GUEST",
        basePrice: 550,
        description: "Full service catering with hot buffet and beverage counter.",
        active: true,
      });
    }

    // Helper to get dates: today, tomorrow, +3 days
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);

    const formatISODate = (d) => d.toISOString();

    // ---------------------------------------------------------------
    // EVENT 1: "Grand Royal Wedding Banquet" (1000 Guests)
    // Has menu items including Kesar Pista Thandai (requires 0.3 kg saffron, but warehouse only has 0.2 kg -> SHORTAGE!)
    // ---------------------------------------------------------------
    const event1Name = "Grand Royal Wedding Banquet";
    let event1 = await Event.findOne({ eventName: event1Name });

    const menu1Items = [
      { name: "Kesar Pista Thandai", category: "Beverages", dietary: "veg", rate: 95 },
      { name: "Chicken 65", category: "Starters", dietary: "non-veg", rate: 230 },
      { name: "Chicken Biriyani", category: "Rice and Biriyani", dietary: "non-veg", rate: 290 },
      { name: "Kerala Parotta", category: "Breads", dietary: "veg", rate: 45 },
      { name: "Vegetable Kurma", category: "Main Course", dietary: "veg", rate: 175 },
      { name: "Gulab Jamun", category: "Desserts", dietary: "veg", rate: 90 },
    ].map((item) => {
      const match = foodItemMap.get(item.name.toLowerCase());
      return {
        foodItemId: match?._id,
        name: item.name,
        category: item.category,
        dietary: item.dietary,
        rate: item.rate,
        quantity: 1000,
        unit: "Guests",
        totalPrice: item.rate * 1000,
      };
    });

    if (!event1) {
      const booking1 = await Booking.create({
        client: testClient._id,
        eventName: event1Name,
        eventType: "Wedding Reception",
        eventDate: today,
        eventTime: "07:30 PM",
        location: "Grand Ballroom, Royal Orchid Palace",
        description: "Grand royal wedding banquet with 1000 guests, full catering and live beverage counter.",
        guests: 1000,
        status: "Confirmed",
        subtotal: 925000,
        total: 925000,
        services: [
          {
            serviceId: cateringService._id,
            serviceName: cateringService.name,
            category: "catering",
            pricingType: "PER_GUEST",
            unitPrice: 925,
            quantity: 1000,
            total: 925000,
          },
        ],
        foodMenu: {
          included: true,
          servingType: "PER_GUEST",
          ratePerGuest: 925,
          totalFoodAmount: 925000,
          notes: "Grand royal wedding buffet. Guests include VIPs. Serve Thandai on silver tray welcome.",
          items: menu1Items,
        },
      });

      event1 = await Event.create({
        client: testClient._id,
        booking: booking1._id,
        eventName: event1Name,
        eventType: "Wedding Reception",
        eventDate: today,
        eventTime: "07:30 PM",
        guests: 1000,
        location: "Grand Ballroom, Royal Orchid Palace",
        description: "Grand wedding banquet today with 1000 guests.",
        status: "CONFIRMED",
        notes: "Grand wedding banquet today with 1000 guests.",
      });
      console.log(`+ Created Event 1: "${event1Name}" (1000 Guests, Today, Shortage Tested)`);
    } else {
      console.log(`* Event 1 already exists: "${event1Name}"`);
    }

    // ---------------------------------------------------------------
    // EVENT 2: "Corporate Annual Gala Dinner" (344 Guests)
    // Full vegetarian & non-veg menu with all ingredients in stock
    // ---------------------------------------------------------------
    const event2Name = "Corporate Annual Gala Dinner";
    let event2 = await Event.findOne({ eventName: event2Name });

    const menu2Items = [
      { name: "Fresh Lime Juice", category: "Beverages", dietary: "veg", rate: 50 },
      { name: "Paneer Tikka", category: "Starters", dietary: "veg", rate: 190 },
      { name: "Ghee Rice", category: "Rice and Biriyani", dietary: "veg", rate: 160 },
      { name: "Appam", category: "Breads", dietary: "veg", rate: 40 },
      { name: "Vegetable Kurma", category: "Main Course", dietary: "veg", rate: 175 },
      { name: "Green Salad", category: "Side Dishes", dietary: "veg", rate: 60 },
      { name: "Payasam", category: "Desserts", dietary: "veg", rate: 85 },
    ].map((item) => {
      const match = foodItemMap.get(item.name.toLowerCase());
      return {
        foodItemId: match?._id,
        name: item.name,
        category: item.category,
        dietary: item.dietary,
        rate: item.rate,
        quantity: 344,
        unit: "Guests",
        totalPrice: item.rate * 344,
      };
    });

    if (!event2) {
      const booking2 = await Booking.create({
        client: testClient._id,
        eventName: event2Name,
        eventType: "Corporate Dinner",
        eventDate: tomorrow,
        eventTime: "08:00 PM",
        location: "Summit Conference Center, Hall B",
        description: "Annual leadership and employee recognition dinner gala with multi-course dinner.",
        guests: 344,
        status: "Confirmed",
        subtotal: 261440,
        total: 261440,
        services: [
          {
            serviceId: cateringService._id,
            serviceName: cateringService.name,
            category: "catering",
            pricingType: "PER_GUEST",
            unitPrice: 760,
            quantity: 344,
            total: 261440,
          },
        ],
        foodMenu: {
          included: true,
          servingType: "PER_GUEST",
          ratePerGuest: 760,
          totalFoodAmount: 261440,
          notes: "Corporate dinner tomorrow. Full dietary labeling required on live stations.",
          items: menu2Items,
        },
      });

      event2 = await Event.create({
        client: testClient._id,
        booking: booking2._id,
        eventName: event2Name,
        eventType: "Corporate Dinner",
        eventDate: tomorrow,
        eventTime: "08:00 PM",
        guests: 344,
        location: "Summit Conference Center, Hall B",
        description: "Corporate banquet scheduled for tomorrow evening.",
        status: "CONFIRMED",
        notes: "Corporate banquet scheduled for tomorrow evening.",
      });
      console.log(`+ Created Event 2: "${event2Name}" (344 Guests, Tomorrow, In-Stock)`);
    } else {
      console.log(`* Event 2 already exists: "${event2Name}"`);
    }

    // ---------------------------------------------------------------
    // EVENT 3: "Executive Leadership Luncheon" (100 Guests)
    // Has a menu item with NO recipe configured (tests missing recipe detection)
    // ---------------------------------------------------------------
    const event3Name = "Executive Leadership Luncheon";
    let event3 = await Event.findOne({ eventName: event3Name });

    const menu3Items = [
      { name: "Fresh Lime Juice", category: "Beverages", dietary: "veg", rate: 50 },
      // Unmapped dish!
      { name: "Chef's Artisanal Herb Bruschetta", category: "Starters", dietary: "veg", rate: 120 },
      { name: "Green Salad", category: "Side Dishes", dietary: "veg", rate: 60 },
      { name: "Gulab Jamun", category: "Desserts", dietary: "veg", rate: 90 },
    ].map((item) => {
      const match = foodItemMap.get(item.name.toLowerCase());
      return {
        foodItemId: match?._id,
        name: item.name,
        category: item.category,
        dietary: item.dietary,
        rate: item.rate,
        quantity: 100,
        unit: "Guests",
        totalPrice: item.rate * 100,
      };
    });

    if (!event3) {
      const booking3 = await Booking.create({
        client: testClient._id,
        eventName: event3Name,
        eventType: "Executive Luncheon",
        eventDate: dayAfterTomorrow,
        eventTime: "12:30 PM",
        location: "Cedar Executive Boardroom, Floor 14",
        description: "High-level board of directors luncheon with plated multi-dish service.",
        guests: 100,
        status: "Confirmed",
        subtotal: 32000,
        total: 32000,
        services: [
          {
            serviceId: cateringService._id,
            serviceName: cateringService.name,
            category: "catering",
            pricingType: "PER_GUEST",
            unitPrice: 320,
            quantity: 100,
            total: 32000,
          },
        ],
        foodMenu: {
          included: true,
          servingType: "PER_GUEST",
          ratePerGuest: 320,
          totalFoodAmount: 32000,
          notes: "Plated luncheon service. Bruschetta requires fresh artisanal recipe setup.",
          items: menu3Items,
        },
      });

      event3 = await Event.create({
        client: testClient._id,
        booking: booking3._id,
        eventName: event3Name,
        eventType: "Executive Luncheon",
        eventDate: dayAfterTomorrow,
        eventTime: "12:30 PM",
        guests: 100,
        location: "Cedar Executive Boardroom, Floor 14",
        description: "Luncheon with unmapped recipe item to test kitchen warning.",
        status: "CONFIRMED",
        notes: "Luncheon with unmapped recipe item to test kitchen warning.",
      });
      console.log(`+ Created Event 3: "${event3Name}" (100 Guests, Day After Tomorrow, Missing Recipe Item)`);
    } else {
      console.log(`* Event 3 already exists: "${event3Name}"`);
    }

    console.log("\n=======================================================");
    console.log("KITCHEN SEED COMPLETED SUCCESSFULLY!");
    console.log("=======================================================");
    process.exit(0);
  } catch (error) {
    console.error("Kitchen seed failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedKitchenData();
}

module.exports = seedKitchenData;
