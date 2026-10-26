# BÁO CÁO NGHIÊN CỨU VÀ ĐÁNH GIÁ TÀI NGUYÊN (ASSET RESEARCH REPORT)

**Tác giả:** Staff 3D Environment & Security Reviewer  
**Mục tiêu:** Thẩm định giấy phép, độ sạch bản quyền, chi phí hiệu năng và tính khả thi của các gói tài nguyên 3D/PBR trước khi đưa vào sản xuất.

---

## I. NGUYÊN TẮC QUẢN LÝ BẢN QUYỀN VÀ HIỆU NĂNG

1. **Nguyên tắc "Không cấp PASS khống":** Bất kỳ tài nguyên nào chưa được tải về máy, chưa import vào Godot, hoặc chưa chạy benchmark thực tế đều bắt buộc phải ghi rõ trạng thái `PENDING_VERIFICATION`. Tuyệt đối không tự ý đánh dấu `PASS`.
2. **Kiểm tra điều kiện Attribution:** Các tài nguyên thuộc giấy phép CC-BY (Creative Commons Attribution) phải ghi nhận đầy đủ tên tác giả, link gốc, điều khoản giấy phép trong file `ASSET_REGISTRY.csv` và trong màn hình Credits của game.
3. **Ngân sách đa giác và Texture cho Meta Quest 3 Standalone:**
   * **Ngân sách đa giác toàn cảnh (Drawcall & Poly budget):** $< 300{,}000$ triangles trong góc nhìn camera, $< 100$ draw calls mỗi mắt.
   * **Độ phân giải Texture:** Không dùng texture $4K$. Tối đa $2048 \times 2048$ cho các khối công trình chính, $1024 \times 1024$ cho vật phẩm đạo cụ nhỏ (props), nén định dạng ASTC / ETC2 qua Godot importer.

---

## II. DANH MỤC ĐÁNH GIÁ CÁC NGUỒN TÀI NGUYÊN (ASSET CANDIDATES EVALUATION)

### 1. Nguồn Vật liệu PBR Bề mặt (Textures & Materials)
* **Ứng viên 1: AmbientCG Urban Textures**
  * **URL trực tiếp:** [https://ambientcg.com/list?category=Street](https://ambientcg.com/list?category=Street)
  * **Hạng mục:** Nhựa đường nứt nhẹ (`Asphalt012`), Đá vỉa hè (`PavingStones070`), Bê tông gờ vỉa hè (`Concrete034`).
  * **Giấy phép:** CC0 1.0 Universal (Public Domain).
  * **Nội dung thực tế:** Bộ map PBR chuẩn gồm Color, Roughness, Normal (DirectX/OpenGL).
  * **Đánh giá bản quyền:** **Hoàn toàn sạch**, được phép thương mại hóa và chỉnh sửa không cần ghi công.
  * **Trạng thái thẩm định kỹ thuật:** `PENDING_VERIFICATION` (Chờ tải texture pack 1K/2K để thử nghiệm nạp shader).

* **Ứng viên 2: Poly Haven Architectural Surfaces**
  * **URL trực tiếp:** [https://polyhaven.com/textures/urban](https://polyhaven.com/textures/urban)
  * **Hạng mục:** Tường trát vữa (`plastered_wall`), Gỗ mặt bàn cafe (`wood_table_001`).
  * **Giấy phép:** CC0 1.0 Universal.
  * **Đánh giá bản quyền:** **Hoàn toàn sạch**.
  * **Trạng thái thẩm định kỹ thuật:** `PENDING_VERIFICATION`.

### 2. Nguồn Cây xanh và Cảnh quan (Foliage & Props)
* **Ứng viên 3: Quaternius Stylized Nature / Urban Pack**
  * **URL trực tiếp:** [https://quaternius.com/packs/stylizedurban.html](https://quaternius.com/packs/stylizedurban.html)
  * **Hạng mục:** Cột đèn chiếu sáng, thùng rác đô thị, rào chắn vỉa hè.
  * **Giấy phép:** CC0 (Public Domain).
  * **Đánh giá đa giác:** Low-poly stylized, số lượng đa giác thấp ($< 1{,}000$ tris/prop).
  * **Trạng thái thẩm định kỹ thuật:** `PENDING_VERIFICATION` (Cần kiểm tra độ sắc nét khi nhìn gần trong kính VR).

### 3. Nguồn Phương tiện Giao thông Đô thị (Vehicles)
* **Ứng viên 4: Kenney City Commercial Kit**
  * **URL trực tiếp:** [https://kenney.nl/assets/city-kit-commercial](https://kenney.nl/assets/city-kit-commercial)
  * **Hạng mục:** Khối xe sedan, xe buýt công cộng, xe tải nhỏ.
  * **Giấy phép:** CC0 1.0 Universal.
  * **Đánh giá tỷ lệ:** Cần tái cân chỉnh scale trong Blender vì mô hình gốc dạng đồ chơi cách điệu, cần chuyển sang kích thước chuẩn $4{,}6\,\text{m} \times 1{,}8\,\text{m} \times 1{,}45\,\text{m}$.
  * **Trạng thái thẩm định kỹ thuật:** `PENDING_VERIFICATION`.

### 4. Tài sản Nội bộ Đã Xác minh (Internal Verified Baseline Assets)
* **Asset 1: `calibration_gate.glb`**
  * **Nguồn:** Dự án tự phát triển qua Blender Python script nội bộ.
  * **Kích thước file:** $354{,}228\,\text{bytes}$.
  * **Giấy phép:** MIT / Bản quyền nội bộ dự án `XE_RC_FPV_V10`.
  * **Trạng thái thẩm định:** **VERIFIED (PASS)** trên cả Godot và Three.js.
* **Asset 2: `graybox_city_block.glb`**
  * **Nguồn:** Dự án tự phát triển qua Blender Python script nội bộ.
  * **Kích thước file:** $386{,}060\,\text{bytes}$.
  * **Giấy phép:** MIT / Bản quyền nội bộ dự án `XE_RC_FPV_V10`.
  * **Trạng thái thẩm định:** **VERIFIED (PASS)** (Passed 5/5 bài test va chạm vật lý trên Godot 4.7.2).
