/**
 * Serverless API: Broadcast Event & Achievement Announcements via Brevo
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
    recipients = []
  } = req.body || {};

  if (!subject || !title || !message) {
    return res.status(400).json({ error: 'Missing required fields: subject, title, and message are required.' });
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'Recipients array cannot be empty. Please specify at least one recipient.' });
  }

  if (!apiKey) {
    console.warn('[Brevo] BREVO_API_KEY is not configured in environment variables.');
    return res.status(200).json({
      success: false,
      warning: 'BREVO_API_KEY is not configured in Vercel Environment Variables. Please set up your Brevo API key to enable email broadcasts.',
      sent: false
    });
  }

  // Filter valid emails
  const validRecipients = recipients.filter(r => r && r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
  if (validRecipients.length === 0) {
    return res.status(400).json({ error: 'No valid recipient email addresses found.' });
  }

  try {
    // 1. Build Achievement / Event Photo Cards HTML
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

    // 2. Format Body Paragraphs
    const formattedMessage = escapeHtml(message)
      .split(/\n\s*\n/)
      .map(p => `<p style="margin:0 0 14px; font-size:14.5px; line-height:1.65; color:#334155;">${p.replace(/\n/g, '<br>')}</p>`)
      .join('');

    // 3. CTA Button HTML (optional)
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

    // 4. Render Master Broadcast Template
    const broadcastHtml = `<!DOCTYPE html>
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

    // 5. Send Broadcast via Brevo SMTP API
    // We can batch up to 50 recipients per call for optimal performance and rate-limiting safety
    const batchSize = 50;
    let totalSent = 0;
    const errors = [];

    for (let i = 0; i < validRecipients.length; i += batchSize) {
      const chunk = validRecipients.slice(i, i + batchSize);
      
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
          to: chunk.map(r => ({ email: r.email, name: r.name || r.fullName || 'NSS Volunteer' })),
          subject: subject,
          htmlContent: broadcastHtml
        })
      });

      const result = await brevoRes.json();
      if (brevoRes.ok) {
        totalSent += chunk.length;
      } else {
        errors.push(result.message || 'Error sending chunk.');
      }
    }

    return res.status(200).json({
      success: totalSent > 0,
      sentCount: totalSent,
      totalRecipients: validRecipients.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Broadcast delivered to ${totalSent} recipient(s) via Brevo!`
    });

  } catch (error) {
    console.error('[Broadcast Email Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while broadcasting email.'
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
