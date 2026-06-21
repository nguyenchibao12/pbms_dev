import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, LayoutGrid, List, Info, LogIn } from 'lucide-react';
import { publicApi } from '../../api/public';
import { useAuth } from '../../context/AuthContext';
import { getRoleName, isCustomer, roleLabels } from '../../lib/auth';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import StatCard from '../../components/ui/StatCard';
import { CardSkeleton } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { ErrorAlert } from '../../components/ui/Field';
import ParkingFloorMap from '../../components/parking/ParkingFloorMap';
import SlotActionModal from '../../components/parking/SlotActionModal';
import { toast } from '../../components/ui/toast';
import { statusConfig } from '../../lib/slotLayout';
import { cn } from '../../lib/cn';

export default function AvailabilityPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [floors, setFloors] = useState([]);
  const [activeFloorId, setActiveFloorId] = useState(null);
  const [viewMode, setViewMode] = useState('map');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [slotContext, setSlotContext] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    publicApi
      .availability()
      .then(({ data }) => {
        const list = data.data;
        setFloors(list);
        setUpdatedAt(new Date());
        // Chọn tầng đầu nếu chưa chọn; giữ nguyên tầng đang xem khi bấm "Làm mới".
        setActiveFloorId((cur) => cur ?? (list.length > 0 ? list[0].floorId : null));
      })
      .catch((err) => setError(err.response?.data?.error?.message || 'Không tải được dữ liệu'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const handleSlotClick = ({ slot, zone, floor }) => {
    setSlotContext({ slot, zone, floor });
    setModalOpen(true);

    if (slot.status !== 'available') {
      const label = statusConfig[slot.status]?.label || slot.status;
      toast.info(`${slot.slotCode}: ${label} — không thể đặt`);
    } else if (!isAuthenticated) {
      toast.warning('Cần đăng nhập tài khoản Khách hàng để đặt chỗ', { duration: 5000 });
    } else if (!isCustomer(user)) {
      const role = getRoleName(user);
      toast.info(
        `Đang đăng nhập ${user?.username} (${roleLabels[role] || role}) — cần tài khoản Khách hàng để đặt chỗ`,
        { duration: 6000 },
      );
    }
  };

  const totalAvailable = floors.reduce((s, f) => s + f.available, 0);
  const totalSlots = floors.reduce((s, f) => s + f.total, 0);
  const activeFloor = floors.find((f) => f.floorId === activeFloorId) || floors[0];

  const totalOccupied = floors.reduce(
    (s, f) => s + (f.zones || []).reduce((zs, z) => zs + (z.byStatus?.occupied || 0), 0),
    0,
  );
  const totalReserved = floors.reduce(
    (s, f) => s + (f.zones || []).reduce((zs, z) => zs + (z.byStatus?.reserved || 0), 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Tra cứu chỗ trống"
        description="Sơ đồ slot theo tầng và khu vực — nhấn slot để xem chi tiết hoặc đặt chỗ"
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  viewMode === 'map' ? 'bg-brand-light text-brand' : 'text-slate-600',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Sơ đồ
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  viewMode === 'table' ? 'bg-brand-light text-brand' : 'text-slate-600',
                )}
              >
                <List className="h-3.5 w-3.5" />
                Bảng
              </button>
            </div>
            <Button variant="secondary" size="sm" onClick={load} loading={loading}>
              <RefreshCw className="h-4 w-4" />
              Làm mới
            </Button>
          </div>
        }
      />

      {/* Hướng dẫn theo Topic 8 / AR-04 */}
      {!authLoading && (
        <Card className="mb-6 border-brand/20 bg-brand-light/50">
          <div className="flex flex-wrap items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div className="flex-1 text-sm">
              {!isAuthenticated ? (
                <>
                  <p className="font-medium text-slate-800">Bạn đang xem với quyền Khách (Guest)</p>
                  <p className="mt-1 text-slate-600">
                    Xem giá, sơ đồ slot trống và quy định — <strong>miễn phí, không cần đăng nhập</strong>.
                    Muốn <strong>đặt chỗ trước</strong>? Nhấn slot trống (màu xanh) → đăng nhập tài khoản Khách hàng.
                  </p>
                  <Link to="/login" className="mt-2 inline-flex items-center gap-1.5 text-brand hover:underline">
                    <LogIn className="h-4 w-4" />
                    Đăng nhập để đặt chỗ
                  </Link>
                </>
              ) : isCustomer(user) ? (
                <>
                  <p className="font-medium text-slate-800">Xin chào {user.fullName} (Khách hàng)</p>
                  <p className="mt-1 text-slate-600">
                    Nhấn <strong>slot trống</strong> trên sơ đồ → <strong>Tiếp tục đặt chỗ</strong> → thanh toán phí booking → nhận QR.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-slate-800">
                    Đang đăng nhập: {user?.username} — {roleLabels[getRoleName(user)] || getRoleName(user)}
                  </p>
                  <p className="mt-1 text-slate-600">
                    Bạn <strong>không phải Khách hàng</strong> nên không đặt chỗ được tại đây.
                    Đăng xuất và đăng nhập <code className="rounded bg-slate-100 px-1">user</code> / <code className="rounded bg-slate-100 px-1">user123</code> để đặt chỗ.
                  </p>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {error && <ErrorAlert message={error} className="mb-4" />}

      {loading && floors.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : floors.length === 0 ? (
        <Card>
          <EmptyState title="Chưa có dữ liệu bãi xe" description="Hệ thống chưa được cấu hình tầng/khu." />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Tổng chỗ trống" value={totalAvailable} sub={`/ ${totalSlots} chỗ`} />
            <StatCard label="Đang sử dụng" value={totalOccupied} sub="xe đang đỗ" />
            <StatCard label="Đã đặt trước" value={totalReserved} sub="chỗ reserved" />
            {updatedAt && (
              <StatCard
                label="Cập nhật lúc"
                value={updatedAt.toLocaleTimeString('vi-VN')}
                sub={updatedAt.toLocaleDateString('vi-VN')}
              />
            )}
          </div>

          {floors.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {floors.map((floor) => (
                <button
                  key={floor.floorId}
                  type="button"
                  onClick={() => setActiveFloorId(floor.floorId)}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    activeFloorId === floor.floorId
                      ? 'border-brand bg-brand-light text-brand'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                  )}
                >
                  {floor.floorCode}
                  <span className="ml-2 text-xs opacity-70">
                    {floor.available}/{floor.total}
                  </span>
                </button>
              ))}
            </div>
          )}

          {viewMode === 'map' && activeFloor && (
            <ParkingFloorMap
              floor={activeFloor}
              className="mb-6"
              onSlotClick={handleSlotClick}
              selectedSlotId={slotContext?.slot?.slotId}
            />
          )}

          {viewMode === 'table' && (
            <div className="space-y-4">
              {(activeFloor ? [activeFloor] : floors).map((floor) => (
                <Card key={floor.floorId} padding={false} className="overflow-hidden">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h3 className="font-semibold text-slate-800">
                      {floor.floorCode} — {floor.label}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {floor.available} / {floor.total} chỗ trống
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Khu</th>
                          <th className="px-4 py-3">Loại xe</th>
                          <th className="px-4 py-3">Trống</th>
                          <th className="px-4 py-3">Đang dùng</th>
                          <th className="px-4 py-3">Đã đặt</th>
                          <th className="px-4 py-3">Tổng</th>
                          <th className="px-4 py-3">Chi tiết slot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {floor.zones.map((zone) => (
                          <tr key={zone.zoneId} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium">{zone.zoneCode}</td>
                            <td className="px-4 py-3">{zone.vehicleTypeName}</td>
                            <td className="px-4 py-3">
                              <Badge status="available" label={`${zone.byStatus?.available ?? zone.available} trống`} />
                            </td>
                            <td className="px-4 py-3 text-slate-600">{zone.byStatus?.occupied ?? 0}</td>
                            <td className="px-4 py-3 text-slate-600">{zone.byStatus?.reserved ?? 0}</td>
                            <td className="px-4 py-3 text-slate-500">{zone.total}</td>
                            <td className="px-4 py-3">
                              <div className="flex max-w-xs flex-wrap gap-1">
                                {(zone.slots || []).map((s) => (
                                  <button
                                    key={s.slotId}
                                    type="button"
                                    title={`${s.slotCode} — nhấn để xem`}
                                    onClick={() =>
                                      handleSlotClick({ slot: s, zone, floor })
                                    }
                                    className={cn(
                                      'rounded px-1.5 py-0.5 font-mono text-[10px] transition-transform hover:scale-110',
                                      s.status === 'available' && 'bg-emerald-100 text-emerald-800 hover:ring-2 hover:ring-emerald-400',
                                      s.status === 'occupied' && 'bg-red-100 text-red-800',
                                      s.status === 'reserved' && 'bg-amber-100 text-amber-800',
                                      s.status === 'maintenance' && 'bg-slate-200 text-slate-600',
                                      s.status === 'locked' && 'bg-violet-100 text-violet-800',
                                    )}
                                  >
                                    {s.slotCode}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Nhấn slot trên sơ đồ để đặt chỗ · Slot trống = có thể đặt (cần đăng nhập User) · Hệ thống AI gợi ý slot khi đặt
          </p>
        </>
      )}

      <SlotActionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        slot={slotContext?.slot}
        zone={slotContext?.zone}
        floor={slotContext?.floor}
        authState={{ isAuthenticated, user }}
      />
    </>
  );
}
