# Node Rules: `scripts/`

## 1. Mục Đích & Trách Nhiệm
Thư mục `scripts/` CHỈ chứa các tiện ích vận hành nhanh ở cấp hệ thống:
- `generate_rolls_royce_v18.py`: Script sinh mô hình xe Rolls-Royce chuẩn tỉ lệ.
- `install_openxr_vendors.cmd` / `.ps1`: Cài đặt vendor plugin OpenXR cho Godot.
- `run_server.cmd`: Lệnh tắt khởi chạy nhanh server.
- `run_desktop.cmd`: Lệnh tắt chạy ứng dụng desktop.
- `doctor.cmd` / `.ps1`: Lệnh tắt chạy kiểm định nhanh.
- `verify_v10.py`: Script kiểm định tích hợp V10.

## 2. Invariants & Token Discipline Rules
- ⛔ **KHÔNG CHỨA SCRIPT BUILD ANDROID**: Mọi script build APK Android / Meta Quest 3 đã được quy hoạch tập trung tại `meta_quest_3/scripts/`.
- ⛔ **CẤM SINH SCRIPT TẠM**: Không tạo các file script một lần không có giá trị tái sử dụng lâu dài.
