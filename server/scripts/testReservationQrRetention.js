// Acceptance test — OR-16: QR đặt chỗ GIỮ token gốc, hết hiệu lực theo STATUS.
// Gọi THẲNG service (không HTTP). Chạy: node scripts/testReservationQrRetention.js
// Tự tạo dữ liệu test rồi DỌN SẠCH.
import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { Reservation, ParkingSlot, Gate } from '../src/models/index.js';
import {
  cancelUserReservation,
  markReservationNoShow,
  staffLookupReservationByQr,
} from '../src/services/reservation.service.js';
import { scanGate } from '../src/services/gateScan.service.js';
import { assertReservationQrUsable } from '../src/utils/stateGuards.js';

const USER_ID = 4; // seed: user thường
let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS: ${name}`); }
  else { fail += 1; console.log(`  FAIL: ${name} ${extra}`); }
};

// Bắt lỗi để soi code/message thay vì để test nổ.
const grab = async (fn) => {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, code: err.code, message: err.message, status: err.statusCode };
  }
};

const cleanupIds = [];

const makeReservation = async ({ startInMs, plate }) => {
  const slot = await ParkingSlot.findOne({
    where: { status: 'available' },
    include: [{ association: 'zone' }],
  });
  if (!slot) throw new Error('Không còn slot available trong DB dev — seed lại rồi chạy test');
  const start = new Date(Date.now() + startInMs);
  const resv = await Reservation.create({
    user_id: USER_ID,
    vehicle_type_id: slot.zone.vehicle_type_id,
    floor_id: slot.zone.floor_id,
    zone_id: slot.zone_id,
    slot_id: slot.slot_id,
    plate_number: plate,
    start_time: start,
    end_time: new Date(start.getTime() + 4 * 3600 * 1000),
    status: 'confirmed',
    reservation_type: 'standard',
    qr_token: `test-qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  cleanupIds.push(resv.reservation_id);
  await slot.update({ status: 'reserved' });
  return resv;
};

const run = async () => {
  const buildingIn = await Gate.findOne({
    where: { floor_id: null, direction: 'in', is_active: true },
  });
  if (!buildingIn) throw new Error('DB dev không có cổng VÀO TÒA đang hoạt động — seed lại');

  console.log('=== TEST 1: Hủy đặt chỗ → GIỮ token gốc, cổng chặn theo status ===');
  const t1 = await makeReservation({ startInMs: 72 * 3600 * 1000, plate: '97A-00001' });
  const tokenBefore = t1.qr_token;
  await cancelUserReservation(USER_ID, t1.reservation_id);
  await t1.reload();
  check('qr_token KHÔNG bị ghi đè', t1.qr_token === tokenBefore, `(còn: ${t1.qr_token})`);
  check('qr_token không mang prefix revoked-', !t1.qr_token.startsWith('revoked-'));
  const scan1 = await grab(() => scanGate({ qrToken: tokenBefore, gateId: buildingIn.gate_id }));
  check('cổng TỪ CHỐI QR đơn đã hủy', scan1.ok === false && scan1.status === 409, JSON.stringify(scan1));
  check('thông báo nêu rõ trạng thái cancelled', /cancelled/.test(scan1.message || ''), scan1.message);

  console.log('=== TEST 2: No-show → GIỮ token gốc, cổng vẫn chặn ===');
  const t2 = await makeReservation({ startInMs: -6 * 3600 * 1000, plate: '97A-00002' });
  const token2 = t2.qr_token;
  await markReservationNoShow(t2.reservation_id);
  await t2.reload();
  check('status = no_show', t2.status === 'no_show');
  check('qr_token KHÔNG bị ghi đè', t2.qr_token === token2, `(còn: ${t2.qr_token})`);
  const scan2 = await grab(() => scanGate({ qrToken: token2, gateId: buildingIn.gate_id }));
  check('cổng TỪ CHỐI QR đơn no-show', scan2.ok === false && scan2.status === 409, JSON.stringify(scan2));

  console.log('=== TEST 3: XE ĐANG TRONG BÃI vẫn quét được (chống lỗi khóa xe trong bãi) ===');
  // Đây là điểm đề xuất ban đầu của FE ("chỉ cho status === 'confirmed'") sẽ làm hỏng:
  // sau khi vào cổng tòa, đơn chuyển 'checked_in' và xe còn phải quét cổng tầng + cổng RA
  // bằng CHÍNH mã này. Guard mà chặn 'checked_in' là nhốt xe lại trong bãi.
  const usable = await grab(async () => assertReservationQrUsable({ status: 'checked_in' }));
  check("QR đơn 'checked_in' VẪN hợp lệ (ra bãi được)", usable.ok === true, JSON.stringify(usable));
  const stillOk = await grab(async () => assertReservationQrUsable({ status: 'confirmed' }));
  check("QR đơn 'confirmed' hợp lệ", stillOk.ok === true);
  for (const dead of ['cancelled', 'no_show', 'completed']) {
    const r = await grab(async () => assertReservationQrUsable({ status: dead }));
    check(`QR đơn '${dead}' bị từ chối 409`, r.ok === false && r.status === 409);
  }

  console.log('=== TEST 4: Staff tra cứu QR ===');
  const look1 = await grab(() => staffLookupReservationByQr(tokenBefore));
  check('tra cứu đơn ĐÃ HỦY → 409 kèm lý do', look1.ok === false && look1.status === 409, look1.message);
  const t4 = await makeReservation({ startInMs: 48 * 3600 * 1000, plate: '97A-00004' });
  const look2 = await grab(() => staffLookupReservationByQr(t4.qr_token));
  check('tra cứu đơn CONFIRMED → trả về đơn', look2.ok === true && look2.value?.reservation_id === t4.reservation_id);

  console.log('=== TEST 5: Token cũ đã bị bẻ trước OR-16 (dữ liệu cũ) vẫn bị chặn ===');
  const legacy = await grab(() =>
    scanGate({ qrToken: 'revoked-reservation-999-1700000000000', gateId: buildingIn.gate_id }),
  );
  check('token revoked-* → 400 VALIDATION_ERROR', legacy.ok === false && legacy.status === 400, JSON.stringify(legacy));
};

const cleanup = async () => {
  for (const id of cleanupIds) {
    const r = await Reservation.findByPk(id);
    if (r?.slot_id) {
      const slot = await ParkingSlot.findByPk(r.slot_id);
      if (slot && slot.status !== 'available') await slot.update({ status: 'available' });
    }
    await Reservation.destroy({ where: { reservation_id: id } });
  }
};

try {
  await run();
} catch (err) {
  fail += 1;
  console.log('LỖI NGOÀI DỰ KIẾN:', err.message);
} finally {
  await cleanup();
  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
}
