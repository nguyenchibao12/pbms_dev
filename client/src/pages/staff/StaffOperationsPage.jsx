import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Camera } from 'lucide-react';
import { sessionsApi } from '../../api/sessions';
import { staffReservationsApi } from '../../api/staffReservations';
import { floorsApi, vehicleTypesApi, gatesApi } from '../../api/masterData';
import { friendlyReservationError, reservationCheckinBadge } from '../../lib/reservationStatus';
import { friendlyCheckinError, plainApiError } from '../../lib/checkinError';
import { publicApi } from '../../api/public';
import { validateCheckinForm } from '../../lib/validate';
import { PLATE_VN_HINT, cleanPlateInput, normalizePlateOrKeep } from '../../lib/plate';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Field, { ErrorAlert } from '../../components/ui/Field';
import { inputClass } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';
import QrScanner from '../../components/QrScanner';
import { incidentsApi } from '../../api/incidents';
import { staffPassesApi } from '../../api/staffPasses';

/* ============================================================================
   BAN DO FILE — 6 muc, xep DUNG thu tu hien tren sidebar ben trai.
   Muc dang mo doc tu URL (?tab=), sidebar o StaffLayout la noi chuyen muc.

   Moi muc co 3 manh mang CUNG so hieu (hang so / state+logic / giao dien).
   Go Ctrl+F so hieu trong ngoac vuong de ra du ca 3 manh:

     [1] CHECK-IN (XE VAO)    bien so -> loai xe -> tang -> cong vao (IN)
                              + o tim bien so trong bai de VE LAI QR cho khach mat ma
     [2] PHIEN HOAT DONG
     [3] DAT CHO VAO          + [3M] modal Cho xe vao
     [5] THU TIEN MAT (RA)    (so [4] cu la tab Tra cuu QR, da bo)
     [6] SU CO
     [7] VE THANG
     [0] dung chung cho nhieu muc + [0M] modal ve lai ma QR

   Thu tu trong file:  hang so -> state+logic tung muc -> giao dien tung muc.
   ============================================================================ */

/* ─────────────────────── [0] Helper dung chung ─────────────────────── */

// Lấy floor_id của đơn đặt chỗ — để lọc cổng VÀO (IN) cùng tầng đã đặt.
const reservationFloorId = (r) => r?.floor_id ?? r?.floor?.floor_id ?? r?.slot?.zone?.floor?.floor_id ?? null;

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')} ₫`;

// Khóa so sánh biển số: bỏ hết chấm/gạch/khoảng trắng. Khách mất mã QR thường chỉ đọc dãy số
// ("năm trăm lẻ một") chứ không nhớ đúng cách chấm, nên gõ "50001" phải ra được "51M-500.01".
const plateKey = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Thời gian đã đỗ tính từ time_in -> hiện tại (dạng "2h 15p").
const fmtElapsed = (timeIn) => {
  if (!timeIn) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(timeIn).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}p` : `${mins}p`;
};

// Lố giờ có 2 lý do khác nhau (BE trả overstayReason) — nói đúng để Manager không tưởng
// liên quan "Giờ gửi tối đa": reservation_window = ở quá khung đã đặt (không liên quan giờ gửi
// tối đa); walk_in_max_hours = quá giờ gửi tối đa của bãi.
// Dùng ở [2] Phiên hoạt động và [4] Thu tiền mặt.
const overstayLabel = (reason) =>
  reason === 'reservation_window'
    ? 'ở quá KHUNG ĐẶT CHỖ đã đăng ký'
    : reason === 'walk_in_max_hours'
      ? 'quá GIỜ GỬI TỐI ĐA của bãi'
      : 'lố giờ';

// Loai phien -> note nho duoi bien so o bang [2]. Muc dich: nhin bang la biet ngay
// xe nao chiu luat lo gio nao, khoi tuong he thong bo sot.
//   walk_in / auto_registered -> chan bang "Gio gui toi da" (Manager set)
//   reservation               -> chan bang end_time cua don da dat
//   monthly_pass              -> KHONG bi danh lo gio (BE: "Ve thang: khung rieng, monthly lo")
const SESSION_TYPE_NOTE = {
  walk_in: 'Khách vãng lai',
  auto_registered: 'Vãng lai (tự động)',
  reservation: 'Đặt chỗ qua app',
  monthly_pass: 'Vé tháng — không tính lố giờ',
};

// Khung gio da dat: "07:00–11:00 23/7" (cung ngay) hoac "23/7 22:00 → 24/7 06:00" (qua dem).
// Doc tu s.reservation — BE da include san start_time/end_time trong listActive.
const fmtWindow = (r) => {
  if (!r?.start_time || !r?.end_time) return null;
  const s = new Date(r.start_time);
  const e = new Date(r.end_time);
  const hm = (d) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const dm = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
  return s.toDateString() === e.toDateString()
    ? `${hm(s)}–${hm(e)} ${dm(s)}`
    : `${dm(s)} ${hm(s)} → ${dm(e)} ${hm(e)}`;
};

// Note duoi bien so: loai phien, kem KHUNG GIO neu la dat cho (moc tinh lo gio cua don).
const sessionTypeNote = (s) => {
  if (s.session_type === 'reservation') {
    const w = fmtWindow(s.reservation);
    return w ? `Đặt chỗ · ${w}` : SESSION_TYPE_NOTE.reservation;
  }
  return SESSION_TYPE_NOTE[s.session_type] || null;
};

/* ─────────────────── [1] Hang so — Check-in (xe vao) ─────────────────── */

const emptyCheckin = { plateNumber: '', vehicleTypeId: '', floorId: '', gateId: '' };

/* ────────────────────────── [6] Hang so — Su co ────────────────────────── */

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

/* ───────────────────────── [7] Hang so — Ve thang ───────────────────────── */

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
  /* ==========================================================================
     [0] DUNG CHUNG — tab dang mo, danh muc, tai du lieu luc mo trang
     ========================================================================== */

  // Mục đang mở nằm trên URL (?tab=) chứ không phải state trong component: sidebar bên trái là
  // nơi chuyển mục, và F5 / mở lại link vẫn về đúng chỗ đang xem.
  // 'checkin' | 'active' | 'reservation' | 'booth' | 'incident' | 'passes'
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'checkin';

  // Danh mục cho dropdown: floors dùng ở [1] và [7], vehicleTypes dùng ở [1].
  const [floors, setFloors] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [availability, setAvailability] = useState([]); // số chỗ trống theo tầng/khu — [1] đọc

  // Quét QR bằng camera dùng chung 2 tab: [3] đặt chỗ vào | [5] thu tiền mặt.
  const [scanTarget, setScanTarget] = useState(null);

  // Phiên đang xem mã QR (modal [0M] vẽ lại mã) — mở được từ [1] ô tìm biển số và [2] bảng xe trong bãi.
  const [qrSession, setQrSession] = useState(null);

  // Số chỗ trống theo tầng/khu (GET /public/availability) — cập nhật dropdown + panel.
  // Gọi lại sau mỗi thao tác đổi số chỗ: [1] check-in, [3] cho vào, [5] thu tiền mặt.
  const loadAvailability = async () => {
    try {
      const { data } = await publicApi.availability();
      setAvailability(data.data || []);
    } catch {
      // lỗi tải số chỗ trống không chặn nghiệp vụ check-in
    }
  };

  // Tải danh mục + danh sách xe đang đỗ + đặt chỗ sắp tới + số chỗ trống khi mở trang.
  // Các loadXxx() nằm ở section của tab tương ứng bên dưới — gọi được vì callback của
  // useEffect chỉ chạy SAU khi render xong, lúc đó mọi const đã được gán.
  useEffect(() => {
    (async () => {
      try {
        const [fRes, vRes] = await Promise.all([floorsApi.list(), vehicleTypesApi.list()]);
        setFloors(fRes.data.data);
        setVehicleTypes(vRes.data.data);
      } catch {
        toast.error('Không tải được danh mục tầng/loại xe');
      }
      loadActive();      // [2]
      loadUpcoming();    // [3]
      loadAvailability();// [0]
      loadIncidents();   // [6]
      loadPasses();      // [7]
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ==========================================================================
     [1] TAB CHECK-IN (XE VAO) — state + logic
         Giao dien o duoi: tim "[1] TAB CHECK-IN" phan JSX.
         Thu tu tren man hinh: bien so -> loai xe -> tang -> cong vao (IN)
     ========================================================================== */

  const [form, setForm] = useState(emptyCheckin);
  const [gates, setGates] = useState([]); // cổng IN theo tầng đã chọn
  const [fieldErrors, setFieldErrors] = useState({});
  const [checkinError, setCheckinError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastCheckin, setLastCheckin] = useState(null);
  const [qrSearch, setQrSearch] = useState(''); // [1.8] ô tìm biển số để vẽ lại QR

  // Khi đổi tầng: nạp cổng IN của tầng đó, reset cổng đã chọn.
  const onFloorChange = async (floorId) => {
    setForm((f) => ({ ...f, floorId, gateId: '' }));
    if (!floorId) {
      setGates([]);
      return;
    }
    try {
      const gRes = await gatesApi.list(floorId);
      const inGates = (gRes.data.data || []).filter((g) => g.direction === 'in' && g.is_active);
      setGates(inGates);
      // BE tự suy cổng khi tầng chỉ có 1 cổng IN -> tự điền sẵn, staff khỏi chọn.
      if (inGates.length === 1) setForm((f) => ({ ...f, gateId: String(inGates[0].gate_id) }));
    } catch {
      toast.error('Không tải được cổng của tầng');
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
        plateNumber: normalizePlateOrKeep(form.plateNumber),
        vehicleTypeId: Number(form.vehicleTypeId),
        floorId: Number(form.floorId),
        ...(form.gateId ? { gateId: Number(form.gateId) } : {}), // BE tự suy nếu bỏ trống
      };
      const { data } = await sessionsApi.checkin(payload);
      setLastCheckin(data.data);
      toast.success('Check-in thành công');
      setForm((f) => ({ ...emptyCheckin, floorId: f.floorId, gateId: f.gateId })); // giữ tầng/cổng cho lượt sau
      loadActive();
      loadAvailability();
    } catch (err) {
      // Nói rõ sai Ở ĐÂU (tầng / loại xe / hết chỗ) thay vì ném nguyên câu thô của BE;
      // truyền floors để dịch floor_id trong lỗi sai tầng thành tên tầng staff đọc được.
      setCheckinError(friendlyCheckinError(err, { floors }));
    } finally {
      setSubmitting(false);
    }
  };

  // ── [1] Giá trị dẫn xuất — CHẠY NGAY lúc render, nên phải khai báo theo đúng
  //    thứ tự phụ thuộc: floorMetaFor -> freeFor / floorServesType -> visibleFloors.

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
  // Tầng có phục vụ loại xe đang chọn không (theo availability). Chưa chọn loại xe HOẶC chưa
  // tải được availability -> coi như CÓ, tránh ẩn nhầm sạch tầng khi dữ liệu chưa về.
  const floorServesType = (floorId, vehicleTypeId) => {
    if (!vehicleTypeId) return true;
    const meta = floorMetaFor(floorId);
    if (!meta) return true;
    return (meta.zones || []).some((z) => String(z.vehicleTypeId) === String(vehicleTypeId));
  };
  // Chỉ hiện tầng phục vụ loại xe đang chọn: tầng riêng xe máy không hiện khi chọn ô tô
  // (trước đây vẫn hiện kèm "0 trống" + báo "Tầng đầy 0/0" -> staff tưởng chờ lát có chỗ).
  const visibleFloors = floors.filter((f) => floorServesType(f.floor_id, form.vehicleTypeId));
  const selectedFloorMeta = floorMetaFor(form.floorId);
  const selectedFloorFree = freeFor(selectedFloorMeta, form.vehicleTypeId);
  const selectedVtName = vehicleTypes.find((v) => String(v.vehicle_type_id) === String(form.vehicleTypeId))?.type_name;

  // ── [1.8] Tìm xe trong bãi để VẼ LẠI mã QR (khách xóa/mất ảnh QR sẽ kẹt ở cổng ra).
  // Không cần API mới: mã QR chỉ là chuỗi token, và BE đã trả sẵn qr_token trong danh sách
  // phiên đang đỗ ở [2] — FE lọc ngay trên danh sách đó rồi vẽ lại bằng qrcode.react.
  // Bắt gõ tối thiểu 2 ký tự để không đổ nguyên cả bãi ra khi ô còn trống.
  const qrSearchKey = plateKey(qrSearch);
  const qrMatches =
    qrSearchKey.length < 2
      ? []
      : active.filter((s) => plateKey(s.plate_number).includes(qrSearchKey)).slice(0, 6);

  /* ==========================================================================
     [2] TAB PHIEN HOAT DONG — state + logic
         Giao dien o duoi: tim "[2] TAB PHIEN HOAT DONG" phan JSX.
     ========================================================================== */

  const [active, setActive] = useState([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [fees, setFees] = useState({}); // { [sessionId]: feeResult } — cột "Phí tạm tính" của [2]
  const [loadingFees, setLoadingFees] = useState(false);

  // Phí tạm tính hiện SẴN ở mọi dòng (bỏ nút "Xem phí" phải bấm từng xe — staff luôn phải bấm
  // hết bảng nên nút chỉ là thao tác thừa). BE không có API tính phí hàng loạt, phải gọi
  // preview-fee cho từng phiên → chạy theo lô 5 request để bãi đông không bắn cả trăm request
  // cùng lúc. Điền dần từng lô, bảng không phải chờ tính xong hết mới hiện.
  const loadFees = async (sessions) => {
    setLoadingFees(true);
    const next = {};
    const BATCH = 5;
    try {
      for (let i = 0; i < sessions.length; i += BATCH) {
        const part = await Promise.all(
          sessions.slice(i, i + BATCH).map(async (s) => {
            try {
              const { data } = await sessionsApi.previewFee({ sessionId: s.session_id });
              return [s.session_id, data.data];
            } catch {
              return [s.session_id, null]; // 1 xe tính lỗi không được chặn cả bảng
            }
          }),
        );
        part.forEach(([id, fee]) => { next[id] = fee; });
        setFees({ ...next });
      }
    } finally {
      setLoadingFees(false);
    }
  };

  const loadActive = async () => {
    setLoadingActive(true);
    try {
      const { data } = await sessionsApi.listActive();
      // listActive trả phân trang { items, total, ... }
      const items = data.data?.items || [];
      setActive(items);
      loadFees(items); // không await: bảng hiện ngay, cột phí điền dần
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Không tải được danh sách xe đang đỗ');
    } finally {
      setLoadingActive(false);
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

  /* ==========================================================================
     [3] TAB DAT CHO VAO (RESERVATION CHECK-IN) — state + logic
         Giao dien o duoi: tim "[3] TAB DAT CHO VAO" phan JSX.
     ========================================================================== */

  const [resQr, setResQr] = useState(''); // mã QR nhập/quét để tra cứu
  const [resLookupError, setResLookupError] = useState('');
  const [resLooking, setResLooking] = useState(false);
  const [upcoming, setUpcoming] = useState([]); // đơn confirmed chờ vào
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);

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

  /* ==========================================================================
     [3M] MODAL CHO XE DAT CHO VAO
          Giao dien o duoi: tim "[3M] MODAL CHO XE DAT CHO VAO" phan JSX.
     ========================================================================== */

  const [ciRes, setCiRes] = useState(null); // đơn đang cho vào (null = đóng modal)
  const [ciGates, setCiGates] = useState([]); // cổng IN của tầng đã đặt
  const [ciGateId, setCiGateId] = useState('');
  const [ciError, setCiError] = useState('');
  const [ciSubmitting, setCiSubmitting] = useState(false);

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

  /* ==========================================================================
     [5] TAB THU TIEN MAT (XE RA) — state + logic
         Giao dien o duoi: tim "[5] TAB THU TIEN MAT" phan JSX.
     ========================================================================== */

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
      setBoothError(plainApiError(err, 'Không tra cứu được — kiểm tra lại mã QR / biển số'));
    } finally {
      setBoothLooking(false);
    }
  };

  // previewFee (BE) chỉ trả phiên TRẦN, không kèm loại xe / chỗ đỗ / khu — trong khi danh sách
  // "Phiên hoạt động" đã tải sẵn phiên ĐẦY ĐỦ. Ghép lại theo session_id để khối thu tiền mặt
  // hiện đủ thông tin xe (thay cho tab Tra cứu QR đã bỏ) mà không phải gọi thêm API.
  const boothFullSession = (() => {
    const id = boothPreview?.session?.session_id;
    if (!id) return null;
    return active.find((s) => s.session_id === id) || null;
  })();

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
      setBoothError(plainApiError(err, 'Thu tiền mặt thất bại'));
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

  /* ==========================================================================
     [6] TAB SU CO — state + logic
         Giao dien o duoi: tim "[6] TAB SU CO" phan JSX.
     ========================================================================== */

  // Sự cố (incident) — Staff báo + xem sự cố của mình.
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [incForm, setIncForm] = useState({ type: '', description: '', sessionId: '' });
  const [incFieldErrors, setIncFieldErrors] = useState({});
  const [incError, setIncError] = useState('');
  const [incSubmitting, setIncSubmitting] = useState(false);

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

  /* ==========================================================================
     [7] TAB VE THANG — state + logic
         Giao dien o duoi: tim "[7] TAB VE THANG" phan JSX.
     ========================================================================== */

  // Vé tháng — tab tra cứu (danh sách phân trang + bộ lọc trạng thái/tầng/biển số).
  const [passes, setPasses] = useState({ items: [], total: 0, page: 1, limit: 50, pages: 0 });
  const [passLoading, setPassLoading] = useState(false);
  const [passFilters, setPassFilters] = useState({ status: '', floorId: '', plate: '' });

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

  /* ==========================================================================
     GIAO DIEN — thu tu duoi day khop DUNG thu tu cac muc tren sidebar:
     [1] Check-in -> [2] Phien hoat dong -> [3] Dat cho vao
     -> [5] Thu tien mat -> [6] Su co -> [7] Ve thang -> cac modal.
     ========================================================================== */

  // Tiêu đề trang + dãy tab ngang đã bỏ: sidebar bên trái (StaffLayout) vừa là tên khu vực
  // vừa là nơi chuyển mục, để lại ở đây là lặp hai lần cùng một thông tin.
  return (
    <div>
      {/* ═══════════════════ [1] TAB CHECK-IN (XE VAO) ═══════════════════
          Thu tu tren man hinh: [1.1] bien so -> [1.2] loai xe -> [1.3] tang
          -> [1.4] cong vao (IN) -> [1.5] bang so cho trong -> [1.6] nut gui.
          State + logic: tim "[1] TAB CHECK-IN (XE VAO)" phia tren.        */}
      {tab === 'checkin' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Ghi nhận xe vào</h2>
            <ErrorAlert message={checkinError} className="mb-4" />
            <form onSubmit={handleCheckin} className="space-y-4">
              {/* [1.1] Biển số xe */}
              <Field label="Biển số xe" required error={fieldErrors.plateNumber} hint={PLATE_VN_HINT}>
                <input
                  className={inputClass}
                  value={form.plateNumber}
                  onChange={(e) => setForm({ ...form, plateNumber: cleanPlateInput(e.target.value) })}
                  // Rời ô là chuẩn hóa về dạng BE lưu (51F12345 -> 51F-123.45) để staff thấy đúng
                  // biển sẽ được ghi nhận, không phải đoán cách chấm/gạch.
                  onBlur={() => setForm((f) => ({ ...f, plateNumber: normalizePlateOrKeep(f.plateNumber) }))}
                  placeholder="51F-123.45"
                  required
                />
              </Field>
              {/* [1.2] Loại xe — đổi loại xe sẽ lọc lại danh sách tầng ở [1.3] */}
              <Field label="Loại xe" required error={fieldErrors.vehicleTypeId}>
                <select
                  className={inputClass}
                  value={form.vehicleTypeId}
                  onChange={(e) => {
                    const vehicleTypeId = e.target.value;
                    setForm((f) => ({ ...f, vehicleTypeId }));
                    // Tầng đang chọn không phục vụ loại xe mới -> bỏ chọn tầng (kéo theo cổng),
                    // nếu không form sẽ giữ 1 tầng đã bị ẩn khỏi dropdown.
                    if (form.floorId && !floorServesType(form.floorId, vehicleTypeId)) onFloorChange('');
                  }}
                  required
                >
                  <option value="">— Chọn loại xe —</option>
                  {vehicleTypes.map((v) => (
                    <option key={v.vehicle_type_id} value={v.vehicle_type_id}>{v.type_name}</option>
                  ))}
                </select>
              </Field>
              {/* [1.3] Tầng — chỉ hiện tầng phục vụ loại xe đã chọn; tầng kín thì khóa luôn */}
              <Field
                label="Tầng"
                required
                error={fieldErrors.floorId}
                hint={
                  form.vehicleTypeId && visibleFloors.length === 0
                    ? (
                      // To do — khong the check-in loai xe nay. Bo mau xam mac dinh cua Field
                      // (text-slate-400) de staff thay ngay thay vi tuong chi la chu thich.
                      <span className="font-medium text-red-600">
                        Chưa có tầng nào phục vụ loại xe này — báo Manager tạo khu cho loại xe.
                      </span>
                    )
                    : undefined
                }
              >
                <select className={inputClass} value={form.floorId} onChange={(e) => onFloorChange(e.target.value)} required>
                  <option value="">— Chọn tầng —</option>
                  {visibleFloors.map((f) => {
                    const fr = freeFor(floorMetaFor(f.floor_id), form.vehicleTypeId);
                    // Tầng hết chỗ thì khóa luôn: cho chọn rồi mới báo đầy là bắt staff thao tác thừa.
                    const full = fr ? fr.available === 0 : false;
                    return (
                      <option key={f.floor_id} value={f.floor_id} disabled={full}>
                        {f.floor_code} — {f.label}
                        {fr ? (full ? ' — đã kín, không nhận thêm xe' : ` (còn ${fr.available} chỗ)`) : ''}
                      </option>
                    );
                  })}
                </select>
              </Field>
              {/* [1.4] Cổng vào (IN) — nạp theo tầng ở [1.3]; 1 cổng thì tự chọn */}
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
              {/* [1.5] Băng số chỗ trống của tầng đang chọn */}
              {form.floorId && selectedFloorFree && (
                <div className={`rounded-lg px-3 py-2 text-sm ${selectedFloorFree.available === 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {selectedFloorFree.available === 0
                    ? `Tầng này đã kín — ${selectedFloorFree.total} chỗ${selectedVtName ? ` dành cho ${selectedVtName}` : ''} đều không nhận thêm được. Chọn tầng khác.`
                    : `Còn ${selectedFloorFree.available}/${selectedFloorFree.total} chỗ${selectedVtName ? ` cho ${selectedVtName}` : ''}`}
                </div>
              )}
              {/* [1.6] Nút gửi -> handleCheckin. Khóa khi tầng chưa có cổng IN hoặc đã kín chỗ */}
              <Button
                type="submit"
                className="brand-gradient w-full border-0 shadow-(--shadow-soft)"
                loading={submitting}
                disabled={(!!form.floorId && gates.length === 0) || selectedFloorFree?.available === 0}
              >
                Check-in xe vào
              </Button>
            </form>
          </Card>

          {/* [1.7] Kết quả check-in gần nhất (cột phải) — QR làm vé cho khách
              [1.8] ngay dưới: tìm lại QR cho xe đã vào bãi từ trước */}
          <div className="space-y-6">
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
              <Card className="flex items-center justify-center py-10 text-center text-sm text-slate-400">
                Kết quả check-in sẽ hiển thị ở đây (chỗ đỗ được gán tự động).
              </Card>
            )}

            {/* [1.8] Tìm lại mã QR cho xe ĐÃ vào bãi — khách xóa/mất ảnh QR sẽ kẹt ở cổng ra.
                Lọc ngay trên danh sách phiên đang đỗ đã tải sẵn, không gọi thêm API. */}
            <Card>
              <div className="mb-1 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-800">Khách mất mã QR?</h2>
                <Button variant="secondary" size="sm" onClick={loadActive} loading={loadingActive}>Làm mới</Button>
              </div>
              <p className="mb-3 text-sm text-slate-500">
                Nhập biển số xe đang trong bãi để vẽ lại mã QR ra cổng cho khách chụp lại.
              </p>
              <input
                className={inputClass}
                value={qrSearch}
                onChange={(e) => setQrSearch(cleanPlateInput(e.target.value))}
                placeholder="51F-123.45 hoặc 12345"
                aria-label="Tìm biển số xe trong bãi"
              />
              <div className="mt-3 space-y-2">
                {qrSearchKey.length < 2 ? (
                  <p className="text-xs text-slate-400">Gõ ít nhất 2 ký tự của biển số. Không cần gõ dấu chấm/gạch.</p>
                ) : qrMatches.length === 0 ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Không có xe nào đang trong bãi khớp biển số này — kiểm tra lại biển hoặc bấm "Làm mới".
                  </p>
                ) : (
                  qrMatches.map((s) => (
                    <div key={s.session_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-mono font-medium text-slate-800">{s.plate_number}</p>
                        <p className="truncate text-xs text-slate-400">
                          {s.slot?.slot_code || '—'} · vào {s.time_in ? new Date(s.time_in).toLocaleString('vi-VN') : '—'}
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setQrSession(s)}>
                        Hiện QR
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════ [2] TAB PHIEN HOAT DONG ═══════════════════
          Bang xe dang trong bai (xem + bao lo gio + sua bien so).
          Cho xe ra: tab [5] Thu tien mat.
          State + logic: tim "[2] TAB PHIEN HOAT DONG" phia tren.        */}
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
                          <span
                            className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700"
                            title={`Lý do: ${overstayLabel(s.overstayReason)}`}
                          >
                            Quá giờ
                          </span>
                        )}
                        {sessionTypeNote(s) && (
                          <span className="mt-0.5 block font-sans text-xs font-normal text-slate-400">
                            {sessionTypeNote(s)}
                          </span>
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
                        {fees[s.session_id] ? (
                          fmtMoney(fees[s.session_id].fee)
                        ) : (
                          <span className="text-slate-400">{loadingFees ? 'Đang tính…' : '—'}</span>
                        )}
                      </td>
                      <td className="space-x-3 px-4 py-3 text-right whitespace-nowrap">
                        {/* Vẽ lại QR ngay tại bảng: khách mất ảnh QR thì staff mở đúng dòng xe đó cho khách chụp lại. */}
                        <button type="button" onClick={() => setQrSession(s)} className="font-medium text-brand hover:underline">Hiện QR</button>
                        {/* Không còn nút "Báo lố giờ" báo tay: lúc xe ra, nếu có thu phụ thu lố giờ thì BE
                            tự ghi sự cố (reportOverstayCharge) — báo tay chỉ tạo bản ghi trùng. Cột "Đã đỗ"
                            vẫn tô đỏ + (+Nh) để staff thấy xe đang quá giờ. */}
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

      {/* ═══════════════ [3] TAB DAT CHO VAO (RESERVATION CHECK-IN) ═══════════════
          Quet/nhap QR dat cho -> mo modal [3M]. Bang duoi CHI DE THEO DOI, khong co
          nut cho vao: muon cho xe vao BAT BUOC quet QR cua khach, khong bam theo ten
          trong danh sach (tranh cho nham xe / cho vao khi khach chua toi).
          State + logic: tim "[3] TAB DAT CHO VAO" phia tren.                    */}
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
                  </tr>
                </thead>
                <tbody>
                  {loadingUpcoming ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Đang tải...</td></tr>
                  ) : upcoming.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Chưa có đặt chỗ nào chờ vào</td></tr>
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

      {/* ═══════════════ [5] TAB THU TIEN MAT (XE RA) ═══════════════
          Chot BLD-OUT: tra cuu bang QR hoac bien so; cong do BE tu suy.
          State + logic: tim "[5] TAB THU TIEN MAT" phia tren.          */}
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
                      <div className="flex justify-between">
                        <span className="text-slate-500">Biển số</span>
                        <span className="font-mono font-medium">{boothPreview.session?.plate_number || '—'}</span>
                      </div>
                      {/* Thông tin xe gộp từ tab "Tra cứu xe (QR)" cũ — chỉ hiện khi ghép được phiên đầy đủ */}
                      {boothFullSession && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Loại xe</span>
                            <span>{boothFullSession.vehicleType?.type_name || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Chỗ đỗ</span>
                            <span className="font-medium text-brand">{boothFullSession.slot?.slot_code || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Khu / Tầng</span>
                            <span>
                              {boothFullSession.slot?.zone?.label || '—'}
                              {boothFullSession.slot?.zone?.floor ? ` · ${boothFullSession.slot.zone.floor.floor_code}` : ''}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Diện</span>
                            <span>{SESSION_TYPE_NOTE[boothFullSession.session_type] || boothFullSession.session_type || '—'}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between"><span className="text-slate-500">Giờ vào</span><span>{boothPreview.session?.time_in ? new Date(boothPreview.session.time_in).toLocaleString('vi-VN') : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Đã đỗ</span><span>{fmtElapsed(boothPreview.session?.time_in)}</span></div>
                      <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
                        <span className="text-slate-500">Phí phải thu</span>
                        <span className="text-lg font-bold text-brand">{fmtMoney(boothPreview.fee)}</span>
                      </div>
                    </div>

                    {boothPreview.overstay && (
                      <p className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                        ⚠ Xe {boothPreview.session?.plate_number} {overstayLabel(boothPreview.overstayReason)}{boothPreview.overstayHours > 0 ? ` (~${boothPreview.overstayHours}h)` : ''} — BẮT BUỘC thu phụ thu {fmtMoney(boothPreview.overstayFee)} (đã tính vào phí).
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
                    {boothPreview.overstayEnforced ? (
                      <p className="text-sm font-medium text-red-700">
                        ↳ Đã tự cộng phụ thu lố giờ{boothPreview.overstayFee > 0 ? ` (+${fmtMoney(boothPreview.overstayFee)})` : ''} — bắt buộc, không bỏ được.
                      </p>
                    ) : (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={boothOverstay}
                          onChange={(e) => toggleBoothOverstay(e.target.checked)}
                        />
                        Phụ thu lố giờ (giá Manager set){boothPreview.overstayFee > 0 ? ` (+${fmtMoney(boothPreview.overstayFee)})` : ''}
                      </label>
                    )}

                    <div className="flex gap-3">
                      <Button className="brand-gradient flex-1 border-0" loading={boothSubmitting} onClick={confirmBoothCash}>
                        Đã thu tiền mặt → mở barie
                      </Button>
                      {/* Hủy: xóa sạch ô nhập + kết quả tra cứu, khỏi phải F5 khi tra nhầm xe */}
                      <Button type="button" variant="secondary" onClick={resetBooth} disabled={boothSubmitting}>
                        Hủy
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════════════════ [6] TAB SU CO ═══════════════════════
          Staff bao su co + xem su co cua minh. Nut "Bao lo gio" o [2] nhay vao day.
          State + logic: tim "[6] TAB SU CO" phia tren.                          */}
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

      {/* ═══════════════════════ [7] TAB VE THANG ═══════════════════════
          Staff tra cuu ve thang theo trang thai / tang / bien so.
          State + logic: tim "[7] TAB VE THANG" phia tren.                */}
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

      {/* ═══════════ [3M] MODAL CHO XE DAT CHO VAO — mo tu tab [3] ═══════════
          State + logic: tim "[3M] MODAL CHO XE DAT CHO VAO" phia tren.      */}
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

      {/* ═════════ [0M] MODAL VE LAI MA QR — mo tu [1.8] va tu bang [2] ═════════
          Ma QR chi la chuoi token BE da tra san trong danh sach phien dang do, nen ve lai
          duoc hoan toan o FE (qrcode.react) — khong can BE cap lai ma, khong doi token cu.
          Quet lai ma nay o cong ra van dung phien do (BE tra phien theo qr_token).        */}
      <Modal
        open={!!qrSession}
        title={`Mã QR ra cổng — ${qrSession?.plate_number || ''}`}
        onClose={() => setQrSession(null)}
        size="sm"
      >
        {qrSession?.qr_token ? (
          <div className="flex flex-col items-center gap-3">
            <QRCodeSVG value={qrSession.qr_token} size={200} aria-label="Mã QR ra cổng" />
            <span
              className="max-w-[240px] cursor-default select-all break-all text-center font-mono text-[11px] text-slate-400"
              title={qrSession.qr_token}
            >
              {qrSession.qr_token}
            </span>
            <dl className="w-full space-y-1 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Loại xe</dt><dd>{qrSession.vehicleType?.type_name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Chỗ đỗ</dt><dd className="font-medium text-brand">{qrSession.slot?.slot_code || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Giờ vào</dt><dd>{qrSession.time_in ? new Date(qrSession.time_in).toLocaleString('vi-VN') : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Diện</dt><dd>{SESSION_TYPE_NOTE[qrSession.session_type] || '—'}</dd></div>
            </dl>
            <p className="text-xs text-slate-500">Khách chụp lại mã này để quét khi ra cổng.</p>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Phiên này không có mã QR — cho xe ra bằng tab "Thu tiền mặt (ra)".
          </p>
        )}
      </Modal>

      {/* Overlay quét QR bằng camera — dùng chung cho tab [3] Đặt chỗ vào và [5] Thu tiền mặt */}
      {scanTarget && (
        <QrScanner
          onClose={() => setScanTarget(null)}
          onScan={(token) => {
            const target = scanTarget;
            setScanTarget(null);
            if (target === 'reservation') {
              setResQr(token);
              runReservationLookup(token);
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
