const express = require("express");

const {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
} = require("../controllers/assignment.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const {
  authorize,
} = require("../middlewares/role.middleware");

const router = express.Router();

/**
 * Manager/Admin
 */
router.post(
  "/",
  authenticate,
  authorize("admin"),
  createAssignment
);

router.get(
  "/",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  getAssignments
);

router.get(
  "/:id",
  authenticate,
  authorize("admin"),
  getAssignmentById
);

router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  updateAssignment
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  deleteAssignment
);

module.exports = router;