import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// ============================================================================
// 1. KHỞI TẠO SCENE 3D, CAMERA CHÍNH & CAMERA 3D PHÍA SAU XE (CHO GƯƠNG HẬU LÙI)
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03060f);
scene.fog = new THREE.FogExp2(0x03060f, 0.0055);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 420);

// Màn chập Chớp mắt 3D trong kính VR
const vrBlinkShutterMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.0,
  depthTest: false
});
const vrBlinkShutter = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vrBlinkShutterMat);
vrBlinkShutter.position.set(0, 0, -0.12);
vrBlinkShutter.renderOrder = 9999;
camera.add(vrBlinkShutter);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

// RENDER TARGET & CAMERA 3D HƯỚNG RA PHÍA SAU ĐUÔI XE (Hiển thị lên màn hình Cam Lùi khi chưa nối ESP32!)
const rearRenderTarget = new THREE.WebGLRenderTarget(512, 256, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat
});
const rearCamera3D = new THREE.PerspectiveCamera(75, 512 / 256, 0.1, 160);

// Bầu trời sao đêm
function buildStarrySky() {
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200; i++) {
    const r = 180 + Math.random() * 80;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.48;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi) + 15;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.85 })));
}
buildStarrySky();

const hemiLight = new THREE.HemisphereLight(0x7094d8, 0x121722, 0.85);
scene.add(hemiLight);

const mainShadowLight = new THREE.DirectionalLight(0xb8d0ff, 1.55);
mainShadowLight.position.set(35, 65, 25);
mainShadowLight.castShadow = true;
mainShadowLight.shadow.mapSize.width = 2048;
mainShadowLight.shadow.mapSize.height = 2048;
const dCam = 52;
mainShadowLight.shadow.camera.left = -dCam;
mainShadowLight.shadow.camera.right = dCam;
mainShadowLight.shadow.camera.top = dCam;
mainShadowLight.shadow.camera.bottom = -dCam;
scene.add(mainShadowLight, mainShadowLight.target);

// ============================================================================
// 2. TRẠNG THÁI HỆ THỐNG DIGITAL TWIN, 2 XE MULTIPLAYER & CHỨC NĂNG THÒ ĐẦU
// ============================================================================
const SEAT_OFFSETS = [
  { name: 'Ghế Tài Xế (Cầm Lái)', pos: new THREE.Vector3(-0.42, 0.0, 0.12), leanSide: -1 },
  { name: 'Ghế Phụ Trước (Co-Pilot POV)', pos: new THREE.Vector3(0.42, 0.0, 0.12), leanSide: 1 },
  { name: 'Ghế Phụ Sau Trái (VIP Rear L)', pos: new THREE.Vector3(-0.42, 0.04, 1.02), leanSide: -1 },
  { name: 'Ghế Phụ Sau Phải (VIP Rear R)', pos: new THREE.Vector3(0.42, 0.04, 1.02), leanSide: 1 }
];

const state = {
  playerMode: 'ON_FOOT', // 'ON_FOOT' | 'IN_CAR'
  activeCarId: 'car_host', // 'car_host' (Xe của tôi - có ESP32) | 'car_guest_1' (Xe người thứ 2 - chỉ chạy 3D)
  seatIndex: 0,            // 0: Tài xế, 1: Ghế phụ trước, 2: Sau trái, 3: Sau phải
  leaningOutWindow: false, // Chức năng thò đầu ra ngoài cửa sổ xe để nhìn
  leanProgress: 0,

  isBlinking: false,
  blinkTargetOpacity: 0.0,

  // Tốc độ đi bộ của nhân vật khi chưa lên xe đã được tăng lên 6.8 m/s (nhanh và mượt)
  avatarPos: new THREE.Vector3(0.55, 0, 1.25),
  avatarYaw: -0.45,
  avatarWalkSpeed: 6.8,
  avatarWalkPhase: 0,

  // Trạng thái Digital Twin chính xác của xe (Khi mới lên xe tốc độ = 0 tuyệt đối!)
  engineRunning: false,
  engineCranking: false,
  velocityMs: 0,
  speedKmh: 0,
  rpm: 0,
  steeringAngleDeg: 0,
  gear: 'P', // 'P' | 'D' | 'R'
  turnSignal: 0, // 0: Tắt, 1: Xi-nhan Trái, 2: Xi-nhan Phải
  turnBlinkOn: false,
  doorsOpen: false,
  doorAnimAngle: 0,
  convertibleRoofOpen: false,
  roofAnimProgress: 0,

  // Trạng thái kết nối 2 Camera ESP32 (Kính chắn gió trước & Cam hậu lùi)
  esp32FrontConnected: false, // Khi true -> Cho phép chạy xuyên địa hình; Khi false -> Chặn địa hình, tông bật lùi!
  esp32RearConnected: false,  // Khi false -> Hiển thị Camera 3D phía sau xe; Khi true -> Hiển thị luồng ESP32 lùi!
  esp32FrontUrl: 'http://192.168.4.102:81/stream',
  esp32RearUrl: 'http://192.168.4.103:81/stream',

  // Vị trí mặc định ban đầu của Bảng HUD & Cửa sổ YouTube (Để tự reset khi Ẩn -> Hiện lại!)
  hudVisible: true,
  ytVisible: false,
  hud3DDefaultPos: new THREE.Vector3(-0.68, 1.12, -0.52),
  yt3DDefaultPos: new THREE.Vector3(0.45, 1.14, -0.52),

  suspensionShakeIntensity: 0,
  suspensionShakePhase: 0,
  lastActionLog: '🚶 Đẩy nút xoay (Thumbstick) để đi bộ nhanh (6.8m/s) | Bấm [Nút X] để mở cửa lên xe (Tốc độ = 0 KM/H)!'
};

// ============================================================================
// 3. KÉO THẢ BẢNG HUD & CỬA SỔ YOUTUBE + TỰ RESET VỊ TRÍ CỐ ĐỊNH KHI ẨN -> HIỆN
// ============================================================================
const hudWindowEl = document.getElementById('draggable-hud-window');
const ytModalEl = document.getElementById('youtube-app-modal');

function makeDomWindowDraggable(windowEl, handleEl) {
  if (!windowEl || !handleEl) return;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let initLeft = 0;
  let initTop = 0;

  handleEl.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    dragging = true;
    handleEl.setPointerCapture(e.pointerId);
    const rect = windowEl.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initLeft = rect.left;
    initTop = rect.top;
    windowEl.style.bottom = 'auto';
    windowEl.style.left = `${initLeft}px`;
    windowEl.style.top = `${initTop}px`;
  });

  handleEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    windowEl.style.left = `${THREE.MathUtils.clamp(initLeft + dx, 6, window.innerWidth - 120)}px`;
    windowEl.style.top = `${THREE.MathUtils.clamp(initTop + dy, 48, window.innerHeight - 80)}px`;
  });

  const stopDrag = () => { dragging = false; };
  handleEl.addEventListener('pointerup', stopDrag);
  handleEl.addEventListener('pointercancel', stopDrag);
}

makeDomWindowDraggable(hudWindowEl, document.getElementById('hud-drag-bar'));
makeDomWindowDraggable(ytModalEl, document.getElementById('yt-drag-bar'));

// Khi bấm Ẩn xong bấm Hiện lại -> Spawn đúng vị trí cố định ban đầu (cả 2D DOM lẫn 3D VR Panel)!
function toggleHudWithPositionReset() {
  state.hudVisible = !state.hudVisible;
  if (state.hudVisible) {
    hudWindowEl?.classList.remove('panel-hidden');
    if (hudWindowEl) {
      hudWindowEl.style.top = 'auto';
      hudWindowEl.style.left = '16px';
      hudWindowEl.style.bottom = '130px';
    }
    if (hud3DGroup) {
      hud3DGroup.visible = true;
      hud3DGroup.position.copy(state.hud3DDefaultPos);
    }
    state.lastActionLog = '📊 Đã hiện lại Bảng HUD tại vị trí cố định ban đầu!';
  } else {
    hudWindowEl?.classList.add('panel-hidden');
    if (hud3DGroup) hud3DGroup.visible = false;
  }
}

function toggleYouTubeWithPositionReset() {
  state.ytVisible = !state.ytVisible;
  if (state.ytVisible) {
    ytModalEl?.classList.remove('panel-hidden');
    if (ytModalEl) {
      ytModalEl.style.top = '90px';
      ytModalEl.style.left = `${Math.max(20, Math.round(window.innerWidth / 2 - 370))}px`;
    }
    if (yt3DGroup) {
      yt3DGroup.visible = true;
      yt3DGroup.position.copy(state.yt3DDefaultPos);
    }
    state.lastActionLog = '▶ [Nút Y]: Đã mở Cửa sổ YouTube (Internet) tại vị trí chuẩn ban đầu!';
  } else {
    ytModalEl?.classList.add('panel-hidden');
    if (yt3DGroup) yt3DGroup.visible = false;
    state.lastActionLog = '🗕 [Nút Y]: Đã đóng Cửa sổ YouTube.';
  }
}

document.getElementById('btn-toggle-hud')?.addEventListener('click', toggleHudWithPositionReset);
document.getElementById('btn-open-yt-modal')?.addEventListener('click', toggleYouTubeWithPositionReset);
document.getElementById('btn-close-yt-modal')?.addEventListener('click', toggleYouTubeWithPositionReset);
document.getElementById('btn-toggle-guide')?.addEventListener('click', () => {
  document.getElementById('guide-panel')?.classList.toggle('panel-hidden');
});
document.getElementById('btn-toggle-func')?.addEventListener('click', () => {
  document.getElementById('function-panel')?.classList.toggle('panel-hidden');
});

// Chọn video YouTube trực tuyến hoặc tìm kiếm mở YouTube.com
const ytIframe = document.getElementById('yt-iframe');
let currentYtTitle = 'Lofi Hip Hop Radio - Beats to Drive';

document.querySelectorAll('.yt-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.yt-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    const vid = card.getAttribute('data-vid');
    currentYtTitle = card.getAttribute('data-title') || 'YouTube Stream';
    if (ytIframe && vid) {
      ytIframe.src = `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0`;
    }
    state.lastActionLog = `▶ Đang phát YouTube qua Internet: ${currentYtTitle}`;
  });
});

document.getElementById('btn-yt-load-url')?.addEventListener('click', () => {
  const query = document.getElementById('yt-custom-input')?.value.trim() || '';
  if (!query) return;
  const match = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (match && ytIframe) {
    ytIframe.src = `https://www.youtube-nocookie.com/embed/${match[1]}?autoplay=1&rel=0`;
    currentYtTitle = `YouTube ID: ${match[1]}`;
  } else if (ytIframe) {
    ytIframe.src = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1`;
    currentYtTitle = `Tìm kiếm: ${query}`;
  }
});

document.getElementById('btn-yt-open-native')?.addEventListener('click', () => {
  const query = document.getElementById('yt-custom-input')?.value.trim() || 'Rolls Royce Night Drive 4K';
  window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
});

// ============================================================================
// 4. CHỨC NĂNG VR Y CHANG DMNSHD.GG/GAMES (WEBXR IMMERSIVE-VR + THOÁT VỀ 2D)
// ============================================================================
const smartVrBtn = document.getElementById('smart-vr-btn');
let activeXrSession = null;

async function toggleTrueWebXRSession() {
  initAudio();
  if (activeXrSession) {
    await activeXrSession.end();
    return;
  }

  if ('xr' in navigator) {
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-vr');
      if (supported) {
        const session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
        });
        renderer.xr.setSession(session);
        activeXrSession = session;
        if (smartVrBtn) smartVrBtn.textContent = '🚪 THOÁT VR VỀ CỬA SỔ 2D';
        session.addEventListener('end', () => {
          activeXrSession = null;
          if (smartVrBtn) smartVrBtn.textContent = '🥽 ENTER VR 360° (NHƯ DMNSHD.GG)';
        });
        return;
      }
    } catch (e) {}
  }

  // Nếu người dùng đang mở qua HTTP thường (chưa bật HTTPS 8443), tự động chuyển sang cổng HTTPS 8443
  // để trình duyệt Meta Quest Browser mở khóa WebXR immersive-vr y hệt dmnshd.gg/games!
  if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
    window.location.href = `https://${window.location.hostname}:8443`;
    return;
  }

  if (document.documentElement.requestFullscreen) {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      if (smartVrBtn) smartVrBtn.textContent = '🚪 THOÁT VỀ CỬA SỔ 2D';
    } else {
      document.exitFullscreen().catch(() => {});
      if (smartVrBtn) smartVrBtn.textContent = '🥽 ENTER VR 360° (NHƯ DMNSHD.GG)';
    }
  }
}

smartVrBtn?.addEventListener('click', toggleTrueWebXRSession);

// ============================================================================
// 5. ÂM THANH 3D (ĐỘNG CƠ, CÒI XE, VA CHẠM, XI-NHAN)
// ============================================================================
let audioCtx = null;
let v12Osc = null;
let v12Gain = null;

function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioCtx();

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 110;
  v12Gain = audioCtx.createGain();
  v12Gain.gain.value = 0.0;

  v12Osc = audioCtx.createOscillator();
  v12Osc.type = 'triangle';
  v12Osc.frequency.value = 48;
  v12Osc.connect(filter);
  filter.connect(v12Gain);
  v12Gain.connect(audioCtx.destination);
  v12Osc.start();
}

function playCrashSound(vol = 12) {
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(135, now);
  osc.frequency.exponentialRampToValueAtTime(24, now + 0.38);
  g.gain.setValueAtTime(Math.min(0.65, vol * 0.045), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.42);
}

function playTurnSignalClick() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(980, now);
  g.gain.setValueAtTime(0.06, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.03);
}

// ============================================================================
// 6. DỰNG 2 CHIẾC XE ROLLS-ROYCE TRONG CÙNG THẾ GIỚI 3D:
//    - XE 1 (car_host): XE CỦA BẠN (Có kết nối ESP32 Cam Trước & Cam Lùi)
//    - XE 2 (car_guest_1): XE NGƯỜI THỨ 2 JOIN VÀO (Chỉ chạy 3D, không kết nối ESP32)
// ============================================================================
const playerAvatarGroup = new THREE.Group();
playerAvatarGroup.position.copy(state.avatarPos);
scene.add(playerAvatarGroup);

const cameraRig = new THREE.Group();
camera.position.set(0, 1.12, 0);
cameraRig.add(camera);
playerAvatarGroup.add(cameraRig);
cameraRig.position.set(0, 0.52, 0);

const matNappa = new THREE.MeshStandardMaterial({ color: 0xdfd1be, roughness: 0.38 });
const matWalnut = new THREE.MeshPhysicalMaterial({ color: 0x3a2314, roughness: 0.06, clearcoat: 1.0 });
const matChrome = new THREE.MeshStandardMaterial({ color: 0xf0f2f5, roughness: 0.08, metalness: 0.96 });
const matPiano = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.05 });
const matTireRubber = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.85 });
const matGlass = new THREE.MeshPhysicalMaterial({ color: 0x88ccff, transparent: true, opacity: 0.22, roughness: 0.05 });

// Canvas cho Kính chắn gió (Cam trước ESP32) và Màn hình lùi (Khi có ESP32 Rear Cam)
const wsCanvas = document.createElement('canvas');
wsCanvas.width = 1024;
wsCanvas.height = 512;
const wsCtx = wsCanvas.getContext('2d');
const wsTex = new THREE.CanvasTexture(wsCanvas);

const esp32RearCanvas = document.createElement('canvas');
esp32RearCanvas.width = 512;
esp32RearCanvas.height = 256;
const esp32RearCtx = esp32RearCanvas.getContext('2d');
const esp32RearTex = new THREE.CanvasTexture(esp32RearCanvas);

const vehicleMap = new Map(); // Lưu trữ cả Xe Chủ Phòng ('car_host') và Xe Người Thứ 2 ('car_guest_1')
const interactive3DObjects = [];
const grabbable3DPanels = [];

function createBannerSprite(title, subTitle, borderColor = '#00ff88') {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 140;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(6, 18, 34, 0.92)';
  ctx.fillRect(0, 0, 640, 140);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 7;
  ctx.strokeRect(4, 4, 632, 132);
  ctx.fillStyle = borderColor;
  ctx.font = 'bold 28px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 320, 52);
  ctx.fillStyle = '#ffd60a';
  ctx.font = 'bold 21px Segoe UI, sans-serif';
  ctx.fillText(subTitle, 320, 102);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sprite.scale.set(1.65, 0.36, 1);
  return sprite;
}

function buildDrivableRollsRoyceInstance(carId, bodyHex, startX, startZ, hasEsp32Capability) {
  const root = new THREE.Group();
  root.position.set(startX, 0, startZ);
  scene.add(root);

  const chassis = new THREE.Group();
  root.add(chassis);

  const seatMount = new THREE.Group();
  seatMount.position.copy(SEAT_OFFSETS[0].pos);
  chassis.add(seatMount);

  const paintMat = new THREE.MeshPhysicalMaterial({ color: bodyHex, roughness: 0.14, metalness: 0.6, clearcoat: 1.0 });

  const underbody = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.16, 4.85), matPiano);
  underbody.position.set(0, 0.22, 0);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.46, 1.55), paintMat);
  hood.position.set(0, 0.53, -1.45);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.48, 0.08), matChrome);
  grille.position.set(0, 0.54, -2.24);
  const rearTrunk = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.48, 0.95), paintMat);
  rearTrunk.position.set(0, 0.54, 1.95);
  chassis.add(underbody, hood, grille, rearTrunk);

  // Đèn Xi-nhan Trái & Phải ở mũi xe
  const blinkerMatL = new THREE.MeshBasicMaterial({ color: 0x332200 });
  const blinkerMatR = new THREE.MeshBasicMaterial({ color: 0x332200 });
  const blinkerL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), blinkerMatL);
  blinkerL.position.set(-0.86, 0.65, -2.22);
  const blinkerR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), blinkerMatR);
  blinkerR.position.set(0.86, 0.65, -2.22);
  chassis.add(blinkerL, blinkerR);

  // 4 Bánh xe 3D lăn tròn
  const wheels = [];
  [
    [-0.96, -1.45, true], [0.96, -1.45, true],
    [-0.96, 1.55, false], [0.96, 1.55, false]
  ].forEach(([wx, wz, isFront]) => {
    const steerMount = new THREE.Group();
    steerMount.position.set(wx, 0.38, wz);
    const spinHub = new THREE.Group();
    steerMount.add(spinHub);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 20), matTireRubber);
    tire.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.27, 16), matChrome);
    rim.rotation.z = Math.PI / 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.46), matPiano);
    spinHub.add(tire, rim, spoke);
    chassis.add(steerMount);
    wheels.push({ steerMount, spinHub, isFront });
  });

  // 4 Cánh cửa xe (Dùng Cò tay cầm bắn tia laser vào cửa để Lên/Xuống xe)
  const doors = [];
  [
    [-1, -0.65], [1, -0.65], [-1, 0.42], [1, 0.42]
  ].forEach(([sideSign, zHinge]) => {
    const pivot = new THREE.Group();
    pivot.position.set(sideSign * 0.96, 0.18, zHinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 1.05), paintMat);
    panel.position.set(0, 0.31, 0.525);
    panel.userData.onClick = () => enterOrSwitchToCar(carId, carId === 'car_host' ? 0 : 1);
    interactive3DObjects.push(panel);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.48), matGlass);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(0, 0.86, 0.525);
    pivot.add(panel, glass);
    pivot.userData = { sideSign };
    chassis.add(pivot);
    doors.push(pivot);
  });

  // Kính chắn gió (Chỉ Xe Chủ Phòng mới hiển thị luồng ESP32; Xe Khách Thứ 2 là kính trong suốt)
  if (hasEsp32Capability) {
    const wsMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.68, 0.66),
      new THREE.MeshBasicMaterial({ map: wsTex, transparent: true, side: THREE.DoubleSide })
    );
    wsMesh.position.set(0, 1.10, -0.66);
    wsMesh.rotation.x = THREE.MathUtils.degToRad(-18);
    chassis.add(wsMesh);
  }

  // Táp-lô, 4 Ghế ngồi & Vô lăng
  const dash = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.78, 12, 16), matNappa);
  dash.rotation.z = Math.PI / 2;
  dash.position.set(0, 0.76, -0.58);
  chassis.add(dash);

  SEAT_OFFSETS.forEach((s) => {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.52), matNappa);
    seat.position.set(s.pos.x, 0.48, s.pos.z + 0.1);
    chassis.add(seat);
  });

  const swPivot = new THREE.Group();
  swPivot.position.set(-0.42, 0.70, -0.25);
  swPivot.rotation.x = THREE.MathUtils.degToRad(-23);
  swPivot.add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.019, 16, 36), matNappa));
  chassis.add(swPivot);

  // MÀN HÌNH GƯƠNG HẬU LÙI TRÊN TÁP-LÔ & GƯƠNG TRUNG TÂM:
  // Khi chưa kết nối ESP32 Cam Lùi -> Dùng Texture từ `rearRenderTarget.texture` (Góc nhìn 3D thật phía sau đuôi xe!)
  const rearMirrorMat = new THREE.MeshBasicMaterial({ map: rearRenderTarget.texture });
  const dashRearScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.15), rearMirrorMat);
  dashRearScreen.position.set(0.38, 0.76, -0.38);
  dashRearScreen.rotation.x = THREE.MathUtils.degToRad(-10);
  chassis.add(dashRearScreen);

  const topRearMirror = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.08), rearMirrorMat);
  topRearMirror.position.set(0, 1.32, -0.45);
  chassis.add(topRearMirror);

  // Avatar của người chơi khác đang ngồi trong xe này
  const coPilotAvatar = new THREE.Group();
  coPilotAvatar.position.set(0.42, 0.65, 0.12);
  const cpBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.36, 8, 12), new THREE.MeshStandardMaterial({ color: 0x00bbf9 }));
  const cpHead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), new THREE.MeshStandardMaterial({ color: 0xf4c29f }));
  cpHead.position.y = 0.38;
  coPilotAvatar.add(cpBody, cpHead);
  chassis.add(coPilotAvatar);

  // Biểu tượng định vị trên nóc xe
  const beacon = new THREE.Group();
  beacon.position.set(0, 2.05, 0.15);
  const banner = createBannerSprite(
    hasEsp32Capability ? '★ XE CỦA BẠN [CÓ KẾT NỐI ESP32]' : '🚙 XE NGƯỜI THỨ 2 [CHỈ CHẠY 3D - KHÔNG ESP32]',
    'Bấm Nút X (hoặc Bóp Cò vào Cửa Xe) để Lên Xe!',
    hasEsp32Capability ? '#00ff88' : '#00bbf9'
  );
  banner.position.y = 0.45;
  beacon.add(banner);
  chassis.add(beacon);

  const carObj = {
    carId,
    hasEsp32Capability,
    root,
    chassis,
    seatMount,
    wheels,
    doors,
    swPivot,
    blinkerMatL,
    blinkerMatR,
    rearMirrorMat,
    beacon,
    coPilotAvatar,
    headingRad: 0,
    velocityMs: 0,
    speedKmh: 0,
    steerDeg: 0
  };
  vehicleMap.set(carId, carObj);
  return carObj;
}

const hostCar = buildDrivableRollsRoyceInstance('car_host', 0x101829, 2.4, 0, true);
const guestCar = buildDrivableRollsRoyceInstance('car_guest_1', 0x4a154b, -2.8, 6.5, false);

// ============================================================================
// 7. BẢNG HUD 3D & MÀN HÌNH YOUTUBE 3D TRONG KÍNH VR (KÉO THẢ & NÚT THOÁT VR 2D)
// ============================================================================
const hud3DCanvas = document.createElement('canvas');
hud3DCanvas.width = 860;
hud3DCanvas.height = 460;
const hud3DCtx = hud3DCanvas.getContext('2d');
const hud3DTex = new THREE.CanvasTexture(hud3DCanvas);

const hud3DGroup = new THREE.Group();
hud3DGroup.position.copy(state.hud3DDefaultPos);
hud3DGroup.rotation.y = THREE.MathUtils.degToRad(18);
hostCar.chassis.add(hud3DGroup);

const hud3DMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.54, 0.29),
  new THREE.MeshBasicMaterial({ map: hud3DTex, transparent: true, side: THREE.DoubleSide })
);
hud3DMesh.userData = { isGrabbablePanel: true, parentGroup: hud3DGroup };
hud3DGroup.add(hud3DMesh);
grabbable3DPanels.push(hud3DMesh);

// Màn hình YouTube 3D nổi trong VR (Kéo thả được bằng Cò tay cầm & Reset khi bấm Nút Y)
const yt3DCanvas = document.createElement('canvas');
yt3DCanvas.width = 640;
yt3DCanvas.height = 360;
const yt3DCtx = yt3DCanvas.getContext('2d');
const yt3DTex = new THREE.CanvasTexture(yt3DCanvas);

const yt3DGroup = new THREE.Group();
yt3DGroup.position.copy(state.yt3DDefaultPos);
yt3DGroup.rotation.y = THREE.MathUtils.degToRad(-18);
yt3DGroup.visible = false;
hostCar.chassis.add(yt3DGroup);

const yt3DMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.52, 0.29),
  new THREE.MeshBasicMaterial({ map: yt3DTex, side: THREE.DoubleSide })
);
yt3DMesh.userData = { isGrabbablePanel: true, parentGroup: yt3DGroup };
yt3DGroup.add(yt3DMesh);
grabbable3DPanels.push(yt3DMesh);

// Nút 3D "🚪 THOÁT VR VỀ CỬA SỔ 2D" gắn ngay phía trên kính chắn gió để đang ở trong VR 360° bấm thoát ra 2D bất cứ lúc nào!
const exitVr3DSprite = createBannerSprite('🚪 BẤM CÒ VÀO ĐÂY ĐỂ THOÁT VR VỀ CỬA SỔ 2D', 'Hoặc bấm nút Menu trên tay cầm Quest 3', '#ff3b30');
exitVr3DSprite.scale.set(0.75, 0.16, 1);
exitVr3DSprite.position.set(0, 1.38, -0.58);
exitVr3DSprite.userData.onClick = () => {
  if (activeXrSession) activeXrSession.end();
};
hostCar.chassis.add(exitVr3DSprite);
interactive3DObjects.push(exitVr3DSprite);

// ============================================================================
// 8. KẾT NỐI 2 CAMERA ESP32 (KÍNH CHẮN GIÓ TRƯỚC & CAM LÙI SAU)
// ============================================================================
const esp32FrontImg = new Image();
esp32FrontImg.crossOrigin = 'Anonymous';
esp32FrontImg.onload = () => { state.esp32FrontConnected = true; };
esp32FrontImg.onerror = () => { state.esp32FrontConnected = false; };

const esp32RearImg = new Image();
esp32RearImg.crossOrigin = 'Anonymous';
esp32RearImg.onload = () => {
  state.esp32RearConnected = true;
  hostCar.rearMirrorMat.map = esp32RearTex;
  hostCar.rearMirrorMat.needsUpdate = true;
};
esp32RearImg.onerror = () => {
  state.esp32RearConnected = false;
  hostCar.rearMirrorMat.map = rearRenderTarget.texture;
  hostCar.rearMirrorMat.needsUpdate = true;
};

document.getElementById('btn-connect-front')?.addEventListener('click', () => {
  if (state.activeCarId !== 'car_host') {
    state.lastActionLog = '⚠ Xe của người thứ 2 không hỗ trợ kết nối ESP32! Chỉ xe của bạn mới có ESP32!';
    return;
  }
  const raw = document.getElementById('esp32-front-ip')?.value.trim() || '';
  state.esp32FrontUrl = raw;
  state.esp32FrontConnected = true;
  esp32FrontImg.src = window.location.protocol === 'https:' && raw.startsWith('http://')
    ? `/api/esp32-proxy?url=${encodeURIComponent(raw)}`
    : raw;
  state.lastActionLog = '✅ Đã kết nối ESP32 Cam Trước lên Kính chắn gió -> CHO PHÉP XE CHẠY XUYÊN ĐỊA HÌNH!';
});

document.getElementById('btn-disconnect-front')?.addEventListener('click', () => {
  state.esp32FrontConnected = false;
  state.lastActionLog = '🔒 Đã ngắt ESP32 Cam Trước -> Xe KHÔNG được chạy xuyên địa hình (Đụng nhà/cây sẽ bị bật lùi)!';
});

document.getElementById('btn-connect-rear')?.addEventListener('click', () => {
  if (state.activeCarId !== 'car_host') {
    state.lastActionLog = '⚠ Xe của người thứ 2 không hỗ trợ kết nối ESP32!';
    return;
  }
  const raw = document.getElementById('esp32-rear-ip')?.value.trim() || '';
  state.esp32RearUrl = raw;
  state.esp32RearConnected = true;
  hostCar.rearMirrorMat.map = esp32RearTex;
  hostCar.rearMirrorMat.needsUpdate = true;
  esp32RearImg.src = window.location.protocol === 'https:' && raw.startsWith('http://')
    ? `/api/esp32-proxy?url=${encodeURIComponent(raw)}`
    : raw;
  state.lastActionLog = '✅ Đã kết nối ESP32 Cam Lùi thực tế lên khung gương hậu!';
});

document.getElementById('btn-disconnect-rear')?.addEventListener('click', () => {
  state.esp32RearConnected = false;
  hostCar.rearMirrorMat.map = rearRenderTarget.texture;
  hostCar.rearMirrorMat.needsUpdate = true;
  state.lastActionLog = '🎥 Cam Lùi đã chuyển về hiển thị Góc Nhìn 3D Phía Sau Xe (Lùi tông NPC sẽ có hiệu ứng va chạm)!';
});

// ============================================================================
// 9. THÀNH PHỐ 3D, HỘP VA CHẠM ĐỊA HÌNH & BÀ GIÀ ĐI BỘ / BÀ GIÀ LÁI XE MÁY
// ============================================================================
const cityGroup = new THREE.Group();
scene.add(cityGroup);

const BLOCK_SIZE = 68;
const GRID_RADIUS = 2;
const cityBlocks = [];
const buildingObstacles = []; // Danh sách tòa nhà & cây cối để chặn xe khi chưa kết nối ESP32 Cam Trước
const allCollidableNpcsAndVehicles = [];

const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x151820, roughness: 0.42, metalness: 0.18 });
const matSidewalk = new THREE.MeshStandardMaterial({ color: 0x2b313d, roughness: 0.72 });
const matLaneYellow = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

function createWindowTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#090e1a';
  ctx.fillRect(0, 0, 256, 512);
  for (let y = 14; y < 495; y += 24) {
    for (let x = 14; x < 240; x += 30) {
      ctx.fillStyle = Math.random() > 0.32 ? '#ffe4a0' : '#121929';
      ctx.fillRect(x, y, 18, 13);
    }
  }
  return new THREE.CanvasTexture(c);
}
const buildingTex = createWindowTex();

function createCityBlock(gx, gz) {
  const block = new THREE.Group();
  const road = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE, BLOCK_SIZE), matAsphalt);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  const lineZ = new THREE.Mesh(new THREE.PlaneGeometry(0.3, BLOCK_SIZE), matLaneYellow);
  lineZ.rotation.x = -Math.PI / 2;
  lineZ.position.y = 0.02;
  block.add(road, lineZ);

  const localBoxes = [];
  const corners = [[-22, -22], [22, -22], [-22, 22], [22, 22]];
  corners.forEach(([cx, cz], idx) => {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(22, 0.24, 22), matSidewalk);
    sw.position.set(cx, 0.12, cz);
    const bH = 16 + ((Math.abs(gx * 17 + gz * 31 + idx) % 5) * 6);
    const bMesh = new THREE.Mesh(
      new THREE.BoxGeometry(13, bH, 13),
      new THREE.MeshStandardMaterial({ map: buildingTex, roughness: 0.35 })
    );
    bMesh.position.set(cx, bH / 2 + 0.24, cz);
    block.add(sw, bMesh);
    localBoxes.push({ cx, cz, halfSize: 7.4, label: 'Tòa nhà địa hình 3D' });
  });

  block.userData = { gridX: gx, gridZ: gz, localBoxes };
  block.position.set(gx * BLOCK_SIZE, 0, gz * BLOCK_SIZE);
  cityGroup.add(block);
  return block;
}

for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
  for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
    cityBlocks.push(createCityBlock(gx, gz));
  }
}

// Sinh NPC đi bộ & Xe cộ trên đường (Cả tiến lẫn lùi trúng đều có hiệu ứng tông văng Ragdoll!)
function spawnCollidableNpcsAndVehicles() {
  const colors = [0xff4d6d, 0x00bbf9, 0x9b5de5, 0x00f5d4, 0xffbe0b];
  for (let i = 0; i < 16; i++) {
    const npc = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
    head.position.y = 1.55;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 8, 10), new THREE.MeshStandardMaterial({ color: colors[i % colors.length] }));
    torso.position.y = 1.12;
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.50, 8, 8), matPiano);
    legL.position.set(-0.085, 0.42, 0);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.50, 8, 8), matPiano);
    legR.position.set(0.085, 0.42, 0);
    npc.add(head, torso, legL, legR);

    const dir = i % 2 === 0 ? 1 : -1;
    // Đặt cả trên vỉa hè lẫn băng qua vạch kẻ đường phía trước/sau xe để test tông khi tiến hoặc lùi
    const xPos = i < 4 ? (i - 1.5) * 2.2 : dir * 9.8;
    const zPos = (i - 8) * 9.5;
    npc.position.set(xPos, 0.12, zPos);
    npc.rotation.y = dir > 0 ? 0 : Math.PI;

    npc.userData = {
      label: 'NPC Người đi bộ',
      legL,
      legR,
      dir,
      speed: 1.4,
      phase: i,
      radius: 1.15,
      knockbackVel: new THREE.Vector3(),
      knockbackTimer: 0
    };
    scene.add(npc);
    allCollidableNpcsAndVehicles.push(npc);
  }
}
spawnCollidableNpcsAndVehicles();

// SỰ KIỆN XE RC NGOÀI ĐỜI TÔNG VẬT CẢN -> SPAWN BÀ GIÀ ĐI BỘ HOẶC BÀ GIÀ LÁI XE MÁY NGAY MŨI XE!
const rcCrashVictimGroup = new THREE.Group();
rcCrashVictimGroup.visible = false;
scene.add(rcCrashVictimGroup);
let rcVictimVel = new THREE.Vector3();
let rcVictimTimer = 0;

function triggerRealRcHardwareCrash(mode = 'GRANNY_WALKER') {
  initAudio();
  while (rcCrashVictimGroup.children.length > 0) {
    rcCrashVictimGroup.remove(rcCrashVictimGroup.children[0]);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
  head.position.y = 1.44;
  const greyBun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshStandardMaterial({ color: 0xdcdcdc }));
  greyBun.position.set(0, 1.55, -0.06);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.56, 12), new THREE.MeshStandardMaterial({ color: 0x6d597a }));
  skirt.position.y = 0.58;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 8, 10), new THREE.MeshStandardMaterial({ color: 0xb56576 }));
  torso.position.y = 1.05;
  rcCrashVictimGroup.add(head, greyBun, skirt, torso);

  if (mode === 'GRANNY_BIKER') {
    // Thêm chiếc Xe Máy đỏ dưới chân Bà Già!
    const scooter = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 1.35), new THREE.MeshStandardMaterial({ color: 0xe63946 }));
    scooter.position.set(0, 0.45, 0);
    const frontFairing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 0.30), new THREE.MeshStandardMaterial({ color: 0xe63946 }));
    frontFairing.position.set(0, 0.68, -0.45);
    rcCrashVictimGroup.add(scooter, frontFairing);
  }

  const activeCar = vehicleMap.get(state.activeCarId) || hostCar;
  const offset = new THREE.Vector3(0, 0, -2.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), activeCar.headingRad);
  rcCrashVictimGroup.position.copy(activeCar.root.position).add(offset);
  rcCrashVictimGroup.visible = true;

  const spd = Math.max(12, Math.abs(state.velocityMs));
  rcVictimVel.set(-Math.sin(activeCar.headingRad) * spd * 1.15, 7.5, -Math.cos(activeCar.headingRad) * spd * 1.15);
  rcVictimTimer = 3.2;

  state.velocityMs = -3.0;
  state.suspensionShakeIntensity = 1.35;
  playCrashSound(16);
  state.lastActionLog = mode === 'GRANNY_BIKER'
    ? '💥 XE RC NGOÀI ĐỜI TÔNG VẬT CẢN -> Trên kính VR bạn vừa tông trúng BÀ GIÀ LÁI XE MÁY!'
    : '💥 XE RC NGOÀI ĐỜI TÔNG VẬT CẢN -> Trên kính VR bạn vừa tông trúng BÀ GIÀ ĐI BỘ QUA ĐƯỜNG!';
}

document.getElementById('btn-rc-crash-walker')?.addEventListener('click', () => triggerRealRcHardwareCrash('GRANNY_WALKER'));
document.getElementById('btn-rc-crash-biker')?.addEventListener('click', () => triggerRealRcHardwareCrash('GRANNY_BIKER'));

// ============================================================================
// 10. LÊN/XUỐNG 2 XE, ĐỔI GHẾ TÀI XẾ, THÒ ĐẦU RA NGOÀI XE & 4 NÚT A, B, X, Y
// ============================================================================
function updateCameraSeatAndLeanTransform(dt) {
  const activeCar = vehicleMap.get(state.activeCarId) || hostCar;
  if (state.playerMode !== 'IN_CAR') return;

  const seatInfo = SEAT_OFFSETS[state.seatIndex] || SEAT_OFFSETS[0];
  const targetLean = state.leaningOutWindow ? 1.0 : 0.0;
  state.leanProgress = THREE.MathUtils.lerp(state.leanProgress, targetLean, dt * 6);

  // Khi bật Thò Đầu Ra Ngoài Xe: Dịch chuyển đầu người lái/hành khách ra ngoài mép kính cửa sổ (x = ±1.18m)
  const targetX = seatInfo.pos.x + seatInfo.leanSide * (0.72 * state.leanProgress);
  const targetY = seatInfo.pos.y + (0.08 * state.leanProgress);
  activeCar.seatMount.position.set(targetX, targetY, seatInfo.pos.z);

  if (state.leaningOutWindow) {
    activeCar.doors[seatInfo.leanSide < 0 ? 0 : 1].rotation.y = 0; // Hạ kính / thò đầu qua khung cửa
  }
}

// Lên xe của mình hoặc lên xe của người thứ 2 (Tốc độ khi mới lên xe luôn = 0 KM/H!)
function enterOrSwitchToCar(targetCarId, targetSeatIdx = 0) {
  initAudio();
  const targetCar = vehicleMap.get(targetCarId) || hostCar;
  state.doorsOpen = true;

  triggerEyelidBlinkTransition(() => {
    state.playerMode = 'IN_CAR';
    state.activeCarId = targetCarId;
    state.seatIndex = targetSeatIdx;
    state.leaningOutWindow = false;
    state.doorsOpen = false;

    // QUY TẮC DIGITAL TWIN: KHI MỚI LÊN XE, TỐC ĐỘ PHẢI BẰNG 0 TUYỆT ĐỐI!
    state.velocityMs = 0;
    state.speedKmh = 0;
    state.rpm = state.engineRunning ? 680 : 0;
    state.gear = 'P';
    targetCar.velocityMs = 0;
    targetCar.speedKmh = 0;

    targetCar.seatMount.add(cameraRig);
    cameraRig.position.set(0, 0, 0);
    cameraRig.rotation.set(0, 0, 0);

    // Chuyển bảng HUD 3D và YouTube 3D sang xe đang ngồi
    targetCar.chassis.add(hud3DGroup);
    targetCar.chassis.add(yt3DGroup);
    targetCar.chassis.add(exitVr3DSprite);

    const ownerBadge = document.getElementById('hud-car-owner');
    if (ownerBadge) {
      ownerBadge.textContent = targetCar.hasEsp32Capability
        ? 'XE CỦA BẠN (CÓ ESP32)'
        : 'XE NGƯỜI THỨ 2 (KHÔNG ESP32)';
    }

    state.lastActionLog = `🚪 Đã lên [${targetCarId === 'car_host' ? 'Xe Của Bạn' : 'Xe Người Thứ 2'}] tại ${SEAT_OFFSETS[targetSeatIdx].name} — SPEED: 0 KM/H!`;
  });
}

function exitCurrentCarToSidewalk() {
  initAudio();
  const activeCar = vehicleMap.get(state.activeCarId) || hostCar;
  state.velocityMs = 0;
  state.speedKmh = 0;
  state.leaningOutWindow = false;

  triggerEyelidBlinkTransition(() => {
    state.playerMode = 'ON_FOOT';
    const exitOffset = new THREE.Vector3(-1.45, 0, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), activeCar.headingRad);
    state.avatarPos.copy(activeCar.root.position).add(exitOffset);
    playerAvatarGroup.position.copy(state.avatarPos);
    playerAvatarGroup.add(cameraRig);
    cameraRig.position.set(0, 0.52, 0);
    state.lastActionLog = '🚶 Đã bước xuống vỉa hè. Đẩy nút xoay (Thumbstick) để đi bộ nhanh tới bất kỳ chiếc xe nào!';
  });
}

// 4 HÀM CHỨC NĂNG GẮN TRỰC TIẾP VÀO 4 NÚT [A, B, X, Y] CỦA TAY CẦM META QUEST 3:
// 1. Nút [A]: Bật Xi-nhan Trái / Phải / Tắt
function actionButtonA_TurnSignal() {
  initAudio();
  state.turnSignal = (state.turnSignal + 1) % 3;
  const labels = ['ĐÃ TẮT XI-NHAN', '⬅ ĐANG BẬT XI-NHAN TRÁI', '➡ ĐANG BẬT XI-NHAN PHẢI'];
  state.lastActionLog = `🎮 [Nút A]: ${labels[state.turnSignal]}`;
}

// 2. Nút [B]: Đỗ Xe Dừng Hẳn (SPEED = 0 KM/H, GEAR = P)
function actionButtonB_ParkFullStop() {
  initAudio();
  state.velocityMs = 0;
  state.speedKmh = 0;
  state.gear = 'P';
  const activeCar = vehicleMap.get(state.activeCarId);
  if (activeCar) {
    activeCar.velocityMs = 0;
    activeCar.speedKmh = 0;
  }
  state.lastActionLog = '🛑 [Nút B]: ĐÃ ĐỖ XE DỪNG HẲN (SPEED = 0 KM/H | GEAR = [P])!';
}

// 3. Nút [X]: Mở Cửa Lên Xe / Xuống Xe
function actionButtonX_EnterOrExitCar() {
  if (state.playerMode === 'ON_FOOT') {
    // Tìm chiếc xe gần người chơi nhất (Xe của mình hoặc Xe của người thứ 2) để lên xe!
    const distHost = state.avatarPos.distanceTo(hostCar.root.position);
    const distGuest = state.avatarPos.distanceTo(guestCar.root.position);
    if (distGuest < distHost && distGuest < 5.0) {
      enterOrSwitchToCar('car_guest_1', 1); // Lên xe người thứ 2 ở góc nhìn ghế phụ trước
    } else {
      enterOrSwitchToCar('car_host', 0);
    }
  } else {
    exitCurrentCarToSidewalk();
  }
}

// 4. Nút [Y]: Mở / Đóng Cửa Sổ YouTube (Kèm Reset vị trí chuẩn)
function actionButtonY_ToggleYouTube() {
  initAudio();
  toggleYouTubeWithPositionReset();
}

// Chức năng Thò đầu ra ngoài xe để nhìn (Dành cho cả Tài xế & Người ngồi ghế phụ)
function toggleLeanHeadOutWindow() {
  if (state.playerMode !== 'IN_CAR') {
    state.lastActionLog = '⚠ Bạn cần lên ngồi trong xe (Bấm Nút X) trước khi thò đầu ra ngoài cửa sổ!';
    return;
  }
  state.leaningOutWindow = !state.leaningOutWindow;
  state.lastActionLog = state.leaningOutWindow
    ? `👱 Đang THÒ ĐẦU RA NGOÀI CỬA SỔ (${SEAT_OFFSETS[state.seatIndex].name}) để quan sát bên ngoài xe!`
    : '👱 Đã thu đầu trở lại vào trong khoang nội thất.';
}

document.getElementById('btn-func-a')?.addEventListener('click', actionButtonA_TurnSignal);
document.getElementById('btn-func-b')?.addEventListener('click', actionButtonB_ParkFullStop);
document.getElementById('btn-func-x')?.addEventListener('click', actionButtonX_EnterOrExitCar);
document.getElementById('btn-func-y')?.addEventListener('click', actionButtonY_ToggleYouTube);
document.getElementById('btn-lean-head')?.addEventListener('click', toggleLeanHeadOutWindow);
document.getElementById('btn-lean-window')?.addEventListener('click', toggleLeanHeadOutWindow);

document.getElementById('btn-enter-my-car')?.addEventListener('click', () => enterOrSwitchToCar('car_host', 0));
document.getElementById('btn-enter-friend-car')?.addEventListener('click', () => enterOrSwitchToCar('car_guest_1', 1));
document.getElementById('btn-swap-driver')?.addEventListener('click', () => {
  if (state.playerMode !== 'IN_CAR') enterOrSwitchToCar(state.activeCarId, 0);
  else {
    state.seatIndex = state.seatIndex === 0 ? 1 : 0;
    state.lastActionLog = `🔄 Đã đổi sang ngồi tại: ${SEAT_OFFSETS[state.seatIndex].name}!`;
  }
});
document.getElementById('btn-swap-rear')?.addEventListener('click', () => {
  if (state.playerMode !== 'IN_CAR') enterOrSwitchToCar(state.activeCarId, 2);
  else {
    state.seatIndex = state.seatIndex === 2 ? 3 : 2;
    state.lastActionLog = `💺 Đã chuyển xuống ngồi tại: ${SEAT_OFFSETS[state.seatIndex].name}!`;
  }
});
document.getElementById('btn-engine-start')?.addEventListener('click', () => {
  initAudio();
  state.engineRunning = !state.engineRunning;
  if (!state.engineRunning) {
    state.velocityMs = 0;
    state.speedKmh = 0;
    state.rpm = 0;
    state.gear = 'P';
  } else {
    state.rpm = 680;
  }
});

// ============================================================================
// 11. BỘ ĐỌC TAY CẦM QUEST 3:
//     - CÒ TAY CẦM (TRIGGER) = CHỈ ĐỂ THAO TÁC CHỌN & KÉO BẢNG 3D (KHÔNG LÀM XE CHẠY!)
//     - NÚT XOAY (THUMBSTICK) = TIẾN / LÙI / RẼ TRÁI / RẼ PHẢI
//     - 4 NÚT A, B, X, Y = XI-NHAN, ĐỖ XE DỪNG HẲN, LÊN/XUỐNG XE, MỞ YOUTUBE
// ============================================================================
const raycaster = new THREE.Raycaster();
const tempMat4 = new THREE.Matrix4();
const controllerModelFactory = new XRControllerModelFactory();
const handModelFactory = new XRHandModelFactory();

let grabbed3DPanel = null;
let grabbedController = null;
let grabbedDistance = 0.65;

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  cameraRig.add(controller);

  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -3.0)]),
    new THREE.LineBasicMaterial({ color: 0x00e5ff })
  );
  controller.add(laser);

  // CÒ TAY CẦM (selectstart): CHỈ DÙNG ĐỂ BẤM CHỌN HOẶC KÉO THẢ BẢNG HUD / YOUTUBE 3D!
  controller.addEventListener('selectstart', () => {
    initAudio();
    tempMat4.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMat4);

    // 1. Kiểm tra nếu tia laser bắn vào Bảng HUD 3D hoặc YouTube 3D -> Nắm giữ để kéo thả trái/phải/lên/xuống!
    const panelHits = raycaster.intersectObjects(grabbable3DPanels, false);
    if (panelHits.length > 0) {
      grabbed3DPanel = panelHits[0].object.userData.parentGroup;
      grabbedController = controller;
      grabbedDistance = panelHits[0].distance;
      return;
    }

    // 2. Kiểm tra nếu bắn vào các đối tượng 3D (Cửa xe, Nút Thoát VR)
    const objHits = raycaster.intersectObjects(interactive3DObjects, false);
    if (objHits.length > 0 && objHits[0].object.userData.onClick) {
      objHits[0].object.userData.onClick();
    }
  });

  controller.addEventListener('selectend', () => {
    if (grabbedController === controller) {
      grabbed3DPanel = null;
      grabbedController = null;
    }
  });

  // Nút Nắm Hông (Grip / Squeeze): Bật/Tắt Thò đầu ra ngoài cửa sổ xe!
  controller.addEventListener('squeezestart', () => {
    toggleLeanHeadOutWindow();
  });

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  cameraRig.add(grip);

  const hand = renderer.xr.getHand(i);
  hand.add(handModelFactory.createHandModel(hand, 'mesh'));
  cameraRig.add(hand);
}

const prevPadBtns = { a: false, b: false, x: false, y: false };
const thumbstickInput = { moveY: 0, moveX: 0 };

function pollQuestThumbstickAndABXY() {
  thumbstickInput.moveY = 0;
  thumbstickInput.moveX = 0;

  let aNow = false;
  let bNow = false;
  let xNow = false;
  let yNow = false;

  // 1. Đọc từ phiên WebXR (Khi ở trong VR 360°)
  const session = renderer.xr.getSession();
  if (session && session.inputSources) {
    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      const gp = src.gamepad;
      const b = gp.buttons;
      const axX = gp.axes[2] !== undefined ? gp.axes[2] : (gp.axes[0] || 0);
      const axY = gp.axes[3] !== undefined ? gp.axes[3] : (gp.axes[1] || 0);

      if (Math.abs(axY) > 0.12) thumbstickInput.moveY = -axY; // Đẩy lên = +1 (Tiến), Kéo xuống = -1 (Lùi)
      if (Math.abs(axX) > 0.12) thumbstickInput.moveX = axX;  // Gạt trái = -1, Gạt phải = +1

      if (src.handedness === 'right') {
        aNow = aNow || Boolean(b[4]?.pressed);
        bNow = bNow || Boolean(b[5]?.pressed);
      } else if (src.handedness === 'left') {
        xNow = xNow || Boolean(b[4]?.pressed);
        yNow = yNow || Boolean(b[5]?.pressed);
      }
    }
  }

  // 2. Đọc dự phòng từ navigator.getGamepads() (Khi ở ngoài cửa sổ)
  if (navigator.getGamepads) {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) continue;
      const b = gp.buttons;
      const axX = gp.axes[2] !== undefined && Math.abs(gp.axes[2]) > 0.12 ? gp.axes[2] : (gp.axes[0] || 0);
      const axY = gp.axes[3] !== undefined && Math.abs(gp.axes[3]) > 0.12 ? gp.axes[3] : (gp.axes[1] || 0);

      if (Math.abs(axY) > 0.12) thumbstickInput.moveY = -axY;
      if (Math.abs(axX) > 0.12) thumbstickInput.moveX = axX;

      if (/Right/i.test(gp.id)) {
        aNow = aNow || Boolean(b[4]?.pressed || b[0]?.pressed);
        bNow = bNow || Boolean(b[5]?.pressed || b[1]?.pressed);
      } else if (/Left/i.test(gp.id)) {
        xNow = xNow || Boolean(b[4]?.pressed || b[0]?.pressed);
        yNow = yNow || Boolean(b[5]?.pressed || b[1]?.pressed);
      } else {
        aNow = aNow || Boolean(b[0]?.pressed);
        bNow = bNow || Boolean(b[1]?.pressed);
        xNow = xNow || Boolean(b[2]?.pressed);
        yNow = yNow || Boolean(b[3]?.pressed);
      }
    }
  }

  if (aNow && !prevPadBtns.a) actionButtonA_TurnSignal();
  if (bNow && !prevPadBtns.b) actionButtonB_ParkFullStop();
  if (xNow && !prevPadBtns.x) actionButtonX_EnterOrExitCar();
  if (yNow && !prevPadBtns.y) actionButtonY_ToggleYouTube();

  prevPadBtns.a = aNow;
  prevPadBtns.b = bNow;
  prevPadBtns.x = xNow;
  prevPadBtns.y = yNow;
}

// Hỗ trợ đẩy nút xoay (Thumbstick) trong cửa sổ 2D của Quest (gửi sự kiện wheel) & Phím PC
let wheelTimer = 0;
let wheelFwd = 0;
let wheelTurn = 0;
window.addEventListener('wheel', (e) => {
  if (e.target.closest('.floating-panel') || e.target.closest('#youtube-app-modal')) return;
  initAudio();
  wheelTimer = 0.22;
  wheelFwd = THREE.MathUtils.clamp(-e.deltaY / 50, -1, 1);
  wheelTurn = THREE.MathUtils.clamp(e.deltaX / 50, -1, 1);
}, { passive: true });

const keys = { w: false, s: false, a: false, d: false };
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  initAudio();
  const k = e.key.toLowerCase();
  if (k === 'z' || k === 'c') actionButtonA_TurnSignal();
  if (e.code === 'Space') actionButtonB_ParkFullStop();
  if (k === 'f') actionButtonX_EnterOrExitCar();
  if (k === 'y' || k === 'u') actionButtonY_ToggleYouTube();
  if (k === 'l') toggleLeanHeadOutWindow();
  if (k === 'i') {
    state.engineRunning = !state.engineRunning;
    if (!state.engineRunning) actionButtonB_ParkFullStop();
  }
  if (k === 'w' || e.key === 'ArrowUp') keys.w = true;
  if (k === 's' || e.key === 'ArrowDown') keys.s = true;
  if (k === 'a' || e.key === 'ArrowLeft') keys.a = true;
  if (k === 'd' || e.key === 'ArrowRight') keys.d = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') keys.w = false;
  if (k === 's' || e.key === 'ArrowDown') keys.s = false;
  if (k === 'a' || e.key === 'ArrowLeft') keys.a = false;
  if (k === 'd' || e.key === 'ArrowRight') keys.d = false;
});

// ============================================================================
// 12. KIỂM TRA VA CHẠM ĐỊA HÌNH (PHỤ THUỘC ESP32 CAM TRƯỚC) & VA CHẠM KHI TIẾN/LÙI
// ============================================================================
function checkVehicleAndTerrainCollisions(activeCar) {
  const carPos = activeCar.root.position;

  // 1. Va chạm với NPC & Vật thể động trên đường (Luôn xảy ra cả khi Tiến lẫn khi Lùi!)
  for (const npc of allCollidableNpcsAndVehicles) {
    const nd = npc.userData;
    if (nd.knockbackTimer > 0) continue;
    const dist = carPos.distanceTo(npc.position);
    if (dist < nd.radius + 1.15 && Math.abs(state.velocityMs) > 0.8) {
      const isReversing = state.velocityMs < 0;
      nd.knockbackTimer = 3.0;
      const pushDir = npc.position.clone().sub(carPos).normalize();
      nd.knockbackVel.set(pushDir.x * 9.5, 6.2, pushDir.z * 9.5);

      // Giật xe ngược lại và rung lắc mạnh!
      state.velocityMs = -Math.sign(state.velocityMs) * 3.5;
      state.suspensionShakeIntensity = 1.25;
      playCrashSound(14);
      state.lastActionLog = isReversing
        ? '💥 LÙI XE ĐỤNG TRÚNG NPC PHÍA SAU! (Hãy quan sát Gương Hậu 3D khi lùi!)'
        : '💥 XE TÔNG TRÚNG NPC TRÊN ĐƯỜNG! Đã kích hoạt hiệu ứng văng va chạm!';
      return;
    }
  }

  // 2. Va chạm với Địa hình / Tòa nhà:
  //    - NẾU ĐÃ KẾT NỐI ESP32 CAM TRƯỚC (trên Xe Chủ Phòng): Cho phép chạy xuyên địa hình!
  //    - NẾU CHƯA KẾT NỐI ESP32 CAM TRƯỚC (hoặc đang lái Xe Người Thứ 2): Chặn địa hình, tông vào sẽ bật văng ngược ra!
  const canPassThroughTerrain = activeCar.hasEsp32Capability && state.esp32FrontConnected;
  if (canPassThroughTerrain) return;

  for (const block of cityBlocks) {
    const bx = block.position.x;
    const bz = block.position.z;
    if (Math.abs(carPos.x - bx) > BLOCK_SIZE || Math.abs(carPos.z - bz) > BLOCK_SIZE) continue;

    for (const box of block.userData.localBoxes) {
      const worldX = bx + box.cx;
      const worldZ = bz + box.cz;
      const dx = carPos.x - worldX;
      const dz = carPos.z - worldZ;

      if (Math.abs(dx) < box.halfSize && Math.abs(dz) < box.halfSize) {
        // Đẩy xe bật ra khỏi tòa nhà và kích hoạt rung lắc va chạm!
        const overlapX = box.halfSize - Math.abs(dx);
        const overlapZ = box.halfSize - Math.abs(dz);
        if (overlapX < overlapZ) {
          carPos.x += dx > 0 ? overlapX + 0.3 : -(overlapX + 0.3);
        } else {
          carPos.z += dz > 0 ? overlapZ + 0.3 : -(overlapZ + 0.3);
        }
        state.velocityMs = -Math.sign(state.velocityMs || 1) * 4.2;
        state.suspensionShakeIntensity = 1.3;
        playCrashSound(15);
        state.lastActionLog = '💥 ĐỤNG TÒA NHÀ ĐỊA HÌNH! (Chưa kết nối ESP32 Cam Trước nên không được chạy xuyên địa hình!)';
        return;
      }
    }
  }
}

// ============================================================================
// 13. CẬP NHẬT BẢNG HUD DIGITAL TWIN (TRẠNG THÁI RC CHÍNH XÁC + 2 CAM ESP32)
// ============================================================================
function updateAllHudAndScreens(elapsed) {
  const activeCar = vehicleMap.get(state.activeCarId) || hostCar;

  // Xác định chính xác chuỗi trạng thái Digital Twin của xe
  let twinStatusText = '🛑 CHƯA BẬT ĐỘNG CƠ (ENGINE OFF - 0 KM/H)';
  if (state.engineRunning) {
    if (Math.abs(state.speedKmh) < 0.5) {
      twinStatusText = '🅿️ ĐỘNG CƠ ĐANG NỔ - XE ĐANG ĐỖ ĐỨNG YÊN (0 KM/H)';
    } else if (state.velocityMs > 0) {
      twinStatusText = `🟢 XE ĐANG CHẠY TIẾN (${Math.round(state.speedKmh)} KM/H - SỐ [D])`;
    } else {
      twinStatusText = `🟠 XE ĐANG CHẠY LÙI (${Math.round(Math.abs(state.speedKmh))} KM/H - SỐ [R])`;
    }
  }

  const frontCamStr = (activeCar.hasEsp32Capability && state.esp32FrontConnected)
    ? `ĐÃ KẾT NỐI ESP32 (${state.esp32FrontUrl}) — Cho phép chạy xuyên địa hình`
    : 'CHƯA KẾT NỐI ESP32 — Chặn chạy xuyên địa hình (Đụng nhà sẽ bật lùi)';

  const rearCamStr = (activeCar.hasEsp32Capability && state.esp32RearConnected)
    ? `ĐÃ KẾT NỐI CAM LÙI ESP32 (${state.esp32RearUrl})`
    : 'ĐANG HIỂN THỊ GÓC NHÌN 3D PHÍA SAU XE (Lùi đụng NPC có hiệu ứng tông)';

  // Cập nhật DOM HUD 2D
  const twinEl = document.getElementById('hud-twin-state');
  const speedEl = document.getElementById('hud-speed-display');
  const frontEl = document.getElementById('hud-cam-front-status');
  const rearEl = document.getElementById('hud-cam-rear-status');
  const sigEl = document.getElementById('hud-turn-signal-status');
  const logEl = document.getElementById('hud-action-log');

  if (twinEl) twinEl.textContent = twinStatusText;
  if (speedEl) {
    speedEl.textContent = `SPEED: ${Math.round(Math.abs(state.speedKmh))} KM/H | GEAR: [${state.gear}] | ${Math.round(state.rpm)} RPM`;
  }
  if (frontEl) frontEl.textContent = `• CAM TRƯỚC (KÍNH CHẮN GIÓ): ${frontCamStr}`;
  if (rearEl) rearEl.textContent = `• CAM HẬU (GƯƠNG LÙI): ${rearCamStr}`;
  if (sigEl) {
    const sNames = ['TẮT', '⬅ TRÁI', '➡ PHẢI'];
    sigEl.textContent = `• XI-NHAN [Nút A]: ${sNames[state.turnSignal]} | VỊ TRÍ: ${SEAT_OFFSETS[state.seatIndex].name} (${state.leaningOutWindow ? 'ĐANG THÒ ĐẦU RA XE' : 'TRONG XE'})`;
  }
  if (logEl) logEl.textContent = `▶ ${state.lastActionLog}`;

  // Cập nhật HUD 3D trong kính VR
  hud3DCtx.clearRect(0, 0, 860, 460);
  hud3DCtx.fillStyle = 'rgba(6, 12, 24, 0.92)';
  hud3DCtx.fillRect(0, 0, 860, 460);
  hud3DCtx.strokeStyle = '#00e5ff';
  hud3DCtx.lineWidth = 6;
  hud3DCtx.strokeRect(3, 3, 854, 454);

  hud3DCtx.fillStyle = '#00e5ff';
  hud3DCtx.fillRect(0, 0, 860, 46);
  hud3DCtx.fillStyle = '#000';
  hud3DCtx.font = 'bold 20px Segoe UI, sans-serif';
  hud3DCtx.fillText('✥ BẢNG HUD 3D DIGITAL TWIN (GIỮ CÒ TAY CẦM ĐỂ KÉO THẢ DI CHUYỂN)', 18, 30);

  hud3DCtx.fillStyle = '#ffd60a';
  hud3DCtx.font = 'bold 19px Segoe UI, sans-serif';
  hud3DCtx.fillText(twinStatusText, 20, 82);

  hud3DCtx.fillStyle = '#00ff88';
  hud3DCtx.font = 'bold 36px monospace';
  hud3DCtx.fillText(`SPEED: ${Math.round(Math.abs(state.speedKmh))} KM/H | GEAR: [${state.gear}] | ${Math.round(state.rpm)} RPM`, 20, 140);

  hud3DCtx.fillStyle = '#00e5ff';
  hud3DCtx.font = 'bold 17px Segoe UI, sans-serif';
  hud3DCtx.fillText(`• CAM TRƯỚC: ${frontCamStr}`, 20, 190);
  hud3DCtx.fillStyle = '#4cd964';
  hud3DCtx.fillText(`• CAM HẬU  : ${rearCamStr}`, 20, 224);

  hud3DCtx.fillStyle = '#ffffff';
  hud3DCtx.fillText(`▶ ${state.lastActionLog}`, 20, 275);
  hud3DCtx.fillStyle = '#a0c4ff';
  hud3DCtx.fillText('• Nút Xoay = Tiến/Lùi/Rẽ | [A] = Xi-nhan | [B] = Đỗ xe (0 km/h) | [X] = Lên/Xuống xe | [Y] = YouTube', 20, 325);
  hud3DTex.needsUpdate = true;

  // Cập nhật Màn hình YouTube 3D trong VR
  if (yt3DGroup.visible) {
    yt3DCtx.fillStyle = '#0f0f0f';
    yt3DCtx.fillRect(0, 0, 640, 360);
    yt3DCtx.fillStyle = '#ff0000';
    yt3DCtx.fillRect(0, 0, 640, 44);
    yt3DCtx.fillStyle = '#ffffff';
    yt3DCtx.font = 'bold 18px Segoe UI, sans-serif';
    yt3DCtx.fillText(`▶ YouTube Internet: ${currentYtTitle} (Giữ Cò để kéo thả)`, 16, 28);
    for (let i = 0; i < 24; i++) {
      const h = 25 + Math.abs(Math.sin(elapsed * 6 + i * 0.45)) * 150;
      yt3DCtx.fillStyle = i % 2 === 0 ? '#ff0000' : '#00e5ff';
      yt3DCtx.fillRect(40 + i * 24, 310 - h, 15, h);
    }
    yt3DTex.needsUpdate = true;
  }

  // Cập nhật Kính chắn gió (Nếu đã kết nối ESP32 Cam Trước thì vẽ luồng ảnh lên kính)
  wsCtx.clearRect(0, 0, 1024, 512);
  if (state.esp32FrontConnected && esp32FrontImg.complete && esp32FrontImg.naturalWidth > 0) {
    wsCtx.drawImage(esp32FrontImg, 0, 0, 1024, 512);
  }
  wsTex.needsUpdate = true;

  if (state.esp32RearConnected && esp32RearImg.complete && esp32RearImg.naturalWidth > 0) {
    esp32RearCtx.drawImage(esp32RearImg, 0, 0, 512, 256);
    esp32RearTex.needsUpdate = true;
  }
}

// ============================================================================
// 14. VÒNG LẶP CHÍNH: RENDER CAMERA LÙI 3D, KÉO THẢ PANEL VR, NÚT XOAY & VA CHẠM
// ============================================================================
const clock = new THREE.Clock();
let uiTimer = 0;
let blinkSignalTimer = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  if (wheelTimer > 0) {
    wheelTimer -= dt;
    if (wheelTimer <= 0) {
      wheelFwd = 0;
      wheelTurn = 0;
    }
  }

  pollQuestThumbstickAndABXY();

  // Xử lý kéo thả Bảng HUD 3D và YouTube 3D trong không gian VR bằng Cò tay cầm
  if (grabbed3DPanel && grabbedController) {
    const activeCar = vehicleMap.get(state.activeCarId) || hostCar;
    tempMat4.identity().extractRotation(grabbedController.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(grabbedController.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMat4);
    const targetWorld = origin.add(dir.multiplyScalar(grabbedDistance));
    activeCar.chassis.worldToLocal(targetWorld);
    grabbed3DPanel.position.lerp(targetWorld, 0.3);
  }

  vrBlinkShutterMat.opacity = THREE.MathUtils.lerp(vrBlinkShutterMat.opacity, state.blinkTargetOpacity, dt * 14);
  const activeCar = vehicleMap.get(state.activeCarId) || hostCar;

  // Tổng hợp đầu vào từ Nút Xoay (Thumbstick) của tay cầm Quest 3 + Phím W/A/S/D
  const kbFwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  const kbTurn = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  const inputForward = THREE.MathUtils.clamp(kbFwd + thumbstickInput.moveY + wheelFwd, -1, 1);
  const inputTurn = THREE.MathUtils.clamp(kbTurn + thumbstickInput.moveX + wheelTurn, -1, 1);

  // 1. KHI ĐANG ĐI BỘ NGOÀI ĐƯỜNG (Tốc độ đã tăng lên 6.8 m/s nhanh và nhạy)
  if (state.playerMode === 'ON_FOOT') {
    state.avatarYaw -= inputTurn * 2.4 * dt;
    playerAvatarGroup.rotation.y = state.avatarYaw;

    if (Math.abs(inputForward) > 0.08) {
      state.avatarPos.x -= Math.sin(state.avatarYaw) * inputForward * state.avatarWalkSpeed * dt;
      state.avatarPos.z -= Math.cos(state.avatarYaw) * inputForward * state.avatarWalkSpeed * dt;
      playerAvatarGroup.position.copy(state.avatarPos);
    }
  }

  // 2. KHI ĐANG NGỒI TRONG XE (Chỉ khi đẩy Nút Xoay / phím W-S và đã bật máy xe mới chạy; dừng đẩy là về 0!)
  if (state.playerMode === 'IN_CAR') {
    updateCameraSeatAndLeanTransform(dt);

    if (Math.abs(inputTurn) > 0.08) {
      state.steeringAngleDeg = THREE.MathUtils.clamp(state.steeringAngleDeg + inputTurn * 260 * dt, -540, 540);
    } else {
      state.steeringAngleDeg = THREE.MathUtils.lerp(state.steeringAngleDeg, 0, dt * 3.5);
    }

    if (state.seatIndex === 0) {
      // Nếu người chơi đẩy nút xoay để chạy khi chưa bật máy -> Tự động đề nổ máy V12
      if (Math.abs(inputForward) > 0.2 && !state.engineRunning) {
        state.engineRunning = true;
      }

      if (!state.engineRunning) {
        state.velocityMs = 0;
        state.speedKmh = 0;
        state.rpm = 0;
        state.gear = 'P';
      } else if (Math.abs(inputForward) > 0.08) {
        state.gear = inputForward > 0 ? 'D' : 'R';
        const targetVel = inputForward * 18.0 * state.rcSpeedRatio;
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, targetVel, dt * 4.5);
      } else {
        // Khi buông nút xoay (xe RC ngoài đời ngưng): Tốc độ giảm nhanh về 0 KM/H (Đang đỗ)!
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * 6.5);
        if (Math.abs(state.velocityMs) < 0.08) {
          state.velocityMs = 0;
          state.gear = 'P';
        }
      }

      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = state.engineRunning ? 680 + Math.abs(state.speedKmh) * 35 : 0;

      const steerRad = THREE.MathUtils.degToRad((state.steeringAngleDeg / 540) * 34);
      const yawRate = (state.velocityMs / 3.2) * Math.tan(steerRad);
      activeCar.headingRad -= yawRate * dt;
      activeCar.root.rotation.y = activeCar.headingRad;

      const step = state.velocityMs * dt;
      activeCar.root.position.x -= Math.sin(activeCar.headingRad) * step;
      activeCar.root.position.z -= Math.cos(activeCar.headingRad) * step;

      // Kiểm tra va chạm với NPC (khi tiến/lùi) & Địa hình (nếu chưa kết nối ESP32 Cam Trước)
      checkVehicleAndTerrainCollisions(activeCar);
    }
  }

  // Quay bánh xe & Vô lăng
  const wheelSpin = (state.velocityMs * dt) / 0.38;
  const frontYaw = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 34);
  for (const w of activeCar.wheels) {
    w.spinHub.rotation.x -= wheelSpin;
    if (w.isFront) w.steerMount.rotation.y = frontYaw;
  }
  activeCar.swPivot.rotation.z = THREE.MathUtils.degToRad(-state.steeringAngleDeg);

  // Rung lắc thân xe khi tông trúng NPC / tòa nhà / Bà già
  if (state.suspensionShakeIntensity > 0.01) {
    state.suspensionShakePhase += dt * 38;
    const amp = state.suspensionShakeIntensity;
    activeCar.chassis.position.y = Math.abs(Math.sin(state.suspensionShakePhase)) * 0.14 * amp;
    activeCar.chassis.rotation.z = Math.sin(state.suspensionShakePhase * 0.8) * 0.065 * amp;
    state.suspensionShakeIntensity = THREE.MathUtils.lerp(state.suspensionShakeIntensity, 0, dt * 3.2);
  } else {
    activeCar.chassis.position.y = 0;
    activeCar.chassis.rotation.z = 0;
  }

  // Đèn Xi-nhan nhấp nháy (Nút A)
  if (state.turnSignal > 0) {
    blinkSignalTimer += dt;
    if (blinkSignalTimer > 0.42) {
      blinkSignalTimer = 0;
      state.turnBlinkOn = !state.turnBlinkOn;
      playTurnSignalClick();
    }
  } else {
    state.turnBlinkOn = false;
  }
  activeCar.blinkerMatL.color.setHex(state.turnBlinkOn && state.turnSignal === 1 ? 0xffaa00 : 0x332200);
  activeCar.blinkerMatR.color.setHex(state.turnBlinkOn && state.turnSignal === 2 ? 0xffaa00 : 0x332200);

  // Cập nhật chuyển động NPC và hiệu ứng văng Ragdoll khi bị xe tiến/lùi tông trúng
  for (const npc of allCollidableNpcsAndVehicles) {
    const nd = npc.userData;
    if (nd.knockbackTimer > 0) {
      nd.knockbackTimer -= dt;
      npc.position.addScaledVector(nd.knockbackVel, dt);
      nd.knockbackVel.y -= 18.0 * dt;
      npc.rotation.x += 7.0 * dt;
      if (npc.position.y < 0.2) {
        npc.position.y = 0.2;
        nd.knockbackVel.multiplyScalar(0.4);
      }
      if (nd.knockbackTimer <= 0) {
        npc.rotation.set(0, nd.dir > 0 ? 0 : Math.PI, 0);
        npc.position.y = 0.12;
      }
      continue;
    }
    nd.phase += dt * 6.5;
    nd.legL.rotation.x = Math.sin(nd.phase) * 0.45;
    nd.legR.rotation.x = -Math.sin(nd.phase) * 0.45;
    npc.position.z += nd.dir * nd.speed * dt;
    if (npc.position.z - activeCar.root.position.z > 80) npc.position.z -= 160;
    else if (npc.position.z - activeCar.root.position.z < -80) npc.position.z += 160;
  }

  // Cập nhật Bà già đi bộ / Bà già lái xe máy bị tông khi xe RC ngoài đời đụng vật cản
  if (rcVictimTimer > 0) {
    rcVictimTimer -= dt;
    rcCrashVictimGroup.position.addScaledVector(rcVictimVel, dt);
    rcVictimVel.y -= 18.0 * dt;
    rcCrashVictimGroup.rotation.x += 7.0 * dt;
    if (rcCrashVictimGroup.position.y < 0.2) {
      rcCrashVictimGroup.position.y = 0.2;
      rcVictimVel.multiplyScalar(0.4);
    }
    if (rcVictimTimer <= 0) rcCrashVictimGroup.visible = false;
  }

  // Cuốn chiếu bản đồ quanh vị trí người chơi
  const focusPos = state.playerMode === 'IN_CAR' ? activeCar.root.position : state.avatarPos;
  const gxCenter = Math.round(focusPos.x / BLOCK_SIZE);
  const gzCenter = Math.round(focusPos.z / BLOCK_SIZE);
  const span = GRID_RADIUS * 2 + 1;
  for (const b of cityBlocks) {
    let dx = b.userData.gridX - gxCenter;
    let dz = b.userData.gridZ - gzCenter;
    if (dx > GRID_RADIUS) b.userData.gridX -= span;
    else if (dx < -GRID_RADIUS) b.userData.gridX += span;
    if (dz > GRID_RADIUS) b.userData.gridZ -= span;
    else if (dz < -GRID_RADIUS) b.userData.gridZ += span;
    b.position.set(b.userData.gridX * BLOCK_SIZE, 0, b.userData.gridZ * BLOCK_SIZE);
  }

  // RENDER GÓC NHÌN 3D PHÍA SAU ĐUÔI XE LÊN MÀN HÌNH CAM LÙI (Khi chưa kết nối ESP32 Cam Lùi!)
  if (!state.esp32RearConnected) {
    const rearPos = new THREE.Vector3(0, 0.85, 2.48).applyMatrix4(activeCar.root.matrixWorld);
    const lookBackTarget = new THREE.Vector3(0, 0.70, 12.0).applyMatrix4(activeCar.root.matrixWorld);
    rearCamera3D.position.copy(rearPos);
    rearCamera3D.lookAt(lookBackTarget);

    const prevXrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(rearRenderTarget);
    renderer.render(scene, rearCamera3D);
    renderer.setRenderTarget(null);
    renderer.xr.enabled = prevXrEnabled;
  }

  // Âm thanh động cơ êm ái
  if (audioCtx && v12Gain) {
    const isMoving = state.engineRunning && Math.abs(state.velocityMs) > 0.2;
    v12Gain.gain.setTargetAtTime(isMoving ? 0.08 : 0.002, audioCtx.currentTime, 0.08);
    v12Osc.frequency.setTargetAtTime(45 + Math.abs(state.velocityMs) * 3.2, audioCtx.currentTime, 0.05);
  }

  uiTimer += dt;
  if (uiTimer >= 0.07) {
    uiTimer = 0;
    updateAllHudAndScreens(elapsed);
  }

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// GOLDEN BASELINE V2.2 MASTER PATCH (CHỐNG GHI ĐÈ FRAME-BY-FRAME):
// 1. Khóa vị trí Vô lăng chuẩn Cabin & Xóa vĩnh viễn Trục vô lăng chắn kính
// 2. Ẩn triệt để Menu 3D trước ghế phụ & Thu gọn Menu vào Bánh răng Liquid Widget
// 3. Màn hình Ghế Sau nổi hoàn toàn (không chìm vào ghế), có Khung Panel cố định
//    phạm vi cho phép kéo thả Trái/Phải, Kéo Gần/Đẩy Xa & Đồng bộ 3 màn hình MP4
// 4. Xóa 100% tay chân/thân NPC thừa dính trong xe người chơi ở mọi góc nhìn
// 5. Bấm F / Click chuột / Chạm ĐT / Tia Laser lên được TẤT CẢ 8 loại xe NPC
//    với Cabin 3D & Ghế Phụ Góc Nhìn Thứ 1 riêng biệt cho từng dòng xe
// 6. Xóa lớp kính phẳng cũ bị chồng trên Cửa Gara (chỉ giữ 1 cửa cuốn kính sạch)
// 7. Hiển thị Đèn Giao Thông 4 góc ngã tư, Đèn Đường phát sáng & 12 Hoạt Cảnh NPC
// ============================================================================
(function applyGoldenBaselineV22MasterPatch() {
  'use strict';

  if (window.__GOLDEN_BASELINE_V22_ACTIVE__) return;
  window.__GOLDEN_BASELINE_V22_ACTIVE__ = true;

  // --------------------------------------------------------------------------
  // 1. KHÓA VỊ TRÍ VÔ LĂNG CHUẨN CABIN & CẮT BỎ TRỤC VÔ LĂNG Ở KÍNH CHẮN GIÓ
  // --------------------------------------------------------------------------
  function enforceSteeringWheelPositionAndRemoveShaftEveryFrame() {
    if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
      // Đặt vô lăng thấp xuống đúng tầm táp-lô ghế lái, không bao giờ che kính chắn gió
      steeringWheelPivot.position.set(-0.38, 0.51, -0.35);
      // Giữ góc nghiêng chuẩn -18 độ theo phương X, chỉ xoay trục Z theo góc đánh lái
      steeringWheelPivot.rotation.x = THREE.MathUtils.degToRad(-18);
      steeringWheelPivot.rotation.y = 0;

      // Quét bên trong steeringWheelPivot: xóa bất kỳ hình trụ dài (trục vô lăng) nào
      steeringWheelPivot.traverse((child) => {
        if (!child || !child.isMesh || child === steeringWheelPivot) return;
        const gType = child.geometry ? child.geometry.type : '';
        const params = child.geometry ? child.geometry.parameters || {} : {};
        const nm = (child.name || '').toLowerCase();

        // Nếu là trụ Cylinder dài > 0.08m hoặc thanh dọc (trục nối vô lăng lên kính)
        if (
          nm.includes('column') ||
          nm.includes('shaft') ||
          nm.includes('truc') ||
          (gType === 'CylinderGeometry' && ((params.height && params.height > 0.08) || child.scale.y > 1.5)) ||
          (gType === 'BoxGeometry' && child.position.z < -0.05 && Math.abs(child.position.y) > 0.12)
        ) {
          child.visible = false;
          child.scale.set(0, 0, 0);
        }
      });
    }

    // Quét trong chassisGroup & vehicleRoot: xóa mọi thanh trụ dọc/xiên vướng trước kính chắn gió
    const roots = [];
    if (typeof chassisGroup !== 'undefined' && chassisGroup) roots.push(chassisGroup);
    if (typeof vehicleRoot !== 'undefined' && vehicleRoot) roots.push(vehicleRoot);

    roots.forEach((root) => {
      root.children.forEach((obj) => {
        if (!obj || obj === steeringWheelPivot) return;
        if (obj.isMesh && obj.geometry) {
          const gType = obj.geometry.type;
          const p = obj.position;
          // Thanh trục vô lăng nằm ở vùng x: [-0.65..-0.10], y: [0.35..1.25], z: [-0.85..-0.15]
          if (
            (gType === 'CylinderGeometry' || gType === 'BoxGeometry') &&
            p.x > -0.68 && p.x < 0.15 &&
            p.y > 0.35 && p.y < 1.25 &&
            p.z > -0.85 && p.z < -0.15
          ) {
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);
            // Nếu là thanh hẹp ngang (< 0.18m) nhưng dài/cao (> 0.16m) chắn trước mặt
            if (size.x < 0.18 && (size.y > 0.16 || size.z > 0.22)) {
              obj.visible = false;
              obj.scale.set(0, 0, 0);
            }
          }
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // 2. ẨN TRIỆT ĐỂ MENU 3D BÊN GHẾ PHỤ & XÓA TAY CHÂN NPC DÍNH TRONG XE NGƯỜI CHƠI
  // --------------------------------------------------------------------------
  function purgePassenger3DMenuAndStuckCabinNpcLimbsEveryFrame() {
    // 2.1. Ẩn coDriverFrontLeftAvatar và mọi biến avatar phụ trong xe người chơi
    if (typeof coDriverFrontLeftAvatar !== 'undefined' && coDriverFrontLeftAvatar) {
      coDriverFrontLeftAvatar.visible = false;
      coDriverFrontLeftAvatar.scale.set(0, 0, 0);
    }

    const carContainers = [];
    if (typeof chassisGroup !== 'undefined' && chassisGroup) carContainers.push(chassisGroup);
    if (typeof vehicleRoot !== 'undefined' && vehicleRoot) carContainers.push(vehicleRoot);

    carContainers.forEach((car) => {
      car.traverse((node) => {
        if (!node || node === car || node === steeringWheelPivot) return;
        if (steeringWheelPivot && steeringWheelPivot.children.includes(node)) return;
        if (node.userData && node.userData.isV22CustomElement) return;

        // Giữ lại tên cướp duy nhất khi đang bật chế độ Mất Sóng Cướp Xe
        if (typeof hijackDriverMesh !== 'undefined' && hijackDriverMesh && (node === hijackDriverMesh || hijackDriverMesh.children.includes(node))) {
          node.visible = Boolean(typeof state !== 'undefined' && state.hijackActive);
          return;
        }

        const nm = (node.name || '').toLowerCase();
        const ud = node.userData || {};

        // A. Ẩn cụm 8 ô nút menu 3D lơ lửng bên ghế phụ (image_b73ce6.jpg)
        if (
          nm.includes('quickmenu') ||
          nm.includes('vrbutton') ||
          nm.includes('cockpitbtn') ||
          ud.isCockpit3DButton ||
          (node.isMesh &&
            node.geometry &&
            (node.geometry.type === 'PlaneGeometry' || node.geometry.type === 'BoxGeometry') &&
            node.position.x > 0.03 &&
            node.position.x < 0.78 &&
            node.position.y > 0.62 &&
            node.position.y < 1.22 &&
            node.position.z > -1.05 &&
            node.position.z < -0.25 &&
            ud.onClick)
        ) {
          node.visible = false;
          node.scale.set(0, 0, 0);
          return;
        }

        // B. Xóa mọi đầu, thân, tay, chân NPC dính vào trong khoang xe của người chơi (image_b7971d & b79ad9)
        if (node.isMesh && node.geometry) {
          const gt = node.geometry.type;
          if (gt === 'SphereGeometry' || gt === 'CapsuleGeometry' || gt === 'CylinderGeometry' || gt === 'BoxGeometry') {
            const wp = new THREE.Vector3();
            node.getWorldPosition(wp);
            const lp = car.worldToLocal(wp);
            // Khoang ghế trước & giữa xe: x ∈ [-0.72, 0.72], y ∈ [0.25, 1.55], z ∈ [-0.32, 0.42]
            if (
              Math.abs(lp.x) < 0.72 &&
              lp.y > 0.25 &&
              lp.y < 1.55 &&
              lp.z > -0.32 &&
              lp.z < 0.42
            ) {
              // Nếu là hình cầu/capsule/cylinder (đầu/tay/chân/mũ NPC)
              if (gt === 'SphereGeometry' || gt === 'CapsuleGeometry' || gt === 'CylinderGeometry') {
                node.visible = false;
                node.scale.set(0, 0, 0);
              }
            }
          }
        }
      });
    });

    // Ẩn menu danh sách dọc cũ bên trái màn hình (vì đã gom vào nút Bánh Răng Liquid Widget)
    document.querySelectorAll('div, aside').forEach((el) => {
      if (el.id === 'liquid-gear-widget-container' || el.id === 'liquid-gear-menu-list' || el.id === 'function-panel') return;
      const txt = (el.textContent || '').trim();
      if (txt.includes('Snap Turn 30°') && txt.includes('Lái Sport Coupe GT') && el.children.length >= 5) {
        if (!el.contains(document.getElementById('function-panel')) && el.tagName !== 'BODY') {
          el.style.display = 'none';
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // 3. MÀN HÌNH GHẾ SAU NỔI HOÀN TOÀN (KHÔNG CHÌM VÀO GHẾ) + KÉO THẢ TRONG KHUNG PANEL CỐ ĐỊNH
  // --------------------------------------------------------------------------
  const v22YtCanvas = document.createElement('canvas');
  v22YtCanvas.width = 640;
  v22YtCanvas.height = 360;
  const v22YtCtx = v22YtCanvas.getContext('2d');
  const v22YtTex = new THREE.CanvasTexture(v22YtCanvas);
  if (THREE.SRGBColorSpace) v22YtTex.colorSpace = THREE.SRGBColorSpace;

  const v22ThumbImg = new Image();
  v22ThumbImg.crossOrigin = 'Anonymous';
  let v22ThumbReady = false;
  v22ThumbImg.onload = () => { v22ThumbReady = true; };
  v22ThumbImg.src = 'https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg';

  window.addEventListener('yt-item-selected', (e) => {
    const detail = e.detail || {};
    if (detail.thumbnail) {
      v22ThumbReady = false;
      v22ThumbImg.src = detail.thumbnail;
    }
  });

  const rearEntertainmentUnits = [];
  let activeDraggedRearUnit = null;

  function buildBoundedDraggableRearScreens() {
    const rootCar = (typeof chassisGroup !== 'undefined' && chassisGroup)
      ? chassisGroup
      : (typeof vehicleRoot !== 'undefined' ? vehicleRoot : null);
    if (!rootCar || rootCar.userData.v22RearScreensBuilt) return;
    rootCar.userData.v22RearScreensBuilt = true;

    // 3.1. Xóa sạch toàn bộ các màn hình ghế sau cũ bị chìm trong lưng ghế trước
    const toRemove = [];
    rootCar.traverse((obj) => {
      if (!obj || obj === rootCar) return;
      if (
        obj.userData?.isRearSeatYouTubeScreen ||
        (obj.name && obj.name.includes('Rear') && obj.name.includes('YouTube')) ||
        (obj.isMesh && obj.geometry?.type === 'PlaneGeometry' && obj.position.z > 0.05 && obj.position.z < 0.45)
      ) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((o) => {
      o.visible = false;
      if (o.parent) o.parent.remove(o);
    });

    // 3.2. Gắn chung Texture đồng bộ cho màn hình Táp-lô phía trước
    rootCar.traverse((obj) => {
      if (obj && obj.isMesh && obj.geometry?.type === 'PlaneGeometry' && obj.position.z < -0.15 && obj.position.y > 0.52 && obj.position.y < 0.96) {
        obj.material = new THREE.MeshBasicMaterial({ map: v22YtTex, side: THREE.DoubleSide });
        obj.userData.isV22CustomElement = true;
        obj.userData.onClick = () => openYouTubeModalSafely();
        if (typeof interactive3DTargets !== 'undefined' && Array.isArray(interactive3DTargets) && !interactive3DTargets.includes(obj)) {
          interactive3DTargets.push(obj);
        }
      }
    });

    // 3.3. Dựng 2 Cụm Màn Hình Ghế Sau Nổi Trong Khung Panel Cố Định Phạm Vi
    // Đặt tại z = 0.48m (Nằm hẳn phía sau mặt lưng ghế trước z=0.38m -> Không bao giờ chìm vào ghế!)
    const configs = [
      {
        id: 'REAR_LEFT',
        label: '📺 MÀN HÌNH GHẾ SAU TRÁI (KÉO TRÁI/PHẢI/GẦN/XA)',
        defaultX: -0.41, minX: -0.60, maxX: -0.18,
        defaultY: 0.86,  minY: 0.74,  maxY: 0.98,
        defaultZ: 0.48,  minZ: 0.44,  maxZ: 0.68
      },
      {
        id: 'REAR_RIGHT',
        label: '📺 MÀN HÌNH GHẾ SAU PHẢI (KÉO TRÁI/PHẢI/GẦN/XA)',
        defaultX: 0.41,  minX: 0.18,  maxX: 0.60,
        defaultY: 0.86,  minY: 0.74,  maxY: 0.98,
        defaultZ: 0.48,  minZ: 0.44,  maxZ: 0.68
      }
    ];

    configs.forEach((cfg) => {
      // Khung Panel Giới Hạn Cố Định (Fixed Boundary Rail Frame)
      const boundaryRail = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.maxX - cfg.minX + 0.06, cfg.maxY - cfg.minY + 0.06, 0.008),
        new THREE.MeshBasicMaterial({ color: 0x00f5d4, wireframe: true, transparent: true, opacity: 0.28 })
      );
      boundaryRail.position.set((cfg.minX + cfg.maxX) / 2, (cfg.minY + cfg.maxY) / 2, cfg.minZ - 0.01);
      boundaryRail.userData.isV22CustomElement = true;
      rootCar.add(boundaryRail);

      // Cụm màn hình di động bên trong khung Panel cố định
      const unitGroup = new THREE.Group();
      unitGroup.name = `V22_${cfg.id}_SCREEN`;
      unitGroup.position.set(cfg.defaultX, cfg.defaultY, cfg.defaultZ);
      unitGroup.userData = {
        isV22CustomElement: true,
        isDraggableRearScreenUnit: true,
        bounds: cfg
      };

      // Viền vỏ màn hình
      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.21, 0.016),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 })
      );
      bezel.userData.isV22CustomElement = true;
      unitGroup.add(bezel);

      // Mặt màn hình YouTube MP4
      const screenMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.315, 0.176),
        new THREE.MeshBasicMaterial({ map: v22YtTex, side: THREE.DoubleSide })
      );
      screenMesh.position.z = 0.01;
      screenMesh.userData = {
        isV22CustomElement: true,
        parentRearUnit: unitGroup,
        onClick: () => openYouTubeModalSafely()
      };
      unitGroup.add(screenMesh);

      // Thanh điều khiển viền dưới màn hình: [◀ Trái] [▶ Phải] [+ Kéo Gần] [- Đẩy Xa] [📺 Mở YT]
      const ctrlActions = [
        { txt: '◀', dx: -0.04, dz: 0, xOffset: -0.12 },
        { txt: '▶', dx: 0.04,  dz: 0, xOffset: -0.06 },
        { txt: '+Gần', dx: 0,  dz: 0.04, xOffset: 0.01 },
        { txt: '-Xa',  dz: 0,  dz: -0.04, xOffset: 0.08 },
        { txt: '📺',   dx: 0,  dz: 0, xOffset: 0.14, openYt: true }
      ];

      ctrlActions.forEach((act) => {
        const btnMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.052, 0.032, 0.018),
          new THREE.MeshBasicMaterial({ color: act.openYt ? 0xff0033 : 0x00bbf9 })
        );
        btnMesh.position.set(act.xOffset, -0.122, 0.012);
        btnMesh.userData = {
          isV22CustomElement: true,
          onClick: () => {
            if (act.openYt) {
              openYouTubeModalSafely();
            } else {
              unitGroup.position.x = THREE.MathUtils.clamp(unitGroup.position.x + act.dx, cfg.minX, cfg.maxX);
              unitGroup.position.z = THREE.MathUtils.clamp(unitGroup.position.z + act.dz, cfg.minZ, cfg.maxZ);
            }
          }
        };
        unitGroup.add(btnMesh);
        if (typeof interactive3DTargets !== 'undefined' && Array.isArray(interactive3DTargets)) {
          interactive3DTargets.push(btnMesh);
        }
      });

      if (typeof interactive3DTargets !== 'undefined' && Array.isArray(interactive3DTargets)) {
        interactive3DTargets.push(screenMesh, bezel);
      }

      rootCar.add(unitGroup);
      rearEntertainmentUnits.push(unitGroup);
    });
  }

  function openYouTubeModalSafely() {
    const ytModal = document.getElementById('youtube-app-modal');
    if (ytModal) {
      ytModal.classList.remove('panel-hidden');
      ytModal.style.display = 'flex';
    }
    if (typeof openRealYouTubeApp === 'function') {
      try { openRealYouTubeApp(); } catch (e) {}
    }
  }

  // Cho phép nắm kéo thả trực tiếp 2 màn hình ghế sau bằng Chuột / Cảm ứng / Tia Laser trong phạm vi Khung Panel
  const v22Raycaster = new THREE.Raycaster();
  const v22Pointer = new THREE.Vector2();
  let dragStartPoint = new THREE.Vector3();

  window.addEventListener('pointerdown', (e) => {
    if (typeof camera === 'undefined' || !camera || typeof renderer === 'undefined') return;
    if (e.target !== renderer.domElement) return;

    v22Pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    v22Pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    v22Raycaster.setFromCamera(v22Pointer, camera);

    // 1. Kiểm tra kéo thả hoặc bấm vào 2 màn hình ghế sau
    const rearHits = v22Raycaster.intersectObjects(rearEntertainmentUnits, true);
    if (rearHits.length > 0) {
      const hitObj = rearHits[0].object;
      if (hitObj.userData && hitObj.userData.onClick && hitObj.geometry?.type === 'BoxGeometry' && hitObj.position.y < -0.1) {
        hitObj.userData.onClick();
        return;
      }
      let unit = hitObj;
      while (unit && !unit.userData?.isDraggableRearScreenUnit) unit = unit.parent;
      if (unit) {
        activeDraggedRearUnit = unit;
        dragStartPoint.copy(rearHits[0].point);
      }
      return;
    }

    // 2. Kiểm tra Click / Chạm màn hình điện thoại / Tia Laser vào XE NPC để lên xe NPC
    if (typeof scene !== 'undefined' && scene) {
      const allHits = v22Raycaster.intersectObjects(scene.children, true);
      for (const h of allHits) {
        const npcVeh = findTrafficVehicleFromChild(h.object);
        if (npcVeh) {
          boardNpcVehicleWithCustomCabin(npcVeh);
          return;
        }
      }
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!activeDraggedRearUnit || typeof camera === 'undefined') return;
    const cfg = activeDraggedRearUnit.userData.bounds;
    const dx = (e.movementX || 0) * 0.0018;
    const dy = -(e.movementY || 0) * 0.0018;
    activeDraggedRearUnit.position.x = THREE.MathUtils.clamp(activeDraggedRearUnit.position.x + dx, cfg.minX, cfg.maxX);
    activeDraggedRearUnit.position.y = THREE.MathUtils.clamp(activeDraggedRearUnit.position.y + dy, cfg.minY, cfg.maxY);
  });

  window.addEventListener('pointerup', () => {
    activeDraggedRearUnit = null;
  });

  // Lăn con lăn chuột hoặc vuốt 2 ngón khi trỏ vào màn hình ghế sau để Kéo Gần / Đẩy Xa trong phạm vi [0.44m .. 0.68m]
  window.addEventListener('wheel', (e) => {
    if (typeof state !== 'undefined' && state.seatIndex >= 2) {
      rearEntertainmentUnits.forEach((u) => {
        const cfg = u.userData.bounds;
        u.position.z = THREE.MathUtils.clamp(u.position.z + (e.deltaY > 0 ? -0.025 : 0.025), cfg.minZ, cfg.maxZ);
      });
    }
  });

  // Vẽ hình ảnh Video MP4 + Thumbnail đồng bộ lên cả 3 màn hình trong xe
  function updateSyncedThreeScreensCanvas() {
    v22YtCtx.fillStyle = '#070b14';
    v22YtCtx.fillRect(0, 0, 640, 360);

    const vidEl = document.getElementById('yt-html5-video') || document.getElementById('vr-video-source');
    const meta = window.__ACTIVE_YT_ITEM__ || { title: 'YouTube MP4 Đồng Bộ 3 Màn Hình' };

    if (vidEl && !vidEl.paused && vidEl.readyState >= 2) {
      try {
        v22YtCtx.drawImage(vidEl, 0, 34, 640, 286);
      } catch (err) {
        if (v22ThumbReady) v22YtCtx.drawImage(v22ThumbImg, 0, 34, 640, 286);
      }
    } else if (v22ThumbReady) {
      v22YtCtx.drawImage(v22ThumbImg, 0, 34, 640, 286);
    }

    v22YtCtx.fillStyle = 'rgba(8, 12, 22, 0.9)';
    v22YtCtx.fillRect(0, 0, 640, 34);
    v22YtCtx.fillStyle = '#ff0033';
    v22YtCtx.fillRect(10, 5, 84, 24);
    v22YtCtx.fillStyle = '#fff';
    v22YtCtx.font = 'bold 13px Segoe UI, sans-serif';
    v22YtCtx.fillText('▶ YouTube', 16, 22);

    v22YtCtx.fillStyle = '#ffd166';
    v22YtCtx.font = 'bold 13px Segoe UI, sans-serif';
    v22YtCtx.fillText(String(meta.title || '').slice(0, 50), 104, 22);

    v22YtCtx.fillStyle = 'rgba(6, 10, 18, 0.92)';
    v22YtCtx.fillRect(0, 320, 640, 40);
    const dur = (vidEl && vidEl.duration) ? vidEl.duration : 100;
    const cur = (vidEl && vidEl.currentTime) ? vidEl.currentTime : 0;
    const pct = Math.min(1, Math.max(0, cur / dur));
    v22YtCtx.fillStyle = '#263248';
    v22YtCtx.fillRect(12, 326, 616, 6);
    v22YtCtx.fillStyle = '#00f5d4';
    v22YtCtx.fillRect(12, 326, 616 * pct, 6);

    v22YtCtx.fillStyle = '#00ff88';
    v22YtCtx.font = 'bold 11.5px Segoe UI, sans-serif';
    v22YtCtx.fillText('🎯 Click / Laser để mở YouTube | Kéo màn hình Trái/Phải hoặc bấm [+Gần]/[-Xa]', 12, 350);

    v22YtTex.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // 4. LÊN MỌI LOẠI XE NPC (BẤM F / CLICK / LASER) & DỰNG CABIN 3D RIÊNG BIỆT CHO 8 DÒNG XE
  // --------------------------------------------------------------------------
  const customVehicleCabinGroup = new THREE.Group();
  customVehicleCabinGroup.name = 'V22_CustomVehicleCabinGroup';
  customVehicleCabinGroup.userData.isV22CustomElement = true;

  const cabinSpeedCanvas = document.createElement('canvas');
  cabinSpeedCanvas.width = 256;
  cabinSpeedCanvas.height = 128;
  const cabinSpeedCtx = cabinSpeedCanvas.getContext('2d');
  const cabinSpeedTex = new THREE.CanvasTexture(cabinSpeedCanvas);

  let currentCabinType = 'ROLLS_ROYCE';
  let boardedNpcVehicleRef = null;

  const CABIN_CONFIGS = {
    ROLLS_ROYCE: {
      title: '👑 Rolls-Royce Phantom Bespoke',
      hideCarBody: false,
      seats: [
        { name: 'Ghế Tài Xế Rolls-Royce', pos: new THREE.Vector3(-0.38, 0.12, -0.02) },
        { name: 'Ghế Phụ Trước Rolls-Royce', pos: new THREE.Vector3(0.38, 0.12, -0.02) },
        { name: 'Ghế Chủ Tịch Sau Trái', pos: new THREE.Vector3(-0.38, 0.16, 0.88) },
        { name: 'Ghế Chủ Tịch Sau Phải', pos: new THREE.Vector3(0.38, 0.16, 0.88) }
      ]
    },
    BICYCLE: {
      title: '🚲 Xe Đạp Đường Phố (Ghi-đông Thoáng 360°)',
      hideCarBody: true,
      barColor: 0xadb5bd,
      accentColor: 0x00bbf9,
      seats: [
        { name: 'Yên Trước Xe Đạp (Cầm Ghi-đông)', pos: new THREE.Vector3(0, 0.08, -0.05) },
        { name: 'Yên Sau Gác Baga Xe Đạp (Ngắm Phố 360°)', pos: new THREE.Vector3(0, 0.04, 0.55) }
      ]
    },
    MOTORBIKE: {
      title: '🛵 Xe Máy Tay Ga SH / Vespa',
      hideCarBody: true,
      barColor: 0x2b2d42,
      accentColor: 0xffbe0b,
      seats: [
        { name: 'Yên Lái Xe Máy Tay Ga', pos: new THREE.Vector3(0, 0.10, -0.05) },
        { name: 'Yên Phụ Phía Sau Xe Máy', pos: new THREE.Vector3(0, 0.14, 0.52) }
      ]
    },
    SPORT_MOTO: {
      title: '🏍️ Siêu Mô Tô PKL Yamaha R1',
      hideCarBody: true,
      barColor: 0xd90429,
      accentColor: 0x00f5d4,
      seats: [
        { name: 'Yên Tay Đua Mô Tô R1 (Núp Gió)', pos: new THREE.Vector3(0, 0.06, -0.08) },
        { name: 'Yên Phụ Tầng Cao Mô Tô PKL', pos: new THREE.Vector3(0, 0.22, 0.48) }
      ]
    },
    TAXI: {
      title: '🚕 Taxi Thành Phố (Có Đồng Hồ Tính Tiền)',
      hideCarBody: false,
      bodyHex: 0xffbe0b,
      seatHex: 0x1e293b,
      seats: [
        { name: 'Ghế Tài Xế Taxi (Cầm Lái)', pos: new THREE.Vector3(-0.38, 0.12, -0.02) },
        { name: 'Ghế Phụ Trước Taxi (Cạnh Đồng Hồ Cước)', pos: new THREE.Vector3(0.38, 0.12, -0.02) },
        { name: 'Ghế Hành Khách Taxi Sau Trái', pos: new THREE.Vector3(-0.38, 0.16, 0.88) },
        { name: 'Ghế Hành Khách Taxi Sau Phải', pos: new THREE.Vector3(0.38, 0.16, 0.88) }
      ]
    },
    POLICE: {
      title: '🚓 Xe Cảnh Sát Tuần Tra (Radar & Còi Hú)',
      hideCarBody: false,
      bodyHex: 0x1d3557,
      seatHex: 0x0f172a,
      seats: [
        { name: 'Ghế Sĩ Quan Lái Xe Cảnh Sát', pos: new THREE.Vector3(-0.38, 0.12, -0.02) },
        { name: 'Ghế Sĩ Quan Phụ (Điều Khiển Máy Tính MDT)', pos: new THREE.Vector3(0.38, 0.12, -0.02) },
        { name: 'Khoang Sau Xe Cảnh Sát (Trái)', pos: new THREE.Vector3(-0.38, 0.16, 0.88) },
        { name: 'Khoang Sau Xe Cảnh Sát (Phải)', pos: new THREE.Vector3(0.38, 0.16, 0.88) }
      ]
    },
    AMBULANCE: {
      title: '🚑 Xe Cấp Cứu Y Tế 115 (Cabin Thùng Băng Ca & ECG)',
      hideCarBody: false,
      bodyHex: 0xf8fafc,
      seatHex: 0x06d6a0,
      seats: [
        { name: 'Ghế Tài Xế Cấp Cứu 115', pos: new THREE.Vector3(-0.38, 0.14, -0.02) },
        { name: 'Ghế Phụ Cabin Trước Cấp Cứu', pos: new THREE.Vector3(0.38, 0.14, -0.02) },
        { name: 'Ghế Bác Sĩ Cấp Cứu (Cạnh Băng Ca & Máy ECG)', pos: new THREE.Vector3(-0.55, 0.22, 1.05) },
        { name: 'Ghế Cuối Thùng Cấp Cứu (Nhìn Dọc Khoang Y Tế)', pos: new THREE.Vector3(0.0, 0.26, 1.75) }
      ]
    },
    FIRETRUCK: {
      title: '🚒 Xe Cứu Hỏa 114 (Cabin Chỉ Huy & Đài Phun Nước Nóc Xe)',
      hideCarBody: false,
      bodyHex: 0xd90429,
      seatHex: 0x9e2a2b,
      seats: [
        { name: 'Ghế Chỉ Huy Lái Xe Cứu Hỏa', pos: new THREE.Vector3(-0.40, 0.18, -0.02) },
        { name: 'Ghế Phụ Khoang Trước Cứu Hỏa', pos: new THREE.Vector3(0.40, 0.18, -0.02) },
        { name: 'Ghế Lính Cứu Hỏa Khoang Sau', pos: new THREE.Vector3(-0.52, 0.24, 0.98) },
        { name: 'Đài Ngồi Nóc Vòi Rồng Xịt Nước 360°', pos: new THREE.Vector3(0.0, 1.25, -0.15) }
      ]
    },
    BUS: {
      title: '🚌 Xe Bus Thành Phố (2 Dãy Ghế Hành Khách & Ghế Cuối Xe)',
      hideCarBody: false,
      bodyHex: 0x0077b6,
      seatHex: 0xffbe0b,
      seats: [
        { name: 'Ghế Tài Xế Xe Bus', pos: new THREE.Vector3(-0.42, 0.18, -0.05) },
        { name: 'Ghế Hành Khách Dãy Trái Xe Bus', pos: new THREE.Vector3(-0.62, 0.24, 0.92) },
        { name: 'Ghế Hành Khách Dãy Phải Xe Bus', pos: new THREE.Vector3(0.62, 0.24, 0.92) },
        { name: 'Ghế Cao Cuối Dãy Xe Bus (Nhìn Dọc Lối Đi)', pos: new THREE.Vector3(0.0, 0.34, 2.15) }
      ]
    }
  };

  function findTrafficVehicleFromChild(obj) {
    let cur = obj;
    while (cur) {
      if (typeof allTrafficVehicles !== 'undefined' && Array.isArray(allTrafficVehicles) && allTrafficVehicles.includes(cur)) {
        return cur;
      }
      if (cur.userData && (cur.userData.isTrafficVehicle || cur.userData.category || cur.userData.vehicleType)) {
        return cur;
      }
      cur = cur.parent;
    }
    return null;
  }

  function detectCabinTypeFromVehicle(veh) {
    if (!veh) return 'ROLLS_ROYCE';
    const ud = veh.userData || {};
    const raw = `${ud.category || ''} ${ud.vehicleType || ''} ${ud.modelName || ''} ${veh.name || ''}`.toUpperCase();
    if (raw.includes('BICYCLE') || raw.includes('BIKE') || raw.includes('XE ĐẠP')) return 'BICYCLE';
    if (raw.includes('R1') || raw.includes('PKL') || raw.includes('SPORT_MOTO')) return 'SPORT_MOTO';
    if (raw.includes('MOTO') || raw.includes('SCOOTER') || raw.includes('XE MÁY')) return 'MOTORBIKE';
    if (raw.includes('AMBULANCE') || raw.includes('CẤP CỨU')) return 'AMBULANCE';
    if (raw.includes('FIRE') || raw.includes('CỨU HỎA')) return 'FIRETRUCK';
    if (raw.includes('POLICE') || raw.includes('CẢNH SÁT')) return 'POLICE';
    if (raw.includes('BUS') || raw.includes('BUÝT')) return 'BUS';
    if (raw.includes('TAXI')) return 'TAXI';
    return 'TAXI';
  }

  function buildDedicated3DCabinMeshes(cabinType) {
    const rootCar = (typeof chassisGroup !== 'undefined' && chassisGroup)
      ? chassisGroup
      : (typeof vehicleRoot !== 'undefined' ? vehicleRoot : null);
    if (!rootCar) return;

    if (!customVehicleCabinGroup.parent) {
      rootCar.add(customVehicleCabinGroup);
    }
    while (customVehicleCabinGroup.children.length > 0) {
      customVehicleCabinGroup.remove(customVehicleCabinGroup.children[0]);
    }

    const cfg = CABIN_CONFIGS[cabinType] || CABIN_CONFIGS.ROLLS_ROYCE;

    // Nếu là Xe 2 Bánh (Xe Đạp / Xe Máy / Mô Tô R1): Ẩn khung vỏ ô tô và dựng Ghi-đông 2 bánh + Gương + Màn hình mini
    rootCar.children.forEach((ch) => {
      if (ch === customVehicleCabinGroup || ch === driverSeatMount) return;
      if (cfg.hideCarBody) {
        ch.visible = false;
      } else {
        ch.visible = true;
      }
    });

    if (cfg.hideCarBody) {
      const barMat = new THREE.MeshStandardMaterial({ color: cfg.barColor || 0xadb5bd, metalness: 0.7, roughness: 0.25 });
      const accMat = new THREE.MeshStandardMaterial({ color: cfg.accentColor || 0x00bbf9, roughness: 0.3 });

      // Ghi-đông tay lái 2 bánh
      const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.68, 12), barMat);
      handlebar.rotation.z = Math.PI / 2;
      handlebar.position.set(0, 0.56, -0.42);
      customVehicleCabinGroup.add(handlebar);

      // 2 Bao tay cầm trái/phải + 2 Gương chiếu hậu
      [-0.32, 0.32].forEach((gx) => {
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        grip.rotation.z = Math.PI / 2;
        grip.position.set(gx, 0.56, -0.42);
        const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), barMat);
        mirrorStem.position.set(gx, 0.65, -0.44);
        const mirrorHead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), accMat);
        mirrorHead.scale.set(1.2, 0.8, 0.3);
        mirrorHead.position.set(gx * 1.15, 0.73, -0.45);
        customVehicleCabinGroup.add(grip, mirrorStem, mirrorHead);
      });

      // Đồng hồ tốc độ Digital chính giữa ghi-đông
      const dashScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.095),
        new THREE.MeshBasicMaterial({ map: cabinSpeedTex, side: THREE.DoubleSide })
      );
      dashScreen.position.set(0, 0.62, -0.44);
      dashScreen.rotation.x = -0.35;
      customVehicleCabinGroup.add(dashScreen);

      // Màn hình YouTube mini gắn trên ghi-đông
      const ytMini = new THREE.Mesh(
        new THREE.PlaneGeometry(0.20, 0.115),
        new THREE.MeshBasicMaterial({ map: v22YtTex, side: THREE.DoubleSide })
      );
      ytMini.position.set(0.16, 0.64, -0.42);
      ytMini.rotation.x = -0.3;
      ytMini.userData = { isV22CustomElement: true, onClick: () => openYouTubeModalSafely() };
      customVehicleCabinGroup.add(ytMini);

      // Kính chắn gió núp gió cho Mô Tô R1 hoặc Giỏ xe cho Xe Đạp
      if (cabinType === 'BICYCLE') {
        const basket = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.24), new THREE.MeshStandardMaterial({ color: 0x8d5524, wireframe: true }));
        basket.position.set(0, 0.42, -0.58);
        customVehicleCabinGroup.add(basket);
      } else {
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.38, 8, 12), accMat);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(0, 0.38, -0.18);
        customVehicleCabinGroup.add(tank);
      }

      // Yên trước & Yên phụ phía sau
      const frontSaddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.34), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      frontSaddle.position.set(0, 0.32, 0.05);
      const rearSaddle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.32), accMat);
      rearSaddle.position.set(0, 0.36, 0.52);
      customVehicleCabinGroup.add(frontSaddle, rearSaddle);
      return;
    }

    // Nếu là Ô tô / Xe chuyên dụng (Taxi, Cảnh Sát, Cấp Cứu, Cứu Hỏa, Xe Bus): Đổi màu sơn + ghế + gắn thiết bị đặc trưng trong Cabin
    if (cfg.bodyHex && typeof matBodyPaint !== 'undefined') matBodyPaint.color.setHex(cfg.bodyHex);
    if (cfg.seatHex && typeof matNappa !== 'undefined') matNappa.color.setHex(cfg.seatHex);

    // Màn hình Digital Speedometer + Thiết bị chuyên dụng ngay trên táp-lô trước vô lăng
    const clusterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.12),
      new THREE.MeshBasicMaterial({ map: cabinSpeedTex, side: THREE.DoubleSide })
    );
    clusterMesh.position.set(-0.38, 0.67, -0.39);
    customVehicleCabinGroup.add(clusterMesh);

    if (cabinType === 'TAXI') {
      // Đồng hồ tính tiền Taximeter + Biển TAXI phát sáng trên táp-lô
      const taximeter = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      taximeter.position.set(0.05, 0.72, -0.38);
      const roofSign = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.18), new THREE.MeshBasicMaterial({ color: 0xffbe0b }));
      roofSign.position.set(0, 1.42, -0.1);
      customVehicleCabinGroup.add(taximeter, roofSign);
    } else if (cabinType === 'POLICE') {
      // Màn hình Radar Cảnh Sát MDT + Đèn chớp Xanh Đỏ
      const mdtLaptop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.03), new THREE.MeshBasicMaterial({ color: 0x00bbf9 }));
      mdtLaptop.position.set(0.12, 0.68, -0.32);
      mdtLaptop.rotation.y = -0.35;
      const lightbarL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.09, 0.18), new THREE.MeshBasicMaterial({ color: 0x0055ff }));
      lightbarL.position.set(-0.25, 1.42, 0);
      const lightbarR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.09, 0.18), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
      lightbarR.position.set(0.25, 1.42, 0);
      customVehicleCabinGroup.add(mdtLaptop, lightbarL, lightbarR);
    } else if (cabinType === 'AMBULANCE') {
      // Băng ca cấp cứu + Máy đo nhịp tim ECG + Bình Oxy trong thùng sau
      const stretcher = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.36, 1.45), new THREE.MeshStandardMaterial({ color: 0xff4d6d }));
      stretcher.position.set(0.05, 0.38, 1.15);
      const ecgMonitor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.12), new THREE.MeshBasicMaterial({ color: 0x06d6a0 }));
      ecgMonitor.position.set(0.55, 0.82, 0.95);
      customVehicleCabinGroup.add(stretcher, ecgMonitor);
    } else if (cabinType === 'FIRETRUCK') {
      // Đài vòi rồng phun nước trên nóc xe cứu hỏa + Bình chữa cháy đỏ
      const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.35, 12), new THREE.MeshStandardMaterial({ color: 0xd90429 }));
      turretBase.position.set(0, 1.55, -0.55);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.75, 12), new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.8 }));
      nozzle.rotation.x = Math.PI / 2 - 0.2;
      nozzle.position.set(0, 1.72, -0.85);
      customVehicleCabinGroup.add(turretBase, nozzle);
    } else if (cabinType === 'BUS') {
      // Hộp soát vé xe Bus + Tay vịn màu vàng dọc khoang hành khách
      const ticketBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.22), new THREE.MeshStandardMaterial({ color: 0xffbe0b }));
      ticketBox.position.set(0.52, 0.48, -0.25);
      customVehicleCabinGroup.add(ticketBox);
    }
  }

  function boardNpcVehicleWithCustomCabin(targetVeh, forcedCabinType) {
    const chosenType = forcedCabinType || detectCabinTypeFromVehicle(targetVeh);
    currentCabinType = chosenType;
    boardedNpcVehicleRef = targetVeh || null;

    if (targetVeh && typeof vehicleRoot !== 'undefined' && vehicleRoot) {
      vehicleRoot.position.copy(targetVeh.position);
      vehicleRoot.rotation.y = targetVeh.rotation.y;
      if (typeof state !== 'undefined') {
        state.headingRad = targetVeh.rotation.y;
        state.playerMode = 'DRIVING';
        state.seatIndex = 0;
      }
    } else if (typeof state !== 'undefined' && state.playerMode !== 'DRIVING') {
      if (typeof window.enterOrExitCarWithBlink === 'function') window.enterOrExitCarWithBlink();
      state.playerMode = 'DRIVING';
    }

    buildDedicated3DCabinMeshes(chosenType);
    applySeatPositionForCurrentCabin(0);

    const cfg = CABIN_CONFIGS[chosenType] || CABIN_CONFIGS.ROLLS_ROYCE;
    const badge = document.getElementById('func-target-badge');
    if (badge) badge.textContent = cfg.title;
    if (typeof state !== 'undefined') {
      state.lastActionLog = `🚘 Đã lên [${cfg.title}]! Bấm phím [V] để trải nghiệm các góc nhìn Ghế Phụ của xe này!`;
    }
  }

  function applySeatPositionForCurrentCabin(seatIdx) {
    const cfg = CABIN_CONFIGS[currentCabinType] || CABIN_CONFIGS.ROLLS_ROYCE;
    const seats = cfg.seats || CABIN_CONFIGS.ROLLS_ROYCE.seats;
    const validIdx = ((seatIdx % seats.length) + seats.length) % seats.length;

    if (typeof state !== 'undefined') state.seatIndex = validIdx;
    const targetSeat = seats[validIdx];

    if (typeof driverSeatMount !== 'undefined' && driverSeatMount) {
      driverSeatMount.position.copy(targetSeat.pos);
    }
    if (typeof SEAT_POSITIONS !== 'undefined' && SEAT_POSITIONS[validIdx]) {
      SEAT_POSITIONS[validIdx].pos.copy(targetSeat.pos);
    }
    if (typeof state !== 'undefined') {
      state.lastActionLog = `💺 [${cfg.title}] -> Đang ngồi tại: ${targetSeat.name}`;
    }
  }

  // Ghi đè phím F (ở gần xe NPC nào sẽ lên đúng xe NPC đó!) và phím V (đổi qua các ghế của loại xe hiện tại)
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();

    if (k === 'f') {
      if (typeof state !== 'undefined' && state.playerMode === 'ON_FOOT' && typeof allTrafficVehicles !== 'undefined') {
        let closestVeh = null;
        let minDist = 14.0; // Bán kính 14m quanh người chơi
        for (const v of allTrafficVehicles) {
          if (!v || !v.visible) continue;
          const d = v.position.distanceTo(state.avatarPos);
          if (d < minDist) {
            minDist = d;
            closestVeh = v;
          }
        }
        if (closestVeh) {
          e.stopImmediatePropagation();
          e.preventDefault();
          boardNpcVehicleWithCustomCabin(closestVeh);
          return;
        }
      }
    } else if (k === 'v') {
      e.stopImmediatePropagation();
      e.preventDefault();
      const nextSeat = ((typeof state !== 'undefined' ? state.seatIndex : 0) + 1);
      applySeatPositionForCurrentCabin(nextSeat);
    }
  }, true);

  // --------------------------------------------------------------------------
  // 5. XÓA 2 LỚP KÍNH CHỒNG NHAU TRÊN CỬA GARA (CHỈ GIỮ 1 CỬA CUỐN KÍNH SẠCH SẼ)
  // --------------------------------------------------------------------------
  let singleGarageDoorMesh = null;
  let singleGarageDoorOpen = false;

  function cleanAndRebuildSingleGarageDoor() {
    if (typeof scene === 'undefined' || !scene) return;

    // Tìm tọa độ của Gara hiện tại và ẩn toàn bộ các tấm kính cũ + chữ bị chồng đè
    let garageCenter = new THREE.Vector3(-28, 0, 22);
    scene.traverse((obj) => {
      if (!obj || obj === singleGarageDoorMesh || obj.userData?.isV22GarageElement) return;
      const nm = (obj.name || '').toLowerCase();
      const ud = obj.userData || {};

      // Phát hiện các tấm kính cửa Gara cũ (kính phẳng và kính nếp khúc cũ đang đè nhau)
      if (
        nm.includes('garagedoor') ||
        nm.includes('cua_gara') ||
        ud.isGarageDoor ||
        ud.isGarageGlass
      ) {
        obj.getWorldPosition(garageCenter);
        obj.visible = false;
        obj.scale.set(0, 0, 0);
      }

      // Tìm các tấm kính lớn trong suốt có chứa các thanh sọc ngang hoặc chữ đè ở Gara
      if (obj.isMesh && obj.material && obj.material.transparent && obj.material.opacity < 0.75) {
        const box = new THREE.Box3().setFromObject(obj);
        const sz = new THREE.Vector3();
        box.getSize(sz);
        if (sz.x > 6.5 && sz.y > 2.8 && sz.z < 0.8) {
          const wp = new THREE.Vector3();
          obj.getWorldPosition(wp);
          garageCenter.copy(wp);
          obj.visible = false;
          obj.scale.set(0, 0, 0);
          // Ẩn luôn các thanh nếp khúc con hoặc Sprite chữ con gắn chung với tấm kính cũ đó
          if (obj.parent) {
            obj.parent.children.forEach((sib) => {
              if (sib.isSprite || (sib.isMesh && sib.position.y > 0.5 && Math.abs(sib.position.z - obj.position.z) < 0.45)) {
                if (sib.geometry?.type === 'BoxGeometry' && sib.scale.x < 2) return; // Giữ siêu xe trưng bày bên trong
                if (sib.isSprite || (sib.material && sib.material.transparent)) {
                  sib.visible = false;
                }
              }
            });
          }
        }
      }
    });

    if (!singleGarageDoorMesh) {
      // Vẽ duy nhất 1 Texture cửa cuốn kính nếp khúc sạch sẽ, chữ tách dòng rõ nét không đè nhau
      const gCanvas = document.createElement('canvas');
      gCanvas.width = 1024;
      gCanvas.height = 512;
      const gCtx = gCanvas.getContext('2d');

      gCtx.fillStyle = 'rgba(16, 185, 212, 0.26)';
      gCtx.fillRect(0, 0, 1024, 512);

      // Các đường nếp gấp cửa cuốn ngang thanh mảnh
      gCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      gCtx.lineWidth = 3;
      for (let y = 64; y < 512; y += 64) {
        gCtx.beginPath();
        gCtx.moveTo(0, y);
        gCtx.lineTo(1024, y);
        gCtx.stroke();
      }

      // Dòng 1: ★ TOÀN ★
      gCtx.font = 'bold 92px Segoe UI, sans-serif';
      gCtx.textAlign = 'center';
      gCtx.shadowColor = '#ff4d6d';
      gCtx.shadowBlur = 18;
      gCtx.fillStyle = '#ffd166';
      gCtx.fillText('★ TOÀN ★', 512, 210);

      // Dòng 2: Tách biệt hoàn toàn phía dưới (Không bao giờ đè chữ!)
      gCtx.shadowBlur = 8;
      gCtx.font = 'bold 28px Segoe UI, sans-serif';
      gCtx.fillStyle = '#ffffff';
      gCtx.fillText('👑 VIP SUPERCAR COLLECTION  |  CỬA KÍNH CẢM BIẾN TỰ ĐỘNG 👑', 512, 310);

      const gTex = new THREE.CanvasTexture(gCanvas);
      if (THREE.SRGBColorSpace) gTex.colorSpace = THREE.SRGBColorSpace;

      singleGarageDoorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(10.6, 4.2, 0.08),
        new THREE.MeshBasicMaterial({ map: gTex, transparent: true, opacity: 0.88, side: THREE.DoubleSide })
      );
      singleGarageDoorMesh.position.set(garageCenter.x, 2.15, garageCenter.z);
      singleGarageDoorMesh.userData.isV22GarageElement = true;
      scene.add(singleGarageDoorMesh);
    }
  }

  // --------------------------------------------------------------------------
  // 6. HỆ THỐNG ĐÈN GIAO THÔNG NGÃ TƯ, ĐÈN ĐƯỜNG & 12 HOẠT CẢNH NPC SỐNG ĐỘNG
  // --------------------------------------------------------------------------
  const v22EcosystemGroup = new THREE.Group();
  v22EcosystemGroup.name = 'V22_LivingCityEcosystem';
  let v22NpcsHidden = false;
  const v22TrafficLights = [];
  const v22AnimatedActors = [];

  function createLegoFaceMat(bgHex = '#ffcf40') {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(44, 52, 7, 0, Math.PI * 2);
    ctx.arc(84, 52, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(64, 72, 18, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({ map: tex });
  }

  const sharedLegoHeadMat = createLegoFaceMat();

  function createFullLegoHuman(shirtColor = 0x00bbf9, pantsColor = 0x1d3557, scale = 1.0) {
    const human = new THREE.Group();
    const sMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.4 });
    const pMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.5 });
    const yMat = new THREE.MeshStandardMaterial({ color: 0xffcf40, roughness: 0.3 });

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.45, 0.14), pMat);
    leftLeg.position.set(-0.08, 0.225, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.45, 0.14), pMat);
    rightLeg.position.set(0.08, 0.225, 0);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.46, 0.18), sMat);
    torso.position.set(0, 0.68, 0);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.40, 0.10), yMat);
    leftArm.position.set(-0.22, 0.68, 0);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.40, 0.10), yMat);
    rightArm.position.set(0.22, 0.68, 0);

    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 16), sharedLegoHeadMat);
    head.position.set(0, 1.06, 0);
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), yMat);
    stud.position.set(0, 1.21, 0);

    human.add(leftLeg, rightLeg, torso, leftArm, rightArm, head, stud);
    human.scale.setScalar(scale);
    human.userData.limbs = { leftLeg, rightLeg, leftArm, rightArm };
    return human;
  }

  function create3DPetModel(colorHex = 0xe09f3e) {
    const pet = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.44), mat);
    body.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.20), mat);
    head.position.set(0, 0.34, 0.22);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.18, 6), mat);
    tail.position.set(0, 0.32, -0.24);
    tail.rotation.x = -0.6;
    const legs = [];
    [[-0.08, -0.15], [0.08, -0.15], [-0.08, 0.15], [0.08, 0.15]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), mat);
      leg.position.set(lx, 0.08, lz);
      pet.add(leg);
      legs.push(leg);
    });
    pet.add(body, head, tail);
    pet.userData = { tail, legs };
    return pet;
  }

  function buildTrafficLightsStreetLampsAnd12NpcActivities() {
    if (typeof scene === 'undefined' || !scene || v22EcosystemGroup.parent) return;
    scene.add(v22EcosystemGroup);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });

    // A. ĐÈN GIAO THÔNG 4 GÓC NGÃ TƯ (Đặt ngay tại ngã tư trung tâm (0,0) và các ngã tư (±55, ±55) ở mép vỉa hè ±14.2m)
    const crossCoords = [[0, 0], [-55, 0], [55, 0], [0, -55], [0, 55]];
    const corners = [
      { dx: -14.2, dz: -14.2, rotY: 0 },
      { dx: 14.2,  dz: -14.2, rotY: -Math.PI / 2 },
      { dx: 14.2,  dz: 14.2,  rotY: Math.PI },
      { dx: -14.2, dz: 14.2,  rotY: Math.PI / 2 }
    ];

    crossCoords.forEach(([cx, cz]) => {
      corners.forEach((cn) => {
        const tl = new THREE.Group();
        tl.position.set(cx + cn.dx, 0, cz + cn.dz);
        tl.rotation.y = cn.rotY;

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5.0, 10), poleMat);
        pole.position.y = 2.5;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.12), poleMat);
        arm.position.set(1.2, 4.8, 0);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.18, 0.32), housingMat);
        box.position.set(2.2, 4.45, 0);

        const rBulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff1100 }));
        rBulb.position.set(2.2, 4.82, 0.16);
        const yBulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshBasicMaterial({ color: 0x332400 }));
        yBulb.position.set(2.2, 4.45, 0.16);
        const gBulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshBasicMaterial({ color: 0x003311 }));
        gBulb.position.set(2.2, 4.08, 0.16);

        tl.add(pole, arm, box, rBulb, yBulb, gBulb);
        v22EcosystemGroup.add(tl);
        v22TrafficLights.push({ rBulb, yBulb, gBulb });
      });
    });

    // B. ĐÈN ĐƯỜNG CAO ÁP DỌC 2 BÊN ĐẠI LỘ (Từ -90m đến +90m)
    for (let d = -84; d <= 84; d += 24) {
      if (Math.abs(d) < 15) continue;
      [-14.2, 14.2].forEach((side) => {
        const lamp = new THREE.Group();
        lamp.position.set(side, 0, d);
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), poleMat);
        p.position.y = 2.7;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), poleMat);
        arm.position.set(side > 0 ? -0.5 : 0.5, 5.3, 0);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe699 }));
        bulb.position.set(side > 0 ? -1.0 : 1.0, 5.2, 0);
        lamp.add(p, arm, bulb);
        v22EcosystemGroup.add(lamp);
      });
    }

    // C. 12 HOẠT CẢNH NPC SỐNG ĐỘNG TRÊN VỈA HÈ & CÔNG VIÊN
    // 1. NPC Đi bộ dắt Pet (Chó/Mèo có dây xích)
    for (let i = 0; i < 4; i++) {
      const walkerGroup = new THREE.Group();
      const sideX = i % 2 === 0 ? -14.8 : 14.8;
      walkerGroup.position.set(sideX, 0, -35 + i * 22);
      const human = createFullLegoHuman(0x00bbf9, 0x1e293b);
      const pet = create3DPetModel(i % 2 === 0 ? 0xe09f3e : 0xf8fafc);
      pet.position.set(0, 0, 1.15);
      // Dây xích nối tay NPC tới cổ Pet
      const leashGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.22, 0.68, 0),
        new THREE.Vector3(0, 0.30, 1.05)
      ]);
      const leash = new THREE.Line(leashGeo, new THREE.LineBasicMaterial({ color: 0xffd166 }));
      walkerGroup.add(human, pet, leash);
      v22EcosystemGroup.add(walkerGroup);
      v22AnimatedActors.push({ type: 'DOG_WALKER', group: walkerGroup, human, pet, dir: i % 2 === 0 ? 1 : -1, speed: 2.2 });
    }

    // 2. NPC Chạy bộ thể thao (Joggers)
    for (let i = 0; i < 4; i++) {
      const jogger = createFullLegoHuman(0x06d6a0, 0x0f172a);
      jogger.position.set(-30 + i * 20, 0, i % 2 === 0 ? -14.8 : 14.8);
      jogger.rotation.y = Math.PI / 2;
      v22EcosystemGroup.add(jogger);
      v22AnimatedActors.push({ type: 'JOGGER', group: jogger, human: jogger, dir: i % 2 === 0 ? 1 : -1, speed: 4.6 });
    }

    // 3. Kịch bản Ăn Cướp & Chó Nghiệp Vụ Đuổi Bắt Cướp
    const chaseGroup = new THREE.Group();
    chaseGroup.position.set(15.2, 0, -18);
    const robber = createFullLegoHuman(0x111111, 0x222222);
    const lootBag = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffd166 }));
    lootBag.position.set(0.26, 0.65, 0.12);
    robber.add(lootBag);
    const policeNpc = createFullLegoHuman(0x1d3557, 0x0f172a);
    policeNpc.position.set(0, 0, -2.4);
    const policeDog = create3DPetModel(0x8d5524);
    policeDog.position.set(0.35, 0, -1.2);
    chaseGroup.add(robber, policeNpc, policeDog);
    v22EcosystemGroup.add(chaseGroup);
    v22AnimatedActors.push({ type: 'ROBBER_CHASE', group: chaseGroup, robber, policeNpc, policeDog, dir: 1, speed: 5.2 });

    // 4. Trẻ Em Vui Đùa Chạy Nhảy Cầm Bóng Bay Ở Công Viên
    for (let i = 0; i < 5; i++) {
      const kid = createFullLegoHuman(0xff758f + i * 0x112200, 0x3a86ff, 0.68);
      const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff4d6d : 0x00f5d4 }));
      balloon.position.set(0.25, 1.85, 0);
      kid.add(balloon);
      kid.position.set(22 + Math.cos(i) * 4, 0, -22 + Math.sin(i) * 4);
      v22EcosystemGroup.add(kid);
      v22AnimatedActors.push({ type: 'PARK_KID', group: kid, human: kid, centerX: 22, centerZ: -22, angle: i * 1.25, radius: 3.5 + (i % 2) });
    }

    // 5. Nhóm NPC Tụ Tập Nhảy Vũ Đạo Đường Phố (Street Dancers)
    const danceSpot = new THREE.Group();
    danceSpot.position.set(-20, 0, -16);
    const boombox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.25), new THREE.MeshStandardMaterial({ color: 0xff0055 }));
    boombox.position.y = 0.16;
    danceSpot.add(boombox);
    const dancers = [];
    for (let d = 0; d < 3; d++) {
      const dancer = createFullLegoHuman(0x9b5de5 + d * 0x223300, 0x111111);
      dancer.position.set(-0.9 + d * 0.9, 0, 0.8);
      danceSpot.add(dancer);
      dancers.push(dancer);
    }
    v22EcosystemGroup.add(danceSpot);
    v22AnimatedActors.push({ type: 'DANCERS', group: danceSpot, dancers });

    // 6. Nhóm NPC Tụ Tập Uống Cafe & Ăn Uống Trò Chuyện
    [[-18, 18], [18, 18]].forEach(([tx, tz]) => {
      const cafeSet = new THREE.Group();
      cafeSet.position.set(tx, 0, tz);
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
      table.position.y = 0.68;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.68, 8), poleMat);
      leg.position.y = 0.34;
      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xe63946 }));
      umbrella.position.y = 2.15;
      const guest1 = createFullLegoHuman(0xf4a261, 0x264653);
      guest1.position.set(-0.68, 0, 0);
      guest1.rotation.y = Math.PI / 2;
      const guest2 = createFullLegoHuman(0x2a9d8f, 0x1d3557);
      guest2.position.set(0.68, 0, 0);
      guest2.rotation.y = -Math.PI / 2;
      cafeSet.add(table, leg, umbrella, guest1, guest2);
      v22EcosystemGroup.add(cafeSet);
      v22AnimatedActors.push({ type: 'CAFE_GUESTS', group: cafeSet, guests: [guest1, guest2] });
    });

    // 7. Trạm Chờ Xe Bus (Bus Stop) & Xe Bus Tự Động Dừng Đón/Trả Khách Có Hoạt Cảnh Lên Xuống Xe
    const busStopGroup = new THREE.Group();
    busStopGroup.position.set(-14.6, 0, 26);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 3.4), new THREE.MeshStandardMaterial({ color: 0x0077b6 }));
    roof.position.y = 2.45;
    const backGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 3.2), new THREE.MeshBasicMaterial({ color: 0x90e0ef, transparent: true, opacity: 0.4 }));
    backGlass.position.set(-0.7, 1.2, 0);
    const waitingPassenger1 = createFullLegoHuman(0xffbe0b, 0x1d3557);
    waitingPassenger1.position.set(0.2, 0, -0.6);
    waitingPassenger1.rotation.y = Math.PI / 2;
    const waitingPassenger2 = createFullLegoHuman(0x06d6a0, 0x1d3557);
    waitingPassenger2.position.set(0.2, 0, 0.6);
    waitingPassenger2.rotation.y = Math.PI / 2;
    busStopGroup.add(roof, backGlass, waitingPassenger1, waitingPassenger2);
    v22EcosystemGroup.add(busStopGroup);

    // Chiếc Xe Bus tuyến cố định dừng đón/trả khách tại Trạm
    const shuttleBus = new THREE.Group();
    shuttleBus.position.set(-10.2, 0, -15);
    shuttleBus.userData = { isTrafficVehicle: true, category: 'BUS', modelName: 'Xe Bus Thành Phố Đón Khách' };
    const busBody = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.85, 5.6), new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.3 }));
    busBody.position.y = 1.15;
    const busWin = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.65, 4.8), new THREE.MeshBasicMaterial({ color: 0x90e0ef, transparent: true, opacity: 0.55 }));
    busWin.position.y = 1.45;
    const boardingPax = createFullLegoHuman(0xff006e, 0x111111);
    boardingPax.position.set(-1.35, 0, 0);
    boardingPax.visible = false;
    shuttleBus.add(busBody, busWin, boardingPax);
    v22EcosystemGroup.add(shuttleBus);
    if (typeof allTrafficVehicles !== 'undefined' && Array.isArray(allTrafficVehicles)) {
      allTrafficVehicles.push(shuttleBus);
    }
    v22AnimatedActors.push({
      type: 'SHUTTLE_BUS',
      bus: shuttleBus,
      boardingPax,
      waitingPax: [waitingPassenger1, waitingPassenger2],
      stopZ: 26,
      dwellTimer: 0,
      state: 'MOVING'
    });
  }

  // --------------------------------------------------------------------------
  // 7. THANH CHỌN NHANH 9 LOẠI XE TRONG LIQUID WIDGET & BẢNG CHỨC NĂNG
  // --------------------------------------------------------------------------
  function injectAllVehicleCabinsSelectorUI() {
    const gearList = document.getElementById('liquid-gear-menu-list');
    const gearBtn = document.getElementById('liquid-gear-trigger-btn');

    if (gearList && !document.getElementById('v22-all-vehicles-liquid-grid')) {
      const box = document.createElement('div');
      box.id = 'v22-all-vehicles-liquid-grid';
      box.style.cssText = 'border-top:1px solid rgba(0,245,212,0.3);margin-top:6px;padding-top:8px;';
      box.innerHTML = `
        <div style="font-size:11px;color:#ffd166;font-weight:800;margin-bottom:6px;">🚘 LÊN THỬ TẤT CẢ CABIN XE NPC (F / CLICK):</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <button class="liquid-item-btn" data-v22-cabin="BICYCLE" style="padding:6px 8px;margin:0;font-size:11px;">🚲 Xe Đạp</button>
          <button class="liquid-item-btn" data-v22-cabin="MOTORBIKE" style="padding:6px 8px;margin:0;font-size:11px;">🛵 Xe Máy</button>
          <button class="liquid-item-btn" data-v22-cabin="SPORT_MOTO" style="padding:6px 8px;margin:0;font-size:11px;">🏍️ Mô Tô R1</button>
          <button class="liquid-item-btn" data-v22-cabin="TAXI" style="padding:6px 8px;margin:0;font-size:11px;">🚕 Xe Taxi</button>
          <button class="liquid-item-btn" data-v22-cabin="POLICE" style="padding:6px 8px;margin:0;font-size:11px;">🚓 Cảnh Sát</button>
          <button class="liquid-item-btn" data-v22-cabin="AMBULANCE" style="padding:6px 8px;margin:0;font-size:11px;">🚑 Cấp Cứu</button>
          <button class="liquid-item-btn" data-v22-cabin="FIRETRUCK" style="padding:6px 8px;margin:0;font-size:11px;">🚒 Cứu Hỏa</button>
          <button class="liquid-item-btn" data-v22-cabin="BUS" style="padding:6px 8px;margin:0;font-size:11px;">🚌 Xe Bus</button>
        </div>
      `;
      gearList.appendChild(box);

      box.querySelectorAll('[data-v22-cabin]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cType = btn.getAttribute('data-v22-cabin');
          box.querySelectorAll('[data-v22-cabin]').forEach((b) => b.classList.remove('active-true'));
          btn.classList.add('active-true');
          boardNpcVehicleWithCustomCabin(null, cType);
        });
      });
    }

    // Đảm bảo mặc định danh sách Liquid Widget đóng gọn, chỉ mở khi bấm nút bánh răng ⚙️
    if (gearList && gearBtn && !gearBtn.dataset.v22CleanInit) {
      gearBtn.dataset.v22CleanInit = 'true';
      gearList.classList.remove('liquid-expanded');
      gearBtn.classList.remove('liquid-open');
    }
  }

  // --------------------------------------------------------------------------
  // 8. HOOK VÀO scene.onBeforeRender ĐỂ CHẠY ĐỒNG BỘ MỖI FRAME (KHÔNG BỊ CODE CŨ GHI ĐÈ)
  // --------------------------------------------------------------------------
  let v22Clock = 0;
  let v22LastNow = performance.now();

  function installV22RenderHook() {
    if (typeof scene === 'undefined' || !scene || scene.userData.v22HookInstalled) return;
    scene.userData.v22HookInstalled = true;

    const prevOnBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (rendererInst, sceneInst, cameraInst) {
      if (typeof prevOnBeforeRender === 'function') {
        try { prevOnBeforeRender(rendererInst, sceneInst, cameraInst); } catch (e) {}
      }

      // Luôn khóa vị trí vô lăng, xóa trục vô lăng & xóa NPC thừa dính trong xe ngay trước khi vẽ frame!
      enforceSteeringWheelPositionAndRemoveShaftEveryFrame();
      purgePassenger3DMenuAndStuckCabinNpcLimbsEveryFrame();
    };
  }

  function animateV22WorldLoop() {
    requestAnimationFrame(animateV22WorldLoop);
    const now = performance.now();
    const dt = Math.min((now - v22LastNow) / 1000, 0.1);
    v22LastNow = now;
    v22Clock += dt;

    try {
      enforceSteeringWheelPositionAndRemoveShaftEveryFrame();
      purgePassenger3DMenuAndStuckCabinNpcLimbsEveryFrame();
      updateSyncedThreeScreensCanvas();

      // Cập nhật màn hình Digital Speedometer trong Cabin của từng loại xe
      cabinSpeedCtx.fillStyle = '#06101e';
      cabinSpeedCtx.fillRect(0, 0, 256, 128);
      cabinSpeedCtx.strokeStyle = '#00f5d4';
      cabinSpeedCtx.lineWidth = 4;
      cabinSpeedCtx.strokeRect(4, 4, 248, 120);
      const spd = Math.abs(Math.round((typeof state !== 'undefined' ? state.speedKmh : 0) || 0));
      cabinSpeedCtx.fillStyle = '#00ff88';
      cabinSpeedCtx.font = 'bold 44px monospace';
      cabinSpeedCtx.fillText(`${spd} KM/H`, 26, 64);
      cabinSpeedCtx.fillStyle = '#ffd166';
      cabinSpeedCtx.font = 'bold 16px Segoe UI, sans-serif';
      cabinSpeedCtx.fillText(currentCabinType, 26, 102);
      cabinSpeedTex.needsUpdate = true;

      // Chu kỳ Đèn Giao Thông (Xanh 8s -> Vàng 2s -> Đỏ 8s)
      const tlPhase = v22Clock % 18;
      const gOn = tlPhase < 8;
      const yOn = tlPhase >= 8 && tlPhase < 10;
      const rOn = tlPhase >= 10;
      for (let i = 0; i < v22TrafficLights.length; i++) {
        const tl = v22TrafficLights[i];
        tl.gBulb.material.color.setHex(gOn ? 0x00ff66 : 0x002b11);
        tl.yBulb.material.color.setHex(yOn ? 0xffd100 : 0x332400);
        tl.rBulb.material.color.setHex(rOn ? 0xff1e00 : 0x330500);
      }

      // Cập nhật 12 Hoạt Cảnh NPC Sống Động
      const swing = Math.sin(v22Clock * 7.5) * 0.55;
      for (const act of v22AnimatedActors) {
        if (act.type === 'DOG_WALKER') {
          act.group.position.z += act.dir * act.speed * dt;
          if (act.group.position.z > 48) act.dir = -1;
          if (act.group.position.z < -48) act.dir = 1;
          act.group.rotation.y = act.dir > 0 ? 0 : Math.PI;
          const l = act.human.userData.limbs;
          if (l) {
            l.leftLeg.rotation.x = swing;
            l.rightLeg.rotation.x = -swing;
            l.leftArm.rotation.x = -swing * 0.6;
          }
          act.pet.userData.tail.rotation.z = Math.sin(v22Clock * 14) * 0.45;
        } else if (act.type === 'JOGGER') {
          act.group.position.x += act.dir * act.speed * dt;
          if (act.group.position.x > 48) act.dir = -1;
          if (act.group.position.x < -48) act.dir = 1;
          act.group.rotation.y = act.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          const l = act.human.userData.limbs;
          if (l) {
            l.leftLeg.rotation.x = swing * 1.3;
            l.rightLeg.rotation.x = -swing * 1.3;
            l.leftArm.rotation.x = -swing * 1.1;
            l.rightArm.rotation.x = swing * 1.1;
          }
        } else if (act.type === 'ROBBER_CHASE') {
          act.group.position.z += act.dir * act.speed * dt;
          if (act.group.position.z > 42) act.dir = -1;
          if (act.group.position.z < -42) act.dir = 1;
          act.group.rotation.y = act.dir > 0 ? 0 : Math.PI;
          [act.robber, act.policeNpc].forEach((h) => {
            const l = h.userData.limbs;
            if (l) {
              l.leftLeg.rotation.x = swing * 1.4;
              l.rightLeg.rotation.x = -swing * 1.4;
              l.leftArm.rotation.x = -swing;
              l.rightArm.rotation.x = swing;
            }
          });
        } else if (act.type === 'PARK_KID') {
          act.angle += dt * 1.6;
          act.group.position.x = act.centerX + Math.cos(act.angle) * act.radius;
          act.group.position.z = act.centerZ + Math.sin(act.angle) * act.radius;
          act.group.position.y = Math.abs(Math.sin(v22Clock * 6 + act.angle)) * 0.18;
          act.group.rotation.y = -act.angle;
        } else if (act.type === 'DANCERS') {
          act.dancers.forEach((d, idx) => {
            d.rotation.y = Math.sin(v22Clock * 3 + idx) * 0.8;
            d.position.y = Math.abs(Math.sin(v22Clock * 6 + idx)) * 0.12;
            const l = d.userData.limbs;
            if (l) {
              l.leftArm.rotation.x = -Math.PI * 0.6 + Math.sin(v22Clock * 8 + idx) * 0.5;
              l.rightArm.rotation.x = -Math.PI * 0.6 - Math.sin(v22Clock * 8 + idx) * 0.5;
            }
          });
        } else if (act.type === 'CAFE_GUESTS') {
          act.guests.forEach((g, idx) => {
            const l = g.userData.limbs;
            if (l) {
              l.rightArm.rotation.x = -0.6 + Math.sin(v22Clock * 2.5 + idx) * 0.35;
            }
          });
        } else if (act.type === 'SHUTTLE_BUS') {
          if (act.state === 'MOVING') {
            act.bus.position.z += dt * 6.5;
            if (Math.abs(act.bus.position.z - act.stopZ) < 0.4) {
              act.state = 'DWELLING';
              act.dwellTimer = 4.0;
              act.boardingPax.visible = true;
              act.boardingPax.position.set(-1.6, 0, 0);
            }
            if (act.bus.position.z > 65) act.bus.position.z = -55;
          } else {
            act.dwellTimer -= dt;
            // Hoạt cảnh hành khách bước từ vỉa hè lên cửa xe Bus
            act.boardingPax.position.x = THREE.MathUtils.lerp(-1.6, -0.4, 1 - act.dwellTimer / 4.0);
            if (act.dwellTimer <= 0) {
              act.boardingPax.visible = false;
              act.state = 'MOVING';
              act.bus.position.z += 0.8;
            }
          }
        }
      }
    } catch (e) {}
  }

  function initAllV22Upgrades() {
    installV22RenderHook();
    enforceSteeringWheelPositionAndRemoveShaftEveryFrame();
    purgePassenger3DMenuAndStuckCabinNpcLimbsEveryFrame();
    buildBoundedDraggableRearScreens();
    cleanAndRebuildSingleGarageDoor();
    buildTrafficLightsStreetLampsAnd12NpcActivities();
    injectAllVehicleCabinsSelectorUI();
  }

  initAllV22Upgrades();
  setTimeout(initAllV22Upgrades, 800);
  setTimeout(initAllV22Upgrades, 2200);
  requestAnimationFrame(animateV22WorldLoop);
})();
