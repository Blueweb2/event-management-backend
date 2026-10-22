const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const connectDB = require("../src/config/db");
const User = require("../src/models/user.model");
const StockItem = require("../src/models/stockItem.model");
const Event = require("../src/models/event.model");
const Client = require("../src/models/client.model");
const FoodItem = require("../src/models/foodItem.model");
const Recipe = require("../src/models/recipe.model");
const stockService = require("../src/services/stock.service");
const pricingService = require("../src/services/pricing.service");
const departmentWorkflowService = require("../src/services/departmentWorkflow.service");

test("Department & Role-Based Kitchen Equipment & Inventory Access Control", async (t) => {
  let superAdminUser;
  let kitchenManager;
  let kitchenStaff;
  let decorationManager;
  let photographyStaff;
  let soundManager;
  let operationsWithPerm;
  let operationsWithoutPerm;

  let kitchenEquipmentItem;
  let kitchenIngredientItem;
  let kitchenSupplyItem;
  let rentableEquipmentItem;
  let testEvent;

  t.before(async () => {
    await connectDB();

    const timestamp = Date.now();

    // 1. Superadmin
    superAdminUser = await User.create({
      name: `Super Admin ${timestamp}`,
      username: `sadmin_${timestamp}`,
      email: `sadmin_${timestamp}@eventflow.local`,
      password: "Password123!",
      role: "superadmin",
      department: "Operations",
      isActive: true,
    });

    // 2. Kitchen Manager (Chef)
    kitchenManager = await User.create({
      name: `Head Chef ${timestamp}`,
      username: `chef_${timestamp}`,
      email: `chef_${timestamp}@eventflow.local`,
      password: "Password123!",
      role: "manager",
      department: "Kitchen",
      permissions: ["kitchen:*", "stock:view"],
      isActive: true,
    });

    // 3. Kitchen Staff (Line Cook / Prep Staff)
    kitchenStaff = await User.create({
      name: `Kitchen Assistant ${timestamp}`,
      username: `kstaff_${timestamp}`,
      email: `kstaff_${timestamp}@eventflow.local`,
      password: "Password123!",
      role: "staff",
      department: "Kitchen",
      isActive: true,
    });

    // 4. Decoration Manager
    decorationManager = await User.create({
      name: `Decor Lead ${timestamp}`,
      username: `decor_${timestamp}`,
      email: `decor_${timestamp}@eventflow.local`,
      password: "Password123!",
      role: "manager",
      department: "Decoration",
      permissions: ["decoration:*"],
      isActive: true,
    });

    // 5. Photography Staff
    photographyStaff = await User.create({
      name: `Camera Crew ${timestamp}`,
      username: `photo_${timestamp}`,
      email: `photo_${timestamp}@eventflow.local`,
      password: "Password123!",
      role: "staff",
      department: "Photography",
      isActive: true,
    });

    // 6. Sound & Lighting Manager
    soundManager = await User.create({
      name: `Audio Engineer ${timestamp}`,
      username: `sound_${timestamp}`,
      email: `sound_${timestamp}@eventflow.local`,
      password: "Password123!",
      role: "manager",
      department: "Sound & Lighting",
      permissions: ["sound_lighting:*"],
      isActive: true,
    });

    // 7. Operations Staff WITH Explicit Stock/Kitchen Permission
    operationsWithPerm = await User.create({
      name: `Operations Controller ${timestamp}`,
      username: `ops_perm_${timestamp}`,
      email: `ops_perm_${timestamp}@eventflow.local`,
      password: "Password123!",
      role: "staff",
      department: "Operations",
      permissions: ["stock:view", "kitchen:view"],
      isActive: true,
    });

    // 8. Operations Staff WITHOUT Stock/Kitchen Permission
    operationsWithoutPerm = await User.create({
      name: `Operations Logistics Assistant ${timestamp}`,
      username: `ops_noperm_${timestamp}`,
      email: `ops_noperm_${timestamp}@eventflow.local`,
      password: "Password123!",
      role: "staff",
      department: "Operations",
      permissions: ["transport:view"],
      isActive: true,
    });

    // Master Stock Items
    kitchenEquipmentItem = await StockItem.create({
      name: `Commercial Kitchen Wok Range ${timestamp}`,
      category: "Kitchen Equipment",
      stockType: "kitchen",
      isRentable: false,
      rentalPrice: 0,
      totalQuantity: 6,
      availableQuantity: 6,
      unit: "pcs",
      unitPrice: 15000,
      location: "Central Kitchen",
      createdBy: kitchenManager._id,
    });

    kitchenIngredientItem = await StockItem.create({
      name: `Kashmiri Saffron Grade A ${timestamp}`,
      category: "Raw Ingredients",
      stockType: "kitchen",
      isRentable: false,
      rentalPrice: 0,
      totalQuantity: 25,
      availableQuantity: 25,
      unit: "grams",
      unitPrice: 350,
      location: "Pantry Safe",
      createdBy: kitchenManager._id,
    });

    kitchenSupplyItem = await StockItem.create({
      name: `Heavy Duty Foil Rolls ${timestamp}`,
      category: "Kitchen Supplies",
      stockType: "kitchen",
      isRentable: false,
      rentalPrice: 0,
      totalQuantity: 80,
      availableQuantity: 80,
      unit: "rolls",
      unitPrice: 45,
      location: "Kitchen Storeroom",
      createdBy: kitchenManager._id,
    });

    rentableEquipmentItem = await StockItem.create({
      name: `Mahogany Chiavari Chairs ${timestamp}`,
      category: "Furniture",
      stockType: "rentable",
      isRentable: true,
      rentalPrice: 65,
      totalQuantity: 120,
      availableQuantity: 120,
      unit: "pcs",
      unitPrice: 1200,
      location: "Equipment Warehouse",
      createdBy: decorationManager._id,
    });

    const testClient = await Client.create({
      name: `Corporate Banquet Client ${timestamp}`,
      email: `corp_client_${timestamp}@eventflow.local`,
      phone: "+919876543299",
    });

    testEvent = await Event.create({
      eventName: `Annual Awards Night ${timestamp}`,
      eventType: "Corporate",
      eventDate: new Date(Date.now() + 10 * 86400000),
      eventTime: "19:00",
      location: "Grand Ballroom",
      client: testClient._id,
      booking: new mongoose.Types.ObjectId(),
      guests: 250,
      status: "CONFIRMED",
      createdBy: superAdminUser._id,
    });
  });

  t.after(async () => {
    // Cleanup created records
    await User.deleteMany({ _id: { $in: [
      superAdminUser?._id,
      kitchenManager?._id,
      kitchenStaff?._id,
      decorationManager?._id,
      photographyStaff?._id,
      soundManager?._id,
      operationsWithPerm?._id,
      operationsWithoutPerm?._id,
    ] } });

    await StockItem.deleteMany({ _id: { $in: [
      kitchenEquipmentItem?._id,
      kitchenIngredientItem?._id,
      kitchenSupplyItem?._id,
      rentableEquipmentItem?._id,
    ] } });

    if (testEvent?._id) {
      await Event.findByIdAndDelete(testEvent._id);
    }
  });

  // ==========================================
  // Test 1: Kitchen Manager Access
  // ==========================================
  await t.test("1. Kitchen manager can view authorized kitchen equipment and inventory", async () => {
    const listRes = await stockService.getStockItems({ stockType: "kitchen" }, kitchenManager);
    assert.ok(listRes.items.length > 0);
    const foundEquipment = listRes.items.some((i) => i._id.toString() === kitchenEquipmentItem._id.toString());
    assert.equal(foundEquipment, true, "Kitchen manager should find kitchen equipment in list");

    const detailRes = await stockService.getStockItemById(kitchenEquipmentItem._id, kitchenManager);
    assert.equal(detailRes.item._id.toString(), kitchenEquipmentItem._id.toString());
    assert.equal(detailRes.item.category, "Kitchen Equipment");
    assert.equal(detailRes.item.stockType, "kitchen");
  });

  // ==========================================
  // Test 2: Kitchen Staff Access & Stock-In
  // ==========================================
  await t.test("2. Authorized kitchen staff can view permitted kitchen equipment and perform stock-in", async () => {
    const detailRes = await stockService.getStockItemById(kitchenEquipmentItem._id, kitchenStaff);
    assert.equal(detailRes.item._id.toString(), kitchenEquipmentItem._id.toString());

    // Permitted stock-in (restock)
    const restocked = await stockService.addStock(kitchenEquipmentItem._id, { quantity: 4, notes: "New shipment received" }, kitchenStaff);
    assert.equal(restocked.totalQuantity, 10);
    assert.equal(restocked.availableQuantity, 10);
  });

  // ==========================================
  // Test 3: Kitchen Staff Manager-Only Restrictions
  // ==========================================
  await t.test("3. Kitchen staff cannot perform manager-only operations", async () => {
    // Cannot create master stock
    await assert.rejects(
      async () => {
        await stockService.createStockItem({
          name: "Unauthorized Staff Wok",
          category: "Kitchen Equipment",
          totalQuantity: 5,
        }, kitchenStaff);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /staff members cannot/i);
        return true;
      }
    );

    // Cannot update master stock definition
    await assert.rejects(
      async () => {
        await stockService.updateStockItem(kitchenEquipmentItem._id, { name: "Altered Name" }, kitchenStaff);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /staff members cannot/i);
        return true;
      }
    );

    // Cannot perform inventory adjustment
    await assert.rejects(
      async () => {
        await stockService.adjustInventory(kitchenEquipmentItem._id, { newTotal: 2, reason: "Unauthorized staff adjustment" }, kitchenStaff);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /staff members cannot/i);
        return true;
      }
    );

    // Cannot delete stock item
    await assert.rejects(
      async () => {
        await stockService.deleteStockItem(kitchenEquipmentItem._id, kitchenStaff);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /staff members cannot/i);
        return true;
      }
    );
  });

  // ==========================================
  // Test 4: Decoration and Photography Cannot View Kitchen Inventory
  // ==========================================
  await t.test("4. Decoration and Photography users cannot view kitchen inventory in their inventory views", async () => {
    const decorList = await stockService.getStockItems({}, decorationManager);
    for (const item of decorList.items) {
      assert.notEqual(item.stockType, "kitchen");
      assert.notEqual(item.category, "Kitchen Equipment");
      assert.notEqual(item.category, "Raw Ingredients");
      assert.notEqual(item.category, "Kitchen Supplies");
    }

    const photoList = await stockService.getStockItems({}, photographyStaff);
    for (const item of photoList.items) {
      assert.notEqual(item.stockType, "kitchen");
      assert.notEqual(item.category, "Kitchen Equipment");
      assert.notEqual(item.category, "Raw Ingredients");
      assert.notEqual(item.category, "Kitchen Supplies");
    }
  });

  // ==========================================
  // Test 5: Unrelated Departments Blocked from Kitchen Query & Mutation
  // ==========================================
  await t.test("5. Other unrelated department users cannot access kitchen stock through direct API queries or mutation", async () => {
    // Explicit query for kitchen stockType
    await assert.rejects(
      async () => {
        await stockService.getStockItems({ stockType: "kitchen" }, decorationManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /restricted to authorized kitchen personnel/i);
        return true;
      }
    );

    // Explicit query for Kitchen Equipment category
    await assert.rejects(
      async () => {
        await stockService.getStockItems({ category: "Kitchen Equipment" }, soundManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /restricted to authorized kitchen personnel/i);
        return true;
      }
    );

    // Attempt to create kitchen item as decoration manager
    await assert.rejects(
      async () => {
        await stockService.createStockItem({
          name: "Decor Chef Burner",
          category: "Kitchen Equipment",
          totalQuantity: 2,
        }, decorationManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /only authorized kitchen managers/i);
        return true;
      }
    );

    // Attempt to update kitchen item as decoration manager
    await assert.rejects(
      async () => {
        await stockService.updateStockItem(kitchenEquipmentItem._id, { description: "Decor hijacked" }, decorationManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /not authorized to modify kitchen stock/i);
        return true;
      }
    );

    // Attempt to restock kitchen item as sound manager
    await assert.rejects(
      async () => {
        await stockService.addStock(kitchenEquipmentItem._id, { quantity: 10 }, soundManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /not authorized to restock kitchen inventory/i);
        return true;
      }
    );

    // Attempt to delete kitchen item as sound manager
    await assert.rejects(
      async () => {
        await stockService.deleteStockItem(kitchenEquipmentItem._id, soundManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /not authorized to delete kitchen stock/i);
        return true;
      }
    );
  });

  // ==========================================
  // Test 6: Unauthorized Users Cannot Retrieve Kitchen Stock Item by ID
  // ==========================================
  await t.test("6. Unauthorized users cannot retrieve a kitchen stock item by ID (403 Forbidden)", async () => {
    // Decoration manager accessing Kitchen Equipment ID
    await assert.rejects(
      async () => {
        await stockService.getStockItemById(kitchenEquipmentItem._id, decorationManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /restricted to authorized kitchen personnel/i);
        return true;
      }
    );

    // Photography staff accessing Raw Ingredients ID
    await assert.rejects(
      async () => {
        await stockService.getStockItemById(kitchenIngredientItem._id, photographyStaff);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /restricted to authorized kitchen personnel/i);
        return true;
      }
    );

    // Sound manager accessing Kitchen Supplies ID
    await assert.rejects(
      async () => {
        await stockService.getStockItemById(kitchenSupplyItem._id, soundManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /restricted to authorized kitchen personnel/i);
        return true;
      }
    );
  });

  // ==========================================
  // Test 7: Unauthorized Stock IDs Rejected in Allocation & Rental APIs
  // ==========================================
  await t.test("7. Unauthorized stock IDs are rejected in allocation and rental APIs", async () => {
    // Allocation API: Decoration manager cannot allocate kitchen equipment to an event
    await assert.rejects(
      async () => {
        await stockService.addEventStockRequirement(testEvent._id, {
          stockItemId: kitchenEquipmentItem._id,
          requiredQuantity: 2,
        }, decorationManager);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /unrelated department managers cannot allocate kitchen stock/i);
        return true;
      }
    );

    // Rental Pricing API: Reject kitchen equipment ID
    await assert.rejects(
      async () => {
        await pricingService.calculateServicesTotal({
          selectedServices: [{ serviceId: kitchenEquipmentItem._id, quantity: 2 }],
          guests: 100,
        });
      },
      (err) => {
        assert.match(err.message, /internal kitchen inventory or not rentable/i);
        return true;
      }
    );

    // Rental Listing API: Must not list kitchen equipment
    const rentableList = await stockService.getRentableStockItems({});
    const containsKitchen = rentableList.some((i) => i.category === "Kitchen Equipment" || i.stockType === "kitchen");
    assert.equal(containsKitchen, false, "Rental listing must not include kitchen equipment");
  });

  // ==========================================
  // Test 8: Superadmin Retains Full Administrative Access
  // ==========================================
  await t.test("8. Superadmin retains authorized administrative access", async () => {
    const listRes = await stockService.getStockItems({ stockType: "kitchen" }, superAdminUser);
    assert.ok(listRes.items.length > 0);

    const detailRes = await stockService.getStockItemById(kitchenEquipmentItem._id, superAdminUser);
    assert.equal(detailRes.item._id.toString(), kitchenEquipmentItem._id.toString());

    const updated = await stockService.updateStockItem(
      kitchenEquipmentItem._id,
      { description: "Superadmin verified inspection tag" },
      superAdminUser
    );
    assert.equal(updated.description, "Superadmin verified inspection tag");
  });

  // ==========================================
  // Test 9: Operations Roles Retain Explicitly Granted Access Only
  // ==========================================
  await t.test("9. Operations roles retain only their explicitly granted access", async () => {
    // Operations staff WITH permission can view kitchen inventory
    const opsWithPermDetail = await stockService.getStockItemById(kitchenEquipmentItem._id, operationsWithPerm);
    assert.equal(opsWithPermDetail.item._id.toString(), kitchenEquipmentItem._id.toString());

    // Operations staff WITHOUT permission is blocked with 403
    await assert.rejects(
      async () => {
        await stockService.getStockItemById(kitchenEquipmentItem._id, operationsWithoutPerm);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /restricted to authorized kitchen personnel/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await stockService.getStockItems({ stockType: "kitchen" }, operationsWithoutPerm);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /restricted to authorized kitchen personnel/i);
        return true;
      }
    );
  });

  // ==========================================
  // Test 10: Existing Workflows Continue to Work
  // ==========================================
  await t.test("10. Existing kitchen and rental workflows continue to work", async () => {
    // 1. Rentable equipment calculation works seamlessly
    const pricingRes = await pricingService.calculateServicesTotal({
      selectedServices: [{ serviceId: rentableEquipmentItem._id, quantity: 20 }],
      guests: 100,
    });
    assert.equal(pricingRes.lineItems.length, 1);
    assert.equal(pricingRes.lineItems[0].total, 20 * 65);

    // 2. Kitchen recipes can link kitchen ingredients
    const foodItem = await FoodItem.create({
      name: `Chef Special Biryani ${Date.now()}`,
      category: "Main Course",
      dietary: "non-veg",
      defaultRate: 400,
      isActive: true,
    });

    const recipe = await Recipe.create({
      foodItem: foodItem._id,
      foodItemName: foodItem.name,
      yieldServings: 100,
      ingredients: [
        {
          name: kitchenIngredientItem.name,
          quantityPerServing: 0.05,
          unit: "grams",
          stockItem: kitchenIngredientItem._id,
        },
      ],
      steps: [{ stepNumber: 1, instruction: "Infuse saffron in warm milk" }],
      createdBy: kitchenManager._id,
    });
    assert.ok(recipe._id);
    assert.equal(recipe.ingredients[0].stockItem.toString(), kitchenIngredientItem._id.toString());

    // 3. Kitchen Purchase Request linking kitchen stock works
    const purchaseReq = await departmentWorkflowService.createPurchaseRequest({
      department: "Kitchen",
      items: [
        {
          itemName: kitchenIngredientItem.name,
          requiredQuantity: 50,
          availableQuantity: 25,
          shortageQuantity: 25,
          unit: "grams",
          estimatedCost: 8750,
          stockItem: kitchenIngredientItem._id,
          urgency: "HIGH",
        },
      ],
      notes: "Urgent banquet need",
      userId: kitchenManager._id,
    });
    assert.ok(purchaseReq._id);
    assert.equal(purchaseReq.items[0].stockItem.toString(), kitchenIngredientItem._id.toString());

    // 4. Kitchen audit transactions remain accessible to kitchen manager
    const txRes = await stockService.getStockTransactions({ stockItemId: kitchenEquipmentItem._id }, kitchenManager);
    assert.ok(txRes.transactions.length >= 1);

    // 5. Decoration manager querying transactions only sees non-kitchen records
    const decorTxRes = await stockService.getStockTransactions({}, decorationManager);
    const containsKitchenTx = decorTxRes.transactions.some(
      (t) => t.stockItem && (t.stockItem.category === "Kitchen Equipment" || t.stockItem.stockType === "kitchen")
    );
    assert.equal(containsKitchenTx, false, "Decoration transactions query must exclude kitchen items");
  });
});
