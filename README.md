# Phả đồ

Gia phả chạy bằng Node. Trên máy, dữ liệu nằm trong `data/giapha.json`. Trên Render, dữ liệu nằm trong Postgres. Cả hai đều không chỉ nằm trong trình duyệt.

## Chạy trên máy

```bash
node server.js
```

Mở http://localhost:3000

Đặt mật khẩu trước khi đưa lên mạng. Không có mật khẩu thì ai vào trang cũng sửa được.

```bash
# Windows PowerShell
$env:GIAPHA_KEY="mat-khau-cua-ban"
node server.js
```

```bash
# Linux / macOS
GIAPHA_KEY=mat-khau-cua-ban node server.js
```

Người xem không cần mật khẩu vẫn thấy các gia phả đang **Công khai**. Muốn sửa thì nhập mật khẩu trên trang.

## Deploy bằng Docker

```bash
docker build -t giapha .
docker run -d --name giapha -p 3000:3000 -e GIAPHA_KEY=mat-khau-cua-ban -v giapha-data:/app/data giapha
```

Volume `giapha-data` giữ file gia phả khi container được tạo lại.

## Deploy lên Render

File trên đĩa của web service Render bị xóa mỗi lần dịch vụ ngủ hoặc triển khai lại. Gia phả vì vậy được ghi vào Postgres của Render, qua biến `DATABASE_URL`. File `render.yaml` tạo cả web lẫn database.

1. Đưa đúng thư mục này lên một repository GitHub riêng (không dùng git của cả ổ đĩa).
2. Trên [Render](https://dashboard.render.com) chọn **New → Blueprint**.
3. Chọn repository đó. Render đọc `render.yaml`.
4. Khi được hỏi `GIAPHA_KEY`, nhập mật khẩu dùng để sửa gia phả.
5. Bấm áp dụng. Render tạo web service `giapha` và database `giapha-db`, rồi gắn chuỗi kết nối vào web.
6. Mở địa chỉ `https://giapha-....onrender.com`. Lần đầu có thể mất khoảng một phút nếu dịch vụ đang ngủ.

Postgres miễn phí hết hạn sau 30 ngày và tối đa 1 GB. Muốn giữ lâu hơn thì nâng database lên gói trả phí trong dashboard Render. Dữ liệu vẫn nằm trên Render, không nằm trong trình duyệt.
