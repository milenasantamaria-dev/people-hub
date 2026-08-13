// ============================================================
// DAYBREAK AI — Referral Program Handler
//
// SETUP (Milena, do this in your own Google account):
// 1. SPREADSHEET_ID below is already set to your Referrals sheet
//    (docs.google.com/spreadsheets/d/10gkgbgns2TEUzdVAZK6-aIBTQXfsRStsT9eRFVJE0zY).
//    Submissions will go into a new "Referrals" tab inside it, created
//    automatically the first time someone submits.
// 2. Create a Google Drive folder for resumes (or reuse one you have),
//    open it, and copy its ID from the URL (the string after
//    /folders/). Replace RESUME_FOLDER_ID below with it.
// 3. Open that Referrals spreadsheet → Extensions → Apps Script.
// 4. Delete any starter code and paste this whole file in.
// 5. Deploy → New deployment → type "Web app" → Execute as "Me",
//    Who has access "Anyone" → Deploy. Copy the Web app URL it gives you.
// 6. Paste that URL into referrals.html, replacing
//    YOUR_GOOGLE_APPS_SCRIPT_URL_HERE for the APPS_URL constant.
//
// Note: the Role dropdown does NOT read from the spreadsheet above — it
// reads live from the Performance Review app's own spreadsheet (see
// ROLES_SPREADSHEET_ID below), so the active roles list is never
// duplicated or kept in sync by hand. Nothing to set up for that part,
// it already points at the right place.
// ============================================================

const NOTIFICATION_EMAIL = "milena.santamaria@daybreak.ai";
const ALLOWED_DOMAIN = "daybreak.ai";
const SPREADSHEET_ID = "10gkgbgns2TEUzdVAZK6-aIBTQXfsRStsT9eRFVJE0zY";
const SHEET_NAME = "Referrals";
const RESUME_FOLDER_ID = "1NPaIuIHCBE_ep5Lk4BSUaqn45W5yvmUt";

// Same spreadsheet the Performance Review (Breakcycle) app already reads
// active Breakers from, so the Role dropdown always matches its list.
const ROLES_SPREADSHEET_ID = "1qfaC3ImjSyNePQOzdiaAul_zZh07AAi812zRp695oXM";
const ROLES_SHEET_NAME = "Breakers";

const HEADERS = [
  "Timestamp",
  "Referrer Name",
  "Referrer Email",
  "Candidate Name",
  "Candidate Email",
  "Candidate Phone",
  "Role",
  "LinkedIn",
  "Resume Link",
  "How They Know Them",
  "Notes"
];

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Sends a 6 digit access code to the given email, same login mechanism as
// the Recruitment Request tool (in place of Google OAuth, which would need
// a Client ID set up in Google Cloud Console). The code lives in Apps
// Script's own cache, no sheet or third party service needed.
function handleSendCode(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
    return jsonOut({ success: false, error: "You must use a @" + ALLOWED_DOMAIN + " email" });
  }

  const cache = CacheService.getScriptCache();
  const throttleKey = "throttle_" + email;
  if (cache.get(throttleKey)) {
    return jsonOut({ success: false, error: "Please wait a few seconds before requesting another code." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put("code_" + email, code, 600); // expires in 10 minutes
  cache.put(throttleKey, "1", 30); // 30s throttle between sends

  MailApp.sendEmail({
    to: email,
    subject: "Your access code — Daybreak Referrals",
    body: "Your access code is: " + code + "\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, you can ignore this email."
  });

  return jsonOut({ success: true });
}

function handleVerifyCode(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const code = String(data.code || "").trim();
  if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
    return jsonOut({ success: false, error: "Invalid email." });
  }

  const cache = CacheService.getScriptCache();
  const stored = cache.get("code_" + email);
  if (!stored || stored !== code) {
    return jsonOut({ success: false, error: "Incorrect or expired code." });
  }

  cache.remove("code_" + email); // one-time use
  return jsonOut({ success: true, email: email });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === "sendCode") {
      return handleSendCode(data);
    }
    if (data.action === "verifyCode") {
      return handleVerifyCode(data);
    }

    // Defense in depth: the deployment itself is public (Apps Script can't
    // combine domain-restricted access with a page that reads the response
    // via fetch), so this rejects anything not tied to a @daybreak.ai
    // requester, in case the client-side login gate is ever bypassed. Same
    // pattern as the Recruitment Request script.
    if (!data.referrerEmail || !String(data.referrerEmail).toLowerCase().endsWith("@" + ALLOWED_DOMAIN)) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: "Unauthorized: referrer is not a @" + ALLOWED_DOMAIN + " account." }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setBackground("#39B15A");
      headerRange.setFontColor("#FFFFFF");
      headerRange.setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    const resumeLink = saveResume(data);

    const row = sheet.getLastRow() + 1;
    const range = sheet.getRange(row, 1, 1, HEADERS.length);
    // Plain text formatting alone does NOT stop Sheets from parsing a value
    // starting with +, -, =, or @ as a formula (a phone number like
    // "+1 555..." would come out as #ERROR!) — even when written via the
    // API. A leading apostrophe is what actually forces literal text, same
    // as when a person types it manually in the sheet.
    range.setNumberFormat("@");
    range.setValues([[
      textSafe(new Date().toLocaleString()),
      textSafe(data.referrerName),
      textSafe(data.referrerEmail),
      textSafe(data.candidateName),
      textSafe(data.candidateEmail),
      textSafe(data.candidatePhone),
      textSafe(data.role),
      textSafe(data.linkedin),
      textSafe(resumeLink),
      textSafe(data.relationship),
      textSafe(data.notes)
    ]]);

    sendEmailNotification(data, resumeLink);
    sendReferrerConfirmation(data);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Decodes the resume file (sent as base64 from referrals.html), saves it to
// Drive, and returns a shareable link. Returns "" if no file was attached.
function saveResume(data) {
  if (!data.resumeBase64) return "";

  const folder = DriveApp.getFolderById(RESUME_FOLDER_ID);
  const bytes = Utilities.base64Decode(data.resumeBase64);
  const blob = Utilities.newBlob(bytes, data.resumeMimeType || "application/octet-stream", data.resumeFileName || "resume");
  const fileName = (data.candidateName || "Candidate") + " Resume — " + (data.resumeFileName || "file");
  const file = folder.createFile(blob).setName(fileName);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// Small HTML table row used inside the notification email's detail card.
function detailRow(label, value) {
  return "<tr>" +
    "<td style=\"padding:5px 12px 5px 0;color:#667;font-size:12.5px;white-space:nowrap;vertical-align:top;\">" + escapeHtml(label) + "</td>" +
    "<td style=\"padding:5px 0;color:#1f2d24;font-size:13.5px;\">" + (value || "<span style=\"color:#aaa;\">—</span>") + "</td>" +
    "</tr>";
}

function sendEmailNotification(data, resumeLink) {
  const subject = "New Referral: " + (data.candidateName || "Candidate") + " from " + (data.referrerName || "a Breaker");
  const sheetLink = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit";
  const resumeCell = resumeLink
    ? "<a href=\"" + resumeLink + "\" style=\"color:#2DAA5A;\">View resume</a>"
    : null;
  const linkedinCell = data.linkedin
    ? "<a href=\"" + escapeHtml(data.linkedin) + "\" style=\"color:#2DAA5A;\">" + escapeHtml(data.linkedin) + "</a>"
    : null;

  const htmlBody =
    "<div style=\"font-family: sans-serif; color: #1f2d24; line-height: 1.5;\">" +
    "<p>Hi Mile,</p>" +
    "<p>A new referral just came in through the Referral Program.</p>" +
    "<div style=\"background:#F6F6F6;border:1px solid #E2E2E2;border-radius:10px;padding:14px 16px;margin:14px 0;\">" +
    "<div style=\"font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#39B15A;margin-bottom:6px;\">Referrer</div>" +
    "<table cellpadding=\"0\" cellspacing=\"0\" style=\"margin-bottom:14px;\">" +
    detailRow("Name", escapeHtml(data.referrerName)) +
    detailRow("Email", escapeHtml(data.referrerEmail)) +
    "</table>" +
    "<div style=\"font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#39B15A;margin-bottom:6px;\">Candidate</div>" +
    "<table cellpadding=\"0\" cellspacing=\"0\">" +
    detailRow("Name", escapeHtml(data.candidateName)) +
    detailRow("Email", escapeHtml(data.candidateEmail)) +
    detailRow("Phone", escapeHtml(data.candidatePhone)) +
    detailRow("Role", escapeHtml(data.role)) +
    detailRow("LinkedIn", linkedinCell) +
    detailRow("Resume", resumeCell) +
    detailRow("How they know them", escapeHtml(data.relationship)) +
    detailRow("Notes", escapeHtml(data.notes)) +
    "</table>" +
    "</div>" +
    "<p><a href=\"" + sheetLink + "\" style=\"background:#2DAA5A;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;\">View in Google Sheet</a></p>" +
    "<p style=\"font-size:12px;color:#667;\">Daybreak Referral Program</p>" +
    "</div>";

  MailApp.sendEmail({
    to: NOTIFICATION_EMAIL,
    subject: subject,
    htmlBody: htmlBody
  });
}

// Confirms receipt to the person who submitted the referral, so they know
// it went through and that they'll hear back as it moves forward.
function sendReferrerConfirmation(data) {
  if (!data.referrerEmail) return;

  const subject = "We received your referral for " + (data.candidateName || "your candidate");

  const htmlBody =
    "<div style=\"font-family: sans-serif; color: #1f2d24; line-height: 1.5;\">" +
    "<p>Hi " + escapeHtml(data.referrerName || "there") + ",</p>" +
    "<p>Thanks for referring <b>" + escapeHtml(data.candidateName || "your candidate") + "</b>! We have it now and the People Team will take a look.</p>" +
    "<div style=\"background:#E3F3EA;border:1px solid #bfe0cc;border-radius:8px;padding:14px 16px;font-size:13.5px;margin:12px 0;\">" +
    "We will let you know as it moves through the process." +
    "</div>" +
    "<p style=\"font-size:12px;color:#667;\">Daybreak Referral Program</p>" +
    "</div>";

  MailApp.sendEmail({
    to: data.referrerEmail,
    subject: subject,
    htmlBody: htmlBody
  });
}

// Prepends an apostrophe to values that would otherwise be misread as a
// formula by Sheets (leading +, -, =, or @), forcing literal text.
function textSafe(v) {
  const s = v == null ? "" : String(v);
  return /^[-+=@]/.test(s) ? "'" + s : s;
}

// Apps Script has no built-in HTML escaper, so this keeps free-text fields
// (names, notes, etc.) from breaking the email markup.
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
  });
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === "roles") {
    return ContentService
      .createTextOutput(JSON.stringify(getRoles()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ status: "Daybreak Referrals API is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Reads the Performance Review app's "Breakers" tab and returns the distinct
// list of roles currently held by active Breakers, for the Role dropdown on
// referrals.html. This is the same data Breakcycle itself uses, so the list
// is always current and never needs to be copied or maintained separately.
function getRoles() {
  const ss = SpreadsheetApp.openById(ROLES_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ROLES_SHEET_NAME);
  if (!sheet) {
    return { success: false, error: "Sheet '" + ROLES_SHEET_NAME + "' not found.", roles: [] };
  }

  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const roles = Array.from(new Set(
    rows.slice(1)
      .filter(r => String(r[idx.status] || "").toLowerCase() === "active")
      .map(r => String(r[idx.role] || "").trim())
      .filter(Boolean)
  )).sort();

  return { success: true, roles: roles };
}
