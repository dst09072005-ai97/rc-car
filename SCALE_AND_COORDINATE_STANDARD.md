# QUY CHUẨN KÍCH THƯỚC HÌNH HỌC VÀ HỆ TRỤC TỌA ĐỘ ĐÔ THỊ (SCALE & COORDINATE STANDARD)

**Phiên bản:** 2.0 (Thống nhất toàn diện)  
**Tác giả:** Staff Principal VR Architect  
**Áp dụng:** Toàn bộ pipeline Blender 5.2 $\to$ glTF 2.0 $\to$ Godot Engine 4.7.2 / Three.js

---

## I. CHUẨN HÓA QUY ƯỚC HỆ TRỤC TỌA ĐỘ 3D (3D COORDINATE CONVENTIONS)

Trong quy trình phát triển từ phần mềm dựng hình (DCC) đến game engine thời gian thực, sự khác biệt giữa trục đứng ($Y$ vs $Z$) và trục nhìn tới trước (Forward) dễ dẫn tới lỗi lộn đầu hoặc xe chạy ngang. Dự án áp dụng bảng ánh xạ chuẩn sau:

### 1. Bảng đối chiếu hệ trục qua các công đoạn
| Môi trường / Công đoạn | Hệ tọa độ (Chirality) | Trục đứng lên trời (Up) | Trục nhìn tới trước (Forward) | Trục ngang sang phải (Right) | Cơ chế chuyển đổi (Export/Import) |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Blender 5.2** (DCC Modeling) | Tay phải (Right-handed) | $+Z$ | **$+Y$ (North)** | $+X$ (East) | `scene.unit_settings.system = 'METRIC'` (1.0m = 1 BU) |
| **glTF 2.0 Specification** | Tay phải (Right-handed) | $+Y$ | **$-Z$** | $+X$ | `export_yup = True` (Xoay $-90^\circ$ quanh trục $X$: $Y \to Z, Z \to -Y$) |
| **Godot Engine 4.7.2** (Primary) | Tay phải (Right-handed) | $+Y$ | **$-Z$ (Front of Camera/Mesh)**| $+X$ | Khớp 100% với chuẩn glTF 2.0, không đảo dấu |
| **Three.js** (WebXR Preview) | Tay phải (Right-handed) | $+Y$ | **$-Z$** | $+X$ | Khớp 100% với chuẩn glTF 2.0 |

### 2. Định nghĩa Hướng nhìn và Phương tiện (Forward Axis & Heading)
* **Quy tắc đầu xe / Mặt người nhìn:**
  * Trong Blender: Mặt trước xe và mặt người chơi nhìn hướng về **$+Y$**.
  * Trong glTF & Godot: Mặt trước xe và mặt người chơi nhìn hướng về **$-Z$** (Vector `Vector3(0, 0, -1)`).
* **Mã màu chuẩn của các trục kiểm chuẩn (RGB Axes Tripod):**
  * **Trục $X$ (Đỏ - Red):** Chỉ hướng Đông / Sang phải.
  * **Trục $Y$ (Xanh lục - Green):** Trong Blender chỉ hướng Bắc / Forward; trong Godot chỉ hướng lên trời (Up).
  * **Trục $Z$ (Xanh lam - Blue):** Trong Blender chỉ hướng lên trời (Up); trong Godot chỉ hướng Nam / Back.

---

## II. HỢP NHẤT MẶT CẮT NGANG ĐƯỜNG PHỐ (STREET CROSS-SECTION & ROAD PROFILE)

Mặt cắt ngang tuyến phố được thiết kế chuẩn theo tiêu chuẩn đô thị hiện đại Việt Nam / Đông Nam Á (Tương đương đường cấp nội bộ đô thị 14m lộ giới):

### 1. Bảng số liệu kích thước mặt cắt ngang chi tiết (Cross-Section Breakdown)
| Phân vùng chức năng | Tọa độ $Y$ (Blender) | Tọa độ $Z$ (Godot) | Bề rộng ($W$) | Cao độ mặt bằng | Trạng thái thẩm định |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Vỉa hè Bắc (North Sidewalk)** | $+3{,}50$ đến $+7{,}00$ | $-3{,}50$ đến $-7{,}00$ | **$3{,}50\,\text{m}$** | $+0{,}15\,\text{m}$ (Mặt vỉa hè) | **VERIFIED (PASS)** |
| ↳ *Gờ bó vỉa đá (Curb Stone)* | $+3{,}50$ đến $+3{,}70$ | $-3{,}50$ đến $-3{,}70$ | $0{,}20\,\text{m}$ | $0{,}00 \to +0{,}15\,\text{m}$ vát | **VERIFIED (PASS)** |
| ↳ *Dải cây xanh & Trạm buýt* | $+5{,}10$ đến $+7{,}00$ | $-5{,}10$ đến $-7{,}00$ | $1{,}90\,\text{m}$ | $+0{,}15\,\text{m}$ | **VERIFIED (PASS)** |
| ↳ *Hành lang đi bộ thông thủy* | $+3{,}70$ đến $+5{,}10$ | $-3{,}70$ đến $-5{,}10$ | **$1{,}40\,\text{m}$** | $+0{,}15\,\text{m}$ | **VERIFIED (PASS)** |
| **Lòng đường xe chạy (Road Carriageway)**| $-3{,}50$ đến $+3{,}50$ | $-3{,}50$ đến $+3{,}50$ | **$7{,}00\,\text{m}$** | $-0{,}05 \to 0{,}00\,\text{m}$ (Mặt nhựa)| **VERIFIED (PASS)** |
| ↳ *Làn xe Bắc (Westbound Lane)* | $0{,}00$ đến $+3{,}50$ | $-3{,}50$ đến $0{,}00$ | **$3{,}50\,\text{m}$** | $0{,}00\,\text{m}$ | **VERIFIED (PASS)** |
| ↳ *Vạch tim đường (Yellow Dashes)* | $-0{,}075$ đến $+0{,}075$| $-0{,}075$ đến $+0{,}075$| $0{,}15\,\text{m}$ | $+0{,}003\,\text{m}$ (Sơn phản quang)| **VERIFIED (PASS)** |
| ↳ *Làn xe Nam (Eastbound Lane)* | $-3{,}50$ đến $0{,}00$ | $0{,}00$ đến $+3{,}50$ | **$3{,}50\,\text{m}$** | $0{,}00\,\text{m}$ | **VERIFIED (PASS)** |
| **Vỉa hè Nam (South Sidewalk)** | $-3{,}50$ đến $-7{,}00$ | $+3{,}50$ đến $+7{,}00$ | **$3{,}50\,\text{m}$** | $+0{,}15\,\text{m}$ (Mặt vỉa hè) | **VERIFIED (PASS)** |
| ↳ *Gờ bó vỉa đá (Curb Stone)* | $-3{,}50$ đến $-3{,}70$ | $+3{,}50$ đến $+3{,}70$ | $0{,}20\,\text{m}$ | $0{,}00 \to +0{,}15\,\text{m}$ vát | **VERIFIED (PASS)** |
| ↳ *Hành lang đi bộ thông thủy* | $-3{,}70$ đến $-5{,}70$ | $+3{,}70$ đến $+5{,}70$ | **$2{,}00\,\text{m}$** | $+0{,}15\,\text{m}$ | **VERIFIED (PASS)** |
| ↳ *Khoảng đệm mặt tiền / Bàn cafe* | $-5{,}70$ đến $-7{,}00$ | $+5{,}70$ đến $+7{,}00$ | **$1{,}30\,\text{m}$** | $+0{,}15\,\text{m}$ | **VERIFIED (PASS)** |
| **TỔNG LỘ GIỚI TUYẾN ĐƯỜNG** | **$-7{,}00$ đến $+7{,}00$** | **$-7{,}00$ đến $+7{,}00$** | **$14{,}00\,\text{m}$** | — | **ĐÃ XÁC THỰC TOÁN HỌC** |

Phép kiểm tra tổng toán học:
$$W_{total} = W_{sidewalk\_north} (3{,}50\,\text{m}) + W_{carriageway} (7{,}00\,\text{m}) + W_{sidewalk\_south} (3{,}50\,\text{m}) = \mathbf{14{,}00\,\text{m}}$$

---

## III. ĐỐI CHIẾU QUY MÔ PHÂN CỤM: GRAYBOX 32×30m vs ĐÔ THỊ 68×68m

Nhằm loại bỏ mâu thuẫn giữa kích thước mô hình Graybox hiện tại và quy hoạch ô phố tổng thể:

1. **Graybox Đoạn Tuyến Baseline ($32\,\text{m} \times 30\,\text{m}$):**
   * Chiều dài dọc trục đường: $32{,}00\,\text{m}$.
   * Chiều sâu tổng thể: $30{,}00\,\text{m}$ (tính từ ranh sau công viên phía Bắc tại $Z=-14\,\text{m}$ đến ranh sau dãy nhà phố phía Nam tại $Z=+16\,\text{m}$).
   * **Vai trò:** Là **Module phân đoạn kiểm chuẩn (Sub-block Benchmark Segment)** dùng để đo kiểm va chạm, tốc độ tải đa giác, và độ lọt lòng của nhân vật trong không gian 1 khối nhà mẫu.

2. **Quy hoạch Ô Phố Tiêu Chuẩn Toàn Diện ($68\,\text{m} \times 68\,\text{m}$):**
   * Kích thước tổng thể từ tim đường đến tim đường: $68{,}00\,\text{m} \times 68{,}00\,\text{m}$.
   * Gồm: 1 ngã tư giao lộ chữ thập ($14\,\text{m} \times 14\,\text{m}$), 2 đoạn tuyến đường $27\,\text{m}$, và 4 phân khu nhà liền kề khép kín lõi hẻm.
   * **Mối liên hệ:** Graybox $32\,\text{m}$ tương đương với $1$ cạnh mặt đường hoàn chỉnh cộng với khoảng đệm giao lộ. Khi nhân bản sang ô phố $68\,\text{m}$, toàn bộ asset của Graybox $32\,\text{m}$ được tái sử dụng nguyên vẹn mà không cần thay đổi tỷ lệ hay cấu trúc.

---

## IV. BẢNG PHÂN LOẠI THÔNG SỐ: ĐÃ KIỂM CHỨNG vs GIẢ ĐỊNH THIẾT KẾ

| Nhóm thông số | Thông số cụ thể | Giá trị chuẩn | Trạng thái kỹ thuật | Bằng chứng / Cơ sở |
| :--- | :--- | :---: | :---: | :--- |
| **Nhân vật VR** | Chiều cao Capsule | $1{,}85\,\text{m}$ | **VERIFIED** | Code GDScript & Bounding Box Mesh |
| | Bán kính Capsule | $0{,}30\,\text{m}$ | **VERIFIED** | Code GDScript & Bounding Box Mesh |
| | Chiều cao mắt (Eye level) | $1{,}68\,\text{m}$ | **VERIFIED** | Đĩa đánh dấu trong `calibration_gate.blend` |
| | Vị trí tâm Controller | $X = \pm 0{,}28\,\text{m}$ | **VERIFIED** | Cầu kiểm chuẩn $R=0{,}07\,\text{m}$ |
| | Khoảng hở mép Controller | $\mathbf{0{,}25\,\text{m}}$ | **VERIFIED** | Phép tính $0{,}60 - 0{,}35 = 0{,}25\,\text{m}$ đã sửa |
| **Giao thông** | Chiều rộng làn xe ô tô | $3{,}50\,\text{m}$ | **VERIFIED** | Mặt cắt ngang `Road_Asphalt_Surface` 7.0m |
| | Vạch sang đường (Zebra) | Rộng $2{,}80\,\text{m}$ | **VERIFIED** | 8 vạch kẻ sơn trắng tại $X = -6{,}5\,\text{m}$ |
| | Chiều cao gờ vỉa hè | $0{,}15\,\text{m}$ | **VERIFIED** | Khối đá bó vỉa `Curb_Stone` $0{,}15\,\text{m}$ cao |
| **Kiến trúc** | Trần tầng trệt Cafe | $3{,}80\,\text{m}$ | **VERIFIED** | Đo mesh: $0{,}15\,\text{m}$ lên $+3{,}95\,\text{m}$ |
| | Tổng chiều cao nhà Cafe | $10{,}35\,\text{m}$ | **VERIFIED** | Đo mesh: $0{,}15\,\text{m}$ lên $+10{,}35\,\text{m}$ |
| | Độ thông thủy đáy mái hiên | $2{,}66\,\text{m}$ (trên vỉa hè) | **VERIFIED** | Đáy mái hiên tại $+2{,}81\,\text{m}$, vỉa hè $+0{,}15\,\text{m}$ |
| | Chiều cao Tòa nhà Góc Tây | $11{,}65\,\text{m}$ | **VERIFIED** | Bounding box node `West_Building_Body` |
| **Giả định Thiết kế** | Bán kính rẽ xe hơi tại ngã tư | $R = 6{,}00\,\text{m}$ | *DESIGN ASSUMPTION* | Chưa triển khai ngã tư đầy đủ trong MVP |
| | Tốc độ đi bộ NPC | $1{,}20\,\text{m/s}$ | *DESIGN ASSUMPTION* | Dự kiến cấu hình trong FSM ở Milestone 3 |
| | Chiều cao xe hơi sedan | $1{,}45\,\text{m}$ | *DESIGN ASSUMPTION* | Chưa đưa mesh xe chi tiết vào Godot |
