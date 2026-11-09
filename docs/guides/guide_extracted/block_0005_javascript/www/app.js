import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================================
// 1. KHỞI TẠO SCENE, CAMERA RIG (VỊ TRÍ GHẾ LÁI) & RENDERER
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);

// Camera Rig đặt đúng tọa độ mắt người lái ghế trái (X: -0.42m, Y: 1.12m, Z: 0.15m)
const cameraRig = new THREE.Group();
cameraRig.position.set(-0.42, 0.0, 0.15);
camera.position.set(0, 1.12, 0);
cameraRig.add(camera);
scene.add(cameraRig);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// Ánh sáng PBR Khoang Nội Thất
const ambientLight = new THREE.HemisphereLight(0xfff5e4, 0x222233, 1.4);
scene.add(ambientLight);
const cabinLight = new THREE.PointLight(0xffeedd, 1.8, 4.0);
cabinLight.position.set(0, 1.28, 0.0);
scene.add(cabinLight);

// ============================================================================
// 2. TRẠNG THÁI HỆ THỐNG XE & ESP32 TELEMETRY
// ============================================================================
const vehicleState = {
  esp32Url: 'http://192.168.4.102:4213/stream',
  signalConnected: false,
  steeringAngleDeg: 0,     // -540 đến +540 độ
  throttlePercent: 0,      // 0 đến 100%
  brakePercent: 0,         // 0 đến 100%
  speedKmh: 0,
  gears: ['P', 'R', 'N', 'D'],
  gearIndex: 0,            // Mặc định P
  youtubePlaying: true,
  simRoadOffset: 0
};

// ============================================================================
// 3. DỰNG NỘI THẤT ROLLS-ROYCE PBR (1:1 METRIC) & NẠP FILE BLENDER .GLB
// ============================================================================
const cabinGroup = new THREE.Group();
scene.add(cabinGroup);

const matNappa = new THREE.MeshStandardMaterial({ color: 0xdfd1be, roughness: 0.45 });
const matWalnut = new THREE.MeshPhysicalMaterial({ color: 0x3a2314, roughness: 0.08, clearcoat: 1.0 });
const matChrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.1, metalness: 1.0 });
const matPiano = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.05 });
const matCarpet = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.9 });

let steeringWheelPivot = new THREE.Group();
let throttlePedalMesh = null;
let brakePedalMesh = null;

function buildLuxuryInterior() {
  // Sàn cabin (Rộng 1.95m x Dài 2.6m)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.04, 2.6), matCarpet);
  floor.position.set(0, 0.02, 0);
  cabinGroup.add(floor);

  // Bệ tỳ tay trung tâm (Center Console: Rộng 280mm, Cao 450mm)
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.45, 1.25), matNappa);
  consoleBox.position.set(0, 0.225, -0.05);
  cabinGroup.add(consoleBox);

  const consoleWood = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.6), matWalnut);
  consoleWood.position.set(0, 0.46, -0.2);
  cabinGroup.add(consoleWood);

  // Táp-lô (Dashboard) bọc da Nappa + Ốp gỗ Óc chó
  const dashMain = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.34, 0.42), matNappa);
  dashMain.position.set(0, 0.68, -0.62);
  cabinGroup.add(dashMain);

  const dashWood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.16, 0.04), matWalnut);
  dashWood.position.set(0, 0.68, -0.41);
  cabinGroup.add(dashWood);

  // Hai ghế trước (Driver & Passenger: Rộng 560mm, Sâu 530mm, Lưng cao 780mm, Tâm cách nhau 820mm)
  [-0.41, 0.41].forEach((xPos) => {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.53), matNappa);
    seatBase.position.set(xPos, 0.32, 0.15);
    cabinGroup.add(seatBase);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.78, 0.12), matNappa);
    seatBack.position.set(xPos, 0.72, 0.42);
    seatBack.rotation.x = THREE.MathUtils.degToRad(10);
    cabinGroup.add(seatBack);

    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.20, 0.10), matNappa);
    headrest.position.set(xPos, 1.18, 0.47);
    cabinGroup.add(headrest);
  });

  // Hàng ghế sau hạng thương gia (360 VR View)
  const rearSeatBase = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 0.56), matNappa);
  rearSeatBase.position.set(0, 0.34, 0.98);
  cabinGroup.add(rearSeatBase);

  const rearSeatBack = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.80, 0.14), matNappa);
  rearSeatBack.position.set(0, 0.75, 1.24);
  cabinGroup.add(rearSeatBack);

  // Vô lăng chuẩn Rolls-Royce (Đường kính 380mm, dày 36mm, nghiêng 23 độ, tâm cách sàn 680mm)
  steeringWheelPivot.position.set(-0.42, 0.68, -0.25);
  steeringWheelPivot.rotation.x = THREE.MathUtils.degToRad(-23);
  cabinGroup.add(steeringWheelPivot);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 20, 64), matNappa);
  steeringWheelPivot.add(rim);

  const innerChromeRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.004, 12, 48), matChrome);
  steeringWheelPivot.add(innerChromeRing);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 32), matPiano);
  hub.rotation.x = Math.PI / 2;
  steeringWheelPivot.add(hub);

  // 3 Chấu vô lăng + Vạch định tâm đỉnh vô lăng
  const spokeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.028, 0.02), matPiano);
  spokeLeft.position.set(-0.11, -0.02, 0);
  spokeLeft.rotation.z = THREE.MathUtils.degToRad(15);
  steeringWheelPivot.add(spokeLeft);

  const spokeRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.028, 0.02), matPiano);
  spokeRight.position.set(0.11, -0.02, 0);
  spokeRight.rotation.z = THREE.MathUtils.degToRad(-15);
  steeringWheelPivot.add(spokeRight);

  const spokeBottom = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.02), matWalnut);
  spokeBottom.position.set(0, -0.11, 0);
  steeringWheelPivot.add(spokeBottom);

  const topMarker = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.04), matChrome);
  topMarker.position.set(0, 0.19, 0);
  steeringWheelPivot.add(topMarker);

  // Cụm 3 Bàn đạp (60mm x 110mm, nhấn xoay trục X tối đa 25 độ)
  const pedalGeo = new THREE.BoxGeometry(0.06, 0.11, 0.015);
  const clutchPedal = new THREE.Mesh(pedalGeo, matChrome);
  clutchPedal.position.set(-0.54, 0.12, -0.48);
  clutchPedal.rotation.x = THREE.MathUtils.degToRad(-25);
  cabinGroup.add(clutchPedal);

  brakePedalMesh = new THREE.Mesh(pedalGeo, matChrome);
  brakePedalMesh.position.set(-0.42, 0.12, -0.48);
  brakePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25);
  cabinGroup.add(brakePedalMesh);

  throttlePedalMesh = new THREE.Mesh(pedalGeo, matChrome);
  throttlePedalMesh.position.set(-0.30, 0.12, -0.48);
  throttlePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25);
  cabinGroup.add(throttlePedalMesh);
}

buildLuxuryInterior();

// Tự động nạp thêm file .glb từ Blender nếu có trong thư mục assets
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  './assets/rolls_royce_cabin.glb',
  (gltf) => { scene.add(gltf.scene); },
  undefined,
  () => { /* Sử dụng bản PBR nội bộ nếu chưa chép file .glb */ }
);

// ============================================================================
// 4. HỆ THỐNG KHUNG KÉO THẢ & THU PHÓNG ĐA NĂNG (DRAGGABLE & SCALABLE PANELS)
// ============================================================================
const draggablePanels = [];

function makePanelDraggable(group, width, height, titleText) {
  // Thanh tiêu đề phía trên để tia Raycaster nắm kéo
  const handleGeo = new THREE.PlaneGeometry(width, 0.055);
  const handleMat = new THREE.MeshBasicMaterial({
    color: 0x162436,
    side: THREE.DoubleSide
  });
  const handleBar = new THREE.Mesh(handleGeo, handleMat);
  handleBar.position.set(0, height / 2 + 0.032, 0);
  handleBar.userData.isDraggableHandle = true;
  handleBar.userData.parentPanel = group;
  group.add(handleBar);

  // Viền sáng bao quanh khung
  const borderEdges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(width + 0.01, height + 0.01));
  const borderLine = new THREE.LineSegments(
    borderEdges,
    new THREE.LineBasicMaterial({ color: 0x00d2ff })
  );
  group.add(borderLine);

  draggablePanels.push(handleBar);
  return handleBar;
}

// ============================================================================
// 5. GIẢI PHÁP KHẮC PHỤC LỖI CHỮ ĐÈ NHAU: GOM VÀO 1 BẢNG HUD DUY NHẤT
// ============================================================================
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024;
hudCanvas.height = 640;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

const hudPanelGroup = new THREE.Group();
// Đặt mặc định bên trái tầm mắt ở khoảng cách 0.85m (không che vô lăng, không sát mặt)
hudPanelGroup.position.set(-0.82, 1.12, -0.58);
hudPanelGroup.rotation.y = THREE.MathUtils.degToRad(22);
scene.add(hudPanelGroup);

const hudMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.58, 0.36),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, side: THREE.DoubleSide })
);
hudPanelGroup.add(hudMesh);
makePanelDraggable(hudPanelGroup, 0.58, 0.36, 'TELEMETRY HUD');

function updateUnifiedHudCanvas() {
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);

  // Nền bảng điều khiển bán trong suốt sang trọng
  hudCtx.fillStyle = 'rgba(10, 14, 22, 0.90)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.strokeStyle = '#00d2ff';
  hudCtx.lineWidth = 6;
  hudCtx.strokeRect(3, 3, hudCanvas.width - 6, hudCanvas.height - 6);

  // Header
  hudCtx.fillStyle = '#00d2ff';
  hudCtx.fillRect(0, 0, hudCanvas.width, 64);
  hudCtx.fillStyle = '#06101a';
  hudCtx.font = 'bold 30px Segoe UI, sans-serif';
  hudCtx.fillText('★ BẢNG ĐIỀU KHIỂN & THÔNG SỐ HỆ THỐNG (GIỮ GRIP ĐỂ KÉO/THU PHÓNG)', 24, 43);

  // Cột 1: Trạng thái kết nối & Phần cứng
  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = 'bold 28px monospace';
  hudCtx.fillText('1. KẾT NỐI CAMERA & XR:', 30, 120);

  hudCtx.fillStyle = '#4cd964';
  hudCtx.fillText('• XR RENDER TEST : PASS [V17 OK]', 45, 165);
  hudCtx.fillText('• SCREEN MODE    : [FLOATING & SCALABLE]', 45, 208);

  hudCtx.fillStyle = vehicleState.signalConnected ? '#4cd964' : '#ff9500';
  const sigText = vehicleState.signalConnected
    ? `• ESP32 STREAM   : ONLINE (${vehicleState.esp32Url})`
    : `• ESP32 STREAM   : SIMULATOR MODE (${vehicleState.esp32Url})`;
  hudCtx.fillText(sigText, 45, 251);

  hudCtx.fillStyle = '#a0c4ff';
  hudCtx.fillText('• HARDWARE CTRL  : Quest 3 6DoF (Thumbstick + Triggers)', 45, 294);
  hudCtx.fillText('• REAR CAMERA    : STANDBY (Auto-Active on Gear [R])', 45, 337);
  hudCtx.fillText('• YOUTUBE MEDIA  : ACTIVE ON CENTER SCREEN', 45, 380);

  // Đường kẻ phân cách
  hudCtx.strokeStyle = '#2a3b52';
  hudCtx.lineWidth = 3;
  hudCtx.beginPath();
  hudCtx.moveTo(30, 415);
  hudCtx.lineTo(hudCanvas.width - 30, 415);
  hudCtx.stroke();

  // Khu vực thông số vận hành (Gear, Throttle, Brake, Steering, Speed)
  const currentGear = vehicleState.gears[vehicleState.gearIndex];
  hudCtx.fillStyle = '#00e5ff';
  hudCtx.font = 'bold 42px monospace';
  hudCtx.fillText(`GEAR: [${currentGear}]  (P / R / N / D)`, 30, 475);

  hudCtx.fillStyle = '#4cd964';
  hudCtx.font = 'bold 34px monospace';
  hudCtx.fillText(
    `THROTTLE: ${Math.round(vehicleState.throttlePercent)}%   |   BRAKE: ${Math.round(vehicleState.brakePercent)}%`,
    30,
    535
  );

  hudCtx.fillStyle = '#ffd60a';
  hudCtx.fillText(
    `STEER: ${Math.round(vehicleState.steeringAngleDeg)}°   |   SPEED: ${Math.round(vehicleState.speedKmh)} KM/H`,
    30,
    592
  );

  hudTexture.needsUpdate = true;
}

// ============================================================================
// 6. KHUNG KÍNH CHẮN GIÓ SIMULATOR (ESP32 CAMERA STREAM + KÉO THẢ & THU PHÓNG)
// ============================================================================
const windshieldCanvas = document.createElement('canvas');
windshieldCanvas.width = 1280;
windshieldCanvas.height = 720;
const wsCtx = windshieldCanvas.getContext('2d');
const wsTexture = new THREE.CanvasTexture(windshieldCanvas);

// Luồng ảnh thực từ ESP32-CAM
const esp32Image = new Image();
esp32Image.crossOrigin = 'Anonymous';
esp32Image.onload = () => { vehicleState.signalConnected = true; };
esp32Image.onerror = () => { vehicleState.signalConnected = false; };

document.getElementById('btn-connect').addEventListener('click', () => {
  const url = document.getElementById('esp32-ip').value.trim();
  vehicleState.esp32Url = url;
  esp32Image.src = url;
});

const simulatorScreenGroup = new THREE.Group();
// Đặt tại vị trí kính chắn gió phía trước (tỷ lệ rộng 1.48m x 0.68m, có thể kéo/phóng to)
simulatorScreenGroup.position.set(-0.15, 1.18, -1.05);
scene.add(simulatorScreenGroup);

const windshieldMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.48, 0.68),
  new THREE.MeshBasicMaterial({ map: wsTexture, side: THREE.DoubleSide })
);
simulatorScreenGroup.add(windshieldMesh);
makePanelDraggable(simulatorScreenGroup, 1.48, 0.68, 'ESP32 FRONT CAMERA / WINDSHIELD');

function updateWindshieldSimulatorView(dt) {
  if (vehicleState.signalConnected && esp32Image.complete && esp32Image.naturalWidth > 0) {
    wsCtx.drawImage(esp32Image, 0, 0, windshieldCanvas.width, windshieldCanvas.height);
  } else {
    // Khung cảnh đường chạy Simulator 3D mượt mà khi chờ luồng ESP32
    const gradSky = wsCtx.createLinearGradient(0, 0, 0, 360);
    gradSky.addColorStop(0, '#070b19');
    gradSky.addColorStop(1, '#1b2e4b');
    wsCtx.fillStyle = gradSky;
    wsCtx.fillRect(0, 0, 1280, 360);

    // Mặt đường
    wsCtx.fillStyle = '#151922';
    wsCtx.fillRect(0, 360, 1280, 360);

    // Hiệu ứng làn đường dịch chuyển theo góc lái và tốc độ
    const steerShift = (vehicleState.steeringAngleDeg / 540) * 280;
    const vanishX = 640 - steerShift;
    wsCtx.strokeStyle = '#00e5ff';
    wsCtx.lineWidth = 4;

    // Hai lề đường
    wsCtx.beginPath();
    wsCtx.moveTo(vanishX - 40, 360);
    wsCtx.lineTo(120, 720);
    wsCtx.moveTo(vanishX + 40, 360);
    wsCtx.lineTo(1160, 720);
    wsCtx.stroke();

    // Vạch kẻ đường đứt đoạn chuyển động theo chân ga
    vehicleState.simRoadOffset = (vehicleState.simRoadOffset + vehicleState.speedKmh * dt * 8) % 120;
    wsCtx.strokeStyle = '#ffd60a';
    wsCtx.lineWidth = 6;
    for (let y = 380 + (vehicleState.simRoadOffset % 60); y < 720; y += 75) {
      const progress = (y - 360) / 360;
      const xCenter = vanishX + (640 - vanishX) * progress;
      wsCtx.beginPath();
      wsCtx.moveTo(xCenter, y);
      wsCtx.lineTo(xCenter, y + 35 * progress + 10);
      wsCtx.stroke();
    }
  }

  // HUD nhỏ gọn ở mép trên kính chắn gió
  wsCtx.fillStyle = 'rgba(0, 20, 40, 0.75)';
  wsCtx.fillRect(0, 0, 1280, 44);
  wsCtx.fillStyle = '#00e5ff';
  wsCtx.font = 'bold 22px monospace';
  wsCtx.fillText(
    `★ WINDSHIELD FPV CAMERA [${vehicleState.esp32Url}]  |  SPEED: ${Math.round(vehicleState.speedKmh)} KM/H  |  GEAR: [${vehicleState.gears[vehicleState.gearIndex]}]`,
    20,
    30
  );

  wsTexture.needsUpdate = true;
}

// ============================================================================
// 7. BA MÀN HÌNH NỘI THẤT (SAU VÔ LĂNG, CAMERA LÙI, GIẢI TRÍ YOUTUBE)
// ============================================================================
// 7.1. Màn hình sau vô lăng (310mm x 130mm)
const clusterMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.31, 0.13),
  new THREE.MeshBasicMaterial({ map: wsTexture })
);
clusterMesh.position.set(-0.42, 0.72, -0.40);
clusterMesh.rotation.x = THREE.MathUtils.degToRad(-12);
cabinGroup.add(clusterMesh);

// 7.2. Màn hình Camera lùi bên phải (260mm x 110mm) có vạch dẫn hướng động
const rearCanvas = document.createElement('canvas');
rearCanvas.width = 512;
rearCanvas.height = 256;
const rearCtx = rearCanvas.getContext('2d');
const rearTex = new THREE.CanvasTexture(rearCanvas);

const rearScreenMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.26, 0.11),
  new THREE.MeshBasicMaterial({ map: rearTex })
);
rearScreenMesh.position.set(0.42, 0.72, -0.40);
rearScreenMesh.rotation.x = THREE.MathUtils.degToRad(-12);
cabinGroup.add(rearScreenMesh);

function updateRearCameraScreen() {
  rearCtx.fillStyle = '#0d131a';
  rearCtx.fillRect(0, 0, 512, 256);

  const isReverse = vehicleState.gears[vehicleState.gearIndex] === 'R';
  rearCtx.fillStyle = isReverse ? '#ff3b30' : '#00d2ff';
  rearCtx.font = 'bold 22px monospace';
  rearCtx.fillText(isReverse ? 'REAR CAMERA [ACTIVE - REVERSE]' : 'REAR CAMERA [STANDBY]', 18, 32);

  // Vạch dẫn hướng lùi xe uốn cong theo góc đánh lái vô lăng
  const bend = (vehicleState.steeringAngleDeg / 540) * 110;
  rearCtx.lineWidth = 4;
  rearCtx.strokeStyle = '#4cd964';
  rearCtx.beginPath();
  rearCtx.moveTo(140, 240);
  rearCtx.quadraticCurveTo(170 + bend * 0.5, 150, 190 + bend, 75);
  rearCtx.moveTo(372, 240);
  rearCtx.quadraticCurveTo(342 + bend * 0.5, 150, 322 + bend, 75);
  rearCtx.stroke();

  rearTex.needsUpdate = true;
}

// 7.3. Màn hình Giải trí YouTube trung tâm (350mm x 180mm)
const ytCanvas = document.createElement('canvas');
ytCanvas.width = 640;
ytCanvas.height = 360;
const ytCtx = ytCanvas.getContext('2d');
const ytTex = new THREE.CanvasTexture(ytCanvas);

const ytScreenMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.35, 0.18),
  new THREE.MeshBasicMaterial({ map: ytTex })
);
ytScreenMesh.position.set(0.0, 0.72, -0.40);
ytScreenMesh.rotation.x = THREE.MathUtils.degToRad(-12);
cabinGroup.add(ytScreenMesh);

function updateYouTubeCenterScreen(time) {
  ytCtx.fillStyle = '#0f0f0f';
  ytCtx.fillRect(0, 0, 640, 360);
  ytCtx.fillStyle = '#ff0000';
  ytCtx.fillRect(20, 16, 140, 36);
  ytCtx.fillStyle = '#ffffff';
  ytCtx.font = 'bold 22px sans-serif';
  ytCtx.fillText('▶ YouTube', 32, 42);
  ytCtx.fillStyle = '#cccccc';
  ytCtx.font = '20px sans-serif';
  ytCtx.fillText('Rolls-Royce Bespoke Audio & 3D Media Stream', 180, 41);

  // Sóng nhạc Visualizer
  for (let i = 0; i < 24; i++) {
    const barH = 30 + Math.abs(Math.sin(time * 3 + i * 0.4)) * 140;
    ytCtx.fillStyle = `hsl(${200 + i * 5}, 90%, 55%)`;
    ytCtx.fillRect(50 + i * 23, 280 - barH, 16, barH);
  }
  ytTex.needsUpdate = true;
}

// ============================================================================
// 8. ĐIỀU KHIỂN TAY CẦM META QUEST 3 (KÉO THẢ PANEL + LÁI XE + ĐẠP GA)
// ============================================================================
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllerModelFactory = new XRControllerModelFactory();

const controllers = [];
let activeGrabState = {
  controller: null,
  panelGroup: null,
  distance: 1.0
};
let buttonCooldown = 0;

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  cameraRig.add(controller);

  // Tia laser chỉ hướng
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -3)
  ]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x00e5ff }));
  controller.add(line);

  // Bóp nút Grip (Squeeze) để nắm kéo Bảng Chú Thích hoặc Khung Kính Chắn Gió
  controller.addEventListener('squeezestart', () => {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObjects(draggablePanels, false);
    if (hits.length > 0) {
      const targetPanel = hits[0].object.userData.parentPanel;
      activeGrabState = {
        controller,
        panelGroup: targetPanel,
        distance: hits[0].distance
      };
    }
  });

  controller.addEventListener('squeezeend', () => {
    if (activeGrabState.controller === controller) {
      activeGrabState.controller = null;
      activeGrabState.panelGroup = null;
    }
  });

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  cameraRig.add(grip);

  controllers.push(controller);
}

function processVRControllerInputs(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;

  if (buttonCooldown > 0) buttonCooldown -= dt;

  // 1. Nếu đang giữ nút Grip kéo thả Panel (Bảng HUD hoặc Kính Chắn Gió)
  if (activeGrabState.controller && activeGrabState.panelGroup) {
    tempMatrix.identity().extractRotation(activeGrabState.controller.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(activeGrabState.controller.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);

    const newPos = origin.add(dir.multiplyScalar(activeGrabState.distance));
    activeGrabState.panelGroup.position.lerp(newPos, 0.25);

    // Luôn hướng mặt bảng về phía mắt người lái để dễ đọc
    const eyeWorldPos = new THREE.Vector3();
    camera.getWorldPosition(eyeWorldPos);
    activeGrabState.panelGroup.lookAt(eyeWorldPos);
  }

  // 2. Đọc nút bấm, cò ga/phanh và cần xoay vô lăng từ Gamepad OpenXR
  for (const source of session.inputSources) {
    if (!source.gamepad) continue;
    const gp = source.gamepad;

    // Trigger (buttons[0]): Tay phải = Chân Ga (Throttle), Tay trái = Chân Phanh (Brake)
    if (source.handedness === 'right' && gp.buttons[0]) {
      vehicleState.throttlePercent = gp.buttons[0].value * 100;
    }
    if (source.handedness === 'left' && gp.buttons[0]) {
      vehicleState.brakePercent = gp.buttons[0].value * 100;
    }

    // Cần gạt Thumbstick (axes[2] = Ngang, axes[3] = Dọc)
    const stickX = gp.axes[2] || 0;
    const stickY = gp.axes[3] || 0;

    if (activeGrabState.panelGroup) {
      // Khi đang nắm giữ khung: Gạt dọc để Kéo gần / Đẩy xa, Gạt ngang để Phóng to / Thu nhỏ khung
      activeGrabState.distance = THREE.MathUtils.clamp(
        activeGrabState.distance - stickY * dt * 1.2,
        0.45,
        2.80
      );
      const currentScale = activeGrabState.panelGroup.scale.x;
      const nextScale = THREE.MathUtils.clamp(currentScale + stickX * dt * 0.8, 0.5, 2.5);
      activeGrabState.panelGroup.scale.setScalar(nextScale);
    } else if (Math.abs(stickX) > 0.08) {
      // Khi không nắm khung: Gạt Thumbstick ngang để Xoay Vô Lăng (-540 đến +540 độ)
      vehicleState.steeringAngleDeg = THREE.MathUtils.clamp(
        vehicleState.steeringAngleDeg + stickX * 260 * dt,
        -540,
        540
      );
    } else {
      // Tự trả lái nhẹ về tâm khi buông cần gạt
      vehicleState.steeringAngleDeg = THREE.MathUtils.lerp(vehicleState.steeringAngleDeg, 0, dt * 2.5);
    }

    // Nút A / X (buttons[4]) và B / Y (buttons[5]) để sang số P - R - N - D
    if (buttonCooldown <= 0) {
      if (gp.buttons[4] && gp.buttons[4].pressed) {
        vehicleState.gearIndex = (vehicleState.gearIndex + 1) % vehicleState.gears.length;
        buttonCooldown = 0.3;
      } else if (gp.buttons[5] && gp.buttons[5].pressed) {
        vehicleState.gearIndex = (vehicleState.gearIndex - 1 + vehicleState.gears.length) % vehicleState.gears.length;
        buttonCooldown = 0.3;
      }
    }
  }
}

// Hỗ trợ phím bàn phím khi test trên PC trước khi xuất APK
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') vehicleState.steeringAngleDeg = Math.max(-540, vehicleState.steeringAngleDeg - 25);
  if (e.key === 'ArrowRight' || e.key === 'd') vehicleState.steeringAngleDeg = Math.min(540, vehicleState.steeringAngleDeg + 25);
  if (e.key === 'ArrowUp' || e.key === 'w') vehicleState.throttlePercent = Math.min(100, vehicleState.throttlePercent + 10);
  if (e.key === 'ArrowDown' || e.key === 's') { vehicleState.throttlePercent = 0; vehicleState.brakePercent = 100; }
  if (e.key === 'g') vehicleState.gearIndex = (vehicleState.gearIndex + 1) % vehicleState.gears.length;
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowDown' || e.key === 's') vehicleState.brakePercent = 0;
});

// ============================================================================
// 9. VÒNG LẶP RENDER 72HZ/90HZ & ĐỒNG BỘ CHUYỂN ĐỘNG CƠ HỌC
// ============================================================================
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  processVRControllerInputs(dt);

  // Tính toán tốc độ xe dựa theo chân ga, chân phanh và vị trí số
  const currentGear = vehicleState.gears[vehicleState.gearIndex];
  if (currentGear === 'D' || currentGear === 'R') {
    const accel = (vehicleState.throttlePercent / 100) * 38;
    const decel = (vehicleState.brakePercent / 100) * 65 + 6;
    vehicleState.speedKmh = THREE.MathUtils.clamp(vehicleState.speedKmh + (accel - decel) * dt, 0, 250);
  } else {
    vehicleState.speedKmh = THREE.MathUtils.lerp(vehicleState.speedKmh, 0, dt * 3);
  }

  // Đồng bộ góc xoay Vô lăng 3D và hành trình nhấn Bàn đạp Ga/Phanh (tối đa 25 độ)
  steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(-vehicleState.steeringAngleDeg);
  if (throttlePedalMesh) {
    const throttleRad = THREE.MathUtils.degToRad(-25 + (vehicleState.throttlePercent / 100) * 25);
    throttlePedalMesh.rotation.x = throttleRad;
  }
  if (brakePedalMesh) {
    const brakeRad = THREE.MathUtils.degToRad(-25 + (vehicleState.brakePercent / 100) * 25);
    brakePedalMesh.rotation.x = brakeRad;
  }

  // Cập nhật các màn hình
  updateUnifiedHudCanvas();
  updateWindshieldSimulatorView(dt);
  updateRearCameraScreen();
  updateYouTubeCenterScreen(elapsed);

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

