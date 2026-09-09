const Estimate = require("../models/estimate.model");

const generateEstimateNumber = async () => {
  const year = new Date().getFullYear();

  const lastEstimate = await Estimate.findOne({
    estimateNumber: new RegExp(
      `^EST-${year}-`,
    ),
  })
    .sort({ createdAt: -1 })
    .select("estimateNumber");

  let nextNumber = 1;

  if (lastEstimate) {
    const parts =
      lastEstimate.estimateNumber.split("-");

    const lastNumber =
      Number(parts[parts.length - 1]) || 0;

    nextNumber = lastNumber + 1;
  }

  return `EST-${year}-${String(nextNumber).padStart(
    4,
    "0",
  )}`;
};

module.exports = generateEstimateNumber;