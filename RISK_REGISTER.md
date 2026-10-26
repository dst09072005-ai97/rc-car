# SỔ ĐĂNG KÝ VÀ QUẢN TRỊ RỦI RO KỸ THUẬT (RISK REGISTER)

**Dự án:** Autonomous VR City Simulator & Living Urban Twin  
**Cập nhật:** Hậu Milestone 2.1 Consolidation Gate  
**Quản lý rủi ro:** Staff Systems & QA Lead

---

## BẢNG THEO DÕI VÀ KẾ HOẠCH GIẢM THIỂU RỦI RO

| Mã Rủi Ro | Hạng mục / Lĩnh vực | Mô tả rủi ro chi tiết | Khả năng (L) | Mức độ tác động (I) | Điểm rủi ro | Chiến lược ứng phó & Giải pháp giảm thiểu | Trạng thái hiện tại |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| **RSK-01** | **Phần cứng VR** | Chưa kết nối thiết bị Meta Quest 3 vật lý qua cáp ADB (`adb devices` trống), chưa đo đạc được FPS và nhiệt độ thực tế. | Cao | Nghiêm trọng | **HIGH** | Tiếp tục giữ bản build APK chuẩn; cung cấp tài liệu hướng dẫn bật USB Debugging trên kính; không tuyên bố đã đạt 72 FPS trên phần cứng thật khi chưa có logcat. | **OPEN (Monitored)** |
| **RSK-02** | **Hiệu năng GPU** | Việc nâng cấp vật liệu PBR và tăng lượng NPC có thể làm tụt frame time dưới 13.8ms gây say VR (sim sickness). | Trung bình | Nghiêm trọng | **MEDIUM** | Áp dụng ngân sách đa giác nghiêm ngặt ($<300\text{k}$ tris); dùng texture tối đa 2K nén ASTC; giữ baseline `gl_compatibility` nhẹ nhàng trước khi chuyển `mobile`. | **CONTROLLED** |
| **RSK-03** | **Lệch Trục Tọa Độ** | Sự khác biệt quy ước trục giữa Blender ($+Z$ Up) và Godot ($-Z$ Forward) làm xe cộ/NPC bị đi ngang hoặc lộn nhào. | Thấp | Cao | **LOW** | Đã ban hành `SCALE_AND_COORDINATE_STANDARD.md` và kiểm chứng chuyển đổi `export_yup=True` của glTF; tích hợp mũi tên RGB kiểm chuẩn trong asset. | **RESOLVED** |
| **RSK-04** | **Va chạm Xuyên Tường** | Nhân vật người chơi hoặc NPC đi xuyên tường nhà hoặc rơi khỏi mặt đường khi di chuyển tốc độ cao. | Thấp | Nghiêm trọng | **LOW** | Đã kiểm chứng 5/5 bài test va chạm trong Godot 4.7.2 Headless; sử dụng `CharacterBody3D` với thuật toán `move_and_slide()` có chặn vector dội. | **RESOLVED** |
| **RSK-05** | **Xung Đột Mã Nguồn** | Quá trình phát triển VR làm ghi đè hoặc hỏng mã nguồn buồng lái FPV, ESP32 và WebSockets hiện hữu trong `www/` và `server/`. | Rất thấp | Thảm họa | **LOW** | Cô lập phân hệ VR vào thư mục `controller_godot/` và `models/`; không can thiệp vào `server/server.js` hoặc giao diện web FPV hiện hữu. | **CONTROLLED** |
| **RSK-06** | **Bản Quyền Asset** | Sử dụng asset bên thứ ba vi phạm bản quyền thương mại hoặc thiếu thông tin ghi công bắt buộc. | Thấp | Cao | **LOW** | Thiết lập quy trình thẩm định trong `ASSET_RESEARCH.md`; ghi nhận chi tiết nguồn gốc trong `ASSET_REGISTRY.csv`; ưu tiên tài sản tự sản xuất hoặc CC0. | **CONTROLLED** |
