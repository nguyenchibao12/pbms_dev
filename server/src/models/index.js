import Role from './role.model.js';
import UserAccount from './userAccount.model.js';
import VehicleType from './vehicleType.model.js';

Role.hasMany(UserAccount, { foreignKey: 'role_id', as: 'users' });
UserAccount.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

export { Role, UserAccount, VehicleType };
