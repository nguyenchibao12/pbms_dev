import nodemailer from 'nodemailer';
import { AppError } from './helpers.js';

// Đọc env lazy (import module chạy trước dotenv.config()).
const cfg = () => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.MAIL_FROM || process.env.SMTP_USER,
});

export const isMailConfigured = () => {
  const c = cfg();
  return Boolean(c.host && c.user && c.pass);
};

let transporter = null;
const getTransporter = () => {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    const c = cfg();
    transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.port === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user: c.user, pass: c.pass },
    });
  }
  return transporter;
};

export const sendPasswordResetEmail = async (to, resetUrl) => {
  const tx = getTransporter();
  if (!tx) {
    throw new AppError(
      'Tính năng quên mật khẩu chưa được cấu hình (thiếu SMTP_HOST/SMTP_USER/SMTP_PASS).',
      503,
      'MAIL_NOT_CONFIGURED',
    );
  }
  const { from } = cfg();
  await tx.sendMail({
    from,
    to,
    subject: 'PBMS — Đặt lại mật khẩu',
    text: `Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu PBMS.\n\nMở liên kết sau để đặt lại (hết hạn sau ${process.env.RESET_TOKEN_TTL_MINUTES || 60} phút):\n${resetUrl}\n\nNếu không phải bạn, hãy bỏ qua email này.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2563eb">Đặt lại mật khẩu PBMS</h2>
        <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu. Nhấn nút dưới để đặt mật khẩu mới
           (hết hạn sau <strong>${process.env.RESET_TOKEN_TTL_MINUTES || 60} phút</strong>):</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Đặt lại mật khẩu</a>
        </p>
        <p style="color:#64748b;font-size:13px">Hoặc dán liên kết này vào trình duyệt:<br>${resetUrl}</p>
        <p style="color:#94a3b8;font-size:12px">Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>
      </div>`,
  });
};

export const sendVerificationEmail = async (to, verifyUrl) => {
  const tx = getTransporter();
  if (!tx) {
    throw new AppError(
      'Tính năng gửi email chưa được cấu hình (thiếu SMTP_HOST/SMTP_USER/SMTP_PASS).',
      503,
      'MAIL_NOT_CONFIGURED',
    );
  }
  const { from } = cfg();
  await tx.sendMail({
    from,
    to,
    subject: 'PBMS — Xác minh email',
    text: `Cảm ơn bạn đã đăng ký PBMS.\n\nMở liên kết sau để xác minh email:\n${verifyUrl}\n\nNếu không phải bạn, hãy bỏ qua email này.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2563eb">Xác minh email PBMS</h2>
        <p>Cảm ơn bạn đã đăng ký. Nhấn nút dưới để xác minh địa chỉ email này:</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Xác minh email</a>
        </p>
        <p style="color:#64748b;font-size:13px">Hoặc dán liên kết này vào trình duyệt:<br>${verifyUrl}</p>
        <p style="color:#94a3b8;font-size:12px">Nếu không phải bạn đăng ký, hãy bỏ qua email này.</p>
      </div>`,
  });
};
