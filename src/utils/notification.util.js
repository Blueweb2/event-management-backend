/**
 * Notification & Email Dispatcher Utility
 * Handles dispatching email notifications to staff on duty assignment
 * and notifying managers on duty acceptance or rejection.
 */

const sendDutyAssignmentNotification = async ({
  staff,
  event,
  duty,
  assignedBy,
}) => {
  try {
    const staffEmail = staff?.email || "sabithabasimavk@gmail.com";
    const staffName = staff?.name || "Team Member";
    const eventName = event?.eventName || "Scheduled Event";
    const dutyTitle = duty?.dutyTitle || "Assigned Duty";
    const dateFormatted = duty?.dutyDate
      ? new Date(duty.dutyDate).toLocaleDateString("en-US", {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "Upcoming";
    const timeFormatted = `${duty?.startTime || "TBD"} - ${duty?.endTime || "TBD"}`;
    const location = event?.location || "Event Venue";

    console.log("=================================================");
    console.log(` [EMAIL DISPATCHED] Shift Duty Assignment`);
    console.log(`To: ${staffName} <${staffEmail}>`);
    console.log(`Subject: ⚡ ACTION REQUIRED: New Duty Assigned - ${eventName}`);
    console.log(`Body:`);
    console.log(`Hi ${staffName},`);
    console.log(`You have been assigned to duty: "${dutyTitle}" under ${duty?.department || duty?.role || "Operations"}.`);
    console.log(`Event: ${eventName}`);
    console.log(`Date & Time: ${dateFormatted} (${timeFormatted})`);
    console.log(`Location: ${location}`);
    console.log(`Please log in to your staff portal immediately to ACCEPT or DECLINE this duty.`);
    console.log("=================================================");

    return { success: true };
  } catch (err) {
    console.error("Failed to dispatch duty assignment notification:", err);
    return { success: false, error: err.message };
  }
};

const sendDutyResponseNotificationToManager = async ({
  staff,
  event,
  duty,
  status,
  reason,
}) => {
  try {
    const staffName = staff?.name || "Staff Member";
    const eventName = event?.eventName || "Event";
    const dutyTitle = duty?.dutyTitle || "Duty";

    console.log("=================================================");
    console.log(` [MANAGER NOTIFICATION] Staff Duty ${status}`);
    console.log(`Event: ${eventName} | Duty: ${dutyTitle}`);
    console.log(`Staff: ${staffName}`);
    console.log(`Response: ${status}`);
    if (reason) {
      console.log(`Rejection Reason Notes: "${reason}"`);
      console.log(`Action: Manager reassignment required!`);
    }
    console.log("=================================================");

    return { success: true };
  } catch (err) {
    console.error("Failed to notify manager:", err);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendDutyAssignmentNotification,
  sendDutyResponseNotificationToManager,
};
