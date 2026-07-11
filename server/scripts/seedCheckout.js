/**
 * Seed dữ liệu để TEST CHECK-OUT của vé tháng (monthly_pass) và đặt chỗ (reservation).
 *
 * Khác seedDemo: ngoài hạ tầng cơ bản, script này tạo sẵn các phiên ĐANG ĐỖ
 * (ParkingSession status='active', slot 'occupied') để bấm check-out được NGAY,
 * không phải đi qua bước đặt chỗ → thanh toán → check-in.
 *
 * ⚠️ PHÁ HỦY DỮ LIỆU: DROP toàn bộ bảng (sync force) rồi tạo lại + seed.
 * Chỉ chạy trên DB local demo.
 *
 * Dùng:  npm run seed:checkout --prefix server   (hoặc: node scripts/seedCheckout.js)
 *
 * Kịch bản tạo sẵn (đều ở Tầng 1 · khu ô tô):
 *   R0  reservation 'confirmed'            → test CHECK-IN  (chưa vào bãi)
 *   R1  reservation 'checked_in' + session → test CHECK-OUT (đang đỗ ~2h, phí > 0)
 *   P1  vé tháng 'active' + session        → test CHECK-OUT (đang đỗ ~1h, phí = 0)
 *   P2  vé tháng 'active', CHƯA có session → test CHECK-IN vé tháng (staff tạo) rồi check-out
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import sequelize, { syncSchema } from '../src/config/db.js';
import {
  Role,
  UserAccount,
  VehicleType,
  Floor,
  Zone,
  ParkingSlot,
  Gate,
  PricingRule,
  Reservation,
  MonthlyPass,
  ParkingSession,
} from '../src/models/index.js';
import { ensureRoles } from '../src/utils/ensureRoles.js';
import { ROLES } from '../src/middleware/rbac.js';
import { generateQrToken } from '../src/utils/qr.js';
import { normalizePlateVN } from '../src/utils/plateVN.js';

dotenv.config();

const SLOTS_PER_ZONE = 8;
const PASS_CAPACITY = 4; // số chỗ dành cho vé tháng ở khu ô tô T1 (OR-03)
const hash = (pw) => bcrypt.hash(pw, 10);
const pad2 = (n) => String(n).padStart(2, '0');

const now = new Date();
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysFromNow = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
const dateOnly = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const run = async () => {
  await sequelize.authenticate();
  console.log('• DB connected — dropping & recreating all tables…');
  await syncSchema({ fresh: true }); // sync({ force: true }) — DROP + CREATE sạch
  await ensureRoles();

  const roles = {};
  for (const r of await Role.findAll()) roles[r.role_name] = r.role_id;

  // --- Users ---------------------------------------------------------------
  const accounts = [
    ['admin', 'Admin@123456', 'System Administrator', ROLES.ADMIN, 'admin@pbms.local'],
    ['manager', 'Manager@123456', 'Quản lý bãi', ROLES.MANAGER, 'manager@pbms.local'],
    ['staff', 'Staff@123456', 'Nhân viên trực cổng', ROLES.STAFF, 'staff@pbms.local'],
    ['user', 'User@123456', 'Khách', ROLES.USER, 'user@pbms.local'],
  ];
  const users = {};
  for (const [username, pw, fullName, roleName, email] of accounts) {
    users[username] = await UserAccount.create({
      username,
      password_hash: await hash(pw),
      full_name: fullName,
      role_id: roles[roleName],
      email,
      is_active: true,
      email_verified: true,
    });
  }
  console.log(`• Users: ${accounts.map((a) => a[0]).join(', ')}`);

  // --- Vehicle types -------------------------------------------------------
  const car = await VehicleType.create({ type_name: 'Ô tô', type_code: 'CAR' });
  const bike = await VehicleType.create({ type_name: 'Xe máy', type_code: 'BIKE' });

  // --- Pricing rules (đang hiệu lực) — ô tô 15.000đ/giờ ---------------------
  const effectiveFrom = new Date('2026-01-01T00:00:00Z');
  await PricingRule.create({
    vehicle_type_id: car.vehicle_type_id, unit: 60, base_rate: 15000,
    effective_from: effectiveFrom, effective_to: null,
  });
  await PricingRule.create({
    vehicle_type_id: bike.vehicle_type_id, unit: 60, base_rate: 5000,
    effective_from: effectiveFrom, effective_to: null,
  });

  // --- Cổng cấp tòa nhà (floor_id = NULL) — điểm ra chung -------------------
  await Gate.create({
    floor_id: null, gate_code: 'BLD-IN', direction: 'in',
    vehicle_type_id: null, label: 'Cổng vào tòa nhà', is_active: true,
  });
  const bldOut = await Gate.create({
    floor_id: null, gate_code: 'BLD-OUT', direction: 'out',
    vehicle_type_id: null, label: 'Cổng ra tòa nhà', is_active: true,
  });

  // --- Tầng + khu + chỗ + cổng tầng ---------------------------------------
  const floors = [];
  for (const level of [1, 2]) {
    const floor = await Floor.create({
      floor_code: `F${level}`, floor_level: level, label: `Tầng ${level}`,
    });

    const inGate = await Gate.create({
      floor_id: floor.floor_id, gate_code: `F${level}-IN`, direction: 'in',
      vehicle_type_id: null, label: `Tầng ${level} - Cổng vào`, is_active: true,
    });
    await Gate.create({
      floor_id: floor.floor_id, gate_code: `F${level}-OUT`, direction: 'out',
      vehicle_type_id: null, label: `Tầng ${level} - Cổng ra`, is_active: true,
    });

    const carZone = await Zone.create({
      floor_id: floor.floor_id, vehicle_type_id: car.vehicle_type_id,
      zone_code: 'A', label: `Tầng ${level} - Khu ô tô`,
      total_slots: SLOTS_PER_ZONE,
      // Chỉ T1 mở capacity vé tháng để test (T2 = 0)
      monthly_pass_capacity: level === 1 ? PASS_CAPACITY : 0,
    });
    const bikeZone = await Zone.create({
      floor_id: floor.floor_id, vehicle_type_id: bike.vehicle_type_id,
      zone_code: 'B', label: `Tầng ${level} - Khu xe máy`,
      total_slots: SLOTS_PER_ZONE, monthly_pass_capacity: 0,
    });

    for (let i = 1; i <= SLOTS_PER_ZONE; i++) {
      await ParkingSlot.create({
        zone_id: carZone.zone_id, slot_code: `A${pad2(i)}`, status: 'available',
        distance_to_gate: i * 2,
      });
      await ParkingSlot.create({
        zone_id: bikeZone.zone_id, slot_code: `B${pad2(i)}`, status: 'available',
        distance_to_gate: i * 2,
      });
    }

    floors.push({ floor, carZone, bikeZone, inGate });
  }
  console.log(`• ${floors.length} tầng, mỗi tầng 2 khu × ${SLOTS_PER_ZONE} chỗ; T1 capacity vé tháng = ${PASS_CAPACITY}`);

  const { floor: f1, carZone: f1Car, inGate: f1In } = floors[0];

  // Lấy 3 chỗ trống riêng biệt ở khu ô tô T1 cho R0/R1/P1
  const carSlots = await ParkingSlot.findAll({
    where: { zone_id: f1Car.zone_id, status: 'available' },
    order: [['slot_id', 'ASC']],
    limit: 3,
  });
  const [slotR0, slotR1, slotP1] = carSlots;

  // === R0 — Reservation CONFIRMED (test CHECK-IN, chưa vào bãi) =============
  await slotR0.update({ status: 'reserved' });
  const plateR0 = normalizePlateVN('51F-67890');
  const qrR0 = generateQrToken();
  const r0 = await Reservation.create({
    user_id: users.user.user_id,
    vehicle_type_id: car.vehicle_type_id,
    floor_id: f1.floor_id, zone_id: f1Car.zone_id, slot_id: slotR0.slot_id,
    plate_number: plateR0,
    start_time: hoursAgo(1),            // đang trong khung giờ
    end_time: daysFromNow(7),           // hạn rộng để check-in lúc nào cũng được
    status: 'confirmed', reservation_type: 'standard', qr_token: qrR0,
  });

  // === R1 — Reservation CHECKED_IN + session active (test CHECK-OUT) ========
  await slotR1.update({ status: 'occupied' });
  const plateR1 = normalizePlateVN('51F-11111');
  const qrR1Res = generateQrToken();
  const r1 = await Reservation.create({
    user_id: users.user.user_id,
    vehicle_type_id: car.vehicle_type_id,
    floor_id: f1.floor_id, zone_id: f1Car.zone_id, slot_id: slotR1.slot_id,
    plate_number: plateR1,
    start_time: hoursAgo(2), end_time: daysFromNow(5),
    status: 'checked_in', reservation_type: 'standard', qr_token: qrR1Res,
  });
  const qrR1Sess = generateQrToken();
  const sessR1 = await ParkingSession.create({
    user_id: users.user.user_id, reservation_id: r1.reservation_id,
    gate_id: f1In.gate_id, slot_id: slotR1.slot_id,
    vehicle_type_id: car.vehicle_type_id, plate_number: plateR1,
    time_in: hoursAgo(2),               // đỗ 2h → phí ≈ 30.000đ
    qr_token: qrR1Sess, check_in_by: users.staff.user_id,
    session_type: 'reservation', status: 'active', calculated_fee: null,
  });

  // === P1 — Vé tháng ACTIVE + session monthly_pass (test CHECK-OUT phí 0) ====
  await slotP1.update({ status: 'occupied' });
  const plateP1 = normalizePlateVN('51F-22222');
  const qrP1Pass = generateQrToken();
  const p1 = await MonthlyPass.create({
    user_id: users.user.user_id,
    vehicle_type_id: car.vehicle_type_id, floor_id: f1.floor_id,
    plate_number: plateP1,
    valid_from_time: '00:00:00', valid_to_time: '23:59:59', // cả ngày → luôn trong khung
    start_date: dateOnly(daysFromNow(-5)), end_date: dateOnly(daysFromNow(25)),
    status: 'active', qr_token: qrP1Pass,
  });
  const qrP1Sess = generateQrToken();
  const sessP1 = await ParkingSession.create({
    user_id: users.user.user_id, pass_id: p1.pass_id,
    gate_id: f1In.gate_id, slot_id: slotP1.slot_id,
    vehicle_type_id: car.vehicle_type_id, plate_number: plateP1,
    time_in: hoursAgo(1),
    qr_token: qrP1Sess, check_in_by: users.staff.user_id,
    session_type: 'monthly_pass', status: 'active', calculated_fee: 0,
  });

  // === P2 — Vé tháng ACTIVE, CHƯA có session (test CHECK-IN vé tháng) ========
  const plateP2 = normalizePlateVN('51F-33333');
  const qrP2Pass = generateQrToken();
  const p2 = await MonthlyPass.create({
    user_id: users.user.user_id,
    vehicle_type_id: car.vehicle_type_id, floor_id: f1.floor_id,
    plate_number: plateP2,
    valid_from_time: '00:00:00', valid_to_time: '23:59:59',
    start_date: dateOnly(daysFromNow(-5)), end_date: dateOnly(daysFromNow(25)),
    status: 'active', qr_token: qrP2Pass,
  });

  console.log('\n================ SEED CHECKOUT DONE ================');
  console.log('Tài khoản (username / password):');
  console.log('  staff / Staff@123456   (dùng để check-out tiền mặt + check-in)');
  console.log('  user  / User@123456');
  console.log(`\nCổng RA tòa nhà:  gateId = ${bldOut.gate_id}  (BLD-OUT)`);
  console.log('---------------------------------------------------');
  console.log('R1 ▶ ĐẶT CHỖ đang đỗ — test CHECK-OUT (phí ≈ 30.000đ, đỗ 2h):');
  console.log(`     sessionId = ${sessR1.session_id} | plate ${plateR1} | chỗ ${slotR1.slot_code}`);
  console.log(`     session qr_token = ${qrR1Sess}`);
  console.log('\nP1 ▶ VÉ THÁNG đang đỗ — test CHECK-OUT (phí = 0, free):');
  console.log(`     sessionId = ${sessP1.session_id} | plate ${plateP1} | passId ${p1.pass_id} | chỗ ${slotP1.slot_code}`);
  console.log(`     session qr_token = ${qrP1Sess}`);
  console.log('---------------------------------------------------');
  console.log('R0 ▶ ĐẶT CHỖ confirmed — test CHECK-IN trước:');
  console.log(`     reservationId = ${r0.reservation_id} | plate ${plateR0} | qr ${qrR0}`);
  console.log('P2 ▶ VÉ THÁNG chưa vào — test CHECK-IN (staff /sessions, plate dưới, T1, ô tô):');
  console.log(`     passId = ${p2.pass_id} | plate ${plateP2}`);
  console.log('===================================================');
  console.log('\nGỢI Ý check-out KHÔNG đụng PayOS (tiền mặt, staff):');
  console.log('  POST /api/sessions/cash-checkout');
  console.log(`    R1: { "qrToken": "${qrR1Sess}", "gateId": ${bldOut.gate_id} }   → thu 30.000đ, đóng phiên`);
  console.log(`    P1: { "qrToken": "${qrP1Sess}", "gateId": ${bldOut.gate_id} }   → phí 0, đóng phiên`);
  console.log('  (Header: Authorization: Bearer <token staff>)');
  console.log('\nLƯU Ý: kiosk /api/gates/scan ở cổng BLD-OUT với phí>0 (R1) sẽ tạo link PayOS thật.');
  console.log('       Vé tháng (P1) phí 0 nên scan kiosk an toàn, không tạo link.');
  console.log('===================================================\n');
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed thất bại:', err.message || err);
  process.exit(1);
});
