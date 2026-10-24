const express = require("express");
const {
  getEventStaffingRequirements,
  getDepartmentDateAvailability,
} = require("../controllers/department.controller");
const {
  getMyDepartmentInfo,
  getKitchenEvents,
  getKitchenEventDetail,
  getRecipes,
  getRecipeByFoodItem,
  upsertRecipe,
  calculateKitchenIngredients,
  createKitchenPurchaseRequest,
  getKitchenPurchaseRequests,
  getKitchenPurchaseRequestById,
  reviewKitchenPurchaseRequest,
  receiveKitchenPurchaseRequest,
  getKitchenTasks,
  createKitchenTask,
  updateKitchenTaskStatus,
  deleteKitchenTask,
  getDecorationEvents,
  getDecorationMaterials,
  createDecorationPurchaseRequest,
  getDecorationTasks,
  createDecorationTask,
  getPhotographyEvents,
  getPhotographyEquipment,
  getPhotographyTasks,
  createPhotographyTask,
} = require("../controllers/departmentWorkflow.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");
const { requireDepartmentAccess } = require("../middlewares/department.middleware");

const router = express.Router();

// ==========================================
// Existing Department Staffing & Availability
// ==========================================

/**
 * GET /api/departments/event-staffing/:eventId
 */
router.get(
  "/event-staffing/:eventId",
  authenticate,
  authorize("admin", "manager"),
  getEventStaffingRequirements
);

/**
 * GET /api/departments/availability?date=YYYY-MM-DD
 */
router.get(
  "/availability",
  authenticate,
  authorize("admin", "manager"),
  getDepartmentDateAvailability
);

// ==========================================
// User Department Profile & Permissions
// ==========================================

/**
 * GET /api/departments/my-info
 */
router.get(
  "/my-info",
  authenticate,
  authorize("admin", "manager"),
  getMyDepartmentInfo
);

// ==========================================
// Kitchen Department Routes (Protected: Kitchen Manager & SuperAdmin)
// ==========================================

router.get(
  "/kitchen/events",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  getKitchenEvents
);

router.get(
  "/kitchen/events/:id",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  getKitchenEventDetail
);

router.get(
  "/kitchen/recipes",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  getRecipes
);

router.get(
  "/kitchen/recipes/:foodItemId",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  getRecipeByFoodItem
);

router.post(
  "/kitchen/recipes",
  authenticate,
  requireDepartmentAccess("Kitchen", "kitchen:manage_recipes"),
  upsertRecipe
);

router.get(
  "/kitchen/calculate/:eventId",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  calculateKitchenIngredients
);

router.post(
  "/kitchen/purchase-requests",
  authenticate,
  requireDepartmentAccess("Kitchen", "kitchen:create_purchase_request"),
  createKitchenPurchaseRequest
);

router.get(
  "/kitchen/purchase-requests",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  getKitchenPurchaseRequests
);

router.get(
  "/kitchen/purchase-requests/:id",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  getKitchenPurchaseRequestById
);

router.patch(
  "/kitchen/purchase-requests/:id/review",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  reviewKitchenPurchaseRequest
);

router.post(
  "/kitchen/purchase-requests/:id/receive",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  receiveKitchenPurchaseRequest
);

router.get(
  "/kitchen/tasks",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  getKitchenTasks
);

router.post(
  "/kitchen/tasks",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  createKitchenTask
);

router.patch(
  "/kitchen/tasks/:dutyId/:taskId/status",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  updateKitchenTaskStatus
);

router.delete(
  "/kitchen/tasks/:dutyId/:taskId",
  authenticate,
  requireDepartmentAccess("Kitchen"),
  deleteKitchenTask
);

// ==========================================
// Decoration Department Routes (Protected: Decoration Manager & SuperAdmin)
// ==========================================

router.get(
  "/decoration/events",
  authenticate,
  requireDepartmentAccess("Decoration"),
  getDecorationEvents
);

router.get(
  "/decoration/materials/:eventId",
  authenticate,
  requireDepartmentAccess("Decoration"),
  getDecorationMaterials
);

router.post(
  "/decoration/purchase-requests",
  authenticate,
  requireDepartmentAccess("Decoration"),
  createDecorationPurchaseRequest
);

router.get(
  "/decoration/tasks",
  authenticate,
  requireDepartmentAccess("Decoration"),
  getDecorationTasks
);

router.post(
  "/decoration/tasks",
  authenticate,
  requireDepartmentAccess("Decoration"),
  createDecorationTask
);

// ==========================================
// Photography Department Routes (Protected: Photography Manager & SuperAdmin)
// ==========================================

router.get(
  "/photography/events",
  authenticate,
  requireDepartmentAccess("Photography"),
  getPhotographyEvents
);

router.get(
  "/photography/equipment",
  authenticate,
  requireDepartmentAccess("Photography"),
  getPhotographyEquipment
);

router.get(
  "/photography/tasks",
  authenticate,
  requireDepartmentAccess("Photography"),
  getPhotographyTasks
);

router.post(
  "/photography/tasks",
  authenticate,
  requireDepartmentAccess("Photography"),
  createPhotographyTask
);

module.exports = router;
