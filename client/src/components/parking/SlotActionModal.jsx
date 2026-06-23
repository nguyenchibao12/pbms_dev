import { Link, useNavigate } from 'react-router-dom';
import { LogIn, CalendarCheck, Info, Car, MapPin, Clock, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { statusConfig } from '../../lib/slotLayout';
import { getRoleName, isCustomer, roleLabels } from '../../lib/auth';

export default function SlotActionModal({
  open,
  onClose,
  slot,
  zone,
  floor,
  authState,
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  if (!slot || !zone || !floor) return null;

  const status = statusConfig[slot.status] || statusConfig.available;
  const canBook = slot.status === 'available';
  const { isAuthenticated, user } = authState || {};
  const roleName = getRoleName(user);
  const isUser = isCustomer(user);

  const bookingParams = new URLSearchParams({
    book: '1',
    floorId: String(floor.floorId),
    vehicleTypeId: String(zone.vehicleTypeId),
    zoneId: String(zone.zoneId),
    zoneCode: zone.zoneCode,
  });
  const bookingPath = `/reservations/new?${bookingParams}`;

  const handleSwitchToUser = () => {
    logout();
    onClose();
    navigate('/login', {
      state: {
        from: bookingPath,
        message: 'Đăng nhập tài khoản Khách hàng (user/user123) để đặt chỗ',
      },
    });
  };

  const goToBooking = () => {
    sessionStorage.setItem(
      'pbms_booking_prefill',
      JSON.stringify({
        floorId: floor.floorId,
        vehicleTypeId: zone.vehicleTypeId,
        zoneId: zone.zoneId,
        zoneCode: zone.zoneCode,
      }),
    );
    navigate(bookingPath);
    onClose();
  };

  const footer = (() => {
    if (!canBook) {
      return (
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      );
    }
    if (!isAuthenticated) {
      return (
        <>
          <Button variant="secondary" onClick={onClose}>
            Để sau
          </Button>
          <Link
            to="/login"
            state={{
              from: bookingPath,
              message: 'Đăng nhập tài khoản Khách hàng để đặt chỗ tại bãi này',
            }}
          >
            <Button>
              <LogIn className="h-4 w-4" />
              Đăng nhập để đặt
            </Button>
          </Link>
        </>
      );
    }
    if (!isUser) {
      return (
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="secondary" onClick={handleSwitchToUser}>
            <LogOut className="h-4 w-4" />
            Đổi sang User
          </Button>
        </>
      );
    }
    return (
      <>
        <Button variant="secondary" onClick={onClose}>
          Hủy
        </Button>
        <Button onClick={goToBooking}>
          <CalendarCheck className="h-4 w-4" />
          Đặt chỗ tại {floor.floorCode}
        </Button>
      </>
    );
  })();

  return (
    <Modal
      open={open}
      title={`${floor.floorCode} · Khu ${zone.zoneCode}`}
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Slot <strong>{slot.slotCode}</strong> trên sơ đồ chỉ để tham khảo — khi đặt chỗ hệ thống tự gán
          chỗ trống phù hợp.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Badge status={slot.status} />
          <span className="text-sm text-slate-500">{status.label}</span>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-brand" />
            <div>
              <dt className="text-slate-500">Bãi đỗ</dt>
              <dd className="font-medium text-slate-800">
                {floor.floorCode} — {floor.label}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Car className="mt-0.5 h-4 w-4 text-brand" />
            <div>
              <dt className="text-slate-500">Loại xe</dt>
              <dd className="font-medium text-slate-800">{zone.vehicleTypeName}</dd>
            </div>
          </div>
        </dl>

        {!canBook && (
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {slot.status === 'occupied' && 'Khu vực này đang có xe — chọn khu khác hoặc đặt tầng khác.'}
            {slot.status === 'reserved' && 'Khu vực này đã có người đặt trước trong khung giờ.'}
            {slot.status === 'maintenance' && 'Khu vực đang bảo trì.'}
            {slot.status === 'locked' && 'Khu vực đang tạm khóa.'}
          </div>
        )}

        {canBook && !isAuthenticated && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-medium">
              <Info className="h-4 w-4 shrink-0" />
              Cần đăng nhập để đặt chỗ
            </p>
            <p className="mt-2 text-amber-800">
              Khách chưa đăng nhập chỉ xem sơ đồ. Vui lòng đăng nhập bằng tài khoản Khách hàng để đặt chỗ.
            </p>
          </div>
        )}

        {canBook && isAuthenticated && !isUser && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-medium">
              Đang đăng nhập: {user?.username} ({roleLabels[roleName] || roleName})
            </p>
            <p className="mt-1 text-blue-800">Chỉ tài khoản Khách hàng (User) mới đặt chỗ được.</p>
          </div>
        )}

        {canBook && isUser && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-medium">
              <Clock className="h-4 w-4" />
              Quy trình (3 bước)
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-emerald-800">
              <li>Chọn giờ đến + thời lượng đỗ + biển số</li>
              <li>Thanh toán phí booking → nhận QR</li>
              <li>Đến cổng quét QR — nhân viên mở barrier</li>
            </ol>
          </div>
        )}
      </div>
    </Modal>
  );
}
