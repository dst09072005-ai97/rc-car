# MILESTONE 3 — VERTICAL SLICE DESIGN, TEST PLAN & HANDOFF REPORT

## 1. Mục tiêu của chặng (Milestone 3 — Vertical Slice)

Chuyển đổi khu phố thử nghiệm từ mức khối hình học cơ bản (graybox) sang một **Vertical Slice 3D hoàn chỉnh theo phong cách Stylized Realistic PBR ($32 \times 30\text{ m}$)** mang đặc trưng đô thị Việt Nam hiện đại, có mặt đường 2 làn ($7\text{ m}$), 2 vỉa hè ($3,5\text{ m}$/bên), Tiệm Cà Phê Shophouse có nội thất bước vào được, Trạm Xe Buýt, 3 cụm cây xanh công viên, 1 Xe Sedan 4 bánh rời chạy theo tuyến, 2 NPC đi bộ trên vỉa hè và 1 Chó cảnh hoạt động trong công viên, tích hợp vào scene riêng `vertical_slice_city.tscn` trong Godot mà không làm ảnh hưởng đến hệ thống RC/ESP32-CAM và buồng lái Rolls-Royce hiện có.

## 2. Công việc đã hoàn thành và Phân loại trạng thái trung thực (Mục XIX `p_2.txt`)

| Hạng mục bàn giao | Đường dẫn file mục tiêu | Trạng thái hiện tại | Ghi chú xác minh trung thực |
|---|---|---|---|
| **Script Preflight Audit (Phase 1)** | `blender_scripts/preflight_audit_m2.py` | **CREATED (Đã tạo mã nguồn)** | Kiểm tra read-only các file `.blend` M2 và xuất `docs/MILESTONE_3_PREFLIGHT.md` khi chạy trên máy. |
| **Script Dựng Vertical Slice & Xuất GLB (Phase 2 & 3)** | `blender_scripts/build_vertical_slice.py` | **CREATED (Đã tạo mã nguồn)** | Tạo `models/vertical_slice_city_block.blend` (13 Collection, 12 nhóm PBR) & xuất GLB đồng bộ SHA-256. |
| **Script Kiểm Định GLB (Phase 3)** | `blender_scripts/validate_vertical_slice.py` | **CREATED (Đã tạo mã nguồn)** | Kiểm tra magic header `glTF`, nodes, meshes, materials và cập nhật `docs/ASSET_REGISTRY.csv`. |
| **Scene Tích Hợp Godot 4 (Phase 4)** | `controller_godot/scenes/vertical_slice_city.tscn` | **CREATED (Đã tạo mã nguồn)** | Tích hợp `XROrigin3D`, `DirectionalLight3D`, `StaticBody3D` colliders và `vertical_slice_loader.gd`. |
| **Script Chuyển Động & Kiểm Thử Godot (Phase 4 & 5)** | `controller_godot/scripts/vertical_slice_loader.gd`<br><br>`controller_godot/scripts/vertical_slice_validation.gd` | **CREATED (Đã tạo mã nguồn)** | Điều khiển xe Sedan + 4 bánh quay, 2 NPC, 1 Chó cảnh và chạy kiểm thử tự động xuất `VERTICAL_SLICE_TEST_REPORT.md`. |
| **File `.blend`, `.glb` và `.apk` nhị phân trên ổ `D:\`** | `models/vertical_slice_city_block.blend`<br><br>`controller_godot/models/vertical_slice_city_block.glb`<br><br>`build/android/VR_City_VerticalSlice_M3_debug.apk` | **READY TO GENERATE VIA SCRIPT** | Chạy `.\run_milestone_3_pipeline.ps1` trên máy của bạn để Blender 5.2 và Godot 4.7.2 sinh file nhị phân thực tế. |
| **Kiểm thử trực tiếp trên kính Meta Quest 3 thật** | `VR_City_VerticalSlice_M3_debug.apk` | **NOT VERIFIED ON DEVICE** | Cần kết nối kính Meta Quest 3 qua ADB sau khi xuất APK để đo FPS/Frame time thực tế. |

## 3. Bảng kết quả nghiệm thu theo Định Nghĩa Done (Phần XVIII `p_2.txt`)

| Nhóm kiểm tra | Hạng mục nghiệm thu | Trạng thái | Bằng chứng / Điều kiện xác nhận |
|---|---|---|---|
| **Blender** | File `.blend` riêng, 13 Collection rõ ràng, Scale/Pivot hợp lệ, 12 PBR Materials & UV Box Projection | **PASS (Code) / PENDING LOCAL RUN** | Được định nghĩa chặt chẽ trong `build_vertical_slice.py`; không ghi đè `graybox_city_block.blend`. |
| **Environment** | Đường $7\text{ m}$ + 2 vỉa hè $3,5\text{ m}$, Shophouse Cafe có nội thất bước vào được, Trạm Bus, 3 cụm cây xanh, đèn đường | **PASS (Code) / PENDING LOCAL RUN** | Cửa tiệm cà phê rộng $1,6\text{ m} \times 2,4\text{ m}$ không bị chặn bởi collider; mái hiên cao $2,85\text{ m}$. |
| **Simulation** | 1 Xe Sedan 4 bánh rời chạy đúng hướng vector vận tốc, 2 NPC đi bộ trên vỉa hè, 1 Chó cảnh trong công viên | **PASS (Code) / PENDING LOCAL RUN** | Cài đặt trong `vertical_slice_loader.gd` và kiểm chứng tự động qua `vertical_slice_validation.gd`. |
| **Godot / XR** | Scene riêng `vertical_slice_city.tscn`, Collider hoạt động, `XROrigin3D` giữ nguyên head/controller tracking | **PASS (Code) / NOT VERIFIED ON DEVICE** | Kiểm thử headless sử dụng `--xr-mode off`; trải nghiệm VR trên kính thật được đánh dấu `NOT VERIFIED ON DEVICE`. |
| **Build & Bảo toàn** | Xuất `VR_City_VerticalSlice_M3_debug.apk` tên riêng, bảo toàn 100% hệ thống RC/ESP32 và các APK cũ | **PASS (Preservation)** | Không sửa đổi `server.js`, `app.js`, `XE_RC_FPV_V17.apk` hay `XE_RC_FPV_V18.apk`. |
