# HA TO — phần mềm kinh doanh nội bộ (web tĩnh, dữ liệu trên Google Drive)

Trang chạy: https://thanhnhanle1520-cmd.github.io/ha-to/

## Kiến trúc (tóm tắt)
- **Giao diện + nghiệp vụ chạy hoàn toàn trong trình duyệt.** Không có máy chủ riêng.
- `code.js` = `src/Code.gs`: nghiệp vụ (báo giá, HĐ, giao hàng, công việc…). Chạy trên lớp mô phỏng `shim.js` (bảng tính trong bộ nhớ).
- `store.js`: đăng nhập Google, lưu mỗi bảng thành 1 file JSON trong `Drive/HA TO/data`, bản sao trong máy (IndexedDB), đồng bộ gộp theo dòng giữa nhiều thiết bị, sao lưu / khôi phục, nhật ký, đo hiệu năng.
- `xlsx-lite.js`, `xlsx-write.js`: đọc / ghi Excel không cần thư viện ngoài.
- `sw.js`: lưu sẵn ứng dụng để mở nhanh, báo khi có bản mới.

## Cấu trúc thư mục
| Thư mục / file | Vai trò |
|---|---|
| `src/` | **Mã gốc.** `Code.gs` (nghiệp vụ), `Index.html`, `Css.html`, `Js_*.html` (giao diện), `sw.template.js` |
| `build.py` | Ghép `src/` + các file `.js` ở thư mục gốc → thư mục `dist/` (bản chạy) |
| `index.html`, `code.js`, `sw.js` ở thư mục gốc | Bản đã build (GitHub Pages phục vụ các file này) |
| `test/` | Kiểm thử tự động (Node + Chrome không giao diện) |
| `.github/workflows/test.yml` | GitHub tự chạy kiểm thử mỗi lần cập nhật |
| `config.js` | Client ID Google. **Không ghi đè khi cập nhật** |

## Cập nhật bản mới
1. Giải nén file cập nhật và tải tất cả lên repo (Add file → Upload files). **Không ghi đè `config.js`.**
2. Chờ 2–3 phút. Trang sẽ báo "Đã có bản HA TO mới – Tải lại", hoặc bấm Ctrl+F5.
3. Mở tab **Actions** trên GitHub: dấu xanh là kiểm thử đạt, đỏ là có lỗi (bấm vào để xem dòng lỗi).
4. Muốn quay lại bản trước: vào **Commits**, chọn lần cập nhật trước, bấm **Revert**. Hoặc tải lại file zip của bản trước.

## Chạy kiểm thử trên máy
```bash
bash test/run_all.sh
```
Cần Python 3, Node 22 và Google Chrome. Bài cần dữ liệu thật (`/tmp/old.xlsx`) tự bỏ qua nếu không có.

## Dữ liệu và an toàn
- Dữ liệu chỉ nằm trên Drive của người dùng và trong trình duyệt. Quyền Google chỉ là `drive.file`, tức app chỉ thấy các file do chính nó tạo.
- Tự sao lưu mỗi ngày vào `Drive/HA TO/Sao lưu` (giữ 30 bản). Khôi phục bằng cách bấm thanh đồng bộ → Khôi phục.
- Khi nâng cấp cấu trúc dữ liệu, app tự chụp lại dữ liệu trước khi nâng cấp.
- Repo này công khai: **không** đưa file dữ liệu, file khách hay `Du_lieu*.xlsx` lên đây.
- Tính năng "Nhập Excel khách" đã gỡ (19/11/2026). Bảng `RFQS` và các cột `rfq_id`, `src_rows`, `rfq_maps` vẫn giữ để không mất dữ liệu cũ, nhưng không còn dùng.
