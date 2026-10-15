/**
 * Measurement Unit Converter & Compatibility Engine
 * Safely converts between compatible metric measurement units (kg <-> g, liter <-> ml, dozen <-> pcs)
 * and detects incompatible unit comparisons (e.g. kg vs pcs).
 */

const UNIT_FAMILIES = {
  // Mass / Weight (base unit: g)
  kg: { family: "mass", toBase: 1000 },
  kilogram: { family: "mass", toBase: 1000 },
  kilograms: { family: "mass", toBase: 1000 },
  g: { family: "mass", toBase: 1 },
  gram: { family: "mass", toBase: 1 },
  grams: { family: "mass", toBase: 1 },
  mg: { family: "mass", toBase: 0.001 },
  milligram: { family: "mass", toBase: 0.001 },
  milligrams: { family: "mass", toBase: 0.001 },

  // Volume (base unit: ml)
  l: { family: "volume", toBase: 1000 },
  liter: { family: "volume", toBase: 1000 },
  liters: { family: "volume", toBase: 1000 },
  litre: { family: "volume", toBase: 1000 },
  litres: { family: "volume", toBase: 1000 },
  ltr: { family: "volume", toBase: 1000 },
  ml: { family: "volume", toBase: 1 },
  milliliter: { family: "volume", toBase: 1 },
  milliliters: { family: "volume", toBase: 1 },

  // Count / Discrete (base unit: pcs)
  pcs: { family: "count", toBase: 1 },
  piece: { family: "count", toBase: 1 },
  pieces: { family: "count", toBase: 1 },
  pc: { family: "count", toBase: 1 },
  nos: { family: "count", toBase: 1 },
  unit: { family: "count", toBase: 1 },
  units: { family: "count", toBase: 1 },
  count: { family: "count", toBase: 1 },
  dozen: { family: "count", toBase: 12 },
  dozens: { family: "count", toBase: 12 },
};

const normalizeUnitString = (unit = "") => {
  return String(unit || "").trim().toLowerCase();
};

/**
 * Checks if two units are compatible and converts a quantity from fromUnit to toUnit.
 *
 * @param {number} quantity - Quantity in fromUnit
 * @param {string} fromUnit - Origin unit (e.g. stock item unit)
 * @param {string} toUnit - Target unit (e.g. recipe ingredient unit)
 * @returns {{
 *   convertedQuantity: number | null,
 *   isCompatible: boolean,
 *   warning?: string
 * }}
 */
const convertStockToIngredientUnit = (quantity, fromUnit, toUnit) => {
  const normFrom = normalizeUnitString(fromUnit);
  const normTo = normalizeUnitString(toUnit);

  const numQty = Number(quantity) || 0;

  // Direct exact match
  if (normFrom === normTo) {
    return {
      convertedQuantity: numQty,
      isCompatible: true,
    };
  }

  const fromInfo = UNIT_FAMILIES[normFrom];
  const toInfo = UNIT_FAMILIES[normTo];

  // If either unit is unrecognized, treat as incompatible unless normalized strings match
  if (!fromInfo || !toInfo) {
    return {
      convertedQuantity: null,
      isCompatible: false,
      warning: `Incompatible or unrecognized unit conversion: cannot convert "${fromUnit}" to "${toUnit}".`,
    };
  }

  // Check if they belong to the same physical measurement family
  if (fromInfo.family !== toInfo.family) {
    return {
      convertedQuantity: null,
      isCompatible: false,
      warning: `Incompatible unit measurement family: warehouse tracks in "${fromUnit}" (${fromInfo.family}) but recipe requires "${toUnit}" (${toInfo.family}).`,
    };
  }

  // Convert: fromUnit -> base -> toUnit
  const baseValue = numQty * fromInfo.toBase;
  const converted = baseValue / toInfo.toBase;

  return {
    convertedQuantity: Math.round(converted * 10000) / 10000,
    isCompatible: true,
  };
};

module.exports = {
  UNIT_FAMILIES,
  normalizeUnitString,
  convertStockToIngredientUnit,
};
