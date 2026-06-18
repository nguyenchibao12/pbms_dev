import { Op } from 'sequelize';
import { AiLog } from '../models/index.js';
import { isAiLoggingEnabledSync, getSuggestStrategy as getStrategyFromSettings } from '../utils/settings.js';

export const isAiLoggingEnabled = () => isAiLoggingEnabledSync();

export const getSuggestStrategy = () => getStrategyFromSettings();

export const logSuggestion = async (payload) => {
  if (!isAiLoggingEnabled()) return null;

  try {
    return await AiLog.create({
      session_id: payload.sessionId || null,
      algorithm_used: payload.algorithm,
      candidates_count: payload.candidatesCount,
      selected_slot_id: payload.selectedSlotId,
      executed_time_ms: payload.executedTimeMs,
      floor_id: payload.floorId || null,
      vehicle_type_id: payload.vehicleTypeId || null,
      context: payload.context || null,
    });
  } catch (err) {
    console.error('[ai_log] Failed to write log:', err.message);
    return null;
  }
};

const avg = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

/** OR-20 — thống kê so sánh hiệu quả gợi ý AI từ ai_log. */
export const getAiComparisonStats = async ({ from, to } = {}) => {
  const where = {};
  if (from && to) {
    where.create_at = {
      [Op.between]: [new Date(from), new Date(`${to.slice(0, 10)}T23:59:59.999Z`)],
    };
  }

  const logs = await AiLog.findAll({
    where,
    attributes: ['executed_time_ms', 'candidates_count', 'context', 'algorithm_used'],
  });

  const byContext = {};
  for (const log of logs) {
    const ctx = log.context || 'unknown';
    if (!byContext[ctx]) {
      byContext[ctx] = { count: 0, executedTimes: [], candidates: [] };
    }
    byContext[ctx].count += 1;
    byContext[ctx].executedTimes.push(log.executed_time_ms);
    byContext[ctx].candidates.push(log.candidates_count);
  }

  const byContextSummary = Object.entries(byContext).map(([context, data]) => ({
    context,
    count: data.count,
    avgExecutedTimeMs: Math.round(avg(data.executedTimes)),
    avgCandidatesCount: Math.round(avg(data.candidates)),
  }));

  return {
    totalLogs: logs.length,
    strategy: getStrategyFromSettings(),
    loggingEnabled: isAiLoggingEnabledSync(),
    avgExecutedTimeMs: Math.round(avg(logs.map((l) => l.executed_time_ms))),
    avgCandidatesCount: Math.round(avg(logs.map((l) => l.candidates_count))),
    byContext: byContextSummary,
  };
};

export const listAiLogs = async ({ from, to, limit = 50 }) => {
  const where = {};
  if (from && to) {
    where.create_at = {
      [Op.between]: [new Date(from), new Date(`${to.slice(0, 10)}T23:59:59.999Z`)],
    };
  }

  return AiLog.findAll({
    where,
    include: [
      { association: 'selectedSlot', attributes: ['slot_id', 'slot_code', 'status'] },
      { association: 'session', attributes: ['session_id', 'plate_number', 'session_type'] },
    ],
    order: [['create_at', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
  });
};
