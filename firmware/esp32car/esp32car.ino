#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESP32Servo.h>

// ==========================================
// 1. TẠO MẠNG AD-HOC TRỰC TIẾP (BỎ QUA ROUTER)
// ==========================================
const char* ap_ssid = "FPV_RC_CAR";
const char* ap_pass = "12345678";

WiFiUDP udp;
const unsigned int localPort = 4210; 
uint8_t packetBuffer[4]; 

// ==========================================
// 2. CẤU HÌNH CHÂN (PINOUT) CHO XE
// ==========================================
const int STEER_PIN = 12; // Chân Servo lái
const int ESC_PIN = 13;   // Chân ESC

Servo steeringServo;
Servo esc;

unsigned long lastPacketTime = 0;
const unsigned long TIMEOUT_MS = 500; 

int16_t lastSteer = -1;
int16_t lastThrottle = -1;
bool isFailsafe = false;

void setup() {
  Serial.begin(115200);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  
  steeringServo.setPeriodHertz(50); 
  esc.setPeriodHertz(50);

  steeringServo.attach(STEER_PIN, 500, 2500); 
  esc.attach(ESC_PIN, 1000, 2000);            

  esc.writeMicroseconds(1500);
  steeringServo.write(90);
  delay(2000); 

  // [KIẾN TRÚC MỚI] Mở chế độ AP (Access Point) thay vì STA
  Serial.println("\nKhoi tao mang Wi-Fi truc tiep: FPV_RC_CAR");
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ap_ssid, ap_pass);
  
  // Tăng cường công suất phát sóng để sóng khỏe hơn, xuyên tường tốt hơn
  WiFi.setTxPower(WIFI_POWER_19_5dBm);

  Serial.print("Mang da mo! IP de Dieu khien: ");
  Serial.println(WiFi.softAPIP()); // Mặc định luôn là 192.168.4.1

  udp.begin(localPort);
  Serial.printf("Dang lang nghe UDP Port %d\n", localPort);
}

void loop() {
  int packetSize = udp.parsePacket();
  
  if (packetSize == 4) { 
    udp.read(packetBuffer, 4);
    
    int16_t steerAngle = packetBuffer[0] | (packetBuffer[1] << 8);
    int16_t throttleUs = packetBuffer[2] | (packetBuffer[3] << 8);

    if (steerAngle != lastSteer) {
      steeringServo.write(steerAngle);
      lastSteer = steerAngle;
    }
    if (throttleUs != lastThrottle) {
      esc.writeMicroseconds(throttleUs);
      lastThrottle = throttleUs;
    }

    lastPacketTime = millis();
    isFailsafe = false;
  }

  // FAILSAFE
  if (!isFailsafe && (millis() - lastPacketTime > TIMEOUT_MS)) {
    esc.writeMicroseconds(1500); 
    steeringServo.write(90);     
    
    lastSteer = 90;
    lastThrottle = 1500;
    isFailsafe = true;
  }
}