const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    category: {
      type: String,
      enum: [
        "Food",
        "Catering",
        "Decoration",
        "Staff",
        "Transport",
        "Venue",
        "Equipment",
        "Equipment Rental",
        "Cleaning",
        "Miscellaneous",
        "Other",
      ],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    event: { type: String, required: true, trim: true, maxlength: 150 },
    date: { type: String, required: true, trim: true },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Bank Transfer", "UPI", "Card", "Other"],
      required: true,
    },
    status: { type: String, enum: ["Paid", "Pending"], default: "Pending" },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    vendorName: { type: String, trim: true, default: "", maxlength: 150 },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    receiptPath: { type: String, default: "" },
    receiptOriginalName: { type: String, default: "" },
    receiptMimeType: { type: String, default: "" },
    receiptSize: { type: Number, default: 0 },
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1, status: 1 });
expenseSchema.index({ eventId: 1 });
expenseSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Expense", expenseSchema);