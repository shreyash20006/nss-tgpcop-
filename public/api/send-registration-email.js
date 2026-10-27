/**
 * Serverless API: Send Volunteer Registration Confirmation via Brevo
 * Endpoint: POST /api/send-registration-email
 * Protected by server-side BREVO_API_KEY environment variable
 */

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const apiKey = process.env.BREVO_API_KEY || process.env.VITE_BREVO_API_KEY || '';
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'Media@tgpcop.site';
  const senderName = process.env.BREVO_SENDER_NAME || 'NSS TGPCOP';

  const {
    fullName = '',
    email = '',
    personalEmail = '',
    rollNumber = '',
    course = '',
    academicYear = '',
    refCode = ''
  } = req.body || {};

  if (!email || !fullName) {
    return res.status(400).json({ error: 'Missing required fields: fullName and email are required.' });
  }

  if (!apiKey) {
    console.warn('[Brevo] BREVO_API_KEY is not configured in environment variables.');
    return res.status(200).json({
      success: false,
      warning: 'BREVO_API_KEY is not configured in Vercel Environment Variables. Please add it to enable automatic confirmation emails.',
      sent: false
    });
  }

  try {
    // 1. Sync Contact into Brevo Contacts List
    try {
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          attributes: {
            FULL_NAME: fullName,
            ROLL_NUMBER: rollNumber,
            COURSE: course,
            ACADEMIC_YEAR: academicYear,
            REF_CODE: refCode
          },
          updateEnabled: true
        })
      });
    } catch (contactErr) {
      console.warn('[Brevo] Contact sync notice:', contactErr.message);
    }

    // 2. Prepare Recipients
    const recipients = [{ email: email, name: fullName }];
    if (personalEmail && personalEmail !== email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
      recipients.push({ email: personalEmail, name: fullName });
    }

    // 3. Render HTML Email Template
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NSS Volunteer Registration Confirmation</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F9FC; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; color:#0F172A;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F7F9FC; padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#FFFFFF; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(7, 27, 73, 0.08); border:1px solid #E2E8F0;">
          <tr>
            <td style="background:linear-gradient(135deg, #071B49 0%, #0647C8 100%); padding:32px 24px; text-align:center;">
              <img src="https://nss.tgpcop.site/assets/nss-logo.png" alt="NSS Emblem" width="64" height="64" style="display:block; margin:0 auto 12px; border:none;">
              <div style="font-size:24px; font-weight:800; color:#FFFFFF; letter-spacing:0.04em; margin-bottom:4px;">NSS TGPCOP</div>
              <div style="font-size:12px; font-weight:700; color:#FFD400; text-transform:uppercase; letter-spacing:0.08em;">National Service Scheme • Unit 1</div>
              <div style="font-size:11px; color:#CBD5E1; margin-top:4px;">Tulsiramji Gaikwad-Patil College of Pharmacy, Nagpur</div>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 28px 12px; text-align:center;">
              <div style="display:inline-block; padding:5px 14px; background-color:#EFF6FF; border:1px solid #BFDBFE; border-radius:999px; color:#0647C8; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:12px;">
                ★ ENROLLMENT APPLICATION RECEIVED ★
              </div>
              <h1 style="font-size:22px; font-weight:800; color:#071B49; margin:0 0 10px; line-height:1.25;">
                Welcome to NSS, ${escapeHtml(fullName)}!
              </h1>
              <p style="font-size:14px; line-height:1.6; color:#475569; margin:0 auto; max-width:480px;">
                Your enrollment application for the National Service Scheme (NSS) at TGPCOP has been submitted successfully and is currently under coordinator review.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 28px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC; border:2px dashed #0647C8; border-radius:12px; padding:18px; text-align:center;">
                <tr>
                  <td>
                    <div style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase; letter-spacing:0.08em;">Your Official Reference Code</div>
                    <div style="font-size:24px; font-weight:800; color:#071B49; letter-spacing:0.06em; margin-top:4px; font-family:monospace;">${escapeHtml(refCode)}</div>
                    <div style="font-size:11.5px; color:#64748B; margin-top:4px;">Please save this code to check your approval status and access your Digital Volunteer ID.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px;">
              <div style="font-size:13px; font-weight:700; color:#071B49; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">Submitted Profile Details</div>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border:1px solid #E2E8F0; border-radius:10px; overflow:hidden; font-size:13px;">
                <tr style="background-color:#F8FAFC; border-bottom:1px solid #E2E8F0;">
                  <td style="padding:10px 14px; color:#64748B; font-weight:600; width:40%;">Full Name</td>
                  <td style="padding:10px 14px; color:#0F172A; font-weight:700;">${escapeHtml(fullName)}</td>
                </tr>
                <tr style="border-bottom:1px solid #E2E8F0;">
                  <td style="padding:10px 14px; color:#64748B; font-weight:600;">College Roll Number</td>
                  <td style="padding:10px 14px; color:#0F172A; font-weight:700;">${escapeHtml(rollNumber)}</td>
                </tr>
                <tr style="background-color:#F8FAFC; border-bottom:1px solid #E2E8F0;">
                  <td style="padding:10px 14px; color:#64748B; font-weight:600;">Program / Course</td>
                  <td style="padding:10px 14px; color:#0F172A; font-weight:600;">${escapeHtml(course)} (${escapeHtml(academicYear)})</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px; color:#64748B; font-weight:600;">Review Status</td>
                  <td style="padding:10px 14px;">
                    <span style="display:inline-block; padding:3px 10px; background-color:#FEF3C7; color:#B45309; border-radius:999px; font-size:11px; font-weight:700; text-transform:uppercase;">
                      Pending Review
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px 28px; text-align:center;">
              <div style="background-color:#EFF6FF; border-left:4px solid #0647C8; border-radius:8px; padding:14px; text-align:left; margin-bottom:24px;">
                <div style="font-size:13px; font-weight:700; color:#071B49; margin-bottom:4px;">📌 What happens next?</div>
                <div style="font-size:12.5px; color:#334155; line-height:1.5;">
                  1. The NSS Program Officer reviews your college credentials.<br>
                  2. Upon approval, your official <strong>Volunteer ID</strong> and <strong>Digital QR Card</strong> are issued.<br>
                  3. You can verify and track your application status anytime on the official portal.
                </div>
              </div>

              <a href="https://nss.tgpcop.site/status" target="_blank" style="display:inline-block; padding:13px 32px; background-color:#0647C8; color:#FFFFFF; text-decoration:none; font-size:14px; font-weight:700; border-radius:999px; box-shadow:0 4px 14px rgba(6, 71, 200, 0.35);">
                Check Application Status ➔
              </a>
            </td>
          </tr>

          <tr>
            <td style="background-color:#071B49; padding:16px 24px; text-align:center;">
              <span style="font-size:12px; font-weight:800; color:#FFD400; letter-spacing:0.12em; text-transform:uppercase;">
                ★ NOT ME, BUT YOU ★
              </span>
            </td>
          </tr>

          <tr>
            <td style="background-color:#04102E; padding:24px 24px; text-align:center; font-size:11.5px; color:#94A3B8; line-height:1.6;">
              <div style="color:#CBD5E1; font-weight:600; margin-bottom:6px;">National Service Scheme — TGPCOP Unit 1</div>
              <div>Tulsiramji Gaikwad-Patil College of Pharmacy, Wardha Road, Mohgaon, Nagpur - 441108</div>
              <div style="margin-top:4px;">Sponsored by Ministry of Youth Affairs & Sports, Govt. of India. Affiliated with RTMNU Nagpur.</div>
              <div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08); font-size:11px;">
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

    // 4. Send Email via Brevo REST API v3
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: recipients,
        subject: `[NSS TGPCOP] Volunteer Enrollment Confirmation — Ref: ${refCode}`,
        htmlContent: htmlContent
      })
    });

    const result = await brevoRes.json();

    if (!brevoRes.ok) {
      console.error('[Brevo Error]', result);
      return res.status(200).json({
        success: false,
        error: result.message || 'Brevo API returned an error.',
        sent: false
      });
    }

    return res.status(200).json({
      success: true,
      messageId: result.messageId,
      sent: true
    });

  } catch (error) {
    console.error('[Send Registration Email Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while sending email.'
    });
  }
};

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
