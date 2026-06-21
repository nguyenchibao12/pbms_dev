import { useState } from 'react';
import { cn } from '../../lib/cn';
import { buildZoneGrid, statusConfig, countByStatus } from '../../lib/slotLayout';
import SlotLegend from './SlotLegend';

const zoneAccent = ['ring-brand/60', 'ring-violet-400/60', 'ring-cyan-400/60', 'ring-amber-400/60'];

function SlotCell({ slot, highlighted, selected, onClick }) {
  if (!slot) {
    return <div className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" />;
  }

  const cfg = statusConfig[slot.status] || statusConfig.available;
  const clickable = !!onClick;

  return (
    <button
      type="button"
      title={`${slot.slotCode} — ${cfg.label}${clickable ? ' · Nhấn để xem / đặt' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(slot);
      }}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-bold transition-all sm:h-10 sm:w-10 sm:text-xs',
        cfg.cell,
        clickable && 'cursor-pointer hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/50',
        highlighted && 'ring-2 ring-white/80',
        selected && 'ring-2 ring-amber-400 scale-105',
        slot.status === 'available' && clickable && 'hover:shadow-md hover:shadow-emerald-500/30',
      )}
    >
      {slot.slotCode.replace(/^[A-Za-z]+/, '') || slot.slotCode}
    </button>
  );
}

export default function ZoneSlotGrid({ zone, index = 0, selected, onSelect, onSlotClick, selectedSlotId }) {
  const [hovered, setHovered] = useState(null);
  const slots = zone.slots || [];
  const { matrix } = buildZoneGrid(slots);
  const stats = countByStatus(slots);
  const isActive = selected === zone.zoneId;
  const accent = zoneAccent[index % zoneAccent.length];

  const colHeaders = matrix[0]?.cells.length
    ? matrix[0].cells.map((_, i) => {
        const minCol = matrix[0].minCol ?? 1;
        return String(minCol + i).padStart(2, '0');
      })
    : [];

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/5 p-4 transition-all sm:p-5',
        isActive && `ring-2 ${accent} shadow-lg shadow-black/20`,
        onSelect && 'cursor-pointer hover:bg-white/[0.07]',
      )}
      onClick={() => onSelect?.(zone.zoneId)}
      onKeyDown={() => {}}
      onMouseLeave={() => setHovered(null)}
      role="presentation"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-white">
            Khu {zone.zoneCode}
            <span className="ml-2 text-sm font-normal text-slate-400">— {zone.label}</span>
          </h4>
          <p className="mt-0.5 text-xs text-slate-400">
            {zone.vehicleTypeName} · {stats.available}/{stats.total} trống
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {stats.available > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 font-medium text-emerald-300">
              {stats.available} trống
            </span>
          )}
          {stats.occupied > 0 && (
            <span className="rounded-full bg-red-500/20 px-2.5 py-1 font-medium text-red-300">
              {stats.occupied} đang dùng
            </span>
          )}
          {stats.reserved > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2.5 py-1 font-medium text-amber-300">
              {stats.reserved} đã đặt
            </span>
          )}
        </div>
      </div>

      {matrix.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Chưa có slot trong khu này</p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="inline-block min-w-full">
            {/* Column headers */}
            <div className="mb-2 flex items-center gap-1 pl-8 sm:pl-9">
              {colHeaders.map((col) => (
                <div
                  key={col}
                  className="flex h-6 w-9 shrink-0 items-center justify-center text-[10px] text-slate-500 sm:w-10"
                >
                  {col}
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {matrix.map(({ row, cells }) => (
              <div key={row} className="mb-1 flex items-center gap-1">
                <div className="flex h-9 w-7 shrink-0 items-center justify-center text-xs font-semibold text-slate-400 sm:h-10 sm:w-8">
                  {row}
                </div>
                {cells.map((slot, ci) => (
                  <div
                    key={`${row}-${ci}`}
                    onMouseEnter={() => slot && setHovered(slot.slotId)}
                  >
                    <SlotCell
                      slot={slot}
                      highlighted={hovered === slot?.slotId}
                      selected={selectedSlotId === slot?.slotId}
                      onClick={onSlotClick}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {hovered && (
        <p className="mt-3 text-center text-xs text-slate-400">
          {slots.find((s) => s.slotId === hovered)?.slotCode} —{' '}
          {statusConfig[slots.find((s) => s.slotId === hovered)?.status]?.label}
        </p>
      )}
    </div>
  );
}

export function ZoneSlotGridLegend() {
  return <SlotLegend className="justify-center" />;
}
