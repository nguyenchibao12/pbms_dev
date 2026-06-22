import api from './axios';

// Kiosk cổng tự phục vụ: gọi POST /gates/scan với header X-Kiosk-Key.
// Không phụ thuộc token đăng nhập (BE bỏ qua Authorization nếu axios có gắn sẵn).
const KIOSK_KEY = import.meta.env.VITE_KIOSK_KEY || 'dev-kiosk-key-123';

export const kioskApi = {
  // gateId = cổng vật lý kiosk đang gắn; qrToken = mã QR trên vé khách.
  scan: (gateId, qrToken) =>
    api.post('/gates/scan', { gateId, qrToken }, { headers: { 'X-Kiosk-Key': KIOSK_KEY } }),
};
