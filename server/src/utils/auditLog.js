/** AR-09 — kiểm vết thao tác Admin (console; có thể mở rộng bảng audit sau) */
export const logAdminAction = (actorId, action, details = {}) => {
  const entry = {
    at: new Date().toISOString(),
    actorId,
    action,
    ...details,
  };
  console.log('[ADMIN_AUDIT]', JSON.stringify(entry));
  return entry;
};
