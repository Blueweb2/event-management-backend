/**
 * Notification & Email Dispatcher Utility
 * Handles dispatching email notifications for staff duty assignments,
 * manager duty responses, and manager stock notifications via Resend.
 */

const { Resend } = require("resend");

/**
 * Escapes dynamic string content for safe inclusion in HTML templates.
 * Prevents HTML injection / XSS in email clients.
 *
 * @param {*} str - Content to escape
 * @returns {string} Safe HTML-escaped string
 */
const escapeHtml = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Internal reference for Resend client (supports injection in tests)
 */
let customResendClient = null;

const setResendClientForTesting = (mockClient) => {
  customResendClient = mockClient;
};

/**
 * Retrieves the Resend client instance if properly configured.
 * Does not expose or log the raw API key.
 *
 * @returns {Resend|null} Resend instance or null if unconfigured
 */
const getResendClient = () => {
  if (customResendClient) {
    return customResendClient;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  return new Resend(apiKey.trim());
};

/**
 * Resolves the sender email address.
 */
const getEmailFrom = () => {
  return process.env.EMAIL_FROM?.trim() || "Pircello Stock <onboarding@resend.dev>";
};

/**
 * Resolves the manager notification email address.
 */
const getManagerEmail = () => {
  return (
    process.env.MANAGER_NOTIFICATION_EMAIL?.trim() ||
    process.env.MANAGER_EMAIL?.trim() ||
    "manager@pircello.com"
  );
};

/**
 * Resolves frontend manager URL for direct links in notification emails.
 */
const getManagerStockUrl = () => {
  const baseUrl = (process.env.APP_URL || process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/manager/stock` : null;
};

// ==========================================
// DUTY NOTIFICATION FUNCTIONS (PRESERVED)
// ==========================================

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
    const formatTime12 = (t) => {
      if (!t) return "TBD";
      const s = String(t).trim();
      if (/am|pm/i.test(s)) return s;
      const parts = s.split(":");
      if (parts.length < 2) return s;
      let h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return s;
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12;
      if (h === 0) h = 12;
      return `${h < 10 ? "0" + h : h}:${m < 10 ? "0" + m : m} ${ampm}`;
    };

    const timeFormatted = `${formatTime12(duty?.startTime)} - ${formatTime12(duty?.endTime)}`;
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

    return { success: true, status: "SENT_ACCEPTED" };
  } catch (err) {
    console.error("Failed to dispatch duty assignment notification:", err);
    return { success: false, status: "FAILED", error: err.message };
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

    return { success: true, status: "SENT_ACCEPTED" };
  } catch (err) {
    console.error("Failed to notify manager:", err);
    return { success: false, status: "FAILED", error: err.message };
  }
};

// ==========================================
// RESEND STOCK NOTIFICATIONS FOR MANAGERS
// ==========================================

/**
 * Dispatches an email notification to company managers when a staff member
 * reserves / holds stock from the master inventory via Resend.
 *
 * @param {Object} params
 * @param {Object} params.staff - Staff user details (name, email)
 * @param {Object} params.stockItem - Stock item details (name, sku, category, unit)
 * @param {number} params.quantity - Quantity held
 * @param {Object} [params.event] - Associated event details
 * @param {string} [params.notes] - Staff notes or operational purpose
 * @param {Date|string} [params.expectedDate] - Expected return/usage date
 * @returns {Promise<Object>} Notification delivery result
 */
const sendStockHoldNotificationToManager = async ({
  staff,
  stockItem,
  quantity,
  event,
  notes,
  expectedDate,
}) => {
  const managerEmail = getManagerEmail();
  const staffName = staff?.name || "Staff Member";
  const staffEmail = staff?.email || "staff@pircello.com";
  const itemName = stockItem?.name || "Stock Item";
  const itemSku = stockItem?.sku || "N/A";
  const itemCategory = stockItem?.category || "Equipment";
  const unit = stockItem?.unit || "pcs";
  const eventName = event?.eventName || "General Staff Operations";
  const holdNotes = notes ? notes.trim() : "None provided";
  const expectedFormatted = expectedDate
    ? new Date(expectedDate).toLocaleDateString("en-IN", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Not specified";
  const timestampFormatted = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const managerStockUrl = getManagerStockUrl();

  // Subject line
  const subject = `📦 Stock Hold Alert: ${quantity} ${unit} of "${itemName}" reserved by ${staffName}`;

  // Plain-text alternative
  const text = [
    `PIRCELLO STOCK MANAGEMENT - MANAGER NOTIFICATION`,
    `================================================`,
    `Stock Hold Alert: Item Reserved from Warehouse Inventory`,
    ``,
    `Item: ${itemName} (${itemCategory}, SKU: ${itemSku})`,
    `Quantity Reserved: ${quantity} ${unit}`,
    `Staff Member: ${staffName} <${staffEmail}>`,
    `Operational Purpose / Event: ${eventName}`,
    `Expected Date: ${expectedFormatted}`,
    `Staff Notes: ${holdNotes}`,
    `Timestamp: ${timestampFormatted}`,
    ``,
    managerStockUrl ? `Manager Portal: ${managerStockUrl}` : `Please check your manager dashboard to view or manage allocations.`,
    `================================================`,
  ].join("\n");

  // Rich HTML template with strict escaping for all dynamic user/data strings
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #c7d2fe; display: block; margin-bottom: 4px;">Pircello Inventory System</span>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">📦 Stock Hold Notification</h1>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="background-color: rgba(255, 255, 255, 0.2); color: #ffffff; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">Hold Placed</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Hello Manager,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Staff member <strong style="color: #ffffff;">${escapeHtml(staffName)}</strong> (<a href="mailto:${escapeHtml(staffEmail)}" style="color: #818cf8; text-decoration: none;">${escapeHtml(staffEmail)}</a>) has placed a stock hold reservation from warehouse inventory.
              </p>

              <!-- Stock Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; border-radius: 8px; border: 1px solid #334155; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #1e293b; width: 35%; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Item Name</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #1e293b; color: #f8fafc; font-size: 15px; font-weight: 600;">${escapeHtml(itemName)}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Category / SKU</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #e2e8f0; font-size: 14px;">${escapeHtml(itemCategory)} <span style="color: #64748b; font-size: 12px;">(${escapeHtml(itemSku)})</span></td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Quantity Held</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #38bdf8; font-size: 16px; font-weight: 700;">${escapeHtml(String(quantity))} ${escapeHtml(unit)}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Event / Purpose</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #e2e8f0; font-size: 14px;">${escapeHtml(eventName)}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Expected Usage</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #e2e8f0; font-size: 14px;">${escapeHtml(expectedFormatted)}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Staff Notes</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #cbd5e1; font-size: 14px; font-style: italic;">${escapeHtml(holdNotes)}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Time</td>
                  <td style="padding: 14px 20px; color: #64748b; font-size: 13px;">${escapeHtml(timestampFormatted)}</td>
                </tr>
              </table>

              <!-- Call to Action -->
              ${
                managerStockUrl
                  ? `
              <div style="text-align: center; margin: 32px 0 16px 0;">
                <a href="${escapeHtml(managerStockUrl)}" style="display: inline-block; background: #6366f1; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 600; border-radius: 6px; text-decoration: none; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">
                  View Stock in Manager Dashboard &rarr;
                </a>
              </div>
              `
                  : ""
              }

              <p style="margin: 20px 0 0 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                Inventory quantities have been updated atomically. The reserved quantity will remain allocated until staff check out or release the hold.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0b1120; border-top: 1px solid #334155; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                Pircello Event Management System &bull; Stock Operations &bull; Automated Manager Alert
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  // Validate Resend client
  const resend = getResendClient();
  if (!resend) {
    console.warn(
      "[Resend Notification] RESEND_API_KEY is not configured. Email dispatch skipped for stock hold notification."
    );
    return {
      success: false,
      status: "SKIPPED_NOT_CONFIGURED",
      reason: "RESEND_API_KEY is not configured",
      recipient: managerEmail,
    };
  }

  const fromAddress = getEmailFrom();

  try {
    const response = await resend.emails.send({
      from: fromAddress,
      to: [managerEmail],
      subject,
      text,
      html,
    });

    if (response.error) {
      console.error(
        "[Resend Notification] Provider error sending stock hold notification:",
        response.error.message || response.error
      );
      return {
        success: false,
        status: "FAILED",
        error: response.error.message || "Provider error",
        recipient: managerEmail,
      };
    }

    const messageId = response.data?.id || "accepted";
    console.log(
      `[Resend Notification] Stock hold notification email accepted by provider. Message ID: ${messageId} (Recipient: ${managerEmail})`
    );

    return {
      success: true,
      status: "SENT_ACCEPTED",
      messageId,
      recipient: managerEmail,
    };
  } catch (err) {
    console.error(
      "[Resend Notification] Failed to dispatch stock hold email via Resend:",
      err.message
    );
    return {
      success: false,
      status: "FAILED",
      error: err.message,
      recipient: managerEmail,
    };
  }
};

/**
 * Dispatches an email notification to company managers when staff returns stock.
 * Includes complete condition breakdown (Good Condition, Damaged, Lost) and return notes.
 *
 * @param {Object} params
 * @param {Object} params.staff - Staff user details (name, email)
 * @param {Object} params.stockItem - Stock item details (name, sku, category, unit)
 * @param {number} params.returnedQuantity - Quantity returned in good condition
 * @param {number} [params.damagedQuantity=0] - Quantity marked damaged
 * @param {number} [params.lostQuantity=0] - Quantity marked lost
 * @param {string} [params.notes] - Return notes or damage/loss reasons
 * @returns {Promise<Object>} Notification delivery result
 */
const sendStockReturnNotificationToManager = async ({
  staff,
  stockItem,
  returnedQuantity = 0,
  damagedQuantity = 0,
  lostQuantity = 0,
  notes,
}) => {
  const managerEmail = getManagerEmail();
  const staffName = staff?.name || "Staff Member";
  const staffEmail = staff?.email || "staff@pircello.com";
  const itemName = stockItem?.name || "Stock Item";
  const itemSku = stockItem?.sku || "N/A";
  const itemCategory = stockItem?.category || "Equipment";
  const unit = stockItem?.unit || "pcs";
  const returnNotes = notes ? notes.trim() : "None provided";
  const timestampFormatted = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const managerStockUrl = getManagerStockUrl();
  const totalItemsProcessed = (Number(returnedQuantity) || 0) + (Number(damagedQuantity) || 0) + (Number(lostQuantity) || 0);

  // Subject line
  const subject = `🔄 Stock Return Alert: ${staffName} returned ${totalItemsProcessed} ${unit} for "${itemName}"`;

  // Plain-text alternative
  const text = [
    `PIRCELLO STOCK MANAGEMENT - MANAGER NOTIFICATION`,
    `================================================`,
    `Stock Return Alert: Items Returned to Inventory`,
    ``,
    `Item: ${itemName} (${itemCategory}, SKU: ${itemSku})`,
    `Staff Member: ${staffName} <${staffEmail}>`,
    ``,
    `Return Condition Breakdown:`,
    `- Good Condition (Restocked): ${returnedQuantity} ${unit}`,
    damagedQuantity > 0 ? `- ⚠️ Damaged: ${damagedQuantity} ${unit}` : `- Damaged: 0 ${unit}`,
    lostQuantity > 0 ? `- ⚠️ Lost: ${lostQuantity} ${unit}` : `- Lost: 0 ${unit}`,
    ``,
    `Staff Return Notes: ${returnNotes}`,
    `Timestamp: ${timestampFormatted}`,
    ``,
    managerStockUrl ? `Manager Portal: ${managerStockUrl}` : `Please check your manager dashboard for return verification.`,
    `================================================`,
  ].join("\n");

  // Rich HTML template with strict escaping
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #99f6e4; display: block; margin-bottom: 4px;">Pircello Inventory System</span>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">🔄 Stock Return Notification</h1>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="background-color: rgba(255, 255, 255, 0.2); color: #ffffff; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">Return Submitted</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Hello Manager,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Staff member <strong style="color: #ffffff;">${escapeHtml(staffName)}</strong> (<a href="mailto:${escapeHtml(staffEmail)}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(staffEmail)}</a>) has submitted returned stock for inventory reconciliation.
              </p>

              <!-- Stock Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; border-radius: 8px; border: 1px solid #334155; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #1e293b; width: 35%; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Item Name</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #1e293b; color: #f8fafc; font-size: 15px; font-weight: 600;">${escapeHtml(itemName)}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Category / SKU</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #e2e8f0; font-size: 14px;">${escapeHtml(itemCategory)} <span style="color: #64748b; font-size: 12px;">(${escapeHtml(itemSku)})</span></td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Good Condition</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #4ade80; font-size: 15px; font-weight: 700;">${escapeHtml(String(returnedQuantity))} ${escapeHtml(unit)} <span style="color: #64748b; font-weight: 400; font-size: 12px;">(Restocked)</span></td>
                </tr>
                ${
                  damagedQuantity > 0
                    ? `
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #fbbf24; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">⚠️ Damaged</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #fbbf24; font-size: 15px; font-weight: 700;">${escapeHtml(String(damagedQuantity))} ${escapeHtml(unit)}</td>
                </tr>
                `
                    : ""
                }
                ${
                  lostQuantity > 0
                    ? `
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #f87171; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">⚠️ Lost</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #f87171; font-size: 15px; font-weight: 700;">${escapeHtml(String(lostQuantity))} ${escapeHtml(unit)}</td>
                </tr>
                `
                    : ""
                }
                <tr>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Staff Return Notes</td>
                  <td style="padding: 14px 20px; border-bottom: 1px solid #1e293b; color: #cbd5e1; font-size: 14px; font-style: italic;">${escapeHtml(returnNotes)}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Timestamp</td>
                  <td style="padding: 14px 20px; color: #64748b; font-size: 13px;">${escapeHtml(timestampFormatted)}</td>
                </tr>
              </table>

              <!-- Call to Action -->
              ${
                managerStockUrl
                  ? `
              <div style="text-align: center; margin: 32px 0 16px 0;">
                <a href="${escapeHtml(managerStockUrl)}" style="display: inline-block; background: #0284c7; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 600; border-radius: 6px; text-decoration: none; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);">
                  Open Manager Stock Dashboard &rarr;
                </a>
              </div>
              `
                  : ""
              }

              <p style="margin: 20px 0 0 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                Stock levels have been safely updated. Good items are available for new bookings. Any reported damage or loss has been recorded in the audit trail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0b1120; border-top: 1px solid #334155; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                Pircello Event Management System &bull; Stock Operations &bull; Automated Manager Alert
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  // Validate Resend client
  const resend = getResendClient();
  if (!resend) {
    console.warn(
      "[Resend Notification] RESEND_API_KEY is not configured. Email dispatch skipped for stock return notification."
    );
    return {
      success: false,
      status: "SKIPPED_NOT_CONFIGURED",
      reason: "RESEND_API_KEY is not configured",
      recipient: managerEmail,
    };
  }

  const fromAddress = getEmailFrom();

  try {
    const response = await resend.emails.send({
      from: fromAddress,
      to: [managerEmail],
      subject,
      text,
      html,
    });

    if (response.error) {
      console.error(
        "[Resend Notification] Provider error sending stock return notification:",
        response.error.message || response.error
      );
      return {
        success: false,
        status: "FAILED",
        error: response.error.message || "Provider error",
        recipient: managerEmail,
      };
    }

    const messageId = response.data?.id || "accepted";
    console.log(
      `[Resend Notification] Stock return notification email accepted by provider. Message ID: ${messageId} (Recipient: ${managerEmail})`
    );

    return {
      success: true,
      status: "SENT_ACCEPTED",
      messageId,
      recipient: managerEmail,
    };
  } catch (err) {
    console.error(
      "[Resend Notification] Failed to dispatch stock return email via Resend:",
      err.message
    );
    return {
      success: false,
      status: "FAILED",
      error: err.message,
      recipient: managerEmail,
    };
  }
};

module.exports = {
  escapeHtml,
  getResendClient,
  setResendClientForTesting,
  sendDutyAssignmentNotification,
  sendDutyResponseNotificationToManager,
  sendStockHoldNotificationToManager,
  sendStockReturnNotificationToManager,
};
