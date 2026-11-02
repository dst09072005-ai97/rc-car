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

## 5. Quy tắc Vô lăng GOG R808, Bàn đạp & Cân bằng Tâm Buồng lái (Chuẩn hóa V504)
- **Native Host USB Wheel Bridge (Zero-Browser Dependency)**:
  - Máy tính Windows host đọc trực tiếp thiết bị vô lăng DirectInput/WinMM (`winmm.dll`) qua tiến trình native `tools/gog808_native_bridge.exe` tại tần số 50Hz.
  - Ngay khi khởi động `node server.js`, tiến trình ngầm tự động phát sóng tín hiệu đã chuẩn hóa qua WebSocket (port 8080 / 8443) và UDP 4210 (ESP32). Kính Meta Quest 3 và các thiết bị khác nhận tín hiệu lái độc lập mà **không cần mở trình duyệt localhost trên máy tính**.
  - Server in log trạng thái điều khiển mượt mà: `🛞 [GOG808 50Hz MƯỢT] Lái: ... | Ga: ... | Phanh: ... | Số ... | Kính: ...`.
- **Chống Phanh Ảo 100% (Anti-Phantom Brake)**:
  - Trên kính Meta Quest 3 / Android WebView: Hàm `findGog808Gamepad` tuyệt đối không dùng cơ chế fallback nhận diện thiết bị ảo hoặc Touch Controller làm vô lăng USB nếu tên không chứa từ khóa phần cứng thật (`808|wheel|racing|steering|logitech|thrustmaster`).
  - Bộ chuẩn hóa bàn đạp (`readPedalAxis`) bắt buộc bỏ qua frame 0 chưa ổn định của driver Windows và áp dụng deadzone an toàn 0.08, triệt tiêu hoàn toàn hiện tượng cấn phanh 100%.
- **Tự động Cân Bằng Tâm Góc Nhìn (Auto Viewpoint Centering)**:
  - BẮT BUỘC tự động kích hoạt `resetAndCenterViewpoint()` khi: Lên xe, Xuống xe, Đổi ghế lái/ghế phụ hoặc kết nối phòng.
  - Trong WebXR, tự động bù trừ góc xoay vật lý của đầu trong phòng (`cameraRig.rotation.y = -headEuler.y`), căn thẳng hướng nhìn 100% xuyên qua kính chắn gió (-Z) khi ngồi vào ghế mà không bắt người dùng phải bấm nút cân bằng tâm thủ công.
- **Đồng bộ Bảng Chức Năng (Function Panel Live Sync)**:
  - Khi WebSocket nhận `WHEEL_BRIDGE_STATE`, hàm `syncWheelToFunctionPanel(w)` lập tức cập nhật toàn bộ thanh đo (`#pedal-gas-bar`, `#pedal-brake-bar`, `#pedal-reverse-bar`, `#wheel-steer-bar`), live monitor text và xung ESP32.
  - IP mạng nội bộ mặc định là `192.168.1.60` (hoặc tự động cập nhật qua subnet discovery `/api/bridge-ping`).

