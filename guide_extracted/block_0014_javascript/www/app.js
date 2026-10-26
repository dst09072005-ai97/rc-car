import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// ============================================================================
// 1. KHỞI TẠO SCENE THÀNH THỊ 3D, VEHICLE ROOT & CAMERA RIG (GHẾ LÁI 1:1)
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060913);
scene.fog = new THREE.FogExp2(0x060913, 0.0085); // Sương mù chiều sâu đô thị ban đêm

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 350);

// Gốc tọa độ tổng của Xe (Khi xe chạy và quẹo, toàn bộ Cabin + Camera + HUD đi theo)
const vehicleRoot = new THREE.Group();
scene.add(vehicleRoot);

// Thân xe có độ nhún giảm xóc (Chassis Pitch & Roll khi tăng tốc / phanh / vào cua)
const chassisGroup = new THREE.Group();
vehicleRoot.add(chassisGroup);

// Camera Rig đặt tại vị trí mắt người lái ghế trái (X: -0.42m, Y: 1.12m, Z: 0.15m)
const cameraRig = new THREE.Group();
cameraRig.position.set(-0.42, 0.0, 0.15);
camera.position.set(0, 1.12, 0);
cameraRig.add(camera);
chassisGroup.add(cameraRig);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

document.body.appendChild(
  VRButton.createButton(renderer, {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
  })
);

// Ánh sáng bầu trời thành phố & Đèn nội thất Rolls-Royce
const hemiLight = new THREE.HemisphereLight(0x88aaff, 0x1a1d24, 1.1);
scene.add(hemiLight);

const cabinLight = new THREE.PointLight(0xffeedd, 1.4, 3.5);
cabinLight.position.set(0, 1.25, 0.0);
chassisGroup.add(cabinLight);

// Hai đèn pha chiếu sáng mặt đường thành phố phía trước xe
const headlightLeft = new THREE.SpotLight(0xffffff, 18, 65, Math.PI / 5, 0.4, 1.2);
headlightLeft.position.set(-0.65, 0.65, -1.8);
headlightLeft.target.position.set(-0.65, 0.1, -18);
chassisGroup.add(headlightLeft);
chassisGroup.add(headlightLeft.target);

const headlightRight = new THREE.SpotLight(0xffffff, 18, 65, Math.PI / 5, 0.4, 1.2);
headlightRight.position.set(0.65, 0.65, -1.8);
headlightRight.target.position.set(0.65, 0.1, -18);
chassisGroup.add(headlightRight);
chassisGroup.add(headlightRight.target);

// ============================================================================
// 2. TRẠNG THÁI VẬT LÝ XE, ĐỘNG CƠ V12 8 CẤP & DANH SÁCH PHÁT MEDIA
// ============================================================================
const mediaPlaylist = [
  {
    title: 'Rolls-Royce Phantom Symphony - 4K Cinema Drive',
    channel: 'Rolls-Royce Official',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  },
  {
    title: 'Bespoke Audio Test - Grand Alpine Road Trip',
    channel: 'Luxury Automotive Sound',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4'
  },
  {
    title: 'Night City Cyberpunk Drive & Synthwave Mix',
    channel: 'VR Sim Cinema Channel',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
  }
];

const vehicleState = {
  esp32Url: 'ws://192.168.4.102:4213',
  signalConnected: false,
  streamFps: 0,
  vrFps: 90,
  steeringAngleDeg: 0,     // -540 đến +540 độ
  throttlePercent: 0,      // 0 đến 100%
  brakePercent: 0,         // 0 đến 100%
  speedKmh: 0,             // Vận tốc km/h
  velocityMs: 0,           // Vận tốc m/s
  headingRad: 0,           // Góc hướng đầu xe trong thành phố 3D
  wheelbaseM: 3.2,         // Chiều dài cơ sở xe Rolls-Royce (3.2m)
  rpm: 680,                // Vòng tua garanti V12 êm ái (680 RPM)
  autoGearSub: 1,          // Cấp số tự động 1 -> 8 khi ở chế độ D
  gears: ['P', 'R', 'N', 'D'],
  gearIndex: 3,            // Khởi động sẵn ở số [D] để đạp ga là xe chạy ngay
  mediaPlaying: false,
  mediaMuted: false,
  mediaVolume: 80,
  currentTrackIndex: 0,
  cinemaOnWindshield: false,
  windshieldTransparent: true, // Mặc định nhìn xuyên kính chắn gió ra thành phố 3D
  hornActive: false,
  cruiseControl: false,
  handTrackingActive: false,
  lastActionLog: 'Đang ở số [D] - Bóp Cò Phải (hoặc phím W/Lên) để đạp ga chạy trong thành phố!'
};

// ============================================================================
// 3. XÂY DỰNG THÀNH THỊ 3D VÔ TẬN (BUILDINGS, ROADS, STREETLIGHTS, TREES)
// ============================================================================
const cityGroup = new THREE.Group();
scene.add(cityGroup);

const BLOCK_SIZE = 60; // Mỗi ô phố rộng 60m x 60m
const GRID_RADIUS = 3; // Lưới 7x7 ô phố quanh xe (420m x 420m tự động cuốn chiếu)
const cityBlocks = [];

// Tạo Texture cửa sổ tòa nhà phát sáng ban đêm
function createBuildingWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d131f';
  ctx.fillRect(0, 0, 256, 512);

  for (let y = 12; y < 500; y += 22) {
    for (let x = 12; x < 244; x += 28) {
      const lit = Math.random() > 0.32;
      if (lit) {
        const warm = Math.random() > 0.4;
        ctx.fillStyle = warm ? '#ffdfa0' : '#80d4ff';
        ctx.fillRect(x, y, 18, 12);
      } else {
        ctx.fillStyle = '#141c2b';
        ctx.fillRect(x, y, 18, 12);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const buildingTex = createBuildingWindowTexture();
const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.85 });
const matSidewalk = new THREE.MeshStandardMaterial({ color: 0x2c323d, roughness: 0.75 });
const matLaneYellow = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
const matLaneWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
const matLampGlow = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
const matPole = new THREE.MeshStandardMaterial({ color: 0x444c56, metalness: 0.8, roughness: 0.3 });
const matTreeFoliage = new THREE.MeshStandardMaterial({ color: 0x1e4d2b, roughness: 0.8 });

function createCityBlockTemplate(gx, gz) {
  const block = new THREE.Group();

  // 1. Mặt đường nhựa chính (Asphalt 60m x 60m)
  const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE, BLOCK_SIZE), matAsphalt);
  roadMesh.rotation.x = -Math.PI / 2;
  block.add(roadMesh);

  // 2. Vạch kẻ tim đường đôi màu vàng (Trục Z và Trục X)
  const centerLineZ = new THREE.Mesh(new THREE.PlaneGeometry(0.35, BLOCK_SIZE), matLaneYellow);
  centerLineZ.rotation.x = -Math.PI / 2;
  centerLineZ.position.y = 0.02;
  block.add(centerLineZ);

  const centerLineX = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE, 0.35), matLaneYellow);
  centerLineX.rotation.x = -Math.PI / 2;
  centerLineX.position.y = 0.02;
  block.add(centerLineX);

  // Vạch phân làn đứt đoạn màu trắng
  for (let d = -24; d <= 24; d += 12) {
    const dashLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 5.0), matLaneWhite);
    dashLeft.rotation.x = -Math.PI / 2;
    dashLeft.position.set(-4.5, 0.02, d);
    block.add(dashLeft);

    const dashRight = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 5.0), matLaneWhite);
    dashRight.rotation.x = -Math.PI / 2;
    dashRight.position.set(4.5, 0.02, d);
    block.add(dashRight);
  }

  // 3. Bốn góc vỉa hè + Tòa nhà cao tầng + Đèn đường + Cây xanh (Chừa lòng đường rộng 18m ở giữa)
  const corners = [
    [-19, -19], [19, -19], [-19, 19], [19, 19]
  ];

  corners.forEach(([cx, cz], idx) => {
    // Đế vỉa hè (20m x 20m)
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(20, 0.22, 20), matSidewalk);
    sidewalk.position.set(cx, 0.11, cz);
    block.add(sidewalk);

    // Tòa nhà cao tầng (Chiều cao ngẫu nhiên từ 18m đến 65m)
    const seed = Math.abs((gx * 31 + gz * 17 + idx * 13) % 100) / 100;
    const bHeight = 18 + seed * 48;
    const bWidth = 12 + (seed * 4);
    const bDepth = 12 + ((1 - seed) * 4);

    const bMat = new THREE.MeshStandardMaterial({
      map: buildingTex,
      roughness: 0.3,
      metalness: 0.2
    });
    const building = new THREE.Mesh(new THREE.BoxGeometry(bWidth, bHeight, bDepth), bMat);
    building.position.set(cx, bHeight / 2 + 0.22, cz);
    block.add(building);

    // Viền Neon trên đỉnh tòa nhà
    const neonColors = [0x00e5ff, 0xff2a85, 0xffaa00, 0x4cd964];
    const neonMat = new THREE.MeshBasicMaterial({ color: neonColors[idx % neonColors.length] });
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(bWidth + 0.3, 0.45, bDepth + 0.3), neonMat);
    roofCap.position.set(cx, bHeight + 0.3, cz);
    block.add(roofCap);

    // Cột đèn đường ven đại lộ
    const lampX = cx > 0 ? 9.8 : -9.8;
    const lampZ = cz > 0 ? 11.0 : -11.0;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.5, 8), matPole);
    pole.position.set(lampX, 2.75, lampZ);
    block.add(pole);

    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.3), matLampGlow);
    bulb.position.set(lampX > 0 ? lampX - 0.35 : lampX + 0.35, 5.5, lampZ);
    block.add(bulb);

    // Cây xanh đô thị
    const treeZ = cz > 0 ? 16.5 : -16.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.2, 6), matPole);
    trunk.position.set(lampX, 1.1, treeZ);
    block.add(trunk);

    const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35, 1), matTreeFoliage);
    foliage.position.set(lampX, 2.8, treeZ);
    block.add(foliage);
  });

  block.userData = { gridX: gx, gridZ: gz };
  block.position.set(gx * BLOCK_SIZE, 0, gz * BLOCK_SIZE);
  cityGroup.add(block);
  return block;
}

for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
  for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
    cityBlocks.push(createCityBlockTemplate(gx, gz));
  }
}

// Cập nhật vị trí các ô phố cuốn chiếu quanh xe để đường đi dài vô tận theo mọi hướng rẽ
function updateInfiniteCityAroundCar() {
  const carGridX = Math.round(vehicleRoot.position.x / BLOCK_SIZE);
  const carGridZ = Math.round(vehicleRoot.position.z / BLOCK_SIZE);
  const span = GRID_RADIUS * 2 + 1;

  for (const block of cityBlocks) {
    let dx = block.userData.gridX - carGridX;
    let dz = block.userData.gridZ - carGridZ;

    if (dx > GRID_RADIUS) block.userData.gridX -= span;
    else if (dx < -GRID_RADIUS) block.userData.gridX += span;

    if (dz > GRID_RADIUS) block.userData.gridZ -= span;
    else if (dz < -GRID_RADIUS) block.userData.gridZ += span;

    block.position.set(
      block.userData.gridX * BLOCK_SIZE,
      0,
      block.userData.gridZ * BLOCK_SIZE
    );
  }
}

// Đặt xe ở làn đường bên phải khi xuất phát
vehicleRoot.position.set(2.2, 0, 0);

// ============================================================================
// 4. HỆ THỐNG ÂM THANH ĐỘNG CƠ V12 ĐA HÀI ÂM MƯỢT NHƯ THẬT + TIẾNG LỐP XE
// ============================================================================
let audioCtx = null;
let v12OscSub = null;     // Hài âm trầm (Sub-harmonic 0.5x)
let v12OscMain = null;    // Tần số nổ chính V12 (1.0x)
let v12OscHarm = null;    // Hài âm kim loại sang trọng (2.0x)
let v12Filter = null;
let v12MasterGain = null;
let roadNoiseGain = null;
let roadNoiseFilter = null;
let hornGain = null;
let mediaGainNode = null;
let audioAnalyser = null;
const frequencyData = new Uint8Array(32);

function initSpatialAudioSystem() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();

  // --- 4.1. Bộ Tổng Hợp Động Cơ V12 Siêu Mượt (3 Oscillators + Lowpass + Exhaust Resonance) ---
  const enginePanner = audioCtx.createPanner();
  enginePanner.panningModel = 'HRTF';
  enginePanner.distanceModel = 'inverse';
  enginePanner.positionX.value = -0.2;
  enginePanner.positionY.value = 0.65;
  enginePanner.positionZ.value = -1.4;

  v12Filter = audioCtx.createBiquadFilter();
  v12Filter.type = 'lowpass';
  v12Filter.Q.value = 2.2; // Tạo độ cộng hưởng trầm ấm của bầu pô Rolls-Royce
  v12Filter.frequency.value = 130;

  v12MasterGain = audioCtx.createGain();
  v12MasterGain.gain.value = 0.14;

  v12OscSub = audioCtx.createOscillator();
  v12OscSub.type = 'sine';
  v12OscSub.frequency.value = 34;

  v12OscMain = audioCtx.createOscillator();
  v12OscMain.type = 'sawtooth';
  v12OscMain.frequency.value = 68;

  v12OscHarm = audioCtx.createOscillator();
  v12OscHarm.type = 'triangle';
  v12OscHarm.frequency.value = 136;

  const subGain = audioCtx.createGain();
  subGain.gain.value = 0.55;
  const mainGain = audioCtx.createGain();
  mainGain.gain.value = 0.35;
  const harmGain = audioCtx.createGain();
  harmGain.gain.value = 0.20;

  v12OscSub.connect(subGain);
  v12OscMain.connect(mainGain);
  v12OscHarm.connect(harmGain);

  subGain.connect(v12Filter);
  mainGain.connect(v12Filter);
  harmGain.connect(v12Filter);

  v12Filter.connect(v12MasterGain);
  v12MasterGain.connect(enginePanner);
  enginePanner.connect(audioCtx.destination);

  v12OscSub.start();
  v12OscMain.start();
  v12OscHarm.start();

  // --- 4.2. Tiếng Lốp Xe Lăn Trên Đường Nhựa & Tiếng Gió Lướt (Rolling Tire & Wind Noise) ---
  const bufferSize = audioCtx.sampleRate * 2;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    output[i] = (lastOut + (0.02 * white)) / 1.02; // Brown/Pink Noise mượt
    lastOut = output[i];
    output[i] *= 2.5;
  }

  const whiteNoise = audioCtx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  whiteNoise.loop = true;

  roadNoiseFilter = audioCtx.createBiquadFilter();
  roadNoiseFilter.type = 'bandpass';
  roadNoiseFilter.frequency.value = 220;
  roadNoiseFilter.Q.value = 0.9;

  roadNoiseGain = audioCtx.createGain();
  roadNoiseGain.gain.value = 0.0;

  whiteNoise.connect(roadNoiseFilter);
  roadNoiseFilter.connect(roadNoiseGain);
  roadNoiseGain.connect(audioCtx.destination);
  whiteNoise.start();

  // --- 4.3. Tiếng Còi Kép Hạng Sang (410Hz + 512Hz) ---
  hornGain = audioCtx.createGain();
  hornGain.gain.value = 0.0;
  const hornOscA = audioCtx.createOscillator();
  const hornOscB = audioCtx.createOscillator();
  hornOscA.type = 'sawtooth';
  hornOscB.type = 'sawtooth';
  hornOscA.frequency.value = 410;
  hornOscB.frequency.value = 512;

  const hornFilter = audioCtx.createBiquadFilter();
  hornFilter.type = 'lowpass';
  hornFilter.frequency.value = 1500;

  hornOscA.connect(hornFilter);
  hornOscB.connect(hornFilter);
  hornFilter.connect(hornGain);
  hornGain.connect(audioCtx.destination);
  hornOscA.start();
  hornOscB.start();

  // --- 4.4. Âm Thanh 3D Màn Hình Giải Trí YouTube Trung Tâm ---
  const videoEl = document.getElementById('vr-video-source');
  try {
    const mediaSource = audioCtx.createMediaElementSource(videoEl);
    mediaGainNode = audioCtx.createGain();
    mediaGainNode.gain.value = vehicleState.mediaVolume / 100;

    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 64;

    mediaSource.connect(audioAnalyser);
    audioAnalyser.connect(mediaGainNode);
    mediaGainNode.connect(audioCtx.destination);
  } catch (e) {}
}

function playMechanicalButtonClick3D(worldPosition, isHighPitch = false) {
  initSpatialAudioSystem();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const clickGain = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(isHighPitch ? 1350 : 920, now);
  osc.frequency.exponentialRampToValueAtTime(170, now + 0.035);

  clickGain.gain.setValueAtTime(0.32, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  osc.connect(clickGain);
  clickGain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
}

// Cập nhật âm thanh Động cơ V12, Hộp số 8 cấp & Tiếng lốp xe theo thời gian thực
function updateSmoothV12Audio(dt) {
  const gear = vehicleState.gears[vehicleState.gearIndex];

  // Tính cấp số tự động (D1 -> D8) và vòng tua máy (RPM) mượt như thật
  let targetRpm = 680;
  if (gear === 'D') {
    const speedRatio = vehicleState.speedKmh / 28;
    vehicleState.autoGearSub = THREE.MathUtils.clamp(Math.floor(speedRatio) + 1, 1, 8);
    const inGearSpeed = (vehicleState.speedKmh % 28) / 28;
    targetRpm = 950 + inGearSpeed * 2200 + (vehicleState.throttlePercent / 100) * 1950;
  } else if (gear === 'R') {
    vehicleState.autoGearSub = 1;
    targetRpm = 900 + vehicleState.speedKmh * 65 + (vehicleState.throttlePercent / 100) * 1400;
  } else {
    // Nẹt pô tại chỗ ở số P hoặc N
    vehicleState.autoGearSub = 0;
    targetRpm = 680 + (vehicleState.throttlePercent / 100) * 4200;
  }

  // Nội suy mượt vòng tua máy (Quán tính bánh đà V12)
  vehicleState.rpm = THREE.MathUtils.lerp(vehicleState.rpm, Math.min(6500, targetRpm), dt * 5.5);

  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // Tần số nổ V12: 6 lần nổ trên mỗi vòng quay trục khuỷu
  const firingFreq = (vehicleState.rpm / 60) * 6;
  v12OscSub.frequency.setTargetAtTime(firingFreq * 0.5, now, 0.04);
  v12OscMain.frequency.setTargetAtTime(firingFreq, now, 0.04);
  v12OscHarm.frequency.setTargetAtTime(firingFreq * 2.0, now, 0.04);

  // Độ mở bướm ga điều khiển tần số cắt Lowpass (tiếng gầm ấm khi đạp ga sâu)
  const cutoff = 115 + (vehicleState.rpm / 6500) * 850 + (vehicleState.throttlePercent / 100) * 420;
  v12Filter.frequency.setTargetAtTime(cutoff, now, 0.05);

  const engineVol = 0.11 + (vehicleState.throttlePercent / 100) * 0.16 + (vehicleState.rpm / 6500) * 0.10;
  v12MasterGain.gain.setTargetAtTime(engineVol, now, 0.05);

  // Tiếng lốp xe & gió lướt tỷ lệ thuận với vận tốc thực tế
  const speedFactor = Math.min(1.0, vehicleState.speedKmh / 160);
  roadNoiseGain.gain.setTargetAtTime(speedFactor * 0.22, now, 0.08);
  roadNoiseFilter.frequency.setTargetAtTime(180 + speedFactor * 620, now, 0.08);

  hornGain.gain.setTargetAtTime(vehicleState.hornActive ? 0.42 : 0.0, now, 0.015);
  if (mediaGainNode) {
    mediaGainNode.gain.setTargetAtTime(vehicleState.mediaMuted ? 0 : vehicleState.mediaVolume / 100, now, 0.05);
  }
}

// ============================================================================
// 5. LUỒNG ESP32-CAM TỐC ĐỘ CAO & TRÌNH PHÁT MEDIA YOUTUBE 14 INCH
// ============================================================================
let latestEsp32Bitmap = null;
let streamFrameCounter = 0;
let lastFpsTimestamp = performance.now();

const workerCode = `
  let ws = null;
  let busy = false;
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
        if (busy || !(msg.data instanceof Blob)) return;
        busy = true;
        try {
          const bmp = await createImageBitmap(msg.data);
          self.postMessage({ type: 'frame', bitmap: bmp }, [bmp]);
        } catch (err) {}
        busy = false;
      };
    }
  };
`;
const streamWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
streamWorker.onmessage = (e) => {
  if (e.data.type === 'status') {
    vehicleState.signalConnected = e.data.connected;
  } else if (e.data.type === 'frame') {
    if (latestEsp32Bitmap) latestEsp32Bitmap.close();
    latestEsp32Bitmap = e.data.bitmap;
    vehicleState.signalConnected = true;
    vehicleState.windshieldTransparent = false;
    streamFrameCounter++;
  }
};

document.getElementById('btn-connect')?.addEventListener('click', () => {
  initSpatialAudioSystem();
  const url = document.getElementById('esp32-ip').value.trim();
  vehicleState.esp32Url = url;
  streamWorker.postMessage({ cmd: 'connect', url });
});

const videoElement = document.getElementById('vr-video-source');
videoElement.src = mediaPlaylist[0].url;
videoElement.load();

function loadAndPlayTrack(index, customUrl = null) {
  initSpatialAudioSystem();
  if (customUrl) {
    videoElement.src = customUrl;
    mediaPlaylist.unshift({ title: 'Custom Media Stream', channel: customUrl, url: customUrl });
    vehicleState.currentTrackIndex = 0;
  } else {
    vehicleState.currentTrackIndex = (index + mediaPlaylist.length) % mediaPlaylist.length;
    videoElement.src = mediaPlaylist[vehicleState.currentTrackIndex].url;
  }
  videoElement.play().then(() => {
    vehicleState.mediaPlaying = true;
    vehicleState.lastActionLog = `▶ Đang phát: ${mediaPlaylist[vehicleState.currentTrackIndex].title}`;
  }).catch(() => {});
}

function toggleMediaPlayPause() {
  initSpatialAudioSystem();
  if (videoElement.paused) {
    videoElement.play();
    vehicleState.mediaPlaying = true;
    vehicleState.lastActionLog = `▶ Đang phát: ${mediaPlaylist[vehicleState.currentTrackIndex].title}`;
  } else {
    videoElement.pause();
    vehicleState.mediaPlaying = false;
    vehicleState.lastActionLog = '⏸ Đã tạm dừng phát YouTube Media';
  }
}

document.getElementById('btn-load-media')?.addEventListener('click', () => {
  const customUrl = document.getElementById('media-url').value.trim();
  if (customUrl) loadAndPlayTrack(0, customUrl);
  else toggleMediaPlayPause();
});

// ============================================================================
// 6. DỰNG KHOANG CABIN MỞ TẦM NHÌN 360 ĐỘ RA THÀNH PHỐ + VÔ LĂNG NÚT VẬT LÝ
// ============================================================================
const cabinGroup = new THREE.Group();
chassisGroup.add(cabinGroup);

const matNappa = new THREE.MeshStandardMaterial({ color: 0xdfd1be, roughness: 0.45 });
const matWalnut = new THREE.MeshPhysicalMaterial({ color: 0x3a2314, roughness: 0.08, clearcoat: 1.0 });
const matChrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.15, metalness: 0.9 });
const matPiano = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.05 });
const matCarpet = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.9 });

const steeringWheelPivot = new THREE.Group();
const allInteractiveButtons = [];
let throttlePedalMesh = null;
let brakePedalMesh = null;

function createButtonLabelTexture(label, bgColor = '#121822', textColor = '#00e5ff') {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 160, 64);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 156, 60);
  ctx.fillStyle = textColor;
  ctx.font = 'bold 22px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 80, 32);
  return new THREE.CanvasTexture(c);
}

function createInteractive3DButton(parentGroup, label, width, height, depth, pos, onClickAction, isPaddle = false) {
  const tex = createButtonLabelTexture(label, isPaddle ? '#252b38' : '#101520');
  const materials = [
    matChrome, matChrome, matChrome, matChrome,
    new THREE.MeshBasicMaterial({ map: tex }),
    matPiano
  ];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials);
  mesh.position.copy(pos);
  mesh.userData = {
    isInteractiveButton: true,
    label,
    baseZ: pos.z,
    pressedOffset: 0,
    lastPokeTime: 0,
    isPaddle,
    onClick: onClickAction
  };
  parentGroup.add(mesh);
  allInteractiveButtons.push(mesh);
  return mesh;
}

const ytCanvas = document.createElement('canvas');
ytCanvas.width = 700;
ytCanvas.height = 360;
const ytCtx = ytCanvas.getContext('2d');
const ytCanvasTexture = new THREE.CanvasTexture(ytCanvas);
ytCanvasTexture.colorSpace = THREE.SRGBColorSpace;

// Màn hình Camera lùi bên phải (260mm x 110mm)
const rearCanvas = document.createElement('canvas');
rearCanvas.width = 512;
rearCanvas.height = 256;
const rearCtx = rearCanvas.getContext('2d');
const rearTex = new THREE.CanvasTexture(rearCanvas);

function buildOpenWindowLuxuryCabin() {
  // Sàn xe & Nắp Capo phía trước nhìn ra đường phố
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.04, 2.6), matCarpet);
  floor.position.set(0, 0.02, 0);
  cabinGroup.add(floor);

  const frontHood = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.12, 1.35), matPiano);
  frontHood.position.set(0, 0.62, -1.45);
  cabinGroup.add(frontHood);

  // Biểu tượng Spirit of Ecstasy mạ Chrome ở mũi xe để người lái căn đường khi ôm cua
  const hoodOrnament = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.11, 16), matChrome);
  hoodOrnament.position.set(0, 0.73, -2.02);
  hoodOrnament.rotation.x = -Math.PI / 5;
  cabinGroup.add(hoodOrnament);

  // Khung cột chữ A, cột B và Trần xe (Để mở hoàn toàn kính chắn gió và cửa sổ hai bên nhìn ra thành phố)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.04, 2.1), matNappa);
  roof.position.set(0, 1.38, 0.25);
  cabinGroup.add(roof);

  [-0.92, 0.92].forEach((xSide) => {
    // Tấm ốp cửa thấp (Door Trim) để nhìn rõ mặt đường bên hông xe
    const doorLower = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 2.4), matNappa);
    doorLower.position.set(xSide, 0.36, 0.05);
    cabinGroup.add(doorLower);

    const doorWood = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 2.3), matWalnut);
    doorWood.position.set(xSide, 0.66, 0.05);
    cabinGroup.add(doorWood);

    // Cột chữ A nghiêng theo kính chắn gió
    const pillarA = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.07), matNappa);
    pillarA.position.set(xSide, 1.02, -0.62);
    pillarA.rotation.x = THREE.MathUtils.degToRad(28);
    cabinGroup.add(pillarA);
  });

  // Bệ tỳ tay trung tâm & Bảng Táp-lô
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.45, 1.25), matNappa);
  consoleBox.position.set(0, 0.225, -0.05);
  cabinGroup.add(consoleBox);

  const dashMain = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.32, 0.42), matNappa);
  dashMain.position.set(0, 0.64, -0.62);
  cabinGroup.add(dashMain);

  const dashWood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.15, 0.04), matWalnut);
  dashWood.position.set(0, 0.65, -0.41);
  cabinGroup.add(dashWood);

  // Ghế Tài & Ghế Phụ
  [-0.41, 0.41].forEach((xPos) => {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.53), matNappa);
    seatBase.position.set(xPos, 0.32, 0.15);
    cabinGroup.add(seatBase);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.78, 0.12), matNappa);
    seatBack.position.set(xPos, 0.72, 0.42);
    seatBack.rotation.x = THREE.MathUtils.degToRad(10);
    cabinGroup.add(seatBack);
  });

  // Vô lăng 380mm + 9 Nút bấm vật lý
  steeringWheelPivot.position.set(-0.42, 0.68, -0.25);
  steeringWheelPivot.rotation.x = THREE.MathUtils.degToRad(-23);
  cabinGroup.add(steeringWheelPivot);

  steeringWheelPivot.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 24, 64), matNappa));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.036, 32), matNappa);
  hub.rotation.x = Math.PI / 2;
  steeringWheelPivot.add(hub);

  const spokeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.052, 0.022), matPiano);
  spokeLeft.position.set(-0.115, -0.01, 0.002);
  steeringWheelPivot.add(spokeLeft);

  const spokeRight = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.052, 0.022), matPiano);
  spokeRight.position.set(0.115, -0.01, 0.002);
  steeringWheelPivot.add(spokeRight);

  const spokeBottom = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.10, 0.02), matWalnut);
  spokeBottom.position.set(0, -0.115, 0);
  steeringWheelPivot.add(spokeBottom);

  createInteractive3DButton(steeringWheelPivot, 'VOL +', 0.034, 0.020, 0.010, new THREE.Vector3(-0.140, 0.004, 0.016), () => {
    vehicleState.mediaVolume = Math.min(100, vehicleState.mediaVolume + 10);
    vehicleState.mediaMuted = false;
    vehicleState.lastActionLog = `Vô lăng [VOL +]: Âm lượng ${vehicleState.mediaVolume}%`;
  });

  createInteractive3DButton(steeringWheelPivot, 'VOL -', 0.034, 0.020, 0.010, new THREE.Vector3(-0.140, -0.022, 0.016), () => {
    vehicleState.mediaVolume = Math.max(0, vehicleState.mediaVolume - 10);
    vehicleState.lastActionLog = `Vô lăng [VOL -]: Âm lượng ${vehicleState.mediaVolume}%`;
  });

  createInteractive3DButton(steeringWheelPivot, 'PLAY/PAUSE', 0.038, 0.044, 0.010, new THREE.Vector3(-0.095, -0.009, 0.016), () => {
    toggleMediaPlayPause();
  });

  createInteractive3DButton(steeringWheelPivot, 'GLASS/CAM', 0.038, 0.044, 0.010, new THREE.Vector3(0.095, -0.009, 0.016), () => {
    vehicleState.windshieldTransparent = !vehicleState.windshieldTransparent;
    vehicleState.lastActionLog = `Kính chắn gió: ${vehicleState.windshieldTransparent ? 'Nhìn trực tiếp Thành phố 3D' : 'Bật màn hình ESP32 Stream'}`;
  });

  createInteractive3DButton(steeringWheelPivot, 'RESET HUD', 0.036, 0.020, 0.010, new THREE.Vector3(0.140, 0.004, 0.016), () => {
    resetPanelsToDefault();
    vehicleState.lastActionLog = 'Đã đưa khung HUD & Kính chắn gió về vị trí chuẩn';
  });

  createInteractive3DButton(steeringWheelPivot, 'CRUISE', 0.036, 0.020, 0.010, new THREE.Vector3(0.140, -0.022, 0.016), () => {
    vehicleState.cruiseControl = !vehicleState.cruiseControl;
    vehicleState.lastActionLog = `Cruise Control: ${vehicleState.cruiseControl ? 'BẬT tự chạy trong phố' : 'TẮT'}`;
  });

  createInteractive3DButton(steeringWheelPivot, 'RR HORN', 0.062, 0.062, 0.012, new THREE.Vector3(0, 0, 0.020), () => {
    vehicleState.hornActive = true;
    vehicleState.lastActionLog = '📢 Đã bấm còi kép Rolls-Royce!';
    setTimeout(() => { vehicleState.hornActive = false; }, 650);
  });

  createInteractive3DButton(steeringWheelPivot, 'GEAR -', 0.032, 0.088, 0.006, new THREE.Vector3(-0.130, 0.038, -0.028), () => {
    vehicleState.gearIndex = Math.max(0, vehicleState.gearIndex - 1);
    vehicleState.lastActionLog = `Lẫy số [GEAR -]: Về số [${vehicleState.gears[vehicleState.gearIndex]}]`;
  }, true);

  createInteractive3DButton(steeringWheelPivot, 'GEAR +', 0.032, 0.088, 0.006, new THREE.Vector3(0.130, 0.038, -0.028), () => {
    vehicleState.gearIndex = Math.min(vehicleState.gears.length - 1, vehicleState.gearIndex + 1);
    vehicleState.lastActionLog = `Lẫy số [GEAR +]: Lên số [${vehicleState.gears[vehicleState.gearIndex]}]`;
  }, true);

  // Màn hình Giải trí Trung tâm YouTube 14 inch
  const mediaCenterGroup = new THREE.Group();
  mediaCenterGroup.position.set(0.0, 0.72, -0.39);
  mediaCenterGroup.rotation.x = THREE.MathUtils.degToRad(-12);
  cabinGroup.add(mediaCenterGroup);

  const ytScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.18),
    new THREE.MeshBasicMaterial({ map: ytCanvasTexture })
  );
  createInteractive3DButton(mediaCenterGroup, 'YOUTUBE SCREEN', 0.35, 0.18, 0.004, new THREE.Vector3(0, 0, -0.003), () => {
    toggleMediaPlayPause();
  });
  mediaCenterGroup.add(ytScreenMesh);

  const mediaButtons = [
    { label: '⏮ PREV', x: -0.14, action: () => loadAndPlayTrack(vehicleState.currentTrackIndex - 1) },
    { label: '⏯ PLAY', x: -0.07, action: () => toggleMediaPlayPause() },
    { label: '⏭ NEXT', x:  0.00, action: () => loadAndPlayTrack(vehicleState.currentTrackIndex + 1) },
    { label: '🔊 MUTE', x:  0.07, action: () => { vehicleState.mediaMuted = !vehicleState.mediaMuted; } },
    { label: '📺 IMAX', x:  0.14, action: () => {
      vehicleState.cinemaOnWindshield = !vehicleState.cinemaOnWindshield;
      vehicleState.windshieldTransparent = !vehicleState.cinemaOnWindshield;
    }}
  ];

  mediaButtons.forEach((b) => {
    createInteractive3DButton(mediaCenterGroup, b.label, 0.064, 0.026, 0.010, new THREE.Vector3(b.x, -0.112, 0.006), b.action);
  });

  // Màn hình phụ bên phải - Camera lùi & Rada góc lái
  const rearScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.11),
    new THREE.MeshBasicMaterial({ map: rearTex })
  );
  rearScreenMesh.position.set(0.42, 0.72, -0.39);
  rearScreenMesh.rotation.x = THREE.MathUtils.degToRad(-12);
  cabinGroup.add(rearScreenMesh);

  // Cụm bàn đạp Ga & Phanh
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

buildOpenWindowLuxuryCabin();

// ============================================================================
// 7. BẢNG HUD TẬP TRUNG & KHUNG KÍNH CHẮN GIÓ XR RENDER (GẮN THEO CHASSIS XE)
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
chassisGroup.add(hudPanelGroup); // Đi theo xe khi xe chạy và rẽ trong thành phố
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

const simulatorScreenGroup = new THREE.Group();
chassisGroup.add(simulatorScreenGroup);
const windshieldMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.48, 0.68),
  new THREE.MeshBasicMaterial({ map: wsTexture, transparent: true, side: THREE.DoubleSide })
);
simulatorScreenGroup.add(windshieldMesh);
attachDragHandle(simulatorScreenGroup, 1.48, 0.68);

function resetPanelsToDefault() {
  hudPanelGroup.position.set(-0.82, 1.12, -0.58);
  hudPanelGroup.rotation.set(0, THREE.MathUtils.degToRad(22), 0);
  hudPanelGroup.scale.setScalar(1.0);

  simulatorScreenGroup.position.set(-0.15, 1.16, -0.95);
  simulatorScreenGroup.rotation.set(0, 0, 0);
  simulatorScreenGroup.scale.setScalar(1.0);
}
resetPanelsToDefault();

function updateHudAndScreens() {
  // 1. Bảng HUD Tập trung (Không còn chữ đè nhau)
  hudCtx.clearRect(0, 0, 1024, 680);
  hudCtx.fillStyle = 'rgba(10, 14, 22, 0.90)';
  hudCtx.fillRect(0, 0, 1024, 680);
  hudCtx.strokeStyle = '#00d2ff';
  hudCtx.lineWidth = 6;
  hudCtx.strokeRect(3, 3, 1018, 674);

  hudCtx.fillStyle = '#00d2ff';
  hudCtx.fillRect(0, 0, 1024, 60);
  hudCtx.fillStyle = '#06101a';
  hudCtx.font = 'bold 26px Segoe UI, sans-serif';
  hudCtx.fillText('★ BẢNG ĐIỀU KHIỂN THÀNH THỊ 3D, ĐỘNG CƠ V12 & HAND TRACKING', 22, 40);

  const gear = vehicleState.gears[vehicleState.gearIndex];
  const gearDisplay = gear === 'D' ? `D${vehicleState.autoGearSub}` : gear;
  const headingDeg = ((THREE.MathUtils.radToDeg(-vehicleState.headingRad) % 360) + 360) % 360;

  hudCtx.fillStyle = '#4cd964';
  hudCtx.font = 'bold 25px monospace';
  hudCtx.fillText(
    `• ĐỘNG CƠ V12 : ${Math.round(vehicleState.rpm)} RPM  |  HỘP SỐ : [${gearDisplay}]  |  HƯỚNG XE : ${Math.round(headingDeg)}°`,
    30, 110
  );

  hudCtx.fillStyle = '#a0c4ff';
  hudCtx.fillText(
    `• TỌA ĐỘ PHỐ  : X=${vehicleRoot.position.x.toFixed(1)}m, Z=${vehicleRoot.position.z.toFixed(1)}m  |  QUEST FPS: ${vehicleState.vrFps}`,
    30, 152
  );

  hudCtx.fillStyle = '#182436';
  hudCtx.fillRect(30, 180, 964, 60);
  hudCtx.strokeStyle = '#d4af37';
  hudCtx.strokeRect(30, 180, 964, 60);
  hudCtx.fillStyle = '#ffd60a';
  hudCtx.font = 'bold 23px Segoe UI, sans-serif';
  hudCtx.fillText(`▶ ${vehicleState.lastActionLog}`, 45, 218);

  hudCtx.fillStyle = '#00e5ff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText(`SPEED: ${Math.round(vehicleState.speedKmh)} KM/H   |   GEAR: [${gearDisplay}]`, 30, 310);

  hudCtx.fillStyle = '#4cd964';
  hudCtx.font = 'bold 32px monospace';
  hudCtx.fillText(
    `THROTTLE: ${Math.round(vehicleState.throttlePercent)}%   |   BRAKE: ${Math.round(vehicleState.brakePercent)}%   |   STEER: ${Math.round(vehicleState.steeringAngleDeg)}°`,
    30, 375
  );

  hudCtx.fillStyle = '#cccccc';
  hudCtx.font = '21px Segoe UI, sans-serif';
  hudCtx.fillText('• Đạp ga (Cò phải / Phím W) & Xoay vô lăng (Cần gạt ngang / Phím A-D) để lái rẽ qua các ngã tư 3D.', 30, 445);
  hudCtx.fillText('• Bấm nút [GLASS/CAM] trên vô lăng để chuyển đổi giữa Kính trong suốt 3D và Màn hình ESP32.', 30, 482);
  hudTexture.needsUpdate = true;

  // 2. Kính chắn gió XR RENDER (Chế độ Kính HUD Trong Suốt nhìn xuyên ra Thành Phố 3D hoặc chiếu ESP32/IMAX)
  wsCtx.clearRect(0, 0, 1280, 720);
  if (vehicleState.cinemaOnWindshield && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
    wsCtx.drawImage(videoElement, 0, 0, 1280, 720);
  } else if (!vehicleState.windshieldTransparent && latestEsp32Bitmap) {
    wsCtx.drawImage(latestEsp32Bitmap, 0, 0, 1280, 720);
  } else {
    // Chế độ Kính Chắn Gió Trong Suốt (HUD AR) nhìn thẳng ra Thành phố 3D bên ngoài
    wsCtx.fillStyle = 'rgba(0, 22, 45, 0.35)';
    wsCtx.fillRect(0, 0, 1280, 48);
    wsCtx.fillStyle = '#00e5ff';
    wsCtx.font = 'bold 22px monospace';
    wsCtx.fillText(
      `★ XR WINDSHIELD AR HUD  |  ${Math.round(vehicleState.speedKmh)} KM/H  |  ${Math.round(vehicleState.rpm)} RPM  |  GEAR [${gearDisplay}]`,
      24, 32
    );

    // Vạch dẫn hướng AR (Lane Guidance) uốn theo góc đánh lái ngay trên mặt đường 3D
    const steerCurve = (vehicleState.steeringAngleDeg / 540) * 260;
    wsCtx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
    wsCtx.lineWidth = 5;
    wsCtx.beginPath();
    wsCtx.moveTo(420, 700);
    wsCtx.quadraticCurveTo(500 + steerCurve * 0.4, 520, 560 + steerCurve, 400);
    wsCtx.moveTo(860, 700);
    wsCtx.quadraticCurveTo(780 + steerCurve * 0.4, 520, 720 + steerCurve, 400);
    wsCtx.stroke();
  }
  wsTexture.needsUpdate = true;

  // 3. Màn hình Giải trí Trung tâm YouTube 14 inch
  ytCtx.fillStyle = '#0a0d14';
  ytCtx.fillRect(0, 0, 700, 360);
  if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
    ytCtx.drawImage(videoElement, 0, 0, 700, 310);
  }
  if (audioAnalyser && vehicleState.mediaPlaying) {
    audioAnalyser.getByteFrequencyData(frequencyData);
    for (let i = 0; i < 24; i++) {
      const barH = ((frequencyData[i] || 20) / 255) * 90;
      ytCtx.fillStyle = 'rgba(0, 229, 255, 0.65)';
      ytCtx.fillRect(35 + i * 26, 295 - barH, 16, barH);
    }
  }
  ytCtx.fillStyle = 'rgba(8, 10, 16, 0.85)';
  ytCtx.fillRect(0, 0, 700, 44);
  ytCtx.fillStyle = '#ff0000';
  ytCtx.fillRect(14, 8, 105, 28);
  ytCtx.fillStyle = '#ffffff';
  ytCtx.font = 'bold 17px Segoe UI, sans-serif';
  ytCtx.fillText('▶ YouTube', 22, 28);
  ytCtx.fillStyle = '#dfcba8';
  ytCtx.fillText(mediaPlaylist[vehicleState.currentTrackIndex].title.slice(0, 42), 132, 28);
  ytCanvasTexture.needsUpdate = true;

  // 4. Màn hình Camera lùi & La bàn đô thị bên phải
  rearCtx.fillStyle = '#0d131a';
  rearCtx.fillRect(0, 0, 512, 256);
  rearCtx.fillStyle = gear === 'R' ? '#ff3b30' : '#00d2ff';
  rearCtx.font = 'bold 21px monospace';
  rearCtx.fillText(gear === 'R' ? 'REAR CAMERA [REVERSE ACTIVE]' : `CITY COMPASS: ${Math.round(headingDeg)}°`, 18, 32);

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

// ============================================================================
// 8. TƯƠNG TÁC TAY CẦM & BÀN TAY THẬT (HAND TRACKING POKE + PINCH)
// ============================================================================
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllerModelFactory = new XRControllerModelFactory();
const handModelFactory = new XRHandModelFactory();

const hands = [];
const fingerIndicators = [];
let activeGrabState = { interactor: null, panelGroup: null, distance: 1.0 };

function executeButtonPress(btnMesh, controller = null) {
  const now = performance.now();
  if (now - btnMesh.userData.lastPokeTime < 320) return;
  btnMesh.userData.lastPokeTime = now;

  btnMesh.userData.pressedOffset = btnMesh.userData.isPaddle ? -0.006 : -0.003;
  const worldPos = new THREE.Vector3();
  btnMesh.getWorldPosition(worldPos);
  playMechanicalButtonClick3D(worldPos, !btnMesh.userData.isPaddle);

  if (btnMesh.userData.onClick) btnMesh.userData.onClick();

  const session = renderer.xr.getSession();
  if (session && controller) {
    for (const src of session.inputSources) {
      if (src.gamepad?.hapticActuators?.[0]) {
        src.gamepad.hapticActuators[0].pulse(0.85, 40);
      }
    }
  }
}

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  cameraRig.add(controller);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2.5)]),
    new THREE.LineBasicMaterial({ color: 0x00e5ff })
  );
  controller.add(line);

  controller.addEventListener('selectstart', () => {
    initSpatialAudioSystem();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    const hits = raycaster.intersectObjects(allInteractiveButtons, false);
    if (hits.length > 0) executeButtonPress(hits[0].object, controller);
  });

  controller.addEventListener('squeezestart', () => {
    initSpatialAudioSystem();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    const hits = raycaster.intersectObjects(draggableHandles, false);
    if (hits.length > 0) {
      activeGrabState = {
        interactor: controller,
        panelGroup: hits[0].object.userData.parentPanel,
        distance: hits[0].distance
      };
    }
  });

  controller.addEventListener('squeezeend', () => {
    if (activeGrabState.interactor === controller) {
      activeGrabState.interactor = null;
      activeGrabState.panelGroup = null;
    }
  });

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  cameraRig.add(grip);

  const hand = renderer.xr.getHand(i);
  hand.add(handModelFactory.createHandModel(hand, 'mesh'));
  cameraRig.add(hand);
  hands.push(hand);

  const tipSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.75 })
  );
  tipSphere.visible = false;
  scene.add(tipSphere);
  fingerIndicators.push(tipSphere);
}

const tempTipWorldPos = new THREE.Vector3();
const tempBtnWorldPos = new THREE.Vector3();

function checkHandTrackingPokeCollisions() {
  let anyHandVisible = false;
  for (let i = 0; i < hands.length; i++) {
    const indexTip = hands[i].joints['index-finger-tip'];
    if (indexTip && indexTip.visible) {
      anyHandVisible = true;
      tempTipWorldPos.setFromMatrixPosition(indexTip.matrixWorld);
      fingerIndicators[i].position.copy(tempTipWorldPos);
      fingerIndicators[i].visible = true;

      for (const btn of allInteractiveButtons) {
        btn.getWorldPosition(tempBtnWorldPos);
        const pokeRadius = btn.userData.label === 'YOUTUBE SCREEN' ? 0.075 : 0.024;
        if (tempTipWorldPos.distanceTo(tempBtnWorldPos) < pokeRadius) {
          executeButtonPress(btn, null);
        }
      }
    } else {
      fingerIndicators[i].visible = false;
    }
  }
  vehicleState.handTrackingActive = anyHandVisible;
}

// Hỗ trợ lái thử bằng Bàn phím & Chuột trên PC
const keysPressed = { w: false, s: false, a: false, d: false };
window.addEventListener('keydown', (e) => {
  initSpatialAudioSystem();
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') keysPressed.w = true;
  if (k === 's' || e.key === 'ArrowDown') keysPressed.s = true;
  if (k === 'a' || e.key === 'ArrowLeft') keysPressed.a = true;
  if (k === 'd' || e.key === 'ArrowRight') keysPressed.d = true;
  if (k === 'g') vehicleState.gearIndex = (vehicleState.gearIndex + 1) % vehicleState.gears.length;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') keysPressed.w = false;
  if (k === 's' || e.key === 'ArrowDown') keysPressed.s = false;
  if (k === 'a' || e.key === 'ArrowLeft') keysPressed.a = false;
  if (k === 'd' || e.key === 'ArrowRight') keysPressed.d = false;
});

const mouse = new THREE.Vector2();
window.addEventListener('pointerdown', (e) => {
  initSpatialAudioSystem();
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(allInteractiveButtons, false);
  if (hits.length > 0) executeButtonPress(hits[0].object, null);
});

// ============================================================================
// 9. VÒNG LẶP VẬT LÝ XE CHẠY & RẼ TRONG THÀNH PHỐ 3D + CAMERA ĐI THEO XE
// ============================================================================
const clock = new THREE.Clock();
let vrFrameCount = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  vrFrameCount++;

  const now = performance.now();
  if (now - lastFpsTimestamp >= 1000) {
    vehicleState.streamFps = streamFrameCounter;
    vehicleState.vrFps = vrFrameCount;
    streamFrameCounter = 0;
    vrFrameCount = 0;
    lastFpsTimestamp = now;
  }

  checkHandTrackingPokeCollisions();

  for (const btn of allInteractiveButtons) {
    btn.userData.pressedOffset = THREE.MathUtils.lerp(btn.userData.pressedOffset, 0, dt * 14);
    btn.position.z = btn.userData.baseZ + btn.userData.pressedOffset;
  }

  // Kéo thả bảng HUD hoặc Kính chắn gió trong khoang lái
  if (activeGrabState.interactor && activeGrabState.panelGroup) {
    tempMatrix.identity().extractRotation(activeGrabState.interactor.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(activeGrabState.interactor.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
    const worldTarget = origin.add(dir.multiplyScalar(activeGrabState.distance));
    chassisGroup.worldToLocal(worldTarget);
    activeGrabState.panelGroup.position.lerp(worldTarget, 0.25);

    const eyePos = new THREE.Vector3();
    camera.getWorldPosition(eyePos);
    activeGrabState.panelGroup.lookAt(eyePos);
  }

  // Đọc tín hiệu Tay cầm Meta Quest 3 hoặc Bàn phím
  const session = renderer.xr.getSession();
  if (session) {
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
        activeGrabState.distance = THREE.MathUtils.clamp(activeGrabState.distance - stickY * dt * 1.2, 0.4, 2.8);
        const nextScale = THREE.MathUtils.clamp(activeGrabState.panelGroup.scale.x + stickX * dt * 0.8, 0.5, 2.5);
        activeGrabState.panelGroup.scale.setScalar(nextScale);
      } else if (Math.abs(stickX) > 0.08) {
        vehicleState.steeringAngleDeg = THREE.MathUtils.clamp(vehicleState.steeringAngleDeg + stickX * 260 * dt, -540, 540);
      } else {
        vehicleState.steeringAngleDeg = THREE.MathUtils.lerp(vehicleState.steeringAngleDeg, 0, dt * 2.8);
      }
    }
  } else {
    // Điều khiển mượt khi test bằng phím W/A/S/D trên máy tính
    vehicleState.throttlePercent = keysPressed.w
      ? THREE.MathUtils.lerp(vehicleState.throttlePercent, 100, dt * 4)
      : THREE.MathUtils.lerp(vehicleState.throttlePercent, 0, dt * 5);

    vehicleState.brakePercent = keysPressed.s ? 100 : 0;

    if (keysPressed.a) {
      vehicleState.steeringAngleDeg = Math.max(-540, vehicleState.steeringAngleDeg - 240 * dt);
    } else if (keysPressed.d) {
      vehicleState.steeringAngleDeg = Math.min(540, vehicleState.steeringAngleDeg + 240 * dt);
    } else {
      vehicleState.steeringAngleDeg = THREE.MathUtils.lerp(vehicleState.steeringAngleDeg, 0, dt * 3.0);
    }
  }

  // --- ĐỘNG LỰC HỌC XE CHẠY & QUẸO THEO ĐƯỜNG TRONG THÀNH PHỐ 3D ---
  const gear = vehicleState.gears[vehicleState.gearIndex];
  const effThrottle = vehicleState.cruiseControl ? 42 : vehicleState.throttlePercent;

  let accelMs2 = 0;
  if (gear === 'D' || gear === 'R') {
    accelMs2 = (effThrottle / 100) * 9.5 - (vehicleState.brakePercent / 100) * 18.0 - 1.2;
    vehicleState.velocityMs = THREE.MathUtils.clamp(vehicleState.velocityMs + accelMs2 * dt, 0, 55); // Tối đa ~200 km/h
  } else {
    vehicleState.velocityMs = THREE.MathUtils.lerp(vehicleState.velocityMs, 0, dt * 3.5);
  }
  vehicleState.speedKmh = vehicleState.velocityMs * 3.6;

  // Tính góc bẻ lái bánh trước (Tối đa 34 độ khi vô lăng quay hết 540 độ)
  const frontWheelSteerRad = THREE.MathUtils.degToRad((vehicleState.steeringAngleDeg / 540) * 34);
  const directionSign = gear === 'R' ? -1 : 1;

  // Vận tốc góc quay thân xe (Yaw Rate) khi xe di chuyển và đánh lái
  const angularVelocity =
    directionSign * (vehicleState.velocityMs / vehicleState.wheelbaseM) * Math.tan(frontWheelSteerRad);

  // Cập nhật góc hướng đầu xe & tọa độ xe trong thành phố (Camera đi theo xe 100%)
  vehicleState.headingRad -= angularVelocity * dt;
  vehicleRoot.rotation.y = vehicleState.headingRad;

  const moveDist = directionSign * vehicleState.velocityMs * dt;
  vehicleRoot.position.x -= Math.sin(vehicleState.headingRad) * moveDist;
  vehicleRoot.position.z -= Math.cos(vehicleState.headingRad) * moveDist;

  // Hiệu ứng nhún giảm xóc thân xe 3D (Pitch khi tăng tốc/phanh, Roll khi vào cua)
  const targetPitch = THREE.MathUtils.clamp(accelMs2 * 0.0025, -0.035, 0.025);
  const targetRoll = THREE.MathUtils.clamp(angularVelocity * vehicleState.velocityMs * 0.0012, -0.04, 0.04);
  chassisGroup.rotation.x = THREE.MathUtils.lerp(chassisGroup.rotation.x, targetPitch, dt * 6);
  chassisGroup.rotation.z = THREE.MathUtils.lerp(chassisGroup.rotation.z, targetRoll, dt * 6);

  // Cuộn bản đồ thành phố vô tận theo vị trí mới của xe
  updateInfiniteCityAroundCar();

  // Đồng bộ góc xoay vô lăng và bàn đạp 3D
  steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(-vehicleState.steeringAngleDeg);
  if (throttlePedalMesh) {
    throttlePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25 + (vehicleState.throttlePercent / 100) * 25);
  }
  if (brakePedalMesh) {
    brakePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25 + (vehicleState.brakePercent / 100) * 25);
  }

  updateSmoothV12Audio(dt);
  updateHudAndScreens();

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

