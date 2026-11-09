# AGENTS.md — Meta Quest 3 Immersive WebXR Engineering Rules

## 1. Mục tiêu & Source of Truth
- **Mục tiêu**: WebXR 6DoF mượt 72Hz/90Hz trên **Meta Quest Browser**; dự phòng 3D/2D PC/Mobile.
- **Source of Truth**:
  - `www/index.html`: UI/CSS, Three.js import map, nút điều khiển.
  - `www/app.js`: Three.js scene, WebXR session, Controller/Hands, vật lý, Gara & Spatial UI.
  - `server/server.js`: Express HTTP/HTTPS, WebSocket Multiplayer, UDP Telemetry (4210), Proxy.
  - `www/youtube-dom-extractor.js`: Đồng bộ MP4/YouTube.
  - `meta_quest_3/android/app/src/main/AndroidManifest.xml`: Capacitor 2D panel.

## 2. Quy tắc Bảo toàn & Sửa Code
- **Bảo toàn**: Không xóa Multiplayer, ESP32 Cam Trước/Lùi, UDP 4210, Radar Minimap, Gara 3 xe, NPC.
- **Ưu tiên bản vá nhỏ**: Additive/Modular patch, không viết lại file lớn hoặc nâng Three.js tùy tiện.
- **Single Render Pipeline**: Chỉ dùng `renderer.setAnimationLoop()` + `scene.onBeforeRender`; cấm `requestAnimationFrame` phụ.
- **Zero Per-Frame Allocation**: Không tạo `new THREE.Vector3/Matrix4/Euler` hay `CanvasTexture` trong render loop.
- **Chống TDZ**: Không gọi hàm khởi tạo/cache ở cuối file từ các hàm spawn ở đầu file.
- **Bảo toàn Scene Graph**: Khi set `light.target`, dùng `new THREE.Object3D()` riêng trong cùng container; cấm gán node thuộc group khác (`bayGroup.add(plinth)`).

## 3. Bảo Mật & Mạng
- **SSRF Guard**: Proxy `/api/esp32-proxy` và `/api/yt-stream-proxy` bắt buộc lọc DNS, scheme, port, chặn `127.0.0.1`, `::1`, `169.254.169.254`.
- **WebSocket/UDP Validation**: Ép kiểu, giới hạn `clampFinite`, dọn entity khi disconnect để chống nhân bản xe.

## 4. Verification Gate Bắt Buộc
- **Quy tắc**: Sau MỌI thay đổi mã nguồn, BẮT BUỘC chạy `node tools/xr-doctor.js` (`node --check` + `tools/test_runtime_load.js`). Phải đạt `[VERIFIED]` 100% Runtime Integrity trước khi báo hoàn thành hoặc yêu cầu user F5.

## 5. Vô lăng GOG R808, Bàn đạp & Cân bằng Tâm (Chuẩn V504)
- **Native Host Wheel Bridge**: Host đọc DirectInput qua `tools/gog808_native_bridge.exe` 50Hz, tự động phát WebSocket (8080/8443) & UDP 4210 khi start `server.js`.
- **Anti-Phantom Brake**: `findGog808Gamepad` chỉ nhận tên chứa `808|wheel|racing|steering|logitech|thrustmaster`. `readPedalAxis` bỏ qua frame 0, deadzone an toàn 0.08.
- **Auto Viewpoint Centering**: Tự động gọi `resetAndCenterViewpoint()` khi lên/xuống/đổi ghế/kết nối phòng. WebXR bù trừ `cameraRig.rotation.y = -headEuler.y` căn thẳng kính chắn gió (-Z).
- **Function Panel Live Sync**: WS `WHEEL_BRIDGE_STATE` cập nhật ngay `#pedal-gas-bar`, `#pedal-brake-bar`, `#pedal-reverse-bar`, `#wheel-steer-bar`, live monitor và xung ESP32. Default IP: `192.168.1.60`.
- **Anti-Echo Loop & Angle Lock**: Khi `isRemoteBridge === true`, Kính Quest đóng vai trò hiển thị VR, cấm gửi ngược `CAR_CONTROL`/`WHEEL_BRIDGE_INPUT`. `pollGamepadRacingWheel(dt)` return sớm nếu `isRemoteBridge`.
- **Smooth Expo Curve (1.6) & Slew Rate Limiter**:
  - Deadzone: `|d| <= 0.02` (1500µs).
  - Tiến: `1518 + Math.pow(normD, 1.6) * 332` lên 1850µs (5-10% ra 1519-1524µs cực êm).
  - Lùi: `1482µs` xuống `1100µs` (pow 1.35).
  - Slew Limiter: tối đa 45µs/frame (~1800µs/s) chống sốc dòng.
- **Unified UDP Arbitration**: Duy nhất qua `sendRateLimitedEsp32Udp` & `udpOutSocket`. Khi vô lăng host hoạt động (`lastPhysicalWheelActiveAt < 350ms`), khóa lệnh web/quest. ESP32 nhận 1 gói 4-byte `[steerDeg (45..135°), escPulseUs (1100..1850µs)]`.
- **Dual-Mode Arbitration**: Cắm USB GOG808 -> host lái (`WINMM_USB`). Rút USB -> server phát `connected: false`, Quest 3 (`META_QUEST`/`VR_CONTROLLER`) lái xe thật qua `sendRateLimitedEsp32Udp`. Cắm/rút không làm mất IP xe/cam.
- **Anti-Thrash Camera Lock**: `connectEsp32Windshield` & `connectRearEsp32Camera` kiểm tra `CONNECTING`/`OPEN` giữ nguyên kết nối; polling giãn cách >=1500ms khi mất kết nối, tự ngắt khi WS chính mở.
- **Wi-Fi Hotspot**: Phương án 1 (Hotspot điện thoại): SSID `BETEA` / pass `daihongbao`. Phương án 2 (Dự phòng): `Maximus` / `12345678`.

## 6. Quy Tắc Quản Trị Từng Node & Kỷ Luật Token (Node Governance & Token Discipline)
- **Node Chuyên Biệt**: Mọi tập tin phải nằm đúng node được chỉ định:
  - `www/`: Duy nhất chứa mã nguồn WebXR Client (`app.js`, `index.html`, `fpv-cam.html`, `models/`, `textures/`, `libs/`). CẤM nhân bản ra root.
  - `server/`: Duy nhất chứa Backend server (`server.js`, `package.json`, tests).
  - `config/`: Duy nhất chứa cấu hình nhạy cảm (`.env`, `wifi_credentials.h.example`). CẤM để lộ ở root.
  - `meta_quest_3/`: Duy nhất chứa hệ sinh thái Quest 3 / Android (`android/`, `apk/`, `scripts/`, `simulator/`, `tools/`). CẤM tạo node build riêng rẽ ở root.
  - `tools/`: Duy nhất chứa công cụ kiểm định và runtime (`xr-doctor.js`, `gog808 bridge`, certs). CẤM tạo file vá tạm thời (`apply_patch_*.js`, `patch_*.js`, `debug_*.txt`).
  - `firmware/`: Duy nhất chứa toàn bộ mã nguồn ESP32 (`esp32_car_controller`, `esp32cam`, `esp32_rear_cam`, `esp32_raw_rgb565`, `esp32car`). CẤM để thư mục `esp32_*` rời rạc ở root.
  - `models/`: Duy nhất chứa tệp nguồn Blender 3D `.blend`. CẤM lưu trữ `.glb` trùng lặp tại đây.
  - `blender_scripts/`: Duy nhất chứa script Python tự động hóa Blender asset pipeline.
  - `controller_godot/`: Duy nhất chứa trạm điều khiển FPV Godot Desktop.
  - `docs/`: Duy nhất chứa tài liệu kỹ thuật, kiến trúc, hướng dẫn và báo cáo kiểm định.
  - `backups/`: Chứa các bản sao lưu lịch sử, baseline và bản vá cũ. CẤM agent quét tự do gây hao token.
- **Chống Đọc Toàn Bộ (Zero Unbounded Ingestion)**: Khi truy vấn hoặc sửa lỗi, agent chỉ được nạp file liên quan trực tiếp. CẤM đọc toàn bộ codebase hoặc quét các thư mục cache (`node_modules/`, `android/.gradle/`, `backups/`) gây hao phí token.
- **Sửa Trực Tiếp (Canonical In-Place Patching)**: Mọi bản vá đã kiểm định phải được áp dụng trực tiếp vào Source of Truth, không tạo file script trung gian một lần rồi bỏ xó.

## 7. Bảo Toàn Tính Năng Thay Thế Camera ESP32 Bằng Điện Thoại (Phone FPV Camera Invariant)
- **Giao thức FPV Phone**: Server bắt buộc duy trì module `setupFpvPhoneAndDuckDnsManager` với giao thức `FPV_PHONE_PUBLISHER_INIT` và cơ chế Hot-swap điện thoại.
- **Giao diện Camera Di Động**: File `www/fpv-cam.html` là cổng thu phát camera trực tiếp từ trình duyệt điện thoại (iOS Safari/Android Chrome) qua cổng HTTPS 8443 (Let's Encrypt / DuckDNS / Self-signed).
- **Tự Động Chuyển Góc Cam Buồng Lái**: Khi xe vào số lùi (R) hoặc tiến (D), server và buồng lái tự động hoán đổi hình ảnh camera điện thoại giữa kính chắn gió trước và gương chiếu hậu mà không cần thao tác thủ công.
- **Dự phòng Không Cần ESP32**: Người dùng hoàn toàn có thể dùng 1-2 chiếc điện thoại kẹp lên xe làm camera FPV trước/sau thay thế 100% cho module ESP32-CAM.

