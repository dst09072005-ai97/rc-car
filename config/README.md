# Node Rules: `config/`

## 1. Mục Đích & Trách Nhiệm
Thư mục `config/` là **Node bảo vệ cấu hình nhạy cảm và credentials duy nhất** của dự án:
- `.env`: Chứa secrets (Vercel token, Supabase API keys, DuckDNS domain & token). File này được bảo vệ bởi `.gitignore` và bị server chặn truy cập HTTP 403.
- `.env.example`: File mẫu cấu hình an toàn cho developer.
- `wifi_credentials.h.example`: File mẫu cấu hình SSID/Password Wi-Fi cho ESP32.

## 2. Invariants & Security Rules
- 🔒 **BẢO MẬT TUYỆT ĐỐI**: Tuyệt đối không commit `.env` hoặc file chứa secret thật lên git công khai.
- 🚫 **KHÔNG ĐỂ LỘ Ở ROOT**: Cấm copy `.env` hay credentials ngược ra thư mục gốc.
- ⚡ **AUTO-LOAD**: `server/server.js` tự động tìm và nạp `config/.env` khi khởi động.
