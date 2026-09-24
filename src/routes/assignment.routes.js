const express = require("express");

const {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  acceptAssignment,
  rejectAssignment,
  updateChecklist,
  updatePayment,
} = require("../controllers/assignment.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

const {
  authorize,
} = require("../middlewares/role.middleware");

const router = express.Router();

/**
 * Manager/Admin: Create assignment
 * POST /api/assignments
 */
router.post(
  "/",
  authenticate,
  authorize("admin", "Manager"),
  createAssignment
);

/**
 * Manager/Admin/Staff: Get assignments list
 * GET /api/assignments
 */
router.get(
  "/",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  getAssignments
);

/**
 * Manager/Admin/Staff: Get single assignment details
 * GET /api/assignments/:id
 */
router.get(
  "/:id",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  getAssignmentById
);

/**
 * Staff/Manager/Admin: Accept shift assignment
 * PATCH /api/assignments/:id/accept
 */
router.patch(
  "/:id/accept",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  acceptAssignment
);

/**
 * Staff/Manager/Admin: Decline/Reject shift assignment with reason notes
 * PATCH /api/assignments/:id/reject
 */
router.patch(
  "/:id/reject",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  rejectAssignment
);

/**
 * Staff/Manager/Admin: Update assignment sub-task checklist
 * PATCH /api/assignments/:id/checklist
 */
router.patch(
  "/:id/checklist",
  authenticate,
  authorize("admin", "Manager", "Staff"),
  updateChecklist
);

/**
 * Manager/Admin: Update duty payment status / payout record
 * PATCH /api/assignments/:id/payment
 */
router.patch(
  "/:id/payment",
  authenticate,
  authorize("admin", "Manager"),
  updatePayment
);

/**
 * Manager/Admin: Update full assignment
 * PUT /api/assignments/:id
 */
router.put(
  "/:id",
  authenticate,
  authorize("admin", "Manager"),
  updateAssignment
);

/**
 * Manager/Admin: Delete / cancel assignment
 * DELETE /api/assignments/:id
 */
router.delete(
  "/:id",
  authenticate,
  authorize("admin", "Manager"),
  deleteAssignment
);

module.exports = router;