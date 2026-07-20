import { Op } from 'sequelize';
import { Zone, ParkingSlot, ParkingSession, Reservation } from '../models/index.js';

/**
 * MÔ HÌNH SỨC CHỨA cho đặt chỗ (mirror passCapacity.js — migration 008):
 * đặt = giữ MỘT SUẤT trong khung giờ, đếm số đơn trùng khung so với sức chứa TẦNG;
 * slot thật gán lúc check-in. Sức chứa luôn tính TOÀN TẦNG (mọi zone của floor+vehicleType)
 * — zone_id trên đơn chỉ là ưu tiên gán chỗ, KHÔNG phải ngăn chia sức chứa: đơn không-zone
 * gán được vào bất kỳ zone nào lúc check-in nên đếm hẹp theo zone là oversell.
 */

// Walk-in phải chừa chỗ cho đơn bắt đầu trong chân trời này (chủ module chốt 18/07: 6h ≈ 1 ca).
// Cam kết "đặt là chắc có chỗ" đúng trong chân trời này — xe vào TRƯỚC mốc đó rồi ở lì là
// lớp rủi ro còn lại, check-in có đường 409 nhờ staff xử (cùng lớp epsilon vé tháng chấp nhận).
// TODO: đưa vào Settings Nhóm C cùng đợt walkin_block/void (handoff LeTuanAnh đang treo).
export const RESERVATION_HOLDBACK_LEAD_MS = 6 * 60 * 60 * 1000;

const USABLE_SLOT_STATUSES_EXCLUDED = ['maintenance', 'locked'];
const BOOKED_STATUSES = ['pending', 'confirmed'];

/**
 * Sức chứa còn lại của (floor, vehicleType) trong [startTime, endTime].
 *
 *   supply  = slot dùng được (không maintenance/locked) − session đang active trên tầng
 *             (session không hẹn giờ ra → trừ bảo thủ cho MỌI cửa sổ, parity hành vi cũ)
 *   booked  = đơn pending|confirmed trùng khung, clamp effStart = max(start, now) để đơn
 *             đã hết giờ (chưa bị job no-show quét) không ăn suất của ca đang diễn ra.
 *             checked_in KHÔNG đếm — session active của nó đã nằm trong occupiedNow.
 *
 * Đếm-overlap bảo thủ hơn xếp-lịch tối ưu: chỉ có thể TỪ CHỐI OAN (under-sell) chứ không
 * bao giờ nhận lố (đặt theo CA nên các khung trùng nhau là chính — sai số hiếm gặp).
 *
 * lockZones=true: Zone.findAll FOR UPDATE là CÂU LỆNH ĐẦU TIÊN của transaction — serialize
 * các booking cùng tầng với nhau (và với mua vé tháng, vốn khóa cùng bộ row qua
 * getPassCapacity) y hệt khuôn purchaseMonthlyPass.
 */
export const getReservationWindowCapacity = async ({
  floorId,
  vehicleTypeId,
  startTime,
  endTime,
  transaction = null,
  lockZones = false,
}) => {
  const zones = await Zone.findAll({
    where: { floor_id: floorId, vehicle_type_id: vehicleTypeId },
    attributes: ['zone_id'],
    transaction: transaction || undefined,
    ...(lockZones && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  const zoneIds = zones.map((z) => z.zone_id);
  if (zoneIds.length === 0) {
    return { zoneIds, totalSlots: 0, occupiedNow: 0, supply: 0, booked: 0, available: 0 };
  }

  const txOpt = transaction ? { transaction } : {};
  const now = new Date();
  const effStart = new Date(Math.max(new Date(startTime).getTime(), now.getTime()));

  const [totalSlots, occupiedNow, booked] = await Promise.all([
    ParkingSlot.count({
      where: { zone_id: { [Op.in]: zoneIds }, status: { [Op.notIn]: USABLE_SLOT_STATUSES_EXCLUDED } },
      ...txOpt,
    }),
    ParkingSession.count({
      where: { status: 'active' },
      include: [{
        association: 'slot',
        required: true,
        attributes: [],
        where: { zone_id: { [Op.in]: zoneIds }, status: { [Op.notIn]: USABLE_SLOT_STATUSES_EXCLUDED } },
      }],
      ...txOpt,
    }),
    Reservation.count({
      where: {
        floor_id: floorId,
        vehicle_type_id: vehicleTypeId,
        status: { [Op.in]: BOOKED_STATUSES },
        start_time: { [Op.lt]: new Date(endTime) },
        end_time: { [Op.gt]: effStart },
      },
      ...txOpt,
    }),
  ]);

  const supply = totalSlots - occupiedNow;
  return {
    zoneIds,
    totalSlots,
    occupiedNow,
    supply,
    booked,
    available: Math.max(0, supply - booked),
  };
};

/**
 * Giữ chỗ cho đơn đặt SẮP TỚI trước walk-in (mirror filterWalkInCandidateSlots của vé tháng,
 * nhưng ở mức TẦNG vì suất đặt là suất toàn tầng). All-or-nothing: còn dư mới cho walk-in,
 * gọi lặp qua từng lượt check-in tự thoái hóa thành trim đúng (5 trống/3 giữ → vào được 2 xe).
 * So với freeOnFloor đếm TOÀN TẦNG chứ không phải candidates.length — candidates có thể đã bị
 * filter vé tháng/zone cắt hẹp, so nhầm là chặn oan.
 */
export const filterWalkInCandidatesForUpcomingReservations = async (
  slots,
  { floorId, vehicleTypeId },
) => {
  if (!slots.length) return slots;

  const now = Date.now();
  const holdback = await Reservation.count({
    where: {
      floor_id: floorId,
      vehicle_type_id: vehicleTypeId,
      status: { [Op.in]: BOOKED_STATUSES },
      start_time: { [Op.lte]: new Date(now + RESERVATION_HOLDBACK_LEAD_MS) },
      end_time: { [Op.gt]: new Date(now) },
    },
  });
  if (holdback === 0) return slots;

  const freeOnFloor = await ParkingSlot.count({
    where: { status: 'available' },
    include: [{
      association: 'zone',
      required: true,
      attributes: [],
      where: { floor_id: floorId, vehicle_type_id: vehicleTypeId },
    }],
  });

  return freeOnFloor > holdback ? slots : [];
};
