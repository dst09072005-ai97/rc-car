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
// 1. CẤU HÌNH THÔNG TIN WI-FI
// ============================================================================
const char* WIFI_SSID = "BETEA";
const char* WIFI_PASS = "daihongbao"; // <-- Điền mật khẩu Wi-Fi của bạn

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
  // 1. Vô hiệu hóa bộ ngắt sụt áp (Brownout) để mạch không bao giờ bị đơ/reset khi ăn dòng
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  setCpuFrequencyMhz(240);
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- [ESP32-CAM] KHỞI ĐỘNG CHUẨN ĐỊNH NÉT & ZERO TIMEOUT ---");

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

  // ĐẶT XUNG XCLK VỀ 10MHz (Tránh lỗi timing DMA làm đơ cảm biến)
  config.xclk_freq_hz = 10000000;

  // CHẾ ĐỘ NÉN JPEG
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QVGA;     // 320x240 chuẩn ổn định tuyệt đối
  config.jpeg_quality = 12;                 // Nén vừa đủ nét (~4KB)
  config.grab_mode    = CAMERA_GRAB_LATEST;

  // TỰ ĐỘNG NHẬN DIỆN CHIP PSRAM NGOÀI HOẶC DÙNG RAM NỘI BỘ (DRAM)
  if (psramFound()) {
    Serial.println("[RAM] Tìm thấy chip PSRAM ngoài -> Bật đệm kép (fb_count = 2) trong PSRAM!");
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.fb_count     = 2;
  } else {
    Serial.println("[RAM] CHÚ Ý: Chưa bật PSRAM trong Arduino IDE (Tools -> PSRAM: Enabled)");
    Serial.println("[RAM] -> Tự động dùng RAM trong (DRAM, fb_count = 1) để chạy ổn định tuyệt đối!");
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count     = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK && config.fb_location == CAMERA_FB_IN_PSRAM) {
    Serial.printf("[THỬ LẠI] PSRAM lỗi (0x%x), đang tự động chuyển sang dùng RAM trong DRAM...\n", err);
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count     = 1;
    err = esp_camera_init(&config);
  }

  if (err != ESP_OK) {
    Serial.printf("[LỖI] Khởi tạo camera thất bại: 0x%x\n", err);
    Serial.println("--> HÃY KIỂM TRA LẠI CÁP DẸT MẮT CAM CẮM ĐÃ CHẶT CHƯA!");
  } else {
    Serial.println("[OK] Cảm biến camera QVGA JPEG sẵn sàng (10MHz ổn định)!");
  }

  // Kết nối Wi-Fi với công suất cực đại 19.5dBm
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Đang kết nối tới ");
  Serial.println(WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(400);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Đã kết nối thành công!");
    Serial.print("[WiFi] IP CỦA ESP32 LÀ: ");
    Serial.println(WiFi.localIP());

    // Mở tên miền mDNS nội bộ
    if (MDNS.begin("esp32front")) {
      Serial.println("[mDNS] Tên miền nội bộ sẵn sàng: ws://esp32front.local:4213");
    }

    // Gửi ngay 1 gói tin UDP thông báo IP mới về Web Server
    udpAnnounce.beginPacket("255.255.255.255", 4210);
    udpAnnounce.printf("{\"type\":\"ESP32_CAM\",\"role\":\"front\",\"port\":4213,\"ip\":\"%s\"}", WiFi.localIP().toString().c_str());
    udpAnnounce.endPacket();
  } else {
    Serial.println("\n[WiFi] Không kết nối được router -> Mở SoftAP: ESP32_VR_CAM");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32_VR_CAM", "12345678");
    Serial.print("[WiFi] IP SoftAP: ");
    Serial.println(WiFi.softAPIP());
  }

  // TẮT TIẾT KIỆM NĂNG LƯỢNG WI-FI
  esp_wifi_set_ps(WIFI_PS_NONE);

  wsServer.begin();
  Serial.println("[WS] WebSocket Server đã mở tại cổng 4213");
}

void loop() {
  wsServer.loop();

  // Tự động kết nối lại Wi-Fi nếu mất sóng (giãn cách 3 giây, tránh nghẽn luồng)
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

  // Bắn frame đều đặn 25-30 FPS
  if (wsServer.connectedClients() > 0 && (now - lastSend >= 35)) {
    lastSend = now;
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) {
      wsServer.broadcastBIN(fb->buf, fb->len);
      esp_camera_fb_return(fb);
      frameCount++;
    } else {
      Serial.println("[CẢNH BÁO] esp_camera_fb_get() trả về NULL!");
    }
  }

  // Log trạng thái & Bắn gói tin UDP Broadcast báo IP mới về Web Server mỗi 3 giây
  if (now - lastLog >= 3000) {
    lastLog = now;
    if (wsServer.connectedClients() > 0) {
      Serial.printf("[STREAM JPEG] Đang truyền ảnh | FPS: %lu | Clients: %d\n", frameCount / 3, wsServer.connectedClients());
    } else {
      Serial.println("[CHỜ] Chưa có thiết bị kết nối vào WebSocket");
    }
    frameCount = 0;

    // Tự động phát gói tin UDP Broadcast báo IP mới về Web Server khi vừa đổi Wi-Fi
    if (WiFi.status() == WL_CONNECTED) {
      udpAnnounce.beginPacket("255.255.255.255", 4210);
      udpAnnounce.printf("{\"type\":\"ESP32_CAM\",\"role\":\"front\",\"port\":4213,\"ip\":\"%s\"}", WiFi.localIP().toString().c_str());
      udpAnnounce.endPacket();
    }
  }
}
