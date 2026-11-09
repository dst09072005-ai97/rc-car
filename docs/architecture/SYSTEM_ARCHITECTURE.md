# KIẾN TRÚC KỸ THUẬT HỆ THỐNG TOÀN DIỆN (SYSTEM ARCHITECTURE SPECIFICATION)

**Dự án:** Autonomous VR City Simulator & Living Urban Twin  
**Phiên bản:** 2.1 (Kiến trúc Hợp nhất Sau Hardening)  
**Tác giả:** Principal Systems & VR Architect

---

## I. TỔNG QUAN KIẾN TRÚC ĐA TẦNG (MULTI-TIER ARCHITECTURE)

Hệ thống được tổ chức thành 4 phân tầng độc lập với ranh giới trách nhiệm (separation of concerns) rõ ràng:

```mermaid
flowchart TD
    subgraph DCC_Layer ["1. Tầng Tạo Tài Nguyên (Blender 5.2 DCC)"]
        BlenderScript["Script Tự Động Hóa<br>blender_scripts/generate_...py"]
        BlendFiles["File Nguồn Thiết Kế<br>models/*.blend"]
        GLBExport["Xuất Chuẩn glTF 2.0 (GLB)<br>1:1 Metric | PBR | Y-Up"]
        BlenderScript --> BlendFiles --> GLBExport
    end

    subgraph Runtime_Target ["2. Tầng Thực Thi VR Chính (Meta Quest 3 APK)"]
        GodotEngine["Godot Engine 4.7.2 Native C++"]
        OpenXR["Khronos OpenXR 1.1 Loader<br>(libopenxr_loader.so)"]
        GodotPhysics["Godot Physics 3D<br>CharacterBody3D + StaticBody3D"]
        RenderPipeline["Pipeline Đồ Họa<br>gl_compatibility (Baseline) / Mobile Vulkan"]
        GodotEngine --> OpenXR
        GodotEngine --> GodotPhysics
        GodotEngine --> RenderPipeline
    end

    subgraph Preview_Layer ["3. Tầng Xem Nhanh & Điều Khiển FPV (Web)"]
        ThreeJS["Three.js WebXR Client<br>www/app.js"]
        HTMLUI["Buồng Lái FPV & UI 9:16 / 16:9<br>www/index.html"]
        ThreeJS --- HTMLUI
    end

    subgraph Hardware_IoT ["4. Tầng Kết Nối Phần Cứng & Dịch Vụ Mạng"]
        NodeServer["Node.js Backend Server<br>server/server.js (Port 8080)"]
        ESP32["Xe Điều Khiển ESP32-CAM<br>(WebSocket Telemetry & MJPEG Stream)"]
        NodeServer <--> ESP32
        NodeServer <--> ThreeJS
        NodeServer -.-> GodotEngine
    end

    GLBExport -->|Đồng bộ tự động| GodotEngine
    GLBExport -->|Đồng bộ tự động| ThreeJS
```

---

## II. QUẢN LÝ DÒNG CHẢY DỮ LIỆU & GIAO THỨC TRUYỀN THÔNG (DATA FLOWS)

1. **Pipeline Asset 3D:**
   * `Blender 5.2` (Hệ trục $+Z$ Up) $\xrightarrow{\text{export\_yup=True}}$ `GLB` (Hệ trục $+Y$ Up, Forward $-Z$) $\xrightarrow{\text{Auto Import}}$ `Godot Engine 4.7.2` & `Three.js`.
   * Toàn bộ mesh geometry, UVs, và PBR parameters được bảo toàn tuyệt đối không suy hao.
2. **Kênh Điều Khiển Telemetry (IoT / RC Car):**
   * Người dùng thao tác vô lăng/cần số trên giao diện web hoặc controller VR $\to$ Đóng gói JSON telemetry $\to$ Gửi qua WebSocket tới `server.js` (Port 8080) $\to$ Chuyển tiếp tới vi điều khiển ESP32 trên xe mô hình.
3. **Kênh Hình Ảnh FPV Thời Gian Thực:**
   * Camera OV2640 trên ESP32 bắt hình ảnh $\to$ Bắn stream MJPEG qua HTTP/TCP $\to$ `server.js` phân phối tới màn hình buồng lái ảo trong không gian 3D.

---

## III. RANH GIỚI BẢO MẬT VÀ QUYỀN HẠN ANDROID (SECURITY & BOUNDARIES)

* **Nguyên tắc Đặc quyền Tối thiểu (Least Privilege):** 
  * APK chỉ yêu cầu quyền mạng `android.permission.INTERNET` để kết nối WebSocket cục bộ và quyền OpenXR (`org.khronos.openxr.permission.OPENXR`).
  * Tuyệt đối không yêu cầu các quyền nhạy cảm như đọc danh bạ, vị trí GPS, micro hoặc bộ nhớ ngoài của người dùng.
* **Môi trường Sandbox Android:**
  * File APK chạy trong sandbox tiêu chuẩn của Horizon OS. Cấu hình `application-debuggable` cho phép phân tích log qua `adb logcat` nhưng không mở cổng dịch vụ ra ngoài mạng công cộng.
