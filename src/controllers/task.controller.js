const taskService = require("../services/task.service");

/**
 * Create task
 * POST /api/tasks
 */
const createTask = async (
  req,
  res,
  next
) => {
  try {
    const {
      duty,
      title,
      description,
      dueDate,
      dueTime,
      priority,
      notes,
    } = req.body;

    if (!duty || !title || !dueDate) {
      const error = new Error(
        "Duty, title and due date are required"
      );

      error.statusCode = 400;
      throw error;
    }

    const task =
      await taskService.createTask({
        duty,
        title,
        description,
        dueDate,
        dueTime,
        priority,
        notes,
        createdBy:
          req.user.userId,
      });

    res.status(201).json({
      success: true,
      message:
        "Task created successfully",
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get tasks
 * GET /api/tasks
 */
const getTasks = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await taskService.getTasks(
        req.query
      );

    res.status(200).json({
      success: true,
      data: result.tasks,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get task
 * GET /api/tasks/:id
 */
const getTaskById = async (
  req,
  res,
  next
) => {
  try {
    const task =
      await taskService.getTaskById(
        req.params.id
      );

    res.status(200).json({
      success: true,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update task
 * PUT /api/tasks/:id
 */
const updateTask = async (
  req,
  res,
  next
) => {
  try {
    const task =
      await taskService.updateTask(
        req.params.id,
        req.body
      );

    res.status(200).json({
      success: true,
      message:
        "Task updated successfully",
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel task
 * DELETE /api/tasks/:id
 */
const deleteTask = async (
  req,
  res,
  next
) => {
  try {
    await taskService.deleteTask(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message:
        "Task cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
};