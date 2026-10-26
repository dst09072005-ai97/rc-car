# BÁO CÁO NGHIỆM THU MILESTONE 2.1 — RUNTIME HARDENING & RELEASE VALIDATION

**Thời điểm nghiệm thu:** 18/10/2026 13:37 (UTC+7)  
**Phạm vi dự án:** Autonomous VR City Simulator & Living Urban Twin (Meta Quest 3 Standalone / Horizon OS)  
**Tình trạng cam kết:** Bảo toàn 100% mã nguồn FPV/RC/buồng lái hiện hữu tại `D:\XE_RC_FPV_V10`. Chưa mở rộng phố hay tạo tài nguyên chi tiết hàng loạt.

---

## I. KIỂM CHỨNG SCENE VÀ COLLISION (SECTION A)

### 1. Quy ước trục tọa độ giữa Blender, glTF và Godot Engine
Để đảm bảo kích thước và hướng nhìn đồng nhất giữa quá trình dựng hình và nạp vào game engine:
* **Blender (Dựng hình):**
  * Hệ tọa độ: Cánh tay phải (Right-handed).
  * Quy ước trục: $+Z$ hướng lên trời (Up), $+Y$ đi tới trước (Forward / North), $+X$ sang phải (Right / East).
* **glTF 2.0 (Định dạng trung gian xuất ra):**
  * Hệ tọa độ: Cánh tay phải (Right-handed).
  * Quy ước chuẩn: $+Y$ hướng lên trời (Up), $-Z$ đi tới trước (Forward), $+X$ sang phải (Right). Khi xuất từ Blender sang glTF, ma trận chuyển đổi áp dụng phép xoay $-90^\circ$ quanh trục $X$ ($Y \to Z, Z \to Y$).
* **Godot Engine 4.7.2 (Runtime):**
  * Hệ tọa độ: Cánh tay phải (Right-handed).
  * Quy ước chuẩn 3D: $+Y$ hướng lên trời (Up), $-Z$ là hướng nhìn mặc định của Camera/Forward, $+X$ sang phải (Right).
  * Khớp hoàn toàn 1:1 với glTF mà không cần xoay trục hay đảo dấu vertex.

### 2. Kích thước hình học & Giải trình AABB từng công trình
Đã đo kiểm độc lập toàn bộ 64 node trong file baseline `graybox_city_block.glb`:
* **Vỉa hè Nam & Bắc:** Kích thước $32{,}00\,\text{m} \times 0{,}15\,\text{m} \times 3{,}30\,\text{m}$. Mặt trên vỉa hè nằm tại cốt cao độ chuẩn $+0{,}15\,\text{m}$ so với mặt đường.
* **Lòng đường Asphalt:** Kích thước $32{,}00\,\text{m} \times 0{,}05\,\text{m} \times 7{,}00\,\text{m}$ (gồm 2 làn xe $3{,}50\,\text{m}$ mỗi bên). Cốt mặt đường từ $-0{,}05\,\text{m}$ đến $0{,}00\,\text{m}$.
* **Nhà phố Cafe Tầng trệt (`Cafe_Ground_Wall`):** Rộng $10{,}00\,\text{m}$, cao $3{,}80\,\text{m}$, sâu $9{,}00\,\text{m}$ (Cao độ từ $+0{,}15\,\text{m}$ đến $+3{,}95\,\text{m}$).
* **Nhà phố Cafe Tầng lầu (`Cafe_Upper_Floors`):** Rộng $10{,}00\,\text{m}$, cao $6{,}40\,\text{m}$, sâu $9{,}00\,\text{m}$ (Cao độ từ $+3{,}95\,\text{m}$ đến $+10{,}35\,\text{m}$).
* **Tổng thể Nhà phố Cafe:** Chiều cao thuần là **$10{,}20\,\text{m}$**; tính từ mặt đường lên đỉnh mái là **$10{,}35\,\text{m}$**.
* **Tòa nhà thương mại Góc Tây (`West_Building_Body`):** Rộng $12{,}00\,\text{m}$, cao $11{,}50\,\text{m}$, sâu $9{,}00\,\text{m}$ (Cốt đỉnh đạt **$+11{,}65\,\text{m}$** từ mặt đường).
* **Kết luận AABB:** Đỉnh $11{,}65\,\text{m}$ trước đây được báo cáo là AABB của Tòa nhà Góc Tây 4 tầng, hoàn toàn độc lập với Nhà phố Cafe 3 tầng ($10{,}35\,\text{m}$).

### 3. Phân định cơ chế Collider: Mesh Visual vs Concrete StaticBody3D
* **Visual Mesh (`res://models/graybox_city_block.glb`):** Chỉ chứa hình học hiển thị PBR thô (`MeshInstance3D`), không bật chế độ tạo mesh trimesh collider tự động nhằm tiết kiệm bộ nhớ GPU và tránh giật lag physics.
* **Concrete Colliders (`StaticBody3D` - `CityStaticColliders`):** Được định nghĩa rõ ràng bằng các primitive shapes (`BoxShape3D`, `CylinderShape3D`) với kích thước khớp 100% theo số liệu thiết kế hình học.
* **Mối liên hệ tương lai (Milestone 3+):** Các asset khi đưa vào sản xuất sẽ được nhúng hậu tố `-col` hoặc `-colonly` trong Blender để Godot tự động tạo collider lồi (`ConvexPolygonShape3D`) hoặc hộp (`BoxShape3D`) đồng bộ cùng asset.

### 4. Kết quả thực thi bộ test va chạm mở rộng (Expanded Physics Suite)
Kịch bản kiểm thử chạy trực tiếp trên Godot Engine 4.7.2 Headless:
* **Test 1 — Hành lang vỉa hè $2{,}0\,\text{m}$ (Sidewalk Corridor):** Capsule người chơi ($R=0{,}30\,\text{m}$, $H=1{,}85\,\text{m}$) đi bộ $10\,\text{m}$ liên tục: **PASS** (Không va quệt chướng ngại vật hay bàn ghế).
* **Test 2 — Tường nhà phố Cafe (Wall Collision):** Di chuyển trực diện vào chân tường tại $Z=7{,}0\,\text{m}$: **PASS** (Chặn đứng tại $Z=7{,}0\,\text{m}$, vector pháp tuyến $(0, 0, -1)$ phản hồi chính xác, không xuyên tường).
* **Test 3 — Độ thông thủy Mái hiên Cafe (Awning Clearance):** Đáy mái hiên tại $+2{,}81\,\text{m}$, đỉnh đầu người chơi tại $+2{,}00\,\text{m}$: **PASS** (Khoảng hở an toàn $0{,}81\,\text{m}$, không kích hoạt va chạm trần).
* **Test 4 — Bậc vỉa hè $15\,\text{cm}$ (Curb Step Edge):** Thử nghiệm người chơi từ mặt đường bước ngang vào gờ vỉa hè: **PASS** (Cạnh đứng $15\,\text{cm}$ chặn ngang đúng thiết kế tại $Z=3{,}70\,\text{m}$).
* **Test 5 — Điểm thắt bàn ghế ngoài trời (Pinch Point):** Khoảng cách từ tim người chơi ($Z=4{,}70\,\text{m}$) đến bàn cafe ($Z=6{,}10\,\text{m}$, bán kính $0{,}40\,\text{m}$) tạo ra khe hở $0{,}70\,\text{m}$: **PASS** (Đầu dò $0{,}60\,\text{m}$ di chuyển tự do, không bị kẹt).

### 5. Giới hạn của Headless Test (Bắt buộc ghi nhận)
* Headless test chỉ chứng minh **tính đúng đắn của logic tính toán va chạm hình học và giải phương trình physics**.
* **CHƯA CHỨNG MINH** được độ êm ái thực tế (VR Comfort), hiện tượng say chuyển động (Sim Sickness), độ chính xác của 6-DoF tracking đầu/tay cầm, độ trễ motion-to-photon ($<20\,\text{ms}$) và cảm giác không gian (spatial perception) cho đến khi người dùng đeo kính Meta Quest 3 thật.

---

## II. XÁC MINH FILE APK ĐÃ EXPORT (SECTION B)

Đã thẩm định chuyên sâu file APK sản phẩm bằng bộ công cụ Android SDK chính thức (`aapt.exe`, `apksigner.bat`):

### 1. Thông tin định danh & Manifest
* **File APK:** `build/android/XE_RC_FPV_V18.apk`
* **Dung lượng:** `86,572,783 bytes` (~$82{,}56\,\text{MB}$)
* **Mã băm SHA256:** `f6287b1c5fd6f8735dce3703105bedf4601b61f4955443dd6980c5115840684d`
* **Package Unique Name:** `com.xercfpv.v10`
* **Version Code:** `18` | **Version Name:** `18.0.0`
* **Min SDK:** `24` (Android 7.0) | **Target SDK:** `36` (Android 16) | **Compile SDK:** `36`
* **Kiến trúc CPU Native:** `arm64-v8a` (64-bit chuẩn cho SoC Qualcomm Snapdragon XR2 Gen 2 trên Meta Quest 3).
* **Entry Point Activity:** `com.godot.game.GodotApp` (thông qua alias `com.godot.game.GodotAppLauncher`).
* **Cấu hình VR Intent trong AndroidManifest.xml:**
  * `com.oculus.intent.category.VR` (Bắt buộc để Horizon OS nhận diện app VR).
  * `org.khronos.openxr.intent.category.IMMERSIVE_HMD` (Chuẩn OpenXR Immersive HMD).
  * `com.oculus.vr.focusaware = true` (Hỗ trợ hệ thống focus aware của Meta).

### 2. Thư viện động OpenXR Native (.so) bên trong APK
File APK tích hợp đầy đủ 4 file thư viện native `arm64-v8a`:
1. `lib/arm64-v8a/libopenxr_loader.so` (Loader OpenXR chính thức của Khronos).
2. `lib/arm64-v8a/libgodotopenxrvendors.so` (Plugin Godot OpenXR Vendors cho Meta Quest).
3. `lib/arm64-v8a/libgodot_android.so` (Lõi engine Godot 4.7.2 biên dịch cho Android).
4. `lib/arm64-v8a/libc++_shared.so` (LLVM C++ standard runtime).

### 3. Tính hợp lệ của Chữ ký số (Signature & Certificate)
* **Phương thức ký:** APK Signature Scheme v2 (Chuẩn bảo mật Android hiện đại).
* **Chứng chỉ:** Keystore Debug chuẩn của Godot Engine (`CN=Godot, OU=Godot Engine, O=Stichting Godot, C=NL`).
* **Trạng thái xác thực:** `apksigner verify` trả về `Verifies: true`.

### 4. Kiểm tra tài nguyên Icon
* **Nguồn icon duy nhất:** `controller_godot/icon.png` ($192 \times 192\,\text{px}$).
* **Biên dịch trong APK:** Được chuyển đổi thành hệ thống Adaptive Icons đầy đủ mọi độ phân giải (`res/mipmap-hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`, `anydpi-v26/icon.xml`).

---

## III. SO SÁNH VÀ ĐỐI CHIẾU RENDERER (SECTION C)

Đã tạo riêng bản build thử nghiệm **Mobile Renderer** (`XE_RC_FPV_V18_mobile.apk`) để đối chiếu với bản chuẩn **gl_compatibility**:

| Tiêu chí kỹ thuật | Baseline (`gl_compatibility`) | Thử nghiệm (`mobile` - Vulkan) | Nhận xét & Đánh giá Staff Engineer |
| :--- | :--- | :--- | :--- |
| **API Đồ họa lõi** | OpenGL ES 3.0 | Vulkan Mobile (Vulkan 1.2+) | Cả 2 đều tương thích phần cứng Snapdragon XR2 Gen 2 |
| **File APK xuất ra** | `XE_RC_FPV_V18.apk` | `XE_RC_FPV_V18_mobile.apk` | Bản build hoàn tất sạch, không lỗi |
| **Dung lượng APK** | **86,572,783 bytes** (~$82{,}56\,\text{MB}$) | **90,316,399 bytes** (~$86{,}13\,\text{MB}$) | Bản Mobile lớn hơn ~$3{,}57\,\text{MB}$ do chứa mã nguồn Vulkan pipelines |
| **Mã SHA256** | `f6287b1c5fd6f8735dce3703105bedf4...` | `769a8c2a4fd40bd176b0e079e157baa0...` | Xác nhận 2 file nhị phân độc lập |
| **OpenXR Loader** | Khởi chạy native OpenXR driver | Khởi chạy native OpenXR driver | Cả hai đều có intent `IMMERSIVE_HMD` và `libopenxr_loader.so` |
| **Tính năng hình ảnh** | Phù hợp PBR cơ bản, tối giản chi phí đổ bóng | Hỗ trợ SSAO, Decals, Glow, GPU Particles, Clustered Lighting | Mobile mang lại chất lượng mỹ thuật PBR sâu hơn ở giai đoạn sau |
| **Khởi chạy Headless** | `Exit code: 0` (Passed 5/5 tests) | `Exit code: 0` (Passed 5/5 tests) | Logic physics và scene tree vận hành đồng nhất |
| **Hiệu năng & Pin trên Kính** | **NOT VERIFIED ON DEVICE** | **NOT VERIFIED ON DEVICE** | Chưa kết nối thiết bị Meta Quest 3 vật lý |

> [!IMPORTANT]
> **Quyết định kiến trúc:** Giữ nguyên `gl_compatibility` làm cấu hình mặc định trong [`controller_godot/project.godot`](file:///D:/XE_RC_FPV_V10/controller_godot/project.godot) nhằm đảm bảo tính ổn định tối đa cho phần điều khiển FPV/RC. Phương án Mobile renderer đã được chứng minh xuất APK thành công và sẵn sàng kích hoạt bất kỳ lúc nào khi bước vào giai đoạn nâng cấp vật liệu.

---

## IV. BẢNG PHÂN LOẠI TRẠNG THÁI NGHIỆM THU (VERIFICATION GATES)

| Hạng mục kiểm tra | Trạng thái | Minh chứng thực tế |
| :--- | :---: | :--- |
| **Bảo toàn Model Blender & GLB Baseline** | **PASS** | `calibration_gate.blend`, `graybox_city_block.blend` nguyên vẹn |
| **Quy ước trục Blender $\to$ glTF $\to$ Godot** | **PASS** | Tài liệu hóa quy ước cánh tay phải, chuyển đổi $+Z$ Up sang $+Y$ Up |
| **Đo Bounding Box & Chiều cao nhà phố** | **PASS** | Cafe cao $10{,}35\,\text{m}$; Tòa nhà Tây cao $11{,}65\,\text{m}$ |
| **Mô phỏng vật lý gờ vỉa hè & bàn ghế** | **PASS** | Passed 5/5 bài test va chạm trong Godot 4.7.2 |
| **Tính toàn vẹn của file APK (`XE_RC_FPV_V18.apk`)** | **PASS** | Đọc thành công qua `aapt`, `jar`, `apksigner` |
| **Khởi tạo và cấu hình Icon duy nhất** | **PASS** | `icon.png` $192 \times 192\,\text{px}$, map đầy đủ vào mipmap |
| **Thư viện OpenXR Native 64-bit** | **PASS** | Có đủ `libopenxr_loader.so`, `libgodotopenxrvendors.so` |
| **So sánh Renderer (Compatibility vs Mobile)** | **PASS** | Cả 2 đều export thành công APK độc lập có chữ ký hợp lệ |
| **Vận hành thực tế trên kính Meta Quest 3** | **NOT VERIFIED** | `adb devices -l` trả về rỗng; chưa kết nối kính vật lý |

---

## V. ĐỀ XUẤT NỘI DUNG CHO BƯỚC TIẾP THEO (MILESTONE 3: VERTICAL SLICE)

Sau khi được phê duyệt báo cáo Milestone 2.1, giai đoạn tiếp theo sẽ tập trung vào việc hiện thực hóa **Khu phố mẫu (Vertical Slice)** với độ hoàn thiện cao, gồm:
1. **Kiến trúc & Đường phố:** Hoàn thiện 1 block nhà phố Shophouse phong cách hiện đại Việt Nam (PBR materials, ban công, cục nóng điều hòa, dây điện, biển hiệu cafe có đèn, vỉa hè lát đá terazzo chống trơn).
2. **Khu vực công viên mini:** Đoạn vỉa hè mở rộng có cây xanh bóng mát, bồn hoa, ghế đá công viên, trạm chờ xe buýt có bảng thông tin.
3. **Mô phỏng đời sống đô thị độc lập (Autonomous Simulation):**
   * 1 tuyến xe buýt/ô tô chạy tự động theo làn $OX$.
   * 2 NPC đi bộ ngẫu nhiên trên hành lang vỉa hè $2{,}0\,\text{m}$ có animation lặp và cảm biến né chướng ngại vật.
   * 1 động vật nhỏ (chó/mèo) đi dạo trong khuôn viên công viên.
4. **Hệ thống di chuyển góc nhìn thứ nhất (VR Pedestrian Rig):** Tích hợp chuyển động Smooth Locomotion + Snap Turn bằng cần điều khiển Thumbstick, đồng thời khóa tracking tự nhiên của kính Quest 3.
