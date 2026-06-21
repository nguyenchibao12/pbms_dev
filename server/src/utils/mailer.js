import { AppError } from './helpers.js';

// Gửi mail qua HTTP API của Brevo (cổng 443) — KHÔNG dùng SMTP vì Railway chặn cổng SMTP.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Đọc env lazy (import module chạy trước dotenv.config()).
const cfg = () => ({
  apiKey: process.env.BREVO_API_KEY,
  from: process.env.MAIL_FROM || process.env.SMTP_USER,
});

export const isMailConfigured = () => Boolean(cfg().apiKey && cfg().from);

// Tách "PBMS <no-reply@x.com>" -> { name, email }.
const parseSender = (raw) => {
  const m = String(raw || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: String(raw || '').trim() };
};

const sendMail = async ({ to, subject, text, html }) => {
  if (!isMailConfigured()) {
    throw new AppError(
      'Tính năng email chưa được cấu hình (thiếu BREVO_API_KEY/MAIL_FROM).',
      503,
      'MAIL_NOT_CONFIGURED',
    );
  }
  const { apiKey, from } = cfg();
  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseSender(from),
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AppError(`Gửi email thất bại (Brevo ${res.status}): ${detail}`, 502, 'MAIL_SEND_FAILED');
  }
};

export const sendPasswordResetEmail = async (to, resetUrl) => {
  const ttl = process.env.RESET_TOKEN_TTL_MINUTES || 60;
  await sendMail({
    to,
    subject: 'PBMS — Đặt lại mật khẩu',
    text: `Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu PBMS.\n\nMở liên kết sau để đặt lại (hết hạn sau ${ttl} phút):\n${resetUrl}\n\nNếu không phải bạn, hãy bỏ qua email này.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2563eb">Đặt lại mật khẩu PBMS</h2>
        <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu. Nhấn nút dưới để đặt mật khẩu mới
           (hết hạn sau <strong>${ttl} phút</strong>):</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Đặt lại mật khẩu</a>
        </p>
        <p style="color:#64748b;font-size:13px">Hoặc dán liên kết này vào trình duyệt:<br>${resetUrl}</p>
        <p style="color:#94a3b8;font-size:12px">Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>
      </div>`,
  });
};

export const sendVerificationEmail = async (to, verifyUrl) => {
  await sendMail({
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
