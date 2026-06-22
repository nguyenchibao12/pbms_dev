// Verify luồng KIOSK cổng end-to-end (sau seed + start server có KIOSK_API_KEY).
import dotenv from 'dotenv';
import sequelize from '../src/config/db.js';
import { Reservation } from '../src/models/index.js';
dotenv.config();

const BASE = 'http://localhost:5000';
const KEY = process.env.KIOSK_API_KEY;
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const scan = (gateId, qrToken) => fetch(BASE + '/api/gates/scan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Kiosk-Key': KEY },
  body: JSON.stringify({ gateId, qrToken }),
}).then(j);

const show = (label, res) => {
  const ok = res?.success;
  const d = res?.data || {};
  const s = res?.error ? `ERROR ${res.error.code}: ${res.error.message}`
    : JSON.stringify({ action: d.action, stage: d.stage, fee: d.fee,
        checkoutUrl: d.checkoutUrl ? d.checkoutUrl.slice(0, 38) + '…' : undefined });
  console.log(`${ok ? '✅' : '❌'} ${label}\n   ${s}`);
};

// Gates: BLD-IN=1, BLD-OUT=2, F1-IN=3, F1-OUT=4
const run = async () => {
  await sequelize.authenticate();
  const res = await Reservation.findByPk(1);
  const qr = res.qr_token;
  console.log(`Reservation QR = ${qr}\n`);
  console.log('=== KIOSK luồng RESERVATION (vào tòa → vào tầng → ra tầng → ra tòa) ===');
  show('BLD-IN  (vào tòa, validate)', await scan(1, qr));
  show('F1-IN   (vào tầng, check-in chiếm slot)', await scan(3, qr));
  show('F1-OUT  (ra tầng, chỉ mở)', await scan(4, qr));
  show('BLD-OUT (ra tòa, checkout + phí)', await scan(2, qr));
  process.exit(0);
};
run().catch((e) => { console.error('kiosk verify failed:', e); process.exit(1); });
