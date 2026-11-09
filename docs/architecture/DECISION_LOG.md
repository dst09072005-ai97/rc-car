# NHẬT KÝ QUYẾT ĐỊNH KỸ THUẬT (ENGINEERING DECISION LOG)

**Dự án:** Autonomous VR City Simulator & Living Urban Twin  
**Cập nhật:** Hậu Milestone 2.1 Consolidation Gate  
**Nguyên tắc:** Ghi nhận minh bạch mọi quyết định, phương án lựa chọn, lý do, bằng chứng thực nghiệm và rủi ro tồn đọng.

---

## DANH MỤC CÁC QUYẾT ĐỊNH KỸ THUẬT LÕI (ARCHITECTURE DECISION RECORDS - ADR)

### ADR-01: Lựa chọn Phong cách Nghệ thuật
* **Phương án lựa chọn:** **Option B — Stylized Realistic (Hiện thực Cách điệu hóa)**.
* **Các phương án loại bỏ:** Option A (Low-poly Hoạt hình đơn giản), Option C (Photorealism siêu thực gắt gao).
* **Lý do lựa chọn:** Giữ tỷ lệ thực 1:1 theo mét và tính vật lý PBR trung thực giúp tạo độ nhập vai cao nhất trên kính VR, đồng thời lược bỏ các chi tiết vụn vặt không cần thiết để tối ưu hóa triệt để hiệu năng Snapdragon XR2 Gen 2.
* **Trạng thái:** **APPROVED BY USER**.

---

### ADR-02: Định vị Trải nghiệm Người Chơi MVP
* **Phương án lựa chọn:** **Option 1 — First-person Pedestrian Locomotion (Đi bộ tự do góc nhìn thứ nhất)**.
* **Các phương án loại bỏ:** Bắt đầu ngay với hệ thống lên/xuống xe hơi hoặc lái xe buýt phức tạp.
* **Lý do lựa chọn:** Giúp tập trung hoàn thiện cảm giác không gian đô thị, kiểm soát hiện tượng say sóng VR, xác thực hệ thống va chạm vỉa hè và đảm bảo quy mô phát triển không bị quá tải. Tính năng lái xe được đưa vào lộ trình mở rộng sau MVP.
* **Trạng thái:** **APPROVED BY USER**.

---

### ADR-03: Lựa chọn Runtime Chính cho Meta Quest 3 APK
* **Phương án lựa chọn:** **Godot Engine 4.7.2 Native OpenXR APK**.
* **Các phương án phụ trợ:** Three.js WebXR trong Meta Quest Browser / PC (duy trì làm công cụ xem nhanh độc lập).
* **Lý do lựa chọn:** Godot biên dịch mã máy C++ native chạy trực tiếp trên Android OS (`arm64-v8a`), gọi trực tiếp vào OpenXR loader của Khronos, tận dụng foveated rendering cấp phần cứng và mang lại hiệu năng cao hơn đáng kể so với việc chạy qua lớp bọc WebView của trình duyệt.
* **Bằng chứng thực nghiệm:** Đã đóng gói thành công `XE_RC_FPV_V18.apk` (86.5 MB) với chữ ký số hợp lệ và tích hợp đủ 4 thư viện native OpenXR.
* **Trạng thái:** **VERIFIED (PASS)**.

---

### ADR-04: Cấu hình Đồ họa Renderer Baseline
* **Phương án lựa chọn:** **`gl_compatibility` (OpenGL ES 3.0) làm Baseline**, thử nghiệm song song **`mobile` (Vulkan Mobile)**.
* **Lý do lựa chọn:** `gl_compatibility` khởi động nhanh, ít lỗi driver trên các thiết bị Android, mức tiêu thụ pin mát mẻ. Trong khi đó, bản thử nghiệm `XE_RC_FPV_V18_mobile.apk` cũng đã được xuất thành công sẵn sàng phục vụ việc chuyển đổi khi nâng cấp PBR shader cao cấp.
* **Rủi ro tồn đọng:** Chưa đo đạc được nhiệt độ và tỷ lệ sụt pin thực tế trên kính vật lý (`NOT VERIFIED ON DEVICE`).
* **Trạng thái:** **BASELINE LOCKED**.

---

### ADR-05: Cơ chế Xử lý Collider Vật lý
* **Phương án lựa chọn:** **Explicit StaticBody3D Primitive Shapes (Box & Cylinder)**, không tự động sinh Trimesh từ Visual GLB Mesh.
* **Lý do lựa chọn:** Trimesh collider tiêu tốn rất nhiều bộ nhớ tính toán đa giác và dễ gây lỗi kẹt nhân vật tại các khe hở vi mô. Sử dụng primitive shapes giúp physics solver xử lý mượt mà ở tần số 90Hz mà không tốn tài nguyên CPU.
* **Bằng chứng thực nghiệm:** Đạt kết quả `PASS` tuyệt đối 5/5 bài kiểm tra va chạm không gian (hành lang vỉa hè, tường nhà, mái hiên, gờ vỉa hè, khe hở bàn ghế).
* **Trạng thái:** **VERIFIED (PASS)**.

---

### ADR-06: Bảo toàn Phân hệ FPV/RC Hiện hữu
* **Phương án lựa chọn:** **Zero Interference with Existing RC/Web Codebase**.
* **Lý do lựa chọn:** Dự án ban đầu là hệ thống buồng lái điều khiển xe RC thực qua ESP32-CAM và WebSockets. Phân hệ đô thị VR là không gian mở rộng song hành, không được phép xóa bỏ hoặc làm gián đoạn bất kỳ dòng lệnh nào trong `server/server.js`, `www/app.js` và `www/index.html`.
* **Trạng thái:** **ENFORCED & VERIFIED**.
