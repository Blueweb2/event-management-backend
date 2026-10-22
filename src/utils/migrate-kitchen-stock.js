/**
 * Migration Script: Kitchen Inventory vs Rentable Stock Separation & Audit
 *
 * Responsibilities:
 * 1. Audits all existing stock items, identifying kitchen items marked rentable or missing stockType.
 * 2. Idempotently sets all kitchen categories ("Raw Ingredients", "Kitchen Supplies") to:
 *    - stockType: "kitchen"
 *    - isRentable: false
 *    - rentalPrice: 0
 * 3. Idempotently sets non-kitchen categories to stockType: "rentable" without altering existing eligibility.
 * 4. Preserves all stock quantities, units, locations, transaction history, recipe mappings, and event allocations.
 * 5. Safe to rerun multiple times.
 *
 * Usage:
 *   node src/utils/migrate-kitchen-stock.js --dry-run
 *   node src/utils/migrate-kitchen-stock.js --run
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const StockItem = require("../models/stockItem.model");

const KITCHEN_CATEGORIES = [
  "Raw Ingredients",
  "Kitchen Supplies",
  "Kitchen Equipment",
];

async function migrateKitchenStock({ dryRun = true } = {}) {
  const audit = {
    totalItems: 0,
    kitchenItemsFound: 0,
    kitchenItemsFixed: 0,
    nonKitchenItemsFound: 0,
    nonKitchenItemsFixed: 0,
    unchangedItems: 0,
    kitchenItemsAudit: [],
    nonKitchenItemsAudit: [],
  };

  const allItems = await StockItem.find({});
  audit.totalItems = allItems.length;

  const updates = [];

  for (const item of allItems) {
    const isKitchen =
      KITCHEN_CATEGORIES.includes(item.category) || item.stockType === "kitchen";

    if (isKitchen) {
      audit.kitchenItemsFound++;
      const needsUpdate =
        item.isRentable !== false ||
        item.rentalPrice !== 0 ||
        item.stockType !== "kitchen";

      if (needsUpdate) {
        audit.kitchenItemsFixed++;
        audit.kitchenItemsAudit.push({
          id: item._id.toString(),
          name: item.name,
          category: item.category,
          prevStockType: item.stockType,
          prevIsRentable: item.isRentable,
          prevRentalPrice: item.rentalPrice,
          newStockType: "kitchen",
          newIsRentable: false,
          newRentalPrice: 0,
          quantityPreserved: item.availableQuantity,
          unitPreserved: item.unit,
        });

        if (!dryRun) {
          updates.push(
            StockItem.updateOne(
              { _id: item._id },
              {
                $set: {
                  stockType: "kitchen",
                  isRentable: false,
                  rentalPrice: 0,
                },
              }
            )
          );
        }
      } else {
        audit.unchangedItems++;
      }
    } else {
      audit.nonKitchenItemsFound++;
      const needsUpdate = item.stockType !== "rentable";

      if (needsUpdate) {
        audit.nonKitchenItemsFixed++;
        audit.nonKitchenItemsAudit.push({
          id: item._id.toString(),
          name: item.name,
          category: item.category,
          prevStockType: item.stockType,
          newStockType: "rentable",
          isRentablePreserved: item.isRentable,
        });

        if (!dryRun) {
          updates.push(
            StockItem.updateOne(
              { _id: item._id },
              {
                $set: {
                  stockType: "rentable",
                },
              }
            )
          );
        }
      } else {
        audit.unchangedItems++;
      }
    }
  }

  if (!dryRun && updates.length > 0) {
    await Promise.all(updates);
  }

  return audit;
}

async function main() {
  try {
    await connectDB();
    console.log("Connected to MongoDB for kitchen stock policy migration.");

    const args = process.argv.slice(2);
    const isDryRun = args.includes("--dry-run") || !args.includes("--run");

    console.log(
      isDryRun
        ? "\n--- [DRY RUN MODE] (Pass --run to apply changes) ---"
        : "\n--- [LIVE MIGRATION MODE] ---"
    );

    const audit = await migrateKitchenStock({ dryRun: isDryRun });

    console.log(`\nAudit & Migration Summary:`);
    console.log(`Total Master Stock Items:        ${audit.totalItems}`);
    console.log(`Kitchen Items Found:             ${audit.kitchenItemsFound}`);
    console.log(`Kitchen Items Migrated/Fixed:    ${audit.kitchenItemsFixed}`);
    console.log(`Non-Kitchen Assets Found:        ${audit.nonKitchenItemsFound}`);
    console.log(`Non-Kitchen Assets Fixed:        ${audit.nonKitchenItemsFixed}`);
    console.log(`Items Already Up-to-Date:        ${audit.unchangedItems}`);

    if (audit.kitchenItemsAudit.length > 0) {
      console.log(`\nKitchen Items Modified:`);
      console.table(audit.kitchenItemsAudit);
    }

    if (audit.nonKitchenItemsAudit.length > 0) {
      console.log(`\nNon-Kitchen Items Updated:`);
      console.table(audit.nonKitchenItemsAudit);
    }

    console.log("\nMigration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  migrateKitchenStock,
};
