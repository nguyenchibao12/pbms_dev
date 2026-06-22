import { Link, useSearchParams } from 'react-router-dom';
import { XCircle, RefreshCw } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

// Trang hứng khi PayOS redirect về sau khi thanh toán bị HỦY / không thành công.
// Được điều hướng từ /reservations (MyReservationsPage) khi URL có cancel=true | status=CANCELLED.
export default function PaymentFailedPage() {
  const [searchParams] = useSearchParams();
  const orderCode = searchParams.get('orderCode');

  return (
    <div className="mx-auto max-w-md py-6">
      <Card className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <XCircle className="h-9 w-9 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Thanh toán chưa hoàn tất</h1>
        <p className="mt-2 text-sm text-slate-600">
          Giao dịch đã bị hủy hoặc không thành công nên chưa thu phí giữ chỗ. Đơn đang chờ thanh toán
          vẫn còn trong danh sách — bạn có thể thử thanh toán lại.
        </p>
        {orderCode && <p className="mt-3 text-xs text-slate-400">Mã giao dịch: #{orderCode}</p>}
        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <span>Vào “Đơn của tôi” và nhấn Thanh toán để thử lại.</span>
        </div>
        <div className="mt-6 flex justify-center">
          <Link to="/reservations">
            <Button className="w-full sm:w-auto">Quay lại đơn của tôi</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
