import nodemailer from 'nodemailer';

function createTransporter() {
  const user = process.env.EMAIL_MAILER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    throw new Error('EMAIL_MAILER and EMAIL_PASSWORD must be set in .env');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  resetUrl: string,
): Promise<void> {
  const from = process.env.EMAIL_FROM ?? process.env.EMAIL_MAILER;
  const transporter = createTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: 'Reset your Observator password',
    text: [
      `Hi ${firstName},`,
      '',
      'You requested a password reset for your Observator account.',
      '',
      `Reset link (expires in 1 hour): ${resetUrl}`,
      '',
      'If you did not request this, you can safely ignore this email.',
      '',
      '— Observator Team',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#333">
  <h2 style="color:#1a1a2e">Reset your password</h2>
  <p>Hi ${firstName},</p>
  <p>You requested a password reset for your <strong>Observator</strong> account.</p>
  <p style="margin:32px 0">
    <a href="${resetUrl}"
       style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Reset Password
    </a>
  </p>
  <p style="color:#666;font-size:13px">
    This link expires in <strong>1 hour</strong>. If you didn't request a reset, ignore this email.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
  <p style="color:#999;font-size:12px">Observator Instruments</p>
</body>
</html>`,
  });
}
