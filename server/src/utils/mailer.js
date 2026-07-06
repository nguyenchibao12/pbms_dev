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

/** P3-8 — nhắc user cập nhật tài khoản ngân hàng để nhận hoàn tiền hủy vé tháng. */
export const sendRefundBankInfoEmail = async (to, { fullName, amount, profileUrl, deadlineDays }) => {
  const amountStr = Number(amount).toLocaleString('vi-VN');
  await sendMail({
    to,
    subject: 'PBMS — Cập nhật tài khoản ngân hàng để nhận hoàn tiền vé tháng',
    text:
      `Chào ${fullName},\n\n` +
      `Yêu cầu hủy vé tháng của bạn đã được ghi nhận và bạn được hoàn ${amountStr}đ.\n` +
      `Để nhận tiền, vui lòng cập nhật tài khoản ngân hàng trong hồ sơ cá nhân:\n${profileUrl}\n\n` +
      `Lưu ý: nếu quá ${deadlineDays} ngày kể từ lúc hủy mà chưa cập nhật, yêu cầu hoàn tiền sẽ hết hạn.\n\n` +
      `Trân trọng,\nPBMS`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2563eb">Hoàn tiền vé tháng PBMS</h2>
        <p>Chào <strong>${fullName}</strong>,</p>
        <p>Yêu cầu hủy vé tháng của bạn đã được ghi nhận và bạn được hoàn
           <strong>${amountStr}đ</strong>.</p>
        <p>Để nhận tiền, vui lòng cập nhật <strong>tài khoản ngân hàng</strong> trong hồ sơ cá nhân:</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${profileUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Cập nhật hồ sơ</a>
        </p>
        <p style="color:#64748b;font-size:13px">Hoặc dán liên kết này vào trình duyệt:<br>${profileUrl}</p>
        <p style="color:#ef4444;font-size:13px">Lưu ý: quá <strong>${deadlineDays} ngày</strong> kể từ lúc hủy
           mà chưa cập nhật, yêu cầu hoàn tiền sẽ hết hạn.</p>
      </div>`,
  });
};
