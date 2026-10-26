# V10 verification report

Date: 2026-10-08

Passed in the build environment:
- Node.js `node --check server/server.js`
- Browser/WebXR JavaScript `node --check server/public/app.js`
- `npm test` in `server/`
- `python scripts/verify_v10.py`

Not executable in this environment:
- Godot 4.7.x editor/import
- Android APK export
- adb deployment to a physical Meta Quest/Pico device
- physical ESP32 camera/car hardware

Therefore the ZIP is a **source-complete V10 build**, not a claim that an APK was physically flashed and tested here.
