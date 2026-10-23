const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  toggleExpenseStatus,
  getEventProfitability,
  getExpenseReceipt,
  getExpenseCreators,
} = require("../controllers/expense.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

// Set up secure receipts upload storage
const uploadDirectory = path.join(__dirname, "../../uploads/receipts");
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, uploadDirectory);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(
        null,
        `receipt-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`
      );
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, callback) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowed.includes((file.mimetype || "").toLowerCase())) {
      const err = new Error("Only JPG, JPEG, PNG, and PDF files are allowed for receipts");
      err.statusCode = 400;
      return callback(err);
    }
    callback(null, true);
  },
});

const router = express.Router();
router.use(authenticate);

router.get("/creators", authorize("Manager", "Staff"), getExpenseCreators);
router.get("/event/:eventId/profitability", authorize("Manager"), getEventProfitability);
router.get("/:id/receipt", authorize("Manager", "Staff"), getExpenseReceipt);
router.get("/", authorize("Manager", "Staff"), getExpenses);
router.post("/", authorize("Manager", "Staff"), upload.single("receipt"), createExpense);
router.put("/:id", authorize("Manager"), upload.single("receipt"), updateExpense);
router.delete("/:id", authorize("Manager"), deleteExpense);
router.patch("/:id/status", authorize("Manager"), toggleExpenseStatus);

module.exports = router;