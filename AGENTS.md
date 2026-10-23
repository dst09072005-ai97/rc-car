# AGENTS.md — Quy tắc Kỹ thuật & Bảo mật Workspace

## 🚨 QUY TẮC BẢO VỆ GITHUB (STRICT GITHUB PUSH POLICY)
1. **CẤM TỰ Ý PUSH**: Tuyệt đối KHÔNG ĐƯỢC chạy bất kỳ lệnh `git push` nào lên GitHub khi chưa có sự xác nhận trực tiếp, rõ ràng của người dùng (USER).
2. **KHO LƯU TRỮ LÀ BẢN BACKUP**: Repository GitHub được dùng làm kho sao lưu nguyên bản của USER. Mọi thay đổi, tối ưu hay refactor chỉ được lưu ở máy local.
3. **ĐIỀU KIỆN TIÊN QUYẾT**: Chỉ khi USER gõ xác nhận rõ ràng (ví dụ: "tôi xác nhận tất cả, hãy push lên github", "confirm push") thì mới được phép thực thi lệnh push.
4. **MẶC ĐỊNH**: Sau khi code, kiểm thử hoặc tối ưu xong, chỉ thông báo kết quả kiểm tra cục bộ và commit ở local, chờ lệnh xác nhận từ USER.

---

## 2. Mục tiêu & Source of Truth
- **Mục tiêu chính**: Trải nghiệm WebXR 6DoF mượt mà (72Hz/90Hz) trên **Meta Quest Browser**, có chế độ dự phòng 3D/2D cho PC và Mobile.
- **Source of Truth**:
  - `index.html`: Giao diện HTML/CSS, import map Three.js và các nút điều khiển.
  - `app.js`: Scene Three.js, WebXR session, Controller/Hand tracking, vật lý xe & Spatial UI.
  - `server.js`: Express HTTP/HTTPS, WebSocket Multiplayer, UDP Telemetry (cổng 4210) và Proxy.
  - `youtube-dom-extractor.js`: Đồng bộ trình phát MP4/YouTube đa màn hình.
  - `AndroidManifest.xml`: Cấu hình đóng gói Capacitor 2D panel.

---

## 3. Quy tắc Bảo toàn & Sửa Code
- **Cấm xóa tính năng đang chạy**: Giữ nguyên Multiplayer, ESP32 Cam Trước/Lùi, UDP Telemetry, Radar Minimap, Gara và hệ thống NPC.
- **Ưu tiên bản vá nhỏ (Additive / Modular Patch)**: Không viết lại toàn bộ file lớn hoặc tự ý nâng cấp phiên bản Three.js không đồng bộ.
- **Single Render Pipeline**: Chỉ dùng `renderer.setAnimationLoop()` kết hợp hook `scene.onBeforeRender`; không tạo thêm vòng lặp `requestAnimationFrame` gây xung đột tọa độ.
- **Zero Per-Frame Allocation**: Không khởi tạo `new THREE.Vector3/Matrix4/Euler` hoặc tạo `CanvasTexture` mới liên tục trong mỗi frame.

---

## 4. Quy tắc Bảo mật & Mạng
- Mọi Proxy nhận URL từ client (`/api/esp32-proxy`, `/api/yt-stream-proxy`) bắt buộc qua bộ lọc chống SSRF (`isForbiddenSsrfIp`, chặn `127.0.0.1`, `::1`, `169.254.169.254`).
- Mọi dữ liệu WebSocket và UDP phải được ép kiểu và giới hạn biên (`clampFinite`), dọn dẹp entity khi disconnect (`cars.delete(carId)`) để không nhân bản xe vô hạn.
