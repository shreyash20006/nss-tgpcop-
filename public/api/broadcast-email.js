/**
 * Serverless API: Broadcast Event, Directory Announcements & Bulk Emails via Brevo
 * Endpoint: POST /api/broadcast-email
 * Protected by server-side BREVO_API_KEY environment variable
 */

module.exports = async (req, res) => {
  // Set CORS headers
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

  const {
    subject = '',
    category = 'Event Announcement',
    title = '',
    dateVenue = '',
    message = '',
    images = [],
    ctaLabel = '',
    ctaUrl = '',
    templateId = null,
    recipients = []
  } = req.body || {};

  if (!subject || !title || !message) {
    return res.status(400).json({ error: 'Missing required fields: subject, title, and message are required.' });
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'Recipients array cannot be empty. Please specify at least one recipient.' });
  }

  // Filter valid vs skipped recipients
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validRecipients = [];
  const skippedRecipients = [];

  for (const r of recipients) {
    if (!r) continue;
    const email = (r.email || r.college_email || '').trim().toLowerCase();
    const name = (r.name || r.full_name || r.fullName || 'NSS Volunteer').trim();
    if (email && emailRegex.test(email)) {
      validRecipients.push({
        id: r.id || null,
        email,
        name,
        firstName: name.split(' ')[0] || 'Volunteer'
      });
    } else {
      skippedRecipients.push({
        id: r.id || null,
        name,
        reason: email ? 'Invalid email format' : 'Missing email address'
      });
    }
  }

  if (validRecipients.length === 0) {
    return res.status(400).json({
      error: 'No valid recipient email addresses found in the selected list.',
      skippedCount: skippedRecipients.length,
      skippedRecipients
    });
  }

  if (!apiKey) {
    console.warn('[Brevo] BREVO_API_KEY is not configured in environment variables.');
    return res.status(200).json({
      success: false,
      warning: 'BREVO_API_KEY is not configured in Vercel Environment Variables. Please set up your Brevo API key to enable email broadcasts.',
      sent: false,
      totalRecipients: recipients.length,
      validRecipientsCount: validRecipients.length,
      skippedCount: skippedRecipients.length,
      skippedRecipients
    });
  }

  try {
    const results = [];
    let sentCount = 0;
    let failCount = 0;

    // Send emails individually for 100% privacy and real personalized variable substitution
    // Limit concurrency to 5 requests at a time to stay safely within Brevo rate limits
    const concurrency = 5;
    for (let i = 0; i < validRecipients.length; i += concurrency) {
      const chunk = validRecipients.slice(i, i + concurrency);
      
      await Promise.all(chunk.map(async (rec) => {
        const personalizedSubject = subject
          .replace(/\{\{first_name\}\}/gi, rec.firstName)
          .replace(/\{\{name\}\}/gi, rec.name);

        const personalizedTitle = title
          .replace(/\{\{first_name\}\}/gi, rec.firstName)
          .replace(/\{\{name\}\}/gi, rec.name);

        const personalizedMsg = message
          .replace(/\{\{first_name\}\}/gi, rec.firstName)
          .replace(/\{\{name\}\}/gi, rec.name);

        let brevoBody;
        if (templateId && !isNaN(parseInt(templateId, 10))) {
          brevoBody = {
            templateId: parseInt(templateId, 10),
            to: [{ email: rec.email, name: rec.name }],
            params: {
              FIRSTNAME: rec.firstName,
              FULLNAME: rec.name,
              NAME: rec.name,
              SUBJECT: personalizedSubject,
              TITLE: personalizedTitle,
              MESSAGE: personalizedMsg,
              DATEVENUE: dateVenue || ''
            }
          };
        } else {
          const htmlContent = renderBroadcastHtml({
            subject: personalizedSubject,
            category,
            title: personalizedTitle,
            dateVenue,
            message: personalizedMsg,
            images,
            ctaLabel,
            ctaUrl,
            recipientName: rec.name
          });

          brevoBody = {
            sender: {
              name: senderName,
              email: senderEmail
            },
            to: [{ email: rec.email, name: rec.name }],
            subject: personalizedSubject,
            htmlContent
          };
        }

        try {
          const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'api-key': apiKey,
              'content-type': 'application/json'
            },
            body: JSON.stringify(brevoBody)
          });

          const resData = await brevoRes.json();
          if (brevoRes.ok) {
            sentCount++;
            results.push({
              id: rec.id,
              email: rec.email,
              name: rec.name,
              status: 'sent',
              messageId: resData.messageId
            });
          } else {
            failCount++;
            results.push({
              id: rec.id,
              email: rec.email,
              name: rec.name,
              status: 'failed',
              error: resData.message || 'Brevo API error'
            });
          }
        } catch (err) {
          failCount++;
          results.push({
            id: rec.id,
            email: rec.email,
            name: rec.name,
            status: 'failed',
            error: err.message
          });
        }
      }));

      // Small delay between chunks
      if (i + concurrency < validRecipients.length) {
        await new Promise(r => setTimeout(r, 60));
      }
    }

    return res.status(200).json({
      success: sentCount > 0,
      sentCount,
      failCount,
      skippedCount: skippedRecipients.length,
      totalRecipients: recipients.length,
      results,
      skippedRecipients,
      message: `Delivered to ${sentCount} recipient(s) via Brevo.${skippedRecipients.length ? ` (${skippedRecipients.length} skipped - missing email)` : ''}`
    });

  } catch (error) {
    console.error('[Broadcast Email Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while broadcasting email.'
    });
  }
};

function renderBroadcastHtml(options) {
  const {
    subject,
    category,
    title,
    dateVenue,
    message,
    images = [],
    ctaLabel,
    ctaUrl,
    recipientName
  } = options;

  let photosHtml = '';
  if (Array.isArray(images) && images.length > 0) {
    const validImages = images.filter(img => typeof img === 'string' && img.trim().startsWith('http'));
    if (validImages.length > 0) {
      photosHtml = `
        <tr>
          <td style="padding:16px 28px 8px;">
            <div style="font-size:12px; font-weight:700; color:#0647C8; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">
              📸 Event & Achievement Highlights
            </div>
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
              ${validImages.map((img, idx) => `
                <tr>
                  <td style="padding-bottom:14px; text-align:center;">
                    <img src="${escapeHtml(img)}" alt="NSS Event Photo ${idx + 1}" style="width:100%; max-width:540px; height:auto; border-radius:12px; display:block; margin:0 auto; border:1px solid #CBD5E1; box-shadow:0 4px 14px rgba(7,27,73,0.06);">
                  </td>
                </tr>
              `).join('')}
            </table>
          </td>
        </tr>
      `;
    }
  }

  const formattedMessage = escapeHtml(message)
    .split(/\n\s*\n/)
    .map(p => `<p style="margin:0 0 14px; font-size:14.5px; line-height:1.65; color:#334155;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  let ctaHtml = '';
  if (ctaLabel && ctaUrl && ctaUrl.startsWith('http')) {
    ctaHtml = `
      <tr>
        <td style="padding:10px 28px 24px; text-align:center;">
          <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display:inline-block; padding:13px 32px; background-color:#0647C8; color:#FFFFFF; text-decoration:none; font-size:14px; font-weight:700; border-radius:999px; box-shadow:0 4px 14px rgba(6, 71, 200, 0.35);">
            ${escapeHtml(ctaLabel)} ➔
          </a>
        </td>
      </tr>
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F9FC; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; color:#0F172A;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F7F9FC; padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#FFFFFF; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(7, 27, 73, 0.08); border:1px solid #E2E8F0;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #071B49 0%, #0647C8 100%); padding:28px 24px; text-align:center;">
              <img src="https://nss.tgpcop.site/assets/nss-logo.png" alt="NSS Emblem" width="58" height="58" style="display:block; margin:0 auto 10px; border:none;">
              <div style="font-size:22px; font-weight:800; color:#FFFFFF; letter-spacing:0.04em;">NSS TGPCOP</div>
              <div style="font-size:11.5px; font-weight:700; color:#FFD400; text-transform:uppercase; letter-spacing:0.08em; margin-top:2px;">National Service Scheme • Unit 1</div>
              <div style="font-size:11px; color:#CBD5E1; margin-top:2px;">Tulsiramji Gaikwad-Patil College of Pharmacy, Nagpur</div>
            </td>
          </tr>

          <!-- Category Pill & Title -->
          <tr>
            <td style="padding:28px 28px 12px; text-align:center;">
              <div style="display:inline-block; padding:5px 16px; background-color:rgba(255, 212, 0, 0.16); border:1px solid rgba(255, 212, 0, 0.5); border-radius:999px; color:#B45309; font-size:11.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:12px;">
                ★ ${escapeHtml(category)} ★
              </div>
              <h1 style="font-size:23px; font-weight:800; color:#071B49; margin:0 0 10px; line-height:1.25;">
                ${escapeHtml(title)}
              </h1>
              ${dateVenue ? `
                <div style="display:inline-block; background-color:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; padding:6px 14px; font-size:12.5px; font-weight:600; color:#0647C8; margin-bottom:14px;">
                  📅 ${escapeHtml(dateVenue)}
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Message Body -->
          <tr>
            <td style="padding:10px 28px 16px;">
              <div style="background-color:#FAFCFF; border:1px solid #E2E8F0; border-radius:12px; padding:20px 22px;">
                ${formattedMessage}
              </div>
            </td>
          </tr>

          <!-- Attached Photos Showcase -->
          ${photosHtml}

          <!-- Call to Action -->
          ${ctaHtml}

          <!-- Motto Bar -->
          <tr>
            <td style="background-color:#071B49; padding:14px 20px; text-align:center;">
              <span style="font-size:11.5px; font-weight:800; color:#FFD400; letter-spacing:0.1em; text-transform:uppercase;">
                ★ NOT ME, BUT YOU ★
              </span>
            </td>
          </tr>

          <!-- Institutional Footer -->
          <tr>
            <td style="background-color:#04102E; padding:22px 20px; text-align:center; font-size:11.5px; color:#94A3B8; line-height:1.6;">
              <div style="color:#CBD5E1; font-weight:600; margin-bottom:4px;">National Service Scheme — TGPCOP Unit 1</div>
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
