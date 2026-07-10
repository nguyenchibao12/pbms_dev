import { useEffect, useRef } from 'react';

// Nút "Đăng nhập với Google" dùng Google Identity Services (script nạp trong index.html)
// -> không thêm dependency npm. Nút trả về `credential` = ID token; FE KHÔNG decode,
// gửi thẳng cho BE verify (POST /auth/google).
//
// CỐ Ý không gọi google.accounts.id.prompt(): không bật One Tap tự động. Nếu user đóng
// prompt, Chrome phạt ẩn nó (phút -> giờ -> ngày) rất phiền khi test. Nút bấm chủ động
// vẫn mở được hộp đăng nhập, và form username/password luôn là đường dự phòng.
export default function GoogleLoginButton({ onCredential, className }) {
  const boxRef = useRef(null);
  // Giữ callback trong ref để effect khởi tạo GSI chỉ chạy 1 lần (không re-init mỗi lần cha render).
  const cbRef = useRef(onCredential);
  useEffect(() => { cbRef.current = onCredential; }, [onCredential]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return undefined; // thiếu env -> không render nút, login thường vẫn dùng được

    let cancelled = false;
    let poll;
    let stopPoll;

    // Script GSI nạp async -> có thể chưa sẵn sàng lúc component mount; chờ rồi mới render.
    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !boxRef.current) return false;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => cbRef.current?.(resp.credential),
      });
      window.google.accounts.id.renderButton(boxRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 320,
      });
      return true;
    };

    if (!render()) {
      poll = setInterval(() => { if (render()) clearInterval(poll); }, 200);
      stopPoll = setTimeout(() => clearInterval(poll), 10000); // script hỏng/bị chặn -> thôi chờ
    }

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, []);

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;
  return <div ref={boxRef} className={className} />;
}
