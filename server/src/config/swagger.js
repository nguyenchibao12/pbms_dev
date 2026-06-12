// OpenAPI spec cho PBMS API — phục vụ Swagger UI tại /api/docs.
// Spec viết tay (không annotate từng route). Spec LỚN DẦN theo module: khi port thêm
// một module, thêm block của nó vào `paths` (và tag nếu cần) để nó hiện trên Swagger.

const bearer = [{ bearerAuth: [] }];
const jsonBody = (example) => ({
  required: true,
  content: { 'application/json': { schema: { type: 'object' }, example } },
});
const ok = { description: 'Thành công — { success, data }' };
const idPath = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const q = (name, desc, required = false, schema = { type: 'string' }) => ({
  name, in: 'query', required, description: desc, schema,
});

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'PBMS API',
    version: '1.0.0',
    description:
      'Parking Building Management System (SU26SWP08).\n\n' +
      '**Đăng nhập để test:** gọi `POST /auth/login`, copy `data.token` trong response, ' +
      'bấm **Authorize** (ổ khóa) ở góc phải, dán token (không cần gõ "Bearer"). ' +
      'Sau đó các endpoint có ổ khóa sẽ tự gắn header `Authorization: Bearer <token>`.\n\n' +
      'Mọi response dạng `{ success, data, message? }` hoặc `{ success:false, error:{ code, message } }`.',
  },
  servers: [{ url: '/api', description: 'Server hiện tại' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: bearer, // mặc định cần JWT; endpoint public override bằng security: []
  tags: [
    { name: 'Auth', description: 'Đăng ký / đăng nhập / quên mật khẩu / Google' },
    { name: 'MasterData', description: 'Tầng/Khu/Chỗ/Cổng/Loại xe/Bảng giá (Manager)' },
    { name: 'System', description: 'Health check' },
  ],
  paths: {
    // ===== AUTH =====
    '/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Đăng ký (role User, email bắt buộc)', security: [],
        requestBody: jsonBody({ username: 'khachhang01', password: 'matkhau123', fullName: 'Nguyễn Văn A', email: 'a@gmail.com', phone: '0900000000' }),
        responses: { 201: ok, 409: { description: 'Username/email đã dùng' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Đăng nhập (trả về token)', security: [],
        requestBody: jsonBody({ username: 'admin', password: 'matkhau' }),
        responses: { 200: ok, 401: { description: 'Sai tài khoản/mật khẩu' } },
      },
    },
    '/auth/google': {
      post: {
        tags: ['Auth'], summary: 'Đăng nhập Google (ID token)', security: [],
        requestBody: jsonBody({ idToken: '<google_id_token>' }),
        responses: { 200: ok, 401: { description: 'Token Google không hợp lệ' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'], summary: 'Quên mật khẩu (gửi email link reset)', security: [],
        requestBody: jsonBody({ email: 'a@gmail.com' }),
        responses: { 200: ok, 503: { description: 'Chưa cấu hình SMTP' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'], summary: 'Đặt lại mật khẩu bằng token', security: [],
        requestBody: jsonBody({ email: 'a@gmail.com', token: '<token-từ-email>', newPassword: 'matkhaumoi' }),
        responses: { 200: ok, 400: { description: 'Token sai/hết hạn' } },
      },
    },
    '/auth/me': {
      get: { tags: ['Auth'], summary: 'Thông tin user hiện tại', security: bearer, responses: { 200: ok, 401: { description: 'Chưa đăng nhập' } } },
    },

    // ===== SYSTEM =====
    '/health': { get: { tags: ['System'], summary: 'Health check', security: [], responses: { 200: ok } } },

    // ===== VEHICLE TYPES (MasterData) =====
    '/vehicle-types': {
      get: { tags: ['MasterData'], summary: 'Danh sách loại xe', security: bearer, responses: { 200: ok } },
      post: { tags: ['MasterData'], summary: 'Thêm loại xe (Manager)', security: bearer, requestBody: jsonBody({ typeName: 'Ô tô', typeCode: 'CAR' }), responses: { 201: ok } },
    },
    '/vehicle-types/{id}': {
      get: { tags: ['MasterData'], summary: 'Chi tiết loại xe', security: bearer, parameters: [idPath], responses: { 200: ok } },
      put: { tags: ['MasterData'], summary: 'Sửa loại xe (Manager)', security: bearer, parameters: [idPath], requestBody: jsonBody({ typeName: 'Xe máy' }), responses: { 200: ok } },
      delete: { tags: ['MasterData'], summary: 'Xóa loại xe (Manager)', security: bearer, parameters: [idPath], responses: { 200: ok } },
    },

    // ===== FLOORS (MasterData) =====
    '/floors': {
      get: { tags: ['MasterData'], summary: 'Danh sách tầng', security: bearer, responses: { 200: ok } },
      post: { tags: ['MasterData'], summary: 'Thêm tầng (Manager)', security: bearer, requestBody: jsonBody({ floorCode: 'B3', floorLevel: -3, label: 'Hầm B3' }), responses: { 201: ok } },
    },
    '/floors/setup': {
      post: {
        tags: ['MasterData'], summary: 'Thiết lập nhanh tầng (Manager) — floor+zone+slot+cổng', security: bearer,
        requestBody: jsonBody({
          floor: { floorCode: 'B3', floorLevel: -3, label: 'Hầm B3' },
          zones: [{ vehicleTypeId: 1, zoneCode: 'B3-A', label: 'Khu A ô tô', slotCount: 40, codePrefix: 'A-', monthlyPassCapacity: 10, distanceStart: 10, distanceStep: 5 }],
          gates: { auto: true },
        }),
        responses: { 200: ok },
      },
    },
    '/floors/{id}': {
      get: { tags: ['MasterData'], summary: 'Chi tiết tầng', security: bearer, parameters: [idPath], responses: { 200: ok } },
      put: { tags: ['MasterData'], summary: 'Sửa tầng (Manager)', security: bearer, parameters: [idPath], requestBody: jsonBody({ label: 'Hầm B3 mới' }), responses: { 200: ok } },
      delete: { tags: ['MasterData'], summary: 'Xóa tầng (Manager)', security: bearer, parameters: [idPath], responses: { 200: ok } },
    },
    '/floors/{id}/clone': { post: { tags: ['MasterData'], summary: 'Nhân bản tầng (Manager)', security: bearer, parameters: [idPath], requestBody: jsonBody({ floorCode: 'B4', floorLevel: -4, label: 'Hầm B4' }), responses: { 200: ok } } },

    // ===== ZONES (MasterData) =====
    '/zones': {
      get: { tags: ['MasterData'], summary: 'Danh sách khu', security: bearer, parameters: [q('floorId', 'Lọc theo tầng', false, { type: 'integer' })], responses: { 200: ok } },
      post: { tags: ['MasterData'], summary: 'Thêm khu (Manager)', security: bearer, requestBody: jsonBody({ floorId: 1, vehicleTypeId: 1, zoneCode: 'B1-A', label: 'Khu A', totalSlots: 0, monthlyPassCapacity: 5 }), responses: { 201: ok } },
    },
    '/zones/{id}': {
      get: { tags: ['MasterData'], summary: 'Chi tiết khu', security: bearer, parameters: [idPath], responses: { 200: ok } },
      put: { tags: ['MasterData'], summary: 'Sửa khu (Manager)', security: bearer, parameters: [idPath], requestBody: jsonBody({ label: 'Khu A mới', monthlyPassCapacity: 8 }), responses: { 200: ok } },
      delete: { tags: ['MasterData'], summary: 'Xóa khu (Manager)', security: bearer, parameters: [idPath], responses: { 200: ok } },
    },

    // ===== PARKING SLOTS (MasterData) =====
    '/parking-slots': {
      get: { tags: ['MasterData'], summary: 'Danh sách chỗ', security: bearer, parameters: [q('zoneId', 'Lọc theo khu', false, { type: 'integer' })], responses: { 200: ok } },
      post: { tags: ['MasterData'], summary: 'Thêm chỗ (Manager)', security: bearer, requestBody: jsonBody({ zoneId: 1, slotCode: 'A-01', distanceToGate: 10 }), responses: { 201: ok } },
    },
    '/parking-slots/{id}': {
      get: { tags: ['MasterData'], summary: 'Chi tiết chỗ', security: bearer, parameters: [idPath], responses: { 200: ok } },
      put: { tags: ['MasterData'], summary: 'Sửa chỗ — gồm đổi status (Manager)', security: bearer, parameters: [idPath], requestBody: jsonBody({ status: 'maintenance', distanceToGate: 12 }), responses: { 200: ok } },
      delete: { tags: ['MasterData'], summary: 'Xóa chỗ (Manager)', security: bearer, parameters: [idPath], responses: { 200: ok } },
    },

    // ===== GATES (MasterData) =====
    '/gates': {
      get: { tags: ['MasterData'], summary: 'Danh sách cổng', security: bearer, parameters: [q('floorId', 'Lọc theo tầng', false, { type: 'integer' })], responses: { 200: ok } },
      post: { tags: ['MasterData'], summary: 'Thêm cổng (Manager)', security: bearer, requestBody: jsonBody({ floorId: 1, gateCode: 'B1-IN-CAR', direction: 'in', vehicleTypeId: 1, label: 'Cổng vào ô tô' }), responses: { 201: ok } },
    },
    '/gates/{id}': {
      get: { tags: ['MasterData'], summary: 'Chi tiết cổng', security: bearer, parameters: [idPath], responses: { 200: ok } },
      put: { tags: ['MasterData'], summary: 'Sửa cổng (Manager)', security: bearer, parameters: [idPath], requestBody: jsonBody({ isActive: true }), responses: { 200: ok } },
      delete: { tags: ['MasterData'], summary: 'Xóa cổng (Manager)', security: bearer, parameters: [idPath], responses: { 200: ok } },
    },

    // ===== PRICING RULES (MasterData) =====
    '/pricing-rules': {
      get: { tags: ['MasterData'], summary: 'Danh sách bảng giá', security: bearer, parameters: [q('vehicleTypeId', 'Lọc theo loại xe', false, { type: 'integer' })], responses: { 200: ok } },
      post: { tags: ['MasterData'], summary: 'Thêm bảng giá (Manager)', security: bearer, requestBody: jsonBody({ vehicleTypeId: 1, unit: 60, baseRate: 10000, effectiveFrom: '2026-01-01T00:00:00Z' }), responses: { 201: ok } },
    },
    '/pricing-rules/{id}': {
      get: { tags: ['MasterData'], summary: 'Chi tiết bảng giá', security: bearer, parameters: [idPath], responses: { 200: ok } },
      put: { tags: ['MasterData'], summary: 'Sửa bảng giá (Manager)', security: bearer, parameters: [idPath], requestBody: jsonBody({ baseRate: 12000 }), responses: { 200: ok } },
      delete: { tags: ['MasterData'], summary: 'Xóa bảng giá (Manager)', security: bearer, parameters: [idPath], responses: { 200: ok } },
    },
  },
};
