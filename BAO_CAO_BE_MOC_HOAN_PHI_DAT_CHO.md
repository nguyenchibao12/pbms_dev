# Báo cáo BE — Manager chưa sửa được mốc hoàn phí hủy đặt chỗ

**Phạm vi:** `booking_refund_cutoff_hours` và nhóm `booking_*` trong cấu hình hệ thống
**Mức độ:** trung bình — không sai nghiệp vụ, nhưng Manager không tự chỉnh được chính sách hoàn phí
**Trạng thái FE:** đã xử lý phần của FE (bỏ hardcode), chờ BE mở quyền ghi

---

## 1. Hiện trạng

Khi user hủy một đơn đặt chỗ đã thanh toán, BE quyết định hoàn phí giữ chỗ theo mốc thời gian:

```js
// server/src/services/reservation.service.js:588
const cutoffHours = getBookingRefundCutoffHours();
const msUntilStart = new Date(reservation.start_time).getTime() - Date.now();
const beforeCutoff = msUntilStart >= cutoffHours * 60 * 60 * 1000;
```

Mốc mặc định là **1 giờ**: hủy trước giờ vào từ 1 giờ trở lên thì hoàn 100%, trong vòng 1 giờ thì không hoàn.

Vấn đề: **Manager không có cách nào đổi con số này qua giao diện.**

## 2. Nguyên nhân — API cho đọc nhưng không cho ghi

| API | `booking_refund_cutoff_hours` |
| --- | --- |
| `GET /settings/system` | **Có trả về.** `getSystemSettings()` trả nguyên cache, mà cache có key này |
| `PATCH /settings/system` | **Không nhận.** Key không nằm trong whitelist |

Whitelist ở `server/src/validators/settings.validator.js:10`:

```js
export const SYSTEM_FIELD_KEYS = [
  'booking_fee',
  'monthly_pass_price',
  'lost_ticket_fee',
  'overstay_fee',
  'max_parking_hours',
  'pass_refund_trial_days',
  'pass_refund_trial_percent',
  'pass_refund_half_term_percent',
  'pass_refund_bank_info_ttl_days',
];
```

Và controller chỉ nhặt đúng các key đó (`server/src/controllers/settings.controller.js:12`):

```js
for (const key of SYSTEM_FIELD_KEYS) {
  if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
}
```

Hệ quả cần lưu ý: gửi `PATCH /settings/system` với `{"booking_refund_cutoff_hours": 3}` thì BE trả **200 OK** nhưng **âm thầm bỏ qua** — không lưu, không báo lỗi. Người gọi API tưởng đã đổi thành công.

## 3. Bức tranh đầy đủ: 9/17 thông số sửa được

Route `/settings/system` đã mở cho `managerOrAdmin` nên phân quyền không phải vấn đề. Vấn đề nằm ở whitelist.

**Manager sửa được (9):** `booking_fee`, `monthly_pass_price`, `lost_ticket_fee`, `overstay_fee`, `max_parking_hours`, `pass_refund_trial_days`, `pass_refund_trial_percent`, `pass_refund_half_term_percent`, `pass_refund_bank_info_ttl_days`

**Chỉ đọc, không sửa được (8):**

| Key | Ý nghĩa | Mặc định |
| --- | --- | --- |
| `booking_refund_cutoff_hours` | Mốc hoàn phí trước giờ vào | 1 giờ |
| `booking_pending_ttl_minutes` | Đơn chưa thanh toán bao lâu thì job tự hủy | 15 phút |
| `booking_no_show_grace_minutes` | Ân hạn sau `end_time` trước khi tính no-show / phụ thu lố giờ | 0 |
| `booking_max_advance_days` | Trần đặt trước | 365 ngày |
| `booking_max_duration_hours` | Trần độ dài một đơn | 24 giờ |
| `slot_suggest_strategy` | Chiến lược gợi ý chỗ | `nearest_gate` |
| `suggest_score_weights` | Trọng số chấm điểm chỗ | — |
| `ai_logging_enabled` | Bật/tắt ghi log gợi ý | true |

Comment ở `settings.validator.js:8` cho thấy đây là quyết định có chủ đích, không phải sót:

> Nhóm C (`booking_*` vòng đời đặt chỗ) và D (AI suggest) CHƯA mở — xem handoff.

Báo cáo này đề nghị mở nhóm C. Nhóm D (AI suggest) xin để BE tự quyết.

## 4. Hiện tại muốn đổi mốc thì phải làm gì

Cả hai cách đang có đều cần can thiệp hạ tầng, Manager không tự làm được:

1. **Env** `BOOKING_REFUND_CUTOFF_HOURS=3` → **phải restart server.** Env chỉ đọc một lần lúc dựng cache (`settings.js:78`), không đọc lại mỗi lần gọi getter.
2. **Sửa tay JSON cột `system_config`** ở bảng `settings` row id=1 → cũng phải restart (hoặc gọi `refreshSettingsCache()`). Cách này có tác dụng vì `refreshSettingsCache` merge `{...envSystemDefaults(), ...DB}`, tức DB đè env.

## 5. Đề xuất sửa

Sửa đúng một file: `server/src/validators/settings.validator.js`.

**(1) Thêm key vào whitelist:**

```js
export const SYSTEM_FIELD_KEYS = [
  // ... giữ nguyên 9 key hiện có
  'booking_refund_cutoff_hours',
];
```

**(2) Thêm validator vào `updateSystemValidator`:**

```js
body('booking_refund_cutoff_hours')
  .optional()
  .isFloat({ min: 0 })
  .withMessage('Mốc hoàn phí trước giờ vào (giờ) phải là số ≥ 0')
  .toFloat(),
```

Lưu ý dùng `isFloat` chứ đừng `isInt`: getter `getBookingRefundCutoffHours()` đã chấp nhận số lẻ, để `0.5` (30 phút) là hợp lệ và hợp lý về nghiệp vụ. Giá trị `0` nghĩa là bỏ hẳn cửa sổ "sát giờ" — hủy lúc nào trước giờ vào cũng hoàn 100%; FE đã xử lý trường hợp này.

**Không phải sửa gì thêm:** `updateSystemSettings()` đã tự `clearSettingsCache()` + `refreshSettingsCache()` sau khi ghi DB, nên đổi xong có hiệu lực ngay, không cần restart.

Nếu BE muốn mở luôn cả nhóm C một thể (4 key `booking_*` còn lại) thì gọn hơn là sau này lại đụng vào file này lần nữa. Đề xuất kiểu validate:

| Key | Validate đề xuất |
| --- | --- |
| `booking_pending_ttl_minutes` | `isInt({ min: 1 })` — 0 phút nghĩa là hủy đơn ngay khi vừa tạo |
| `booking_no_show_grace_minutes` | `isInt({ min: 0 })` — 0 hợp lệ, là mặc định hiện tại |
| `booking_max_advance_days` | `isInt({ min: 1 })` — getter đã fail-safe: giá trị ≤ 0 rơi về mặc định chứ không thành "không giới hạn" |
| `booking_max_duration_hours` | `isInt({ min: 1 })` — tương tự |

## 6. Phía FE đã làm gì

Trước đây modal hủy đặt chỗ ghi cứng chữ "1 giờ". Đúng với mặc định, nhưng nếu BE đổi env thành 2 giờ thì BE tính 2 mà màn hình vẫn nói 1 — user bị từ chối hoàn tiền không hiểu vì sao.

FE đã bỏ hardcode: mỗi lần mở modal hủy sẽ đọc `bookingRefundCutoffHours` từ `GET /public/info` (BE đã trả sẵn ở `public.service.js:128`) và dựng câu chữ theo số thật — `1` → "1 giờ", `0.5` → "30 phút", `0` → "hủy lúc nào cũng hoàn 100%". Đọc lỗi thì hiện câu chung chung ("hủy sớm / hủy sát giờ") chứ không bịa số.

Nghĩa là **sau khi BE mở whitelist, FE không cần sửa gì để hiển thị đúng mốc mới.** Phần duy nhất FE cần bổ sung là thêm ô nhập vào trang `/manager/settings` (2 dòng khai báo field) — làm ngay khi BE báo đã mở.

## 7. Kiểm thử đề nghị sau khi sửa

1. `PATCH /settings/system` với `{"booking_refund_cutoff_hours": 3}` → response phải trả về `booking_refund_cutoff_hours: 3` (hiện tại trả về 1).
2. Không restart server, tạo một đơn có `start_time` cách hiện tại 2 giờ, hủy → phải **không** được hoàn (vì 2 < 3), và `refund.cutoffHours` trong response bằng 3.
3. Gửi giá trị âm → phải trả 400 chứ không nhận.
4. Gửi `{"booking_refund_cutoff_hours": 0}` → nhận, và hủy đơn bất kỳ trước `start_time` đều hoàn 100%.

---

**File liên quan**

- `server/src/validators/settings.validator.js` — whitelist + validator (cần sửa)
- `server/src/controllers/settings.controller.js:12` — chỗ lọc key
- `server/src/utils/settings.js:36,78,161` — mặc định, đọc env, getter
- `server/src/services/reservation.service.js:586-593` — chỗ áp dụng mốc khi hủy
- `server/src/services/public.service.js:128` — chỗ đã trả giá trị ra cho FE
