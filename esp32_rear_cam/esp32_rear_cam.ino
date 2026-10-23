#include "esp_camera.h"
#include <WiFi.h>
#include <esp_wifi.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

WiFiUDP udpAnnounce;

// ============================================================================
// 1. CẤU HÌNH WI-FI CHO ESP32 CAM LÙI (CAM SAU)
// ============================================================================
#if __has_include("wifi_credentials.h")
#include "wifi_credentials.h"
#else
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD"; // <-- Điền thông tin Wi-Fi của bạn vào đây (hoặc tạo file wifi_credentials.h)
#endif

// ============================================================================
// 2. CHÂN CẮM CHUẨN MẠCH AI-THINKER ESP32-CAM
// ============================================================================
#define PIN_PWDN     32
#define PIN_RESET    -1
#define PIN_XCLK      0
#define PIN_SIOD     26
#define PIN_SIOC     27
#define PIN_D7       35
#define PIN_D6       34
#define PIN_D5       39
#define PIN_D4       36
#define PIN_D3       21
#define PIN_D2       19
#define PIN_D1       18
#define PIN_D0        5
#define PIN_VSYNC    25
#define PIN_HREF     23
#define PIN_PCLK     22

WebSocketsServer wsServer(4213);

void setup() {
  // 1. Tắt bộ ngắt sụt áp Brownout
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  setCpuFrequencyMhz(240);
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=======================================================");
  Serial.println("  [ESP32 CAM LÙI] KHỞI ĐỘNG CHẾ ĐỘ SIÊU MƯỢT (30 FPS)");
  Serial.println("=======================================================");

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = PIN_D0;
  config.pin_d1       = PIN_D1;
  config.pin_d2       = PIN_D2;
  config.pin_d3       = PIN_D3;
  config.pin_d4       = PIN_D4;
  config.pin_d5       = PIN_D5;
  config.pin_d6       = PIN_D6;
  config.pin_d7       = PIN_D7;
  config.pin_xclk     = PIN_XCLK;
  config.pin_pclk     = PIN_PCLK;
  config.pin_vsync    = PIN_VSYNC;
  config.pin_href     = PIN_HREF;
  config.pin_sccb_sda = PIN_SIOD;
  config.pin_sccb_scl = PIN_SIOC;
  config.pin_pwdn     = PIN_PWDN;
  config.pin_reset    = PIN_RESET;

  // Xung nhịp chuẩn 10MHz - Chuẩn ổn định nhất, chống giật/đơ cảm biến OV2640 và chống sụt áp
  config.xclk_freq_hz = 10000000;

  // Chế độ nén JPEG phần cứng trực tiếp trên cảm biến
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QVGA; // 320x240 chuẩn nhẹ và nét (~2.5KB)
  config.jpeg_quality = 14;             // Nén tối ưu nhẹ mạng, chống nghẽn kênh Wi-Fi khi bật 2 cam cùng lúc

  // LUÔN LẤY KHUNG HÌNH MỚI NHẤT (CAMERA_GRAB_LATEST): TUYỆT ĐỐI KHÔNG BỊ TIMEOUT HOẶC NGHẼN BỘ ĐỆM
  config.grab_mode = CAMERA_GRAB_LATEST;

  // TỰ ĐỘNG NHẬN DIỆN CHIP PSRAM NGOÀI
  if (psramFound()) {
    Serial.println("[RAM] Tìm thấy chip PSRAM ngoài -> Bật đệm kép (fb_count = 2) trong PSRAM!");
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.fb_count     = 2;
  } else {
    Serial.println("[RAM] CHÚ Ý: Mạch chưa bật PSRAM (hoặc không có PSRAM)");
    Serial.println("[RAM] -> Tự động chuyển sang dùng RAM trong (DRAM) để đạt 25-30 FPS!");
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count     = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK && config.fb_location == CAMERA_FB_IN_PSRAM) {
    Serial.printf("[THỬ LẠI] PSRAM lỗi (0x%x), đang chuyển sang dùng RAM trong DRAM...\n", err);
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count     = 1;
    err = esp_camera_init(&config);
  }

  if (err != ESP_OK) {
    Serial.printf("[LỖI] Khởi tạo camera thất bại: 0x%x\n", err);
    Serial.println("--> HÃY KIỂM TRA LẠI CÁP DẸT MẮT CAM CẮM ĐÃ CHẶT CHƯA!");
  } else {
    Serial.println("[OK] Cảm biến camera lùi sẵn sàng!");
  }

  // Kết nối Wi-Fi với công suất phát cực đại 19.5dBm
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Cam lùi đang kết nối tới ");
  Serial.println(WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(300);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ĐÃ KẾT NỐI WI-FI THÀNH CÔNG!");
    Serial.print("[WiFi] IP CỦA CAM LÙI LÀ: ");
    Serial.println(WiFi.localIP());

    // Mở tên miền mDNS nội bộ
    if (MDNS.begin("esp32rear")) {
      Serial.println("[mDNS] Tên miền nội bộ Cam Lùi: ws://esp32rear.local:4213");
    }

    // Gửi ngay 1 gói tin UDP thông báo IP mới về Web Server
    udpAnnounce.beginPacket("255.255.255.255", 4210);
    udpAnnounce.printf("{\"type\":\"ESP32_CAM\",\"role\":\"rear\",\"port\":4213,\"ip\":\"%s\"}", WiFi.localIP().toString().c_str());
    udpAnnounce.endPacket();
  } else {
    Serial.println("\n[WiFi] Không kết nối được Wi-Fi -> Bật SoftAP: ESP32_REAR_CAM");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32_REAR_CAM", "12345678");
    Serial.print("[WiFi] IP SoftAP: ");
    Serial.println(WiFi.softAPIP());
  }

  // Tắt tiết kiệm điện Wi-Fi để đạt độ trễ < 5ms
  esp_wifi_set_ps(WIFI_PS_NONE);

  wsServer.begin();
  Serial.println("[WS] WebSocket Cam Lùi đã mở tại cổng 4213");
  Serial.println("=======================================================\n");
}

void loop() {
  wsServer.loop();

  // Tự động kết nối lại nếu rớt Wi-Fi (giãn cách 3 giây, tránh nghẽn luồng)
  if (WiFi.getMode() == WIFI_STA && WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiReconnect = 0;
    if (millis() - lastWifiReconnect > 3000) {
      lastWifiReconnect = millis();
      WiFi.reconnect();
    }
    return;
  }

  static unsigned long lastSend = 0;
  static unsigned long frameCount = 0;
  static unsigned long lastLog = 0;
  unsigned long now = millis();

  // Bắn frame ảnh đều đặn 15 FPS (khoảng cách 66ms) - Đảm bảo gương hậu mượt mà không chiếm băng thông của cam trước
  if (wsServer.connectedClients() > 0 && (now - lastSend >= 66)) {
    lastSend = now;

    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) {
      wsServer.broadcastBIN(fb->buf, fb->len);
      esp_camera_fb_return(fb);
      frameCount++;
    } else {
      Serial.println("[CẢNH BÁO] esp_camera_fb_get() trả về NULL (Lỗi đọc cảm biến)!");
    }
  }

  // Báo cáo FPS thực tế & Phát gói tin UDP Broadcast báo IP mới mỗi 3 giây
  if (now - lastLog >= 3000) {
    lastLog = now;
    if (wsServer.connectedClients() > 0) {
      Serial.printf("[STREAM CAM LÙI] Đang truyền ảnh | FPS: %lu | Clients: %d\n", frameCount / 3, wsServer.connectedClients());
    } else {
      Serial.println("[CHỜ CAM LÙI] Chưa có thiết bị kết nối vào WebSocket");
    }
    frameCount = 0;

    // Tự động phát gói tin UDP Broadcast báo IP mới về Web Server khi vừa đổi Wi-Fi
    if (WiFi.status() == WL_CONNECTED) {
      udpAnnounce.beginPacket("255.255.255.255", 4210);
      udpAnnounce.printf("{\"type\":\"ESP32_CAM\",\"role\":\"rear\",\"port\":4213,\"ip\":\"%s\"}", WiFi.localIP().toString().c_str());
      udpAnnounce.endPacket();
    }
  }
}
