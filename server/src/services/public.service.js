import { Floor, ParkingSlot, VehicleType } from '../models/index.js';
import { getEffectivePricingRule } from '../utils/feeCalc.js';
import { getBuildingConfig, getBuildingHours } from '../utils/buildingHours.js';
import {
  getBookingFee as getBookingFeeFromSettings,
  getMonthlyPassPrice as getPassPriceFromSettings,
  getBookingRefundCutoffHours,
} from '../utils/settings.js';

export const getPublicPricing = async () => {
  const vehicleTypes = await VehicleType.findAll({ order: [['type_name', 'ASC']] });
  const now = new Date();
  const pricing = [];

  for (const vt of vehicleTypes) {
    try {
      const rule = await getEffectivePricingRule(vt.vehicle_type_id, now);
      pricing.push({
        vehicleTypeId: vt.vehicle_type_id,
        typeName: vt.type_name,
        typeCode: vt.type_code,
        unit: rule.unit,
        baseRate: Number(rule.base_rate),
        effectiveFrom: rule.effective_from,
        effectiveTo: rule.effective_to,
      });
    } catch {
      /* no active rule for this type */
    }
  }

  return pricing;
};

export const getPublicAvailability = async () => {
  const floors = await Floor.findAll({
    order: [['floor_level', 'ASC']],
    include: [
      {
        association: 'zones',
        include: [{ association: 'vehicleType', attributes: ['vehicle_type_id', 'type_name', 'type_code'] }],
      },
    ],
  });

  const availability = [];

  for (const floor of floors) {
    const zones = [];
    for (const zone of floor.zones || []) {
      const slotRows = await ParkingSlot.findAll({
        where: { zone_id: zone.zone_id },
        attributes: ['slot_id', 'slot_code', 'status', 'slot_type'],
        order: [['slot_code', 'ASC']],
      });

      const slots = slotRows.map((s) => ({
        slotId: s.slot_id,
        slotCode: s.slot_code,
        status: s.status,
        slotType: s.slot_type,
      }));

      const available = slots.filter((s) => s.status === 'available').length;
      const total = slots.length || zone.total_slots;

      zones.push({
        zoneId: zone.zone_id,
        zoneCode: zone.zone_code,
        label: zone.label,
        vehicleTypeId: zone.vehicle_type_id,
        vehicleTypeName: zone.vehicleType?.type_name,
        vehicleTypeCode: zone.vehicleType?.type_code,
        available,
        total,
        slots,
        byStatus: {
          available: slots.filter((s) => s.status === 'available').length,
          occupied: slots.filter((s) => s.status === 'occupied').length,
          reserved: slots.filter((s) => s.status === 'reserved').length,
          maintenance: slots.filter((s) => s.status === 'maintenance').length,
          locked: slots.filter((s) => s.status === 'locked').length,
        },
      });
    }
    availability.push({
      floorId: floor.floor_id,
      floorCode: floor.floor_code,
      floorLevel: floor.floor_level,
      label: floor.label,
      zones,
      available: zones.reduce((sum, z) => sum + z.available, 0),
      total: zones.reduce((sum, z) => sum + z.total, 0),
    });
  }

  return availability;
};

export const getPublicInfo = async () => {
  const vehicleTypes = await VehicleType.findAll({
    attributes: ['vehicle_type_id', 'type_name', 'type_code'],
    order: [['type_name', 'ASC']],
  });

  const defaultRules = [
    'Mỗi biển số chỉ được có một phiên đỗ đang hoạt động.',
    'Đặt chỗ trước cần thanh toán phí booking để nhận mã QR check-in.',
    'Vé tháng cho phép vào/ra trong khung giờ đã đăng ký, không khóa slot cố định.',
    'QR check-out chỉ dùng một lần và hết hiệu lực sau khi ra cổng.',
  ];

  const cfg = getBuildingConfig();
  const hours = getBuildingHours();
  const openHours = hours.is24_7
    ? '24/7'
    : `${cfg.open_time || '06:00'} – ${cfg.close_time || '22:00'}`;

  return {
    buildingName: cfg.building_name || process.env.BUILDING_NAME || 'Bãi đỗ PBMS',
    openHours,
    address: cfg.address || process.env.BUILDING_ADDRESS || 'FPT University',
    contactPhone: process.env.BUILDING_PHONE || '',
    rules: (process.env.BUILDING_RULES || defaultRules.join('|')).split('|').filter(Boolean),
    vehicleTypes,
    bookingFee: getBookingFeeFromSettings(),
    monthlyPassPrice: getPassPriceFromSettings(),
    bookingRefundCutoffHours: getBookingRefundCutoffHours(),
    updatedAt: new Date().toISOString(),
  };
};
