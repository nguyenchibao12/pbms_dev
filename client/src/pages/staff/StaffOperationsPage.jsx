import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { sessionsApi } from '../../api/sessions';
import { staffReservationsApi } from '../../api/staffReservations';
import { floorsApi, vehicleTypesApi, gatesApi, zonesApi } from '../../api/masterData';
import { friendlyReservationError, reservationCheckinBadge } from '../../lib/reservationStatus';
import { validateCheckinForm } from '../../lib/validate';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';

// Lấy floor_id của phiên (từ chỗ đỗ, fallback sang cổng vào) — để lọc cổng RA cùng tầng.
const sessionFloorId = (s) => s?.slot?.zone?.floor?.floor_id ?? s?.gate?.floor_id ?? null;

// Lấy floor_id của đơn đặt chỗ — để lọc cổng VÀO (IN) cùng tầng đã đặt.
const reservationFloorId = (r) => r?.floor_id ?? r?.floor?.floor_id ?? r?.slot?.zone?.floor?.floor_id ?? null;

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;

// Thời gian đã đỗ tính từ time_in -> hiện tại (dạng "2h 15p").
const fmtElapsed = (timeIn) => {
  if (!timeIn) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(timeIn).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}p` : `${mins}p`;
};

const emptyCheckin = { plateNumber: '', vehicleTypeId: '', floorId: '', gateId: '', zoneId: '' };

export default function StaffOperationsPage() {
  const [tab, setTab] = useState('checkin'); // 'checkin' | 'active' | 'reservation'

  // Dữ liệu danh mục cho dropdown
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [gates, setGates] = useState([]); // cổng IN theo tầng đã chọn
  const [zones, setZones] = useState([]); // khu theo tầng đã chọn (tùy chọn)

  // Check-in
  const [form, setForm] = useState(emptyCheckin);
  const [fieldErrors, setFieldErrors] = useState({});
  const [checkinError, setCheckinError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastCheckin, setLastCheckin] = useState(null);

  // Xe đang đỗ
  const [active, setActive] = useState([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [fees, setFees] = useState({}); // { [sessionId]: feeResult }

  // Xe ra (check-out)
  const [coSession, setCoSession] = useState(null); // phiên đang check-out (null = đóng modal)
  const [coGates, setCoGates] = useState([]); // cổng OUT của tầng phiên đó
  const [coGateId, setCoGateId] = useState('');
  const [coLost, setCoLost] = useState(false); // mất vé
  const [coPreview, setCoPreview] = useState(null); // phí tạm tính
  const [coResult, setCoResult] = useState(null); // kết quả sau check-out
  const [coError, setCoError] = useState('');
  const [coSubmitting, setCoSubmitting] = useState(false);

  // Đặt chỗ vào (reservation check-in)
  const [resQr, setResQr] = useState(''); // mã QR nhập/quét để tra cứu
  const [resLookupError, setResLookupError] = useState('');
  const [resLooking, setResLooking] = useState(false);
  const [upcoming, setUpcoming] = useState([]); // đơn confirmed chờ vào
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [ciRes, setCiRes] = useState(null); // đơn đang cho vào (null = đóng modal)
  const [ciGates, setCiGates] = useState([]); // cổng IN của tầng đã đặt
  const [ciGateId, setCiGateId] = useState('');
  const [ciError, setCiError] = useState('');
  const [ciSubmitting, setCiSubmitting] = useState(false);

  const loadActive = async () => {
    setLoadingActive(true);
    try {
      const { data } = await sessionsApi.listActive();
      // listActive trả phân trang { items, total, ... }
      setActive(data.data?.items || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Không tải được danh sách xe đang đỗ');
    } finally {
      setLoadingActive(false);
    }
  };

  const loadUpcoming = async () => {
    setLoadingUpcoming(true);
    try {
      const { data } = await staffReservationsApi.upcoming();
      setUpcoming(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Không tải được danh sách đặt chỗ');
    } finally {
      setLoadingUpcoming(false);
    }
  };

  // Tải danh mục + danh sách xe đang đỗ + đặt chỗ sắp tới khi mở trang.
  useEffect(() => {
    (async () => {
      try {
        const [fRes, vRes] = await Promise.all([floorsApi.list(), vehicleTypesApi.list()]);
        setFloors(fRes.data.data);
        setVehicleTypes(vRes.data.data);
      } catch {
        toast.error('Không tải được danh mục tầng/loại xe');
      }
      loadActive();
      loadUpcoming();
    })();
  }, []);

  // Mở modal "Cho xe vào" cho 1 đơn đặt chỗ: nạp cổng VÀO (IN) cùng tầng đã đặt.
  const openReservationCheckin = async (reservation) => {
    setCiRes(reservation);
    setCiGateId('');
    setCiError('');
    setCiGates([]);
    const floorId = reservationFloorId(reservation);
    if (!floorId) return;
    try {
      const gRes = await gatesApi.list(floorId);
      setCiGates((gRes.data.data || []).filter((g) => g.direction === 'in' && g.is_active));
    } catch {
      setCiError('Không tải được cổng vào của tầng đã đặt');
    }
  };

  // Tra cứu đơn theo mã QR rồi mở modal cho vào.
  const handleReservationLookup = async (e) => {
    e.preventDefault();
    const token = resQr.trim();
    if (!token) return;
    setResLookupError('');
    setResLooking(true);
    try {
      const { data } = await staffReservationsApi.lookup(token);
      setResQr('');
      openReservationCheckin(data.data);
    } catch (err) {
      setResLookupError(friendlyReservationError(err));
    } finally {
      setResLooking(false);
    }
  };

  const handleReservationCheckin = async (e) => {
    e.preventDefault();
    if (!ciGateId) {
      setCiError('Vui lòng chọn cổng vào');
      return;
    }
    setCiError('');
    setCiSubmitting(true);
    try {
      await staffReservationsApi.checkin({
        reservationId: ciRes.reservation_id,
        gateId: Number(ciGateId),
      });
      toast.success('Cho xe đặt chỗ vào bãi thành công');
      setCiRes(null);
      loadActive();
      loadUpcoming();
    } catch (err) {
      setCiError(friendlyReservationError(err));
    } finally {
      setCiSubmitting(false);
    }
  };

  // Khi đổi tầng: nạp cổng IN + khu của tầng đó, reset cổng/khu đã chọn.
  const onFloorChange = async (floorId) => {
    setForm((f) => ({ ...f, floorId, gateId: '', zoneId: '' }));
    if (!floorId) {
      setGates([]);
      setZones([]);
      return;
    }
    try {
      const [gRes, zRes] = await Promise.all([gatesApi.list(floorId), zonesApi.list(floorId)]);
      setGates((gRes.data.data || []).filter((g) => g.direction === 'in' && g.is_active));
      setZones(zRes.data.data || []);
    } catch {
      toast.error('Không tải được cổng/khu của tầng');
    }
  };

  const handleCheckin = async (e) => {
    e.preventDefault();
    const errors = validateCheckinForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setCheckinError('');
    setSubmitting(true);
    try {
      const payload = {
        plateNumber: form.plateNumber.trim().toUpperCase(),
        vehicleTypeId: Number(form.vehicleTypeId),
        floorId: Number(form.floorId),
        gateId: Number(form.gateId),
        ...(form.zoneId ? { zoneId: Number(form.zoneId) } : {}),
      };
      const { data } = await sessionsApi.checkin(payload);
      setLastCheckin(data.data);
      toast.success('Check-in thành công');
      setForm((f) => ({ ...emptyCheckin, floorId: f.floorId, gateId: f.gateId })); // giữ tầng/cổng cho lượt sau
      loadActive();
    } catch (err) {
      setCheckinError(err.response?.data?.error?.message || 'Check-in thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreviewFee = async (session) => {
    try {
      const { data } = await sessionsApi.previewFee({ sessionId: session.session_id });
      setFees((m) => ({ ...m, [session.session_id]: data.data }));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Không xem được phí');
    }
  };

  const handleCorrectPlate = async (session) => {
    const next = window.prompt('Sửa biển số xe:', session.plate_number);
    if (!next || !next.trim()) return;
    try {
      await sessionsApi.correctPlate(session.session_id, next.trim().toUpperCase());
      toast.success('Đã sửa biển số');
      loadActive();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Sửa biển số thất bại');
    }
  };

  // Mở modal Xe ra: nạp cổng RA (OUT) cùng tầng + xem trước phí.
  const openCheckout = async (session) => {
    setCoSession(session);
    setCoGateId('');
    setCoLost(false);
    setCoResult(null);
    setCoError('');
    setCoPreview(null);
    const floorId = sessionFloorId(session);
    try {
      const [gRes, pRes] = await Promise.all([
        floorId ? gatesApi.list(floorId) : Promise.resolve({ data: { data: [] } }),
        sessionsApi.previewFee({ sessionId: session.session_id }),
      ]);
      setCoGates((gRes.data.data || []).filter((g) => g.direction === 'out' && g.is_active));
      setCoPreview(pRes.data.data);
    } catch (err) {
      setCoError(err.response?.data?.error?.message || 'Không tải được cổng ra / phí');
    }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!coGateId) {
      setCoError('Vui lòng chọn cổng ra');
      return;
    }
    setCoError('');
    setCoSubmitting(true);
    try {
      const { data } = await sessionsApi.checkout({
        sessionId: coSession.session_id,
        gateId: Number(coGateId),
        lostTicket: coLost,
      });
      setCoResult(data.data);
      if (data.data?.barrierOpened) {
        toast.success('Xe ra thành công — barie mở');
        loadActive(); // phiên rời khỏi danh sách đang đỗ
      } else {
        toast.info('Cần thanh toán để mở barie');
        loadActive();
      }
    } catch (err) {
      setCoError(err.response?.data?.error?.message || 'Check-out thất bại');
    } finally {
      setCoSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vận hành bãi đỗ</h1>
        <p className="mt-1 text-sm text-slate-500">Ghi nhận xe vào, theo dõi xe đang đỗ và xem trước phí.</p>
      </div>

      {/* Chuyển mục nội bộ */}
      <div className="mb-6 inline-flex rounded-xl border border-slate-200 bg-surface-raised p-1">
        {[
          { id: 'checkin', label: 'Check-in (xe vào)' },
          { id: 'active', label: `Xe đang đỗ${active.length ? ` (${active.length})` : ''}` },
          { id: 'reservation', label: `Đặt chỗ vào${upcoming.length ? ` (${upcoming.length})` : ''}` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'brand-gradient text-white' : 'text-slate-500 hover:text-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB CHECK-IN */}
      {tab === 'checkin' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Ghi nhận xe vào</h2>
            <ErrorAlert message={checkinError} className="mb-4" />
            <form onSubmit={handleCheckin} className="space-y-4">
              <Field label="Biển số xe" required error={fieldErrors.plateNumber}>
                <input
                  className={inputClass}
                  value={form.plateNumber}
                  onChange={(e) => setForm({ ...form, plateNumber: e.target.value.toUpperCase() })}
                  placeholder="51F-12345"
                  required
                />
              </Field>
              <Field label="Loại xe" required error={fieldErrors.vehicleTypeId}>
                <select className={inputClass} value={form.vehicleTypeId} onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value })} required>
                  <option value="">— Chọn loại xe —</option>
                  {vehicleTypes.map((v) => (
                    <option key={v.vehicle_type_id} value={v.vehicle_type_id}>{v.type_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tầng" required error={fieldErrors.floorId}>
                <select className={inputClass} value={form.floorId} onChange={(e) => onFloorChange(e.target.value)} required>
                  <option value="">— Chọn tầng —</option>
                  {floors.map((f) => (
                    <option key={f.floor_id} value={f.floor_id}>{f.floor_code} — {f.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cổng vào (IN)" required error={fieldErrors.gateId} hint={form.floorId ? undefined : 'Chọn tầng trước'}>
                <select className={inputClass} value={form.gateId} onChange={(e) => setForm({ ...form, gateId: e.target.value })} required disabled={!form.floorId}>
                  <option value="">— Chọn cổng vào —</option>
                  {gates.map((g) => (
                    <option key={g.gate_id} value={g.gate_id}>{g.gate_code}</option>
                  ))}
                </select>
              </Field>
              <Field label="Khu vực (tùy chọn)" hint="Để trống = hệ thống tự chọn chỗ trống">
                <select className={inputClass} value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })} disabled={!form.floorId}>
                  <option value="">— Tự động —</option>
                  {zones.map((z) => (
                    <option key={z.zone_id} value={z.zone_id}>{z.zone_code} — {z.label}</option>
                  ))}
                </select>
              </Field>
              <Button type="submit" className="brand-gradient w-full border-0 shadow-(--shadow-soft)" loading={submitting}>
                Check-in xe vào
              </Button>
            </form>
          </Card>

          {/* Kết quả check-in gần nhất */}
          <div>
            {lastCheckin ? (
              <Card className="border-brand/30 bg-brand-light/40">
                <h2 className="text-lg font-semibold text-slate-800">Check-in thành công ✓</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Biển số</dt><dd className="font-mono font-medium">{lastCheckin.plate_number}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Loại xe</dt><dd>{lastCheckin.vehicleType?.type_name || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Chỗ đỗ</dt><dd className="font-medium text-brand">{lastCheckin.slot?.slot_code || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Khu / Tầng</dt><dd>{lastCheckin.slot?.zone?.label || '—'}{lastCheckin.slot?.zone?.floor ? ` · ${lastCheckin.slot.zone.floor.floor_code}` : ''}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Giờ vào</dt><dd>{lastCheckin.time_in ? new Date(lastCheckin.time_in).toLocaleString('vi-VN') : '—'}</dd></div>
                </dl>
                {lastCheckin.qr_token && (
                  <div className="mt-3 flex flex-col items-center gap-2 border-t border-slate-200 pt-3">
                    <QRCodeSVG value={lastCheckin.qr_token} size={140} aria-label="Mã QR vé ra cổng" />
                    <p className="text-xs text-slate-500">Khách chụp mã này làm vé — xuất trình khi ra cổng</p>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="flex h-full items-center justify-center text-center text-sm text-slate-400">
                Kết quả check-in sẽ hiển thị ở đây (chỗ đỗ được gán tự động).
              </Card>
            )}
          </div>
        </div>
      )}

      {/* TAB XE ĐANG ĐỖ */}
      {tab === 'active' && (
        <Card padding={false}>
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-800">Xe đang trong bãi</h2>
            <Button variant="secondary" size="sm" onClick={loadActive} loading={loadingActive}>Làm mới</Button>
          </div>
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Biển số</th>
                  <th className="px-4 py-3 font-medium">Loại xe</th>
                  <th className="px-4 py-3 font-medium">Chỗ đỗ</th>
                  <th className="px-4 py-3 font-medium">Giờ vào</th>
                  <th className="px-4 py-3 font-medium">Đã đỗ</th>
                  <th className="px-4 py-3 font-medium">Phí tạm tính</th>
                  <th className="px-4 py-3 text-right font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loadingActive ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
                ) : active.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Không có xe nào trong bãi</td></tr>
                ) : (
                  active.map((s) => (
                    <tr key={s.session_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono font-medium text-slate-800">{s.plate_number}</td>
                      <td className="px-4 py-3">{s.vehicleType?.type_name || '—'}</td>
                      <td className="px-4 py-3">{s.slot?.slot_code || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{s.time_in ? new Date(s.time_in).toLocaleString('vi-VN') : '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtElapsed(s.time_in)}</td>
                      <td className="px-4 py-3 font-medium text-brand">
                        {fees[s.session_id] ? fmtMoney(fees[s.session_id].fee) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="space-x-3 px-4 py-3 text-right whitespace-nowrap">
                        <button type="button" onClick={() => handlePreviewFee(s)} className="font-medium text-brand hover:underline">Xem phí</button>
                        <button type="button" onClick={() => openCheckout(s)} className="font-medium text-emerald-600 hover:underline">Xe ra</button>
                        <button type="button" onClick={() => handleCorrectPlate(s)} className="font-medium text-slate-500 hover:underline">Sửa biển số</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB ĐẶT CHỖ VÀO (RESERVATION CHECK-IN) */}
      {tab === 'reservation' && (
        <div className="space-y-6">
          {/* Tra cứu bằng mã QR */}
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Quét / nhập mã QR đặt chỗ</h2>
            <p className="mb-4 text-sm text-slate-500">Nhập mã QR trên vé của khách để tra cứu và cho xe vào.</p>
            <ErrorAlert message={resLookupError} className="mb-4" />
            <form onSubmit={handleReservationLookup} className="flex flex-col gap-3 sm:flex-row">
              <input
                className={inputClass}
                value={resQr}
                onChange={(e) => setResQr(e.target.value)}
                placeholder="Dán hoặc quét mã QR..."
              />
              <Button type="submit" className="brand-gradient shrink-0 border-0" loading={resLooking}>
                Tra cứu
              </Button>
            </form>
          </Card>

          {/* Đặt chỗ sắp tới (đã thanh toán, chờ vào) */}
          <Card padding={false}>
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">Đặt chỗ chờ vào bãi</h2>
              <Button variant="secondary" size="sm" onClick={loadUpcoming} loading={loadingUpcoming}>Làm mới</Button>
            </div>
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Biển số</th>
                    <th className="px-4 py-3 font-medium">Loại xe</th>
                    <th className="px-4 py-3 font-medium">Tầng · Chỗ</th>
                    <th className="px-4 py-3 font-medium">Khung giờ</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUpcoming ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
                  ) : upcoming.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Chưa có đặt chỗ nào chờ vào</td></tr>
                  ) : (
                    upcoming.map((r) => {
                      const badge = reservationCheckinBadge(r);
                      return (
                      <tr key={r.reservation_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-mono font-medium text-slate-800">{r.plate_number}</td>
                        <td className="px-4 py-3">{r.vehicleType?.type_name || '—'}</td>
                        <td className="px-4 py-3">{r.floor?.floor_code || '—'}{r.slot?.slot_code ? ` · ${r.slot.slot_code}` : ''}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {r.start_time ? new Date(r.start_time).toLocaleString('vi-VN') : '—'}
                          {r.end_time ? ` → ${new Date(r.end_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </td>
                        <td className="px-4 py-3">
                          {badge ? <span className={badge.className}>{badge.label}</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button type="button" onClick={() => openReservationCheckin(r)} className="font-medium text-emerald-600 hover:underline">Cho xe vào</button>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL CHO XE ĐẶT CHỖ VÀO */}
      <Modal
        open={!!ciRes}
        title={`Cho xe vào — ${ciRes?.plate_number || ''}`}
        onClose={() => setCiRes(null)}
      >
        <ErrorAlert message={ciError} className="mb-4" />
        <form onSubmit={handleReservationCheckin} className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Loại xe</span><span>{ciRes?.vehicleType?.type_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Tầng · Chỗ</span><span>{ciRes?.floor?.floor_code || '—'}{ciRes?.slot?.slot_code ? ` · ${ciRes.slot.slot_code}` : ''}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Khung giờ</span><span>{ciRes?.start_time ? new Date(ciRes.start_time).toLocaleString('vi-VN') : '—'}</span></div>
          </div>

          <Field label="Cổng vào (IN)" required hint={ciGates.length ? undefined : 'Tầng đã đặt chưa có cổng vào — Manager cần tạo cổng chiều IN'}>
            <select className={inputClass} value={ciGateId} onChange={(e) => setCiGateId(e.target.value)} required>
              <option value="">— Chọn cổng vào —</option>
              {ciGates.map((g) => (
                <option key={g.gate_id} value={g.gate_id}>{g.gate_code}</option>
              ))}
            </select>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCiRes(null)}>Hủy</Button>
            <Button type="submit" className="brand-gradient border-0" loading={ciSubmitting} disabled={!ciGates.length}>
              Xác nhận cho vào
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL XE RA (CHECK-OUT) */}
      <Modal
        open={!!coSession}
        title={`Xe ra — ${coSession?.plate_number || ''}`}
        onClose={() => setCoSession(null)}
      >
        <ErrorAlert message={coError} className="mb-4" />

        {coResult ? (
          // Đã check-out: hiện kết quả
          <div className="space-y-3 text-sm">
            <div className={`rounded-lg px-4 py-3 ${coResult.barrierOpened ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {coResult.barrierOpened
                ? (coResult.passCovered ? '✓ Vé tháng — barie mở, không tính phí' : coResult.freeCheckout ? '✓ Miễn phí — barie đã mở' : '✓ Đã thu phí — barie đã mở')
                : '⏳ Cần thanh toán để mở barie'}
            </div>
            <div className="flex justify-between"><span className="text-slate-500">Phí</span><span className="font-semibold text-brand">{fmtMoney(coResult.fee)}</span></div>
            <Button className="brand-gradient mt-2 w-full border-0" onClick={() => setCoSession(null)}>Đóng</Button>
          </div>
        ) : (
          // Form check-out
          <form onSubmit={handleCheckout} className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Chỗ đỗ</span><span>{coSession?.slot?.slot_code || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Giờ vào</span><span>{coSession?.time_in ? new Date(coSession.time_in).toLocaleString('vi-VN') : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Đã đỗ</span><span>{fmtElapsed(coSession?.time_in)}</span></div>
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
                <span className="text-slate-500">Phí tạm tính</span>
                <span className="font-semibold text-brand">{coPreview ? fmtMoney(coPreview.fee) : 'Đang tính...'}</span>
              </div>
            </div>

            <Field label="Cổng ra (OUT)" required hint={coGates.length ? undefined : 'Tầng này chưa có cổng ra — Manager cần tạo cổng chiều OUT'}>
              <select className={inputClass} value={coGateId} onChange={(e) => setCoGateId(e.target.value)} required>
                <option value="">— Chọn cổng ra —</option>
                {coGates.map((g) => (
                  <option key={g.gate_id} value={g.gate_id}>{g.gate_code}</option>
                ))}
              </select>
            </Field>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={coLost} onChange={(e) => setCoLost(e.target.checked)} />
              Khách báo mất vé (phụ thu)
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setCoSession(null)}>Hủy</Button>
              <Button type="submit" className="brand-gradient border-0" loading={coSubmitting} disabled={!coGates.length}>
                Xác nhận xe ra
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
