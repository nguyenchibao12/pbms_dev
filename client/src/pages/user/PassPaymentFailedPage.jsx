import { Link, useSearchParams } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

// Trang hứng khi PayOS redirect về sau khi thanh toán vé tháng bị HỦY / không thành công.
// Được điều hướng từ /monthly-pass (MyMonthlyPassesPage) khi URL có cancel=true | status=CANCELLED.
// Vé vẫn ở trạng thái 'pending' — khách có thể bấm "Trả tiếp" để thanh toán lại.
export default function PassPaymentFailedPage() {
  const [searchParams] = useSearchParams();
  const orderCode = searchParams.get('orderCode');

  return (
    <div className="mx-auto max-w-md py-6">
      <Card className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <XCircle className="h-9 w-9 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Thanh toán thất bại</h1>
        <p className="mt-2 text-sm text-slate-600">
          Giao dịch đã bị hủy hoặc không thành công nên vé chưa được kích hoạt. Vé vẫn được giữ ở trạng
          thái chờ thanh toán — vào “Vé tháng của tôi” bấm “Trả tiếp” để thanh toán lại.
        </p>
        {orderCode && <p className="mt-3 text-xs text-slate-400">Mã giao dịch: #{orderCode}</p>}
        <div className="mt-6 flex justify-center">
          <Link to="/monthly-pass">
            <Button className="w-full sm:w-auto">Quay lại vé tháng của tôi</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
