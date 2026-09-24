const User = require("../models/user.model");
const Event = require("../models/event.model");
const Booking = require("../models/booking.model");
const Duty = require("../models/duty.model");
const Availability = require("../models/availability.model");

/**
 * Normalizes a category or service name into a standard department key
 */
const mapCategoryToDepartment = (category = "", serviceName = "") => {
  const combined = `${category} ${serviceName}`.toLowerCase();

  if (
    combined.includes("cater") ||
    combined.includes("food") ||
    combined.includes("beverage") ||
    combined.includes("drink") ||
    combined.includes("buffet") ||
    combined.includes("dining")
  ) {
    return "Catering";
  }

  if (
    combined.includes("decor") ||
    combined.includes("stage") ||
    combined.includes("floral") ||
    combined.includes("flower") ||
    combined.includes("balloon") ||
    combined.includes("backdrop")
  ) {
    return "Decoration";
  }

  if (
    combined.includes("sound") ||
    combined.includes("audio") ||
    combined.includes("dj") ||
    combined.includes("speaker") ||
    combined.includes("music") ||
    combined.includes("light") ||
    combined.includes("laser") ||
    combined.includes("led") ||
    combined.includes("av")
  ) {
    return "Sound & Lighting";
  }

  if (
    combined.includes("photo") ||
    combined.includes("video") ||
    combined.includes("media") ||
    combined.includes("reel") ||
    combined.includes("camera") ||
    combined.includes("cinemat")
  ) {
    return "Photography & Media";
  }

  if (
    combined.includes("security") ||
    combined.includes("bouncer") ||
    combined.includes("guard") ||
    combined.includes("valet")
  ) {
    return "Security";
  }

  if (
    combined.includes("logistic") ||
    combined.includes("transport") ||
    combined.includes("setup") ||
    combined.includes("labor") ||
    combined.includes("warehouse")
  ) {
    return "Logistics";
  }

  if (
    combined.includes("hospitality") ||
    combined.includes("host") ||
    combined.includes("usher") ||
    combined.includes("reception") ||
    combined.includes("guest")
  ) {
    return "Hospitality";
  }

  return "General Operations";
};

/**
 * Get dynamic staffing requirements and staff availability for a specific event
 */
const getEventStaffingRequirements = async (eventId) => {
  const event = await Event.findById(eventId)
    .populate("client", "name phone email")
    .populate("booking");

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const booking = event.booking || (await Booking.findById(event._id)) || {};
  const eventDate = new Date(event.eventDate);
  const targetDateStr = eventDate.toISOString().slice(0, 10);

  // Date range for the entire day
  const dayStart = new Date(eventDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(eventDate);
  dayEnd.setHours(23, 59, 59, 999);

  // 1. Fetch all active staff
  const allStaff = await User.find({
    role: "staff",
    isActive: true,
  })
    .select("name username email phone employeeId department location")
    .lean();

  // 2. Fetch availability/leave records for this date
  const availabilities = await Availability.find({
    date: {
      $gte: dayStart,
      $lte: dayEnd,
    },
  }).lean();

  const availabilityMap = new Map();
  availabilities.forEach((rec) => {
    availabilityMap.set(rec.staff.toString(), rec);
  });

  // 3. Fetch existing duties on this date
  const existingDuties = await Duty.find({
    dutyDate: {
      $gte: dayStart,
      $lte: dayEnd,
    },
    status: { $ne: "CANCELLED" },
  })
    .populate("event", "eventName eventType eventDate location")
    .lean();

  const dutyMap = new Map();
  existingDuties.forEach((duty) => {
    const staffId = duty.staff.toString();
    if (!dutyMap.has(staffId)) {
      dutyMap.set(staffId, []);
    }
    dutyMap.get(staffId).push(duty);
  });

  const sourceBookingId = (booking._id || event.booking?._id || event._id).toString();

  // 4. Build enriched staff pool with date-specific availability status
  const enrichedStaffPool = allStaff.map((staff) => {
    const staffId = staff._id.toString();
    const avail = availabilityMap.get(staffId);
    const duties = dutyMap.get(staffId) || [];

    const isAssignedToThisEvent = duties.some(
      (d) =>
        d.event?._id?.toString() === sourceBookingId ||
        d.event?.toString() === sourceBookingId
    );

    const isAssignedToOtherEvent = duties.some(
      (d) =>
        d.event?._id?.toString() !== sourceBookingId &&
        d.event?.toString() !== sourceBookingId
    );

    let status = "AVAILABLE";
    let statusLabel = "Available for Duty";
    let statusReason = "";

    if (avail && (avail.status === "ON_LEAVE" || avail.status === "UNAVAILABLE")) {
      status = "ON_LEAVE";
      statusLabel = "On Leave";
      statusReason = avail.notes || "Marked on leave for this date";
    } else if (isAssignedToThisEvent) {
      status = "ASSIGNED_THIS_EVENT";
      statusLabel = "Assigned to this Event";
      const thisDuty = duties.find(
        (d) =>
          d.event?._id?.toString() === sourceBookingId ||
          d.event?.toString() === sourceBookingId
      );
      statusReason = thisDuty?.dutyTitle ? `Duty: ${thisDuty.dutyTitle}` : "Assigned";
    } else if (isAssignedToOtherEvent) {
      status = "ASSIGNED_OTHER";
      statusLabel = "Busy on Other Event";
      const otherDuty = duties.find(
        (d) =>
          d.event?._id?.toString() !== sourceBookingId &&
          d.event?.toString() !== sourceBookingId
      );
      statusReason = otherDuty?.event?.eventName
        ? `Busy at ${otherDuty.event.eventName}`
        : "Assigned to another event";
    }

    return {
      id: staff._id,
      name: staff.name,
      username: staff.username,
      email: staff.email,
      phone: staff.phone || "",
      employeeId: staff.employeeId || `EMP-${staff._id.toString().slice(-4).toUpperCase()}`,
      department: staff.department?.trim() || "General Operations",
      location: staff.location || "",
      status,
      statusLabel,
      statusReason,
      isAvailable: status === "AVAILABLE",
    };
  });

  // 5. Build Dynamic Staffing Streams from Booking
  const streams = [];

  // 5a. Catering & Food stream (if food menu included or items present)
  const foodMenu = booking.foodMenu;
  const hasCatering =
    foodMenu?.included ||
    (Array.isArray(foodMenu?.items) && foodMenu.items.length > 0);

  if (hasCatering) {
    const cateringStaff = enrichedStaffPool.filter(
      (s) =>
        s.department.toLowerCase().includes("cater") ||
        s.department.toLowerCase().includes("food") ||
        s.department.toLowerCase().includes("beverage")
    );

    const cateringDuties = existingDuties.filter(
      (d) =>
        (d.event?._id?.toString() === sourceBookingId ||
          d.event?.toString() === sourceBookingId) &&
        (d.role?.toLowerCase().includes("cater") ||
          d.dutyTitle?.toLowerCase().includes("cater") ||
          d.dutyTitle?.toLowerCase().includes("chef") ||
          d.dutyTitle?.toLowerCase().includes("steward") ||
          d.dutyTitle?.toLowerCase().includes("food"))
    );

    streams.push({
      streamId: "catering",
      streamType: "CATERING",
      title: "Catering & Beverage Management",
      department: "Catering",
      category: "catering",
      description: foodMenu?.notes || `Catering for ${event.guests} guests (${foodMenu?.servingType || "Buffet"})`,
      specDetails: {
        guests: event.guests,
        servingType: foodMenu?.servingType || "PER_GUEST",
        ratePerGuest: foodMenu?.ratePerGuest || 0,
        totalFoodAmount: foodMenu?.totalFoodAmount || 0,
        itemsCount: foodMenu?.items?.length || 0,
        items: foodMenu?.items || [],
      },
      recommendedStaffCount: Math.max(Math.ceil((event.guests || 50) / 30), 2),
      allocatedCount: cateringDuties.length,
      assignedDuties: cateringDuties,
      departmentStaff: cateringStaff,
    });
  }

  // 5b. Dynamic Service streams from booking.services
  const bookedServices = Array.isArray(booking.services) ? booking.services : [];

  bookedServices.forEach((svc, index) => {
    const mappedDept = mapCategoryToDepartment(svc.category, svc.serviceName);

    const deptStaff = enrichedStaffPool.filter(
      (s) =>
        s.department.toLowerCase().includes(mappedDept.toLowerCase()) ||
        mappedDept.toLowerCase().includes(s.department.toLowerCase())
    );

    const matchingDuties = existingDuties.filter(
      (d) =>
        (d.event?._id?.toString() === sourceBookingId ||
          d.event?.toString() === sourceBookingId) &&
        (d.role?.toLowerCase().includes(mappedDept.toLowerCase()) ||
          d.dutyTitle?.toLowerCase().includes(svc.serviceName.toLowerCase()) ||
          d.dutyTitle?.toLowerCase().includes(svc.category.toLowerCase()))
    );

    streams.push({
      streamId: `service-${index}-${svc.serviceId || svc._id || index}`,
      streamType: "SERVICE",
      title: svc.serviceName,
      department: mappedDept,
      category: svc.category,
      description: svc.description || `${svc.serviceName} (${svc.pricingType || "Custom"})`,
      specDetails: {
        quantity: svc.quantity || 1,
        pricingType: svc.pricingType || "FIXED",
        unitLabel: svc.unitLabel || "unit",
        unitPrice: svc.unitPrice || 0,
        total: svc.total || 0,
      },
      recommendedStaffCount: svc.quantity || 1,
      allocatedCount: matchingDuties.length,
      assignedDuties: matchingDuties,
      departmentStaff: deptStaff,
    });
  });

  // 5c. Always provide General Operations stream if needed
  const opsStaff = enrichedStaffPool.filter(
    (s) =>
      s.department.toLowerCase().includes("operation") ||
      s.department.toLowerCase().includes("general") ||
      s.department.toLowerCase().includes("manager")
  );

  const opsDuties = existingDuties.filter(
    (d) =>
      (d.event?._id?.toString() === sourceBookingId ||
        d.event?.toString() === sourceBookingId) &&
      !streams.some((st) =>
        st.assignedDuties?.some((ad) => ad._id.toString() === d._id.toString())
      )
  );

  streams.push({
    streamId: "general-operations",
    streamType: "OPERATIONS",
    title: "Event Operations & Coordination",
    department: "General Operations",
    category: "operations",
    description: "Overall floor coordination, client assistance, and logistics handling",
    specDetails: {
      guests: event.guests,
      location: event.location,
    },
    recommendedStaffCount: 2,
    allocatedCount: opsDuties.length,
    assignedDuties: opsDuties,
    departmentStaff: opsStaff,
  });

  // 6. Organization-wide Department Summary for this Date
  const departmentSummary = calculateDepartmentSummary(enrichedStaffPool);

  return {
    event: {
      id: event._id,
      eventName: event.eventName,
      eventType: event.eventType,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      guests: event.guests,
      location: event.location,
      status: event.status,
      client: event.client,
      hasCatering,
      foodMenu,
      servicesCount: bookedServices.length,
    },
    targetDate: targetDateStr,
    staffingStreams: streams,
    departmentSummary,
    allStaffPool: enrichedStaffPool,
  };
};

/**
 * Get organization-wide department availability for a given date
 */
const getDepartmentDateAvailability = async (dateStr) => {
  const targetDate = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(targetDate.getTime())) {
    const error = new Error("Invalid date parameter");
    error.statusCode = 400;
    throw error;
  }

  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  // 1. Fetch active staff
  const allStaff = await User.find({
    role: "staff",
    isActive: true,
  })
    .select("name username email phone employeeId department location")
    .lean();

  // 2. Fetch availability records
  const availabilities = await Availability.find({
    date: {
      $gte: dayStart,
      $lte: dayEnd,
    },
  }).lean();

  const availabilityMap = new Map();
  availabilities.forEach((rec) => {
    availabilityMap.set(rec.staff.toString(), rec);
  });

  // 3. Fetch duties for date
  const existingDuties = await Duty.find({
    dutyDate: {
      $gte: dayStart,
      $lte: dayEnd,
    },
    status: { $ne: "CANCELLED" },
  })
    .populate("event", "eventName eventType location")
    .lean();

  const dutyMap = new Map();
  existingDuties.forEach((duty) => {
    const staffId = duty.staff.toString();
    dutyMap.set(staffId, duty);
  });

  // 4. Build enriched staff
  const enrichedStaff = allStaff.map((staff) => {
    const staffId = staff._id.toString();
    const avail = availabilityMap.get(staffId);
    const assignedDuty = dutyMap.get(staffId);

    let status = "AVAILABLE";
    let statusLabel = "Available";
    let statusReason = "";

    if (avail && (avail.status === "ON_LEAVE" || avail.status === "UNAVAILABLE")) {
      status = "ON_LEAVE";
      statusLabel = "On Leave";
      statusReason = avail.notes || "Marked on leave";
    } else if (assignedDuty) {
      status = "ASSIGNED";
      statusLabel = "Assigned";
      statusReason = assignedDuty.event?.eventName
        ? `${assignedDuty.dutyTitle} @ ${assignedDuty.event.eventName}`
        : assignedDuty.dutyTitle || "Assigned to duty";
    }

    return {
      id: staff._id,
      name: staff.name,
      username: staff.username,
      email: staff.email,
      phone: staff.phone || "",
      employeeId: staff.employeeId || `EMP-${staff._id.toString().slice(-4).toUpperCase()}`,
      department: staff.department?.trim() || "General Operations",
      location: staff.location || "",
      status,
      statusLabel,
      statusReason,
      isAvailable: status === "AVAILABLE",
    };
  });

  const departmentSummary = calculateDepartmentSummary(enrichedStaff);

  return {
    date: dayStart.toISOString().slice(0, 10),
    totalStaff: enrichedStaff.length,
    availableStaff: enrichedStaff.filter((s) => s.status === "AVAILABLE").length,
    onLeaveStaff: enrichedStaff.filter((s) => s.status === "ON_LEAVE").length,
    assignedStaff: enrichedStaff.filter((s) => s.status === "ASSIGNED").length,
    departments: departmentSummary,
    staff: enrichedStaff,
  };
};

/**
 * Calculates department breakdown stats from an enriched staff array
 */
const calculateDepartmentSummary = (staffList) => {
  const map = new Map();

  staffList.forEach((staff) => {
    const dept = staff.department || "General Operations";
    if (!map.has(dept)) {
      map.set(dept, {
        department: dept,
        total: 0,
        available: 0,
        onLeave: 0,
        assigned: 0,
        staff: [],
      });
    }

    const group = map.get(dept);
    group.total += 1;
    if (staff.status === "AVAILABLE") group.available += 1;
    else if (staff.status === "ON_LEAVE") group.onLeave += 1;
    else group.assigned += 1;

    group.staff.push(staff);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};

module.exports = {
  getEventStaffingRequirements,
  getDepartmentDateAvailability,
  mapCategoryToDepartment,
};
