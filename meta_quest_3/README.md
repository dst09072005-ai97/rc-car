# Node Rules: `meta_quest_3/`

## 1. Mục Đích & Trách Nhiệm
Thư mục `meta_quest_3/` là **Node tập trung duy nhất cho toàn bộ hệ sinh thái kính Meta Quest 3 & Android**:
- `android/`: Mã nguồn dự án Android Studio Gradle Capacitor phục vụ biên dịch APK cho kính.
- `apk/`: Tập trung duy nhất toàn bộ 9 bản APK release (RollsRoyce, XE_RC_FPV_V18, VR_City...).
- `scripts/`: Chứa `build_apk.ps1` và `build_apk.sh` phục vụ build APK và đẩy thẳng qua ADB.
- `simulator/`: Gói mô phỏng Meta Quest 3.
- `tools/`: Trình điều khiển ADB USB Driver (`oculus-go-adb-driver-2.0`).
- `capacitor.config.json`: File cấu hình Capacitor cho Quest 3.

## 2. Invariants & Token Rules
- ⛔ **CẤM TẠO THƯ MỤC BUILD Ở ROOT**: Mọi file APK xuất ra bắt buộc nằm trong `meta_quest_3/apk/`.
- ⛔ **KHÔNG ĐỌC SÂU `android/.gradle/` hay `android/app/build/`**: Tiết kiệm token tối đa bằng cách bỏ qua các thư mục cache nhị phân khi truy vấn.
