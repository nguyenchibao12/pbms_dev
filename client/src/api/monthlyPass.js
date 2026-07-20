import api from './axios';

// Vé tháng — phía khách hàng (User): mua / vé của tôi / trả tiếp / hủy.
// Tách riêng khỏi staffPasses.js (tra cứu của Staff) để không đụng chung file.
// Mọi endpoint yêu cầu đăng nhập role 'User' (token tự gắn qua api/axios.js).
export const monthlyPassApi = {
  // Mua vé tháng + tạo link thanh toán PayOS.
  // body: { plateNumber, vehicleTypeId, floorId, startDate }
  // Vé cố định 1 tháng; ngày kết thúc + khung giờ do server tự tính.
  // Trả về data: { pass, payment, price, checkoutUrl, capacity }
  create: (data) => api.post('/monthly-passes', data),

  // Danh sách vé tháng của tôi (mảng pass, kèm floor / vehicleType / payments).
  listMine: () => api.get('/monthly-passes/mine'),

  // Chi tiết 1 vé (chủ vé hoặc Staff).
  get: (id) => api.get(`/monthly-passes/${id}`),

  // Sức chứa vé tháng còn lại theo tầng + loại xe (preview trước khi mua).
  // params: { floorId, vehicleTypeId } → data: { total, used, available }
  capacity: (params) => api.get('/monthly-passes/capacity', { params }),

  // Lấy lại link thanh toán cho vé đang 'pending' (khách tắt tab PayOS giữa chừng).
  // Trả về data: { pass, payment, checkoutUrl, reused } — link cũ còn sống (reused=true) hoặc link mới.
  // Nếu tiền ĐÃ về mà webhook chưa tới (localhost): { pass, payment, checkoutUrl: null, alreadyPaid: true }
  //   ⇒ BE tự kích hoạt vé, FE KHÔNG được điều hướng (tránh thu tiền 2 lần).
  // Có thể trả 502 PAYMENT_GATEWAY_ERROR khi chưa chắc link cũ đã chết ⇒ cho user bấm lại.
  repay: (id) => api.post(`/monthly-passes/${id}/repay`),

  // Hủy vé + tính % hoàn theo chính sách. Thông điệp kết quả nằm ở res.data.message;
  // data: { pass, refund, percent }. refund != null nghĩa là đã tạo yêu cầu hoàn tiền.
  cancel: (id) => api.post(`/monthly-passes/${id}/cancel`),

  // Chính sách hoàn tiền hủy vé (đọc từ settings pass_refund_*) — đổ số thật vào modal hủy.
  // data: { trialDays, trialPercent, halfTermPercent, bankInfoTtlDays }
  // BE CHƯA có endpoint này (đã gửi handoff) — FE gọi thử, lỗi thì modal hiện text chung.
  refundPolicy: () => api.get('/monthly-passes/refund-policy'),
};
