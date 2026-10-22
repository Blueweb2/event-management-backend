const { normalizeDepartment } = require("./department.constants");

const KITCHEN_CATEGORIES = [
  "Raw Ingredients",
  "Kitchen Supplies",
  "Kitchen Equipment",
];

/**
 * Checks whether an item or payload represents internal kitchen inventory/equipment.
 */
const isKitchenStockItem = (itemOrData) => {
  if (!itemOrData) return false;
  if (itemOrData.stockType === "kitchen") return true;
  const category = itemOrData.category || "";
  return KITCHEN_CATEGORIES.includes(category);
};

/**
 * Checks whether a user is authorized to view and interact with kitchen inventory.
 *
 * Rules:
 * - Superadmin / Admin: Full system-wide administrative access.
 * - Kitchen / Catering Manager & Staff: Full access to kitchen stock operations permitted to their role.
 * - Operations: Access permitted only if explicitly granted via permissions ("stock:view", "kitchen:view", etc.)
 *   or an Operations Manager with default operations oversight.
 * - Decoration, Photography, Sound & Lighting, and other unrelated departments: Access is strictly forbidden (403).
 */
const isAuthorizedForKitchenStock = (user) => {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  if (role === "superadmin" || role === "admin") return true;

  const rawDept = String(user.department || "").trim();
  const dept = normalizeDepartment(rawDept);

  if (dept === "Kitchen" || dept === "Catering") {
    return true;
  }

  if (dept === "Operations") {
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    const hasExplicitPerm =
      permissions.includes("*") ||
      permissions.includes("stock:*") ||
      permissions.includes("stock:view") ||
      permissions.includes("kitchen:*") ||
      permissions.includes("kitchen:view") ||
      permissions.includes("events:view_all");

    if (role === "manager" || hasExplicitPerm) {
      return true;
    }
    return false;
  }

  // All other departments (Decoration, Photography, Sound & Lighting, etc.)
  return false;
};

/**
 * Validates that user has manager-level privileges.
 * Kitchen staff cannot perform manager-only actions (creating, updating, deleting, adjusting).
 */
const isManagerOrAdmin = (user) => {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  return role === "superadmin" || role === "admin" || role === "manager";
};

module.exports = {
  KITCHEN_CATEGORIES,
  isKitchenStockItem,
  isAuthorizedForKitchenStock,
  isManagerOrAdmin,
};
