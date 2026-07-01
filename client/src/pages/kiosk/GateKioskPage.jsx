import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { kioskApi } from '../../api/kiosk';
import { inputClass } from '../../components/ui/Input';
import QrScanner from '../../components/QrScanner';

// Màn kiosk PUBLIC gắn trên cổng (không đăng nhập, xác thực bằng kiosk key).
// Khách áp/nhập mã QR -> cổng tự quyết: mở barie (OPEN) hoặc yêu cầu thanh toán online
// (PAYMENT_REQUIRED). Thu TIỀN MẶT là việc của chốt staff (tab "Thu tiền mặt" trang /staff).

const STAGE_LABEL = {
  'building-in': 'Đã vào tòa nhà',
  'floor-in': 'Đã vào tầng — đã ghi phiên gửi xe',
  'floor-out': 'Đã rời tầng',
  'building-out': 'Đã ra tòa nhà',
};

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;

// Vị trí đỗ chỉ có khi khách ĐẶT CHỖ vừa được check-in ngay tại CỔNG VÀO TÒA
// (BE trả info.session.slot). Walk-in / các chặng khác không có -> trả null.
const parkingSpot = (r) => {
  const slot = r?.info?.session?.slot;
  if (!slot?.slot_code) return null;
  const floor = slot.zone?.floor;
  return { floor: floor?.label || floor?.floor_code || '', slotCode: slot.slot_code };
};

export default function GateKioskPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fromUrl = params.get('gateId');
  const orderCode = params.get('orderCode'); // PayOS redirect về kèm ?orderCode=...
  const [gates, setGates] = useState([]); // cổng tải động từ BE (kiosk-list) — thay hardcode
  const [gatesError, setGatesError] = useState('');
  const [gateId, setGateId] = useState(fromUrl ? Number(fromUrl) : null);
  const [verifying, setVerifying] = useState(Boolean(orderCode)); // đang chốt phiên PayOS?
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

  // Tải danh sách cổng động (BE /gates/kiosk-list, xác thực bằng kiosk key) — bỏ hardcode.
  // Mặc định chọn cổng theo ?gateId trên URL nếu hợp lệ, không thì cổng đầu danh sách.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await kioskApi.listGates();
        const list = data.data || [];
        if (!alive) return;
        setGates(list);
        setGateId((cur) => (list.some((g) => g.gate_id === cur) ? cur : list[0]?.gate_id ?? null));
      } catch {
        if (alive) setGatesError('Không tải được danh sách cổng. Kiểm tra kết nối rồi tải lại trang.');
      }
    })();
    return () => { alive = false; };
  }, []);

  // PayOS redirect về /kiosk/gate?orderCode=... → CHỐT phiên đã trả online (BE verify thật,
  // idempotent). Poll tới khi paid → hiện BARIE MỞ; nếu huỷ/hết hạn/timeout → mời quét lại.
  // Xoá orderCode khỏi URL khi xong để refresh không gọi lại.
  useEffect(() => {
    if (!orderCode) return undefined;
    let stop = false;
    let tries = 0;
    const finish = (res) => {
      if (stop) return;
      setResult(res);
      setVerifying(false);
      scheduleReset(6000);
      navigate('/kiosk/gate', { replace: true });
    };
    const tick = async () => {
      tries += 1;
      try {
        const { data } = await kioskApi.paymentStatus(orderCode);
        const d = data.data;
        if (d?.paid) {
          const s = d.session;
          finish({ ui: 'open', stage: 'building-out', fee: s?.calculated_fee, sessionId: s?.session_id });
          return;
        }
        if (d?.status === 'CANCELLED' || d?.status === 'EXPIRED') {
          finish({ ui: 'error', message: 'Chưa thanh toán — vui lòng quét lại mã ở cổng ra.' });
          return;
        }
      } catch {
        // lỗi 1 nhịp poll — thử lại nhịp sau
      }
      if (stop) return;
      if (tries >= 30) {
        finish({ ui: 'error', message: 'Chưa xác nhận được thanh toán — vui lòng quét lại mã ở cổng ra.' });
        return;
      }
      setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đang ở màn "chờ thanh toán" (PAYMENT_REQUIRED) → poll trạng thái phiên theo sessionId.
  // Staff thu tiền mặt HOẶC khách trả PayOS → phiên 'completed' → kiosk TỰ MỞ BARIE.
  useEffect(() => {
    if (result?.ui !== 'payment' || !result.sessionId) return undefined;
    const sid = result.sessionId;
    const timer = setInterval(async () => {
      try {
        const { data } = await kioskApi.exitStatus(sid);
        if (data.data?.paid) {
          clearInterval(timer);
          setResult({ ui: 'open', stage: 'building-out', fee: data.data.fee, sessionId: sid });
          scheduleReset(6000);
        }
      } catch {
        // lỗi 1 nhịp poll không sao — nhịp sau thử lại
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [result]);

  // Xử lý 1 mã QR (từ ô nhập tay HOẶC từ camera) — cổng tự quyết mở / yêu cầu thanh toán.
  const runScan = async (raw) => {
    const token = String(raw || '').trim();
    if (!token || scanning || !gateId) return;
    setScanning(true);
    // Huỷ timer auto-ẩn còn sót từ lượt quét OPEN trước (mỗi lần quét là 1 hành động mới) —
    // tránh nó fire trễ và xoá nhầm popup "CẦN THANH TOÁN" (ui='payment' cố ý không tự ẩn).
    clearTimeout(resetTimer.current);
    setResult(null);
    try {
      const { data } = await kioskApi.scan(gateId, token);
      const d = data.data;
      if (d.action === 'PAYMENT_REQUIRED') {
        setResult({ ...d, ui: 'payment' }); // ...d TRƯỚC, ui SAU -> không bị field `kind` của BE ghi đè
      } else {
        setResult({ ...d, ui: 'open' });
        // Có vị trí đỗ (đặt chỗ vừa check-in ở cổng tòa) -> để lâu hơn cho khách đọc chỗ.
        scheduleReset(d.slotId ? 9000 : 5000);
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

  const spot = result?.ui === 'open' ? parkingSpot(result) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-900 p-6 text-white">
      {/* Chọn cổng kiosk đang gắn */}
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <span>Cổng:</span>
        <select
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-white focus:border-brand focus:outline-none disabled:opacity-50"
          value={gateId ?? ''}
          disabled={gates.length === 0}
          onChange={(e) => {
            setGateId(Number(e.target.value));
            setResult(null);
          }}
        >
          {gates.length === 0 ? (
            <option value="">{gatesError ? 'Lỗi tải cổng' : 'Đang tải cổng…'}</option>
          ) : (
            gates.map((g) => (
              <option key={g.gate_id} value={g.gate_id}>
                {g.label ? `${g.gate_code} — ${g.label}` : g.gate_code}
              </option>
            ))
          )}
        </select>
        {gatesError && <span className="text-red-400">{gatesError}</span>}
      </div>

      {/* Khu kết quả lớn (nhìn từ xa) */}
      <div className="flex min-h-64 w-full max-w-xl items-center justify-center">
        {verifying && !result ? (
          <div className="text-center text-amber-300">
            <div className="animate-pulse text-6xl">⏳</div>
            <p className="mt-4 text-2xl font-medium">Đang xác nhận thanh toán…</p>
            <p className="mt-2 text-sm text-slate-400">Vui lòng đợi, đừng rời màn hình.</p>
          </div>
        ) : !result ? (
          <div className="text-center text-slate-400">
            <div className="text-6xl">⤿</div>
            <p className="mt-4 text-2xl font-medium">Mời áp / nhập mã QR</p>
          </div>
        ) : result.ui === 'open' ? (
          <div className="w-full rounded-3xl bg-emerald-500 p-10 text-center text-white shadow-2xl">
            <div className="text-7xl">✓</div>
            <p className="mt-4 text-4xl font-bold tracking-wide">BARIE MỞ</p>
            <p className="mt-2 text-xl text-emerald-50">{STAGE_LABEL[result.stage] || result.stage}</p>
            {spot && (
              <div className="mx-auto mt-5 max-w-sm rounded-2xl bg-white/15 px-6 py-4">
                <p className="text-base text-emerald-50">Mời tới chỗ đỗ đã giữ</p>
                <p className="mt-1 text-3xl font-extrabold tracking-wide">
                  {spot.floor ? `Tầng ${spot.floor} · ` : ''}Chỗ {spot.slotCode}
                </p>
              </div>
            )}
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
          disabled={scanning || verifying || !gateId || !qr.trim()}
          className="shrink-0 rounded-lg bg-brand px-6 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {scanning ? 'Đang quét...' : 'Quét'}
        </button>
        <button
          type="button"
          onClick={() => setCamOpen(true)}
          disabled={scanning || verifying || !gateId}
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
