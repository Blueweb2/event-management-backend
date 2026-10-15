/**
 * Migration Script: Role Hierarchy Migration & Verification
 *
 * Usage:
 *   node src/utils/migrate-roles.js --dry-run
 *   node src/utils/migrate-roles.js --migrate-admins-to-managers
 *   node src/utils/migrate-roles.js --promote-superadmin <email>
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/user.model");

async function main() {
  try {
    await connectDB();
    console.log("Connected to MongoDB for role audit and migration.");

    const args = process.argv.slice(2);
    const isDryRun = args.includes("--dry-run") || args.length === 0;
    const migrateAdmins = args.includes("--migrate-admins-to-managers");
    const promoteIndex = args.indexOf("--promote-superadmin");
    const promoteEmail = promoteIndex !== -1 ? args[promoteIndex + 1] : null;

    const allUsers = await User.find({}).select("name username email role isActive");
    console.log(`\nFound ${allUsers.length} total users in database:`);
    console.table(
      allUsers.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        username: u.username,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
      }))
    );

    const roleCounts = allUsers.reduce((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});
    console.log("\nRole Distribution:", roleCounts);

    if (promoteEmail) {
      const targetUser = await User.findOne({ email: promoteEmail.toLowerCase().trim() });
      if (!targetUser) {
        console.error(`User with email "${promoteEmail}" not found.`);
      } else {
        targetUser.role = "superadmin";
        await targetUser.save();
        console.log(`Successfully promoted "${targetUser.email}" to superadmin.`);
      }
    }

    if (migrateAdmins) {
      const adminUsers = await User.find({ role: "admin" });
      if (adminUsers.length === 0) {
        console.log("No legacy 'admin' accounts found to migrate.");
      } else {
        console.log(`Migrating ${adminUsers.length} legacy 'admin' accounts to 'manager'...`);
        const result = await User.updateMany(
          { role: "admin" },
          { $set: { role: "manager" } }
        );
        console.log(`Migrated ${result.modifiedCount} accounts to 'manager'.`);
      }
    }

    if (isDryRun && !promoteEmail && !migrateAdmins) {
      console.log("\n[Dry Run] No data was modified. To execute migrations, run with:");
      console.log("  node src/utils/migrate-roles.js --migrate-admins-to-managers");
      console.log("  node src/utils/migrate-roles.js --promote-superadmin <email>");
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

main();
