const Booking = require("../models/booking.model");
const Event = require("../models/event.model");
const Attendance = require("../models/attendance.model");

/**
 * Get dashboard analytics for Manager Reports
 * GET /api/reports/analytics
 */
const getDashboardAnalytics = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Total Revenue from Confirmed/Completed Bookings
    const revenueAggregation = await Booking.aggregate([
      {
        $match: {
          status: { $in: ["Confirmed", "Completed"] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
        },
      },
    ]);
    
    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].totalRevenue : 0;

    // 2. Upcoming Events Volume
    const upcomingEventsVolume = await Event.countDocuments({
      eventDate: { $gte: today },
      status: { $ne: "Cancelled" },
    });

    // 3. Staff Hours Worked
    const staffHoursAggregation = await Attendance.aggregate([
      {
        $match: {
          status: "PRESENT",
          checkIn: { $ne: null },
          checkOut: { $ne: null },
        },
      },
      {
        $project: {
          durationMillis: { $subtract: ["$checkOut", "$checkIn"] },
        },
      },
      {
        $group: {
          _id: null,
          totalMillis: { $sum: "$durationMillis" },
        },
      },
    ]);

    const totalMillis = staffHoursAggregation.length > 0 ? staffHoursAggregation[0].totalMillis : 0;
    const totalStaffHours = Math.round(totalMillis / (1000 * 60 * 60)); // Convert to hours and round

    res.status(200).json({
      success: true,
      data: {
        totalRevenue,
        upcomingEventsVolume,
        totalStaffHours,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardAnalytics,
};
