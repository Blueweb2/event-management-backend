const Task = require("../models/task.model");
const Duty = require("../models/duty.model");

/**
 * Create task
 */
const createTask = async ({
  duty,
  title,
  description = "",
  dueDate,
  dueTime = "",
  priority = "MEDIUM",
  notes = "",
  createdBy,
}) => {
  const dutyRecord =
    await Duty.findById(duty);

  if (!dutyRecord) {
    const error = new Error(
      "Duty not found"
    );

    error.statusCode = 404;
    throw error;
  }

  const task = await Task.create({
    duty,
    title: title.trim(),
    description:
      description?.trim() || "",
    dueDate,
    dueTime: dueTime?.trim() || "",
    priority,
    status: "PENDING",
    notes: notes?.trim() || "",
    createdBy,
  });

  return task;
};

/**
 * Get tasks
 */
const getTasks = async ({
  duty,
  status,
  priority,
  page = 1,
  limit = 20,
}) => {
  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const perPage = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const query = {};

  if (duty) {
    query.duty = duty;
  }

  if (status) {
    query.status = status;
  }

  if (priority) {
    query.priority = priority;
  }

  const skip =
    (currentPage - 1) * perPage;

  const [tasks, total] =
    await Promise.all([
      Task.find(query)
        .populate({
          path: "duty",
          populate: [
            {
              path: "staff",
              select:
                "name username employeeId",
            },
            {
              path: "event",
              select:
                "eventName eventDate location",
            },
          ],
        })
        .sort({
          dueDate: 1,
          dueTime: 1,
        })
        .skip(skip)
        .limit(perPage)
        .lean(),

      Task.countDocuments(query),
    ]);

  return {
    tasks,
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(
        total / perPage
      ),
    },
  };
};

/**
 * Get task by ID
 */
const getTaskById = async (taskId) => {
  const task = await Task.findById(
    taskId
  ).populate({
    path: "duty",
    populate: [
      {
        path: "staff",
        select:
          "name username email employeeId",
      },
      {
        path: "event",
        select:
          "eventName eventType eventDate location",
      },
    ],
  });

  if (!task) {
    const error = new Error(
      "Task not found"
    );

    error.statusCode = 404;
    throw error;
  }

  return task;
};

/**
 * Update task
 */
const updateTask = async (
  taskId,
  {
    title,
    description,
    dueDate,
    dueTime,
    priority,
    status,
    notes,
  }
) => {
  const task =
    await Task.findById(taskId);

  if (!task) {
    const error = new Error(
      "Task not found"
    );

    error.statusCode = 404;
    throw error;
  }

  if (title !== undefined) {
    task.title = title.trim();
  }

  if (description !== undefined) {
    task.description =
      description.trim();
  }

  if (dueDate !== undefined) {
    task.dueDate = dueDate;
  }

  if (dueTime !== undefined) {
    task.dueTime = dueTime.trim();
  }

  if (priority !== undefined) {
    if (
      !["LOW", "MEDIUM", "HIGH"].includes(
        priority
      )
    ) {
      const error = new Error(
        "Invalid task priority"
      );

      error.statusCode = 400;
      throw error;
    }

    task.priority = priority;
  }

  if (status !== undefined) {
    const allowedStatuses = [
      "PENDING",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      const error = new Error(
        "Invalid task status"
      );

      error.statusCode = 400;
      throw error;
    }

    task.status = status;

    if (status === "COMPLETED") {
      task.completedAt =
        task.completedAt || new Date();
    } else {
      task.completedAt = null;
    }
  }

  if (notes !== undefined) {
    task.notes = notes.trim();
  }

  await task.save();

  return getTaskById(task._id);
};

/**
 * Delete task
 */
const deleteTask = async (taskId) => {
  const task =
    await Task.findById(taskId);

  if (!task) {
    const error = new Error(
      "Task not found"
    );

    error.statusCode = 404;
    throw error;
  }

  task.status = "CANCELLED";

  await task.save();

  return task;
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
};