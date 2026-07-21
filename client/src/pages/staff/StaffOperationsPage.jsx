import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Camera } from 'lucide-react';
import { sessionsApi } from '../../api/sessions';
import { staffReservationsApi } from '../../api/staffReservations';
import { floorsApi, vehicleTypesApi, gatesApi, zonesApi } from '../../api/masterData';
import { friendlyReservationError, reservationCheckinBadge } from '../../lib/reservationStatus';
import { publicApi } from '../../api/public';
import { validateCheckinForm } from '../../lib/validate';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';
import QrScanner from '../../components/QrScanner';
import { incidentsApi } from '../../api/incidents';
import { staffPassesApi } from '../../api/staffPasses';

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

// 5 loại sự cố Staff được phép báo (mirror server STAFF_CREATABLE_INCIDENT_TYPES + nhãn VN).
// needLink: BE bắt buộc gắn 1 thực thể (vd phiên xe) cho các loại này.
const STAFF_INCIDENT_TYPES = [
  { value: 'lost_ticket', label: 'Mất thẻ', needLink: true },
  { value: 'wrong_info', label: 'Sai thông tin xe', needLink: true },
  { value: 'overstay', label: 'Quá hạn gửi', needLink: true },
  { value: 'wrong_zone', label: 'Sai khu vực', needLink: true },
  { value: 'other', label: 'Khác', needLink: false },
];
const INCIDENT_STATUS_BADGE = {
  open: 'bg-amber-50 text-amber-700',
  investigating: 'bg-blue-50 text-blue-700',
  resolved: 'bg-emerald-50 text-emerald-700',
};

// Vé tháng (tab tra cứu của Staff).
const PASS_STATUS_OPTIONS = [
  ['pending', 'Chờ thanh toán'],
  ['active', 'Đang hiệu lực'],
  ['expired', 'Hết hạn'],
  ['cancelled', 'Đã hủy'],
];
const PASS_LABEL = Object.fromEntries(PASS_STATUS_OPTIONS);
const PASS_BADGE = {
  pending: 'bg-amber-50 text-amber-700',
  active: 'bg-emerald-50 text-emerald-700',
  expired: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
};
const fmtPassDate = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
const hhmm = (t) => (t ? String(t).slice(0, 5) : '—');

export default function StaffOperationsPage() {
  const [tab, setTab] = useState('checkin'); // 'checkin' | 'active' | 'reservation' | 'booth' | 'incident'

  // Dữ liệu danh mục cho dropdown
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [gates, setGates] = useState([]); // cổng IN theo tầng đã chọn
  const [zones, setZones] = useState([]); // khu theo tầng đã chọn (tùy chọn)
  const [availability, setAvailability] = useState([]); // số chỗ trống theo tầng/khu

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
  const [coOverstay, setCoOverstay] = useState(false); // phụ thu lố giờ (staff chủ động tick)
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

  // Tra cứu phiên đang đỗ bằng QR (xem chi tiết xe rồi cho ra / sửa biển số).
  const [lkQr, setLkQr] = useState('');
  const [lkLooking, setLkLooking] = useState(false);
  const [lkError, setLkError] = useState('');
  const [lkSession, setLkSession] = useState(null); // phiên tra được (null = chưa tra)

  // Booth thu tiền mặt (xe ra) — tra cứu bằng QR HOẶC biển số (khi khách mất vé). BE tự suy cổng.
  const [boothQr, setBoothQr] = useState('');
  const [boothPlate, setBoothPlate] = useState(''); // tra theo biển số khi khách MẤT VÉ (không có QR)
  const [boothLost, setBoothLost] = useState(false);
  const [boothOverstay, setBoothOverstay] = useState(false); // phụ thu lố giờ (staff chủ động tick)
  const [boothLooking, setBoothLooking] = useState(false);
  const [boothError, setBoothError] = useState('');
  const [boothPreview, setBoothPreview] = useState(null); // { session, fee } sau khi tra cứu
  const [boothSubmitting, setBoothSubmitting] = useState(false);
  const [boothResult, setBoothResult] = useState(null); // kết quả sau khi thu tiền mặt

  // Quét QR bằng camera dùng chung cho 2 tab: 'reservation' (đặt chỗ vào) | 'booth' (thu tiền mặt) | null.
  const [scanTarget, setScanTarget] = useState(null);

  // Sự cố (incident) — Staff báo + xem sự cố của mình.
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [incForm, setIncForm] = useState({ type: '', description: '', sessionId: '' });
  const [incFieldErrors, setIncFieldErrors] = useState({});
  const [incError, setIncError] = useState('');
  const [incSubmitting, setIncSubmitting] = useState(false);

  // Vé tháng — tab tra cứu (danh sách phân trang + bộ lọc trạng thái/tầng/biển số).
  const [passes, setPasses] = useState({ items: [], total: 0, page: 1, limit: 50, pages: 0 });
  const [passLoading, setPassLoading] = useState(false);
  const [passFilters, setPassFilters] = useState({ status: '', floorId: '', plate: '' });

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

  // Số chỗ trống theo tầng/khu (GET /public/availability) — cập nhật dropdown + panel.
  const loadAvailability = async () => {
    try {
      const { data } = await publicApi.availability();
      setAvailability(data.data || []);
    } catch {
      // lỗi tải số chỗ trống không chặn nghiệp vụ check-in
    }
  };

  // Sự cố do chính staff này báo (BE lọc theo reporter khi role = Staff).
  const loadIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const { data } = await incidentsApi.list({ limit: 50 });
      setIncidents(data.data?.items || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Không tải được danh sách sự cố');
    } finally {
      setLoadingIncidents(false);
    }
  };

  // Gửi báo sự cố. Loại lost_ticket/wrong_info/overstay/wrong_zone BE bắt buộc gắn 1 phiên.
  const submitIncident = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!incForm.type) errs.type = 'Chọn loại sự cố';
    if (!incForm.description.trim()) errs.description = 'Nhập mô tả';
    const typeMeta = STAFF_INCIDENT_TYPES.find((t) => t.value === incForm.type);
    if (typeMeta?.needLink && !incForm.sessionId) errs.sessionId = 'Loại này cần gắn 1 xe đang đỗ';
    setIncFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setIncError('');
    setIncSubmitting(true);
    try {
      await incidentsApi.create({
        type: incForm.type,
        description: incForm.description.trim(),
        ...(incForm.sessionId ? { sessionId: Number(incForm.sessionId) } : {}),
      });
      toast.success('Đã báo sự cố');
      setIncForm({ type: '', description: '', sessionId: '' });
      setIncFieldErrors({});
      loadIncidents();
    } catch (err) {
      setIncError(err.response?.data?.error?.message || 'Báo sự cố thất bại');
    } finally {
      setIncSubmitting(false);
    }
  };

  // Tra cứu vé tháng (Staff) — lọc trạng thái/tầng/biển số, phân trang.
  const loadPasses = async (f = passFilters, page = 1) => {
    setPassLoading(true);
    try {
      const params = { page };
      if (f.status) params.status = f.status;
      if (f.floorId) params.floorId = f.floorId;
      if (f.plate.trim()) params.plate = f.plate.trim();
      const { data } = await staffPassesApi.list(params);
      setPasses(data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Không tải được danh sách vé tháng');
    } finally {
      setPassLoading(false);
    }
  };

  const handlePassSearch = (e) => {
    e.preventDefault();
    loadPasses(passFilters, 1);
  };

  // Tải danh mục + danh sách xe đang đỗ + đặt chỗ sắp tới + số chỗ trống khi mở trang.
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
      loadAvailability();
      loadIncidents();
      loadPasses();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const inGates = (gRes.data.data || []).filter((g) => g.direction === 'in' && g.is_active);
      setCiGates(inGates);
      if (inGates.length === 1) setCiGateId(String(inGates[0].gate_id)); // 1 cổng IN -> tự chọn
    } catch {
      setCiError('Không tải được cổng vào của tầng đã đặt');
    }
  };

  // Tra cứu đơn theo mã QR (từ ô nhập tay HOẶC camera) rồi mở modal cho vào.
  const runReservationLookup = async (raw) => {
    const token = String(raw || '').trim();
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

  const handleReservationLookup = (e) => {
    e.preventDefault();
    runReservationLookup(resQr);
  };

  const handleReservationCheckin = async (e) => {
    e.preventDefault();
    setCiError('');
    setCiSubmitting(true);
    try {
      await staffReservationsApi.checkin({
        reservationId: ciRes.reservation_id,
        ...(ciGateId ? { gateId: Number(ciGateId) } : {}), // BE tự suy cổng IN nếu bỏ trống
      });
      toast.success('Cho xe đặt chỗ vào bãi thành công');
      setCiRes(null);
      loadActive();
      loadUpcoming();
      loadAvailability();
    } catch (err) {
      setCiError(friendlyReservationError(err));
    } finally {
      setCiSubmitting(false);
    }
  };

  // Tra cứu phiên đang đỗ theo mã QR (từ ô nhập tay HOẶC camera).
  const runSessionLookup = async (raw) => {
    const token = String(raw || '').trim();
    if (!token) return;
    setLkError('');
    setLkLooking(true);
    try {
      const { data } = await sessionsApi.staffLookup(token);
      setLkSession(data.data);
      setLkQr('');
    } catch (err) {
      setLkSession(null);
      setLkError(err.response?.data?.error?.message || 'Không tìm thấy xe đang gửi với mã QR này');
    } finally {
      setLkLooking(false);
    }
  };

  const handleSessionLookup = (e) => {
    e.preventDefault();
    runSessionLookup(lkQr);
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
      const inGates = (gRes.data.data || []).filter((g) => g.direction === 'in' && g.is_active);
      setGates(inGates);
      // BE tự suy cổng khi tầng chỉ có 1 cổng IN -> tự điền sẵn, staff khỏi chọn.
      if (inGates.length === 1) setForm((f) => ({ ...f, gateId: String(inGates[0].gate_id) }));
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
        ...(form.gateId ? { gateId: Number(form.gateId) } : {}), // BE tự suy nếu bỏ trống
        ...(form.zoneId ? { zoneId: Number(form.zoneId) } : {}),
      };
      const { data } = await sessionsApi.checkin(payload);
      setLastCheckin(data.data);
      toast.success('Check-in thành công');
      setForm((f) => ({ ...emptyCheckin, floorId: f.floorId, gateId: f.gateId })); // giữ tầng/cổng cho lượt sau
      loadActive();
      loadAvailability();
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
    setCoOverstay(false);
    setCoResult(null);
    setCoError('');
    setCoPreview(null);
    const floorId = sessionFloorId(session);
    try {
      const [gRes, pRes] = await Promise.all([
        floorId ? gatesApi.list(floorId) : Promise.resolve({ data: { data: [] } }),
        sessionsApi.previewFee({ sessionId: session.session_id }),
      ]);
      const outGates = (gRes.data.data || []).filter((g) => g.direction === 'out' && g.is_active);
      setCoGates(outGates);
      if (outGates.length === 1) setCoGateId(String(outGates[0].gate_id)); // 1 cổng OUT -> tự chọn
      setCoPreview(pRes.data.data);
    } catch (err) {
      setCoError(err.response?.data?.error?.message || 'Không tải được cổng ra / phí');
    }
  };

  // Tick "mất vé"/"phụ thu lố giờ" ở modal Xe ra: tra LẠI phí ngay để "Phí tạm tính" khớp
  // đúng số sẽ thu khi xác nhận (đồng bộ hành vi với tab Thu tiền mặt). Lỗi tra lại thì giữ
  // preview cũ — phí thật vẫn do BE tính lúc check-out.
  const refreshCoPreview = async (lost, over) => {
    if (!coSession) return;
    try {
      const { data } = await sessionsApi.previewFee({
        sessionId: coSession.session_id,
        lostTicket: lost,
        overstayCharge: over,
      });
      setCoPreview(data.data);
    } catch {
      // giữ preview cũ
    }
  };
  const toggleCoLost = (checked) => {
    setCoLost(checked);
    refreshCoPreview(checked, coOverstay);
  };
  const toggleCoOverstay = (checked) => {
    setCoOverstay(checked);
    refreshCoPreview(coLost, checked);
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    setCoError('');
    setCoSubmitting(true);
    try {
      const { data } = await sessionsApi.checkout({
        sessionId: coSession.session_id,
        ...(coGateId ? { gateId: Number(coGateId) } : {}), // BE tự suy cổng OUT nếu bỏ trống
        lostTicket: coLost,
        overstayCharge: coOverstay,
      });
      setCoResult(data.data);
      if (data.data?.barrierOpened) {
        toast.success('Xe ra thành công — barie mở');
      } else {
        toast.info('Cần thanh toán để mở barie');
      }
      // Nếu phiên này vừa tra qua tab "Tra cứu xe (QR)" thì bỏ card cũ đi cho khỏi lệch.
      if (lkSession?.session_id === coSession.session_id) setLkSession(null);
      loadActive(); // phiên rời khỏi danh sách đang đỗ
      loadAvailability();
    } catch (err) {
      setCoError(err.response?.data?.error?.message || 'Check-out thất bại');
    } finally {
      setCoSubmitting(false);
    }
  };

  // Booth: tra cứu phí xe ra. Hỗ trợ QR (thường) HOẶC biển số (khi khách MẤT VÉ).
  // lookup = { qrToken } | { plateNumber } | { sessionId }. lost = tính phụ thu mất vé.
  const lookupBooth = async (lookup, lost = boothLost, over = boothOverstay) => {
    const key = (lookup.qrToken ?? lookup.plateNumber ?? lookup.sessionId ?? '').toString().trim();
    if (!key) return;
    setBoothError('');
    setBoothResult(null);
    setBoothLooking(true);
    try {
      const { data } = await sessionsApi.previewFee({ ...lookup, lostTicket: lost, overstayCharge: over });
      setBoothPreview(data.data);
    } catch (err) {
      setBoothPreview(null);
      setBoothError(err.response?.data?.error?.message || 'Không tra cứu được — kiểm tra lại mã QR / biển số');
    } finally {
      setBoothLooking(false);
    }
  };

  const lookupBoothByQr = (e) => {
    if (e?.preventDefault) e.preventDefault();
    lookupBooth({ qrToken: boothQr.trim() });
  };

  // Mất vé: khách không có QR → tra theo biển số.
  const lookupBoothByPlate = (e) => {
    if (e?.preventDefault) e.preventDefault();
    lookupBooth({ plateNumber: boothPlate.trim().toUpperCase() });
  };

  // Toggle "mất vé": tra lại phí theo CHÍNH phiên đang xem (sessionId) — không phụ thuộc cách tra.
  const toggleBoothLost = (checked) => {
    setBoothLost(checked);
    if (boothPreview?.session?.session_id) {
      lookupBooth({ sessionId: boothPreview.session.session_id }, checked, boothOverstay);
    }
  };

  // Toggle "phụ thu lố giờ": tra lại phí (cộng overstay_fee do Manager set) theo phiên đang xem.
  const toggleBoothOverstay = (checked) => {
    setBoothOverstay(checked);
    if (boothPreview?.session?.session_id) {
      lookupBooth({ sessionId: boothPreview.session.session_id }, boothLost, checked);
    }
  };

  // Booth: xác nhận đã thu tiền mặt -> BE ghi payment 'cash' + mở barie.
  // Dùng sessionId của phiên đã tra cứu → chạy đúng dù tra bằng QR hay biển số.
  const confirmBoothCash = async () => {
    const sessionId = boothPreview?.session?.session_id;
    if (!sessionId || boothSubmitting) return;
    setBoothError('');
    setBoothSubmitting(true);
    try {
      const { data } = await sessionsApi.cashCheckout({ sessionId, lostTicket: boothLost, overstayCharge: boothOverstay });
      setBoothResult(data.data);
      setBoothPreview(null);
      toast.success('Đã thu tiền mặt — barie mở');
      loadActive();
      loadAvailability();
    } catch (err) {
      setBoothError(err.response?.data?.error?.message || 'Thu tiền mặt thất bại');
    } finally {
      setBoothSubmitting(false);
    }
  };

  const resetBooth = () => {
    setBoothQr('');
    setBoothPlate('');
    setBoothLost(false);
    setBoothOverstay(false);
    setBoothPreview(null);
    setBoothResult(null);
    setBoothError('');
  };

  // Số chỗ trống cho tầng đang chọn (theo loại xe nếu đã chọn) — dùng cho dropdown + panel.
  const floorMetaFor = (floorId) => availability.find((f) => String(f.floorId) === String(floorId)) || null;
  const freeFor = (floorMeta, vehicleTypeId) => {
    if (!floorMeta) return null;
    if (!vehicleTypeId) return { available: floorMeta.available, total: floorMeta.total };
    const zs = (floorMeta.zones || []).filter((z) => String(z.vehicleTypeId) === String(vehicleTypeId));
    return {
      available: zs.reduce((s, z) => s + (z.available || 0), 0),
      total: zs.reduce((s, z) => s + (z.total || 0), 0),
    };
  };
  const selectedFloorMeta = floorMetaFor(form.floorId);
  const selectedFloorFree = freeFor(selectedFloorMeta, form.vehicleTypeId);
  const selectedVtName = vehicleTypes.find((v) => String(v.vehicle_type_id) === String(form.vehicleTypeId))?.type_name;
  // Khu của tầng đang chọn, lọc theo loại xe (để staff khỏi chọn nhầm khu khác loại).
  const visibleZones = zones.filter((z) => !form.vehicleTypeId || String(z.vehicle_type_id) === String(form.vehicleTypeId));
  const zoneAvailById = (zoneId) => (selectedFloorMeta?.zones || []).find((z) => String(z.zoneId) === String(zoneId)) || null;

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
          { id: 'active', label: `Phiên hoạt động${active.length ? ` (${active.length})` : ''}` },
          { id: 'reservation', label: `Đặt chỗ vào${upcoming.length ? ` (${upcoming.length})` : ''}` },
          { id: 'lookup', label: 'Tra cứu xe (QR)' },
          { id: 'booth', label: 'Thu tiền mặt (ra)' },
          { id: 'incident', label: `Sự cố${incidents.length ? ` (${incidents.length})` : ''}` },
          { id: 'passes', label: 'Vé tháng' },
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
                <select className={inputClass} value={form.vehicleTypeId} onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value, zoneId: '' })} required>
                  <option value="">— Chọn loại xe —</option>
                  {vehicleTypes.map((v) => (
                    <option key={v.vehicle_type_id} value={v.vehicle_type_id}>{v.type_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tầng" required error={fieldErrors.floorId}>
                <select className={inputClass} value={form.floorId} onChange={(e) => onFloorChange(e.target.value)} required>
                  <option value="">— Chọn tầng —</option>
                  {floors.map((f) => {
                    const fr = freeFor(floorMetaFor(f.floor_id), form.vehicleTypeId);
                    return (
                      <option key={f.floor_id} value={f.floor_id}>
                        {f.floor_code} — {f.label}{fr ? ` (${fr.available} trống)` : ''}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="Cổng vào (IN)" error={fieldErrors.gateId} hint={form.floorId ? 'Cổng do hệ thống tự chọn theo tầng' : 'Chọn tầng trước'}>
                {!form.floorId ? (
                  <div className={`${inputClass} text-slate-400`}>— Chọn tầng trước —</div>
                ) : gates.length === 0 ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Tầng chưa có cổng vào — báo Manager tạo cổng chiều IN.</p>
                ) : gates.length === 1 ? (
                  <div className={`${inputClass} flex items-center justify-between bg-slate-50`}>
                    <span className="font-medium text-slate-700">{gates[0].gate_code}</span>
                    <span className="text-xs text-slate-400">tự chọn</span>
                  </div>
                ) : (
                  <select className={inputClass} value={form.gateId} onChange={(e) => setForm({ ...form, gateId: e.target.value })} required>
                    <option value="">— Chọn cổng vào —</option>
                    {gates.map((g) => (
                      <option key={g.gate_id} value={g.gate_id}>{g.gate_code}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Khu vực (tùy chọn)" hint="Để trống = hệ thống tự chọn chỗ trống">
                <select className={inputClass} value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })} disabled={!form.floorId}>
                  <option value="">— Tự động —</option>
                  {visibleZones.map((z) => {
                    const za = zoneAvailById(z.zone_id);
                    const full = za ? za.available === 0 : false;
                    return (
                      <option key={z.zone_id} value={z.zone_id} disabled={full}>
                        {z.zone_code} — {z.label}{za ? ` (${za.available}/${za.total} trống)` : ''}{full ? ' — đầy' : ''}
                      </option>
                    );
                  })}
                </select>
              </Field>
              {form.floorId && selectedFloorFree && (
                <div className={`rounded-lg px-3 py-2 text-sm ${selectedFloorFree.available === 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {selectedFloorFree.available === 0
                    ? `Tầng đầy${selectedVtName ? ` cho ${selectedVtName}` : ''} (${selectedFloorFree.available}/${selectedFloorFree.total} chỗ)`
                    : `Còn ${selectedFloorFree.available}/${selectedFloorFree.total} chỗ${selectedVtName ? ` cho ${selectedVtName}` : ''}`}
                </div>
              )}
              <Button type="submit" className="brand-gradient w-full border-0 shadow-(--shadow-soft)" loading={submitting} disabled={!!form.floorId && gates.length === 0}>
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
                    <span
                      className="max-w-[140px] cursor-default select-all break-all font-mono text-[10px] text-slate-400"
                      title={lastCheckin.qr_token}
                    >
                      {lastCheckin.qr_token}
                    </span>
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
                    <tr key={s.session_id} className={`border-t border-slate-100 hover:bg-slate-50/60 ${s.overstay ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-3 font-mono font-medium text-slate-800">
                        {s.plate_number}
                        {s.overstay && (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">Quá giờ</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{s.vehicleType?.type_name || '—'}</td>
                      <td className="px-4 py-3">{s.slot?.slot_code || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{s.time_in ? new Date(s.time_in).toLocaleString('vi-VN') : '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {fmtElapsed(s.time_in)}
                        {s.overstay && s.overstayHours > 0 && (
                          <span className="ml-1 text-xs font-medium text-red-600">(+{s.overstayHours}h)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-brand">
                        {fees[s.session_id] ? fmtMoney(fees[s.session_id].fee) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="space-x-3 px-4 py-3 text-right whitespace-nowrap">
                        <button type="button" onClick={() => handlePreviewFee(s)} className="font-medium text-brand hover:underline">Xem phí</button>
                        <button type="button" onClick={() => openCheckout(s)} className="font-medium text-emerald-600 hover:underline">Xe ra</button>
                        {s.overstay && (
                          <button
                            type="button"
                            onClick={() => {
                              setIncForm({ type: 'overstay', description: `Xe ${s.plate_number} đỗ quá giờ${s.overstayHours ? ` (~${s.overstayHours}h)` : ''}`, sessionId: String(s.session_id) });
                              setIncFieldErrors({});
                              setIncError('');
                              setTab('incident');
                            }}
                            className="font-medium text-red-600 hover:underline"
                          >
                            Báo lố giờ
                          </button>
                        )}
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
              <Button type="button" variant="secondary" className="shrink-0" onClick={() => setScanTarget('reservation')}>
                <Camera className="h-4 w-4" /> Quét camera
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

      {/* TAB TRA CỨU XE (QR) — quét mã QR trên vé để mở đúng phiên đang đỗ rồi cho ra */}
      {tab === 'lookup' && (
        <div className="max-w-xl space-y-6">
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Tra cứu xe đang gửi</h2>
            <p className="mb-4 text-sm text-slate-500">Quét / nhập mã QR trên vé của khách để xem xe đang đỗ và cho xe ra.</p>
            <ErrorAlert message={lkError} className="mb-4" />
            <form onSubmit={handleSessionLookup} className="flex flex-col gap-3 sm:flex-row">
              <input
                className={inputClass}
                value={lkQr}
                onChange={(e) => setLkQr(e.target.value)}
                placeholder="Dán hoặc quét mã QR..."
              />
              <Button type="submit" className="brand-gradient shrink-0 border-0" loading={lkLooking}>Tra cứu</Button>
              <Button type="button" variant="secondary" className="shrink-0" onClick={() => setScanTarget('lookup')}>
                <Camera className="h-4 w-4" /> Quét camera
              </Button>
            </form>
          </Card>

          {lkSession && (
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-base font-semibold text-slate-800">{lkSession.plate_number}</h3>
                {lkSession.overstay && (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Quá giờ</span>
                )}
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Loại xe</dt><dd>{lkSession.vehicleType?.type_name || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Chỗ đỗ</dt><dd className="font-medium text-brand">{lkSession.slot?.slot_code || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Khu / Tầng</dt><dd>{lkSession.slot?.zone?.label || '—'}{lkSession.slot?.zone?.floor ? ` · ${lkSession.slot.zone.floor.floor_code}` : ''}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Giờ vào</dt><dd>{lkSession.time_in ? new Date(lkSession.time_in).toLocaleString('vi-VN') : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Đã đỗ</dt><dd>{fmtElapsed(lkSession.time_in)}</dd></div>
                {fees[lkSession.session_id] && (
                  <div className="flex justify-between border-t border-slate-200 pt-2"><dt className="text-slate-500">Phí tạm tính</dt><dd className="font-semibold text-brand">{fmtMoney(fees[lkSession.session_id].fee)}</dd></div>
                )}
              </dl>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => handlePreviewFee(lkSession)}>Xem phí</Button>
                <Button type="button" className="brand-gradient border-0" onClick={() => openCheckout(lkSession)}>Xe ra</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB BOOTH — THU TIỀN MẶT XE RA (chốt BLD-OUT, tra cứu bằng QR; cổng do BE tự suy) */}
      {tab === 'booth' && (
        <div className="max-w-xl">
          <Card>
            <h2 className="text-lg font-semibold text-slate-800">Thu tiền mặt xe ra</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              Khách đưa mã QR tại chốt ra → tra cứu phí → thu tiền mặt mở barie. (Khách trả online thì tự quét ở kiosk cổng ra.)
            </p>
            <ErrorAlert message={boothError} className="mb-4" />

            {boothResult ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  ✓ Đã thu tiền mặt {fmtMoney(boothResult.fee)} — barie mở.
                </div>
                <Button className="brand-gradient w-full border-0" onClick={resetBooth}>Thu xe khác</Button>
              </div>
            ) : (
              <>
                <form onSubmit={lookupBoothByQr} className="flex flex-col gap-3 sm:flex-row">
                  <input
                    className={inputClass}
                    value={boothQr}
                    onChange={(e) => setBoothQr(e.target.value)}
                    placeholder="Dán / quét mã QR của khách..."
                  />
                  <Button type="submit" variant="secondary" className="shrink-0" loading={boothLooking}>Tra cứu</Button>
                  <Button type="button" variant="secondary" className="shrink-0" onClick={() => setScanTarget('booth')}>
                    <Camera className="h-4 w-4" /> Quét camera
                  </Button>
                </form>

                {/* Mất vé: khách không có QR → tra theo BIỂN SỐ */}
                <div className="my-3 flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" /> hoặc khách MẤT VÉ <span className="h-px flex-1 bg-slate-200" />
                </div>
                <form onSubmit={lookupBoothByPlate} className="flex flex-col gap-3 sm:flex-row">
                  <input
                    className={inputClass}
                    value={boothPlate}
                    onChange={(e) => setBoothPlate(e.target.value.toUpperCase())}
                    placeholder="Tra theo biển số xe (vd 51F-12345)..."
                  />
                  <Button type="submit" variant="secondary" className="shrink-0" loading={boothLooking}>Tra biển số</Button>
                </form>

                {boothPreview && (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Biển số</span><span className="font-mono font-medium">{boothPreview.session?.plate_number || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Giờ vào</span><span>{boothPreview.session?.time_in ? new Date(boothPreview.session.time_in).toLocaleString('vi-VN') : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Đã đỗ</span><span>{fmtElapsed(boothPreview.session?.time_in)}</span></div>
                      <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
                        <span className="text-slate-500">Phí phải thu</span>
                        <span className="text-lg font-bold text-brand">{fmtMoney(boothPreview.fee)}</span>
                      </div>
                    </div>

                    {boothPreview.overstay && (
                      <p className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                        ⚠ Xe {boothPreview.session?.plate_number} LỐ GIỜ{boothPreview.overstayHours > 0 ? ` (~${boothPreview.overstayHours}h)` : ''} — BẮT BUỘC thu phụ thu {fmtMoney(boothPreview.overstayFee)} (đã tính vào phí).
                      </p>
                    )}
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={boothLost}
                        onChange={(e) => toggleBoothLost(e.target.checked)}
                      />
                      Khách báo mất vé (phụ thu)
                    </label>
                    <label className={`flex items-center gap-2 text-sm ${boothPreview.overstayEnforced ? 'font-medium text-red-700' : 'text-slate-700'}`}>
                      <input
                        type="checkbox"
                        checked={boothPreview.overstayEnforced || boothOverstay}
                        disabled={boothPreview.overstayEnforced}
                        onChange={(e) => toggleBoothOverstay(e.target.checked)}
                      />
                      Phụ thu lố giờ{boothPreview.overstayEnforced ? ' — bắt buộc' : ''}{boothPreview.overstayFee > 0 ? ` (+${fmtMoney(boothPreview.overstayFee)})` : ''}
                    </label>

                    <Button className="brand-gradient w-full border-0" loading={boothSubmitting} onClick={confirmBoothCash}>
                      Đã thu tiền mặt → mở barie
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      {/* TAB SỰ CỐ — Staff báo sự cố + xem sự cố của mình */}
      {tab === 'incident' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Báo sự cố mới */}
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Báo sự cố</h2>
            <p className="mb-4 text-sm text-slate-500">Ghi nhận sự cố tại bãi để Quản lý xem &amp; xử lý.</p>
            <ErrorAlert message={incError} className="mb-4" />
            <form onSubmit={submitIncident} className="space-y-4">
              <Field label="Loại sự cố" required error={incFieldErrors.type}>
                <select className={inputClass} value={incForm.type} onChange={(e) => setIncForm({ ...incForm, type: e.target.value })} required>
                  <option value="">— Chọn loại —</option>
                  {STAFF_INCIDENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Xe liên quan"
                error={incFieldErrors.sessionId}
                hint="Chọn xe đang đỗ — bắt buộc với mất thẻ / sai thông tin / quá hạn / sai khu"
              >
                <select className={inputClass} value={incForm.sessionId} onChange={(e) => setIncForm({ ...incForm, sessionId: e.target.value })}>
                  <option value="">— Không gắn xe —</option>
                  {active.map((s) => (
                    <option key={s.session_id} value={s.session_id}>
                      {s.plate_number}{s.slot?.slot_code ? ` · ${s.slot.slot_code}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mô tả" required error={incFieldErrors.description}>
                <textarea
                  className={`${inputClass} min-h-24`}
                  value={incForm.description}
                  onChange={(e) => setIncForm({ ...incForm, description: e.target.value })}
                  placeholder="Mô tả chi tiết sự cố..."
                  required
                />
              </Field>
              <Button type="submit" className="brand-gradient w-full border-0" loading={incSubmitting}>Gửi báo cáo</Button>
            </form>
          </Card>

          {/* Sự cố tôi đã báo */}
          <Card padding={false}>
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">Sự cố tôi đã báo</h2>
              <Button variant="secondary" size="sm" onClick={loadIncidents} loading={loadingIncidents}>Làm mới</Button>
            </div>
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Thời gian</th>
                    <th className="px-4 py-3 font-medium">Loại</th>
                    <th className="px-4 py-3 font-medium">Mô tả</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingIncidents ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
                  ) : incidents.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Chưa báo sự cố nào</td></tr>
                  ) : (
                    incidents.map((inc) => (
                      <tr key={inc.incident_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">{inc.created_at ? new Date(inc.created_at).toLocaleString('vi-VN') : '—'}</td>
                        <td className="px-4 py-3">
                          {inc.typeLabel}
                          {inc.session?.plate_number && <span className="ml-1 font-mono text-xs text-slate-400">{inc.session.plate_number}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600"><span className="block max-w-xs truncate" title={inc.description}>{inc.description}</span></td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INCIDENT_STATUS_BADGE[inc.status] || 'bg-slate-100 text-slate-600'}`}>{inc.statusLabel}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB VÉ THÁNG — Staff tra cứu vé tháng theo trạng thái / tầng / biển số */}
      {tab === 'passes' && (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Tra cứu vé tháng</h2>
            <p className="mb-4 text-sm text-slate-500">Xem vé tháng của khách theo trạng thái, tầng hoặc biển số.</p>
            <form onSubmit={handlePassSearch} className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Trạng thái</span>
                <select className={inputClass} value={passFilters.status} onChange={(e) => setPassFilters({ ...passFilters, status: e.target.value })}>
                  <option value="">— Tất cả —</option>
                  {PASS_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Tầng</span>
                <select className={inputClass} value={passFilters.floorId} onChange={(e) => setPassFilters({ ...passFilters, floorId: e.target.value })}>
                  <option value="">— Tất cả —</option>
                  {floors.map((f) => <option key={f.floor_id} value={f.floor_id}>{f.floor_code} — {f.label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-600">Biển số</span>
                <input className={inputClass} value={passFilters.plate} onChange={(e) => setPassFilters({ ...passFilters, plate: e.target.value.toUpperCase() })} placeholder="51A-12345" />
              </label>
              <Button type="submit" className="brand-gradient border-0" loading={passLoading}>Lọc</Button>
            </form>
          </Card>

          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Biển số</th>
                    <th className="px-4 py-3 font-medium">Loại xe</th>
                    <th className="px-4 py-3 font-medium">Tầng</th>
                    <th className="px-4 py-3 font-medium">Hiệu lực</th>
                    <th className="px-4 py-3 font-medium">Khung giờ</th>
                    <th className="px-4 py-3 font-medium">Chủ vé</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {passLoading ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
                  ) : passes.items.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Không có vé tháng nào khớp</td></tr>
                  ) : (
                    passes.items.map((p) => (
                      <tr key={p.pass_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-mono font-medium text-slate-800">{p.plate_number}</td>
                        <td className="px-4 py-3">{p.vehicleType?.type_name || '—'}</td>
                        <td className="px-4 py-3">{p.floor?.floor_code || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtPassDate(p.start_date)} → {fmtPassDate(p.end_date)}</td>
                        <td className="px-4 py-3 text-slate-600">{hhmm(p.valid_from_time)}–{hhmm(p.valid_to_time)}</td>
                        <td className="px-4 py-3 text-slate-600">{p.user?.full_name || p.user?.username || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PASS_BADGE[p.status] || 'bg-slate-100 text-slate-600'}`}>
                            {PASS_LABEL[p.status] || p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {passes.pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
                <span>Trang {passes.page}/{passes.pages} · {passes.total} vé</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => loadPasses(passFilters, passes.page - 1)} disabled={passLoading || passes.page <= 1}>← Trước</Button>
                  <Button variant="secondary" size="sm" onClick={() => loadPasses(passFilters, passes.page + 1)} disabled={passLoading || passes.page >= passes.pages}>Sau →</Button>
                </div>
              </div>
            )}
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

          <Field label="Cổng vào (IN)" hint="Cổng do hệ thống tự chọn theo tầng đã đặt">
            {ciGates.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Tầng đã đặt chưa có cổng vào — Manager cần tạo cổng chiều IN.</p>
            ) : ciGates.length === 1 ? (
              <div className={`${inputClass} flex items-center justify-between bg-slate-50`}>
                <span className="font-medium text-slate-700">{ciGates[0].gate_code}</span>
                <span className="text-xs text-slate-400">tự chọn</span>
              </div>
            ) : (
              <select className={inputClass} value={ciGateId} onChange={(e) => setCiGateId(e.target.value)} required>
                <option value="">— Chọn cổng vào —</option>
                {ciGates.map((g) => (
                  <option key={g.gate_id} value={g.gate_id}>{g.gate_code}</option>
                ))}
              </select>
            )}
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

            <Field label="Cổng ra (OUT)" hint="Cổng do hệ thống tự chọn theo tầng">
              {coGates.length === 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Tầng này chưa có cổng ra — Manager cần tạo cổng chiều OUT.</p>
              ) : coGates.length === 1 ? (
                <div className={`${inputClass} flex items-center justify-between bg-slate-50`}>
                  <span className="font-medium text-slate-700">{coGates[0].gate_code}</span>
                  <span className="text-xs text-slate-400">tự chọn</span>
                </div>
              ) : (
                <select className={inputClass} value={coGateId} onChange={(e) => setCoGateId(e.target.value)} required>
                  <option value="">— Chọn cổng ra —</option>
                  {coGates.map((g) => (
                    <option key={g.gate_id} value={g.gate_id}>{g.gate_code}</option>
                  ))}
                </select>
              )}
            </Field>

            {coPreview?.overstay && (
              <p className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                ⚠ Xe {coPreview.session?.plate_number} LỐ GIỜ{coPreview.overstayHours > 0 ? ` (~${coPreview.overstayHours}h)` : ''} — BẮT BUỘC thu phụ thu {fmtMoney(coPreview.overstayFee)} (đã tính vào phí).
              </p>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={coLost} onChange={(e) => toggleCoLost(e.target.checked)} />
              Khách báo mất vé (phụ thu)
            </label>
            <label className={`flex items-center gap-2 text-sm ${coPreview?.overstayEnforced ? 'font-medium text-red-700' : 'text-slate-700'}`}>
              <input
                type="checkbox"
                checked={coPreview?.overstayEnforced || coOverstay}
                disabled={coPreview?.overstayEnforced}
                onChange={(e) => toggleCoOverstay(e.target.checked)}
              />
              Phụ thu lố giờ{coPreview?.overstayEnforced ? ' — bắt buộc' : ' (giá Manager set)'}{coPreview?.overstayFee > 0 ? ` (+${fmtMoney(coPreview.overstayFee)})` : ''}
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

      {/* Overlay quét QR bằng camera — dùng chung cho tab Đặt chỗ vào & Thu tiền mặt */}
      {scanTarget && (
        <QrScanner
          onClose={() => setScanTarget(null)}
          onScan={(token) => {
            const target = scanTarget;
            setScanTarget(null);
            if (target === 'reservation') {
              setResQr(token);
              runReservationLookup(token);
            } else if (target === 'lookup') {
              setLkQr(token);
              runSessionLookup(token);
            } else if (target === 'booth') {
              setBoothQr(token);
              lookupBooth({ qrToken: token });
            }
          }}
        />
      )}
    </div>
  );
}
