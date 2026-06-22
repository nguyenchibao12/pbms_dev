import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, QrCode, Clock } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { paymentsApi } from '../../api/payments';

// Trang hứng khi PayOS redirect về sau khi thanh toán phí giữ chỗ THÀNH CÔNG.
// Localhost không nhận webhook PayOS → tự gọi /payments/verify để server hỏi PayOS
// trạng thái thật và xác nhận đơn (pending → confirmed). Không có verify này thì đơn
// kẹt ở "chờ xử lý" mãi.
export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderCode = searchParams.get('orderCode');
  // verifying: đang hỏi server · confirmed: đã xác nhận · pending: chưa xác nhận được
  const [state, setState] = useState(orderCode ? 'verifying' : 'pending');

  useEffect(() => {
    if (!orderCode) return undefined;
    let active = true;
    const verify = async () => {
      try {
        const { data } = await paymentsApi.verify(orderCode);
        if (active) setState(data.data?.paid ? 'confirmed' : 'pending');
      } catch {
        if (active) setState('pending');
      }
    };
    verify();
    return () => {
      active = false;
    };
  }, [orderCode]);

  if (state === 'verifying') {
    return (
      <div className="mx-auto max-w-md py-6">
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <Spinner size="lg" />
          <p className="text-sm text-slate-600">Đang xác nhận thanh toán với PayOS…</p>
        </Card>
      </div>
    );
  }

  // Đã thanh toán nhưng server chưa xác nhận được (PayOS chưa cập nhật kịp / lỗi mạng).
  if (state === 'pending') {
    return (
      <div className="mx-auto max-w-md py-6">
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <Clock className="h-9 w-9 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Đang chờ xác nhận thanh toán</h1>
          <p className="mt-2 text-sm text-slate-600">
            Hệ thống chưa xác nhận được giao dịch. Nếu bạn đã thanh toán, trạng thái đơn sẽ cập nhật
            sau ít phút — mở “Đơn của tôi” để kiểm tra lại.
          </p>
          {orderCode && <p className="mt-3 text-xs text-slate-400">Mã giao dịch: #{orderCode}</p>}
          <div className="mt-6 flex justify-center">
            <Link to="/reservations">
              <Button className="w-full sm:w-auto">Về đơn của tôi</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <Card className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Thanh toán thành công</h1>
        <p className="mt-2 text-sm text-slate-600">
          Đơn đặt chỗ đã được xác nhận. Giữ mã QR để check-in tại cổng vào.
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
