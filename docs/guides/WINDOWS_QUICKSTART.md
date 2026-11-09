# Windows V10 quick-start

## A. Desktop + direct camera

```powershell
cd D:\XE_RC_FPV_V10
.\scripts\doctor.cmd
.\scripts\run_desktop.cmd
```

The desktop Godot scene defaults to the V0 protocol:
- car: 192.168.4.1:4210 UDP
- camera: 192.168.4.102:4212 UDP
- camera sends JPEG after HELLO

## B. Relay + browser/WebXR

PC should be connected to the `FPV_RC_CAR` AP.

```powershell
cd server
npm install
npm test
npm start
```

Open:

```text
http://<PC-IP>:3000/
```

Quest Browser:
1. Join the same Wi-Fi/AP.
2. Open the URL.
3. Press Enter VR.
4. Accept immersive-vr.

## C. Quest APK

Install:
- Godot 4.7.x stable
- OpenJDK 17
- Android Studio / Android SDK
- Android platform-tools / adb
- Godot Android export templates

Open `controller_godot/`, then:

```powershell
.\scripts\build_android.cmd
adb devices
adb install -r .\build\android\XE_RC_FPV_V10.apk
```

The Android preset is OpenXR, arm64, immersive and INTERNET-enabled.

For direct UDP VR:
- Quest joins `FPV_RC_CAR`
- keep `video_source = 0` in `rc_fpv_v10.gd`
- camera remains `192.168.4.102`

For relay WebSocket VR:
- set `video_source = 1`
- set `relay_url`
- use `wss://...` for Internet/TLS; use `ws://...` only on trusted local LANs where Android allows cleartext traffic.
