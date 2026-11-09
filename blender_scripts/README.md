# Blender Scripts Node — 3D Asset Automation Pipeline

Node này chứa các script Python tự động hóa Blender cho việc tạo hình, audit kích thước, kiểm tra tọa độ và xuất mô hình 3D sang WebXR / Godot.

## Danh mục Script
- `build_vertical_slice.py`: Pipeline tự động build và xuất scene Vertical Slice sang GLB.
- `generate_calibration_and_graybox.py`: Tạo scene hiệu chuẩn và graybox cơ bản.
- `generate_rolls_royce_interior.py`: Script tạo chi tiết nội thất buồng lái Rolls-Royce.
- `audit_transform_independent.py`: Kiểm toán ma trận transform, scale và pivot của các mesh.
- `validate_vertical_slice.py`: Kiểm định tiêu chuẩn kỹ thuật GLB (tam giác, texture atlas, draw calls).
- `render_visual_qa_m3_2.py`: Script render ảnh chụp thẩm định chất lượng hình ảnh 3D.
- `preflight_audit_m2.py`: Kiểm tra trước bay cho các asset milestone 2.

## Quy tắc Node Governance
1. **Môi Trường Thực Thi**: Các script này chạy trong môi trường Blender Python (`blender --background --python <script>`).
2. **Xuất Đúng Đích**: GLB xuất ra phải đi thẳng vào `www/models/` hoặc `controller_godot/models/`, không tạo file trung gian rải rác ngoài root.
