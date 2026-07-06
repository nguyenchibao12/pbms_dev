import Floor from './floor.model.js';
import Zone from './zone.model.js';
import ParkingSlot from './parkingSlot.model.js';
import Gate from './gate.model.js';
import VehicleType from './vehicleType.model.js';
import PricingRule from './pricingRule.model.js';
import Role from './role.model.js';
import UserAccount from './userAccount.model.js';
import ParkingSession from './parkingSession.model.js';
import Payment from './payment.model.js';
import Reservation from './reservation.model.js';
import MonthlyPass from './monthlyPass.model.js';
import AiLog from './aiLog.model.js';
import Incident from './incident.model.js';
import AuditLog from './auditLog.model.js';
import Setting from './setting.model.js';
import RefundRequest from './refundRequest.model.js';

Role.hasMany(UserAccount, { foreignKey: 'role_id', as: 'users' });
UserAccount.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

Floor.hasMany(Zone, { foreignKey: 'floor_id', as: 'zones' });
Zone.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });

// layout_mode = single: tầng dành riêng 1 loại xe (Lv1).
VehicleType.hasMany(Floor, { foreignKey: 'vehicle_type_id', as: 'floors' });
Floor.belongsTo(VehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicleType' });

Floor.hasMany(Gate, { foreignKey: 'floor_id', as: 'gates' });
Gate.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });

VehicleType.hasMany(Gate, { foreignKey: 'vehicle_type_id', as: 'gates' });
Gate.belongsTo(VehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicleType' });

VehicleType.hasMany(Zone, { foreignKey: 'vehicle_type_id', as: 'zones' });
Zone.belongsTo(VehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicleType' });

Zone.hasMany(ParkingSlot, { foreignKey: 'zone_id', as: 'parkingSlots' });
ParkingSlot.belongsTo(Zone, { foreignKey: 'zone_id', as: 'zone' });

VehicleType.hasMany(PricingRule, { foreignKey: 'vehicle_type_id', as: 'pricingRules' });
PricingRule.belongsTo(VehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicleType' });

ParkingSlot.hasMany(ParkingSession, { foreignKey: 'slot_id', as: 'sessions' });
ParkingSession.belongsTo(ParkingSlot, { foreignKey: 'slot_id', as: 'slot' });

Gate.hasMany(ParkingSession, { foreignKey: 'gate_id', as: 'sessions' });
ParkingSession.belongsTo(Gate, { foreignKey: 'gate_id', as: 'gate' });

Gate.hasMany(ParkingSession, { foreignKey: 'exit_gate_id', as: 'exitSessions' });
ParkingSession.belongsTo(Gate, { foreignKey: 'exit_gate_id', as: 'exitGate' });

VehicleType.hasMany(ParkingSession, { foreignKey: 'vehicle_type_id', as: 'sessions' });
ParkingSession.belongsTo(VehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicleType' });

UserAccount.hasMany(ParkingSession, { foreignKey: 'check_in_by', as: 'checkIns' });
ParkingSession.belongsTo(UserAccount, { foreignKey: 'check_in_by', as: 'checkInStaff' });

UserAccount.hasMany(ParkingSession, { foreignKey: 'check_out_by', as: 'checkOuts' });
ParkingSession.belongsTo(UserAccount, { foreignKey: 'check_out_by', as: 'checkOutStaff' });

UserAccount.hasMany(ParkingSession, { foreignKey: 'user_id', as: 'parkingSessions' });
ParkingSession.belongsTo(UserAccount, { foreignKey: 'user_id', as: 'user' });

ParkingSession.hasMany(Payment, { foreignKey: 'session_id', as: 'payments' });
Payment.belongsTo(ParkingSession, { foreignKey: 'session_id', as: 'session' });

ParkingSession.belongsTo(Reservation, { foreignKey: 'reservation_id', as: 'reservation' });
Reservation.hasMany(ParkingSession, { foreignKey: 'reservation_id', as: 'sessions' });

UserAccount.hasMany(Reservation, { foreignKey: 'user_id', as: 'reservations' });
Reservation.belongsTo(UserAccount, { foreignKey: 'user_id', as: 'user' });

Reservation.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });
Reservation.belongsTo(Zone, { foreignKey: 'zone_id', as: 'zone' });
Reservation.belongsTo(VehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicleType' });
Reservation.belongsTo(ParkingSlot, { foreignKey: 'slot_id', as: 'slot' });

Reservation.hasMany(Payment, { foreignKey: 'reservation_id', as: 'payments' });
Payment.belongsTo(Reservation, { foreignKey: 'reservation_id', as: 'reservation' });

ParkingSession.belongsTo(MonthlyPass, { foreignKey: 'pass_id', as: 'monthlyPass' });
MonthlyPass.hasMany(ParkingSession, { foreignKey: 'pass_id', as: 'sessions' });

UserAccount.hasMany(MonthlyPass, { foreignKey: 'user_id', as: 'monthlyPasses' });
MonthlyPass.belongsTo(UserAccount, { foreignKey: 'user_id', as: 'user' });

MonthlyPass.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });
MonthlyPass.belongsTo(VehicleType, { foreignKey: 'vehicle_type_id', as: 'vehicleType' });

MonthlyPass.hasMany(Payment, { foreignKey: 'pass_id', as: 'payments' });
Payment.belongsTo(MonthlyPass, { foreignKey: 'pass_id', as: 'monthlyPass' });

ParkingSession.hasMany(AiLog, { foreignKey: 'session_id', as: 'aiLogs' });
AiLog.belongsTo(ParkingSession, { foreignKey: 'session_id', as: 'session' });

ParkingSlot.hasMany(AiLog, { foreignKey: 'selected_slot_id', as: 'aiLogs' });
AiLog.belongsTo(ParkingSlot, { foreignKey: 'selected_slot_id', as: 'selectedSlot' });

ParkingSession.hasMany(Incident, { foreignKey: 'session_id', as: 'incidents' });
Incident.belongsTo(ParkingSession, { foreignKey: 'session_id', as: 'session' });

ParkingSlot.hasMany(Incident, { foreignKey: 'slot_id', as: 'incidents' });
Incident.belongsTo(ParkingSlot, { foreignKey: 'slot_id', as: 'slot' });

UserAccount.hasMany(Incident, { foreignKey: 'user_id', as: 'incidents' });
Incident.belongsTo(UserAccount, { foreignKey: 'user_id', as: 'user' });

UserAccount.hasMany(Incident, { foreignKey: 'reported_by', as: 'reportedIncidents' });
Incident.belongsTo(UserAccount, { foreignKey: 'reported_by', as: 'reporter' });

Reservation.hasMany(Incident, { foreignKey: 'reservation_id', as: 'incidents' });
Incident.belongsTo(Reservation, { foreignKey: 'reservation_id', as: 'reservation' });

MonthlyPass.hasMany(Incident, { foreignKey: 'pass_id', as: 'incidents' });
Incident.belongsTo(MonthlyPass, { foreignKey: 'pass_id', as: 'pass' });

UserAccount.hasMany(AuditLog, { foreignKey: 'actor_id', as: 'auditLogs' });
AuditLog.belongsTo(UserAccount, { foreignKey: 'actor_id', as: 'actor' });

// Hoàn tiền hủy vé tháng (P3-8)
MonthlyPass.hasOne(RefundRequest, { foreignKey: 'pass_id', as: 'refundRequest' });
RefundRequest.belongsTo(MonthlyPass, { foreignKey: 'pass_id', as: 'pass' });
RefundRequest.belongsTo(Payment, { foreignKey: 'payment_id', as: 'payment' });
UserAccount.hasMany(RefundRequest, { foreignKey: 'user_id', as: 'refundRequests' });
RefundRequest.belongsTo(UserAccount, { foreignKey: 'user_id', as: 'user' });
RefundRequest.belongsTo(UserAccount, { foreignKey: 'refunded_by', as: 'refundedBy' });

export {
  Role,
  UserAccount,
  Floor,
  Zone,
  ParkingSlot,
  Gate,
  VehicleType,
  PricingRule,
  ParkingSession,
  Payment,
  Reservation,
  MonthlyPass,
  AiLog,
  Incident,
  AuditLog,
  Setting,
  RefundRequest,
};
