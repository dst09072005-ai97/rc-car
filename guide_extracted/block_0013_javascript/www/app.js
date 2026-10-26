import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// ============================================================================
// 1. KHỞI TẠO KHÔNG GIAN 3D, CAMERA RIG & BẬT QUYỀN HAND TRACKING META QUEST 3
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
const cameraRig = new THREE.Group();
// Đặt vị trí mắt người lái tại ghế trái theo đúng tỷ lệ 1:1 (X: -0.42m, Y: 1.12m, Z: 0.15m)
cameraRig.position.set(-0.42, 0.0, 0.15);
camera.position.set(0, 1.12, 0);
cameraRig.add(camera);
scene.add(cameraRig);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// Yêu cầu quyền 'hand-tracking' trong phiên OpenXR của Meta Quest 3
document.body.appendChild(
  VRButton.createButton(renderer, {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
  })
);

scene.add(new THREE.HemisphereLight(0xfff5e4, 0x222233, 1.5));
const cabinLight = new THREE.PointLight(0xffeedd, 1.8, 4.0);
cabinLight.position.set(0, 1.28, 0.0);
scene.add(cabinLight);

// ============================================================================
// 2. TRẠNG THÁI XE, PLAYLIST YOUTUBE MEDIA & BỘ ĐẾM FPS
// ============================================================================
const mediaPlaylist = [
  {
    title: 'Rolls-Royce Phantom Symphony - 4K Cinema Drive',
    channel: 'Rolls-Royce Motor Cars Official',
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
  steeringAngleDeg: 0,
  throttlePercent: 0,
  brakePercent: 0,
  speedKmh: 0,
  rpm: 800,
  gears: ['P', 'R', 'N', 'D'],
  gearIndex: 0,
  mediaPlaying: false,
  mediaMuted: false,
  mediaVolume: 80,
  currentTrackIndex: 0,
  cinemaOnWindshield: false, // Chiếu phim lên kính chắn gió khi đỗ xe
  windshieldFilterMode: 0,
  hornActive: false,
  cruiseControl: false,
  handTrackingActive: false,
  lastActionLog: 'Đưa ngón trỏ chạm nút vô lăng / màn hình hoặc dùng tay cầm',
  simRoadOffset: 0
};

// ============================================================================
// 3. HỆ THỐNG ÂM THANH VÒM 3D (WEB AUDIO API SPATIAL HRTF)
// ============================================================================
let audioCtx = null;
let engineOsc1 = null;
let engineOsc2 = null;
let engineFilter = null;
let engineGain = null;
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

  // --- 3.1. Nguồn âm thanh Động cơ V12 3D đặt dưới nắp capo trước (Z = -1.4m) ---
  const enginePanner = audioCtx.createPanner();
  enginePanner.panningModel = 'HRTF';
  enginePanner.distanceModel = 'inverse';
  enginePanner.positionX.value = -0.2;
  enginePanner.positionY.value = 0.65;
  enginePanner.positionZ.value = -1.4;

  engineFilter = audioCtx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 140;

  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0.16;

  engineOsc1 = audioCtx.createOscillator();
  engineOsc1.type = 'sawtooth';
  engineOsc1.frequency.value = 42; // Tần số nổ garanti V12 êm ái

  engineOsc2 = audioCtx.createOscillator();
  engineOsc2.type = 'triangle';
  engineOsc2.frequency.value = 84;

  engineOsc1.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(enginePanner);
  enginePanner.connect(audioCtx.destination);

  engineOsc1.start();
  engineOsc2.start();

  // --- 3.2. Còi xe Kép hạng sang (Dual-Tone Horn 400Hz + 500Hz) đặt ở mũi xe ---
  const hornPanner = audioCtx.createPanner();
  hornPanner.panningModel = 'HRTF';
  hornPanner.positionX.value = -0.3;
  hornPanner.positionY.value = 0.6;
  hornPanner.positionZ.value = -1.8;

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
  hornFilter.frequency.value = 1600;

  hornOscA.connect(hornFilter);
  hornOscB.connect(hornFilter);
  hornFilter.connect(hornGain);
  hornGain.connect(hornPanner);
  hornPanner.connect(audioCtx.destination);
  hornOscA.start();
  hornOscB.start();

  // --- 3.3. Âm thanh 3D từ Màn hình Giải trí YouTube trung tâm (0, 0.72, -0.40) ---
  const videoEl = document.getElementById('vr-video-source');
  try {
    const mediaSource = audioCtx.createMediaElementSource(videoEl);
    const mediaPanner = audioCtx.createPanner();
    mediaPanner.panningModel = 'HRTF';
    mediaPanner.positionX.value = 0.0;
    mediaPanner.positionY.value = 0.72;
    mediaPanner.positionZ.value = -0.40;

    mediaGainNode = audioCtx.createGain();
    mediaGainNode.gain.value = vehicleState.mediaVolume / 100;

    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 64;

    mediaSource.connect(audioAnalyser);
    audioAnalyser.connect(mediaGainNode);
    mediaGainNode.connect(mediaPanner);
    mediaPanner.connect(audioCtx.destination);
  } catch (e) {
    // Fallback nếu trình duyệt đã gắn MediaElementSource trước đó
  }
}

// Hàm phát tiếng Click cơ học 3D tại đúng tọa độ nút bấm khi tay chạm vào
function playMechanicalButtonClick3D(worldPosition, isHighPitch = false) {
  initSpatialAudioSystem();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const clickGain = audioCtx.createGain();
  const panner = audioCtx.createPanner();

  panner.panningModel = 'HRTF';
  panner.positionX.value = worldPosition.x;
  panner.positionY.value = worldPosition.y;
  panner.positionZ.value = worldPosition.z;

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(isHighPitch ? 1400 : 950, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.035);

  clickGain.gain.setValueAtTime(0.35, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  osc.connect(clickGain);
  clickGain.connect(panner);
  panner.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.04);
}

// Cập nhật vị trí tai người nghe (AudioListener) và tiếng gầm V12 mỗi khung hình
function updateSpatialAudioEngine(dt) {
  if (!audioCtx) return;

  // Đồng bộ vị trí đầu người lái trong VR với AudioListener
  const eyePos = new THREE.Vector3();
  const eyeQuat = new THREE.Quaternion();
  camera.getWorldPosition(eyePos);
  camera.getWorldQuaternion(eyeQuat);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(eyeQuat);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(eyeQuat);

  const listener = audioCtx.listener;
  if (listener.positionX) {
    listener.positionX.value = eyePos.x;
    listener.positionY.value = eyePos.y;
    listener.positionZ.value = eyePos.z;
    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;
    listener.upX.value = up.x;
    listener.upY.value = up.y;
    listener.upZ.value = up.z;
  }

  // Tính vòng tua máy (RPM) dựa trên chân ga và tốc độ
  const targetRpm = 800 + vehicleState.throttlePercent * 42 + vehicleState.speedKmh * 12;
  vehicleState.rpm = THREE.MathUtils.lerp(vehicleState.rpm, Math.min(6800, targetRpm), dt * 6);

  const baseFreq = 36 + (vehicleState.rpm / 6800) * 145;
  engineOsc1.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.03);
  engineOsc2.frequency.setTargetAtTime(baseFreq * 2.0, audioCtx.currentTime, 0.03);
  engineFilter.frequency.setTargetAtTime(120 + (vehicleState.rpm / 6800) * 950, audioCtx.currentTime, 0.04);
  engineGain.gain.setTargetAtTime(0.12 + (vehicleState.throttlePercent / 100) * 0.22, audioCtx.currentTime, 0.04);

  // Điều khiển âm lượng còi xe
  hornGain.gain.setTargetAtTime(vehicleState.hornActive ? 0.45 : 0.0, audioCtx.currentTime, 0.015);

  // Điều khiển âm lượng màn hình giải trí
  if (mediaGainNode) {
    const targetVol = vehicleState.mediaMuted ? 0 : vehicleState.mediaVolume / 100;
    mediaGainNode.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.05);
  }
}

// ============================================================================
// 4. TỐI ƯU FPS LUỒNG ESP32-CAM QUA WEB WORKER (ZERO-COPY BITMAP)
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
    streamFrameCounter++;
  }
};

document.getElementById('btn-connect')?.addEventListener('click', () => {
  initSpatialAudioSystem();
  const url = document.getElementById('esp32-ip').value.trim();
  vehicleState.esp32Url = url;
  streamWorker.postMessage({ cmd: 'connect', url });
});

// ============================================================================
// 5. TRÌNH PHÁT PHIM/NHẠC YOUTUBE 3D TRÊN MÀN HÌNH TRUNG TÂM 14 INCH
// ============================================================================
const videoElement = document.getElementById('vr-video-source');
const videoTexture = new THREE.VideoTexture(videoElement);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.colorSpace = THREE.SRGBColorSpace;

function loadAndPlayTrack(index, customUrl = null) {
  initSpatialAudioSystem();
  if (customUrl) {
    videoElement.src = customUrl;
    mediaPlaylist.unshift({
      title: 'Luồng Video/Nhạc Tùy Chỉnh (Custom Stream)',
      channel: customUrl,
      url: customUrl
    });
    vehicleState.currentTrackIndex = 0;
  } else {
    vehicleState.currentTrackIndex = (index + mediaPlaylist.length) % mediaPlaylist.length;
    videoElement.src = mediaPlaylist[vehicleState.currentTrackIndex].url;
  }
  videoElement.play().then(() => {
    vehicleState.mediaPlaying = true;
    vehicleState.lastActionLog = `Đang phát: ${mediaPlaylist[vehicleState.currentTrackIndex].title}`;
  }).catch(() => {
    vehicleState.mediaPlaying = false;
  });
}

// Tải sẵn bài đầu tiên
videoElement.src = mediaPlaylist[0].url;
videoElement.load();

document.getElementById('btn-load-media')?.addEventListener('click', () => {
  const customUrl = document.getElementById('media-url').value.trim();
  if (customUrl) loadAndPlayTrack(0, customUrl);
  else toggleMediaPlayPause();
});

function toggleMediaPlayPause() {
  initSpatialAudioSystem();
  if (videoElement.paused) {
    videoElement.play();
    vehicleState.mediaPlaying = true;
    vehicleState.lastActionLog = `▶ Đang phát: ${mediaPlaylist[vehicleState.currentTrackIndex].title}`;
  } else {
    videoElement.pause();
    vehicleState.mediaPlaying = false;
    vehicleState.lastActionLog = '⏸ Đã tạm dừng phát Phim/Nhạc';
  }
}

// ============================================================================
// 6. DỰNG NỘI THẤT, VÔ LĂNG NÚT VẬT LÝ & MÀN HÌNH GIẢI TRÍ YOUTUBE 14 INCH
// ============================================================================
const cabinGroup = new THREE.Group();
scene.add(cabinGroup);

const matNappa = new THREE.MeshStandardMaterial({ color: 0xdfd1be, roughness: 0.45 });
const matWalnut = new THREE.MeshPhysicalMaterial({ color: 0x3a2314, roughness: 0.08, clearcoat: 1.0 });
const matChrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.15, metalness: 0.9 });
const matPiano = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.05 });
const matCarpet = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.9 });

const steeringWheelPivot = new THREE.Group();
// Danh sách tất cả các nút 3D có thể bấm bằng Tia Laser hoặc chạm trực tiếp bằng Ngón Tay (Hand Poke)
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

// Canvas cho Màn hình Giải trí Trung tâm YouTube 14 inch (350mm x 180mm)
const ytCanvas = document.createElement('canvas');
ytCanvas.width = 700;
ytCanvas.height = 360;
const ytCtx = ytCanvas.getContext('2d');
const ytCanvasTexture = new THREE.CanvasTexture(ytCanvas);
ytCanvasTexture.colorSpace = THREE.SRGBColorSpace;

function buildCabinWheelAndMediaCenter() {
  // Sàn xe, Bệ trung tâm & Bảng Táp-lô
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

  // --- VÔ LĂNG 380MM & 9 NÚT VẬT LÝ CHẠM TRỰC TIẾP BẰNG NGÓN TAY (HAND POKE) ---
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

  // Nút vật lý trên Vô lăng
  createInteractive3DButton(steeringWheelPivot, 'VOL +', 0.034, 0.020, 0.010, new THREE.Vector3(-0.140, 0.004, 0.016), () => {
    vehicleState.mediaVolume = Math.min(100, vehicleState.mediaVolume + 10);
    vehicleState.mediaMuted = false;
    vehicleState.lastActionLog = `Vô lăng [VOL +]: Âm lượng Media ${vehicleState.mediaVolume}%`;
  });

  createInteractive3DButton(steeringWheelPivot, 'VOL -', 0.034, 0.020, 0.010, new THREE.Vector3(-0.140, -0.022, 0.016), () => {
    vehicleState.mediaVolume = Math.max(0, vehicleState.mediaVolume - 10);
    vehicleState.lastActionLog = `Vô lăng [VOL -]: Âm lượng Media ${vehicleState.mediaVolume}%`;
  });

  createInteractive3DButton(steeringWheelPivot, 'PLAY/PAUSE', 0.038, 0.044, 0.010, new THREE.Vector3(-0.095, -0.009, 0.016), () => {
    toggleMediaPlayPause();
  });

  createInteractive3DButton(steeringWheelPivot, 'CAM MODE', 0.038, 0.044, 0.010, new THREE.Vector3(0.095, -0.009, 0.016), () => {
    vehicleState.windshieldFilterMode = (vehicleState.windshieldFilterMode + 1) % 3;
    const modes = ['Chuẩn RGB', 'Night Vision', 'Tương phản cao'];
    vehicleState.lastActionLog = `Vô lăng [CAM MODE]: ${modes[vehicleState.windshieldFilterMode]}`;
  });

  createInteractive3DButton(steeringWheelPivot, 'RESET HUD', 0.036, 0.020, 0.010, new THREE.Vector3(0.140, 0.004, 0.016), () => {
    resetPanelsToDefault();
    vehicleState.lastActionLog = 'Vô lăng [RESET HUD]: Đã đưa các khung về vị trí chuẩn';
  });

  createInteractive3DButton(steeringWheelPivot, 'CRUISE', 0.036, 0.020, 0.010, new THREE.Vector3(0.140, -0.022, 0.016), () => {
    vehicleState.cruiseControl = !vehicleState.cruiseControl;
    if (vehicleState.cruiseControl && vehicleState.speedKmh < 40) vehicleState.speedKmh = 65;
    vehicleState.lastActionLog = `Vô lăng [CRUISE]: ${vehicleState.cruiseControl ? 'BẬT giữ ga tự động' : 'TẮT'}`;
  });

  createInteractive3DButton(steeringWheelPivot, 'RR HORN', 0.062, 0.062, 0.012, new THREE.Vector3(0, 0, 0.020), () => {
    vehicleState.hornActive = true;
    vehicleState.lastActionLog = '📢 Vô lăng [HORN]: Đã bấm còi kép 3D!';
    setTimeout(() => { vehicleState.hornActive = false; }, 650);
  });

  createInteractive3DButton(steeringWheelPivot, 'GEAR -', 0.032, 0.088, 0.006, new THREE.Vector3(-0.130, 0.038, -0.028), () => {
    vehicleState.gearIndex = Math.max(0, vehicleState.gearIndex - 1);
    vehicleState.lastActionLog = `Lẫy số [GEAR -]: Chuyển về số [${vehicleState.gears[vehicleState.gearIndex]}]`;
  }, true);

  createInteractive3DButton(steeringWheelPivot, 'GEAR +', 0.032, 0.088, 0.006, new THREE.Vector3(0.130, 0.038, -0.028), () => {
    vehicleState.gearIndex = Math.min(vehicleState.gears.length - 1, vehicleState.gearIndex + 1);
    vehicleState.lastActionLog = `Lẫy số [GEAR +]: Chuyển lên số [${vehicleState.gears[vehicleState.gearIndex]}]`;
  }, true);

  // --- MÀN HÌNH GIẢI TRÍ TRUNG TÂM YOUTUBE 14 INCH (350mm x 180mm) + NÚT CẢM ỨNG ---
  const mediaCenterGroup = new THREE.Group();
  mediaCenterGroup.position.set(0.0, 0.74, -0.39);
  mediaCenterGroup.rotation.x = THREE.MathUtils.degToRad(-12);
  cabinGroup.add(mediaCenterGroup);

  // Mặt màn hình 350mm x 180mm
  const ytScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.18),
    new THREE.MeshBasicMaterial({ map: ytCanvasTexture })
  );
  // Cho phép chạm trực tiếp lên màn hình để Play/Pause
  createInteractive3DButton(mediaCenterGroup, 'YOUTUBE SCREEN', 0.35, 0.18, 0.004, new THREE.Vector3(0, 0, -0.003), () => {
    toggleMediaPlayPause();
  });
  mediaCenterGroup.add(ytScreenMesh);

  // Viền Chrome sang trọng quanh màn hình 14 inch
  const ytBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.356, 0.186)),
    new THREE.LineBasicMaterial({ color: 0xd4af37 })
  );
  ytBorder.position.z = 0.001;
  mediaCenterGroup.add(ytBorder);

  // Cụm 5 nút bấm vật lý ngay dưới màn hình YouTube (Dễ dàng chạm bằng ngón tay Hand Tracking)
  const mediaButtons = [
    { label: '⏮ PREV', x: -0.14, action: () => loadAndPlayTrack(vehicleState.currentTrackIndex - 1) },
    { label: '⏯ PLAY', x: -0.07, action: () => toggleMediaPlayPause() },
    { label: '⏭ NEXT', x:  0.00, action: () => loadAndPlayTrack(vehicleState.currentTrackIndex + 1) },
    { label: '🔊 MUTE', x:  0.07, action: () => {
      vehicleState.mediaMuted = !vehicleState.mediaMuted;
      vehicleState.lastActionLog = `Media: ${vehicleState.mediaMuted ? 'Đã tắt tiếng' : 'Đã bật tiếng'}`;
    }},
    { label: '📺 IMAX', x:  0.14, action: () => {
      vehicleState.cinemaOnWindshield = !vehicleState.cinemaOnWindshield;
      vehicleState.lastActionLog = `Chế độ chiếu YouTube lên Kính chắn gió: ${vehicleState.cinemaOnWindshield ? 'BẬT' : 'TẮT'}`;
    }}
  ];

  mediaButtons.forEach((b) => {
    createInteractive3DButton(
      mediaCenterGroup,
      b.label,
      0.064, 0.026, 0.010,
      new THREE.Vector3(b.x, -0.112, 0.006),
      b.action
    );
  });

  // Bàn đạp Ga & Phanh
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

buildCabinWheelAndMediaCenter();

// Vẽ nội dung Màn hình Giải trí Trung tâm YouTube (Video thực + Sóng nhạc + Thanh tiến trình)
function updateYouTubeMediaScreen() {
  ytCtx.fillStyle = '#0a0d14';
  ytCtx.fillRect(0, 0, 700, 360);

  // Nếu Video đang chạy và có dữ liệu hình ảnh, vẽ trực tiếp khung hình phim lên màn hình 14 inch
  if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
    ytCtx.drawImage(videoElement, 0, 0, 700, 310);
  } else {
    // Màn hình chờ sang trọng kèm Sóng nhạc (Audio Spectrum)
    const grad = ytCtx.createLinearGradient(0, 0, 700, 310);
    grad.addColorStop(0, '#111726');
    grad.addColorStop(1, '#1f1924');
    ytCtx.fillStyle = grad;
    ytCtx.fillRect(0, 0, 700, 310);
  }

  // Vẽ sóng nhạc thời gian thực từ Web Audio Analyser
  if (audioAnalyser && vehicleState.mediaPlaying) {
    audioAnalyser.getByteFrequencyData(frequencyData);
    for (let i = 0; i < 24; i++) {
      const val = frequencyData[i] || 20;
      const barH = (val / 255) * 95;
      ytCtx.fillStyle = 'rgba(0, 229, 255, 0.65)';
      ytCtx.fillRect(35 + i * 26, 295 - barH, 16, barH);
    }
  }

  // Thanh Header YouTube Bespoke Media
  ytCtx.fillStyle = 'rgba(8, 10, 16, 0.82)';
  ytCtx.fillRect(0, 0, 700, 48);
  ytCtx.fillStyle = '#ff0000';
  ytCtx.fillRect(14, 10, 110, 28);
  ytCtx.fillStyle = '#ffffff';
  ytCtx.font = 'bold 18px Segoe UI, sans-serif';
  ytCtx.fillText('▶ YouTube', 24, 30);

  const currentTrack = mediaPlaylist[vehicleState.currentTrackIndex];
  ytCtx.fillStyle = '#dfcba8';
  ytCtx.font = 'bold 17px Segoe UI, sans-serif';
  ytCtx.fillText(currentTrack.title.slice(0, 44), 138, 30);

  // Thanh trạng thái & Tiến trình (Seek Bar) phía dưới
  ytCtx.fillStyle = 'rgba(8, 10, 16, 0.94)';
  ytCtx.fillRect(0, 305, 700, 55);

  const duration = videoElement.duration || 100;
  const currentTime = videoElement.currentTime || 0;
  const progress = Math.min(1, currentTime / duration);

  ytCtx.fillStyle = '#333b4d';
  ytCtx.fillRect(20, 315, 660, 8);
  ytCtx.fillStyle = '#ff0000';
  ytCtx.fillRect(20, 315, 660 * progress, 8);

  ytCtx.fillStyle = '#a0c4ff';
  ytCtx.font = '16px monospace';
  const statusStr = vehicleState.mediaPlaying ? '▶ PLAYING' : '⏸ PAUSED (Chạm màn hình hoặc nút PLAY để phát)';
  ytCtx.fillText(
    `${statusStr}  |  VOL: ${vehicleState.mediaMuted ? 'MUTE' : vehicleState.mediaVolume + '%'}  |  TRACK ${vehicleState.currentTrackIndex + 1}/${mediaPlaylist.length}`,
    20, 346
  );

  ytCanvasTexture.needsUpdate = true;
}

// ============================================================================
// 7. BẢNG HUD TẬP TRUNG & KHUNG KÍNH CHẮN GIÓ ESP32 (HỖ TRỢ KÉO BẰNG TAY & CONTROLLER)
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
wsTexture.generateMipmaps = false;

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
  hudCtx.font = 'bold 26px Segoe UI, sans-serif';
  hudCtx.fillText('★ BẢNG THÔNG SỐ HỆ THỐNG, ÂM THANH 3D & HAND TRACKING', 22, 40);

  hudCtx.fillStyle = '#4cd964';
  hudCtx.font = 'bold 25px monospace';
  hudCtx.fillText(
    `• QUEST 3 FPS : ${vehicleState.vrFps}  |  ESP32 FPS : ${vehicleState.streamFps}  |  HAND TRACKING : ${vehicleState.handTrackingActive ? 'ACTIVE (Đưa ngón trỏ chạm nút)' : 'STANDBY'}`,
    30, 108
  );

  hudCtx.fillStyle = '#a0c4ff';
  hudCtx.fillText(
    `• ĐỘNG CƠ V12 : ${Math.round(vehicleState.rpm)} RPM  |  YOUTUBE : ${vehicleState.mediaPlaying ? 'PLAYING' : 'PAUSED'} (Vol ${vehicleState.mediaVolume}%)`,
    30, 150
  );

  hudCtx.fillStyle = '#182436';
  hudCtx.fillRect(30, 178, 964, 62);
  hudCtx.strokeStyle = '#d4af37';
  hudCtx.lineWidth = 2;
  hudCtx.strokeRect(30, 178, 964, 62);
  hudCtx.fillStyle = '#ffd60a';
  hudCtx.font = 'bold 24px Segoe UI, sans-serif';
  hudCtx.fillText(`▶ ${vehicleState.lastActionLog}`, 45, 218);

  const gear = vehicleState.gears[vehicleState.gearIndex];
  hudCtx.fillStyle = '#00e5ff';
  hudCtx.font = 'bold 42px monospace';
  hudCtx.fillText(`GEAR: [${gear}] (P/R/N/D)   |   SPEED: ${Math.round(vehicleState.speedKmh)} KM/H`, 30, 310);

  hudCtx.fillStyle = '#4cd964';
  hudCtx.font = 'bold 32px monospace';
  hudCtx.fillText(
    `THROTTLE: ${Math.round(vehicleState.throttlePercent)}%   |   BRAKE: ${Math.round(vehicleState.brakePercent)}%   |   STEER: ${Math.round(vehicleState.steeringAngleDeg)}°`,
    30, 375
  );

  hudCtx.fillStyle = '#cccccc';
  hudCtx.font = '21px Segoe UI, sans-serif';
  hudCtx.fillText('• Chạm ngón trỏ (Hand Poke) vào các nút trên vô lăng hoặc 5 nút dưới màn hình YouTube.', 30, 445);
  hudCtx.fillText('• Bấm nút [📺 IMAX] dưới màn hình giải trí để chiếu phim lên thẳng Kính chắn gió lớn.', 30, 482);
  hudCtx.fillText('• Chụm ngón trỏ + ngón cái (Pinch) hoặc giữ Grip vào thanh tiêu đề để kéo di dời bảng.', 30, 519);

  hudTexture.needsUpdate = true;
}

function updateWindshieldStream(dt) {
  // Nếu bật chế độ Cinema IMAX trên kính chắn gió, chiếu thẳng phim YouTube lên khung lớn
  if (vehicleState.cinemaOnWindshield && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
    wsCtx.drawImage(videoElement, 0, 0, 1280, 720);
    wsCtx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    wsCtx.fillRect(0, 0, 1280, 42);
    wsCtx.fillStyle = '#ffd60a';
    wsCtx.font = 'bold 22px Segoe UI, sans-serif';
    wsCtx.fillText(`📺 WINDSHIELD IMAX CINEMA MODE: ${mediaPlaylist[vehicleState.currentTrackIndex].title}`, 20, 28);
    wsTexture.needsUpdate = true;
    return;
  }

  if (latestEsp32Bitmap) {
    wsCtx.drawImage(latestEsp32Bitmap, 0, 0, 1280, 720);
  } else {
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
  wsTexture.needsUpdate = true;
}

// ============================================================================
// 8. HỆ THỐNG HAND TRACKING (CHẠM NGÓN TRỎ POKE NÚT + CHỤM PINCH KÉO BẢNG)
// ============================================================================
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllerModelFactory = new XRControllerModelFactory();
const handModelFactory = new XRHandModelFactory();

const hands = [];
const fingerIndicators = []; // Vòng sáng nhỏ ở đầu ngón trỏ giúp người dùng căn điểm chạm dễ dàng
let activeGrabState = { interactor: null, panelGroup: null, distance: 1.0 };

function executeButtonPress(btnMesh, controller = null) {
  const now = performance.now();
  // Chống dội phím (Debounce 320ms) khi ngón tay giữ nguyên trên mặt nút
  if (now - btnMesh.userData.lastPokeTime < 320) return;
  btnMesh.userData.lastPokeTime = now;

  btnMesh.userData.pressedOffset = btnMesh.userData.isPaddle ? -0.006 : -0.003;

  const worldPos = new THREE.Vector3();
  btnMesh.getWorldPosition(worldPos);
  playMechanicalButtonClick3D(worldPos, !btnMesh.userData.isPaddle);

  if (btnMesh.userData.onClick) btnMesh.userData.onClick();

  // Rung phản hồi nếu bấm bằng tay cầm
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
  // --- A. Tay cầm Quest 3 (Controllers) ---
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

  // --- B. Bàn tay thật (WebXR Hand Tracking) ---
  const hand = renderer.xr.getHand(i);
  hand.add(handModelFactory.createHandModel(hand, 'mesh'));
  cameraRig.add(hand);
  hands.push(hand);

  // Điểm sáng xanh định vị trên đầu ngón trỏ (Index Finger Tip Collider)
  const tipSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.75 })
  );
  tipSphere.visible = false;
  scene.add(tipSphere);
  fingerIndicators.push(tipSphere);

  // Cử chỉ Chụm ngón cái + ngón trỏ (Pinch) để kéo Bảng HUD hoặc Kính chắn gió bằng tay không
  hand.addEventListener('pinchstart', () => {
    initSpatialAudioSystem();
    const indexTip = hand.joints['index-finger-tip'];
    if (!indexTip) return;
    const tipPos = new THREE.Vector3().setFromMatrixPosition(indexTip.matrixWorld);

    for (const handle of draggableHandles) {
      const handlePos = new THREE.Vector3();
      handle.getWorldPosition(handlePos);
      if (tipPos.distanceTo(handlePos) < 0.25) {
        activeGrabState = {
          interactor: indexTip,
          panelGroup: handle.userData.parentPanel,
          distance: 0.05
        };
        break;
      }
    }
  });

  hand.addEventListener('pinchend', () => {
    const indexTip = hand.joints['index-finger-tip'];
    if (activeGrabState.interactor === indexTip) {
      activeGrabState.interactor = null;
      activeGrabState.panelGroup = null;
    }
  });
}

// Kiểm tra va chạm trực tiếp (Direct Poke) giữa đầu ngón trỏ và toàn bộ nút bấm 3D
const tempTipWorldPos = new THREE.Vector3();
const tempBtnWorldPos = new THREE.Vector3();

function checkHandTrackingPokeCollisions() {
  let anyHandVisible = false;

  for (let i = 0; i < hands.length; i++) {
    const hand = hands[i];
    const indexTip = hand.joints['index-finger-tip'];

    if (indexTip && indexTip.visible) {
      anyHandVisible = true;
      tempTipWorldPos.setFromMatrixPosition(indexTip.matrixWorld);
      fingerIndicators[i].position.copy(tempTipWorldPos);
      fingerIndicators[i].visible = true;

      // Kiểm tra khoảng cách từ đầu ngón trỏ tới từng nút trên vô lăng & màn hình YouTube
      for (const btn of allInteractiveButtons) {
        btn.getWorldPosition(tempBtnWorldPos);
        // Bán kính chạm 2.4cm (0.024m) cho nút thường, hoặc 8cm nếu chạm giữa màn hình YouTube
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

// Hỗ trợ Click chuột trên màn hình PC để test toàn bộ nút và âm thanh 3D
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
// 9. VÒNG LẶP CHÍNH: RENDER 72HZ/90HZ, ÂM THANH 3D, HAND POKE & MEDIA
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

  // 1. Kiểm tra chạm ngón tay Hand Tracking
  checkHandTrackingPokeCollisions();

  // 2. Hiệu ứng lò xo đàn hồi 2mm cho toàn bộ nút vật lý
  for (const btn of allInteractiveButtons) {
    btn.userData.pressedOffset = THREE.MathUtils.lerp(btn.userData.pressedOffset, 0, dt * 14);
    btn.position.z = btn.userData.baseZ + btn.userData.pressedOffset;
  }

  // 3. Xử lý kéo thả Panel (bằng cả Tay cầm hoặc cử chỉ Pinch bàn tay)
  if (activeGrabState.interactor && activeGrabState.panelGroup) {
    tempMatrix.identity().extractRotation(activeGrabState.interactor.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(activeGrabState.interactor.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
    const targetPos = origin.add(dir.multiplyScalar(activeGrabState.distance));
    activeGrabState.panelGroup.position.lerp(targetPos, 0.25);

    const eyePos = new THREE.Vector3();
    camera.getWorldPosition(eyePos);
    activeGrabState.panelGroup.lookAt(eyePos);
  }

  // 4. Đọc tín hiệu lái từ Tay cầm Quest 3
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
        vehicleState.steeringAngleDeg = THREE.MathUtils.lerp(vehicleState.steeringAngleDeg, 0, dt * 2.5);
      }
    }
  }

  // 5. Tính toán động lực học & Cập nhật âm thanh vòm 3D V12
  const gear = vehicleState.gears[vehicleState.gearIndex];
  if (gear === 'D' || gear === 'R') {
    const effThrottle = vehicleState.cruiseControl ? 45 : vehicleState.throttlePercent;
    const accel = (effThrottle / 100) * 38;
    const decel = (vehicleState.brakePercent / 100) * 65 + 6;
    vehicleState.speedKmh = THREE.MathUtils.clamp(vehicleState.speedKmh + (accel - decel) * dt, 0, 250);
  } else {
    vehicleState.speedKmh = THREE.MathUtils.lerp(vehicleState.speedKmh, 0, dt * 3);
  }

  steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(-vehicleState.steeringAngleDeg);
  if (throttlePedalMesh) {
    throttlePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25 + (vehicleState.throttlePercent / 100) * 25);
  }
  if (brakePedalMesh) {
    brakePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25 + (vehicleState.brakePercent / 100) * 25);
  }

  updateSpatialAudioEngine(dt);
  updateYouTubeMediaScreen();
  updateHudPanel();
  updateWindshieldStream(dt);

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

