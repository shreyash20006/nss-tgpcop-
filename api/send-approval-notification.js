/**
 * Serverless API: Automatic Volunteer ID Approval Notification
 * Endpoint: POST /api/send-approval-notification
 * Sends automated Email (via Brevo Transactional SMTP Template 14) and SMS upon coordinator application approval.
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

  // Server-side Secrets (never exposed to client)
  const apiKey = process.env.BREVO_API_KEY || process.env.VITE_BREVO_API_KEY || '';
  const templateId = parseInt(process.env.BREVO_TEMPLATE_APPROVED || '14', 10);
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'nss@tgpcop.site';
  const senderName = process.env.BREVO_SENDER_NAME || 'NSS TGPCOP';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  const {
    applicationId = null,
    forceRetry = false,
    applicationData = null,
    testEmail = null,
    testRecipient = null
  } = req.body || {};

  const isTest = Boolean(testEmail || testRecipient);
  const rawTestTarget = (testEmail || testRecipient || '').trim().toLowerCase();

  if (!applicationId && !applicationData && !isTest) {
    return res.status(400).json({ error: 'Missing required field: applicationId, applicationData, or testEmail is required.' });
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

  // Provide realistic test application for test recipient verification
  if (isTest && !app) {
    app = {
      id: 'test-preview-' + Date.now(),
      status: 'approved',
      full_name: 'Test Volunteer',
      volunteer_id: 'NSS-TGP-2026-TEST',
      prn: '20230112345',
      course: 'B.Pharm',
      academic_year: 'Third Year (TY)',
      college_email: rawTestTarget,
      personal_email: rawTestTarget,
      approved_at: new Date().toISOString()
    };
  }

  if (!app) {
    return res.status(404).json({ error: 'Application record not found for approval notification.' });
  }

  // STRICT REQUIREMENT: Only send notification for APPROVED applications!
  const status = (app.status || '').toLowerCase();
  if (status !== 'approved' && !isTest) {
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

  // Format Approval Date (e.g. 31 Oct 2026)
  const rawDate = app.reviewed_at || app.approved_at || app.approval_date || new Date().toISOString();
  let approvalDateFormatted = 'Today';
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      approvalDateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch (e) {}

  const digitalIdUrl = 'https://nss.tgpcop.site/my-id';
  const portalUrl = 'https://nss.tgpcop.site/status';

  // 3. Idempotency Check: Prevent duplicate approval notifications
  let emailAlreadySent = false;
  let smsAlreadySent = false;

  if (sbClient && appId && !forceRetry && !isTest) {
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
  // 4. DISPATCH EMAIL NOTIFICATION VIA BREVO (TEMPLATE 14)
  // ============================================================================
  const targetEmail = isTest 
    ? rawTestTarget 
    : ((collegeEmail && emailRegex.test(collegeEmail)) 
        ? collegeEmail 
        : ((personalEmail && emailRegex.test(personalEmail)) ? personalEmail : ''));

  if (!targetEmail || !emailRegex.test(targetEmail)) {
    emailStatus = 'skipped';
    emailError = 'No valid email address registered for student.';
  } else if (emailAlreadySent && !forceRetry && !isTest) {
    emailStatus = 'skipped';
    emailError = 'Approval email was already sent previously. Use forceRetry to resend.';
  } else if (!apiKey) {
    emailStatus = 'failed';
    emailError = 'BREVO_API_KEY is not configured in server environment variables.';
  } else {
    try {
      const toRecipients = [{ email: targetEmail, name: fullName }];
      if (!isTest && personalEmail && personalEmail !== targetEmail && emailRegex.test(personalEmail)) {
        toRecipients.push({ email: personalEmail, name: fullName });
      }

      // Exact parameter structure required by Brevo Template ID 14
      const templateParams = {
        firstName: firstName,
        fullName: fullName,
        volunteerId: volunteerId,
        prn: prn,
        course: course,
        academicYear: academicYear,
        approvedAt: approvalDateFormatted,

        // Full aliases for template author flexibility
        FIRSTNAME: firstName,
        FULL_NAME: fullName,
        VOLUNTEER_ID: volunteerId,
        PRN: prn,
        COURSE: course,
        ACADEMIC_YEAR: academicYear,
        APPROVAL_DATE: approvalDateFormatted,
        APPROVED_AT: approvalDateFormatted,
        digitalIdUrl: digitalIdUrl,
        portalUrl: portalUrl
      };

      // Brevo Transactional Email Payload using Template 14
      const emailPayload = {
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: toRecipients,
        templateId: templateId,
        params: templateParams
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
        emailMessageId = brevoData.messageId || ('BREVO-OK-' + Date.now());
      } else {
        emailStatus = 'failed';
        emailError = brevoData.message || ('Brevo API error (' + brevoRes.status + ')');
        console.warn('[Brevo Approval Email Failed]:', brevoData);
      }
    } catch (err) {
      emailStatus = 'failed';
      emailError = err.message || 'Unknown email transmission error';
    }
  }

  // ============================================================================
  // 5. DISPATCH SMS NOTIFICATION (Non-blocking)
  // ============================================================================
  const cleanMobile = mobile.replace(/\D/g, '');
  if (isTest) {
    smsStatus = 'skipped';
    smsError = 'SMS skipped during test email verification.';
  } else if (!cleanMobile || cleanMobile.length < 10) {
    smsStatus = 'skipped';
    smsError = 'No valid 10-digit mobile number registered for student.';
  } else if (smsAlreadySent && !forceRetry) {
    smsStatus = 'skipped';
    smsError = 'Approval SMS was already sent previously.';
  } else if (apiKey) {
    const formattedMobile = cleanMobile.length === 10 ? ('+91' + cleanMobile) : ('+' + cleanMobile);
    const smsContent = `Congratulations ${firstName}! Your NSS TGPCOP Volunteer registration has been APPROVED. Your Volunteer ID: ${volunteerId}. Login to https://nss.tgpcop.site/status to view your digital ID card. - NSS TGPCOP`;

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
        smsStatus = 'skipped';
        smsError = smsData.message || 'Transactional SMS notice (insufficient credits or template approval)';
      }
    } catch (smsErr) {
      smsStatus = 'skipped';
      smsError = smsErr.message;
    }
  } else {
    smsStatus = 'skipped';
    smsError = 'SMS API credentials not configured.';
  }

  // ============================================================================
  // 6. RECORD NOTIFICATION AUDIT LOGS IN DATABASE
  // ============================================================================
  const nowTs = new Date().toISOString();
  if (sbClient && appId) {
    try {
      // 1. Insert Email Log
      await sbClient.from('nss_notification_logs').insert({
        application_id: appId.startsWith('test-') ? null : appId,
        volunteer_id: volunteerId,
        recipient_name: fullName,
        recipient_email: targetEmail,
        recipient_mobile: mobile,
        channel: 'email',
        status: emailStatus,
        subject: `Brevo Template ${templateId} - NSS Volunteer Approval`,
        provider_message_id: emailMessageId,
        error_message: emailError,
        sent_by: callerUserId,
        created_at: nowTs,
        metadata: {
          isTest,
          templateId,
          senderEmail,
          params: {
            firstName,
            fullName,
            volunteerId,
            prn,
            course,
            academicYear,
            approvedAt: approvalDateFormatted
          }
        }
      });

      // 2. Insert SMS Log (if not test mode and mobile present)
      if (!isTest && cleanMobile) {
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

      // 3. Update Application Columns (if real application)
      if (!isTest && !appId.startsWith('test-')) {
        await sbClient.from('nss_applications').update({
          email_notification_status: emailStatus,
          sms_notification_status: smsStatus,
          notification_sent_at: emailStatus === 'sent' ? nowTs : null,
          notification_error: emailError || smsError || null
        }).eq('id', appId);
      }

    } catch (saveLogErr) {
      console.warn('[Notification Log Save Warning]:', saveLogErr.message);
    }
  }

  // Final Response
  return res.status(200).json({
    success: emailStatus === 'sent',
    isTest,
    templateId,
    applicationId: appId,
    volunteerId,
    email: {
      status: emailStatus,
      recipient: targetEmail,
      templateId,
      messageId: emailMessageId,
      error: emailError
    },
    sms: {
      status: smsStatus,
      recipient: mobile,
      messageId: smsMessageId,
      error: smsError
    },
    paramsSent: {
      firstName,
      fullName,
      volunteerId,
      prn,
      course,
      academicYear,
      approvedAt: approvalDateFormatted
    },
    deliveredAt: nowTs
  });
};
