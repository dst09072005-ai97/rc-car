#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiUdp.h>

// --- KẾT NỐI VÀO MẠNG AD-HOC CỦA MẠCH ĐIỀU KHIỂN ---
const char* ssid = "FPV_RC_CAR";
const char* password = "12345678";

// Đặt IP tĩnh cho Camera là 192.168.4.101
// --- Đổi IP thành 102 và Port thành 4212 ---
IPAddress local_IP(192, 168, 4, 102); // <--- Sửa số 101 thành 102
IPAddress gateway(192, 168, 4, 1);
IPAddress subnet(255, 255, 255, 0);


WiFiUDP udp;
const int videoPort = 4212; 

// Biến lưu IP của máy PC (Godot) 
IPAddress godot_pc_ip;
bool is_godot_connected = false;

// Fragmentation cho gói tin UDP
uint8_t frame_id = 0;
const int MAX_UDP_PAYLOAD = 1400; // Giới hạn an toàn của MTU trên mạng Wi-Fi

// --- PINOUT CHO BOARD AI-THINKER ---
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
// ... Các Pinout giữ nguyên như cũ ...
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


void setup() {
  Serial.begin(115200);
  
  // Tối đa sức mạnh CPU để nén JPEG
  setCpuFrequencyMhz(240);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.config(local_IP, gateway, subnet);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nĐã vào mạng FPV_RC_CAR. IP Camera: " + WiFi.localIP().toString());

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
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_YUV422; 
  config.frame_size = FRAMESIZE_QQVGA; 
  config.jpeg_quality = 20;            
  config.fb_count = 1;                 

  esp_camera_init(&config);
  
  // Bật cổng UDP chờ Godot vẫy gọi
  udp.begin(videoPort);
}

void loop() {
  // Lắng nghe gói tin "Bắt tay" từ Godot để xác định IP của máy tính
  int packetSize = udp.parsePacket();
  if (packetSize > 0) {
    godot_pc_ip = udp.remoteIP();
    is_godot_connected = true;
    Serial.println("Godot Client kết nối từ IP: " + godot_pc_ip.toString());
    
    // Đổ sạch buffer rác nếu có
    while(udp.available()) udp.read();
  }

  // Nếu PC đã kết nối, bắt đầu bắn liên thanh khung hình UDP
  if (is_godot_connected) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) return;

    uint8_t * out_buf = NULL;
    size_t out_len = 0;
    
    bool jpeg_converted = frame2jpg(fb, 20, &out_buf, &out_len);
    esp_camera_fb_return(fb);

    if (jpeg_converted && out_len > 0) {
      // Tính toán số lượng mảnh vỡ cần cắt từ khung hình (Fragmentation)
      uint8_t total_chunks = (out_len + MAX_UDP_PAYLOAD - 1) / MAX_UDP_PAYLOAD;
      
      for (uint8_t i = 0; i < total_chunks; i++) {
        int offset = i * MAX_UDP_PAYLOAD;
        int len = MAX_UDP_PAYLOAD;
        if (offset + len > out_len) len = out_len - offset;

        // Bắn UDP Protocol Custom
        udp.beginPacket(godot_pc_ip, videoPort);
        udp.write(frame_id);         // Byte 0: ID khung hình
        udp.write(i);                // Byte 1: Thứ tự mảnh vỡ
        udp.write(total_chunks);     // Byte 2: Tổng số mảnh vỡ
        udp.write(out_buf + offset, len); // Payload dữ liệu
        udp.endPacket();
      }
      frame_id++;
      free(out_buf);
    }
  }
  
  // Tránh watchdog timeout
  vTaskDelay(1);
}
