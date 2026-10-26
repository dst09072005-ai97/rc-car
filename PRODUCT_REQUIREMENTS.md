# ĐẶC TẢ YÊU CẦU SẢN PHẨM TOÀN DIỆN (PRODUCT REQUIREMENTS DOCUMENT)

**Dự án:** Autonomous VR City Simulator & Living Urban Twin  
**Nền tảng mục tiêu:** Meta Quest 3 Standalone (Horizon OS / Android Native)  
**Thiết bị bổ trợ:** Điện thoại Android (Mobile FPV Client 9:16) & Trình duyệt PC (Three.js WebXR Preview 16:9)  
**Tác giả:** Staff Principal VR Architect & Product Owner

---

## I. MỤC TIÊU VÀ TẦM NHÌN SẢN PHẨM (VISION & GOALS)

Xây dựng một không gian thực tế ảo đô thị 3D sống động (Living Urban Twin) lấy cảm hứng từ kiến trúc và nhịp sống đô thị hiện đại Việt Nam / Đông Nam Á. 

Người chơi đắm chìm trong thế giới với góc nhìn thứ nhất (First-person Pedestrian Locomotion), dạo bước qua các con phố có nhà phố thương mại (shophouse), quán cafe vỉa hè, trạm xe buýt, công viên nhiều cây xanh, đồng thời ngắm nhìn hệ thống giao thông xe cộ, người đi bộ (NPC) và động vật tự hành vận hành độc lập theo quy luật ngẫu nhiên thực tế.

---

## II. ĐỊNH VỊ PHẠM VI MVP vs TÍNH NĂNG TƯƠNG LAI (MVP SCOPE vs FUTURE EXPANSION)

Nhằm đảm bảo sự tập trung cao độ và loại bỏ rủi ro quá tải hiệu năng trên kính Standalone:

### 1. Phạm vi MVP (Đã khóa phạm vi bắt buộc):
* **Chế độ người chơi (Player Experience):** Bắt đầu duy nhất ở chế độ **First-person Pedestrian (Đi bộ tự do góc nhìn thứ nhất)**.
* **Hệ thống điều khiển (VR Locomotion):**
  * Di chuyển bằng cần Analog trái (Smooth Locomotion) hoặc Teleportation an toàn chống say.
  * Xoay góc nhìn bằng cần Analog phải (Snap Turn $45^\circ$ / Smooth Turn).
  * Chiều cao mắt và góc xoay đầu do kính Meta Quest 3 tracking 6-DoF tự nhiên hoàn toàn, tuyệt đối không gán cứng cố định bằng code.
* **Mô phỏng đô thị tự hành (Autonomous Simulation):**
  * Xe cộ chạy tự động theo làn đường quy định, dừng khi gặp đèn đỏ hoặc có người qua đường.
  * NPC đi bộ dọc hành lang vỉa hè $2{,}0\,\text{m}$, có cảm biến né chướng ngại vật (bàn ghế, tường, người chơi).
  * Động vật nhỏ (mèo/chó) hoạt động ngẫu nhiên trong công viên.
* **Bảo toàn phân hệ FPV/RC:** Giữ nguyên vẹn toàn bộ backend WebSockets, camera stream ESP32-CAM và buồng lái điều khiển xe RC trong thư mục dự án `D:\XE_RC_FPV_V10`.

### 2. Tính năng mở rộng sau MVP (Post-MVP Backlog):
* **Hệ thống lên/xuống và lái xe hơi (Vehicle Boarding & Driving):** Sẽ được tích hợp sau khi hệ thống đi bộ và mô phỏng giao thông đã ổn định và đạt chuẩn 72/90 FPS trên kính.
* **Nội thất chi tiết tầng trên nhà ở:** MVP chỉ mở không gian nội thất tầng trệt của Quán Cafe mặt phố; các tầng trên là khối đặc diễn họa ngoại thất có ánh sáng cửa sổ.
* **Multiplayer VR nhiều người chơi qua mạng:** Triển khai sau khi single-player VR đạt độ tin cậy tuyệt đối.

---

## III. MA TRẬN PHÂN BỔ TÍNH NĂNG THEO RUNTIME (FEATURE RUNTIME MATRIX)

| Tính năng / Phân hệ | Godot Engine 4.7.2 (Native APK) | Three.js Web (Browser / Preview) | Node.js Server (`server.js`) | ESP32-CAM / IoT Hardware | Trạng thái hiện tại |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **VR Immersive 6-DoF HMD** | **Lõi chính (Primary)** | Hỗ trợ qua WebXR API | Không can thiệp | Không can thiệp | **Đã xuất APK Godot v18** |
| **Vật lý Va chạm & Nhân vật** | Godot Physics 3D | Tính toán bounding box JS | Không can thiệp | Không can thiệp | **Passed 5/5 Godot tests** |
| **Nạp mô hình 3D GLB** | Godot glTF Scene loader | Three.js GLTFLoader | Không can thiệp | Không can thiệp | **Đã đồng bộ 2 bên** |
| **Mô phỏng Giao thông (Traffic)** | GDScript FSM độc lập | JavaScript animation loop | Không can thiệp | Không can thiệp | Đang chạy trên Three.js |
| **Điều khiển Xe RC Telemetry** | Tương thích qua WebSocket client | Đang chạy trực tiếp UI | WebSocket Server cổng 8080 | Nhận tín hiệu điều khiển | **Bảo toàn 100% hoạt động** |
| **Stream Video FPV Camera** | Nhận stream MJPEG / WebRTC | Hiển thị trong buồng lái | Phân phối stream camera | Thu hình trực tiếp | **Bảo toàn 100% hoạt động** |
| **YouTube Media Player 3D** | Hỗ trợ qua WebRTC/Stream | Chạy player nhúng DOM | Xử lý stream audio/video | Không can thiệp | Đang chạy trên Web |

---

## IV. TIÊU CHUẨN NGHIỆM THU KỸ THUẬT (ACCEPTANCE CRITERIA)

1. **Hiệu năng Standalone (Performance Gate):** 
   * Tỷ lệ khung hình ổn định $\ge 72\,\text{FPS}$ trên Meta Quest 3.
   * Frame time $\le 13{,}8\,\text{ms}$, không drop frame khi quay đầu nhanh.
2. **Độ an toàn hình học (Geometric Safety Gate):**
   * Người chơi không thể đi xuyên qua bất kỳ bức tường hoặc gờ kính nào.
   * Hành lang đi bộ thông thủy $2{,}0\,\text{m}$ không bao giờ bị cản trở bởi biển hiệu hay bàn ghế.
   * Mái hiên và trần nhà chờ xe buýt luôn đảm bảo khoảng hở lọt đầu $\ge 0{,}50\,\text{m}$ so với đỉnh đầu người chơi cao $1{,}85\,\text{m}$.
3. **Độ tin cậy của Build (Build & Packaging Gate):**
   * Lệnh export headless từ console luôn trả về exit code `0`.
   * APK được ký bằng scheme v2 hợp lệ, cài đặt sạch qua ADB mà không cần cấp quyền thủ công nguy hiểm.
