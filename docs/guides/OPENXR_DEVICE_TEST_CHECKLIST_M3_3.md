# MILESTONE 3.3 — META QUEST 3 ON-DEVICE TEST CHECKLIST & RUNBOOK

**Target Hardware:** Meta Quest 3 Standalone HMD (Snapdragon XR2 Gen 2, Meta Horizon OS)  
**Package Name:** `com.xercfpv.v10`  
**Main Activity:** `com.godot.game.GodotApp`  

---

## 1. Prerequisites & Terminal Commands

### Step A: Build Android APK
Run this command in your VS Code PowerShell terminal:
```powershell
& "D:\XE_RC_FPV_V10\Godot_v4.7.2-stable_win64_console.exe" --headless --path "D:\XE_RC_FPV_V10\controller_godot" --export-debug "Android Quest" "D:\XE_RC_FPV_V10\build\android\XE_RC_FPV_M3_3_debug.apk"
```

### Step B: Connect Quest 3 & Verify ADB Connection
Connect Meta Quest 3 via USB-C cable (ensure Developer Mode is enabled in Meta Quest mobile app):
```powershell
adb devices
```
*Expected output: A device serial number followed by `device` (not `unauthorized` or `offline`).*

### Step C: Install the New APK
```powershell
adb install -r "D:\XE_RC_FPV_V10\build\android\XE_RC_FPV_M3_3_debug.apk"
```

### Step D: Stream & Filter Logcat in Real Time
Before launching the app, start capturing logs filtered to Godot and OpenXR:
```powershell
adb logcat -c
adb logcat -s godot:I OpenXR:I ActivityManager:I | Select-String "XR_BOOTSTRAP|OpenXR|Godot"
```

### Step E: Launch Application on Headset
Either click on the app icon in Quest 3 Unknown Sources / App Library, or run:
```powershell
adb shell am start -n com.xercfpv.v10/com.godot.game.GodotApp
```

---

## 2. Expected Runtime Log Markers (Truth Protocol)

When the application boots on Meta Quest 3, observe the exact sequential log markers:

| Stage | Expected Log Marker | Meaning |
|---|---|---|
| 1 | `XR_BOOTSTRAP: START — Autonomous VR City Milestone 3.3` | Script entry point executed |
| 2 | `XR_BOOTSTRAP: XR_INTERFACE_FOUND: OpenXR` | Godot OpenXR module loaded successfully |
| 3 | `XR_BOOTSTRAP: OPENXR_INITIALIZED` or `OPENXR_ALREADY_INITIALIZED_BY_ENGINE` | OpenXR session established with Oculus runtime |
| 4 | `XR_BOOTSTRAP: VIEWPORT_USE_XR_ENABLED: true` | Main viewport switched to stereoscopic VR pipeline |
| 5 | `XR_BOOTSTRAP: CAMERA_RIG_VERIFIED: /root/VerticalSliceCityM3/PlayerBody/XROrigin3D/XRCamera3D` | XR camera rig linked |
| 6 | `XR_BOOTSTRAP: WORLD_LOADED: res://models/vertical_slice_city_block.glb` | 1:1 metric city model loaded into world |
| 7 | `XR_BOOTSTRAP: RUNTIME_READY (xr_active=true, viewport_use_xr=true)` | Immersive 6DoF stereo rendering active |

### Failure Markers to Watch Out For:
- `XR_BOOTSTRAP: OPENXR_INITIALIZATION_FAILED` -> OpenXR runtime refused initialization (check Guardian boundary / permissions).
- `XR_BOOTSTRAP: FATAL_XR_NOT_AVAILABLE` -> OpenXR library missing from package or unsupported OS.

---

## 3. Physical In-Headset Visual & Locomotion Acceptance Criteria

| Criteria | True Stereoscopic 6DoF VR (PASS) | Flat Desktop/Panel Fallback (FAIL) |
|---|---|---|
| **Immersion** | The user is physically standing inside the 3D Vietnamese street. Surrounding buildings, sidewalk pavers, trees, and sky enclose the player 360°. | A rectangular 2D floating panel appears inside the Quest Home environment (Oculus Dashboard visible behind). |
| **Stereoscopy** | Disparity between left and right eye provides true depth perception (3D stereoscopic view). | Both eyes see an identical flat 2D screen without stereoscopic depth. |
| **Head Movement (6DoF)** | Moving head forward/backward, tilting, or crouching shifts the perspective naturally with 1:1 physical tracking. | Head translation does not alter parallax or position inside the world. |
| **Locomotion** | Pushing left thumbstick moves the player character along the sidewalk; right thumbstick snaps 45° rotation. | Controllers act as laser pointers clicking on a flat 2D surface. |
| **Dynamic World** | Sedan drives along lane X=+1.75m with spinning wheels; pedestrians patrol sidewalk; street dog animates in park. | Static or non-interactive flat image. |

---

## 4. Troubleshooting Runbook

1. **App opens in 2D panel rather than immersive mode:**
   - Verify `IMMERSIVE_HMD` in exported APK:
     ```powershell
     & "C:\Users\ADMIN\AppData\Local\Android\Sdk\build-tools\35.0.1\aapt2.exe" dump xmltree "D:\XE_RC_FPV_V10\build\android\XE_RC_FPV_M3_3_debug.apk" --file AndroidManifest.xml | Select-String "IMMERSIVE_HMD"
     ```
   - If missing, check `controller_godot/android/build/src/main/AndroidManifest.xml` and re-export.
2. **Black screen or Guardian boundary prompt:**
   - Ensure Meta Quest 3 boundary / passthrough is active. OpenXR pauses rendering if boundary is not established.
3. **Crash on launch:**
   - Run `adb logcat -d > crash_log.txt` and search for `fatal signal` or `godot`. Verify ARM64 architecture is enabled in `export_presets.cfg`.
