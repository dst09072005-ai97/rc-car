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