# Node Rules: `tools/`

## 1. Mục Đích & Trách Nhiệm
Thư mục `tools/` CHỈ chứa các công cụ chẩn đoán, cầu nối phần cứng DirectInput và chứng chỉ TLS đang hoạt động trực tiếp trong hệ thống:
- `xr-doctor.js`: Master Verification Gate cho toàn bộ dự án.
- `test_runtime_load.js` & `test_v190_cabin_rules.js`: Trình mô phỏng kiểm tra headless runtime load (chống lỗi TDZ, ReferenceError, black screen).
- `gog808_native_bridge.exe` & `gog808_native_bridge.cs`: Native DirectInput bridge đọc vô lăng/bàn đạp GOG R808 phát 50Hz.
- `cert.pem` & `key.pem`: Chứng chỉ TLS phục vụ HTTPS (:8443) cho kính Meta Quest 3 & điện thoại.
- `show_qr.js`: Hiển thị mã QR kết nối nhanh trên terminal.
- `check_env.js`: Kiểm tra môi trường Node/Godot/Blender.
- `renew_cert.ps1`: Tái tạo chứng chỉ HTTPS khi cần.
- `serve_webxr.py`: Trình phục vụ WebXR cục bộ bằng Python.
- `godot/`: Binary Godot 4.x engine.

## 2. Invariants & Token Discipline Rules
- ⛔ **CẤM SINH BẢN VÁ TRÔI NỔI**: Tuyệt đối không tạo các file `apply_patch_v*.js`, `patch_*.js`, `sync_*.py` hay `debug_*.txt` trong thư mục này. Mọi bản vá đã được kiểm định bắt buộc phải sửa trực tiếp vào source of truth (`www/`, `server/`, `config/`).
- ⛔ **CẤM QUÉT UNBOUNDED**: Các agent khi truy vấn `tools/` chỉ đọc file mục tiêu theo danh sách trên, cấm dump toàn bộ nội dung file nhị phân (`.exe`, `.pem`) vào prompt.
- 📁 **LƯU TRỮ LỊCH SỬ**: Toàn bộ 55 bản vá cũ đã được lưu trữ trong `backups/historical_patches/`.
