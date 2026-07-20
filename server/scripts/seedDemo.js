/**
 * Seed dữ liệu DEMO cho buổi chấm (Assessment 02): tập trung 2 luồng chính
 * walk-in (khách vãng lai) và reservation (khách đặt chỗ).
 *
 * ⚠️ PHÁ HỦY DỮ LIỆU: script DROP toàn bộ bảng (sync force) rồi tạo lại + seed.
 * Chỉ chạy trên DB local demo.
 *
 * Dùng:  npm run seed --prefix server      (hoặc: node scripts/seedDemo.js)
 *
 * Tạo: 6 user (admin/manager/staff/user/user2/chuaverify, mật khẩu đều 123456), 3 loại xe (CAR/BIKE/CAR7),
 * 4 tầng — B1 (hầm), F1, F2 phân khu (zoned: 1 khu ô tô + 1 khu xe máy, 8 chỗ/khu) và F3 riêng
 * xe máy (single). Diện tích sàn theo luật hình khối (assertFloorAreaMonotonic — hầm & tháp là 2
 * chuỗi riêng): tháp F1 1000 = F2 1000 ≥ F3 800; hầm B1 400 (hầm một phần, nhỏ hơn tháp — có thật).
 * Mã khu tự sinh <TẦNG>-<LOẠI XE>-<NN> (F1-CAR-01), mã chỗ tự sinh <MÃ KHU>-<NN>
 * (F1-CAR-01-01). Kèm cổng tòa nhà (IN/OUT) + cổng mỗi tầng (IN/OUT), bảng giá theo loại xe,
 * 1 đặt chỗ đã xác nhận sẵn (fallback demo reservation không cần đặt + thanh toán trực tiếp),
 * và 1 khách đặt chỗ ĐANG ĐỖ (checked_in + phiên active) để test luồng check-out.
 *
 * PHỦ ĐỦ LUỒNG (phần mở rộng cuối file): đơn pending (test "Trả tiếp"), 3 kiểu hoàn tiền
 * (chờ hoàn / quá hạn STK / đã hoàn), đơn completed + no_show (QR lịch sử), đơn checked_in
 * LỐ GIỜ khung đặt (phụ thu), vé tháng active/pending/expired, user chưa verify email,
 * user có STK ngân hàng, 2 sự cố (open + resolved).
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
  MonthlyPass,
  RefundRequest,
  Incident,
} from '../src/models/index.js';
import { ensureRoles } from '../src/utils/ensureRoles.js';
import { ROLES } from '../src/middleware/rbac.js';
import { generateQrToken } from '../src/utils/qr.js';
import { normalizePlateVN } from '../src/utils/plateVN.js';
import { resolveShiftWindow } from '../src/utils/shifts.js';

dotenv.config();

const SLOTS_PER_ZONE = 8;
// Diện tích sàn (m²) — xem assertFloorAreaMonotonic: hầm và tháp là 2 chuỗi riêng, mỗi chuỗi càng
// xa mặt đất càng không rộng ra. B1 (hầm gửi xe một phần) nhỏ hơn tháp là chuyện thật; tháp thu
// nhỏ dần F1=F2 ≥ F3. B1 = 400 vẫn ≥ 214.4 m² mà 2 khu seed cần.
const FLOOR_AREA = { B1: 400, F1: 1000, F2: 1000, F3: 800 };
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
const dateStrOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Đơn đặt THẬT luôn khớp 1 CA cố định (server lưu reservation_type = mã ca) → FE hiện
// "Ca X · giờ". Seed phải cùng khuôn: KHÔNG dùng cửa sổ tùy ý / 'standard' (sẽ hiện thô như
// "16:38 20-07 → 17:38 27-07", không có nhãn ca). Hai helper dưới trả {shiftId, start, end}.

// Ca CHỨA thời điểm `at` — dùng cho đơn "đang mở" (confirmed/checked_in): now nằm trong khung
// nên check-in demo vẫn chạy, mà card vẫn hiện đúng ca.
const shiftWindowContaining = (at) => {
  const h = at.getHours();
  const base = new Date(at);
  let shiftId;
  if (h >= 6 && h < 12) shiftId = 'morning';
  else if (h >= 12 && h < 18) shiftId = 'afternoon';
  else if (h >= 18 && h < 22) shiftId = 'evening';
  else { shiftId = 'overnight'; if (h < 6) base.setDate(base.getDate() - 1); } // ca qua đêm mở từ 22:00 hôm trước
  const win = resolveShiftWindow(dateStrOf(base), shiftId);
  return { shiftId, start: win.start, end: win.end };
};
// Ca cố định của ngày cách hôm nay `dayOffset` ngày (âm = quá khứ) — cho đơn tương lai/lịch sử.
const shiftWindowOn = (dayOffset, shiftId) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const win = resolveShiftWindow(dateStrOf(d), shiftId);
  return { shiftId, start: win.start, end: win.end };
};

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
  // Lv2 — tầng phân khu (zoned): khu ô tô + khu xe máy. area_m2 đủ chứa cả 2 khu.
  const createZonedFloor = async ({ code, level, label, areaM2 }) => {
    const floor = await Floor.create({
      floor_code: code,
      floor_level: level,
      label,
      layout_mode: 'zoned',
      vehicle_type_id: null,
      area_m2: areaM2,
    });

    await Gate.create({
      floor_id: floor.floor_id, gate_code: `${code}-IN`, direction: 'in',
      vehicle_type_id: null, label: `${label} - Cổng vào`, is_active: true,
    });
    await Gate.create({
      floor_id: floor.floor_id, gate_code: `${code}-OUT`, direction: 'out',
      vehicle_type_id: null, label: `${label} - Cổng ra`, is_active: true,
    });

    // Mở bán vé tháng tường minh ~25% số slot (capacity=0 = không bán — xem passCapacity.js).
    const carZone = await Zone.create({
      floor_id: floor.floor_id, vehicle_type_id: car.vehicle_type_id,
      zone_code: `${code}-${car.type_code}-01`, label: `${label} - Khu ô tô`,
      total_slots: SLOTS_PER_ZONE, monthly_pass_capacity: Math.max(1, Math.floor(SLOTS_PER_ZONE / 4)),
    });
    const bikeZone = await Zone.create({
      floor_id: floor.floor_id, vehicle_type_id: bike.vehicle_type_id,
      zone_code: `${code}-${bike.type_code}-01`, label: `${label} - Khu xe máy`,
      total_slots: SLOTS_PER_ZONE, monthly_pass_capacity: Math.max(1, Math.floor(SLOTS_PER_ZONE / 4)),
    });

    for (let i = 1; i <= SLOTS_PER_ZONE; i++) {
      await ParkingSlot.create({
        zone_id: carZone.zone_id, slot_code: `${carZone.zone_code}-${pad2(i)}`, status: 'available',
        distance_to_gate: i * 2,
      });
      await ParkingSlot.create({
        zone_id: bikeZone.zone_id, slot_code: `${bikeZone.zone_code}-${pad2(i)}`, status: 'available',
        distance_to_gate: i * 2,
      });
    }

    return { floor, carZone, bikeZone };
  };

  // Hầm B1 — hầm gửi xe một phần, nhỏ hơn tháp (hầm & tháp là 2 chuỗi riêng, không ràng buộc chéo).
  await createZonedFloor({ code: 'B1', level: -1, label: 'Hầm B1', areaM2: FLOOR_AREA.B1 });

  // floors[0] = F1 — phần demo bên dưới (đặt chỗ, phiên đang đỗ) bám vào tầng này.
  const floors = [];
  for (const level of [1, 2]) {
    floors.push(await createZonedFloor({
      code: `F${level}`, level, label: `Tầng ${level}`, areaM2: FLOOR_AREA[`F${level}`],
    }));
  }
  console.log(`• Hầm B1 + ${floors.length} tầng (zoned), mỗi tầng 2 khu × ${SLOTS_PER_ZONE} chỗ, cổng tòa + cổng tầng`);

  // --- Tầng SINGLE (Lv1: cả tầng 1 loại xe — xe máy) ----------------------
  // Tầng trên cùng, hẹp hơn F2 (tháp thu nhỏ dần) nhưng vẫn là sàn thật ~800 m².
  // Khu mặc định total_slots = floor(area / slot_area) = floor(800 / 1.8) = 444.
  const F3_AREA = FLOOR_AREA.F3;
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
  const f3TotalSlots = Math.floor(F3_AREA / 1.8);
  const f3Zone = await Zone.create({
    floor_id: f3.floor_id, vehicle_type_id: bike.vehicle_type_id,
    zone_code: `F3-${bike.type_code}-01`, label: 'Tầng 3 - Xe máy',
    total_slots: f3TotalSlots, monthly_pass_capacity: Math.max(1, Math.floor(f3TotalSlots / 4)),
  });
  for (let i = 1; i <= 10; i++) {
    await ParkingSlot.create({
      zone_id: f3Zone.zone_id, slot_code: `${f3Zone.zone_code}-${pad2(i)}`, status: 'available',
      distance_to_gate: i * 2, distance_to_elevator: i * 1.5,
    });
  }
  console.log(`• Tầng 3 (single/xe máy) — sức chứa ${f3Zone.total_slots} slot (area ${F3_AREA} m²), tạo sẵn 10 chỗ`);

  // --- 1 đặt chỗ đã CONFIRMED sẵn (fallback demo, không cần đặt + trả tiền) -
  // Mô hình SUẤT (migration 008): đặt chỗ không ghim slot — slot_id để null, chỉ giữ
  // zone_id làm khu ƯU TIÊN; slot thật gán lúc check-in (giống vé tháng).
  const { floor: f1, carZone: f1Car } = floors[0];

  const now = new Date();
  // Đơn đặt = 1 CA cố định (như đơn thật) → card hiện "Ca X · giờ" gọn thay vì cửa sổ thô nhiều ngày.
  // parkedShift = ca ĐANG diễn ra (cho xe đã vào, đang đỗ). bookShift nhìn trước 15' (đúng bằng
  // CHECKIN_EARLY_GRACE_MS) để đơn chờ-check-in không rơi vào 4' cuối ca khi seed sát biên — luôn
  // còn runway: now nằm trong [start − 15', end], staff demo check-in lúc nào cũng chạy.
  const parkedShift = shiftWindowContaining(now);
  const bookShift = shiftWindowContaining(new Date(now.getTime() + 15 * 60 * 1000));
  const resPlate = normalizePlateVN('51F-67890');
  const resQr = generateQrToken();
  const reservation = await Reservation.create({
    user_id: users.user.user_id,
    vehicle_type_id: car.vehicle_type_id,
    floor_id: f1.floor_id,
    zone_id: f1Car.zone_id,
    slot_id: null,
    plate_number: resPlate,
    start_time: bookShift.start,
    end_time: bookShift.end,
    status: 'confirmed',
    reservation_type: bookShift.shiftId,
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
    start_time: parkedShift.start, // ca đang diễn ra — xe đã vào, đang đỗ trong khung
    end_time: parkedShift.end,
    status: 'checked_in',
    reservation_type: parkedShift.shiftId,
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
    // đỗ ~2h → phí ô tô ≈ 30.000đ; kẹp không sớm hơn đầu ca (khi seed ngay đầu ca)
    time_in: new Date(Math.max(parkedShift.start.getTime(), now.getTime() - 2 * 60 * 60 * 1000)),
    gate_stage: 'on_floor', // xe đang đỗ trên tầng → sẵn sàng quét cổng tầng RA để test check-OUT
    qr_token: inSessQr,
    check_in_by: users.staff.user_id,
    session_type: 'reservation',
    status: 'active',
    calculated_fee: null,
  });

  // --- WALK-IN đang đỗ ~3h (để test LỐ GIỜ): nếu Manager set max_parking_hours <= 3 → bị phụ thu bắt buộc ---
  const walkSlot = await ParkingSlot.findOne({
    where: { zone_id: f1Car.zone_id, status: 'available' },
    order: [['slot_id', 'DESC']],
  });
  if (walkSlot) await walkSlot.update({ status: 'occupied' });
  const walkQr = generateQrToken();
  const walkSession = await ParkingSession.create({
    user_id: null, // khách vãng lai, không cần tài khoản
    gate_id: f1InGate.gate_id,
    slot_id: walkSlot ? walkSlot.slot_id : null,
    vehicle_type_id: car.vehicle_type_id,
    plate_number: normalizePlateVN('51W-999.99'),
    time_in: new Date(now.getTime() - 3 * 60 * 60 * 1000), // đỗ ~3h
    gate_stage: 'on_floor', // đang trên tầng → sẵn sàng test check-OUT + lố giờ
    qr_token: walkQr,
    check_in_by: users.staff.user_id,
    session_type: 'walk_in',
    status: 'active',
    calculated_fee: null,
  });

  // --- NHIỀU ĐƠN KHÁC KHUNG GIỜ trên cùng TẦNG (mô hình suất: không ghim chỗ, các đơn
  // confirmed KHÔNG trùng giờ cùng chiếm 1 suất luân phiên — slot gán khi check-in) ---
  const atHour = (base, h) => { const d = new Date(base); d.setHours(h, 0, 0, 0); return d; };
  const d1 = new Date(now.getTime() + 24 * 60 * 60 * 1000); // ngày mai
  const d2 = new Date(now.getTime() + 48 * 60 * 60 * 1000); // ngày kia
  const windows = [
    { plate: '51F-30001', start: atHour(d1, 6), end: atHour(d1, 12), shift: 'morning' },
    { plate: '51F-30002', start: atHour(d1, 18), end: atHour(d1, 22), shift: 'evening' },
    { plate: '51F-30003', start: atHour(d2, 6), end: atHour(d2, 12), shift: 'morning' },
  ];
  const multiReservations = [];
  for (const w of windows) {
    const r = await Reservation.create({
      user_id: users.user.user_id,
      vehicle_type_id: car.vehicle_type_id,
      floor_id: f1.floor_id,
      zone_id: f1Car.zone_id,
      slot_id: null,
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

  // --- 1 ĐƠN ĐÃ TỚI CA + ĐÃ KHÓA-ĐẦU-CA: slot flip 'reserved' chờ khách (dù khách chưa tới) ---
  // Demo job Ca C (materialize) + map hiện màu "Đã đặt". Khách quét QR → slot 'reserved' → 'occupied'.
  const lockPlate = normalizePlateVN('51F-67891');
  const lockSlot = await ParkingSlot.findOne({
    where: { zone_id: f1Car.zone_id, status: 'available' },
    order: [['slot_id', 'ASC']],
  });
  await lockSlot.update({ status: 'reserved' });
  const lockedReservation = await Reservation.create({
    user_id: users.user.user_id,
    vehicle_type_id: car.vehicle_type_id,
    floor_id: f1.floor_id,
    zone_id: f1Car.zone_id,
    slot_id: lockSlot.slot_id, // ĐÃ materialize — slot vật lý đang giữ 'reserved'
    plate_number: lockPlate,
    start_time: parkedShift.start, // ca ĐANG diễn ra → job đã khóa chỗ
    end_time: parkedShift.end,
    status: 'confirmed',
    reservation_type: parkedShift.shiftId,
    qr_token: generateQrToken(),
  });
  await paySuccess(lockedReservation.reservation_id);

  // ================= SEED MỞ RỘNG — PHỦ ĐỦ CÁC LUỒNG CÒN LẠI =================
  // Mỗi luồng 1 biển số riêng (51F-4xxxx) để không giẫm chân các đơn demo phía trên
  // (tránh dính chặn "đã có đơn confirmed tương lai" khi test walk-in bằng biển khác).

  // --- Thêm 2 user: user2 CÓ STK (nhận hoàn tiền) + chuaverify (test chặn login) ---
  users.user2 = await UserAccount.create({
    username: 'user2',
    password_hash: await hash('123456'),
    full_name: 'Khách có STK hoàn tiền',
    role_id: roles[ROLES.USER],
    email: 'user2@pbms.local',
    is_active: true,
    email_verified: true,
    bank_name: 'Vietcombank',
    bank_account_number: '0071000123456',
    bank_account_holder: 'KHACH CO STK',
  });
  users.chuaverify = await UserAccount.create({
    username: 'chuaverify',
    password_hash: await hash('123456'),
    full_name: 'Khách chưa xác minh email',
    role_id: roles[ROLES.USER],
    email: 'chuaverify@pbms.local',
    is_active: true,
    email_verified: false, // login phải bị 403 EMAIL_NOT_VERIFIED
  });

  // Helper tạo payment tùy trạng thái (paySuccess phía trên chỉ lo case success/booking).
  const makePayment = (fields) =>
    Payment.create({
      order_code: (seedOrderCode += 1),
      amount: BOOKING_FEE,
      method: 'payos',
      ...fields,
    });
  const makeReservation = (fields) =>
    Reservation.create({
      user_id: users.user.user_id,
      vehicle_type_id: car.vehicle_type_id,
      floor_id: f1.floor_id,
      zone_id: f1Car.zone_id,
      reservation_type: 'standard',
      qr_token: generateQrToken(),
      ...fields,
    });
  // Mô hình suất: đơn pending/cancelled/no_show KHÔNG giữ slot → slot_id null. Riêng
  // SESSION của đơn completed (5) vẫn cần 1 slot thật (phiên luôn có chỗ vật lý) → lấy 1 id.
  const someSlot = await ParkingSlot.findOne({
    where: { zone_id: f1Car.zone_id }, order: [['slot_id', 'ASC']],
  });
  const anySlotId = someSlot.slot_id; // CHỈ dùng cho SESSION completed, KHÔNG cho reservation
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  // --- (1) PENDING + payment pending (link PayOS đã chết) → test nút "Trả tiếp" ---
  const pendShift = shiftWindowOn(1, 'afternoon'); // ca chiều ngày mai — đơn tương lai gọn
  const pendingResv = await makeReservation({
    slot_id: null,
    plate_number: normalizePlateVN('51F-40001'),
    start_time: pendShift.start,
    end_time: pendShift.end,
    status: 'pending',
    reservation_type: pendShift.shiftId,
  });
  await makePayment({
    reservation_id: pendingResv.reservation_id,
    status: 'pending',
    // orderCode không tồn tại trên PayOS → repay sẽ coi link cũ đã chết và phát link MỚI.
    gateway_response: JSON.stringify({ checkoutUrl: 'https://pay.payos.vn/web/seed-dead-link' }),
  });

  // --- (2) CANCELLED trước cutoff → refund_request PENDING, user2 CÓ STK (admin hoàn được) ---
  const cancEarly = await makeReservation({
    user_id: users.user2.user_id,
    slot_id: null,
    plate_number: normalizePlateVN('51F-40002'),
    start_time: new Date(now.getTime() + 2 * DAY),
    end_time: new Date(now.getTime() + 2 * DAY + 6 * HOUR),
    status: 'cancelled',
  });
  const cancEarlyPay = await makePayment({
    reservation_id: cancEarly.reservation_id, status: 'success', paid_at: new Date(now.getTime() - 2 * HOUR),
  });
  await RefundRequest.create({
    reservation_id: cancEarly.reservation_id, payment_id: cancEarlyPay.payment_id,
    user_id: users.user2.user_id, percent: 100, amount: BOOKING_FEE,
    status: 'pending', requested_at: new Date(now.getTime() - 1 * HOUR),
  });

  // --- (3) refund PENDING quá 7 ngày, user KHÔNG STK → job passMaintenance sẽ đánh expired ---
  const cancStale = await makeReservation({
    slot_id: null,
    plate_number: normalizePlateVN('51F-40003'),
    start_time: new Date(now.getTime() - 6 * DAY),
    end_time: new Date(now.getTime() - 6 * DAY + 6 * HOUR),
    status: 'cancelled',
  });
  const cancStalePay = await makePayment({
    reservation_id: cancStale.reservation_id, status: 'success', paid_at: new Date(now.getTime() - 8 * DAY),
  });
  await RefundRequest.create({
    reservation_id: cancStale.reservation_id, payment_id: cancStalePay.payment_id,
    user_id: users.user.user_id, percent: 100, amount: BOOKING_FEE,
    status: 'pending', requested_at: new Date(now.getTime() - 8 * DAY),
  });

  // --- (4) refund ĐÃ HOÀN (lịch sử trang hoàn tiền) ---
  const cancDone = await makeReservation({
    user_id: users.user2.user_id,
    slot_id: null,
    plate_number: normalizePlateVN('51F-40004'),
    start_time: new Date(now.getTime() - 10 * DAY),
    end_time: new Date(now.getTime() - 10 * DAY + 6 * HOUR),
    status: 'cancelled',
  });
  const cancDonePay = await makePayment({
    reservation_id: cancDone.reservation_id, status: 'refunded', paid_at: new Date(now.getTime() - 11 * DAY),
  });
  await RefundRequest.create({
    reservation_id: cancDone.reservation_id, payment_id: cancDonePay.payment_id,
    user_id: users.user2.user_id, percent: 100, amount: BOOKING_FEE,
    status: 'refunded', requested_at: new Date(now.getTime() - 11 * DAY),
    refunded_at: new Date(now.getTime() - 9 * DAY), refunded_by: users.admin.user_id,
  });

  // --- (5) COMPLETED — QR đơn GIỮ NGUYÊN (OR-16), QR phiên đã thu hồi khi checkout ---
  // Đơn để slot_id null (đã đóng); SESSION bên dưới mới cần slot thật (anySlotId).
  const doneResv = await makeReservation({
    slot_id: null,
    plate_number: normalizePlateVN('51F-40005'),
    start_time: new Date(now.getTime() - 1 * DAY - 4 * HOUR),
    end_time: new Date(now.getTime() - 1 * DAY),
    status: 'completed',
  });
  await paySuccess(doneResv.reservation_id);
  const doneSession = await ParkingSession.create({
    user_id: users.user.user_id,
    reservation_id: doneResv.reservation_id,
    gate_id: f1InGate.gate_id,
    slot_id: anySlotId,
    vehicle_type_id: car.vehicle_type_id,
    plate_number: doneResv.plate_number,
    time_in: new Date(now.getTime() - 1 * DAY - 4 * HOUR),
    time_out: new Date(now.getTime() - 1 * DAY),
    gate_stage: 'exited',
    qr_token: `revoked-session-seed-${Date.now()}`, // checkout thật sẽ thu hồi token phiên
    check_in_by: users.staff.user_id,
    check_out_by: users.staff.user_id,
    session_type: 'reservation',
    status: 'completed',
    calculated_fee: 60000, // 4h ô tô × 15.000đ
  });
  await makePayment({
    session_id: doneSession.session_id, amount: 60000, status: 'success',
    paid_at: new Date(now.getTime() - 1 * DAY),
  });

  // --- (6) NO_SHOW — QR đơn giữ nguyên, cổng phải chặn theo status ---
  const noshowResv = await makeReservation({
    slot_id: null,
    plate_number: normalizePlateVN('51F-40006'),
    start_time: new Date(now.getTime() - 1 * DAY - 6 * HOUR),
    end_time: new Date(now.getTime() - 1 * DAY - 2 * HOUR),
    status: 'no_show',
  });
  await paySuccess(noshowResv.reservation_id);

  // --- (7) CHECKED_IN đang LỐ GIỜ khung đặt (end_time đã qua 2h) → phụ thu bắt buộc ---
  const overSlot = await ParkingSlot.findOne({
    where: { zone_id: f1Car.zone_id, status: 'available' }, order: [['slot_id', 'ASC']],
  });
  await overSlot.update({ status: 'occupied' });
  const overResv = await makeReservation({
    slot_id: overSlot.slot_id,
    plate_number: normalizePlateVN('51F-40007'),
    start_time: new Date(now.getTime() - 6 * HOUR),
    end_time: new Date(now.getTime() - 2 * HOUR), // khung đã hết 2 tiếng mà xe chưa ra
    status: 'checked_in',
  });
  await paySuccess(overResv.reservation_id);
  const overSession = await ParkingSession.create({
    user_id: users.user.user_id,
    reservation_id: overResv.reservation_id,
    gate_id: f1InGate.gate_id,
    slot_id: overSlot.slot_id,
    vehicle_type_id: car.vehicle_type_id,
    plate_number: overResv.plate_number,
    time_in: new Date(now.getTime() - 6 * HOUR),
    gate_stage: 'on_floor',
    qr_token: generateQrToken(),
    check_in_by: users.staff.user_id,
    session_type: 'reservation',
    status: 'active',
    calculated_fee: null,
  });

  // --- Vé tháng: ACTIVE (quét cổng được) + PENDING (test repay) + EXPIRED (cổng chặn theo status) ---
  const passWindow = { valid_from_time: '06:00:00', valid_to_time: '22:00:00' };
  const passActive = await MonthlyPass.create({
    user_id: users.user.user_id, vehicle_type_id: bike.vehicle_type_id, floor_id: f3.floor_id,
    plate_number: normalizePlateVN('51M-50001'), ...passWindow,
    start_date: new Date(now.getTime() - 7 * DAY), end_date: new Date(now.getTime() + 23 * DAY),
    status: 'active', qr_token: generateQrToken(),
  });
  await makePayment({ pass_id: passActive.pass_id, amount: 500000, status: 'success', paid_at: new Date(now.getTime() - 7 * DAY) });
  const passPending = await MonthlyPass.create({
    user_id: users.user2.user_id, vehicle_type_id: bike.vehicle_type_id, floor_id: f3.floor_id,
    plate_number: normalizePlateVN('51M-50002'), ...passWindow,
    start_date: new Date(now.getTime() + 1 * DAY), end_date: new Date(now.getTime() + 31 * DAY),
    status: 'pending', qr_token: null, // chưa thanh toán thì chưa có QR
  });
  await makePayment({
    pass_id: passPending.pass_id, amount: 500000, status: 'pending',
    gateway_response: JSON.stringify({ checkoutUrl: 'https://pay.payos.vn/web/seed-dead-pass-link' }),
  });
  const passExpired = await MonthlyPass.create({
    user_id: users.user.user_id, vehicle_type_id: bike.vehicle_type_id, floor_id: f3.floor_id,
    plate_number: normalizePlateVN('51M-50003'), ...passWindow,
    start_date: new Date(now.getTime() - 40 * DAY), end_date: new Date(now.getTime() - 1 * DAY),
    status: 'expired', qr_token: generateQrToken(), // hết hạn GIỮ token — cổng chặn theo status
  });
  await makePayment({ pass_id: passExpired.pass_id, amount: 500000, status: 'success', paid_at: new Date(now.getTime() - 40 * DAY) });

  // --- Sự cố: 1 đang mở (walk-in lố giờ) + 1 đã xử lý (có resolved_by — migration 007) ---
  await Incident.create({
    type: 'overstay', status: 'open',
    session_id: walkSession.session_id,
    slot_id: walkSession.slot_id,
    reported_by: users.staff.user_id,
    description: `Khách vãng lai ${walkSession.plate_number} đỗ vượt ngưỡng — chờ thu phụ thu khi ra`,
  });
  await Incident.create({
    type: 'window_violation', status: 'resolved',
    reservation_id: noshowResv.reservation_id,
    user_id: users.user.user_id,
    reported_by: users.staff.user_id,
    resolved_by: users.manager.user_id,
    resolved_at: new Date(now.getTime() - 1 * HOUR),
    description: `Đơn ${noshowResv.plate_number} quá giờ không check-in — đã đánh no-show và nhả chỗ`,
  });

  console.log('\n================ SEED DONE ================');
  console.log('Tài khoản (username / password):');
  console.log('  admin   / 123456');
  console.log('  manager / 123456');
  console.log('  staff   / 123456');
  console.log('  user    / 123456');
  console.log('\nĐặt chỗ confirmed sẵn (demo luồng reservation, không cần thanh toán):');
  console.log(`  reservationId = ${reservation.reservation_id}`);
  console.log(`  biển số       = ${resPlate}  (Tầng 1 · khu ô tô ưu tiên · chỗ sẽ gán khi check-in)`);
  console.log(`  qr_token      = ${resQr}`);
  console.log('\nKhách ĐẶT CHỖ đang đỗ (checked_in + phiên active) — test check-OUT:');
  console.log(`  sessionId     = ${inSession.session_id}`);
  console.log(`  biển số       = ${inPlate}  (Tầng 1 · khu ô tô · chỗ ${occSlot.slot_code} · đỗ ~2h ≈ 30.000đ)`);
  console.log(`  session qr    = ${inSessQr}`);
  console.log(`\nNHIỀU ĐƠN KHÁC KHUNG GIỜ (cùng tầng, ${multiReservations.length} đơn confirmed KHÔNG trùng giờ — chỗ gán khi check-in):`);
  for (const { r, w } of multiReservations) {
    console.log(`  resId=${r.reservation_id} | ${w.plate} | ${w.start.toLocaleString('vi-VN')} → ${w.end.toLocaleString('vi-VN')} (${w.shift})`);
  }
  console.log('\nĐƠN ĐÃ TỚI CA + ĐÃ KHÓA-ĐẦU-CA (slot reserved chờ khách — map hiện "Đã đặt"):');
  console.log(`  resId=${lockedReservation.reservation_id} | 51F-67891 | chỗ ${lockSlot.slot_code} đang GIỮ (reserved) · khách quét QR → occupied`);
  console.log('\n--------- CÁC LUỒNG BỔ SUNG (đăng nhập user/user2 để xem) ---------');
  console.log('Tài khoản thêm:');
  console.log('  user2      / 123456  (CÓ STK ngân hàng → nhận hoàn tiền được)');
  console.log('  chuaverify / 123456  (login phải bị chặn 403 EMAIL_NOT_VERIFIED)');
  console.log('Đặt chỗ:');
  console.log(`  PENDING  resId=${pendingResv.reservation_id} | 51F-40001 | bấm "Trả tiếp" → phải ra link PayOS MỚI (link cũ seed đã chết)`);
  console.log(`  CANCELLED+refund PENDING resId=${cancEarly.reservation_id} | 51F-40002 | user2 có STK → admin trang Hoàn tiền bấm hoàn được`);
  console.log(`  CANCELLED+refund QUÁ HẠN resId=${cancStale.reservation_id} | 51F-40003 | không STK, 8 ngày → job maintenance đánh expired`);
  console.log(`  CANCELLED+refund ĐÃ HOÀN resId=${cancDone.reservation_id} | 51F-40004 | lịch sử trang hoàn tiền`);
  console.log(`  COMPLETED resId=${doneResv.reservation_id} | 51F-40005 | QR đơn còn hiển thị dạng lịch sử, quét cổng bị chặn`);
  console.log(`  NO_SHOW   resId=${noshowResv.reservation_id} | 51F-40006 | QR lịch sử + có incident đã xử lý kèm theo`);
  console.log(`  LỐ GIỜ    resId=${overResv.reservation_id} | 51F-40007 | checked_in, hết khung 2h trước → checkout phải cộng phụ thu (sessionId=${overSession.session_id})`);
  console.log('Vé tháng:');
  console.log(`  ACTIVE  passId=${passActive.pass_id} | 51M-50001 | quét cổng tòa vào được (khung 06:00–22:00, tầng 3)`);
  console.log(`  PENDING passId=${passPending.pass_id} | 51M-50002 | user2 — test "Trả tiếp" vé tháng`);
  console.log(`  EXPIRED passId=${passExpired.pass_id} | 51M-50003 | còn QR nhưng cổng chặn theo status`);
  console.log('Sự cố: 1 open (walk-in lố giờ) + 1 resolved (có người xử lý — cột migration 007)');
  console.log('==========================================\n');
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed thất bại:', err.message || err);
  process.exit(1);
});
