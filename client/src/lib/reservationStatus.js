// Tiện ích trạng thái đặt chỗ phía Staff (tab "Đặt chỗ vào").
// - friendlyReservationError: đổi lỗi thô từ BE thành thông báo dễ hiểu (case 5-7).
// - reservationCheckinBadge: badge thời gian cho danh sách chờ vào (case 8).

/**
 * Map lỗi check-in/lookup đặt chỗ → câu thông báo thân thiện, có hướng dẫn.
 * Khớp các message BE trả về (xem reservation.service.js). Không khớp thì trả nguyên văn BE.
 */
export function friendlyReservationError(err) {
  const raw = err?.response?.data?.error?.message || '';
  const m = raw.toLowerCase();

  // Đơn chưa ở trạng thái confirmed (BE: "Reservation must be confirmed (current: ...)")
  if (m.includes('must be confirmed') || m.includes('confirmed (current')) {
    if (m.includes('pending')) return 'Đơn chưa thanh toán — khách cần hoàn tất thanh toán trước khi vào bãi.';
    if (m.includes('checked_in')) return 'Đơn này đã được cho vào bãi trước đó.';
    if (m.includes('completed')) return 'Đơn đã hoàn tất (xe đã ra).';
    return 'Đơn chưa sẵn sàng cho vào (chưa thanh toán).';
  }
  // Đã hủy
  if (m.includes('đã bị hủy') || m.includes('cancelled')) {
    return 'Đơn đã bị hủy — không thể cho xe vào.';
  }
  // Sai tầng
  if (m.includes('wrong floor') || m.includes('does not match gate floor')) {
    return 'Sai tầng — cổng không thuộc tầng đã đặt. Hãy chọn cổng đúng tầng của đơn.';
  }
  // Cổng không phải chiều IN
  if (m.includes('in gate') || m.includes('cổng vào')) {
    return 'Cổng đã chọn không phải cổng vào (IN).';
  }
  // Cổng không tồn tại / tắt
  if (m.includes('gate not found') || m.includes('inactive')) {
    return 'Cổng không tồn tại hoặc đang tắt — chọn cổng khác.';
  }
  // Quá sớm (ngoài khung, sớm hơn 15 phút cho phép)
  if (m.includes('quá sớm') || m.includes('too early')) {
    return 'Chưa tới giờ vào — chỉ được cho vào sớm tối đa 15 phút trước khung giờ đặt.';
  }
  // Quá giờ (no-show)
  if (m.includes('too late') || m.includes('window ended') || m.includes('quá giờ')) {
    return 'Quá giờ — khung giờ đặt chỗ đã kết thúc (đơn no-show), không thể cho vào.';
  }
  // Xe đã có phiên active
  if (m.includes('already has an active session')) {
    return 'Xe này đang có phiên trong bãi — không thể cho vào lần nữa.';
  }
  // Cổng không phục vụ loại xe của đơn
  if (m.includes('vehicle type') || (m.includes('loại xe') && m.includes('cổng'))) {
    return 'Cổng này không phục vụ loại xe của đơn — chọn cổng khác.';
  }
  // QR vô hiệu / không tìm thấy (lookup)
  if (m.includes('không hợp lệ') || m.includes('vô hiệu')) {
    return 'Mã QR không hợp lệ hoặc đã hết hiệu lực (đơn đã hủy hoặc đã dùng).';
  }
  if (m.includes('không tìm thấy')) {
    return 'Không tìm thấy đặt chỗ với mã QR này — kiểm tra lại mã.';
  }

  return raw || 'Thao tác thất bại, vui lòng thử lại.';
}

const EARLY_GRACE_MS = 15 * 60 * 1000; // BE cho vào sớm tối đa 15 phút
const ENDING_SOON_MS = 30 * 60 * 1000; // dưới 30 phút là "sắp hết giờ"

/**
 * Badge thời gian cho 1 đơn trong danh sách chờ vào.
 * Trả về { label, className } hoặc null nếu thiếu mốc giờ.
 */
export function reservationCheckinBadge(reservation) {
  const start = reservation?.start_time ? new Date(reservation.start_time).getTime() : null;
  const end = reservation?.end_time ? new Date(reservation.end_time).getTime() : null;
  if (!end) return null;
  const now = Date.now();

  const base = 'inline-flex rounded-full px-2 py-0.5 text-xs font-medium';

  if (now > end) {
    return { label: 'Quá giờ', className: `${base} bg-red-50 text-red-600` };
  }
  // Đã trong khung được phép cho vào (từ start - 15 phút đến end)
  if (start == null || now >= start - EARLY_GRACE_MS) {
    if (end - now <= ENDING_SOON_MS) {
      return { label: 'Sắp hết giờ', className: `${base} bg-amber-50 text-amber-700` };
    }
    return { label: 'Vào được', className: `${base} bg-emerald-50 text-emerald-700` };
  }
  // Chưa tới giờ
  return { label: 'Chờ tới giờ', className: `${base} bg-slate-100 text-slate-500` };
}
