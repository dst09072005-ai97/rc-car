#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESP32Servo.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h" // Cài đặt trong Arduino IDE: Tools -> Manage Libraries -> tìm "ESP32Servo" của Kevin Harrington

// ============================================================================
// 1. CẤU HÌNH WI-FI CHO MẠCH ĐIỀU KHIỂN XE RC (CÙNG MẠNG VỚI MÁY TÍNH WEB)
// ============================================================================
#if __has_include("wifi_credentials.h")
#include "wifi_credentials.h"
#else
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD"; // <-- Điền thông tin Wi-Fi của bạn vào đây (hoặc tạo file wifi_credentials.h)
#endif

// Cổng UDP nhận lệnh điều khiển lái & ga từ Web Simulator (Mặc định 4210)
const unsigned int LOCAL_UDP_PORT = 4210;
WiFiUDP udp;

// ============================================================================
// 2. CHỌN LOẠI PHẦN CỨNG XE RC CỦA BẠN:
//    - Đặt = 0 nếu dùng XE RC CHUẨN (Servo lái + ESC điều tốc động cơ) [KHUYÊN DÙNG]
//    - Đặt = 1 nếu dùng XE DIY DRIVER L298N / TB6612 (Servo lái + Động cơ DC IN1/IN2)
// ============================================================================
#define USE_L298N_MOTOR_DRIVER 0

// Chân điều khiển Servo bẻ lái (Trái / Phải)
const int PIN_SERVO_STEER = 12;

#if USE_L298N_MOTOR_DRIVER == 0
  // CẤU HÌNH A: RC ESC (Bộ điều tốc chuẩn RC 3 dây: Trắng-Đỏ-Đen)
  const int PIN_ESC_THROTTLE = 13; // Chân xung PWM điều khiển ESC
  Servo escThrottle;
#else
  // CẤU HÌNH B: Mạch cầu H L298N / TB6612
  const int PIN_MOTOR_PWM = 13; // Chân ENA (Tốc độ)
  const int PIN_MOTOR_IN1 = 14; // Chân IN1 (Chiều quay)
  const int PIN_MOTOR_IN2 = 27; // Chân IN2 (Chiều quay)
#endif

Servo steeringServo;

// ============================================================================
// 3. THÔNG SỐ VẬN HÀNH & CƠ CHẾ DỪNG AN TOÀN (FAILSAFE)
// ============================================================================
unsigned long lastPacketTime = 0;
const unsigned long FAILSAFE_TIMEOUT_MS = 500; // Mất tín hiệu quá 0.5s -> Tự động phanh dừng hẳn
bool isFailsafeActive = false;

int16_t currentSteer = 90;     // Góc lái: 45° (Hết lái trái) - 90° (Thẳng) - 135° (Hết lái phải)
int16_t currentThrottle = 1500; // Xung ga: 1000us (Lùi hết ga) - 1500us (Dừng) - 2000us (Tiến hết ga)

void applyMotorThrottle(int16_t throttle) {
#if USE_L298N_MOTOR_DRIVER == 0
  // Xuất xung PWM 50Hz chuẩn ESC (1000us - 1500us - 2000us)
  escThrottle.writeMicroseconds(throttle);
#else
  // Điều khiển L298N: 1500us là dừng, >1520us là tiến, <1480us là lùi
  if (throttle > 1520) {
    int pwm = map(throttle, 1520, 2000, 50, 255);
    digitalWrite(PIN_MOTOR_IN1, HIGH);
    digitalWrite(PIN_MOTOR_IN2, LOW);
    analogWrite(PIN_MOTOR_PWM, pwm);
  } else if (throttle < 1480) {
    int pwm = map(throttle, 1480, 1000, 50, 255);
    digitalWrite(PIN_MOTOR_IN1, LOW);
    digitalWrite(PIN_MOTOR_IN2, HIGH);
    analogWrite(PIN_MOTOR_PWM, pwm);
  } else {
    // Phanh dừng
    digitalWrite(PIN_MOTOR_IN1, LOW);
    digitalWrite(PIN_MOTOR_IN2, LOW);
    analogWrite(PIN_MOTOR_PWM, 0);
  }
#endif
}

void setup() {
  // Tắt bộ ngắt sụt áp Brownout để mạch không bị reset khi servo/motor kéo dòng từ pin
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=======================================================");
  Serial.println("  [ESP32 XE RC DIGITAL TWIN] HỆ THỐNG ĐIỀU KHIỂN XE");
  Serial.println("=======================================================");

  // Khởi tạo bộ đếm PWM ESP32
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  steeringServo.setPeriodHertz(50);
  steeringServo.attach(PIN_SERVO_STEER, 500, 2500);
  steeringServo.write(90); // Trả thẳng lái (90 độ)

#if USE_L298N_MOTOR_DRIVER == 0
  escThrottle.setPeriodHertz(50);
  escThrottle.attach(PIN_ESC_THROTTLE, 1000, 2000);
  escThrottle.writeMicroseconds(1500); // Mức trung tính (dừng ga)
  Serial.println("[PHẦN CỨNG] Đã khởi tạo: Servo Lái (GPIO 12) + ESC Động Cơ (GPIO 13)");
#else
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  pinMode(PIN_MOTOR_PWM, OUTPUT);
  applyMotorThrottle(1500);
  Serial.println("[PHẦN CỨNG] Đã khởi tạo: Servo Lái (GPIO 12) + L298N (IN1=14, IN2=27, PWM=13)");
#endif

  // Kết nối Wi-Fi cùng mạng BETEA
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Đang kết nối tới mạng: ");
  Serial.println(WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(300);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] KẾT NỐI WI-FI THÀNH CÔNG!");
    Serial.print("[WiFi] IP CỦA XE LÀ: ");
    Serial.println(WiFi.localIP());
    Serial.println("--> HÃY NHẬP IP NÀY VÀO Ô 'IP MẠCH LÁI XE' TRÊN TRÌNH DUYỆT ĐỂ NỐI XE!");
  } else {
    Serial.println("\n[WiFi] Không kết nối được Wi-Fi chính -> Bật Wi-Fi phát trực tiếp (AP) FPV_RC_CAR");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("FPV_RC_CAR", "12345678");
    Serial.print("[WiFi] IP AP của Xe: ");
    Serial.println(WiFi.softAPIP());
  }

  // Khởi động cổng nhận UDP từ Server Node.js
  udp.begin(LOCAL_UDP_PORT);
  Serial.printf("[UDP] Đang lắng nghe tín hiệu lái xe tại cổng: %d\n", LOCAL_UDP_PORT);

  // Gửi gói tin thông báo tự động (Beacon) tới Server Node.js qua UDP Broadcast
  IPAddress initIp = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP() : WiFi.softAPIP();
  udp.beginPacket("255.255.255.255", LOCAL_UDP_PORT);
  String initBeacon = "{\"type\":\"ESP32_CAR\",\"role\":\"car\",\"port\":4210,\"ip\":\"" + initIp.toString() + "\"}";
  udp.write((const uint8_t*)initBeacon.c_str(), initBeacon.length());
  udp.endPacket();

  Serial.println("=======================================================\n");
}

void loop() {
  // 1. Nhận gói tin UDP điều khiển từ Web Simulator (Cổng 4210)
  int packetSize = udp.parsePacket();
  if (packetSize > 0) {
    uint8_t buffer[64];
    int len = udp.read(buffer, sizeof(buffer) - 1);
    buffer[len] = 0;

    // A. Gói tin nhị phân tốc độ cao 4 bytes: [Góc lái int16_t, Xung ga int16_t]
    if (len >= 4) {
      int16_t steer = buffer[0] | (buffer[1] << 8);
      int16_t throttle = buffer[2] | (buffer[3] << 8);

      steer = constrain(steer, 45, 135);        // 45° (trái) -> 90° (thẳng) -> 135° (phải)
      throttle = constrain(throttle, 1300, 1700); // Cân chỉnh an toàn: 1300us (lùi vừa) -> 1500us (dừng) -> 1700us (tiến vừa)

      if (steer != currentSteer) {
        steeringServo.write(steer);
        currentSteer = steer;
      }
      if (throttle != currentThrottle) {
        applyMotorThrottle(throttle);
        currentThrottle = throttle;
      }

      lastPacketTime = millis();
      isFailsafeActive = false;
    }
    // B. Dự phòng gói tin JSON nếu có công cụ khác gửi qua UDP
    else if (buffer[0] == '{') {
      char* str = (char*)buffer;
      int sVal = 90, tVal = 1500;
      if (sscanf(str, "{\"steer\":%d,\"throttle\":%d}", &sVal, &tVal) == 2) {
        sVal = constrain(sVal, 45, 135);
        tVal = constrain(tVal, 1300, 1700);
        steeringServo.write(sVal);
        applyMotorThrottle(tVal);
        currentSteer = sVal;
        currentThrottle = tVal;
        lastPacketTime = millis();
        isFailsafeActive = false;
      }
    }
  }

  // 2. TỰ ĐỘNG DỪNG AN TOÀN (FAILSAFE):
  // Nếu Web đóng, ngắt kết nối hoặc mạng lag quá 0.5s -> Xe lập tức dừng ga và trả thẳng lái!
  if (!isFailsafeActive && (millis() - lastPacketTime > FAILSAFE_TIMEOUT_MS)) {
    applyMotorThrottle(1500); // Tự động ngắt ga về 0 (Neutral)
    steeringServo.write(90);  // Trả thẳng góc lái
    currentSteer = 90;
    currentThrottle = 1500;
    isFailsafeActive = true;
  }

  // 3. In trạng thái lên Serial Monitor mỗi 2 giây
  static unsigned long lastLog = 0;
  if (millis() - lastLog >= 2000) {
    lastLog = millis();
    if (isFailsafeActive) {
      Serial.println("[CHỜ LỆNH] Chưa có tín hiệu lái từ Web (Đang giữ an toàn: Dừng xe)");
    } else {
      Serial.printf("[ĐANG LÁI] Lái: %d° | Xung ga: %dus -> [%s]\n",
                    currentSteer, currentThrottle,
                    currentThrottle > 1520 ? "TIẾN" : (currentThrottle < 1480 ? "LÙI" : "DỪNG"));
    }
  }

  // 4. Phát beacon tự động mỗi 2.5 giây để Server/Trình duyệt luôn tự động nhận diện được IP xe
  static unsigned long lastBeaconTime = 0;
  if (millis() - lastBeaconTime >= 2500) {
    lastBeaconTime = millis();
    IPAddress currentIp = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP() : WiFi.softAPIP();
    udp.beginPacket("255.255.255.255", LOCAL_UDP_PORT);
    String beacon = "{\"type\":\"ESP32_CAR\",\"role\":\"car\",\"port\":4210,\"ip\":\"" + currentIp.toString() + "\",\"steer\":" + String(currentSteer) + ",\"throttle\":" + String(currentThrottle) + "}";
    udp.write((const uint8_t*)beacon.c_str(), beacon.length());
    udp.endPacket();
  }
}
