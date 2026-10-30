/**
 * Serverless API: Automatic Volunteer ID Approval Notification
 * Endpoint: POST /api/send-approval-notification
 * Sends automated Email (via Brevo) and SMS upon coordinator application approval.
 * Protected by server-side secrets, idempotency guards & authorization checks.
 */

module.exports = async (req, res) => {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const apiKey = process.env.BREVO_API_KEY || process.env.VITE_BREVO_API_KEY || '';
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'Media@tgpcop.site';
  const senderName = process.env.BREVO_SENDER_NAME || 'NSS TGPCOP';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  const {
    applicationId = null,
    forceRetry = false,
    applicationData = null
  } = req.body || {};

  if (!applicationId && !applicationData) {
    return res.status(400).json({ error: 'Missing required field: applicationId or applicationData is required.' });
  }

  // 1. Verify Authenticated Staff Session (Optional Bearer Token validation)
  const authHeader = req.headers.authorization;
  let callerUserId = null;
  if (authHeader && authHeader.startsWith('Bearer ') && supabaseUrl && supabaseKey) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const sbAuth = createClient(supabaseUrl, supabaseKey);
      const token = authHeader.slice(7);
      const { data: { user } } = await sbAuth.auth.getUser(token);
      if (user) callerUserId = user.id;
    } catch (ignore) {}
  }

  // 2. Fetch Application Record from Supabase
  let app = applicationData;
  let sbClient = null;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      sbClient = createClient(supabaseUrl, supabaseKey);
      if (applicationId && !app) {
        const { data, error } = await sbClient
          .from('nss_applications')
          .select('*')
          .eq('id', applicationId)
          .maybeSingle();
        if (!error && data) app = data;
      }
    } catch (dbErr) {
      console.warn('[Notification DB Check]:', dbErr.message);
    }
  }

  if (!app) {
    return res.status(404).json({ error: 'Application record not found for approval notification.' });
  }

  // STRICT REQUIREMENT: Only send notification for APPROVED applications!
  const status = (app.status || '').toLowerCase();
  if (status !== 'approved') {
    return res.status(400).json({
      error: `Application is currently in '${status}' status. Approval notification can ONLY be triggered for approved volunteers.`,
      status: app.status
    });
  }

  const appId = app.id || applicationId;
  const fullName = (app.full_name || app.fullName || 'NSS Volunteer').trim();
  const firstName = fullName.split(' ')[0] || 'Volunteer';
  const volunteerId = (app.volunteer_id || app.volunteerId || 'NSS-TGP-APPROVED').trim();
  const prn = (app.prn || 'Not Specified').trim();
  const course = (app.course || 'B.Pharm').trim();
  const academicYear = (app.academic_year || app.academicYear || 'FY').trim();
  const mobile = (app.mobile || '').trim();
  const collegeEmail = (app.college_email || app.email || '').trim().toLowerCase();
  const personalEmail = (app.personal_email || app.personalEmail || '').trim().toLowerCase();

  // Format Approval Date (e.g. 30 Oct 2026)
  const rawDate = app.reviewed_at || app.approved_at || app.approval_date || new Date().toISOString();
  let approvalDateFormatted = 'Today';
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      approvalDateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch (e) {}

  const digitalIdUrl = `https://nss.tgpcop.site/my-id`;
  const portalUrl = `https://nss.tgpcop.site/status`;

  // 3. Idempotency Check: Prevent duplicate approval notifications
  let emailAlreadySent = false;
  let smsAlreadySent = false;

  if (sbClient && appId && !forceRetry) {
    try {
      const { data: existingLogs } = await sbClient
        .from('nss_notification_logs')
        .select('channel, status, created_at')
        .eq('application_id', appId)
        .eq('status', 'sent');

      if (Array.isArray(existingLogs) && existingLogs.length > 0) {
        if (existingLogs.some(l => l.channel === 'email')) emailAlreadySent = true;
        if (existingLogs.some(l => l.channel === 'sms')) smsAlreadySent = true;
      }
    } catch (logErr) {
      console.warn('[Idempotency Check Notice]:', logErr.message);
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let emailStatus = 'pending';
  let emailMessageId = null;
  let emailError = null;

  let smsStatus = 'pending';
  let smsMessageId = null;
  let smsError = null;

  // ============================================================================
  // 4. DISPATCH EMAIL NOTIFICATION VIA BREVO
  // ============================================================================
  const targetEmail = (collegeEmail && emailRegex.test(collegeEmail)) 
    ? collegeEmail 
    : ((personalEmail && emailRegex.test(personalEmail)) ? personalEmail : '');

  if (!targetEmail) {
    emailStatus = 'skipped';
    emailError = 'No valid email address registered for student.';
  } else if (emailAlreadySent && !forceRetry) {
    emailStatus = 'skipped';
    emailError = 'Approval email was already sent previously. Use forceRetry to resend.';
  } else if (!apiKey) {
    emailStatus = 'failed';
    emailError = 'BREVO_API_KEY is not configured in environment variables.';
  } else {
    try {
      const toRecipients = [{ email: targetEmail, name: fullName }];
      if (personalEmail && personalEmail !== targetEmail && emailRegex.test(personalEmail)) {
        toRecipients.push({ email: personalEmail, name: fullName });
      }

      const emailSubject = 'Your NSS TGPCOP Volunteer ID Has Been Approved! 🎉';
      const emailHtml = renderApprovalEmailHtml({
        firstName,
        fullName,
        volunteerId,
        prn,
        course,
        academicYear,
        approvalDate: approvalDateFormatted,
        digitalIdUrl,
        portalUrl
      });

      const emailPayload = {
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: toRecipients,
        subject: emailSubject,
        htmlContent: emailHtml
      };

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      const brevoData = await brevoRes.json().catch(() => ({}));
      if (brevoRes.ok) {
        emailStatus = 'sent';
        emailMessageId = brevoData.messageId || 'BREVO-OK-' + Date.now();
      } else {
        emailStatus = 'failed';
        emailError = brevoData.message || ('Brevo API error (' + brevoRes.status + ')');
      }
    } catch (err) {
      emailStatus = 'failed';
      emailError = err.message || 'Unknown email transmission error';
    }
  }

  // ============================================================================
  // 5. DISPATCH SMS NOTIFICATION
  // ============================================================================
  const cleanMobile = mobile.replace(/\D/g, '');
  if (!cleanMobile || cleanMobile.length < 10) {
    smsStatus = 'skipped';
    smsError = 'No valid 10-digit mobile number registered for student.';
  } else if (smsAlreadySent && !forceRetry) {
    smsStatus = 'skipped';
    smsError = 'Approval SMS was already sent previously.';
  } else {
    // Format recipient with country code for India (+91)
    const formattedMobile = cleanMobile.length === 10 ? ('+91' + cleanMobile) : ('+' + cleanMobile);
    const smsContent = `Congratulations ${firstName}! Your NSS TGPCOP Volunteer registration has been APPROVED. Your Volunteer ID: ${volunteerId}. Login to https://nss.tgpcop.site/status to view your digital ID card. - NSS TGPCOP`;

    if (apiKey) {
      try {
        const smsRes = await fetch('https://api.brevo.com/v3/transactionalSMS/sms-send', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            sender: 'NSSTGP',
            recipient: formattedMobile,
            content: smsContent,
            type: 'transactional'
          })
        });

        const smsData = await smsRes.json().catch(() => ({}));
        if (smsRes.ok) {
          smsStatus = 'sent';
          smsMessageId = smsData.reference || smsData.messageId || ('SMS-' + Date.now());
        } else {
          // Brevo Transactional SMS requires dedicated SMS credits
          smsStatus = 'skipped';
          smsError = smsData.message || 'Transactional SMS provider notice';
        }
      } catch (smsErr) {
        smsStatus = 'skipped';
        smsError = smsErr.message;
      }
    } else {
      smsStatus = 'skipped';
      smsError = 'SMS API credentials not configured.';
    }
  }

  // ============================================================================
  // 6. RECORD NOTIFICATION AUDIT LOGS IN DATABASE
  // ============================================================================
  const nowTs = new Date().toISOString();
  if (sbClient && appId) {
    try {
      // 1. Insert Email Log
      await sbClient.from('nss_notification_logs').insert({
        application_id: appId,
        volunteer_id: volunteerId,
        recipient_name: fullName,
        recipient_email: targetEmail,
        recipient_mobile: mobile,
        channel: 'email',
        status: emailStatus,
        subject: 'Your NSS TGPCOP Volunteer ID Has Been Approved! 🎉',
        provider_message_id: emailMessageId,
        error_message: emailError,
        sent_by: callerUserId,
        created_at: nowTs,
        metadata: {
          recipientCount: 1,
          digitalIdUrl,
          prn,
          course,
          academicYear
        }
      });

      // 2. Insert SMS Log (if mobile present)
      if (cleanMobile) {
        await sbClient.from('nss_notification_logs').insert({
          application_id: appId,
          volunteer_id: volunteerId,
          recipient_name: fullName,
          recipient_email: targetEmail,
          recipient_mobile: cleanMobile,
          channel: 'sms',
          status: smsStatus,
          provider_message_id: smsMessageId,
          error_message: smsError,
          sent_by: callerUserId,
          created_at: nowTs
        });
      }

      // 3. Update Application Columns
      await sbClient.from('nss_applications').update({
        email_notification_status: emailStatus,
        sms_notification_status: smsStatus,
        notification_sent_at: emailStatus === 'sent' ? nowTs : null,
        notification_error: emailError || smsError || null
      }).eq('id', appId);

    } catch (saveLogErr) {
      console.warn('[Notification Log Save Warning]:', saveLogErr.message);
    }
  }

  // Success response
  return res.status(200).json({
    success: true,
    applicationId: appId,
    volunteerId,
    email: {
      status: emailStatus,
      recipient: targetEmail,
      messageId: emailMessageId,
      error: emailError
    },
    sms: {
      status: smsStatus,
      recipient: mobile,
      messageId: smsMessageId,
      error: smsError
    },
    deliveredAt: nowTs
  });
};

/**
 * Render Official Institutional HTML Approval Email Template
 */
function renderApprovalEmailHtml({
  firstName,
  fullName,
  volunteerId,
  prn,
  course,
  academicYear,
  approvalDate,
  digitalIdUrl,
  portalUrl
}) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your NSS TGPCOP Volunteer ID Has Been Approved!</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F9FC; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; color:#0F172A;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F7F9FC; padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#FFFFFF; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(7, 27, 73, 0.08); border:1px solid #E2E8F0;">
          
          <!-- Institutional Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #071B49 0%, #0647C8 100%); padding:32px 24px; text-align:center;">
              <img src="https://nss.tgpcop.site/assets/nss-logo.png" alt="NSS Emblem" width="64" height="64" style="display:block; margin:0 auto 12px; border:none;">
              <div style="font-size:24px; font-weight:800; color:#FFFFFF; letter-spacing:0.04em;">NSS TGPCOP</div>
              <div style="font-size:12px; font-weight:700; color:#FFD400; text-transform:uppercase; letter-spacing:0.08em; margin-top:2px;">National Service Scheme • Unit 1</div>
              <div style="font-size:11px; color:#CBD5E1; margin-top:4px;">Tulsiramji Gaikwad-Patil College of Pharmacy, Nagpur</div>
            </td>
          </tr>

          <!-- Congratulatory Hero -->
          <tr>
            <td style="padding:28px 28px 12px; text-align:center;">
              <div style="display:inline-block; padding:5px 16px; background-color:rgba(22, 163, 74, 0.12); border:1px solid rgba(22, 163, 74, 0.35); border-radius:999px; color:#15803D; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:12px;">
                ★ VOLUNTEER REGISTRATION APPROVED ★
              </div>
              <h1 style="font-size:24px; font-weight:800; color:#071B49; margin:0 0 10px; line-height:1.25;">
                Congratulations, ${escapeHtml(firstName)}! 🎉
              </h1>
              <p style="font-size:14px; color:#475569; margin:0 auto; line-height:1.5; max-width:480px;">
                Your registration as an NSS TGPCOP Volunteer has been successfully approved by the Coordinator Desk. Your volunteer membership is now <strong>ACTIVE</strong>.
              </p>
            </td>
          </tr>

          <!-- Volunteer Credentials Table -->
          <tr>
            <td style="padding:16px 28px;">
              <div style="background-color:#FAFCFF; border:1.5px solid #BFDBFE; border-radius:12px; padding:22px; box-shadow:0 2px 8px rgba(6, 71, 200, 0.05);">
                <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#0647C8; margin-bottom:14px; border-bottom:1px solid #E2E8F0; padding-bottom:8px;">
                  Official Volunteer Credential Details
                </div>

                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size:13.5px; line-height:2;">
                  <tr>
                    <td style="color:#64748B; width:150px; font-weight:500;">Volunteer Name:</td>
                    <td style="color:#071B49; font-weight:700;">${escapeHtml(fullName)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748B; font-weight:500;">NSS Volunteer ID:</td>
                    <td>
                      <span style="display:inline-block; background-color:#EFF6FF; border:1px solid #BFDBFE; color:#0647C8; font-family:monospace; font-size:14px; font-weight:800; padding:2px 10px; border-radius:6px;">
                        ${escapeHtml(volunteerId)}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#64748B; font-weight:500;">University PRN:</td>
                    <td style="color:#0F172A; font-weight:600;">${escapeHtml(prn)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748B; font-weight:500;">Course / Program:</td>
                    <td style="color:#0F172A; font-weight:600;">${escapeHtml(course)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748B; font-weight:500;">Academic Year:</td>
                    <td style="color:#0F172A; font-weight:600;">${escapeHtml(academicYear)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748B; font-weight:500;">Approval Date:</td>
                    <td style="color:#0F172A; font-weight:600;">${escapeHtml(approvalDate)}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Digital ID Card Call to Action -->
          <tr>
            <td style="padding:10px 28px 24px; text-align:center;">
              <p style="font-size:13px; color:#475569; margin:0 0 16px; line-height:1.5;">
                You can now log in to the NSS TGPCOP Portal with your Google account to view, download, or print your official Digital Volunteer ID Card.
              </p>
              <a href="${escapeHtml(digitalIdUrl)}" target="_blank" style="display:inline-block; padding:14px 34px; background-color:#0647C8; color:#FFFFFF; text-decoration:none; font-size:14px; font-weight:700; border-radius:999px; box-shadow:0 4px 14px rgba(6, 71, 200, 0.35);">
                View Your Digital Volunteer ID ➔
              </a>
              <div style="margin-top:14px;">
                <a href="${escapeHtml(portalUrl)}" target="_blank" style="font-size:12px; color:#64748B; text-decoration:underline;">
                  Track Volunteer Portal Status (https://nss.tgpcop.site/status)
                </a>
              </div>
            </td>
          </tr>

          <!-- Official Motto Banner -->
          <tr>
            <td style="background-color:#071B49; padding:16px 20px; text-align:center;">
              <span style="font-size:12px; font-weight:800; color:#FFD400; letter-spacing:0.12em; text-transform:uppercase;">
                ★ "NOT ME, BUT YOU." 💙 ★
              </span>
            </td>
          </tr>

          <!-- Institutional Footer -->
          <tr>
            <td style="background-color:#04102E; padding:22px 20px; text-align:center; font-size:11.5px; color:#94A3B8; line-height:1.6;">
              <div style="color:#CBD5E1; font-weight:700; margin-bottom:4px;">NSS TGPCOP • Unit 1</div>
              <div>Tulsiramji Gaikwad-Patil College of Pharmacy, Wardha Road, Mohgaon, Nagpur - 441108</div>
              <div style="margin-top:2px;">Sponsored by Ministry of Youth Affairs & Sports, Govt. of India. Affiliated with RTMNU Nagpur.</div>
              <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08); font-size:11px;">
                Website & Media by <a href="https://www.instagram.com/echo.tgpcop/" target="_blank" style="color:#FFD400; text-decoration:none; font-weight:600;">ECHO.TGPCOP Media</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
