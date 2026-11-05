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
- **Triệt tiêu Echo Loop & Chống Nhảy Góc Lái Kính VR (Anti-Echo Loop & Angle Lock)**:
  - Khi Kính Quest 3 nhận tín hiệu Remote Bridge từ Laptop (`window._racingWheel.isRemoteBridge === true`), Kính đóng vai trò hiển thị buồng lái VR và **TUYỆT ĐỐI KHÔNG gửi ngược gói `CAR_CONTROL` hoặc `WHEEL_BRIDGE_INPUT` về server**.
  - Hàm `pollGamepadRacingWheel(dt)` trên kính bắt buộc kiểm tra `isRemoteBridge` và thoát sớm (`return`), tuyệt đối không để Touch Controller đè lên hoặc vô tình set `racingWheel.connected = false`.
- **Đường cong ga lũy tiến Smooth Expo Curve (1.6) & Slew Rate Limiter (Anti-Jerk Throttle)**:
  - Deadzone: `|d| <= 0.02` (1500µs).
  - Ga tiến: Ramping mượt mà từ `1518µs` (sát ngưỡng kích hoạt ESC 1515µs) theo lũy thừa `1518 + Math.pow(normD, 1.6) * 332` lên `1850µs`. Khi nhấn nhẹ 5-10%, xung ra chỉ `1519µs ~ 1524µs`, giúp xe bò từ từ cực êm, triệt tiêu hoàn toàn giật bắn.
  - Ga lùi: Ramping mượt mà từ `1482µs` xuống `1100µs` theo lũy thừa 1.35 (chuẩn lùi v504).
  - Bộ lọc Slew Rate Limiter tối đa 45µs/frame (~1800µs/giây) chống sốc dòng điện khi đạp thốc ga đột ngột.
- **Thống nhất Kênh UDP 4210 & Khóa Trọng tài Phần cứng (Unified UDP Arbitration)**:
  - Toàn bộ gói tin UDP 4210 gửi tới ESP32 Car Controller bắt buộc đi qua **duy nhất 1 hàm `sendRateLimitedEsp32Udp`** và 1 socket `udpOutSocket`.
  - Hàm `sendUdpCarCommand` ủy thác toàn bộ cho `sendRateLimitedEsp32Udp`.
  - Khi vô lăng host đang hoạt động (`rcArbitration.lastPhysicalWheelActiveAt` < 350ms), tự động khóa mọi lệnh điều khiển từ web/kính. ESP32 nhận đúng 1 gói tin 4-bytes chứa đồng thời `[steerDeg (45..135°), escPulseUs (1100..1850µs)]` trong cùng một frame, triệt tiêu 100% hiện tượng xung đột góc lái khiến xe chỉ chạy thẳng khi ga.
- **Chuyển quyền Lái 2 Chiều: Vô lăng Host GOG808 ↔ Tay Cầm Kính VR (Seamless Dual-Mode Arbitration)**:
  - Khi cắm USB GOG808 vào laptop: Vô lăng DirectInput chiếm quyền ưu tiên lái xe thật và xe ảo. Kính VR hiển thị buồng lái mượt mà, không gửi ngược tín hiệu để chống echo loop.
  - Khi rút USB GOG808 (hoặc server chưa nhận vô lăng): Server lập tức phát `WHEEL_BRIDGE_STATE` có `connected: false` và mở khóa trọng tài (`lastPhysicalWheelActiveAt = 0`). Kính VR nhận diện `isRemoteBridgeActive() === false`, lập tức cho phép Tay Cầm Kính VR (Touch Controller - Thumbstick X/Y, Cò Trigger) lái và tăng tốc cả xe ảo lẫn xe RC ngoài đời thật qua cổng UDP 4210.
  - Cắm/rút USB GOG808 tuyệt đối không làm mất kết nối hoặc reset IP mạch xe (`esp32CarConfig.ip`) và IP Camera.
- **Khóa chống hủy kết nối Camera ESP32 (Anti-Thrash Camera Connection Lock)**:
  - Hàm `connectEsp32Windshield(rawUrl)` và `connectRearEsp32Camera(rawUrl)` bắt buộc kiểm tra trạng thái socket: Nếu socket đang ở trạng thái `CONNECTING` hoặc `OPEN` với đúng URL đích, tuyệt đối không đóng socket và không tạo socket mới.
  - Hàm `applyEsp32CameraIps` chỉ kích hoạt kết nối khi chưa có socket, socket đã đóng hoặc IP camera thực sự thay đổi.
  - Polling dự phòng giãn cách tối thiểu 1500ms khi mất kết nối và tự động ngắt hoàn toàn khi WebSocket chính đã mở (`isConnected === true`), triệt tiêu 100% hiện tượng nhảy IP liên tục làm nghẽn mạng và rớt camera trên kính.
- **Xác thực Tay Cầm Kính VR & Mở Khóa Điều Khiển Xe Thật (Zero-Wheel VR Driver Rule)**:
  - Khi cắm USB GOG808 vào laptop: Vô lăng chiếm quyền lái phần cứng (`source: 'WINMM_USB'`).
  - Khi rút USB GOG808 (hoặc vô lăng host không hoạt động): `canControlHardware` lập tức mở quyền điều khiển cho Kính Meta Quest 3 (`deviceType === 'META_QUEST'` hoặc `source === 'VR_CONTROLLER'`). Server điều hướng trực tiếp lệnh lái và ga từ Touch Controller xuống ESP32 UDP 4210 qua `sendRateLimitedEsp32Udp(..., 'QUEST_CAR_CONTROL')`, giúp xe thật ngoài đời bẻ lái và tăng tốc 100% đồng bộ với buồng lái VR.
- **Quy tắc Kết nối Wi-Fi & Hotspot 4G (Zero-Flash Quick Connect Rule)**:
  - **Phương án 1 (Không cần nạp lại code - Khuyên dùng 100%)**: Trên điện thoại, đặt tên Điểm phát sóng cá nhân (Hotspot) là `BETEA` và mật khẩu là `daihongbao`. Cả 3 mạch ESP32 (Xe, Cam Trước, Cam Sau), Laptop và Kính VR sẽ tự động kết nối ngay trong 5 giây mà không cần cắm dây nạp code.
  - **Phương án 2 (Đa mạng Multi-SSID dự phòng)**: Mã nguồn đã tích hợp sẵn cơ chế tự động thử mạng chính `BETEA` và mạng dự phòng `Maximus` / `12345678`. Nếu có nạp lại code bằng Arduino IDE sau này, mạch tự nhận diện cả 2 mạng mà không lo bị kẹt.



