import AuditLog from '../models/auditLog.model.js';

/** AR-09 — kiểm vết thao tác Admin (console + audit_log) */
export const logAdminAction = async (actorId, action, details = {}) => {
  const entry = {
    at: new Date().toISOString(),
    actorId,
    action,
    ...details,
  };
  console.log('[ADMIN_AUDIT]', JSON.stringify(entry));

  try {
    await AuditLog.create({
      actor_id: actorId,
      action,
      details: JSON.stringify(details),
    });
  } catch (err) {
    console.error('[ADMIN_AUDIT] DB write failed:', err.message);
  }

  return entry;
};
