/**
 * Seed dữ liệu DEMO cho buổi chấm (Assessment 02): tập trung 2 luồng chính
 * walk-in (khách vãng lai) và reservation (khách đặt chỗ).
 *
 * ⚠️ PHÁ HỦY DỮ LIỆU: script DROP toàn bộ bảng (sync force) rồi tạo lại + seed.
 * Chỉ chạy trên DB local demo.
 *
 * Dùng:  npm run seed --prefix server      (hoặc: node scripts/seedDemo.js)
 *
 * Tạo: 4 user (admin/manager/staff/user), 2 loại xe, 2 tầng, mỗi tầng 1 khu ô tô
 * + 1 khu xe máy (8 chỗ/khu), cổng tòa nhà (IN/OUT) + cổng mỗi tầng (IN/OUT),
 * bảng giá theo loại xe, 1 đặt chỗ đã xác nhận sẵn (fallback demo reservation
 * không cần đặt + thanh toán trực tiếp), và 1 khách đặt chỗ ĐANG ĐỖ (checked_in
 * + phiên active) để test luồng check-out.
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
} from '../src/models/index.js';
import { ensureRoles } from '../src/utils/ensureRoles.js';
import { ROLES } from '../src/middleware/rbac.js';
import { generateQrToken } from '../src/utils/qr.js';
import { normalizePlateVN } from '../src/utils/plateVN.js';

dotenv.config();

const SLOTS_PER_ZONE = 8;
const hash = (pw) => bcrypt.hash(pw, 10);
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
    ['admin', 'Admin@123456', 'System Administrator', ROLES.ADMIN, 'admin@pbms.local'],
    ['manager', 'Manager@123456', 'Quản lý bãi', ROLES.MANAGER, 'manager@pbms.local'],
    ['staff', 'Staff@123456', 'Nhân viên trực cổng', ROLES.STAFF, 'staff@pbms.local'],
    ['user', 'User@123456', 'Khách đặt chỗ', ROLES.USER, 'user@pbms.local'],
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
    const floor = await Floor.create({
      floor_code: `F${level}`,
      floor_level: level,
      label: `Tầng ${level}`,
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
      zone_code: 'A', label: `Tầng ${level} - Khu ô tô`,
      total_slots: SLOTS_PER_ZONE, monthly_pass_capacity: 0,
    });
    const bikeZone = await Zone.create({
      floor_id: floor.floor_id, vehicle_type_id: bike.vehicle_type_id,
      zone_code: 'B', label: `Tầng ${level} - Khu xe máy`,
      total_slots: SLOTS_PER_ZONE, monthly_pass_capacity: 0,
    });

    for (let i = 1; i <= SLOTS_PER_ZONE; i++) {
      await ParkingSlot.create({
        zone_id: carZone.zone_id, slot_code: `A${pad2(i)}`, status: 'available',
        distance_to_gate: i * 2, distance_to_elevator: i * 1.5,
      });
      await ParkingSlot.create({
        zone_id: bikeZone.zone_id, slot_code: `B${pad2(i)}`, status: 'available',
        distance_to_gate: i * 2, distance_to_elevator: i * 1.5,
      });
    }

    floors.push({ floor, carZone, bikeZone });
  }
  console.log(`• ${floors.length} tầng, mỗi tầng 2 khu × ${SLOTS_PER_ZONE} chỗ, cổng tòa + cổng tầng`);

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
  const inSessQr = generateQrToken();
  const inSession = await ParkingSession.create({
    user_id: users.user.user_id,
    reservation_id: inReservation.reservation_id,
    gate_id: f1InGate.gate_id,
    slot_id: occSlot.slot_id,
    vehicle_type_id: car.vehicle_type_id,
    plate_number: inPlate,
    time_in: new Date(now.getTime() - 2 * 60 * 60 * 1000), // đỗ ~2h → phí ô tô ≈ 30.000đ
    qr_token: inSessQr,
    check_in_by: users.staff.user_id,
    session_type: 'reservation',
    status: 'active',
    calculated_fee: null,
  });

  console.log('\n================ SEED DONE ================');
  console.log('Tài khoản (username / password):');
  console.log('  admin   / Admin@123456');
  console.log('  manager / Manager@123456');
  console.log('  staff   / Staff@123456');
  console.log('  user    / User@123456');
  console.log('\nĐặt chỗ confirmed sẵn (demo luồng reservation, không cần thanh toán):');
  console.log(`  reservationId = ${reservation.reservation_id}`);
  console.log(`  biển số       = ${resPlate}  (Tầng 1 · khu ô tô · chỗ ${resSlot.slot_code})`);
  console.log(`  qr_token      = ${resQr}`);
  console.log('\nKhách ĐẶT CHỖ đang đỗ (checked_in + phiên active) — test check-OUT:');
  console.log(`  sessionId     = ${inSession.session_id}`);
  console.log(`  biển số       = ${inPlate}  (Tầng 1 · khu ô tô · chỗ ${occSlot.slot_code} · đỗ ~2h ≈ 30.000đ)`);
  console.log(`  session qr    = ${inSessQr}`);
  console.log('==========================================\n');
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed thất bại:', err.message || err);
  process.exit(1);
});
