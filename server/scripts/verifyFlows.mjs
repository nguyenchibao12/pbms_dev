// Verify 2 luồng chính qua API thật trên localhost:5000 (chạy sau khi seed + start server).
const BASE = 'http://localhost:5000';
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const post = (p, body, token) => fetch(BASE + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body),
}).then(j);
const login = async (u, p) => (await post('/api/auth/login', { username: u, password: p })).data.token;

const show = (label, res) => {
  const ok = res?.success;
  const d = res?.data || {};
  const summary = res?.error
    ? `ERROR ${res.error.code}: ${res.error.message}`
    : JSON.stringify({
        sessionId: d.session?.session_id ?? d.session_id,
        status: d.session?.status ?? d.status,
        fee: d.fee,
        checkoutUrl: d.checkoutUrl ? d.checkoutUrl.slice(0, 40) + '…' : undefined,
        barrierOpened: d.barrierOpened,
        freeCheckout: d.freeCheckout,
        reservationStatus: d.reservation?.status,
      });
  console.log(`${ok ? '✅' : '❌'} ${label}\n   ${summary}`);
};

const run = async () => {
  const staff = await login('staff', 'Staff@123456');
  console.log('— staff logged in —\n');

  // ===== Luồng 1: WALK-IN =====
  console.log('=== LUỒNG 1: WALK-IN (vãng lai) ===');
  const wPlate = '30A-12345';
  show('walk-in check-in (F1-IN)', await post('/api/sessions/checkin',
    { plateNumber: wPlate, vehicleTypeId: 1, floorId: 1, gateId: 3 }, staff));
  show('walk-in preview-fee', await post('/api/sessions/preview-fee',
    { plateNumber: wPlate }, staff));
  show('walk-in check-out (F1-OUT)', await post('/api/sessions/checkout',
    { plateNumber: wPlate, gateId: 4 }, staff));

  // ===== Luồng 2: RESERVATION (đơn confirmed seeded id=1) =====
  console.log('\n=== LUỒNG 2: RESERVATION (đặt chỗ) ===');
  show('reservation check-in (resId=1, F1-IN)', await post('/api/reservations/checkin',
    { reservationId: 1, gateId: 3 }, staff));
  show('reservation check-out (51F-678.90, F1-OUT)', await post('/api/sessions/checkout',
    { plateNumber: '51F-678.90', gateId: 4 }, staff));
};

run().catch((e) => { console.error('verify failed:', e); process.exit(1); });
