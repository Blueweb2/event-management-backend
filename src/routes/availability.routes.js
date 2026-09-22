const express = require("express");

const {
  setAvailability,
  getAvailability,
  getAvailabilityById,
  deleteAvailability,
} = require("../controllers/availability.controller");

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
  authorize("admin", "Manager", "Staff"),
  setAvailability
);

router.get(
  "/",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  getAvailability
);

router.get(
  "/:id",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  getAvailabilityById
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin", "Manager"),
  deleteAvailability
);

module.exports = router;