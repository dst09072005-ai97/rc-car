# Node Rules: `server/`

## 1. Mục Đích & Trách Nhiệm
Thư mục `server/` là **Node Backend duy nhất** điều phối mạng và phần cứng:
- `server.js`: Express HTTP/HTTPS (:8080 / :8443), WebSocket Multiplayer, UDP Telemetry (:4210), Proxy SSRF Guard, và FPV Phone Manager.
- `package.json` & `package-lock.json`: Dependencies riêng cho server (express, ws, qrcode).
- `rc-bridge-adapter.js`: Adapter chuyển tiếp lệnh điều khiển xe.
- `tests/`: Contract test kiểm định backend (`test_contract.js`).

## 2. Invariants & Security Rules
- 🛡️ **SSRF GUARD BẮT BUỘC**: Mọi proxy (`/api/esp32-proxy`, `/api/yt-stream-proxy`) bắt buộc kiểm tra IP cấm và phân giải DNS chặt chẽ.
- 📱 **FPV PHONE & DUCKDNS MANAGER (BẢO TOÀN 100%)**: Server tự động duy trì giao thức `FPV_PHONE_PUBLISHER_INIT`, cơ chế Hot-swap điện thoại thông minh, và gán camera điện thoại vào buồng lái theo hộp số (Tiến $\rightarrow$ Kính chắn gió, Lùi $\rightarrow$ Gương chiếu hậu).
- 🔒 **SENSITIVE RESOURCE GUARD**: Chặn toàn bộ truy cập HTTP đến `.env`, `/config`, `.pem`, `.ino`, `.h`, `.log`.
