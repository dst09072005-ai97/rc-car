# Meta / Muse / XR research note — 2026-10-08

## Kết luận ngắn

Tên “Muse SDK” dễ gây nhầm:

- `facebookincubator/muse-gadget-sdk` là SDK open-source cho **Muse gadgets**: ESP32 hoặc Linux device, màn hình, cảm biến, actuator. Nó không phải Quest VR renderer.
- `meta-quest/agentic-tools` là bộ agent skills/MCP dành cho phát triển Meta Quest/Horizon OS.
- `meta-quest/Meta-VR-OS-SDK-Samples` là sample cho Meta VR OS JSDK/NSDK.
- Đường abstraction thích hợp cho ứng dụng VR đa thiết bị là **OpenXR**.

## Pattern được áp dụng vào V10

### 1. Abstraction first

VR presentation không khóa vào API riêng của một hãng. V10 dùng OpenXR ở Godot và WebXR ở browser.

### 2. Native + Web fallback

- Native OpenXR APK: độ trễ render và integration tốt hơn.
- WebXR: không cần cài APK, phù hợp share QR.

### 3. Source-of-truth / evidence

V0 được giữ trong `v0_baseline/`. Firmware V10 copy nguyên trạng để tránh “sửa nhầm thứ đang chạy”.

### 4. Feature boundary

Meta-specific extensions không được bật chỉ để “có vẻ VR”. Chúng chỉ cài khi cần hand tracking/passthrough/vendor features.

## Nguồn ngoài

- Godot 4.7 XR setup: OpenXR là API chuẩn, project cần bật `XR > OpenXR`, scene tối thiểu cần `XROrigin3D` + `XRCamera3D`.
- Godot Android XR deployment: Android build cần OpenJDK 17, Android SDK, và export preset OpenXR; vendor plugin từ Godot 4.6 trở đi là optional/recommended.
- Meta Quest OpenXR documentation: Quest là OpenXR adopter.
- Godot OpenXR Vendors 5.1.0: vendor extensions cho Meta/Pico/Android XR.
