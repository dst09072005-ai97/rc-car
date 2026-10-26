# AGENTS.md — Meta Quest 3 Immersive WebXR Engineering Rules

## 1. Mục tiêu & Source of Truth
- **Mục tiêu chính**: Trải nghiệm WebXR 6DoF mượt mà (72Hz/90Hz) trên **Meta Quest Browser**, có chế độ dự phòng 3D/2D cho PC và Mobile (9:16).
- **Source of Truth**:
  - `index.html`: Giao diện HTML/CSS, import map Three.js và các nút điều khiển nhanh.
  - `app.js`: Scene Three.js, WebXR session, Controller/Hand tracking, vật lý xe, Gara Toàn & Spatial UI.
  - `server.js`: Express HTTP/HTTPS, WebSocket Multiplayer, UDP Telemetry (cổng 4210) và Proxy.
  - `youtube-dom-extractor.js`: Đồng bộ trình phát MP4/YouTube đa màn hình.
  - `AndroidManifest.xml`: Cấu hình đóng gói Capacitor 2D panel (không tự biến thành native OpenXR nếu chỉ đổi manifest).

## 2. Quy tắc Bảo toàn & Sửa Code
- **Cấm xóa tính năng đang chạy**: Giữ nguyên Multiplayer, ESP32 Cam Trước/Lùi, UDP Telemetry, Radar Minimap, Gara 3 siêu xe và hệ thống NPC.
- **Ưu tiên bản vá nhỏ (Additive / Modular Patch)**: Không viết lại toàn bộ file lớn hoặc tự ý nâng cấp phiên bản Three.js không đồng bộ.
- **Single Render Pipeline**: Chỉ dùng `renderer.setAnimationLoop()` kết hợp hook `scene.onBeforeRender`; không tạo thêm vòng lặp `requestAnimationFrame` gây xung đột tọa độ.
- **Zero Per-Frame Allocation**: Không khởi tạo `new THREE.Vector3/Matrix4/Euler` hoặc tạo `CanvasTexture` mới liên tục trong mỗi frame.
- **Chống lỗi Temporal Dead Zone (TDZ) & Độc lập khởi tạo**: Tuyệt đối không gọi các hàm tạo đối tượng hoặc truy cập cache khai báo ở cuối file từ các hàm spawn ở đầu file. Mọi component spawn sớm phải tự chủ vật liệu/geometry hoặc nằm sau khối định nghĩa tài nguyên.
- **Bảo toàn Scene Graph Three.js**: Khi thiết lập `light.target`, phải dùng `new THREE.Object3D()` chuyên dụng thêm vào cùng container, không gán node con đang thuộc về group khác (`bayGroup.add(plinth)`) để tránh bị Three.js gỡ khỏi cha và sai lệch vị trí hiển thị.

## 3. Quy tắc Bảo mật & Mạng
- Mọi Proxy nhận URL từ client (`/api/esp32-proxy`, `/api/yt-stream-proxy`) bắt buộc qua bộ lọc chống SSRF (kiểm tra scheme, port, phân giải DNS, chặn `127.0.0.1`, `::1`, `169.254.169.254`).
- Mọi dữ liệu WebSocket và UDP phải được ép kiểu và giới hạn biên (`clampFinite`), dọn dẹp entity khi disconnect để không nhân bản xe vô hạn.

## 4. Progressive Disclosure Skills & Cổng Kiểm thử Tự động (Verification Gate)
Chỉ đọc skill tương ứng khi thực hiện tác vụ chuyên biệt:
- `.agents/skills/meta-quest-webxr/SKILL.md`: Khi sửa WebXR session, Controller, Hand Tracking, Spatial UI hoặc Comfort mode.
- **Cổng Kiểm Định Bắt Buộc (Bắt lỗi trước khi F5)**: Sau MỌI thay đổi mã nguồn, BẮT BUỘC chạy `node tools/xr-doctor.js`. Lệnh này tự động kích hoạt kiểm tra tĩnh (`node --check`) và mô phỏng nạp runtime (`tools/test_runtime_load.js`). Nếu chưa đạt `[VERIFIED]` 100% ở mục Runtime Integrity thì TUYỆT ĐỐI KHÔNG BÁO HOÀN THÀNH hoặc yêu cầu user F5.
