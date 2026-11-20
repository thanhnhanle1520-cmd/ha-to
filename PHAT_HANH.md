# Quy trình phát hành HA TO (từ bản 21)

## Hai repo

| Repo | Địa chỉ | Dữ liệu |
|---|---|---|
| `ha-to` (bản thật) | https://thanhnhanle1520-cmd.github.io/ha-to/ | Google Drive thật |
| `ha-to-test` (bản thử) | https://thanhnhanle1520-cmd.github.io/ha-to-test/?local=1 | Dữ liệu giả, chỉ lưu trong trình duyệt. Không đụng tới Drive |

## Lập repo thử (làm 1 lần)

1. GitHub → **New repository** → tên `ha-to-test`, để **Public** → Create.
2. **Add file → Upload files** → kéo toàn bộ nội dung đã giải nén của gói cập nhật mới nhất vào → **Commit**.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
4. Đợi 1–2 phút, mở **https://thanhnhanle1520-cmd.github.io/ha-to-test/?local=1**. Góc trên hiện "Chế độ thử" (màu tím) là đúng.
5. Không cần `config.js` ở repo thử, vì chế độ `?local=1` không dùng Google.

## Mỗi lần có bản mới

1. Claude chạy toàn bộ test tự động. Phải **tất cả đạt** mới gửi ảnh và gói.
2. Anh tải gói lên **`ha-to-test`** trước, dùng thử các chức năng vừa sửa trên dữ liệu giả, trên cả máy tính và điện thoại.
3. Chỉ khi thấy ổn mới tải cùng gói lên **`ha-to`**. **Không ghi đè `config.js`.**
4. **Giữ lại file zip của 3 bản gần nhất.** Nếu bản mới có lỗi: tải lại zip bản trước lên `ha-to` để quay về.
5. Dữ liệu: trước mỗi lần nâng cấp, app tự lưu bản sao dữ liệu. Khi cần, vào menu ☁ → **Khôi phục**.

## Nguyên tắc

- Không thử nghiệm trên bản thật, không nhập dữ liệu thử vào Drive thật.
- Không dùng dữ liệu khách hàng thật để thử tải.
- Thay đổi cấu trúc dữ liệu chỉ thêm cột, không xóa hay đổi dữ liệu cũ. Bản ghi cũ giữ nguyên ý nghĩa (ví dụ: phụ lục cũ = "Đã ký").
- Chưa phát hành nếu còn lỗi liên quan đến tài chính.
