const nodemailer = require('nodemailer');
const { env } = require('../config/env');

let transporter;

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_PORT) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text }) {
  const smtp = getTransporter();
  const from = env.SMTP_FROM || env.SMTP_USER || 'no-reply@seiga.local';

  if (!smtp) {
    console.log(`[mail:dev] to=${to} subject=${subject} body=생략됨`);
    return;
  }

  await smtp.sendMail({ from, to, subject, text });
}

module.exports = { sendMail };
