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

## 3. Quy tắc Bảo mật & Mạng
- Mọi Proxy nhận URL từ client (`/api/esp32-proxy`, `/api/yt-stream-proxy`) bắt buộc qua bộ lọc chống SSRF (kiểm tra scheme, port, phân giải DNS, chặn `127.0.0.1`, `::1`, `169.254.169.254`).
- Mọi dữ liệu WebSocket và UDP phải được ép kiểu và giới hạn biên (`clampFinite`), dọn dẹp entity khi disconnect để không nhân bản xe vô hạn.

## 4. Progressive Disclosure Skills
Chỉ đọc skill tương ứng khi thực hiện tác vụ chuyên biệt:
- `.agents/skills/meta-quest-webxr/SKILL.md`: Khi sửa WebXR session, Controller, Hand Tracking, Spatial UI hoặc Comfort mode.
- Chạy `node tools/xr-doctor.js` sau mỗi thay đổi để xác minh cú pháp, bảo mật và cấu trúc XR.
