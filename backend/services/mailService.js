const nodemailer = require('nodemailer');
const { SUPPORT_EMAIL } = require('./limits');

// Email is optional: set SMTP_USER and SMTP_PASS (for Gmail, an app password) to turn it on.
// Without them feedback is still saved to the database, just not emailed.
const mailConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = mailConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

/**
 * Emails one piece of user feedback to the support address. Never throws.
 */
async function sendFeedbackEmail(feedback) {
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: `AeroPrep <${process.env.SMTP_USER}>`,
      to: SUPPORT_EMAIL,
      replyTo: feedback.user.email,
      subject: `AeroPrep feedback: ${feedback.rating}/5 from ${feedback.user.name}`,
      text: [
        `Rating: ${feedback.rating}/5`,
        `From: ${feedback.user.name} <${feedback.user.email}>`,
        `Interview: ${feedback.interviewId ?? 'not linked'}`,
        '',
        feedback.message || '(no message)'
      ].join('\n')
    });
    return true;
  } catch (error) {
    console.error('Could not email feedback:', error.message);
    return false;
  }
}

module.exports = { mailConfigured, sendFeedbackEmail };
