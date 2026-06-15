import Role from './role.model.js';
import UserAccount from './userAccount.model.js';
import VehicleType from './vehicleType.model.js';
import Floor from './floor.model.js';
import Zone from './zone.model.js';
import ParkingSlot from './parkingSlot.model.js';
import Gate from './gate.model.js';
import PricingRule from './pricingRule.model.js';
import AuditLog from './auditLog.model.js';
import Payment from './payment.model.js';

Role.hasMany(UserAccount, { foreignKey: 'role_id', as: 'users' });
UserAccount.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

Floor.hasMany(Zone, { foreignKey: 'floor_id', as: 'zones' });
Zone.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });

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

UserAccount.hasMany(AuditLog, { foreignKey: 'actor_id', as: 'auditLogs' });
AuditLog.belongsTo(UserAccount, { foreignKey: 'actor_id', as: 'actor' });

// Payment: nền tảng (model + bảng). Quan hệ tới session/reservation/monthly_pass sẽ thêm khi
// các module đó lên — payment gắn ĐÚNG 1 trong 3 (enforce ở hook beforeValidate của model).
export { Role, UserAccount, VehicleType, Floor, Zone, ParkingSlot, Gate, PricingRule, AuditLog, Payment };
