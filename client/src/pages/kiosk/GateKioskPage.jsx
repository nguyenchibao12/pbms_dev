import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { kioskApi } from '../../api/kiosk';
import { inputClass } from '../../components/ui/Input';
import QrScanner from '../../components/QrScanner';

// Màn kiosk PUBLIC gắn trên cổng (không đăng nhập, xác thực bằng kiosk key).
// Khách áp/nhập mã QR -> cổng tự quyết: mở barie (OPEN) hoặc yêu cầu thanh toán online
// (PAYMENT_REQUIRED). Thu TIỀN MẶT là việc của chốt staff (tab "Thu tiền mặt" trang /staff).

// Danh sách cổng TĨNH theo seed demo (màn public không gọi GET /gates vì cần auth).
const GATES = [
  { id: 1, label: 'BLD-IN — Cổng tòa nhà (vào)' },
  { id: 2, label: 'BLD-OUT — Cổng tòa nhà (ra)' },
  { id: 3, label: 'F1-IN — Tầng 1 (vào)' },
  { id: 4, label: 'F1-OUT — Tầng 1 (ra)' },
  { id: 5, label: 'F2-IN — Tầng 2 (vào)' },
  { id: 6, label: 'F2-OUT — Tầng 2 (ra)' },
];

const STAGE_LABEL = {
  'building-in': 'Đã vào tòa nhà',
  'floor-in': 'Đã vào tầng — đã ghi phiên gửi xe',
  'floor-out': 'Đã rời tầng',
  'building-out': 'Đã ra tòa nhà',
};

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;

export default function GateKioskPage() {
  const [params] = useSearchParams();
  const fromUrl = params.get('gateId');
  const [gateId, setGateId] = useState(
    fromUrl && GATES.some((g) => String(g.id) === fromUrl) ? Number(fromUrl) : GATES[0].id,
  );
  const [qr, setQr] = useState('');
  // ui = discriminator của FE (đặt tên riêng, KHÔNG trùng field `kind` BE trả về trong data).
  const [result, setResult] = useState(null); // { ui: 'open' | 'payment' | 'error', ...d }
  const [scanning, setScanning] = useState(false);
  const [camOpen, setCamOpen] = useState(false); // overlay quét camera đang mở?
  const inputRef = useRef(null);
  const resetTimer = useRef(null);

  // Sau mỗi lượt quét: focus lại ô input cho xe tiếp theo.
  useEffect(() => {
    inputRef.current?.focus();
  }, [result]);

  // Dọn timer khi unmount.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const scheduleReset = (ms) => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setResult(null), ms);
  };

  // Xử lý 1 mã QR (từ ô nhập tay HOẶC từ camera) — cổng tự quyết mở / yêu cầu thanh toán.
  const runScan = async (raw) => {
    const token = String(raw || '').trim();
    if (!token || scanning) return;
    setScanning(true);
    setResult(null);
    try {
      const { data } = await kioskApi.scan(gateId, token);
      const d = data.data;
      if (d.action === 'PAYMENT_REQUIRED') {
        setResult({ ...d, ui: 'payment' }); // ...d TRƯỚC, ui SAU -> không bị field `kind` của BE ghi đè
      } else {
        setResult({ ...d, ui: 'open' });
        scheduleReset(5000); // mở cổng -> tự reset sẵn sàng xe sau
      }
    } catch (err) {
      setResult({ ui: 'error', message: err.response?.data?.error?.message || 'Mã không hợp lệ hoặc lỗi hệ thống' });
      scheduleReset(6000);
    } finally {
      setQr(''); // clear ô input sau mỗi lượt
      setScanning(false);
    }
  };

  const handleScan = (e) => {
    e.preventDefault();
    runScan(qr);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-900 p-6 text-white">
      {/* Chọn cổng kiosk đang gắn */}
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <span>Cổng:</span>
        <select
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-white focus:border-brand focus:outline-none"
          value={gateId}
          onChange={(e) => {
            setGateId(Number(e.target.value));
            setResult(null);
          }}
        >
          {GATES.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </div>

      {/* Khu kết quả lớn (nhìn từ xa) */}
      <div className="flex min-h-64 w-full max-w-xl items-center justify-center">
        {!result ? (
          <div className="text-center text-slate-400">
            <div className="text-6xl">⤿</div>
            <p className="mt-4 text-2xl font-medium">Mời áp / nhập mã QR</p>
          </div>
        ) : result.ui === 'open' ? (
          <div className="w-full rounded-3xl bg-emerald-500 p-10 text-center text-white shadow-2xl">
            <div className="text-7xl">✓</div>
            <p className="mt-4 text-4xl font-bold tracking-wide">BARIE MỞ</p>
            <p className="mt-2 text-xl text-emerald-50">{STAGE_LABEL[result.stage] || result.stage}</p>
          </div>
        ) : result.ui === 'payment' ? (
          <div className="w-full rounded-3xl bg-amber-400 p-10 text-center text-amber-950 shadow-2xl">
            <p className="text-3xl font-bold">CẦN THANH TOÁN</p>
            <p className="mt-3 text-5xl font-extrabold">{fmtMoney(result.fee)}</p>
            <a
              href={result.checkoutUrl}
              className="mt-6 inline-block rounded-xl bg-amber-950 px-8 py-3 text-lg font-semibold text-white hover:bg-amber-900"
            >
              Thanh toán online
            </a>
            <p className="mt-4 text-sm text-amber-900">Sau khi trả xong, quét lại mã ở cổng ra để mở barie. (Trả tiền mặt: tới chốt nhân viên.)</p>
            <button type="button" onClick={() => setResult(null)} className="mt-2 text-sm font-medium text-amber-900 underline">
              Quét lại
            </button>
          </div>
        ) : (
          <div className="w-full rounded-3xl bg-red-500 p-10 text-center text-white shadow-2xl">
            <div className="text-7xl">✕</div>
            <p className="mt-4 text-2xl font-semibold">{result.message}</p>
          </div>
        )}
      </div>

      {/* Ô quét/nhập mã QR */}
      <form onSubmit={handleScan} className="flex w-full max-w-xl gap-3">
        <input
          ref={inputRef}
          className={`${inputClass} bg-white text-slate-900`}
          value={qr}
          onChange={(e) => setQr(e.target.value)}
          placeholder="Áp đầu đọc hoặc dán mã QR rồi Enter..."
          autoFocus
        />
        <button
          type="submit"
          disabled={scanning || !qr.trim()}
          className="shrink-0 rounded-lg bg-brand px-6 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {scanning ? 'Đang quét...' : 'Quét'}
        </button>
        <button
          type="button"
          onClick={() => setCamOpen(true)}
          disabled={scanning}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          title="Quét QR bằng camera"
        >
          <Camera className="h-5 w-5" />
          <span className="hidden sm:inline">Camera</span>
        </button>
      </form>

      <p className="text-xs text-slate-500">Kiosk cổng — màn tự phục vụ. Mỗi cổng tự suy hành động theo tòa/tầng × chiều.</p>

      {camOpen && (
        <QrScanner
          onClose={() => setCamOpen(false)}
          onScan={(token) => { setCamOpen(false); runScan(token); }}
        />
      )}
    </div>
  );
}
