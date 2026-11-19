# HA TO (bản web mới) — hướng dẫn cài đặt

Thư mục `dist/` là toàn bộ app (file tĩnh). Dữ liệu lưu trong Google Drive của bạn: thư mục **HA TO/data** (dữ liệu) và **HA TO/Sao lưu** (30 bản gần nhất).
HATO ERP cũ không bị đụng tới.

## 1. Tạo Client ID (làm 1 lần, ~10 phút)
1. Vào https://console.cloud.google.com → tạo Project mới, tên "HA TO".
2. **APIs & Services → Library** → bật **Google Drive API**.
3. **OAuth consent screen** (Google Auth Platform) → loại **External** → điền tên app, email → mục **Audience / Test users** thêm Gmail bạn dùng. Để trạng thái **Testing**.
4. **Credentials → Create credentials → OAuth client ID** → loại **Web application**.
   - **Authorized JavaScript origins**: thêm địa chỉ web của app (bước 2 bên dưới), ví dụ `https://tenban.github.io`. (Không có dấu `/` cuối, không có đường dẫn.)
5. Copy **Client ID** (dạng `xxxx.apps.googleusercontent.com`).

## 2. Đưa app lên web (chọn 1)
**GitHub Pages**: tạo repo mới (Public hoặc Private tùy gói) → tải toàn bộ nội dung trong `dist/` lên → Settings → Pages → Branch `main` / root → địa chỉ có dạng `https://tenban.github.io/ten-repo/`.
**Cloudflare Pages**: Create project → Upload assets → kéo thư mục `dist/` vào.

Địa chỉ web này chính là origin ở bước 1.4 (chỉ lấy phần `https://tenban.github.io`).

## 3. Dán Client ID
Cách 1: mở `config.js` trong `dist/`, dán Client ID vào, tải lại lên web.
Cách 2: để trống, mở app lần đầu sẽ hỏi Client ID rồi nhớ trong trình duyệt (phải làm lại trên mỗi thiết bị).

## 4. Dùng
- Mở địa chỉ web → **Đăng nhập Google** → cho phép quyền Drive (chỉ file do app tạo) → tải dữ liệu lần đầu.
- Điện thoại: mở bằng Chrome (Android) / Safari (iPhone) → **Thêm vào màn hình chính** để dùng như app.
- Dữ liệu lưu ngay trên máy, tự đẩy lên Drive sau ~1,5 giây; dải trạng thái dưới màn hình báo "Đã đồng bộ / Chờ đồng bộ". Bấm vào dải đó để: đồng bộ ngay, sao lưu ngay, nhập dữ liệu cũ.
- Mất mạng vẫn xem/sửa được; có mạng lại sẽ tự đồng bộ. Nếu 2 thiết bị cùng sửa 1 bảng, app hỏi chọn bản Drive hay bản máy này.

## 5. Chuyển dữ liệu từ HATO ERP cũ
1. Mở Google Sheet của HATO ERP cũ → Tệp → Tải xuống → **Microsoft Excel (.xlsx)**.
2. Trong app mới: bấm dải trạng thái → **Nhập dữ liệu từ HATO ERP cũ** → chọn file → Nhập. (Thay toàn bộ dữ liệu hiện có.)
3. Tài khoản Google đang đăng nhập tự được đặt là Quản trị.
Lưu ý: file đính kèm cũ trên Drive (ảnh, PDF) không được chuyển; chỉ dữ liệu bảng.

## Lưu ý
- Chế độ thử không cần Google: thêm `?local=1` sau địa chỉ (dữ liệu giả, lưu trong trình duyệt).
- Khi ở trạng thái Testing, Google có thể yêu cầu đăng nhập lại sau vài ngày — bình thường.
- In/PDF: dùng nút In của trình duyệt → "Lưu thành PDF".
