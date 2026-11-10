# Hướng Dẫn Triển Khai Docker — XE RC FPV V10 WebXR & Relay Server

Tài liệu này cung cấp hướng dẫn trọn gói để đồng nghiệp triển khai và vận hành hệ thống máy chủ **XE RC FPV V10** trên môi trường Docker (Windows, macOS, Linux) với trải nghiệm đồng nhất 100% như trên máy phát triển gốc, đảm bảo các tiêu chuẩn bảo mật nghiêm ngặt.

---

## 1. Tổng Quan Kiến Trúc Đóng Gói (Container Architecture)

Container được xây dựng trên nền tảng **Node.js 20 LTS (Alpine)** tối giản hóa, tích hợp đầy đủ công cụ phục vụ luồng truyền thông đa giao thức:

- **Runtime & WebXR Server**: Node.js 20, Express 5, WebSocket (`ws`), Three.js serving.
- **Video & Media Pipeline**: `yt-dlp` + `ffmpeg` phục vụ trích xuất luồng YouTube / MP4 đồng bộ táp-lô buồng lái.
- **SSL Auto-Provisioning**: Tự động sinh chứng chỉ HTTPS tự ký (Self-Signed) chuẩn SAN (`localhost`, `*.duckdns.org`, LAN IP) khi khởi động nếu chưa có cert từ trước, giúp Meta Quest 3 và Safari iOS nhận diện ngay giao thức bảo mật bắt buộc của WebXR (`navigator.xr`) và Camera (`getUserMedia`).
- **PID 1 Init**: Sử dụng `tini` làm tiến trình init để quản lý vòng đời signal (`SIGTERM`, `SIGINT`) và dọn dẹp tiến trình con, chống hiện tượng zombie process.

---

## 2. Bảng Cổng Kết Nối & Giao Thức Mạng

| Cổng | Giao thức | Mục đích sử dụng | Thiết bị truy cập |
| :--- | :---: | :--- | :--- |
| **`8080`** | `TCP` | Web Dashboard, Mobile Passenger UI, WebSocket Relay | Trình duyệt PC, Chrome/Safari Mobile |
| **`8443`** | `TCP` | WebXR 360 Immersive, Mobile FPV Camera (Yêu cầu HTTPS) | Kính Meta Quest 3, Điện thoại FPV Cam |
| **`4210`** | `UDP` | Giao tiếp Telemetry 2 chiều, điều khiển vô lăng/ga xe RC | ESP32 Car, GOG808 Wheel Bridge, Godot |
| **`4213`** | `UDP` | Tiếp nhận gói tin video phân mảnh (MJPEG / RGB565) | ESP32-CAM (Cam trước & Cam lùi) |

---

## 3. Khởi Chạy Nhanh (1 Lệnh Duy Nhất)

### Bước 1: Yêu cầu môi trường
- Đã cài đặt [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) hoặc [Docker Engine + Docker Compose](https://docs.docker.com/engine/install/) (Linux).

### Bước 2: Khởi chạy Container
Di chuyển vào thư mục gốc của dự án và chạy:

```bash
# Cách 1: Sử dụng Docker Compose chuẩn
docker compose up -d --build

# Cách 2: Sử dụng script tiện ích
# Trên Windows:
scripts\run_docker.cmd

# Trên Linux / macOS:
bash scripts/run_docker.sh
```

### Bước 3: Xem trạng thái và logs
```bash
# Xem logs thời gian thực
docker compose logs -f

# Kiểm tra trạng thái container và healthcheck
docker compose ps

# Dừng hệ thống
docker compose down
```

---

## 4. Truy Cập & Kết Nối Thiết Bị

Sau khi container khởi động:

1. **Trên Kính Meta Quest 3**:
   - Mở **Meta Quest Browser**.
   - Truy cập: `https://<IP_MÁY_CHỦ>:8443/?vr=immersive` (hoặc `https://localhost:8443/?vr=immersive` nếu chạy qua Oculus Link / Simulator).
   - Nhấn nút **"BẮT ĐẦU WEBXR"** để bước vào buồng lái 6DoF 72Hz/90Hz.

2. **Dùng Điện Thoại Làm Camera FPV Trước/Sau Xe (Thay ESP32-CAM)**:
   - Dùng camera điện thoại quét mã QR hoặc truy cập: `https://<IP_MÁY_CHỦ>:8443/fpv-cam.html`.
   - Cấp quyền camera và chọn góc cam (Trước hoặc Lùi). Hình ảnh sẽ truyền trực tiếp lên kính chắn gió và gương chiếu hậu trong kính Quest 3.

3. **Màn Hình Điều Khiển Cho Hành Khách (Passenger Mobile)**:
   - Truy cập: `http://<IP_MÁY_CHỦ>:8080/?mode=passenger_mobile`.

---

## 5. Các Quy Tắc An Ninh & Bảo Mật Được Áp Dụng

1. **Chạy Với Quyền Không Đặc Quyền (Non-Root User)**:
   - Container chuyển đổi sang user `node` (UID: 1000, GID: 1000) ngay trước khi thực thi, tuân thủ nghiêm ngặt nguyên tắc least privilege, ngăn chặn leo thang đặc quyền container breakout.
2. **Loại Bỏ Bí Mật Khỏi Docker Build Context (`.dockerignore`)**:
   - Tệp `.env`, khóa riêng tư `*.pem`, `*.key`, mã nguồn `.blend`, cache Android `.gradle` và các chứng chỉ nhạy cảm hoàn toàn bị chặn khỏi Image Layer.
3. **Cơ Chế Bảo Vệ SSRF Guard**:
   - Hệ thống lọc DNS, IP private range (`127.0.0.1`, `::1`, `169.254.169.254`) và danh sách cổng nhạy cảm trong `server.js` vẫn được kích hoạt nguyên vẹn trong container.
4. **Không Đính Kèm Mật Khẩu Wi-Fi**:
   - Tệp mẫu `config/.env.example` và `config/wifi_credentials.h.example` được dùng làm template, không chứa thông tin thực tế.

---

## 6. Tùy Biến Cấu Hình (Tùy Chọn)

Nếu bạn muốn tùy chỉnh địa chỉ IP phần cứng ESP32 hoặc Token DuckDNS:

1. Sao chép mẫu cấu hình:
   ```bash
   cp config/.env.example config/.env
   ```
2. Chỉnh sửa các giá trị trong `config/.env`:
   - `DUCKDNS_DOMAIN`: Tên miền DuckDNS của bạn (VD: `my-rc-car`).
   - `DUCKDNS_TOKEN`: Token tài khoản DuckDNS.
   - `ESP32_FRONT_CAM_IP`: IP ESP32 camera trước.
   - `ESP32_CTRL_IP`: IP bo mạch điều khiển xe RC.
3. Khởi động lại container:
   ```bash
   docker compose up -d
   ```
