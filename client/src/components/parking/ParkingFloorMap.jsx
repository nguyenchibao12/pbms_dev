import { useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import ZoneSlotGrid, { ZoneSlotGridLegend } from './ZoneSlotGrid';
import { countByStatus } from '../../lib/slotLayout';

export default function ParkingFloorMap({ floor, className, onSlotClick, selectedSlotId }) {
  const [selectedZone, setSelectedZone] = useState(null);

  const allSlots = (floor.zones || []).flatMap((z) => z.slots || []);
  const stats = countByStatus(allSlots);

  return (
    <div className={cn('overflow-hidden rounded-2xl', className)}>
      {/* Dark cinema-style map panel */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              {floor.floorCode} — {floor.label}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {stats.available} / {stats.total} chỗ trống · {floor.zones?.length || 0} khu
            </p>
          </div>
          <ZoneSlotGridLegend />
        </div>

        <div className="space-y-5">
          {(floor.zones || []).map((zone, i) => (
            <ZoneSlotGrid
              key={zone.zoneId}
              zone={zone}
              index={i}
              selected={selectedZone}
              selectedSlotId={selectedSlotId}
              onSelect={(id) => setSelectedZone((prev) => (prev === id ? null : id))}
              onSlotClick={(slot) => onSlotClick?.({ slot, zone, floor })}
            />
          ))}
        </div>

        {/* Gate strip — like cinema entrance row */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-xs tracking-widest text-slate-500 uppercase">
            <DoorOpen className="h-4 w-4" />
            Cổng vào
          </div>
          <div className="h-1 w-full max-w-md rounded-full bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
        </div>
      </div>
    </div>
  );
}
