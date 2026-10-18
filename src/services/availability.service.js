const Availability = require("../models/availability.model");
const User = require("../models/user.model");
const { normalizeDepartment } = require("../utils/department.constants");

const isSuperAdmin = (requester) => {
  const r = (requester?.role || "").toLowerCase();
  return r === "superadmin" || r === "admin";
};

const isChefManager = (requester) => {
  const r = (requester?.role || "").toLowerCase();
  return r === "manager" && normalizeDepartment(requester?.department) === "Kitchen";
};

const isDepartmentManager = (requester) => {
  const r = (requester?.role || "").toLowerCase();
  return r === "manager";
};

const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create or update staff availability
 */
const setAvailability = async ({
  staff,
  date,
  status,
  startTime = "",
  endTime = "",
  notes = "",
  createdBy = null,
  requester = null,
}) => {
  const staffMember =
    await User.findOne({
      _id: staff,
      role: "staff",
    });

  if (!staffMember) {
    const error = new Error(
      "Staff member not found"
    );

    error.statusCode = 404;
    throw error;
  }

  // Role and department authorization check
  if (requester && !isSuperAdmin(requester)) {
    if (requester.role === "staff" && String(requester.userId) !== String(staff)) {
      const error = new Error("You can only update your own availability");
      error.statusCode = 403;
      throw error;
    }
    if (isChefManager(requester) && normalizeDepartment(staffMember.department) !== "Kitchen") {
      const error = new Error("Access denied: Staff belongs to another department");
      error.statusCode = 403;
      throw error;
    }
    if (isDepartmentManager(requester)) {
      const authDept = requester.department || "";
      if (normalizeDepartment(staffMember.department) !== normalizeDepartment(authDept)) {
        const error = new Error("Access denied: Staff belongs to another department");
        error.statusCode = 403;
        throw error;
      }
    }
  }

  const availability =
    await Availability.findOneAndUpdate(
      {
        staff,
        date,
      },
      {
        staff,
        date,
        status,
        startTime:
          startTime?.trim() || "",
        endTime:
          endTime?.trim() || "",
        notes: notes?.trim() || "",
        createdBy,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

  return availability.populate(
    "staff",
    "name username email employeeId department"
  );
};

/**
 * Get availability
 */
const getAvailability = async ({
  staff,
  date,
  status,
  page = 1,
  limit = 50,
  requester = null,
}) => {
  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const perPage = Math.min(
    Math.max(Number(limit) || 50, 1),
    1000
  );

  const query = {};

  if (requester) {
    if ((requester.role || "").toLowerCase() === "staff") {
      query.staff = requester.userId;
    } else if (isChefManager(requester)) {
      const kUsers = await User.find({ department: { $regex: /kitchen|chef|cook/i }, role: "staff" }).select("_id");
      const kStaffIds = kUsers.map((u) => u._id);
      if (staff) {
        if (!kStaffIds.some((id) => String(id) === String(staff))) {
          const error = new Error("Access denied: Staff belongs to another department");
          error.statusCode = 403;
          throw error;
        }
        query.staff = staff;
      } else {
        query.staff = { $in: kStaffIds };
      }
    } else if (isDepartmentManager(requester) && !isSuperAdmin(requester)) {
      const authDept = requester.department || "";
      const dUsers = await User.find({
        department: { $regex: new RegExp(`^${escapeRegex(authDept)}$`, "i") },
        role: "staff",
      }).select("_id");
      const dStaffIds = dUsers.map((u) => u._id);
      if (staff) {
        if (!dStaffIds.some((id) => String(id) === String(staff))) {
          const error = new Error("Access denied: Staff belongs to another department");
          error.statusCode = 403;
          throw error;
        }
        query.staff = staff;
      } else {
        query.staff = { $in: dStaffIds };
      }
    } else if (staff) {
      query.staff = staff;
    }
  } else if (staff) {
    query.staff = staff;
  }

  if (status) {
    query.status = status;
  }

  if (date) {
    const start = new Date(date);

    if (Number.isNaN(start.getTime())) {
      const error = new Error(
        "Invalid date"
      );

      error.statusCode = 400;
      throw error;
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    query.date = {
      $gte: start,
      $lt: end,
    };
  }

  const skip =
    (currentPage - 1) * perPage;

  const [availability, total] =
    await Promise.all([
      Availability.find(query)
        .populate(
          "staff",
          "name username email employeeId department"
        )
        .sort({
          date: 1,
        })
        .skip(skip)
        .limit(perPage)
        .lean(),

      Availability.countDocuments(query),
    ]);

  return {
    availability,
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
 * Get availability record
 */
const getAvailabilityById = async (
  availabilityId
) => {
  const availability =
    await Availability.findById(
      availabilityId
    ).populate(
      "staff",
      "name username email phone employeeId department location"
    );

  if (!availability) {
    const error = new Error(
      "Availability record not found"
    );

    error.statusCode = 404;
    throw error;
  }

  return availability;
};

/**
 * Delete availability
 */
const deleteAvailability = async (
  availabilityId
) => {
  const availability =
    await Availability.findByIdAndDelete(
      availabilityId
    );

  if (!availability) {
    const error = new Error(
      "Availability record not found"
    );

    error.statusCode = 404;
    throw error;
  }

  return availability;
};

module.exports = {
  setAvailability,
  getAvailability,
  getAvailabilityById,
  deleteAvailability,
};