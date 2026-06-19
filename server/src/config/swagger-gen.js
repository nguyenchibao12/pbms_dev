// Tự sinh OpenAPI spec từ route bằng swagger-autogen (thay cho spec viết tay).
// Quét ./src/app.js → đi theo các app.use(...) để dò method + path (kèm prefix /api/...).
// Làm giàu mô tả bằng comment `#swagger.*` đặt trong từng route (xem các *.routes.js).
//
// Chạy: npm run swagger  → sinh ra ./src/config/swagger-output.json
// app.js nạp file JSON này để phục vụ Swagger UI tại /api/docs.

import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'PBMS API',
    version: '1.0.0',
    description:
      'Parking Building Management System (SU26SWP08). Spec **tự sinh từ route** bằng swagger-autogen.\n\n' +
      '**Đăng nhập để test:** gọi `POST /api/auth/login`, copy `data.token`, bấm **Authorize** (ổ khóa) ' +
      'và dán token (không cần gõ "Bearer"). Các endpoint có ổ khóa sẽ tự gắn header `Authorization: Bearer <token>`.\n\n' +
      'Mọi response dạng `{ success, data, message? }` hoặc `{ success:false, error:{ code, message } }`.',
  },
  servers: [{ url: '/', description: 'Server hiện tại' }],
  tags: [
    { name: 'Auth', description: 'Đăng ký / đăng nhập / quên mật khẩu / Google / xác minh email' },
    { name: 'System', description: 'Health check' },
    { name: 'Public', description: 'Thông tin công khai (không cần đăng nhập)' },
    // MasterData tách thành từng resource cho dễ phân biệt (Manager)
    { name: 'Vehicle Types', description: 'Loại xe — ô tô / xe máy (Manager)' },
    { name: 'Floors', description: 'Tầng — gồm thiết lập nhanh & nhân bản (Manager)' },
    { name: 'Zones', description: 'Khu — gắn loại xe, sinh nhiều chỗ (Manager)' },
    { name: 'Parking Slots', description: 'Chỗ đỗ — trạng thái & khoảng cách (Manager)' },
    { name: 'Gates', description: 'Cổng — theo tầng + làn loại xe, in/out (Manager)' },
    { name: 'Pricing Rules', description: 'Bảng giá theo loại xe (Manager)' },
    { name: 'Admin', description: 'Quản lý tài khoản người dùng + nhật ký (Admin)' },
    { name: 'Sessions', description: 'Phiên gửi xe — check-in, tra cứu QR, phí (Staff)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }], // mặc định cần JWT; route public override bằng #swagger.security = []
};

const outputFile = './src/config/swagger-output.json';
const endpoints = ['./src/app.js'];

swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpoints, doc).then(() => {
  console.log('[swagger] Đã sinh spec từ route →', outputFile);
});
