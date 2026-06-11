# PBMS — Parking Building Management System (Backend)

Mã đề tài: **SU26SWP08** · Node.js + Express + Sequelize · MySQL · JWT

Backend hệ thống quản lý bãi đỗ xe nhiều tầng. Repo dựng dần từ **nền tảng**
(kết nối DB, model người dùng/vai trò, middleware bảo mật + JWT) rồi bồi thêm
các module nghiệp vụ (xác thực, bãi đỗ, đặt chỗ...).

## Yêu cầu
- Node.js 18+
- MySQL 8

## Cài đặt & chạy
```bash
npm install --prefix server

cp server/.env.example server/.env   # sửa DB_*, JWT_SECRET, ...

# Tạo DB MySQL (tên trùng DB_NAME), rồi tạo admin đầu tiên
npm run create-admin --prefix server -- <username> <password> "Họ tên" email@domain

npm run dev   # chạy backend (nodemon)
```

- Backend: http://localhost:5000 · Health: http://localhost:5000/api/health
