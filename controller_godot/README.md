# Godot Controller Node — Desktop FPV & Cockpit Station

Node này chứa toàn bộ dự án Godot 4.x Desktop Controller phục vụ điều khiển xe XE RC FPV từ máy tính (PC).

## Tính năng
- Trạm điều khiển buồng lái ảo 3D trên Desktop.
- Kết nối tay cầm lái DirectInput / Vô lăng GOG R808 qua hệ thống Action Map Godot.
- Đồng bộ telemetry UDP 4210 điều khiển servo & motor xe thật khi không dùng giao diện WebXR.
- Tích hợp stream camera FPV độ trễ thấp.

## Quy tắc Node Governance
1. **Độc Lập**: Dự án Godot được cấu hình khép kín trong thư mục này với `project.godot`.
2. **Không Lan Ra Root**: Mọi asset, scene, script Godot phải ở trong `controller_godot/`, không export ra root.
3. **Môi Trường**: Sử dụng runtime Godot trong `tools/godot/`.
