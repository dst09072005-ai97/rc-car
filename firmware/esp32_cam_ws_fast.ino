#include "esp_camera.h"
#include <WiFi.h>
#include <esp_wifi.h>
#include <WebSocketsServer.h> // Cài thư viện "WebSockets" của Markus Sattler

// Chân cắm chuẩn mạch AI-Thinker ESP32-CAM
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

const char* ssid = "ESP32_VR_CAR";
const char* password = "12345678";

// Khởi chạy WebSocket Server đúng cổng 4213
WebSocketsServer webSocket = WebSocketsServer(4213);

void setupCameraHighFPS() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  // Tăng xung nhịp XCLK lên 24MHz để tăng tốc độ đọc cảm biến
  config.xclk_freq_hz = 24000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Cấu hình tối ưu cho độ trễ cực thấp (VGA 640x480 hoặc HVGA 480x320)
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 14;              // Nén tối ưu (12-15 giữ nét tốt và gói tin nhẹ ~12KB)
  config.fb_count = 2;                   // Dùng bộ đệm kép (Double Buffering)
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST; // Luôn lấy ảnh mới nhất, bỏ qua ảnh trễ

  esp_camera_init(&config);

  sensor_t * s = esp_camera_sensor_get();
  s->set_framesize(s, FRAMESIZE_VGA);
  s->set_quality(s, 14);
}

void setup() {
  Serial.begin(115200);
  setupCameraHighFPS();

  // Phát Wi-Fi Access Point hoặc kết nối mạng nội bộ 192.168.4.x
  WiFi.softAP(ssid, password, 6, 0, 4);
  // TẮT tiết kiệm năng lượng Wi-Fi để triệt tiêu độ trễ gói tin
  esp_wifi_set_ps(WIFI_PS_NONE);

  webSocket.begin();
}

void loop() {
  webSocket.loop();

  // Chỉ chụp và đẩy luồng khi có kính Meta Quest 3 đang kết nối
  if (webSocket.connectedClients() > 0) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (fb) {
      webSocket.broadcastBIN(fb->buf, fb->len);
      esp_camera_fb_return(fb);
    }
  }
}

