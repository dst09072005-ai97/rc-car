# Firmware Node — ESP32 Firmware Source of Truth

Node này chứa toàn bộ mã nguồn firmware nạp cho các vi điều khiển ESP32 trong dự án XE RC FPV V10.

## Cấu trúc Module
- `esp32_car_controller/`: Module điều khiển xe thật qua UDP port 4210 (nhận góc lái 45..135° và xung ESC 1100..1850µs).
- `esp32cam/`: Firmware cho ESP32-CAM trước (Windshield camera stream).
- `esp32_rear_cam/`: Firmware cho ESP32-CAM sau (Reverse camera stream).
- `esp32_raw_rgb565/`: Firmware tối ưu stream định dạng thô RGB565 độ trễ cực thấp.
- `esp32_cam_ws_fast.ino`: Bản phác thảo stream WebSocket siêu tốc cho ESP32.

## Quy tắc Node Governance & Bảo mật
1. **Không để lộ Wi-Fi**: Mọi file `wifi_credentials.h` phải được quản lý cục bộ hoặc nạp từ `config/`, tuyệt đối không commit mật khẩu thật lên Git.
2. **Không nhân bản ra root**: Toàn bộ firmware Arduino/ESP-IDF phải nằm trong thư mục này, không để các folder `esp32_*` rời rạc ở root dự án.
3. **Dự phòng Camera Điện Thoại (Invariant)**: Xe luôn hỗ trợ cơ chế thay thế ESP32-CAM bằng trình duyệt điện thoại qua `www/fpv-cam.html` và WebSocket relay.
