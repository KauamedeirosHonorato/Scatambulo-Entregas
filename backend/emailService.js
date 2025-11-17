import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config({ path: '../.env' }); // Load .env from the root directory

export const mailer = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false, // Use 'true' if your SMTP server uses SSL/TLS on port 465
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

export async function sendEmail(to, subject, html) {
  try {
    await mailer.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html
    });
    console.log("📧 Email enviado para:", to);
  } catch (error) {
    console.error("❌ Erro ao enviar email:", error);
    throw error; // Re-throw the error
  }
}
