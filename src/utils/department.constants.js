/**
 * Standard Department Constants and Permissions
 */

const DEPARTMENTS = {
  KITCHEN: "Kitchen",
  DECORATION: "Decoration",
  PHOTOGRAPHY: "Photography",
  SOUND_LIGHTING: "Sound & Lighting",
  CATERING: "Catering",
  OPERATIONS: "Operations",
};

const DEPARTMENT_LIST = [
  "Kitchen",
  "Decoration",
  "Photography",
  "Sound & Lighting",
  "Catering",
  "Operations",
];

const DEFAULT_DEPARTMENT_PERMISSIONS = {
  Kitchen: [
    "kitchen:view_events",
    "kitchen:view_recipes",
    "kitchen:manage_recipes",
    "kitchen:calculate_ingredients",
    "kitchen:create_purchase_request",
    "kitchen:manage_prep_tasks",
  ],
  Decoration: [
    "decoration:view_events",
    "decoration:view_materials",
    "decoration:create_purchase_request",
    "decoration:manage_setup_tasks",
  ],
  Photography: [
    "photography:view_events",
    "photography:view_equipment",
    "photography:manage_shoot_tasks",
  ],
  "Sound & Lighting": [
    "sound_lighting:view_events",
    "sound_lighting:view_equipment",
    "sound_lighting:manage_tasks",
  ],
  Catering: [
    "catering:view_events",
    "catering:view_staffing",
    "catering:manage_service_tasks",
  ],
  Operations: [
    "events:view_all",
    "kitchen:view_events",
    "kitchen:view_recipes",
    "kitchen:manage_recipes",
    "kitchen:calculate_ingredients",
    "kitchen:create_purchase_request",
    "kitchen:manage_prep_tasks",
    "decoration:view_events",
    "decoration:view_materials",
    "decoration:create_purchase_request",
    "decoration:manage_setup_tasks",
    "photography:view_events",
    "photography:view_equipment",
    "photography:manage_shoot_tasks",
    "sound_lighting:view_events",
    "sound_lighting:view_equipment",
    "sound_lighting:manage_tasks",
    "catering:view_events",
    "catering:view_staffing",
    "catering:manage_service_tasks",
    "staff:manage",
    "stock:view",
    "stock:request",
  ],
};

const normalizeDepartment = (dept = "") => {
  const d = String(dept || "").trim().toLowerCase();
  if (d.includes("kitchen") || d.includes("chef") || d.includes("cook")) {
    return "Kitchen";
  }
  if (d.includes("decor") || d.includes("stage") || d.includes("floral")) {
    return "Decoration";
  }
  if (d.includes("photo") || d.includes("video") || d.includes("media") || d.includes("cinemat")) {
    return "Photography";
  }
  if (d.includes("sound") || d.includes("light") || d.includes("audio") || d.includes("dj")) {
    return "Sound & Lighting";
  }
  if (d.includes("cater") || d.includes("dining")) {
    return "Catering";
  }
  return "Operations";
};

module.exports = {
  DEPARTMENTS,
  DEPARTMENT_LIST,
  DEFAULT_DEPARTMENT_PERMISSIONS,
  normalizeDepartment,
};
