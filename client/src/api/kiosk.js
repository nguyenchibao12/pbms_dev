import api from './axios';

// Kiosk cổng tự phục vụ: gọi POST /gates/scan với header X-Kiosk-Key.
// Không phụ thuộc token đăng nhập (BE bỏ qua Authorization nếu axios có gắn sẵn).
const KIOSK_KEY = import.meta.env.VITE_KIOSK_KEY || 'dev-kiosk-key-123';

export const kioskApi = {
  // gateId = cổng vật lý kiosk đang gắn; qrToken = mã QR trên vé khách.
  scan: (gateId, qrToken) =>
    api.post('/gates/scan', { gateId, qrToken }, { headers: { 'X-Kiosk-Key': KIOSK_KEY } }),
  // Poll trạng thái ra của phiên (sau khi PAYMENT_REQUIRED) → completed thì kiosk tự mở barie.
  exitStatus: (sessionId) =>
    api.get('/gates/exit-status', { params: { sessionId }, headers: { 'X-Kiosk-Key': KIOSK_KEY } }),
};
