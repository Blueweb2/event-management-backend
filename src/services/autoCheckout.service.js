const Attendance = require("../models/attendance.model");
const Duty = require("../models/duty.model");
const Event = require("../models/event.model");
const Booking = require("../models/booking.model");
const { getIO } = require("../socket");

/**
 * Parses time strings like "18:00", "09:30", "6:00 PM", "6 PM", "11:30 AM"
 * Returns { hours, minutes } in 24-hour format, or null if invalid.
 */
function parseTimeToHoursAndMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const clean = timeStr.trim();

  // 12-hour format with AM/PM (e.g. "6:30 PM", "6 PM", "11:00 AM")
  const ampmMatch = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPM = ampmMatch[3].toLowerCase() === "pm";
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return { hours, minutes };
  }

  // 24-hour format (e.g. "18:00", "09:30")
  const militaryMatch = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1], 10);
    const minutes = parseInt(militaryMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  return null;
}

/**
 * Calculates the exact end Date & Time for an event or duty.
 */
function getEventOrDutyEndDateTime(baseDateInput, eventTimeString, dutyEndTimeString) {
  if (!baseDateInput) return null;
  const baseDate = new Date(baseDateInput);
  if (isNaN(baseDate.getTime())) return null;

  // 1. Check duty endTime first if provided
  if (dutyEndTimeString) {
    const parsedDuty = parseTimeToHoursAndMinutes(dutyEndTimeString);
    if (parsedDuty) {
      const d = new Date(baseDate);
      d.setHours(parsedDuty.hours, parsedDuty.minutes, 0, 0);
      return d;
    }
  }

  // 2. Check eventTime
  if (eventTimeString && typeof eventTimeString === "string") {
    const clean = eventTimeString.trim();

    // Check if time range: e.g. "14:00 - 20:00" or "2:00 PM to 8:00 PM"
    const rangeParts = clean.split(/\s*[-–—]|(?:\s+to\s+)\s*/i);
    if (rangeParts.length >= 2) {
      const endPart = rangeParts[rangeParts.length - 1].trim();
      const parsedEnd = parseTimeToHoursAndMinutes(endPart);
      if (parsedEnd) {
        const d = new Date(baseDate);
        d.setHours(parsedEnd.hours, parsedEnd.minutes, 0, 0);
        return d;
      }
    }

    // If single time (e.g. "18:00")
    const parsedSingle = parseTimeToHoursAndMinutes(clean);
    if (parsedSingle) {
      const d = new Date(baseDate);
      // If only start time was provided, standard event duration is ~4 hours
      const endHours = parsedSingle.hours + 4;
      if (endHours < 24) {
        d.setHours(endHours, parsedSingle.minutes, 0, 0);
      } else {
        d.setHours(23, 59, 59, 999);
      }
      return d;
    }
  }

  // 3. Fallback: End of the scheduled day (23:59:59.999)
  const endOfDay = new Date(baseDate);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

/**
 * Checks all active staff attendances. If the event date/time or duty date/time has passed,
 * automatically checks out the staff member and updates duty status to COMPLETED.
 */
async function autoCheckoutEndedEventsStaff(now = new Date()) {
  try {
    // Find all active attendances where staff checked in but hasn't checked out
    const activeAttendances = await Attendance.find({
      checkIn: { $ne: null },
      checkOut: null,
    }).populate("duty");

    if (!activeAttendances || activeAttendances.length === 0) {
      return 0;
    }

    let checkedOutCount = 0;
    const io = typeof getIO === "function" ? getIO() : null;

    for (const attendance of activeAttendances) {
      const duty = attendance.duty;
      let eventObj = null;

      // Look up Event or Booking
      const searchId = attendance.event || duty?.event;
      if (searchId) {
        eventObj = await Event.findOne({
          $or: [{ _id: searchId }, { booking: searchId }],
        });

        if (!eventObj) {
          eventObj = await Booking.findById(searchId);
        }
      }

      const dutyDate = duty?.dutyDate || eventObj?.eventDate || attendance.date;
      const eventTime = eventObj?.eventTime;
      const dutyEndTime = duty?.endTime;

      const scheduledEndTime = getEventOrDutyEndDateTime(dutyDate, eventTime, dutyEndTime);

      // Check if event is marked completed OR if the scheduled end date/time has passed
      const isEventStatusCompleted =
        eventObj?.status === "COMPLETED" ||
        eventObj?.status === "Completed" ||
        eventObj?.status === "Invoiced" ||
        eventObj?.status === "Settled";

      const isTimeEnded = scheduledEndTime && now > scheduledEndTime;

      if (!isTimeEnded && !isEventStatusCompleted) {
        // Event and duty have not ended yet
        continue;
      }

      // Effective checkout time: cap at scheduledEndTime if it ended in the past
      let effectiveCheckout = scheduledEndTime && scheduledEndTime < now ? scheduledEndTime : now;

      // Guard: ensure checkout is strictly after checkIn
      if (effectiveCheckout <= new Date(attendance.checkIn)) {
        effectiveCheckout = now;
      }

      if (attendance.isPaused) {
        const pausedAt = new Date(attendance.pausedAt || effectiveCheckout);
        const pauseDurationMinutes = Math.max(
          0,
          Math.floor((effectiveCheckout.getTime() - pausedAt.getTime()) / 60000)
        );
        attendance.totalPauseMinutes =
          (attendance.totalPauseMinutes || 0) + pauseDurationMinutes;
        attendance.isPaused = false;
        attendance.pausedAt = null;
      }

      const grossMinutes = Math.max(
        0,
        Math.floor((effectiveCheckout.getTime() - new Date(attendance.checkIn).getTime()) / 60000)
      );
      const activeMinutes = Math.max(
        0,
        grossMinutes - (attendance.totalPauseMinutes || 0)
      );
      const activeHours = Math.round((activeMinutes / 60) * 100) / 100;

      attendance.checkOut = effectiveCheckout;
      attendance.activeMinutes = activeMinutes;
      attendance.totalHours = activeHours;

      if (!Array.isArray(attendance.sessions)) {
        attendance.sessions = [];
      }
      attendance.sessions.push({
        type: "CLOCK_OUT",
        timestamp: effectiveCheckout,
        notes: "Auto-checkout: Event date and time ended",
      });

      const autoNote = "Auto-checked out: Event date and time ended";
      attendance.notes = attendance.notes
        ? `${attendance.notes}\n${autoNote}`
        : autoNote;

      await attendance.save();

      // Update associated Duty
      if (duty && duty._id) {
        duty.totalHours = activeHours;
        if (duty.hourlyRate) {
          duty.totalAmount = Math.round((activeHours * duty.hourlyRate) * 100) / 100;
        }
        duty.status = "COMPLETED";
        await duty.save();
      }

      // If event was in progress and time ended, check if all other duties are done
      if (eventObj && (eventObj.status === "IN_PROGRESS" || eventObj.status === "Ongoing") && eventObj._id) {
        const remainingActive = await Attendance.countDocuments({
          event: eventObj._id,
          checkIn: { $ne: null },
          checkOut: null,
          _id: { $ne: attendance._id },
        });

        if (remainingActive === 0 && isTimeEnded) {
          await Event.findByIdAndUpdate(eventObj._id, {
            $set: {
              status: "COMPLETED",
              completedAt: effectiveCheckout,
            },
          });
        }
      }

      checkedOutCount++;

      // Real-time broadcast
      if (io) {
        try {
          const evtId = String(eventObj?._id || eventObj?.booking || "");
          if (evtId) {
            io.to(`event:${evtId}`).emit("attendance:updated", {
              eventId: evtId,
              dutyId: String(duty?._id || ""),
              staffId: String(attendance.staff),
              status: "COMPLETED",
              autoCheckedOut: true,
            });
          }
          io.emit("attendance:updated", {
            dutyId: String(duty?._id || ""),
            staffId: String(attendance.staff),
            status: "COMPLETED",
            autoCheckedOut: true,
          });
        } catch (sErr) {
          console.warn("Socket broadcast error on auto-checkout:", sErr.message);
        }
      }
    }

    if (checkedOutCount > 0) {
      console.log(`[Auto-Checkout] Successfully checked out ${checkedOutCount} staff member(s) whose event date/time ended.`);
    }

    return checkedOutCount;
  } catch (error) {
    console.error("[Auto-Checkout] Error running auto-checkout for ended events:", error);
    return 0;
  }
}

module.exports = {
  parseTimeToHoursAndMinutes,
  getEventOrDutyEndDateTime,
  autoCheckoutEndedEventsStaff,
};
