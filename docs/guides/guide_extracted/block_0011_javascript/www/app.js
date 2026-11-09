import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// ============================================================================
// 1. KHỞI TẠO KHÔNG GIAN 3D VR & CAMERA RIG (GHẾ LÁI TỶ LỆ 1:1)
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
const cameraRig = new THREE.Group();
cameraRig.position.set(-0.42, 0.0, 0.15); // Mắt người lái ghế trái
camera.position.set(0, 1.12, 0);
cameraRig.add(camera);
scene.add(cameraRig);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

scene.add(new THREE.HemisphereLight(0xfff5e4, 0x222233, 1.5));
const cabinLight = new THREE.PointLight(0xffeedd, 1.8, 4.0);
cabinLight.position.set(0, 1.28, 0.0);
scene.add(cabinLight);

// ============================================================================
// 2. TRẠNG THÁI XE, NÚT BẤM VÔ LĂNG & BỘ ĐẾM FPS ESP32-CAM
// ============================================================================
const vehicleState = {
  esp32Url: 'ws://192.168.4.102:4213',
  signalConnected: false,
  streamFps: 0,
  vrFps: 90,
  steeringAngleDeg: 0,
  throttlePercent: 0,
  brakePercent: 0,
  speedKmh: 0,
  gears: ['P', 'R', 'N', 'D'],
  gearIndex: 0,
  mediaPlaying: true,
  mediaVolume: 80,
  windshieldFilterMode: 0, // 0: Standard, 1: Night Vision, 2: High Contrast
  hornActive: false,
  cruiseControl: false,
  lastActionLog: 'Sẵn sàng - Chạm hoặc bắn tia vào nút trên vô lăng',
  simRoadOffset: 0
};

// ============================================================================
// 3. TỐI ƯU FPS ESP32-CAM BẰNG WEB WORKER + IMAGEBITMAP (ZERO MAIN-THREAD LAG)
// ============================================================================
let latestEsp32Bitmap = null;
let streamFrameCounter = 0;
let lastFpsTimestamp = performance.now();

// Tạo Web Worker chạy ngầm để nhận Binary WebSocket & giải mã JPEG bằng phần cứng
const workerCode = `
  let ws = null;
  let isDecoding = false;

  self.onmessage = function(e) {
    if (e.data.cmd === 'connect') {
      if (ws) { try { ws.close(); } catch(err) {} }
      const url = e.data.url;
      if (!url.startsWith('ws')) return;

      ws = new WebSocket(url);
      ws.binaryType = 'blob';
      ws.onopen = () => self.postMessage({ type: 'status', connected: true });
      ws.onclose = () => self.postMessage({ type: 'status', connected: false });
      ws.onerror = () => self.postMessage({ type: 'status', connected: false });

      ws.onmessage = async (msg) => {
        // Cơ chế Drop-Frame thông minh: Nếu khung trước chưa vẽ xong, bỏ qua ngay để giữ độ trễ = 0
        if (isDecoding || !(msg.data instanceof Blob)) return;
        isDecoding = true;
        try {
          const bitmap = await createImageBitmap(msg.data);
          self.postMessage({ type: 'frame', bitmap }, [bitmap]);
        } catch (err) {}
        isDecoding = false;
      };
    }
  };
`;
const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const streamWorker = new Worker(URL.createObjectURL(workerBlob));

streamWorker.onmessage = (e) => {
  if (e.data.type === 'status') {
    vehicleState.signalConnected = e.data.connected;
  } else if (e.data.type === 'frame') {
    if (latestEsp32Bitmap) latestEsp32Bitmap.close(); // Giải phóng bộ nhớ GPU ngay lập tức
    latestEsp32Bitmap = e.data.bitmap;
    vehicleState.signalConnected = true;
    streamFrameCounter++;
  }
};

// Hỗ trợ luồng HTTP MJPEG dự phòng nếu người dùng nhập http:// thay vì ws://
const fallbackImg = new Image();
fallbackImg.crossOrigin = 'Anonymous';
fallbackImg.onload = () => {
  vehicleState.signalConnected = true;
  streamFrameCounter++;
};
fallbackImg.onerror = () => { vehicleState.signalConnected = false; };

function connectEsp32Stream(url) {
  vehicleState.esp32Url = url;
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    streamWorker.postMessage({ cmd: 'connect', url });
  } else {
    fallbackImg.src = url;
  }
}

document.getElementById('btn-connect')?.addEventListener('click', () => {
  const inputUrl = document.getElementById('esp32-ip').value.trim();
  connectEsp32Stream(inputUrl);
});

// ============================================================================
// 4. DỰNG KHOANG NỘI THẤT & VÔ LĂNG TÍCH HỢP NÚT BẤM VẬT LÝ + LẪY CHUYỂN SỐ
// ============================================================================
const cabinGroup = new THREE.Group();
scene.add(cabinGroup);

const matNappa = new THREE.MeshStandardMaterial({ color: 0xdfd1be, roughness: 0.45 });
const matWalnut = new THREE.MeshPhysicalMaterial({ color: 0x3a2314, roughness: 0.08, clearcoat: 1.0 });
const matChrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.15, metalness: 0.9 });
const matPiano = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.05 });
const matCarpet = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.9 });

const steeringWheelPivot = new THREE.Group();
const interactiveWheelButtons = []; // Danh sách nút vật lý trên vô lăng
let throttlePedalMesh = null;
let brakePedalMesh = null;

// Hàm tạo nhãn chữ sắc nét trên mặt nút bấm vật lý của vô lăng
function createButtonLabelTexture(label, bgColor = '#141820', textColor = '#00e5ff') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 60);
  ctx.fillStyle = textColor;
  ctx.font = 'bold 24px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 32);
  return new THREE.CanvasTexture(c);
}

function createPhysicalWheelButton(label, width, height, depth, pos, onClickAction, isPaddle = false) {
  const tex = createButtonLabelTexture(label, isPaddle ? '#252b38' : '#0f131a');
  const materials = [
    matChrome, matChrome, matChrome, matChrome,
    new THREE.MeshBasicMaterial({ map: tex }), // Mặt trước có chữ
    matPiano
  ];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials);
  mesh.position.copy(pos);

  mesh.userData = {
    isWheelButton: true,
    label,
    baseZ: pos.z,
    pressedOffset: 0,
    isPaddle,
    onClick: onClickAction
  };

  steeringWheelPivot.add(mesh);
  interactiveWheelButtons.push(mesh);
  return mesh;
}

function buildInteriorAndInteractiveWheel() {
  // Sàn, Bệ trung tâm & Bảng Táp-lô
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.04, 2.6), matCarpet);
  floor.position.set(0, 0.02, 0);
  cabinGroup.add(floor);

  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.45, 1.25), matNappa);
  consoleBox.position.set(0, 0.225, -0.05);
  cabinGroup.add(consoleBox);

  const dashMain = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.34, 0.42), matNappa);
  dashMain.position.set(0, 0.68, -0.62);
  cabinGroup.add(dashMain);

  const dashWood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.16, 0.04), matWalnut);
  dashWood.position.set(0, 0.68, -0.41);
  cabinGroup.add(dashWood);

  // Ghế trước & Ghế sau
  [-0.41, 0.41].forEach((xPos) => {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.53), matNappa);
    seatBase.position.set(xPos, 0.32, 0.15);
    cabinGroup.add(seatBase);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.78, 0.12), matNappa);
    seatBack.position.set(xPos, 0.72, 0.42);
    seatBack.rotation.x = THREE.MathUtils.degToRad(10);
    cabinGroup.add(seatBack);
  });

  // VÔ LĂNG CHUẨN 380MM + CỤM NÚT BẤM VẬT LÝ
  steeringWheelPivot.position.set(-0.42, 0.68, -0.25);
  steeringWheelPivot.rotation.x = THREE.MathUtils.degToRad(-23);
  cabinGroup.add(steeringWheelPivot);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 24, 64), matNappa);
  steeringWheelPivot.add(rim);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.036, 32), matNappa);
  hub.rotation.x = Math.PI / 2;
  steeringWheelPivot.add(hub);

  // 2 Chấu ngang phủ nhựa Piano Black chứa cụm nút bấm
  const spokeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.052, 0.022), matPiano);
  spokeLeft.position.set(-0.115, -0.01, 0.002);
  steeringWheelPivot.add(spokeLeft);

  const spokeRight = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.052, 0.022), matPiano);
  spokeRight.position.set(0.115, -0.01, 0.002);
  steeringWheelPivot.add(spokeRight);

  const spokeBottom = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.10, 0.02), matWalnut);
  spokeBottom.position.set(0, -0.115, 0);
  steeringWheelPivot.add(spokeBottom);

  // --- CÁC NÚT BẤM VẬT LÝ TRÊN VÔ LĂNG (Hành trình lún 2mm khi nhấn) ---
  // 1. Cụm nút bên trái (Điều khiển Giải trí / Âm lượng)
  createPhysicalWheelButton('VOL +', 0.034, 0.020, 0.010, new THREE.Vector3(-0.140, 0.004, 0.016), () => {
    vehicleState.mediaVolume = Math.min(100, vehicleState.mediaVolume + 10);
    vehicleState.lastActionLog = `Nút Vô Lăng [VOL +]: Âm lượng ${vehicleState.mediaVolume}%`;
  });

  createPhysicalWheelButton('VOL -', 0.034, 0.020, 0.010, new THREE.Vector3(-0.140, -0.022, 0.016), () => {
    vehicleState.mediaVolume = Math.max(0, vehicleState.mediaVolume - 10);
    vehicleState.lastActionLog = `Nút Vô Lăng [VOL -]: Âm lượng ${vehicleState.mediaVolume}%`;
  });

  createPhysicalWheelButton('PLAY/PAUSE', 0.038, 0.044, 0.010, new THREE.Vector3(-0.095, -0.009, 0.016), () => {
    vehicleState.mediaPlaying = !vehicleState.mediaPlaying;
    vehicleState.lastActionLog = `Nút Vô Lăng [MEDIA]: ${vehicleState.mediaPlaying ? 'Đang phát' : 'Tạm dừng'}`;
  });

  // 2. Cụm nút bên phải (Chế độ Kính Chắn Gió ESP32, Reset HUD, Cruise Control)
  createPhysicalWheelButton('CAM MODE', 0.038, 0.044, 0.010, new THREE.Vector3(0.095, -0.009, 0.016), () => {
    vehicleState.windshieldFilterMode = (vehicleState.windshieldFilterMode + 1) % 3;
    const modes = ['Chuẩn RGB', 'Night Vision (Hồng ngoại)', 'Tương phản cao'];
    vehicleState.lastActionLog = `Nút Vô Lăng [CAM MODE]: ${modes[vehicleState.windshieldFilterMode]}`;
  });

  createPhysicalWheelButton('RESET HUD', 0.036, 0.020, 0.010, new THREE.Vector3(0.140, 0.004, 0.016), () => {
    resetPanelsToDefault();
    vehicleState.lastActionLog = 'Nút Vô Lăng [RESET HUD]: Đã căn chỉnh lại màn hình';
  });

  createPhysicalWheelButton('CRUISE', 0.036, 0.020, 0.010, new THREE.Vector3(0.140, -0.022, 0.016), () => {
    vehicleState.cruiseControl = !vehicleState.cruiseControl;
    if (vehicleState.cruiseControl && vehicleState.speedKmh < 40) vehicleState.speedKmh = 60;
    vehicleState.lastActionLog = `Nút Vô Lăng [CRUISE]: ${vehicleState.cruiseControl ? 'BẬT giữ ga tự động' : 'TẮT'}`;
  });

  // 3. Nút Còi Trung Tâm (RR HORN)
  createPhysicalWheelButton('RR HORN', 0.062, 0.062, 0.012, new THREE.Vector3(0, 0, 0.020), () => {
    vehicleState.hornActive = true;
    vehicleState.lastActionLog = 'Nút Vô Lăng [HORN]: Đã bấm còi cảnh báo!';
    setTimeout(() => { vehicleState.hornActive = false; }, 600);
  });

  // 4. Hai Lẫy Chuyển Số Phía Sau Vô Lăng (Paddle Shifters - / +)
  createPhysicalWheelButton('GEAR -', 0.032, 0.088, 0.006, new THREE.Vector3(-0.130, 0.038, -0.028), () => {
    vehicleState.gearIndex = Math.max(0, vehicleState.gearIndex - 1);
    vehicleState.lastActionLog = `Lẫy Vô Lăng [GEAR -]: Về số [${vehicleState.gears[vehicleState.gearIndex]}]`;
  }, true);

  createPhysicalWheelButton('GEAR +', 0.032, 0.088, 0.006, new THREE.Vector3(0.130, 0.038, -0.028), () => {
    vehicleState.gearIndex = Math.min(vehicleState.gears.length - 1, vehicleState.gearIndex + 1);
    vehicleState.lastActionLog = `Lẫy Vô Lăng [GEAR +]: Lên số [${vehicleState.gears[vehicleState.gearIndex]}]`;
  }, true);

  // Cụm 3 Bàn Đạp dưới sàn
  const pedalGeo = new THREE.BoxGeometry(0.06, 0.11, 0.015);
  brakePedalMesh = new THREE.Mesh(pedalGeo, matChrome);
  brakePedalMesh.position.set(-0.42, 0.12, -0.48);
  brakePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25);
  cabinGroup.add(brakePedalMesh);

  throttlePedalMesh = new THREE.Mesh(pedalGeo, matChrome);
  throttlePedalMesh.position.set(-0.30, 0.12, -0.48);
  throttlePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25);
  cabinGroup.add(throttlePedalMesh);
}

buildInteriorAndInteractiveWheel();

// ============================================================================
// 5. BẢNG HUD TẬP TRUNG & KHUNG KÍNH CHẮN GIÓ ESP32 (KÉO THẢ & THU PHÓNG)
// ============================================================================
const draggableHandles = [];

function attachDragHandle(group, width, height) {
  const handle = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.055),
    new THREE.MeshBasicMaterial({ color: 0x162436, side: THREE.DoubleSide })
  );
  handle.position.set(0, height / 2 + 0.032, 0);
  handle.userData = { isDragHandle: true, parentPanel: group };
  group.add(handle);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width + 0.01, height + 0.01)),
    new THREE.LineBasicMaterial({ color: 0x00d2ff })
  );
  group.add(border);
  draggableHandles.push(handle);
}

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024;
hudCanvas.height = 680;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

const hudPanelGroup = new THREE.Group();
scene.add(hudPanelGroup);
hudPanelGroup.add(new THREE.Mesh(
  new THREE.PlaneGeometry(0.58, 0.38),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, side: THREE.DoubleSide })
));
attachDragHandle(hudPanelGroup, 0.58, 0.38);

const windshieldCanvas = document.createElement('canvas');
windshieldCanvas.width = 1280;
windshieldCanvas.height = 720;
const wsCtx = windshieldCanvas.getContext('2d');
const wsTexture = new THREE.CanvasTexture(windshieldCanvas);
wsTexture.minFilter = THREE.LinearFilter;
wsTexture.generateMipmaps = false; // Tắt Mipmap để tăng tốc độ nạp Texture từ ESP32

const simulatorScreenGroup = new THREE.Group();
scene.add(simulatorScreenGroup);
simulatorScreenGroup.add(new THREE.Mesh(
  new THREE.PlaneGeometry(1.48, 0.68),
  new THREE.MeshBasicMaterial({ map: wsTexture, side: THREE.DoubleSide })
));
attachDragHandle(simulatorScreenGroup, 1.48, 0.68);

function resetPanelsToDefault() {
  hudPanelGroup.position.set(-0.82, 1.12, -0.58);
  hudPanelGroup.rotation.set(0, THREE.MathUtils.degToRad(22), 0);
  hudPanelGroup.scale.setScalar(1.0);

  simulatorScreenGroup.position.set(-0.15, 1.18, -1.05);
  simulatorScreenGroup.rotation.set(0, 0, 0);
  simulatorScreenGroup.scale.setScalar(1.0);
}
resetPanelsToDefault();

function updateHudPanel() {
  hudCtx.clearRect(0, 0, 1024, 680);
  hudCtx.fillStyle = 'rgba(10, 14, 22, 0.92)';
  hudCtx.fillRect(0, 0, 1024, 680);
  hudCtx.strokeStyle = vehicleState.hornActive ? '#ff3b30' : '#00d2ff';
  hudCtx.lineWidth = 6;
  hudCtx.strokeRect(3, 3, 1018, 674);

  hudCtx.fillStyle = '#00d2ff';
  hudCtx.fillRect(0, 0, 1024, 60);
  hudCtx.fillStyle = '#06101a';
  hudCtx.font = 'bold 28px Segoe UI, sans-serif';
  hudCtx.fillText('★ BẢNG THÔNG SỐ TẬP TRUNG & LOG NÚT BẤM VÔ LĂNG (GIỮ GRIP ĐỂ KÉO)', 22, 40);

  hudCtx.fillStyle = '#4cd964';
  hudCtx.font = 'bold 26px monospace';
  hudCtx.fillText(
    `• FPS RENDER QUEST 3 : ${vehicleState.vrFps} FPS  |  ESP32 STREAM FPS : ${vehicleState.streamFps} FPS`,
    30, 110
  );

  hudCtx.fillStyle = vehicleState.signalConnected ? '#4cd964' : '#ff9500';
  hudCtx.fillText(
    `• LUỒNG ESP32-CAM    : ${vehicleState.signalConnected ? 'ONLINE (Zero-Copy Worker)' : 'SIMULATOR MODE'} [${vehicleState.esp32Url}]`,
    30, 152
  );

  hudCtx.fillStyle = '#a0c4ff';
  hudCtx.fillText(
    `• MEDIA & CRUISE     : Volume ${vehicleState.mediaVolume}% (${vehicleState.mediaPlaying ? 'Playing' : 'Paused'}) | Cruise: ${vehicleState.cruiseControl ? 'ON' : 'OFF'}`,
    30, 194
  );

  // Hộp hiển thị trạng thái nút bấm vật lý trên vô lăng
  hudCtx.fillStyle = '#182436';
  hudCtx.fillRect(30, 220, 964, 64);
  hudCtx.strokeStyle = '#d4af37';
  hudCtx.lineWidth = 2;
  hudCtx.strokeRect(30, 220, 964, 64);
  hudCtx.fillStyle = '#ffd60a';
  hudCtx.font = 'bold 25px Segoe UI, sans-serif';
  hudCtx.fillText(`▶ ${vehicleState.lastActionLog}`, 48, 260);

  // Thông số lái
  const gear = vehicleState.gears[vehicleState.gearIndex];
  hudCtx.fillStyle = '#00e5ff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText(`GEAR: [${gear}] (P/R/N/D)   |   SPEED: ${Math.round(vehicleState.speedKmh)} KM/H`, 30, 360);

  hudCtx.fillStyle = '#4cd964';
  hudCtx.font = 'bold 34px monospace';
  hudCtx.fillText(
    `THROTTLE: ${Math.round(vehicleState.throttlePercent)}%   |   BRAKE: ${Math.round(vehicleState.brakePercent)}%   |   STEER: ${Math.round(vehicleState.steeringAngleDeg)}°`,
    30, 425
  );

  hudCtx.fillStyle = '#cccccc';
  hudCtx.font = '22px Segoe UI, sans-serif';
  hudCtx.fillText('• Mẹo: Chĩa tia laser vào các nút trên vô lăng rồi bóp Cò (hoặc chạm trực tiếp) để bấm nút vật lý.', 30, 490);
  hudCtx.fillText('• Giữ nút Grip vào thanh tiêu đề để di chuyển khung; đẩy cần gạt để thu nhỏ/phóng to.', 30, 528);

  hudTexture.needsUpdate = true;
}

function updateWindshieldStream(dt) {
  // Áp dụng bộ lọc màu từ nút bấm CAM MODE trên vô lăng
  if (vehicleState.windshieldFilterMode === 1) {
    wsCtx.filter = 'sepia(100%) hue-rotate(70deg) saturate(300%) contrast(130%)'; // Night Vision
  } else if (vehicleState.windshieldFilterMode === 2) {
    wsCtx.filter = 'contrast(160%) saturate(140%)';
  } else {
    wsCtx.filter = 'none';
  }

  if (latestEsp32Bitmap) {
    // Vẽ trực tiếp ImageBitmap đã giải mã từ Web Worker (Tốc độ cao, không nghẽn CPU)
    wsCtx.drawImage(latestEsp32Bitmap, 0, 0, 1280, 720);
  } else if (vehicleState.signalConnected && fallbackImg.complete && fallbackImg.naturalWidth > 0) {
    wsCtx.drawImage(fallbackImg, 0, 0, 1280, 720);
  } else {
    // Cảnh đường chạy Simulator khi chưa bật mạch ESP32
    wsCtx.fillStyle = '#091021';
    wsCtx.fillRect(0, 0, 1280, 360);
    wsCtx.fillStyle = '#151922';
    wsCtx.fillRect(0, 360, 1280, 360);

    const steerShift = (vehicleState.steeringAngleDeg / 540) * 280;
    const vanishX = 640 - steerShift;
    wsCtx.strokeStyle = '#00e5ff';
    wsCtx.lineWidth = 4;
    wsCtx.beginPath();
    wsCtx.moveTo(vanishX - 45, 360);
    wsCtx.lineTo(110, 720);
    wsCtx.moveTo(vanishX + 45, 360);
    wsCtx.lineTo(1170, 720);
    wsCtx.stroke();

    vehicleState.simRoadOffset = (vehicleState.simRoadOffset + vehicleState.speedKmh * dt * 8) % 120;
    wsCtx.strokeStyle = '#ffd60a';
    wsCtx.lineWidth = 6;
    for (let y = 380 + (vehicleState.simRoadOffset % 60); y < 720; y += 75) {
      const p = (y - 360) / 360;
      const cx = vanishX + (640 - vanishX) * p;
      wsCtx.beginPath();
      wsCtx.moveTo(cx, y);
      wsCtx.lineTo(cx, y + 35 * p + 10);
      wsCtx.stroke();
    }
  }

  wsCtx.filter = 'none';
  wsTexture.needsUpdate = true;
}

// ============================================================================
// 6. TƯƠNG TÁC TAY CẦM QUEST 3: BẤM NÚT VẬT LÝ VÔ LĂNG (RAY + POKE + HAPTICS)
// ============================================================================
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllerModelFactory = new XRControllerModelFactory();
let activeGrabState = { controller: null, panelGroup: null, distance: 1.0 };

function triggerHapticPulse(controller, intensity = 0.7, durationMs = 40) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    if (src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0]) {
      src.gamepad.hapticActuators[0].pulse(intensity, durationMs);
    }
  }
}

function pressPhysicalWheelButton(btnMesh, controller) {
  // Hiệu ứng lún nút cơ học 2mm (hoặc 6mm đối với lẫy chuyển số)
  btnMesh.userData.pressedOffset = btnMesh.userData.isPaddle ? -0.006 : -0.003;
  if (btnMesh.userData.onClick) btnMesh.userData.onClick();
  triggerHapticPulse(controller, 0.85, 45);
}

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  cameraRig.add(controller);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2.5)]),
    new THREE.LineBasicMaterial({ color: 0x00e5ff })
  );
  controller.add(line);

  // Bấm cò (Select) vào các nút vật lý trên vô lăng
  controller.addEventListener('selectstart', () => {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObjects(interactiveWheelButtons, false);
    if (hits.length > 0) {
      pressPhysicalWheelButton(hits[0].object, controller);
    }
  });

  // Bóp nút Grip (Squeeze) để kéo thả Bảng HUD hoặc Kính Chắn Gió
  controller.addEventListener('squeezestart', () => {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObjects(draggableHandles, false);
    if (hits.length > 0) {
      activeGrabState = {
        controller,
        panelGroup: hits[0].object.userData.parentPanel,
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
}

// Hỗ trợ Click chuột trên màn hình PC để test các nút vật lý trên vô lăng
const mouse = new THREE.Vector2();
window.addEventListener('pointerdown', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(interactiveWheelButtons, false);
  if (hits.length > 0) {
    pressPhysicalWheelButton(hits[0].object, null);
  }
});

// ============================================================================
// 7. VÒNG LẶP CHÍNH: ĐỒNG BỘ CHUYỂN ĐỘNG NÚT BẤM, TAY CẦM & ĐO FPS
// ============================================================================
const clock = new THREE.Clock();
let vrFrameCount = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  vrFrameCount++;

  // Cập nhật bộ đếm FPS mỗi giây
  const now = performance.now();
  if (now - lastFpsTimestamp >= 1000) {
    vehicleState.streamFps = streamFrameCounter;
    vehicleState.vrFps = vrFrameCount;
    streamFrameCounter = 0;
    vrFrameCount = 0;
    lastFpsTimestamp = now;
  }

  // Đàn hồi lò xo (Spring-back) cho các nút bấm vật lý trên vô lăng sau khi nhấn
  for (const btn of interactiveWheelButtons) {
    btn.userData.pressedOffset = THREE.MathUtils.lerp(btn.userData.pressedOffset, 0, dt * 14);
    btn.position.z = btn.userData.baseZ + btn.userData.pressedOffset;
  }

  // Xử lý tay cầm VR
  const session = renderer.xr.getSession();
  if (session) {
    if (activeGrabState.controller && activeGrabState.panelGroup) {
      tempMatrix.identity().extractRotation(activeGrabState.controller.matrixWorld);
      const origin = new THREE.Vector3().setFromMatrixPosition(activeGrabState.controller.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
      activeGrabState.panelGroup.position.lerp(origin.add(dir.multiplyScalar(activeGrabState.distance)), 0.25);

      const eyePos = new THREE.Vector3();
      camera.getWorldPosition(eyePos);
      activeGrabState.panelGroup.lookAt(eyePos);
    }

    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      const gp = src.gamepad;

      if (src.handedness === 'right' && gp.buttons[0]) {
        vehicleState.throttlePercent = gp.buttons[0].value * 100;
        if (vehicleState.throttlePercent > 5) vehicleState.cruiseControl = false;
      }
      if (src.handedness === 'left' && gp.buttons[0]) {
        vehicleState.brakePercent = gp.buttons[0].value * 100;
        if (vehicleState.brakePercent > 5) vehicleState.cruiseControl = false;
      }

      const stickX = gp.axes[2] || 0;
      const stickY = gp.axes[3] || 0;

      if (activeGrabState.panelGroup) {
        activeGrabState.distance = THREE.MathUtils.clamp(activeGrabState.distance - stickY * dt * 1.2, 0.45, 2.8);
        const nextScale = THREE.MathUtils.clamp(activeGrabState.panelGroup.scale.x + stickX * dt * 0.8, 0.5, 2.5);
        activeGrabState.panelGroup.scale.setScalar(nextScale);
      } else if (Math.abs(stickX) > 0.08) {
        vehicleState.steeringAngleDeg = THREE.MathUtils.clamp(vehicleState.steeringAngleDeg + stickX * 260 * dt, -540, 540);
      } else {
        vehicleState.steeringAngleDeg = THREE.MathUtils.lerp(vehicleState.steeringAngleDeg, 0, dt * 2.5);
      }
    }
  }

  // Tính tốc độ xe & hiệu ứng Cruise Control
  const gear = vehicleState.gears[vehicleState.gearIndex];
  if (gear === 'D' || gear === 'R') {
    const effectiveThrottle = vehicleState.cruiseControl ? 45 : vehicleState.throttlePercent;
    const accel = (effectiveThrottle / 100) * 38;
    const decel = (vehicleState.brakePercent / 100) * 65 + 6;
    vehicleState.speedKmh = THREE.MathUtils.clamp(vehicleState.speedKmh + (accel - decel) * dt, 0, 250);
  } else {
    vehicleState.speedKmh = THREE.MathUtils.lerp(vehicleState.speedKmh, 0, dt * 3);
  }

  // Xoay vô lăng (kéo theo toàn bộ nút vật lý) & nhấn bàn đạp
  steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(-vehicleState.steeringAngleDeg);
  if (throttlePedalMesh) {
    throttlePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25 + (vehicleState.throttlePercent / 100) * 25);
  }
  if (brakePedalMesh) {
    brakePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25 + (vehicleState.brakePercent / 100) * 25);
  }

  updateHudPanel();
  updateWindshieldStream(dt);
  renderer.render(scene, camera);
});

