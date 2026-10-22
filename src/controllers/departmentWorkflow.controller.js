const departmentWorkflowService = require("../services/departmentWorkflow.service");

// ==========================================
// User Department Info
// ==========================================

const getMyDepartmentInfo = async (req, res, next) => {
  try {
    const data = await departmentWorkflowService.getMyDepartmentInfo(req.user.userId);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Kitchen Controllers
// ==========================================

const getKitchenEvents = async (req, res, next) => {
  try {
    const { search = "", status = "" } = req.query;
    const events = await departmentWorkflowService.getKitchenEvents({ search, status });
    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error) {
    next(error);
  }
};

const getKitchenEventDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const detail = await departmentWorkflowService.getKitchenEventDetail(id);
    res.status(200).json({
      success: true,
      data: detail,
    });
  } catch (error) {
    next(error);
  }
};

const getRecipes = async (req, res, next) => {
  try {
    const { search = "", category = "" } = req.query;
    const recipes = await departmentWorkflowService.getRecipes({ search, category });
    res.status(200).json({
      success: true,
      data: recipes,
    });
  } catch (error) {
    next(error);
  }
};

const getRecipeByFoodItem = async (req, res, next) => {
  try {
    const { foodItemId } = req.params;
    const recipe = await departmentWorkflowService.getRecipeByFoodItem(foodItemId);
    res.status(200).json({
      success: true,
      data: recipe,
    });
  } catch (error) {
    next(error);
  }
};

const upsertRecipe = async (req, res, next) => {
  try {
    const recipe = await departmentWorkflowService.upsertRecipe({
      ...req.body,
      userId: req.user.userId,
    });
    res.status(200).json({
      success: true,
      message: "Recipe saved successfully",
      data: recipe,
    });
  } catch (error) {
    next(error);
  }
};

const calculateKitchenIngredients = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { wastageAllowancePercent = 5 } = req.query;

    const calculation = await departmentWorkflowService.calculateKitchenIngredients(
      eventId,
      { wastageAllowancePercent: Number(wastageAllowancePercent) || 5 }
    );

    res.status(200).json({
      success: true,
      message: "Kitchen ingredient requirements calculated successfully",
      data: calculation,
    });
  } catch (error) {
    next(error);
  }
};

const createKitchenPurchaseRequest = async (req, res, next) => {
  try {
    const { eventId, items, notes } = req.body;
    const request = await departmentWorkflowService.createPurchaseRequest({
      department: "Kitchen",
      eventId,
      items,
      notes,
      userId: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Kitchen purchase request submitted successfully",
      data: request,
    });
  } catch (error) {
    next(error);
  }
};

const getKitchenPurchaseRequests = async (req, res, next) => {
  try {
    const { status = "" } = req.query;
    const requests = await departmentWorkflowService.getPurchaseRequests({
      department: "Kitchen",
      status,
    });

    res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

const getKitchenTasks = async (req, res, next) => {
  try {
    const { eventId } = req.query;
    const tasks = await departmentWorkflowService.getDepartmentTasks({
      department: "Kitchen",
      eventId,
    });

    res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

const createKitchenTask = async (req, res, next) => {
  try {
    const { eventId, dutyTitle, staffId, title, description, plannedStartAt, plannedEndAt } = req.body;
    const task = await departmentWorkflowService.createDepartmentTask({
      department: "Kitchen",
      eventId,
      dutyTitle,
      staffId,
      title,
      description,
      plannedStartAt,
      plannedEndAt,
      userId: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Kitchen task created successfully",
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

const updateKitchenTaskStatus = async (req, res, next) => {
  try {
    const { dutyId, taskId } = req.params;
    const { status, notes } = req.body;

    const task = await departmentWorkflowService.updateDepartmentTaskStatus(
      dutyId,
      taskId,
      { status, notes, userId: req.user.userId }
    );

    res.status(200).json({
      success: true,
      message: "Task status updated",
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

const deleteKitchenTask = async (req, res, next) => {
  try {
    const { dutyId, taskId } = req.params;
    const result = await departmentWorkflowService.deleteDepartmentTask(dutyId, taskId);
    res.status(200).json({
      success: true,
      message: "Kitchen task deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Decoration Controllers
// ==========================================

const getDecorationEvents = async (req, res, next) => {
  try {
    const { search = "", status = "" } = req.query;
    const events = await departmentWorkflowService.getDecorationEvents({ search, status });
    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error) {
    next(error);
  }
};

const getDecorationMaterials = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const materials = await departmentWorkflowService.getDecorationMaterials(eventId);
    res.status(200).json({
      success: true,
      data: materials,
    });
  } catch (error) {
    next(error);
  }
};

const createDecorationPurchaseRequest = async (req, res, next) => {
  try {
    const { eventId, items, notes } = req.body;
    const request = await departmentWorkflowService.createPurchaseRequest({
      department: "Decoration",
      eventId,
      items,
      notes,
      userId: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Decoration purchase request submitted successfully",
      data: request,
    });
  } catch (error) {
    next(error);
  }
};

const getDecorationTasks = async (req, res, next) => {
  try {
    const { eventId } = req.query;
    const tasks = await departmentWorkflowService.getDepartmentTasks({
      department: "Decoration",
      eventId,
    });

    res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

const createDecorationTask = async (req, res, next) => {
  try {
    const { eventId, dutyTitle, staffId, title, description, plannedStartAt, plannedEndAt } = req.body;
    const task = await departmentWorkflowService.createDepartmentTask({
      department: "Decoration",
      eventId,
      dutyTitle,
      staffId,
      title,
      description,
      plannedStartAt,
      plannedEndAt,
      userId: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Decoration task created successfully",
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Photography Controllers
// ==========================================

const getPhotographyEvents = async (req, res, next) => {
  try {
    const { search = "", status = "" } = req.query;
    const events = await departmentWorkflowService.getPhotographyEvents({ search, status });
    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error) {
    next(error);
  }
};

const getPhotographyEquipment = async (req, res, next) => {
  try {
    const equipment = await departmentWorkflowService.getPhotographyEquipment();
    res.status(200).json({
      success: true,
      data: equipment,
    });
  } catch (error) {
    next(error);
  }
};

const getPhotographyTasks = async (req, res, next) => {
  try {
    const { eventId } = req.query;
    const tasks = await departmentWorkflowService.getDepartmentTasks({
      department: "Photography",
      eventId,
    });

    res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

const createPhotographyTask = async (req, res, next) => {
  try {
    const { eventId, dutyTitle, staffId, title, description, plannedStartAt, plannedEndAt } = req.body;
    const task = await departmentWorkflowService.createDepartmentTask({
      department: "Photography",
      eventId,
      dutyTitle,
      staffId,
      title,
      description,
      plannedStartAt,
      plannedEndAt,
      userId: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: "Photography task created successfully",
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyDepartmentInfo,
  getKitchenEvents,
  getKitchenEventDetail,
  getRecipes,
  getRecipeByFoodItem,
  upsertRecipe,
  calculateKitchenIngredients,
  createKitchenPurchaseRequest,
  getKitchenPurchaseRequests,
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
};
