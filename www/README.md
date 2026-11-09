# Node Rules: `www/`

## 1. Mục Đích & Trách Nhiệm
Thư mục `www/` là **Source of Truth duy nhất cho mã nguồn WebXR Client**:
- `index.html`: Giao diện chính WebXR, 3D/2D switch, HUD tap-lo, Three.js import map.
- `app.js`: Toàn bộ logic Three.js scene, WebXR session, controller/hand tracking, vật lý, âm thanh, buồng lái và minimap.
- `fpv-cam.html`: Giao diện camera FPV dành cho điện thoại thay thế camera ESP32 (truyền stream qua WebSocket HTTPS/WSS).
- `youtube-dom-extractor.js`: Trình trích xuất và đồng bộ âm nhạc YouTube MP4 vào không gian buồng lái 3D.
- `libs/`: Thư viện Three.js và WebXR modules cục bộ.
- `models/`: Mô hình 3D định dạng GLB tối ưu cho WebXR (`rolls_royce_cabin.glb`, `calibration_gate.glb`, `graybox_city_block.glb`, `vertical_slice_city_block.glb`).
- `textures/`: Texture xe và môi trường (`wheel_car.png`).

## 2. Invariants & Phone Camera Support Rules
- 📱 **HỖ TRỢ CAMERA ĐIỆN THOẠI (BẢO TOÀN 100%)**: File `fpv-cam.html` là giao diện chuyên biệt cho phép mọi điện thoại (iPhone/Android) quét mã QR, truy cập qua HTTPS (:8443) và truyền camera trực tiếp thay thế camera xe thật hoặc camera lùi mà không cần phần cứng ESP32-CAM.
- ⛔ **CẤM NHÂN BẢN RA ROOT**: Mọi chỉnh sửa giao diện và WebXR phải thực hiện trực tiếp trong `www/`. Tuyệt đối không copy file `app.js`, `index.html` ra thư mục gốc.
- ⚡ **ZERO PER-FRAME ALLOCATION**: Không tạo `new THREE.*` hay `CanvasTexture` trong render loop `renderer.setAnimationLoop()`.
