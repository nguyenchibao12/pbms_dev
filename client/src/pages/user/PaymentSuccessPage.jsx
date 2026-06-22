import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, QrCode } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

// Trang hứng khi PayOS redirect về sau khi thanh toán phí giữ chỗ THÀNH CÔNG.
// Được điều hướng từ /reservations (MyReservationsPage) khi URL có status=PAID.
export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderCode = searchParams.get('orderCode');

  return (
    <div className="mx-auto max-w-md py-6">
      <Card className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Thanh toán thành công</h1>
        <p className="mt-2 text-sm text-slate-600">
          Hệ thống đã ghi nhận thanh toán phí giữ chỗ. Trạng thái đơn sẽ được cập nhật trong giây lát.
        </p>
        {orderCode && <p className="mt-3 text-xs text-slate-400">Mã giao dịch: #{orderCode}</p>}
        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <QrCode className="h-4 w-4 shrink-0 text-brand" />
          <span>Mở mã QR trong “Đơn của tôi” để check-in tại cổng vào.</span>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/reservations">
            <Button className="w-full sm:w-auto">Xem đơn của tôi</Button>
          </Link>
          <Link to="/reservations/new">
            <Button variant="secondary" className="w-full sm:w-auto">
              Đặt chỗ mới
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
