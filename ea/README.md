# TrackDailyTrade MT5 Expert Advisor (`TrackDailyTrade.mq5`)

Expert Advisor MQL5 thuần (không phụ thuộc thư viện ngoài) đồng bộ tự động lệnh giao dịch đã đóng từ MetaTrader 5 sang **TrackDailyTrade** theo thời gian thực + backfill chống miss lệnh.

## Tính năng chính
1. **Xử lý chuẩn Partial Close theo `positionId`**:
   - Chỉ gửi Webhook khi vị thế đã đóng hoàn toàn (`remainingVolume == 0`).
   - Tự gom toàn bộ deals (`DEAL_ENTRY_IN` / `DEAL_ENTRY_OUT` / `DEAL_ENTRY_OUT_BY`) thuộc `positionId`: tổng volume, giá vào/ra trung bình gia quyền, tổng Gross PnL, Commission + Fee, Swap, Net PnL.
2. **Bắt `initialStopLoss` & `initialRiskAmount` (1R) linh hoạt**:
   - Tự động lưu SL ban đầu ngay khi vào lệnh (`DEAL_ENTRY_IN`) **hoặc** khi bạn kéo/đặt SL lần đầu tiên (`TRADE_TRANSACTION_POSITION` nếu lúc mở lệnh để SL = 0).
   - Tính chính xác `initialRiskAmount` theo tiền tệ tài khoản bằng `OrderCalcProfit()`.
   - Khóa cứng và lưu ra file `MQL5/Files/TrackDailyTrade_risk_<AccountLogin>.csv` để **không bị ghi đè** khi bạn dời SL về hòa vốn (BE), trailing SL, hoặc khởi động lại MT5.
3. **An toàn múi giờ cuối tuần**:
   - Gửi trực tiếp `openTimeServer` và `closeTimeServer` theo giờ server sàn (`YYYY.MM.DD HH:mm:ss`) — không dùng `TimeCurrent() - TimeGMT()`, tránh lệch giờ khi chạy backfill vào cuối tuần không có tick.
   - Backend tự quy đổi bằng `account.brokerTimezone` → UTC (hỗ trợ DST `Europe/Athens`).
4. **Chống miss lệnh (Backfill + Nút trên Chart)**:
   - Tự động đồng bộ lại lịch sử đóng lệnh trong `InpBackfillDays` ngày gần nhất (mặc định `7` ngày) mỗi khi khởi chạy EA.
   - Có nút **`Sync Now (7d)`** ngay trên chart để chủ động đồng bộ lại bất cứ lúc nào.

---

## Hướng dẫn cài đặt & compile trên MetaTrader 5

### Bước 1: Copy và Compile EA trong MetaEditor
1. Mở MetaTrader 5 → chọn `File → Open Data Folder`.
2. Copy file `ea/TrackDailyTrade.mq5` vào thư mục `MQL5/Experts/TrackDailyTrade.mq5`.
3. Nhấn `F4` mở **MetaEditor**, mở file `TrackDailyTrade.mq5` và nhấn **`F7` (Compile)** để tạo file `TrackDailyTrade.ex5` (0 errors).

### Bước 2: Cho phép `WebRequest` trong MT5 (Bắt buộc)
1. Trong MetaTrader 5, vào `Tools → Options → Expert Advisors`.
2. Tích chọn **Allow Algorithmic Trading**.
3. Tích chọn **Allow WebRequest for listed URL**, sau đó thêm URL backend:
   ```text
   http://127.0.0.1:3005
   ```
   *(Lưu ý: nếu bạn chạy MT5 trên Windows VPS hoặc Parallels/VM khác máy host, hãy thay `127.0.0.1` bằng IP LAN của máy chạy API hoặc URL tunnel).*

### Bước 3: Gắn EA lên 1 Chart bất kỳ
1. Kéo `TrackDailyTrade` từ bảng **Navigator → Expert Advisors** thả vào **1 chart bất kỳ** (chỉ cần gắn trên 1 chart duy nhất, EA tự theo dõi toàn bộ mọi cặp tiền trong tài khoản).
2. Kiểm tra các tham số đầu vào (Inputs):
   - `InpWebhookBatchUrl`: `http://127.0.0.1:3005/api/webhooks/mt5/batch`
   - `InpBackfillDays`: `7`
   - `InpSyncOnInit`: `true`
   - `InpBrokerTimezone`: để trống (khuyến nghị) để dùng cấu hình `Broker Server Timezone` trên trang **Accounts & Tags** của web app.
3. Nhấn **OK**. Kiểm tra tab **Experts** dưới Terminal sẽ thấy log:
   `[TrackDailyTrade] Synced X trade(s) -> HTTP 201`.

---

## Khắc phục sự cố thường gặp
- **Error `4014` (`WebRequest` failed)**: Bạn chưa thêm `http://127.0.0.1:3005` vào danh sách `Allow WebRequest for listed URL` trong MT5 Options.
- **Error `5203` (Cannot connect)**: Backend API chưa chạy (`pnpm dev` hoặc `apps/api`) hoặc sai IP/Port.
- **Lệnh bị lệch 1–2 tiếng**: Kiểm tra mục `Broker Server Timezone` của tài khoản trong trang `/accounts` trên web app (đa số sàn MT5 là `Europe/Athens` GMT+2/+3 DST).
