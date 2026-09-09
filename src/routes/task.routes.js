const express = require("express");

const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
} = require("../controllers/task.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const {
  authorize,
} = require("../middlewares/role.middleware");

const router = express.Router();

router.post(
  "/",
  authenticate,
  authorize("admin"),
  createTask
);

router.get(
  "/",
  authenticate,
  authorize("admin"),
  getTasks
);

router.get(
  "/:id",
  authenticate,
  authorize("admin"),
  getTaskById
);

router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  updateTask
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  deleteTask
);

module.exports = router;