# Phân tích luồng Reservation (Đặt chỗ) — PBMS

> Tài liệu giải thích: (1) reservation chạy thế nào, (2) chỗ được set ra sao/ai set/làm sao biết đúng, (3) logic đang gặp vấn đề ở đâu.
> Mọi tham chiếu file theo dạng `đường-dẫn:dòng`.

---

## 1. Reservation hiện đang chạy thế nào

Endpoint: `POST /api/reservations` → `createReservation` (`server/src/services/reservation.service.js:234`).

**Đầu vào user gửi:** `plateNumber`, `vehicleTypeId`, `floorId`, và **(shiftId + arrivalDate)** HOẶC **(startTime + endTime)**.
👉 **User KHÔNG gửi slot.**

```
User gửi: biển số, loại xe, tầng, khung giờ        ← KHÔNG có slot
   │
   ├─ chuẩn hoá biển số (plateVN) · tính khung giờ (shifts)
   ├─ validate: end>start · start ở tương lai · floor/vehicleType tồn tại
   ├─ chống trùng: xe không có session active · không có reservation chồng giờ
   ├─ suggestSlot(...)               ← HỆ THỐNG chọn slot (NGOÀI transaction)
   ├─ TRANSACTION:
   │     lockSlotReserved(slot)      ← slot: available → reserved (row-lock FOR UPDATE)
   │     Reservation.create(status='pending', slot_id=...)
   ├─ createPayOSPaymentLink(...)    ← tạo link trả tiền (NGOÀI transaction)
   └─ Payment.create(status='pending')
   → trả { reservation(pending), payment, bookingFee, checkoutUrl }
```

**Sau khi tạo:**
```
pending ──(trả tiền: webhook/verify → confirmReservationAfterPayment)──► confirmed + QR
confirmed ──(Staff: POST /checkin → checkinReservation)──► checked_in (slot: occupied)
checked_in ──(xe ra: payment.service.markReservationCompleted)──► completed
   │
   └─ pending/confirmed ──(user cancel / payment fail)──► cancelled (nhả slot, vô hiệu QR)
```

**Trạng thái slot đi kèm:** `available → reserved` (đặt) `→ occupied` (vào) `→ available` (ra/huỷ).

---

## 2. Set chỗ: AI set — set SAO — làm sao biết ĐÚNG

### Ai set? — HỆ THỐNG, không phải user/driver
User chỉ khai *tầng + loại xe + khung giờ*. Slot cụ thể do thuật toán **`suggestSlot`** quyết (`server/src/utils/slotSuggest.js:28`). Thiết kế cố ý: bỏ quyền chọn slot khỏi user để hệ thống kiểm soát.

### Set sao? — 3 bước
1. **Lọc ứng viên hợp lệ** — `findSlotsAvailableForWindow` (`server/src/utils/slotWindow.js:25`):
   - `resolveZoneIds(floor, vehicleType)` → chỉ khu đúng **tầng + loại xe**.
   - Bỏ slot `maintenance` / `locked`.
   - Bỏ slot có **reservation chồng khung giờ** (status pending/confirmed/checked_in, `start<end AND end>start`).
   - Bỏ slot có **session đang active**.
2. **Chấm điểm chọn tốt nhất** — `pickBestSlot`: điểm theo khoảng cách cổng/thang máy, cân bằng khu, ưu tiên khu quen của user (prediction).
3. **Khoá chỗ nguyên tử** — trong transaction, `lockSlotReserved` (`server/src/utils/slotSuggest.js:136`): `SELECT ... FOR UPDATE` rồi `available → reserved`.

### Làm sao biết "set đúng"? — 4 bảo đảm
Vì user không set, "đúng" được bảo đảm bằng **ràng buộc hệ thống**, không phải lòng tin vào user:

| Bảo đảm | Ở đâu | Chống cái gì |
|---|---|---|
| Đúng khu (tầng + loại xe) | `resolveZoneIds` | cấp slot xe máy cho ô tô / sai tầng |
| Đang trống trong khung giờ | `findSlotsAvailableForWindow` | cấp slot đã có người |
| Khoá nguyên tử (row-lock) | `lockSlotReserved` + transaction | 2 người giật cùng slot (double-booking) |
| Đúng chuyển trạng thái | `assertSlotTransition(available→reserved)` | nhảy trạng thái bậy |

→ "Biết đúng" = **không tin con người, mà tin thuật toán + ràng buộc DB.**

---

## 3. Logic đang gặp vấn đề ở đâu (5 điểm yếu, nặng → nhẹ)

### 🔴 3.1. Mâu thuẫn "cờ trạng thái" vs "khung giờ" — một slot chỉ phục vụ 1 đặt chỗ tại một thời điểm
`server/src/utils/slotWindow.js:74-76`:
```js
const slots = allSlots
  .filter((s) => !blockedSlotIds.has(s.slot_id))   // (A) lọc theo CHỒNG KHUNG GIỜ
  .filter((s) => s.status === 'available');          // (B) lọc theo CỜ TRẠNG THÁI
```
Hai mô hình chiếm chỗ đánh nhau:
- **(A) theo thời gian**: lẽ ra cho 1 slot nhận nhiều đặt chỗ *không chồng giờ* (vd slot X: 9–11 cho xe này, 14–16 cho xe khác).
- **(B) theo cờ `slot.status`**: slot đã `reserved` (bất kỳ giờ nào) là loại luôn.

**(B) thắng → triệt tiêu (A).** Ngay khi 1 đặt chỗ tương lai khoá slot thành `reserved`, slot bị rút khỏi pool cho **mọi khung giờ khác** tới khi check-in/huỷ. → Một slot vật lý **chỉ bán được cho 1 đặt chỗ tại một thời điểm**, dù lịch trống. Lãng phí công suất; câu query overlap (A) gần như **code chết**.

### ✅ 3.2. PayOS ngoài transaction → slot "mồ côi" — ĐÃ XỬ LÝ (bù trừ saga)
**Trước:** transaction commit xong (reservation `pending` + slot `reserved`) rồi mới gọi `createPayOSPaymentLink`. PayOS lỗi → throw, nhưng slot reserved **đã ghi**, không payment, không webhook → **slot kẹt `reserved` vĩnh viễn**.
**Đã sửa** (`createReservation`): bọc `createPayOSPaymentLink` + `Payment.create` trong try/catch. Hỏng → chạy **bù trừ** `cancelReservationOnPaymentFail(reservationId)` (nhả slot + huỷ reservation) rồi ném `502 PAYMENT_GATEWAY_ERROR`. `logSuggestion` đã tự nuốt lỗi nên không cần bọc. Nếu chính bù trừ cũng hỏng (double failure) → **job nền 3.3** là lớp dự phòng (pending TTL sẽ dọn). Đã test: ép PayOS lỗi → slot trở lại `available`, reservation `cancelled`, đúng mã lỗi.

### ✅ 3.3. TTL cho đơn `pending` + no-show — ĐÃ XỬ LÝ (job nền)
**Trước:** đơn `pending` giữ slot `reserved` vô thời hạn; `confirmed` no-show cũng giữ slot mãi.
**Đã sửa:** job nền `server/src/jobs/reservationMaintenance.job.js` chạy mỗi 60s (bật ở `server/src/index.js` sau `ensureRoles`):
- **Ca A — pending quá hạn:** `pending` có `created_at < now − booking_pending_ttl_minutes` (mặc định 15') → tái dùng `cancelReservationOnPaymentFail` (nhả slot + set `cancelled` + mark payment failed).
- **Ca B — no-show:** `confirmed` có `end_time < now − booking_no_show_grace_minutes` (mặc định 15') → `markReservationNoShow` (`confirmed → no_show`, nhả slot, vô hiệu QR; **không hoàn phí** — mất phí giữ chỗ).
Hai ngưỡng cấu hình qua settings/env (`BOOKING_PENDING_TTL_MINUTES`, `BOOKING_NO_SHOW_GRACE_MINUTES`). Mọi thao tác nhả slot tái dùng hàm có sẵn + khoá hàng + guard status nên idempotent (an toàn khi trùng nhịp webhook/checkin).

### ✅ 3.4. TOCTOU: chọn slot ngoài tx, khoá trong tx — ĐÃ XỬ LÝ (retry ứng viên kế)
**Trước:** `suggestSlot` đọc "slot A trống" trước transaction; tới `lockSlotReserved` người khác đã giật A → ném 409, **toàn bộ đơn fail** dù còn slot B/C trống.
**Đã sửa:** `suggestSlot` trả thêm `rankedSlots` (ứng viên xếp hạng best-first). `createReservation` lặp khoá: gặp 409 ở ứng viên này → **thử ứng viên kế** (tối đa `MAX_SLOT_LOCK_ATTEMPTS=5` để giới hạn row-lock giữ trong 1 transaction). Hết ứng viên mới ném `SLOT_RACE_LOST`. `ai_log` ghi đúng slot thực sự khoá được. Đã test bằng race thật 2-transaction: top1 bị giật giữa chừng → tự chọn top2.

### 🟡 3.5. Preview ≠ Create
`GET /suggest-slot` (preview) gợi ý slot **không khoá**. `POST /reservations` chạy `suggestSlot` **lại** và khoá — có thể ra slot **khác** preview. Lệch UX nhỏ.

### Bảng tổng hợp
| # | Vấn đề | Mức | Gốc rễ |
|---|---|---|---|
| 3.1 | Slot bị 1 đặt chỗ độc chiếm cả timeline | 🔴 cao | `slot.status` đơn-trạng-thái không hợp đặt-theo-giờ |
| 3.2 | ~~PayOS ngoài transaction → slot mồ côi~~ ✅ ĐÃ SỬA (bù trừ saga) | — | try/catch quanh PayOS → `cancelReservationOnPaymentFail` |
| 3.3 | ~~Không TTL pending/no-show~~ ✅ ĐÃ SỬA (job nền) | — | job `reservationMaintenance.job.js` dọn pending quá hạn + no-show |
| 3.4 | ~~Race suggest→lock → fail cứng~~ ✅ ĐÃ SỬA (retry ứng viên kế) | — | `rankedSlots` + vòng lặp lock top-N |
| 3.5 | Preview ≠ create | 🟡 thấp | preview không khoá (đúng bản chất) |

**Cốt lõi:** hệ thống trộn **hai mô hình chiếm chỗ** (cờ trạng thái vật lý + khung giờ logic) chưa hợp nhất — nguồn của 3.1, và làm 3.3 nặng hơn.

---

## 4. Hướng khắc phục (gợi ý)

- **3.1:** tách "giữ chỗ theo khung giờ" khỏi cờ `slot.status`. Cách 1: bỏ filter `status==='available'` cho luồng reservation, chỉ dựa overlap thời gian (bảng `reservation` đã đủ). Cách 2: bảng `slot_hold(slot_id, start, end)` riêng cho hold theo thời gian; `slot.status` chỉ phản ánh hiện-tại-vật-lý.
- **3.2:** đưa `Payment.create` vào **cùng transaction**; hoặc nếu PayOS phải gọi trước, dùng saga/compensation: PayOS lỗi → nhả slot + huỷ reservation.
- **3.3:** job nền (cron) huỷ `pending` quá N phút chưa trả + chuyển `confirmed` quá `end_time` thành `no_show` và nhả slot.
- **3.4:** chọn slot **bên trong** transaction, hoặc retry sang ứng viên kế khi `lockSlotReserved` 409 (lặp top-N candidates).
- **3.5:** chấp nhận (preview là tư vấn) hoặc cho client biết "có thể đổi".

---

## 5. Câu hỏi giáo viên có thể xoáy
- *"Một slot có nhận 2 đặt chỗ không trùng giờ được không?"* → Theo code hiện tại: **KHÔNG** (do 3.1) — hạn chế thiết kế.
- *"Đơn pending chưa trả tiền giữ slot bao lâu?"* → Tối đa `booking_pending_ttl_minutes` (mặc định 15') rồi job nền tự huỷ + nhả slot (đã sửa 3.3). No-show cũng tự `no_show` sau khi hết khung giờ + grace.
- *"PayOS lỗi sau khi đã tạo đặt chỗ thì slot ra sao?"* → Tự bù trừ: nhả slot + huỷ reservation ngay, trả `502 PAYMENT_GATEWAY_ERROR` (đã sửa 3.2); job nền 3.3 dự phòng nếu bù trừ cũng hỏng.
- *"Ai chọn slot, dựa vào gì để chắc đúng?"* → Hệ thống (`suggestSlot`); đúng nhờ zone-match + availability + row-lock + state-guard (mục 2).
