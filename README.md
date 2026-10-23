# 🥽 Meta Quest 3 WebXR Rolls-Royce Simulator & ESP32 Dual Camera Twin

A high-performance WebXR 6DoF simulation built for the **Meta Quest Browser** (72Hz / 90Hz) with 2D/3D fallback modes for desktop and mobile, integrated with physical RC hardware telemetries, dual ESP32-CAM video streaming, and multiplayer room synchronization.

---

## 🌟 Key Features

* **Meta Quest 3 Immersive WebXR (6DoF)**:
  * Hand Tracking & Quest Touch Controller integration.
  * Virtual steering wheel & pedal grab interaction.
  * Spatial world-space UI & cockpit diagnostics HUD.
  * Optimized PCF shadow pipeline and zero per-frame allocation architecture.
* **Dual ESP32-CAM Live Video Stream**:
  * Front camera streaming onto the 3D windshield in real-time.
  * Rear reverse camera (`esp32_rear_cam`) with automatic gear trigger (`R`).
  * Direct zero-latency hardware JPEG / RGB565 decoding via `createImageBitmap`.
* **Multiplayer Room & Telemetry Server**:
  * Node.js Express & WebSocket relay (`server.js`).
  * SSRF-protected proxy pipelines for ESP32 and YouTube streams.
  * Automatic orphan vehicle garbage collection on disconnect.
  * UDP Telemetry listener (port 4210) for physical RC vehicle integration.
* **Procedural 3D Environment**:
  * Complete procedural Rolls-Royce Ghost interior and exterior.
  * Procedural city blocks, roads, sidewalks, traffic lights, and NPC vehicles.
  * Active social pedestrians, emergency vehicles, and transit buses.

---

## 🛠️ Project Structure

```text
├── app.js                   # Primary Three.js WebXR scene, physics & VR loop
├── index.html               # 2D/3D switcher UI, HUD controls & styling
├── server.js                # Express HTTP/HTTPS, WebSocket & UDP telemetry relay
├── youtube-dom-extractor.js # Multi-screen YouTube/MP4 synchronization
├── AndroidManifest.xml      # Capacitor 2D panel packaging manifest
├── dist/                    # Built APK packages and distributions
├── esp32_rear_cam/          # ESP32-CAM firmware (Rear camera stream)
├── esp32_car_controller/    # ESP32 RC vehicle motor & steering firmware
├── esp32_raw_rgb565/        # ESP32 RAW RGB565 high-framerate stream firmware
├── libs/                    # Local Three.js and add-on libraries
├── models/                  # Calibration and benchmark GLB assets
└── v2/                      # Baseline backups, blender pipelines & QA audit tools
```

---

## 🚀 Quick Start

### 1. Start Relay Server
```bash
# Start the HTTP server on port 8080 and HTTPS on port 8443
node server.js
```

### 2. Launch in Meta Quest Browser
1. Connect Meta Quest 3 to the same Wi-Fi network as your host PC.
2. Open Meta Quest Browser and navigate to:
   ```text
   https://<YOUR_LOCAL_IP>:8443
   ```
3. Click **"VÀO THẾ GIỚI 360° VR"** on the top toolbar to enter immersive 6DoF WebXR mode.

### 3. Verify Engineering Matrix
Run the project automated doctor to verify static syntax, SSRF security, and WebXR conformance:
```bash
node v2/golden_baseline_v2_20261020/tools/xr-doctor.js
```

---

## 📜 License
MIT License.
