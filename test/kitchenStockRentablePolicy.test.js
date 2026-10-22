const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const connectDB = require("../src/config/db");
const StockItem = require("../src/models/stockItem.model");
const Recipe = require("../src/models/recipe.model");
const FoodItem = require("../src/models/foodItem.model");
const PurchaseRequest = require("../src/models/purchaseRequest.model");
const User = require("../src/models/user.model");
const stockService = require("../src/services/stock.service");
const pricingService = require("../src/services/pricing.service");
const departmentWorkflowService = require("../src/services/departmentWorkflow.service");
const { migrateKitchenStock } = require("../src/utils/migrate-kitchen-stock");

test("Kitchen Inventory vs Rentable Stock Policy Suite", async (t) => {
  let testManager;
  let testChef;
  let validEquipmentItem;
  let kitchenIngredientItem;
  let kitchenSupplyItem;

  t.before(async () => {
    await connectDB();
    const suffix = Date.now();

    testManager = await User.create({
      name: `Inventory Manager ${suffix}`,
      username: `inv_mgr_${suffix}`,
      email: `inv.mgr.${suffix}@eventmanagement.com`,
      password: "hashedPassword123",
      role: "manager",
      department: "Logistics",
      isActive: true,
    });

    testChef = await User.create({
      name: `Chef Specialist ${suffix}`,
      username: `chef_spec_${suffix}`,
      email: `chef.spec.${suffix}@eventmanagement.com`,
      password: "hashedPassword123",
      role: "manager",
      department: "Kitchen",
      isActive: true,
    });
  });

  t.after(async () => {
    if (testManager?._id) await User.findByIdAndDelete(testManager._id);
    if (testChef?._id) await User.findByIdAndDelete(testChef._id);
    if (validEquipmentItem?._id) await StockItem.findByIdAndDelete(validEquipmentItem._id);
    if (kitchenIngredientItem?._id) await StockItem.findByIdAndDelete(kitchenIngredientItem._id);
    if (kitchenSupplyItem?._id) await StockItem.findByIdAndDelete(kitchenSupplyItem._id);
  });

  await t.test("1. Kitchen ingredients cannot be marked rentable (creation & update rejected)", async () => {
    // Attempt creation with isRentable: true on Raw Ingredients -> MUST REJECT
    await assert.rejects(
      async () => {
        await stockService.createStockItem(
          {
            name: "Basmati Rice Grade A Test",
            category: "Raw Ingredients",
            totalQuantity: 100,
            unit: "kg",
            unitPrice: 90,
            isRentable: true, // Forbidden!
            rentalPrice: 50,
          },
          testManager._id
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be marked as rentable/i);
        return true;
      }
    );

    // Create valid kitchen ingredient with isRentable: false
    kitchenIngredientItem = await stockService.createStockItem(
      {
        name: "Basmati Rice Grade A Test",
        category: "Raw Ingredients",
        totalQuantity: 100,
        unit: "kg",
        unitPrice: 90,
        isRentable: false,
      },
      testManager._id
    );

    assert.equal(kitchenIngredientItem.stockType, "kitchen");
    assert.equal(kitchenIngredientItem.isRentable, false);
    assert.equal(kitchenIngredientItem.rentalPrice, 0);

    // Attempt to update existing kitchen ingredient to rentable -> MUST REJECT
    await assert.rejects(
      async () => {
        await stockService.updateStockItem(
          kitchenIngredientItem._id,
          { isRentable: true, rentalPrice: 25 },
          testManager._id
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be marked as rentable/i);
        return true;
      }
    );
  });

  await t.test("2. Kitchen supplies cannot be marked rentable (creation & update rejected)", async () => {
    // Attempt creation with isRentable: true on Kitchen Supplies -> MUST REJECT
    await assert.rejects(
      async () => {
        await stockService.createStockItem(
          {
            name: "Baking Parchment Paper Rolls",
            category: "Kitchen Supplies",
            totalQuantity: 50,
            unit: "rolls",
            unitPrice: 120,
            isRentable: true, // Forbidden!
          },
          testManager._id
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be marked as rentable/i);
        return true;
      }
    );

    // Create valid kitchen supplies
    kitchenSupplyItem = await stockService.createStockItem(
      {
        name: "Baking Parchment Paper Rolls",
        category: "Kitchen Supplies",
        totalQuantity: 50,
        unit: "rolls",
        unitPrice: 120,
        isRentable: false,
      },
      testManager._id
    );

    assert.equal(kitchenSupplyItem.stockType, "kitchen");
    assert.equal(kitchenSupplyItem.isRentable, false);

    // Attempt to update supplies to rentable -> MUST REJECT
    await assert.rejects(
      async () => {
        await stockService.updateStockItem(
          kitchenSupplyItem._id,
          { isRentable: true },
          testManager._id
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be marked as rentable/i);
        return true;
      }
    );
  });

  await t.test("3. Rental APIs reject kitchen stock IDs", async () => {
    // pricingService.calculateServicesTotal should reject kitchen stock IDs
    await assert.rejects(
      async () => {
        await pricingService.calculateServicesTotal({
          selectedServices: [{ serviceId: kitchenIngredientItem._id, quantity: 10 }],
          guests: 100,
        });
      },
      (err) => {
        assert.match(err.message, /internal kitchen inventory|not rentable/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await pricingService.calculateServicesTotal({
          selectedServices: [{ serviceId: kitchenSupplyItem._id, quantity: 5 }],
          guests: 100,
        });
      },
      (err) => {
        assert.match(err.message, /internal kitchen inventory|not rentable/i);
        return true;
      }
    );
  });

  await t.test("4. Rental API lists only eligible rentable items (excludes kitchen stock)", async () => {
    // Create valid rentable equipment item
    validEquipmentItem = await stockService.createStockItem(
      {
        name: "Gold Rim Porcelain Dinner Plate",
        category: "Crockery",
        totalQuantity: 200,
        unit: "pcs",
        unitPrice: 350,
        rentalPrice: 45,
        isRentable: true,
      },
      testManager._id
    );

    assert.equal(validEquipmentItem.stockType, "rentable");
    assert.equal(validEquipmentItem.isRentable, true);
    assert.equal(validEquipmentItem.rentalPrice, 45);

    const rentableItems = await stockService.getRentableStockItems({});
    const rentableIds = rentableItems.map((i) => i._id.toString());

    // Valid equipment must be listed
    assert.ok(rentableIds.includes(validEquipmentItem._id.toString()));

    // Kitchen ingredient and kitchen supply must NEVER be listed
    assert.ok(!rentableIds.includes(kitchenIngredientItem._id.toString()));
    assert.ok(!rentableIds.includes(kitchenSupplyItem._id.toString()));

    // Ensure none of the returned items belong to kitchen categories
    for (const item of rentableItems) {
      assert.notEqual(item.category, "Raw Ingredients");
      assert.notEqual(item.category, "Kitchen Supplies");
      assert.notEqual(item.stockType, "kitchen");
      assert.equal(item.isRentable, true);
    }
  });

  await t.test("5. Valid equipment can still be rented", async () => {
    const servicesResult = await pricingService.calculateServicesTotal({
      selectedServices: [{ serviceId: validEquipmentItem._id, quantity: 25 }],
      guests: 100,
    });

    assert.equal(servicesResult.lineItems.length, 1);
    assert.equal(servicesResult.lineItems[0].serviceName, validEquipmentItem.name);
    assert.equal(servicesResult.lineItems[0].unitPrice, 45);
    assert.equal(servicesResult.lineItems[0].quantity, 25);
    assert.equal(servicesResult.lineItems[0].total, 45 * 25);
  });

  await t.test("6. Kitchen stock can still be used in recipe calculations and purchase requests", async () => {
    const foodItem = await FoodItem.create({
      name: `Special Biriyani ${Date.now()}`,
      category: "Main Course",
      dietary: "non-veg",
      defaultRate: 350,
      isActive: true,
    });

    const recipe = await Recipe.create({
      foodItem: foodItem._id,
      foodItemName: foodItem.name,
      yieldServings: 50,
      ingredients: [
        {
          name: kitchenIngredientItem.name,
          quantityPerServing: 0.15,
          unit: "kg",
          stockItem: kitchenIngredientItem._id,
        },
      ],
      steps: [
        { stepNumber: 1, instruction: "Wash and soak rice for 30 minutes." },
      ],
      createdBy: testChef._id,
    });

    assert.ok(recipe._id);
    assert.equal(recipe.ingredients[0].stockItem.toString(), kitchenIngredientItem._id.toString());

    // Purchase request linking kitchen stock
    const purchaseReq = await departmentWorkflowService.createPurchaseRequest({
      department: "Kitchen",
      items: [
        {
          itemName: kitchenIngredientItem.name,
          requiredQuantity: 20,
          availableQuantity: kitchenIngredientItem.availableQuantity,
          shortageQuantity: 20,
          unit: kitchenIngredientItem.unit,
          estimatedCost: 1800,
          stockItem: kitchenIngredientItem._id,
          urgency: "HIGH",
        },
      ],
      notes: "Banquet event requirement",
      urgency: "HIGH",
      userId: testChef._id,
      requestedBy: testChef._id,
    });

    assert.ok(purchaseReq._id);
    assert.equal(purchaseReq.items[0].stockItem.toString(), kitchenIngredientItem._id.toString());

    // Cleanup
    await Recipe.findByIdAndDelete(recipe._id);
    await FoodItem.findByIdAndDelete(foodItem._id);
    await PurchaseRequest.findByIdAndDelete(purchaseReq._id);
  });

  await t.test("7. Stock-in, stock adjustments, and transaction history continue to work", async () => {
    const initialAvail = kitchenIngredientItem.availableQuantity;

    // Stock In (+50 kg)
    const afterAdd = await stockService.addStock(
      kitchenIngredientItem._id,
      { quantity: 50, notes: "Received supplier delivery" },
      testManager._id
    );

    assert.equal(afterAdd.availableQuantity, initialAvail + 50);
    assert.equal(afterAdd.totalQuantity, initialAvail + 50);

    // Stock Adjustment (-10 kg due to preparation consumption / spoilage)
    const afterAdjust = await stockService.adjustInventory(
      kitchenIngredientItem._id,
      {
        newAvailable: afterAdd.availableQuantity - 10,
        newTotal: afterAdd.totalQuantity - 10,
        reason: "Kitchen batch preparation consumption",
      },
      testManager._id
    );

    assert.equal(afterAdjust.availableQuantity, initialAvail + 40);

    // Get stock item with history
    const detail = await stockService.getStockItemById(kitchenIngredientItem._id);
    assert.ok(detail.recentTransactions.length >= 2);
    assert.equal(detail.item.isRentable, false);
    assert.equal(detail.item.stockType, "kitchen");
  });

  await t.test("8. Existing records are migrated idempotently without losing quantities or references", async () => {
    // Run migration
    const auditResult = await migrateKitchenStock({ dryRun: false });
    assert.ok(auditResult.totalItems >= 3);

    // Verify kitchen stock item was not damaged or deleted
    const reloadedIngredient = await StockItem.findById(kitchenIngredientItem._id);
    assert.ok(reloadedIngredient);
    assert.equal(reloadedIngredient.isRentable, false);
    assert.equal(reloadedIngredient.stockType, "kitchen");
    assert.equal(reloadedIngredient.unit, "kg");
    assert.ok(reloadedIngredient.availableQuantity > 0);

    // Rerunning migration is idempotent
    const rerunAudit = await migrateKitchenStock({ dryRun: true });
    assert.equal(rerunAudit.kitchenItemsFixed, 0);
  });

  await t.test("9. Direct API requests cannot bypass frontend restrictions", async () => {
    // Attempt to bypass by updating category of a rentable item to kitchen while isRentable is true -> MUST REJECT
    await assert.rejects(
      async () => {
        await stockService.updateStockItem(
          validEquipmentItem._id,
          { category: "Raw Ingredients" }, // Attempting category change without removing isRentable
          testManager._id
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be marked as rentable/i);
        return true;
      }
    );

    // Direct attempt to update stockType to kitchen while isRentable is true -> MUST REJECT
    await assert.rejects(
      async () => {
        await stockService.updateStockItem(
          validEquipmentItem._id,
          { stockType: "kitchen" },
          testManager._id
        );
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be marked as rentable/i);
        return true;
      }
    );
  });
});
