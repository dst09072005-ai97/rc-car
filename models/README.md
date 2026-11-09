# 3D Models Node — Blender Source Models

Node này lưu trữ các tệp mô hình 3D gốc định dạng `.blend` của dự án XE RC FPV V10.

## Nội dung
- `calibration_gate.blend`: Cổng hiệu chuẩn kích thước và visual reference.
- `graybox_city_block.blend`: Mô hình block thành phố dạng graybox thử nghiệm.
- `vertical_slice_city_block.blend`: Mô hình Vertical Slice thành phố hoàn chỉnh phục vụ kiểm thử WebXR.

## Quy tắc Node Governance
1. **Nguồn Gốc (Source of Truth 3D)**: Thư mục này chỉ lưu trữ tệp nguồn Blender `.blend`.
2. **Không Chứa Binary GLB Duplicated**: Tệp nhị phân `.glb` sau khi biên dịch / xuất từ Blender sẽ được đưa trực tiếp vào `www/models/` (WebXR Client) hoặc `controller_godot/models/` (Godot Client), cấm để tệp `.glb` trùng lặp tại đây.
3. **Kỷ Luật Bộ Nhớ**: AI agents không được dump toàn bộ vertex/mesh data vào context.
