#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESP32Servo.h> // Cài đặt qua Arduino IDE: Tools -> Manage Libraries -> tìm "ESP32Servo" của Kevin Harrington

// ============================================================================
// 1. CẤU HÌNH PHẦN CỨNG XE RC TIÊU CHUẨN (CHỈ DÙNG ĐÚNG 2 CHÂN TÍN HIỆU)
// ============================================================================
// SƠ ĐỒ ĐẤU NỐI CHUẨN XE RC CHUYÊN NGHIỆP:
//
// [1] SERVO LÁI (Rẽ Trái / Phải - Chuẩn 3 dây):
//     - Dây Cam / Trắng (Tín hiệu PWM) -> Chân GPIO 12 của ESP32
//     - Dây Đỏ (Nguồn dương 5V)        -> Chân 5V (hoặc VIN) của ESP32
//     - Dây Nâu / Đen (GND)            -> Chân GND của ESP32
//
// [2] ESC ĐIỀU TỐC ĐỘNG CƠ (Ga Tiến / Thắng / Lùi - Chuẩn 3 dây có BEC):
//     - Dây Trắng (Tín hiệu PWM)       -> Chân GPIO 13 của ESP32
//     - Dây Đỏ (Nguồn BEC 5V từ ESC)   -> Cấp ngược lại nuôi chân 5V/VIN của ESP32 (Không cần nguồn ngoài!)
//     - Dây Đen (GND chung)            -> Chân GND của ESP32
//
// LƯU Ý QUAN TRỌNG:
// - Nguồn Pin LiPo (2S 7.4V hoặc 3S 11.1V) cắm trực tiếp vào giắc pin của ESC.
// - BEC tích hợp sẵn trong ESC sẽ tự hạ áp xuống 5V để nuôi cả ESP32 và Servo.
// ============================================================================

const int PIN_SERVO = 12; // 1 chân duy nhất điều khiển Servo bẻ lái
const int PIN_ESC   = 13; // 1 chân duy nhất điều khiển ESC ga/thắng/lùi

Servo steerServo;
Servo throttleEsc;

// ============================================================================
// 2. CẤU HÌNH WI-FI & CỔNG UDP ĐIỀU KHIỂN
// ============================================================================
const char* WIFI_SSID = "BETEA";
const char* WIFI_PASS = "daihongbao"; // <-- Điền mật khẩu Wi-Fi của bạn vào đây

// Cổng UDP lắng nghe lệnh từ Web Simulator / WebXR (Mặc định: 4210)
const unsigned int LOCAL_UDP_PORT = 4210;
WiFiUDP udp;

// ============================================================================
// 3. THÔNG SỐ VẬN HÀNH & CƠ CHẾ DỪNG AN TOÀN (FAILSAFE)
// ============================================================================
unsigned long lastPacketTime = 0;
const unsigned long FAILSAFE_TIMEOUT_MS = 500; // Mất tín hiệu quá 0.5s -> Phanh dừng ga và trả thẳng lái
bool isFailsafeActive = false;

int16_t currentSteer = 90;      // Góc lái: 45° (Hết lái trái) - 90° (Thẳng) - 135° (Hết lái phải)
int16_t currentThrottle = 1500;  // Xung ga: 1000us (Lùi hết cỡ) - 1500us (Dừng) - 2000us (Tiến hết cỡ)

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=======================================================");
  Serial.println("  [ESP32 RC CAR] HỆ THỐNG ĐIỀU KHIỂN XE RC CHUẨN 2 CHÂN");
  Serial.println("  - Servo Lái: GPIO 12");
  Serial.println("  - ESC Ga:    GPIO 13");
  Serial.println("=======================================================");

  // 1. Phân bổ Timer PWM phần cứng trên ESP32
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);

  // 2. Gắn chân Servo lái (Tần số 50Hz, góc 45° - 135°)
  steerServo.setPeriodHertz(50);
  steerServo.attach(PIN_SERVO, 500, 2500);
  steerServo.write(90); // Trả thẳng bánh xe ngay khi bật nguồn

  // 3. Gắn chân ESC điều tốc động cơ (Tần số 50Hz, xung 1000us - 2000us)
  throttleEsc.setPeriodHertz(50);
  throttleEsc.attach(PIN_ESC, 1000, 2000);
  throttleEsc.writeMicroseconds(1500); // Đặt mức Neutral 1500us (Dừng ga)

  // 4. Quy trình Arming an toàn cho ESC:
  // Hầu hết các loại ESC RC (Hobbywing, Surpass, Tamiya...) cần nhận xung 1500us
  // trong khoảng 1.5 giây đầu để kêu tiếng bíp mở khóa ga an toàn (Arming).
  Serial.println("[ESC] Đang giữ mức Neutral 1500us để mở khóa (Arming) ESC...");
  delay(1500);
  Serial.println("[ESC] Đã mở khóa ESC thành công (Sẵn sàng chạy)!");

  // 5. Kết nối Wi-Fi (Thử mạng chính trong 4.5 giây, nếu không có sẽ tự phát SoftAP)
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Đang kết nối tới: ");
  Serial.println(WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(300);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ĐÃ KẾT NỐI WI-FI THÀNH CÔNG!");
    Serial.print("[WiFi] IP CỦA XE LÀ: ");
    Serial.println(WiFi.localIP());
    Serial.println("--> Nhập IP này vào giao diện Web để bắt đầu lái!");
  } else {
    // Không có mạng nhà -> Tự phát sóng Wi-Fi để điện thoại / kính Quest kết nối trực tiếp
    Serial.println("\n[WiFi] Không có Wi-Fi nhà -> Tự động phát SoftAP: FPV_RC_CAR");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("FPV_RC_CAR", "12345678");
    Serial.print("[WiFi] IP SoftAP của Xe: ");
    Serial.println(WiFi.softAPIP());
  }

  // Khởi động lắng nghe gói tin điều khiển UDP
  udp.begin(LOCAL_UDP_PORT);
  Serial.printf("[UDP] Đang lắng nghe tín hiệu điều khiển tại cổng: %d\n", LOCAL_UDP_PORT);
  Serial.println("=======================================================\n");
}

void loop() {
  // 1. Nhận gói tin điều khiển UDP từ Web Simulator / WebXR (Cổng 4210)
  int packetSize = udp.parsePacket();
  if (packetSize > 0) {
    uint8_t buffer[64];
    int len = udp.read(buffer, sizeof(buffer) - 1);
    buffer[len] = 0;

    int16_t steer = currentSteer;
    int16_t throttle = currentThrottle;
    bool hasValidData = false;

    // Định dạng A: Gói tin nhị phân tốc độ cao 4 bytes [int16_t steer, int16_t throttle]
    if (len >= 4 && buffer[0] != '{') {
      steer = (int16_t)(buffer[0] | (buffer[1] << 8));
      throttle = (int16_t)(buffer[2] | (buffer[3] << 8));
      hasValidData = true;
    }
    // Định dạng B: Gói tin JSON {"steer":90,"throttle":1500}
    else if (buffer[0] == '{') {
      int sVal = 90, tVal = 1500;
      if (sscanf((char*)buffer, "{\"steer\":%d,\"throttle\":%d}", &sVal, &tVal) >= 1) {
        steer = sVal;
        throttle = tVal;
        hasValidData = true;
      }
    }

    if (hasValidData) {
      // Giới hạn biên an toàn:
      // Góc lái Servo: 45° (Hết lái trái) -> 90° (Thẳng) -> 135° (Hết lái phải)
      steer = constrain(steer, 45, 135);

      // Xung ga ESC: 1000us (Lùi hết ga) -> 1500us (Dừng) -> 2000us (Tiến hết ga)
      throttle = constrain(throttle, 1000, 2000);

      // Xuất xung trực tiếp ra Servo lái
      if (steer != currentSteer) {
        steerServo.write(steer);
        currentSteer = steer;
      }

      // Xuất xung trực tiếp ra ESC động cơ
      if (throttle != currentThrottle) {
        throttleEsc.writeMicroseconds(throttle);
        currentThrottle = throttle;
      }

      lastPacketTime = millis();
      isFailsafeActive = false;
    }
  }

  // 2. CƠ CHẾ DỪNG AN TOÀN (FAILSAFE):
  // Nếu mất sóng Wi-Fi hoặc Web tắt quá 0.5s -> Xe lập tức dừng ga và trả thẳng lái!
  if (!isFailsafeActive && (millis() - lastPacketTime > FAILSAFE_TIMEOUT_MS)) {
    throttleEsc.writeMicroseconds(1500); // Ngắt ga về Neutral (Dừng hẳn)
    steerServo.write(90);                // Trả thẳng góc lái
    currentThrottle = 1500;
    currentSteer = 90;
    isFailsafeActive = true;
  }

  // 3. Báo cáo trạng thái vận hành ra Serial Monitor mỗi 2 giây
  static unsigned long lastLogTime = 0;
  if (millis() - lastLogTime >= 2000) {
    lastLogTime = millis();
    if (isFailsafeActive) {
      Serial.println("[FAILSAFE] Đang chờ lệnh từ Web... (Xe đang dừng an toàn)");
    } else {
      const char* dir = (currentThrottle > 1520) ? "TIẾN" : ((currentThrottle < 1480) ? "LÙI" : "DỪNG");
      Serial.printf("[LÁI XE] Lái: %3d° | Ga ESC: %4dus | Trạng thái: [%s]\n",
                    currentSteer, currentThrottle, dir);
    }
  }
}
