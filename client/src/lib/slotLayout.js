/**
 * Parse slot codes like A01, B12 → row letter(s) + column number.
 */
export function parseSlotCode(code) {
  const match = String(code || '').match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    return { row: match[1].toUpperCase(), col: parseInt(match[2], 10) };
  }
  return { row: String(code || '?').slice(0, 1).toUpperCase(), col: 0 };
}

export function buildZoneGrid(slots = []) {
  if (!slots.length) return { rows: [], maxCol: 0, matrix: [] };

  const byRow = new Map();
  let maxCol = 0;

  for (const slot of slots) {
    const { row, col } = parseSlotCode(slot.slotCode);
    maxCol = Math.max(maxCol, col);
    if (!byRow.has(row)) byRow.set(row, new Map());
    byRow.get(row).set(col, slot);
  }

  const rows = [...byRow.keys()].sort();
  const matrix = rows.map((row) => {
    const rowMap = byRow.get(row);
    const cols = [...rowMap.keys()].sort((a, b) => a - b);
    const minCol = cols[0] ?? 1;
    const rowMax = Math.max(...cols, maxCol);
    const cells = [];
    for (let c = minCol; c <= rowMax; c += 1) {
      cells.push(rowMap.get(c) || null);
    }
    return { row, cells, minCol };
  });

  return { rows, maxCol, matrix };
}

export const statusConfig = {
  available: {
    label: 'Trống',
    cell: 'bg-white text-emerald-700 shadow-sm hover:brightness-110',
    dot: 'bg-emerald-400',
  },
  occupied: {
    label: 'Đang dùng',
    cell: 'bg-slate-700/70 text-slate-400',
    dot: 'bg-red-400',
  },
  reserved: {
    label: 'Đã đặt',
    cell: 'bg-amber-400/25 text-amber-200 border border-amber-400/40',
    dot: 'bg-amber-400',
  },
  maintenance: {
    label: 'Bảo trì',
    cell: 'bg-slate-800/80 text-slate-500 border border-dashed border-slate-600',
    dot: 'bg-slate-500',
  },
  locked: {
    label: 'Tạm khóa',
    cell: 'bg-violet-400/20 text-violet-200 border border-violet-400/50',
    dot: 'bg-violet-400',
  },
};

export function countByStatus(slots = []) {
  return slots.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { available: 0, occupied: 0, reserved: 0, maintenance: 0, locked: 0, total: 0 },
  );
}
