import api from './axios';

// Vé tháng — phía Staff: tra cứu danh sách vé (lọc trạng thái / tầng / biển số).
// Tách riêng khỏi API vé tháng phía User (mua/của tôi/hủy — FE khác phụ trách) để
// không đụng chung file. list trả phân trang { items, total, page, limit, pages };
// mỗi item kèm floor / vehicleType / user; plate tìm gần đúng (51A12345 khớp 51A-123.45).
export const staffPassesApi = {
  list: (params) => api.get('/monthly-passes', { params }),
};
