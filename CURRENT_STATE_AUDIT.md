# BÁO CÁO KIỂM TOÁN HIỆN TRẠNG TOÀN DIỆN DỰ ÁN (CURRENT STATE AUDIT)

**Thời điểm lập:** 18/10/2026 13:45 (UTC+7)  
**Đường dẫn gốc:** `D:\XE_RC_FPV_V10`  
**Mục đích:** Hợp nhất trạng thái kỹ thuật thực tế sau Milestone 2 và Milestone 2.1, đối chiếu với kiểm toán ban đầu, xóa bỏ hoàn toàn các mâu thuẫn "chưa phát hiện Blender/Godot/model".

---

## 1. BẢNG ĐỐI CHIẾU TIẾN TRÌNH TRẠNG THÁI (AUDIT BAN ĐẦU vs HIỆN TẠI)

| Hạng mục / Phân hệ | Trạng thái tại Kiểm toán Ban đầu (Initial Audit) | Trạng thái sau Milestone 2 & 2.1 (Current State) | Ghi chú chuyển tiếp kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Công cụ 3D DCC** | *Chưa phát hiện file .blend nội bộ* | **ĐÃ THIẾT LẬP VÀ VẬN HÀNH BLENDER 5.2 HEADLESS** | Tạo tự động các model chuẩn tỷ lệ qua script python `blender_scripts/generate_calibration_and_graybox.py`. |
| **Tài nguyên 3D Model** | *Chưa có file mô hình đô thị Graybox hoặc Gate* | **ĐÃ CÓ ĐẦY ĐỦ FILE NGUỒN VÀ XUẤT GLB ĐỒNG BỘ** | `models/calibration_gate.blend` (144 KB)<br>`models/graybox_city_block.blend` (155 KB)<br>`controller_godot/models/*.glb`<br>`www/models/*.glb` |
| **Runtime VR chính** | *Three.js WebXR chạy trong WebView Capacitor* | **ĐÃ THIẾT LẬP GODOT ENGINE 4.7.2 NATIVE OPENXR** | Godot Engine v4.7.2 chạy trực tiếp tại root, biên dịch native C++ / OpenXR cho Horizon OS. |
| **Đóng gói Android APK** | *Dùng Capacitor đóng gói webview (`build_apk.ps1`)* | **XUẤT THÀNH CÔNG NATIVE ANDROID GODOT APK** | `build/android/XE_RC_FPV_V18.apk` (86.5 MB)<br>`build/android/XE_RC_FPV_V18_mobile.apk` (90.3 MB)<br>Tích hợp đầy đủ 4 thư viện `arm64-v8a` OpenXR native. |
| **Hệ thống Vật lý** | *Chưa có collider vật lý thực thi* | **XÁC MINH 5/5 BÀI TEST VẬT LÝ TRÊN GODOT 4.7.2** | Kiểm chứng hành lang $2{,}0\,\text{m}$, va chạm tường, độ lọt đầu mái hiên, gờ vỉa hè $15\,\text{cm}$, và khe hở bàn ghế $0{,}70\,\text{m}$. |
| **Hệ thống FPV / RC Web** | *Node.js + WebSockets + ESP32-CAM + Three.js* | **BẢO TOÀN NGUYÊN VẸN 100% HOẠT ĐỘNG** | `server/server.js`, `www/app.js`, `www/index.html` giữ nguyên vẹn để tiếp tục làm buồng lái hoặc preview. |

---

## 2. BẢNG KÊ KHAI THỰC TẾ CÁC TÀI NGUYÊN VÀ ARTIFACT HIỆN HÀNH

Tất cả các file dưới đây đã được xác minh bằng lệnh đọc trực tiếp từ hệ thống tệp cục bộ:

| STT | Đường dẫn tương đối | Kích thước (Bytes) | Dấu thời gian sửa đổi cuối | Vai trò & Mục đích |
| :---: | :--- | :---: | :---: | :--- |
| 1 | `build/android/XE_RC_FPV_V18.apk` | 86,572,783 | 2026-10-18T06:18:53Z | **APK Baseline chuẩn (gl_compatibility, OpenXR, Signed)** |
| 2 | `build/android/XE_RC_FPV_V18_mobile.apk` | 90,316,399 | 2026-10-18T06:35:57Z | **APK Thử nghiệm (Vulkan Mobile renderer, OpenXR)** |
| 3 | `models/calibration_gate.blend` | 144,145 | 2026-10-18T06:11:26Z | File nguồn Blender dựng cổng kiểm chuẩn 1:1 mét |
| 4 | `models/graybox_city_block.blend` | 155,446 | 2026-10-18T06:11:31Z | File nguồn Blender dựng cụm phố Graybox 32m |
| 5 | `controller_godot/models/calibration_gate.glb` | 354,228 | 2026-10-18T06:11:31Z | Asset glTF 2.0 cổng kiểm chuẩn nạp vào Godot |
| 6 | `controller_godot/models/graybox_city_block.glb` | 386,060 | 2026-10-18T06:11:31Z | Asset glTF 2.0 phố đô thị nạp vào Godot |
| 7 | `www/models/calibration_gate.glb` | 354,228 | 2026-10-18T06:11:31Z | Asset glTF 2.0 đồng bộ cho Three.js WebXR Preview |
| 8 | `www/models/graybox_city_block.glb` | 386,060 | 2026-10-18T06:11:32Z | Asset glTF 2.0 đồng bộ cho Three.js WebXR Preview |
| 9 | `controller_godot/project.godot` | 1,094 | 2026-10-18T06:36:36Z | Cấu hình dự án Godot (Baseline gl_compatibility) |
| 10 | `controller_godot/project.godot.bak` | 1,052 | 2026-10-16T07:48:55Z | Bản sao lưu cấu hình dự án gốc trước sửa icon |
| 11 | `controller_godot/export_presets.cfg` | 11,779 | 2026-10-16T20:05:47Z | Preset xuất file Android Quest & Windows Desktop |
| 12 | `controller_godot/export_presets.cfg.bak` | 11,779 | 2026-10-16T20:05:47Z | Bản sao lưu preset gốc |
| 13 | `controller_godot/icon.png` | 1,197 | 2026-10-18T06:17:29Z | Icon ứng dụng Android $192 \times 192\,\text{px}$ chuẩn |
| 14 | `controller_godot/scenes/city_graybox_test.tscn` | 188 | 2026-10-18T06:19:21Z | Scene kiểm định vật lý Graybox trong Godot |
| 15 | `controller_godot/scripts/city_graybox_test.gd` | 8,184 | 2026-10-18T06:33:27Z | Script GDScript thực thi 5 bài test va chạm |
| 16 | `controller_godot/scripts/run_graybox_collision_test.gd`| 2,620 | 2026-10-18T06:20:47Z | Test harness tự động thoát khi kiểm thử xong |
| 17 | `blender_scripts/generate_calibration_and_graybox.py`| 19,735 | 2026-10-18T06:11:16Z | Script Python Blender 5.2 tái tạo toàn bộ model |
| 18 | `tools/audit_individual_meshes.js` | 3,572 | 2026-10-18T06:17:02Z | Công cụ Node.js audit AABB của từng mesh node |
| 19 | `server/server.js` | 19,566 | 2026-10-18T05:00:21Z | Node.js backend WebSockets, RC telemetry & YouTube |
| 20 | `www/app.js` | 500,750 | 2026-10-18T06:08:07Z | Mã nguồn frontend Three.js + FPV UI client |
| 21 | `www/index.html` | 31,852 | 2026-10-18T06:06:49Z | Giao diện HTML buồng lái FPV & cấu hình xe |

---

## 3. LÝ DO LƯU GIỮ CÁC TÀI NGUYÊN ĐẶC THÙ

1. **Giữ lại `build/android/XE_RC_FPV_V18_mobile.apk` (90.3 MB):**
   * Đây là bằng chứng thực tế cho thấy cấu hình Vulkan Mobile renderer của Godot 4.7.2 có khả năng biên dịch và đóng gói hoàn chỉnh với chữ ký v2 hợp lệ. Được lưu trữ riêng biệt để phục vụ việc so sánh hiệu năng trực tiếp ngay khi có kính Quest 3 thật mà không cần re-export.
2. **Giữ lại các file `.bak` (`project.godot.bak`, `export_presets.cfg.bak`):**
   * Bảo đảm nguyên tắc an toàn kỹ thuật (Rollback readiness), cho phép phục hồi trạng thái sơ khai của dự án bất cứ lúc nào nếu phát sinh lỗi cấu hình ngoài ý muốn.
3. **Giữ lại song song thư mục `www/models/`:**
   * Giúp nhánh Three.js WebXR trên trình duyệt PC / Meta Quest Browser luôn có thể load kiểm tra trực tiếp cụm mô hình mà không phụ thuộc vào việc phải cài APK qua cáp ADB.
