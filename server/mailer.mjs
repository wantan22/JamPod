// Outgoing email for password resets, over HTTPS APIs (free hosts often
// block SMTP ports). Pick ONE provider via environment variables:
//
//   Brevo   BREVO_API_KEY  + EMAIL_FROM (a sender address you verified in Brevo)
//   Resend  RESEND_API_KEY + EMAIL_FROM (needs a verified domain to email anyone
//           other than yourself)
//
// With neither set, the email is printed to the server log instead, so the
// app owner can copy the reset link from the Render logs and pass it on.

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createMailer({ log = console.log } = {}) {
  const from = process.env.EMAIL_FROM?.trim() || '';
  const brevo = process.env.BREVO_API_KEY?.trim();
  const resend = process.env.RESEND_API_KEY?.trim();
  const provider = brevo && from ? 'brevo' : resend ? 'resend' : 'log';
  log(`[mail] password-reset emails: ${provider === 'log' ? 'printed to this log (no email provider configured)' : `sent via ${provider}`}`);

  async function send({ to, subject, text, html }) {
    if (provider === 'brevo') {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevo, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { email: from, name: 'JamPod' }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
      });
      if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return;
    }
    if (provider === 'resend') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resend}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: from || 'JamPod <onboarding@resend.dev>', to: [to], subject, text, html }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return;
    }
    log(`[mail] (not sent — no provider) to=${to} subject="${subject}"\n${text}`);
  }

  return {
    provider,
    sendPasswordReset: (to, displayName, link) =>
      send({
        to,
        subject: 'Reset your JamPod password',
        text: `Hi ${displayName},\n\nSomeone asked to reset the password for your JamPod account. If it was you, open this link within 30 minutes:\n\n${link}\n\nIf it wasn't you, ignore this email; your password stays the same.\n\n— JamPod`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#2a2430">
  <h2 style="margin:0 0 12px">Reset your JamPod password</h2>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>Someone asked to reset the password for your JamPod account. If it was you, use this button within 30 minutes:</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#e8b464;color:#1b1408;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700">Choose a new password</a></p>
  <p style="font-size:13px;color:#6b6070">If it wasn't you, ignore this email; your password stays the same.</p>
</div>`,
      }),
  };
}
