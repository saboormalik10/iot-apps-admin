import nodemailer from 'nodemailer';

function createTransporter() {
  const user = process.env.EMAIL_MAILER;
  // Gmail App Passwords are displayed in 4-char groups ("xxxx xxxx xxxx xxxx");
  // strip the whitespace so a copy-pasted value with spaces still authenticates.
  const pass = process.env.EMAIL_PASSWORD?.replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error('EMAIL_MAILER and EMAIL_PASSWORD must be set in .env');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    // Serverless (Vercel) can stall on outbound SMTP; fail fast and let the caller
    // handle it rather than hanging until the platform function timeout.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export async function sendPasswordResetCodeEmail(
  to: string,
  firstName: string,
  code: string,
  expiryMinutes = 15,
): Promise<void> {
  const from = process.env.EMAIL_FROM ?? process.env.EMAIL_MAILER;
  const transporter = createTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: `${code} is your Observator password reset code`,
    text: [
      `Hi ${firstName},`,
      '',
      'Use this code to reset your Observator password:',
      '',
      `    ${code}`,
      '',
      `The code expires in ${expiryMinutes} minutes. Enter it in the app to continue.`,
      '',
      'If you did not request this, you can safely ignore this email — your password stays unchanged.',
      '',
      '— Observator Team',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#333">
  <h2 style="color:#1a1a2e">Reset your password</h2>
  <p>Hi ${firstName},</p>
  <p>Use this code to reset your <strong>Observator</strong> password:</p>
  <p style="margin:28px 0;text-align:center">
    <span style="display:inline-block;background:#f4f4fb;color:#1a1a2e;font-size:32px;font-weight:bold;
                 letter-spacing:10px;padding:16px 28px;border-radius:8px;font-family:monospace">
      ${code}
    </span>
  </p>
  <p style="color:#666;font-size:13px">
    This code expires in <strong>${expiryMinutes} minutes</strong>. If you didn't request a reset, ignore this
    email — your password stays unchanged.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
  <p style="color:#999;font-size:12px">Observator Instruments</p>
</body>
</html>`,
  });
}

export async function sendInviteEmail(
  to: string,
  orgName: string,
  inviterName: string,
  role: string,
  inviteUrl: string,
): Promise<void> {
  const from = process.env.EMAIL_FROM ?? process.env.EMAIL_MAILER;
  const transporter = createTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: `You've been invited to ${orgName} on Observator`,
    text: [
      `Hi,`,
      '',
      `${inviterName} has invited you to join ${orgName} on the Observator dashboard as a ${role}.`,
      '',
      `Accept the invite and set your password (link expires in 7 days): ${inviteUrl}`,
      '',
      'If you were not expecting this invitation, you can safely ignore this email.',
      '',
      '— Observator Team',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#333">
  <h2 style="color:#1a1a2e">You've been invited to ${orgName}</h2>
  <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on the
     Observator dashboard as a <strong>${role}</strong>.</p>
  <p style="margin:32px 0">
    <a href="${inviteUrl}"
       style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Accept Invitation
    </a>
  </p>
  <p style="color:#666;font-size:13px">
    This link expires in <strong>7 days</strong>. If you weren't expecting this, ignore this email.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
  <p style="color:#999;font-size:12px">Observator Instruments</p>
</body>
</html>`,
  });
}

export interface AlertEmailFields {
  ruleName: string;
  deviceName: string;
  /** Human-readable condition, e.g. "Wind speed > 12 m/s". */
  summary: string;
  reading: string;
  triggeredAt: Date;
  dashboardUrl: string;
}

/**
 * Threshold-alert email.
 *
 * The in-app feed and push notification only reach someone already looking at a
 * screen. For a wind alarm — the product the client sells — the alert has to reach
 * a person who is not. This is that channel.
 *
 * Sent per recipient rather than BCC'd: a wind-alarm list is small, and a
 * per-recipient send means one bad address cannot suppress everyone else's alert.
 */
export async function sendAlertEmail(to: string, fields: AlertEmailFields): Promise<void> {
  const from = process.env.EMAIL_FROM ?? process.env.EMAIL_MAILER;
  const transporter = createTransporter();
  const when = fields.triggeredAt.toISOString().replace('T', ' ').slice(0, 19);

  await transporter.sendMail({
    from,
    to,
    // The device name leads: a recipient watching several stations needs to know
    // WHICH one before anything else.
    subject: `[Alert] ${fields.deviceName} — ${fields.ruleName}`,
    text: [
      `${fields.deviceName} has crossed an alert threshold.`,
      '',
      `Rule:    ${fields.ruleName}`,
      `Trigger: ${fields.summary}`,
      `Reading: ${fields.reading}`,
      `Time:    ${when} UTC`,
      '',
      `View the station: ${fields.dashboardUrl}`,
      '',
      'You are receiving this because you are listed as a recipient on this alert rule.',
      '',
      '— Observator',
    ].join('\n'),
    html: `<!DOCTYPE html>
<html>
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5">
    <h2 style="margin:0 0 4px">${escapeHtml(fields.deviceName)}</h2>
    <p style="margin:0 0 16px;color:#64748b">has crossed an alert threshold.</p>
    <table style="border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:2px 12px 2px 0;color:#64748b">Rule</td><td><strong>${escapeHtml(fields.ruleName)}</strong></td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b">Trigger</td><td>${escapeHtml(fields.summary)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b">Reading</td><td><strong>${escapeHtml(fields.reading)}</strong></td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b">Time</td><td>${when} UTC</td></tr>
    </table>
    <p style="margin:0 0 16px"><a href="${escapeHtml(fields.dashboardUrl)}">View the station</a></p>
    <p style="margin:0;color:#94a3b8;font-size:12px">
      You are receiving this because you are listed as a recipient on this alert rule.
    </p>
  </body>
</html>`,
  });
}

/** Values are interpolated into HTML, so anything user-named must be escaped. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
