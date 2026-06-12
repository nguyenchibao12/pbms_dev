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
    { name: 'MasterData', description: 'Loại xe (Manager) — sẽ mở rộng: tầng/khu/chỗ/cổng/bảng giá' },
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
  },
};
