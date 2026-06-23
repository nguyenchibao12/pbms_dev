import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';

// Overlay quét QR bằng camera — dùng chung cho kiosk cổng + 2 tab staff (đặt chỗ vào / thu tiền mặt).
// Ưu tiên camera sau (facingMode 'environment'); đọc được 1 mã -> dừng camera rồi gọi onScan(token).
// LƯU Ý: getUserMedia chỉ chạy ở secure context (HTTPS hoặc localhost). Dev đã bật HTTPS (mkcert).
// Luôn dừng + giải phóng camera khi đọc xong / đóng / unmount để không kẹt đèn camera.
export default function QrScanner({ onScan, onClose }) {
  const elementId = 'qr-camera-reader'; // Html5Qrcode cần 1 id DOM để gắn video
  const [error, setError] = useState('');
  // Giữ onScan trong ref để effect khởi động camera chỉ chạy 1 lần (không restart mỗi lần cha re-render).
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId);
    let started = false; // start() đã resolve chưa
    let finished = false; // đã dừng chưa (tránh stop 2 lần)
    let pendingStop = false; // unmount xảy ra trước khi start() kịp resolve

    const doStop = async () => {
      try { await scanner.stop(); } catch { /* camera chưa chạy -> bỏ qua */ }
      try { scanner.clear(); } catch { /* ignore */ }
    };
    const cleanup = async () => {
      if (finished) return;
      finished = true;
      if (started) await doStop();
      else pendingStop = true; // start() xong sẽ stop ngay
    };

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          // Đọc được 1 mã -> dừng camera rồi trả token lên cha (cha tự đóng overlay + xử lý).
          cleanup().then(() => onScanRef.current?.(decodedText));
        },
        undefined, // bỏ qua các frame không decode được
      )
      .then(() => {
        started = true;
        if (pendingStop) doStop(); // đã unmount trong lúc đang khởi động camera
      })
      .catch((err) => {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Bạn chưa cấp quyền camera cho trình duyệt. Hãy cho phép rồi thử lại, hoặc dán mã thủ công.'
            : 'Không mở được camera. Kiểm tra thiết bị/quyền truy cập, hoặc dán mã thủ công.',
        );
      });

    return () => { cleanup(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-slate-800 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Quét mã QR bằng camera</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-4 text-sm text-red-600">{error}</p>
        ) : (
          <div id={elementId} className="overflow-hidden rounded-lg bg-slate-900" />
        )}

        <p className="mt-3 text-center text-xs text-slate-400">
          Đưa mã QR vào khung hình — tự đóng khi đọc xong.
        </p>
      </div>
    </div>
  );
}
