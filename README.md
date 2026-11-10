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
├── www/                     # WebXR 6DoF Client (app.js, index.html, fpv-cam.html, models, libs)
├── server/                  # Backend Express HTTP/HTTPS, WebSocket Relay & UDP Telemetry
├── config/                  # Configuration templates (.env.example, wifi_credentials.h.example)
├── meta_quest_3/            # Quest 3 Android ecosystem, Capacitor wrapper & build scripts
├── firmware/                # ESP32 firmware (esp32_car_controller, esp32_rear_cam, esp32_raw_rgb565)
├── models/                  # Source Blender 3D models (.blend)
├── blender_scripts/         # Automated Blender Python rendering & asset pipeline
├── controller_godot/        # Godot Desktop FPV control station
├── tools/                   # XR-Doctor verification gate, certificate & bridge utilities
├── docker/                  # Docker containerization scripts (entrypoint.sh)
└── docs/                    # Technical architecture, guides, reports & research
```

---

## 🚀 Quick Start

### Option A: Run via Docker (Recommended for Colleagues & Production)
```bash
# Start all services with one command:
docker compose up -d --build

# View logs:
docker compose logs -f

# Stop services:
docker compose down
```
> See [`docs/guides/DOCKER_GUIDE.md`](file:///d:/XE_RC_FPV_V10/docs/guides/DOCKER_GUIDE.md) for full deployment details.

### Option B: Run Locally on Host
```bash
# 1. Start Server (HTTP: 8080, HTTPS: 8443, UDP: 4210, 4213)
npm start

# 2. Run Verification Gate
npm run doctor
```

### 3. Launch in Meta Quest Browser
1. Connect Meta Quest 3 to the same Wi-Fi network as the server host.
2. Open Meta Quest Browser and navigate to:
   ```text
   https://<YOUR_LOCAL_IP>:8443/?vr=immersive
   ```
3. Click **"BẮT ĐẦU WEBXR"** to enter immersive 6DoF WebXR mode.

### 4. Phone FPV Camera (Optional Phone-as-Camera)
Open mobile browser (Safari/Chrome) and navigate to:
```text
https://<YOUR_LOCAL_IP>:8443/fpv-cam.html
```

---

## 🔬 Verification Gate
Run the automated technical verification suite:
```bash
node tools/xr-doctor.js
```

---

## 📜 License
MIT License.
