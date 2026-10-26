---
name: meta-quest-webxr
description: Quản lý vòng đời WebXR Session, Controller/Hand Tracking, Spatial UI 3D và tối ưu 72Hz/90Hz trên Meta Quest 3.
---
# Skill: Meta Quest 3 WebXR & Spatial Engineering

## Điều kiện kích hoạt
Kích hoạt khi chỉnh sửa logic `navigator.xr`, `renderer.xr`, tay cầm Touch Plus, Hand Tracking, Spatial UI hoặc tối ưu FPS trong `app.js`.

## Quy tắc kỹ thuật bắt buộc
1. **Capability Detection**: Luôn kiểm tra `window.isSecureContext` và `await navigator.xr.isSessionSupported('immersive-vr')` trước khi gọi `requestSession`.
2. **Session Visibility Fail-safe**: Lắng nghe sự kiện `visibilitychange` trên `XRSession`. Khi `visibilityState !== 'visible'`, phải ngắt ga (`throttlePercent = 0`, `velocityMs = 0`) và tắt còi xe.
3. **World-Space Spatial UI**: Không dựa vào DOM `position: fixed` khi đang ở chế độ `immersive-vr` (nếu không bật `dom-overlay`). Mọi thao tác thiết yếu (Thoát VR, Comfort Mode, Snap Turn) phải có nút 3D trong `spatialUiGroup`.
4. **Performance Budget**:
   - 72 Hz: `<= 13.9 ms/frame`
   - 90 Hz: `<= 11.1 ms/frame`
   - Tái sử dụng biến tạm `_tmpMat4`, `_tmpVec3A`, `_tmpEuler` trong vòng lặp raycast.

## Kiểm thử & Điều kiện hoàn tất
- Chạy `node tools/xr-doctor.js` đạt `PASS` toàn bộ các mục kiểm tra tĩnh.
- Kiểm tra `window.__XR_PERF_METRICS__` và `window.__XR_DIAGNOSTICS__` trên trình duyệt không báo lỗi Console.
