/**
 * Seed dữ liệu DEMO cho buổi chấm (Assessment 02): tập trung 2 luồng chính
 * walk-in (khách vãng lai) và reservation (khách đặt chỗ).
 *
 * ⚠️ PHÁ HỦY DỮ LIỆU: script DROP toàn bộ bảng (sync force) rồi tạo lại + seed.
 * Chỉ chạy trên DB local demo.
 *
 * Dùng:  npm run seed --prefix server      (hoặc: node scripts/seedDemo.js)
 *
 * Tạo: 4 user (admin/manager/staff/user, mật khẩu đều 123456), 3 loại xe (CAR/BIKE/CAR7),
 * 3 tầng — F1, F2 phân khu (zoned: 1 khu ô tô + 1 khu xe máy, 8 chỗ/khu) và F3 riêng xe máy
 * (single). Mã khu tự sinh <TẦNG>-<LOẠI XE>-<NN> (F1-CAR-01), mã chỗ tự sinh <MÃ KHU>-<NN>
 * (F1-CAR-01-01). Kèm cổng tòa nhà (IN/OUT) + cổng mỗi tầng (IN/OUT), bảng giá theo loại xe,
 * 1 đặt chỗ đã xác nhận sẵn (fallback demo reservation không cần đặt + thanh toán trực tiếp),
 * và 1 khách đặt chỗ ĐANG ĐỖ (checked_in + phiên active) để test luồng check-out.
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
  ParkingSession,
  Payment,
} from '../src/models/index.js';
import { ensureRoles } from '../src/utils/ensureRoles.js';
import { ROLES } from '../src/middleware/rbac.js';
import { generateQrToken } from '../src/utils/qr.js';
import { normalizePlateVN } from '../src/utils/plateVN.js';

dotenv.config();

const SLOTS_PER_ZONE = 8;
const BOOKING_FEE = 20000; // khớp default booking_fee trong utils/settings.js
const hash = (pw) => bcrypt.hash(pw, 10);

// Đơn confirmed NGOÀI ĐỜI luôn đi kèm payment success (xác nhận = đã trả phí giữ chỗ).
// Seed thiếu payment làm luồng HỦY + HOÀN TIỀN demo sai (không có gì để hoàn → FE báo nhầm).
let seedOrderCode = Math.floor(Date.now() / 1000) * 1000;
const paySuccess = (reservationId) =>
  Payment.create({
    reservation_id: reservationId,
    order_code: (seedOrderCode += 1),
    amount: BOOKING_FEE,
    status: 'success',
    method: 'payos',
    paid_at: new Date(),
  });
const pad2 = (n) => String(n).padStart(2, '0');

const run = async () => {
  await sequelize.authenticate();
  console.log('• DB connected — dropping & recreating all tables…');
  await syncSchema({ fresh: true }); // sync({ force: true }) — DROP + CREATE sạch
  await ensureRoles();

  const roles = {};
  for (const r of await Role.findAll()) roles[r.role_name] = r.role_id;

  // --- Users ---------------------------------------------------------------
  const accounts = [
    ['admin', '123456', 'System Administrator', ROLES.ADMIN, 'admin@pbms.local'],
    ['manager', '123456', 'Quản lý bãi', ROLES.MANAGER, 'manager@pbms.local'],
    ['staff', '123456', 'Nhân viên trực cổng', ROLES.STAFF, 'staff@pbms.local'],
    ['user', '123456', 'Khách đặt chỗ', ROLES.USER, 'user@pbms.local'],
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

  // --- Vehicle types (slot_area_m2 = diện tích hiệu dụng 1 slot, đã gộp lối đi) ---
  const car = await VehicleType.create({ type_name: 'Ô tô (≤5 chỗ)', type_code: 'CAR', slot_area_m2: 25 });
  const bike = await VehicleType.create({ type_name: 'Xe máy', type_code: 'BIKE', slot_area_m2: 1.8 });
  const car7 = await VehicleType.create({ type_name: 'Ô tô 6-7 chỗ/SUV', type_code: 'CAR7', slot_area_m2: 30 });

  // --- Pricing rules (đang hiệu lực) --------------------------------------
  const effectiveFrom = new Date('2026-01-01T00:00:00Z');
  await PricingRule.create({
    vehicle_type_id: car.vehicle_type_id,
    unit: 60,
    base_rate: 15000,
    effective_from: effectiveFrom,
    effective_to: null,
  });
  await PricingRule.create({
    vehicle_type_id: bike.vehicle_type_id,
    unit: 60,
    base_rate: 5000,
    effective_from: effectiveFrom,
    effective_to: null,
  });
  await PricingRule.create({
    vehicle_type_id: car7.vehicle_type_id,
    unit: 60,
    base_rate: 20000,
    effective_from: effectiveFrom,
    effective_to: null,
  });

  // --- Cổng cấp tòa nhà (floor_id = NULL) ----------------------------------
  await Gate.create({
    floor_id: null, gate_code: 'BLD-IN', direction: 'in',
    vehicle_type_id: null, label: 'Cổng vào tòa nhà', is_active: true,
  });
  await Gate.create({
    floor_id: null, gate_code: 'BLD-OUT', direction: 'out',
    vehicle_type_id: null, label: 'Cổng ra tòa nhà', is_active: true,
  });

  // --- Tầng + khu + chỗ + cổng tầng ---------------------------------------
  const floors = [];
  for (const level of [1, 2]) {
    // Lv2 — tầng phân khu (zoned): khu ô tô + khu xe máy. area_m2 đủ chứa cả 2 khu.
    const floor = await Floor.create({
      floor_code: `F${level}`,
      floor_level: level,
      label: `Tầng ${level}`,
      layout_mode: 'zoned',
      vehicle_type_id: null,
      // Tầng bãi xe thực tế ~1.000–5.000 m²/tầng. Để 1.000: 2 khu seed dùng 214.4 m²,
      // còn ~785 m² trống → đủ chỗ thêm khu / sinh nhiều chỗ (demo bulk) cho "ra dáng".
      area_m2: 1000,
    });

    await Gate.create({
      floor_id: floor.floor_id, gate_code: `F${level}-IN`, direction: 'in',
      vehicle_type_id: null, label: `Tầng ${level} - Cổng vào`, is_active: true,
    });
    await Gate.create({
      floor_id: floor.floor_id, gate_code: `F${level}-OUT`, direction: 'out',
      vehicle_type_id: null, label: `Tầng ${level} - Cổng ra`, is_active: true,
    });

    const carZone = await Zone.create({
      floor_id: floor.floor_id, vehicle_type_id: car.vehicle_type_id,
      zone_code: `F${level}-${car.type_code}-01`, label: `Tầng ${level} - Khu ô tô`,
      total_slots: SLOTS_PER_ZONE, monthly_pass_capacity: 0,
    });
    const bikeZone = await Zone.create({
      floor_id: floor.floor_id, vehicle_type_id: bike.vehicle_type_id,
      zone_code: `F${level}-${bike.type_code}-01`, label: `Tầng ${level} - Khu xe máy`,
      total_slots: SLOTS_PER_ZONE, monthly_pass_capacity: 0,
    });

    for (let i = 1; i <= SLOTS_PER_ZONE; i++) {
      await ParkingSlot.create({
        zone_id: carZone.zone_id, slot_code: `${carZone.zone_code}-${pad2(i)}`, status: 'available',
        distance_to_gate: i * 2, distance_to_elevator: i * 1.5,
      });
      await ParkingSlot.create({
        zone_id: bikeZone.zone_id, slot_code: `${bikeZone.zone_code}-${pad2(i)}`, status: 'available',
        distance_to_gate: i * 2, distance_to_elevator: i * 1.5,
      });
    }

    floors.push({ floor, carZone, bikeZone });
  }
  console.log(`• ${floors.length} tầng (zoned), mỗi tầng 2 khu × ${SLOTS_PER_ZONE} chỗ, cổng tòa + cổng tầng`);

  // --- Tầng SINGLE (Lv1: cả tầng 1 loại xe — xe máy) ----------------------
  // Khu mặc định total_slots = floor(area / slot_area) = floor(120 / 1.8) = 66.
  const F3_AREA = 120;
  const f3 = await Floor.create({
    floor_code: 'F3',
    floor_level: 3,
    label: 'Tầng 3 (riêng xe máy)',
    layout_mode: 'single',
    vehicle_type_id: bike.vehicle_type_id,
    area_m2: F3_AREA,
  });
  await Gate.create({
    floor_id: f3.floor_id, gate_code: 'F3-IN', direction: 'in',
    vehicle_type_id: bike.vehicle_type_id, label: 'Tầng 3 - Cổng vào', is_active: true,
  });
  await Gate.create({
    floor_id: f3.floor_id, gate_code: 'F3-OUT', direction: 'out',
    vehicle_type_id: bike.vehicle_type_id, label: 'Tầng 3 - Cổng ra', is_active: true,
  });
  const f3Zone = await Zone.create({
    floor_id: f3.floor_id, vehicle_type_id: bike.vehicle_type_id,
    zone_code: `F3-${bike.type_code}-01`, label: 'Tầng 3 - Xe máy',
    total_slots: Math.floor(F3_AREA / 1.8), monthly_pass_capacity: 0,
  });
  for (let i = 1; i <= 10; i++) {
    await ParkingSlot.create({
      zone_id: f3Zone.zone_id, slot_code: `${f3Zone.zone_code}-${pad2(i)}`, status: 'available',
      distance_to_gate: i * 2, distance_to_elevator: i * 1.5,
    });
  }
  console.log(`• Tầng 3 (single/xe máy) — sức chứa ${f3Zone.total_slots} slot (area ${F3_AREA} m²), tạo sẵn 10 chỗ`);

  // --- 1 đặt chỗ đã CONFIRMED sẵn (fallback demo, không cần đặt + trả tiền) -
  const { floor: f1, carZone: f1Car } = floors[0];
  const resSlot = await ParkingSlot.findOne({
    where: { zone_id: f1Car.zone_id, status: 'available' },
    order: [['slot_id', 'ASC']],
  });
  await resSlot.update({ status: 'reserved' });

  const now = new Date();
  const resPlate = normalizePlateVN('51F-67890');
  const resQr = generateQrToken();
  const reservation = await Reservation.create({
    user_id: users.user.user_id,
    vehicle_type_id: car.vehicle_type_id,
    floor_id: f1.floor_id,
    zone_id: f1Car.zone_id,
    slot_id: resSlot.slot_id,
    plate_number: resPlate,
    start_time: new Date(now.getTime() - 60 * 60 * 1000), // bắt đầu 1h trước → trong khung giờ
    end_time: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // hạn rộng 7 ngày để check-in bất cứ lúc nào
    status: 'confirmed',
    reservation_type: 'standard',
    qr_token: resQr,
  });
  await paySuccess(reservation.reservation_id);

  // --- 1 khách ĐẶT CHỖ ĐANG ĐỖ (checked_in + phiên active) — test luồng check-OUT ---
  const f1InGate = await Gate.findOne({ where: { gate_code: 'F1-IN' } });
  const occSlot = await ParkingSlot.findOne({
    where: { zone_id: f1Car.zone_id, status: 'available' },
    order: [['slot_id', 'ASC']],
  });
  await occSlot.update({ status: 'occupied' });

  const inPlate = normalizePlateVN('51F-11111');
  const inResQr = generateQrToken();
  const inReservation = await Reservation.create({
    user_id: users.user.user_id,
    vehicle_type_id: car.vehicle_type_id,
    floor_id: f1.floor_id,
    zone_id: f1Car.zone_id,
    slot_id: occSlot.slot_id,
    plate_number: inPlate,
    start_time: new Date(now.getTime() - 2 * 60 * 60 * 1000), // vào 2h trước
    end_time: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
    status: 'checked_in',
    reservation_type: 'standard',
    qr_token: inResQr,
  });
  await paySuccess(inReservation.reservation_id);
  const inSessQr = generateQrToken();
  const inSession = await ParkingSession.create({
    user_id: users.user.user_id,
    reservation_id: inReservation.reservation_id,
    gate_id: f1InGate.gate_id,
    slot_id: occSlot.slot_id,
    vehicle_type_id: car.vehicle_type_id,
    plate_number: inPlate,
    time_in: new Date(now.getTime() - 2 * 60 * 60 * 1000), // đỗ ~2h → phí ô tô ≈ 30.000đ
    gate_stage: 'on_floor', // xe đang đỗ trên tầng → sẵn sàng quét cổng tầng RA để test check-OUT
    qr_token: inSessQr,
    check_in_by: users.staff.user_id,
    session_type: 'reservation',
    status: 'active',
    calculated_fee: null,
  });

  // --- 1 SLOT — NHIỀU KHUNG GIỜ khác nhau (cùng 1 chỗ, các đơn confirmed KHÔNG trùng giờ) ---
  const atHour = (base, h) => { const d = new Date(base); d.setHours(h, 0, 0, 0); return d; };
  const d1 = new Date(now.getTime() + 24 * 60 * 60 * 1000); // ngày mai
  const d2 = new Date(now.getTime() + 48 * 60 * 60 * 1000); // ngày kia
  const windows = [
    { plate: '51F-30001', start: atHour(d1, 6), end: atHour(d1, 12), shift: 'morning' },
    { plate: '51F-30002', start: atHour(d1, 18), end: atHour(d1, 22), shift: 'evening' },
    { plate: '51F-30003', start: atHour(d2, 6), end: atHour(d2, 12), shift: 'morning' },
  ];
  const multiSlot = await ParkingSlot.findOne({
    where: { zone_id: f1Car.zone_id, status: 'available' },
    order: [['slot_id', 'ASC']],
  });
  await multiSlot.update({ status: 'reserved' });
  const multiReservations = [];
  for (const w of windows) {
    const r = await Reservation.create({
      user_id: users.user.user_id,
      vehicle_type_id: car.vehicle_type_id,
      floor_id: f1.floor_id,
      zone_id: f1Car.zone_id,
      slot_id: multiSlot.slot_id,
      plate_number: normalizePlateVN(w.plate),
      start_time: w.start,
      end_time: w.end,
      status: 'confirmed',
      reservation_type: w.shift,
      qr_token: generateQrToken(),
    });
    await paySuccess(r.reservation_id);
    multiReservations.push({ r, w });
  }

  console.log('\n================ SEED DONE ================');
  console.log('Tài khoản (username / password):');
  console.log('  admin   / 123456');
  console.log('  manager / 123456');
  console.log('  staff   / 123456');
  console.log('  user    / 123456');
  console.log('\nĐặt chỗ confirmed sẵn (demo luồng reservation, không cần thanh toán):');
  console.log(`  reservationId = ${reservation.reservation_id}`);
  console.log(`  biển số       = ${resPlate}  (Tầng 1 · khu ô tô · chỗ ${resSlot.slot_code})`);
  console.log(`  qr_token      = ${resQr}`);
  console.log('\nKhách ĐẶT CHỖ đang đỗ (checked_in + phiên active) — test check-OUT:');
  console.log(`  sessionId     = ${inSession.session_id}`);
  console.log(`  biển số       = ${inPlate}  (Tầng 1 · khu ô tô · chỗ ${occSlot.slot_code} · đỗ ~2h ≈ 30.000đ)`);
  console.log(`  session qr    = ${inSessQr}`);
  console.log(`\n1 SLOT — NHIỀU KHUNG GIỜ (cùng chỗ ${multiSlot.slot_code}, ${multiReservations.length} đơn confirmed KHÔNG trùng giờ):`);
  for (const { r, w } of multiReservations) {
    console.log(`  resId=${r.reservation_id} | ${w.plate} | ${w.start.toLocaleString('vi-VN')} → ${w.end.toLocaleString('vi-VN')} (${w.shift})`);
  }
  console.log('==========================================\n');
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed thất bại:', err.message || err);
  process.exit(1);
});
