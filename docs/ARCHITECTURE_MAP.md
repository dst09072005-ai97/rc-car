# RC FPV architecture map

## Entry points

- `www/index.html` loads `styles/main.css`, the Three.js import map and the browser modules in order: `ui-bootstrap.js`, `app.js`, `youtube-dom-extractor.js`.
- `www/app.js` owns WebXR initialization, scene and shared state, and `renderer.setAnimationLoop()`. Domain modules receive scene objects through context parameters and read replaceable references through accessors.
- `www/fpv-cam.html` publishes and views phone FPV over HTTPS. Its service worker owns the phone FPV cache.
- `server/server.js` wires Express, HTTP, HTTPS, WebSocket rooms and UDP. SIGINT and SIGTERM flush pending battery persistence and stop the tunnel.

## WebSocket messages

| Area | Messages and purpose |
| --- | --- |
| Rooms and seats | `PLAYER_HELLO`, `WELCOME`, `SERVER_LAN_INFO`, `PLAYER_SYNC`, `CAR_SYNC`, `WORLD_STATE`, `ROOM_SYNC`, `ENTER_CAR`, `EXIT_CAR`, `SWAP_SEAT`, `SEAT_ASSIGNED` synchronize players, cars and seat ownership. |
| Controls | `CAR_CONTROL`, `RC_CONTROL_CMD`, `WHEEL_BRIDGE_INPUT`, `WHEEL_BRIDGE_STATE`, `QUEST_STATUS_UPDATE` carry driving input, wheel state and Quest status. |
| Cameras | `FPV_PHONE_PUBLISHER_INIT`, `FPV_PHONE_PUBLISHER_ACK`, `FPV_SWITCH_CAMERA`, `SWITCH_FPV_SURFACE`, `FPV_HOT_SWAP_ACTIVE` handle phone connection and routing. `ESP32_CAM_UPDATE`, `CAM_IP_UPDATED`, `ESP32_CAM_FRAME_RELAY` carry legacy camera updates and frames. |
| Hardware | `SET_ESP32_CAR_IP`, `ESP32_CAR_STATUS`, `RC_HARDWARE_TELEMETRY`, `TEST_ESP32_MOTOR`, `TEST_ESP32_PULSE` handle hardware configuration, testing and feedback. |
| Battery | `BATTERY_GET`, `BATTERY_SELECT`, `BATTERY_RECHARGE`, `BATTERY_SET_TRACKING`, `BATTERY_SETUP_PROFILE`, `BATTERY_RESET_PROFILE`, `BATTERY_START_CALIBRATION`, `BATTERY_TOGGLE_PAUSE`, `BATTERY_FINISH_CALIBRATION`, `BATTERY_CANCEL_CALIBRATION`, `BATTERY_DELETE_RUN`. Responses use `BATTERY_STATE` and `BATTERY_ACTION_RESULT`. |
| World and media | `FIRE_EXTINGUISH`, `AMBULANCE_RESCUE` carry dispatch events. `YT_MULTISCREEN_SYNC` carries media selection. |

Phone video uses JPEG frames prefixed with `52 43 46 <surface>` in hexadecimal. Surface `01` is front and `02` is rear. Untagged legacy JPEG follows the front-camera path.

## UDP 4210

- Incoming JSON provides Digital Twin speed, steering, gear, RPM and pose. `ESP32_CAM` / `ESP32_ANNOUNCE` and `ESP32_CAR` / `ESP32_CAR_ANNOUNCE` advertise endpoints.
- Outbound commands contain two little-endian signed 16-bit values. Offset 0 holds the steering angle in degrees. Offset 2 holds the ESC pulse in microseconds, with 1500 microseconds neutral.
- `sendRateLimitedEsp32Udp` applies wheel priority and pulse slew limiting. The USB wheel priority window is 350 ms. Discovery sends the initial neutral pulse to a newly detected controller.

## Verification gate

Run from the repository root in PowerShell.

```powershell
$files = @('server/server.js', 'server/rc-battery-estimator.js', 'www/app.js', 'www/youtube-dom-extractor.js') + @(Get-ChildItem server/modules,www/modules -Filter *.js | ForEach-Object FullName)
foreach ($file in $files) { node --check $file; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
node server/tests/test_battery_estimator.js
node server/tests/test_contract.js
node tools/xr-doctor.js
git diff --check
```

The XR doctor must report Runtime Integrity as VERIFIED. Use Meta Quest Browser over HTTPS for headset frame rate, controllers and physical camera checks.

## File inventory

Counts are physical text lines. Binary assets use a dash.


| Path | Lines | Responsibility |
| --- | ---: | --- |
| server/.env.example | 8 | Sample server environment configuration. |
| server/README.md | 13 | Server setup and operation notes. |
| server/modules/fpv-tunnel-manager.js | 158 | DuckDNS updates, Cloudflare process and terminal QR. |
| server/modules/network-utils.js | 89 | LAN discovery, environment lookup and camera QR SVG. |
| server/modules/ssrf-guard.js | 85 | Proxy target validation and numeric input bounds. |
| server/modules/udp-rc-arbiter.js | 813 | UDP discovery, telemetry, arbitration and native wheel bridge. |
| server/modules/youtube-resolver.js | 103 | yt-dlp and Innertube stream resolution. |
| server/package-lock.json | 1220 | Pinned server dependency tree. |
| server/package.json | 20 | Server scripts and dependencies. |
| server/public/app.js | 25116 | Fallback public cockpit client. |
| server/public/fpv-cam.html | 519 | Fallback public phone camera page. |
| server/public/index.html | 1729 | Fallback public cockpit markup. |
| server/public/style.css | 18 | Fallback public cockpit styles. |
| server/public/youtube-dom-extractor.js | 548 | Fallback public YouTube client. |
| server/rc-battery-estimator.js | 431 | Four battery profiles, estimation, calibration and atomic persistence. |
| server/rc-bridge-adapter.js | 458 | Adapter for RC bridge integrations. |
| server/server.js | 2224 | Express, HTTP, HTTPS, WebSocket rooms and service lifecycle. |
| server/tests/test_battery_estimator.js | 139 | Estimation, calibration and persistence tests. |
| server/tests/test_contract.js | 35 | Cross-component contract checks. |
| www/README.md | 16 | Web client notes. |
| www/app.js | 16823 | WebXR, shared scene state, multiplayer and render wiring. |
| www/fpv-cam.html | 2928 | Phone camera publisher, viewer and capture controls. |
| www/fpv-manifest.json | 26 | Phone FPV PWA install metadata. |
| www/fpv-sw.js | 56 | Network-first cache for the phone FPV PWA. |
| www/icons/fpv-icon-192.png | - | 192-pixel FPV PWA icon. |
| www/icons/fpv-icon-512.png | - | 512-pixel FPV PWA icon. |
| www/index.html | 667 | Cockpit, HUD, four-tab settings and import map. |
| www/models/calibration_gate.glb | - | WebXR calibration gate asset. |
| www/models/graybox_city_block.glb | - | WebXR graybox city block asset. |
| www/models/humanoid_pilot.glb | - | WebXR humanoid pilot asset. |
| www/models/pilot_cockpit_interaction.glb | - | WebXR pilot cockpit interaction asset. |
| www/models/rc_rally_car_detail.glb | - | WebXR rc rally car detail asset. |
| www/models/rolls_royce_cabin.glb | - | WebXR rolls royce cabin asset. |
| www/models/vertical_slice_city_block.glb | - | WebXR vertical slice city block asset. |
| www/modules/battery-ui.js | 196 | Four-profile battery actions, calibration, history and HUD strip. |
| www/modules/garage-vehicles.js | 624 | Three garage bays, vehicle selection, paint and bodywork. |
| www/modules/phone-fpv-cam.js | 424 | Phone hub, binary JPEG routing and front and rear camera sockets. |
| www/modules/settings-ui.js | 278 | Settings, speed preference and multiplayer QR helpers. |
| www/modules/ui-bootstrap.js | 327 | Browser startup bindings, device layout and lazy Supabase sync. |
| www/modules/vehicle-control.js | 3127 | V185 control, V260 dashboard, unified controls and V504 Quest driving. |
| www/modules/wheel-gog808.js | 1152 | Wheel and pedal input, calibration and V260 worker. |
| www/modules/world-npcs.js | 3111 | Traffic, NPC cabin occupants and city emergency scenes. |
| www/poc-quest3-dom-overlay.html | 454 | Standalone Meta Quest DOM overlay proof of concept. |
| www/styles/main.css | 870 | Cockpit, desktop and responsive styles in cascade order. |
| www/textures/wheel_car.png | - | Steering wheel texture. |
| www/youtube-dom-extractor.js | 548 | YouTube and MP4 search, extraction, playback and sync. |

<details>
<summary>Vendored Three.js files (583)</summary>

| Path | Lines | Responsibility |
| --- | ---: | --- |
| www/libs/three/addons/Addons.js | 295 | Vendored Three.js Addons dependency. |
| www/libs/three/addons/animation/AnimationClipCreator.js | 116 | Vendored Three.js AnimationClipCreator dependency. |
| www/libs/three/addons/animation/CCDIKSolver.js | 484 | Vendored Three.js CCDIKSolver dependency. |
| www/libs/three/addons/animation/MMDAnimationHelper.js | 1207 | Vendored Three.js MMDAnimationHelper dependency. |
| www/libs/three/addons/animation/MMDPhysics.js | 1406 | Vendored Three.js MMDPhysics dependency. |
| www/libs/three/addons/cameras/CinematicCamera.js | 208 | Vendored Three.js CinematicCamera dependency. |
| www/libs/three/addons/capabilities/WebGL.js | 108 | Vendored Three.js WebGL dependency. |
| www/libs/three/addons/capabilities/WebGPU.js | 57 | Vendored Three.js WebGPU dependency. |
| www/libs/three/addons/controls/ArcballControls.js | 3224 | Vendored Three.js ArcballControls dependency. |
| www/libs/three/addons/controls/DragControls.js | 282 | Vendored Three.js DragControls dependency. |
| www/libs/three/addons/controls/FirstPersonControls.js | 325 | Vendored Three.js FirstPersonControls dependency. |
| www/libs/three/addons/controls/FlyControls.js | 326 | Vendored Three.js FlyControls dependency. |
| www/libs/three/addons/controls/MapControls.js | 28 | Vendored Three.js MapControls dependency. |
| www/libs/three/addons/controls/OrbitControls.js | 1532 | Vendored Three.js OrbitControls dependency. |
| www/libs/three/addons/controls/PointerLockControls.js | 162 | Vendored Three.js PointerLockControls dependency. |
| www/libs/three/addons/controls/TrackballControls.js | 828 | Vendored Three.js TrackballControls dependency. |
| www/libs/three/addons/controls/TransformControls.js | 1573 | Vendored Three.js TransformControls dependency. |
| www/libs/three/addons/csm/CSM.js | 384 | Vendored Three.js CSM dependency. |
| www/libs/three/addons/csm/CSMFrustum.js | 152 | Vendored Three.js CSMFrustum dependency. |
| www/libs/three/addons/csm/CSMHelper.js | 193 | Vendored Three.js CSMHelper dependency. |
| www/libs/three/addons/csm/CSMShader.js | 295 | Vendored Three.js CSMShader dependency. |
| www/libs/three/addons/curves/CurveExtras.js | 422 | Vendored Three.js CurveExtras dependency. |
| www/libs/three/addons/curves/NURBSCurve.js | 80 | Vendored Three.js NURBSCurve dependency. |
| www/libs/three/addons/curves/NURBSSurface.js | 52 | Vendored Three.js NURBSSurface dependency. |
| www/libs/three/addons/curves/NURBSUtils.js | 542 | Vendored Three.js NURBSUtils dependency. |
| www/libs/three/addons/curves/NURBSVolume.js | 62 | Vendored Three.js NURBSVolume dependency. |
| www/libs/three/addons/effects/AnaglyphEffect.js | 154 | Vendored Three.js AnaglyphEffect dependency. |
| www/libs/three/addons/effects/AsciiEffect.js | 263 | Vendored Three.js AsciiEffect dependency. |
| www/libs/three/addons/effects/OutlineEffect.js | 539 | Vendored Three.js OutlineEffect dependency. |
| www/libs/three/addons/effects/ParallaxBarrierEffect.js | 119 | Vendored Three.js ParallaxBarrierEffect dependency. |
| www/libs/three/addons/effects/PeppersGhostEffect.js | 153 | Vendored Three.js PeppersGhostEffect dependency. |
| www/libs/three/addons/effects/StereoEffect.js | 55 | Vendored Three.js StereoEffect dependency. |
| www/libs/three/addons/environments/DebugEnvironment.js | 52 | Vendored Three.js DebugEnvironment dependency. |
| www/libs/three/addons/environments/RoomEnvironment.js | 148 | Vendored Three.js RoomEnvironment dependency. |
| www/libs/three/addons/exporters/DRACOExporter.js | 267 | Vendored Three.js DRACOExporter dependency. |
| www/libs/three/addons/exporters/EXRExporter.js | 579 | Vendored Three.js EXRExporter dependency. |
| www/libs/three/addons/exporters/GLTFExporter.js | 3380 | Vendored Three.js GLTFExporter dependency. |
| www/libs/three/addons/exporters/KTX2Exporter.js | 292 | Vendored Three.js KTX2Exporter dependency. |
| www/libs/three/addons/exporters/MMDExporter.js | 217 | Vendored Three.js MMDExporter dependency. |
| www/libs/three/addons/exporters/OBJExporter.js | 284 | Vendored Three.js OBJExporter dependency. |
| www/libs/three/addons/exporters/PLYExporter.js | 528 | Vendored Three.js PLYExporter dependency. |
| www/libs/three/addons/exporters/STLExporter.js | 199 | Vendored Three.js STLExporter dependency. |
| www/libs/three/addons/exporters/USDZExporter.js | 741 | Vendored Three.js USDZExporter dependency. |
| www/libs/three/addons/geometries/BoxLineGeometry.js | 69 | Vendored Three.js BoxLineGeometry dependency. |
| www/libs/three/addons/geometries/ConvexGeometry.js | 53 | Vendored Three.js ConvexGeometry dependency. |
| www/libs/three/addons/geometries/DecalGeometry.js | 356 | Vendored Three.js DecalGeometry dependency. |
| www/libs/three/addons/geometries/InstancedPointsGeometry.js | 174 | Vendored Three.js InstancedPointsGeometry dependency. |
| www/libs/three/addons/geometries/ParametricGeometries.js | 254 | Vendored Three.js ParametricGeometries dependency. |
| www/libs/three/addons/geometries/ParametricGeometry.js | 139 | Vendored Three.js ParametricGeometry dependency. |
| www/libs/three/addons/geometries/RoundedBoxGeometry.js | 155 | Vendored Three.js RoundedBoxGeometry dependency. |
| www/libs/three/addons/geometries/SDFGeometryGenerator.js | 144 | Vendored Three.js SDFGeometryGenerator dependency. |
| www/libs/three/addons/geometries/TeapotGeometry.js | 704 | Vendored Three.js TeapotGeometry dependency. |
| www/libs/three/addons/geometries/TextGeometry.js | 65 | Vendored Three.js TextGeometry dependency. |
| www/libs/three/addons/helpers/LightProbeHelper.js | 130 | Vendored Three.js LightProbeHelper dependency. |
| www/libs/three/addons/helpers/OctreeHelper.js | 73 | Vendored Three.js OctreeHelper dependency. |
| www/libs/three/addons/helpers/PositionalAudioHelper.js | 109 | Vendored Three.js PositionalAudioHelper dependency. |
| www/libs/three/addons/helpers/RectAreaLightHelper.js | 85 | Vendored Three.js RectAreaLightHelper dependency. |
| www/libs/three/addons/helpers/TextureHelper.js | 237 | Vendored Three.js TextureHelper dependency. |
| www/libs/three/addons/helpers/VertexNormalsHelper.js | 96 | Vendored Three.js VertexNormalsHelper dependency. |
| www/libs/three/addons/helpers/VertexTangentsHelper.js | 88 | Vendored Three.js VertexTangentsHelper dependency. |
| www/libs/three/addons/helpers/ViewHelper.js | 333 | Vendored Three.js ViewHelper dependency. |
| www/libs/three/addons/interactive/HTMLMesh.js | 570 | Vendored Three.js HTMLMesh dependency. |
| www/libs/three/addons/interactive/InteractiveGroup.js | 106 | Vendored Three.js InteractiveGroup dependency. |
| www/libs/three/addons/interactive/SelectionBox.js | 227 | Vendored Three.js SelectionBox dependency. |
| www/libs/three/addons/interactive/SelectionHelper.js | 104 | Vendored Three.js SelectionHelper dependency. |
| www/libs/three/addons/libs/ammo.wasm.js | 822 | Vendored Three.js ammo.wasm dependency. |
| www/libs/three/addons/libs/ammo.wasm.wasm | - | Vendored Three.js ammo.wasm dependency. |
| www/libs/three/addons/libs/basis/README.md | 46 | Vendored Three.js README dependency. |
| www/libs/three/addons/libs/basis/basis_transcoder.js | 21 | Vendored Three.js basis_transcoder dependency. |
| www/libs/three/addons/libs/basis/basis_transcoder.wasm | - | Vendored Three.js basis_transcoder dependency. |
| www/libs/three/addons/libs/chevrotain.module.min.js | 141 | Vendored Three.js chevrotain.module.min dependency. |
| www/libs/three/addons/libs/draco/README.md | 32 | Vendored Three.js README dependency. |
| www/libs/three/addons/libs/draco/draco_decoder.js | 34 | Vendored Three.js draco_decoder dependency. |
| www/libs/three/addons/libs/draco/draco_decoder.wasm | - | Vendored Three.js draco_decoder dependency. |
| www/libs/three/addons/libs/draco/draco_encoder.js | 33 | Vendored Three.js draco_encoder dependency. |
| www/libs/three/addons/libs/draco/draco_wasm_wrapper.js | 117 | Vendored Three.js draco_wasm_wrapper dependency. |
| www/libs/three/addons/libs/draco/gltf/draco_decoder.js | 33 | Vendored Three.js draco_decoder dependency. |
| www/libs/three/addons/libs/draco/gltf/draco_decoder.wasm | - | Vendored Three.js draco_decoder dependency. |
| www/libs/three/addons/libs/draco/gltf/draco_encoder.js | 33 | Vendored Three.js draco_encoder dependency. |
| www/libs/three/addons/libs/draco/gltf/draco_wasm_wrapper.js | 116 | Vendored Three.js draco_wasm_wrapper dependency. |
| www/libs/three/addons/libs/ecsy.module.js | 1792 | Vendored Three.js ecsy.module dependency. |
| www/libs/three/addons/libs/fflate.module.js | 2672 | Vendored Three.js fflate.module dependency. |
| www/libs/three/addons/libs/ktx-parse.module.js | 1 | Vendored Three.js ktx-parse.module dependency. |
| www/libs/three/addons/libs/lil-gui.module.min.js | 8 | Vendored Three.js lil-gui.module.min dependency. |
| www/libs/three/addons/libs/lottie_canvas.module.js | 14849 | Vendored Three.js lottie_canvas.module dependency. |
| www/libs/three/addons/libs/meshopt_decoder.module.js | 178 | Vendored Three.js meshopt_decoder.module dependency. |
| www/libs/three/addons/libs/mikktspace.module.js | 128 | Vendored Three.js mikktspace.module dependency. |
| www/libs/three/addons/libs/mmdparser.module.js | 11530 | Vendored Three.js mmdparser.module dependency. |
| www/libs/three/addons/libs/motion-controllers.module.js | 397 | Vendored Three.js motion-controllers.module dependency. |
| www/libs/three/addons/libs/opentype.module.js | 14506 | Vendored Three.js opentype.module dependency. |
| www/libs/three/addons/libs/potpack.module.js | 125 | Vendored Three.js potpack.module dependency. |
| www/libs/three/addons/libs/rhino3dm/rhino3dm.js | 21 | Vendored Three.js rhino3dm dependency. |
| www/libs/three/addons/libs/rhino3dm/rhino3dm.module.js | 16 | Vendored Three.js rhino3dm.module dependency. |
| www/libs/three/addons/libs/rhino3dm/rhino3dm.wasm | - | Vendored Three.js rhino3dm dependency. |
| www/libs/three/addons/libs/stats.module.js | 167 | Vendored Three.js stats.module dependency. |
| www/libs/three/addons/libs/surfaceNet.js | 201 | Vendored Three.js surfaceNet dependency. |
| www/libs/three/addons/libs/tween.module.js | 876 | Vendored Three.js tween.module dependency. |
| www/libs/three/addons/libs/utif.module.js | 1665 | Vendored Three.js utif.module dependency. |
| www/libs/three/addons/libs/zstddec.module.js | 1 | Vendored Three.js zstddec.module dependency. |
| www/libs/three/addons/lights/IESSpotLight.js | 25 | Vendored Three.js IESSpotLight dependency. |
| www/libs/three/addons/lights/LightProbeGenerator.js | 286 | Vendored Three.js LightProbeGenerator dependency. |
| www/libs/three/addons/lights/RectAreaLightUniformsLib.js | 79 | Vendored Three.js RectAreaLightUniformsLib dependency. |
| www/libs/three/addons/lines/Line2.js | 19 | Vendored Three.js Line2 dependency. |
| www/libs/three/addons/lines/LineGeometry.js | 79 | Vendored Three.js LineGeometry dependency. |
| www/libs/three/addons/lines/LineMaterial.js | 617 | Vendored Three.js LineMaterial dependency. |
| www/libs/three/addons/lines/LineSegments2.js | 361 | Vendored Three.js LineSegments2 dependency. |
| www/libs/three/addons/lines/LineSegmentsGeometry.js | 241 | Vendored Three.js LineSegmentsGeometry dependency. |
| www/libs/three/addons/lines/Wireframe.js | 56 | Vendored Three.js Wireframe dependency. |
| www/libs/three/addons/lines/WireframeGeometry2.js | 24 | Vendored Three.js WireframeGeometry2 dependency. |
| www/libs/three/addons/loaders/3DMLoader.js | 1764 | Vendored Three.js 3DMLoader dependency. |
| www/libs/three/addons/loaders/3MFLoader.js | 1480 | Vendored Three.js 3MFLoader dependency. |
| www/libs/three/addons/loaders/AMFLoader.js | 521 | Vendored Three.js AMFLoader dependency. |
| www/libs/three/addons/loaders/BVHLoader.js | 437 | Vendored Three.js BVHLoader dependency. |
| www/libs/three/addons/loaders/ColladaLoader.js | 4116 | Vendored Three.js ColladaLoader dependency. |
| www/libs/three/addons/loaders/DDSLoader.js | 318 | Vendored Three.js DDSLoader dependency. |
| www/libs/three/addons/loaders/DRACOLoader.js | 613 | Vendored Three.js DRACOLoader dependency. |
| www/libs/three/addons/loaders/EXRLoader.js | 2563 | Vendored Three.js EXRLoader dependency. |
| www/libs/three/addons/loaders/FBXLoader.js | 4314 | Vendored Three.js FBXLoader dependency. |
| www/libs/three/addons/loaders/FontLoader.js | 183 | Vendored Three.js FontLoader dependency. |
| www/libs/three/addons/loaders/GCodeLoader.js | 261 | Vendored Three.js GCodeLoader dependency. |
| www/libs/three/addons/loaders/GLTFLoader.js | 4722 | Vendored Three.js GLTFLoader dependency. |
| www/libs/three/addons/loaders/HDRCubeTextureLoader.js | 115 | Vendored Three.js HDRCubeTextureLoader dependency. |
| www/libs/three/addons/loaders/IESLoader.js | 337 | Vendored Three.js IESLoader dependency. |
| www/libs/three/addons/loaders/KMZLoader.js | 130 | Vendored Three.js KMZLoader dependency. |
| www/libs/three/addons/loaders/KTX2Loader.js | 925 | Vendored Three.js KTX2Loader dependency. |
| www/libs/three/addons/loaders/KTXLoader.js | 176 | Vendored Three.js KTXLoader dependency. |
| www/libs/three/addons/loaders/LDrawLoader.js | 2470 | Vendored Three.js LDrawLoader dependency. |
| www/libs/three/addons/loaders/LUT3dlLoader.js | 168 | Vendored Three.js LUT3dlLoader dependency. |
| www/libs/three/addons/loaders/LUTCubeLoader.js | 153 | Vendored Three.js LUTCubeLoader dependency. |
| www/libs/three/addons/loaders/LUTImageLoader.js | 149 | Vendored Three.js LUTImageLoader dependency. |
| www/libs/three/addons/loaders/LWOLoader.js | 1052 | Vendored Three.js LWOLoader dependency. |
| www/libs/three/addons/loaders/LogLuvLoader.js | 606 | Vendored Three.js LogLuvLoader dependency. |
| www/libs/three/addons/loaders/LottieLoader.js | 77 | Vendored Three.js LottieLoader dependency. |
| www/libs/three/addons/loaders/MD2Loader.js | 399 | Vendored Three.js MD2Loader dependency. |
| www/libs/three/addons/loaders/MDDLoader.js | 102 | Vendored Three.js MDDLoader dependency. |
| www/libs/three/addons/loaders/MMDLoader.js | 2276 | Vendored Three.js MMDLoader dependency. |
| www/libs/three/addons/loaders/MTLLoader.js | 567 | Vendored Three.js MTLLoader dependency. |
| www/libs/three/addons/loaders/MaterialXLoader.js | 852 | Vendored Three.js MaterialXLoader dependency. |
| www/libs/three/addons/loaders/NRRDLoader.js | 686 | Vendored Three.js NRRDLoader dependency. |
| www/libs/three/addons/loaders/OBJLoader.js | 905 | Vendored Three.js OBJLoader dependency. |
| www/libs/three/addons/loaders/PCDLoader.js | 467 | Vendored Three.js PCDLoader dependency. |
| www/libs/three/addons/loaders/PDBLoader.js | 232 | Vendored Three.js PDBLoader dependency. |
| www/libs/three/addons/loaders/PLYLoader.js | 771 | Vendored Three.js PLYLoader dependency. |
| www/libs/three/addons/loaders/PVRLoader.js | 251 | Vendored Three.js PVRLoader dependency. |
| www/libs/three/addons/loaders/RGBELoader.js | 450 | Vendored Three.js RGBELoader dependency. |
| www/libs/three/addons/loaders/RGBMLoader.js | 1081 | Vendored Three.js RGBMLoader dependency. |
| www/libs/three/addons/loaders/STLLoader.js | 410 | Vendored Three.js STLLoader dependency. |
| www/libs/three/addons/loaders/SVGLoader.js | 3173 | Vendored Three.js SVGLoader dependency. |
| www/libs/three/addons/loaders/TDSLoader.js | 1124 | Vendored Three.js TDSLoader dependency. |
| www/libs/three/addons/loaders/TGALoader.js | 517 | Vendored Three.js TGALoader dependency. |
| www/libs/three/addons/loaders/TIFFLoader.js | 36 | Vendored Three.js TIFFLoader dependency. |
| www/libs/three/addons/loaders/TTFLoader.js | 214 | Vendored Three.js TTFLoader dependency. |
| www/libs/three/addons/loaders/TiltLoader.js | 520 | Vendored Three.js TiltLoader dependency. |
| www/libs/three/addons/loaders/USDZLoader.js | 822 | Vendored Three.js USDZLoader dependency. |
| www/libs/three/addons/loaders/VOXLoader.js | 318 | Vendored Three.js VOXLoader dependency. |
| www/libs/three/addons/loaders/VRMLLoader.js | 3537 | Vendored Three.js VRMLLoader dependency. |
| www/libs/three/addons/loaders/VTKLoader.js | 1163 | Vendored Three.js VTKLoader dependency. |
| www/libs/three/addons/loaders/XYZLoader.js | 106 | Vendored Three.js XYZLoader dependency. |
| www/libs/three/addons/loaders/lwo/IFFParser.js | 1217 | Vendored Three.js IFFParser dependency. |
| www/libs/three/addons/loaders/lwo/LWO2Parser.js | 414 | Vendored Three.js LWO2Parser dependency. |
| www/libs/three/addons/loaders/lwo/LWO3Parser.js | 373 | Vendored Three.js LWO3Parser dependency. |
| www/libs/three/addons/materials/MeshGouraudMaterial.js | 432 | Vendored Three.js MeshGouraudMaterial dependency. |
| www/libs/three/addons/materials/MeshPostProcessingMaterial.js | 144 | Vendored Three.js MeshPostProcessingMaterial dependency. |
| www/libs/three/addons/math/Capsule.js | 82 | Vendored Three.js Capsule dependency. |
| www/libs/three/addons/math/ColorConverter.js | 36 | Vendored Three.js ColorConverter dependency. |
| www/libs/three/addons/math/ConvexHull.js | 1271 | Vendored Three.js ConvexHull dependency. |
| www/libs/three/addons/math/ImprovedNoise.js | 71 | Vendored Three.js ImprovedNoise dependency. |
| www/libs/three/addons/math/Lut.js | 204 | Vendored Three.js Lut dependency. |
| www/libs/three/addons/math/MeshSurfaceSampler.js | 250 | Vendored Three.js MeshSurfaceSampler dependency. |
| www/libs/three/addons/math/OBB.js | 423 | Vendored Three.js OBB dependency. |
| www/libs/three/addons/math/Octree.js | 546 | Vendored Three.js Octree dependency. |
| www/libs/three/addons/math/SimplexNoise.js | 444 | Vendored Three.js SimplexNoise dependency. |
| www/libs/three/addons/misc/ConvexObjectBreaker.js | 519 | Vendored Three.js ConvexObjectBreaker dependency. |
| www/libs/three/addons/misc/GPUComputationRenderer.js | 440 | Vendored Three.js GPUComputationRenderer dependency. |
| www/libs/three/addons/misc/Gyroscope.js | 66 | Vendored Three.js Gyroscope dependency. |
| www/libs/three/addons/misc/MD2Character.js | 276 | Vendored Three.js MD2Character dependency. |
| www/libs/three/addons/misc/MD2CharacterComplex.js | 576 | Vendored Three.js MD2CharacterComplex dependency. |
| www/libs/three/addons/misc/MorphAnimMesh.js | 75 | Vendored Three.js MorphAnimMesh dependency. |
| www/libs/three/addons/misc/MorphBlendMesh.js | 322 | Vendored Three.js MorphBlendMesh dependency. |
| www/libs/three/addons/misc/ProgressiveLightMap.js | 324 | Vendored Three.js ProgressiveLightMap dependency. |
| www/libs/three/addons/misc/RollerCoaster.js | 566 | Vendored Three.js RollerCoaster dependency. |
| www/libs/three/addons/misc/Timer.js | 128 | Vendored Three.js Timer dependency. |
| www/libs/three/addons/misc/TubePainter.js | 202 | Vendored Three.js TubePainter dependency. |
| www/libs/three/addons/misc/Volume.js | 473 | Vendored Three.js Volume dependency. |
| www/libs/three/addons/misc/VolumeSlice.js | 229 | Vendored Three.js VolumeSlice dependency. |
| www/libs/three/addons/modifiers/CurveModifier.js | 344 | Vendored Three.js CurveModifier dependency. |
| www/libs/three/addons/modifiers/EdgeSplitModifier.js | 279 | Vendored Three.js EdgeSplitModifier dependency. |
| www/libs/three/addons/modifiers/SimplifyModifier.js | 617 | Vendored Three.js SimplifyModifier dependency. |
| www/libs/three/addons/modifiers/TessellateModifier.js | 307 | Vendored Three.js TessellateModifier dependency. |
| www/libs/three/addons/nodes/Nodes.js | 201 | Vendored Three.js Nodes dependency. |
| www/libs/three/addons/nodes/accessors/AccessorsUtils.js | 25 | Vendored Three.js AccessorsUtils dependency. |
| www/libs/three/addons/nodes/accessors/BatchNode.js | 78 | Vendored Three.js BatchNode dependency. |
| www/libs/three/addons/nodes/accessors/BitangentNode.js | 89 | Vendored Three.js BitangentNode dependency. |
| www/libs/three/addons/nodes/accessors/BufferAttributeNode.js | 127 | Vendored Three.js BufferAttributeNode dependency. |
| www/libs/three/addons/nodes/accessors/BufferNode.js | 30 | Vendored Three.js BufferNode dependency. |
| www/libs/three/addons/nodes/accessors/CameraNode.js | 119 | Vendored Three.js CameraNode dependency. |
| www/libs/three/addons/nodes/accessors/ClippingNode.js | 145 | Vendored Three.js ClippingNode dependency. |
| www/libs/three/addons/nodes/accessors/CubeTextureNode.js | 61 | Vendored Three.js CubeTextureNode dependency. |
| www/libs/three/addons/nodes/accessors/InstanceNode.js | 94 | Vendored Three.js InstanceNode dependency. |
| www/libs/three/addons/nodes/accessors/InstancedPointsMaterialNode.js | 21 | Vendored Three.js InstancedPointsMaterialNode dependency. |
| www/libs/three/addons/nodes/accessors/MaterialNode.js | 418 | Vendored Three.js MaterialNode dependency. |
| www/libs/three/addons/nodes/accessors/MaterialReferenceNode.js | 41 | Vendored Three.js MaterialReferenceNode dependency. |
| www/libs/three/addons/nodes/accessors/ModelNode.js | 33 | Vendored Three.js ModelNode dependency. |
| www/libs/three/addons/nodes/accessors/ModelViewProjectionNode.js | 39 | Vendored Three.js ModelViewProjectionNode dependency. |
| www/libs/three/addons/nodes/accessors/MorphNode.js | 255 | Vendored Three.js MorphNode dependency. |
| www/libs/three/addons/nodes/accessors/NormalNode.js | 106 | Vendored Three.js NormalNode dependency. |
| www/libs/three/addons/nodes/accessors/Object3DNode.js | 150 | Vendored Three.js Object3DNode dependency. |
| www/libs/three/addons/nodes/accessors/PointUVNode.js | 26 | Vendored Three.js PointUVNode dependency. |
| www/libs/three/addons/nodes/accessors/PositionNode.js | 104 | Vendored Three.js PositionNode dependency. |
| www/libs/three/addons/nodes/accessors/ReferenceNode.js | 160 | Vendored Three.js ReferenceNode dependency. |
| www/libs/three/addons/nodes/accessors/ReflectVectorNode.js | 35 | Vendored Three.js ReflectVectorNode dependency. |
| www/libs/three/addons/nodes/accessors/RendererReferenceNode.js | 29 | Vendored Three.js RendererReferenceNode dependency. |
| www/libs/three/addons/nodes/accessors/SceneNode.js | 52 | Vendored Three.js SceneNode dependency. |
| www/libs/three/addons/nodes/accessors/SkinningNode.js | 124 | Vendored Three.js SkinningNode dependency. |
| www/libs/three/addons/nodes/accessors/StorageBufferNode.js | 81 | Vendored Three.js StorageBufferNode dependency. |
| www/libs/three/addons/nodes/accessors/TangentNode.js | 109 | Vendored Three.js TangentNode dependency. |
| www/libs/three/addons/nodes/accessors/TextureBicubicNode.js | 94 | Vendored Three.js TextureBicubicNode dependency. |
| www/libs/three/addons/nodes/accessors/TextureNode.js | 408 | Vendored Three.js TextureNode dependency. |
| www/libs/three/addons/nodes/accessors/TextureSizeNode.js | 35 | Vendored Three.js TextureSizeNode dependency. |
| www/libs/three/addons/nodes/accessors/TextureStoreNode.js | 82 | Vendored Three.js TextureStoreNode dependency. |
| www/libs/three/addons/nodes/accessors/UVNode.js | 47 | Vendored Three.js UVNode dependency. |
| www/libs/three/addons/nodes/accessors/UniformsNode.js | 140 | Vendored Three.js UniformsNode dependency. |
| www/libs/three/addons/nodes/accessors/UserDataNode.js | 29 | Vendored Three.js UserDataNode dependency. |
| www/libs/three/addons/nodes/accessors/VertexColorNode.js | 70 | Vendored Three.js VertexColorNode dependency. |
| www/libs/three/addons/nodes/code/CodeNode.js | 84 | Vendored Three.js CodeNode dependency. |
| www/libs/three/addons/nodes/code/ExpressionNode.js | 37 | Vendored Three.js ExpressionNode dependency. |
| www/libs/three/addons/nodes/code/FunctionCallNode.js | 96 | Vendored Three.js FunctionCallNode dependency. |
| www/libs/three/addons/nodes/code/FunctionNode.js | 130 | Vendored Three.js FunctionNode dependency. |
| www/libs/three/addons/nodes/code/ScriptableNode.js | 488 | Vendored Three.js ScriptableNode dependency. |
| www/libs/three/addons/nodes/code/ScriptableValueNode.js | 167 | Vendored Three.js ScriptableValueNode dependency. |
| www/libs/three/addons/nodes/core/AssignNode.js | 128 | Vendored Three.js AssignNode dependency. |
| www/libs/three/addons/nodes/core/AttributeNode.js | 108 | Vendored Three.js AttributeNode dependency. |
| www/libs/three/addons/nodes/core/BypassNode.js | 45 | Vendored Three.js BypassNode dependency. |
| www/libs/three/addons/nodes/core/CacheNode.js | 49 | Vendored Three.js CacheNode dependency. |
| www/libs/three/addons/nodes/core/ConstNode.js | 32 | Vendored Three.js ConstNode dependency. |
| www/libs/three/addons/nodes/core/ContextNode.js | 61 | Vendored Three.js ContextNode dependency. |
| www/libs/three/addons/nodes/core/IndexNode.js | 66 | Vendored Three.js IndexNode dependency. |
| www/libs/three/addons/nodes/core/InputNode.js | 83 | Vendored Three.js InputNode dependency. |
| www/libs/three/addons/nodes/core/LightingModel.js | 17 | Vendored Three.js LightingModel dependency. |
| www/libs/three/addons/nodes/core/Node.js | 552 | Vendored Three.js Node dependency. |
| www/libs/three/addons/nodes/core/NodeAttribute.js | 15 | Vendored Three.js NodeAttribute dependency. |
| www/libs/three/addons/nodes/core/NodeBuilder.js | 1251 | Vendored Three.js NodeBuilder dependency. |
| www/libs/three/addons/nodes/core/NodeCache.js | 26 | Vendored Three.js NodeCache dependency. |
| www/libs/three/addons/nodes/core/NodeCode.js | 15 | Vendored Three.js NodeCode dependency. |
| www/libs/three/addons/nodes/core/NodeFrame.js | 143 | Vendored Three.js NodeFrame dependency. |
| www/libs/three/addons/nodes/core/NodeFunction.js | 22 | Vendored Three.js NodeFunction dependency. |
| www/libs/three/addons/nodes/core/NodeFunctionInput.js | 17 | Vendored Three.js NodeFunctionInput dependency. |
| www/libs/three/addons/nodes/core/NodeKeywords.js | 80 | Vendored Three.js NodeKeywords dependency. |
| www/libs/three/addons/nodes/core/NodeParser.js | 11 | Vendored Three.js NodeParser dependency. |
| www/libs/three/addons/nodes/core/NodeUniform.js | 40 | Vendored Three.js NodeUniform dependency. |
| www/libs/three/addons/nodes/core/NodeUtils.js | 210 | Vendored Three.js NodeUtils dependency. |
| www/libs/three/addons/nodes/core/NodeVar.js | 14 | Vendored Three.js NodeVar dependency. |
| www/libs/three/addons/nodes/core/NodeVarying.js | 17 | Vendored Three.js NodeVarying dependency. |
| www/libs/three/addons/nodes/core/OutputStructNode.js | 63 | Vendored Three.js OutputStructNode dependency. |
| www/libs/three/addons/nodes/core/ParameterNode.js | 33 | Vendored Three.js ParameterNode dependency. |
| www/libs/three/addons/nodes/core/PropertyNode.js | 82 | Vendored Three.js PropertyNode dependency. |
| www/libs/three/addons/nodes/core/StackNode.js | 89 | Vendored Three.js StackNode dependency. |
| www/libs/three/addons/nodes/core/StructTypeNode.js | 24 | Vendored Three.js StructTypeNode dependency. |
| www/libs/three/addons/nodes/core/TempNode.js | 58 | Vendored Three.js TempNode dependency. |
| www/libs/three/addons/nodes/core/UniformGroup.js | 13 | Vendored Three.js UniformGroup dependency. |
| www/libs/three/addons/nodes/core/UniformGroupNode.js | 36 | Vendored Three.js UniformGroupNode dependency. |
| www/libs/three/addons/nodes/core/UniformNode.js | 100 | Vendored Three.js UniformNode dependency. |
| www/libs/three/addons/nodes/core/VarNode.js | 60 | Vendored Three.js VarNode dependency. |
| www/libs/three/addons/nodes/core/VaryingNode.js | 65 | Vendored Three.js VaryingNode dependency. |
| www/libs/three/addons/nodes/core/constants.js | 28 | Vendored Three.js constants dependency. |
| www/libs/three/addons/nodes/display/AfterImageNode.js | 148 | Vendored Three.js AfterImageNode dependency. |
| www/libs/three/addons/nodes/display/AnamorphicNode.js | 148 | Vendored Three.js AnamorphicNode dependency. |
| www/libs/three/addons/nodes/display/BlendModeNode.js | 128 | Vendored Three.js BlendModeNode dependency. |
| www/libs/three/addons/nodes/display/BumpMapNode.js | 80 | Vendored Three.js BumpMapNode dependency. |
| www/libs/three/addons/nodes/display/ColorAdjustmentNode.js | 99 | Vendored Three.js ColorAdjustmentNode dependency. |
| www/libs/three/addons/nodes/display/ColorSpaceNode.js | 108 | Vendored Three.js ColorSpaceNode dependency. |
| www/libs/three/addons/nodes/display/FrontFacingNode.js | 40 | Vendored Three.js FrontFacingNode dependency. |
| www/libs/three/addons/nodes/display/GaussianBlurNode.js | 190 | Vendored Three.js GaussianBlurNode dependency. |
| www/libs/three/addons/nodes/display/NormalMapNode.js | 106 | Vendored Three.js NormalMapNode dependency. |
| www/libs/three/addons/nodes/display/PassNode.js | 199 | Vendored Three.js PassNode dependency. |
| www/libs/three/addons/nodes/display/PosterizeNode.js | 32 | Vendored Three.js PosterizeNode dependency. |
| www/libs/three/addons/nodes/display/ToneMappingNode.js | 188 | Vendored Three.js ToneMappingNode dependency. |
| www/libs/three/addons/nodes/display/ViewportDepthNode.js | 97 | Vendored Three.js ViewportDepthNode dependency. |
| www/libs/three/addons/nodes/display/ViewportDepthTextureNode.js | 31 | Vendored Three.js ViewportDepthTextureNode dependency. |
| www/libs/three/addons/nodes/display/ViewportNode.js | 136 | Vendored Three.js ViewportNode dependency. |
| www/libs/three/addons/nodes/display/ViewportSharedTextureNode.js | 37 | Vendored Three.js ViewportSharedTextureNode dependency. |
| www/libs/three/addons/nodes/display/ViewportTextureNode.js | 78 | Vendored Three.js ViewportTextureNode dependency. |
| www/libs/three/addons/nodes/fog/FogExp2Node.js | 34 | Vendored Three.js FogExp2Node dependency. |
| www/libs/three/addons/nodes/fog/FogNode.js | 48 | Vendored Three.js FogNode dependency. |
| www/libs/three/addons/nodes/fog/FogRangeNode.js | 35 | Vendored Three.js FogRangeNode dependency. |
| www/libs/three/addons/nodes/functions/BSDF/BRDF_GGX.js | 59 | Vendored Three.js BRDF_GGX dependency. |
| www/libs/three/addons/nodes/functions/BSDF/BRDF_Lambert.js | 9 | Vendored Three.js BRDF_Lambert dependency. |
| www/libs/three/addons/nodes/functions/BSDF/BRDF_Sheen.js | 57 | Vendored Three.js BRDF_Sheen dependency. |
| www/libs/three/addons/nodes/functions/BSDF/DFGApprox.js | 30 | Vendored Three.js DFGApprox dependency. |
| www/libs/three/addons/nodes/functions/BSDF/D_GGX.js | 23 | Vendored Three.js D_GGX dependency. |
| www/libs/three/addons/nodes/functions/BSDF/D_GGX_Anisotropic.js | 28 | Vendored Three.js D_GGX_Anisotropic dependency. |
| www/libs/three/addons/nodes/functions/BSDF/EnvironmentBRDF.js | 13 | Vendored Three.js EnvironmentBRDF dependency. |
| www/libs/three/addons/nodes/functions/BSDF/F_Schlick.js | 16 | Vendored Three.js F_Schlick dependency. |
| www/libs/three/addons/nodes/functions/BSDF/Schlick_to_F0.js | 21 | Vendored Three.js Schlick_to_F0 dependency. |
| www/libs/three/addons/nodes/functions/BSDF/V_GGX_SmithCorrelated.js | 26 | Vendored Three.js V_GGX_SmithCorrelated dependency. |
| www/libs/three/addons/nodes/functions/BSDF/V_GGX_SmithCorrelated_Anisotropic.js | 29 | Vendored Three.js V_GGX_SmithCorrelated_Anisotropic dependency. |
| www/libs/three/addons/nodes/functions/PhongLightingModel.js | 67 | Vendored Three.js PhongLightingModel dependency. |
| www/libs/three/addons/nodes/functions/PhysicalLightingModel.js | 547 | Vendored Three.js PhysicalLightingModel dependency. |
| www/libs/three/addons/nodes/functions/ShadowMaskModel.js | 31 | Vendored Three.js ShadowMaskModel dependency. |
| www/libs/three/addons/nodes/functions/material/getGeometryRoughness.js | 13 | Vendored Three.js getGeometryRoughness dependency. |
| www/libs/three/addons/nodes/functions/material/getRoughness.js | 18 | Vendored Three.js getRoughness dependency. |
| www/libs/three/addons/nodes/geometry/RangeNode.js | 104 | Vendored Three.js RangeNode dependency. |
| www/libs/three/addons/nodes/gpgpu/ComputeNode.js | 85 | Vendored Three.js ComputeNode dependency. |
| www/libs/three/addons/nodes/lighting/AONode.js | 27 | Vendored Three.js AONode dependency. |
| www/libs/three/addons/nodes/lighting/AmbientLightNode.js | 27 | Vendored Three.js AmbientLightNode dependency. |
| www/libs/three/addons/nodes/lighting/AnalyticLightNode.js | 255 | Vendored Three.js AnalyticLightNode dependency. |
| www/libs/three/addons/nodes/lighting/DirectionalLightNode.js | 41 | Vendored Three.js DirectionalLightNode dependency. |
| www/libs/three/addons/nodes/lighting/EnvironmentNode.js | 133 | Vendored Three.js EnvironmentNode dependency. |
| www/libs/three/addons/nodes/lighting/HemisphereLightNode.js | 55 | Vendored Three.js HemisphereLightNode dependency. |
| www/libs/three/addons/nodes/lighting/IESSpotLightNode.js | 39 | Vendored Three.js IESSpotLightNode dependency. |
| www/libs/three/addons/nodes/lighting/IrradianceNode.js | 24 | Vendored Three.js IrradianceNode dependency. |
| www/libs/three/addons/nodes/lighting/LightNode.js | 57 | Vendored Three.js LightNode dependency. |
| www/libs/three/addons/nodes/lighting/LightUtils.js | 17 | Vendored Three.js LightUtils dependency. |
| www/libs/three/addons/nodes/lighting/LightingContextNode.js | 66 | Vendored Three.js LightingContextNode dependency. |
| www/libs/three/addons/nodes/lighting/LightingNode.js | 21 | Vendored Three.js LightingNode dependency. |
| www/libs/three/addons/nodes/lighting/LightsNode.js | 198 | Vendored Three.js LightsNode dependency. |
| www/libs/three/addons/nodes/lighting/PointLightNode.js | 69 | Vendored Three.js PointLightNode dependency. |
| www/libs/three/addons/nodes/lighting/SpotLightNode.js | 90 | Vendored Three.js SpotLightNode dependency. |
| www/libs/three/addons/nodes/loaders/NodeLoader.js | 108 | Vendored Three.js NodeLoader dependency. |
| www/libs/three/addons/nodes/loaders/NodeMaterialLoader.js | 59 | Vendored Three.js NodeMaterialLoader dependency. |
| www/libs/three/addons/nodes/loaders/NodeObjectLoader.js | 70 | Vendored Three.js NodeObjectLoader dependency. |
| www/libs/three/addons/nodes/materials/InstancedPointsNodeMaterial.js | 162 | Vendored Three.js InstancedPointsNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/Line2NodeMaterial.js | 440 | Vendored Three.js Line2NodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/LineBasicNodeMaterial.js | 28 | Vendored Three.js LineBasicNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/LineDashedNodeMaterial.js | 54 | Vendored Three.js LineDashedNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/Materials.js | 17 | Vendored Three.js Materials dependency. |
| www/libs/three/addons/nodes/materials/MeshBasicNodeMaterial.js | 28 | Vendored Three.js MeshBasicNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/MeshLambertNodeMaterial.js | 34 | Vendored Three.js MeshLambertNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/MeshNormalNodeMaterial.js | 38 | Vendored Three.js MeshNormalNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/MeshPhongNodeMaterial.js | 65 | Vendored Three.js MeshPhongNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/MeshPhysicalNodeMaterial.js | 226 | Vendored Three.js MeshPhysicalNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/MeshSSSNodeMaterial.js | 84 | Vendored Three.js MeshSSSNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/MeshStandardNodeMaterial.js | 87 | Vendored Three.js MeshStandardNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/NodeMaterial.js | 613 | Vendored Three.js NodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/PointsNodeMaterial.js | 39 | Vendored Three.js PointsNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/ShadowNodeMaterial.js | 34 | Vendored Three.js ShadowNodeMaterial dependency. |
| www/libs/three/addons/nodes/materials/SpriteNodeMaterial.js | 90 | Vendored Three.js SpriteNodeMaterial dependency. |
| www/libs/three/addons/nodes/materialx/DISCLAIMER.md | 199 | Vendored Three.js DISCLAIMER dependency. |
| www/libs/three/addons/nodes/materialx/MaterialXNodes.js | 68 | Vendored Three.js MaterialXNodes dependency. |
| www/libs/three/addons/nodes/materialx/lib/mx_hsv.js | 130 | Vendored Three.js mx_hsv dependency. |
| www/libs/three/addons/nodes/materialx/lib/mx_noise.js | 1430 | Vendored Three.js mx_noise dependency. |
| www/libs/three/addons/nodes/materialx/lib/mx_transform_color.js | 29 | Vendored Three.js mx_transform_color dependency. |
| www/libs/three/addons/nodes/math/CondNode.js | 121 | Vendored Three.js CondNode dependency. |
| www/libs/three/addons/nodes/math/HashNode.js | 34 | Vendored Three.js HashNode dependency. |
| www/libs/three/addons/nodes/math/MathNode.js | 391 | Vendored Three.js MathNode dependency. |
| www/libs/three/addons/nodes/math/MathUtils.js | 15 | Vendored Three.js MathUtils dependency. |
| www/libs/three/addons/nodes/math/OperatorNode.js | 274 | Vendored Three.js OperatorNode dependency. |
| www/libs/three/addons/nodes/math/TriNoise3D.js | 71 | Vendored Three.js TriNoise3D dependency. |
| www/libs/three/addons/nodes/parsers/GLSLNodeFunction.js | 152 | Vendored Three.js GLSLNodeFunction dependency. |
| www/libs/three/addons/nodes/parsers/GLSLNodeParser.js | 14 | Vendored Three.js GLSLNodeParser dependency. |
| www/libs/three/addons/nodes/pmrem/PMREMNode.js | 193 | Vendored Three.js PMREMNode dependency. |
| www/libs/three/addons/nodes/pmrem/PMREMUtils.js | 288 | Vendored Three.js PMREMUtils dependency. |
| www/libs/three/addons/nodes/procedural/CheckerNode.js | 42 | Vendored Three.js CheckerNode dependency. |
| www/libs/three/addons/nodes/shadernode/ShaderNode.js | 628 | Vendored Three.js ShaderNode dependency. |
| www/libs/three/addons/nodes/utils/ArrayElementNode.js | 35 | Vendored Three.js ArrayElementNode dependency. |
| www/libs/three/addons/nodes/utils/ConvertNode.js | 65 | Vendored Three.js ConvertNode dependency. |
| www/libs/three/addons/nodes/utils/DiscardNode.js | 27 | Vendored Three.js DiscardNode dependency. |
| www/libs/three/addons/nodes/utils/EquirectUVNode.js | 33 | Vendored Three.js EquirectUVNode dependency. |
| www/libs/three/addons/nodes/utils/FunctionOverloadingNode.js | 95 | Vendored Three.js FunctionOverloadingNode dependency. |
| www/libs/three/addons/nodes/utils/JoinNode.js | 61 | Vendored Three.js JoinNode dependency. |
| www/libs/three/addons/nodes/utils/LoopNode.js | 200 | Vendored Three.js LoopNode dependency. |
| www/libs/three/addons/nodes/utils/MatcapUVNode.js | 30 | Vendored Three.js MatcapUVNode dependency. |
| www/libs/three/addons/nodes/utils/MaxMipLevelNode.js | 46 | Vendored Three.js MaxMipLevelNode dependency. |
| www/libs/three/addons/nodes/utils/OscNode.js | 81 | Vendored Three.js OscNode dependency. |
| www/libs/three/addons/nodes/utils/PackingNode.js | 55 | Vendored Three.js PackingNode dependency. |
| www/libs/three/addons/nodes/utils/ReflectorNode.js | 227 | Vendored Three.js ReflectorNode dependency. |
| www/libs/three/addons/nodes/utils/RemapNode.js | 42 | Vendored Three.js RemapNode dependency. |
| www/libs/three/addons/nodes/utils/RotateNode.js | 68 | Vendored Three.js RotateNode dependency. |
| www/libs/three/addons/nodes/utils/RotateUVNode.js | 35 | Vendored Three.js RotateUVNode dependency. |
| www/libs/three/addons/nodes/utils/SetNode.js | 62 | Vendored Three.js SetNode dependency. |
| www/libs/three/addons/nodes/utils/SplitNode.js | 112 | Vendored Three.js SplitNode dependency. |
| www/libs/three/addons/nodes/utils/SpriteSheetUVNode.js | 41 | Vendored Three.js SpriteSheetUVNode dependency. |
| www/libs/three/addons/nodes/utils/StorageArrayElementNode.js | 91 | Vendored Three.js StorageArrayElementNode dependency. |
| www/libs/three/addons/nodes/utils/TimerNode.js | 94 | Vendored Three.js TimerNode dependency. |
| www/libs/three/addons/nodes/utils/TriplanarTexturesNode.js | 62 | Vendored Three.js TriplanarTexturesNode dependency. |
| www/libs/three/addons/objects/GroundedSkybox.js | 50 | Vendored Three.js GroundedSkybox dependency. |
| www/libs/three/addons/objects/InstancedPoints.js | 21 | Vendored Three.js InstancedPoints dependency. |
| www/libs/three/addons/objects/Lensflare.js | 397 | Vendored Three.js Lensflare dependency. |
| www/libs/three/addons/objects/MarchingCubes.js | 1176 | Vendored Three.js MarchingCubes dependency. |
| www/libs/three/addons/objects/QuadMesh.js | 50 | Vendored Three.js QuadMesh dependency. |
| www/libs/three/addons/objects/Reflector.js | 264 | Vendored Three.js Reflector dependency. |
| www/libs/three/addons/objects/ReflectorForSSRPass.js | 352 | Vendored Three.js ReflectorForSSRPass dependency. |
| www/libs/three/addons/objects/Refractor.js | 327 | Vendored Three.js Refractor dependency. |
| www/libs/three/addons/objects/ShadowMesh.js | 80 | Vendored Three.js ShadowMesh dependency. |
| www/libs/three/addons/objects/Sky.js | 219 | Vendored Three.js Sky dependency. |
| www/libs/three/addons/objects/Water.js | 333 | Vendored Three.js Water dependency. |
| www/libs/three/addons/objects/Water2.js | 361 | Vendored Three.js Water2 dependency. |
| www/libs/three/addons/offscreen/jank.js | 45 | Vendored Three.js jank dependency. |
| www/libs/three/addons/offscreen/offscreen.js | 8 | Vendored Three.js offscreen dependency. |
| www/libs/three/addons/offscreen/scene.js | 86 | Vendored Three.js scene dependency. |
| www/libs/three/addons/physics/AmmoPhysics.js | 306 | Vendored Three.js AmmoPhysics dependency. |
| www/libs/three/addons/physics/JoltPhysics.js | 281 | Vendored Three.js JoltPhysics dependency. |
| www/libs/three/addons/physics/RapierPhysics.js | 220 | Vendored Three.js RapierPhysics dependency. |
| www/libs/three/addons/postprocessing/AfterimagePass.js | 104 | Vendored Three.js AfterimagePass dependency. |
| www/libs/three/addons/postprocessing/BloomPass.js | 172 | Vendored Three.js BloomPass dependency. |
| www/libs/three/addons/postprocessing/BokehPass.js | 141 | Vendored Three.js BokehPass dependency. |
| www/libs/three/addons/postprocessing/ClearPass.js | 46 | Vendored Three.js ClearPass dependency. |
| www/libs/three/addons/postprocessing/CubeTexturePass.js | 85 | Vendored Three.js CubeTexturePass dependency. |
| www/libs/three/addons/postprocessing/DotScreenPass.js | 65 | Vendored Three.js DotScreenPass dependency. |
| www/libs/three/addons/postprocessing/EffectComposer.js | 231 | Vendored Three.js EffectComposer dependency. |
| www/libs/three/addons/postprocessing/FilmPass.js | 64 | Vendored Three.js FilmPass dependency. |
| www/libs/three/addons/postprocessing/GTAOPass.js | 582 | Vendored Three.js GTAOPass dependency. |
| www/libs/three/addons/postprocessing/GlitchPass.js | 125 | Vendored Three.js GlitchPass dependency. |
| www/libs/three/addons/postprocessing/HalftonePass.js | 79 | Vendored Three.js HalftonePass dependency. |
| www/libs/three/addons/postprocessing/LUTPass.js | 108 | Vendored Three.js LUTPass dependency. |
| www/libs/three/addons/postprocessing/MaskPass.js | 104 | Vendored Three.js MaskPass dependency. |
| www/libs/three/addons/postprocessing/OutlinePass.js | 654 | Vendored Three.js OutlinePass dependency. |
| www/libs/three/addons/postprocessing/OutputPass.js | 97 | Vendored Three.js OutputPass dependency. |
| www/libs/three/addons/postprocessing/Pass.js | 95 | Vendored Three.js Pass dependency. |
| www/libs/three/addons/postprocessing/RenderPass.js | 99 | Vendored Three.js RenderPass dependency. |
| www/libs/three/addons/postprocessing/RenderPixelatedPass.js | 235 | Vendored Three.js RenderPixelatedPass dependency. |
| www/libs/three/addons/postprocessing/RenderTransitionPass.js | 193 | Vendored Three.js RenderTransitionPass dependency. |
| www/libs/three/addons/postprocessing/SAOPass.js | 334 | Vendored Three.js SAOPass dependency. |
| www/libs/three/addons/postprocessing/SMAAPass.js | 199 | Vendored Three.js SMAAPass dependency. |
| www/libs/three/addons/postprocessing/SSAARenderPass.js | 228 | Vendored Three.js SSAARenderPass dependency. |
| www/libs/three/addons/postprocessing/SSAOPass.js | 417 | Vendored Three.js SSAOPass dependency. |
| www/libs/three/addons/postprocessing/SSRPass.js | 641 | Vendored Three.js SSRPass dependency. |
| www/libs/three/addons/postprocessing/SavePass.js | 79 | Vendored Three.js SavePass dependency. |
| www/libs/three/addons/postprocessing/ShaderPass.js | 77 | Vendored Three.js ShaderPass dependency. |
| www/libs/three/addons/postprocessing/TAARenderPass.js | 188 | Vendored Three.js TAARenderPass dependency. |
| www/libs/three/addons/postprocessing/TexturePass.js | 67 | Vendored Three.js TexturePass dependency. |
| www/libs/three/addons/postprocessing/UnrealBloomPass.js | 415 | Vendored Three.js UnrealBloomPass dependency. |
| www/libs/three/addons/renderers/CSS2DRenderer.js | 215 | Vendored Three.js CSS2DRenderer dependency. |
| www/libs/three/addons/renderers/CSS3DRenderer.js | 329 | Vendored Three.js CSS3DRenderer dependency. |
| www/libs/three/addons/renderers/Projector.js | 918 | Vendored Three.js Projector dependency. |
| www/libs/three/addons/renderers/SVGRenderer.js | 556 | Vendored Three.js SVGRenderer dependency. |
| www/libs/three/addons/renderers/common/Animation.js | 50 | Vendored Three.js Animation dependency. |
| www/libs/three/addons/renderers/common/Attributes.js | 75 | Vendored Three.js Attributes dependency. |
| www/libs/three/addons/renderers/common/Backend.js | 195 | Vendored Three.js Backend dependency. |
| www/libs/three/addons/renderers/common/Background.js | 134 | Vendored Three.js Background dependency. |
| www/libs/three/addons/renderers/common/Binding.js | 25 | Vendored Three.js Binding dependency. |
| www/libs/three/addons/renderers/common/Bindings.js | 173 | Vendored Three.js Bindings dependency. |
| www/libs/three/addons/renderers/common/Buffer.js | 38 | Vendored Three.js Buffer dependency. |
| www/libs/three/addons/renderers/common/BufferUtils.js | 33 | Vendored Three.js BufferUtils dependency. |
| www/libs/three/addons/renderers/common/ChainMap.js | 89 | Vendored Three.js ChainMap dependency. |
| www/libs/three/addons/renderers/common/ClippingContext.js | 165 | Vendored Three.js ClippingContext dependency. |
| www/libs/three/addons/renderers/common/Color4.js | 37 | Vendored Three.js Color4 dependency. |
| www/libs/three/addons/renderers/common/ComputePipeline.js | 17 | Vendored Three.js ComputePipeline dependency. |
| www/libs/three/addons/renderers/common/Constants.js | 14 | Vendored Three.js Constants dependency. |
| www/libs/three/addons/renderers/common/CubeRenderTarget.js | 65 | Vendored Three.js CubeRenderTarget dependency. |
| www/libs/three/addons/renderers/common/DataMap.js | 54 | Vendored Three.js DataMap dependency. |
| www/libs/three/addons/renderers/common/Geometries.js | 215 | Vendored Three.js Geometries dependency. |
| www/libs/three/addons/renderers/common/Info.js | 99 | Vendored Three.js Info dependency. |
| www/libs/three/addons/renderers/common/Pipeline.js | 13 | Vendored Three.js Pipeline dependency. |
| www/libs/three/addons/renderers/common/Pipelines.js | 322 | Vendored Three.js Pipelines dependency. |
| www/libs/three/addons/renderers/common/PostProcessing.js | 33 | Vendored Three.js PostProcessing dependency. |
| www/libs/three/addons/renderers/common/ProgrammableStage.js | 20 | Vendored Three.js ProgrammableStage dependency. |
| www/libs/three/addons/renderers/common/RenderContext.js | 43 | Vendored Three.js RenderContext dependency. |
| www/libs/three/addons/renderers/common/RenderContexts.js | 63 | Vendored Three.js RenderContexts dependency. |
| www/libs/three/addons/renderers/common/RenderList.js | 186 | Vendored Three.js RenderList dependency. |
| www/libs/three/addons/renderers/common/RenderLists.js | 38 | Vendored Three.js RenderLists dependency. |
| www/libs/three/addons/renderers/common/RenderObject.js | 263 | Vendored Three.js RenderObject dependency. |
| www/libs/three/addons/renderers/common/RenderObjects.js | 93 | Vendored Three.js RenderObjects dependency. |
| www/libs/three/addons/renderers/common/RenderPipeline.js | 16 | Vendored Three.js RenderPipeline dependency. |
| www/libs/three/addons/renderers/common/Renderer.js | 1436 | Vendored Three.js Renderer dependency. |
| www/libs/three/addons/renderers/common/SampledTexture.js | 83 | Vendored Three.js SampledTexture dependency. |
| www/libs/three/addons/renderers/common/Sampler.js | 18 | Vendored Three.js Sampler dependency. |
| www/libs/three/addons/renderers/common/StorageBuffer.js | 17 | Vendored Three.js StorageBuffer dependency. |
| www/libs/three/addons/renderers/common/StorageBufferAttribute.js | 17 | Vendored Three.js StorageBufferAttribute dependency. |
| www/libs/three/addons/renderers/common/StorageInstancedBufferAttribute.js | 17 | Vendored Three.js StorageInstancedBufferAttribute dependency. |
| www/libs/three/addons/renderers/common/StorageTexture.js | 20 | Vendored Three.js StorageTexture dependency. |
| www/libs/three/addons/renderers/common/Textures.js | 344 | Vendored Three.js Textures dependency. |
| www/libs/three/addons/renderers/common/Uniform.js | 140 | Vendored Three.js Uniform dependency. |
| www/libs/three/addons/renderers/common/UniformBuffer.js | 15 | Vendored Three.js UniformBuffer dependency. |
| www/libs/three/addons/renderers/common/UniformsGroup.js | 301 | Vendored Three.js UniformsGroup dependency. |
| www/libs/three/addons/renderers/common/extras/PMREMGenerator.js | 773 | Vendored Three.js PMREMGenerator dependency. |
| www/libs/three/addons/renderers/common/nodes/NodeBuilderState.js | 44 | Vendored Three.js NodeBuilderState dependency. |
| www/libs/three/addons/renderers/common/nodes/NodeSampledTexture.js | 49 | Vendored Three.js NodeSampledTexture dependency. |
| www/libs/three/addons/renderers/common/nodes/NodeSampler.js | 15 | Vendored Three.js NodeSampler dependency. |
| www/libs/three/addons/renderers/common/nodes/NodeStorageBuffer.js | 23 | Vendored Three.js NodeStorageBuffer dependency. |
| www/libs/three/addons/renderers/common/nodes/NodeUniform.js | 135 | Vendored Three.js NodeUniform dependency. |
| www/libs/three/addons/renderers/common/nodes/NodeUniformBuffer.js | 23 | Vendored Three.js NodeUniformBuffer dependency. |
| www/libs/three/addons/renderers/common/nodes/NodeUniformsGroup.js | 44 | Vendored Three.js NodeUniformsGroup dependency. |
| www/libs/three/addons/renderers/common/nodes/Nodes.js | 467 | Vendored Three.js Nodes dependency. |
| www/libs/three/addons/renderers/webgl/WebGLBackend.js | 1492 | Vendored Three.js WebGLBackend dependency. |
| www/libs/three/addons/renderers/webgl/WebGLBufferRenderer.js | 145 | Vendored Three.js WebGLBufferRenderer dependency. |
| www/libs/three/addons/renderers/webgl/nodes/GLSLNodeBuilder.js | 810 | Vendored Three.js GLSLNodeBuilder dependency. |
| www/libs/three/addons/renderers/webgl/utils/WebGLAttributeUtils.js | 258 | Vendored Three.js WebGLAttributeUtils dependency. |
| www/libs/three/addons/renderers/webgl/utils/WebGLCapabilities.js | 36 | Vendored Three.js WebGLCapabilities dependency. |
| www/libs/three/addons/renderers/webgl/utils/WebGLConstants.js | 12 | Vendored Three.js WebGLConstants dependency. |
| www/libs/three/addons/renderers/webgl/utils/WebGLExtensions.js | 36 | Vendored Three.js WebGLExtensions dependency. |
| www/libs/three/addons/renderers/webgl/utils/WebGLState.js | 738 | Vendored Three.js WebGLState dependency. |
| www/libs/three/addons/renderers/webgl/utils/WebGLTextureUtils.js | 751 | Vendored Three.js WebGLTextureUtils dependency. |
| www/libs/three/addons/renderers/webgl/utils/WebGLUtils.js | 268 | Vendored Three.js WebGLUtils dependency. |
| www/libs/three/addons/renderers/webgpu/WebGPUBackend.js | 1339 | Vendored Three.js WebGPUBackend dependency. |
| www/libs/three/addons/renderers/webgpu/WebGPURenderer.js | 53 | Vendored Three.js WebGPURenderer dependency. |
| www/libs/three/addons/renderers/webgpu/nodes/WGSLNodeBuilder.js | 1095 | Vendored Three.js WGSLNodeBuilder dependency. |
| www/libs/three/addons/renderers/webgpu/nodes/WGSLNodeFunction.js | 104 | Vendored Three.js WGSLNodeFunction dependency. |
| www/libs/three/addons/renderers/webgpu/nodes/WGSLNodeParser.js | 14 | Vendored Three.js WGSLNodeParser dependency. |
| www/libs/three/addons/renderers/webgpu/utils/WebGPUAttributeUtils.js | 321 | Vendored Three.js WebGPUAttributeUtils dependency. |
| www/libs/three/addons/renderers/webgpu/utils/WebGPUBindingUtils.js | 258 | Vendored Three.js WebGPUBindingUtils dependency. |
| www/libs/three/addons/renderers/webgpu/utils/WebGPUConstants.js | 324 | Vendored Three.js WebGPUConstants dependency. |
| www/libs/three/addons/renderers/webgpu/utils/WebGPUPipelineUtils.js | 591 | Vendored Three.js WebGPUPipelineUtils dependency. |
| www/libs/three/addons/renderers/webgpu/utils/WebGPUTexturePassUtils.js | 285 | Vendored Three.js WebGPUTexturePassUtils dependency. |
| www/libs/three/addons/renderers/webgpu/utils/WebGPUTextureUtils.js | 1114 | Vendored Three.js WebGPUTextureUtils dependency. |
| www/libs/three/addons/renderers/webgpu/utils/WebGPUUtils.js | 93 | Vendored Three.js WebGPUUtils dependency. |
| www/libs/three/addons/shaders/ACESFilmicToneMappingShader.js | 89 | Vendored Three.js ACESFilmicToneMappingShader dependency. |
| www/libs/three/addons/shaders/AfterimageShader.js | 58 | Vendored Three.js AfterimageShader dependency. |
| www/libs/three/addons/shaders/BasicShader.js | 29 | Vendored Three.js BasicShader dependency. |
| www/libs/three/addons/shaders/BleachBypassShader.js | 62 | Vendored Three.js BleachBypassShader dependency. |
| www/libs/three/addons/shaders/BlendShader.js | 49 | Vendored Three.js BlendShader dependency. |
| www/libs/three/addons/shaders/BokehShader.js | 145 | Vendored Three.js BokehShader dependency. |
| www/libs/three/addons/shaders/BokehShader2.js | 397 | Vendored Three.js BokehShader2 dependency. |
| www/libs/three/addons/shaders/BrightnessContrastShader.js | 56 | Vendored Three.js BrightnessContrastShader dependency. |
| www/libs/three/addons/shaders/ColorCorrectionShader.js | 52 | Vendored Three.js ColorCorrectionShader dependency. |
| www/libs/three/addons/shaders/ColorifyShader.js | 51 | Vendored Three.js ColorifyShader dependency. |
| www/libs/three/addons/shaders/ConvolutionShader.js | 103 | Vendored Three.js ConvolutionShader dependency. |
| www/libs/three/addons/shaders/CopyShader.js | 45 | Vendored Three.js CopyShader dependency. |
| www/libs/three/addons/shaders/DOFMipMapShader.js | 56 | Vendored Three.js DOFMipMapShader dependency. |
| www/libs/three/addons/shaders/DepthLimitedBlurShader.js | 171 | Vendored Three.js DepthLimitedBlurShader dependency. |
| www/libs/three/addons/shaders/DigitalGlitch.js | 101 | Vendored Three.js DigitalGlitch dependency. |
| www/libs/three/addons/shaders/DotScreenShader.js | 70 | Vendored Three.js DotScreenShader dependency. |
| www/libs/three/addons/shaders/ExposureShader.js | 44 | Vendored Three.js ExposureShader dependency. |
| www/libs/three/addons/shaders/FXAAShader.js | 288 | Vendored Three.js FXAAShader dependency. |
| www/libs/three/addons/shaders/FilmShader.js | 59 | Vendored Three.js FilmShader dependency. |
| www/libs/three/addons/shaders/FocusShader.js | 89 | Vendored Three.js FocusShader dependency. |
| www/libs/three/addons/shaders/FreiChenShader.js | 96 | Vendored Three.js FreiChenShader dependency. |
| www/libs/three/addons/shaders/GTAOShader.js | 424 | Vendored Three.js GTAOShader dependency. |
| www/libs/three/addons/shaders/GammaCorrectionShader.js | 43 | Vendored Three.js GammaCorrectionShader dependency. |
| www/libs/three/addons/shaders/GodRaysShader.js | 321 | Vendored Three.js GodRaysShader dependency. |
| www/libs/three/addons/shaders/HalftoneShader.js | 312 | Vendored Three.js HalftoneShader dependency. |
| www/libs/three/addons/shaders/HorizontalBlurShader.js | 59 | Vendored Three.js HorizontalBlurShader dependency. |
| www/libs/three/addons/shaders/HorizontalTiltShiftShader.js | 63 | Vendored Three.js HorizontalTiltShiftShader dependency. |
| www/libs/three/addons/shaders/HueSaturationShader.js | 67 | Vendored Three.js HueSaturationShader dependency. |
| www/libs/three/addons/shaders/KaleidoShader.js | 58 | Vendored Three.js KaleidoShader dependency. |
| www/libs/three/addons/shaders/LuminosityHighPassShader.js | 66 | Vendored Three.js LuminosityHighPassShader dependency. |
| www/libs/three/addons/shaders/LuminosityShader.js | 48 | Vendored Three.js LuminosityShader dependency. |
| www/libs/three/addons/shaders/MMDToonShader.js | 134 | Vendored Three.js MMDToonShader dependency. |
| www/libs/three/addons/shaders/MirrorShader.js | 56 | Vendored Three.js MirrorShader dependency. |
| www/libs/three/addons/shaders/NormalMapShader.js | 55 | Vendored Three.js NormalMapShader dependency. |
| www/libs/three/addons/shaders/OutputShader.js | 85 | Vendored Three.js OutputShader dependency. |
| www/libs/three/addons/shaders/PoissonDenoiseShader.js | 226 | Vendored Three.js PoissonDenoiseShader dependency. |
| www/libs/three/addons/shaders/RGBShiftShader.js | 54 | Vendored Three.js RGBShiftShader dependency. |
| www/libs/three/addons/shaders/SAOShader.js | 179 | Vendored Three.js SAOShader dependency. |
| www/libs/three/addons/shaders/SMAAShader.js | 466 | Vendored Three.js SMAAShader dependency. |
| www/libs/three/addons/shaders/SSAOShader.js | 300 | Vendored Three.js SSAOShader dependency. |
| www/libs/three/addons/shaders/SSRShader.js | 370 | Vendored Three.js SSRShader dependency. |
| www/libs/three/addons/shaders/SepiaShader.js | 52 | Vendored Three.js SepiaShader dependency. |
| www/libs/three/addons/shaders/SobelOperatorShader.js | 92 | Vendored Three.js SobelOperatorShader dependency. |
| www/libs/three/addons/shaders/SubsurfaceScatteringShader.js | 90 | Vendored Three.js SubsurfaceScatteringShader dependency. |
| www/libs/three/addons/shaders/TechnicolorShader.js | 45 | Vendored Three.js TechnicolorShader dependency. |
| www/libs/three/addons/shaders/ToonShader.js | 326 | Vendored Three.js ToonShader dependency. |
| www/libs/three/addons/shaders/TriangleBlurShader.js | 74 | Vendored Three.js TriangleBlurShader dependency. |
| www/libs/three/addons/shaders/UnpackDepthRGBAShader.js | 47 | Vendored Three.js UnpackDepthRGBAShader dependency. |
| www/libs/three/addons/shaders/VelocityShader.js | 130 | Vendored Three.js VelocityShader dependency. |
| www/libs/three/addons/shaders/VerticalBlurShader.js | 59 | Vendored Three.js VerticalBlurShader dependency. |
| www/libs/three/addons/shaders/VerticalTiltShiftShader.js | 63 | Vendored Three.js VerticalTiltShiftShader dependency. |
| www/libs/three/addons/shaders/VignetteShader.js | 51 | Vendored Three.js VignetteShader dependency. |
| www/libs/three/addons/shaders/VolumeShader.js | 289 | Vendored Three.js VolumeShader dependency. |
| www/libs/three/addons/shaders/WaterRefractionShader.js | 95 | Vendored Three.js WaterRefractionShader dependency. |
| www/libs/three/addons/textures/FlakesTexture.js | 40 | Vendored Three.js FlakesTexture dependency. |
| www/libs/three/addons/transpiler/AST.js | 270 | Vendored Three.js AST dependency. |
| www/libs/three/addons/transpiler/GLSLDecoder.js | 941 | Vendored Three.js GLSLDecoder dependency. |
| www/libs/three/addons/transpiler/ShaderToyDecoder.js | 49 | Vendored Three.js ShaderToyDecoder dependency. |
| www/libs/three/addons/transpiler/TSLEncoder.js | 715 | Vendored Three.js TSLEncoder dependency. |
| www/libs/three/addons/transpiler/Transpiler.js | 18 | Vendored Three.js Transpiler dependency. |
| www/libs/three/addons/utils/BufferGeometryUtils.js | 1371 | Vendored Three.js BufferGeometryUtils dependency. |
| www/libs/three/addons/utils/CameraUtils.js | 73 | Vendored Three.js CameraUtils dependency. |
| www/libs/three/addons/utils/GPUStatsPanel.js | 93 | Vendored Three.js GPUStatsPanel dependency. |
| www/libs/three/addons/utils/GeometryCompressionUtils.js | 639 | Vendored Three.js GeometryCompressionUtils dependency. |
| www/libs/three/addons/utils/GeometryUtils.js | 221 | Vendored Three.js GeometryUtils dependency. |
| www/libs/three/addons/utils/LDrawUtils.js | 202 | Vendored Three.js LDrawUtils dependency. |
| www/libs/three/addons/utils/PackedPhongMaterial.js | 178 | Vendored Three.js PackedPhongMaterial dependency. |
| www/libs/three/addons/utils/SceneUtils.js | 313 | Vendored Three.js SceneUtils dependency. |
| www/libs/three/addons/utils/ShadowMapViewer.js | 210 | Vendored Three.js ShadowMapViewer dependency. |
| www/libs/three/addons/utils/SkeletonUtils.js | 424 | Vendored Three.js SkeletonUtils dependency. |
| www/libs/three/addons/utils/SortUtils.js | 160 | Vendored Three.js SortUtils dependency. |
| www/libs/three/addons/utils/TextureUtils.js | 98 | Vendored Three.js TextureUtils dependency. |
| www/libs/three/addons/utils/UVsDebug.js | 165 | Vendored Three.js UVsDebug dependency. |
| www/libs/three/addons/utils/WorkerPool.js | 102 | Vendored Three.js WorkerPool dependency. |
| www/libs/three/addons/webxr/ARButton.js | 232 | Vendored Three.js ARButton dependency. |
| www/libs/three/addons/webxr/OculusHandModel.js | 110 | Vendored Three.js OculusHandModel dependency. |
| www/libs/three/addons/webxr/OculusHandPointerModel.js | 413 | Vendored Three.js OculusHandPointerModel dependency. |
| www/libs/three/addons/webxr/Text2D.js | 38 | Vendored Three.js Text2D dependency. |
| www/libs/three/addons/webxr/VRButton.js | 233 | Vendored Three.js VRButton dependency. |
| www/libs/three/addons/webxr/XRButton.js | 223 | Vendored Three.js XRButton dependency. |
| www/libs/three/addons/webxr/XRControllerModelFactory.js | 312 | Vendored Three.js XRControllerModelFactory dependency. |
| www/libs/three/addons/webxr/XREstimatedLight.js | 223 | Vendored Three.js XREstimatedLight dependency. |
| www/libs/three/addons/webxr/XRHandMeshModel.js | 114 | Vendored Three.js XRHandMeshModel dependency. |
| www/libs/three/addons/webxr/XRHandModelFactory.js | 107 | Vendored Three.js XRHandModelFactory dependency. |
| www/libs/three/addons/webxr/XRHandPrimitiveModel.js | 103 | Vendored Three.js XRHandPrimitiveModel dependency. |
| www/libs/three/addons/webxr/XRPlanes.js | 100 | Vendored Three.js XRPlanes dependency. |
| www/libs/three/three.module.js | 53032 | Vendored Three.js three.module dependency. |

</details>
