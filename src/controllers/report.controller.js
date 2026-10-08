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

    // 1. Total Revenue: Sum of actual payments/deposits received from clients
    const revenueAggregation = await Booking.aggregate([
      {
        $match: {
          status: { $in: ["Confirmed", "Completed", "CONFIRMED", "COMPLETED", "Invoiced", "Settled"] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $ifNull: ["$paidAmount", { $ifNull: ["$advancePayment", 0] }],
            },
          },
        },
      },
    ]);
    
    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].totalRevenue : 0;

    // 2. Upcoming Events Volume
    const upcomingEventsVolume = await Event.countDocuments({
      eventDate: { $gte: today },
      status: { $nin: ["Cancelled", "CANCELLED", "cancelled"] },
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
          computedHours: {
            $cond: [
              { $gt: ["$totalHours", 0] },
              "$totalHours",
              {
                $divide: [
                  {
                    $max: [
                      0,
                      {
                        $subtract: [
                          { $subtract: ["$checkOut", "$checkIn"] },
                          { $multiply: [{ $ifNull: ["$totalPauseMinutes", 0] }, 60000] },
                        ],
                      },
                    ],
                  },
                  3600000,
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalStaffHours: { $sum: "$computedHours" },
        },
      },
    ]);

    const totalStaffHours =
      staffHoursAggregation.length > 0
        ? Math.round(staffHoursAggregation[0].totalStaffHours * 10) / 10
        : 0;

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
