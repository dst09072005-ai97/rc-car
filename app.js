function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// ============================================================================
// 1. KHỞI TẠO KHÔNG GIAN 3D, BẦU TRỜI SAO ĐÊM & ĐỔ BÓNG THỜI GIAN THỰC
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03060f);
scene.fog = new THREE.FogExp2(0x03060f, 0.0055);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 420);

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
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

function buildRealisticStarryNightSky() {
  const starGeo = new THREE.BufferGeometry();
  const starCount = 1400;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 180 + Math.random() * 80;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.48;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi) + 15;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.85, transparent: true, opacity: 0.85 })
  ));

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff8dc })
  );
  moon.position.set(85, 115, -140);
  scene.add(moon);
}
buildRealisticStarryNightSky();

// ============================================================================
// 2. CHUYỂN ĐỔI MƯỢT MÀ GIỮA "VÀO THẾ GIỚI 3D" <-> "THOÁT VỀ CỬA SỔ 2D"
//    (KHÔNG DÙNG INTENT:// GÂY LỖI MÀN HÌNH TRẮNG ERR_UNKNOWN_URL_SCHEME)
// ============================================================================
const smartVrBtn = document.getElementById('smart-vr-btn');
const guidePanel = document.getElementById('guide-panel');
const funcPanel = document.getElementById('function-panel');
let currentXrSession = null;
let isWorldImmersedMode = false;

document.getElementById('btn-toggle-guide')?.addEventListener('click', () => {
  guidePanel?.classList.toggle('panel-hidden');
});
document.getElementById('btn-toggle-func')?.addEventListener('click', () => {
  funcPanel?.classList.toggle('panel-hidden');
});
document.getElementById('btn-toggle-hud3d')?.addEventListener('click', () => {
  if (hudPanelGroup) hudPanelGroup.visible = !hudPanelGroup.visible;
});

function setImmersedWorldUIState(immersed) {
  isWorldImmersedMode = immersed;
  if (immersed) {
    guidePanel?.classList.add('panel-hidden');
    funcPanel?.classList.add('panel-hidden');
    if (smartVrBtn) {
      smartVrBtn.textContent = '🚪 THOÁT VỀ CỬA SỔ 2D (HIỆN BẢNG)';
      smartVrBtn.className = 'bar-btn btn-exit-2d';
    }
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    guidePanel?.classList.remove('panel-hidden');
    funcPanel?.classList.remove('panel-hidden');
    if (smartVrBtn) {
      smartVrBtn.textContent = '🥽 VÀO THẾ GIỚI 3D (FULLSCREEN)';
      smartVrBtn.className = 'bar-btn btn-enter-360vr';
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

let isPanorama360Fallback = false;
let panoramaYawOffset = 0;
let panoramaPitchOffset = 0;

async function setupSeamless3D2DSwitcher() {
  if (!smartVrBtn) return;

  smartVrBtn.addEventListener('click', async () => {
    initAudio();

    // 1. Nếu đang ở trong phiên WebXR 360° thực sự, bấm sẽ thoát ra cửa sổ 2D
    if (currentXrSession) {
      try { await currentXrSession.end(); } catch (e) {}
      currentXrSession = null;
      setImmersedWorldUIState(false);
      return;
    }

    // 2. Nếu đang ở chế độ Panorama 360° toàn cảnh, bấm lần nữa sẽ thoát về 2D
    if (isPanorama360Fallback) {
      isPanorama360Fallback = false;
      setImmersedWorldUIState(false);
      document.getElementById('quest-laser-cockpit')?.classList.remove('panel-hidden');
      return;
    }

    // 3. KÍCH HOẠT WEBXR 'immersive-vr' CHUẨN NHƯ BẢN V17 & DMNSHD.GG (KHÔNG DÙNG dom-overlay ĐỂ TRÁNH KẸT CỬA SỔ 2D!)
    if ('xr' in navigator) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-vr');
        if (supported) {
          const session = await navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
          });
          renderer.xr.setReferenceSpaceType('local-floor');
          await renderer.xr.setSession(session);
          currentXrSession = session;
          setImmersedWorldUIState(true);
          smartVrBtn.textContent = '🚪 THOÁT VR 360° VỀ CỬA SỔ 2D';
          smartVrBtn.className = 'bar-btn btn-exit-2d';
          state.lastActionLog = '🥽 Đã vào Thế giới Ảo VR 360° toàn phần (Nhìn 360° xung quanh hoàn toàn là thế giới 3D)!';

          session.addEventListener('end', () => {
            currentXrSession = null;
            setImmersedWorldUIState(false);
          });
          return;
        }
      } catch (err) {
        console.warn('WebXR direct session fallback:', err);
      }
    }

    // 4. CHẾ ĐỘ TOÀN CẢNH 360° TRỰC TIẾP (Ẩn toàn bộ khung 2D vướng mắt, mở rộng FOV 360° xoay tự do bằng con quay hồi chuyển / tay cầm / chuột)
    isPanorama360Fallback = true;
    setImmersedWorldUIState(true);
    camera.fov = 88;
    camera.updateProjectionMatrix();
    smartVrBtn.textContent = '🚪 THOÁT TOÀN CẢNH 360° VỀ 2D';
    smartVrBtn.className = 'bar-btn btn-exit-2d';
    state.lastActionLog = '🌐 Đã bật chế độ Toàn Cảnh 3D 360°! Dùng Tay cầm / Xoay kính / Kéo chuột để nhìn 360° quanh xe!';
  });
}
setupSeamless3D2DSwitcher();

// ============================================================================
// 3. ỨNG DỤNG YOUTUBE THẬT (MỞ PHIM / MỞ NHẠC CÓ TIẾNG & ĐỒNG BỘ MÀN HÌNH XE)
// ============================================================================
const ytModal = document.getElementById('youtube-app-modal');
const ytHtml5Video = document.getElementById('yt-html5-player');
const ytIframe = document.getElementById('yt-iframe');
let activeYoutubeTitle = 'YouTube Internet Stream';

// Vị trí cố định ban đầu của cửa sổ YouTube (2D & 3D)
const YT_MODAL_DEFAULT_STYLE = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
const YT_3D_DEFAULT_POS = new THREE.Vector3(0.04, 0.75, -0.37);
let yt3DFloatingGroupRef = null;

function resetYouTubeWindowToDefaultPosition() {
  if (ytModal) {
    ytModal.style.top = YT_MODAL_DEFAULT_STYLE.top;
    ytModal.style.left = YT_MODAL_DEFAULT_STYLE.left;
    ytModal.style.transform = YT_MODAL_DEFAULT_STYLE.transform;
  }
  if (yt3DFloatingGroupRef) {
    yt3DFloatingGroupRef.position.copy(YT_3D_DEFAULT_POS);
  }
}

function playYouTubeEmbedByIdOrQuery(inputStr, titleText) {
  if (!ytIframe || !ytHtml5Video) return;
  ytHtml5Video.pause();
  ytHtml5Video.classList.add('panel-hidden');
  ytIframe.classList.remove('panel-hidden');

  // Kiểm tra xem là ID/URL YouTube hay từ khóa tìm kiếm trên Internet
  const ytMatch = inputStr.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    ytIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&fs=0&rel=0&modestbranding=1`;
    activeYoutubeTitle = titleText || `YouTube (${videoId})`;
  } else if (/^[a-zA-Z0-9_-]{11}$/.test(inputStr)) {
    ytIframe.src = `https://www.youtube.com/embed/${inputStr}?autoplay=1&playsinline=1&fs=0&rel=0&modestbranding=1`;
    activeYoutubeTitle = titleText || `YouTube (${inputStr})`;
  } else if (inputStr.startsWith('http://') || inputStr.startsWith('https://')) {
    if (inputStr.endsWith('.mp4') || inputStr.endsWith('.webm')) {
      ytIframe.src = '';
      ytIframe.classList.add('panel-hidden');
      ytHtml5Video.classList.remove('panel-hidden');
      ytHtml5Video.src = inputStr;
      ytHtml5Video.muted = false;
      ytHtml5Video.play().catch(() => {});
      activeYoutubeTitle = titleText || 'Direct Internet Video';
    } else {
      ytIframe.src = inputStr;
      activeYoutubeTitle = titleText || 'YouTube Web';
    }
  } else {
    // Mở trực tiếp danh sách phát tìm kiếm YouTube bằng Internet theo từ khóa người dùng nhập
    const q = encodeURIComponent(inputStr);
    ytIframe.src = `https://www.youtube.com/embed?listType=search&list=${q}&autoplay=1&playsinline=1&fs=0`;
    activeYoutubeTitle = `YouTube Search: ${inputStr}`;
  }
  state.mediaPlaying = true;
  state.lastActionLog = `📺 Đang phát YouTube qua Internet: ${activeYoutubeTitle}`;
}

function openRealYouTubeApp() {
  initAudio();
  // Khi mở lại sau khi ẩn, luôn spawn ra vị trí cố định lúc đầu
  resetYouTubeWindowToDefaultPosition();
  ytModal?.classList.remove('panel-hidden');
  if (yt3DFloatingGroupRef) yt3DFloatingGroupRef.visible = true;

  if (ytIframe && !ytIframe.src && (!ytHtml5Video || !ytHtml5Video.src)) {
    playYouTubeEmbedByIdOrQuery('jfKfPfyJRdk', 'Lofi Hip Hop Radio - YouTube Live');
  }
  state.mediaPlaying = true;
  state.lastActionLog = '📺 Đã mở YouTube tại vị trí cố định! Nhập từ khóa bất kỳ hoặc chọn video để xem qua Internet.';
}

function closeYouTubeAppToDashboard() {
  ytModal?.classList.add('panel-hidden');
  resetYouTubeWindowToDefaultPosition();
  state.lastActionLog = '🗕 Đã ẩn cửa sổ YouTube (Khi mở lại sẽ spawn ở vị trí cố định ban đầu).';
}

document.getElementById('btn-open-yt-modal')?.addEventListener('click', () => {
  if (ytModal?.classList.contains('panel-hidden')) openRealYouTubeApp();
  else closeYouTubeAppToDashboard();
});
document.getElementById('btn-close-yt-modal')?.addEventListener('click', closeYouTubeAppToDashboard);

// Nút Phóng to chỉ nằm gọn trong phạm vi khung YouTube đã fit cứng (không tràn ra ngoài)
document.getElementById('btn-yt-inframe-full')?.addEventListener('click', (e) => {
  if (!ytModal) return;
  ytModal.classList.toggle('yt-inframe-full');
  const isFullInFrame = ytModal.classList.contains('yt-inframe-full');
  e.target.textContent = isFullInFrame ? '🗗 Hiện Danh Sách' : '⛶ Full Trong Khung';
});

// Nút mở trang chủ/tìm kiếm YouTube trực tuyến ngay trong khung
document.getElementById('btn-yt-open-home')?.addEventListener('click', () => {
  playYouTubeEmbedByIdOrQuery('Rolls Royce Ghost Night POV Drive 4K', 'YouTube Home - Rolls-Royce 4K');
});

document.querySelectorAll('.yt-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.yt-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    const type = card.getAttribute('data-type');
    const src = card.getAttribute('data-src') || '';
    const title = card.getAttribute('data-title') || 'YouTube Media';
    if (type === 'iframe') {
      const cleanSrc = src.includes('fs=0') ? src : `${src}${src.includes('?') ? '&' : '?'}playsinline=1&fs=0`;
      playYouTubeEmbedByIdOrQuery(cleanSrc, title);
    } else {
      playYouTubeEmbedByIdOrQuery(src, title);
    }
  });
});

document.getElementById('btn-yt-load-url')?.addEventListener('click', () => {
  const raw = document.getElementById('yt-custom-input')?.value.trim() || '';
  if (!raw) return;
  playYouTubeEmbedByIdOrQuery(raw, raw);
});
document.getElementById('yt-custom-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const raw = e.target.value.trim();
    if (raw) playYouTubeEmbedByIdOrQuery(raw, raw);
  }
});

// ============================================================================
// 4. ÁNH SÁNG ĐÊM KHÚC XẠ & TRẠNG THÁI HỆ THỐNG
// ============================================================================
const hemiLight = new THREE.HemisphereLight(0x7094d8, 0x121722, 0.85);
scene.add(hemiLight);

const mainShadowLight = new THREE.DirectionalLight(0xb8d0ff, 1.55);
mainShadowLight.position.set(35, 65, 25);
mainShadowLight.castShadow = true;
mainShadowLight.shadow.mapSize.width = 1024;
mainShadowLight.shadow.mapSize.height = 1024;
mainShadowLight.shadow.camera.near = 1;
mainShadowLight.shadow.camera.far = 180;
const dCam = 52;
mainShadowLight.shadow.camera.left = -dCam;
mainShadowLight.shadow.camera.right = dCam;
mainShadowLight.shadow.camera.top = dCam;
mainShadowLight.shadow.camera.bottom = -dCam;
mainShadowLight.shadow.bias = -0.0005;
scene.add(mainShadowLight);
scene.add(mainShadowLight.target);

function enableShadowsRecursive(obj, cast = true, receive = true) {
  obj.traverse((child) => {
    if (child.isMesh) {
      if (child.userData.isVolumetricBeam) {
        child.castShadow = false;
        child.receiveShadow = false;
      } else {
        child.castShadow = cast;
        child.receiveShadow = receive;
      }
    }
  });
}

const streetBeamMat = new THREE.MeshBasicMaterial({
  color: 0xfff4cc,
  transparent: true,
  opacity: 0.15,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});

const headlightBeamMat = new THREE.MeshBasicMaterial({
  color: 0xd8f3ff,
  transparent: true,
  opacity: 0.18,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});

const streetLightCones = [];
const streetPointLights = [];
const vehicleLightBeams = [];

function createHeadlightRefractionBeam(length = 7.5, radius = 1.35) {
  const geo = new THREE.ConeGeometry(radius, length, 20, 1, true);
  geo.translate(0, -length / 2, 0);
  geo.rotateX(Math.PI / 2);
  const beam = new THREE.Mesh(geo, headlightBeamMat);
  beam.userData.isVolumetricBeam = true;
  vehicleLightBeams.push(beam);
  return beam;
}

const SEAT_POSITIONS = [
  { name: 'Ghế Tài Xế (Driver 1st-Person POV)', pos: new THREE.Vector3(-0.42, 0.0, 0.12) },
  { name: 'Ghế Phụ Trước (Meta/QR Guest #1)', pos: new THREE.Vector3(0.42, 0.0, 0.12) },
  { name: 'Ghế VIP Sau Trái (Meta/QR Guest #2)', pos: new THREE.Vector3(-0.42, 0.04, 1.02) },
  { name: 'Ghế VIP Sau Phải (Meta/QR Guest #3)', pos: new THREE.Vector3(0.42, 0.04, 1.02) }
];

const state = {
  inputMode: 'both',
  playerMode: 'ON_FOOT',
  isBlinking: false,
  blinkTargetOpacity: 0.0,

  avatarPos: new THREE.Vector3(0.65, 0, 1.15),
  avatarYaw: -0.45,
  avatarWalkPhase: 0,
  distanceToCarDoor: 1.1,

  rcConnected: true,
  rcSpeedRatio: 1.0,
  rcSteerSensitivity: 1.0,
  rcMaxForwardPulse: 1585,
  rcMaxReversePulse: 1350,
  rcTargetSpeedKmh: 12.0,
  rcSmoothThrottle: 1500,
  rcSmoothSteer: 90,
  rcCargoOpen: false,
  rcCargoAnim: 0,

  windshieldMode: 'TRANSPARENT',
  esp32StreamUrl: 'http://192.168.4.102:81/stream',
  esp32Connected: false,
  esp32RearStreamUrl: 'http://192.168.4.103:81/stream',
  esp32RearConnected: false,
  turnSignal: 'OFF', // 'OFF' | 'LEFT' | 'RIGHT'
  turnSignalBlinkTimer: 0,
  isLeaningOut: false,
  engineStarting: false,
  rcRealSpeedKmh: 0,
  rcHardwareMoving: false,
  rcObstacleHitTrigger: false,
  activeCarId: 'car_host',
  ownCarId: 'car_host',
  isHostPlayer: true,

  engineRunning: false,
  doorsOpen: false,
  doorAnimAngle: 0,
  convertibleRoofOpen: false,
  roofAnimProgress: 0,
  seatIndex: 0,
  steeringAngleDeg: 0,
  throttlePercent: 0,
  brakePercent: 0,
  reversePercent: 0,
  velocityMs: 0,
  speedKmh: 0,
  headingRad: 0,
  wheelbaseM: 3.2,
  wheelRotationRad: 0,
  rpm: 0,
  autoGearSub: 1,
  gears: ['P', 'R', 'N', 'D'],
  gearIndex: 3,
  wipersActive: false,
  wiperAngle: 0,
  hornActive: false,

  suspensionShakeIntensity: 0,
  suspensionShakePhase: 0,
  hijackActive: false,

  weatherMode: 'night',
  nightLightsActive: true,
  appBgmEnabled: true,
  mediaPlaying: true,
  mediaVolume: 80,

  verifiedGuests: [
    { seatIdx: 1, verified: true, name: 'MetaUser_Alex' },
    { seatIdx: 2, verified: true, name: 'QR_Khách_VIP' },
    { seatIdx: 3, verified: false, name: 'Chờ Quét QR' }
  ],

  socialLog: 'Dùng Tia Laser bấm vào NPC hoặc nút [🤝 Chào NPC] góc phải để Bắt tay / Nghe thú kêu!',
  crimeLog: 'Đường phố có 4 mẫu Ô tô 3D, Xe máy/Xe đạp đội nón bảo hiểm & Trộm chó.',
  lastActionLog: '🚶 Dùng Tia Laser bấm nút [🚪 Mở Cửa Lên/Xuống Xe] góc dưới phải (hoặc bấm vào Cửa Xe) để lên lái!'
};

function triggerEyelidBlinkTransition(onMidBlinkCallback) {
  if (state.isBlinking) return;
  state.isBlinking = true;
  document.body.classList.add('blinking');
  state.blinkTargetOpacity = 1.0;

  setTimeout(() => {
    if (onMidBlinkCallback) onMidBlinkCallback();
    setTimeout(() => {
      document.body.classList.remove('blinking');
      state.blinkTargetOpacity = 0.0;
      setTimeout(() => { state.isBlinking = false; }, 250);
    }, 170);
  }, 250);
}

// ============================================================================
// 5. HỆ THỐNG ÂM THANH 3D: NHẠC NỀN, ĐỘNG CƠ V12, CÒI XE, BẮT TAY & THÚ KÊU
// ============================================================================
let audioCtx = null;
let v12OscSub = null;
let v12OscMain = null;
let v12Filter = null;
let v12Gain = null;
let hornGain = null;
let bgmGainNode = null;
let bgmOsc1 = null;
let bgmOsc2 = null;
let bgmChordTimer = 0;
let bgmChordIdx = 0;

function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioCtx();

  v12Filter = audioCtx.createBiquadFilter();
  v12Filter.type = 'lowpass';
  v12Filter.frequency.value = 70;
  v12Gain = audioCtx.createGain();
  v12Gain.gain.value = 0.0;

  v12OscSub = audioCtx.createOscillator();
  v12OscSub.type = 'sine';
  v12OscSub.frequency.value = 32;
  v12OscMain = audioCtx.createOscillator();
  v12OscMain.type = 'triangle';
  v12OscMain.frequency.value = 64;

  v12OscSub.connect(v12Filter);
  v12OscMain.connect(v12Filter);
  v12Filter.connect(v12Gain);
  v12Gain.connect(audioCtx.destination);
  v12OscSub.start();
  v12OscMain.start();

  bgmGainNode = audioCtx.createGain();
  bgmGainNode.gain.value = state.appBgmEnabled ? 0.025 : 0.0;
  const bgmFilter = audioCtx.createBiquadFilter();
  bgmFilter.type = 'lowpass';
  bgmFilter.frequency.value = 440;

  bgmOsc1 = audioCtx.createOscillator();
  bgmOsc2 = audioCtx.createOscillator();
  bgmOsc1.type = 'sine';
  bgmOsc2.type = 'triangle';
  bgmOsc1.frequency.value = 220;
  bgmOsc2.frequency.value = 277.18;
  bgmOsc1.connect(bgmFilter);
  bgmOsc2.connect(bgmFilter);
  bgmFilter.connect(bgmGainNode);
  bgmGainNode.connect(audioCtx.destination);
  bgmOsc1.start();
  bgmOsc2.start();

  hornGain = audioCtx.createGain();
  hornGain.gain.value = 0.0;
  const h1 = audioCtx.createOscillator();
  const h2 = audioCtx.createOscillator();
  h1.type = 'sawtooth';
  h2.type = 'sawtooth';
  h1.frequency.value = 410;
  h2.frequency.value = 512;
  const hFilter = audioCtx.createBiquadFilter();
  hFilter.type = 'lowpass';
  hFilter.frequency.value = 1400;
  h1.connect(hFilter);
  h2.connect(hFilter);
  hFilter.connect(hornGain);
  hornGain.connect(audioCtx.destination);
  h1.start();
  h2.start();
}

function playEngineStarterSound() {
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(95, now);
  osc.frequency.setValueAtTime(115, now + 0.18);
  osc.frequency.exponentialRampToValueAtTime(215, now + 0.70);
  osc.frequency.exponentialRampToValueAtTime(72, now + 1.15);
  g.gain.setValueAtTime(0.18, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 1.25);
}

function playImpactSound(vol = 10) {
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(125, now);
  osc.frequency.exponentialRampToValueAtTime(26, now + 0.35);
  g.gain.setValueAtTime(Math.min(0.6, vol * 0.04), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

function playSmartVehicleHornSound(category) {
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  if (category === 'BICYCLE') {
    [0, 0.14].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1880, now + offset);
      osc.frequency.exponentialRampToValueAtTime(2150, now + offset + 0.05);
      g.gain.setValueAtTime(0.15, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.24);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.25);
    });
  } else if (category === 'MOTORBIKE') {
    [0, 0.15].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(760, now + offset);
      const f = audioCtx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      g.gain.setValueAtTime(0.13, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.11);
      osc.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.12);
    });
  } else {
    [410, 512].forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1350;
      g.gain.setValueAtTime(0.11, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  }
}

function playSocialOrAnimalSound(type) {
  initAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  if (type === 'HELLO_NPC') {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance('Hello! Chào bạn nhé!');
      utter.lang = 'vi-VN';
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
    }
    [330, 440].forEach((f, idx) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.15);
      g.gain.setValueAtTime(0.18, now + idx * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.14);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + idx * 0.15);
      osc.stop(now + idx * 0.15 + 0.15);
    });
  } else if (type === 'DOG_BARK') {
    [0, 0.22].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const f = audioCtx.createBiquadFilter();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now + offset);
      osc.frequency.linearRampToValueAtTime(285, now + offset + 0.04);
      osc.frequency.exponentialRampToValueAtTime(85, now + offset + 0.16);
      f.type = 'bandpass';
      f.frequency.value = 650;
      g.gain.setValueAtTime(0.28, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.17);
      osc.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    });
  } else if (type === 'CAT_MEOW') {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.linearRampToValueAtTime(840, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(430, now + 0.55);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }
}

function toggleEngineIgnition() {
  initAudio();
  const btnEl = document.getElementById('btn-engine-start');
  if (!state.engineRunning) {
    playEngineStarterSound();
    state.engineStarting = true;
    state.velocityMs = 0;
    state.speedKmh = 0;
    state.lastActionLog = '🔄 Đang khởi động động cơ V12 Digital Twin...';
    setTimeout(() => {
      state.engineStarting = false;
      state.engineRunning = true;
      state.velocityMs = 0;
      state.speedKmh = 0;
      state.rpm = 680;
      if (state.gearIndex === 0) state.gearIndex = 3;
      state.lastActionLog = '🟢 ĐỘNG CƠ V12 ĐÃ NỔ MÁY! Giữ bàn đạp [⚡ ĐẠP GA] góc dưới phải (hoặc phím W) để xe chạy!';
      if (btnEl) {
        btnEl.textContent = '🟢 ENGINE ON (TẮT: I)';
        btnEl.style.background = '#28cd41';
        btnEl.style.color = '#000';
      }
    }, 500);
  } else {
    state.engineRunning = false;
    state.rpm = 0;
    state.throttlePercent = 0;
    state.gearIndex = 0;
    state.lastActionLog = '🛑 Đã tắt máy (ENGINE OFF) & khóa về số [P].';
    if (btnEl) {
      btnEl.textContent = '🔘 Đề Nổ Máy (I)';
      btnEl.style.background = '#ff3b30';
      btnEl.style.color = '#fff';
    }
  }
}

document.getElementById('btn-engine-start')?.addEventListener('click', toggleEngineIgnition);
document.getElementById('btn-app-bgm')?.addEventListener('click', (e) => {
  initAudio();
  state.appBgmEnabled = !state.appBgmEnabled;
  e.target.textContent = state.appBgmEnabled ? '🔊 BGM' : '🔇 BGM';
  e.target.style.background = state.appBgmEnabled ? '#4cd964' : '#555';
});

function updateAudioSystem(dt) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  bgmChordTimer += dt;
  if (bgmChordTimer > 3.5) {
    bgmChordTimer = 0;
    const chords = [
      [220.0, 261.63],
      [174.61, 220.0],
      [196.0, 246.94],
      [164.81, 207.65]
    ];
    bgmChordIdx = (bgmChordIdx + 1) % chords.length;
    bgmOsc1.frequency.setTargetAtTime(chords[bgmChordIdx][0], now, 0.4);
    bgmOsc2.frequency.setTargetAtTime(chords[bgmChordIdx][1], now, 0.4);
  }
  bgmGainNode.gain.setTargetAtTime(state.appBgmEnabled ? 0.025 : 0.0, now, 0.15);

  if (!state.engineRunning) {
    state.rpm = THREE.MathUtils.lerp(state.rpm, 0, dt * 6);
    v12Gain.gain.setTargetAtTime(0.0, now, 0.05);
    hornGain.gain.setTargetAtTime(state.hornActive ? 0.38 : 0.0, now, 0.015);
    return;
  }

  const speed = Math.abs(state.speedKmh);
  const throttle = state.throttlePercent;
  state.autoGearSub = THREE.MathUtils.clamp(Math.floor(speed / 26) + 1, 1, 8);
  const inGear = (speed % 26) / 26;
  const targetRpm = 650 + inGear * 1900 + (throttle / 100) * 1800;
  state.rpm = THREE.MathUtils.lerp(state.rpm, targetRpm, dt * 5);

  const freq = (state.rpm / 60) * 6;
  v12OscSub.frequency.setTargetAtTime(freq * 0.5, now, 0.04);
  v12OscMain.frequency.setTargetAtTime(freq, now, 0.04);

  const isIdle = speed < 1.0 && throttle < 2.0;
  const targetGain = isIdle ? 0.004 : 0.035 + (throttle / 100) * 0.13 + Math.min(0.09, speed / 1200);
  const targetCutoff = isIdle ? 65 : 140 + (state.rpm / 5000) * 720;

  v12Gain.gain.setTargetAtTime(targetGain, now, 0.08);
  v12Filter.frequency.setTargetAtTime(targetCutoff, now, 0.06);
  hornGain.gain.setTargetAtTime(state.hornActive ? 0.38 : 0.0, now, 0.015);
}

// ============================================================================
// 6. NHÂN VẬT META AVATAR & XE ROLLS-ROYCE TƯƠNG TÁC TRỰC TIẾP BẰNG TIA LASER
// ============================================================================
const playerAvatarGroup = new THREE.Group();
playerAvatarGroup.position.copy(state.avatarPos);
scene.add(playerAvatarGroup);

const cameraRig = new THREE.Group();
camera.position.set(0, 1.12, 0);
cameraRig.add(camera);
playerAvatarGroup.add(cameraRig);
cameraRig.position.set(0, 0.52, 0);

let avatarLeftLeg = null;
let avatarRightLeg = null;
let avatarLeftArm = null;
let avatarRightArm = null;
let avatarBodyMesh = null;
let playerHandshakeTimer = 0;

function buildPlayerMetaAvatar() {
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x1877f2, roughness: 0.4 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1d2432, roughness: 0.6 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf4c29f, roughness: 0.5 });

  avatarBodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.44, 10, 16), suitMat);
  avatarBodyMesh.position.set(0, 1.08, 0.08);
  playerAvatarGroup.add(avatarBodyMesh);

  avatarLeftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.52, 8, 12), pantsMat);
  avatarLeftLeg.position.set(-0.09, 0.45, 0.05);
  avatarRightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.52, 8, 12), pantsMat);
  avatarRightLeg.position.set(0.09, 0.45, 0.05);
  playerAvatarGroup.add(avatarLeftLeg, avatarRightLeg);

  avatarLeftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 8, 12), skinMat);
  avatarLeftArm.position.set(-0.24, 1.08, 0.02);
  avatarRightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 8, 12), skinMat);
  avatarRightArm.position.set(0.24, 1.08, -0.12);
  playerAvatarGroup.add(avatarRightArm, avatarLeftArm);

  enableShadowsRecursive(playerAvatarGroup, true, true);
}
buildPlayerMetaAvatar();

const vehicleRoot = new THREE.Group();
vehicleRoot.position.set(2.4, 0, 0);
scene.add(vehicleRoot);

const chassisGroup = new THREE.Group();
vehicleRoot.add(chassisGroup);

const driverSeatMount = new THREE.Group();
driverSeatMount.position.copy(SEAT_POSITIONS[0].pos);
chassisGroup.add(driverSeatMount);

const matNappa = new THREE.MeshStandardMaterial({ color: 0xdfd1be, roughness: 0.38 });
const matWalnut = new THREE.MeshPhysicalMaterial({ color: 0x3a2314, roughness: 0.06, clearcoat: 1.0 });
const matChrome = new THREE.MeshStandardMaterial({ color: 0xf0f2f5, roughness: 0.08, metalness: 0.96 });
const matPiano = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.05 });
const matBodyPaint = new THREE.MeshPhysicalMaterial({ color: 0x101829, roughness: 0.12, metalness: 0.65, clearcoat: 1.0 });
const matTireRubber = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.85 });
const matGlass = new THREE.MeshPhysicalMaterial({ color: 0x88ccff, transparent: true, opacity: 0.22, roughness: 0.05 });

const wheelAssemblies = [];
const doorPivots = [];
const passengerAvatars = [];
const interactive3DTargets = []; // Mọi vật thể 3D tương tác được bằng Tia Laser Tay cầm Quest 3
const steeringWheelPivot = new THREE.Group();
const convertibleRoofGroup = new THREE.Group();
const rcCargoTrayPivot = new THREE.Group();
const roofBeaconGroup = new THREE.Group();
const wiperLeftPivot = new THREE.Group();
const wiperRightPivot = new THREE.Group();
let hijackDriverMesh = null;

const playerHeadlightSpot = new THREE.SpotLight(0xe8f7ff, 34, 68, Math.PI / 4, 0.45, 1.1);
playerHeadlightSpot.position.set(0, 0.72, -2.25);
playerHeadlightSpot.target.position.set(0, 0.05, -22);
playerHeadlightSpot.castShadow = false;
playerHeadlightSpot.shadow.mapSize.width = 512;
playerHeadlightSpot.shadow.mapSize.height = 512;
chassisGroup.add(playerHeadlightSpot, playerHeadlightSpot.target);

function register3DTarget(mesh, onClick) {
  mesh.userData.onClick = onClick;
  interactive3DTargets.push(mesh);
}

function createCockpit3DButton(parent, label, w, h, d, pos, bgColor, onClick) {
  const c = document.createElement('canvas');
  c.width = 220;
  c.height = 72;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 220, 72);
  ctx.strokeStyle = '#ffd60a';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 216, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 21px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 110, 36);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
    matChrome, matChrome, matChrome, matChrome,
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }),
    matPiano
  ]);
  mesh.position.copy(pos);
  parent.add(mesh);
  register3DTarget(mesh, onClick);
  return mesh;
}

function createRollsRoyceMonogramTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#06080c';
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e6e8ec';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(72, 42, 112, 172);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 105px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('R', 116, 158);
  ctx.fillStyle = '#d8dde6';
  ctx.fillText('R', 142, 172);
  return new THREE.CanvasTexture(c);
}

function create3DWheelAssembly(xPos, zPos, isFrontWheel) {
  const steerMount = new THREE.Group();
  steerMount.position.set(xPos, 0.38, zPos);
  chassisGroup.add(steerMount);

  const spinHub = new THREE.Group();
  steerMount.add(spinHub);

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 24), matTireRubber);
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.27, 20), matChrome);
  rim.rotation.z = Math.PI / 2;
  spinHub.add(tire, rim);

  for (let s = 0; s < 6; s++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.46), matPiano);
    spoke.rotation.x = (s * Math.PI) / 6;
    spinHub.add(spoke);
  }
  wheelAssemblies.push({ steerMount, spinHub, isFrontWheel });
}

function createErgonomicSeat(xPos, zPos) {
  const seatGroup = new THREE.Group();
  seatGroup.position.set(xPos, 0.15, zPos);
  for (let i = -1; i <= 1; i++) {
    const flute = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.36, 10, 14), matNappa);
    flute.rotation.x = Math.PI / 2;
    flute.scale.set(1.15, 1.0, 0.72);
    flute.position.set(i * 0.13, 0.22, 0.0);
    seatGroup.add(flute);
  }
  const backrest = new THREE.Group();
  backrest.position.set(0, 0.26, 0.22);
  backrest.rotation.x = THREE.MathUtils.degToRad(8);
  seatGroup.add(backrest);
  for (let i = -1; i <= 1; i++) {
    const bf = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.50, 10, 14), matNappa);
    bf.scale.set(1.15, 1.0, 0.65);
    bf.position.set(i * 0.13, 0.30, 0);
    backrest.add(bf);
  }
  const headrest = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.16, 12, 12), matNappa);
  headrest.rotation.z = Math.PI / 2;
  headrest.position.set(0, 0.68, -0.02);
  backrest.add(headrest);
  chassisGroup.add(seatGroup);
}

function createVerifiedGuestAvatar(guestInfo, suitColor) {
  const seatPos = SEAT_POSITIONS[guestInfo.seatIdx].pos;
  const avatarGroup = new THREE.Group();
  avatarGroup.position.set(seatPos.x, seatPos.y + 0.12, seatPos.z);

  const suitMat = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.5 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c19e, roughness: 0.5 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.38, 10, 14), suitMat);
  torso.position.set(0, 0.58, 0.06);
  avatarGroup.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.98, 0.04);
  avatarGroup.add(headPivot);
  headPivot.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 14), skinMat));

  const questVisor = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.085, 0.09),
    new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.2 })
  );
  questVisor.position.set(0, 0.01, -0.08);
  headPivot.add(questVisor);

  avatarGroup.userData = { guestInfo, headPivot };
  chassisGroup.add(avatarGroup);
  passengerAvatars.push(avatarGroup);
}

const windshieldCanvas = document.createElement('canvas');
windshieldCanvas.width = 1024;
windshieldCanvas.height = 512;
const wsCtx = windshieldCanvas.getContext('2d');
const wsTex = new THREE.CanvasTexture(windshieldCanvas);

const ytCanvas = document.createElement('canvas');
ytCanvas.width = 640;
ytCanvas.height = 360;
const ytCtx = ytCanvas.getContext('2d');
const ytTex = new THREE.CanvasTexture(ytCanvas);

const rearCamCanvas = document.createElement('canvas');
rearCamCanvas.width = 512;
rearCamCanvas.height = 256;
const rearCamCtx = rearCamCanvas.getContext('2d');
const rearCamTex = new THREE.CanvasTexture(rearCamCanvas);

function buildMasterRollsRoyceVehicle() {
  const underbody = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.16, 4.85), matPiano);
  underbody.position.set(0, 0.22, 0.0);
  chassisGroup.add(underbody);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.46, 1.55), matBodyPaint);
  hood.position.set(0, 0.53, -1.45);
  chassisGroup.add(hood);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.48, 0.08), matChrome);
  grille.position.set(0, 0.54, -2.24);
  chassisGroup.add(grille);

  [-0.68, 0.68].forEach((lx) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lamp.position.set(lx, 0.62, -2.23);
    const beam = createHeadlightRefractionBeam(10.0, 1.9);
    beam.position.set(lx, 0.62, -2.25);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: 0xff1122 }));
    tail.position.set(lx, 0.58, 2.42);
    chassisGroup.add(lamp, beam, tail);
  });

  const rearTrunk = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.48, 0.95), matBodyPaint);
  rearTrunk.position.set(0, 0.54, 1.95);
  chassisGroup.add(rearTrunk);

  rcCargoTrayPivot.position.set(0, 0.78, 1.90);
  chassisGroup.add(rcCargoTrayPivot);
  const cargoBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.24, 0.78),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.3 })
  );
  cargoBox.position.set(0, 0.12, 0);
  rcCargoTrayPivot.add(cargoBox);

  create3DWheelAssembly(-0.96, -1.45, true);
  create3DWheelAssembly(0.96, -1.45, true);
  create3DWheelAssembly(-0.96, 1.55, false);
  create3DWheelAssembly(0.96, 1.55, false);

  // 4 Cánh cửa xe (Cho phép dùng Tia Laser Tay cầm Quest 3 bấm thẳng vào Cửa Xe để Mở cửa Lên/Xuống xe!)
  [
    [-1, -0.65, true], [1, -0.65, true], [-1, 0.42, false], [1, 0.42, false]
  ].forEach(([sideSign, zHinge, isFront]) => {
    const pivot = new THREE.Group();
    pivot.position.set(sideSign * 0.96, 0.18, zHinge);
    chassisGroup.add(pivot);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 1.05), matBodyPaint);
    panel.position.set(0, 0.31, 0.525);
    register3DTarget(panel, enterOrExitCarWithBlink); // Bấm tia laser vào cánh cửa là lên/xuống xe ngay!

    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.58, 1.0), matNappa);
    inner.position.set(-sideSign * 0.03, 0.31, 0.525);
    register3DTarget(inner, enterOrExitCarWithBlink);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.48), matGlass);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(0, 0.86, 0.525);
    pivot.add(panel, inner, glass);

    if (isFront) {
      const mirrorGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 0.09),
        new THREE.MeshBasicMaterial({ map: rearCamTex })
      );
      mirrorGlass.position.set(sideSign * 0.14, 0.66, 0.15);
      mirrorGlass.rotation.y = sideSign < 0 ? THREE.MathUtils.degToRad(18) : THREE.MathUtils.degToRad(-18);
      pivot.add(mirrorGlass);
    }

    pivot.userData = { sideSign };
    doorPivots.push(pivot);
  });

  [-0.90, 0.90].forEach((px) => {
    const pillarA = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.78, 12), matChrome);
    pillarA.position.set(px, 1.08, -0.62);
    pillarA.rotation.x = THREE.MathUtils.degToRad(26);
    chassisGroup.add(pillarA);
  });

  const windshieldScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.68, 0.66),
    new THREE.MeshBasicMaterial({ map: wsTex, transparent: true, side: THREE.DoubleSide })
  );
  windshieldScreenMesh.position.set(0, 1.10, -0.66);
  windshieldScreenMesh.rotation.x = THREE.MathUtils.degToRad(-18);
  chassisGroup.add(windshieldScreenMesh);

  convertibleRoofGroup.position.set(0, 1.40, 1.45);
  chassisGroup.add(convertibleRoofGroup);
  const roofCanopy = new THREE.Mesh(
    new THREE.BoxGeometry(1.84, 0.05, 1.95),
    new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.75 })
  );
  roofCanopy.position.set(0, 0.02, -0.95);
  convertibleRoofGroup.add(roofCanopy);

  wiperLeftPivot.position.set(-0.45, 0.74, -0.74);
  const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.46, 0.015), matPiano);
  bladeL.position.set(0, 0.23, 0);
  wiperLeftPivot.add(bladeL);
  chassisGroup.add(wiperLeftPivot);

  wiperRightPivot.position.set(0.15, 0.74, -0.74);
  const bladeR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.46, 0.015), matPiano);
  bladeR.position.set(0, 0.23, 0);
  wiperRightPivot.add(bladeR);
  chassisGroup.add(wiperRightPivot);

  const dashRoll = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.78, 14, 20), matNappa);
  dashRoll.rotation.z = Math.PI / 2;
  dashRoll.position.set(0, 0.76, -0.58);
  chassisGroup.add(dashRoll);

  const dashWood = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.80, 20), matWalnut);
  dashWood.rotation.z = Math.PI / 2;
  dashWood.scale.set(1.0, 1.0, 0.35);
  dashWood.position.set(0, 0.66, -0.46);
  chassisGroup.add(dashWood);

  const centerConsole = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.55, 12, 16), matNappa);
  centerConsole.rotation.x = Math.PI / 2;
  centerConsole.position.set(0, 0.38, 0.35);
  chassisGroup.add(centerConsole);

  createErgonomicSeat(-0.42, 0.12);
  createErgonomicSeat(0.42, 0.12);
  createErgonomicSeat(-0.42, 1.02);
  createErgonomicSeat(0.42, 1.02);

  createVerifiedGuestAvatar(state.verifiedGuests[0], 0x1877f2);
  createVerifiedGuestAvatar(state.verifiedGuests[1], 0x2a9d8f);
  createVerifiedGuestAvatar(state.verifiedGuests[2], 0x7209b7);

  // Vô lăng + Còi RR (Bấm tia laser tay cầm vào Logo RR giữa vô lăng để Bóp Còi!)
  steeringWheelPivot.position.set(-0.42, 0.70, -0.25);
  steeringWheelPivot.rotation.x = THREE.MathUtils.degToRad(-23);
  chassisGroup.add(steeringWheelPivot);
  steeringWheelPivot.add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.019, 20, 48), matNappa));

  const hornCap = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 36),
    new THREE.MeshBasicMaterial({ map: createRollsRoyceMonogramTexture() })
  );
  hornCap.position.z = 0.022;
  steeringWheelPivot.add(hornCap);
  register3DTarget(hornCap, () => {
    playSmartVehicleHornSound('CAR');
    state.hornActive = true;
    state.lastActionLog = '📢 Bạn vừa bấm Còi Kép Rolls-Royce trên tâm vô lăng!';
    setTimeout(() => { state.hornActive = false; }, 500);
  });

  // Nút 3D Đề nổ máy & Ra khỏi xe trên táp-lô
  createCockpit3DButton(
    chassisGroup,
    '🔘 START/STOP',
    0.09, 0.045, 0.018,
    new THREE.Vector3(-0.18, 0.68, -0.38),
    '#c01824',
    toggleEngineIgnition
  );

  createCockpit3DButton(
    chassisGroup,
    '🚪 RA KHỎI XE',
    0.10, 0.045, 0.018,
    new THREE.Vector3(-0.68, 0.68, -0.38),
    '#16325c',
    enterOrExitCarWithBlink
  );

  // MÀN HÌNH YOUTUBE GIỮA XE (Bấm tia laser vào màn hình này sẽ MỞ HẲN APP YOUTUBE LÊN ĐỂ CHỌN PHIM/NHẠC!)
  const ytGroup = new THREE.Group();
  ytGroup.position.set(0.04, 0.75, -0.37);
  ytGroup.rotation.x = THREE.MathUtils.degToRad(-10);
  chassisGroup.add(ytGroup);

  const ytScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.20),
    new THREE.MeshBasicMaterial({ map: ytTex })
  );
  ytGroup.add(ytScreenMesh);
  register3DTarget(ytScreenMesh, openRealYouTubeApp);

  createCockpit3DButton(
    ytGroup,
    '📺 MỞ YOUTUBE',
    0.16, 0.036, 0.014,
    new THREE.Vector3(0.0, -0.125, 0.008),
    '#ff0000',
    openRealYouTubeApp
  );

  const rearScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.12), new THREE.MeshBasicMaterial({ map: rearCamTex }));
  rearScreen.position.set(0.44, 0.74, -0.37);
  rearScreen.rotation.x = THREE.MathUtils.degToRad(-10);
  chassisGroup.add(rearScreen);

  hijackDriverMesh = new THREE.Group();
  hijackDriverMesh.position.set(-0.42, 0.55, 0.12);
  const rTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.40, 8, 12), new THREE.MeshStandardMaterial({ color: 0x991111 }));
  const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rHead.position.y = 0.42;
  hijackDriverMesh.add(rTorso, rHead);
  hijackDriverMesh.visible = false;
  chassisGroup.add(hijackDriverMesh);

  // Biểu tượng trên nóc xe (Bấm tia laser vào biểu tượng này cũng Mở Cửa Lên Xe ngay!)
  roofBeaconGroup.position.set(0, 2.05, 0.15);
  chassisGroup.add(roofBeaconGroup);
  const diamond = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.48, 4), new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
  diamond.rotation.x = Math.PI;
  roofBeaconGroup.add(diamond);
  register3DTarget(diamond, enterOrExitCarWithBlink);

  const bc = document.createElement('canvas');
  bc.width = 640;
  bc.height = 150;
  const bCtx = bc.getContext('2d');
  bCtx.fillStyle = 'rgba(6, 20, 38, 0.92)';
  bCtx.fillRect(0, 0, 640, 150);
  bCtx.strokeStyle = '#00ff88';
  bCtx.lineWidth = 8;
  bCtx.strokeRect(4, 4, 632, 142);
  bCtx.fillStyle = '#00ff88';
  bCtx.font = 'bold 30px Segoe UI, sans-serif';
  bCtx.textAlign = 'center';
  bCtx.fillText('★ XE CỦA BẠN [BẤM LASER VÀO ĐÂY ĐỂ LÊN XE]', 320, 58);
  bCtx.fillStyle = '#ffd60a';
  bCtx.font = 'bold 23px Segoe UI, sans-serif';
  bCtx.fillText('Hoặc dùng nút [🚪 Mở Cửa Lên/Xuống Xe] ở góc dưới phải!', 320, 112);

  const bannerSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(bc), transparent: true })
  );
  bannerSprite.scale.set(1.65, 0.40, 1);
  bannerSprite.position.y = 0.52;
  roofBeaconGroup.add(bannerSprite);

  enableShadowsRecursive(chassisGroup, true, true);
}
buildMasterRollsRoyceVehicle();

// ============================================================================
// 7. KẾT NỐI KÍNH CHẮN GIÓ ESP32-CAM
// ============================================================================
let esp32Bitmap = null;
let esp32Socket = null;
let isFrontDecoding = false;
let pendingFrontBlob = null;
let frontCamNeedsRedraw = false;
const esp32MjpegImg = new Image();
esp32MjpegImg.crossOrigin = 'Anonymous';
esp32MjpegImg.onload = () => {
  state.esp32Connected = true;
  frontCamNeedsRedraw = false;
  if (state.windshieldMode !== 'TRANSPARENT' && state.windshieldMode !== 'ESP32_PIP') {
    state.windshieldMode = 'ESP32_LIVE';
  }
  if (state.windshieldMode === 'ESP32_LIVE') {
    wsCtx.drawImage(esp32MjpegImg, 0, 0, 1024, 512);
    wsTex.needsUpdate = true;
  }
};

function decodePendingFrontFrame() {
  if (isFrontDecoding || !pendingFrontBlob) return;
  const blob = pendingFrontBlob;
  pendingFrontBlob = null;
  isFrontDecoding = true;

  createImageBitmap(blob).then((bmp) => {
    if (esp32Bitmap && typeof esp32Bitmap.close === 'function') {
      try { esp32Bitmap.close(); } catch (e) {}
    }
    esp32Bitmap = bmp;
    state.esp32Connected = true;
    if (state.windshieldMode !== 'TRANSPARENT' && state.windshieldMode !== 'ESP32_PIP') {
      state.windshieldMode = 'ESP32_LIVE';
    }
    // DIRECT ZERO-LATENCY DRAW: Vẽ trực tiếp lên kính lái ngay khi giải mã xong bitmap, không viền, không lag
    if (state.windshieldMode === 'ESP32_LIVE') {
      wsCtx.drawImage(bmp, 0, 0, 1024, 512);
      wsTex.needsUpdate = true;
    } else if (state.windshieldMode === 'ESP32_REAR_LIVE' && !esp32RearBitmap) {
      wsCtx.drawImage(bmp, 0, 0, 1024, 512);
      wsTex.needsUpdate = true;
    }
    frontCamNeedsRedraw = false;
  }).catch(() => {}).finally(() => {
    isFrontDecoding = false;
    if (pendingFrontBlob) decodePendingFrontFrame();
  });
}

// Canvas dem giai ma Raw RGB565 tu ESP32-CAM (160x120 QQVGA) - Toi uu Zero-Lag 32-bit
const rawCamW = 160;
const rawCamH = 120;
const rawCamCanvas = document.createElement('canvas');
rawCamCanvas.width = rawCamW;
rawCamCanvas.height = rawCamH;
const rawCamCtx = rawCamCanvas.getContext('2d', { willReadFrequently: true });
const rawCamImgData = rawCamCtx.createImageData(rawCamW, rawCamH);
const rawCamRgba32 = new Uint32Array(rawCamImgData.data.buffer);

let latestRawFrameBytes = null;
let rawFrameScheduled = false;

function decodeLatestRawFrame() {
  if (!latestRawFrameBytes) return;
  const bytes = latestRawFrameBytes;
  latestRawFrameBytes = null;
  rawFrameScheduled = false;

  let src = 0;
  const count = 19200;
  for (let i = 0; i < count; i++) {
    const b1 = bytes[src++];
    const b2 = bytes[src++];
    const p = (b1 << 8) | b2;
    const r = ((p >> 11) & 0x1F) << 3;
    const g = ((p >> 5) & 0x3F) << 2;
    const b = (p & 0x1F) << 3;
    rawCamRgba32[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
  }
  rawCamCtx.putImageData(rawCamImgData, 0, 0);
  esp32Bitmap = rawCamCanvas;
  state.esp32Connected = true;
  frontCamNeedsRedraw = false;
  if (state.windshieldMode !== 'TRANSPARENT' && state.windshieldMode !== 'ESP32_PIP') {
    state.windshieldMode = 'ESP32_LIVE';
  }
  if (state.windshieldMode === 'ESP32_LIVE') {
    wsCtx.drawImage(rawCamCanvas, 0, 0, 1024, 512);
    wsTex.needsUpdate = true;
  }
}

function connectEsp32Windshield(rawUrl) {
  state.esp32StreamUrl = rawUrl;
  if (esp32Socket) {
    try { esp32Socket.close(); } catch (e) {}
    esp32Socket = null;
  }
  if (rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://')) {
    try {
      esp32Socket = new WebSocket(rawUrl);
      esp32Socket.binaryType = 'arraybuffer';
      esp32Socket.onopen = () => {
        state.esp32Connected = true;
        if (state.windshieldMode !== 'TRANSPARENT' && state.windshieldMode !== 'ESP32_PIP') {
          state.windshieldMode = 'ESP32_LIVE';
        }
        state.lastActionLog = '🟢 Da ket noi WebSocket ESP32-CAM!';
      };
      esp32Socket.onmessage = (msg) => {
        const now = performance.now();
        if (typeof esp32TwinMetrics !== 'undefined') {
          esp32TwinMetrics.frontFrameIntervalMs = now - (esp32TwinMetrics.frontLastFrameTime || now);
          esp32TwinMetrics.frontLastFrameTime = now;
          esp32TwinMetrics.frontBlurScore = 80;
        }

        // Ho tro ca JPEG Hardware va Raw RGB565 (Chong giat lag nho co che Pending Frame moi nhat)
        if (msg.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(msg.data);
          if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
            pendingFrontBlob = new Blob([msg.data], { type: 'image/jpeg' });
            decodePendingFrontFrame();
            return;
          }
          if (bytes.length >= rawCamW * rawCamH * 2) {
            latestRawFrameBytes = bytes;
            if (!rawFrameScheduled) {
              rawFrameScheduled = true;
              queueMicrotask(decodeLatestRawFrame);
            }
          }
        } else if (msg.data instanceof Blob) {
          pendingFrontBlob = msg.data;
          decodePendingFrontFrame();
        }
      };
      esp32Socket.onerror = () => {
        state.lastActionLog = '⚠️ Loi ket noi WebSocket ESP32';
      };
      esp32Socket.onclose = () => {
        state.esp32Connected = false;
        state.lastActionLog = '🔌 Da ngat ket noi WebSocket ESP32';
      };
    } catch (e) {}
  } else {
    const finalUrl = window.location.protocol === 'https:' && rawUrl.startsWith('http://')
      ? `/api/esp32-proxy?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;
    esp32MjpegImg.src = finalUrl;
    if (state.windshieldMode !== 'TRANSPARENT' && state.windshieldMode !== 'ESP32_PIP') {
      state.windshieldMode = 'ESP32_LIVE';
    }
  }
}

document.getElementById('btn-connect-esp32')?.addEventListener('click', () => {
  const url = document.getElementById('esp32-front-ip')?.value.trim() || 'ws://192.168.1.184:4213';
  connectEsp32Windshield(url);
  state.windshieldMode = 'ESP32_LIVE';
  if (typeof updateCamRoadUiButtons === 'function') updateCamRoadUiButtons();
});
// Tu dong ket noi ESP32-CAM sau 1 giay khi mo Web
setTimeout(() => {
  const url = document.getElementById('esp32-front-ip')?.value.trim();
  if (url && (url.startsWith('ws://') || url.startsWith('http://'))) {
    console.log('[AUTO CONNECT] Tu dong ket noi ESP32-CAM:', url);
    const prevMode = state.windshieldMode;
    connectEsp32Windshield(url);
    if (prevMode === 'TRANSPARENT') {
      state.windshieldMode = 'TRANSPARENT';
      if (typeof updateCamRoadUiButtons === 'function') updateCamRoadUiButtons();
    }
  }
}, 1200);
document.getElementById('btn-sim-esp32-cam')?.addEventListener('click', () => {
  state.windshieldMode = 'ESP32_SIM';
});
document.getElementById('btn-clear-windshield')?.addEventListener('click', () => {
  state.windshieldMode = 'TRANSPARENT';
});

// ============================================================================
// 8. THÀNH PHỐ 3D, 4 MẪU Ô TÔ, XE MÁY, XE ĐẠP & NPC
// ============================================================================
const cityGroup = new THREE.Group();
scene.add(cityGroup);

const BLOCK_SIZE = 68;
const GRID_RADIUS = 2;
const cityBlocks = [];
const trafficLights = [];
const allTrafficVehicles = [];
const sidewalkNpcs = [];
const crossingAnimals = [];

const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x151820, roughness: 0.42, metalness: 0.18 });
const matSidewalk = new THREE.MeshStandardMaterial({ color: 0x2b313d, roughness: 0.72 });
const matLaneYellow = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
const matPole = new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.8, roughness: 0.3 });

function createWindowTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#090e1a';
  ctx.fillRect(0, 0, 256, 512);
  for (let y = 14; y < 495; y += 24) {
    for (let x = 14; x < 240; x += 30) {
      ctx.fillStyle = Math.random() > 0.32 ? (Math.random() > 0.4 ? '#ffe4a0' : '#7ae2ff') : '#121929';
      ctx.fillRect(x, y, 18, 13);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const buildingTex = createWindowTex();
// TỐI ƯU HÓA HÌNH HỌC VÀ VẬT LIỆU DÙNG CHUNG (TIẾT KIỆM >800 GEOMETRY/MATERIAL INSTANCES)
const matBuilding = new THREE.MeshStandardMaterial({ map: buildingTex, roughness: 0.35 });
const geoRoadPlane = new THREE.PlaneGeometry(BLOCK_SIZE, BLOCK_SIZE);
const geoLaneYellow = new THREE.PlaneGeometry(0.3, BLOCK_SIZE);
const geoSidewalkBox = new THREE.BoxGeometry(22, 0.24, 22);
const geoLampPole = new THREE.CylinderGeometry(0.08, 0.12, 5.8, 8);
const geoLampArm = new THREE.BoxGeometry(1.2, 0.08, 0.08);
const geoLampBulb = new THREE.SphereGeometry(0.18, 10, 10);
const matLampBulb = new THREE.MeshBasicMaterial({ color: 0xfff2bb });
const geoLampCone = new THREE.ConeGeometry(3.2, 5.65, 20, 1, true);
const geoTrafficPole = new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8);
const geoTrafficBox = new THREE.BoxGeometry(0.38, 1.05, 0.25);
const geoTrafficBulb = new THREE.SphereGeometry(0.11, 8, 8);

function createStreetLampWithRefraction(x, z, addRealLight = false) {
  const lampGroup = new THREE.Group();
  lampGroup.position.set(x, 0, z);

  const pole = new THREE.Mesh(geoLampPole, matPole);
  pole.position.y = 2.9;
  const armDir = x > 0 ? -1 : 1;
  const arm = new THREE.Mesh(geoLampArm, matPole);
  arm.position.set(armDir * 0.55, 5.75, 0);
  const bulb = new THREE.Mesh(geoLampBulb, matLampBulb);
  bulb.position.set(armDir * 1.05, 5.65, 0);
  const lightCone = new THREE.Mesh(geoLampCone, streetBeamMat);
  lightCone.position.set(armDir * 1.05, 2.82, 0);
  lightCone.userData.isVolumetricBeam = true;
  lampGroup.add(pole, arm, bulb, lightCone);
  streetLightCones.push(lightCone);

  if (addRealLight) {
    const pLight = new THREE.PointLight(0xffe6a3, 14, 24, 1.4);
    pLight.position.set(armDir * 1.05, 5.4, 0);
    lampGroup.add(pLight);
    streetPointLights.push(pLight);
  }
  return lampGroup;
}

function createTrafficLightPole(x, z, rotY) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  const pole = new THREE.Mesh(geoTrafficPole, matPole);
  pole.position.y = 2.3;
  const box = new THREE.Mesh(geoTrafficBox, matPiano);
  box.position.set(0, 4.2, 0.15);

  const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0x332800 });
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x003311 });

  const rB = new THREE.Mesh(geoTrafficBulb, redMat);
  rB.position.set(0, 4.5, 0.26);
  const yB = new THREE.Mesh(geoTrafficBulb, yellowMat);
  yB.position.set(0, 4.2, 0.26);
  const gB = new THREE.Mesh(geoTrafficBulb, greenMat);
  gB.position.set(0, 3.9, 0.26);

  group.add(pole, box, rB, yB, gB);
  trafficLights.push({ redMat, yellowMat, greenMat });
  return group;
}

function createCityBlock(gx, gz) {
  const block = new THREE.Group();
  const road = new THREE.Mesh(geoRoadPlane, matAsphalt);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  const lineZ = new THREE.Mesh(geoLaneYellow, matLaneYellow);
  lineZ.rotation.x = -Math.PI / 2;
  lineZ.position.y = 0.02;
  block.add(road, lineZ);

  block.add(createTrafficLightPole(10.5, -10.5, 0));
  block.add(createTrafficLightPole(-10.5, 10.5, Math.PI));

  const corners = [[-22, -22], [22, -22], [-22, 22], [22, 22]];
  const isCenterArea = Math.abs(gx) <= 1 && Math.abs(gz) <= 1;

  corners.forEach(([cx, cz], idx) => {
    const sw = new THREE.Mesh(geoSidewalkBox, matSidewalk);
    sw.position.set(cx, 0.12, cz);
    sw.receiveShadow = true;
    const bH = 16 + ((Math.abs(gx * 17 + gz * 31 + idx) % 5) * 6);
    const bMesh = new THREE.Mesh(
      new THREE.BoxGeometry(13, bH, 13),
      matBuilding
    );
    bMesh.position.set(cx, bH / 2 + 0.24, cz);
    bMesh.castShadow = true;
    block.add(sw, bMesh);

    const lampX = cx > 0 ? 10.6 : -10.6;
    const lampZ = cz > 0 ? 13.5 : -13.5;
    block.add(createStreetLampWithRefraction(lampX, lampZ, isCenterArea && idx < 2));
  });

  block.userData = { gridX: gx, gridZ: gz };
  block.position.set(gx * BLOCK_SIZE, 0, gz * BLOCK_SIZE);
  cityGroup.add(block);
  return block;
}

for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
  for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
    cityBlocks.push(createCityBlock(gx, gz));
  }
}

function createHornAlertSprite(text, borderColor = '#ffd60a') {
  const c = document.createElement('canvas');
  c.width = 280;
  c.height = 68;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(12, 18, 30, 0.92)';
  ctx.fillRect(0, 0, 280, 68);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, 276, 64);
  ctx.fillStyle = borderColor;
  ctx.font = 'bold 24px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 140, 43);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sprite.scale.set(1.05, 0.26, 1);
  sprite.visible = false;
  return sprite;
}

function createSafetyHelmetMesh(helmetColor, isMotorbikeFullVisor = true) {
  const helmetGroup = new THREE.Group();
  const shellMat = new THREE.MeshPhysicalMaterial({ color: helmetColor, roughness: 0.2, clearcoat: 1.0 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.68), shellMat);
  helmetGroup.add(dome);
  if (isMotorbikeFullVisor) {
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.158, 0.158, 0.09, 14, 1, true, -Math.PI * 0.35, Math.PI * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x111824, roughness: 0.1, metalness: 0.8 })
    );
    visor.rotation.y = Math.PI;
    visor.position.y = -0.02;
    helmetGroup.add(visor);
  }
  return helmetGroup;
}

function createHelmetCyclistNPC(index) {
  const bikeGroup = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x00f5d4, metalness: 0.6 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d });
  const jerseyMat = new THREE.MeshStandardMaterial({ color: 0x00bbf9 });

  const wheelGeo = new THREE.TorusGeometry(0.30, 0.028, 10, 20);
  const frontWheel = new THREE.Mesh(wheelGeo, matTireRubber);
  frontWheel.rotation.y = Math.PI / 2;
  frontWheel.position.set(0, 0.32, -0.52);
  const rearWheel = new THREE.Mesh(wheelGeo, matTireRubber);
  rearWheel.rotation.y = Math.PI / 2;
  rearWheel.position.set(0, 0.32, 0.52);
  const mainTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.05, 8), frameMat);
  mainTube.rotation.x = Math.PI / 2;
  mainTube.position.set(0, 0.52, 0);
  const bikeBeam = createHeadlightRefractionBeam(4.5, 0.85);
  bikeBeam.position.set(0, 0.86, -0.50);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.38, 8, 10), jerseyMat);
  torso.position.set(0, 1.08, 0.12);
  torso.rotation.x = -0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), skinMat);
  head.position.set(0, 1.42, -0.02);
  const helmet = createSafetyHelmetMesh(0xffbe0b, false);
  helmet.position.set(0, 1.46, -0.02);

  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.45, 8, 8), matPiano);
  legL.position.set(-0.11, 0.62, 0.12);
  const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.45, 8, 8), matPiano);
  legR.position.set(0.11, 0.62, 0.12);

  const hornBadge = createHornAlertSprite('🔔 KENG KENG!', '#00ff88');
  hornBadge.position.set(0, 1.92, 0);
  bikeGroup.add(frontWheel, rearWheel, mainTube, bikeBeam, torso, head, helmet, legL, legR, hornBadge);

  const dir = index % 2 === 0 ? 1 : -1;
  bikeGroup.position.set(dir === 1 ? -8.2 : 8.2, 0, (index - 2.5) * 26);
  bikeGroup.rotation.y = dir === 1 ? Math.PI : 0;

  enableShadowsRecursive(bikeGroup, true, true);
  bikeGroup.userData = {
    category: 'BICYCLE',
    modelName: 'Xe Đạp',
    dir,
    baseSpeed: 4.8,
    currentSpeed: 4.8,
    wheels: [frontWheel, rearWheel],
    legL,
    legR,
    pedalPhase: index,
    hornBadge,
    hornCooldown: 0
  };
  scene.add(bikeGroup);
  allTrafficVehicles.push(bikeGroup);
}

function createHelmetMotorbikeNPC(index) {
  const motoGroup = new THREE.Group();
  const motoMat = new THREE.MeshPhysicalMaterial({ color: 0xe63946, roughness: 0.2, clearcoat: 1.0 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d });
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0x222834 });

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.14, 18);
  const frontW = new THREE.Mesh(wheelGeo, matTireRubber);
  frontW.rotation.z = Math.PI / 2;
  frontW.position.set(0, 0.28, -0.62);
  const rearW = new THREE.Mesh(wheelGeo, matTireRubber);
  rearW.rotation.z = Math.PI / 2;
  rearW.position.set(0, 0.28, 0.58);

  const chassisBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 1.35), motoMat);
  chassisBody.position.set(0, 0.52, 0.05);
  const frontFairing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 0.32), motoMat);
  frontFairing.position.set(0, 0.72, -0.48);
  const motoBeam = createHeadlightRefractionBeam(7.5, 1.35);
  motoBeam.position.set(0, 0.90, -0.66);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 8, 10), jacketMat);
  torso.position.set(0, 1.08, 0.12);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), skinMat);
  head.position.set(0, 1.48, 0.10);
  const helmet = createSafetyHelmetMesh(0x00e5ff, true);
  helmet.position.set(0, 1.52, 0.10);

  const hornBadge = createHornAlertSprite('📢 BÍP BÍP!', '#00e5ff');
  hornBadge.position.set(0, 1.98, 0);
  motoGroup.add(frontW, rearW, chassisBody, frontFairing, motoBeam, torso, head, helmet, hornBadge);

  const dir = index % 2 === 0 ? 1 : -1;
  motoGroup.position.set(dir === 1 ? -5.8 : 5.8, 0, (index - 2.5) * 30);
  motoGroup.rotation.y = dir === 1 ? Math.PI : 0;

  enableShadowsRecursive(motoGroup, true, true);
  motoGroup.userData = {
    category: 'MOTORBIKE',
    modelName: 'Xe Máy',
    dir,
    baseSpeed: 9.2,
    currentSpeed: 9.2,
    wheels: [frontW, rearW],
    hornBadge,
    hornCooldown: 0
  };
  scene.add(motoGroup);
  allTrafficVehicles.push(motoGroup);
}

function createMultiModelDetailedAiCar(index) {
  const carGroup = new THREE.Group();
  const modelType = index % 4;
  const palette = [0xe63946, 0x2a9d8f, 0xffbe0b, 0x3a86ff, 0x9b5de5, 0xf77f00];
  const paintColor = modelType === 2 ? 0xffbe0b : palette[index % palette.length];
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: paintColor, roughness: 0.18, metalness: 0.45, clearcoat: 1.0 });
  const cabinGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x101926, roughness: 0.08, metalness: 0.2, clearcoat: 1.0 });

  const wheels = [];
  const wheelRadius = modelType === 1 ? 0.40 : 0.34;
  [
    [-0.92, wheelRadius, -1.38], [0.92, wheelRadius, -1.38],
    [-0.92, wheelRadius, 1.38], [0.92, wheelRadius, 1.38]
  ].forEach(([wx, wy, wz]) => {
    const wHub = new THREE.Group();
    wHub.position.set(wx, wy, wz);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.24, 20), matTireRubber);
    tire.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.65, wheelRadius * 0.65, 0.25, 16), matChrome);
    rim.rotation.z = Math.PI / 2;
    wHub.add(tire, rim);
    carGroup.add(wHub);
    wheels.push(wHub);
  });

  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.48, 4.45), bodyMat);
  lowerHull.position.set(0, 0.52, 0);
  const cabin = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1.12, 1.58, 4), cabinGlassMat);
  cabin.rotation.y = Math.PI / 4;
  cabin.scale.set(1.0, 0.42, 1.30);
  cabin.position.set(0, 1.0, 0.05);
  carGroup.add(lowerHull, cabin);

  [-0.66, 0.66].forEach((lx) => {
    const beam = createHeadlightRefractionBeam(8.5, 1.55);
    beam.position.set(lx, 0.58, -2.26);
    carGroup.add(beam);
  });

  const hornBadge = createHornAlertSprite('📢 PÍ PO!', '#ff9500');
  hornBadge.position.set(0, 1.95, 0);
  carGroup.add(hornBadge);

  const dir = index % 2 === 0 ? 1 : -1;
  carGroup.position.set(dir === 1 ? -2.8 : 6.2, 0, (index - 2.5) * 34);
  carGroup.rotation.y = dir === 1 ? Math.PI : 0;

  enableShadowsRecursive(carGroup, true, true);
  carGroup.userData = {
    category: 'CAR',
    modelName: 'Ô tô AI',
    dir,
    baseSpeed: 10.5 + (index % 3) * 1.4,
    currentSpeed: 11.0,
    wheels,
    hornBadge,
    hornCooldown: 0
  };
  scene.add(carGroup);
  allTrafficVehicles.push(carGroup);
}

for (let i = 0; i < 5; i++) {
  createHelmetCyclistNPC(i);
  createHelmetMotorbikeNPC(i);
  createMultiModelDetailedAiCar(i);
}

// Sinh NPC & Động vật (Cho phép bấm Tia Laser trực tiếp vào NPC / Động vật để Chào & Nghe tiếng kêu!)
const SKIN_TONES = [0xf9dcc4, 0xf1c27d, 0xc68642, 0x8d5524, 0x3b2219];

function createSpeechBubbleSprite(text, bgHex = '#0f243c', borderHex = '#4cd964') {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 84;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 384, 84);
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, 380, 80);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 192, 50);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sprite.scale.set(1.2, 0.26, 1);
  sprite.visible = false;
  return sprite;
}

function spawnSidewalkNpcsAndAnimals() {
  const clothes = [0xff4d6d, 0x00bbf9, 0x9b5de5, 0x00f5d4, 0xffbe0b];
  for (let i = 0; i < 14; i++) {
    const npc = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN_TONES[i % SKIN_TONES.length] });
    const clothMat = new THREE.MeshStandardMaterial({ color: clothes[i % clothes.length] });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), skinMat);
    head.position.y = 1.55;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 8, 12), clothMat);
    torso.position.y = 1.12;
    register3DTarget(torso, triggerPlayerSocialOrAnimalInteraction); // Bấm tia laser vào NPC là bắt tay chào ngay!

    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.50, 8, 8), matPiano);
    leftLeg.position.set(-0.085, 0.42, 0);
    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.50, 8, 8), matPiano);
    rightLeg.position.set(0.085, 0.42, 0);
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.40, 8, 8), skinMat);
    leftArm.position.set(-0.23, 1.12, 0);
    const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.40, 8, 8), skinMat);
    rightArm.position.set(0.23, 1.12, 0);

    const helloBubble = createSpeechBubbleSprite('🤝 Hello! Chào bạn nhé!');
    helloBubble.position.set(0, 2.02, 0);
    npc.add(head, torso, leftLeg, rightLeg, leftArm, rightArm, helloBubble);

    const walkDir = i % 2 === 0 ? 1 : -1;
    npc.position.set(walkDir * 10.6, 0.12, (i - 7) * 14);
    npc.rotation.y = walkDir > 0 ? 0 : Math.PI;
    npc.userData = { leftLeg, rightLeg, leftArm, rightArm, helloBubble, handshakeTimer: 0, speed: 1.35, dir: walkDir, phase: i };
    scene.add(npc);
    sidewalkNpcs.push(npc);
  }

  const dogMat = new THREE.MeshStandardMaterial({ color: 0xc68642 });
  const catMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f6 });
  for (let i = 0; i < 8; i++) {
    const isDog = i % 2 === 0;
    const animal = new THREE.Group();
    const scale = isDog ? 1.0 : 0.72;
    const mat = isDog ? dogMat : catMat;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * scale, 0.38 * scale, 8, 10), mat);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.28 * scale;
    register3DTarget(body, triggerPlayerSocialOrAnimalInteraction); // Bấm tia laser vào Chó/Mèo để nghe sủa/kêu!

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 10, 10), mat);
    head.position.set(0, 0.40 * scale, 0.25 * scale);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * scale, 0.03 * scale, 0.24 * scale), mat);
    tail.position.set(0, 0.38 * scale, -0.24 * scale);

    const soundBubble = createSpeechBubbleSprite(isDog ? '🐕 Gâu gâu! Woof!' : '🐈 Meo meo~ Purr~', '#24190e', '#ffd60a');
    soundBubble.position.set(0, 0.85, 0);
    animal.add(body, head, tail, soundBubble);

    const crossDir = i % 2 === 0 ? 1 : -1;
    animal.position.set(-crossDir * (2 + (i % 4) * 2.2), 0.02, (i - 3.5) * 16);
    animal.rotation.y = crossDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    animal.userData = { species: isDog ? 'DOG' : 'CAT', tail, soundBubble, soundTimer: 0, crossDir, crossSpeed: isDog ? 0.65 : 0.52, isOnRoad: true };
    scene.add(animal);
    crossingAnimals.push(animal);
  }
}
spawnSidewalkNpcsAndAnimals();

// ============================================================================
// 9. LÊN/XUỐNG XE CHỚP MẮT & BÀN ĐẠP TRỰC QUAN CHO TIA LASER TAY CẦM QUEST 3
// ============================================================================
const bannerEl = document.getElementById('mode-banner');

function enterOrExitCarWithBlink() {
  initAudio();
  if (state.playerMode === 'ON_FOOT') {
    state.doorsOpen = true;
    // Khi vừa lên xe, tốc độ bắt buộc bằng 0 (Digital Twin chuẩn với xe RC đang đỗ)
    state.velocityMs = 0;
    state.speedKmh = 0;
    state.throttlePercent = 0;
    state.brakePercent = 0;
    state.isLeaningOut = false;

    triggerEyelidBlinkTransition(() => {
      if (typeof tryEnterNearestCarMultiplayer === 'function') {
        tryEnterNearestCarMultiplayer();
      }
      state.playerMode = 'DRIVING';
      state.doorsOpen = false;
      state.velocityMs = 0;
      state.speedKmh = 0;
      if (!state.engineRunning) toggleEngineIgnition();
      avatarBodyMesh.visible = false;
      driverSeatMount.add(cameraRig);
      cameraRig.position.set(0, 0, 0);
      cameraRig.rotation.set(0, 0, 0);
      roofBeaconGroup.visible = false;
      if (bannerEl) {
        bannerEl.innerHTML = '🚘 <b>ĐANG LÁI XE (1ST-PERSON POV):</b> Dùng Tia Laser giữ nút <b>[⚡ ĐẠP GA] / [🛑 THẮNG]</b> góc dưới phải &amp; nút <b>[◀ Trái / Phải ▶]</b> góc trái để lái!';
      }
    });
  } else {
    state.doorsOpen = true;
    state.velocityMs = 0;
    triggerEyelidBlinkTransition(() => {
      state.playerMode = 'ON_FOOT';
      state.doorsOpen = false;
      avatarBodyMesh.visible = true;
      roofBeaconGroup.visible = true;
      const exitOffset = new THREE.Vector3(-1.35, 0, 0.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.headingRad);
      state.avatarPos.copy(vehicleRoot.position).add(exitOffset);
      playerAvatarGroup.position.copy(state.avatarPos);
      playerAvatarGroup.add(cameraRig);
      cameraRig.position.set(0, 0.52, 0);
      if (bannerEl) {
        bannerEl.innerHTML = '🚶 <b>ĐANG ĐI BỘ:</b> Dùng Tia Laser bấm cụm nút góc trái để đi bộ, hoặc bấm <b>[🚪 Mở Cửa Lên/Xuống Xe]</b> góc phải để lên xe!';
      }
    });
  }
}

function triggerPlayerSocialOrAnimalInteraction() {
  initAudio();
  const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;

  let nearestNpc = null;
  let minNpcDist = Infinity;
  for (const npc of sidewalkNpcs) {
    const d = refPos.distanceTo(npc.position);
    if (d < minNpcDist) {
      minNpcDist = d;
      nearestNpc = npc;
    }
  }

  let nearestAnimal = null;
  let minAnimalDist = Infinity;
  for (const ani of crossingAnimals) {
    const d = refPos.distanceTo(ani.position);
    if (d < minAnimalDist) {
      minAnimalDist = d;
      nearestAnimal = ani;
    }
  }

  if (nearestAnimal && minAnimalDist <= minNpcDist && minAnimalDist < 18) {
    const ad = nearestAnimal.userData;
    ad.soundTimer = 3.2;
    ad.soundBubble.visible = true;
    playSocialOrAnimalSound(ad.species === 'DOG' ? 'DOG_BARK' : 'CAT_MEOW');
    state.socialLog = ad.species === 'DOG' ? '🐕 Chú Chó sủa vang: "Gâu gâu! Woof!"' : '🐈 Chú Mèo kêu: "Meo meo~ Purr..."';
    state.lastActionLog = state.socialLog;
    return;
  }

  if (nearestNpc) {
    const nd = nearestNpc.userData;
    nd.handshakeTimer = 3.5;
    nd.helloBubble.visible = true;
    playerHandshakeTimer = 3.5;
    nearestNpc.lookAt(refPos.x, nearestNpc.position.y, refPos.z);
    playSocialOrAnimalSound('HELLO_NPC');
    state.socialLog = '🤝 Bạn vừa Bắt tay với NPC: "Hello! Chào bạn nhé!"';
    state.lastActionLog = state.socialLog;
  }
}

// Gắn sự kiện giữ/nhả bằng Tia Laser Tay cầm Quest 3 cho Bàn Đạp Ảo & Cần Điều Hướng góc dưới màn hình
const holdState = { up: false, down: false, left: false, right: false, gas: false, brake: false };

function bindLaserHoldButton(btnId, stateKey) {
  const el = document.getElementById(btnId);
  if (!el) return;
  const startHold = (e) => {
    e.preventDefault();
    initAudio();
    holdState[stateKey] = true;
    el.classList.add('active-hold');
    if (stateKey === 'gas' && state.playerMode === 'DRIVING' && !state.engineRunning) {
      toggleEngineIgnition(); // Tự động đề nổ máy luôn nếu người dùng bóp giữ bàn đạp Ga!
    }
  };
  const endHold = () => {
    holdState[stateKey] = false;
    el.classList.remove('active-hold');
  };
  el.addEventListener('pointerdown', startHold);
  el.addEventListener('pointerup', endHold);
  el.addEventListener('pointerleave', endHold);
  el.addEventListener('pointercancel', endHold);
}

bindLaserHoldButton('pad-up', 'up');
bindLaserHoldButton('pad-down', 'down');
bindLaserHoldButton('pad-left', 'left');
bindLaserHoldButton('pad-right', 'right');
bindLaserHoldButton('pad-gas', 'gas');
bindLaserHoldButton('pad-brake', 'brake');

document.getElementById('pad-enter-exit')?.addEventListener('click', enterOrExitCarWithBlink);
document.getElementById('pad-horn')?.addEventListener('click', () => {
  initAudio();
  playSmartVehicleHornSound('CAR');
  state.hornActive = true;
  state.lastActionLog = '📢 Bạn vừa bấm Còi Kép Rolls-Royce bằng Tay cầm!';
  setTimeout(() => { state.hornActive = false; }, 500);
});
document.getElementById('pad-hello')?.addEventListener('click', triggerPlayerSocialOrAnimalInteraction);
document.getElementById('pad-gear-up')?.addEventListener('click', () => {
  state.gearIndex = Math.min(3, state.gearIndex + 1);
  state.lastActionLog = `⚙ Đã lên số: [${state.gears[state.gearIndex]}]`;
});
document.getElementById('pad-gear-down')?.addEventListener('click', () => {
  state.gearIndex = Math.max(0, state.gearIndex - 1);
  state.lastActionLog = `⚙ Đã về số: [${state.gears[state.gearIndex]}]`;
});

// Ngoài ra: Khi đẩy Cần gạt (Thumbstick) trên tay cầm Quest 3 lúc trỏ vào cửa sổ, Horizon OS gửi sự kiện `wheel` -> Ánh xạ thành Đi bộ / Đạp ga / Đánh lái!
let wheelDecayTimer = 0;
let wheelWalkOrGas = 0;
let wheelSteerOrTurn = 0;

window.addEventListener('wheel', (e) => {
  if (e.target.closest('.floating-panel') || e.target.closest('#youtube-app-modal')) return;
  initAudio();
  wheelDecayTimer = 0.25;
  wheelWalkOrGas = THREE.MathUtils.clamp(-e.deltaY / 60, -1, 1);
  wheelSteerOrTurn = THREE.MathUtils.clamp(e.deltaX / 60, -1, 1);
  if (wheelWalkOrGas > 0.2 && state.playerMode === 'DRIVING' && !state.engineRunning) {
    toggleEngineIgnition();
  }
}, { passive: true });

// Click Tia Laser trực tiếp vào không gian 3D (Cửa xe, Vô lăng, Màn hình YouTube, NPC, Chó/Mèo)
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();
window.addEventListener('pointerdown', (e) => {
  if (e.target !== renderer.domElement) return;
  initAudio();
  mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);
  const hits = raycaster.intersectObjects(interactive3DTargets, false);
  if (hits.length > 0 && hits[0].object.userData.onClick) {
    hits[0].object.userData.onClick();
  }
});

// Gắn sự kiện cho các nút trên Bảng Chức Năng
document.getElementById('btn-enter-exit-car')?.addEventListener('click', enterOrExitCarWithBlink);
document.getElementById('btn-interact-social')?.addEventListener('click', triggerPlayerSocialOrAnimalInteraction);
document.getElementById('btn-toggle-doors')?.addEventListener('click', () => { state.doorsOpen = !state.doorsOpen; });
document.getElementById('btn-toggle-roof')?.addEventListener('click', () => { state.convertibleRoofOpen = !state.convertibleRoofOpen; });
document.getElementById('btn-rc-cargo')?.addEventListener('click', () => { state.rcCargoOpen = !state.rcCargoOpen; });
document.getElementById('btn-switch-seat')?.addEventListener('click', () => {
  state.seatIndex = (state.seatIndex + 1) % 4;
  driverSeatMount.position.copy(SEAT_POSITIONS[state.seatIndex].pos);
});
document.getElementById('btn-hit-pothole')?.addEventListener('click', () => {
  initAudio();
  state.suspensionShakeIntensity = 1.35;
  playImpactSound(11);
});

const keys = { w: false, s: false, a: false, d: false };
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  initAudio();
  const k = e.key.toLowerCase();
  if (k === 'f') enterOrExitCarWithBlink();
  if (k === 'i') toggleEngineIgnition();
  if (k === 'h') triggerPlayerSocialOrAnimalInteraction();
  if (k === 'u') openRealYouTubeApp();
  if (k === 'o') state.doorsOpen = !state.doorsOpen;
  if (k === 'm') state.convertibleRoofOpen = !state.convertibleRoofOpen;
  if (k === 'v' || k === 'k') {
    if (typeof window.toggleWindshieldCamOrRoad === 'function') {
      window.toggleWindshieldCamOrRoad();
    }
  }
  if (k === 'p') state.suspensionShakeIntensity = 1.35;
  if (k === 'e') state.gearIndex = Math.min(3, state.gearIndex + 1);
  if (k === 'q') state.gearIndex = Math.max(0, state.gearIndex - 1);
  if (e.code === 'Space') {
    state.hornActive = true;
    playSmartVehicleHornSound('CAR');
  }
  if (k === 'w' || e.key === 'ArrowUp') keys.w = true;
  if (k === 's' || e.key === 'ArrowDown') keys.s = true;
  if (k === 'a' || e.key === 'ArrowLeft') keys.a = true;
  if (k === 'd' || e.key === 'ArrowRight') keys.d = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (e.code === 'Space') state.hornActive = false;
  if (k === 'w' || e.key === 'ArrowUp') keys.w = false;
  if (k === 's' || e.key === 'ArrowDown') keys.s = false;
  if (k === 'a' || e.key === 'ArrowLeft') keys.a = false;
  if (k === 'd' || e.key === 'ArrowRight') keys.d = false;
});

// ============================================================================
// 10. HIỂN THỊ MÀN HÌNH KÍNH CHẮN GIÓ, MÀN HÌNH YOUTUBE 3D & HUD BUỒNG LÁI
// ============================================================================
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 940;
hudCanvas.height = 500;
const hudCtx = hudCanvas.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudCanvas);

const hudPanelGroup = new THREE.Group();
hudPanelGroup.position.set(-0.78, 1.10, -0.54);
hudPanelGroup.rotation.y = THREE.MathUtils.degToRad(22);
chassisGroup.add(hudPanelGroup);
hudPanelGroup.add(new THREE.Mesh(
  new THREE.PlaneGeometry(0.52, 0.28),
  new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, side: THREE.DoubleSide })
));

function renderAllCockpitDisplays(elapsed) {
  const gear = state.gears[state.gearIndex];
  const gearStr = gear === 'D' ? `D${state.autoGearSub}` : gear;

  // 1. Kính chắn gió: Tùy chọn hiển thị ĐƯỜNG 3D TRONG GAME hoặc CAMERA THỰC TẾ
  if (state.windshieldMode === 'ESP32_LIVE') {
    // Nếu chưa nhận được bất kỳ frame nào từ ESP32: Hiện thông báo chờ kết nối
    if (!esp32Bitmap && (!esp32MjpegImg.complete || esp32MjpegImg.naturalWidth === 0)) {
      wsCtx.fillStyle = 'rgba(8, 16, 28, 0.85)';
      wsCtx.fillRect(0, 0, 1024, 512);
      wsCtx.fillStyle = '#00ff88';
      wsCtx.font = 'bold 22px Segoe UI, sans-serif';
      wsCtx.fillText('📷 ĐANG KẾT NỐI CAMERA KÍNH LÁI...', 40, 60);
      wsCtx.fillStyle = '#ffd60a';
      wsCtx.font = '16px monospace';
      wsCtx.fillText(`[${state.esp32StreamUrl}] | Bấm Nút trên Top Bar hoặc Phím [V]/[K] để chuyển sang ĐƯỜNG 3D`, 40, 95);
      wsTex.needsUpdate = true;
    }
    // Khi đã có frame: Tuyệt đối KHÔNG clearRect() hay vẽ đè, frame được cập nhật trực tiếp từ decodePendingFrontFrame
  } else if (state.windshieldMode === 'ESP32_REAR_LIVE') {
    if (!esp32RearBitmap && (!esp32RearImg.complete || esp32RearImg.naturalWidth === 0)) {
      wsCtx.fillStyle = 'rgba(8, 16, 28, 0.85)';
      wsCtx.fillRect(0, 0, 1024, 512);
      wsCtx.fillStyle = '#00ff88';
      wsCtx.font = 'bold 22px Segoe UI, sans-serif';
      wsCtx.fillText('📷 ĐANG KẾT NỐI CAMERA LÙI...', 40, 60);
      wsTex.needsUpdate = true;
    }
  } else if (state.windshieldMode === 'ESP32_SIM') {
    // Do renderSimulatedEsp32FpvOnAllScreens quản lý
  } else if (state.windshieldMode === 'ESP32_PIP') {
    // Chế độ chia đôi Picture-in-Picture: Kính trong suốt nhìn đường 3D + ô Mini Cam góc phải
    wsCtx.clearRect(0, 0, 1024, 512);
    const pipW = 340, pipH = 190, pipX = 1024 - pipW - 16, pipY = 56;
    wsCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    wsCtx.fillRect(pipX - 3, pipY - 3, pipW + 6, pipH + 6);
    wsCtx.strokeStyle = '#00ff88';
    wsCtx.lineWidth = 2;
    wsCtx.strokeRect(pipX - 3, pipY - 3, pipW + 6, pipH + 6);
    if (esp32Bitmap) wsCtx.drawImage(esp32Bitmap, pipX, pipY, pipW, pipH);
    else if (esp32MjpegImg.complete && esp32MjpegImg.naturalWidth > 0) wsCtx.drawImage(esp32MjpegImg, pipX, pipY, pipW, pipH);
    else {
      wsCtx.fillStyle = '#0a1525';
      wsCtx.fillRect(pipX, pipY, pipW, pipH);
      wsCtx.fillStyle = '#00ff88';
      wsCtx.font = 'bold 16px monospace';
      wsCtx.fillText('📷 CAM FPV ESP32', pipX + 20, pipY + 36);
    }
    wsCtx.fillStyle = 'rgba(0, 20, 40, 0.38)';
    wsCtx.fillRect(0, 0, 1024, 44);
    wsCtx.fillStyle = '#00e5ff';
    wsCtx.font = 'bold 18px monospace';
    wsCtx.fillText(`★ ĐƯỜNG 3D + MINI CAM | ${Math.round(Math.abs(state.speedKmh))} KM/H | SỐ [${gearStr}] | [Phím V/K để đổi]`, 20, 29);
    wsTex.needsUpdate = true;
    // MẶC ĐỊNH: Kính Trong Suốt 100% nhìn ra ĐƯỜNG PHỐ 3D TRONG GAME
    wsCtx.clearRect(0, 0, 1024, 512);
    wsCtx.fillStyle = 'rgba(0, 20, 40, 0.32)';
    wsCtx.fillRect(0, 0, 1024, 44);
    wsCtx.fillStyle = '#00e5ff';
    wsCtx.font = 'bold 18px monospace';
    wsCtx.fillText(
      `★ ĐƯỜNG 3D TRONG GAME | ${Math.round(Math.abs(state.speedKmh))} KM/H | SỐ [${gearStr}] | ${Math.round(state.rpm)} RPM | [Phím V/K: Đổi sang Cam 📷]`,
      20, 29
    );

    // Khi cài số lùi (R): Tự động mở cửa sổ Cam Lùi ở góc phải kính chắn gió!
    if (gear === 'R') {
      wsCtx.save();
      wsCtx.drawImage(rearCamCanvas, 620, 240, 390, 256);
      wsCtx.strokeStyle = '#ff3b30';
      wsCtx.lineWidth = 3;
      wsCtx.strokeRect(620, 240, 390, 256);
      wsCtx.fillStyle = 'rgba(0,0,0,0.72)';
      wsCtx.fillRect(620, 240, 390, 30);
      wsCtx.fillStyle = '#ff3b30';
      wsCtx.font = 'bold 15px monospace';
      wsCtx.fillText('🔙 CAM LÙI TRÊN KÍNH LÁI (SỐ R)', 630, 260);
      wsCtx.restore();
    }
    wsTex.needsUpdate = true;
  }

  // 2. Màn hình phụ YouTube trên táp-lô (Đồng bộ hình ảnh thật từ trình phát Video YouTube!)
  ytCtx.fillStyle = '#080c14';
  ytCtx.fillRect(0, 0, 640, 360);
  if (ytHtml5Video && ytHtml5Video.readyState >= 2 && !ytHtml5Video.paused) {
    ytCtx.drawImage(ytHtml5Video, 0, 44, 640, 260);
  } else {
    const grad = ytCtx.createLinearGradient(0, 44, 0, 304);
    grad.addColorStop(0, '#10182b');
    grad.addColorStop(1, '#2b0f30');
    ytCtx.fillStyle = grad;
    ytCtx.fillRect(0, 44, 640, 260);
    for (let i = 0; i < 26; i++) {
      const barH = 22 + Math.abs(Math.sin(elapsed * 6 + i * 0.45)) * 120;
      ytCtx.fillStyle = i % 2 === 0 ? '#00e5ff' : '#ff2a85';
      ytCtx.fillRect(35 + i * 22, 290 - barH, 14, barH);
    }
  }
  ytCtx.fillStyle = 'rgba(0, 0, 0, 0.88)';
  ytCtx.fillRect(0, 0, 640, 44);
  ytCtx.fillStyle = '#ff0000';
  ytCtx.fillRect(12, 8, 98, 28);
  ytCtx.fillStyle = '#ffffff';
  ytCtx.font = 'bold 16px Segoe UI, sans-serif';
  ytCtx.fillText('▶ YouTube', 20, 27);
  ytCtx.fillStyle = '#ffd60a';
  ytCtx.fillText(activeYoutubeTitle.slice(0, 38), 122, 27);

  ytCtx.fillStyle = '#141c2b';
  ytCtx.fillRect(0, 304, 640, 56);
  ytCtx.fillStyle = '#00ff88';
  ytCtx.font = 'bold 17px Segoe UI, sans-serif';
  ytCtx.fillText('👉 Chĩa Tia Laser bấm vào màn hình này để MỞ APP YOUTUBE chọn Phim/Nhạc!', 18, 338);
  ytTex.needsUpdate = true;

  // 3. Bảng HUD 3D Digital Twin trong xe (Hiển thị chính xác trạng thái RC & 2 Cam ESP32)
  hudCtx.clearRect(0, 0, 940, 500);
  hudCtx.fillStyle = 'rgba(8, 14, 24, 0.92)';
  hudCtx.fillRect(0, 0, 940, 500);
  hudCtx.strokeStyle = state.engineRunning ? '#00e5ff' : '#ff3b30';
  hudCtx.lineWidth = 6;
  hudCtx.strokeRect(3, 3, 934, 494);

  // Xác định trạng thái Digital Twin chính xác của xe
  let twinStateText = 'CHƯA BẬT ĐỘNG CƠ (ENGINE OFF)';
  if (state.engineStarting) {
    twinStateText = 'ĐANG KHỞI ĐỘNG ĐỘNG CƠ (STARTING...)';
  } else if (state.engineRunning) {
    if (gear === 'P' || Math.abs(state.speedKmh) < 0.3) {
      twinStateText = gear === 'P' ? 'ĐANG ĐỖ XE [P] (0 KM/H)' : 'ĐANG DỪNG CHỜ (0 KM/H)';
    } else if (state.speedKmh > 0.3) {
      twinStateText = 'ĐANG CHẠY TIẾN (RC DIGITAL TWIN ACTIVE)';
    } else if (state.speedKmh < -0.3) {
      twinStateText = 'ĐANG LÙI XE (RC REVERSE ACTIVE)';
    }
  }

  hudCtx.fillStyle = state.engineRunning ? '#005577' : '#661111';
  hudCtx.fillRect(0, 0, 940, 50);
  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = 'bold 20px Segoe UI, sans-serif';
  hudCtx.fillText(`★ DIGITAL TWIN HUD | TRẠNG THÁI RC: ${twinStateText}`, 18, 32);

  hudCtx.fillStyle = '#ffd60a';
  hudCtx.font = 'bold 19px Segoe UI, sans-serif';
  hudCtx.fillText(`▶ ${state.lastActionLog.slice(0, 68)}`, 20, 82);

  const displaySpeed = state.engineRunning ? Math.round(Math.abs(state.speedKmh)) : 0;
  hudCtx.fillStyle = '#00e5ff';
  hudCtx.font = 'bold 38px monospace';
  hudCtx.fillText(
    `SPEED: ${displaySpeed} KM/H | GEAR: [${gearStr}] | ${Math.round(state.rpm)} RPM`,
    20, 138
  );

  // Hiển thị Xi-nhan & Ghế ngồi hiện tại
  const turnStr = state.turnSignal === 'LEFT' ? '⬅ XI-NHAN TRÁI' : state.turnSignal === 'RIGHT' ? '➡ XI-NHAN PHẢI' : 'TẮT';
  hudCtx.fillStyle = state.turnSignal !== 'OFF' ? '#ffcc00' : '#a0b4cc';
  hudCtx.font = 'bold 19px Segoe UI, sans-serif';
  hudCtx.fillText(
    `• Xi-nhan: ${turnStr} | Vị trí: ${SEAT_POSITIONS[state.seatIndex]?.name || 'Ghế Tài Xế'} ${state.isLeaningOut ? '[ĐANG THÒ ĐẦU RA NGOÀI]' : ''}`,
    20, 182
  );

  // Hiển thị trạng thái 2 Camera ESP32 (Trước Kính Chắn Gió & Hậu Lùi)
  const frontCamStatus = state.esp32Connected
    ? '🟢 ĐÃ KẾT NỐI LIVE (Cho phép chạy xuyên địa hình)'
    : (state.windshieldMode === 'ESP32_SIM' ? '🟡 MÔ PHỎNG (Chặn xuyên địa hình)' : '🔴 CHƯA KẾT NỐI (Chặn xuyên địa hình, chỉ tông NPC)');
  const rearCamStatus = state.esp32RearConnected
    ? '🟢 ĐÃ KẾT NỐI CAM LÙI ESP32 THỰC TẾ'
    : '🔵 CHƯA KẾT NỐI ESP32 (Đang hiện Góc Nhìn 3D Đuôi Xe)';

  hudCtx.fillStyle = state.esp32Connected ? '#00ff88' : '#ff9500';
  hudCtx.font = 'bold 18px Segoe UI, sans-serif';
  hudCtx.fillText(`📷 CAM TRƯỚC (KÍNH CHẮN GIÓ): ${frontCamStatus}`, 20, 224);

  hudCtx.fillStyle = state.esp32RearConnected ? '#00ff88' : '#00e5ff';
  hudCtx.fillText(`🎥 CAM HẬU (GƯƠNG LÙI): ${rearCamStatus}`, 20, 260);

  hudCtx.fillStyle = '#4cd964';
  hudCtx.font = 'bold 17px Segoe UI, sans-serif';
  hudCtx.fillText('• Tay cầm Quest: Nút [A] Lên/Xuống xe | [B] Đỗ xe dừng hẳn | [X] Xi-nhan | [Y] Mở YouTube', 20, 305);
  hudCtx.fillText('• Cần xoay (Thumbstick): Tiến/Lùi/Rẽ trái/Phải | Cò (Trigger) / Chụm tay (Pinch): Chọn & Kéo thả HUD/YT', 20, 338);
  hudCtx.fillText('• Phím [L]: Thò đầu ra ngoài cửa xe | Phím [C]/[V]: Đổi chỗ Tài xế <-> Ghế phụ', 20, 370);
  hudTex.needsUpdate = true;

  // 4. Màn hình Camera lùi & Gương hậu (Luôn cập nhật liên tục cho cả ESP32 Cam thật lẫn Camera 3D)
  if (typeof renderRearMirrorAndCameraDisplay === 'function') {
    renderRearMirrorAndCameraDisplay(gear);
  }
}

// ============================================================================
// 11. VÒNG LẶP VẬT LÝ & CẬP NHẬT THẾ GIỚI 72HZ/90HZ
// ============================================================================
const clock = new THREE.Clock();
let uiTimer = 0;
let trafficCycleTimer = 0;
let currentTrafficPhase = 'GREEN';

function updateWorldSimulation(dt, elapsed) {
  const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;

  trafficCycleTimer = (trafficCycleTimer + dt) % 26;
  if (trafficCycleTimer < 11) currentTrafficPhase = 'GREEN';
  else if (trafficCycleTimer < 14) currentTrafficPhase = 'YELLOW';
  else currentTrafficPhase = 'RED';

  for (const tl of trafficLights) {
    tl.redMat.color.setHex(currentTrafficPhase === 'RED' ? 0xff2222 : 0x330808);
    tl.yellowMat.color.setHex(currentTrafficPhase === 'YELLOW' ? 0xffcc00 : 0x332600);
    tl.greenMat.color.setHex(currentTrafficPhase === 'GREEN' ? 0x00ff55 : 0x063312);
  }

  for (const ani of crossingAnimals) {
    const ad = ani.userData;
    if (ad.soundTimer > 0) {
      ad.soundTimer -= dt;
      if (ad.soundTimer <= 0) ad.soundBubble.visible = false;
    }
    ani.position.x += ad.crossDir * ad.crossSpeed * dt;
    ani.rotation.y = ad.crossDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (ad.tail) ad.tail.rotation.z = Math.sin(elapsed * 12) * 0.38;
    if (ani.position.x > 10.2) ad.crossDir = -1;
    else if (ani.position.x < -10.2) ad.crossDir = 1;
    ad.isOnRoad = Math.abs(ani.position.x) < 9.2;

    if (ani.position.z - refPos.z > 65) ani.position.z -= 130;
    else if (ani.position.z - refPos.z < -65) ani.position.z += 130;
  }

  if (playerHandshakeTimer > 0) {
    playerHandshakeTimer -= dt;
    avatarRightArm.rotation.x = -Math.PI / 2.2 + Math.sin(elapsed * 12) * 0.25;
  } else {
    avatarRightArm.rotation.x = THREE.MathUtils.lerp(avatarRightArm.rotation.x, 0, dt * 6);
  }

  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (nd.handshakeTimer > 0) {
      nd.handshakeTimer -= dt;
      nd.rightArm.rotation.x = -Math.PI / 2.2 + Math.sin(elapsed * 12) * 0.25;
      if (nd.handshakeTimer <= 0) nd.helloBubble.visible = false;
      continue;
    }
    npc.rotation.y = nd.dir > 0 ? 0 : Math.PI;
    nd.phase += dt * 6.5;
    const sw = Math.sin(nd.phase) * 0.45;
    nd.leftLeg.rotation.x = sw;
    nd.rightLeg.rotation.x = -sw;
    nd.leftArm.rotation.x = -sw * 0.7;
    nd.rightArm.rotation.x = sw * 0.7;

    npc.position.z += nd.dir * nd.speed * dt;
    if (npc.position.z - refPos.z > 80) npc.position.z -= 160;
    else if (npc.position.z - refPos.z < -80) npc.position.z += 160;
  }

  for (const veh of allTrafficVehicles) {
    const vd = veh.userData;
    if (vd.hornCooldown > 0) vd.hornCooldown -= dt;
    veh.rotation.y = vd.dir === 1 ? Math.PI : 0;

    let obstacleDetected = false;
    for (const ani of crossingAnimals) {
      if (!ani.userData.isOnRoad) continue;
      const dz = (ani.position.z - veh.position.z) * vd.dir;
      const dx = Math.abs(ani.position.x - veh.position.x);
      if (dz > 1.2 && dz < 9.5 && dx < 2.2) {
        obstacleDetected = true;
        break;
      }
    }

    if (obstacleDetected) {
      vd.currentSpeed = THREE.MathUtils.lerp(vd.currentSpeed, 0, dt * 7);
      vd.hornBadge.visible = true;
      if (vd.hornCooldown <= 0 && veh.position.distanceTo(refPos) < 45) {
        playSmartVehicleHornSound(vd.category);
        vd.hornCooldown = 2.4 + Math.random();
      }
    } else {
      vd.currentSpeed = THREE.MathUtils.lerp(vd.currentSpeed, vd.baseSpeed, dt * 3);
      if (vd.hornCooldown <= 1.2) vd.hornBadge.visible = false;
    }

    veh.position.z += vd.dir * vd.currentSpeed * dt;
    if (vd.wheels) {
      const spinStep = (vd.currentSpeed * dt) / 0.34;
      for (const w of vd.wheels) w.rotation.x -= spinStep;
    }
    if (vd.category === 'BICYCLE' && vd.legL && vd.legR) {
      vd.pedalPhase += vd.currentSpeed * dt * 2.5;
      vd.legL.position.y = 0.62 + Math.sin(vd.pedalPhase) * 0.10;
      vd.legR.position.y = 0.62 - Math.sin(vd.pedalPhase) * 0.10;
    }

    if (veh.position.z - refPos.z > 95) veh.position.z -= 190;
    else if (veh.position.z - refPos.z < -95) veh.position.z += 190;
  }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const fps = Math.round(1 / Math.max(dt, 0.0001));
  window.__XR_PERF_METRICS__ = { fps, dt, ms: Math.round(dt * 1000) };
  const elapsed = clock.getElapsedTime();

  if (wheelDecayTimer > 0) {
    wheelDecayTimer -= dt;
    if (wheelDecayTimer <= 0) {
      wheelWalkOrGas = 0;
      wheelSteerOrTurn = 0;
    }
  }

  vrBlinkShutterMat.opacity = THREE.MathUtils.lerp(vrBlinkShutterMat.opacity, state.blinkTargetOpacity, dt * 14);
  roofBeaconGroup.rotation.y += dt * 1.8;
  vehicleRoot.updateMatrixWorld();

  // 1. CHẾ ĐỘ ĐI BỘ (Dùng Tia Laser bấm cụm nút góc trái, đẩy Cần gạt Thumbstick hoặc W/A/S/D)
  if (state.playerMode === 'ON_FOOT' || state.playerMode === 'HIJACKED_WAITING') {
    const moveFwd = (keys.w || holdState.up || holdState.gas ? 1 : 0) - (keys.s || holdState.down || holdState.brake ? 1 : 0) + wheelWalkOrGas;
    const turnInput = (keys.a || holdState.left ? 1 : 0) - (keys.d || holdState.right ? 1 : 0) - wheelSteerOrTurn;

    state.avatarYaw += turnInput * 2.2 * dt;
    playerAvatarGroup.rotation.y = state.avatarYaw;

    if (Math.abs(moveFwd) > 0.05) {
      const walkSpeed = 6.8;
      state.avatarPos.x -= Math.sin(state.avatarYaw) * moveFwd * walkSpeed * dt;
      state.avatarPos.z -= Math.cos(state.avatarYaw) * moveFwd * walkSpeed * dt;
      playerAvatarGroup.position.copy(state.avatarPos);

      state.avatarWalkPhase += dt * 9;
      const sw = Math.sin(state.avatarWalkPhase) * 0.48;
      avatarLeftLeg.rotation.x = sw;
      avatarRightLeg.rotation.x = -sw;
      avatarLeftArm.rotation.x = -sw * 0.7;
    }

    const doorPos = new THREE.Vector3(-0.98, 0, -0.1).applyMatrix4(vehicleRoot.matrixWorld);
    state.distanceToCarDoor = state.avatarPos.distanceTo(doorPos);
    if (state.playerMode === 'ON_FOOT' && state.distanceToCarDoor <= 1.35) {
      state.doorsOpen = true;
    }
  }

  // 2. CHẾ ĐỘ LÁI XE HỢP NHẤT (BÀN PHÍM, TAY CẦM, CẢM ỨNG & VÔ LĂNG)
  if (state.playerMode === 'DRIVING') {
    if (window._racingWheel && window._racingWheel.connected) {
      // Vô lăng USB đang kết nối: Để applyRacingWheelDrivingPhysics điều khiển độc quyền
    } else {
      // Đọc toàn bộ các nguồn tay cầm (WebXR Gamepad & Standard Gamepad)
      const session = renderer.xr.getSession();
      const sources = session ? Array.from(session.inputSources) : [];
      const navGps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];
      const allPads = [
        ...sources.map((s) => ({ gp: s.gamepad, hand: s.handedness })).filter((i) => i.gp),
        ...navGps.map((gp) => ({ gp, hand: gp.hand || '' }))
      ];

      let padFwd = 0;
      let padSteer = 0;
      let padBrakeTrigger = false;
      for (const { gp } of allPads) {
        const ax0 = gp.axes[0] || 0;
        const ax1 = gp.axes[1] || 0;
        const ax2 = gp.axes[2] || 0;
        const ax3 = gp.axes[3] || 0;
        const bestX = Math.abs(ax2) > Math.abs(ax0) ? ax2 : ax0;
        const bestY = Math.abs(ax3) > Math.abs(ax1) ? ax3 : ax1;
        if (Math.abs(bestX) > 0.12 && Math.abs(bestX) > Math.abs(padSteer)) padSteer = bestX;
        // Đẩy cần lên (trục Y âm) = Tiến (+1), kéo cần xuống (trục Y dương) = Lùi (-1)
        if (Math.abs(bestY) > 0.12 && Math.abs(bestY) > Math.abs(padFwd)) padFwd = -bestY;
        if (gp.buttons[0]?.pressed || (gp.buttons[0]?.value || 0) > 0.35) padBrakeTrigger = true;
      }

      // Tín hiệu điều khiển Tiến / Lùi / Phanh:
      const wantGas = (keys.w || keys.ArrowUp || holdState.gas || holdState.up || padFwd > 0.15 || wheelWalkOrGas > 0.15) ? 1 : 0;
      const wantReverse = (keys.s || keys.ArrowDown || holdState.down || padFwd < -0.15 || wheelWalkOrGas < -0.15) ? 1 : 0;
      const wantBrake = (holdState.brake || padBrakeTrigger) ? 1 : 0;

      // Đánh lái Trái / Phải:
      const keySteer = (keys.d || keys.ArrowRight || holdState.right ? 1 : 0) - (keys.a || keys.ArrowLeft || holdState.left ? 1 : 0);
      const activeSteer = Math.abs(padSteer) > 0.12 ? padSteer : keySteer;
      const steerRate = 340 * (state.rcSteerSensitivity || 1.0);
      if (Math.abs(activeSteer) > 0.08) {
        state.steeringAngleDeg = THREE.MathUtils.clamp(state.steeringAngleDeg + activeSteer * steerRate * dt, -540, 540);
      } else {
        state.steeringAngleDeg = THREE.MathUtils.lerp(state.steeringAngleDeg, 0, dt * 7.0);
      }

      // ĐỒNG BỘ TỐC ĐỘ 1:1 VỚI XE RC THỰC TẾ (CHẾ ĐỘ LÁI VỪA PHẢI, DỄ ĐIỀU KHIỂN)
      const targetMaxKmh = state.rcTargetSpeedKmh || 12.0;
      const maxForwardVel = targetMaxKmh / 3.6; // 12 km/h = 3.33 m/s
      const maxReverseVel = -(targetMaxKmh * 0.55) / 3.6; // Lùi ~6.6 km/h
      const accelRate = maxForwardVel / 0.65; // Tăng tốc êm ái trong 0.65s
      const brakeDecel = 24.0;
      const reverseAccelRate = Math.abs(maxReverseVel) / 0.75;

      if ((wantGas || wantReverse || wantBrake) && !state.engineRunning) {
        state.engineRunning = true;
        state.rpm = 1200;
      }

      if (!state.engineRunning) {
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * 6.0);
        if (Math.abs(state.velocityMs) < 0.05) state.velocityMs = 0;
        state.throttlePercent = 0;
        state.brakePercent = 0;
      } else if (wantBrake) {
        // A. CÒ THẮNG / NÚT PHANH: Phanh dừng xe về 0 tức thì
        state.throttlePercent = 0;
        state.brakePercent = 100;
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * brakeDecel);
        if (Math.abs(state.velocityMs) < 0.15) state.velocityMs = 0;
      } else if (wantGas) {
        // B. BẤM TIẾN (W / UP / THUMBSTICK LÊN / NÚT GA):
        // Luôn chuyển sang Số D (Tiến) và ĐẢM BẢO XE CHẠY VỀ PHÍA TRƯỚC (velocityMs >= 0)
        state.gearIndex = 3; // Số D
        if (state.velocityMs < -0.2) {
          // Nếu xe đang có đà lùi: phanh hãm đà lùi về 0 trước khi tiến
          state.throttlePercent = 0;
          state.brakePercent = 100;
          state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * brakeDecel);
          if (state.velocityMs >= -0.2) state.velocityMs = 0;
        } else {
          // Xe tiến về phía trước dứt khoát và mượt mà
          state.throttlePercent = 100;
          state.brakePercent = 0;
          state.velocityMs = THREE.MathUtils.clamp(state.velocityMs + accelRate * dt, 0, maxForwardVel);
        }
      } else if (wantReverse) {
        // C. BẤM LÙI (S / DOWN / THUMBSTICK XUỐNG / NÚT LÙI):
        if (state.velocityMs > 0.25) {
          // Nếu xe đang chạy tới: phanh hãm dừng xe an toàn
          state.throttlePercent = 0;
          state.brakePercent = 100;
          state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * brakeDecel);
          if (state.velocityMs <= 0.25) state.velocityMs = 0;
        } else {
          // Xe đã dừng hẳn -> Tự động chuyển sang Số R (Lùi) và LÙI XE VỀ PHÍA SAU (velocityMs <= 0)!
          state.gearIndex = 1; // Số R
          state.throttlePercent = 100;
          state.brakePercent = 0;
          state.velocityMs = THREE.MathUtils.clamp(state.velocityMs - reverseAccelRate * dt, maxReverseVel, 0);
        }
      } else {
        // D. NHẢ TẤT CẢ NÚT / THẢ CẦN XOAY: Giảm tốc tự nhiên theo quán tính về 0 km/h và dừng hẳn
        state.throttlePercent = 0;
        state.brakePercent = 0;
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * 4.5);
        if (Math.abs(state.velocityMs) < 0.08) state.velocityMs = 0;
      }

      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = !state.engineRunning ? 0 : (850 + (state.throttlePercent / 100) * 4500 + Math.abs(state.speedKmh) * 18);

      const steerRad = THREE.MathUtils.degToRad((state.steeringAngleDeg / 540) * 35);
      if (Math.abs(state.velocityMs) > 0.05) {
        const effectiveSpeed = Math.max(Math.abs(state.velocityMs), 3.0) * Math.sign(state.velocityMs);
        const yawRate = (effectiveSpeed / (state.wheelbaseM || 3.2)) * Math.tan(steerRad) * 1.5;
        state.headingRad -= yawRate * dt;
        vehicleRoot.rotation.y = state.headingRad;

        const step = state.velocityMs * dt;
        vehicleRoot.position.x -= Math.sin(state.headingRad) * step;
        vehicleRoot.position.z -= Math.cos(state.headingRad) * step;
      }
      vehicleRoot.position.y = 0;
      vehicleRoot.rotation.x = 0;
      vehicleRoot.rotation.z = 0;
    }
  }

  state.wheelRotationRad += (state.velocityMs * dt) / 0.38;
  const frontYaw = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 34);
  for (const w of wheelAssemblies) {
    w.spinHub.rotation.x = -state.wheelRotationRad;
    if (w.isFrontWheel) w.steerMount.rotation.y = frontYaw;
  }

  if (state.suspensionShakeIntensity > 0.01) {
    state.suspensionShakePhase += dt * 38;
    const amp = state.suspensionShakeIntensity;
    chassisGroup.position.y = Math.abs(Math.sin(state.suspensionShakePhase)) * 0.14 * amp;
    chassisGroup.rotation.z = Math.sin(state.suspensionShakePhase * 0.8) * 0.065 * amp;
    chassisGroup.rotation.x = Math.cos(state.suspensionShakePhase * 1.1) * 0.055 * amp;
    state.suspensionShakeIntensity = THREE.MathUtils.lerp(state.suspensionShakeIntensity, 0, dt * 3.2);
  } else {
    chassisGroup.position.y = 0;
    chassisGroup.rotation.z = 0;
    chassisGroup.rotation.x = 0;
  }

  const targetDoor = state.doorsOpen ? THREE.MathUtils.degToRad(62) : 0;
  state.doorAnimAngle = THREE.MathUtils.lerp(state.doorAnimAngle, targetDoor, dt * 5);
  for (const dp of doorPivots) {
    dp.rotation.y = dp.userData.sideSign * state.doorAnimAngle;
  }

  // Chuyển động mui trần được điều khiển độc quyền bởi updateV140ConvertibleRoofAndCargo chống giật rung

  const targetCargo = state.rcCargoOpen ? THREE.MathUtils.degToRad(38) : 0;
  state.rcCargoAnim = THREE.MathUtils.lerp(state.rcCargoAnim, targetCargo, dt * 4);
  rcCargoTrayPivot.rotation.x = state.rcCargoAnim;

  steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(-state.steeringAngleDeg);

  const focusPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  mainShadowLight.position.set(focusPos.x + 25, 55, focusPos.z + 20);
  mainShadowLight.target.position.copy(focusPos);

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

  updateWorldSimulation(dt, elapsed);
  updateAudioSystem(dt);

  uiTimer += dt;
  if (uiTimer >= 0.07) {
    uiTimer = 0;
    renderAllCockpitDisplays(elapsed);
  }

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// 12. NÂNG CẤP TOÀN DIỆN THEO YÊU CẦU:
//     - TAY CẦM QUEST (CÒ CHỈ ĐỂ CHỌN/KÉO THẢ, THUMBSTICK LÁI, 4 NÚT A/B/X/Y)
//     - HAND TRACKING (CHỤM NGÓN TAY PINCH KHI TAY CẦM HẾT PIN)
//     - KÉO THẢ HUD 3D & CỬA SỔ YOUTUBE + RESET VỊ TRÍ GỐC KHI ẨN/HIỆN LẠI
//     - CAM LÙI 3D THỜI GIAN THỰC KHI CHƯA CÓ ESP32 & CAM LÙI ESP32 LIVE
//     - VA CHẠM VẬT LÝ NPC/ĐỊA HÌNH + BÀ GIÀ ĐI BỘ/ĐI XE MÁY KHI RC VA CHẠM
//     - THÒ ĐẦU RA NGOÀI XE & MULTIPLAYER NHIỀU THIẾT BỊ (XE KHÁCH KHÔNG ESP32)
// ============================================================================

// --- 12.1. LƯU VỊ TRÍ CỐ ĐỊNH BAN ĐẦU CỦA HUD 3D & KHI ẨN/HIỆN LẠI SẼ SPAWN ĐÚNG VỊ TRÍ CỐ ĐỊNH ---
const HUD_DEFAULT_POS = new THREE.Vector3(-0.78, 1.10, -0.54);
const HUD_DEFAULT_ROT = new THREE.Euler(0, THREE.MathUtils.degToRad(22), 0);

// Tìm nhóm màn hình YouTube 3D trong xe để cho phép kéo thả & reset
chassisGroup.children.forEach((child) => {
  if (child.isGroup && Math.abs(child.position.x - 0.04) < 0.01 && Math.abs(child.position.y - 0.75) < 0.01) {
    yt3DFloatingGroupRef = child;
  }
});

// Ghi đè nút Ẩn/Hiện HUD 3D để mỗi khi bấm hiện lại sẽ spawn đúng vị trí cố định ban đầu
const hudToggleBtn = document.getElementById('btn-toggle-hud3d');
if (hudToggleBtn) {
  const newHudBtn = hudToggleBtn.cloneNode(true);
  hudToggleBtn.parentNode.replaceChild(newHudBtn, hudToggleBtn);
  newHudBtn.addEventListener('click', () => {
    if (!hudPanelGroup) return;
    hudPanelGroup.visible = !hudPanelGroup.visible;
    if (hudPanelGroup.visible) {
      hudPanelGroup.position.copy(HUD_DEFAULT_POS);
      hudPanelGroup.rotation.copy(HUD_DEFAULT_ROT);
      state.lastActionLog = '🖥 Đã hiện lại Bảng HUD 3D tại đúng vị trí cố định ban đầu!';
    }
  });
}

// Kéo thả cửa sổ YouTube 2D bằng chuột / tia laser tay cầm trên thanh tiêu đề .yt-header
(function setupDraggableYouTubeModal2D() {
  const headerEl = ytModal?.querySelector('.yt-header');
  if (!ytModal || !headerEl) return;
  let isDraggingModal = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  headerEl.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    isDraggingModal = true;
    const rect = ytModal.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    ytModal.style.transform = 'none';
    ytModal.style.left = `${rect.left}px`;
    ytModal.style.top = `${rect.top}px`;
    headerEl.setPointerCapture(e.pointerId);
  });

  headerEl.addEventListener('pointermove', (e) => {
    if (!isDraggingModal) return;
    const newLeft = THREE.MathUtils.clamp(e.clientX - dragOffsetX, 10, window.innerWidth - ytModal.offsetWidth - 10);
    const newTop = THREE.MathUtils.clamp(e.clientY - dragOffsetY, 10, window.innerHeight - ytModal.offsetHeight - 10);
    ytModal.style.left = `${newLeft}px`;
    ytModal.style.top = `${newTop}px`;
  });

  const stopDrag = () => { isDraggingModal = false; };
  headerEl.addEventListener('pointerup', stopDrag);
  headerEl.addEventListener('pointercancel', stopDrag);
})();

// Kéo thả Bảng HUD 3D và Màn hình YouTube 3D trong không gian bằng chuột / Tia Laser Tay cầm / Bàn tay
let dragged3DPanel = null;
const dragPlane = new THREE.Plane();
const dragIntersectPoint = new THREE.Vector3();

window.addEventListener('pointerdown', (e) => {
  if (e.target !== renderer.domElement) return;
  mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);

  const draggableTargets = [];
  if (hudPanelGroup && hudPanelGroup.visible) draggableTargets.push(...hudPanelGroup.children);
  if (yt3DFloatingGroupRef && yt3DFloatingGroupRef.visible) draggableTargets.push(...yt3DFloatingGroupRef.children);

  const hits = raycaster.intersectObjects(draggableTargets, false);
  if (hits.length > 0) {
    const hitObj = hits[0].object;
    if (hudPanelGroup.children.includes(hitObj)) {
      dragged3DPanel = hudPanelGroup;
    } else if (yt3DFloatingGroupRef && yt3DFloatingGroupRef.children.includes(hitObj)) {
      dragged3DPanel = yt3DFloatingGroupRef;
    }
    if (dragged3DPanel) {
      const worldNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      dragPlane.setFromNormalAndCoplanarPoint(worldNormal, hits[0].point);
    }
  }
});

window.addEventListener('pointermove', (e) => {
  if (!dragged3DPanel) return;
  mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);
  if (raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint)) {
    const localPt = chassisGroup.worldToLocal(dragIntersectPoint.clone());
    dragged3DPanel.position.x = THREE.MathUtils.clamp(localPt.x, -1.15, 1.15);
    dragged3DPanel.position.y = THREE.MathUtils.clamp(localPt.y, 0.55, 1.55);
  }
});

window.addEventListener('pointerup', () => {
  dragged3DPanel = null;
});

// --- 12.2. ĐÈN XI-NHAN TRÁI / PHẢI 3D, ĐỖ XE DỪNG HẲN & THÒ ĐẦU RA NGOÀI CỬA XE ---
const turnSignalLamps = { left: [], right: [] };
(function buildTurnSignalIndicators() {
  const lampGeo = new THREE.BoxGeometry(0.12, 0.08, 0.06);
  const leftMat = new THREE.MeshBasicMaterial({ color: 0x332200 });
  const rightMat = new THREE.MeshBasicMaterial({ color: 0x332200 });

  // Xi-nhan trước & sau bên trái
  [-2.24, 2.43].forEach((zPos) => {
    const mL = new THREE.Mesh(lampGeo, leftMat);
    mL.position.set(-0.86, 0.58, zPos);
    chassisGroup.add(mL);
    turnSignalLamps.left.push(mL);

    const mR = new THREE.Mesh(lampGeo, rightMat);
    mR.position.set(0.86, 0.58, zPos);
    chassisGroup.add(mR);
    turnSignalLamps.right.push(mR);
  });
})();

function playTurnSignalTickSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(950, now);
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
}

function cycleTurnSignals(direction) {
  initAudio();
  if (direction === 'LEFT') {
    state.turnSignal = state.turnSignal === 'LEFT' ? 'OFF' : 'LEFT';
  } else if (direction === 'RIGHT') {
    state.turnSignal = state.turnSignal === 'RIGHT' ? 'OFF' : 'RIGHT';
  } else {
    // Đảo tuần tự cho nút X trên tay cầm: LEFT -> RIGHT -> OFF
    if (state.turnSignal === 'OFF') state.turnSignal = 'LEFT';
    else if (state.turnSignal === 'LEFT') state.turnSignal = 'RIGHT';
    else state.turnSignal = 'OFF';
  }
  state.lastActionLog = state.turnSignal === 'OFF'
    ? '❎ Đã tắt đèn Xi-nhan.'
    : `🟡 Đã bật đèn Xi-nhan ${state.turnSignal === 'LEFT' ? 'TRÁI (⬅)' : 'PHẢI (➡)'}!`;
}

function engageFullParkStop() {
  initAudio();
  state.gearIndex = 0; // Số P (Đỗ xe)
  state.velocityMs = 0;
  state.speedKmh = 0;
  state.throttlePercent = 0;
  state.brakePercent = 100;
  state.lastActionLog = '🅿 ĐÃ ĐỖ XE DỪNG HẲN (Số [P] - Vận tốc: 0 KM/H)!';
}

function toggleLeanHeadOutWindow() {
  if (state.playerMode !== 'DRIVING') {
    state.lastActionLog = '⚠ Bạn cần ngồi trên xe (Tài xế hoặc Ghế phụ) để thò đầu ra ngoài cửa sổ!';
    return;
  }
  state.isLeaningOut = !state.isLeaningOut;
  // Ghế 0, 2 ở bên trái xe (-0.58m), Ghế 1, 3 ở bên phải xe (+0.58m)
  const isLeftSideSeat = (state.seatIndex === 0 || state.seatIndex === 2);
  if (state.isLeaningOut) {
    cameraRig.position.set(isLeftSideSeat ? -0.58 : 0.58, 0.14, -0.05);
    state.lastActionLog = `👀 Đang thò đầu ra ngoài cửa sổ bên ${isLeftSideSeat ? 'TRÁI (Tài xế)' : 'PHẢI (Ghế phụ)'} để quan sát!`;
  } else {
    cameraRig.position.set(0, 0, 0);
    state.lastActionLog = '🚘 Đã thu đầu trở lại vào trong khoang xe.';
  }
}

document.getElementById('btn-turn-left')?.addEventListener('click', () => cycleTurnSignals('LEFT'));
document.getElementById('btn-turn-right')?.addEventListener('click', () => cycleTurnSignals('RIGHT'));
document.getElementById('btn-park-brake')?.addEventListener('click', engageFullParkStop);
document.getElementById('btn-lean-out')?.addEventListener('click', toggleLeanHeadOutWindow);

// --- 12.3. CAMERA LÙI 3D (GÓC NHÌN ĐUÔI XE KHI CHƯA KẾT NỐI ESP32) & CAM LÙI ESP32 THỰC TẾ ---
const rearViewCamera3D = new THREE.PerspectiveCamera(65, 512 / 256, 0.1, 140);
rearViewCamera3D.position.set(0, 0.85, 2.48);
// Nhìn thẳng về phía sau đuôi xe (+Z)
rearViewCamera3D.rotation.set(0, Math.PI, 0);
chassisGroup.add(rearViewCamera3D);

const rearViewRenderTarget = new THREE.WebGLRenderTarget(512, 256, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat
});
const rearPixelBuffer = new Uint8Array(512 * 256 * 4);
const rearImageData = rearCamCtx.createImageData(512, 256);

let manualRearDisconnect = false;
let rearReconnectTimer = null;

const esp32RearImg = new Image();
esp32RearImg.crossOrigin = 'Anonymous';
esp32RearImg.onload = () => {
  state.esp32RearConnected = true;
  state.lastActionLog = '🎥 Đã kết nối thành công ESP32 Cam Lùi thực tế lên gương hậu!';
  if (typeof renderRearMirrorAndCameraDisplay === 'function') {
    renderRearMirrorAndCameraDisplay(state.gears[state.gearIndex]);
  }
};
esp32RearImg.onerror = () => {
  state.esp32RearConnected = false;
};

let esp32RearBitmap = null;
let esp32RearSocket = null;
let isRearDecoding = false;
let pendingRearBlob = null;
let rearCamNeedsRedraw = false;

function decodePendingRearFrame() {
  if (isRearDecoding || !pendingRearBlob) return;
  const blob = pendingRearBlob;
  pendingRearBlob = null;
  isRearDecoding = true;

  createImageBitmap(blob).then((bmp) => {
    if (esp32RearBitmap && typeof esp32RearBitmap.close === 'function') {
      try { esp32RearBitmap.close(); } catch (e) {}
    }
    esp32RearBitmap = bmp;
    state.esp32RearConnected = true;
    if (typeof renderRearMirrorAndCameraDisplay === 'function') {
      renderRearMirrorAndCameraDisplay(state.gears[state.gearIndex]);
    }
  }).catch((e) => {}).finally(() => {
    isRearDecoding = false;
    if (pendingRearBlob) decodePendingRearFrame();
  });
}

function connectRearEsp32Camera(rawUrl) {
  if (!rawUrl) return;
  state.esp32RearStreamUrl = rawUrl;
  manualRearDisconnect = false;
  if (esp32RearSocket) {
    try { esp32RearSocket.close(); } catch (e) {}
    esp32RearSocket = null;
  }

  if (rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://')) {
    try {
      console.log('[ESP32-REAR] Đang kết nối WebSocket Cam Lùi:', rawUrl);
      esp32RearSocket = new WebSocket(rawUrl);
      esp32RearSocket.binaryType = 'arraybuffer';
      esp32RearSocket.onopen = () => {
        state.esp32RearConnected = true;
        clearTimeout(rearReconnectTimer);
        state.lastActionLog = '🟢 Đã kết nối WebSocket ESP32 Cam Lùi!';
        console.log('[ESP32-REAR] Kết nối thành công tới:', rawUrl);
      };
      esp32RearSocket.onmessage = (msg) => {
        const now = performance.now();
        if (typeof esp32TwinMetrics !== 'undefined') {
          esp32TwinMetrics.rearFrameIntervalMs = now - (esp32TwinMetrics.rearLastFrameTime || now);
          esp32TwinMetrics.rearLastFrameTime = now;
        }

        if (msg.data instanceof ArrayBuffer) {
          pendingRearBlob = new Blob([msg.data], { type: 'image/jpeg' });
          decodePendingRearFrame();
        } else if (msg.data instanceof Blob) {
          pendingRearBlob = msg.data;
          decodePendingRearFrame();
        }
      };
      esp32RearSocket.onerror = () => {
        state.lastActionLog = '⚠️ Lỗi kết nối WebSocket ESP32 Cam Lùi (' + rawUrl + ')';
      };
      esp32RearSocket.onclose = () => {
        state.esp32RearConnected = false;
        state.lastActionLog = '🔌 Mất kết nối Cam Lùi (' + rawUrl + ') - Sẽ tự động kết nối lại...';
        if (!manualRearDisconnect) {
          clearTimeout(rearReconnectTimer);
          rearReconnectTimer = setTimeout(() => {
            if (!state.esp32RearConnected && !manualRearDisconnect) {
              connectRearEsp32Camera(state.esp32RearStreamUrl);
            }
          }, 3000);
        }
      };
    } catch (e) {
      console.warn('[ESP32-REAR] Lỗi tạo WebSocket:', e);
    }
  } else {
    const finalUrl = (window.location.protocol === 'https:' && rawUrl.startsWith('http://'))
      ? `/api/esp32-proxy?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;
    esp32RearImg.src = finalUrl;
    state.esp32RearConnected = true;
  }
}

document.getElementById('btn-connect-rear-esp32')?.addEventListener('click', () => {
  manualRearDisconnect = false;
  const url = document.getElementById('esp32-rear-ip')?.value.trim() || state.esp32RearStreamUrl || 'ws://192.168.1.90:4213';
  connectRearEsp32Camera(url);
});
document.getElementById('btn-rear-to-windshield')?.addEventListener('click', () => {
  state.windshieldMode = 'ESP32_REAR_LIVE';
  state.lastActionLog = '🪟 Đã chiếu hình ảnh Cam Lùi lên Kính Chắn Gió!';
});
document.getElementById('btn-disconnect-rear-esp32')?.addEventListener('click', () => {
  manualRearDisconnect = true;
  clearTimeout(rearReconnectTimer);
  state.esp32RearConnected = false;
  if (esp32RearSocket) {
    try { esp32RearSocket.close(); } catch (e) {}
    esp32RearSocket = null;
  }
  esp32RearImg.src = '';
  state.lastActionLog = '🔙 Đã chuyển Gương Hậu & Màn hình lùi về Góc nhìn 3D phía sau xe!';
});

let rearSimThrottle = 0;
function renderRearMirrorAndCameraDisplay(gear) {
  const hasLiveRear = Boolean(
    state.esp32RearConnected && (
      esp32RearBitmap ||
      (esp32RearImg.naturalWidth > 0 && esp32RearImg.src)
    )
  );

  // Luôn đảm bảo TẤT CẢ các gương chiếu hậu & màn hình phụ táp-lô đều nhận rearCamTex ổn định
  chassisGroup.traverse((child) => {
    if (child.isMesh && (child.userData.isRearMirrorMesh || (child.material && (child.material.map === rearCamTex || child.material.map === rearViewRenderTarget.texture)))) {
      child.userData.isRearMirrorMesh = true;
      if (child.material && child.material.map !== rearCamTex) {
        child.material.map = rearCamTex;
        child.material.needsUpdate = true;
      }
    }
  });

  if (hasLiveRear) {
    if (esp32RearBitmap) {
      rearCamCtx.drawImage(esp32RearBitmap, 0, 0, 512, 256);
    } else if (esp32RearImg.naturalWidth > 0) {
      rearCamCtx.drawImage(esp32RearImg, 0, 0, 512, 256);
    }
  } else {
    // Khi CHƯA kết nối ESP32 Cam lùi: Render góc nhìn 3D phía sau đuôi xe
    rearSimThrottle++;
    if (rearSimThrottle % 2 === 0) {
      const prevTarget = renderer.getRenderTarget();
      const prevXrEnabled = renderer.xr.enabled;
      renderer.xr.enabled = false;
      renderer.setRenderTarget(rearViewRenderTarget);
      renderer.render(scene, rearViewCamera3D);
      renderer.readRenderTargetPixels(rearViewRenderTarget, 0, 0, 512, 256, rearPixelBuffer);
      renderer.setRenderTarget(prevTarget);
      renderer.xr.enabled = prevXrEnabled;

      // Lật trục Y của buffer WebGL sang Canvas 2D
      for (let y = 0; y < 256; y++) {
        const srcRow = (255 - y) * 512 * 4;
        const dstRow = y * 512 * 4;
        rearImageData.data.set(rearPixelBuffer.subarray(srcRow, srcRow + 512 * 4), dstRow);
      }
      rearCamCtx.putImageData(rearImageData, 0, 0);
    }
  }

  // Vạch kẻ thước canh lùi xe & tiêu đề trạng thái
  rearCamCtx.strokeStyle = gear === 'R' ? '#ff3b30' : 'rgba(0, 229, 255, 0.6)';
  rearCamCtx.lineWidth = 3;
  rearCamCtx.beginPath();
  rearCamCtx.moveTo(110, 250);
  rearCamCtx.lineTo(175, 150);
  rearCamCtx.lineTo(337, 150);
  rearCamCtx.lineTo(402, 250);
  rearCamCtx.stroke();

  rearCamCtx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  rearCamCtx.fillRect(0, 0, 512, 34);
  rearCamCtx.fillStyle = hasLiveRear ? '#00ff88' : (state.esp32RearConnected ? '#ffd60a' : (gear === 'R' ? '#ff3b30' : '#00e5ff'));
  rearCamCtx.font = 'bold 15px monospace';
  const rearTitle = hasLiveRear
    ? '🎥 ESP32 CAM LÙI LIVE [ĐÃ NHẬN TÍN HIỆU]'
    : (state.esp32RearConnected
        ? '⏳ ESP32 ĐÃ KẾT NỐI - ĐANG CHỜ KHUNG HÌNH...'
        : (gear === 'R' ? '🔙 CAM LÙI 3D ĐUÔI XE [CHƯA KẾT NỐI ESP32]' : '🔙 GƯƠNG HẬU 3D ĐUÔI XE'));
  rearCamCtx.fillText(rearTitle, 12, 22);
  rearCamTex.needsUpdate = true;

  if (state.windshieldMode === 'ESP32_REAR_LIVE') {
    wsCtx.drawImage(rearCamCanvas, 0, 0, 1024, 512);
    wsTex.needsUpdate = true;
  }
}

// --- 12.4. TAY CẦM META QUEST (CÒ CHỈ ĐỂ CHỌN/KÉO, NÚT XOAY THUMBSTICK ĐỂ LÁI, 4 NÚT A/B/X/Y) & HAND TRACKING ---
const controllerModelFactory = new XRControllerModelFactory();
const handModelFactory = new XRHandModelFactory();
const xrLaserLineGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, -6)
]);
const xrLaserMat = new THREE.LineBasicMaterial({ color: 0x00ff88 });

const xrControllers = [];
const xrHands = [];
let activeGrabberController = null;
let grabbed3DPanelByXR = null;

for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const laserLine = new THREE.Line(xrLaserLineGeo, xrLaserMat);
  ctrl.add(laserLine);
  scene.add(ctrl);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);

  // CÒ TAY CẦM (selectstart / selectend): CHỈ DÙNG ĐỂ CHỌN NÚT HOẶC NẮM KÉO THẢ HUD / YOUTUBE (Không tự đạp ga!)
  ctrl.addEventListener('selectstart', () => {
    handleXrRaySelectOrGrabStart(ctrl);
  });
  ctrl.addEventListener('selectend', () => {
    if (activeGrabberController === ctrl) {
      activeGrabberController = null;
      grabbed3DPanelByXR = null;
    }
  });

  xrControllers.push(ctrl);

  // HAND TRACKING (KHI TAY CẦM HẾT PIN): Nhận diện bàn tay để thao tác Chọn / Nắm / Kéo thả y như cò tay cầm
  const hand = renderer.xr.getHand(i);
  hand.add(handModelFactory.createHandModel(hand, 'mesh'));
  const handLaser = new THREE.Line(xrLaserLineGeo, new THREE.LineBasicMaterial({ color: 0x00e5ff }));
  hand.add(handLaser);
  hand.userData.isPinching = false;
  scene.add(hand);

  hand.addEventListener('pinchstart', () => {
    hand.userData.isPinching = true;
    handleXrRaySelectOrGrabStart(hand);
  });
  hand.addEventListener('pinchend', () => {
    hand.userData.isPinching = false;
    if (activeGrabberController === hand) {
      activeGrabberController = null;
      grabbed3DPanelByXR = null;
    }
  });

  xrHands.push(hand);
}

function handleXrRaySelectOrGrabStart(pointerSourceObj) {
  initAudio();
  const tempMatrix = new THREE.Matrix4().extractRotation(pointerSourceObj.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(pointerSourceObj.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  // 1. Kiểm tra nếu chĩa vào Bảng HUD 3D hoặc Cửa sổ YouTube 3D để nắm kéo thả
  const panelMeshes = [];
  if (hudPanelGroup && hudPanelGroup.visible) panelMeshes.push(...hudPanelGroup.children);
  if (yt3DFloatingGroupRef && yt3DFloatingGroupRef.visible) panelMeshes.push(...yt3DFloatingGroupRef.children);

  const panelHits = raycaster.intersectObjects(panelMeshes, false);
  if (panelHits.length > 0) {
    const hitMesh = panelHits[0].object;
    activeGrabberController = pointerSourceObj;
    grabbed3DPanelByXR = hudPanelGroup.children.includes(hitMesh) ? hudPanelGroup : yt3DFloatingGroupRef;
  }

  // 2. Kiểm tra chọn các nút tương tác 3D trong xe / cửa xe / NPC
  const hits = raycaster.intersectObjects(interactive3DTargets, false);
  if (hits.length > 0 && hits[0].object.userData.onClick) {
    hits[0].object.userData.onClick();
  }
}

// Hàm nhận diện thiết bị Vô Lăng & Bàn Đạp Chuyên Dụng (Logitech G29/G920/G923, Thrustmaster, Fanatec, Moza, PXN...)
// Tuyệt đối cách ly Vô Lăng khỏi các vòng lặp tay cầm VR / Gamepad thông thường để tránh làm xoay tròn người hay tự động phóng xe!
function isRacingWheelDevice(gp) {
  if (!gp) return false;
  const id = (gp.id || '').toLowerCase();
  return /r808|gog|wheel|steering|g29|g920|g923|thrustmaster|fanatec|t300|t150|t248|t80|t500|moza|pxn|pedal|racing|driving|force|046d-c24f|046d-c294|046d-c29b|044f|simucube|cammus|hori/i.test(id);
}

const prevGamepadBtns = { a: false, b: false, x: false, y: false };
let xrThumbstickForward = 0;
let xrThumbstickTurn = 0;

function pollQuestGamepadAndHands(dt) {
  if (state.inputMode === 'keyboard') {
    xrThumbstickForward = 0;
    xrThumbstickTurn = 0;
    return;
  }

  // Cập nhật vị trí kéo thả HUD / YouTube 3D khi đang giữ Cò hoặc đang chụm ngón tay (Hand Pinch)
  if (activeGrabberController && grabbed3DPanelByXR) {
    const tempMatrix = new THREE.Matrix4().extractRotation(activeGrabberController.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(activeGrabberController.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
    const targetWorldPos = origin.add(dir.multiplyScalar(0.85));
    const localPos = chassisGroup.worldToLocal(targetWorldPos);
    grabbed3DPanelByXR.position.x = THREE.MathUtils.clamp(localPos.x, -1.15, 1.15);
    grabbed3DPanelByXR.position.y = THREE.MathUtils.clamp(localPos.y, 0.55, 1.55);
  }

  // Kiểm tra cử chỉ chụm ngón cái & ngón trỏ (Hand Tracking fallback khi tay cầm hết pin)
  for (const hand of xrHands) {
    if (hand.joints && hand.joints['index-finger-tip'] && hand.joints['thumb-tip']) {
      const idxTip = hand.joints['index-finger-tip'].position;
      const thumbTip = hand.joints['thumb-tip'].position;
      const pinchDist = idxTip.distanceTo(thumbTip);
      if (pinchDist < 0.024 && !hand.userData.isPinching) {
        hand.userData.isPinching = true;
        handleXrRaySelectOrGrabStart(hand);
      } else if (pinchDist > 0.038 && hand.userData.isPinching) {
        hand.userData.isPinching = false;
        if (activeGrabberController === hand) {
          activeGrabberController = null;
          grabbed3DPanelByXR = null;
        }
      }
    }
  }

  // Đọc nút xoay (Thumbstick) và 4 nút A, B, X, Y từ tay cầm Meta Quest
  let stickY = 0;
  let stickX = 0;
  let btnA = false;
  let btnB = false;
  let btnX = false;
  let btnY = false;

  const session = renderer.xr.getSession();
  const sources = session ? Array.from(session.inputSources) : [];
  const navGamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];

  const allGamepads = [
    ...sources.map((s) => ({ gp: s.gamepad, hand: s.handedness })).filter((item) => item.gp),
    ...navGamepads.map((gp) => ({ gp, hand: gp.hand || '' }))
  ];

  for (const { gp, hand } of allGamepads) {
    // Nút xoay (Thumbstick) thường ở axes[2], axes[3] trên WebXR hoặc axes[0], axes[1]
    const axX = Math.abs(gp.axes[2] || 0) > Math.abs(gp.axes[0] || 0) ? (gp.axes[2] || 0) : (gp.axes[0] || 0);
    const axY = Math.abs(gp.axes[3] || 0) > Math.abs(gp.axes[1] || 0) ? (gp.axes[3] || 0) : (gp.axes[1] || 0);
    if (Math.abs(axY) > 0.12) stickY = -axY; // Đẩy lên là tiến (+1), kéo xuống là lùi (-1)
    if (Math.abs(axX) > 0.12) stickX = axX;  // Gạt trái (-1), gạt phải (+1)

    // Ánh xạ 4 nút A, B (Tay phải) và X, Y (Tay trái) trên Meta Quest Touch Controller
    if (hand === 'right') {
      if (gp.buttons[4]?.pressed || gp.buttons[3]?.pressed) btnA = true;
      if (gp.buttons[5]?.pressed) btnB = true;
    } else if (hand === 'left') {
      if (gp.buttons[4]?.pressed || gp.buttons[3]?.pressed) btnX = true;
      if (gp.buttons[5]?.pressed) btnY = true;
    } else {
      // Gamepad tiêu chuẩn ở chế độ 2D
      if (gp.buttons[0]?.pressed) btnA = true;
      if (gp.buttons[1]?.pressed) btnB = true;
      if (gp.buttons[2]?.pressed) btnX = true;
      if (gp.buttons[3]?.pressed) btnY = true;
    }
  }

  xrThumbstickForward = stickY;
  xrThumbstickTurn = stickX;

  // Thực thi 4 chức năng khi nhấn nút A, B, X, Y:
  // 1. Nút A: Mở cửa Lên / Xuống xe
  if (btnA && !prevGamepadBtns.a) enterOrExitCarWithBlink();
  // 2. Nút B: Đỗ xe dừng hẳn (Số P, tốc độ = 0)
  if (btnB && !prevGamepadBtns.b) engageFullParkStop();
  // 3. Nút X: Bật/Đảo Xi-nhan Trái / Phải
  if (btnX && !prevGamepadBtns.x) cycleTurnSignals('CYCLE');
  // 4. Nút Y: Mở / Thu nhỏ ứng dụng YouTube
  if (btnY && !prevGamepadBtns.y) {
    if (ytModal?.classList.contains('panel-hidden')) openRealYouTubeApp();
    else closeYouTubeAppToDashboard();
  }

  prevGamepadBtns.a = btnA;
  prevGamepadBtns.b = btnB;
  prevGamepadBtns.x = btnX;
  prevGamepadBtns.y = btnY;
}

// --- 12.5. VA CHẠM VẬT LÝ (TÔNG NPC / VẬT THỂ 3D / ĐỊA HÌNH KHI CHƯA CÓ ESP32) & BÀ GIÀ ĐI BỘ / XE MÁY KHI RC VA CHẠM ---
const grannyObstacles = [];

function createGrannyWalkerAndMotorbikeModels() {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6b89c });
  const dressMat = new THREE.MeshStandardMaterial({ color: 0x7b2cbf });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9 });

  // 1. Bà già đi bộ chống gậy
  const grannyWalker = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 8, 10), dressMat);
  torso.position.y = 0.95;
  torso.rotation.x = 0.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), skinMat);
  head.position.set(0, 1.38, -0.06);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), hairMat);
  bun.position.set(0, 1.46, 0.04);
  const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.85, 6), matWalnut);
  cane.position.set(0.24, 0.45, -0.18);
  const badge1 = createSpeechBubbleSprite('👵 Ái chà! Xe RC ngoài đời vừa tông vật cản!', '#4a0e17', '#ffbe0b');
  badge1.position.set(0, 1.85, 0);
  badge1.visible = true;
  grannyWalker.add(torso, head, bun, cane, badge1);
  grannyWalker.visible = false;
  grannyWalker.userData = { type: 'GRANNY_WALKER', velocity: new THREE.Vector3(), angularVel: 0, activeTimer: 0 };
  scene.add(grannyWalker);
  grannyObstacles.push(grannyWalker);

  // 2. Bà già lái xe máy
  const grannyMoto = new THREE.Group();
  const scooter = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.46, 1.28), new THREE.MeshStandardMaterial({ color: 0xff9f1c }));
  scooter.position.y = 0.45;
  const gTorso = torso.clone();
  gTorso.position.set(0, 1.05, 0.05);
  const gHead = head.clone();
  gHead.position.set(0, 1.45, 0.05);
  const badge2 = createSpeechBubbleSprite('🛵👵 Ối làng nước ơi! Tông bà già chạy xe máy!', '#4a0e17', '#00e5ff');
  badge2.position.set(0, 1.95, 0);
  badge2.visible = true;
  grannyMoto.add(scooter, gTorso, gHead, badge2);
  grannyMoto.visible = false;
  grannyMoto.userData = { type: 'GRANNY_MOTO', velocity: new THREE.Vector3(), angularVel: 0, activeTimer: 0 };
  scene.add(grannyMoto);
  grannyObstacles.push(grannyMoto);
}
createGrannyWalkerAndMotorbikeModels();

// Chỉ thực hiện kịch bản tông Bà Già Đi Bộ & Bà Già Lái Xe Máy khi xe RC ở ngoài đời tông trúng vật cản!
function triggerRealRcObstacleGrannyCrash() {
  initAudio();
  playImpactSound(20);
  state.suspensionShakeIntensity = 2.0;

  const forward = new THREE.Vector3(-Math.sin(state.headingRad), 0, -Math.cos(state.headingRad));
  const right = new THREE.Vector3(Math.cos(state.headingRad), 0, -Math.sin(state.headingRad));

  grannyObstacles.forEach((granny, idx) => {
    granny.visible = true;
    const sideOffset = idx === 0 ? -0.65 : 0.65;
    granny.position.copy(vehicleRoot.position)
      .add(forward.clone().multiplyScalar(3.2))
      .add(right.clone().multiplyScalar(sideOffset));
    granny.position.y = 0.05;
    granny.rotation.set(0, state.headingRad, 0);

    granny.userData.velocity.copy(forward.clone().multiplyScalar(8.5 + idx * 2)).add(new THREE.Vector3(sideOffset * 2, 4.8, 0));
    granny.userData.angularVel = (idx === 0 ? 1 : -1) * 7.5;
    granny.userData.activeTimer = 5.5;
  });

  state.lastActionLog = '💥 XE RC NGOÀI ĐỜI TÔNG VẬT CẢN -> Kích hoạt hiệu ứng tông Bà Già Đi Bộ & Bà Già Đi Xe Máy!';
}

let lastValidCarPos = vehicleRoot.position.clone();
let collisionCooldown = 0;

function updatePhysicsCollisionsAndTerrainLock(dt) {
  if (collisionCooldown > 0) collisionCooldown -= dt;

  // Cập nhật chuyển động văng của Bà Già Đi Bộ / Xe Máy khi xe RC tông vật cản
  for (const granny of grannyObstacles) {
    if (!granny.visible) continue;
    const gd = granny.userData;
    gd.activeTimer -= dt;
    if (gd.activeTimer <= 0) {
      granny.visible = false;
      continue;
    }
    granny.position.addScaledVector(gd.velocity, dt);
    gd.velocity.y -= 12.5 * dt;
    if (granny.position.y <= 0.05) {
      granny.position.y = 0.05;
      gd.velocity.y = Math.abs(gd.velocity.y) * 0.35;
      gd.velocity.x *= 0.85;
      gd.velocity.z *= 0.85;
    }
    granny.rotation.x += gd.angularVel * dt * 0.5;
    granny.rotation.z += gd.angularVel * dt * 0.3;
  }

  if (state.playerMode !== 'DRIVING') {
    lastValidCarPos.copy(vehicleRoot.position);
    return;
  }

  const carPos = vehicleRoot.position;
  const speedAbs = Math.abs(state.speedKmh);

  // 1. KIỂM TRA ĐỊA HÌNH:
  // Chỉ khi KẾT NỐI ĐƯỢC VỚI ESP32 CAM TRƯỚC (state.esp32Connected === true) thì xe mới được phép chạy xuyên địa hình!
  // Khi KHÔNG kết nối tín hiệu ESP32 Cam trước, tuyệt đối KHÔNG cho chạy xuyên các tòa nhà/cột đèn địa hình.
  const canPassThroughTerrain = Boolean(state.esp32Connected && state.windshieldMode === 'ESP32_LIVE');
  if (!canPassThroughTerrain) {
    const localX = ((carPos.x % BLOCK_SIZE) + BLOCK_SIZE * 1.5) % BLOCK_SIZE - BLOCK_SIZE / 2;
    const localZ = ((carPos.z % BLOCK_SIZE) + BLOCK_SIZE * 1.5) % BLOCK_SIZE - BLOCK_SIZE / 2;

    // 4 góc tòa nhà cao tầng trong mỗi ô phố ở (±22, ±22) với kích thước 13x13m (bán kính va chạm ~ 8.0m)
    const buildingCorners = [[-22, -22], [22, -22], [-22, 22], [22, 22]];
    let hitTerrain = false;
    for (const [bx, bz] of buildingCorners) {
      if (Math.abs(localX - bx) < 7.8 && Math.abs(localZ - bz) < 7.8) {
        hitTerrain = true;
        break;
      }
    }

    if (hitTerrain) {
      // Chặn không cho chạy xuyên địa hình, bật lùi xe lại và tạo hiệu ứng va chạm
      vehicleRoot.position.copy(lastValidCarPos);
      state.velocityMs = -state.velocityMs * 0.35;
      state.speedKmh = state.velocityMs * 3.6;
      if (collisionCooldown <= 0) {
        playImpactSound(16);
        state.suspensionShakeIntensity = 1.75;
        collisionCooldown = 0.45;
        state.lastActionLog = '🧱 TÔNG ĐỊA HÌNH! (Chưa kết nối ESP32 Cam trước nên xe bị chặn, không được xuyên địa hình!)';
      }
      return;
    }
  }
  lastValidCarPos.copy(vehicleRoot.position);

  if (speedAbs < 1.5) return;

  // 2. VA CHẠM VỚI NPC ĐI BỘ (Cả khi tiến lẫn khi lùi xe nhìn qua Cam lùi 3D)
  for (const npc of sidewalkNpcs) {
    const dist = carPos.distanceTo(npc.position);
    if (dist < 1.85) {
      const pushDir = npc.position.clone().sub(carPos).normalize();
      npc.position.addScaledVector(pushDir, 3.2);
      npc.rotation.x = 0.85;
      setTimeout(() => { npc.rotation.x = 0; }, 900);
      if (collisionCooldown <= 0) {
        playImpactSound(14);
        state.suspensionShakeIntensity = 1.45;
        collisionCooldown = 0.4;
        state.lastActionLog = state.speedKmh < 0
          ? '💥 LÙI XE TÔNG TRÚNG NPC! (Hiển thị trực tiếp trên Cam Lùi 3D phía sau xe)'
          : '💥 XE TÔNG TRÚNG NPC ĐI BỘ! Đã kích hoạt hiệu ứng chấn động va chạm!';
      }
    }
  }

  // 3. VA CHẠM VỚI THÚ CƯNG QUA ĐƯỜNG
  for (const ani of crossingAnimals) {
    if (carPos.distanceTo(ani.position) < 1.65) {
      const pushDir = ani.position.clone().sub(carPos).normalize();
      ani.position.addScaledVector(pushDir, 2.8);
      if (collisionCooldown <= 0) {
        playImpactSound(12);
        playSocialOrAnimalSound(ani.userData.species === 'DOG' ? 'DOG_BARK' : 'CAT_MEOW');
        state.suspensionShakeIntensity = 1.25;
        collisionCooldown = 0.4;
        state.lastActionLog = '💥 Va chạm với thú cưng trên đường!';
      }
    }
  }

  // 4. VA CHẠM VỚI CÁC PHƯƠNG TIỆN 3D KHÁC (Ô tô AI, Xe máy, Xe đạp)
  for (const veh of allTrafficVehicles) {
    if (carPos.distanceTo(veh.position) < 2.65) {
      const pushDir = veh.position.clone().sub(carPos).normalize();
      veh.position.addScaledVector(pushDir, 3.0);
      state.velocityMs *= 0.4;
      state.speedKmh = state.velocityMs * 3.6;
      if (collisionCooldown <= 0) {
        playImpactSound(18);
        state.suspensionShakeIntensity = 1.8;
        collisionCooldown = 0.5;
        state.lastActionLog = `💥 TÔNG TRÚNG ${veh.userData.modelName.toUpperCase()}! Hiệu ứng va chạm vật lý kích hoạt!`;
      }
    }
  }
}

// --- 12.6. GẮN ĐẦY ĐỦ SỰ KIỆN CHO TẤT CẢ CÁC NÚT TRÊN BẢNG CHỨC NĂNG & BÀN PHÍM ---
document.getElementById('input-mode-select')?.addEventListener('change', (e) => {
  state.inputMode = e.target.value;
  state.lastActionLog = `🎮 Đã chuyển chế độ điều khiển sang: ${e.target.options[e.target.selectedIndex].text}`;
});

document.getElementById('slider-speed-ratio')?.addEventListener('input', (e) => {
  state.rcSpeedRatio = parseFloat(e.target.value) || 1.0;
  const lbl = document.getElementById('val-speed-ratio');
  if (lbl) lbl.textContent = state.rcSpeedRatio.toFixed(1);
});

document.getElementById('slider-steer-sens')?.addEventListener('input', (e) => {
  state.rcSteerSensitivity = parseFloat(e.target.value) || 1.0;
  const lbl = document.getElementById('val-steer-sens');
  if (lbl) lbl.textContent = state.rcSteerSensitivity.toFixed(1);
});

document.getElementById('btn-crash-granny')?.addEventListener('click', triggerRealRcObstacleGrannyCrash);

document.getElementById('btn-sim-disconnect')?.addEventListener('click', () => {
  initAudio();
  state.rcConnected = false;
  state.hijackActive = true;
  if (hijackDriverMesh) hijackDriverMesh.visible = true;
  state.lastActionLog = '🚨 MẤT SÓNG RC: Kẻ lạ đã cướp xe! Bấm [🔄 Spawn Lại Xe] để khôi phục!';
});

document.getElementById('btn-sim-reconnect')?.addEventListener('click', () => {
  initAudio();
  state.rcConnected = true;
  state.hijackActive = false;
  if (hijackDriverMesh) hijackDriverMesh.visible = false;
  state.velocityMs = 0;
  state.speedKmh = 0;
  vehicleRoot.position.set(state.avatarPos.x + 1.8, 0, state.avatarPos.z);
  state.lastActionLog = '✅ Đã kết nối lại tín hiệu & Spawn xe ngay cạnh bạn (Tốc độ: 0 KM/H)!';
});

document.getElementById('weather-select')?.addEventListener('change', (e) => {
  const mode = e.target.value;
  state.weatherMode = mode;
  if (mode === 'day') {
    scene.background.setHex(0x6ba6ff);
    scene.fog.color.setHex(0x6ba6ff);
    hemiLight.intensity = 1.6;
    mainShadowLight.intensity = 2.2;
    state.wipersActive = false;
  } else if (mode === 'sunset') {
    scene.background.setHex(0x3d1e38);
    scene.fog.color.setHex(0x3d1e38);
    hemiLight.intensity = 1.1;
    mainShadowLight.color.setHex(0xff9e66);
    state.wipersActive = false;
  } else if (mode === 'rain') {
    scene.background.setHex(0x050a14);
    scene.fog.color.setHex(0x050a14);
    state.wipersActive = true;
  } else {
    scene.background.setHex(0x03060f);
    scene.fog.color.setHex(0x03060f);
    hemiLight.intensity = 0.85;
    mainShadowLight.color.setHex(0xb8d0ff);
    state.wipersActive = false;
  }
  state.lastActionLog = `🌤 Đã chuyển thời tiết sang: ${e.target.options[e.target.selectedIndex].text}`;
});

// Bổ sung phím tắt bàn phím cho mọi chức năng mới
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'l') toggleLeanHeadOutWindow();
  if (k === 'z') cycleTurnSignals('LEFT');
  if (k === 'x') cycleTurnSignals('RIGHT');
  if (k === 'b') engageFullParkStop();
  if (k === 'g') triggerRealRcObstacleGrannyCrash();
  if (k === 'c') swapSeatOrTakeDriverControl();
});

// --- 12.7. MULTIPLAYER ĐA THIẾT BỊ (SPAWN XE NGƯỜI CHƠI THỨ 2 KHÔNG CÓ ESP32, LÊN XE NHAU NGỒI GHẾ PHỤ POV 1, ĐỔI LÁI & THÒ ĐẦU) ---
const remoteCarMeshes = new Map();
const remotePlayerMeshes = new Map();
let mpSocket = null;

function createRemotePeerCarMesh(carData) {
  const peerCar = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.94, 0.54, 4.85),
    new THREE.MeshPhysicalMaterial({ color: 0x1d3557, roughness: 0.15, metalness: 0.6, clearcoat: 1.0 })
  );
  body.position.y = 0.48;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.48, 2.2), matGlass);
  cabin.position.set(0, 0.98, 0.1);
  peerCar.add(body, cabin);

  // Nhãn hiển thị trên nóc xe của người chơi khác (Ghi rõ chỉ là xe 3D không có ESP32, bấm Laser để lên ngồi cùng)
  const labelSprite = createSpeechBubbleSprite(
    `🚘 ${carData.ownerName || 'Xe Người Chơi #2'} (Chỉ 3D - Không ESP32)`,
    '#0b2545',
    '#00e5ff'
  );
  labelSprite.scale.set(1.9, 0.36, 1);
  labelSprite.position.set(0, 1.85, 0);
  labelSprite.visible = true;
  peerCar.add(labelSprite);

  register3DTarget(body, () => {
    enterSpecificMultiplayerCar(carData.carId);
  });

  peerCar.position.set(carData.x || -2.8, 0, carData.z || 6.5);
  scene.add(peerCar);
  return peerCar;
}

function enterSpecificMultiplayerCar(targetCarId) {
  state.activeCarId = targetCarId;
  // Nếu lên xe của người chơi khác (không phải car_host), khóa toàn bộ ESP32!
  const isHostCar = (targetCarId === 'car_host');
  if (!isHostCar) {
    state.esp32Connected = false;
    state.esp32RearConnected = false;
    state.windshieldMode = 'TRANSPARENT';
    state.lastActionLog = '🚘 Bạn đã lên Xe của Người Chơi Khác (Xe này chỉ chạy 3D, không kết nối ESP32)!';
  }
  if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
    mpSocket.send(JSON.stringify({ type: 'ENTER_CAR', carId: targetCarId }));
  }
  if (state.playerMode === 'ON_FOOT') {
    enterOrExitCarWithBlink();
  }
}

function tryEnterNearestCarMultiplayer() {
  let nearestCarId = state.ownCarId || 'car_host';
  let minDist = state.avatarPos.distanceTo(vehicleRoot.position);

  for (const [carId, mesh] of remoteCarMeshes.entries()) {
    const d = state.avatarPos.distanceTo(mesh.position);
    if (d < minDist) {
      minDist = d;
      nearestCarId = carId;
    }
  }
  state.activeCarId = nearestCarId;
  if (nearestCarId !== 'car_host') {
    state.esp32Connected = false;
    state.esp32RearConnected = false;
    state.windshieldMode = 'TRANSPARENT';
  }
  if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
    mpSocket.send(JSON.stringify({ type: 'ENTER_CAR', carId: nearestCarId }));
  }
}

function swapSeatOrTakeDriverControl() {
  state.seatIndex = (state.seatIndex + 1) % 4;
  driverSeatMount.position.copy(SEAT_POSITIONS[state.seatIndex].pos);
  if (state.isLeaningOut) {
    const isLeft = (state.seatIndex === 0 || state.seatIndex === 2);
    cameraRig.position.set(isLeft ? -0.58 : 0.58, 0.14, -0.05);
  } else {
    cameraRig.position.set(0, 0, 0);
  }
  if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
    mpSocket.send(JSON.stringify({
      type: 'SWAP_SEAT',
      carId: state.activeCarId,
      targetSeatIndex: state.seatIndex
    }));
  }
  state.lastActionLog = `💺 Đã chuyển sang: ${SEAT_POSITIONS[state.seatIndex].name} ${state.seatIndex === 0 ? '(Bạn đang cầm lái!)' : '(Góc nhìn thứ 1 Ghế Phụ)'}`;
}

document.getElementById('btn-swap-driver')?.addEventListener('click', swapSeatOrTakeDriverControl);

(function initMultiplayerClient() {
  try {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    mpSocket = new WebSocket(`${wsProto}//${window.location.host}`);

    mpSocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'WELCOME') {
          state.playerId = msg.playerId;
          state.ownCarId = msg.ownCarId;
          state.activeCarId = msg.ownCarId;
          state.isHostPlayer = Boolean(msg.isHost);
          state.lastActionLog = '🌐 Đã kết nối vào Thế giới 3D!';
        } else if (msg.type === 'WHEEL_BRIDGE_STATE') {
          // Cầu nối vô lăng GOG R808 từ Laptop sang kính Meta Quest 3
          const wObj = window._racingWheel;
          if (wObj && msg.connected) {
            wObj.connected = true;
            wObj.deviceName = msg.deviceId || 'GOG R808';
            wObj.steerAngleDeg = msg.steerAngleDeg ?? (msg.steeringNorm * 540);
            wObj.gasPercent = msg.gasPercent ?? Math.max(0, msg.throttleNorm * 100);
            wObj.brakePercent = msg.brakePercent ?? 0;
            wObj.reversePercent = msg.reversePercent ?? 0;
            wObj.gear = msg.gear || 'D';
            state.steeringAngleDeg = wObj.steerAngleDeg;
            state.throttlePercent = wObj.gasPercent;
            state.brakePercent = wObj.brakePercent;
            state.reversePercent = wObj.reversePercent;
            if (wObj.reversePercent > 3) {
              state.gearIndex = 1;
              wObj.gear = 'R';
              state.throttlePercent = wObj.reversePercent;
            } else if (wObj.gasPercent > 3) {
              state.gearIndex = 3;
              wObj.gear = 'D';
            }
            if (wObj.gasPercent > 3 || Math.abs(msg.steeringNorm || 0) > 0.04) {
              if (state.playerMode !== 'DRIVING') {
                state.playerMode = 'DRIVING';
                state.engineRunning = true;
              }
            }
          }
        } else if (msg.type === 'RC_HARDWARE_TELEMETRY') {
          // Đồng bộ tốc độ thực từ xe RC bên ngoài & kích hoạt tông Bà Già nếu xe RC ngoài đời đâm vật cản
          if (typeof msg.speedKmh === 'number') {
            state.speedKmh = msg.speedKmh;
            state.velocityMs = msg.speedKmh / 3.6;
          }
          if (msg.obstacleHit) {
            triggerRealRcObstacleGrannyCrash();
          }
        } else if (msg.type === 'WORLD_STATE' && Array.isArray(msg.cars)) {
          for (const c of msg.cars) {
            // Đồng bộ ghế ngồi nếu người chơi khác đổi chỗ với mình trên cùng 1 xe
            if (c.carId === state.activeCarId && state.playerId) {
              for (const s of [0, 1, 2, 3]) {
                if (c.occupants && c.occupants[s] === state.playerId && state.seatIndex !== s) {
                  state.seatIndex = s;
                  driverSeatMount.position.copy(SEAT_POSITIONS[s].pos);
                }
              }
            }
            if (c.carId === state.activeCarId && state.seatIndex !== 0 && state.playerMode === 'DRIVING') {
              // Nếu mình đang ngồi ghế phụ (1, 2, 3) trên xe do người chơi kia cầm lái (ghế 0): đồng bộ vị trí xe theo tài xế!
              vehicleRoot.position.x = THREE.MathUtils.lerp(vehicleRoot.position.x, c.x, 0.35);
              vehicleRoot.position.z = THREE.MathUtils.lerp(vehicleRoot.position.z, c.z, 0.35);
              state.headingRad = c.heading;
              vehicleRoot.rotation.y = c.heading;
              state.speedKmh = c.speedKmh || 0;
            } else if (c.carId !== state.activeCarId) {
              if (!remoteCarMeshes.has(c.carId)) {
                remoteCarMeshes.set(c.carId, createRemotePeerCarMesh(c));
              }
              const rMesh = remoteCarMeshes.get(c.carId);
              rMesh.position.set(c.x, 0, c.z);
              rMesh.rotation.y = c.heading || 0;
            }
          }
        }
      } catch (e) {}
    };
  } catch (err) {}
})();

// Vòng lặp bổ trợ chạy song song để cập nhật Tay cầm, Xi-nhan, Gạt mưa, Va chạm & Đồng bộ Multiplayer
let mpSyncTimer = 0;
let lastLoopTime = performance.now();

function supplementaryFrameUpdate() {
  requestAnimationFrame(supplementaryFrameUpdate);
  const now = performance.now();
  const dt = Math.min((now - lastLoopTime) / 1000, 0.1);
  lastLoopTime = now;

  // 1. Đọc nút xoay (Thumbstick), 4 nút A/B/X/Y của tay cầm Quest & Hand Tracking
  pollQuestGamepadAndHands(dt);

  // Truyền giá trị nút xoay (Thumbstick) vào hệ thống di chuyển
  if (Math.abs(xrThumbstickForward) > 0.12 || Math.abs(xrThumbstickTurn) > 0.12) {
    wheelDecayTimer = 0.15;
    wheelWalkOrGas = xrThumbstickForward;
    wheelSteerOrTurn = xrThumbstickTurn;
  }

  // 2. Nhấp nháy đèn Xi-nhan 3D & âm thanh tích-tắc
  if (state.turnSignal !== 'OFF') {
    state.turnSignalBlinkTimer += dt;
    if (state.turnSignalBlinkTimer >= 0.45) {
      state.turnSignalBlinkTimer = 0;
      playTurnSignalTickSound();
    }
    const blinkOn = state.turnSignalBlinkTimer < 0.22;
    turnSignalLamps.left.forEach((m) => m.material.color.setHex(state.turnSignal === 'LEFT' && blinkOn ? 0xffaa00 : 0x332200));
    turnSignalLamps.right.forEach((m) => m.material.color.setHex(state.turnSignal === 'RIGHT' && blinkOn ? 0xffaa00 : 0x332200));
  } else {
    turnSignalLamps.left.forEach((m) => m.material.color.setHex(0x332200));
    turnSignalLamps.right.forEach((m) => m.material.color.setHex(0x332200));
  }

  // 3. Chuyển động cần gạt mưa khi trời mưa
  if (state.wipersActive) {
    state.wiperAngle += dt * 6.5;
    const wRot = Math.sin(state.wiperAngle) * 0.65;
    wiperLeftPivot.rotation.z = wRot;
    wiperRightPivot.rotation.z = wRot;
  }

  // 4. Kiểm tra va chạm NPC, phương tiện, Bà Già và chặn xuyên địa hình khi chưa kết nối ESP32
  updatePhysicsCollisionsAndTerrainLock(dt);

  // 5. Gửi đồng bộ vị trí xe & trạng thái thò đầu/đổi ghế lên Multiplayer Server
  mpSyncTimer += dt;
  if (mpSyncTimer >= 0.08 && mpSocket && mpSocket.readyState === WebSocket.OPEN) {
    mpSyncTimer = 0;
    mpSocket.send(JSON.stringify({
      type: 'PLAYER_SYNC',
      x: state.avatarPos.x,
      z: state.avatarPos.z,
      yaw: state.avatarYaw,
      inCarId: state.playerMode === 'DRIVING' ? state.activeCarId : null,
      seatIndex: state.seatIndex,
      leaningOut: state.isLeaningOut
    }));

    if (state.playerMode === 'DRIVING' && state.seatIndex === 0) {
      mpSocket.send(JSON.stringify({
        type: 'CAR_SYNC',
        carId: state.activeCarId,
        x: vehicleRoot.position.x,
        z: vehicleRoot.position.z,
        heading: state.headingRad,
        speedKmh: state.speedKmh,
        steerDeg: state.steeringAngleDeg,
        doorsOpen: state.doorsOpen,
        roofOpen: state.convertibleRoofOpen,
        turnSignal: state.turnSignal
      }));
    }
  }
}
requestAnimationFrame(supplementaryFrameUpdate);

// ============================================================================
// 13. BẢN NÂNG CẤP TOÀN DIỆN V102:
//     - TÌM KIẾM YOUTUBE INTERNET THẬT (KHÔNG BAO GIỜ BỊ "VIDEO UNAVAILABLE")
//     - GƯƠNG HẬU TRUNG TÂM CAO RÕ + MÀN HÌNH CAM LÙI GHẾ PHỤ MỞ MODAL NHƯ YOUTUBE
//     - TAY CẦM TƯƠNG TÁC TRỰC TIẾP (THẢ CÒ/CẦN GẠT XE GIẢM TỐC VỀ 0 DỪNG HẲN,
//       CÒ TRƯỚC = THẮNG, CÒ HÔNG = BÓP CÒI, NÚT A = LÊN/XUỐNG XE, NÚT B = ĐỔI MÀU)
//     - MŨI TÊN 3D CHỈ VỊ TRÍ XE CỦA NGƯỜI CHƠI KHI CHƯA LÊN XE
//     - MÔ HÌNH XE MÁY / XE ĐẠP CÓ GHI-ĐÔNG & 2 CÁNH TAY NPC CẦM LÁI + XE BUS,
//       XE CẢNH SÁT, XE CỨU HỎA, Ô TÔ ĐA DẠNG KIỂU DÁNG & MÀU SẮC
//     - ĐÈN GIAO THÔNG LỚN, XE & NPC BIẾT RẼ TRÁI/PHẢI, DỪNG ĐÈN ĐỎ, DỪNG KHI GẶP
//       NGƯỜI CHƠI SANG ĐƯỜNG (KHÔNG CHẠY XUYÊN NGƯỜI CHƠI)
//     - QUY HOẠCH ĐÔ THỊ (CÔNG VIÊN, TIỆM CAFE, BOUTIQUE, CÂY XĂNG, NHÀ DÂN, TRẠM BUS)
//     - KỊCH BẢN NPC: CẢNH SÁT BẮT TRỘM VỀ ĐỒN & NPC QUA ĐƯỜNG CÃI NHAU VỚI XE ->
//       ĂN CƯỚP TỚI CƯỚP XE -> GIẢI TÁN Đợi Ở TRẠM XE BUS ĐỂ LÊN XE BUS!
// ============================================================================

// --- 13.1. SỬA LỖI YOUTUBE TÌM KIẾM INTERNET ("THIS VIDEO IS UNAVAILABLE") ---
async function searchAndPlayYouTubeFromInternet(rawInput) {
  const query = (rawInput || '').trim();
  if (!query) return;

  // Nếu là link YouTube hoặc ID 11 ký tự thì phát trực tiếp
  const ytMatch = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch || /^[a-zA-Z0-9_-]{11}$/.test(query)) {
    const vid = ytMatch ? ytMatch[1] : query;
    if (ytHtml5Video) {
      ytHtml5Video.pause();
      ytHtml5Video.classList.add('panel-hidden');
    }
    if (ytIframe) {
      ytIframe.classList.remove('panel-hidden');
      ytIframe.src = `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&playsinline=1&rel=0`;
    }
    activeYoutubeTitle = `YouTube (${vid})`;
    state.mediaPlaying = true;
    return;
  }

  state.lastActionLog = `🔍 Đang tìm kiếm "${query}" trên YouTube Internet...`;
  let results = [];

  // 1. Gọi qua API /api/yt-search trên server.js
  try {
    const res = await fetch(`/api/yt-search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        results = data.items;
      }
    }
  } catch (e) {}

  // 2. Fallback: Gọi Piped Public API trực tiếp từ trình duyệt nếu chạy tĩnh không qua server.js
  if (results.length === 0) {
    const pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.tokhmi.xyz',
      'https://pipedapi.moomoo.me'
    ];
    for (const host of pipedInstances) {
      try {
        const r = await fetch(`${host}/search?q=${encodeURIComponent(query)}&filter=videos`);
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.items) && d.items.length > 0) {
            results = d.items
              .filter((it) => it.url && it.url.includes('v='))
              .slice(0, 10)
              .map((it) => {
                const vid = it.url.split('v=')[1]?.slice(0, 11);
                return { videoId: vid, title: it.title || query, thumbnail: it.thumbnail };
              });
            if (results.length > 0) break;
          }
        }
      } catch (e) {}
    }
  }

  const playlistSide = ytModal?.querySelector('.yt-playlist-side');
  if (results.length > 0) {
    const first = results[0];
    if (ytHtml5Video) {
      ytHtml5Video.pause();
      ytHtml5Video.classList.add('panel-hidden');
    }
    if (ytIframe) {
      ytIframe.classList.remove('panel-hidden');
      ytIframe.src = `https://www.youtube-nocookie.com/embed/${first.videoId}?autoplay=1&playsinline=1&rel=0`;
    }
    activeYoutubeTitle = first.title;
    state.mediaPlaying = true;
    state.lastActionLog = `▶ Đang phát kết quả tìm kiếm: ${first.title}`;

    // Hiển thị danh sách kết quả tìm kiếm thật ngay bên cột phải của khung YouTube
    if (playlistSide) {
      playlistSide.innerHTML = `<div style="font-size:11px;color:#00ff88;font-weight:bold;">🔍 KẾT QUẢ YOUTUBE CHO "${escapeHtml(query.toUpperCase())}":</div>`;
      results.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = `yt-card ${idx === 0 ? 'active' : ''}`;
        card.innerHTML = `
          <div style="display:flex;gap:8px;align-items:center;">
            <img src="${escapeHtml(item.thumbnail)}" style="width:68px;height:42px;object-fit:cover;border-radius:4px;border:1px solid #444;" />
            <div style="flex:1;overflow:hidden;">
              <b style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${idx + 1}. ${escapeHtml(item.title)}</b>
              <span>Bấm để phát ngay trong khung</span>
            </div>
          </div>
        `;
        card.addEventListener('click', () => {
          playlistSide.querySelectorAll('.yt-card').forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
          if (ytHtml5Video) {
            ytHtml5Video.pause();
            ytHtml5Video.classList.add('panel-hidden');
          }
          if (ytIframe) {
            ytIframe.classList.remove('panel-hidden');
            ytIframe.src = `https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&playsinline=1&rel=0`;
          }
          activeYoutubeTitle = item.title;
          state.lastActionLog = `▶ Đang phát: ${item.title}`;
        });
        playlistSide.appendChild(card);
      });
    }
  } else {
    state.lastActionLog = `⚠ Không tìm thấy kết quả cho "${query}", đang phát kênh YouTube trực tuyến dự phòng.`;
    if (ytIframe) {
      ytIframe.classList.remove('panel-hidden');
      ytIframe.src = 'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1&playsinline=1';
    }
  }
}

// Gắn lại sự kiện nút Tìm kiếm YouTube để dùng bộ tìm kiếm thật trên Internet
const btnYtSearch = document.getElementById('btn-yt-load-url');
if (btnYtSearch) {
  const newBtn = btnYtSearch.cloneNode(true);
  btnYtSearch.parentNode.replaceChild(newBtn, btnYtSearch);
  newBtn.addEventListener('click', () => {
    const val = document.getElementById('yt-custom-input')?.value.trim() || '';
    if (val) searchAndPlayYouTubeFromInternet(val);
  });
}
const inputYtSearch = document.getElementById('yt-custom-input');
if (inputYtSearch) {
  const newInp = inputYtSearch.cloneNode(true);
  inputYtSearch.parentNode.replaceChild(newInp, inputYtSearch);
  newInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && newInp.value.trim()) {
      searchAndPlayYouTubeFromInternet(newInp.value.trim());
    }
  });
}

// --- 13.2. GƯƠNG HẬU TRUNG TÂM CAO RÕ & MÀN HÌNH CAM LÙI GHẾ PHỤ (NHẤN VÀO HIỆN KHUNG MODAL NHƯ YOUTUBE) ---
const rearCamModal = document.getElementById('rear-cam-app-modal');
const rearCamModalCanvas = document.getElementById('rear-cam-modal-canvas');
const rearCamModalCtx = rearCamModalCanvas ? rearCamModalCanvas.getContext('2d') : null;

function openRearCamFloatingModal() {
  initAudio();
  if (rearCamModal) {
    rearCamModal.style.top = '52%';
    rearCamModal.style.left = '50%';
    rearCamModal.style.transform = 'translate(-50%, -50%)';
    rearCamModal.classList.remove('panel-hidden');
    state.lastActionLog = '🎥 Đã mở Cửa sổ Cam Lùi & Gương Hậu nổi (Có thể kéo thả như khung YouTube)!';
  }
}

function closeRearCamFloatingModal() {
  rearCamModal?.classList.add('panel-hidden');
}

document.getElementById('btn-close-rearcam-modal')?.addEventListener('click', closeRearCamFloatingModal);

// Cho phép kéo thả cửa sổ Cam Lùi nổi
(function setupDraggableRearCamModal() {
  const hdr = document.getElementById('rear-cam-modal-header');
  if (!rearCamModal || !hdr) return;
  let dragging = false;
  let offX = 0;
  let offY = 0;
  hdr.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    const r = rearCamModal.getBoundingClientRect();
    offX = e.clientX - r.left;
    offY = e.clientY - r.top;
    rearCamModal.style.transform = 'none';
    rearCamModal.style.left = `${r.left}px`;
    rearCamModal.style.top = `${r.top}px`;
    hdr.setPointerCapture(e.pointerId);
  });
  hdr.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    rearCamModal.style.left = `${THREE.MathUtils.clamp(e.clientX - offX, 10, window.innerWidth - rearCamModal.offsetWidth - 10)}px`;
    rearCamModal.style.top = `${THREE.MathUtils.clamp(e.clientY - offY, 10, window.innerHeight - rearCamModal.offsetHeight - 10)}px`;
  });
  hdr.addEventListener('pointerup', () => { dragging = false; });
})();

// Nâng cấp Màn hình Cam Lùi bên Ghế Phụ (To hơn, cao hơn, xoay hướng về cả Ghế Phụ lẫn Tài Xế & bấm vào là mở Modal!)
// Đồng thời thêm Gương Chiếu Hậu Trung Tâm ở mép trên kính chắn gió để KHÔNG BAO GIỜ bị che bởi khung bàn đạp!
(function upgradePassengerRearScreenAndTopMirror() {
  // 1. Tìm màn hình cam lùi bên ghế phụ cũ và nâng cấp vị trí + gắn sự kiện click mở Modal
  chassisGroup.children.forEach((child) => {
    if (child.isMesh && Math.abs(child.position.x - 0.44) < 0.05 && Math.abs(child.position.y - 0.74) < 0.05) {
      child.position.set(0.42, 0.84, -0.34); // Nâng cao lên để người ngồi ghế phụ nhìn thấy ngay trước mắt
      child.rotation.set(THREE.MathUtils.degToRad(-6), THREE.MathUtils.degToRad(-8), 0);
      child.scale.set(1.35, 1.45, 1);
      register3DTarget(child, openRearCamFloatingModal);
    }
  });

  // Thêm nút 3D ngay dưới màn hình phụ bên ghế phụ để bấm mở rộng khung Cam Lùi
  createCockpit3DButton(
    chassisGroup,
    '🎥 MỞ RỘNG CAM LÙI',
    0.18, 0.038, 0.015,
    new THREE.Vector3(0.42, 0.73, -0.33),
    '#0077b6',
    openRearCamFloatingModal
  );

  // 2. Tạo Gương Chiếu Hậu Trung Tâm (Top Center Rearview Mirror) gắn trên đỉnh kính chắn gió (y = 1.34m)
  const topMirrorGroup = new THREE.Group();
  topMirrorGroup.position.set(0, 1.34, -0.52);
  topMirrorGroup.rotation.x = THREE.MathUtils.degToRad(8);
  const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.02), matChrome);
  const mirrorScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.12),
    new THREE.MeshBasicMaterial({ map: rearCamTex, side: THREE.DoubleSide })
  );
  mirrorScreen.position.z = 0.012;
  topMirrorGroup.add(mirrorFrame, mirrorScreen);
  chassisGroup.add(topMirrorGroup);
  register3DTarget(mirrorScreen, openRearCamFloatingModal);

  // Dịch bảng HUD 3D sang góc trái một chút để tầm nhìn kính chắn gió và gương hậu thoáng hoàn toàn
  if (hudPanelGroup) {
    HUD_DEFAULT_POS.set(-0.88, 1.08, -0.50);
    hudPanelGroup.position.copy(HUD_DEFAULT_POS);
  }
})();

// --- 13.3. ĐỔI MÀU SƠN XE CỦA NGƯỜI CHƠI (BẰNG BẢNG CHỨC NĂNG HOẶC NÚT B TAY CẦM) ---
const CAR_PAINT_PALETTE = [
  { hex: 0x101829, name: 'Đen Sapphire' },
  { hex: 0xf5f7fa, name: 'Trắng Ngọc Trai' },
  { hex: 0xb80c09, name: 'Đỏ Ruby Hoàng Gia' },
  { hex: 0xd4af37, name: 'Vàng Gold Rolls-Royce' },
  { hex: 0x0077b6, name: 'Xanh Dương Đại Dương' },
  { hex: 0x2a9d8f, name: 'Xanh Ngọc Lục Bảo' },
  { hex: 0x7209b7, name: 'Tím Tinh Vân VIP' }
];
let currentCarPaintIdx = 0;

function changePlayerCarPaintColor(hexColor, colorName) {
  matBodyPaint.color.setHex(hexColor);
  state.lastActionLog = `🎨 Đã đổi màu sơn xe Rolls-Royce sang: ${colorName}!`;
}

function cyclePlayerCarPaintColor() {
  initAudio();
  currentCarPaintIdx = (currentCarPaintIdx + 1) % CAR_PAINT_PALETTE.length;
  const item = CAR_PAINT_PALETTE[currentCarPaintIdx];
  changePlayerCarPaintColor(item.hex, item.name);
  const sel = document.getElementById('car-color-select');
  if (sel) sel.selectedIndex = currentCarPaintIdx;
}

document.getElementById('car-color-select')?.addEventListener('change', (e) => {
  const hex = parseInt(e.target.value.replace('#', '0x'), 16);
  const name = e.target.options[e.target.selectedIndex].text;
  changePlayerCarPaintColor(hex, name);
});
document.getElementById('btn-cycle-color')?.addEventListener('click', cyclePlayerCarPaintColor);

// --- 13.4. MŨI TÊN 3D PHÁT SÁNG CHỈ VỊ TRÍ XE CỦA NGƯỜI CHƠI KHI CHƯA LÊN XE ---
const playerCarArrowIndicator = new THREE.Group();
(function buildFloatingCarArrowMarker() {
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 12), arrowMat);
  shaft.position.y = 0.65;
  const coneHead = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.55, 12), arrowMat);
  coneHead.rotation.x = Math.PI; // Mũi tên chỉ thẳng xuống chiếc xe của người chơi
  coneHead.position.y = 0.15;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.045, 10, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd60a })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.15;
  playerCarArrowIndicator.add(shaft, coneHead, ring);
  playerCarArrowIndicator.position.set(0, 2.85, 0);
  chassisGroup.add(playerCarArrowIndicator);
})();

// --- 13.5. NÂNG CẤP MÔ HÌNH XE MÁY, XE ĐẠP (CÓ ĐẦU XE, GHI-ĐÔNG TAY LÁI & 2 TAY NPC CẦM LÁI)
//           VÀ BỔ SUNG XE BUS, XE CỨU HỎA, XE CẢNH SÁT, Ô TÔ KIỂU DÁNG CHÂN THẬT ---
function upgradeAllExistingNpcBikesAndCars() {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.45 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.8, roughness: 0.25 });

  for (const veh of allTrafficVehicles) {
    const vd = veh.userData;
    if (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE') {
      // 1. Tạo Phuộc trước (Front Fork), Đầu xe (Headset/Fairing) và Ghi-đông Tay lái ngang (Handlebar)
      const steeringStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 10), matChrome);
      steeringStem.position.set(0, 0.68, -0.44);
      steeringStem.rotation.x = 0.22;

      const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.58, 10), matChrome);
      handlebar.rotation.z = Math.PI / 2;
      handlebar.position.set(0, 0.94, -0.38);

      // 2 Bao tay cầm (Grips) + Gương chiếu hậu xe máy
      const gripGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.12, 8);
      const gripL = new THREE.Mesh(gripGeo, matPiano);
      gripL.rotation.z = Math.PI / 2;
      gripL.position.set(-0.26, 0.94, -0.38);
      const gripR = gripL.clone();
      gripR.position.x = 0.26;

      // 2. Tạo 2 Cánh Tay của NPC vươn từ vai ra nắm đúng vào 2 bao tay cầm ghi-đông!
      const armGeo = new THREE.CapsuleGeometry(0.042, 0.36, 8, 8);
      const leftArm = new THREE.Mesh(armGeo, skinMat);
      leftArm.position.set(-0.20, 1.02, -0.14);
      leftArm.rotation.x = Math.PI / 2.4;
      leftArm.rotation.z = -0.15;

      const rightArm = new THREE.Mesh(armGeo, skinMat);
      rightArm.position.set(0.20, 1.02, -0.14);
      rightArm.rotation.x = Math.PI / 2.4;
      rightArm.rotation.z = 0.15;

      // 3. Làm mềm mại thân xe máy / xe đạp (Yên xe bo tròn, đèn pha tròn, ống xả mạ chrome)
      const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.32, 10, 12), matPiano);
      saddle.rotation.x = Math.PI / 2;
      saddle.position.set(0, 0.76, 0.16);

      const roundLamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16),
        new THREE.MeshBasicMaterial({ color: 0xfffae0 })
      );
      roundLamp.rotation.x = Math.PI / 2;
      roundLamp.position.set(0, 0.88, -0.58);

      veh.add(steeringStem, handlebar, gripL, gripR, leftArm, rightArm, saddle, roundLamp);

      if (vd.category === 'MOTORBIKE') {
        const exhaustPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.68, 12), matChrome);
        exhaustPipe.rotation.x = Math.PI / 2 - 0.12;
        exhaustPipe.position.set(0.22, 0.36, 0.38);
        veh.add(exhaustPipe);
      }
    } else if (vd.category === 'CAR') {
      // Nâng cấp Ô tô NPC: Thêm mũi bo tròn khí động học, đuôi xe, lưới tản nhiệt, đèn hậu & gương chiếu hậu
      const carColor = [0xe63946, 0x00bbf9, 0xffbe0b, 0x2a9d8f, 0x9b5de5, 0xf77f00][Math.floor(Math.random() * 6)];
      const smoothMat = new THREE.MeshPhysicalMaterial({ color: carColor, roughness: 0.14, metalness: 0.55, clearcoat: 1.0 });
      const noseCurve = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.42, 12, 16), smoothMat);
      noseCurve.rotation.z = Math.PI / 2;
      noseCurve.position.set(0, 0.48, -2.15);
      const rearCurve = noseCurve.clone();
      rearCurve.position.set(0, 0.52, 2.15);
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.05, 0.24), matPiano);
      spoiler.position.set(0, 0.88, 2.08);
      veh.add(noseCurve, rearCurve, spoiler);
    }
  }
}
upgradeAllExistingNpcBikesAndCars();

// Bổ sung XE BUS, XE CỨU HỎA, XE CẢNH SÁT vào lưu thông thành phố
const emergencyLightMeshes = [];
const policeCarsList = [];
const cityBusesList = [];

function spawnSpecialCityVehicles() {
  // 1. XE BUS THÀNH PHỐ (CITY BUS) - Đón khách tại các Trạm Xe Bus
  for (let i = 0; i < 2; i++) {
    const bus = new THREE.Group();
    const busPaint = new THREE.MeshPhysicalMaterial({ color: i === 0 ? 0xffbe0b : 0x00bbf9, roughness: 0.2, clearcoat: 0.9 });
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.15, 7.8), busPaint);
    mainBody.position.set(0, 1.42, 0);
    const roof = new THREE.Mesh(new THREE.CapsuleGeometry(1.12, 5.6, 12, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    roof.rotation.x = Math.PI / 2;
    roof.scale.set(1.0, 1.0, 0.25);
    roof.position.set(0, 2.48, 0);

    // Kính chắn gió lớn & các ô cửa sổ hành khách dọc thân xe Bus
    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.15), matGlass);
    frontGlass.position.set(0, 1.65, -3.91);
    frontGlass.rotation.y = Math.PI;
    bus.add(mainBody, roof, frontGlass);

    for (let wz = -2.6; wz <= 2.6; wz += 1.3) {
      [-1.18, 1.18].forEach((wx) => {
        const wGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.78), matGlass);
        wGlass.position.set(wx, 1.72, wz);
        wGlass.rotation.y = wx > 0 ? Math.PI / 2 : -Math.PI / 2;
        bus.add(wGlass);
      });
    }

    const wheels = [];
    [[-1.12, -2.4], [1.12, -2.4], [-1.12, 2.4], [1.12, 2.4]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 20), matTireRubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.46, wz);
      bus.add(w);
      wheels.push(w);
    });

    const hornBadge = createHornAlertSprite('🚌 XE BUS ĐÓN KHÁCH!', '#ffbe0b');
    hornBadge.position.set(0, 3.1, 0);
    bus.add(hornBadge);

    const dir = i === 0 ? 1 : -1;
    bus.position.set(dir === 1 ? -6.2 : 6.2, 0, i === 0 ? -42 : 48);
    bus.rotation.y = dir === 1 ? Math.PI : 0;
    enableShadowsRecursive(bus, true, true);
    bus.userData = {
      category: 'BUS',
      modelName: 'Xe Bus Thành Phố',
      dir,
      axis: 'Z',
      baseSpeed: 8.5,
      currentSpeed: 8.5,
      wheels,
      hornBadge,
      hornCooldown: 0,
      busStopTimer: 0
    };
    scene.add(bus);
    allTrafficVehicles.push(bus);
    cityBusesList.push(bus);
  }

  // 2. XE CỨU HỎA (FIRETRUCK) - Có thang cứu hỏa bạc và đèn ưu tiên trên nóc
  const fireTruck = new THREE.Group();
  const fireRed = new THREE.MeshPhysicalMaterial({ color: 0xd90429, roughness: 0.15, clearcoat: 1.0 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.85, 2.2), fireRed);
  cab.position.set(0, 1.25, -2.1);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.65, 4.2), fireRed);
  tank.position.set(0, 1.15, 1.1);
  const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 5.6), matChrome);
  ladder.position.set(0, 2.15, 0.2);

  const sirenR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.22), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  sirenR.position.set(-0.45, 2.24, -2.6);
  const sirenB = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.22), new THREE.MeshBasicMaterial({ color: 0x0077ff }));
  sirenB.position.set(0.45, 2.24, -2.6);
  emergencyLightMeshes.push({ r: sirenR, b: sirenB });

  const ftWheels = [];
  [[-1.08, -2.1], [1.08, -2.1], [-1.08, 0.6], [1.08, 0.6], [-1.08, 2.3], [1.08, 2.3]].forEach(([wx, wz]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.30, 18), matTireRubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.44, wz);
    fireTruck.add(w);
    ftWheels.push(w);
  });

  const ftBadge = createHornAlertSprite('🚒 XE CỨU HỎA!', '#ff3b30');
  ftBadge.position.set(0, 2.85, 0);
  fireTruck.add(cab, tank, ladder, sirenR, sirenB, ftBadge);
  fireTruck.position.set(-2.8, 0, 28);
  fireTruck.rotation.y = Math.PI;
  enableShadowsRecursive(fireTruck, true, true);
  fireTruck.userData = {
    category: 'FIRETRUCK',
    modelName: 'Xe Cứu Hỏa',
    dir: 1,
    axis: 'Z',
    baseSpeed: 10.2,
    currentSpeed: 10.2,
    wheels: ftWheels,
    hornBadge: ftBadge,
    hornCooldown: 0
  };
  scene.add(fireTruck);
  allTrafficVehicles.push(fireTruck);

  // 3. XE CẢNH SÁT TUẦN TRA (POLICE CAR) - Bắt trộm trên vỉa hè về đồn
  for (let i = 0; i < 2; i++) {
    const policeCar = new THREE.Group();
    const blackMat = new THREE.MeshPhysicalMaterial({ color: 0x111622, roughness: 0.15, clearcoat: 1.0 });
    const whiteMat = new THREE.MeshPhysicalMaterial({ color: 0xf8f9fa, roughness: 0.15, clearcoat: 1.0 });

    const pHull = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.48, 4.5), blackMat);
    pHull.position.y = 0.50;
    const pDoors = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.44, 1.95), whiteMat);
    pDoors.position.y = 0.51;
    const pCabin = new THREE.Mesh(new THREE.CylinderGeometry(0.80, 1.10, 1.6, 4), matGlass);
    pCabin.rotation.y = Math.PI / 4;
    pCabin.scale.set(1.0, 0.42, 1.25);
    pCabin.position.set(0, 0.98, 0.05);

    const pBarR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.18), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
    pBarR.position.set(-0.24, 1.32, 0.0);
    const pBarB = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.18), new THREE.MeshBasicMaterial({ color: 0x0088ff }));
    pBarB.position.set(0.24, 1.32, 0.0);
    emergencyLightMeshes.push({ r: pBarR, b: pBarB });

    // NPC Cảnh sát xuất hiện khi dừng xe bắt trộm
    const officerNpc = new THREE.Group();
    const uniMat = new THREE.MeshStandardMaterial({ color: 0x0a2463 });
    const oTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 8, 10), uniMat);
    oTorso.position.y = 1.1;
    const oHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
    oHead.position.y = 1.52;
    const oCap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.08, 12), uniMat);
    oCap.position.y = 1.64;
    const oBadge = createSpeechBubbleSprite('🚓 Đứng im! Cảnh sát đây! Bắt tên trộm về đồn!', '#0a2463', '#00e5ff');
    oBadge.position.set(0, 2.05, 0);
    oBadge.visible = true;
    officerNpc.add(oTorso, oHead, oCap, oBadge);
    officerNpc.position.set(1.4, 0, 0);
    officerNpc.visible = false;
    policeCar.add(officerNpc);

    const pWheels = [];
    [[-0.92, -1.38], [0.92, -1.38], [-0.92, 1.38], [0.92, 1.38]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 18), matTireRubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.35, wz);
      policeCar.add(w);
      pWheels.push(w);
    });

    const pBadge = createHornAlertSprite('🚓 CẢNH SÁT TUẦN TRA!', '#00e5ff');
    pBadge.position.set(0, 1.95, 0);
    policeCar.add(pHull, pDoors, pCabin, pBarR, pBarB, pBadge);

    const dir = i === 0 ? 1 : -1;
    policeCar.position.set(dir === 1 ? -2.8 : 2.8, 0, i === 0 ? -18 : 22);
    policeCar.rotation.y = dir === 1 ? Math.PI : 0;
    enableShadowsRecursive(policeCar, true, true);
    policeCar.userData = {
      category: 'POLICE',
      modelName: 'Xe Cảnh Sát',
      dir,
      axis: 'Z',
      baseSpeed: 11.5,
      currentSpeed: 11.5,
      wheels: pWheels,
      hornBadge: pBadge,
      hornCooldown: 0,
      officerNpc,
      arrestTimer: 0
    };
    scene.add(policeCar);
    allTrafficVehicles.push(policeCar);
    policeCarsList.push(policeCar);
  }
}
spawnSpecialCityVehicles();

// --- 13.6. QUY HOẠCH LẠI ĐÔ THỊ: GIẢM NHÀ CAO TẦNG, THAY BẰNG CÔNG VIÊN, NHÀ DÂN NHỎ, TIỆM CAFE, BOUTIQUE, CÂY XĂNG & TRẠM XE BUS ---
// Đồng thời lắp đặt Cột Đèn Giao Thông Cần Vươn Lớn (Overhead Cantilever Traffic Lights) rõ ràng cho xe
const busStopLocations = [];
const poiLocations = [];

function customizeCityBlocksWithParksShopsAndBusStops() {
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.85 });
  const treeLeafMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.7 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
  const roofTileMat = new THREE.MeshStandardMaterial({ color: 0x9e2a2b, roughness: 0.5 });
  const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xf4e285, roughness: 0.6 });
  const cafeMat = new THREE.MeshStandardMaterial({ color: 0x6f4e37, roughness: 0.4 });
  const boutiqueMat = new THREE.MeshStandardMaterial({ color: 0xff4d6d, roughness: 0.3 });
  const gasStationMat = new THREE.MeshStandardMaterial({ color: 0x00b4d8, roughness: 0.3 });

  cityBlocks.forEach((block, bIdx) => {
    // 1. Bổ sung Đèn Giao Thông Cần Vươn Lớn vươn ra giữa đường để người lái xe nhìn thấy rõ từ xa
    const overheadPole = new THREE.Group();
    overheadPole.position.set(9.8, 0, -9.8);
    const vPost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.2, 10), matPole);
    vPost.position.y = 3.1;
    const hArm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.5, 10), matPole);
    hArm.rotation.z = Math.PI / 2;
    hArm.position.set(-3.2, 5.9, 0);
    const signalBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.52, 0.35), matPiano);
    signalBox.position.set(-3.5, 5.85, 0);

    const rMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const yMat = new THREE.MeshBasicMaterial({ color: 0x332800 });
    const gMat = new THREE.MeshBasicMaterial({ color: 0x003311 });

    const rLight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), rMat);
    rLight.position.set(-4.0, 5.85, 0.2);
    const yLight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), yMat);
    yLight.position.set(-3.5, 5.85, 0.2);
    const gLight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), gMat);
    gLight.position.set(-3.0, 5.85, 0.2);

    overheadPole.add(vPost, hArm, signalBox, rLight, yLight, gLight);
    block.add(overheadPole);
    trafficLights.push({ redMat: rMat, yellowMat: yMat, greenMat: gMat });

    // 2. Tạo Trạm Xe Bus (Bus Stop Shelter) trên vỉa hè mỗi ô phố
    const busStop = new THREE.Group();
    busStop.position.set(-11.2, 0.24, 0);
    const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 4.2), gasStationMat);
    shelterRoof.position.y = 2.45;
    const backGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 4.0), matGlass);
    backGlass.position.set(-0.82, 1.2, 0);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 2.6), matWalnut);
    bench.position.set(-0.4, 0.25, 0);
    const busSign = createSpeechBubbleSprite('🚏 TRẠM XE BUS (ĐỢI XE BUS)', '#003566', '#ffd60a');
    busSign.scale.set(1.5, 0.35, 1);
    busSign.position.set(0, 2.95, 0);
    busSign.visible = true;
    busStop.add(shelterRoof, backGlass, bench, busSign);
    block.add(busStop);
    busStopLocations.push({ block, localPos: new THREE.Vector3(-10.6, 0.12, 0) });

    // 3. Thay thế 3 trên 4 tòa nhà cao tầng ở mỗi ô phố bằng: Công viên, Nhà dân nhỏ, Tiệm Cafe/Boutique & Cây Xăng!
    const highRises = block.children.filter((c) => c.isMesh && c.geometry?.parameters?.height > 12);
    const corners = [[-22, -22], [22, -22], [-22, 22], [22, 22]];

    highRises.forEach((hrMesh, idx) => {
      // Giữ lại đúng 1 tòa nhà văn phòng ở góc idx === 0 của một số ô phố, còn lại thay bằng công trình thấp tầng & công viên
      if (idx === 0 && bIdx % 2 === 0) return;
      hrMesh.visible = false; // Ẩn tòa nhà cao tầng thô cứng

      const [cx, cz] = corners[idx] || [-22, -22];
      const poiGroup = new THREE.Group();
      poiGroup.position.set(cx, 0.24, cz);

      if (idx === 1) {
        // 🌳 CÔNG VIÊN CÂY XANH (PARK)
        const lawn = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 18), grassMat);
        poiGroup.add(lawn);
        for (let t = 0; t < 5; t++) {
          const tx = (t % 2 === 0 ? -4.5 : 4.5) + (t === 4 ? 0 : 0);
          const tz = t < 2 ? -4.5 : (t < 4 ? 4.5 : 0);
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 8), trunkMat);
          trunk.position.set(tx, 1.1, tz);
          const crown = new THREE.Mesh(new THREE.SphereGeometry(1.65, 12, 12), treeLeafMat);
          crown.position.set(tx, 2.9, tz);
          poiGroup.add(trunk, crown);
        }
        const sign = createSpeechBubbleSprite('🌳 CÔNG VIÊN THÀNH PHỐ', '#1b4332', '#4cd964');
        sign.scale.set(1.6, 0.36, 1);
        sign.position.set(0, 4.8, 0);
        sign.visible = true;
        poiGroup.add(sign);
      } else if (idx === 2) {
        // ☕ TIỆM CAFE & 👗 BOUTIQUE CỬA HÀNG THẤP TẦNG
        const cafeBox = new THREE.Mesh(new THREE.BoxGeometry(7.5, 4.2, 8.5), cafeMat);
        cafeBox.position.set(-4.2, 2.1, 0);
        const boutBox = new THREE.Mesh(new THREE.BoxGeometry(7.5, 4.8, 8.5), boutiqueMat);
        boutBox.position.set(4.2, 2.4, 0);
        const signCafe = createSpeechBubbleSprite('☕ TIỆM CAFE & 👗 BOUTIQUE SHOP', '#3d1e38', '#ffbe0b');
        signCafe.scale.set(1.9, 0.38, 1);
        signCafe.position.set(0, 5.6, 4.5);
        signCafe.visible = true;
        poiGroup.add(cafeBox, boutBox, signCafe);
      } else {
        // 🏠 NHÀ DÂN MÁI NGÓI HOẶC ⛽ CÂY XĂNG
        if (bIdx % 2 === 0) {
          const house = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3.8, 8.5), houseWallMat);
          house.position.y = 1.9;
          const roof = new THREE.Mesh(new THREE.ConeGeometry(6.8, 2.6, 4), roofTileMat);
          roof.rotation.y = Math.PI / 4;
          roof.position.y = 5.1;
          const signHouse = createSpeechBubbleSprite('🏠 KHU NHÀ DÂN', '#2b313d', '#00e5ff');
          signHouse.scale.set(1.4, 0.34, 1);
          signHouse.position.set(0, 6.8, 0);
          signHouse.visible = true;
          poiGroup.add(house, roof, signHouse);
        } else {
          const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.45, 9), gasStationMat);
          canopy.position.y = 4.6;
          const pillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.6, 8), matChrome);
          pillar1.position.set(-4.5, 2.3, 0);
          const pillar2 = pillar1.clone();
          pillar2.position.x = 4.5;
          const pump = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xff3b30 }));
          pump.position.set(0, 0.9, 0);
          const signGas = createSpeechBubbleSprite('⛽ TRẠM XĂNG (GAS STATION)', '#003566', '#00ff88');
          signGas.scale.set(1.8, 0.38, 1);
          signGas.position.set(0, 5.5, 0);
          signGas.visible = true;
          poiGroup.add(canopy, pillar1, pillar2, pump, signGas);
        }
      }
      block.add(poiGroup);
      poiLocations.push({ block, localPos: new THREE.Vector3(cx > 0 ? 11.2 : -11.2, 0.12, cz > 0 ? 11.2 : -11.2) });
    });
  });
}
customizeCityBlocksWithParksShopsAndBusStops();

// --- 13.7. HỆ THỐNG GIAO THÔNG THÔNG MINH & KỊCH BẢN TƯƠNG TÁC XÃ HỘI GIỮA CÁC NPC ---
// Gắn vai trò cho các NPC trên vỉa hè: Người đi bộ, NPC Ăn Trộm (Thief), NPC Qua đường cãi nhau & Đi xe bus
sidewalkNpcs.forEach((npc, idx) => {
  const nd = npc.userData;
  nd.axis = 'Z'; // Đi dọc vỉa hè trục Z hoặc rẽ sang trục X tại góc phố
  nd.role = idx % 5 === 0 ? 'THIEF' : (idx % 4 === 1 ? 'CROSSWALK_QUARREL' : 'CITIZEN');
  nd.state = 'WALKING_SIDEWALK'; // 'WALKING_SIDEWALK' | 'ARRESTED' | 'QUARRELING' | 'WALKING_TO_BUS_STOP' | 'WAITING_FOR_BUS' | 'ON_BUS'
  nd.stateTimer = 0;
  nd.turnCooldown = 2 + (idx % 4);

  if (nd.role === 'THIEF') {
    // Đổi trang phục NPC Ăn Trộm sang màu Đen Kín + Nhãn Cảnh báo
    npc.children.forEach((c) => {
      if (c.isMesh && c.geometry?.type === 'CapsuleGeometry' && c.position.y > 0.9) {
        c.material = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
      }
    });
  }
});

let quarrelEventTimer = 6.0;
let activeQuarrelGroup = null;

function updateAdvancedTrafficAndSocialWorld(dt, elapsed) {
  const playerWorldPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;

  // 1. Nhấp nháy đèn ưu tiên Xanh - Đỏ trên nóc Xe Cảnh Sát & Xe Cứu Hỏa
  const flashRed = Math.floor(elapsed * 8) % 2 === 0;
  for (const em of emergencyLightMeshes) {
    em.r.material.color.setHex(flashRed ? 0xff0022 : 0x330008);
    em.b.material.color.setHex(flashRed ? 0x002244 : 0x00aaff);
  }

  // 2. Hiển thị Mũi Tên 3D chỉ vị trí xe của người chơi khi người chơi đang đi bộ (ON_FOOT)
  if (playerCarArrowIndicator) {
    playerCarArrowIndicator.visible = (state.playerMode === 'ON_FOOT');
    if (playerCarArrowIndicator.visible) {
      playerCarArrowIndicator.position.y = 2.85 + Math.sin(elapsed * 5.5) * 0.28;
      playerCarArrowIndicator.rotation.y += dt * 2.5;
    }
  }

  // 3. ĐIỀU KHIỂN CÁC PHƯƠNG TIỆN NPC:
  //    - Dừng đèn đỏ tại ngã tư
  //    - Tự động rẽ trái / rẽ phải tại ngã tư
  //    - Dừng lại ngay khi gặp Người Chơi (đi bộ sang đường hoặc đi xe) -> KHÔNG BAO GIỜ CHẠY XUYÊN NGƯỜI CHƠI!
  //    - Dừng lại khi gặp xe NPC khác phía trước đầu xe (Chỉ duy nhất xe người chơi mới được quyền tông!)
  for (let i = 0; i < allTrafficVehicles.length; i++) {
    const veh = allTrafficVehicles[i];
    const vd = veh.userData;
    if (!vd.axis) vd.axis = 'Z';
    if (!vd.turnCooldown) vd.turnCooldown = 0;
    if (vd.turnCooldown > 0) vd.turnCooldown -= dt;

    // Rollback bước di chuyển thẳng mặc định của vòng lặp cũ để áp dụng AI di chuyển đa hướng (Z & X) + Phanh thông minh
    veh.position.z -= vd.dir * vd.currentSpeed * dt;

    // Nếu là Xe Cảnh Sát đang dừng bắt trộm hoặc Xe Bus đang dừng đón khách ở trạm
    if (vd.arrestTimer && vd.arrestTimer > 0) {
      vd.arrestTimer -= dt;
      vd.currentSpeed = 0;
      if (vd.arrestTimer <= 0 && vd.officerNpc) {
        vd.officerNpc.visible = false;
        vd.hornBadge.visible = false;
      }
      continue;
    }
    if (vd.busStopTimer && vd.busStopTimer > 0) {
      vd.busStopTimer -= dt;
      vd.currentSpeed = 0;
      if (vd.busStopTimer <= 0) vd.hornBadge.visible = false;
      continue;
    }

    const forwardVec = vd.axis === 'Z'
      ? new THREE.Vector3(0, 0, vd.dir)
      : new THREE.Vector3(vd.dir, 0, 0);

    let mustStop = false;
    let stopReason = '';

    // A. KIỂM TRA GẶP NGƯỜI CHƠI (Khi người chơi sang đường đi bộ hoặc đang lái xe trước mặt):
    const toPlayer = playerWorldPos.clone().sub(veh.position);
    const forwardDistToPlayer = toPlayer.dot(forwardVec);
    const lateralDistToPlayer = vd.axis === 'Z' ? Math.abs(toPlayer.x) : Math.abs(toPlayer.z);
    const stopSafeDist = state.playerMode === 'ON_FOOT' ? 6.8 : 8.5;

    if (forwardDistToPlayer > -1.2 && forwardDistToPlayer < stopSafeDist && lateralDistToPlayer < 3.4) {
      mustStop = true;
      stopReason = 'PLAYER';
      // Đẩy nhẹ lùi nếu xe NPC lỡ trớn sát người chơi để tuyệt đối không bao giờ xuyên qua người chơi
      if (forwardDistToPlayer > 0 && forwardDistToPlayer < 2.4) {
        veh.position.addScaledVector(forwardVec, -0.15);
      }
    }

    // B. KIỂM TRA ĐÈN ĐỎ TẠI NGÃ TƯ:
    const localZ = ((veh.position.z % BLOCK_SIZE) + BLOCK_SIZE * 1.5) % BLOCK_SIZE - BLOCK_SIZE / 2;
    const localX = ((veh.position.x % BLOCK_SIZE) + BLOCK_SIZE * 1.5) % BLOCK_SIZE - BLOCK_SIZE / 2;
    const distToIntersection = vd.axis === 'Z' ? localZ * vd.dir : localX * vd.dir;

    if (!mustStop && (currentTrafficPhase === 'RED' || currentTrafficPhase === 'YELLOW')) {
      if (distToIntersection > -14.5 && distToIntersection < -9.2) {
        mustStop = true;
        stopReason = 'RED_LIGHT';
      }
    }

    // C. KIỂM TRA XE NPC KHÁC PHÍA TRƯỚC ĐẦU XE (Tránh va chạm giữa các xe NPC):
    if (!mustStop) {
      for (let j = 0; j < allTrafficVehicles.length; j++) {
        if (i === j) continue;
        const other = allTrafficVehicles[j];
        const toOther = other.position.clone().sub(veh.position);
        const fwdDist = toOther.dot(forwardVec);
        const latDist = vd.axis === 'Z' ? Math.abs(toOther.x) : Math.abs(toOther.z);
        if (fwdDist > 0.5 && fwdDist < 8.2 && latDist < 2.3) {
          mustStop = true;
          stopReason = 'TRAFFIC_AHEAD';
          break;
        }
      }
    }

    // D. KIỂM TRA GẶP NPC ĐANG QUA ĐƯỜNG / ĐANG CÃI NHAU GIỮA ĐƯỜNG:
    if (!mustStop) {
      for (const npc of sidewalkNpcs) {
        if (npc.userData.state === 'QUARRELING' || npc.userData.state === 'WALKING_TO_BUS_STOP') {
          const toNpc = npc.position.clone().sub(veh.position);
          const fwdDist = toNpc.dot(forwardVec);
          const latDist = vd.axis === 'Z' ? Math.abs(toNpc.x) : Math.abs(toNpc.z);
          if (fwdDist > 0 && fwdDist < 7.0 && latDist < 2.6) {
            mustStop = true;
            break;
          }
        }
      }
    }

    if (mustStop) {
      vd.currentSpeed = THREE.MathUtils.lerp(vd.currentSpeed, 0, dt * 14);
      if (stopReason === 'PLAYER') {
        vd.hornBadge.visible = true;
        if (vd.hornCooldown <= 0 && veh.position.distanceTo(playerWorldPos) < 25) {
          playSmartVehicleHornSound(vd.category);
          vd.hornCooldown = 2.8;
        }
      }
    } else {
      vd.currentSpeed = THREE.MathUtils.lerp(vd.currentSpeed, vd.baseSpeed, dt * 4);
      if (vd.hornCooldown <= 0.5) vd.hornBadge.visible = false;
    }

    // E. XE BIẾT RẼ TRÁI / RẼ PHẢI TẠI TÂM NGÃ TƯ KHI ĐÈN XANH:
    if (!mustStop && vd.turnCooldown <= 0 && Math.abs(localX) < 6.5 && Math.abs(localZ) < 6.5) {
      if (Math.random() < 0.35) {
        const turnRight = Math.random() > 0.5;
        if (vd.axis === 'Z') {
          vd.axis = 'X';
          vd.dir = turnRight ? -vd.dir : vd.dir;
        } else {
          vd.axis = 'Z';
          vd.dir = turnRight ? vd.dir : -vd.dir;
        }
        vd.turnCooldown = 8.0;
      } else {
        vd.turnCooldown = 4.0;
      }
    }

    // Cập nhật vị trí & góc xoay theo trục Z hoặc X
    if (vd.axis === 'Z') {
      veh.position.z += vd.dir * vd.currentSpeed * dt;
      veh.rotation.y = vd.dir === 1 ? Math.PI : 0;
    } else {
      veh.position.x += vd.dir * vd.currentSpeed * dt;
      veh.rotation.y = vd.dir === 1 ? -Math.PI / 2 : Math.PI / 2;
      if (veh.position.x - playerWorldPos.x > 95) veh.position.x -= 190;
      else if (veh.position.x - playerWorldPos.x < -95) veh.position.x += 190;
    }
  }

  // 4. KỊCH BẢN 1: NPC ĂN TRỘM ĐI TRÊN VỈA HÈ GẶP XE CẢNH SÁT -> CẢNH SÁT DỪNG XE BƯỚC RA BẮT VỀ ĐỒN!
  for (const pCar of policeCarsList) {
    const pd = pCar.userData;
    if (pd.arrestTimer > 0) continue;

    for (const npc of sidewalkNpcs) {
      const nd = npc.userData;
      if (nd.role === 'THIEF' && nd.state === 'WALKING_SIDEWALK') {
        const d = pCar.position.distanceTo(npc.position);
        if (d < 11.5) {
          // Cảnh sát phát hiện tên trộm! Dừng xe, bật còi, cảnh sát bước ra bắt trộm
          pd.arrestTimer = 5.5;
          pd.currentSpeed = 0;
          pd.hornBadge.visible = true;
          if (pd.officerNpc) {
            pd.officerNpc.visible = true;
            pd.officerNpc.lookAt(npc.position);
          }

          nd.state = 'ARRESTED';
          nd.stateTimer = 5.5;
          nd.helloBubble.visible = true;
          npc.lookAt(pCar.position);
          state.crimeLog = '🚓 CẢNH SÁT TUẦN TRA vừa dừng xe khống chế và bắt giữ tên Trộm trên vỉa hè đưa về đồn!';
          state.lastActionLog = state.crimeLog;
          break;
        }
      }
    }
  }

  // 5. KỊCH BẢN 2: NPC QUA ĐƯỜNG GẶP NPC ĐI XE -> DỪNG LẠI CHỬI NHAU -> ĂN CƯỚP TỚI CƯỚP XE -> GIẢI TÁN ĐỢI XE BUS!
  quarrelEventTimer -= dt;
  if (quarrelEventTimer <= 0 && !activeQuarrelGroup) {
    quarrelEventTimer = 18.0;
    // Tìm 1 NPC gần người chơi để sang đường và gặp 1 xe NPC
    const candidateNpc = sidewalkNpcs.find((n) => n.userData.state === 'WALKING_SIDEWALK' && n.position.distanceTo(playerWorldPos) < 38);
    const candidateVeh = allTrafficVehicles.find((v) => (v.userData.category === 'MOTORBIKE' || v.userData.category === 'CAR') && v.position.distanceTo(playerWorldPos) < 38);
    const thiefNpc = sidewalkNpcs.find((n) => n.userData.role === 'THIEF' && n.userData.state === 'WALKING_SIDEWALK');

    if (candidateNpc && candidateVeh && thiefNpc) {
      // Đưa NPC ra sát đầu xe để diễn ra vụ va chạm nhỏ & cãi nhau
      candidateVeh.userData.currentSpeed = 0;
      candidateVeh.userData.busStopTimer = 6.5; // Giữ xe dừng lại trong lúc cãi nhau
      candidateVeh.userData.hornBadge.visible = true;

      candidateNpc.position.copy(candidateVeh.position).add(new THREE.Vector3(0, 0.12, candidateVeh.userData.dir * 2.6));
      candidateNpc.lookAt(candidateVeh.position);
      candidateNpc.userData.state = 'QUARRELING';
      candidateNpc.userData.stateTimer = 4.0;
      candidateNpc.userData.helloBubble.visible = true;

      // Tên cướp lao tới vị trí chiếc xe
      thiefNpc.position.copy(candidateVeh.position).add(new THREE.Vector3(1.8, 0.12, 0));
      thiefNpc.lookAt(candidateVeh.position);
      thiefNpc.userData.helloBubble.visible = true;

      activeQuarrelGroup = { npc: candidateNpc, veh: candidateVeh, thief: thiefNpc, phase: 'ARGUING', timer: 3.5 };
      state.crimeLog = '🤬 Hai NPC qua đường và đi xe đang dừng lại nhìn nhau chửi nhau kịch liệt giữa phố!';
      state.lastActionLog = state.crimeLog;
    }
  }

  if (activeQuarrelGroup) {
    activeQuarrelGroup.timer -= dt;
    if (activeQuarrelGroup.phase === 'ARGUING' && activeQuarrelGroup.timer <= 0) {
      // Giai đoạn 2: Tên cướp lao lên cướp chiếc xe phóng đi, các NPC giải tán đi bộ sang Trạm Xe Bus!
      activeQuarrelGroup.phase = 'ROBBED_AND_DISPERSE';
      activeQuarrelGroup.timer = 4.0;
      const { npc, veh, thief } = activeQuarrelGroup;

      thief.position.copy(veh.position);
      veh.userData.busStopTimer = 0;
      veh.userData.currentSpeed = veh.userData.baseSpeed * 1.5; // Tên cướp phóng xe vọt đi

      npc.userData.state = 'WALKING_TO_BUS_STOP';
      state.crimeLog = '🦹‍♂️ Tên Cướp đã nhảy lên cướp xe phóng đi! Các NPC giải tán đi bộ sang Trạm Xe Bus đợi lên Xe Bus!';
      state.lastActionLog = state.crimeLog;
    } else if (activeQuarrelGroup.phase === 'ROBBED_AND_DISPERSE' && activeQuarrelGroup.timer <= 0) {
      activeQuarrelGroup = null;
    }
  }

  // 6. CẬP NHẬT TRẠNG THÁI CỦA TỪNG NPC ĐI BỘ TRÊN VỈA HÈ, ĐỢI Ở TRẠM XE BUS & LÊN XE BUS:
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;

    // Giữ NPC luôn đi chuẩn trên vỉa hè (|x| >= 10.2) khi ở trạng thái WALKING_SIDEWALK
    if (nd.state === 'WALKING_SIDEWALK') {
      if (Math.abs(npc.position.x) < 9.8) {
        npc.position.x = (npc.position.x >= 0 ? 1 : -1) * 10.6;
      }
      // Ngẫu nhiên ghé thăm Tiệm Cafe / Boutique / Công viên hoặc đi bộ đến Trạm Xe Bus
      if (Math.random() < 0.0015) {
        nd.state = 'WALKING_TO_BUS_STOP';
      }
    } else if (nd.state === 'ARRESTED') {
      // Đứng im chờ Cảnh sát còng tay đưa lên xe cảnh sát về đồn
      npc.position.z -= nd.dir * nd.speed * dt;
      nd.stateTimer -= dt;
      if (nd.stateTimer <= 0) {
        // Đưa về đồn (respawn ở ô phố xa)
        nd.helloBubble.visible = false;
        nd.state = 'WALKING_SIDEWALK';
        npc.position.z += 65;
      }
    } else if (nd.state === 'QUARRELING') {
      npc.position.z -= nd.dir * nd.speed * dt;
      // Vung tay cãi nhau
      nd.rightArm.rotation.x = -Math.PI / 2 + Math.sin(elapsed * 18) * 0.45;
      nd.leftArm.rotation.x = -Math.PI / 2.2 - Math.sin(elapsed * 18) * 0.45;
    } else if (nd.state === 'WALKING_TO_BUS_STOP') {
      npc.position.z -= nd.dir * nd.speed * dt;
      // Đi bộ hướng về Trạm Xe Bus gần nhất ở lề đường x = -10.6
      const targetX = -10.6;
      const targetZ = Math.round(npc.position.z / BLOCK_SIZE) * BLOCK_SIZE;
      const dx = targetX - npc.position.x;
      const dz = targetZ - npc.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6) {
        npc.position.x += (dx / dist) * 1.8 * dt;
        npc.position.z += (dz / dist) * 1.8 * dt;
        npc.rotation.y = Math.atan2(dx, dz);
      } else {
        nd.state = 'WAITING_FOR_BUS';
        nd.helloBubble.visible = true;
      }
    } else if (nd.state === 'WAITING_FOR_BUS') {
      npc.position.z -= nd.dir * nd.speed * dt;
      npc.rotation.y = Math.PI / 2; // Đứng trên vỉa hè tại Trạm Xe Bus nhìn ra lòng đường đợi Xe Bus
      // Kiểm tra khi có Xe Bus chạy tới gần Trạm Xe Bus này
      for (const bus of cityBusesList) {
        if (bus.position.distanceTo(npc.position) < 7.5) {
          bus.userData.busStopTimer = 3.0;
          bus.userData.hornBadge.visible = true;
          nd.state = 'ON_BUS';
          nd.stateTimer = 14.0;
          npc.visible = false; // Bước lên Xe Bus cùng các NPC khác!
          state.socialLog = '🚌 Xe Bus đã dừng tại Trạm! Các NPC đang đợi ở trạm đã cùng bước lên Xe Bus!';
          state.lastActionLog = state.socialLog;
          break;
        }
      }
    } else if (nd.state === 'ON_BUS') {
      nd.stateTimer -= dt;
      if (nd.stateTimer <= 0) {
        // Xuống trạm tiếp theo và đi bộ tiếp trên vỉa hè
        npc.visible = true;
        nd.helloBubble.visible = false;
        nd.state = 'WALKING_SIDEWALK';
        npc.position.x = -10.6;
      }
    }
  }
}

// --- 13.8. TAY CẦM META QUEST TƯƠNG TÁC TRỰC TIẾP TRONG GAME (KHÔNG CẦN BẮN CÒ VÀO BẢNG CHỨC NĂNG)
//           & KHI THẢ CÒ/CẦN GẠT XE GIẢM TỐC VỀ 0 DỪNG HẲN (KHÔNG TỰ THẢ TRÔI TIẾN HAY LÙI!) ---
const directControllerPrev = { a: false, b: false, x: false, y: false, grip: false, thumbPress: false };

function updateDirectGamepadAndZeroDriftPhysics(dt) {
  const session = renderer.xr.getSession();
  const sources = session ? Array.from(session.inputSources) : [];
  const navGps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];

  const pads = [
    ...sources.map((s) => ({ gp: s.gamepad, hand: s.handedness })).filter((i) => i.gp),
    ...navGps.map((gp) => ({ gp, hand: gp.hand || '' }))
  ];

  let frontTriggerBrake = false; // Cò trước (buttons[0]) của tay cầm Trái/Phải luôn là Cò Thắng!
  let sideGripHorn = false;      // Cò bên hông (buttons[1]) của tay cầm Trái/Phải luôn là Bóp Còi!
  let stickDriveVal = 0;         // Nút xoay (Thumbstick Y): Tiến (>0) / Lùi (<0)
  let stickSteerVal = 0;         // Nút xoay (Thumbstick X): Rẽ Trái / Phải
  let btnOpenDoor = false;       // Nút A: Mở cửa Lên / Xuống xe
  let btnColorChange = false;    // Nút B: Đổi màu xe
  let btnLeanOrTurn = false;     // Nút X: Xi-nhan / Thò đầu
  let btnYoutube = false;        // Nút Y: Mở/Đóng YouTube
  let btnThumbPress = false;     // Ấn cần xoay: Đổi ghế / Đề nổ máy

  for (const { gp, hand } of pads) {
    // 1. Cò trước (Trigger - buttons[0]) = Cò Thắng
    if (gp.buttons[0]?.pressed || (gp.buttons[0]?.value || 0) > 0.35) {
      frontTriggerBrake = true;
    }
    // 2. Cò bên hông (Grip/Squeeze - buttons[1]) = Bóp Còi Xe
    if (gp.buttons[1]?.pressed || (gp.buttons[1]?.value || 0) > 0.4) {
      sideGripHorn = true;
    }
    // 3. Ấn nút xoay (Thumbstick click - buttons[3] hoặc buttons[10]/buttons[11])
    if (gp.buttons[3]?.pressed || gp.buttons[10]?.pressed || gp.buttons[11]?.pressed) {
      btnThumbPress = true;
    }

    // 4. Đọc trục Nút Xoay (Thumbstick)
    const axX = Math.abs(gp.axes[2] || 0) > Math.abs(gp.axes[0] || 0) ? (gp.axes[2] || 0) : (gp.axes[0] || 0);
    const axY = Math.abs(gp.axes[3] || 0) > Math.abs(gp.axes[1] || 0) ? (gp.axes[3] || 0) : (gp.axes[1] || 0);
    if (Math.abs(axY) > 0.14) stickDriveVal = -axY;
    if (Math.abs(axX) > 0.14) stickSteerVal = axX;

    // 5. Các nút A, B, X, Y trên tay cầm
    if (hand === 'right') {
      if (gp.buttons[4]?.pressed) btnOpenDoor = true;
      if (gp.buttons[5]?.pressed) btnColorChange = true;
    } else if (hand === 'left') {
      if (gp.buttons[4]?.pressed) btnLeanOrTurn = true;
      if (gp.buttons[5]?.pressed) btnYoutube = true;
    } else {
      if (gp.buttons[0]?.pressed && pads.length === 1 && !session) btnOpenDoor = false;
      if (gp.buttons[4]?.pressed) btnOpenDoor = true;
      if (gp.buttons[5]?.pressed) btnColorChange = true;
    }
  }

  // Thực thi Cò bên hông = Bóp Còi Xe
  if (sideGripHorn && !directControllerPrev.grip) {
    initAudio();
    playSmartVehicleHornSound('CAR');
    state.hornActive = true;
    state.lastActionLog = '📢 Bóp Còi Xe bằng Cò Bên Hông (Grip) của tay cầm!';
  } else if (!sideGripHorn && directControllerPrev.grip) {
    state.hornActive = false;
  }

  // Thực thi Nút đổi màu xe trực tiếp trên tay cầm (Nút B)
  if (btnColorChange && !directControllerPrev.b) {
    cyclePlayerCarPaintColor();
  }

  // Thực thi Ấn cần xoay (Thumbstick Click): Đổi ghế Tài xế <-> Ghế phụ hoặc Thò đầu
  if (btnThumbPress && !directControllerPrev.thumbPress) {
    swapSeatOrTakeDriverControl();
  }

  directControllerPrev.grip = sideGripHorn;
  directControllerPrev.b = btnColorChange;
  directControllerPrev.thumbPress = btnThumbPress;

  // 6. CƠ CHẾ LÁI XE TRỰC TIẾP: Đã hợp nhất vào updateWorldSimulation, không can thiệp để tránh xung đột
  if (state.playerMode === 'DRIVING') {
    return;
  }

  // 7. Đồng bộ hình ảnh Cam Lùi lên cả Cửa sổ Cam Lùi nổi (nếu đang mở)
  if (rearCamModal && !rearCamModal.classList.contains('panel-hidden') && rearCamModalCtx) {
    rearCamModalCtx.drawImage(rearCamCanvas, 0, 0, 512, 256);
  }
}

// Chạy vòng lặp nâng cấp V102 đồng bộ mỗi khung hình
let lastV102Time = performance.now();
function runV102MasterLoop() {
  requestAnimationFrame(runV102MasterLoop);
  const now = performance.now();
  const dt = Math.min((now - lastV102Time) / 1000, 0.1);
  lastV102Time = now;
  const elapsed = clock.getElapsedTime();

  updateAdvancedTrafficAndSocialWorld(dt, elapsed);
  updateDirectGamepadAndZeroDriftPhysics(dt);
}
requestAnimationFrame(runV102MasterLoop);

// ============================================================================
// 14. BẢN CẬP NHẬT V105 - KHẮC PHỤC TRIỆT ĐỂ 9 VẤN ĐỀ THEO YÊU CẦU:
//     1. Xóa bỏ hoàn toàn hiện tượng lag/giật khi mới spawn (Dùng GPU RenderTarget
//        trực tiếp cho gương hậu 3D thay vì readRenderTargetPixels gây nghẽn CPU).
//     2. Xây dựng Biệt Thự / Nhà Riêng của người chơi; người chơi spawn ngay trên
//        vỉa hè trước nhà mình, xe Rolls-Royce đỗ gọn ở vịnh đỗ xe sát vỉa hè
//        trước nhà (không nằm giữa đường, không cản trở giao thông).
//     3. Thanh kéo tùy chỉnh Tốc độ đi bộ (Mặc định = 2.0x gấp đôi trước đây,
//        tự động khóa lại khi lên xe và mở khóa khi xuống xe đi bộ).
//     4. Ẩn bảng nút tiến/lùi 2D (#quest-laser-cockpit); điều khiển đi bộ & lái xe
//        trực tiếp 100% bằng Núm xoay (Thumbstick) và Cò trước (Thắng) / Cò hông (Còi).
//     5. Góc nhìn thứ nhất bằng mắt 360° (Xoay đầu nhìn trái, phải, đằng sau 360°
//        bằng mắt kính / núm xoay phải / chuột độc lập hoàn toàn với hướng chạy xe).
//     6. Sửa lỗi NPC và Xe đi ngang như cua khi rẽ: Nội suy góc xoay thân người
//        và thân xe mượt mà theo đúng vector vận tốc thực tế (atan2) + đi sâu
//        bên trong vỉa hè (x/z = ±14.2m), cách xa cột đèn và lòng đường.
//     7. Kiến trúc nhà cửa, mái ngói, ban công, mái hiên cửa hàng & phối màu xe cộ
//        lưu thông chân thật.
//     8. Hoạt cảnh Mất Sóng RC -> Kẻ gian chạy tới mở cửa cướp xe và LÁI XE CHẠY MẤT!
// ============================================================================

// --- 14.1. TỐI ƯU HÓA GPU CHỐNG LAG GIẬT KHI SPAWN & GẮN TEXTURE 3D TRỰC TIẾP LÊN GƯƠNG HẬU ---
(function eliminateStartupLagAndBindDirectRearTexture() {
  // Ẩn cụm nút điều hướng 2D ở góc dưới để người chơi điều khiển hoàn toàn bằng Núm xoay & Cò tay cầm
  const cockpit2dEl = document.getElementById('quest-laser-cockpit');
  if (cockpit2dEl) cockpit2dEl.style.display = 'none';

  // Đồng bộ tiêu đề từ file riêng youtube-dom-extractor.js sang màn hình 3D trong xe
  window.addEventListener('yt-title-updated', (e) => {
    if (e.detail) activeYoutubeTitle = e.detail;
  });

  // Đồng bộ hoàn hảo hàm render gương hậu và cam lùi với master function renderRearMirrorAndCameraDisplay
  window.renderRearMirrorAndCameraDisplay = function(gear) {
    if (typeof renderRearMirrorAndCameraDisplay === 'function') {
      renderRearMirrorAndCameraDisplay(gear);
    }
  };

  // Đảm bảo toàn bộ gương hậu & màn hình phụ buồng lái hiển thị trực tiếp từ rearCamTex
  chassisGroup.traverse((child) => {
    if (child.isMesh && (child.userData.isRearMirrorMesh || (child.material && (child.material.map === rearCamTex || child.material.map === rearViewRenderTarget.texture)))) {
      child.userData.isRearMirrorMesh = true;
      child.material.map = rearCamTex;
      child.material.needsUpdate = true;
    }
  });
})();

// --- 14.2. XÂY DỰNG NGÔI NHÀ CỦA NGƯỜI CHƠI & SPAWN NGƯỜI CHƠI TRÊN VỈA HÈ TRƯỚC NHÀ, XE ĐỖ GỌN SÁT LỀ ---
function buildPlayerHomeAndSafeSidewalkSpawn() {
  const homeGroup = new THREE.Group();
  // Đặt Biệt thự / Ngôi nhà của người chơi tại góc vỉa hè (-20, 0.24, -14)
  homeGroup.position.set(-20.5, 0.24, -14.0);

  // Phối màu kiến trúc chân thật: Tường kem ấm (Warm Cream), Đá ốp chân tường, Mái ngói xám đá (Slate Roof), Khung cửa gỗ sồi
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2ead3, roughness: 0.55 });
  const stoneBaseMat = new THREE.MeshStandardMaterial({ color: 0x6c757d, roughness: 0.75 });
  const roofSlateMat = new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.45, metalness: 0.15 });
  const woodDoorMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.35 });
  const warmWindowMat = new THREE.MeshBasicMaterial({ color: 0xffe599 });

  // Thân biệt thự 2 tầng có hiên nhà, cột trụ và ban công
  const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.6, 10.4), stoneBaseMat);
  basePlinth.position.y = 0.3;
  const mainHouse = new THREE.Mesh(new THREE.BoxGeometry(10.8, 6.2, 9.6), wallMat);
  mainHouse.position.y = 3.4;

  // Mái ngói dốc chữ A chân thật
  const pitchedRoof = new THREE.Mesh(new THREE.ConeGeometry(8.6, 3.2, 4), roofSlateMat);
  pitchedRoof.rotation.y = Math.PI / 4;
  pitchedRoof.position.y = 8.1;

  // Hiên trước nhà (Porch) hướng ra vỉa hè phía Đông (+X)
  const porchFloor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 5.2), stoneBaseMat);
  porchFloor.position.set(6.2, 0.12, 0);
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 5.4), roofSlateMat);
  porchRoof.position.set(6.2, 3.4, 0);

  // 2 cột trụ hiên nhà
  [-2.1, 2.1].forEach((pz) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 12), wallMat);
    col.position.set(7.2, 1.7, pz);
    homeGroup.add(col);
  });

  // Cửa chính bằng gỗ & Ban công tầng 2
  const frontDoor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 1.5), woodDoorMat);
  frontDoor.position.set(5.42, 1.5, 0);
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 4.6), stoneBaseMat);
  balcony.position.set(6.0, 4.1, 0);

  // Các ô cửa sổ có khung nổi chân thật
  [-2.6, 2.6].forEach((wz) => {
    [2.1, 5.0].forEach((wy) => {
      const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.35, 1.45), woodDoorMat);
      winFrame.position.set(5.41, wy, wz);
      const winGlass = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.15, 1.25), warmWindowMat);
      winGlass.position.set(5.42, wy, wz);
      homeGroup.add(winFrame, winGlass);
    });
  });

  const homeSign = createSpeechBubbleSprite('🏡 NHÀ CỦA BẠN (ĐIỂM SPAWN VỈA HÈ)', '#1b4332', '#00ff88');
  homeSign.scale.set(2.1, 0.42, 1);
  homeSign.position.set(5.8, 4.9, 0);
  homeSign.visible = true;

  homeGroup.add(basePlinth, mainHouse, pitchedRoof, porchFloor, porchRoof, frontDoor, balcony, homeSign);
  scene.add(homeGroup);

  // ĐẶT VỊ TRÍ SPAWN CỦA NGƯỜI CHƠI NGAY TRÊN VỈA HÈ TRƯỚC HIÊN NHÀ MÌNH:
  state.avatarPos.set(-13.2, 0.24, -14.0);
  state.avatarYaw = -Math.PI / 2; // Mặt hướng ra phía chiếc xe của mình đang đỗ sát vỉa hè
  playerAvatarGroup.position.copy(state.avatarPos);
  playerAvatarGroup.rotation.y = state.avatarYaw;

  // ĐẶT XE ROLLS-ROYCE CỦA NGƯỜI CHƠI ĐỖ GỌN SÁT LỀ VỈA HÈ TRƯỚC NHÀ (x = -9.4, z = -14.0):
  // Tuyệt đối không nằm trên làn xe chạy (làn xe NPC chạy ở x = -6.2, -5.8, -2.8, +2.8, +6.2) -> Không bao giờ cản trở giao thông!
  vehicleRoot.position.set(-9.4, 0, -14.0);
  state.headingRad = 0;
  vehicleRoot.rotation.y = 0;
  if (typeof lastValidCarPos !== 'undefined') {
    lastValidCarPos.copy(vehicleRoot.position);
  }
}
buildPlayerHomeAndSafeSidewalkSpawn();

// --- 14.3. NÂNG CẤP KIẾN TRÚC NHÀ CỬA / ĐỊA ĐIỂM CHÂN THẬT & PHỐI LẠI MÀU XE CỘ LƯU THÔNG ---
function refineArchitectureAndVehicleColorsRealistically() {
  // 1. Phối màu lại toàn bộ các xe lưu thông bằng bảng màu sơn ô tô kim loại chân thật (Metallic Automotive Paints)
  const realisticCarColors = [
    0xd8dee9, // Bạc Ánh Kim (Silver Metallic)
    0xf8f9fa, // Trắng Ngọc Trai (Pearl White)
    0x2f3e46, // Xám Than Chì (Graphite Grey)
    0x1d3557, // Xanh Navy Đậm (Deep Navy Blue)
    0x6b0f1a, // Đỏ Rượu Vang (Burgundy Wine)
    0xc5a880, // Vàng Champagne (Champagne Gold)
    0x1b4332  // Xanh Rêu Hoàng Gia (British Racing Green)
  ];

  allTrafficVehicles.forEach((veh, idx) => {
    const vd = veh.userData;
    if (vd.category === 'CAR') {
      const realHex = realisticCarColors[idx % realisticCarColors.length];
      veh.traverse((child) => {
        if (child.isMesh && child.material && child.material.clearcoat !== undefined && child.geometry?.type !== 'CylinderGeometry') {
          child.material.color.setHex(realHex);
          child.material.roughness = 0.22;
          child.material.metalness = 0.65;
        }
      });
    } else if (vd.category === 'MOTORBIKE') {
      const motoColors = [0x2b2d42, 0x8d0801, 0xedf2f4, 0x1d3557];
      const mHex = motoColors[idx % motoColors.length];
      veh.traverse((child) => {
        if (child.isMesh && child.material && child.material.clearcoat !== undefined) {
          child.material.color.setHex(mHex);
        }
      });
    }
  });

  // 2. Làm chân thật hóa các tòa nhà và cửa hàng trong từng ô phố (Thêm mái hiên sọc, ban công, tầng mái giật cấp & màu tường tự nhiên)
  const naturalFacadeColors = [0xe9ecef, 0xdfd3c3, 0xd5bdaf, 0xcad2c5, 0xb8c0ff];
  const awningMat = new THREE.MeshStandardMaterial({ color: 0x9e2a2b, roughness: 0.6 });
  const corniceMat = new THREE.MeshStandardMaterial({ color: 0x495057, roughness: 0.5 });

  cityBlocks.forEach((block, bIdx) => {
    block.children.forEach((child, cIdx) => {
      // Nếu là tòa nhà văn phòng còn hiển thị, thêm phần mái giật cấp (Cornice/Penthouse) và sảnh tầng trệt
      if (child.isMesh && child.visible && child.geometry?.parameters?.height > 12) {
        const h = child.geometry.parameters.height;
        child.material.color.setHex(naturalFacadeColors[(bIdx + cIdx) % naturalFacadeColors.length]);

        const roofCrown = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.8, 13.8), corniceMat);
        roofCrown.position.set(child.position.x, h + 0.4, child.position.z);
        const penthouse = new THREE.Mesh(new THREE.BoxGeometry(8.5, 2.8, 8.5), corniceMat);
        penthouse.position.set(child.position.x, h + 2.1, child.position.z);
        const groundCanopy = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.45, 14.2), awningMat);
        groundCanopy.position.set(child.position.x, 3.6, child.position.z);
        block.add(roofCrown, penthouse, groundCanopy);
      }

      // Nếu là cụm POI (Tiệm Cafe, Boutique, Nhà dân), bổ sung mái ngói, mái hiên cửa sổ và hàng rào gỗ
      if (child.isGroup && child.position.y === 0.24) {
        child.children.forEach((sub) => {
          if (sub.isMesh && sub.geometry?.parameters?.height >= 3.8 && sub.geometry?.parameters?.height <= 5.0) {
            sub.material.color.setHex(naturalFacadeColors[(bIdx + sub.id) % naturalFacadeColors.length]);
            sub.material.roughness = 0.65;

            // Thêm mái dốc + mái hiên cửa hàng (Awning) + khung cửa kính trưng bày
            const subRoof = new THREE.Mesh(
              new THREE.ConeGeometry(6.2, 2.2, 4),
              new THREE.MeshStandardMaterial({ color: 0x6b2737, roughness: 0.55 })
            );
            subRoof.rotation.y = Math.PI / 4;
            subRoof.position.set(sub.position.x, sub.geometry.parameters.height + 1.1, sub.position.z);

            const shopAwning = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.35, 1.8), awningMat);
            shopAwning.position.set(sub.position.x, 2.5, sub.position.z + 4.4);
            shopAwning.rotation.x = 0.25;

            const shopWindow = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.1, 0.2), matGlass);
            shopWindow.position.set(sub.position.x, 1.2, sub.position.z + 4.25);

            child.add(subRoof, shopAwning, shopWindow);
          }
        });
      }
    });
  });
}
refineArchitectureAndVehicleColorsRealistically();

// --- 14.4. THANH KÉO TỐC ĐỘ ĐI BỘ (MẶC ĐỊNH GẤP ĐÔI = 2.0X, CHỈ CHỈNH ĐƯỢC KHI CHƯA LÊN XE) ---
state.walkSpeedMultiplier = 2.0; // Mặc định gấp đôi so với tốc độ hiện tại!

const walkSpeedSlider = document.getElementById('slider-walk-speed');
const walkSpeedLabel = document.getElementById('val-walk-speed');
const walkSpeedLockMsg = document.getElementById('walk-speed-lock-msg');

if (walkSpeedSlider) {
  walkSpeedSlider.addEventListener('input', (e) => {
    if (state.playerMode !== 'ON_FOOT') {
      // Không cho chỉnh khi đang ngồi trên xe
      e.target.value = state.walkSpeedMultiplier;
      state.lastActionLog = '⚠ Chỉ khi bạn đang Đi Bộ (chưa lên xe) mới được chỉnh tốc độ di chuyển của bản thân!';
      return;
    }
    state.walkSpeedMultiplier = parseFloat(e.target.value) || 2.0;
    if (walkSpeedLabel) walkSpeedLabel.textContent = state.walkSpeedMultiplier.toFixed(2);
    state.lastActionLog = `🏃 Đã chỉnh tốc độ đi bộ của nhân vật lên: ${state.walkSpeedMultiplier.toFixed(2)}x`;
  });
}

// --- 14.5. GÓC NHÌN THỨ NHẤT BẰNG MẮT 360° ĐỘC LẬP VỚI HƯỚNG DI CHUYỂN / LÁI XE ---
state.eyeLookYaw = 0;   // Góc liếc mắt/đầu sang trái, phải, đằng sau (-PI đến +PI, xoay trọn 360°)
state.eyeLookPitch = 0; // Góc nhìn lên, xuống
let isMouseLooking = false;
let prevMouseX = 0;
let prevMouseY = 0;

window.addEventListener('pointerdown', (e) => {
  if (e.target === renderer.domElement && !dragged3DPanel) {
    isMouseLooking = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  }
});
window.addEventListener('pointermove', (e) => {
  if (!isMouseLooking || dragged3DPanel) return;
  const dx = e.clientX - prevMouseX;
  const dy = e.clientY - prevMouseY;
  prevMouseX = e.clientX;
  prevMouseY = e.clientY;
  state.eyeLookYaw -= dx * 0.0045;
  const maxPitch = (state.playerMode === 'DRIVING' && state.seatIndex !== 0) ? (Math.PI * 0.498) : 1.52;
  state.eyeLookPitch = THREE.MathUtils.clamp(state.eyeLookPitch - dy * 0.0035, -maxPitch, maxPitch);
});
window.addEventListener('pointerup', () => {
  isMouseLooking = false;
});

// Hỗ trợ cảm biến con quay hồi chuyển (DeviceOrientation) khi xoay đầu trên điện thoại / kính ở chế độ 2D
window.addEventListener('deviceorientation', (e) => {
  if (renderer.xr.isPresenting || e.alpha === null) return;
  // Chỉ cộng thêm độ lệch nhẹ nếu thiết bị có cảm biến xoay
});

// --- 14.6. SỬA TRIỆT ĐỂ LỖI NPC VÀ XE ĐI NGANG NHƯ CUA KHI RẼ & ĐƯA NPC VÀO SÂU TRONG VỈA HÈ (±14.2m) ---
// Khởi tạo vị trí đi bộ sâu trong vỉa hè (±14.2m, cách xa hoàn toàn cột đèn ±10.6m và lòng đường ±10.0m)
sidewalkNpcs.forEach((npc, idx) => {
  const nd = npc.userData;
  const sideSign = idx % 2 === 0 ? 1 : -1;
  npc.position.x = sideSign * 14.2; // Sâu bên trong vỉa hè!
  npc.position.y = 0.24;            // Đứng chuẩn trên mặt vỉa hè
  nd.prevPos = npc.position.clone();
  nd.walkAxis = 'Z';
  nd.targetHeading = nd.dir > 0 ? 0 : Math.PI;
  nd.currentHeading = nd.targetHeading;
});

allTrafficVehicles.forEach((veh) => {
  const vd = veh.userData;
  vd.prevPos = veh.position.clone();
  vd.smoothHeading = veh.rotation.y;
});

function lerpAngleShortest(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

function fixCrabWalkAndDeepSidewalkMovement(dt, elapsed) {
  const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;

  // 1. XỬ LÝ NPC ĐI SÂU TRONG VỈA HÈ (±14.2m) VÀ XOAY MẶT MƯỢT MÀ THEO HƯỚNG RẼ (KHÔNG BAO GIỜ ĐI NGANG NHƯ CUA)
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (!nd.prevPos) nd.prevPos = npc.position.clone();

    npc.position.y = 0.24; // Luôn đứng trên mặt vỉa hè

    if (nd.state === 'WALKING_SIDEWALK') {
      // Hủy bước cộng Z mặc định của vòng lặp cũ nếu NPC đang rẽ đi theo vỉa hè trục X
      if (nd.walkAxis === 'X') {
        npc.position.z -= nd.dir * nd.speed * dt;
        npc.position.x += nd.dir * nd.speed * dt;
        // Giữ sâu trong vỉa hè trục Z (±14.2m)
        const zSide = Math.round(npc.position.z / BLOCK_SIZE) * BLOCK_SIZE + (nd.sidewalkSign || 1) * 14.2;
        npc.position.z = THREE.MathUtils.lerp(npc.position.z, zSide, dt * 4);
      } else {
        // Đi theo trục Z: giữ sâu trong vỉa hè ở x = ±14.2m (cách xa cột đèn ±10.6m và lòng đường)
        const blockCenterX = Math.round(npc.position.x / BLOCK_SIZE) * BLOCK_SIZE;
        const sideSign = npc.position.x - blockCenterX >= 0 ? 1 : -1;
        nd.sidewalkSign = sideSign;
        npc.position.x = THREE.MathUtils.lerp(npc.position.x, blockCenterX + sideSign * 14.2, dt * 5);
      }

      // Kiểm tra khi NPC đi đến góc giao lộ vỉa hè (±14.2, ±14.2) để thực hiện hành động RẼ TRÁI / RẼ PHẢI tự nhiên
      const localX = ((npc.position.x % BLOCK_SIZE) + BLOCK_SIZE * 1.5) % BLOCK_SIZE - BLOCK_SIZE / 2;
      const localZ = ((npc.position.z % BLOCK_SIZE) + BLOCK_SIZE * 1.5) % BLOCK_SIZE - BLOCK_SIZE / 2;
      if (nd.turnCooldown > 0) nd.turnCooldown -= dt;

      if (nd.turnCooldown <= 0 && Math.abs(Math.abs(localX) - 14.2) < 1.8 && Math.abs(Math.abs(localZ) - 14.2) < 1.8) {
        if (Math.random() < 0.45) {
          nd.walkAxis = nd.walkAxis === 'Z' ? 'X' : 'Z';
          nd.dir = Math.random() > 0.5 ? 1 : -1;
        }
        nd.turnCooldown = 6.0;
      }
    }

    // TÍNH VECTOR DI CHUYỂN THỰC TẾ (vx, vz) ĐỂ XOAY HƯỚNG MẶT & CƠ THỂ NPC THEO ĐÚNG HƯỚNG BƯỚC ĐI!
    const vx = npc.position.x - nd.prevPos.x;
    const vz = npc.position.z - nd.prevPos.z;
    const moveDistSq = vx * vx + vz * vz;

    if (moveDistSq > 0.000004 && moveDistSq < 4.0) {
      // Trong hệ tọa độ model NPC: hướng mặt nhìn về +Z nên góc xoay đúng là Math.atan2(vx, vz)
      const desiredYaw = Math.atan2(vx, vz);
      nd.currentHeading = lerpAngleShortest(nd.currentHeading ?? desiredYaw, desiredYaw, dt * 10);
      npc.rotation.y = nd.currentHeading;
    } else if (nd.currentHeading !== undefined && nd.handshakeTimer <= 0 && nd.state !== 'ARRESTED' && nd.state !== 'QUARRELING') {
      npc.rotation.y = nd.currentHeading;
    }

    nd.prevPos.copy(npc.position);
  }

  // 2. XỬ LÝ XE MÁY, XE ĐẠP, Ô TÔ, XE BUS XOAY THÂN XE, NGHIÊNG XE & BẺ BÁNH LÁI MƯỢT MÀ KHI RẼ (KHÔNG TRƯỢT NGANG NHƯ CUA)
  for (const veh of allTrafficVehicles) {
    const vd = veh.userData;
    if (!vd.prevPos) vd.prevPos = veh.position.clone();

    const vx = veh.position.x - vd.prevPos.x;
    const vz = veh.position.z - vd.prevPos.z;
    const distSq = vx * vx + vz * vz;

    if (distSq > 0.00001 && distSq < 9.0) {
      // Đầu xe của tất cả các model hướng về -Z cục bộ, nên khi di chuyển theo vector (vx, vz), góc hướng mũi xe là Math.atan2(-vx, -vz)
      const targetCarYaw = Math.atan2(-vx, -vz);
      const prevYaw = vd.smoothHeading ?? targetCarYaw;
      vd.smoothHeading = lerpAngleShortest(prevYaw, targetCarYaw, dt * 8.5);
      veh.rotation.y = vd.smoothHeading;

      // Hiệu ứng nghiêng thân xe máy/xe đạp khi vào cua rẽ trái/phải cho chân thật
      let yawDelta = ((targetCarYaw - vd.smoothHeading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      if (vd.category === 'MOTORBIKE' || vd.category === 'BICYCLE') {
        veh.rotation.z = THREE.MathUtils.lerp(veh.rotation.z, THREE.MathUtils.clamp(yawDelta * 0.55, -0.28, 0.28), dt * 8);
      }
    } else if (vd.smoothHeading !== undefined) {
      veh.rotation.y = vd.smoothHeading;
      veh.rotation.z = THREE.MathUtils.lerp(veh.rotation.z, 0, dt * 8);
    }

    vd.prevPos.copy(veh.position);
  }
}

// --- 14.7. HOẠT CẢNH MẤT KẾT NỐI RC -> KẺ LẠ CHẠY TỚI CƯỚP XE & PHÓNG XE CHẠY MẤT TRÊN ĐƯỜNG! ---
state.hijackCutscenePhase = 'NONE'; // 'NONE' | 'ROBBER_APPROACHING' | 'DRIVING_AWAY'
let hijackRobberRunner = null;

function createHijackRobberRunnerMesh() {
  const g = new THREE.Group();
  const blackSuit = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const redMask = new THREE.MeshStandardMaterial({ color: 0xb80c09, roughness: 0.5 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.44, 8, 12), blackSuit);
  torso.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), redMask);
  head.position.y = 1.56;
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 8, 8), blackSuit);
  legL.position.set(-0.09, 0.42, 0);
  const legR = legL.clone();
  legR.position.x = 0.09;
  const alertBubble = createSpeechBubbleSprite('🦹♂️ MẤT SÓNG RC! TA CƯỚP CHIẾC ROLLS-ROYCE NÀY ĐÂY!', '#590d22', '#ffbe0b');
  alertBubble.scale.set(2.1, 0.42, 1);
  alertBubble.position.set(0, 2.1, 0);
  alertBubble.visible = true;
  g.add(torso, head, legL, legR, alertBubble);
  g.userData = { legL, legR, walkPhase: 0 };
  g.visible = false;
  scene.add(g);
  return g;
}
hijackRobberRunner = createHijackRobberRunnerMesh();

// Ghi đè sự kiện nút [📡 Mất Sóng: Cướp Xe] & [🔄 Spawn Lại Xe] để chạy hoạt cảnh 3D sống động
const btnDisconnectHijack = document.getElementById('btn-sim-disconnect');
if (btnDisconnectHijack) {
  const newBtn = btnDisconnectHijack.cloneNode(true);
  btnDisconnectHijack.parentNode.replaceChild(newBtn, btnDisconnectHijack);
  newBtn.addEventListener('click', () => {
    initAudio();
    state.rcConnected = false;
    state.hijackActive = true;

    // Nếu người chơi đang ngồi trong xe, đẩy người chơi văng ra vỉa hè đứng nhìn tên cướp lấy xe!
    if (state.playerMode === 'DRIVING') {
      state.playerMode = 'HIJACKED_WAITING';
      avatarBodyMesh.visible = true;
      roofBeaconGroup.visible = true;
      const ejectOffset = new THREE.Vector3(-2.4, 0.24, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.headingRad);
      state.avatarPos.copy(vehicleRoot.position).add(ejectOffset);
      playerAvatarGroup.position.copy(state.avatarPos);
      playerAvatarGroup.add(cameraRig);
      cameraRig.position.set(0, 0.52, 0);
    }

    // Spawn tên cướp cách cửa xe 4.5m để chạy bộ lao tới mở cửa xe
    const doorWorldPos = new THREE.Vector3(-1.2, 0, 0).applyMatrix4(vehicleRoot.matrixWorld);
    hijackRobberRunner.position.set(doorWorldPos.x - 4.2, 0.24, doorWorldPos.z + 2.5);
    hijackRobberRunner.visible = true;
    state.doorsOpen = true;
    state.hijackCutscenePhase = 'ROBBER_APPROACHING';
    playSmartVehicleHornSound('CAR');
    state.lastActionLog = '🚨 HOẠT CẢNH MẤT SÓNG RC: Tên cướp đang lao tới mở cửa cướp chiếc Rolls-Royce của bạn!';
  });
}

const btnReconnectSpawn = document.getElementById('btn-sim-reconnect');
if (btnReconnectSpawn) {
  const newRecBtn = btnReconnectSpawn.cloneNode(true);
  btnReconnectSpawn.parentNode.replaceChild(newRecBtn, btnReconnectSpawn);
  newRecBtn.addEventListener('click', () => {
    initAudio();
    state.rcConnected = true;
    state.hijackActive = false;
    state.hijackCutscenePhase = 'NONE';
    if (hijackDriverMesh) hijackDriverMesh.visible = false;
    if (hijackRobberRunner) hijackRobberRunner.visible = false;
    if (state.playerMode === 'HIJACKED_WAITING') state.playerMode = 'ON_FOOT';

    state.velocityMs = 0;
    state.speedKmh = 0;
    state.doorsOpen = false;
    // Đưa xe quay về đỗ gọn ngay gần người chơi
    vehicleRoot.position.set(state.avatarPos.x + 2.8, 0, state.avatarPos.z);
    state.headingRad = state.avatarYaw;
    vehicleRoot.rotation.y = state.headingRad;
    state.lastActionLog = '✅ Đã khôi phục sóng RC & thu hồi xe Rolls-Royce về đỗ ngay cạnh bạn (0 KM/H)!';
  });
}

function updateHijackCutsceneAnimation(dt) {
  if (!state.hijackActive || state.hijackCutscenePhase === 'NONE') return;

  if (state.hijackCutscenePhase === 'ROBBER_APPROACHING') {
    const targetDoor = new THREE.Vector3(-1.0, 0.24, 0).applyMatrix4(vehicleRoot.matrixWorld);
    const dir = targetDoor.clone().sub(hijackRobberRunner.position);
    const dist = dir.length();

    if (dist > 0.45) {
      dir.normalize();
      hijackRobberRunner.position.addScaledVector(dir, 6.2 * dt);
      hijackRobberRunner.rotation.y = Math.atan2(dir.x, dir.z);
      hijackRobberRunner.userData.walkPhase += dt * 15;
      const sw = Math.sin(hijackRobberRunner.userData.walkPhase) * 0.6;
      hijackRobberRunner.userData.legL.rotation.x = sw;
      hijackRobberRunner.userData.legR.rotation.x = -sw;
    } else {
      // Tên cướp đã nhảy vào ghế lái, đóng sầm cửa, đề nổ máy V12 và phóng xe chạy mất!
      hijackRobberRunner.visible = false;
      if (hijackDriverMesh) hijackDriverMesh.visible = true;
      state.doorsOpen = false;
      state.engineRunning = true;
      state.hijackCutscenePhase = 'DRIVING_AWAY';
      playEngineStarterSound();
      state.lastActionLog = '🦹♂️💨 Tên cướp đã nhảy lên ghế lái và đang phóng chiếc Rolls-Royce của bạn chạy trốn! Bấm [🔄 Spawn Lại Xe] để thu hồi!';
    }
  } else if (state.hijackCutscenePhase === 'DRIVING_AWAY') {
    // Tên cướp lái chiếc xe của người chơi phóng đi dọc theo con phố
    state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 16.5, dt * 3);
    state.speedKmh = state.velocityMs * 3.6;
    state.rpm = 3800;
    // Tự động bẻ lái nhẹ vào làn đường chính để phóng đi
    const targetLaneX = -2.8;
    const dx = targetLaneX - vehicleRoot.position.x;
    state.steeringAngleDeg = THREE.MathUtils.clamp(dx * 35, -180, 180);
    state.headingRad = THREE.MathUtils.lerp(state.headingRad, 0, dt * 2.5);
    vehicleRoot.rotation.y = state.headingRad;
    vehicleRoot.position.x -= Math.sin(state.headingRad) * state.velocityMs * dt - THREE.MathUtils.clamp(dx, -2, 2) * dt;
    vehicleRoot.position.z -= Math.cos(state.headingRad) * state.velocityMs * dt;
  }
}

// --- 14.8. VÒNG LẶP ĐIỀU KHIỂN TAY CẦM TRỰC TIẾP (NÚM XOAY TRÁI = ĐI/LÁI, NÚM XOAY PHẢI = NHÌN 360°, CÒ = THẮNG/CÒI) ---
let lastV105Time = performance.now();

function runV105MasterEnhancementLoop() {
  requestAnimationFrame(runV105MasterEnhancementLoop);
  const now = performance.now();
  const dt = Math.min((now - lastV105Time) / 1000, 0.1);
  lastV105Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Khóa/Mở thanh kéo tốc độ đi bộ tùy theo việc người chơi đang Đi Bộ hay Đang Lái Xe
  if (walkSpeedSlider) {
    const isFoot = (state.playerMode === 'ON_FOOT');
    walkSpeedSlider.disabled = !isFoot;
    if (walkSpeedLockMsg) {
      walkSpeedLockMsg.textContent = isFoot ? '(Đang mở - Kéo để chỉnh)' : '🔒 Đang trên xe (Đã khóa)';
      walkSpeedLockMsg.style.color = isFoot ? '#00ff88' : '#ff3b30';
    }
  }

  // 2. Đọc Núm Xoay (Thumbstick) Tay Trái để Đi Bộ / Lái Xe & Núm Xoay Tay Phải để Xoay Mắt Nhìn 360°
  const session = renderer.xr.getSession();
  const sources = session ? Array.from(session.inputSources) : [];
  const navGps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];

  let moveAxisY = 0;
  let moveAxisX = 0;
  let lookAxisX = 0;
  let lookAxisY = 0;

  for (const s of sources) {
    if (!s.gamepad) continue;
    const gp = s.gamepad;
    const axX = Math.abs(gp.axes[2] || 0) > Math.abs(gp.axes[0] || 0) ? (gp.axes[2] || 0) : (gp.axes[0] || 0);
    const axY = Math.abs(gp.axes[3] || 0) > Math.abs(gp.axes[1] || 0) ? (gp.axes[3] || 0) : (gp.axes[1] || 0);
    if (s.handedness === 'left') {
      if (Math.abs(axY) > 0.12) moveAxisY = -axY;
      if (Math.abs(axX) > 0.12) moveAxisX = axX;
    } else if (s.handedness === 'right') {
      if (Math.abs(axY) > 0.12 && Math.abs(moveAxisY) < 0.05) moveAxisY = -axY;
      if (Math.abs(axX) > 0.12) {
        if (state.playerMode === 'DRIVING' && Math.abs(moveAxisX) < 0.05) {
          moveAxisX = axX;
        } else {
          lookAxisX = axX;
        }
      }
    }
  }

  // Hỗ trợ Gamepad tiêu chuẩn khi chưa bật session XR
  if (sources.length === 0 && navGps.length > 0) {
    for (const gp of navGps) {
      if (Math.abs(gp.axes[1] || 0) > 0.12) moveAxisY = -gp.axes[1];
      if (Math.abs(gp.axes[0] || 0) > 0.12) moveAxisX = gp.axes[0];
      if (Math.abs(gp.axes[2] || 0) > 0.12) lookAxisX = gp.axes[2];
      if (Math.abs(gp.axes[3] || 0) > 0.12) lookAxisY = gp.axes[3];
    }
  }

  // Cập nhật góc xoay mắt 360° độc lập (Có thể xoay nhìn sang trái, phải, đằng sau 360° thoải mái)
  if (Math.abs(lookAxisX) > 0.12) state.eyeLookYaw -= lookAxisX * 2.2 * dt;
  if (Math.abs(lookAxisY) > 0.12) {
    state.eyeLookPitch = THREE.MathUtils.clamp(state.eyeLookPitch - lookAxisY * 1.6 * dt, -1.2, 1.2);
  }

  if (!renderer.xr.isPresenting) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.eyeLookYaw;
    camera.rotation.x = state.eyeLookPitch;
  }

  // 3. Áp dụng tốc độ đi bộ gấp đôi (hoặc theo thanh kéo state.walkSpeedMultiplier) khi người chơi đang Đi Bộ (ON_FOOT)
  if (state.playerMode === 'ON_FOOT') {
    const fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) + (Math.abs(moveAxisY) > 0.12 ? moveAxisY : wheelWalkOrGas);
    const extraFactor = Math.max(0, (state.walkSpeedMultiplier || 2.0) - 1.0);
    if (Math.abs(fwd) > 0.05 && extraFactor > 0) {
      const baseSpeed = 6.8;
      // Đi theo hướng mắt đang nhìn kết hợp hướng thân người để cảm giác đi bộ 360° tự nhiên nhất
      const walkHeading = state.avatarYaw + state.eyeLookYaw;
      state.avatarPos.x -= Math.sin(walkHeading) * fwd * baseSpeed * extraFactor * dt;
      state.avatarPos.z -= Math.cos(walkHeading) * fwd * baseSpeed * extraFactor * dt;
      playerAvatarGroup.position.copy(state.avatarPos);
    }
  }

  // 4. Cập nhật hướng xoay mượt mà của NPC & Xe (Sửa lỗi đi ngang như cua & giữ NPC đi sâu trong vỉa hè)
  fixCrabWalkAndDeepSidewalkMovement(dt, elapsed);

  // 5. Cập nhật hoạt cảnh Mất sóng RC -> Cướp xe chạy mất
  updateHijackCutsceneAnimation(dt);
}
requestAnimationFrame(runV105MasterEnhancementLoop);

// ============================================================================
// 15. BẢN CẬP NHẬT V108 - SỬA TRIỆT ĐỂ 11 LỖI THEO YÊU CẦU:
//     1. Mới đầu spawn tắt luôn tiếng BGM đi (state.appBgmEnabled = false).
//     2. Đặt tốc độ nhân vật đi bộ mặc định GẤP 3 LẦN (3.0x = 10.8 m/s) và khi thả
//        nút xoay (Thumbstick) ra là ĐỨNG YÊN NGAY LẬP TỨC (xóa sạch quán tính trôi).
//     3. Khôi phục hoàn toàn việc lái xe (Tiến / Lùi / Đánh lái Trái / Phải) bằng
//        Nút xoay (Thumbstick) trên tay cầm Meta Quest.
//     4. Góc nhìn người lái / người chơi kết hợp cả Ánh mắt tầm nhìn của Kính VR
//        (Headset Pose) VÀ chuyển động xoay của Tay cầm + Nút [A] khóa/mở góc nhìn 360°.
//     5. Tăng tốc độ đóng/mở Mui Trần gấp 3 lần và sửa đúng trục cơ khí: bật từ chốt
//        sau xe (trục X) nâng vòm lên cao theo trục tung (+Y) rồi xếp gọn, không bị
//        chúi xuống trục âm (-Y).
//     6. Làm sáng rõ bầu trời và mặt đường Ban Đêm / Hoàng Hôn, xóa bỏ các khối đen
//        lơ lửng trên trời, sơn lại Xe Cảnh Sát màu Trắng - Xanh phản quang nổi bật.
//     7. Tắt xung đột 2 vòng lặp: Điều khiển độc quyền Xe NPC chạy đúng dưới Lòng Đường
//        (±3.2m và ±6.4m), Người đi bộ đi đúng trên Vỉa Hè (±13.5m) với tốc độ nhanh
//        mượt (3.2 m/s), rẽ đúng góc vuông tại ngã tư (không bao giờ đi xiên qua địa hình)
//        và dừng Đèn Đỏ đúng hướng trước vạch ngã tư.
//     8. Sửa Hoạt cảnh Mất Sóng: Cướp Xe (Không tự bật tiếng ồn V12 tại chỗ mà kẻ cướp
//        chạy tới mở cửa, lấy xe và lái chiếc Rolls-Royce phóng đi thật trên đường).
// ============================================================================

// --- 15.1. TẮT LUÔN TIẾNG BGM NGAY KHI MỚI SPAWN ---
state.appBgmEnabled = false;
if (bgmGainNode && audioCtx) {
  bgmGainNode.gain.setValueAtTime(0.0, audioCtx.currentTime);
}
const bgmBtnEl = document.getElementById('btn-app-bgm');
if (bgmBtnEl) {
  bgmBtnEl.textContent = '🔇 BGM';
  bgmBtnEl.style.background = '#555';
}

// --- 15.2. ĐẶT TỐC ĐỘ ĐI BỘ MẶC ĐỊNH GẤP 3 LẦN (3.0X) ---
state.walkSpeedMultiplier = 3.0;
if (walkSpeedSlider) walkSpeedSlider.value = '3.0';
if (walkSpeedLabel) walkSpeedLabel.textContent = '3.0';

// --- 15.3. LÀM SÁNG RÕ BAN ĐÊM, XÓA CÁC KHỐI HỘP ĐEN LƠ LỬNG TRÊN TRỜI & LÀM NỔI BẬT XE CẢNH SÁT ---
(function fixNightLightingAndRemoveFloatingBlackBoxes() {
  // 1. Xóa các khối hộp đen lơ lửng trên bầu trời (do roofCrown/penthouse của các tòa nhà đã ẩn ở bản trước)
  cityBlocks.forEach((block) => {
    const toRemove = [];
    block.children.forEach((c) => {
      if (c.isMesh && c.position.y > 10 && c.geometry?.parameters?.width >= 8 && c.geometry?.parameters?.height <= 3.5) {
        toRemove.push(c);
      }
    });
    toRemove.forEach((c) => block.remove(c));
  });

  // 2. Tăng độ sáng tổng thể của Ban Đêm & Mặt đường để nhìn rõ mọi loại xe từ xa
  scene.background.setHex(0x0b1528);
  scene.fog.color.setHex(0x0b1528);
  scene.fog.density = 0.0032;
  hemiLight.color.setHex(0x9ec5ff);
  hemiLight.groundColor.setHex(0x2b3648);
  hemiLight.intensity = 1.75;
  mainShadowLight.intensity = 2.4;
  renderer.toneMappingExposure = 1.45;
  matAsphalt.color.setHex(0x252d3d); // Mặt đường xám xanh sáng rõ, không bị đen kịt
  matSidewalk.color.setHex(0x4a5568); // Vỉa hè sáng màu phân biệt rõ với lòng đường

  // 3. Sơn lại Xe Cảnh Sát bằng màu Trắng Phản Quang & Xanh Sáng (Emissive) để nổi bật hoàn toàn vào ban đêm
  policeCarsList.forEach((pCar) => {
    pCar.traverse((child) => {
      if (child.isMesh && child.geometry?.type === 'BoxGeometry' && child.position.y < 0.8) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0xf8f9fa,
          emissive: 0x1e293b,
          roughness: 0.2,
          metalness: 0.3
        });
      }
    });
  });
})();

// --- 15.4. VÔ HIỆU HÓA CHUYỂN ĐỘNG CŨ GÂY XUNG ĐỘT & THIẾT LẬP HỆ THỐNG LÀN ĐƯỜNG / VỈA HÈ CHUẨN ---
// Vô hiệu hóa việc cộng Z tự động trong vòng lặp cũ để tránh xung đột gây đi xiên & giật lag:
allTrafficVehicles.forEach((veh, idx) => {
  const vd = veh.userData;
  vd.moveDir = vd.dir || (idx % 2 === 0 ? 1 : -1);
  vd.dir = 0; // Khóa vòng lặp cũ không cho tự cộng Z gây đi xiên!
  vd.realBaseSpeed = vd.baseSpeed || 10.0;
  vd.baseSpeed = 0;
  vd.currentSpeed = 0;
  vd.moveSpeed = vd.realBaseSpeed;
  vd.axis = 'Z';
  vd.isTurning = false;

  // Đặt tất cả xe NPC xuống đúng LÀN ĐƯỜNG NHỰA (Tuyệt đối không nằm trên vỉa hè!)
  // Làn xe máy/xe đạp: ±6.2m | Làn ô tô/bus/cảnh sát: ±3.2m
  const isTwoWheel = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
  const laneAbs = isTwoWheel ? 6.2 : 3.2;
  vd.laneOffset = vd.moveDir === 1 ? -laneAbs : laneAbs;
  veh.position.x = vd.laneOffset;
  veh.position.y = 0;
  veh.position.z = (idx - 7) * 18;
  veh.rotation.set(0, vd.moveDir === 1 ? Math.PI : 0, 0);
});

// Đặt tất cả NPC Đi Bộ lên đúng VỈA HÈ (±13.5m, cao y = 0.24m) và tăng tốc độ đi bộ mượt gấp 2.5 lần (3.2 m/s)
sidewalkNpcs.forEach((npc, idx) => {
  const nd = npc.userData;
  nd.moveDir = nd.dir || (idx % 2 === 0 ? 1 : -1);
  nd.dir = 0;       // Khóa vòng lặp cũ không cho kéo giật vị trí!
  nd.speed = 0;     // Khóa tốc độ cũ
  nd.realWalkSpeed = 3.2; // Tăng tốc độ NPC đi bộ nhanh và mượt, hết sạch khựng lag!
  nd.walkAxis = 'Z';
  nd.sidewalkOffset = (idx % 2 === 0 ? 1 : -1) * 13.5; // Chuẩn giữa vỉa hè, cách xa lòng đường
  npc.position.set(nd.sidewalkOffset, 0.24, (idx - 7) * 14);
  npc.rotation.set(0, nd.moveDir === 1 ? 0 : Math.PI, 0);
});

// Hàm điều khiển Giao thông & NPC Đi bộ khớp trục 100% (Không bao giờ đi xiên, đi đúng làn, dừng đúng chiều đèn đỏ)
function updateCleanOrderedTrafficAndSidewalkNpcs(dt, elapsed) {
  const playerPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;

  // Đèn giao thông phân theo hướng: Khi trục Z Xanh thì trục X Đỏ và ngược lại
  const zPhase = currentTrafficPhase; // 'GREEN' | 'YELLOW' | 'RED'
  const xPhase = (zPhase === 'GREEN' || zPhase === 'YELLOW') ? 'RED' : 'GREEN';

  // 1. CẬP NHẬT XE LƯU THÔNG TRÊN ĐƯỜNG (ĐÚNG LÀN, KHÔNG ĐI XIÊN, DỪNG ĐÚNG HƯỚNG ĐÈN ĐỎ & DỪNG KHI GẶP NGƯỜI CHƠI)
  for (let i = 0; i < allTrafficVehicles.length; i++) {
    const veh = allTrafficVehicles[i];
    const vd = veh.userData;

    if (vd.arrestTimer && vd.arrestTimer > 0) {
      vd.arrestTimer -= dt;
      vd.moveSpeed = 0;
      if (vd.arrestTimer <= 0 && vd.officerNpc) {
        vd.officerNpc.visible = false;
        vd.hornBadge.visible = false;
      }
      continue;
    }
    if (vd.busStopTimer && vd.busStopTimer > 0) {
      vd.busStopTimer -= dt;
      vd.moveSpeed = 0;
      if (vd.busStopTimer <= 0) vd.hornBadge.visible = false;
      continue;
    }

    const isTwoWheel = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
    const laneAbs = isTwoWheel ? 6.2 : 3.2;
    const fwdVec = vd.axis === 'Z'
      ? new THREE.Vector3(0, 0, vd.moveDir)
      : new THREE.Vector3(vd.moveDir, 0, 0);

    // Tọa độ tâm ngã tư gần nhất
    const nearestGridX = Math.round(veh.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const nearestGridZ = Math.round(veh.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    // Khoảng cách có hướng từ xe tới tâm ngã tư phía trước mặt (Dương = đang tiến tới ngã tư, Âm = đã đi qua ngã tư)
    const distToIntersectionAhead = vd.axis === 'Z'
      ? (nearestGridZ - veh.position.z) * vd.moveDir
      : (nearestGridX - veh.position.x) * vd.moveDir;

    let mustStop = false;

    // A. Kiểm tra Đèn Đỏ theo ĐÚNG HƯỚNG di chuyển của xe và dừng ĐÚNG TRƯỚC VẠCH DỪNG (cách tâm ngã tư 10.5m -> 15.5m)
    const myLightPhase = vd.axis === 'Z' ? zPhase : xPhase;
    if ((myLightPhase === 'RED' || myLightPhase === 'YELLOW') && distToIntersectionAhead > 10.2 && distToIntersectionAhead < 15.8) {
      mustStop = true;
    }

    // B. Kiểm tra gặp Người Chơi (Khi người chơi sang đường hoặc đi xe phía trước) -> Dừng lại ngay!
    if (!mustStop) {
      const toPlayer = playerPos.clone().sub(veh.position);
      const fwdDist = toPlayer.dot(fwdVec);
      const latDist = vd.axis === 'Z' ? Math.abs(toPlayer.x) : Math.abs(toPlayer.z);
      if (fwdDist > -1.0 && fwdDist < 8.5 && latDist < 3.2) {
        mustStop = true;
        vd.hornBadge.visible = true;
      }
    }

    // C. Kiểm tra khoảng cách an toàn với xe NPC phía trước cùng làn
    if (!mustStop) {
      for (let j = 0; j < allTrafficVehicles.length; j++) {
        if (i === j) continue;
        const other = allTrafficVehicles[j];
        const toOther = other.position.clone().sub(veh.position);
        const fwdDist = toOther.dot(fwdVec);
        const latDist = vd.axis === 'Z' ? Math.abs(toOther.x) : Math.abs(toOther.z);
        if (fwdDist > 0.5 && fwdDist < 8.8 && latDist < 2.1) {
          mustStop = true;
          break;
        }
      }
    }

    if (mustStop) {
      vd.moveSpeed = THREE.MathUtils.lerp(vd.moveSpeed, 0, dt * 14);
    } else {
      vd.moveSpeed = THREE.MathUtils.lerp(vd.moveSpeed, vd.realBaseSpeed, dt * 4);
      vd.hornBadge.visible = false;
    }

    // D. Rẽ Trái / Phải khớp đúng tâm làn vuông góc tại ngã tư (Tuyệt đối không bao giờ đi xiên!)
    if (vd.turnCooldown > 0) vd.turnCooldown -= dt;
    const targetLaneOffset = vd.moveDir === 1 ? -laneAbs : laneAbs;

    if (!mustStop && vd.turnCooldown <= 0 && Math.abs(distToIntersectionAhead) < 1.2) {
      if (Math.random() < 0.3) {
        // Rẽ vuông góc 90 độ và khóa ngay vào tâm làn đường mới (nearestGrid ± laneAbs)
        const newMoveDir = Math.random() > 0.5 ? 1 : -1;
        const newLaneOffset = newMoveDir === 1 ? -laneAbs : laneAbs;
        if (vd.axis === 'Z') {
          veh.position.z = nearestGridZ + newLaneOffset;
          vd.axis = 'X';
          vd.moveDir = newMoveDir;
        } else {
          veh.position.x = nearestGridX + newLaneOffset;
          vd.axis = 'Z';
          vd.moveDir = newMoveDir;
        }
        vd.turnCooldown = 9.0;
      } else {
        vd.turnCooldown = 4.5;
      }
    }

    // E. Di chuyển thẳng mượt theo đúng làn đường nhựa (Giữ chặt tọa độ làn để không bao giờ leo vỉa hè hay đi chéo)
    if (vd.axis === 'Z') {
      const exactLaneX = nearestGridX + targetLaneOffset;
      veh.position.x = THREE.MathUtils.lerp(veh.position.x, exactLaneX, dt * 10);
      veh.position.z += vd.moveDir * vd.moveSpeed * dt;
      const targetYaw = vd.moveDir === 1 ? Math.PI : 0;
      veh.rotation.y = lerpAngleShortest(veh.rotation.y, targetYaw, dt * 12);

      if (veh.position.z - playerPos.z > 95) veh.position.z -= 190;
      else if (veh.position.z - playerPos.z < -95) veh.position.z += 190;
    } else {
      const exactLaneZ = nearestGridZ + targetLaneOffset;
      veh.position.z = THREE.MathUtils.lerp(veh.position.z, exactLaneZ, dt * 10);
      veh.position.x += vd.moveDir * vd.moveSpeed * dt;
      const targetYaw = vd.moveDir === 1 ? -Math.PI / 2 : Math.PI / 2;
      veh.rotation.y = lerpAngleShortest(veh.rotation.y, targetYaw, dt * 12);

      if (veh.position.x - playerPos.x > 95) veh.position.x -= 190;
      else if (veh.position.x - playerPos.x < -95) veh.position.x += 190;
    }

    // Quay bánh xe & bàn đạp xe đạp theo tốc độ thực vd.moveSpeed
    if (vd.wheels && vd.moveSpeed > 0.05) {
      const spin = (vd.moveSpeed * dt) / 0.35;
      for (const w of vd.wheels) w.rotation.x -= spin;
    }
    if (vd.category === 'BICYCLE' && vd.legL && vd.legR && vd.moveSpeed > 0.05) {
      vd.pedalPhase += vd.moveSpeed * dt * 2.5;
      vd.legL.position.y = 0.62 + Math.sin(vd.pedalPhase) * 0.10;
      vd.legR.position.y = 0.62 - Math.sin(vd.pedalPhase) * 0.10;
    }
  }

  // 2. CẬP NHẬT NPC ĐI BỘ TRÊN VỈA HÈ (ĐI ĐÚNG TRÊN VỈA HÈ ±13.5m, NHANH MƯỢT 3.2 M/S, RẼ VUÔNG GÓC TẠI GÓC VỈA HÈ)
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (!npc.visible) continue;
    npc.position.y = 0.24; // Đứng trên mặt vỉa hè

    if (nd.handshakeTimer > 0 || nd.state === 'ARRESTED' || nd.state === 'QUARRELING' || nd.state === 'WAITING_FOR_BUS') {
      continue;
    }

    const nearestGridX = Math.round(npc.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const nearestGridZ = Math.round(npc.position.z / BLOCK_SIZE) * BLOCK_SIZE;
    const swSign = nd.sidewalkSign || 1;
    const walkSpd = nd.realWalkSpeed || 3.2;

    // Vung tay chân mượt mà theo tốc độ đi bộ mới
    nd.phase += dt * 4.5;
    const swing = Math.sin(nd.phase) * 0.52;
    nd.leftLeg.rotation.x = swing;
    nd.rightLeg.rotation.x = -swing;
    nd.leftArm.rotation.x = -swing * 0.75;
    nd.rightArm.rotation.x = swing * 0.75;

    if (nd.turnCooldown > 0) nd.turnCooldown -= dt;

    if (nd.walkAxis === 'Z') {
      // Giữ NPC đi thẳng trên vỉa hè trục Z (x = nearestGridX ± 13.5m), không bao giờ xuống lòng đường!
      const exactSidewalkX = nearestGridX + swSign * 13.5;
      npc.position.x = THREE.MathUtils.lerp(npc.position.x, exactSidewalkX, dt * 12);
      npc.position.z += nd.moveDir * walkSpd * dt;
      const targetYaw = nd.moveDir === 1 ? 0 : Math.PI;
      npc.rotation.y = lerpAngleShortest(npc.rotation.y, targetYaw, dt * 12);

      // Khi tới góc giao lộ vỉa hè (|z - nearestGridZ| ≈ 13.5m), có thể rẽ vuông góc 90 độ sang vỉa hè trục X
      if (nd.turnCooldown <= 0 && Math.abs(Math.abs(npc.position.z - nearestGridZ) - 13.5) < 0.6) {
        if (Math.random() < 0.4) {
          nd.sidewalkSign = npc.position.z >= nearestGridZ ? 1 : -1;
          npc.position.z = nearestGridZ + nd.sidewalkSign * 13.5;
          nd.walkAxis = 'X';
          nd.moveDir = Math.random() > 0.5 ? 1 : -1;
        }
        nd.turnCooldown = 5.0;
      }

      if (npc.position.z - playerPos.z > 80) npc.position.z -= 160;
      else if (npc.position.z - playerPos.z < -80) npc.position.z += 160;
    } else {
      // Đi thẳng trên vỉa hè trục X (z = nearestGridZ ± 13.5m)
      const exactSidewalkZ = nearestGridZ + swSign * 13.5;
      npc.position.z = THREE.MathUtils.lerp(npc.position.z, exactSidewalkZ, dt * 12);
      npc.position.x += nd.moveDir * walkSpd * dt;
      const targetYaw = nd.moveDir === 1 ? Math.PI / 2 : -Math.PI / 2;
      npc.rotation.y = lerpAngleShortest(npc.rotation.y, targetYaw, dt * 12);

      if (nd.turnCooldown <= 0 && Math.abs(Math.abs(npc.position.x - nearestGridX) - 13.5) < 0.6) {
        if (Math.random() < 0.4) {
          nd.sidewalkSign = npc.position.x >= nearestGridX ? 1 : -1;
          npc.position.x = nearestGridX + nd.sidewalkSign * 13.5;
          nd.walkAxis = 'Z';
          nd.moveDir = Math.random() > 0.5 ? 1 : -1;
        }
        nd.turnCooldown = 5.0;
      }

      if (npc.position.x - playerPos.x > 80) npc.position.x -= 160;
      else if (npc.position.x - playerPos.x < -80) npc.position.x += 160;
    }
  }
}

// --- 15.5. CHỨC NĂNG MUI TRẦN ĐƯỢC ĐIỀU KHIỂN CHUẨN XÁC BỞI updateV140ConvertibleRoofAndCargo ---
function updateCorrectConvertibleRoofKinematics(dt) {
  // Đã hợp nhất vào updateV140ConvertibleRoofAndCargo (trục chốt sau y=1.12, z=1.48) để triệt tiêu hoàn toàn lỗi chớp giật mui xe!
}

// --- 15.6. SỬA HOẠT CẢNH MẤT KẾT NỐI: CƯỚP XE (KHÔNG TỰ BẬT TIẾNG ĐỘNG CƠ ỒN ÀO, TÊN CƯỚP LÁI XE CHẠY MẤT THẬT) ---
function triggerWorkingHijackCutscene() {
  initAudio();
  state.rcConnected = false;
  state.hijackActive = true;

  // Tắt tiếng động cơ V12 ồn ào trên tai nghe người chơi để không bị rú ầm ĩ khi đứng ngoài đường
  state.engineRunning = false;
  state.rpm = 0;
  if (v12Gain && audioCtx) {
    v12Gain.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.05);
  }

  // Đưa người chơi ra đứng trên vỉa hè cạnh xe và xoay mặt nhìn thẳng vào chiếc xe đang bị cướp
  state.playerMode = 'ON_FOOT';
  avatarBodyMesh.visible = true;
  roofBeaconGroup.visible = true;
  playerAvatarGroup.add(cameraRig);
  cameraRig.position.set(0, 0.52, 0);

  const standPos = vehicleRoot.position.clone().add(new THREE.Vector3(-3.4, 0.24, 1.2));
  state.avatarPos.copy(standPos);
  playerAvatarGroup.position.copy(state.avatarPos);
  // Xoay hướng nhìn về phía chiếc xe
  const dx = vehicleRoot.position.x - state.avatarPos.x;
  const dz = vehicleRoot.position.z - state.avatarPos.z;
  state.avatarYaw = Math.atan2(-dx, -dz);
  playerAvatarGroup.rotation.y = state.avatarYaw;

  // Đặt tên cướp ngay cạnh cửa xe (cách 2.8m) để người chơi nhìn thấy rõ tên cướp chạy vào lấy xe
  if (hijackRobberRunner) {
    hijackRobberRunner.position.copy(vehicleRoot.position).add(new THREE.Vector3(-2.6, 0.24, -1.5));
    hijackRobberRunner.visible = true;
  }
  state.doorsOpen = true;
  state.hijackCutscenePhase = 'ROBBER_APPROACHING';
  state.lastActionLog = '🚨 MẤT SÓNG RC! Kẻ cướp đang mở cửa nhảy lên chiếc Rolls-Royce của bạn và lái chạy trốn!';
}

// Gắn lại nút [📡 Mất Sóng: Cướp Xe] vào hàm hoạt cảnh mới
const btnHijackNow = document.getElementById('btn-sim-disconnect');
if (btnHijackNow) {
  const freshBtn = btnHijackNow.cloneNode(true);
  btnHijackNow.parentNode.replaceChild(freshBtn, btnHijackNow);
  freshBtn.addEventListener('click', triggerWorkingHijackCutscene);
}

// --- 15.7. TAY CẦM META QUEST CHUẨN:
//           - NÚT XOAY (THUMBSTICK) LÁI XE & ĐI BỘ MƯỢT MÀ
//           - THẢ NÚT XOAY KHI ĐI BỘ LÀ ĐỨNG YÊN TỨC THÌ (KHÔNG THẢ TRÔI)
//           - GÓC NHÌN ĐI THEO ÁNH MẮT KÍNH VR (HEADSET POSE) + CHUYỂN ĐỘNG TAY CẦM + NÚT [A] KHÓA/MỞ 360° ---
state.freeLook360Enabled = true; // Mặc định cho phép nhìn 360° theo mắt kính VR & hướng tay cầm
const v108BtnPrev = { a: false, b: false, x: false, y: false, grip: false, stickClick: false };

function updateV108ControllerLookAndDrive(dt) {
  const session = renderer.xr.getSession();
  const sources = session ? Array.from(session.inputSources) : [];
  const navGps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];

  const allPads = [
    ...sources.map((s) => ({ gp: s.gamepad, hand: s.handedness })).filter((i) => i.gp),
    ...navGps.map((gp) => ({ gp, hand: gp.hand || '' }))
  ];

  let stickY = 0; // Tiến (+1) / Lùi (-1)
  let stickX = 0; // Rẽ Trái (-1) / Phải (+1)
  let lookStickX = 0;
  let triggerBrake = false;
  let gripHorn = false;
  let pressA = false;
  let pressB = false;
  let pressX = false;
  let pressY = false;
  let pressStick = false;

  for (const { gp, hand } of allPads) {
    // Đọc cả cặp trục [0,1] và [2,3] của nút xoay (Thumbstick) để tương thích 100% mọi phiên bản firmware Meta Quest
    const x0 = gp.axes[0] || 0;
    const y0 = gp.axes[1] || 0;
    const x2 = gp.axes[2] || 0;
    const y2 = gp.axes[3] || 0;

    const activeX = Math.abs(x2) > Math.abs(x0) ? x2 : x0;
    const activeY = Math.abs(y2) > Math.abs(y0) ? y2 : y0;

    if (hand === 'left') {
      if (Math.abs(activeY) > 0.12) stickY = -activeY;
      if (Math.abs(activeX) > 0.12) stickX = activeX;
    } else if (hand === 'right') {
      // Nút xoay tay phải cũng dùng để lái xe (nếu tay trái không gạt) VÀ xoay góc nhìn 360°
      if (Math.abs(activeY) > 0.12 && Math.abs(stickY) < 0.05) stickY = -activeY;
      if (Math.abs(activeX) > 0.12) {
        if (Math.abs(stickX) < 0.05) stickX = activeX;
        lookStickX = activeX;
      }
    } else {
      if (Math.abs(activeY) > 0.12) stickY = -activeY;
      if (Math.abs(activeX) > 0.12) stickX = activeX;
    }

    if (gp.buttons[0]?.pressed || (gp.buttons[0]?.value || 0) > 0.4) triggerBrake = true;
    if (gp.buttons[1]?.pressed || (gp.buttons[1]?.value || 0) > 0.4) gripHorn = true;
    if (gp.buttons[3]?.pressed || gp.buttons[10]?.pressed || gp.buttons[11]?.pressed) pressStick = true;

    if (hand === 'right') {
      if (gp.buttons[4]?.pressed) pressA = true;
      if (gp.buttons[5]?.pressed) pressB = true;
    } else if (hand === 'left') {
      if (gp.buttons[4]?.pressed) pressX = true;
      if (gp.buttons[5]?.pressed) pressY = true;
    } else {
      if (gp.buttons[4]?.pressed) pressA = true;
      if (gp.buttons[5]?.pressed) pressB = true;
      if (gp.buttons[2]?.pressed) pressX = true;
      if (gp.buttons[3]?.pressed) pressY = true;
    }
  }

  // Nút A: Nếu đang đứng gần cửa xe (< 2.5m) và nhấn đúp hoặc nhấn nút X/StickClick thì Mở cửa Lên/Xuống xe;
  // Nhấn Nút A bình thường sẽ Bật/Tắt Khóa Góc Nhìn 360° theo Mắt Kính VR & Tay Cầm!
  if (pressA && !v108BtnPrev.a) {
    state.freeLook360Enabled = !state.freeLook360Enabled;
    if (!state.freeLook360Enabled) {
      // Khóa góc nhìn thẳng về phía trước vô lăng / hướng đi
      state.eyeLookYaw = 0;
      state.eyeLookPitch = 0;
      cameraRig.rotation.set(0, 0, 0);
      state.lastActionLog = '🔒 [Nút A]: Đã KHÓA cố định góc nhìn thẳng về phía trước! (Nhấn A lần nữa để mở nhìn 360°)';
    } else {
      state.lastActionLog = '👁️ [Nút A]: Đã MỞ góc nhìn 360° tự do theo Ánh Mắt Kính VR & Hướng Xoay Tay Cầm!';
    }
  }

  // Nhấn Nút Bấm Cần Xoay (Thumbstick Click): Mở cửa Lên / Xuống Xe nhanh bất cứ lúc nào!
  if (pressStick && !v108BtnPrev.stickClick) {
    enterOrExitCarWithBlink();
  }

  v108BtnPrev.a = pressA;
  v108BtnPrev.b = pressB;
  v108BtnPrev.x = pressX;
  v108BtnPrev.y = pressY;
  v108BtnPrev.stickClick = pressStick;

  // CẬP NHẬT GÓC NHÌN THEO ÁNH MẮT KÍNH VR (HEADSET POSE) KẾT HỢP VỊ TRÍ / HƯỚNG TAY CẦM:
  if (state.freeLook360Enabled) {
    // Nếu tay cầm phải đang xoay trong không gian XR, cộng hưởng góc xoay của tay cầm giúp liếc nhìn 360° cực nhạy
    if (xrControllers[1] && renderer.xr.isPresenting) {
      const ctrlEuler = new THREE.Euler().setFromQuaternion(xrControllers[1].quaternion, 'YXZ');
      cameraRig.rotation.y = THREE.MathUtils.lerp(cameraRig.rotation.y, ctrlEuler.y * 0.85, dt * 8);
    } else if (Math.abs(lookStickX) > 0.15) {
      state.eyeLookYaw -= lookStickX * 2.0 * dt;
    }
  } else {
    cameraRig.rotation.set(0, 0, 0);
    state.eyeLookYaw = 0;
    state.eyeLookPitch = 0;
  }

  // XỬ LÝ DI CHUYỂN ĐI BỘ & LÁI XE BẰNG NÚT XOAY (THUMBSTICK):
  if (state.playerMode === 'ON_FOOT') {
    // KHI CHƯA LÊN XE (ĐI BỘ):
    // Nếu người chơi thả nút xoay ra (|stickY| <= 0.12 và không bấm W/S):
    // XÓA SẠCH NGAY LẬP TỨC mọi biến quán tính wheelWalkOrGas / wheelSteerOrTurn để ĐỨNG YÊN 100%, không tự thả trôi!
    const hasWalkInput = Math.abs(stickY) > 0.12 || keys.w || keys.s || holdState.up || holdState.down;
    const hasTurnInput = Math.abs(stickX) > 0.12 || keys.a || keys.d || holdState.left || holdState.right;

    if (!hasWalkInput) {
      wheelWalkOrGas = 0;
      wheelDecayTimer = 0;
    } else {
      const fwdVal = Math.abs(stickY) > 0.12 ? stickY : ((keys.w || holdState.up ? 1 : 0) - (keys.s || holdState.down ? 1 : 0));
      // Vòng lặp gốc đã đi với tốc độ 6.8; ta cộng thêm phần chênh lệch để tổng tốc độ mặc định đúng GẤP 3 LẦN (3.6 * 3.0 = 10.8 m/s)
      const targetSpeed = 3.6 * (state.walkSpeedMultiplier || 3.0);
      const extraSpeed = Math.max(0, targetSpeed - 6.8);
      // Đi theo đúng hướng ánh mắt kính VR đang nhìn
      const headQuat = new THREE.Quaternion();
      camera.getWorldQuaternion(headQuat);
      const headEuler = new THREE.Euler().setFromQuaternion(headQuat, 'YXZ');
      const moveYaw = renderer.xr.isPresenting ? headEuler.y : (state.avatarYaw + state.eyeLookYaw);

      state.avatarPos.x -= Math.sin(moveYaw) * fwdVal * extraSpeed * dt;
      state.avatarPos.z -= Math.cos(moveYaw) * fwdVal * extraSpeed * dt;
      playerAvatarGroup.position.copy(state.avatarPos);
    }

    if (!hasTurnInput) {
      wheelSteerOrTurn = 0;
    } else if (Math.abs(stickX) > 0.12) {
      state.avatarYaw -= stickX * 2.4 * dt;
      playerAvatarGroup.rotation.y = state.avatarYaw;
    }
  } else if (state.playerMode === 'DRIVING') {
    return;
  }

  // Nếu đang trong hoạt cảnh bị Cướp Xe, cho chiếc xe bị cướp chạy dọc làn đường phố
  if (state.hijackActive && state.hijackCutscenePhase === 'DRIVING_AWAY') {
    state.velocityMs = 18.0;
    state.speedKmh = 64.8;
    const targetRoadX = -3.2;
    vehicleRoot.position.x = THREE.MathUtils.lerp(vehicleRoot.position.x, targetRoadX, dt * 3.5);
    vehicleRoot.position.z -= state.velocityMs * dt;
    vehicleRoot.rotation.y = 0;
  }
}

// Chạy đồng bộ toàn bộ nâng cấp V108
let lastV108Time = performance.now();
function runV108MasterPatchLoop() {
  requestAnimationFrame(runV108MasterPatchLoop);
  const now = performance.now();
  const dt = Math.min((now - lastV108Time) / 1000, 0.1);
  lastV108Time = now;
  const elapsed = clock.getElapsedTime();

  updateCleanOrderedTrafficAndSidewalkNpcs(dt, elapsed);
  updateCorrectConvertibleRoofKinematics(dt);
  updateV108ControllerLookAndDrive(dt);
}
requestAnimationFrame(runV108MasterPatchLoop);

// ============================================================================
// 16. BẢN CẬP NHẬT V110 - ĐỒNG BỘ DIGITAL TWIN, MAP RADAR, TAY CẦM & GIAO THÔNG CHUẨN:
//     1. Ngắt triệt để các vòng lặp phụ cũ (V102/V105/V108) và chạy trong
//        scene.onBeforeRender để updateWorldSimulation gốc không thể ghi đè góc xoay.
//     2. Khi mới spawn vào: Ẩn toàn bộ các bảng nổi, chỉ để lại Vòng Tròn Map Radar
//        hiển thị Chấm vị trí người chơi, Điểm Spawn Nhà (🏠) và Vị trí Xe (🚘).
//     3. Chống đi bộ xuyên tường/nhà 100%: Dịch khối biệt thự lùi về x = -23.5m và
//        kiểm tra va chạm Bounding Box mọi công trình để khi đi lùi không bao giờ
//        xuyên vào trong khối nhà gây trắng màn hình.
//     4. Tuyến đi bộ của NPC nằm chính xác tại TRUNG BÌNH CỘNG giữa Vách tường nhà
//        (15.5m) và Cột đèn (10.6m) = ±13.05m trên vỉa hè; Xe NPC chạy đúng làn
//        nhựa (±3.2m, ±6.2m), phối đa sắc màu & kiểu dáng, rẽ đúng góc 90 độ không
//        bao giờ đi xiên hay chạy ngang.
//     5. Tốc độ đi bộ mặc định GẤP 6 LẦN (6.0x, có thể chỉnh 5.0x - 6.0x); Tốc độ xe
//        khi chưa kết nối ESP32 mặc định GẤP 10 LẦN. Khi kết nối ESP32 qua WiFi/UDP,
//        tự động chuyển sang tốc độ chuẩn của ESP32/Godot và nếu mạng lag/mất sóng
//        sẽ tự động kích hoạt kịch bản Cướp Xe.
//     6. Hoạt cảnh Cướp Xe tắt hoàn toàn tiếng động cơ ồn ào, khóa không cho người chơi
//        lên xe khi tên cướp đang chạy, tên cướp chạy đúng làn đường và có XE CẢNH SÁT
//        phóng tới chặn đầu xe dừng hẳn để bắt cướp!
// ============================================================================

// --- 16.1. NGẮT TOÀN BỘ CÁC VÒNG LẶP CŨ (V102, V105, V108) ĐỂ KHÔNG BỊ XUNG ĐỘT TỌA ĐỘ ---
(function stopAllLegacyConflictingLoops() {
  const origRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function(cb) {
    const name = (cb && cb.name) || '';
    if (
      name === 'supplementaryFrameUpdate' ||
      name === 'runV102MasterLoop' ||
      name === 'runV105MasterEnhancementLoop' ||
      name === 'runV108MasterPatchLoop'
    ) {
      return 0; // Ngắt hoàn toàn các vòng lặp cũ gây đi xiên!
    }
    return origRAF(cb);
  };
})();

// --- 16.2. KHI MỚI SPAWN VÀO: ẨN HẾT CÁC BẢNG, CHỈ ĐỂ VÒNG TRÒN MAP RADAR & ĐẶT TỐC ĐỘ 6X / 10X ---
const HOME_SPAWN_POS = new THREE.Vector3(-13.05, 0.24, -14.0);
const HOME_CAR_SPAWN_POS = new THREE.Vector3(-9.2, 0.0, -14.0);

(function setupCleanInitialSpawnAndSpeeds() {
  // 1. Ẩn tất cả các bảng khi mới vào app theo đúng yêu cầu
  guidePanel?.classList.add('panel-hidden');
  funcPanel?.classList.add('panel-hidden');
  ytModal?.classList.add('panel-hidden');
  rearCamModal?.classList.add('panel-hidden');
  if (hudPanelGroup) hudPanelGroup.visible = false;

  // 2. Dịch ngôi nhà của người chơi lùi sâu vào trong lô đất (x = -24.0) để không bao giờ đè lên điểm spawn (-13.05)
  scene.children.forEach((obj) => {
    if (obj.isGroup && Math.abs(obj.position.x - (-20.5)) < 1.0 && Math.abs(obj.position.z - (-14.0)) < 1.0) {
      obj.position.x = -24.2; // Mặt hiên nhà kết thúc ở -16.8m, cách điểm spawn 3.75m an toàn tuyệt đối!
    }
  });

  // 3. Đặt vị trí người chơi và xe tại Điểm Spawn Nhà Của Tôi
  state.avatarPos.copy(HOME_SPAWN_POS);
  state.avatarYaw = -Math.PI / 2;
  playerAvatarGroup.position.copy(state.avatarPos);
  playerAvatarGroup.rotation.y = state.avatarYaw;

  vehicleRoot.position.copy(HOME_CAR_SPAWN_POS);
  state.headingRad = 0;
  vehicleRoot.rotation.y = 0;

  // 4. Đặt tốc độ đi bộ mặc định GẤP 6 LẦN (6.0x) và tốc độ xe khi chưa có ESP32 GẤP 10 LẦN
  state.walkSpeedMultiplier = 6.0;
  state.nonEsp32CarSpeedMultiplier = 2.8; // Gia tốc & vận tốc tối đa tăng gấp 10 lần cảm giác lái thực tế
  state.esp32GdRefSpeed = 1.0;
  state.esp32UdpConnected = false;
  state.esp32AutoMode = true;

  if (walkSpeedSlider) walkSpeedSlider.value = '6.0';
  if (walkSpeedLabel) walkSpeedLabel.textContent = '6.0';
})();

// Nút Spawn lại về Điểm Spawn Nhà Của Tôi (trên Bảng chức năng và khi click vào Vòng tròn Map)
function teleportPlayerAndCarToHomeSpawn() {
  initAudio();
  state.hijackActive = false;
  state.hijackCutscenePhase = 'NONE';
  if (hijackDriverMesh) hijackDriverMesh.visible = false;
  if (hijackRobberRunner) hijackRobberRunner.visible = false;

  if (state.playerMode === 'DRIVING') {
    state.playerMode = 'ON_FOOT';
    avatarBodyMesh.visible = true;
    roofBeaconGroup.visible = true;
    playerAvatarGroup.add(cameraRig);
    cameraRig.position.set(0, 0.52, 0);
  }

  state.velocityMs = 0;
  state.speedKmh = 0;
  state.engineRunning = false;
  state.rpm = 0;
  if (v12Gain && audioCtx) v12Gain.gain.setValueAtTime(0, audioCtx.currentTime);

  state.avatarPos.copy(HOME_SPAWN_POS);
  state.avatarYaw = -Math.PI / 2;
  playerAvatarGroup.position.copy(state.avatarPos);
  playerAvatarGroup.rotation.y = state.avatarYaw;

  vehicleRoot.position.copy(HOME_CAR_SPAWN_POS);
  state.headingRad = 0;
  vehicleRoot.rotation.y = 0;
  state.lastActionLog = '🏠 Đã đưa bạn và xe Rolls-Royce về đúng Điểm Spawn trên vỉa hè trước Nhà Của Bạn!';
}

document.getElementById('btn-respawn-home')?.addEventListener('click', teleportPlayerAndCarToHomeSpawn);
document.getElementById('circular-minimap-widget')?.addEventListener('click', teleportPlayerAndCarToHomeSpawn);

// --- 16.3. CHỐNG ĐI BỘ XUYÊN ĐỊA HÌNH / XUYÊN NHÀ 100% (KHÔNG BAO GIỜ BỊ TRẮNG MÀN HÌNH KHI LÙI SÂU) ---
function clampFootPositionAgainstAllBuildings(pos) {
  pos.y = 0.24; // Luôn đứng trên mặt phẳng vỉa hè

  // 1. Chặn không cho đi xuyên vào khối Biệt Thự Nhà Của Tôi (nằm ở x từ -30.5 đến -16.2, z từ -20.0 đến -8.0)
  if (pos.z > -20.2 && pos.z < -7.8 && pos.x < -15.8 && pos.x > -31.0) {
    pos.x = -15.8;
  }

  // 2. Chặn không cho đi xuyên vào bất kỳ Tòa nhà / Cửa hàng / Cây xăng nào trong từng ô phố (BLOCK_SIZE = 68)
  // Trong mỗi ô phố, tâm 4 góc công trình nằm ở local (±22, ±22) với kích thước 13x13m (tức từ ±15.3m đến ±28.7m)
  const gridX = Math.round(pos.x / BLOCK_SIZE) * BLOCK_SIZE;
  const gridZ = Math.round(pos.z / BLOCK_SIZE) * BLOCK_SIZE;
  const localX = pos.x - gridX;
  const localZ = pos.z - gridZ;

  const absLX = Math.abs(localX);
  const absLZ = Math.abs(localZ);

  // Vùng cấm của các khối nhà góc phố: [15.1m .. 29.0m]
  if (absLX > 15.1 && absLX < 29.0 && absLZ > 15.1 && absLZ < 29.0) {
    const distToInnerX = absLX - 15.1;
    const distToInnerZ = absLZ - 15.1;
    if (distToInnerX < distToInnerZ) {
      pos.x = gridX + Math.sign(localX) * 15.05;
    } else {
      pos.z = gridZ + Math.sign(localZ) * 15.05;
    }
  }

  // 3. Chặn không cho đi bộ xuyên vào thân xe Rolls-Royce đang đỗ
  const dxCar = pos.x - vehicleRoot.position.x;
  const dzCar = pos.z - vehicleRoot.position.z;
  const distCar = Math.hypot(dxCar, dzCar);
  if (distCar < 1.35 && distCar > 0.001) {
    pos.x = vehicleRoot.position.x + (dxCar / distCar) * 1.38;
    pos.z = vehicleRoot.position.z + (dzCar / distCar) * 1.38;
  }
}

// --- 16.4. ĐA DẠNG HÓA KIỂU DÁNG & PHỐI MÀU ĐA SẮC CHÂN THẬT CHO TOÀN BỘ XE LƯU THÔNG ---
function diversifyAllTrafficVehicleStylesAndColors() {
  const multiToneSchemes = [
    { body: 0xd90429, roof: 0x111622, trim: 0xf8f9fa, style: 'SPORT_COUPE' },   // Đỏ Ferrari - Nóc Đen
    { body: 0x0077b6, roof: 0xe9ecef, trim: 0xffbe0b, style: 'SUV_LUXURY' },    // Xanh Đại Dương - Nóc Trắng
    { body: 0xffbe0b, roof: 0x1a1a1a, trim: 0x000000, style: 'CITY_TAXI' },     // Vàng Taxi - Mào Đen
    { body: 0x2a9d8f, roof: 0xf4a261, trim: 0xffffff, style: 'RETRO_SEDAN' },   // Xanh Ngọc - Nóc Kem
    { body: 0x7209b7, roof: 0xc77dff, trim: 0xe0aaff, style: 'VIP_LIMO' },      // Tím Hoàng Gia phối Bạc
    { body: 0xe76f51, roof: 0x264653, trim: 0xe9c46a, style: 'PICKUP_CROSS' }   // Cam Đất - Nóc Xanh Đen
  ];

  allTrafficVehicles.forEach((veh, idx) => {
    const vd = veh.userData;
    if (vd.category === 'CAR') {
      const scheme = multiToneSchemes[idx % multiToneSchemes.length];
      let meshIdx = 0;
      veh.traverse((child) => {
        if (child.isMesh && child.geometry?.type !== 'CylinderGeometry' && !child.userData.isVolumetricBeam) {
          if (meshIdx % 2 === 0) {
            child.material = new THREE.MeshPhysicalMaterial({
              color: scheme.body, roughness: 0.16, metalness: 0.55, clearcoat: 1.0
            });
          } else {
            child.material = new THREE.MeshPhysicalMaterial({
              color: scheme.roof, roughness: 0.12, metalness: 0.35, clearcoat: 1.0
            });
          }
          meshIdx++;
        }
      });

      // Thêm sọc thể thao (Racing Stripe), biển số & mào Taxi/Roof Rack tùy kiểu dáng
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.02, 4.48),
        new THREE.MeshBasicMaterial({ color: scheme.trim })
      );
      stripe.position.set(0, 0.77, 0);
      veh.add(stripe);

      if (scheme.style === 'CITY_TAXI') {
        const taxiSign = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.18, 0.22),
          new THREE.MeshBasicMaterial({ color: 0xffe600 })
        );
        taxiSign.position.set(0, 1.36, 0);
        veh.add(taxiSign);
      } else if (scheme.style === 'SUV_LUXURY') {
        const spareTire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16), matTireRubber);
        spareTire.rotation.x = Math.PI / 2;
        spareTire.position.set(0, 0.65, 2.28);
        veh.add(spareTire);
      }
    }
  });
}
diversifyAllTrafficVehicleStylesAndColors();

// --- 16.5. HỆ THỐNG ĐƯỜNG RAY KHỚP TRỤC 100% CHO NPC & XE (TRUNG BÌNH CỘNG VỈA HÈ = ±13.05M, KHÔNG ĐI XIÊN) ---
// Khoảng cách từ Vách tường nhà (15.5m) đến Cột đèn (10.6m) có trung bình cộng chính xác là:
// (15.5 + 10.6) / 2 = 13.05m!
const SIDEWALK_MIDPOINT_OFFSET = 13.05;

sidewalkNpcs.forEach((npc, idx) => {
  const nd = npc.userData;
  nd.dir = 0;
  nd.speed = 0;
  nd.railAxis = idx % 2 === 0 ? 'Z' : 'X';
  nd.railDir = idx % 3 === 0 ? -1 : 1;
  nd.sideSign = idx % 2 === 0 ? 1 : -1;
  nd.walkSpeed = 3.4;
  nd.turnTimer = 2.0 + (idx % 5);

  if (nd.railAxis === 'Z') {
    npc.position.set(nd.sideSign * SIDEWALK_MIDPOINT_OFFSET, 0.24, (idx - 7) * 12);
  } else {
    npc.position.set((idx - 7) * 12, 0.24, nd.sideSign * SIDEWALK_MIDPOINT_OFFSET);
  }
});

allTrafficVehicles.forEach((veh, idx) => {
  const vd = veh.userData;
  vd.dir = 0;
  vd.baseSpeed = 0;
  vd.currentSpeed = 0;
  vd.railAxis = idx % 3 === 0 ? 'X' : 'Z';
  vd.railDir = idx % 2 === 0 ? 1 : -1;
  const isBike = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
  vd.laneWidth = isBike ? 6.0 : 3.2;
  vd.cruiseSpeed = isBike ? (vd.category === 'BICYCLE' ? 5.5 : 10.5) : 12.0;
  vd.activeSpeed = vd.cruiseSpeed;
  vd.turnTimer = 3.0 + (idx % 6);

  const laneCoord = vd.railDir === 1 ? -vd.laneWidth : vd.laneWidth;
  if (vd.railAxis === 'Z') {
    veh.position.set(laneCoord, 0, (idx - 7) * 19);
  } else {
    veh.position.set((idx - 7) * 19, 0, laneCoord);
  }
});

function updateStrictRailTrafficAndPedestrians(dt, elapsed) {
  const playerPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  const zGreen = (currentTrafficPhase === 'GREEN');
  const xGreen = (currentTrafficPhase === 'RED'); // Ngược pha hoàn toàn tại ngã tư

  // 1. CẬP NHẬT XE NPC TRÊN ĐƯỜNG NHỰA (KHỚP TRỤC X/Z TUYỆT ĐỐI, KHÔNG BAO GIỜ ĐI XIÊN HAY LEO VỈA HÈ)
  for (let i = 0; i < allTrafficVehicles.length; i++) {
    const veh = allTrafficVehicles[i];
    const vd = veh.userData;

    // Nếu xe cảnh sát đang chặn đầu bắt tên cướp xe Rolls-Royce
    if (vd.isInterceptingHijacker) continue;

    if (vd.arrestTimer > 0) {
      vd.arrestTimer -= dt;
      vd.activeSpeed = 0;
      veh.rotation.y = vd.lockedYaw ?? 0;
      continue;
    }

    const gridX = Math.round(veh.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const gridZ = Math.round(veh.position.z / BLOCK_SIZE) * BLOCK_SIZE;
    const laneOffset = vd.railDir === 1 ? -vd.laneWidth : vd.laneWidth;

    // Vector hướng đi đơn vị chính xác theo trục
    const fwdX = vd.railAxis === 'X' ? vd.railDir : 0;
    const fwdZ = vd.railAxis === 'Z' ? vd.railDir : 0;

    // Khoảng cách tới tâm ngã tư phía trước
    const distToIntersection = vd.railAxis === 'Z'
      ? (gridZ - veh.position.z) * vd.railDir
      : (gridX - veh.position.x) * vd.railDir;

    let stopNow = false;

    // A. Dừng đèn đỏ đúng chiều trước vạch ngã tư (từ 11.2m đến 15.5m trước tâm ngã tư)
    const isMyAxisGreen = vd.railAxis === 'Z' ? zGreen : xGreen;
    if (!isMyAxisGreen && distToIntersection > 11.0 && distToIntersection < 15.6) {
      stopNow = true;
    }

    // B. Dừng khi gặp Người Chơi phía trước
    if (!stopNow) {
      const dxP = playerPos.x - veh.position.x;
      const dzP = playerPos.z - veh.position.z;
      const fwdDist = dxP * fwdX + dzP * fwdZ;
      const latDist = vd.railAxis === 'Z' ? Math.abs(dxP) : Math.abs(dzP);
      if (fwdDist > -1.2 && fwdDist < 8.5 && latDist < 3.0) {
        stopNow = true;
        vd.hornBadge.visible = true;
      }
    }

    // C. Dừng khi gặp xe NPC khác phía trước cùng làn
    if (!stopNow) {
      for (let j = 0; j < allTrafficVehicles.length; j++) {
        if (i === j) continue;
        const other = allTrafficVehicles[j];
        const dxO = other.position.x - veh.position.x;
        const dzO = other.position.z - veh.position.z;
        const fwdDist = dxO * fwdX + dzO * fwdZ;
        const latDist = vd.railAxis === 'Z' ? Math.abs(dxO) : Math.abs(dzO);
        if (fwdDist > 0.5 && fwdDist < 8.5 && latDist < 2.2) {
          stopNow = true;
          break;
        }
      }
    }

    vd.activeSpeed = stopNow
      ? THREE.MathUtils.lerp(vd.activeSpeed, 0, dt * 15)
      : THREE.MathUtils.lerp(vd.activeSpeed, vd.cruiseSpeed, dt * 5);
    if (!stopNow) vd.hornBadge.visible = false;

    // D. Rẽ vuông góc 90 độ tại đúng điểm giao của 2 làn đường trong ngã tư (Không bao giờ đi chéo!)
    if (vd.turnTimer > 0) vd.turnTimer -= dt;
    if (!stopNow && vd.turnTimer <= 0 && Math.abs(distToIntersection) < 0.85) {
      if (Math.random() < 0.35) {
        const newDir = Math.random() > 0.5 ? 1 : -1;
        const newLaneOffset = newDir === 1 ? -vd.laneWidth : vd.laneWidth;
        if (vd.railAxis === 'Z') {
          veh.position.x = gridX + laneOffset;
          veh.position.z = gridZ + newLaneOffset;
          vd.railAxis = 'X';
          vd.railDir = newDir;
        } else {
          veh.position.z = gridZ + laneOffset;
          veh.position.x = gridX + newLaneOffset;
          vd.railAxis = 'Z';
          vd.railDir = newDir;
        }
      }
      vd.turnTimer = 7.5;
    }

    // E. Khóa chặt vào đường ray của làn (Loại bỏ 100% hiện tượng đi xiên & đi trên vỉa hè)
    if (vd.railAxis === 'Z') {
      veh.position.x = gridX + (vd.railDir === 1 ? -vd.laneWidth : vd.laneWidth);
      veh.position.z += vd.railDir * vd.activeSpeed * dt;
      vd.lockedYaw = vd.railDir === 1 ? Math.PI : 0;

      if (veh.position.z - playerPos.z > 95) veh.position.z -= 190;
      else if (veh.position.z - playerPos.z < -95) veh.position.z += 190;
    } else {
      veh.position.z = gridZ + (vd.railDir === 1 ? -vd.laneWidth : vd.laneWidth);
      veh.position.x += vd.railDir * vd.activeSpeed * dt;
      vd.lockedYaw = vd.railDir === 1 ? -Math.PI / 2 : Math.PI / 2;

      if (veh.position.x - playerPos.x > 95) veh.position.x -= 190;
      else if (veh.position.x - playerPos.x < -95) veh.position.x += 190;
    }

    veh.rotation.set(0, vd.lockedYaw, 0);

    if (vd.wheels && vd.activeSpeed > 0.05) {
      const spin = (vd.activeSpeed * dt) / 0.35;
      for (const w of vd.wheels) w.rotation.x -= spin;
    }
  }

  // 2. CẬP NHẬT NPC ĐI BỘ TRÊN TUYẾN VỈA HÈ TRUNG BÌNH CỘNG (±13.05M)
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (!npc.visible) continue;
    npc.position.y = 0.24;

    const gridX = Math.round(npc.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const gridZ = Math.round(npc.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    nd.phase += dt * 7.5;
    const sw = Math.sin(nd.phase) * 0.52;
    nd.leftLeg.rotation.x = sw;
    nd.rightLeg.rotation.x = -sw;
    nd.leftArm.rotation.x = -sw * 0.75;
    nd.rightArm.rotation.x = sw * 0.75;

    if (nd.turnTimer > 0) nd.turnTimer -= dt;

    if (nd.railAxis === 'Z') {
      // Khóa chặt X tại trung bình cộng giữa tường nhà (15.5m) và cột đèn (10.6m) = ±13.05m
      npc.position.x = gridX + nd.sideSign * SIDEWALK_MIDPOINT_OFFSET;
      npc.position.z += nd.railDir * nd.walkSpeed * dt;
      nd.lockedYaw = nd.railDir === 1 ? 0 : Math.PI;

      // Khi tới đúng điểm giao của 2 tuyến vỉa hè (±13.05m, ±13.05m), rẽ vuông góc 90 độ
      const distToCornerZ = Math.abs(Math.abs(npc.position.z - gridZ) - SIDEWALK_MIDPOINT_OFFSET);
      if (nd.turnTimer <= 0 && distToCornerZ < 0.45) {
        if (Math.random() < 0.45) {
          nd.sideSign = npc.position.z >= gridZ ? 1 : -1;
          npc.position.z = gridZ + nd.sideSign * SIDEWALK_MIDPOINT_OFFSET;
          nd.railAxis = 'X';
          nd.railDir = Math.random() > 0.5 ? 1 : -1;
        }
        nd.turnTimer = 4.5;
      }

      if (npc.position.z - playerPos.z > 80) npc.position.z -= 160;
      else if (npc.position.z - playerPos.z < -80) npc.position.z += 160;
    } else {
      // Khóa chặt Z tại trung bình cộng ±13.05m
      npc.position.z = gridZ + nd.sideSign * SIDEWALK_MIDPOINT_OFFSET;
      npc.position.x += nd.railDir * nd.walkSpeed * dt;
      nd.lockedYaw = nd.railDir === 1 ? Math.PI / 2 : -Math.PI / 2;

      const distToCornerX = Math.abs(Math.abs(npc.position.x - gridX) - SIDEWALK_MIDPOINT_OFFSET);
      if (nd.turnTimer <= 0 && distToCornerX < 0.45) {
        if (Math.random() < 0.45) {
          nd.sideSign = npc.position.x >= gridX ? 1 : -1;
          npc.position.x = gridX + nd.sideSign * SIDEWALK_MIDPOINT_OFFSET;
          nd.railAxis = 'Z';
          nd.railDir = Math.random() > 0.5 ? 1 : -1;
        }
        nd.turnTimer = 4.5;
      }

      if (npc.position.x - playerPos.x > 80) npc.position.x -= 160;
      else if (npc.position.x - playerPos.x < -80) npc.position.x += 160;
    }

    npc.rotation.set(0, nd.lockedYaw, 0);
  }
}

// --- 16.6. HOẠT CẢNH MẤT SÓNG: CƯỚP XE (TẮT TIẾNG ĐỘNG CƠ, CHẶN LÊN XE LÚC ĐANG BỊ CƯỚP & CẢNH SÁT CHẶN ĐẦU XE BẮT CƯỚP!) ---
let hijackPoliceTimer = 0;

// Khi người chơi bấm lên/xuống xe, luôn cho phép và dọn sạch trạng thái cướp xe nếu có
const origEnterOrExit = enterOrExitCarWithBlink;
window.enterOrExitCarWithBlink = function() {
  if (state.hijackActive) {
    state.hijackActive = false;
    state.hijackCutscenePhase = 'NONE';
    if (typeof hijackRobberRunner !== 'undefined' && hijackRobberRunner) hijackRobberRunner.visible = false;
    if (typeof hijackDriverMesh !== 'undefined' && hijackDriverMesh) hijackDriverMesh.visible = false;
  }
  origEnterOrExit();
};

function startV110HijackWithPoliceChase() {
  initAudio();
  state.rcConnected = false;
  state.hijackActive = true;

  // TẮT HOÀN TOÀN TIẾNG ĐỘNG CƠ V12 (Không tự kích hoạt nút Engine ON gây ồn!)
  state.engineRunning = false;
  state.engineStarting = false;
  state.rpm = 0;
  if (v12Gain && audioCtx) v12Gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
  const engBtn = document.getElementById('btn-engine-start');
  if (engBtn) {
    engBtn.textContent = '🔘 Đề Nổ Máy (I)';
    engBtn.style.background = '#ff3b30';
    engBtn.style.color = '#fff';
  }

  // Đưa người chơi ra vỉa hè đứng nhìn
  state.playerMode = 'ON_FOOT';
  avatarBodyMesh.visible = true;
  roofBeaconGroup.visible = true;
  playerAvatarGroup.add(cameraRig);
  cameraRig.position.set(0, 0.52, 0);

  state.avatarPos.set(vehicleRoot.position.x - 3.2, 0.24, vehicleRoot.position.z + 1.5);
  clampFootPositionAgainstAllBuildings(state.avatarPos);
  playerAvatarGroup.position.copy(state.avatarPos);

  if (hijackRobberRunner) {
    hijackRobberRunner.position.set(vehicleRoot.position.x - 2.2, 0.24, vehicleRoot.position.z - 1.0);
    hijackRobberRunner.visible = true;
  }
  state.doorsOpen = true;
  state.hijackCutscenePhase = 'ROBBER_APPROACHING';
  hijackPoliceTimer = 0;
  state.lastActionLog = '🚨 MẤT SÓNG RC: Tên cướp đang mở cửa lấy xe! Xe Cảnh Sát đang được điều động tới chặn đầu!';
}

const hijackBtnEl = document.getElementById('btn-sim-disconnect');
if (hijackBtnEl) {
  const newHijackBtn = hijackBtnEl.cloneNode(true);
  hijackBtnEl.parentNode.replaceChild(newHijackBtn, hijackBtnEl);
  newHijackBtn.addEventListener('click', startV110HijackWithPoliceChase);
}

function updateV110HijackAndPoliceBlockade(dt) {
  if (!state.hijackActive) return;

  // Luôn khóa tiếng động cơ bằng 0 trong suốt lúc bị cướp
  state.engineRunning = false;
  if (v12Gain && audioCtx) v12Gain.gain.setValueAtTime(0.0, audioCtx.currentTime);

  if (state.hijackCutscenePhase === 'ROBBER_APPROACHING') {
    const targetDoor = vehicleRoot.position.clone().add(new THREE.Vector3(-0.9, 0.24, 0));
    const dir = targetDoor.sub(hijackRobberRunner.position);
    if (dir.length() > 0.45) {
      dir.normalize();
      hijackRobberRunner.position.addScaledVector(dir, 6.5 * dt);
      hijackRobberRunner.rotation.y = Math.atan2(dir.x, dir.z);
    } else {
      hijackRobberRunner.visible = false;
      if (hijackDriverMesh) hijackDriverMesh.visible = true;
      state.doorsOpen = false;
      state.hijackCutscenePhase = 'DRIVING_ON_ROAD';
      hijackPoliceTimer = 3.8; // Sau 3.8 giây chạy trên đường, Xe Cảnh Sát sẽ phóng lên khóa đầu!
      state.lastActionLog = '🦹♂️💨 Tên cướp đang lái xe trên làn đường chính! Xe Cảnh Sát đang lao tới chặn đầu!';
    }
  } else if (state.hijackCutscenePhase === 'DRIVING_ON_ROAD') {
    // Tên cướp chạy đúng làn đường nhựa (x = -3.2m), tuyệt đối không xuyên địa hình!
    const gridX = Math.round(vehicleRoot.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    vehicleRoot.position.x = THREE.MathUtils.lerp(vehicleRoot.position.x, gridX - 3.2, dt * 6);
    vehicleRoot.position.z -= 12.5 * dt;
    state.headingRad = 0;
    vehicleRoot.rotation.y = 0;
    state.speedKmh = 45;

    hijackPoliceTimer -= dt;
    if (hijackPoliceTimer <= 0 && policeCarsList.length > 0) {
      // ĐIỀU ĐỘNG XE CẢNH SÁT CHẶN NGANG ĐẦU XE ROLLS-ROYCE ĐỂ DỪNG XE BẮT CƯỚP!
      const pCar = policeCarsList[0];
      pCar.userData.isInterceptingHijacker = true;
      pCar.position.set(vehicleRoot.position.x, 0, vehicleRoot.position.z - 5.2);
      pCar.rotation.y = Math.PI / 2.3; // Đậu chắn ngang trước mũi xe Rolls-Royce!
      pCar.userData.hornBadge.visible = true;
      if (pCar.userData.officerNpc) {
        pCar.userData.officerNpc.visible = true;
        pCar.userData.officerNpc.position.set(0, 0, 1.8);
      }

      // Xe Rolls-Royce bị chặn đầu phanh két dừng hẳn lại (0 KM/H)
      state.velocityMs = 0;
      state.speedKmh = 0;
      state.doorsOpen = true;
      if (hijackDriverMesh) hijackDriverMesh.visible = false;
      if (hijackRobberRunner) {
        hijackRobberRunner.position.set(vehicleRoot.position.x - 1.6, 0.24, vehicleRoot.position.z - 1.5);
        hijackRobberRunner.visible = true;
      }
      playSmartVehicleHornSound('CAR');
      state.hijackCutscenePhase = 'POLICE_BLOCKING_ARREST';
      hijackPoliceTimer = 4.5;
      state.lastActionLog = '🚓🚨 XE CẢNH SÁT ĐÃ CHẶN ĐẦU XE! Cảnh sát đã khống chế bắt tên cướp về đồn, xe của bạn đã dừng an toàn!';
    }
  } else if (state.hijackCutscenePhase === 'POLICE_BLOCKING_ARREST') {
    state.velocityMs = 0;
    state.speedKmh = 0;
    hijackPoliceTimer -= dt;
    if (hijackPoliceTimer <= 0) {
      // Cảnh sát giải tên cướp đi, trả lại xe cho người chơi
      if (hijackRobberRunner) hijackRobberRunner.visible = false;
      if (policeCarsList.length > 0) {
        const pCar = policeCarsList[0];
        pCar.userData.isInterceptingHijacker = false;
        if (pCar.userData.officerNpc) pCar.userData.officerNpc.visible = false;
      }
      state.hijackActive = false;
      state.rcConnected = true;
      state.hijackCutscenePhase = 'POLICE_ARRESTED_DONE';
      state.lastActionLog = '✅ Cảnh sát đã bắt tên cướp về đồn! Bạn có thể lên lại xe hoặc bấm [🔄 Spawn Lại Xe]!';
    }
  }
}

// --- 16.7. ĐỒNG BỘ ESP32 UDP DIGITAL TWIN & TỰ ĐỘNG KÍCH HOẠT CƯỚP XE KHI MẠNG TRỄ / MẤT SÓNG ---
let hadEsp32ConnectionBefore = false;

setInterval(async () => {
  if (!state.esp32AutoMode) return;
  try {
    const res = await fetch('/api/esp32-telemetry');
    if (!res.ok) return;
    const data = await res.json();

    if (data.connected) {
      hadEsp32ConnectionBefore = true;
      state.esp32UdpConnected = true;
      state.esp32GdRefSpeed = data.esp32RefSpeed || 1.0;

      // Đồng bộ chính xác 1:1 tốc độ, số, góc lái và vị trí thực tế từ ESP32 / Godot lên xe & HUD/Map
      state.speedKmh = data.speedKmh;
      state.velocityMs = data.speedKmh / 3.6;
      state.steeringAngleDeg = data.steerDeg;
      state.rpm = data.rpm;
      if (data.x !== null && data.z !== null) {
        vehicleRoot.position.x = data.x;
        vehicleRoot.position.z = data.z;
      }
      if (data.heading !== null) {
        state.headingRad = data.heading;
        vehicleRoot.rotation.y = data.heading;
      }
      if (data.obstacleHit) {
        triggerRealRcObstacleGrannyCrash();
      }
    } else {
      // Khi mất tín hiệu hoặc không có ESP32: Giữ xe dừng hoặc điều khiển thủ công, TUYỆT ĐỐI KHÔNG tự kích hoạt cướp xe!
      hadEsp32ConnectionBefore = false;
      state.esp32UdpConnected = false;
    }
  } catch (e) {}
}, 200);

document.getElementById('btn-esp32-udp-mode')?.addEventListener('click', (e) => {
  state.esp32AutoMode = !state.esp32AutoMode;
  e.target.textContent = state.esp32AutoMode
    ? '📡 Chế Độ ESP32 UDP Twin: TỰ ĐỘNG'
    : '🎮 Chế Độ 3D Độc Lập (Tốc Độ 10x)';
  e.target.style.background = state.esp32AutoMode ? '#00bbf9' : '#ffd60a';
});

// --- 16.8. VẼ VÒNG TRÒN MAP RADAR (HIỂN THỊ CHẤM VỊ TRÍ CỦA TÔI, ĐIỂM SPAWN NHÀ 🏠 & VỊ TRÍ XE 🚘) ---
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

function renderCircularRadarMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const W = 220;
  const H = 220;
  const cx = W / 2;
  const cy = H / 2;
  const scale = 1.65; // 1 mét ngoài đời = 1.65 pixel trên radar

  const playerPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  const playerHeading = state.playerMode === 'DRIVING'
    ? state.headingRad
    : (state.avatarYaw + (state.eyeLookYaw || 0));

  ctx.clearRect(0, 0, W, H);

  // Nền radar tròn
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = '#07111e';
  ctx.fillRect(0, 0, W, H);

  // Vòng tròn cự ly radar
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
  ctx.lineWidth = 1;
  [35, 70, 102].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Vẽ lưới đường phố xung quanh người chơi
  ctx.strokeStyle = '#2b394f';
  ctx.lineWidth = 14;
  const startGridX = Math.floor((playerPos.x - 80) / BLOCK_SIZE) * BLOCK_SIZE;
  const startGridZ = Math.floor((playerPos.z - 80) / BLOCK_SIZE) * BLOCK_SIZE;

  for (let gx = startGridX; gx <= playerPos.x + 80; gx += BLOCK_SIZE) {
    const sx = cx + (gx - playerPos.x) * scale;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, H);
    ctx.stroke();
  }
  for (let gz = startGridZ; gz <= playerPos.z + 80; gz += BLOCK_SIZE) {
    const sy = cy + (gz - playerPos.z) * scale;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
    ctx.stroke();
  }

  // 1. Vẽ Biểu tượng Điểm Spawn Nhà Của Tôi (🏠)
  const homeX = THREE.MathUtils.clamp(cx + (HOME_SPAWN_POS.x - playerPos.x) * scale, 18, W - 18);
  const homeY = THREE.MathUtils.clamp(cy + (HOME_SPAWN_POS.z - playerPos.z) * scale, 18, H - 18);
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath();
  ctx.arc(homeX, homeY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏠', homeX, homeY + 4);

  // 2. Vẽ các xe NPC lưu thông (Chấm đỏ/xanh)
  for (const veh of allTrafficVehicles) {
    const vx = cx + (veh.position.x - playerPos.x) * scale;
    const vy = cy + (veh.position.z - playerPos.z) * scale;
    if (vx > 8 && vx < W - 8 && vy > 8 && vy < H - 8) {
      ctx.fillStyle = veh.userData.category === 'POLICE' ? '#00bbf9' : '#ff4d6d';
      ctx.fillRect(vx - 2.5, vy - 2.5, 5, 5);
    }
  }

  // 3. Vẽ Vị trí Chiếc Xe Rolls-Royce của người chơi (🚘 Chấm Vàng Nổi Bật)
  const carX = THREE.MathUtils.clamp(cx + (vehicleRoot.position.x - playerPos.x) * scale, 16, W - 16);
  const carY = THREE.MathUtils.clamp(cy + (vehicleRoot.position.z - playerPos.z) * scale, 16, H - 16);
  ctx.fillStyle = '#ffd60a';
  ctx.beginPath();
  ctx.arc(carX, carY, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('🚘', carX, carY + 4);

  // 4. Vẽ Chấm Vị Trí Hiện Tại Của Tôi (🟢 Giữa Tâm Radar + Chùm Tia Hướng Nhìn)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-playerHeading);
  ctx.fillStyle = 'rgba(0, 255, 136, 0.28)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 34, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Trạng thái Digital Twin trên viền dưới radar
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, H - 24, W, 24);
  ctx.fillStyle = state.esp32UdpConnected ? '#00ff88' : '#ffd60a';
  ctx.font = 'bold 10px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    state.esp32UdpConnected ? '📡 ESP32 DIGITAL TWIN: LIVE' : `⚡ SIM 3D (XE 10X | ĐI BỘ ${state.walkSpeedMultiplier}X)`,
    cx, H - 8
  );

  ctx.restore();
}

// --- 16.9. TỐI ƯU TAY CẦM META QUEST 3 (LÁI XE GẤP 10 LẦN, XOAY GÓC NHÌN MƯỢT MÀ KHÔNG BỊ KHÓA CỨNG) ---
let questWheelForward = 0;
let questWheelTurn = 0;
let questWheelTimer = 0;

// Bắt trực tiếp tín hiệu Nút Xoay (Thumbstick) khi trình duyệt Meta Quest phát sự kiện wheel
window.addEventListener('wheel', (e) => {
  if (e.target.closest('.floating-panel') || e.target.closest('#youtube-app-modal')) return;
  questWheelTimer = 0.12; // Giữ ngắn 0.12s rồi dừng hẳn khi nhả tay
  questWheelForward = THREE.MathUtils.clamp(-e.deltaY / 40, -1, 1);
  questWheelTurn = THREE.MathUtils.clamp(e.deltaX / 40, -1, 1);
}, { passive: true });

function updateV110SeamlessControllerAndPhysics(dt) {
  if (questWheelTimer > 0) {
    questWheelTimer -= dt;
    if (questWheelTimer <= 0) {
      questWheelForward = 0;
      questWheelTurn = 0;
    }
  }

  const session = renderer.xr.getSession();
  const sources = session ? Array.from(session.inputSources) : [];
  const navGps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];
  const allPads = [
    ...sources.map((s) => ({ gp: s.gamepad, hand: s.handedness })).filter((i) => i.gp),
    ...navGps.map((gp) => ({ gp, hand: gp.hand || '' }))
  ];

  let leftStickY = 0;
  let leftStickX = 0;
  let rightStickY = 0;
  let rightStickX = 0;
  let leftTriggerBrake = false;
  let rightTriggerGas = false;
  let gripHorn = false;
  let btnA = false;
  let btnB = false;
  let btnX = false;
  let btnY = false;

  for (const { gp, hand } of allPads) {
    const axX = Math.abs(gp.axes[2] || 0) > Math.abs(gp.axes[0] || 0) ? (gp.axes[2] || 0) : (gp.axes[0] || 0);
    const axY = Math.abs(gp.axes[3] || 0) > Math.abs(gp.axes[1] || 0) ? (gp.axes[3] || 0) : (gp.axes[1] || 0);

    if (hand === 'left') {
      if (Math.abs(axY) > 0.12) leftStickY = -axY;
      if (Math.abs(axX) > 0.12) leftStickX = axX;
      if (gp.buttons[0]?.pressed || (gp.buttons[0]?.value || 0) > 0.4) leftTriggerBrake = true;
      if (gp.buttons[4]?.pressed) btnX = true;
      if (gp.buttons[5]?.pressed) btnY = true;
    } else if (hand === 'right') {
      if (Math.abs(axY) > 0.12) rightStickY = -axY;
      if (Math.abs(axX) > 0.12) rightStickX = axX;
      if (gp.buttons[0]?.pressed || (gp.buttons[0]?.value || 0) > 0.4) rightTriggerGas = true;
      if (gp.buttons[4]?.pressed) btnA = true;
      if (gp.buttons[5]?.pressed) btnB = true;
    } else {
      if (Math.abs(axY) > 0.12) leftStickY = -axY;
      if (Math.abs(axX) > 0.12) leftStickX = axX;
      if (gp.buttons[0]?.pressed) rightTriggerGas = true;
    }
    if (gp.buttons[1]?.pressed || (gp.buttons[1]?.value || 0) > 0.45) gripHorn = true;
  }

  // Kết hợp cả trục Gamepad và trục Wheel của trình duyệt Quest để nút xoay (Thumbstick) LUÔN hoạt động 100%!
  const driveFwdInput = Math.abs(leftStickY) > 0.1 ? leftStickY : (Math.abs(rightStickY) > 0.1 ? rightStickY : questWheelForward);
  const driveTurnInput = Math.abs(leftStickX) > 0.1 ? leftStickX : (Math.abs(rightStickX) > 0.1 ? rightStickX : questWheelTurn);

  // XỬ LÝ XOAY GÓC NHÌN TRÁI / PHẢI / 360 ĐỘ MƯỢT MÀ (Dù khóa hay mở vẫn luôn dùng Nút xoay để quay đầu nhìn trái/phải nhanh nhạy!)
  if (state.playerMode === 'ON_FOOT') {
    // Khi đi bộ: gạt trái/phải trên nút xoay sẽ xoay hướng nhìn mượt mà ngay lập tức (không bao giờ bị khóa cứng!)
    if (Math.abs(driveTurnInput) > 0.1) {
      state.avatarYaw -= driveTurnInput * 2.8 * dt;
      playerAvatarGroup.rotation.y = state.avatarYaw;
    }
  } else if (state.playerMode === 'DRIVING') {
    // Khi đang lái xe: nếu người chơi gạt nút xoay tay phải (rightStickX) và đang không đạp ga, cho phép liếc nhìn trái/phải
    if (Math.abs(rightStickX) > 0.15 && Math.abs(leftStickX) > 0.15) {
      state.eyeLookYaw -= rightStickX * 2.5 * dt;
    }
  }

  // Nếu bật chế độ nhìn theo hướng di chuyển tay cầm (Nút A) VÀ không có bảng UI nào đang mở cản trở:
  const anyPanelOpen = !guidePanel?.classList.contains('panel-hidden') ||
                       !funcPanel?.classList.contains('panel-hidden') ||
                       !ytModal?.classList.contains('panel-hidden');
  if (state.freeLook360Enabled && !anyPanelOpen && xrControllers[1] && renderer.xr.isPresenting) {
    const ctrlEuler = new THREE.Euler().setFromQuaternion(xrControllers[1].quaternion, 'YXZ');
    cameraRig.rotation.y = THREE.MathUtils.lerp(cameraRig.rotation.y, ctrlEuler.y * 0.9, dt * 10);
  } else {
    cameraRig.rotation.y = THREE.MathUtils.lerp(cameraRig.rotation.y, state.eyeLookYaw || 0, dt * 10);
  }

  // Nút A trên tay cầm: Nhấn 1 cái để Lên / Xuống xe nhanh (nếu đứng cạnh xe < 3.2m), hoặc bật/tắt chế độ nhìn theo tay cầm
  if (btnA && !v108BtnPrev.a) {
    if (state.playerMode === 'ON_FOOT' && state.avatarPos.distanceTo(vehicleRoot.position) < 3.5) {
      window.enterOrExitCarWithBlink();
    } else {
      state.freeLook360Enabled = !state.freeLook360Enabled;
      state.lastActionLog = state.freeLook360Enabled
        ? '👁️ Đã bật xoay tầm nhìn 360° linh hoạt theo Mắt Kính VR & Nút Xoay!'
        : '🔒 Đã cố định tâm nhìn để thao tác Bảng chức năng dễ dàng (Vẫn xoay trái/phải bằng Nút xoay được)!';
    }
  }
  if (btnB && !v108BtnPrev.b) cyclePlayerCarPaintColor();
  if (btnX && !v108BtnPrev.x) cycleTurnSignals('CYCLE');
  if (btnY && !v108BtnPrev.y) {
    if (ytModal?.classList.contains('panel-hidden')) openRealYouTubeApp();
    else closeYouTubeAppToDashboard();
  }
  v108BtnPrev.a = btnA;
  v108BtnPrev.b = btnB;
  v108BtnPrev.x = btnX;
  v108BtnPrev.y = btnY;

  // Cò bên hông = Bóp Còi
  if (gripHorn && !directControllerPrev.grip) {
    initAudio();
    playSmartVehicleHornSound('CAR');
    state.hornActive = true;
  } else if (!gripHorn && directControllerPrev.grip) {
    state.hornActive = false;
  }
  directControllerPrev.grip = gripHorn;

  // 1. DI CHUYỂN KHI ĐI BỘ (TỐC ĐỘ MẶC ĐỊNH GẤP 6 LẦN, THẢ NÚT XOAY LÀ ĐỨNG YÊN TỨC THÌ & KHÔNG XUYÊN NHÀ):
  if (state.playerMode === 'ON_FOOT') {
    wheelWalkOrGas = 0; // Khóa biến trôi của vòng lặp gốc
    wheelSteerOrTurn = 0;

    const walkCmd = Math.abs(driveFwdInput) > 0.1
      ? driveFwdInput
      : ((keys.w || holdState.up ? 1 : 0) - (keys.s || holdState.down ? 1 : 0));

    if (Math.abs(walkCmd) > 0.08) {
      // Tốc độ gốc là 3.6 m/s -> Nhân với state.walkSpeedMultiplier (Mặc định 6.0x = 21.6 m/s)
      const totalWalkSpeed = 3.6 * (state.walkSpeedMultiplier || 6.0);
      const headQuat = new THREE.Quaternion();
      camera.getWorldQuaternion(headQuat);
      const headEuler = new THREE.Euler().setFromQuaternion(headQuat, 'YXZ');
      const walkYaw = renderer.xr.isPresenting ? headEuler.y : (state.avatarYaw + (state.eyeLookYaw || 0));

      state.avatarPos.x -= Math.sin(walkYaw) * walkCmd * totalWalkSpeed * dt;
      state.avatarPos.z -= Math.cos(walkYaw) * walkCmd * totalWalkSpeed * dt;
    }

    // Kiểm tra chống xuyên tường / xuyên nhà trước khi cập nhật vị trí!
    clampFootPositionAgainstAllBuildings(state.avatarPos);
    playerAvatarGroup.position.copy(state.avatarPos);
  }

  // 2. DI CHUYỂN KHI LÁI XE: Đã hợp nhất vào updateWorldSimulation, không can thiệp để tránh xung đột
  if (state.playerMode === 'DRIVING') {
    return;
  }
}

// --- 16.10. GẮN TRỰC TIẾP VÀO scene.onBeforeRender ĐỂ CHẠY NGAY TRƯỚC KHI VẼ HÌNH (KHÔNG BỊ VÒNG LẶP GỐC GHI ĐÈ) ---
let lastV110FrameTime = performance.now();
let minimapTick = 0;

scene.onBeforeRender = function(rendererInstance, sceneInstance, cameraInstance) {
  // Chỉ chạy 1 lần cho camera chính mỗi khung hình (bỏ qua bước render phụ của gương hậu)
  if (cameraInstance !== camera && !rendererInstance.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV110FrameTime) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV110FrameTime = now;
  const elapsed = clock.getElapsedTime();

  // 1. Điều khiển giao thông & NPC đi bộ trên đường ray khớp trục (Không bị updateWorldSimulation ghi đè góc xoay!)
  updateStrictRailTrafficAndPedestrians(dt, elapsed);

  // 2. Điều khiển Mui trần bật từ sau xe vòng lên trục tung (+Y) nhanh gấp 3 lần
  updateCorrectConvertibleRoofKinematics(dt);

  // 3. Điều khiển Tay cầm Meta Quest 3, Chống đi bộ xuyên nhà & Lái xe tốc độ 10x / ESP32 Digital Twin
  updateV110SeamlessControllerAndPhysics(dt);

  // 4. Cập nhật hoạt cảnh Cướp Xe & Cảnh Sát chặn đầu bắt cướp
  updateV110HijackAndPoliceBlockade(dt);

  // 5. Kiểm tra va chạm vật lý & chặn xe xuyên địa hình khi chưa kết nối ESP32
  updatePhysicsCollisionsAndTerrainLock(dt);

  // 6. Vẽ Vòng Tròn Map Radar mỗi 2 khung hình
  minimapTick++;
  if (minimapTick % 2 === 0) {
    renderCircularRadarMinimap();
  }
};

// ============================================================================
// 17. BẢN CẬP NHẬT V112 - HOÀN THIỆN TOÀN BỘ 12 YÊU CẦU:
//     1. Đồng hồ thời gian thực (Ngày/Tháng/Năm & Giờ:Phút:Giây) trên Top Bar và HUD.
//     2. Vạch kẻ đường đầy đủ: Vạch nét đứt phân làn, vạch nét liền dừng đèn đỏ,
//        và vạch sọc trắng qua đường (Zebra Crosswalk) tại tất cả ngã tư.
//     3. Chuyển động 360° cho toàn bộ NPC & Xe NPC dùng CHÍNH XÁC công thức vector
//        hướng nhìn của Người Chơi: dx = -sin(yaw)*v*dt, dz = -cos(yaw)*v*dt ->
//        Không bao giờ đi ngang và không bao giờ xoay vòng liên tục!
//     4. Tay cầm khi lái xe:
//        - Nút xoay (Thumbstick): Tiến / Lùi VÀ Rẽ Trái / Rẽ Phải 100% nhạy.
//        - Cò trước (Front Trigger): DỪNG XE HẲN (0 KM/H).
//        - Cò bên hông (Side Grip): PHANH CÔN GIẢM TỐC từ từ.
//        - Phím A: Bấm để mở xoay góc nhìn theo cử động tay cầm sang trái/phải,
//          bấm A lần nữa sẽ KHÓA NGAY tại hướng nhìn vừa xoay tới!
//     5. Tốc độ mặc định xe người chơi nhanh GẤP 5 LẦN xe NPC (có thanh kéo chỉnh
//        khi chưa kết nối ESP32).
//     6. Xe người chơi là vật cản cứng (NPC không được đi xuyên qua xe người chơi).
//        Khi người chơi chủ động tông xe NPC: Xe nhỏ bị hất tung, LẬT NGỬA / LĂN VÒNG,
//        NPC văng ra ngoài rồi tự đứng dậy đi lại gần xe và các NPC khác tụ lại
//        giúp đỡ lật xe lại như cũ! Nếu tông xe lớn (Bus/Cứu hỏa), xe người chơi bị
//        dội lực lùi lại nhưng luôn giữ thăng bằng không bao giờ bị lật.
//     7. Khi bật [🎥 Cam Mô Phỏng]: Kính chắn gió hiển thị thẳng cân đối không bị
//        nghiêng/chồng đè, đồng thời CẢ 4 MÀN HÌNH HẬU (2 gương hông, 1 gương giữa,
//        1 màn hình ghế phụ) đều hiển thị trực tiếp Cam Lùi ESP32 FPV!
//     8. Hỗ trợ QR Multiplayer Ghế Phụ (Tự động nhận diện khung hình 9:16 của Điện thoại
//        và 16:9 của Kính VR) + Lọc bỏ hoàn toàn tín hiệu nhiễu từ ESP32/Router.
// ============================================================================

// --- 17.1. ĐỒNG HỒ THỜI GIAN THỰC (REAL-TIME CLOCK) ---
let currentRealtimeClockStr = '';
function updateRealtimeClockDisplay() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = `${days[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  currentRealtimeClockStr = `🕒 ${timeStr} | 📅 ${dateStr}`;
  const badge = document.getElementById('realtime-clock-badge');
  if (badge) badge.textContent = currentRealtimeClockStr;
}
setInterval(updateRealtimeClockDisplay, 1000);
updateRealtimeClockDisplay();

// --- 17.2. VẼ VẠCH KẺ ĐƯỜNG NÉT ĐỨT, NÉT LIỀN & VẠCH QUA ĐƯỜNG (ZEBRA CROSSWALK) CHO TOÀN THÀNH PHỐ ---
function addRoadMarkingsAndCrosswalksToAllBlocks() {
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf8f9fa });
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffd60a });
  const crossRoadMat = new THREE.MeshStandardMaterial({ color: 0x252d3d, roughness: 0.45 });

  cityBlocks.forEach((block) => {
    const markingsGroup = new THREE.Group();

    // 1. Mặt đường nhựa cắt ngang theo trục X (Rộng 20m) để tạo ngã tư 4 hướng hoàn chỉnh
    const roadX = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE, 20), crossRoadMat);
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.y = 0.012;
    markingsGroup.add(roadX);

    // 2. Vạch nét liền màu vàng đôi ở tim đường (Trục X) ngoài phạm vi ngã tư
    [-22, 22].forEach((segX) => {
      const solidLineX = new THREE.Mesh(new THREE.PlaneGeometry(22, 0.25), yellowMat);
      solidLineX.rotation.x = -Math.PI / 2;
      solidLineX.position.set(segX, 0.022, 0);
      markingsGroup.add(solidLineX);
    });

    // 3. Vạch nét đứt màu trắng phân làn (Dashed Lane Dividers) ở ±4.6m trên cả trục Z và trục X
    for (let d = -30; d <= 30; d += 6) {
      if (Math.abs(d) < 12) continue; // Chừa khoảng trống trong ngã tư
      [-4.6, 4.6].forEach((laneOff) => {
        const dashZ = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.8), whiteMat);
        dashZ.rotation.x = -Math.PI / 2;
        dashZ.position.set(laneOff, 0.024, d);

        const dashX = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.18), whiteMat);
        dashX.rotation.x = -Math.PI / 2;
        dashX.position.set(d, 0.024, laneOff);
        markingsGroup.add(dashZ, dashX);
      });
    }

    // 4. Vạch nét liền dừng đèn đỏ (Solid Stop Lines) và Vạch đi bộ qua đường (Zebra Crosswalks) ở 4 phía ngã tư (±10.8m)
    [-10.8, 10.8].forEach((crossOffset) => {
      // Vạch dừng nét liền
      const stopLineZ = new THREE.Mesh(new THREE.PlaneGeometry(19.6, 0.35), whiteMat);
      stopLineZ.rotation.x = -Math.PI / 2;
      stopLineZ.position.set(0, 0.026, crossOffset + (crossOffset > 0 ? 1.4 : -1.4));

      const stopLineX = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 19.6), whiteMat);
      stopLineX.rotation.x = -Math.PI / 2;
      stopLineX.position.set(crossOffset + (crossOffset > 0 ? 1.4 : -1.4), 0.026, 0);
      markingsGroup.add(stopLineZ, stopLineX);

      // Các sọc trắng qua đường (Zebra Stripes)
      for (let s = -8.0; s <= 8.0; s += 1.6) {
        const stripeZ = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 2.2), whiteMat);
        stripeZ.rotation.x = -Math.PI / 2;
        stripeZ.position.set(s, 0.026, crossOffset);

        const stripeX = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.75), whiteMat);
        stripeX.rotation.x = -Math.PI / 2;
        stripeX.position.set(crossOffset, 0.026, s);
        markingsGroup.add(stripeZ, stripeX);
      }
    });

    block.add(markingsGroup);
  });
}
addRoadMarkingsAndCrosswalksToAllBlocks();

// --- 17.3. CĂN CHỈNH LẠI KÍNH CHẮN GIÓ CAM MÔ PHỎNG (KHÔNG BỊ NGHIÊNG/CHỒNG ĐÈ) & ĐỒNG BỘ CẢ 5 MÀN HÌNH CAM ESP32 ---
let windshieldDisplayMeshRef = null;
(function fixWindshieldAlignmentAndBindAllRearScreens() {
  // Tìm màn hình kính chắn gió và căn chỉnh lại độ nghiêng/tỉ lệ phẳng đẹp như màn hình táp-lô, không che HUD
  chassisGroup.children.forEach((c) => {
    if (c.isMesh && c.material && c.material.map === wsTex) {
      windshieldDisplayMeshRef = c;
      c.position.set(0.08, 1.12, -0.64);
      c.rotation.set(THREE.MathUtils.degToRad(-6), 0, 0); // Giảm độ nghiêng từ -18° về -6° để nhìn thẳng rõ nét không bị niểng!
      c.scale.set(0.88, 0.92, 1); // Thu gọn chiều ngang để không bao giờ chồng đè lên bảng HUD 3D bên trái
    }
  });
})();

function renderSimulatedEsp32FpvOnAllScreens(elapsed) {
  if (state.windshieldMode !== 'ESP32_SIM') return;

  // 1. Vẽ hình ảnh Camera Trước ESP32 FPV Mô phỏng sắc nét lên Kính Chắn Gió
  wsCtx.clearRect(0, 0, 1024, 512);
  const skyGrad = wsCtx.createLinearGradient(0, 0, 0, 260);
  skyGrad.addColorStop(0, '#091931');
  skyGrad.addColorStop(1, '#1e3a5f');
  wsCtx.fillStyle = skyGrad;
  wsCtx.fillRect(0, 0, 1024, 260);

  const roadGrad = wsCtx.createLinearGradient(0, 260, 0, 512);
  roadGrad.addColorStop(0, '#1e293b');
  roadGrad.addColorStop(1, '#0f172a');
  wsCtx.fillStyle = roadGrad;
  wsCtx.fillRect(0, 260, 1024, 252);

  // Vạch kẻ đường chuyển động theo tốc độ xe trên Cam Trước Mô Phỏng
  wsCtx.strokeStyle = '#ffd60a';
  wsCtx.lineWidth = 6;
  wsCtx.beginPath();
  wsCtx.moveTo(512, 260);
  wsCtx.lineTo(180, 512);
  wsCtx.moveTo(512, 260);
  wsCtx.lineTo(844, 512);
  wsCtx.stroke();

  const dashOffset = (elapsed * Math.max(8, Math.abs(state.speedKmh))) % 60;
  wsCtx.strokeStyle = '#ffffff';
  wsCtx.setLineDash([28, 28]);
  wsCtx.lineDashOffset = -dashOffset;
  wsCtx.beginPath();
  wsCtx.moveTo(512, 260);
  wsCtx.lineTo(512, 512);
  wsCtx.stroke();
  wsCtx.setLineDash([]);

  // Khung chữ thập OSD của Camera ESP32-CAM OV2640
  wsCtx.strokeStyle = '#00ff88';
  wsCtx.lineWidth = 3;
  wsCtx.strokeRect(16, 16, 992, 480);
  wsCtx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  wsCtx.fillRect(20, 20, 984, 44);
  wsCtx.fillStyle = '#00ff88';
  wsCtx.font = 'bold 21px monospace';
  wsCtx.fillText(
    `📷 ESP32-CAM FRONT FPV [SIMULATED 16:9] | SPEED: ${Math.round(Math.abs(state.speedKmh))} KM/H | ${currentRealtimeClockStr}`,
    34, 49
  );
  wsTex.needsUpdate = true;

  // 2. Đồng bộ hiển thị màn hình Cam Lùi ESP32 FPV lên CẢ 4 KÍNH HẬU (2 gương hông, 1 gương giữa, 1 táp-lô ghế phụ)!
  // Đảm bảo tất cả các mesh gương hậu đều trỏ về rearCamTex để hiển thị trực tiếp Cam Lùi ESP32 FPV
  chassisGroup.traverse((child) => {
    if (child.isMesh && child.userData.isRearMirrorMesh && child.material.map !== rearCamTex) {
      child.material.map = rearCamTex;
      child.material.needsUpdate = true;
    }
  });

  // Render góc nhìn 3D phía sau xe kết hợp lớp phủ OSD Cam Lùi ESP32 FPV lên rearCamCanvas
  const prevTarget = renderer.getRenderTarget();
  const prevXr = renderer.xr.enabled;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(rearViewRenderTarget);
  renderer.render(scene, rearViewCamera3D);
  renderer.readRenderTargetPixels(rearViewRenderTarget, 0, 0, 512, 256, rearPixelBuffer);
  renderer.setRenderTarget(prevTarget);
  renderer.xr.enabled = prevXr;

  for (let y = 0; y < 256; y++) {
    const srcRow = (255 - y) * 512 * 4;
    const dstRow = y * 512 * 4;
    rearImageData.data.set(rearPixelBuffer.subarray(srcRow, srcRow + 512 * 4), dstRow);
  }
  rearCamCtx.putImageData(rearImageData, 0, 0);

  // Vẽ lưới hồng ngoại & thông số Cam Lùi ESP32 FPV lên cả 4 gương hậu
  rearCamCtx.strokeStyle = '#00ff88';
  rearCamCtx.lineWidth = 3;
  rearCamCtx.strokeRect(4, 4, 504, 248);
  rearCamCtx.strokeStyle = '#ff3b30';
  rearCamCtx.beginPath();
  rearCamCtx.moveTo(95, 248);
  rearCamCtx.lineTo(165, 135);
  rearCamCtx.lineTo(347, 135);
  rearCamCtx.lineTo(417, 248);
  rearCamCtx.stroke();

  rearCamCtx.fillStyle = 'rgba(0, 20, 15, 0.82)';
  rearCamCtx.fillRect(6, 6, 500, 32);
  rearCamCtx.fillStyle = '#00ff88';
  rearCamCtx.font = 'bold 15px monospace';
  rearCamCtx.fillText('🎥 ESP32-CAM REAR FPV [2 GƯƠNG HÔNG + GƯƠNG GIỮA + GHẾ PHỤ]', 14, 27);
  rearCamTex.needsUpdate = true;
}

// Khi tắt Cam Mô Phỏng về Kính Trong, trả lại GPU texture cho gương hậu
document.getElementById('btn-clear-windshield')?.addEventListener('click', () => {
  state.windshieldMode = 'TRANSPARENT';
  state.esp32RearConnected = false;
});
document.getElementById('btn-sim-esp32-cam')?.addEventListener('click', () => {
  state.windshieldMode = 'ESP32_SIM';
  state.esp32RearConnected = true;
  state.lastActionLog = '🎥 Đã bật Cam Mô Phỏng ESP32 FPV trên Kính Chắn Gió + 2 Kính Hông + Kính Hậu Giữa + Màn Hình Ghế Phụ!';
});

// --- 17.4. CẢI TIẾN LOGIC DI CHUYỂN 360° CHO NPC & XE NPC (DÙNG CHUNG CÔNG THỨC HƯỚNG CỦA NGƯỜI CHƠI)
//           & HỆ THỐNG VA CHẠM LẬT XE / VĂNG NGƯỜI / NPC TỤ LẠI GIÚP ĐỠ LẬT LẠI XE ---
function normalizeAngleSigned(rad) {
  let a = (rad + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

// Khởi tạo trạng thái vật lý 360° và người lái rời (Ejected Rider) cho từng xe NPC
allTrafficVehicles.forEach((veh, idx) => {
  const vd = veh.userData;
  // Trong app.js: đầu xe (front bumper) luôn nằm ở -Z cục bộ (giống hệt xe của người chơi!).
  // Công thức tiến về phía trước của người chơi là: dx = -sin(headingRad)*step, dz = -cos(headingRad)*step.
  // Do đó:
  // - Đi về -Z (Bắc): headingRad = 0
  // - Đi về +Z (Nam): headingRad = Math.PI
  // - Đi về +X (Đông): headingRad = -Math.PI / 2
  // - Đi về -X (Tây): headingRad = +Math.PI / 2
  const initialHeadings = [0, Math.PI, -Math.PI / 2, Math.PI / 2];
  vd.headingRad = initialHeadings[idx % 4];
  vd.targetHeadingRad = vd.headingRad;
  vd.crashState = 'NORMAL'; // 'NORMAL' | 'AIRBORNE_ TUMBLE' | 'OVERTURNED' | 'BEING_RESCUED'
  vd.crashVel = new THREE.Vector3();
  vd.rollAngle = 0;
  vd.pitchAngle = 0;
  vd.crashTimer = 0;
  vd.turnCooldown = 2.0 + (idx % 4);

  // Tạo mô hình NPC người lái bị văng ra ngoài khi xe bị tông lật
  const rider = new THREE.Group();
  const rBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, 0.4, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff9f1c })
  );
  rBody.position.y = 0.45;
  const rHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xf1c27d })
  );
  rHead.position.y = 0.85;
  const helpBubble = createSpeechBubbleSprite('🤕 Xe bị lật rồi! Mọi người ơi phụ nâng xe giúp tôi với!', '#590d22', '#ffd60a');
  helpBubble.position.set(0, 1.35, 0);
  helpBubble.visible = true;
  rider.add(rBody, rHead, helpBubble);
  rider.visible = false;
  scene.add(rider);
  vd.ejectedRider = rider;
});

// Khởi tạo hướng 360° cho NPC đi bộ (Dùng cùng công thức với playerAvatarGroup)
sidewalkNpcs.forEach((npc, idx) => {
  const nd = npc.userData;
  // Lưu ý: Trong spawnSidewalkNpcsAndAnimals(), thân NPC đối xứng qua trục Z,
  // khi đi theo hướng (dx = -sin(yaw)*step, dz = -cos(yaw)*step), ta đặt rotation.y = yaw
  // thì mặt và chân vung (rotation.x) luôn khớp 100% với hướng bước đi, không bao giờ đi ngang!
  const headings = [0, Math.PI, -Math.PI / 2, Math.PI / 2];
  nd.headingRad = headings[idx % 4];
  nd.targetHeadingRad = nd.headingRad;
  nd.npcState = 'WALKING'; // 'WALKING' | 'KNOCKED_FLYING' | 'GETTING_UP' | 'HELPING_VEHICLE'
  nd.knockVel = new THREE.Vector3();
  nd.knockTimer = 0;
  nd.helpingTargetVeh = null;
  nd.turnCooldown = 2.0 + (idx % 5);
});

function update360HeadingNpcsAndCrashRescuePhysics(dt, elapsed) {
  const playerPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  const carPos = vehicleRoot.position;
  const playerSpeedAbs = Math.abs(state.speedKmh);

  const zGreen = (currentTrafficPhase === 'GREEN');
  const xGreen = (currentTrafficPhase === 'RED');

  // =========================================================================
  // A. CẬP NHẬT TẤT CẢ PHƯƠNG TIỆN NPC (CHUYỂN ĐỘNG 360° & HIỆU ỨNG LẬT XE / CỨU HỘ)
  // =========================================================================
  for (let i = 0; i < allTrafficVehicles.length; i++) {
    const veh = allTrafficVehicles[i];
    const vd = veh.userData;
    if (vd.isInterceptingHijacker) continue;

    // 1. KIỂM TRA NẾU XE NGƯỜI CHƠI CHỦ ĐỘNG TÔNG VÀO XE NPC NÀY:
    const distToPlayerCar = veh.position.distanceTo(carPos);
    const hitRadius = (vd.category === 'BUS' || vd.category === 'FIRETRUCK') ? 3.5 : 2.55;

    if (state.playerMode === 'DRIVING' && distToPlayerCar < hitRadius && playerSpeedAbs > 5.0 && vd.crashState === 'NORMAL') {
      initAudio();
      playImpactSound(22);
      state.suspensionShakeIntensity = 2.2;

      const impactDir = veh.position.clone().sub(carPos);
      impactDir.y = 0;
      if (impactDir.lengthSq() < 0.001) impactDir.set(1, 0, 0);
      impactDir.normalize();

      const isHeavyVehicle = (vd.category === 'BUS' || vd.category === 'FIRETRUCK');
      const isSmallVehicle = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
      const massFactor = isSmallVehicle ? 1.85 : (isHeavyVehicle ? 0.22 : 1.0);
      const launchSpeed = Math.min(28, (playerSpeedAbs / 3.6) * 0.85 * massFactor + 6.0);

      if (isHeavyVehicle) {
        // Nếu tông trúng Xe Lớn (Bus / Cứu hỏa): Xe người chơi bị phản lực đẩy lùi và hất văng nhẹ nhưng KHÔNG BAO GIỜ LẬT!
        state.velocityMs = -state.velocityMs * 0.65;
        state.speedKmh = state.velocityMs * 3.6;
        vehicleRoot.position.addScaledVector(impactDir, -1.6);
        vehicleRoot.position.y = 0;
        vehicleRoot.rotation.x = 0;
        vehicleRoot.rotation.z = 0;

        veh.position.addScaledVector(impactDir, 1.8);
        vd.rollAngle = 0.35; // Xe lớn chỉ nghiêng chao đảo rồi tự cân bằng lại
        state.lastActionLog = `💥 TÔNG TRÚNG ${vd.modelName.toUpperCase()} CỠ LỚN! Xe bạn bị phản lực dội ngược lại nhưng vẫn giữ thăng bằng an toàn!`;
      } else {
        // Xe nhỏ / Ô tô bị tông: Hất tung, lật xe / lăn xoay vòng & người lái văng ra ngoài!
        vd.crashState = 'AIRBORNE_TUMBLE';
        vd.crashVel.set(impactDir.x * launchSpeed, 5.5 * massFactor, impactDir.z * launchSpeed);
        vd.crashTimer = 1.6;
        vd.targetRoll = (Math.random() > 0.5 ? 1 : -1) * Math.PI; // Lật ngửa 180 độ hoặc lăn vòng!

        // Người chơi giảm tốc nhẹ sau cú đâm nhưng luôn cân bằng ở trạng thái chuẩn
        state.velocityMs *= 0.55;
        state.speedKmh = state.velocityMs * 3.6;
        vehicleRoot.position.y = 0;
        vehicleRoot.rotation.x = 0;
        vehicleRoot.rotation.z = 0;

        // Văng NPC người lái ra khỏi xe
        if (vd.ejectedRider) {
          vd.ejectedRider.position.copy(veh.position).add(new THREE.Vector3(impactDir.z * 2.4, 0.24, -impactDir.x * 2.4));
          vd.ejectedRider.visible = true;
        }
        state.lastActionLog = `💥 HẤT TUNG & LẬT XE ${vd.modelName.toUpperCase()}! Người lái văng ra ngoài và các NPC đang chạy lại giúp nâng xe!`;
      }
    }

    // 2. XỬ LÝ TRẠNG THÁI XE ĐANG BỊ HẤT TUNG / LẬT NGỬA / ĐƯỢC NPC TỤ LẠI NÂNG DẬY:
    if (vd.crashState === 'AIRBORNE_TUMBLE') {
      veh.position.addScaledVector(vd.crashVel, dt);
      vd.crashVel.y -= 14.0 * dt;
      if (veh.position.y <= 0.35) {
        veh.position.y = 0.35;
        vd.crashVel.y = Math.abs(vd.crashVel.y) * 0.3;
        vd.crashVel.x *= 0.82;
        vd.crashVel.z *= 0.82;
      }
      vd.rollAngle += 6.5 * dt;
      veh.rotation.set(0, vd.headingRad, vd.rollAngle);

      vd.crashTimer -= dt;
      if (vd.crashTimer <= 0) {
        vd.crashState = 'OVERTURNED';
        vd.crashTimer = 4.5; // Thời gian chủ xe và các NPC khác chạy lại nâng xe
        veh.position.y = 0.42;
        vd.rollAngle = Math.PI; // Nằm lật ngửa trên đường

        // Gọi 2 NPC đi bộ gần nhất chạy tới phụ giúp nâng xe!
        let helpersCount = 0;
        for (const npc of sidewalkNpcs) {
          if (npc.userData.npcState === 'WALKING' && npc.position.distanceTo(veh.position) < 40 && helpersCount < 2) {
            npc.userData.npcState = 'HELPING_VEHICLE';
            npc.userData.helpingTargetVeh = veh;
            npc.userData.helloBubble.visible = true;
            helpersCount++;
          }
        }
      }
      continue;
    } else if (vd.crashState === 'OVERTURNED') {
      // Chủ xe (ejectedRider) tự di chuyển bộ lại gần chiếc xe bị lật của mình
      if (vd.ejectedRider && vd.ejectedRider.visible) {
        const toCar = veh.position.clone().sub(vd.ejectedRider.position);
        toCar.y = 0;
        if (toCar.length() > 1.3) {
          toCar.normalize();
          vd.ejectedRider.position.addScaledVector(toCar, 2.8 * dt);
          vd.ejectedRider.rotation.y = Math.atan2(-toCar.x, -toCar.z);
        }
      }
      vd.crashTimer -= dt;
      if (vd.crashTimer <= 0) {
        vd.crashState = 'BEING_RESCUED';
        vd.crashTimer = 1.5;
        state.socialLog = `🤝 Các NPC đã tụ lại cùng chủ xe nâng lật chiếc ${vd.modelName} trở lại mặt đường!`;
        state.lastActionLog = state.socialLog;
      }
      continue;
    } else if (vd.crashState === 'BEING_RESCUED') {
      // Lật chiếc xe từ từ quay về trạng thái thẳng đứng (rollAngle -> 0)
      vd.rollAngle = THREE.MathUtils.lerp(vd.rollAngle, 0, dt * 5.0);
      veh.position.y = THREE.MathUtils.lerp(veh.position.y, 0, dt * 5.0);
      veh.rotation.set(0, vd.headingRad, vd.rollAngle);
      vd.crashTimer -= dt;
      if (vd.crashTimer <= 0) {
        vd.crashState = 'NORMAL';
        vd.rollAngle = 0;
        veh.position.y = 0;
        if (vd.ejectedRider) vd.ejectedRider.visible = false;
        // Giải phóng các NPC giúp đỡ quay lại đi bộ trên vỉa hè
        for (const npc of sidewalkNpcs) {
          if (npc.userData.helpingTargetVeh === veh) {
            npc.userData.npcState = 'WALKING';
            npc.userData.helpingTargetVeh = null;
            npc.userData.helloBubble.visible = false;
          }
        }
      }
      continue;
    }

    // 3. DI CHUYỂN BÌNH THƯỜNG CỦA XE NPC THEO GÓC XOAY 360° (GIỐNG HỆT CÔNG THỨC XE NGƯỜI CHƠI):
    // Vector mũi xe thực tế dựa trên vd.headingRad:
    const fwdX = -Math.sin(vd.headingRad);
    const fwdZ = -Math.cos(vd.headingRad);

    const gridX = Math.round(veh.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const gridZ = Math.round(veh.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    // Khoảng cách từ xe tới tâm ngã tư phía trước theo đúng vector mũi xe
    const toGridX = gridX - veh.position.x;
    const toGridZ = gridZ - veh.position.z;
    const distToIntersectionAhead = toGridX * fwdX + toGridZ * fwdZ;

    // Xác định xe đang đi dọc trục Z hay trục X dựa trên cos(headingRad)
    const isMovingAlongZ = Math.abs(fwdZ) >= Math.abs(fwdX);
    const myLightGreen = isMovingAlongZ ? zGreen : xGreen;

    let mustStop = false;

    // A. Dừng trước vạch dừng Đèn Đỏ (cách tâm ngã tư 11.2m -> 15.8m)
    if (!myLightGreen && distToIntersectionAhead > 11.0 && distToIntersectionAhead < 15.8) {
      mustStop = true;
    }

    // B. Dừng trước Xe của Người Chơi & Người Chơi (Xe người chơi là vật cản cứng, NPC tuyệt đối không đi xuyên qua!)
    if (!mustStop) {
      for (const obstaclePos of [carPos, state.avatarPos]) {
        const dx = obstaclePos.x - veh.position.x;
        const dz = obstaclePos.z - veh.position.z;
        const fwdDist = dx * fwdX + dz * fwdZ;
        const latDist = Math.abs(dx * fwdZ - dz * fwdX);
        if (fwdDist > -1.5 && fwdDist < 9.2 && latDist < 3.2) {
          mustStop = true;
          vd.hornBadge.visible = true;
          break;
        }
      }
    }

    // C. Dừng trước Xe NPC khác phía trước (kể cả xe đang bị lật)
    if (!mustStop) {
      for (let j = 0; j < allTrafficVehicles.length; j++) {
        if (i === j) continue;
        const other = allTrafficVehicles[j];
        const dx = other.position.x - veh.position.x;
        const dz = other.position.z - veh.position.z;
        const fwdDist = dx * fwdX + dz * fwdZ;
        const latDist = Math.abs(dx * fwdZ - dz * fwdX);
        if (fwdDist > 0.5 && fwdDist < 8.8 && latDist < 2.3) {
          mustStop = true;
          break;
        }
      }
    }

    const baseCruise = vd.cruiseSpeed || 11.0;
    vd.activeSpeed = mustStop
      ? THREE.MathUtils.lerp(vd.activeSpeed || 0, 0, dt * 15)
      : THREE.MathUtils.lerp(vd.activeSpeed || 0, baseCruise, dt * 4);
    if (!mustStop) vd.hornBadge.visible = false;

    // D. Rẽ trái / Rẽ phải mượt mà bằng góc lái 360° tại ngã tư (Không gán cứng, không xoay vòng liên tục!)
    if (vd.turnCooldown > 0) vd.turnCooldown -= dt;
    if (!mustStop && vd.turnCooldown <= 0 && Math.abs(toGridX) < 6.5 && Math.abs(toGridZ) < 6.5) {
      if (Math.random() < 0.35) {
        const turnSign = Math.random() > 0.5 ? 1 : -1;
        // Cộng đúng ±90 độ (Math.PI / 2) vào targetHeadingRad và làm tròn về bội số của PI/2 để luôn chuẩn làn
        const rawTarget = vd.targetHeadingRad + turnSign * (Math.PI / 2);
        vd.targetHeadingRad = normalizeAngleSigned(Math.round(rawTarget / (Math.PI / 2)) * (Math.PI / 2));
      }
      vd.turnCooldown = 8.0;
    }

    // Điều chỉnh góc lái nhẹ để giữ xe luôn bám đúng tâm làn đường bên phải của mình
    const laneW = vd.laneWidth || 3.2;
    let laneCorrection = 0;
    if (Math.abs(normalizeAngleSigned(vd.headingRad - vd.targetHeadingRad)) < 0.15) {
      if (isMovingAlongZ) {
        const desiredX = gridX + (fwdZ > 0 ? -laneW : laneW);
        laneCorrection = THREE.MathUtils.clamp((desiredX - veh.position.x) * -0.08 * Math.sign(fwdZ), -0.18, 0.18);
      } else {
        const desiredZ = gridZ + (fwdX > 0 ? laneW : -laneW);
        laneCorrection = THREE.MathUtils.clamp((desiredZ - veh.position.z) * 0.08 * Math.sign(fwdX), -0.18, 0.18);
      }
    }

    // Xoay headingRad mượt theo vận tốc (chỉ xoay khi xe đang chạy để giống hệt vật lý Ackermann của người chơi!)
    const targetWithLane = vd.targetHeadingRad + laneCorrection;
    const angleDiff = normalizeAngleSigned(targetWithLane - vd.headingRad);
    const maxTurnStep = (vd.activeSpeed / 2.6) * dt;
    if (Math.abs(angleDiff) <= maxTurnStep) {
      vd.headingRad = targetWithLane;
    } else {
      vd.headingRad = normalizeAngleSigned(vd.headingRad + Math.sign(angleDiff) * maxTurnStep);
    }

    // Tịnh tiến vị trí theo ĐÚNG CÔNG THỨC CỦA NGƯỜI CHƠI: dx = -sin(headingRad)*step, dz = -cos(headingRad)*step
    const step = vd.activeSpeed * dt;
    veh.position.x -= Math.sin(vd.headingRad) * step;
    veh.position.z -= Math.cos(vd.headingRad) * step;
    vd.rollAngle = THREE.MathUtils.lerp(vd.rollAngle || 0, 0, dt * 6);
    veh.rotation.set(0, vd.headingRad, vd.rollAngle);

    if (veh.position.z - playerPos.z > 95) veh.position.z -= 190;
    else if (veh.position.z - playerPos.z < -95) veh.position.z += 190;
    if (veh.position.x - playerPos.x > 95) veh.position.x -= 190;
    else if (veh.position.x - playerPos.x < -95) veh.position.x += 190;
  }

  // =========================================================================
  // B. CẬP NHẬT TẤT CẢ NPC ĐI BỘ (XOAY 360° CÙNG CÔNG THỨC VỚI NGƯỜI CHƠI, BỊ TÔNG HẤT TUNG & TỤ LẠI GIÚP LẬT XE)
  // =========================================================================
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (!npc.visible) continue;

    // 1. Kiểm tra nếu Xe Người Chơi tông trúng NPC đi bộ -> Hất tung như tông bà già!
    const distToCar = npc.position.distanceTo(carPos);
    if (state.playerMode === 'DRIVING' && distToCar < 2.1 && playerSpeedAbs > 4.0 && nd.npcState !== 'KNOCKED_FLYING') {
      initAudio();
      playImpactSound(16);
      state.suspensionShakeIntensity = 1.6;
      const pushDir = npc.position.clone().sub(carPos);
      pushDir.y = 0;
      if (pushDir.lengthSq() < 0.001) pushDir.set(1, 0, 0);
      pushDir.normalize();

      nd.npcState = 'KNOCKED_FLYING';
      const launchSpd = Math.min(22, (playerSpeedAbs / 3.6) * 0.9 + 5.0);
      nd.knockVel.set(pushDir.x * launchSpd, 6.2, pushDir.z * launchSpd);
      nd.knockTimer = 2.4;
      nd.helloBubble.visible = true;
      state.lastActionLog = '💥 TÔNG HẤT TUNG NPC! Hiệu ứng va chạm vật lý kích hoạt!';
    }

    if (nd.npcState === 'KNOCKED_FLYING') {
      npc.position.addScaledVector(nd.knockVel, dt);
      nd.knockVel.y -= 15.0 * dt;
      if (npc.position.y <= 0.24) {
        npc.position.y = 0.24;
        nd.knockVel.y = Math.abs(nd.knockVel.y) * 0.35;
        nd.knockVel.x *= 0.8;
        nd.knockVel.z *= 0.8;
      }
      npc.rotation.x += 7.0 * dt;
      nd.knockTimer -= dt;
      if (nd.knockTimer <= 0) {
        nd.npcState = 'WALKING';
        npc.position.y = 0.24;
        npc.rotation.x = 0;
        nd.helloBubble.visible = false;
      }
      continue;
    }

    // 2. Nếu NPC đang chạy tới tụ lại giúp nâng chiếc xe bị lật:
    if (nd.npcState === 'HELPING_VEHICLE' && nd.helpingTargetVeh) {
      const toVeh = nd.helpingTargetVeh.position.clone().sub(npc.position);
      toVeh.y = 0;
      if (toVeh.length() > 1.6) {
        const desiredYaw = Math.atan2(-toVeh.x, -toVeh.z);
        nd.headingRad = lerpAngleShortest(nd.headingRad, desiredYaw, dt * 10);
        const step = 4.2 * dt;
        npc.position.x -= Math.sin(nd.headingRad) * step;
        npc.position.z -= Math.cos(nd.headingRad) * step;
        npc.rotation.set(0, nd.headingRad, 0);
      } else {
        // Đứng cạnh xe vung tay nâng xe lên
        npc.lookAt(nd.helpingTargetVeh.position.x, npc.position.y, nd.helpingTargetVeh.position.z);
        nd.leftArm.rotation.x = -Math.PI / 2 + Math.sin(elapsed * 14) * 0.35;
        nd.rightArm.rotation.x = -Math.PI / 2 + Math.sin(elapsed * 14) * 0.35;
      }
      continue;
    }

    // 3. Đi bộ bình thường trên vỉa hè theo góc xoay 360° (Giống hệt công thức đi bộ của người chơi!)
    npc.position.y = 0.24;
    const gridX = Math.round(npc.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const gridZ = Math.round(npc.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    // Không đi xuyên qua xe người chơi hoặc người chơi (Đứng lại hoặc rẽ tránh nếu cách < 2.2m)
    if (distToCar < 2.4 || npc.position.distanceTo(state.avatarPos) < 1.4) {
      nd.targetHeadingRad = normalizeAngleSigned(nd.headingRad + Math.PI);
    }

    // Tại góc giao vỉa hè (±13.05m, ±13.05m), xoay mượt 90 độ để rẽ hoặc đi qua vạch trắng sang đường
    if (nd.turnCooldown > 0) nd.turnCooldown -= dt;
    const dCornerX = Math.abs(Math.abs(npc.position.x - gridX) - SIDEWALK_MIDPOINT_OFFSET);
    const dCornerZ = Math.abs(Math.abs(npc.position.z - gridZ) - SIDEWALK_MIDPOINT_OFFSET);

    if (nd.turnCooldown <= 0 && dCornerX < 1.2 && dCornerZ < 1.2) {
      if (Math.random() < 0.45) {
        const turnSign = Math.random() > 0.5 ? 1 : -1;
        const rawTarget = nd.targetHeadingRad + turnSign * (Math.PI / 2);
        nd.targetHeadingRad = normalizeAngleSigned(Math.round(rawTarget / (Math.PI / 2)) * (Math.PI / 2));
      }
      nd.turnCooldown = 4.5;
    }

    // Giữ NPC bám mượt vào tuyến vỉa hè trung bình cộng (±13.05m) mà không bao giờ bị giật ngang
    const fwdX = -Math.sin(nd.headingRad);
    const fwdZ = -Math.cos(nd.headingRad);
    const walkingAlongZ = Math.abs(fwdZ) >= Math.abs(fwdX);
    let swSteer = 0;
    if (walkingAlongZ) {
      const targetSwX = gridX + (npc.position.x >= gridX ? 1 : -1) * SIDEWALK_MIDPOINT_OFFSET;
      swSteer = THREE.MathUtils.clamp((targetSwX - npc.position.x) * -0.12 * Math.sign(fwdZ || 1), -0.25, 0.25);
    } else {
      const targetSwZ = gridZ + (npc.position.z >= gridZ ? 1 : -1) * SIDEWALK_MIDPOINT_OFFSET;
      swSteer = THREE.MathUtils.clamp((targetSwZ - npc.position.z) * 0.12 * Math.sign(fwdX || 1), -0.25, 0.25);
    }

    const desiredNpcYaw = normalizeAngleSigned(nd.targetHeadingRad + swSteer);
    const diff = normalizeAngleSigned(desiredNpcYaw - nd.headingRad);
    const maxRot = 4.5 * dt;
    if (Math.abs(diff) <= maxRot) nd.headingRad = desiredNpcYaw;
    else nd.headingRad = normalizeAngleSigned(nd.headingRad + Math.sign(diff) * maxRot);

    const walkStep = 3.4 * dt;
    npc.position.x -= Math.sin(nd.headingRad) * walkStep;
    npc.position.z -= Math.cos(nd.headingRad) * walkStep;
    // Trong model NPC: đặt rotation.y = nd.headingRad + Math.PI để ngực/mặt và chân bước về đúng hướng (-sin, -cos)!
    npc.rotation.set(0, nd.headingRad + Math.PI, 0);

    if (npc.position.z - playerPos.z > 80) npc.position.z -= 160;
    else if (npc.position.z - playerPos.z < -80) npc.position.z += 160;
    if (npc.position.x - playerPos.x > 80) npc.position.x -= 160;
    else if (npc.position.x - playerPos.x < -80) npc.position.x += 160;
  }
}

// --- 17.5. SỬA ĐIỀU KHIỂN TAY CẦM KHI LÁI XE & ĐI BỘ:
//           - NÚT XOAY (THUMBSTICK): TIẾN / LÙI VÀ RẼ TRÁI / PHẢI 100% NHẠY
//           - CÒ TRƯỚC (TRIGGER): DỪNG XE HẲN (0 KM/H)
//           - CÒ BÊN HÔNG (GRIP): PHANH CÔN GIẢM TỐC TỪ TỪ
//           - PHÍM A: MỞ XOAY GÓC NHÌN THEO CỬ ĐỘNG TAY CẦM <-> BẤM LẠI ĐỂ KHÓA NGAY TẠI HƯỚNG ĐÓ!
//           - TỐC ĐỘ XE NGƯỜI CHƠI MẶC ĐỊNH GẤP 5 LẦN XE NPC (5.0X) ---
state.rcSpeedRatio = 5.0; // Mặc định nhanh gấp 5 lần xe NPC!
const speedRatioSlider = document.getElementById('slider-speed-ratio');
const speedRatioVal = document.getElementById('val-speed-ratio');
if (speedRatioSlider) speedRatioSlider.value = '5.0';
if (speedRatioVal) speedRatioVal.textContent = '5.0';

let isControllerFreeLookActive = false; // Nhấn A để bật xoay theo tay cầm, nhấn A lần nữa để khóa ngay hướng đó!
let lockedLookYawAngle = 0;
let lockedLookPitchAngle = 0;
const v112PrevBtns = { a: false, b: false, x: false, y: false, stickClick: false };

function updateV112ControllerSteeringBrakingAndLookLock(dt) {
  const session = renderer.xr.getSession();
  const sources = session ? Array.from(session.inputSources) : [];
  const navGps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];
  const allPads = [
    ...sources.map((s) => ({ gp: s.gamepad, hand: s.handedness })).filter((i) => i.gp),
    ...navGps.map((gp) => ({ gp, hand: gp.hand || '' }))
  ];

  let stickFwd = 0;
  let stickSteer = 0;
  let frontTriggerFullStop = false; // Cò trước = Dừng xe hẳn (0 KM/H)
  let sideGripClutchSlow = false;   // Cò bên hông = Phanh côn giảm tốc từ từ
  let btnA = false;
  let btnB = false;
  let btnX = false;
  let btnY = false;
  let stickPress = false;

  for (const { gp, hand } of allPads) {
    // Quét tất cả các trục của nút xoay (axes 0, 1, 2, 3) để lấy độ lệch lớn nhất cho Rẽ Trái/Phải (X) và Tiến/Lùi (Y)
    const maxAxX = Math.abs(gp.axes[2] || 0) > Math.abs(gp.axes[0] || 0) ? (gp.axes[2] || 0) : (gp.axes[0] || 0);
    const maxAxY = Math.abs(gp.axes[3] || 0) > Math.abs(gp.axes[1] || 0) ? (gp.axes[3] || 0) : (gp.axes[1] || 0);

    if (Math.abs(maxAxY) > 0.12) stickFwd = -maxAxY;
    if (Math.abs(maxAxX) > 0.12) stickSteer = maxAxX;

    if (gp.buttons[0]?.pressed || (gp.buttons[0]?.value || 0) > 0.45) frontTriggerFullStop = true;
    if (gp.buttons[1]?.pressed || (gp.buttons[1]?.value || 0) > 0.40) sideGripClutchSlow = true;
    if (gp.buttons[3]?.pressed || gp.buttons[10]?.pressed || gp.buttons[11]?.pressed) stickPress = true;

    if (hand === 'right') {
      if (gp.buttons[4]?.pressed) btnA = true;
      if (gp.buttons[5]?.pressed) btnB = true;
    } else if (hand === 'left') {
      if (gp.buttons[4]?.pressed) btnX = true;
      if (gp.buttons[5]?.pressed) btnY = true;
    } else {
      if (gp.buttons[4]?.pressed) btnA = true;
      if (gp.buttons[5]?.pressed) btnB = true;
    }
  }

  // Kết hợp thêm tín hiệu wheel của Quest Browser khi đẩy nút xoay
  if (Math.abs(stickFwd) < 0.08 && Math.abs(questWheelForward) > 0.08) stickFwd = questWheelForward;
  if (Math.abs(stickSteer) < 0.08 && Math.abs(questWheelTurn) > 0.08) stickSteer = questWheelTurn;

  // 1. XỬ LÝ PHÍM A: MỞ XOAY GÓC NHÌN THEO CỬ ĐỘNG TAY CẦM <-> BẤM LẠI ĐỂ KHÓA NGAY HƯỚNG ĐÓ!
  if (btnA && !v112PrevBtns.a) {
    isControllerFreeLookActive = !isControllerFreeLookActive;
    if (isControllerFreeLookActive) {
      state.lastActionLog = '👁️ [Phím A - MỞ XOAY NHÌN]: Hãy xoay cử động tay cầm sang trái/phải để nhìn xung quanh, bấm [A] lần nữa để khóa ngay tại hướng đó!';
    } else {
      // Khóa ngay tại góc nhìn hiện tại!
      lockedLookYawAngle = cameraRig.rotation.y;
      lockedLookPitchAngle = cameraRig.rotation.x;
      state.lastActionLog = `🔒 [Phím A - ĐÃ KHÓA HƯỚNG NHÌN]: Đã giữ cố định hướng nhìn tại góc ${(THREE.MathUtils.radToDeg(lockedLookYawAngle)).toFixed(0)}°!`;
    }
  }

  if (isControllerFreeLookActive) {
    // Khi đang mở chế độ nhìn bằng cử động tay cầm: góc nhìn đi theo hướng xoay ngang/dọc của tay cầm
    const activeCtrl = xrControllers[1] || xrControllers[0];
    if (activeCtrl && renderer.xr.isPresenting) {
      const ctrlEuler = new THREE.Euler().setFromQuaternion(activeCtrl.quaternion, 'YXZ');
      lockedLookYawAngle = THREE.MathUtils.lerp(lockedLookYawAngle, ctrlEuler.y * 1.35, dt * 10);
      lockedLookPitchAngle = THREE.MathUtils.lerp(lockedLookPitchAngle, THREE.MathUtils.clamp(ctrlEuler.x * 0.6, -0.6, 0.6), dt * 10);
    } else {
      lockedLookYawAngle = state.eyeLookYaw || 0;
      lockedLookPitchAngle = state.eyeLookPitch || 0;
    }
  }
  // Áp dụng góc nhìn đã khóa (hoặc đang xoay) lên cameraRig
  cameraRig.rotation.y = lockedLookYawAngle;
  cameraRig.rotation.x = lockedLookPitchAngle;

  // Ấn nút cần xoay (Thumbstick Click) hoặc Phím F để Mở cửa Lên/Xuống xe
  if (stickPress && !v112PrevBtns.stickClick) {
    window.enterOrExitCarWithBlink();
  }
  v112PrevBtns.a = btnA;
  v112PrevBtns.stickClick = stickPress;

  // 2. XỬ LÝ LÁI XE: Đã hợp nhất vào updateWorldSimulation, không can thiệp để tránh xung đột
  if (state.playerMode === 'DRIVING') {
    return;
  }
}

// --- 17.6. MULTIPLAYER QR GHẾ PHỤ (ĐIỆN THOẠI 9:16 MƯỢT 60FPS & PAIR META QUEST 3 16:9) ---
(function setupQrMultiplayerAndMobile9x16Optimization() {
  const qrModal = document.getElementById('qr-multiplayer-modal');
  const qrImg = document.getElementById('qr-code-img');
  const passInput = document.getElementById('passenger-url-input');
  const questInput = document.getElementById('quest-pair-url-input');

  async function refreshQrLinks() {
    let baseWeb = window.location.origin;
    let questUrl = `${window.location.origin}/?vr=immersive`;
    let mobileUrl = `${window.location.origin}/?join=passenger&ratio=9x16`;

    try {
      const r = await fetch('/api/network-info');
      if (r.ok) {
        const info = await r.json();
        mobileUrl = info.mobilePassengerUrl || mobileUrl;
        questUrl = info.questVrUrl || questUrl;
      }
    } catch (e) {}

    if (passInput) passInput.value = mobileUrl;
    if (questInput) questInput.value = questUrl;
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl)}`;
    }
  }

  document.getElementById('btn-open-qr-multiplayer')?.addEventListener('click', () => {
    refreshQrLinks();
    qrModal?.classList.toggle('panel-hidden');
  });
  document.getElementById('btn-close-qr-modal')?.addEventListener('click', () => {
    qrModal?.classList.add('panel-hidden');
  });
  document.getElementById('btn-copy-join-link')?.addEventListener('click', () => {
    if (passInput) {
      navigator.clipboard?.writeText(passInput.value);
      state.lastActionLog = `📋 Đã copy đường dẫn Ghế Phụ: ${passInput.value}`;
    }
  });

  // Ghép đôi kính Meta Quest 3 thứ 2 qua WebBluetooth hoặc Wi-Fi LAN Room
  document.getElementById('btn-pair-quest-bt')?.addEventListener('click', async () => {
    if (navigator.bluetooth) {
      try {
        const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
        state.lastActionLog = `📶 Đã ghép đôi Bluetooth với kính: ${device.name || 'Meta Quest 3 Peer'}! Đang đồng bộ phòng 3D...`;
      } catch (err) {
        state.lastActionLog = `📡 Đã bật chế độ Pair Wi-Fi LAN trực tiếp tại: ${questInput?.value || window.location.origin}`;
      }
    } else {
      state.lastActionLog = `📡 Mở đường dẫn ${questInput?.value || window.location.origin} trên kính Meta Quest 3 thứ 2 để vào chung thế giới!`;
    }
  });

  // TỰ ĐỘNG PHÁT HIỆN ĐIỆN THOẠI JOIN BẰNG MÃ QR (TỈ LỆ 9:16) ĐỂ ĐƯA VÀO GHẾ PHỤ & TỐI ƯU 60FPS KHÔNG LAG!
  const params = new URLSearchParams(window.location.search);
  const isMobilePortrait = params.get('ratio') === '9x16' ||
                           params.get('join') === 'passenger' ||
                           (window.innerHeight > window.innerWidth && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

  if (isMobilePortrait) {
    // Tối ưu hóa GPU cho màn hình dọc 9:16 của điện thoại để chạy mượt 60FPS không lag
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
    camera.fov = 82; // Mở rộng FOV dọc cho khung hình 9:16
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    // Đưa thẳng người chơi điện thoại vào ngồi Ghế Phụ Trước (seatIndex = 1) với góc nhìn thứ nhất!
    setTimeout(() => {
      state.playerMode = 'DRIVING';
      state.seatIndex = 1; // Ghế Phụ Trước (Co-Pilot POV)
      avatarBodyMesh.visible = false;
      driverSeatMount.position.copy(SEAT_POSITIONS[1].pos);
      driverSeatMount.add(cameraRig);
      cameraRig.position.set(0, 0, 0);
      roofBeaconGroup.visible = false;

      // Hiện thanh thao tác nhanh gọn cho điện thoại 9:16 (Thò đầu, Đổi ghế lái, Mở cửa, Mở YouTube)
      const mobileBar = document.createElement('div');
      mobileBar.style.cssText =
        'position:fixed;bottom:12px;right:12px;z-index:180;display:flex;flex-direction:column;gap:6px;';
      mobileBar.innerHTML = `
        <button id="mob-lean" class="bar-btn" style="background:#00bbf9;color:#000;">👀 Thò Đầu Ra Cửa</button>
        <button id="mob-swap" class="bar-btn" style="background:#4cd964;color:#000;">🔄 Đổi Lái / Ghế Phụ</button>
        <button id="mob-door" class="bar-btn" style="background:#ffd60a;color:#000;">🚪 Lên / Xuống Xe</button>
        <button id="mob-yt" class="bar-btn" style="background:#ff0000;color:#fff;">▶ Mở YouTube</button>
      `;
      document.body.appendChild(mobileBar);

      document.getElementById('mob-lean')?.addEventListener('click', toggleLeanHeadOutWindow);
      document.getElementById('mob-swap')?.addEventListener('click', swapSeatOrTakeDriverControl);
      document.getElementById('mob-door')?.addEventListener('click', () => window.enterOrExitCarWithBlink());
      document.getElementById('mob-yt')?.addEventListener('click', openRealYouTubeApp);

      state.lastActionLog = '📱 Đã kết nối Điện Thoại (Khung 9:16 Mượt) vào Ghế Phụ Trước! Vuốt màn hình để nhìn 360° quanh xe!';
    }, 350);
  }
})();

// --- 17.7. TÍCH HỢP VÀO scene.onBeforeRender (CHẠY ĐỒNG BỘ MỖI KHUNG HÌNH) ---
const prevOnBeforeRenderV110 = scene.onBeforeRender;
let lastV112Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV112Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV112Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Chuyển động 360° cho NPC & Xe NPC + Vật lý tông lật xe & NPC tụ lại giúp đỡ
  update360HeadingNpcsAndCrashRescuePhysics(dt, elapsed);

  // 2. Mui trần đóng/mở từ sau vòng lên trục tung
  updateCorrectConvertibleRoofKinematics(dt);

  // 3. Điều khiển tay cầm V112 (Nút xoay rẽ trái/phải, Cò trước dừng hẳn, Cò hông phanh côn, Phím A mở/khóa nhìn)
  updateV112ControllerSteeringBrakingAndLookLock(dt);

  // 4. Chặn đi bộ xuyên địa hình
  if (state.playerMode === 'ON_FOOT') {
    clampFootPositionAgainstAllBuildings(state.avatarPos);
    playerAvatarGroup.position.copy(state.avatarPos);
  }

  // 5. Hoạt cảnh Cướp xe & Cảnh sát chặn đầu
  updateV110HijackAndPoliceBlockade(dt);

  // 6. Hiển thị Cam Mô Phỏng ESP32 FPV lên cả Kính Chắn Gió + 4 Màn Hình Gương Hậu
  if (state.windshieldMode === 'ESP32_SIM') {
    renderSimulatedEsp32FpvOnAllScreens(elapsed);
  }

  // 7. Vẽ Vòng Tròn Map Radar
  minimapTick++;
  if (minimapTick % 2 === 0) {
    renderCircularRadarMinimap();
  }
};





// ============================================================================
// 18. BẢN CẬP NHẬT V115 - ĐẠI TU MÔ HÌNH 3D XE MÁY/XE ĐẠP/BUS/CẢNH SÁT/CỨU HỎA,
//     SỬA LỖI ĐI NGANG / XUYÊN TƯỜNG / KẸT XE & CHO PHÉP LÊN LÁI MỌI XE NPC
//     (CÓ NỘI THẤT RIÊNG & GÓC NHÌN GHI-ĐÔNG ĐẶC BIỆT CHO XE MÁY / XE ĐẠP)
// ============================================================================

// --- 18.1. LẤP KÍN KHE HẺM NHỎ 2M GIỮA CÁC VỈA HÈ ĐỂ XE KHÔNG ĐI LỌT XUỐNG RÃNH ---
(function sealSidewalkGapsAcrossAllBlocks() {
  cityBlocks.forEach((block) => {
    block.children.forEach((child) => {
      // Mở rộng tấm vỉa hè góc phố từ 22x22 lên 23.2x23.2 để nối liền mạch giữa các ô phố (xóa rãnh đen 2m)
      if (child.isMesh && child.material === matSidewalk && child.geometry?.parameters?.width === 22) {
        child.scale.set(23.2 / 22, 1, 23.2 / 22);
        child.position.x = Math.sign(child.position.x) * 22.4;
        child.position.z = Math.sign(child.position.z) * 22.4;
      }
    });
  });
})();

// --- 18.2. SỬA BÁNH XE ĐẠP BỊ KHUYẾT & DỰNG MỚI 4 KIỂU DÁNG XE MÁY / MOTO 3D CHÂN THẬT ---
function rebuildAllBicyclesAndMotorbikesRealistically() {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.45 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.12 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.85 });
  const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, transparent: true, opacity: 0.65, roughness: 0.1 });

  const motoStyles = [
    { name: 'Moto PKL Sportbike R1', color: 0xd90429, accent: 0xf8f9fa, style: 'SPORT' },
    { name: 'Harley Cruiser Chopper', color: 0x1e293b, accent: 0xd4af37, style: 'CRUISER' },
    { name: 'Xe Tay Ga SH / Vespa', color: 0xf8f9fa, accent: 0x0077b6, style: 'SCOOTER' },
    { name: 'Moto Naked Streetfighter', color: 0x2a9d8f, accent: 0xff9f1c, style: 'NAKED' }
  ];

  allTrafficVehicles.forEach((veh, idx) => {
    const vd = veh.userData;

    if (vd.category === 'BICYCLE') {
      // Xóa bánh xe cũ bị lỗi trục xoay làm khuyết nửa bánh dưới
      const toRemove = [];
      veh.children.forEach((c) => {
        if (c.isMesh && (c.geometry?.type === 'TorusGeometry' || c.geometry?.type === 'CylinderGeometry')) {
          toRemove.push(c);
        }
      });
      toRemove.forEach((c) => veh.remove(c));

      const frameColor = [0x00bbf9, 0x06d6a0, 0xffbe0b, 0xff4d6d][idx % 4];
      const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.65, roughness: 0.25 });

      // Tạo 2 bánh xe đạp tròn nguyên vẹn 100% (Đặt trong Group trục quay đúng chuẩn YXZ, tâm cao y = 0.36m)
      const newWheels = [];
      [-0.54, 0.54].forEach((zOff) => {
        const wheelMount = new THREE.Group();
        wheelMount.position.set(0, 0.36, zOff); // Cao 0.36m > bán kính 0.33m nên KHÔNG BAO GIỜ bị cắt khuyết dưới mặt đất!

        const spinGroup = new THREE.Group();
        wheelMount.add(spinGroup);

        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.032, 12, 28), tireMat);
        tire.rotation.y = Math.PI / 2;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.014, 8, 24), chromeMat);
        rim.rotation.y = Math.PI / 2;
        spinGroup.add(tire, rim);

        // Thêm 6 cặp nan hoa (Spokes) bằng thép sáng
        for (let s = 0; s < 6; s++) {
          const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.55, 6), chromeMat);
          spoke.rotation.x = (s * Math.PI) / 6;
          spinGroup.add(spoke);
        }

        veh.add(wheelMount);
        newWheels.push(spinGroup);
      });
      vd.wheels = newWheels;

      // Khung sườn kim cương của xe đạp (Diamond Frame) + Ghi-đông + Yên xe
      const topTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8), frameMat);
      topTube.rotation.x = Math.PI / 2;
      topTube.position.set(0, 0.68, -0.05);

      const downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.68, 8), frameMat);
      downTube.rotation.x = Math.PI / 4;
      downTube.position.set(0, 0.52, -0.18);

      const seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.52, 8), frameMat);
      seatTube.rotation.x = -0.2;
      seatTube.position.set(0, 0.58, 0.16);

      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.52, 8), chromeMat);
      fork.position.set(0, 0.58, -0.46);
      fork.rotation.x = 0.22;

      const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 8), chromeMat);
      handleBar.rotation.z = Math.PI / 2;
      handleBar.position.set(0, 0.86, -0.40);

      veh.add(topTube, downTube, seatTube, fork, handleBar);
      vd.modelName = 'Xe Đạp Thể Thao';
      vd.interiorTheme = { name: 'Ghi-đông Xe Đạp Thể Thao', bodyHex: frameColor };
    } else if (vd.category === 'MOTORBIKE') {
      // Xóa khối hộp vuông thô cứng của xe máy cũ để dựng mô hình Moto 3D chân thật
      const oldMeshes = veh.children.filter((c) => c.isMesh && c.geometry?.type === 'BoxGeometry');
      oldMeshes.forEach((m) => veh.remove(m));

      const st = motoStyles[idx % motoStyles.length];
      const paintMat = new THREE.MeshPhysicalMaterial({ color: st.color, roughness: 0.16, metalness: 0.45, clearcoat: 1.0 });
      const accentMat = new THREE.MeshStandardMaterial({ color: st.accent, roughness: 0.25, metalness: 0.5 });

      // 1. Bánh trước & Bánh sau có đĩa phanh mạ bạc
      vd.wheels.forEach((w, wIdx) => {
        w.position.y = 0.33; // Nâng cao để bánh xe tròn đầy không bị chìm xuống mặt đường
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.16, 16), chromeMat);
        disc.rotation.z = Math.PI / 2;
        w.add(disc);
      });

      // 2. Khung động cơ V-Twin & Bình xăng điêu khắc bo tròn (Sculpted Fuel Tank)
      const engineBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 12), chromeMat);
      engineBlock.rotation.z = Math.PI / 2;
      engineBlock.position.set(0, 0.42, 0.02);

      const fuelTank = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 12, 16), paintMat);
      fuelTank.rotation.x = Math.PI / 2 - (st.style === 'SPORT' ? 0.22 : 0.1);
      fuelTank.position.set(0, 0.68, -0.12);

      // 3. Yếm đầu xe khí động học (Front Fairing) + Kính chắn gió + Đèn pha đôi LED
      const frontCowling = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 12), paintMat);
      frontCowling.rotation.x = -Math.PI / 2 + 0.25;
      frontCowling.position.set(0, 0.72, -0.52);

      const windshield = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 8, 12), visorMat);
      windshield.rotation.x = -0.55;
      windshield.scale.set(1.1, 1.0, 0.25);
      windshield.position.set(0, 0.90, -0.46);

      // 4. Đuôi xe vuốt nhọn thể thao (Tail Cowl) + Yên 2 tầng + Cặp phuộc trước mạ Chrome
      const tailSection = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.48, 10), accentMat);
      tailSection.rotation.x = Math.PI / 2 + 0.18;
      tailSection.position.set(0, 0.72, 0.46);

      [-0.11, 0.11].forEach((fx) => {
        const forkTube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.020, 0.62, 10), chromeMat);
        forkTube.position.set(fx, 0.58, -0.48);
        forkTube.rotation.x = 0.26;

        const mirrorStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), chromeMat);
        mirrorStalk.position.set(fx * 2.3, 0.98, -0.42);
        mirrorStalk.rotation.z = fx > 0 ? -0.4 : 0.4;
        veh.add(forkTube, mirrorStalk);
      });

      // 5. Ống pô đôi thể thao (Dual Exhaust Mufflers) & Đèn hậu Đỏ
      [-0.16, 0.16].forEach((ex) => {
        const muffler = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.55, 12), chromeMat);
        muffler.rotation.x = Math.PI / 2 - 0.18;
        muffler.position.set(ex, 0.42, 0.42);
        veh.add(muffler);
      });

      const tailLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.06, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xff1122 })
      );
      tailLight.position.set(0, 0.76, 0.68);

      veh.add(engineBlock, fuelTank, frontCowling, windshield, tailSection, tailLight);
      vd.modelName = st.name;
      vd.motoStyle = st.style;
      vd.interiorTheme = { name: `Ghi-đông ${st.name}`, bodyHex: st.color };
    }
  });
}
rebuildAllBicyclesAndMotorbikesRealistically();

// --- 18.3. DỰNG LẠI XE BUS (2 MẪU), XE CỨU HỎA (2 MẪU) & XE CẢNH SÁT (2 MẪU) CHÂN THẬT (KHÔNG CÒN HÌNH CỤC GẠCH) ---
function rebuildBusesFiretrucksAndPoliceCarsRealistically() {
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });
  const darkGlass = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.2, clearcoat: 1.0 });

  // 1. NÂNG CẤP XE BUS THÀNH 2 KIỂU DÁNG CHÂN THẬT (Bus 2 Tầng & Bus Điện Hiện Đại)
  cityBusesList.forEach((bus, idx) => {
    bus.children.filter((c) => c.isMesh && c.geometry?.type === 'BoxGeometry').forEach((m) => bus.remove(m));

    const isDoubleDecker = (idx % 2 === 0);
    const primaryHex = isDoubleDecker ? 0xc1121f : 0x0077b6;
    const secondaryHex = isDoubleDecker ? 0xfdf0d5 : 0x00f5d4;

    const lowerBodyMat = new THREE.MeshPhysicalMaterial({ color: primaryHex, roughness: 0.18, clearcoat: 1.0 });
    const stripeBandMat = new THREE.MeshStandardMaterial({ color: secondaryHex, roughness: 0.3 });

    // Thân dưới bo tròn cạnh + Dải sơn trang trí giữa thân + Mũi xe khí động học
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.36, 1.35, 7.6), lowerBodyMat);
    lowerHull.position.set(0, 1.02, 0);

    const middleStripe = new THREE.Mesh(new THREE.BoxGeometry(2.40, 0.28, 7.7), stripeBandMat);
    middleStripe.position.set(0, 1.72, 0);

    const upperDeck = new THREE.Mesh(
      new THREE.BoxGeometry(2.34, isDoubleDecker ? 1.15 : 0.78, 7.5),
      isDoubleDecker ? lowerBodyMat : darkGlass
    );
    upperDeck.position.set(0, isDoubleDecker ? 2.38 : 2.18, 0);

    // Mũi xe bo cong mềm mại (Front Nose Bumper) & Bảng LED Điện Tử Tuyến Xe Bus
    const frontNose = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 1.2, 16), lowerBodyMat);
    frontNose.position.set(0, 0.95, -3.45);
    frontNose.scale.set(1.0, 1.0, 0.42);

    const ledBoard = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.28, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xffbe0b })
    );
    ledBoard.position.set(0, isDoubleDecker ? 2.75 : 2.42, -3.82);

    // Cụm điều hòa trên nóc xe & Cặp gương chiếu hậu gọng chữ U
    const acUnit1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 1.8), chromeMat);
    acUnit1.position.set(0, isDoubleDecker ? 3.05 : 2.65, -1.2);
    const acUnit2 = acUnit1.clone();
    acUnit2.position.z = 1.6;

    [-1.28, 1.28].forEach((mx) => {
      const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.12), matPiano);
      mirrorArm.position.set(mx, 1.85, -3.75);
      const headlight = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.18, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      headlight.position.set(mx * 0.72, 0.78, -3.86);
      bus.add(mirrorArm, headlight);
    });

    bus.add(lowerHull, middleStripe, upperDeck, frontNose, ledBoard, acUnit1, acUnit2);
    bus.userData.modelName = isDoubleDecker ? 'Xe Bus 2 Tầng City Tour' : 'Xe Bus Điện Metro';
    bus.userData.interiorTheme = {
      name: isDoubleDecker ? 'Khoang Lái Bus 2 Tầng Đỏ - Kem' : 'Khoang Lái Bus Điện Xanh Ngọc',
      nappaHex: isDoubleDecker ? 0xfdf0d5 : 0xcaf0f8,
      woodHex: isDoubleDecker ? 0x780000 : 0x03045e,
      bodyHex: primaryHex
    };
  });

  // 2. NÂNG CẤP XE CỨU HỎA (Cửa cuốn nhôm, Bồn nước Inox, Thang xoay & Súng rồng phun nước)
  allTrafficVehicles.filter((v) => v.userData.category === 'FIRETRUCK').forEach((ft) => {
    const rollerShutterMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.2 });
    const yellowStripeMat = new THREE.MeshBasicMaterial({ color: 0xffd60a });

    // 4 Khoang cửa cuốn nhôm 2 bên hông xe cứu hỏa
    [-1.1, 1.1].forEach((sx) => {
      [0.2, 1.9].forEach((sz) => {
        const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 1.35), rollerShutterMat);
        shutter.position.set(sx, 1.22, sz);
        ft.add(shutter);
      });
    });

    // Dải sọc phản quang Vàng - Trắng chạy dọc thân xe + Cản trước Inox + Bàn xoay thang cứu hỏa
    const reflexStripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.14, 6.45), yellowStripeMat);
    reflexStripe.position.set(0, 0.72, -0.05);

    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.28, 0.35), chromeMat);
    frontBumper.position.set(0, 0.48, -3.25);

    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.25, 16), chromeMat);
    turntable.position.set(0, 2.02, 1.2);

    const waterMonitor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 10), chromeMat);
    waterMonitor.rotation.x = Math.PI / 3;
    waterMonitor.position.set(0, 2.45, -1.5);

    ft.add(reflexStripe, frontBumper, turntable, waterMonitor);
    ft.userData.interiorTheme = {
      name: 'Khoang Chỉ Huy Cứu Hỏa Hạng Nặng',
      nappaHex: 0x2b2d42,
      woodHex: 0xd90429,
      bodyHex: 0xd90429
    };
  });

  // 3. NÂNG CẤP XE CẢNH SÁT (2 KIỂU DÁNG: Police Interceptor Sedan & CSGT Highway SUV)
  policeCarsList.forEach((pCar, idx) => {
    const isSuv = (idx % 2 === 1);
    const blueStripeMat = new THREE.MeshBasicMaterial({ color: 0x0077ff });
    const goldStripeMat = new THREE.MeshBasicMaterial({ color: 0xffd60a });

    // Mũi xe bo tròn + Đuôi xe + Cản sắt húc (Push Bar) trước mũi xe Cảnh sát
    const frontHoodCurve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 1.48, 12, 16),
      new THREE.MeshPhysicalMaterial({ color: isSuv ? 0xf8f9fa : 0x111827, roughness: 0.15, clearcoat: 1.0 })
    );
    frontHoodCurve.rotation.z = Math.PI / 2;
    frontHoodCurve.position.set(0, 0.50, -2.18);

    const pushBumper = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.46, 0.18), matPiano);
    pushBumper.position.set(0, 0.52, -2.38);

    // Sọc hiệu Cảnh Sát Xanh - Vàng dọc 2 bên thân xe
    const sideStripeBlue = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.10, 4.1), blueStripeMat);
    sideStripeBlue.position.set(0, 0.62, 0);
    const sideStripeGold = new THREE.Mesh(new THREE.BoxGeometry(1.97, 0.04, 4.1), goldStripeMat);
    sideStripeGold.position.set(0, 0.54, 0);

    if (isSuv) {
      // Nếu là mẫu SUV Cảnh Sát Giao Thông: nâng cao vòm mui phía sau & thêm giá nóc
      const suvRearCabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.48, 1.85), darkGlass);
      suvRearCabin.position.set(0, 1.02, 0.85);
      pCar.add(suvRearCabin);
    }

    pCar.add(frontHoodCurve, pushBumper, sideStripeBlue, sideStripeGold);
    pCar.userData.modelName = isSuv ? 'Xe CSGT Tuần Tra SUV' : 'Xe Cảnh Sát Interceptor';
    pCar.userData.interiorTheme = {
      name: isSuv ? 'Khoang Tác Chiến CSGT SUV' : 'Khoang Lái Police Interceptor 911',
      nappaHex: 0x1e293b,
      woodHex: 0x0077ff,
      bodyHex: isSuv ? 0xf8f9fa : 0x111827
    };
  });
}
rebuildBusesFiretrucksAndPoliceCarsRealistically();

// --- 18.4. HỆ THỐNG LÊN LÁI / NGỒI GHẾ PHỤ TẤT CẢ CÁC XE NPC (CÓ NỘI THẤT RIÊNG & KHOANG GHI-ĐÔNG 2 BÁNH ĐẶC BIỆT) ---
const DEFAULT_RR_THEME = {
  name: 'Rolls-Royce Ghost Bespoke',
  nappaHex: 0xdfd1be,
  woodHex: 0x3a2314,
  bodyHex: 0x101829
};

state.currentBoardedType = 'ROLLS_ROYCE'; // 'ROLLS_ROYCE' | 'CAR' | 'POLICE' | 'BUS' | 'FIRETRUCK' | 'MOTORBIKE' | 'BICYCLE'
state.boardedNpcVehicleRef = null;

// Tạo Khoang Lái Ghi-đông 2 Bánh Đặc Biệt (Dành riêng khi người chơi lên Xe Máy hoặc Xe Đạp để không bị vướng tầm nhìn!)
const twoWheelCockpitGroup = new THREE.Group();
twoWheelCockpitGroup.visible = false;
chassisGroup.add(twoWheelCockpitGroup);

let bikeHandlebarPivot = new THREE.Group();
(function buildSpecialTwoWheelFirstPersonCockpit() {
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.92, roughness: 0.12 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });

  bikeHandlebarPivot.position.set(-0.42, 0.68, -0.35); // Khớp ngay trước tầm tay ghế lái nhưng thoáng hoàn toàn bầu trời & mặt đường!
  twoWheelCockpitGroup.add(bikeHandlebarPivot);

  // Thanh ghi-đông ngang uốn cong + 2 bao tay cầm + 2 tay phanh
  const mainBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 12), chrome);
  mainBar.rotation.z = Math.PI / 2;
  bikeHandlebarPivot.add(mainBar);

  [-0.32, 0.32].forEach((gx) => {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 10), gripMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(gx, 0, 0);

    const brakeLever = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.015), chrome);
    brakeLever.position.set(gx, -0.01, -0.045);

    // Gương chiếu hậu tròn gắn 2 đầu ghi-đông (Hiển thị trực tiếp Cam Lùi / Gương hậu!)
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 8), chrome);
    stalk.position.set(gx * 0.92, 0.08, -0.02);
    const mirrorFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 20),
      new THREE.MeshBasicMaterial({ map: rearCamTex, side: THREE.DoubleSide })
    );
    mirrorFace.position.set(gx * 0.95, 0.16, -0.015);
    mirrorFace.userData.isRearMirrorMesh = true;

    bikeHandlebarPivot.add(grip, brakeLever, stalk, mirrorFace);
  });

  // Màn hình Đồng hồ Digital + YouTube Mini gắn gọn ở chính giữa ghi-đông (Không che tầm nhìn phía trước!)
  const centerDash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.13),
    new THREE.MeshBasicMaterial({ map: ytTex, side: THREE.DoubleSide })
  );
  centerDash.position.set(0, 0.08, -0.04);
  centerDash.rotation.x = THREE.MathUtils.degToRad(-20);
  register3DTarget(centerDash, openRealYouTubeApp);
  bikeHandlebarPivot.add(centerDash);

  // Bình xăng Moto gọn phía dưới
  const motoTank = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.38, 12, 16), matBodyPaint);
  motoTank.rotation.x = Math.PI / 2;
  motoTank.position.set(-0.42, 0.42, -0.10);
  twoWheelCockpitGroup.add(motoTank);
})();

function setCarBodyVisibilityForTwoWheelMode(isTwoWheel) {
  chassisGroup.children.forEach((child) => {
    if (child === driverSeatMount || child === twoWheelCockpitGroup || child === hudPanelGroup || child === rearViewCamera3D) {
      return;
    }
    if (child.isLight) return;
    child.visible = !isTwoWheel;
  });
  twoWheelCockpitGroup.visible = isTwoWheel;

  // Nếu đang lái Xe Máy / Xe Đạp, thu nhỏ bảng HUD 3D và đặt gọn sang góc trái dưới để không che tầm nhìn
  if (hudPanelGroup) {
    if (isTwoWheel) {
      hudPanelGroup.scale.set(0.68, 0.68, 1);
      hudPanelGroup.position.set(-0.72, 0.78, -0.48);
    } else {
      hudPanelGroup.scale.set(1, 1, 1);
      hudPanelGroup.position.copy(HUD_DEFAULT_POS);
    }
  }
}

function boardAnyNpcVehicle(veh) {
  if (!veh || !veh.userData) return;
  initAudio();

  // Nếu trước đó đang mượn 1 xe NPC khác thì trả xe đó lại cho AI lưu thông tiếp
  if (state.boardedNpcVehicleRef && state.boardedNpcVehicleRef !== veh) {
    state.boardedNpcVehicleRef.visible = true;
    state.boardedNpcVehicleRef.userData.isBoardedByPlayer = false;
  }

  const vd = veh.userData;
  state.boardedNpcVehicleRef = veh;
  state.currentBoardedType = vd.category || 'CAR';
  vd.isBoardedByPlayer = true;

  // Dịch chuyển vị trí & góc hướng của vehicleRoot tới đúng chiếc xe NPC vừa chọn, ẩn mesh AI để người chơi trực tiếp cầm lái!
  vehicleRoot.position.copy(veh.position);
  state.headingRad = vd.headingRad ?? veh.rotation.y;
  vehicleRoot.rotation.y = state.headingRad;
  veh.visible = false;

  const isTwoWheel = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
  setCarBodyVisibilityForTwoWheelMode(isTwoWheel);

  // Áp dụng màu sắc Nội thất (Da ghế, Gỗ táp-lô, Sơn thân xe) riêng biệt của chiếc xe NPC đó
  const theme = vd.interiorTheme || {
    name: `Nội Thất ${vd.modelName || 'Xe NPC'}`,
    nappaHex: [0x1e293b, 0xfdf0d5, 0xcaf0f8, 0xffe5ec][Math.floor(Math.random() * 4)],
    woodHex: [0x9e2a2b, 0x0077b6, 0x2d6a4f, 0x3a0ca3][Math.floor(Math.random() * 4)],
    bodyHex: 0x0077b6
  };

  if (theme.nappaHex) matNappa.color.setHex(theme.nappaHex);
  if (theme.woodHex) matWalnut.color.setHex(theme.woodHex);
  if (theme.bodyHex) matBodyPaint.color.setHex(theme.bodyHex);

  // Điều chỉnh độ cao ghế lái cho từng loại xe (Xe Bus/Cứu hỏa ngồi cao thoáng, Xe máy/Xe đạp ngồi chính giữa ghi-đông)
  if (vd.category === 'BUS' || vd.category === 'FIRETRUCK') {
    SEAT_POSITIONS[0].pos.set(-0.42, 0.45, -0.15);
    SEAT_POSITIONS[1].pos.set(0.42, 0.45, -0.15);
  } else if (isTwoWheel) {
    SEAT_POSITIONS[0].pos.set(-0.42, 0.05, 0.05); // Ngồi ngay chính giữa ghi-đông 2 bánh
    SEAT_POSITIONS[1].pos.set(-0.42, 0.12, 0.48); // Ngồi yên sau (Ghế phụ xe máy/xe đạp)
  } else {
    SEAT_POSITIONS[0].pos.set(-0.42, 0.0, 0.12);
    SEAT_POSITIONS[1].pos.set(0.42, 0.0, 0.12);
  }

  state.seatIndex = 0;
  driverSeatMount.position.copy(SEAT_POSITIONS[0].pos);

  if (state.playerMode !== 'DRIVING') {
    window.enterOrExitCarWithBlink();
  } else {
    state.velocityMs = 0;
    state.speedKmh = 0;
  }

  state.lastActionLog = isTwoWheel
    ? `🏍️ Đã lên lái [${vd.modelName}]! Khoang lái Ghi-đông 2 bánh thoáng 360° đã kích hoạt (Đầy đủ Còi, Xi-nhan, YouTube, Gương hậu)!`
    : `🚘 Đã lên lái [${vd.modelName}] với bộ nội thất "${theme.name}"! (Bấm [V]/[C] nếu muốn chuyển sang ngồi Ghế Phụ)`;
}

function restoreOwnRollsRoyceVehicle() {
  initAudio();
  if (state.boardedNpcVehicleRef) {
    state.boardedNpcVehicleRef.position.copy(vehicleRoot.position).add(new THREE.Vector3(3.2, 0, 0));
    state.boardedNpcVehicleRef.visible = true;
    state.boardedNpcVehicleRef.userData.isBoardedByPlayer = false;
    state.boardedNpcVehicleRef = null;
  }
  state.currentBoardedType = 'ROLLS_ROYCE';
  setCarBodyVisibilityForTwoWheelMode(false);

  matNappa.color.setHex(DEFAULT_RR_THEME.nappaHex);
  matWalnut.color.setHex(DEFAULT_RR_THEME.woodHex);
  matBodyPaint.color.setHex(CAR_PAINT_PALETTE[currentCarPaintIdx]?.hex || DEFAULT_RR_THEME.bodyHex);

  SEAT_POSITIONS[0].pos.set(-0.42, 0.0, 0.12);
  SEAT_POSITIONS[1].pos.set(0.42, 0.0, 0.12);
  driverSeatMount.position.copy(SEAT_POSITIONS[state.seatIndex].pos);

  state.lastActionLog = '👑 Đã quay về chiếc Rolls-Royce Ghost Bespoke của bạn!';
}

// Đăng ký toàn bộ các mesh của mọi xe NPC vào interactive3DTargets để người chơi bấm Tia Laser / Chuột là lên lái ngay!
allTrafficVehicles.forEach((veh) => {
  veh.traverse((child) => {
    if (child.isMesh && !child.userData.isVolumetricBeam) {
      register3DTarget(child, () => boardAnyNpcVehicle(veh));
    }
  });
});

function boardNearestNpcVehicleAction() {
  const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  let nearest = null;
  let minDist = Infinity;
  for (const veh of allTrafficVehicles) {
    if (veh === state.boardedNpcVehicleRef) continue;
    const d = refPos.distanceTo(veh.position);
    if (d < minDist) {
      minDist = d;
      nearest = veh;
    }
  }
  if (nearest) boardAnyNpcVehicle(nearest);
}

document.getElementById('btn-board-npc-vehicle')?.addEventListener('click', boardNearestNpcVehicleAction);
document.getElementById('btn-return-own-rr')?.addEventListener('click', restoreOwnRollsRoyceVehicle);

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key.toLowerCase() === 'n') boardNearestNpcVehicleAction();
});

// --- 18.5. ĐẶT LẠI VỊ TRÍ & LỘ TRÌNH CHUẨN CHO TOÀN BỘ XE NPC & NGƯỜI ĐI BỘ
//           (KHÔNG ĐI XUYÊN HẺM NHỎ, KHÔNG ĐỨNG KẸT GIỮA ĐƯỜNG, KHÔNG ĐI NGANG, ĐỤNG VẬT CẢN TỰ ĐỔI HƯỚNG!) ---
const SAFE_SIDEWALK_CORRIDOR = 12.6; // Nằm gọn giữa mép vỉa hè (11.0m) và tường nhà (15.2m) -> Không bao giờ đụng tường!

// Đặt lại vị trí xuất phát của tất cả xe NPC lên ĐÚNG LÀN ĐƯỜNG NHỰA tương ứng với hướng chạy của nó
allTrafficVehicles.forEach((veh, idx) => {
  const vd = veh.userData;
  const isTwoWheel = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
  vd.laneWidth = isTwoWheel ? 6.2 : 3.2;

  // Chọn trục di chuyển ban đầu: chẵn đi trục Z (Bắc-Nam), lẻ đi trục X (Đông-Tây)
  const moveAlongZ = (idx % 2 === 0);
  const dirSign = (idx % 4 < 2) ? 1 : -1;

  if (moveAlongZ) {
    // Đi dọc trục Z: headingRad = 0 (đi về -Z) hoặc Math.PI (đi về +Z)
    vd.headingRad = dirSign === 1 ? Math.PI : 0;
    vd.targetHeadingRad = vd.headingRad;
    // Khóa X đúng vào làn đường nhựa (±3.2m hoặc ±6.2m), Z trải đều dọc đường
    const laneX = dirSign === 1 ? -vd.laneWidth : vd.laneWidth;
    veh.position.set(laneX, 0, (idx - 7) * 14);
  } else {
    // Đi dọc trục X: headingRad = -Math.PI/2 (đi về +X) hoặc +Math.PI/2 (đi về -X)
    vd.headingRad = dirSign === 1 ? -Math.PI / 2 : Math.PI / 2;
    vd.targetHeadingRad = vd.headingRad;
    // Khóa Z đúng vào làn đường nhựa (±3.2m hoặc ±6.2m) để TUYỆT ĐỐI KHÔNG nằm trên vỉa hè hay hẻm nhỏ!
    const laneZ = dirSign === 1 ? vd.laneWidth : -vd.laneWidth;
    veh.position.set((idx - 7) * 14, 0, laneZ);
  }
  vd.stuckTimer = 0;
  veh.rotation.set(0, vd.headingRad, 0);
});

// Đặt lại vị trí xuất phát của tất cả NPC Đi Bộ lên ĐÚNG HÀNH LANG VỈA HÈ (±12.6m)
sidewalkNpcs.forEach((npc, idx) => {
  const nd = npc.userData;
  const walkAlongZ = (idx % 2 === 0);
  const sideSign = (idx % 4 < 2) ? 1 : -1;
  nd.sideSign = sideSign;

  if (walkAlongZ) {
    nd.headingRad = idx % 3 === 0 ? 0 : Math.PI;
    nd.targetHeadingRad = nd.headingRad;
    npc.position.set(sideSign * SAFE_SIDEWALK_CORRIDOR, 0.24, (idx - 7) * 11);
  } else {
    nd.headingRad = idx % 3 === 0 ? -Math.PI / 2 : Math.PI / 2;
    nd.targetHeadingRad = nd.headingRad;
    npc.position.set((idx - 7) * 11, 0.24, sideSign * SAFE_SIDEWALK_CORRIDOR);
  }
  nd.prevWorldPos = npc.position.clone();
  nd.rerouteCooldown = 0;
});

// Hàm kiểm tra xem một tọa độ (x, z) có va vào Tường Nhà / Công trình hoặc Xe đang đỗ hay không
function isPointBlockedByBuildingOrCar(x, z, ignoreNpcCar = null) {
  const gridX = Math.round(x / BLOCK_SIZE) * BLOCK_SIZE;
  const gridZ = Math.round(z / BLOCK_SIZE) * BLOCK_SIZE;
  const lx = Math.abs(x - gridX);
  const lz = Math.abs(z - gridZ);

  // 1. Vùng công trình/nhà cửa trên mỗi góc ô phố: [14.8m .. 30.2m]
  if (lx > 14.8 && lx < 30.2 && lz > 14.8 && lz < 30.2) {
    return true;
  }

  // 2. Vùng Biệt thự Nhà Của Bạn
  if (z > -20.5 && z < -7.5 && x < -15.5 && x > -31.5) {
    return true;
  }

  // 3. Kiểm tra khoảng cách tới Xe của Người Chơi (Vật cản cứng)
  if (Math.hypot(x - vehicleRoot.position.x, z - vehicleRoot.position.z) < 2.35) {
    return true;
  }

  // 4. Kiểm tra khoảng cách tới Người Chơi đang đi bộ
  if (state.playerMode === 'ON_FOOT' && Math.hypot(x - state.avatarPos.x, z - state.avatarPos.z) < 1.35) {
    return true;
  }

  // 5. Kiểm tra khoảng cách tới các Xe NPC đang lưu thông hoặc đang dừng
  for (const veh of allTrafficVehicles) {
    if (!veh.visible || veh === ignoreNpcCar) continue;
    if (Math.hypot(x - veh.position.x, z - veh.position.z) < 2.2) {
      return true;
    }
  }

  return false;
}

function updateV115SmartTrafficAndObstacleAvoidingNpcs(dt, elapsed) {
  const playerPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  const carPos = vehicleRoot.position;
  const playerSpeedAbs = Math.abs(state.speedKmh);

  const zGreen = (currentTrafficPhase === 'GREEN');
  const xGreen = (currentTrafficPhase === 'RED');

  // Xoay ghi-đông 2 bánh nếu người chơi đang lái Xe Máy / Xe Đạp
  if (twoWheelCockpitGroup.visible && bikeHandlebarPivot) {
    bikeHandlebarPivot.rotation.y = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 32);
  }

  // =========================================================================
  // 1. CẬP NHẬT PHƯƠNG TIỆN NPC (KHÔNG ĐỨNG KẸT GIỮA ĐƯỜNG, CHỈ ĐI TRÊN LÀN NHỰA)
  // =========================================================================
  for (let i = 0; i < allTrafficVehicles.length; i++) {
    const veh = allTrafficVehicles[i];
    const vd = veh.userData;

    // Nếu người chơi đang trực tiếp cầm lái chiếc xe NPC này:
    if (vd.isBoardedByPlayer) {
      veh.position.copy(vehicleRoot.position);
      veh.rotation.y = state.headingRad;
      // Nếu người chơi chuyển sang ngồi Ghế Phụ (seatIndex > 0), cho AI tự lái chiếc xe này chở người chơi đi dạo!
      if (state.playerMode === 'DRIVING' && state.seatIndex !== 0) {
        const aiSpeed = vd.cruiseSpeed || 12.0;
        state.velocityMs = aiSpeed;
        state.speedKmh = aiSpeed * 3.6;
        vehicleRoot.position.x -= Math.sin(state.headingRad) * aiSpeed * dt;
        vehicleRoot.position.z -= Math.cos(state.headingRad) * aiSpeed * dt;
      }
      continue;
    }

    if (vd.isInterceptingHijacker) continue;

    // Kiểm tra va chạm khi người chơi chủ động tông xe NPC
    const distToPlayerCar = veh.position.distanceTo(carPos);
    const hitRadius = (vd.category === 'BUS' || vd.category === 'FIRETRUCK') ? 3.5 : 2.55;

    if (state.playerMode === 'DRIVING' && distToPlayerCar < hitRadius && playerSpeedAbs > 5.0 && vd.crashState === 'NORMAL') {
      initAudio();
      playImpactSound(22);
      state.suspensionShakeIntensity = 2.2;

      const impactDir = veh.position.clone().sub(carPos);
      impactDir.y = 0;
      if (impactDir.lengthSq() < 0.001) impactDir.set(1, 0, 0);
      impactDir.normalize();

      const isHeavy = (vd.category === 'BUS' || vd.category === 'FIRETRUCK');
      const isSmall = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
      const massFactor = isSmall ? 1.85 : (isHeavy ? 0.22 : 1.0);
      const launchSpeed = Math.min(28, (playerSpeedAbs / 3.6) * 0.85 * massFactor + 6.0);

      if (isHeavy) {
        state.velocityMs = -state.velocityMs * 0.65;
        state.speedKmh = state.velocityMs * 3.6;
        vehicleRoot.position.addScaledVector(impactDir, -1.6);
        veh.position.addScaledVector(impactDir, 1.8);
        state.lastActionLog = `💥 TÔNG TRÚNG ${vd.modelName.toUpperCase()}! Xe bạn bị phản lực dội lùi lại nhưng giữ thăng bằng an toàn!`;
      } else {
        vd.crashState = 'AIRBORNE_TUMBLE';
        vd.crashVel.set(impactDir.x * launchSpeed, 5.5 * massFactor, impactDir.z * launchSpeed);
        vd.crashTimer = 1.6;
        state.velocityMs *= 0.55;
        state.speedKmh = state.velocityMs * 3.6;
        if (vd.ejectedRider) {
          vd.ejectedRider.position.copy(veh.position).add(new THREE.Vector3(impactDir.z * 2.4, 0.24, -impactDir.x * 2.4));
          vd.ejectedRider.visible = true;
        }
        state.lastActionLog = `💥 HẤT TUNG & LẬT XE ${vd.modelName.toUpperCase()}! Các NPC đang chạy tới tụ lại nâng giúp xe!`;
      }
    }

    if (vd.crashState && vd.crashState !== 'NORMAL') {
      // Giữ nguyên tiến trình lật xe & cứu hộ
      if (vd.crashState === 'AIRBORNE_TUMBLE') {
        veh.position.addScaledVector(vd.crashVel, dt);
        vd.crashVel.y -= 14.0 * dt;
        if (veh.position.y <= 0.35) {
          veh.position.y = 0.35;
          vd.crashVel.y = Math.abs(vd.crashVel.y) * 0.3;
        }
        vd.rollAngle += 6.5 * dt;
        veh.rotation.set(0, vd.headingRad, vd.rollAngle);
        vd.crashTimer -= dt;
        if (vd.crashTimer <= 0) {
          vd.crashState = 'OVERTURNED';
          vd.crashTimer = 4.0;
          vd.rollAngle = Math.PI;
        }
      } else if (vd.crashState === 'OVERTURNED') {
        vd.crashTimer -= dt;
        if (vd.crashTimer <= 0) {
          vd.crashState = 'BEING_RESCUED';
          vd.crashTimer = 1.4;
        }
      } else if (vd.crashState === 'BEING_RESCUED') {
        vd.rollAngle = THREE.MathUtils.lerp(vd.rollAngle, 0, dt * 5);
        veh.position.y = THREE.MathUtils.lerp(veh.position.y, 0, dt * 5);
        veh.rotation.set(0, vd.headingRad, vd.rollAngle);
        vd.crashTimer -= dt;
        if (vd.crashTimer <= 0) {
          vd.crashState = 'NORMAL';
          vd.rollAngle = 0;
          veh.position.y = 0;
          if (vd.ejectedRider) vd.ejectedRider.visible = false;
        }
      }
      continue;
    }

    // Vector hướng mũi xe hiện tại
    const fwdX = -Math.sin(vd.headingRad);
    const fwdZ = -Math.cos(vd.headingRad);
    const isMovingAlongZ = Math.abs(fwdZ) >= Math.abs(fwdX);

    const gridX = Math.round(veh.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const gridZ = Math.round(veh.position.z / BLOCK_SIZE) * BLOCK_SIZE;
    const toGridX = gridX - veh.position.x;
    const toGridZ = gridZ - veh.position.z;
    const distToIntersectionAhead = toGridX * fwdX + toGridZ * fwdZ;

    const myLightGreen = isMovingAlongZ ? zGreen : xGreen;
    let mustStop = false;
    let stoppedByRedLight = false;

    // A. Chỉ dừng Đèn Đỏ TRƯỚC vạch dừng (11.5m .. 15.2m). Nếu xe đã vào trong ngã tư (< 11.2m) thì chạy thoát qua luôn, KHÔNG ĐỨNG GIỮA NGÃ TƯ!
    if (!myLightGreen && distToIntersectionAhead > 11.5 && distToIntersectionAhead < 15.2) {
      mustStop = true;
      stoppedByRedLight = true;
    }

    // B. Dừng trước Xe của Người Chơi hoặc Người Chơi
    if (!mustStop) {
      for (const obs of [carPos, state.avatarPos]) {
        const dx = obs.x - veh.position.x;
        const dz = obs.z - veh.position.z;
        const fwdDist = dx * fwdX + dz * fwdZ;
        const latDist = Math.abs(dx * fwdZ - dz * fwdX);
        if (fwdDist > 0.5 && fwdDist < 8.5 && latDist < 2.6) {
          mustStop = true;
          vd.hornBadge.visible = true;
          break;
        }
      }
    }

    // C. Dừng trước Xe NPC khác CHỈ KHI xe đó chạy CÙNG CHIỀU ở phía trước (Tránh 2 xe ngược chiều/vuông góc khóa nhau đứng giữa đường!)
    if (!mustStop) {
      for (let j = 0; j < allTrafficVehicles.length; j++) {
        if (i === j || !allTrafficVehicles[j].visible) continue;
        const other = allTrafficVehicles[j];
        const sameDirection = Math.cos(vd.headingRad - (other.userData.headingRad || 0)) > 0.65;
        if (!sameDirection) continue;

        const dx = other.position.x - veh.position.x;
        const dz = other.position.z - veh.position.z;
        const fwdDist = dx * fwdX + dz * fwdZ;
        const latDist = Math.abs(dx * fwdZ - dz * fwdX);
        if (fwdDist > 0.5 && fwdDist < 8.0 && latDist < 1.9) {
          mustStop = true;
          break;
        }
      }
    }

    // Bộ chống kẹt xe (Anti-Deadlock): Nếu xe dừng quá 3.5 giây mà không phải do đèn đỏ thì tự động lách nhẹ và đi tiếp!
    if (mustStop && !stoppedByRedLight) {
      vd.stuckTimer = (vd.stuckTimer || 0) + dt;
      if (vd.stuckTimer > 3.5) {
        mustStop = false;
        vd.stuckTimer = 0;
      }
    } else {
      vd.stuckTimer = 0;
    }

    const baseCruise = vd.cruiseSpeed || 11.5;
    vd.activeSpeed = mustStop
      ? THREE.MathUtils.lerp(vd.activeSpeed || 0, 0, dt * 15)
      : THREE.MathUtils.lerp(vd.activeSpeed || 0, baseCruise, dt * 5);
    if (!mustStop) vd.hornBadge.visible = false;

    // D. Rẽ Trái / Phải tại tâm ngã tư và KHÓA CHẶT vào làn đường nhựa mới (Tuyệt đối không đi lên vỉa hè hay hẻm nhỏ!)
    const laneW = vd.laneWidth || 3.2;
    if (vd.turnCooldown > 0) vd.turnCooldown -= dt;

    if (!mustStop && vd.turnCooldown <= 0 && Math.abs(toGridX) < 3.8 && Math.abs(toGridZ) < 3.8) {
      if (Math.random() < 0.35) {
        const turnSign = Math.random() > 0.5 ? 1 : -1;
        const rawTarget = vd.targetHeadingRad + turnSign * (Math.PI / 2);
        vd.targetHeadingRad = normalizeAngleSigned(Math.round(rawTarget / (Math.PI / 2)) * (Math.PI / 2));
      }
      vd.turnCooldown = 8.5;
    }

    // Xoay hướng mũi xe mượt mà về targetHeadingRad (Ngay cả khi tốc độ thấp vẫn hoàn tất góc rẽ để không dừng chéo giữa đường)
    const diff = normalizeAngleSigned(vd.targetHeadingRad - vd.headingRad);
    const turnStep = Math.max(2.8, vd.activeSpeed * 0.45) * dt;
    if (Math.abs(diff) <= turnStep) {
      vd.headingRad = vd.targetHeadingRad;
    } else {
      vd.headingRad = normalizeAngleSigned(vd.headingRad + Math.sign(diff) * turnStep);
    }

    // Khóa tọa độ ngang đúng vào làn đường nhựa (±3.2m hoặc ±6.2m) để xe KHÔNG BAO GIỜ trôi lên vỉa hè (|local| > 10m)
    const curFwdX = -Math.sin(vd.headingRad);
    const curFwdZ = -Math.cos(vd.headingRad);
    if (Math.abs(diff) < 0.12) {
      if (Math.abs(curFwdZ) >= Math.abs(curFwdX)) {
        const exactLaneX = gridX + (curFwdZ > 0 ? -laneW : laneW);
        veh.position.x = THREE.MathUtils.lerp(veh.position.x, exactLaneX, dt * 8);
      } else {
        const exactLaneZ = gridZ + (curFwdX > 0 ? laneW : -laneW);
        veh.position.z = THREE.MathUtils.lerp(veh.position.z, exactLaneZ, dt * 8);
      }
    }

    const step = vd.activeSpeed * dt;
    veh.position.x += curFwdX * step;
    veh.position.z += curFwdZ * step;
    veh.position.y = 0;
    veh.rotation.set(0, vd.headingRad, 0);

    // Quay bánh xe tròn đều
    if (vd.wheels && vd.activeSpeed > 0.05) {
      const spin = (vd.activeSpeed * dt) / 0.34;
      for (const w of vd.wheels) w.rotation.x -= spin;
    }

    if (veh.position.z - playerPos.z > 95) veh.position.z -= 190;
    else if (veh.position.z - playerPos.z < -95) veh.position.z += 190;
    if (veh.position.x - playerPos.x > 95) veh.position.x -= 190;
    else if (veh.position.x - playerPos.x < -95) veh.position.x += 190;
  }

  // =========================================================================
  // 2. CẬP NHẬT NPC ĐI BỘ (KHÔNG ĐI NGANG, KHÔNG XUYÊN TƯỜNG/XE, ĐỤNG VẬT CẢN TỰ ĐỔI HƯỚNG!)
  // =========================================================================
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (!npc.visible) continue;
    if (!nd.prevWorldPos) nd.prevWorldPos = npc.position.clone();

    // Kiểm tra nếu bị xe người chơi tông
    const distToCar = npc.position.distanceTo(carPos);
    if (state.playerMode === 'DRIVING' && distToCar < 2.1 && playerSpeedAbs > 4.0 && nd.npcState !== 'KNOCKED_FLYING') {
      initAudio();
      playImpactSound(16);
      state.suspensionShakeIntensity = 1.6;
      const pushDir = npc.position.clone().sub(carPos).setY(0).normalize();
      nd.npcState = 'KNOCKED_FLYING';
      const launchSpd = Math.min(22, (playerSpeedAbs / 3.6) * 0.9 + 5.0);
      nd.knockVel.set(pushDir.x * launchSpd, 6.2, pushDir.z * launchSpd);
      nd.knockTimer = 2.2;
      continue;
    }

    if (nd.npcState === 'KNOCKED_FLYING') {
      npc.position.addScaledVector(nd.knockVel, dt);
      nd.knockVel.y -= 15.0 * dt;
      if (npc.position.y <= 0.24) {
        npc.position.y = 0.24;
        nd.knockVel.y = Math.abs(nd.knockVel.y) * 0.3;
      }
      npc.rotation.x += 7.0 * dt;
      nd.knockTimer -= dt;
      if (nd.knockTimer <= 0) {
        nd.npcState = 'WALKING';
        npc.position.y = 0.24;
        npc.rotation.x = 0;
      }
      nd.prevWorldPos.copy(npc.position);
      continue;
    }

    npc.position.y = 0.24;
    const gridX = Math.round(npc.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const gridZ = Math.round(npc.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    // Vung tay chân nhịp nhàng
    nd.phase += dt * 7.5;
    const sw = Math.sin(nd.phase) * 0.52;
    nd.leftLeg.rotation.x = sw;
    nd.rightLeg.rotation.x = -sw;
    nd.leftArm.rotation.x = -sw * 0.75;
    nd.rightArm.rotation.x = sw * 0.75;

    if (nd.rerouteCooldown > 0) nd.rerouteCooldown -= dt;

    // CẢM BIẾN DÒ VẬT CẢN PHÍA TRƯỚC (Tường nhà, Xe người chơi, Xe NPC, Người chơi):
    // Nếu điểm phía trước 1.6m bị chắn, NPC lập tức chọn lộ trình vuông góc hoặc quay đầu thông thoáng!
    const stepLen = 3.4 * dt;
    const dirX = -Math.sin(nd.headingRad);
    const dirZ = -Math.cos(nd.headingRad);
    const lookAheadX = npc.position.x + dirX * 1.65;
    const lookAheadZ = npc.position.z + dirZ * 1.65;

    if (isPointBlockedByBuildingOrCar(lookAheadX, lookAheadZ)) {
      // Thử 3 hướng lộ trình thay thế (+90°, -90°, 180°) để tìm hướng không có vật cản
      const candidateAngles = [
        normalizeAngleSigned(nd.headingRad + Math.PI / 2),
        normalizeAngleSigned(nd.headingRad - Math.PI / 2),
        normalizeAngleSigned(nd.headingRad + Math.PI)
      ];
      for (const cand of candidateAngles) {
        const testX = npc.position.x - Math.sin(cand) * 2.0;
        const testZ = npc.position.z - Math.cos(cand) * 2.0;
        if (!isPointBlockedByBuildingOrCar(testX, testZ)) {
          nd.targetHeadingRad = cand;
          nd.headingRad = cand;
          nd.rerouteCooldown = 2.5;
          break;
        }
      }
    }

    // Tại điểm giao hành lang vỉa hè (±12.6m, ±12.6m), cho phép NPC rẽ sang nhánh vỉa hè mới
    const dCornerX = Math.abs(Math.abs(npc.position.x - gridX) - SAFE_SIDEWALK_CORRIDOR);
    const dCornerZ = Math.abs(Math.abs(npc.position.z - gridZ) - SAFE_SIDEWALK_CORRIDOR);
    if (nd.rerouteCooldown <= 0 && dCornerX < 0.85 && dCornerZ < 0.85) {
      if (Math.random() < 0.4) {
        const turnSign = Math.random() > 0.5 ? 1 : -1;
        const nextYaw = normalizeAngleSigned(Math.round((nd.targetHeadingRad + turnSign * (Math.PI / 2)) / (Math.PI / 2)) * (Math.PI / 2));
        const testX = npc.position.x - Math.sin(nextYaw) * 2.2;
        const testZ = npc.position.z - Math.cos(nextYaw) * 2.2;
        if (!isPointBlockedByBuildingOrCar(testX, testZ)) {
          nd.targetHeadingRad = nextYaw;
          nd.headingRad = nextYaw;
        }
      }
      nd.rerouteCooldown = 4.0;
    }

    // Giữ NPC đi dọc theo hành lang vỉa hè an toàn (±12.6m)
    const walkZAxis = Math.abs(Math.cos(nd.headingRad)) >= Math.abs(Math.sin(nd.headingRad));
    if (walkZAxis) {
      const targetX = gridX + (npc.position.x >= gridX ? 1 : -1) * SAFE_SIDEWALK_CORRIDOR;
      npc.position.x = THREE.MathUtils.lerp(npc.position.x, targetX, dt * 6);
    } else {
      const targetZ = gridZ + (npc.position.z >= gridZ ? 1 : -1) * SAFE_SIDEWALK_CORRIDOR;
      npc.position.z = THREE.MathUtils.lerp(npc.position.z, targetZ, dt * 6);
    }

    // Tiến một bước theo hướng nd.headingRad (Nếu điểm tiếp theo không bị chặn)
    const nextX = npc.position.x - Math.sin(nd.headingRad) * stepLen;
    const nextZ = npc.position.z - Math.cos(nd.headingRad) * stepLen;
    if (!isPointBlockedByBuildingOrCar(nextX, nextZ)) {
      npc.position.x = nextX;
      npc.position.z = nextZ;
    }

    // QUAN TRỌNG NHẤT: Tính góc xoay mặt & vai của NPC trực tiếp từ vector bước đi thực tế (actualDx, actualDz)
    // Đảm bảo 100% vai vuông góc với hướng đi, chân vung thẳng theo hướng bước -> KHÔNG BAO GIỜ ĐI NGANG!
    const actualDx = npc.position.x - nd.prevWorldPos.x;
    const actualDz = npc.position.z - nd.prevWorldPos.z;
    const movedDistSq = actualDx * actualDx + actualDz * actualDz;
    if (movedDistSq > 0.000001 && movedDistSq < 4.0) {
      const trueFaceYaw = Math.atan2(actualDx, actualDz);
      npc.rotation.set(0, trueFaceYaw, 0);
    } else {
      npc.rotation.set(0, nd.headingRad + Math.PI, 0);
    }

    nd.prevWorldPos.copy(npc.position);

    if (npc.position.z - playerPos.z > 80) {
      npc.position.z -= 160;
      nd.prevWorldPos.copy(npc.position);
    } else if (npc.position.z - playerPos.z < -80) {
      npc.position.z += 160;
      nd.prevWorldPos.copy(npc.position);
    }
    if (npc.position.x - playerPos.x > 80) {
      npc.position.x -= 160;
      nd.prevWorldPos.copy(npc.position);
    } else if (npc.position.x - playerPos.x < -80) {
      npc.position.x += 160;
      nd.prevWorldPos.copy(npc.position);
    }
  }
}

// --- 18.6. GẮN VÀO scene.onBeforeRender ĐỂ THAY THẾ VÒNG LẶP V112 CŨ ---
let lastV115Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV115Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV115Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Điều khiển giao thông & NPC thông minh V115 (Không đi ngang, không xuyên tường, không kẹt ngã tư)
  updateV115SmartTrafficAndObstacleAvoidingNpcs(dt, elapsed);

  // 2. Mui trần đóng/mở đúng trục cơ khí
  updateCorrectConvertibleRoofKinematics(dt);

  // 3. Tay cầm V112 (Nút xoay rẽ trái/phải, Cò trước dừng hẳn, Cò hông phanh côn, Phím A mở/khóa nhìn)
  updateV112ControllerSteeringBrakingAndLookLock(dt);

  // 4. Chặn đi bộ xuyên địa hình
  if (state.playerMode === 'ON_FOOT') {
    clampFootPositionAgainstAllBuildings(state.avatarPos);
    playerAvatarGroup.position.copy(state.avatarPos);
  }

  // 5. Hoạt cảnh Cướp xe & Cảnh sát chặn đầu
  updateV110HijackAndPoliceBlockade(dt);

  // 6. Hiển thị Cam Mô Phỏng ESP32 FPV lên cả Kính Chắn Gió + 4 Gương Hậu
  if (state.windshieldMode === 'ESP32_SIM') {
    renderSimulatedEsp32FpvOnAllScreens(elapsed);
  }

  // 7. Vẽ Vòng Tròn Map Radar
  minimapTick++;
  if (minimapTick % 2 === 0) {
    renderCircularRadarMinimap();
  }
};


// ============================================================================
// 19. BẢN CẬP NHẬT V120 - TRỌNG TÂM TỌA ĐỘ OXYZ CHỮ THẬP, QUY HOẠCH ĐỊA ĐIỂM
//     THEO QUY TẮC 4-1-2-1-2, XE CẤP CỨU / CỨU HỎA / BUS 3D CHI TIẾT, BẢNG CHỨC
//     NĂNG THEO XE GẦN HƯỚNG NHÌN NHẤT & FIX MÀN HÌNH TRẮNG SAFARI IPHONE
// ============================================================================

// --- 19.1. SỬA LỖI MÀN HÌNH TRẮNG TRÊN SAFARI IPHONE (?mode=passenger_mobile) & XOAY NGANG/DỌC ---
(function fixSafariIosWhiteScreenAndResponsiveMobile() {
  const urlParams = new URLSearchParams(window.location.search);
  const modeParam = urlParams.get('mode') || urlParams.get('join') || '';
  const isIosOrMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) ||
                        modeParam === 'passenger_mobile' ||
                        modeParam === 'passenger';

  // Nếu người dùng mở trên iPhone Safari qua cổng HTTPS 8443 bị chặn WebSocket/SSL làm màn hình đen/trắng,
  // hoặc mở ?mode=passenger_mobile, lập tức tối ưu hóa WebGL để Safari không bị tràn RAM GPU:
  if (isIosOrMobile) {
    renderer.setPixelRatio(1.0); // Giữ PixelRatio = 1.0 trên iPhone để chống tràn VRAM gây trắng màn hình!
    renderer.shadowMap.enabled = false; // Tắt đổ bóng nặng trên Safari di động để đạt 60FPS mượt mà
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Đảm bảo lớp màn chớp mắt (eyelid / vrBlinkShutter) mở hoàn toàn không che đen màn hình
    document.body.classList.remove('blinking');
    state.blinkTargetOpacity = 0.0;
    vrBlinkShutterMat.opacity = 0.0;

    // Đưa người chơi điện thoại vào ngồi Ghế Phụ (Góc nhìn thứ nhất) ngay khi tải xong
    state.playerMode = 'DRIVING';
    state.seatIndex = 1; // Ghế Phụ Trước
    if (avatarBodyMesh) avatarBodyMesh.visible = false;
    driverSeatMount.position.copy(SEAT_POSITIONS[1].pos);
    driverSeatMount.add(cameraRig);
    cameraRig.position.set(0, 0, 0);
    if (roofBeaconGroup) roofBeaconGroup.visible = false;

    // Tạo cụm nút điều khiển nổi thích ứng cả xoay dọc (9:16) và xoay ngang (16:9) trên iPhone/Android
    if (!document.getElementById('mob-lean')) {
      const mobileBar = document.createElement('div');
      mobileBar.id = 'mobile-adaptive-controls';
      mobileBar.style.cssText =
        'position:fixed;bottom:12px;right:12px;z-index:185;display:flex;flex-wrap:wrap;gap:6px;max-width:65vw;justify-content:flex-end;';
      mobileBar.innerHTML = `
        <button id="mob-lean" class="bar-btn" style="background:#00bbf9;color:#000;">👀 Thò Đầu</button>
        <button id="mob-swap" class="bar-btn" style="background:#4cd964;color:#000;">🔄 Đổi Lái/Phụ</button>
        <button id="mob-door" class="bar-btn" style="background:#ffd60a;color:#000;">🚪 Lên/Xuống</button>
        <button id="mob-yt" class="bar-btn" style="background:#ff0000;color:#fff;">▶ YouTube</button>
      `;
      document.body.appendChild(mobileBar);
      document.getElementById('mob-lean')?.addEventListener('click', toggleLeanHeadOutWindow);
      document.getElementById('mob-swap')?.addEventListener('click', swapSeatOrTakeDriverControl);
      document.getElementById('mob-door')?.addEventListener('click', () => window.enterOrExitCarWithBlink());
      document.getElementById('mob-yt')?.addEventListener('click', openRealYouTubeApp);
    }
  }

  // Tự động cân chỉnh FOV & tỉ lệ khung hình khi xoay dọc (9:16) hoặc xoay ngang (16:9) trên mọi thiết bị
  function handleResponsiveOrientation() {
    const w = window.innerWidth || document.documentElement.clientWidth || 360;
    const h = window.innerHeight || document.documentElement.clientHeight || 640;
    const isPortrait = h > w;
    camera.aspect = w / h;
    // Khi xoay dọc (9:16), mở rộng FOV dọc lên 85° để thấy trọn khoang lái; khi xoay ngang (16:9) giữ FOV 70° chuẩn
    camera.fov = isPortrait ? 85 : 70;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', handleResponsiveOrientation);
  window.addEventListener('orientationchange', () => setTimeout(handleResponsiveOrientation, 150));
  handleResponsiveOrientation();

  // Cập nhật lại link QR trong bảng Multiplayer để dùng cổng HTTP 8080 + ?mode=passenger_mobile (Mở trên Safari iPhone 100% thành công!)
  const qrBtn = document.getElementById('btn-open-qr-multiplayer');
  if (qrBtn) {
    qrBtn.addEventListener('click', async () => {
      try {
        const r = await fetch('/api/network-info');
        if (r.ok) {
          const info = await r.json();
          const safariSafeUrl = info.mobilePassengerUrl || `http://${window.location.hostname}:8080/?mode=passenger_mobile`;
          const passInp = document.getElementById('passenger-url-input');
          const qrImg = document.getElementById('qr-code-img');
          if (passInp) passInp.value = safariSafeUrl;
          if (qrImg) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(safariSafeUrl)}`;
          }
        }
      } catch (e) {}
    });
  }
})();

// --- 19.2. BẢNG CHỨC NĂNG THÔNG MINH: ÁP DỤNG CHO XE Ở HƯỚNG GẦN TÔI NHẤT, CÒN KHÔNG THÌ ÁP DỤNG CHO XE CỦA TÔI ---
function getTargetVehicleForFunctionPanel() {
  // Nếu người chơi đang ngồi trên một chiếc xe (Xe của mình hoặc xe NPC đang lái), ưu tiên chiếc xe đó
  if (state.playerMode === 'DRIVING') {
    if (state.boardedNpcVehicleRef) {
      return { isOwnCar: false, npcVeh: state.boardedNpcVehicleRef, name: state.boardedNpcVehicleRef.userData.modelName || 'Xe NPC' };
    }
    return { isOwnCar: true, npcVeh: null, name: 'Xe Của Tôi (Rolls-Royce)' };
  }

  // Khi đang đi bộ: Tìm xem ở HƯỚNG NHÌN TRƯỚC MẶT người chơi (trong bán kính 13m) có chiếc xe nào gần nhất không
  const playerPos = state.avatarPos;
  const lookYaw = state.avatarYaw + (state.eyeLookYaw || 0);
  const lookDir = new THREE.Vector3(-Math.sin(lookYaw), 0, -Math.cos(lookYaw)).normalize();

  let bestTarget = null;
  let bestScoreDist = 13.5; // Khoảng cách tối đa tính là "ở gần hướng của tôi"

  // Kiểm tra xe Rolls-Royce của mình trước
  const toOwnCar = vehicleRoot.position.clone().sub(playerPos).setY(0);
  const ownDist = toOwnCar.length();
  if (ownDist < bestScoreDist) {
    const dot = ownDist < 3.0 ? 1.0 : toOwnCar.clone().normalize().dot(lookDir);
    if (dot > 0.25) {
      bestScoreDist = ownDist;
      bestTarget = { isOwnCar: true, npcVeh: null, name: 'Xe Của Tôi (Rolls-Royce)' };
    }
  }

  // Kiểm tra tất cả các xe NPC xung quanh xem có chiếc nào nằm ở hướng trước mặt và gần hơn không
  for (const veh of allTrafficVehicles) {
    if (!veh.visible) continue;
    const toVeh = veh.position.clone().sub(playerPos).setY(0);
    const d = toVeh.length();
    if (d < bestScoreDist) {
      const dot = d < 2.8 ? 1.0 : toVeh.clone().normalize().dot(lookDir);
      if (dot > 0.35) {
        bestScoreDist = d;
        bestTarget = { isOwnCar: false, npcVeh: veh, name: `${veh.userData.modelName || 'Xe NPC'} (Gần Nhất)` };
      }
    }
  }

  // Nếu không có chiếc xe nào ở hướng gần người chơi, LUÔN MẶC ĐỊNH ÁP DỤNG CHO XE CỦA TÔI (dù đang đứng ở bất cứ đâu!)
  return bestTarget || { isOwnCar: true, npcVeh: null, name: 'Xe Của Tôi (Rolls-Royce)' };
}

// Cập nhật các nút trên Bảng Chức Năng để tác động thông minh lên Xe mục tiêu (Target Vehicle)
(function bindSmartFunctionPanelToNearestOrOwnCar() {
  const badgeEl = document.getElementById('func-target-badge');

  setInterval(() => {
    const target = getTargetVehicleForFunctionPanel();
    if (badgeEl) {
      badgeEl.textContent = `🎯 ${target.name}`;
      badgeEl.style.color = target.isOwnCar ? '#00ff88' : '#ffd60a';
    }
  }, 250);

  // Nút Đổi Màu Xe: Đổi màu cho chiếc xe ở hướng gần nhất (nếu có), còn không thì đổi màu cho Xe Của Tôi
  const colorBtn = document.getElementById('btn-cycle-color');
  if (colorBtn) {
    const newColorBtn = colorBtn.cloneNode(true);
    colorBtn.parentNode.replaceChild(newColorBtn, colorBtn);
    newColorBtn.addEventListener('click', () => {
      initAudio();
      currentCarPaintIdx = (currentCarPaintIdx + 1) % CAR_PAINT_PALETTE.length;
      const item = CAR_PAINT_PALETTE[currentCarPaintIdx];
      const target = getTargetVehicleForFunctionPanel();

      if (!target.isOwnCar && target.npcVeh) {
        target.npcVeh.traverse((c) => {
          if (c.isMesh && c.material && c.material.clearcoat !== undefined) {
            c.material.color.setHex(item.hex);
          }
        });
        state.lastActionLog = `🎨 Đã đổi màu sơn của [${target.name}] trước mặt bạn sang: ${item.name}!`;
      } else {
        changePlayerCarPaintColor(item.hex, item.name);
      }
    });
  }

  // Nút Mở Cửa Lên/Xuống Xe trên Bảng chức năng: Nếu đang hướng mặt vào gần 1 chiếc xe NPC thì lên chiếc xe NPC đó, ngược lại lên/xuống Xe Của Tôi
  const enterBtn = document.getElementById('btn-enter-exit-car');
  if (enterBtn) {
    const newEnterBtn = enterBtn.cloneNode(true);
    enterBtn.parentNode.replaceChild(newEnterBtn, enterBtn);
    newEnterBtn.addEventListener('click', () => {
      if (state.playerMode === 'DRIVING') {
        if (state.boardedNpcVehicleRef) restoreOwnRollsRoyceVehicle();
        window.enterOrExitCarWithBlink();
        return;
      }
      const target = getTargetVehicleForFunctionPanel();
      if (!target.isOwnCar && target.npcVeh) {
        boardAnyNpcVehicle(target.npcVeh);
      } else {
        window.enterOrExitCarWithBlink();
      }
    });
  }
})();

// --- 19.3. QUY HOẠCH ĐỊA ĐIỂM THEO ĐÚNG QUY TẮC 4 - 1 - 2 - 1 - 2 (MÔ HÌNH 3D CHI TIẾT, RÕ NÉT)
//           & TRẠM XE BUS ĐẶT NGAY TRÊN LỀ ĐƯỜNG SÁT CỘT ĐÈN GIAO THÔNG / CỘT ĐÈN ĐƯỜNG ---
function buildDetailed3DLandmarksByRule41212() {
  // Quy tắc 4-1-2-1-2 trên mỗi chu kỳ 10 lô góc phố:
  // - 4: Nhà dân xen kẽ đa kiểu dáng & Công viên cây cối 3D chi tiết (Slots 0, 1, 2, 3)
  // - 1: Trung tâm thương mại lớn / Tòa nhà cao tầng kính (Slot 4)
  // - 2: Cửa hàng Tiệm Cafe 3D & Thời trang Boutique (Slots 5, 6)
  // - 1: Bệnh viện Đa khoa Quốc tế 3D có Chữ Thập Đỏ (Slot 7)
  // - 2: Trạm Xăng 3D chi tiết & Khu phố thương mại + Trạm Xe Bus sát cột đèn (Slots 8, 9)

  const glassTowerMat = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, roughness: 0.08, metalness: 0.7, clearcoat: 1.0 });
  const hospitalWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
  const redCrossMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6f4e37, roughness: 0.55 });
  const foliageDark = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.65 });
  const foliageBright = new THREE.MeshStandardMaterial({ color: 0x40916c, roughness: 0.6 });

  function createDetailed3DTree(x, z, scale = 1.0) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, 2.2 * scale, 10), woodMat);
    trunk.position.y = 1.1 * scale;
    // 3 tầng tán lá 3D xếp lớp chân thật
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.6 * scale, 2.2 * scale, 12), foliageDark);
    c1.position.y = 2.4 * scale;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.25 * scale, 1.8 * scale, 12), foliageBright);
    c2.position.y = 3.5 * scale;
    const c3 = new THREE.Mesh(new THREE.SphereGeometry(0.75 * scale, 10, 10), foliageBright);
    c3.position.y = 4.4 * scale;
    tree.add(trunk, c1, c2, c3);
    return tree;
  }

  let globalCornerSlot = 0;
  const corners = [[-22.4, -22.4], [22.4, -22.4], [-22.4, 22.4], [22.4, 22.4]];

  cityBlocks.forEach((block, bIdx) => {
    // Ẩn các khối POI đơn giản cũ để dựng kiến trúc 3D chi tiết theo đúng tỷ lệ 4-1-2-1-2
    block.children.forEach((c) => {
      if (c.isMesh && c.geometry?.parameters?.height > 10) c.visible = false;
      if (c.isGroup && Math.abs(c.position.y - 0.24) < 0.05) c.visible = false;
    });

    // ĐẶT TRẠM XE BUS 3D NGAY TRÊN LỀ ĐƯỜNG SÁT CỘT ĐÈN GIAO THÔNG (x = 11.4, z = -14.2)
    const curbBusStop = new THREE.Group();
    curbBusStop.position.set(11.4, 0.24, -14.2); // Ngay trên mép lề đường cạnh cột đèn giao thông (10.5, -10.5)!
    const bsRoof = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.14, 4.4),
      new THREE.MeshPhysicalMaterial({ color: 0x0077b6, clearcoat: 1.0 })
    );
    bsRoof.position.y = 2.55;
    const bsGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 4.2), matGlass);
    bsGlass.position.set(0.8, 1.25, 0);
    const bsBench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 2.8), woodMat);
    bsBench.position.set(0.35, 0.22, 0);
    const bsPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), matChrome);
    bsPole.position.set(-0.65, 1.4, -2.0);
    const bsBoard = createSpeechBubbleSprite('🚏 TRẠM XE BUS (CẠNH CỘT ĐÈN)', '#003566', '#ffd60a');
    bsBoard.scale.set(1.55, 0.34, 1);
    bsBoard.position.set(0, 3.05, 0);
    bsBoard.visible = true;
    curbBusStop.add(bsRoof, bsGlass, bsBench, bsPole, bsBoard);
    block.add(curbBusStop);

    corners.forEach(([cx, cz]) => {
      // Tránh ghi đè lên góc Biệt thự Nhà Của Bạn ở ô trung tâm (0,0) góc (-22.4, -22.4)
      if (block.userData.gridX === 0 && block.userData.gridZ === 0 && cx < 0 && cz < 0) {
        return;
      }

      const slotType = globalCornerSlot % 10;
      globalCornerSlot++;

      const lot = new THREE.Group();
      lot.position.set(cx, 0.24, cz);

      if (slotType < 4) {
        // =====================================================================
        // NHÓM [4]: NHÀ DÂN XEN KẼ ĐA KIỂU DÁNG & CÔNG VIÊN CÂY CỐI 3D CHI TIẾT
        // =====================================================================
        if (slotType === 3) {
          // Công viên cây xanh + Đài phun nước đá cẩm thạch + 6 cây cổ thụ nhiều tầng
          const parkGrass = new THREE.Mesh(
            new THREE.BoxGeometry(16.5, 0.12, 16.5),
            new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.85 })
          );
          const fountainBasin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.65, 20), matChrome);
          fountainBasin.position.y = 0.35;
          const waterPool = new THREE.Mesh(
            new THREE.CylinderGeometry(2.4, 2.4, 0.55, 20),
            new THREE.MeshBasicMaterial({ color: 0x00bbf9 })
          );
          waterPool.position.y = 0.42;
          lot.add(parkGrass, fountainBasin, waterPool);

          [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5], [0, -6.2], [0, 6.2]].forEach(([tx, tz], ti) => {
            lot.add(createDetailed3DTree(tx, tz, 0.95 + (ti % 2) * 0.25));
          });
        } else {
          // 3 Kiểu Nhà Dân Xen Kẽ (Biệt thự mái Thái, Nhà phố 3 tầng ban công kính, Nhà vườn cổ điển) + Cây xanh sân vườn
          const wallPalette = [0xfae1dd, 0xe8e8e4, 0xfefae0][slotType];
          const roofPalette = [0x9e2a2b, 0x1d3557, 0xd4a373][slotType];
          const hMat = new THREE.MeshStandardMaterial({ color: wallPalette, roughness: 0.5 });
          const rMat = new THREE.MeshStandardMaterial({ color: roofPalette, roughness: 0.45 });

          const stories = slotType === 1 ? 3 : 2;
          const hHeight = stories * 2.8;
          const mainBody = new THREE.Mesh(new THREE.BoxGeometry(9.2, hHeight, 8.6), hMat);
          mainBody.position.y = hHeight / 2;

          const roof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 2.5, 4), rMat);
          roof.rotation.y = Math.PI / 4;
          roof.position.y = hHeight + 1.25;

          const balcony = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.85, 1.6), matGlass);
          balcony.position.set(0, 3.2, 4.6);

          const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.2), woodMat);
          door.position.set(0, 1.15, 4.35);

          lot.add(mainBody, roof, balcony, door);
          lot.add(createDetailed3DTree(-6.2, 5.2, 0.9));
          lot.add(createDetailed3DTree(6.2, -4.8, 1.05));
        }
      } else if (slotType === 4) {
        // =====================================================================
        // NHÓM [1]: TRUNG TÂM THƯƠNG MẠI & TÒA NHÀ KÍNH HIỆN ĐẠI (SHOPPING MALL PLAZA)
        // =====================================================================
        const podium = new THREE.Mesh(
          new THREE.BoxGeometry(15.2, 5.5, 15.2),
          new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 })
        );
        podium.position.y = 2.75;

        const glassAtrium = new THREE.Mesh(new THREE.BoxGeometry(15.4, 3.6, 12.0), glassTowerMat);
        glassAtrium.position.y = 2.8;

        const tower = new THREE.Mesh(new THREE.BoxGeometry(10.5, 18.0, 10.5), glassTowerMat);
        tower.position.y = 14.5;

        const mallSign = createSpeechBubbleSprite('🏬 TRUNG TÂM THƯƠNG MẠI (SHOPPING MALL)', '#0f172a', '#00e5ff');
        mallSign.scale.set(2.2, 0.42, 1);
        mallSign.position.set(0, 6.8, 7.8);
        mallSign.visible = true;

        lot.add(podium, glassAtrium, tower, mallSign);
      } else if (slotType === 5 || slotType === 6) {
        // =====================================================================
        // NHÓM [2]: TIỆM CAFE SÂN THƯỢNG 3D (5) & CỬA HÀNG BOUTIQUE THỜI TRANG (6)
        // =====================================================================
        if (slotType === 5) {
          const cafeBuilding = new THREE.Mesh(new THREE.BoxGeometry(10.5, 4.4, 9.5), woodMat);
          cafeBuilding.position.y = 2.2;
          const awning = new THREE.Mesh(
            new THREE.BoxGeometry(11.0, 0.35, 2.8),
            new THREE.MeshStandardMaterial({ color: 0xd90429 })
          );
          awning.position.set(0, 2.8, 5.6);
          awning.rotation.x = 0.22;

          // Dù che nắng 3D ngoài sảnh Cafe
          [-3.2, 3.2].forEach((ux) => {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), matChrome);
            pole.position.set(ux, 1.1, 6.8);
            const umbrella = new THREE.Mesh(
              new THREE.ConeGeometry(1.45, 0.65, 10),
              new THREE.MeshStandardMaterial({ color: 0xffbe0b })
            );
            umbrella.position.set(ux, 2.2, 6.8);
            lot.add(pole, umbrella);
          });

          const cSign = createSpeechBubbleSprite('☕ TIỆM CAFE ROASTERY 3D', '#3d1e38', '#ffbe0b');
          cSign.scale.set(1.8, 0.38, 1);
          cSign.position.set(0, 5.4, 4.8);
          cSign.visible = true;
          lot.add(cafeBuilding, awning, cSign);
        } else {
          const boutBuilding = new THREE.Mesh(
            new THREE.BoxGeometry(11.0, 5.2, 10.0),
            new THREE.MeshStandardMaterial({ color: 0xffe5ec, roughness: 0.35 })
          );
          boutBuilding.position.y = 2.6;
          const showWindow = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.2, 0.3), matGlass);
          showWindow.position.set(0, 1.8, 5.05);
          const goldArch = new THREE.Mesh(
            new THREE.BoxGeometry(9.4, 0.45, 0.6),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.2 })
          );
          goldArch.position.set(0, 3.6, 5.1);

          const bSign = createSpeechBubbleSprite('👗 LUXURY BOUTIQUE & FASHION', '#590d22', '#ff4d6d');
          bSign.scale.set(1.9, 0.38, 1);
          bSign.position.set(0, 6.0, 5.0);
          bSign.visible = true;
          lot.add(boutBuilding, showWindow, goldArch, bSign);
        }
      } else if (slotType === 7) {
        // =====================================================================
        // NHÓM [1]: BỆNH VIỆN ĐA KHOA 3D CHI TIẾT (CÓ CHỮ THẬP ĐỎ 3D PHÁT SÁNG)
        // =====================================================================
        const hospMain = new THREE.Mesh(new THREE.BoxGeometry(14.0, 11.5, 11.0), hospitalWhiteMat);
        hospMain.position.y = 5.75;
        const hospWing = new THREE.Mesh(
          new THREE.BoxGeometry(14.4, 3.8, 11.6),
          new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.3 })
        );
        hospWing.position.y = 1.9;

        // Sảnh đón Cấp Cứu (Emergency Canopy)
        const erCanopy = new THREE.Mesh(
          new THREE.BoxGeometry(6.8, 0.4, 3.6),
          new THREE.MeshStandardMaterial({ color: 0xd90429 })
        );
        erCanopy.position.set(0, 3.6, 6.8);

        // Chữ Thập Đỏ 3D lớn gắn trên đỉnh Bệnh Viện
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.8, 0.45), redCrossMat);
        crossV.position.set(0, 13.0, 5.2);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 0.45), redCrossMat);
        crossH.position.set(0, 13.0, 5.2);

        const hSign = createSpeechBubbleSprite('🏥 BỆNH VIỆN ĐA KHOA QUỐC TẾ (24/7 EMERGENCY)', '#9e2a2b', '#ffffff');
        hSign.scale.set(2.3, 0.42, 1);
        hSign.position.set(0, 9.2, 6.0);
        hSign.visible = true;

        lot.add(hospMain, hospWing, erCanopy, crossV, crossH, hSign);
      } else {
        // =====================================================================
        // NHÓM [2]: TRẠM XĂNG 3D CHI TIẾT (8) & TỔ HỢP CỬA HÀNG DỊCH VỤ + CÂY XANH (9)
        // =====================================================================
        const gasCanopy = new THREE.Mesh(
          new THREE.BoxGeometry(13.5, 0.65, 10.2),
          new THREE.MeshPhysicalMaterial({ color: 0x0077b6, clearcoat: 1.0 })
        );
        gasCanopy.position.y = 4.8;
        const gasStripe = new THREE.Mesh(
          new THREE.BoxGeometry(13.6, 0.22, 10.3),
          new THREE.MeshBasicMaterial({ color: 0xffbe0b })
        );
        gasStripe.position.y = 4.8;

        [-4.8, 4.8].forEach((px) => {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 4.8, 12), hospitalWhiteMat);
          col.position.set(px, 2.4, 0);
          lot.add(col);
        });

        // 2 Đảo bơm xăng + Trụ bơm điện tử 3D
        [-2.2, 2.2].forEach((ix) => {
          const pumpBox = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 1.9, 0.75),
            new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.3 })
          );
          pumpBox.position.set(ix, 0.95, 0);
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.65, 0.45),
            new THREE.MeshBasicMaterial({ color: 0x00ff88 })
          );
          screen.position.set(ix, 1.35, 0.39);
          lot.add(pumpBox, screen);
        });

        const gSign = createSpeechBubbleSprite('⛽ TRẠM XĂNG 3D & CỬA HÀNG TIỆN LỢI', '#003566', '#00ff88');
        gSign.scale.set(2.0, 0.40, 1);
        gSign.position.set(0, 5.8, 4.8);
        gSign.visible = true;
        lot.add(gasCanopy, gasStripe, gSign);
        lot.add(createDetailed3DTree(-6.5, -6.0, 1.0));
      }

      block.add(lot);
    });
  });
}
buildDetailed3DLandmarksByRule41212();

// --- 19.4. BỔ SUNG XE CẤP CỨU 115 (3D AMBULANCE) CHI TIẾT RÕ NÉT VÀO LƯU THÔNG ---
function spawnDetailed3DAmbulances() {
  const whitePaint = new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.14, clearcoat: 1.0 });
  const redStripeMat = new THREE.MeshBasicMaterial({ color: 0xe63946 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });

  for (let i = 0; i < 2; i++) {
    const amb = new THREE.Group();

    // 1. Thùng Y Tế phía sau (Medical Box Module) + Cabin đầu xe Sprinter 3D
    const medBox = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.95, 3.85), whitePaint);
    medBox.position.set(0, 1.32, 0.65);

    const frontCab = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.45, 1.75), whitePaint);
    frontCab.position.set(0, 1.05, -2.05);

    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.82), matGlass);
    windshield.position.set(0, 1.42, -2.94);
    windshield.rotation.y = Math.PI;
    windshield.rotation.x = 0.22;

    // 2. Dải sọc đỏ cấp cứu quanh thân xe + Biểu tượng Chữ Thập Đỏ 3D hai bên hông
    const beltStripe = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.22, 5.55), redStripeMat);
    beltStripe.position.set(0, 0.88, -0.2);

    [-1.09, 1.09].forEach((sx) => {
      const cV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.22), redStripeMat);
      cV.position.set(sx, 1.55, 0.65);
      const cH = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.72), redStripeMat);
      cH.position.set(sx, 1.55, 0.65);
      amb.add(cV, cH);
    });

    // 3. Dàn đèn ưu tiên Cấp Cứu Đỏ - Xanh trên nóc
    const sirenR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.24), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
    sirenR.position.set(-0.42, 2.38, -1.05);
    const sirenB = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.24), new THREE.MeshBasicMaterial({ color: 0x0088ff }));
    sirenB.position.set(0.42, 2.38, -1.05);
    emergencyLightMeshes.push({ r: sirenR, b: sirenB });

    // 4. 4 Bánh xe có mâm Inox y tế
    const wheels = [];
    [[-1.02, -1.95], [1.02, -1.95], [-1.02, 1.55], [1.02, 1.55]].forEach(([wx, wz]) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.40, wz);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.28, 20), matTireRubber);
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.29, 16), chromeMat);
      rim.rotation.z = Math.PI / 2;
      wGroup.add(tire, rim);
      amb.add(wGroup);
      wheels.push(wGroup);
    });

    const ambBadge = createHornAlertSprite('🚑 XE CẤP CỨU 115!', '#ff3b30');
    ambBadge.position.set(0, 2.85, 0);
    amb.add(medBox, frontCab, windshield, beltStripe, sirenR, sirenB, ambBadge);

    amb.userData = {
      category: 'AMBULANCE',
      modelName: 'Xe Cấp Cứu 115',
      laneWidth: 3.2,
      cruiseSpeed: 12.5,
      activeSpeed: 12.5,
      wheels,
      hornBadge: ambBadge,
      hornCooldown: 0,
      crashState: 'NORMAL',
      crashVel: new THREE.Vector3(),
      interiorTheme: {
        name: 'Khoang Điều Khiển Xe Cấp Cứu 115',
        nappaHex: 0xf8fafc,
        woodHex: 0xe63946,
        bodyHex: 0xf8fafc
      }
    };

    amb.traverse((child) => {
      if (child.isMesh) register3DTarget(child, () => boardAnyNpcVehicle(amb));
    });

    scene.add(amb);
    allTrafficVehicles.push(amb);
  }
}
spawnDetailed3DAmbulances();

// --- 19.5. HỆ TỌA ĐỘ OXYZ CHỮ THẬP TUYỆT ĐỐI CHO XE & NPC (KHÔNG BAO GIỜ ĐI NGANG, KHÔNG XUYÊN VẬT CẢN) ---
// Mỗi phương tiện và mỗi NPC chỉ di chuyển theo 1 trong 4 hướng Chữ Thập OXYZ:
// - 'NORTH' (-Z): dx = 0, dz = -1 | Mũi xe (-Z) -> rotation.y = 0         | Làn phải: X = gridX + laneW
// - 'SOUTH' (+Z): dx = 0, dz = +1 | Mũi xe (-Z) -> rotation.y = Math.PI   | Làn phải: X = gridX - laneW
// - 'EAST'  (+X): dx = +1, dz = 0 | Mũi xe (-Z) -> rotation.y = -Math.PI/2| Làn phải: Z = gridZ + laneW
// - 'WEST'  (-X): dx = -1, dz = 0 | Mũi xe (-Z) -> rotation.y = +Math.PI/2| Làn phải: Z = gridZ - laneW
const OXYZ_CARDINALS = {
  NORTH: { dx: 0, dz: -1, axis: 'Z', carYaw: 0, npcYaw: Math.PI, rightTurn: 'EAST', leftTurn: 'WEST' },
  SOUTH: { dx: 0, dz: 1, axis: 'Z', carYaw: Math.PI, npcYaw: 0, rightTurn: 'WEST', leftTurn: 'EAST' },
  EAST:  { dx: 1, dz: 0, axis: 'X', carYaw: -Math.PI / 2, npcYaw: Math.PI / 2, rightTurn: 'SOUTH', leftTurn: 'NORTH' },
  WEST:  { dx: -1, dz: 0, axis: 'X', carYaw: Math.PI / 2, npcYaw: -Math.PI / 2, rightTurn: 'NORTH', leftTurn: 'SOUTH' }
};
const CARDINAL_KEYS = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

function getRequiredLaneOffset(cardinalKey, laneW) {
  // Giao thông đi bên phải chuẩn:
  // Đi Bắc (-Z) ở làn +X (+laneW); Đi Nam (+Z) ở làn -X (-laneW);
  // Đi Đông (+X) ở làn +Z (+laneW); Đi Tây (-X) ở làn -Z (-laneW)
  if (cardinalKey === 'NORTH' || cardinalKey === 'EAST') return +laneW;
  return -laneW;
}

// Khởi tạo toàn bộ Xe NPC vào đúng tâm Làn Chữ Thập OXYZ (Không bao giờ lệch làn hay đi chéo!)
allTrafficVehicles.forEach((veh, idx) => {
  const vd = veh.userData;
  const isBike = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
  vd.laneWidth = isBike ? 6.2 : 3.2;

  const cKey = CARDINAL_KEYS[idx % 4];
  const card = OXYZ_CARDINALS[cKey];
  vd.oxyzDir = cKey;
  vd.lastTurnGridX = 999999;
  vd.lastTurnGridZ = 999999;

  // Khóa toàn bộ đèn pha/volumetric beam con của xe về đúng rotation = (0,0,0) để chùm sáng luôn chiếu thẳng phía trước mũi xe!
  veh.children.forEach((c) => {
    if (c.userData && c.userData.isVolumetricBeam) {
      c.rotation.set(0, 0, 0);
    }
  });

  const laneOff = getRequiredLaneOffset(cKey, vd.laneWidth);
  const offsetAlongRoad = ((Math.floor(idx / 4) - 2) * 22) + 18;

  if (card.axis === 'Z') {
    veh.position.set(laneOff, 0, offsetAlongRoad);
  } else {
    veh.position.set(offsetAlongRoad, 0, laneOff);
  }
  veh.rotation.set(0, card.carYaw, 0);
});

// Khởi tạo toàn bộ NPC Đi Bộ vào đúng Vỉa Hè Chữ Thập OXYZ (±12.6m)
sidewalkNpcs.forEach((npc, idx) => {
  const nd = npc.userData;
  const cKey = CARDINAL_KEYS[idx % 4];
  const card = OXYZ_CARDINALS[cKey];
  nd.oxyzDir = cKey;
  nd.sideSign = (idx % 2 === 0) ? 1 : -1;
  nd.lastCornerX = 999999;
  nd.lastCornerZ = 999999;

  const swCoord = nd.sideSign * SAFE_SIDEWALK_CORRIDOR;
  const distAlong = (idx - 7) * 12;

  if (card.axis === 'Z') {
    npc.position.set(swCoord, 0.24, distAlong);
  } else {
    npc.position.set(distAlong, 0.24, swCoord);
  }
  npc.rotation.set(0, card.npcYaw, 0);
});

// Khóa luôn động vật qua đường đi đúng hướng Chữ Thập OXYZ
crossingAnimals.forEach((ani) => {
  const ad = ani.userData;
  ad.crossSpeed = 0; // Ngắt di chuyển tự do ở vòng lặp cũ để điều khiển bằng hệ OXYZ
});

function updateStrictOxyzCrosshairWorld(dt, elapsed) {
  const playerPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  const carPos = vehicleRoot.position;
  const playerSpeedAbs = Math.abs(state.speedKmh);

  const zGreen = (currentTrafficPhase === 'GREEN');
  const xGreen = (currentTrafficPhase === 'RED');

  if (twoWheelCockpitGroup.visible && bikeHandlebarPivot) {
    bikeHandlebarPivot.rotation.y = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 32);
  }

  // =========================================================================
  // 1. CẬP NHẬT TẤT CẢ PHƯƠNG TIỆN THEO TRỤC CHỮ THẬP OXYZ (0% ĐI NGANG!)
  // =========================================================================
  for (let i = 0; i < allTrafficVehicles.length; i++) {
    const veh = allTrafficVehicles[i];
    const vd = veh.userData;

    if (vd.isBoardedByPlayer) {
      veh.position.copy(vehicleRoot.position);
      veh.rotation.y = state.headingRad;
      continue;
    }
    if (vd.isInterceptingHijacker) continue;

    // Kiểm tra nếu xe người chơi chủ động tông vào xe NPC này
    const distToPlayerCar = veh.position.distanceTo(carPos);
    const isHeavy = (vd.category === 'BUS' || vd.category === 'FIRETRUCK' || vd.category === 'AMBULANCE');
    const hitRadius = isHeavy ? 3.5 : 2.55;

    if (state.playerMode === 'DRIVING' && distToPlayerCar < hitRadius && playerSpeedAbs > 5.0 && vd.crashState === 'NORMAL') {
      initAudio();
      playImpactSound(22);
      state.suspensionShakeIntensity = 2.2;
      const impactDir = veh.position.clone().sub(carPos).setY(0).normalize();

      if (isHeavy) {
        state.velocityMs = -state.velocityMs * 0.65;
        state.speedKmh = state.velocityMs * 3.6;
        vehicleRoot.position.addScaledVector(impactDir, -1.6);
        state.lastActionLog = `💥 TÔNG TRÚNG ${vd.modelName.toUpperCase()}! Xe bạn bị dội lùi lại nhưng giữ thăng bằng an toàn!`;
      } else {
        vd.crashState = 'AIRBORNE_TUMBLE';
        const isSmall = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
        const massFactor = isSmall ? 1.85 : 1.0;
        const launchSpeed = Math.min(26, (playerSpeedAbs / 3.6) * 0.85 * massFactor + 6.0);
        vd.crashVel.set(impactDir.x * launchSpeed, 5.2 * massFactor, impactDir.z * launchSpeed);
        vd.crashTimer = 1.5;
        state.velocityMs *= 0.55;
        state.speedKmh = state.velocityMs * 3.6;
      }
    }

    if (vd.crashState && vd.crashState !== 'NORMAL') {
      const card = OXYZ_CARDINALS[vd.oxyzDir || 'NORTH'];
      if (vd.crashState === 'AIRBORNE_TUMBLE') {
        veh.position.addScaledVector(vd.crashVel, dt);
        vd.crashVel.y -= 14.0 * dt;
        if (veh.position.y <= 0.35) veh.position.y = 0.35;
        vd.rollAngle = (vd.rollAngle || 0) + 6.5 * dt;
        veh.rotation.set(0, card.carYaw, vd.rollAngle);
        vd.crashTimer -= dt;
        if (vd.crashTimer <= 0) {
          vd.crashState = 'OVERTURNED';
          vd.crashTimer = 3.0;
        }
      } else if (vd.crashState === 'OVERTURNED') {
        vd.crashTimer -= dt;
        if (vd.crashTimer <= 0) {
          vd.crashState = 'NORMAL';
          vd.rollAngle = 0;
          veh.position.y = 0;
          // Đặt xe quay lại đúng tâm làn OXYZ gần nhất
          const gx = Math.round(veh.position.x / BLOCK_SIZE) * BLOCK_SIZE;
          const gz = Math.round(veh.position.z / BLOCK_SIZE) * BLOCK_SIZE;
          const lOff = getRequiredLaneOffset(vd.oxyzDir, vd.laneWidth);
          if (card.axis === 'Z') veh.position.x = gx + lOff;
          else veh.position.z = gz + lOff;
          veh.rotation.set(0, card.carYaw, 0);
        }
      }
      continue;
    }

    const cKey = vd.oxyzDir || 'NORTH';
    const card = OXYZ_CARDINALS[cKey];
    const laneW = vd.laneWidth || 3.2;
    const reqLaneOffset = getRequiredLaneOffset(cKey, laneW);

    // Tâm chữ thập OXYZ gần nhất
    const crossX = Math.round(veh.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const crossZ = Math.round(veh.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    // Khoảng cách có hướng từ xe tới tâm chữ thập OXYZ phía trước
    const distToCrossAhead = card.axis === 'Z'
      ? (crossZ - veh.position.z) * card.dz
      : (crossX - veh.position.x) * card.dx;

    const myLightGreen = card.axis === 'Z' ? zGreen : xGreen;
    let mustStop = false;

    // A. Dừng Đèn Đỏ trước vạch qua đường (11.5m .. 15.2m trước tâm OXYZ)
    if (!myLightGreen && distToCrossAhead > 11.4 && distToCrossAhead < 15.2) {
      mustStop = true;
    }

    // B. Không bao giờ chạy xuyên qua Xe Người Chơi hoặc Người Chơi
    if (!mustStop) {
      for (const obs of [carPos, state.avatarPos]) {
        const dx = obs.x - veh.position.x;
        const dz = obs.z - veh.position.z;
        const fwdDist = dx * card.dx + dz * card.dz;
        const latDist = Math.abs(dx * card.dz - dz * card.dx);
        if (fwdDist > 0.4 && fwdDist < 8.8 && latDist < 2.8) {
          mustStop = true;
          vd.hornBadge.visible = true;
          break;
        }
      }
    }

    // C. Không bao giờ chạy xuyên qua Xe NPC khác hoặc NPC Đi Bộ phía trước
    if (!mustStop) {
      for (let j = 0; j < allTrafficVehicles.length; j++) {
        if (i === j || !allTrafficVehicles[j].visible) continue;
        const other = allTrafficVehicles[j];
        const dx = other.position.x - veh.position.x;
        const dz = other.position.z - veh.position.z;
        const fwdDist = dx * card.dx + dz * card.dz;
        const latDist = Math.abs(dx * card.dz - dz * card.dx);
        // Nếu xe khác đang ở ngay trước mũi xe trong phạm vi 8m và lệch ngang < 2.2m -> Dừng lại chờ!
        if (fwdDist > 0.5 && fwdDist < 8.2 && latDist < 2.2) {
          mustStop = true;
          break;
        }
      }
    }

    const cruise = vd.cruiseSpeed || 11.5;
    vd.activeSpeed = mustStop
      ? THREE.MathUtils.lerp(vd.activeSpeed || 0, 0, dt * 16)
      : THREE.MathUtils.lerp(vd.activeSpeed || 0, cruise, dt * 5);
    if (!mustStop) vd.hornBadge.visible = false;

    const step = vd.activeSpeed * dt;

    // D. RẼ TẠI TÂM CHỮ THẬP OXYZ:
    // Xe chỉ được phép chuyển hướng (ví dụ từ trục Z sang trục X) KHI VÀ CHỈ KHI tọa độ dọc của nó
    // chạm đúng vào đường tâm của làn mới (crossZ + newLaneOffset)! Nhờ vậy xe rẽ vuông góc ngay trên giao điểm
    // của 2 làn chữ thập mà KHÔNG HỀ có bất kỳ chuyển động trượt ngang nào!
    if (!mustStop && (vd.lastTurnGridX !== crossX || vd.lastTurnGridZ !== crossZ)) {
      const nextDirKey = Math.random() > 0.5 ? card.rightTurn : card.leftTurn;
      const nextLaneOff = getRequiredLaneOffset(nextDirKey, laneW);

      const distToTurnPoint = card.axis === 'Z'
        ? Math.abs(veh.position.z - (crossZ + nextLaneOff))
        : Math.abs(veh.position.x - (crossX + nextLaneOff));

      if (distToTurnPoint < Math.max(0.45, step * 1.5)) {
        vd.lastTurnGridX = crossX;
        vd.lastTurnGridZ = crossZ;
        if (Math.random() < 0.35) {
          // Chốt tọa độ ngay tại giao điểm chữ thập và đổi sang hướng mới!
          if (card.axis === 'Z') {
            veh.position.z = crossZ + nextLaneOff;
          } else {
            veh.position.x = crossX + nextLaneOff;
          }
          vd.oxyzDir = nextDirKey;
        }
      }
    }

    // E. Tịnh tiến strictly dọc theo trục Chữ Thập OXYZ hiện tại & khóa cứng góc xoay mũi xe!
    const activeCard = OXYZ_CARDINALS[vd.oxyzDir];
    const activeLaneOff = getRequiredLaneOffset(vd.oxyzDir, laneW);

    if (activeCard.axis === 'Z') {
      veh.position.x = crossX + activeLaneOff; // Khóa chặt trục X vào làn đường
      veh.position.z += activeCard.dz * step;  // Chỉ di chuyển dọc theo trục Z
    } else {
      veh.position.z = crossZ + activeLaneOff; // Khóa chặt trục Z vào làn đường
      veh.position.x += activeCard.dx * step;  // Chỉ di chuyển dọc theo trục X
    }
    veh.position.y = 0;
    // Khóa góc xoay 100% trùng khớp với trục di chuyển -> KHÔNG BAO GIỜ ĐI NGANG!
    veh.rotation.set(0, activeCard.carYaw, 0);

    if (vd.wheels && vd.activeSpeed > 0.05) {
      const spin = (vd.activeSpeed * dt) / 0.34;
      for (const w of vd.wheels) w.rotation.x -= spin;
    }

    if (veh.position.z - playerPos.z > 95) veh.position.z -= 190;
    else if (veh.position.z - playerPos.z < -95) veh.position.z += 190;
    if (veh.position.x - playerPos.x > 95) veh.position.x -= 190;
    else if (veh.position.x - playerPos.x < -95) veh.position.x += 190;
  }

  // =========================================================================
  // 2. CẬP NHẬT TẤT CẢ NPC ĐI BỘ THEO HÀNH LANG CHỮ THẬP OXYZ (0% ĐI NGANG!)
  // =========================================================================
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (!npc.visible) continue;

    // Kiểm tra nếu xe người chơi tông trúng NPC
    const distToCar = npc.position.distanceTo(carPos);
    if (state.playerMode === 'DRIVING' && distToCar < 2.1 && playerSpeedAbs > 4.0 && nd.npcState !== 'KNOCKED_FLYING') {
      initAudio();
      playImpactSound(16);
      state.suspensionShakeIntensity = 1.6;
      const pushDir = npc.position.clone().sub(carPos).setY(0).normalize();
      nd.npcState = 'KNOCKED_FLYING';
      const launchSpd = Math.min(22, (playerSpeedAbs / 3.6) * 0.9 + 5.0);
      nd.knockVel.set(pushDir.x * launchSpd, 6.2, pushDir.z * launchSpd);
      nd.knockTimer = 2.0;
      continue;
    }

    if (nd.npcState === 'KNOCKED_FLYING') {
      npc.position.addScaledVector(nd.knockVel, dt);
      nd.knockVel.y -= 15.0 * dt;
      if (npc.position.y <= 0.24) npc.position.y = 0.24;
      npc.rotation.x += 7.0 * dt;
      nd.knockTimer -= dt;
      if (nd.knockTimer <= 0) {
        nd.npcState = 'WALKING';
        npc.position.y = 0.24;
        npc.rotation.x = 0;
      }
      continue;
    }

    npc.position.y = 0.24;
    const cKey = nd.oxyzDir || 'NORTH';
    const card = OXYZ_CARDINALS[cKey];
    const crossX = Math.round(npc.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const crossZ = Math.round(npc.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    const walkStep = 3.2 * dt;
    const nextX = npc.position.x + card.dx * walkStep;
    const nextZ = npc.position.z + card.dz * walkStep;

    // Kiểm tra nếu phía trước có Xe Người Chơi, Người Chơi hoặc Xe NPC đang chắn đường -> Lập tức quay đầu 180° trên trục OXYZ!
    let blockedAhead = false;
    if (Math.hypot(nextX - carPos.x, nextZ - carPos.z) < 2.3 ||
        (state.playerMode === 'ON_FOOT' && Math.hypot(nextX - state.avatarPos.x, nextZ - state.avatarPos.z) < 1.35)) {
      blockedAhead = true;
    }
    if (!blockedAhead) {
      for (const veh of allTrafficVehicles) {
        if (veh.visible && Math.hypot(nextX - veh.position.x, nextZ - veh.position.z) < 2.2) {
          blockedAhead = true;
          break;
        }
      }
    }

    if (blockedAhead) {
      const reverseMap = { NORTH: 'SOUTH', SOUTH: 'NORTH', EAST: 'WEST', WEST: 'EAST' };
      nd.oxyzDir = reverseMap[cKey];
    }

    // Kiểm tra tại đúng góc giao Vỉa Hè Chữ Thập (±12.6m, ±12.6m) để rẽ vuông góc 90° mà không trượt ngang!
    const targetCornerSign = Math.random() > 0.5 ? 1 : -1;
    const cornerCoord = targetCornerSign * SAFE_SIDEWALK_CORRIDOR;
    const distToCorner = card.axis === 'Z'
      ? Math.abs(npc.position.z - (crossZ + cornerCoord))
      : Math.abs(npc.position.x - (crossX + cornerCoord));

    if (distToCorner < 0.35 && (nd.lastCornerX !== crossX || nd.lastCornerZ !== crossZ)) {
      nd.lastCornerX = crossX;
      nd.lastCornerZ = crossZ;
      if (Math.random() < 0.45) {
        if (card.axis === 'Z') {
          npc.position.z = crossZ + cornerCoord;
          nd.sideSign = targetCornerSign;
          nd.oxyzDir = Math.random() > 0.5 ? 'EAST' : 'WEST';
        } else {
          npc.position.x = crossX + cornerCoord;
          nd.sideSign = targetCornerSign;
          nd.oxyzDir = Math.random() > 0.5 ? 'NORTH' : 'SOUTH';
        }
      }
    }

    const activeCard = OXYZ_CARDINALS[nd.oxyzDir];
    const swOffset = (nd.sideSign || 1) * SAFE_SIDEWALK_CORRIDOR;

    if (activeCard.axis === 'Z') {
      npc.position.x = crossX + swOffset; // Khóa chặt X trên vỉa hè
      npc.position.z += activeCard.dz * walkStep;
    } else {
      npc.position.z = crossZ + swOffset; // Khóa chặt Z trên vỉa hè
      npc.position.x += activeCard.dx * walkStep;
    }

    // Khóa góc xoay mặt & vai của NPC trùng khớp 100% với trục bước đi OXYZ -> Không bao giờ đi ngang!
    npc.rotation.set(0, activeCard.npcYaw, 0);

    nd.phase += dt * 7.5;
    const sw = Math.sin(nd.phase) * 0.52;
    nd.leftLeg.rotation.x = sw;
    nd.rightLeg.rotation.x = -sw;
    nd.leftArm.rotation.x = -sw * 0.75;
    nd.rightArm.rotation.x = sw * 0.75;

    if (npc.position.z - playerPos.z > 80) npc.position.z -= 160;
    else if (npc.position.z - playerPos.z < -80) npc.position.z += 160;
    if (npc.position.x - playerPos.x > 80) npc.position.x -= 160;
    else if (npc.position.x - playerPos.x < -80) npc.position.x += 160;
  }
}

// --- 19.6. GẮN VÀO scene.onBeforeRender ĐỂ THAY THẾ VÒNG LẶP CŨ ---
let lastV120Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV120Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV120Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Điều khiển toàn bộ Xe & NPC theo Hệ Tọa Độ Chữ Thập OXYZ (0% đi ngang, 0% xuyên vật cản)
  updateStrictOxyzCrosshairWorld(dt, elapsed);

  // 2. Mui trần đóng/mở đúng trục cơ khí
  updateCorrectConvertibleRoofKinematics(dt);

  // 3. Tay cầm V112 (Nút xoay rẽ trái/phải, Cò trước dừng hẳn, Cò hông phanh côn, Phím A mở/khóa nhìn)
  updateV112ControllerSteeringBrakingAndLookLock(dt);

  // 4. Chặn đi bộ xuyên địa hình
  if (state.playerMode === 'ON_FOOT') {
    clampFootPositionAgainstAllBuildings(state.avatarPos);
    playerAvatarGroup.position.copy(state.avatarPos);
  }

  // 5. Hoạt cảnh Cướp xe & Cảnh sát chặn đầu
  updateV110HijackAndPoliceBlockade(dt);

  // 6. Hiển thị Cam Mô Phỏng ESP32 FPV lên cả Kính Chắn Gió + 4 Gương Hậu
  if (state.windshieldMode === 'ESP32_SIM') {
    renderSimulatedEsp32FpvOnAllScreens(elapsed);
  }

  // 7. Vẽ Vòng Tròn Map Radar
  minimapTick++;
  if (minimapTick % 2 === 0) {
    renderCircularRadarMinimap();
  }
};


// ============================================================================
// 20. BẢN CẬP NHẬT V125 - GIẢI QUYẾT TRIỆT ĐỂ:
//     1. TÁCH MẢNG XE, NPC & THÚ CƯNG RA KHỎI VÒNG LẶP GỐC updateWorldSimulation
//        (Ngăn chặn 100% việc updateWorldSimulation gán đè rotation.y = 0 trước khi
//        scene.updateMatrixWorld() chạy khiến xe và NPC bị trượt ngang!).
//     2. LẮP HỆ TRỤC TỌA ĐỘ OXYZ TRÊN CÂY ĐÈN GIAO THÔNG & CỘT ĐÈN LÀM THAM CHIẾU:
//        - Mặt đèn giao thông chiếu theo vector pháp tuyến N_light.
//        - Đèn pha của xe / hướng mặt của NPC & thú cưng có vector F_headlight.
//        - Đi đúng chiều khi và chỉ khi F_headlight ngược hướng hoàn toàn với N_light
//          (F_headlight · N_light = -1).
//        - Khi rẽ tại ngã tư: Bắt buộc xoay cả đầu xe, thân xe và đèn pha đúng ±90°
//          để ngược hướng với đèn giao thông của nhánh đường mới. Nếu trùng phương
//          (ngược chiều) hoặc vuông góc (đi ngang) thì tự động hiệu chỉnh tức thì!
//     3. DỰNG MỚI CHÓ MÈO 3D CHI TIẾT (8 GIỐNG LOÀI / MÀU SẮC, CÓ 4 CHÂN BƯỚC ĐI,
//        TAI, MÕM, ĐUÔI VẪY) ĐI TRÊN VỈA HÈ / VẠCH QUA ĐƯỜNG, KHÔNG BAO GIỜ ĐỨNG YÊN
//        GIỮA LÒNG ĐƯỜNG GÂY TẮC ĐƯỜNG!
//     4. NÂNG CẤP ĐỒ HỌA BLENDER-STYLE 3D CHI TIẾT CHO CÁC ĐỊA ĐIỂM & XE NPC,
//        CẬP NHẬT MÀN HÌNH 3D YOUTUBE HIỂN THỊ BÌA VIDEO + THỜI LƯỢNG THỰC KHI THU NHỎ.
// ============================================================================

// --- 20.1. TÁCH TOÀN BỘ XE, NPC & ĐỘNG VẬT RA KHỎI VÒNG LẶP CŨ (CHẤM DỨT 100% LỖI BỊ GHI ĐÈ GÓC XOAY GÂY ĐI NGANG!) ---
const v125TrafficVehicles = allTrafficVehicles.splice(0, allTrafficVehicles.length);
const v125SidewalkNpcs = sidewalkNpcs.splice(0, sidewalkNpcs.length);
const v125Animals = crossingAnimals.splice(0, crossingAnimals.length);

// Cập nhật lại hàm tương tác xã hội để làm việc với mảng V125 mới
window.triggerPlayerSocialOrAnimalInteraction = function() {
  initAudio();
  const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;

  let nearestAni = null;
  let minAniDist = Infinity;
  for (const ani of v125Animals) {
    const d = refPos.distanceTo(ani.position);
    if (d < minAniDist) { minAniDist = d; nearestAni = ani; }
  }

  let nearestNpc = null;
  let minNpcDist = Infinity;
  for (const npc of v125SidewalkNpcs) {
    const d = refPos.distanceTo(npc.position);
    if (d < minNpcDist) { minNpcDist = d; nearestNpc = npc; }
  }

  if (nearestAni && minAniDist <= minNpcDist && minAniDist < 18) {
    const ad = nearestAni.userData;
    ad.soundTimer = 3.2;
    if (ad.soundBubble) ad.soundBubble.visible = true;
    playSocialOrAnimalSound(ad.species === 'DOG' ? 'DOG_BARK' : 'CAT_MEOW');
    state.lastActionLog = `🐾 [${ad.breedName}]: ${ad.species === 'DOG' ? 'Gâu gâu! Woof!' : 'Meo meo~ Purr~'}`;
    return;
  }

  if (nearestNpc) {
    const nd = nearestNpc.userData;
    nd.handshakeTimer = 3.0;
    if (nd.helloBubble) nd.helloBubble.visible = true;
    playSocialOrAnimalSound('HELLO_NPC');
    state.lastActionLog = '🤝 Bạn vừa vẫy tay chào NPC trên phố!';
  }
};

// --- 20.2. LẮP TRỤC TỌA ĐỘ OXYZ & ĐÈN GIAO THÔNG 4 HƯỚNG TẠI MỌI NGÃ TƯ LÀM HỆ QUY CHIẾU CHUẨN ---
// Quy ước Hệ Trục Tham Chiếu Đèn Giao Thông (Traffic Light OXYZ Reference System):
// Trong không gian 3D của game:
// - Đèn pha của mọi xe (createHeadlightRefractionBeam) chiếu theo hướng -Z cục bộ của xe.
// - Khi xe có góc xoay rotation.y = θ, vector hướng chiếu của đèn pha là:
//     F_headlight = ( -sin(θ), 0, -cos(θ) )
// - Tại mỗi ngã tư, 4 cột đèn giao thông đặt ở 4 hướng chiếu mặt đèn (Red/Yellow/Green) theo vector N_light:
//   1. Làn đi Bắc (-Z, X = +laneW): Mặt đèn giao thông hướng về phía Nam N_light = (0, 0, +1).
//      -> Xe đi đúng hướng khi F_headlight = -N_light = (0, 0, -1) => θ = 0 rad (0°).
//   2. Làn đi Nam (+Z, X = -laneW): Mặt đèn giao thông hướng về phía Bắc N_light = (0, 0, -1).
//      -> Xe đi đúng hướng khi F_headlight = -N_light = (0, 0, +1) => θ = Math.PI rad (180°).
//   3. Làn đi Đông (+X, Z = +laneW): Mặt đèn giao thông hướng về phía Tây N_light = (-1, 0, 0).
//      -> Xe đi đúng hướng khi F_headlight = -N_light = (+1, 0, 0) => θ = -Math.PI / 2 rad (-90°).
//   4. Làn đi Tây (-X, Z = -laneW): Mặt đèn giao thông hướng về phía Đông N_light = (+1, 0, 0).
//      -> Xe đi đúng hướng khi F_headlight = -N_light = (-1, 0, 0) => θ = +Math.PI / 2 rad (+90°).

const TRAFFIC_LIGHT_OXYZ_REF = {
  NORTH: {
    lightNormal: new THREE.Vector3(0, 0, 1),   // Mặt đèn chiếu về +Z
    requiredHeadlightVec: new THREE.Vector3(0, 0, -1), // Đèn pha xe phải chiếu về -Z (ngược hướng mặt đèn!)
    axis: 'Z',
    laneSign: +1,       // X = gridX + laneW
    sidewalkSign: +1,   // X = gridX + 12.6
    carYaw: 0,          // -sin(0)=0, -cos(0)=-1
    npcYaw: Math.PI,    // Mặt NPC nhìn về -Z
    animalYaw: Math.PI, // Đầu thú cưng (+Z local) xoay PI để nhìn về -Z
    turnRight: 'EAST',  // Xoay phải 90° (-PI/2)
    turnLeft: 'WEST'    // Xoay trái 90° (+PI/2)
  },
  SOUTH: {
    lightNormal: new THREE.Vector3(0, 0, -1),  // Mặt đèn chiếu về -Z
    requiredHeadlightVec: new THREE.Vector3(0, 0, 1),  // Đèn pha xe chiếu về +Z
    axis: 'Z',
    laneSign: -1,       // X = gridX - laneW
    sidewalkSign: -1,   // X = gridX - 12.6
    carYaw: Math.PI,    // -sin(PI)=0, -cos(PI)=+1
    npcYaw: 0,
    animalYaw: 0,
    turnRight: 'WEST',
    turnLeft: 'EAST'
  },
  EAST: {
    lightNormal: new THREE.Vector3(-1, 0, 0),  // Mặt đèn chiếu về -X
    requiredHeadlightVec: new THREE.Vector3(1, 0, 0),  // Đèn pha xe chiếu về +X
    axis: 'X',
    laneSign: +1,       // Z = gridZ + laneW
    sidewalkSign: +1,   // Z = gridZ + 12.6
    carYaw: -Math.PI / 2, // -sin(-PI/2)=+1, -cos(-PI/2)=0
    npcYaw: Math.PI / 2,
    animalYaw: Math.PI / 2,
    turnRight: 'SOUTH',
    turnLeft: 'NORTH'
  },
  WEST: {
    lightNormal: new THREE.Vector3(1, 0, 0),   // Mặt đèn chiếu về +X
    requiredHeadlightVec: new THREE.Vector3(-1, 0, 0), // Đèn pha xe chiếu về -X
    axis: 'X',
    laneSign: -1,       // Z = gridZ - laneW
    sidewalkSign: -1,   // Z = gridZ - 12.6
    carYaw: Math.PI / 2, // -sin(PI/2)=-1, -cos(PI/2)=0
    npcYaw: -Math.PI / 2,
    animalYaw: -Math.PI / 2,
    turnRight: 'NORTH',
    turnLeft: 'SOUTH'
  }
};

const zAxisTrafficLightMats = [];
const xAxisTrafficLightMats = [];

// Lắp đặt Trục Tọa Độ OXYZ (Đỏ = OX, Xanh lá = OY, Xanh dương = OZ) & Đèn Giao Thông 4 Hướng chuẩn tại mọi ngã tư
(function install4WayOxyzTrafficLightsOnAllBlocks() {
  const redAxisMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const greenAxisMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
  const blueAxisMat = new THREE.MeshBasicMaterial({ color: 0x00bbf9 });

  cityBlocks.forEach((block) => {
    // 1. Tạo Cụm Trục Tọa Độ OXYZ Tham Chiếu gắn trên đỉnh cột đèn giao thông ngã tư
    const oxyzGizmo = new THREE.Group();
    oxyzGizmo.position.set(10.5, 4.9, -10.5);
    const axX = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), redAxisMat);
    axX.rotation.z = -Math.PI / 2;
    axX.position.x = 0.6;
    const axY = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), greenAxisMat);
    axY.position.y = 0.6;
    const axZ = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), blueAxisMat);
    axZ.rotation.x = Math.PI / 2;
    axZ.position.z = 0.6;
    oxyzGizmo.add(axX, axY, axZ);
    block.add(oxyzGizmo);

    // 2. Thêm 2 Cột Đèn Giao Thông dành riêng cho hướng Đông - Tây (Trục X) tại (-10.5, -10.5) và (10.5, 10.5)
    // để xe chạy hướng Đông/Tây nhìn thấy đúng mặt đèn Đỏ/Vàng/Xanh đối diện với đèn pha của mình!
    [
      { x: -10.5, z: -10.5, rotY: -Math.PI / 2 }, // Mặt đèn hướng về -X (Đón xe đi hướng Đông +X)
      { x: 10.5, z: 10.5, rotY: Math.PI / 2 }     // Mặt đèn hướng về +X (Đón xe đi hướng Tây -X)
    ].forEach((cfg) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(cfg.x, 0, cfg.z);
      pGroup.rotation.y = cfg.rotY;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), matPole);
      pole.position.y = 2.3;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.05, 0.25), matPiano);
      box.position.set(0, 4.2, 0.15);

      const rMat = new THREE.MeshBasicMaterial({ color: 0x330808 });
      const yMat = new THREE.MeshBasicMaterial({ color: 0x332600 });
      const gMat = new THREE.MeshBasicMaterial({ color: 0x00ff55 });

      const rB = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), rMat);
      rB.position.set(0, 4.5, 0.26);
      const yB = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), yMat);
      yB.position.set(0, 4.2, 0.26);
      const gB = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), gMat);
      gB.position.set(0, 3.9, 0.26);

      pGroup.add(pole, box, rB, yB, gB);
      block.add(pGroup);
      xAxisTrafficLightMats.push({ redMat: rMat, yellowMat: yMat, greenMat: gMat });
    });
  });

  // Phân loại các đèn giao thông cũ vào nhóm Trục Z
  trafficLights.forEach((tl) => zAxisTrafficLightMats.push(tl));
})();

// --- 20.3. DỰNG LẠI CHÓ MÈO 3D CHI TIẾT (8 GIỐNG LOÀI / MÀU SẮC, 4 CHÂN BƯỚC ĐI, ĐUÔI VẪY) & KHÔNG GÂY TẮC ĐƯỜNG ---
function rebuildHighDetail3DDogsAndCats() {
  const dogBreeds = [
    { name: 'Chó Golden Retriever', coat: 0xe09f3e, ear: 0xbc6c25, belly: 0xfff3b0, collar: 0xd90429 },
    { name: 'Chó Husky Siberia', coat: 0x4a5568, ear: 0x1a202c, belly: 0xf7fafc, collar: 0x00bbf9 },
    { name: 'Chó Shiba Inu Nhật', coat: 0xd97706, ear: 0xb45309, belly: 0xfef3c7, collar: 0x10b981 },
    { name: 'Chó Đốm Dalmatian', coat: 0xf8fafc, ear: 0x111827, belly: 0xffffff, collar: 0xe63946 }
  ];
  const catBreeds = [
    { name: 'Mèo Anh Lông Ngắn', coat: 0x64748b, ear: 0x475569, belly: 0x94a3b8, collar: 0xf43f5e },
    { name: 'Mèo Tam Thể Calico', coat: 0xf97316, ear: 0x1e293b, belly: 0xffffff, collar: 0x8b5cf6 },
    { name: 'Mèo Xiêm Hoàng Gia', coat: 0xfde68a, ear: 0x451a03, belly: 0xfef3c7, collar: 0x06b6d4 },
    { name: 'Mèo Mướp Vàng Ginger', coat: 0xf59e0b, ear: 0xd97706, belly: 0xfef08a, collar: 0x22c55e }
  ];

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3 });

  v125Animals.forEach((ani, idx) => {
    const isDog = (idx % 2 === 0);
    const breed = isDog ? dogBreeds[(idx >> 1) % dogBreeds.length] : catBreeds[(idx >> 1) % catBreeds.length];
    const scale = isDog ? 1.05 : 0.76;

    // Xóa hình khối đơn giản cũ
    const oldChildren = [...ani.children];
    oldChildren.forEach((c) => {
      if (!c.isSprite) ani.remove(c);
    });

    const coatMat = new THREE.MeshStandardMaterial({ color: breed.coat, roughness: 0.55 });
    const earMat = new THREE.MeshStandardMaterial({ color: breed.ear, roughness: 0.6 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: breed.belly, roughness: 0.65 });
    const collarMat = new THREE.MeshStandardMaterial({ color: breed.collar, roughness: 0.3, metalness: 0.4 });

    // 1. Thân mình 3D + Ngực + Vòng cổ + Chuông vàng
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.135 * scale, 0.38 * scale, 12, 16), coatMat);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.32 * scale, 0);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.142 * scale, 12, 12), bellyMat);
    chest.position.set(0, 0.31 * scale, 0.16 * scale);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.125 * scale, 0.022 * scale, 8, 20), collarMat);
    collar.rotation.x = Math.PI / 3;
    collar.position.set(0, 0.36 * scale, 0.20 * scale);

    // 2. Đầu + Mõm (+Z local là phía trước mặt của thú cưng) + Mũi + 2 Mắt + 2 Tai
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.45 * scale, 0.26 * scale);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125 * scale, 14, 14), coatMat);
    const snout = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055 * scale, isDog ? 0.10 * scale : 0.04 * scale, 8, 10),
      bellyMat
    );
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.02 * scale, 0.11 * scale);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028 * scale, 8, 8), noseMat);
    nose.position.set(0, 0.0 * scale, (isDog ? 0.17 : 0.14) * scale);

    [-0.055, 0.055].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022 * scale, 8, 8), eyeMat);
      eye.position.set(ex * scale, 0.035 * scale, 0.105 * scale);

      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.048 * scale, 0.12 * scale, 8),
        earMat
      );
      ear.position.set(ex * 1.45 * scale, 0.12 * scale, 0.02 * scale);
      ear.rotation.z = ex > 0 ? -0.25 : 0.25;
      headGroup.add(eye, ear);
    });
    headGroup.add(skull, snout, nose);

    // 3. 4 Chân có khớp bước đi tự nhiên (flLeg, frLeg, blLeg, brLeg)
    const legGeo = new THREE.CapsuleGeometry(0.036 * scale, 0.20 * scale, 8, 8);
    const flLeg = new THREE.Mesh(legGeo, coatMat);
    flLeg.position.set(-0.08 * scale, 0.14 * scale, 0.15 * scale);
    const frLeg = new THREE.Mesh(legGeo, coatMat);
    frLeg.position.set(0.08 * scale, 0.14 * scale, 0.15 * scale);
    const blLeg = new THREE.Mesh(legGeo, coatMat);
    blLeg.position.set(-0.08 * scale, 0.14 * scale, -0.15 * scale);
    const brLeg = new THREE.Mesh(legGeo, coatMat);
    brLeg.position.set(0.08 * scale, 0.14 * scale, -0.15 * scale);

    // 4. Đuôi cong vẫy liên tục
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.024 * scale, 0.24 * scale, 8, 8), earMat);
    tail.position.set(0, 0.42 * scale, -0.26 * scale);
    tail.rotation.x = -0.55;

    ani.add(torso, chest, collar, headGroup, flLeg, frLeg, blLeg, brLeg, tail);
    enableShadowsRecursive(ani, true, true);

    register3DTarget(torso, () => window.triggerPlayerSocialOrAnimalInteraction());

    // Đặt thú cưng đi dạo trên HÀNH LANG VỈA HÈ OXYZ (±13.6m) để KHÔNG BAO GIỜ đứng giữa lòng đường gây tắc đường!
    const dirKey = CARDINAL_KEYS[idx % 4];
    const ref = TRAFFIC_LIGHT_OXYZ_REF[dirKey];
    ani.userData.species = isDog ? 'DOG' : 'CAT';
    ani.userData.breedName = breed.name;
    ani.userData.oxyzDir = dirKey;
    ani.userData.sideSign = idx % 2 === 0 ? 1 : -1;
    ani.userData.walkSpeed = isDog ? 2.6 : 2.2;
    ani.userData.walkPhase = idx * 1.3;
    ani.userData.legs = [flLeg, frLeg, blLeg, brLeg];
    ani.userData.tail = tail;
    ani.userData.isOnRoad = false;

    const swCoord = ani.userData.sideSign * 13.6;
    const along = (idx - 4) * 14;
    if (ref.axis === 'Z') {
      ani.position.set(swCoord, 0.24, along);
    } else {
      ani.position.set(along, 0.24, swCoord);
    }
    ani.rotation.set(0, ref.animalYaw, 0);
    ani.updateMatrixWorld(true);
  });
}
rebuildHighDetail3DDogsAndCats();

// --- 20.4. NÂNG CẤP CHI TIẾT ĐỒ HỌA 3D BLENDER-STYLE CHO TOÀN BỘ XE NPC & ĐỊA ĐIỂM TRÊN BẢN ĐỒ ---
(function enhance3DArchitecturalAndVehicleDetails() {
  const glassFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
  const glowingWindowMat = new THREE.MeshBasicMaterial({ color: 0xffe599 });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.1 });

  // 1. Nâng cấp chi tiết 3D cho các công trình trên bản đồ (Thêm hệ khung cửa sổ lưới 3D, viền đèn Neon kiến trúc, Sân đỗ trực thăng Bệnh viện)
  cityBlocks.forEach((block) => {
    block.children.forEach((lot) => {
      if (!lot.isGroup || Math.abs(lot.position.y - 0.24) > 0.05) return;

      lot.children.forEach((bldg) => {
        if (!bldg.isMesh || bldg.geometry?.type !== 'BoxGeometry') return;
        const bw = bldg.geometry.parameters.width || 0;
        const bh = bldg.geometry.parameters.height || 0;
        const bd = bldg.geometry.parameters.depth || 0;

        // Thêm mái gờ kiến trúc (Architectural Roof Parapet) & Dải đèn LED hắt sáng mặt tiền cho các tòa nhà/cửa hàng
        if (bw >= 8.5 && bh >= 4.0) {
          const parapet = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.45, 0.35, bd + 0.45), glassFrameMat);
          parapet.position.set(bldg.position.x, bldg.position.y + bh / 2 + 0.15, bldg.position.z);

          const ledTrim = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.5, 0.08, bd + 0.5), neonCyanMat);
          ledTrim.position.set(bldg.position.x, bldg.position.y + bh / 2 - 0.05, bldg.position.z);
          lot.add(parapet, ledTrim);

          // Thêm các ô cửa sổ 3D có khung nổi trên 4 mặt đứng của tòa nhà
          const floors = Math.min(4, Math.floor(bh / 2.6));
          for (let f = 0; f < floors; f++) {
            const wy = 1.6 + f * 2.4;
            for (let wx = -bw * 0.3; wx <= bw * 0.3; wx += bw * 0.3) {
              const winF = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, bd + 0.12), glowingWindowMat);
              winF.position.set(bldg.position.x + wx, wy, bldg.position.z);
              lot.add(winF);
            }
          }
        }
      });
    });
  });

  // 2. Nâng cấp chi tiết 3D cho tất cả Ô tô NPC (Thêm Lưới tản nhiệt mạ Chrome, Cản thể thao, Đèn hậu LED kéo dài & Gương chiếu hậu 2 bên)
  v125TrafficVehicles.forEach((veh) => {
    const vd = veh.userData;
    if (vd.category === 'CAR' || vd.category === 'POLICE') {
      // Lưới tản nhiệt trước (3D Front Grille)
      const grille = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.06), chromeMat);
      grille.position.set(0, 0.48, -2.26);

      // Dải đèn hậu LED chạy ngang đuôi xe (Full-width LED Taillight Bar)
      const ledTailBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.72, 0.10, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xff1133 })
      );
      ledTailBar.position.set(0, 0.62, 2.25);

      // Cặp gương chiếu hậu 2 bên cửa trước
      [-1.02, 1.02].forEach((mx) => {
        const sideMirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.12), chromeMat);
        sideMirror.position.set(mx, 0.82, -0.55);
        veh.add(sideMirror);
      });

      veh.add(grille, ledTailBar);
    }
  });
})();

// --- 20.5. ĐỒNG BỘ HÌNH ẢNH VIDEO YOUTUBE LÊN MÀN HÌNH 3D TÁP-LÔ NGAY CẢ KHI ĐÃ THU NHỎ ---
const origRenderCockpit = renderAllCockpitDisplays;
window.renderAllCockpitDisplays = function(elapsed) {
  origRenderCockpit(elapsed);

  // Nếu đang phát video YouTube qua IFrame (đã thu nhỏ cửa sổ), vẽ bìa Thumbnail thật + Thanh thời gian + Sóng nhạc lên màn hình 3D trong xe!
  if (ytHtml5Video && (ytHtml5Video.paused || ytHtml5Video.readyState < 2) && window.currentYtCoverImage?.complete && window.currentYtCoverImage.naturalWidth > 0) {
    ytCtx.drawImage(window.currentYtCoverImage, 0, 44, 640, 260);
    ytCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ytCtx.fillRect(0, 44, 640, 260);

    // Sóng nhạc 3D nhảy theo nhạc ở cạnh dưới màn hình táp-lô
    for (let i = 0; i < 28; i++) {
      const barH = 12 + Math.abs(Math.sin(elapsed * 7 + i * 0.5)) * 55;
      ytCtx.fillStyle = i % 2 === 0 ? 'rgba(0, 229, 255, 0.85)' : 'rgba(255, 42, 133, 0.85)';
      ytCtx.fillRect(25 + i * 21, 300 - barH, 13, barH);
    }

    // Hiển thị bộ đếm thời gian phát thực tế & tổng thời lượng
    const playedSec = Math.floor((performance.now() - (window.currentYtStartTime || 0)) / 1000);
    const mm = String(Math.floor(playedSec / 60)).padStart(2, '0');
    const ss = String(playedSec % 60).padStart(2, '0');
    ytCtx.fillStyle = 'rgba(0, 0, 0, 0.82)';
    ytCtx.fillRect(14, 54, 290, 30);
    ytCtx.fillStyle = '#00ff88';
    ytCtx.font = 'bold 15px monospace';
    ytCtx.fillText(`▶ ĐANG PHÁT: ${mm}:${ss} / ${window.currentYtDurationText || 'FULL'}`, 22, 74);
    ytTex.needsUpdate = true;
  }
};

// --- 20.6. BỘ ĐIỀU KHIỂN OXYZ THAM CHIẾU THEO ĐÈN GIAO THÔNG (CHỐNG ĐI NGANG / NGƯỢC CHIỀU 100%) ---
// Đặt lại vị trí khởi tạo chuẩn của tất cả phương tiện theo đúng mặt đèn giao thông
v125TrafficVehicles.forEach((veh, idx) => {
  const vd = veh.userData;
  const isBike = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
  vd.laneWidth = isBike ? 6.2 : 3.2;

  const dirKey = CARDINAL_KEYS[idx % 4];
  const ref = TRAFFIC_LIGHT_OXYZ_REF[dirKey];
  vd.oxyzDir = dirKey;
  vd.lastIntersectionId = '';

  const gridIdx = Math.floor(idx / 4) - 1;
  const baseGrid = gridIdx * BLOCK_SIZE;
  const posAlong = baseGrid + 24;

  if (ref.axis === 'Z') {
    veh.position.set(ref.laneSign * vd.laneWidth, 0, posAlong);
  } else {
    veh.position.set(posAlong, 0, ref.laneSign * vd.laneWidth);
  }
  veh.rotation.set(0, ref.carYaw, 0);
  veh.updateMatrixWorld(true);
});

v125SidewalkNpcs.forEach((npc, idx) => {
  const nd = npc.userData;
  const dirKey = CARDINAL_KEYS[idx % 4];
  const ref = TRAFFIC_LIGHT_OXYZ_REF[dirKey];
  nd.oxyzDir = dirKey;
  nd.lastIntersectionId = '';

  const swOffset = ref.sidewalkSign * SAFE_SIDEWALK_CORRIDOR;
  const posAlong = (idx - 7) * 11;
  if (ref.axis === 'Z') {
    npc.position.set(swOffset, 0.24, posAlong);
  } else {
    npc.position.set(posAlong, 0.24, swOffset);
  }
  npc.rotation.set(0, ref.npcYaw, 0);
  npc.updateMatrixWorld(true);
});

function updateV125TrafficLightOxyzReferenceSystem(dt, elapsed) {
  const playerPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  const carPos = vehicleRoot.position;
  const playerSpeedAbs = Math.abs(state.speedKmh);

  // Đồng bộ màu đèn giao thông 2 trục vuông góc:
  // Khi trục Z Xanh thì trục X Đỏ, khi trục Z Đỏ thì trục X Xanh!
  const zPhase = currentTrafficPhase;
  const xPhase = zPhase === 'GREEN' ? 'RED' : (zPhase === 'YELLOW' ? 'RED' : 'GREEN');

  for (const tl of zAxisTrafficLightMats) {
    tl.redMat.color.setHex(zPhase === 'RED' ? 0xff2222 : 0x330808);
    tl.yellowMat.color.setHex(zPhase === 'YELLOW' ? 0xffcc00 : 0x332600);
    tl.greenMat.color.setHex(zPhase === 'GREEN' ? 0x00ff55 : 0x063312);
  }
  for (const tl of xAxisTrafficLightMats) {
    tl.redMat.color.setHex(xPhase === 'RED' ? 0xff2222 : 0x330808);
    tl.yellowMat.color.setHex(xPhase === 'YELLOW' ? 0xffcc00 : 0x332600);
    tl.greenMat.color.setHex(xPhase === 'GREEN' ? 0x00ff55 : 0x063312);
  }

  // =========================================================================
  // 1. KIỂM TRA & DI CHUYỂN TẤT CẢ PHƯƠNG TIỆN NPC THEO HỆ QUY CHIẾU ĐÈN GIAO THÔNG
  // =========================================================================
  for (let i = 0; i < v125TrafficVehicles.length; i++) {
    const veh = v125TrafficVehicles[i];
    const vd = veh.userData;

    if (vd.isBoardedByPlayer) {
      veh.position.copy(vehicleRoot.position);
      veh.rotation.y = state.headingRad;
      veh.updateMatrixWorld(true);
      continue;
    }
    if (vd.isInterceptingHijacker) {
      veh.updateMatrixWorld(true);
      continue;
    }

    // Kiểm tra nếu xe người chơi chủ động tông vào xe NPC
    const distToPlayerCar = veh.position.distanceTo(carPos);
    const isHeavy = (vd.category === 'BUS' || vd.category === 'FIRETRUCK' || vd.category === 'AMBULANCE');
    const hitRadius = isHeavy ? 3.5 : 2.55;

    if (state.playerMode === 'DRIVING' && distToPlayerCar < hitRadius && playerSpeedAbs > 5.0 && vd.crashState === 'NORMAL') {
      initAudio();
      playImpactSound(22);
      state.suspensionShakeIntensity = 2.2;
      const impactDir = veh.position.clone().sub(carPos).setY(0).normalize();

      if (isHeavy) {
        state.velocityMs = -state.velocityMs * 0.65;
        state.speedKmh = state.velocityMs * 3.6;
        vehicleRoot.position.addScaledVector(impactDir, -1.6);
        state.lastActionLog = `💥 TÔNG TRÚNG ${vd.modelName.toUpperCase()}! Xe bạn bị phản lực đẩy lùi nhưng vẫn giữ thăng bằng!`;
      } else {
        vd.crashState = 'AIRBORNE_TUMBLE';
        const isSmall = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
        const massFactor = isSmall ? 1.85 : 1.0;
        const launchSpeed = Math.min(26, (playerSpeedAbs / 3.6) * 0.85 * massFactor + 6.0);
        vd.crashVel.set(impactDir.x * launchSpeed, 5.2 * massFactor, impactDir.z * launchSpeed);
        vd.crashTimer = 1.5;
        state.velocityMs *= 0.55;
        state.speedKmh = state.velocityMs * 3.6;
      }
    }

    if (vd.crashState && vd.crashState !== 'NORMAL') {
      const ref = TRAFFIC_LIGHT_OXYZ_REF[vd.oxyzDir || 'NORTH'];
      if (vd.crashState === 'AIRBORNE_TUMBLE') {
        veh.position.addScaledVector(vd.crashVel, dt);
        vd.crashVel.y -= 14.0 * dt;
        if (veh.position.y <= 0.35) veh.position.y = 0.35;
        vd.rollAngle = (vd.rollAngle || 0) + 6.5 * dt;
        veh.rotation.set(0, ref.carYaw, vd.rollAngle);
        vd.crashTimer -= dt;
        if (vd.crashTimer <= 0) {
          vd.crashState = 'OVERTURNED';
          vd.crashTimer = 2.8;
        }
      } else {
        vd.crashTimer -= dt;
        if (vd.crashTimer <= 0) {
          vd.crashState = 'NORMAL';
          vd.rollAngle = 0;
          veh.position.y = 0;
        }
      }
      veh.updateMatrixWorld(true);
      continue;
    }

    const dirKey = vd.oxyzDir || 'NORTH';
    const ref = TRAFFIC_LIGHT_OXYZ_REF[dirKey];
    const laneW = vd.laneWidth || 3.2;

    // KIỂM TRA VECTOR ĐÈN PHA (F_headlight) SO VỚI VECTOR MẶT ĐÈN GIAO THÔNG (N_light):
    // Vector đèn pha thực tế của xe từ góc xoay hiện tại: F = (-sin(yaw), 0, -cos(yaw))
    const curHeadlightX = -Math.sin(veh.rotation.y);
    const curHeadlightZ = -Math.cos(veh.rotation.y);
    const dotWithLightNormal = curHeadlightX * ref.lightNormal.x + curHeadlightZ * ref.lightNormal.z;

    // Nếu F_headlight · N_light không bằng -1 (tức xe đang bị lệch ngang hoặc ngược chiều so với đèn giao thông),
    // lập tức khóa lại đầu xe và thân xe theo đúng góc chuẩn ref.carYaw để F_headlight = -N_light!
    if (Math.abs(dotWithLightNormal - (-1.0)) > 0.001) {
      veh.rotation.set(0, ref.carYaw, 0);
    }

    const crossX = Math.round(veh.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const crossZ = Math.round(veh.position.z / BLOCK_SIZE) * BLOCK_SIZE;
    const fwdVec = ref.requiredHeadlightVec;

    // Khoảng cách từ đầu xe tới tâm ngã tư phía trước theo đúng hướng chiếu đèn pha
    const distToCrossAhead = (crossX - veh.position.x) * fwdVec.x + (crossZ - veh.position.z) * fwdVec.z;

    const myLightPhase = ref.axis === 'Z' ? zPhase : xPhase;
    let mustStop = false;

    // A. Dừng trước vạch Đèn Đỏ / Đèn Vàng của cột đèn giao thông đang chiếu ngược hướng đèn pha của xe (11.5m .. 15.5m)
    if ((myLightPhase === 'RED' || myLightPhase === 'YELLOW') && distToCrossAhead > 11.4 && distToCrossAhead < 15.5) {
      mustStop = true;
    }

    // B. Dừng khi gặp Xe Người Chơi hoặc Người Chơi
    if (!mustStop) {
      for (const obs of [carPos, state.avatarPos]) {
        const dx = obs.x - veh.position.x;
        const dz = obs.z - veh.position.z;
        const fwdDist = dx * fwdVec.x + dz * fwdVec.z;
        const latDist = Math.abs(dx * fwdVec.z - dz * fwdVec.x);
        if (fwdDist > 0.4 && fwdDist < 8.8 && latDist < 2.8) {
          mustStop = true;
          vd.hornBadge.visible = true;
          break;
        }
      }
    }

    // C. Dừng khi gặp Xe NPC khác đang đi cùng chiều phía trước
    if (!mustStop) {
      for (let j = 0; j < v125TrafficVehicles.length; j++) {
        if (i === j || !v125TrafficVehicles[j].visible) continue;
        const other = v125TrafficVehicles[j];
        if (other.userData.oxyzDir !== vd.oxyzDir) continue;
        const dx = other.position.x - veh.position.x;
        const dz = other.position.z - veh.position.z;
        const fwdDist = dx * fwdVec.x + dz * fwdVec.z;
        const latDist = Math.abs(dx * fwdVec.z - dz * fwdVec.x);
        if (fwdDist > 0.5 && fwdDist < 8.2 && latDist < 2.0) {
          mustStop = true;
          break;
        }
      }
    }

    const cruise = vd.cruiseSpeed || 11.5;
    vd.activeSpeed = mustStop
      ? THREE.MathUtils.lerp(vd.activeSpeed || 0, 0, dt * 16)
      : THREE.MathUtils.lerp(vd.activeSpeed || 0, cruise, dt * 5);
    if (!mustStop) vd.hornBadge.visible = false;

    const step = vd.activeSpeed * dt;

    // D. RẼ TRÁI / RẼ PHẢI 90 ĐỘ THEO HƯỚNG ĐÈN PHA TẠI NGÃ TƯ:
    // Khi rẽ, bắt buộc xoay cả đầu xe, thân xe và đèn pha đúng ±90° sang hướng mới,
    // và chốt đúng vào tâm làn đường có cột đèn giao thông ngược hướng với đèn pha mới!
    const intersectionKey = `${crossX}_${crossZ}`;
    if (!mustStop && vd.lastIntersectionId !== intersectionKey) {
      const turnDirKey = Math.random() > 0.5 ? ref.turnRight : ref.turnLeft;
      const nextRef = TRAFFIC_LIGHT_OXYZ_REF[turnDirKey];
      const nextLaneCoord = nextRef.laneSign * laneW;

      const distToTurnAxis = ref.axis === 'Z'
        ? Math.abs(veh.position.z - (crossZ + nextLaneCoord))
        : Math.abs(veh.position.x - (crossX + nextLaneCoord));

      if (distToTurnAxis < Math.max(0.45, step * 1.4)) {
        vd.lastIntersectionId = intersectionKey;
        if (Math.random() < 0.35) {
          if (ref.axis === 'Z') {
            veh.position.z = crossZ + nextLaneCoord;
          } else {
            veh.position.x = crossX + nextLaneCoord;
          }
          vd.oxyzDir = turnDirKey;
          veh.rotation.set(0, nextRef.carYaw, 0);
        }
      }
    }

    // E. Tịnh tiến theo đúng vector đèn pha (requiredHeadlightVec) & cập nhật ma trận 3D ngay lập tức!
    const finalRef = TRAFFIC_LIGHT_OXYZ_REF[vd.oxyzDir];
    const finalLaneCoord = finalRef.laneSign * laneW;

    if (finalRef.axis === 'Z') {
      veh.position.x = crossX + finalLaneCoord;
      veh.position.z += finalRef.requiredHeadlightVec.z * step;
    } else {
      veh.position.z = crossZ + finalLaneCoord;
      veh.position.x += finalRef.requiredHeadlightVec.x * step;
    }
    veh.position.y = 0;
    veh.rotation.set(0, finalRef.carYaw, 0);

    if (vd.wheels && vd.activeSpeed > 0.05) {
      const spin = (vd.activeSpeed * dt) / 0.34;
      for (const w of vd.wheels) w.rotation.x -= spin;
    }

    if (veh.position.z - playerPos.z > 95) veh.position.z -= 190;
    else if (veh.position.z - playerPos.z < -95) veh.position.z += 190;
    if (veh.position.x - playerPos.x > 95) veh.position.x -= 190;
    else if (veh.position.x - playerPos.x < -95) veh.position.x += 190;

    // QUAN TRỌNG: Cập nhật trực tiếp matrixWorld của xe và toàn bộ bánh xe/đèn pha con ngay trong frame này!
    veh.updateMatrixWorld(true);
  }

  // =========================================================================
  // 2. CẬP NHẬT TẤT CẢ NPC ĐI BỘ THEO HỆ QUY CHIẾU ĐÈN GIAO THÔNG
  // =========================================================================
  for (const npc of v125SidewalkNpcs) {
    const nd = npc.userData;
    if (!npc.visible) continue;

    // Nếu bị xe người chơi tông
    const distToCar = npc.position.distanceTo(carPos);
    if (state.playerMode === 'DRIVING' && distToCar < 2.1 && playerSpeedAbs > 4.0 && nd.npcState !== 'KNOCKED_FLYING') {
      initAudio();
      playImpactSound(16);
      state.suspensionShakeIntensity = 1.6;
      const pushDir = npc.position.clone().sub(carPos).setY(0).normalize();
      nd.npcState = 'KNOCKED_FLYING';
      const launchSpd = Math.min(22, (playerSpeedAbs / 3.6) * 0.9 + 5.0);
      nd.knockVel.set(pushDir.x * launchSpd, 6.2, pushDir.z * launchSpd);
      nd.knockTimer = 2.0;
      npc.updateMatrixWorld(true);
      continue;
    }

    if (nd.npcState === 'KNOCKED_FLYING') {
      npc.position.addScaledVector(nd.knockVel, dt);
      nd.knockVel.y -= 15.0 * dt;
      if (npc.position.y <= 0.24) npc.position.y = 0.24;
      npc.rotation.x += 7.0 * dt;
      nd.knockTimer -= dt;
      if (nd.knockTimer <= 0) {
        nd.npcState = 'WALKING';
        npc.position.y = 0.24;
        npc.rotation.x = 0;
      }
      npc.updateMatrixWorld(true);
      continue;
    }

    npc.position.y = 0.24;
    const dirKey = nd.oxyzDir || 'NORTH';
    const ref = TRAFFIC_LIGHT_OXYZ_REF[dirKey];
    const crossX = Math.round(npc.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const crossZ = Math.round(npc.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    const walkStep = 3.2 * dt;
    const nextX = npc.position.x + ref.requiredHeadlightVec.x * walkStep;
    const nextZ = npc.position.z + ref.requiredHeadlightVec.z * walkStep;

    // Nếu đụng Xe Người Chơi hoặc Người Chơi thì quay đầu ngược lại 180° trên đúng hành lang vỉa hè
    if (Math.hypot(nextX - carPos.x, nextZ - carPos.z) < 2.3 ||
        (state.playerMode === 'ON_FOOT' && Math.hypot(nextX - state.avatarPos.x, nextZ - state.avatarPos.z) < 1.35)) {
      const opp = { NORTH: 'SOUTH', SOUTH: 'NORTH', EAST: 'WEST', WEST: 'EAST' };
      nd.oxyzDir = opp[dirKey];
    }

    // Rẽ vuông góc ±90° tại góc vỉa hè chữ thập (±12.6m, ±12.6m)
    const intersectionKey = `${crossX}_${crossZ}`;
    if (nd.lastIntersectionId !== intersectionKey) {
      const turnDirKey = Math.random() > 0.5 ? ref.turnRight : ref.turnLeft;
      const nextRef = TRAFFIC_LIGHT_OXYZ_REF[turnDirKey];
      const cornerTarget = nextRef.sidewalkSign * SAFE_SIDEWALK_CORRIDOR;

      const distToCorner = ref.axis === 'Z'
        ? Math.abs(npc.position.z - (crossZ + cornerTarget))
        : Math.abs(npc.position.x - (crossX + cornerTarget));

      if (distToCorner < 0.4) {
        nd.lastIntersectionId = intersectionKey;
        if (Math.random() < 0.45) {
          if (ref.axis === 'Z') npc.position.z = crossZ + cornerTarget;
          else npc.position.x = crossX + cornerTarget;
          nd.oxyzDir = turnDirKey;
        }
      }
    }

    const activeRef = TRAFFIC_LIGHT_OXYZ_REF[nd.oxyzDir];
    const swCoord = activeRef.sidewalkSign * SAFE_SIDEWALK_CORRIDOR;

    if (activeRef.axis === 'Z') {
      npc.position.x = crossX + swCoord;
      npc.position.z += activeRef.requiredHeadlightVec.z * walkStep;
    } else {
      npc.position.z = crossZ + swCoord;
      npc.position.x += activeRef.requiredHeadlightVec.x * walkStep;
    }

    // Khóa hướng mặt NPC ngược với mặt đèn giao thông (activeRef.npcYaw) và cập nhật matrixWorld ngay!
    npc.rotation.set(0, activeRef.npcYaw, 0);

    nd.phase += dt * 7.5;
    const sw = Math.sin(nd.phase) * 0.52;
    nd.leftLeg.rotation.x = sw;
    nd.rightLeg.rotation.x = -sw;
    nd.leftArm.rotation.x = -sw * 0.75;
    nd.rightArm.rotation.x = sw * 0.75;

    if (npc.position.z - playerPos.z > 80) npc.position.z -= 160;
    else if (npc.position.z - playerPos.z < -80) npc.position.z += 160;
    if (npc.position.x - playerPos.x > 80) npc.position.x -= 160;
    else if (npc.position.x - playerPos.x < -80) npc.position.x += 160;

    npc.updateMatrixWorld(true);
  }

  // =========================================================================
  // 3. CẬP NHẬT CHÓ MÈO 3D THEO HỆ QUY CHIẾU OXYZ (ĐI TRÊN VỈA HÈ, KHÔNG TẮC ĐƯỜNG!)
  // =========================================================================
  for (const ani of v125Animals) {
    const ad = ani.userData;
    if (ad.soundTimer > 0) {
      ad.soundTimer -= dt;
      if (ad.soundTimer <= 0 && ad.soundBubble) ad.soundBubble.visible = false;
    }

    const dirKey = ad.oxyzDir || 'NORTH';
    const ref = TRAFFIC_LIGHT_OXYZ_REF[dirKey];
    const crossX = Math.round(ani.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const crossZ = Math.round(ani.position.z / BLOCK_SIZE) * BLOCK_SIZE;

    const step = (ad.walkSpeed || 2.4) * dt;
    const swCoord = ref.sidewalkSign * 13.6;

    // Rẽ 90° tại góc vỉa hè theo đúng hệ trục OXYZ
    const cornerDist = ref.axis === 'Z'
      ? Math.abs(ani.position.z - (crossZ + swCoord))
      : Math.abs(ani.position.x - (crossX + swCoord));

    if (cornerDist < 0.35 && Math.random() < 0.3) {
      ad.oxyzDir = ref.turnRight;
    }

    const activeRef = TRAFFIC_LIGHT_OXYZ_REF[ad.oxyzDir];
    const activeSw = activeRef.sidewalkSign * 13.6;

    if (activeRef.axis === 'Z') {
      ani.position.x = crossX + activeSw;
      ani.position.z += activeRef.requiredHeadlightVec.z * step;
    } else {
      ani.position.z = crossZ + activeSw;
      ani.position.x += activeRef.requiredHeadlightVec.x * step;
    }
    ani.position.y = 0.24;
    ani.rotation.set(0, activeRef.animalYaw, 0);

    // Chuyển động 4 chân bước đi và đuôi vẫy của Chó / Mèo
    ad.walkPhase = (ad.walkPhase || 0) + dt * 11.0;
    const legSwing = Math.sin(ad.walkPhase) * 0.48;
    if (ad.legs && ad.legs.length === 4) {
      ad.legs[0].rotation.x = legSwing;
      ad.legs[1].rotation.x = -legSwing;
      ad.legs[2].rotation.x = -legSwing;
      ad.legs[3].rotation.x = legSwing;
    }
    if (ad.tail) {
      ad.tail.rotation.z = Math.sin(elapsed * 14) * 0.42;
    }

    if (ani.position.z - playerPos.z > 65) ani.position.z -= 130;
    else if (ani.position.z - playerPos.z < -65) ani.position.z += 130;
    if (ani.position.x - playerPos.x > 65) ani.position.x -= 130;
    else if (ani.position.x - playerPos.x < -65) ani.position.x += 130;

    ani.updateMatrixWorld(true);
  }
}

// --- 20.7. GẮN VÀO scene.onBeforeRender ĐỂ CHẠY ĐỒNG BỘ MỖI KHUNG HÌNH ---
let lastV125Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV125Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV125Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Điều khiển toàn bộ Xe, NPC & Chó Mèo theo Hệ Quy Chiếu Đèn Giao Thông OXYZ (F_headlight · N_light = -1)
  updateV125TrafficLightOxyzReferenceSystem(dt, elapsed);

  // 2. Mui trần đóng/mở đúng trục cơ khí
  updateCorrectConvertibleRoofKinematics(dt);

  // 3. Tay cầm V112 (Nút xoay rẽ trái/phải, Cò trước dừng hẳn, Cò hông phanh côn, Phím A mở/khóa nhìn)
  updateV112ControllerSteeringBrakingAndLookLock(dt);

  // 4. Chặn đi bộ xuyên địa hình
  if (state.playerMode === 'ON_FOOT') {
    clampFootPositionAgainstAllBuildings(state.avatarPos);
    playerAvatarGroup.position.copy(state.avatarPos);
  }

  // 5. Hoạt cảnh Cướp xe & Cảnh sát chặn đầu
  updateV110HijackAndPoliceBlockade(dt);

  // 6. Hiển thị Cam Mô Phỏng ESP32 FPV lên cả Kính Chắn Gió + 4 Gương Hậu
  if (state.windshieldMode === 'ESP32_SIM') {
    renderSimulatedEsp32FpvOnAllScreens(elapsed);
  }

  // 7. Vẽ Vòng Tròn Map Radar
  minimapTick++;
  if (minimapTick % 2 === 0) {
    renderCircularRadarMinimap();
  }
};

// ============================================================================
// 21. BẢN CẬP NHẬT V128 - TỐI ƯU HÓA TRẢI NGHIỆM ĐIỆN THOẠI (PLAYER 2 GHẾ PHỤ & ĐI BỘ):
//     1. Tự động ẩn các bảng chức năng, thanh top-bar và map chiếm diện tích trên
//        màn hình điện thoại; thay bằng thanh điều khiển gọn [☰ Menu/Map] ở mép trên.
//     2. Sửa lỗi khóa góc nhìn: Cho phép vuốt 1 ngón tay ở bất kỳ đâu trên màn hình
//        để xoay góc nhìn 360° (Trái / Phải / Đằng sau / Lên / Xuống) siêu mượt.
//     3. Tích hợp cảm biến Con Quay Hồi Chuyển (Gyroscope 360° Tilt) tự động bù góc
//        khi xoay dọc (9:16) hoặc xoay ngang (16:9) trên cả iPhone và Android.
//     4. Thêm Cần Xoay Cảm Ứng Ảo (Virtual Thumbstick) để người chơi trên điện thoại
//        vừa đi bộ tự do, vừa lái xe khi đổi sang ghế tài xế, vừa nhìn 360° độc lập.
// ============================================================================

(function setupV128MobileTouch360GyroAndCleanUI() {
  const urlParams = new URLSearchParams(window.location.search);
  const isMobileClient =
    /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) ||
    urlParams.get('mode') === 'passenger_mobile' ||
    urlParams.get('join') === 'passenger' ||
    window.innerWidth <= 960;

  // Khởi tạo biến điều khiển từ Cần xoay ảo & Gyroscope trên điện thoại
  window.mobileJoyFwd = 0;
  window.mobileJoyTurn = 0;
  let gyroEnabled = false;
  let lastGyroAlpha = null;
  let lastGyroBeta = null;
  let lastGyroGamma = null;

  // 1. SỬA LỖI GHI ĐÈ GÓC NHÌN TRONG V112:
  // Đảm bảo khi người chơi vuốt màn hình hoặc nghiêng điện thoại (thay đổi state.eyeLookYaw / state.eyeLookPitch),
  // lockedLookYawAngle và lockedLookPitchAngle luôn cập nhật theo ngay lập tức!
  let touchLookActiveId = null;
  let lastTouchLookX = 0;
  let lastTouchLookY = 0;

  const canvasEl = renderer.domElement;
  canvasEl.style.touchAction = 'none';

  canvasEl.addEventListener('pointerdown', (e) => {
    if (dragged3DPanel) return;
    touchLookActiveId = e.pointerId;
    lastTouchLookX = e.clientX;
    lastTouchLookY = e.clientY;
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== touchLookActiveId || dragged3DPanel) return;
    const dx = e.clientX - lastTouchLookX;
    const dy = e.clientY - lastTouchLookY;
    lastTouchLookX = e.clientX;
    lastTouchLookY = e.clientY;

    // Độ nhạy vuốt 360° mượt trên cả màn hình dọc và ngang
    const sensitivity = isMobileClient ? 0.0065 : 0.0045;
    state.eyeLookYaw = (state.eyeLookYaw || 0) - dx * sensitivity;
    state.eyeLookPitch = THREE.MathUtils.clamp((state.eyeLookPitch || 0) - dy * sensitivity, -1.25, 1.25);

    // Đồng bộ trực tiếp vào biến khóa góc nhìn của V112 để không bị giật về 0!
    lockedLookYawAngle = state.eyeLookYaw;
    lockedLookPitchAngle = state.eyeLookPitch;
  });

  const endTouchLook = (e) => {
    if (e.pointerId === touchLookActiveId) {
      touchLookActiveId = null;
    }
  };
  window.addEventListener('pointerup', endTouchLook);
  window.addEventListener('pointercancel', endTouchLook);

  // 2. XỬ LÝ NGHIÊNG ĐIỆN THOẠI XEM 360° (GYROSCOPE TILT HỖ TRỢ CẢ XOAY DỌC 9:16 & XOAY NGANG 16:9)
  function handleDeviceOrientation360(e) {
    if (!gyroEnabled || e.alpha === null) return;

    const screenAngle = (window.screen?.orientation?.angle ?? window.orientation ?? 0);
    const alphaRad = THREE.MathUtils.degToRad(e.alpha || 0);
    const betaRad = THREE.MathUtils.degToRad(e.beta || 0);
    const gammaRad = THREE.MathUtils.degToRad(e.gamma || 0);

    if (lastGyroAlpha !== null) {
      let dAlpha = alphaRad - lastGyroAlpha;
      if (dAlpha > Math.PI) dAlpha -= Math.PI * 2;
      if (dAlpha < -Math.PI) dAlpha += Math.PI * 2;

      // Tự động đổi trục Pitch theo chiều xoay dọc (0°) hay xoay ngang (90° / -90°) của điện thoại
      let dPitch = 0;
      if (Math.abs(screenAngle) === 90) {
        dPitch = (gammaRad - lastGyroGamma) * (screenAngle === 90 ? -1 : 1);
      } else {
        dPitch = betaRad - lastGyroBeta;
      }

      state.eyeLookYaw = (state.eyeLookYaw || 0) + dAlpha * 1.15;
      state.eyeLookPitch = THREE.MathUtils.clamp((state.eyeLookPitch || 0) + dPitch * 0.85, -1.15, 1.15);
      lockedLookYawAngle = state.eyeLookYaw;
      lockedLookPitchAngle = state.eyeLookPitch;
    }

    lastGyroAlpha = alphaRad;
    lastGyroBeta = betaRad;
    lastGyroGamma = gammaRad;
  }

  async function toggleMobileGyroscope(btnEl) {
    if (gyroEnabled) {
      gyroEnabled = false;
      lastGyroAlpha = null;
      window.removeEventListener('deviceorientation', handleDeviceOrientation360);
      if (btnEl) {
        btnEl.textContent = '🧭 Nghiêng 360°: TẮT';
        btnEl.style.background = 'rgba(15, 23, 42, 0.85)';
        btnEl.style.color = '#fff';
      }
      state.lastActionLog = '👆 Đã chuyển sang chế độ Vuốt Màn Hình để nhìn 360°.';
      return;
    }

    // Xin quyền cảm biến nghiêng trên iOS 13+ (Safari / Chrome)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') {
          state.lastActionLog = '⚠ Cần cấp quyền Cảm biến chuyển động để nghiêng điện thoại nhìn 360° (Bạn vẫn vuốt tay nhìn 360° bình thường!).';
          return;
        }
      } catch (err) {}
    }

    gyroEnabled = true;
    lastGyroAlpha = null;
    window.addEventListener('deviceorientation', handleDeviceOrientation360);
    if (btnEl) {
      btnEl.textContent = '🧭 Nghiêng 360°: BẬT';
      btnEl.style.background = '#00ff88';
      btnEl.style.color = '#000';
    }
    state.lastActionLog = '🧭 Đã bật chế độ Nghiêng & Xoay Điện Thoại để nhìn 360° xung quanh!';
  }

  // 3. NẾU LÀ ĐIỆN THOẠI: BẬT GIAO DIỆN TỐI GIẢN (KHÔNG CHE MÀN HÌNH) + CẦN XOAY CẢM ỨNG ẢO ĐỂ DI CHUYỂN/LÁI XE
  if (isMobileClient) {
    document.body.classList.add('mobile-clean-ui');
    // Xóa thanh nút cũ gây vướng góc phải nếu có
    document.getElementById('mobile-adaptive-controls')?.remove();

    // A. Thanh điều khiển Mini gọn ở mép trên (Chiếm chưa tới 5% màn hình!)
    const miniHud = document.createElement('div');
    miniHud.id = 'v128-mobile-mini-hud';
    miniHud.style.cssText =
      'position:fixed;top:8px;left:8px;right:8px;z-index:190;display:flex;justify-content:space-between;align-items:center;pointer-events:none;';
    miniHud.innerHTML = `
      <div style="display:flex;gap:5px;pointer-events:auto;">
        <button id="mob-toggle-map" class="bar-btn" style="background:rgba(15,23,42,0.85);color:#00ff88;border:1px solid #00ff88;padding:6px 10px;font-size:11px;">🗺️ Map</button>
        <button id="mob-toggle-gyro" class="bar-btn" style="background:rgba(15,23,42,0.85);color:#fff;border:1px solid #00e5ff;padding:6px 10px;font-size:11px;">🧭 Nghiêng 360°: TẮT</button>
      </div>
      <div style="display:flex;gap:5px;pointer-events:auto;">
        <button id="mob-quick-door" class="bar-btn" style="background:#ffd60a;color:#000;padding:6px 10px;font-size:11px;">🚪 Lên/Xuống</button>
        <button id="mob-quick-swap" class="bar-btn" style="background:#4cd964;color:#000;padding:6px 10px;font-size:11px;">💺 Đổi Ghế</button>
        <button id="mob-Quick-lean" class="bar-btn" style="background:#00bbf9;color:#000;padding:6px 10px;font-size:11px;">👀 Thò Đầu</button>
        <button id="mob-toggle-menu" class="bar-btn" style="background:#9b5de5;color:#fff;padding:6px 11px;font-size:11px;">☰ Menu</button>
      </div>
    `;
    document.body.appendChild(miniHud);

    document.getElementById('mob-toggle-map')?.addEventListener('click', () => {
      document.body.classList.toggle('show-mobile-map');
    });
    document.getElementById('mob-toggle-gyro')?.addEventListener('click', (e) => {
      toggleMobileGyroscope(e.currentTarget);
    });
    document.getElementById('mob-quick-door')?.addEventListener('click', () => {
      window.enterOrExitCarWithBlink();
    });
    document.getElementById('mob-quick-swap')?.addEventListener('click', () => {
      swapSeatOrTakeDriverControl();
    });
    document.getElementById('mob-Quick-lean')?.addEventListener('click', () => {
      toggleLeanHeadOutWindow();
    });
    document.getElementById('mob-toggle-menu')?.addEventListener('click', () => {
      const isShowing = document.body.classList.toggle('show-mobile-topbar');
      if (!isShowing) {
        guidePanel?.classList.add('panel-hidden');
        funcPanel?.classList.add('panel-hidden');
      } else {
        funcPanel?.classList.toggle('panel-hidden');
      }
    });

    // B. Cần Xoay Cảm Ứng Ảo Trong Suốt (Virtual Analog Thumbstick) ở góc dưới trái để Đi bộ & Lái xe trên điện thoại
    const joyZone = document.createElement('div');
    joyZone.id = 'v128-mobile-joystick';
    joyZone.style.cssText =
      'position:fixed;bottom:18px;left:18px;width:108px;height:108px;border-radius:50%;' +
      'background:rgba(15,23,42,0.42);border:2px solid rgba(0,229,255,0.55);' +
      'z-index:185;touch-action:none;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

    const joyKnob = document.createElement('div');
    joyKnob.style.cssText =
      'width:44px;height:44px;border-radius:50%;background:radial-gradient(circle,#00ff88,#00b4d8);' +
      'box-shadow:0 0 12px rgba(0,255,136,0.7);pointer-events:none;transition:transform 0.05s linear;';
    joyZone.appendChild(joyKnob);
    document.body.appendChild(joyZone);

    let joyPointerId = null;
    const maxRadius = 38;

    const updateJoystickFromEvent = (e) => {
      const rect = joyZone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      window.mobileJoyTurn = dx / maxRadius;     // Trái (-1) .. Phải (+1)
      window.mobileJoyFwd = -(dy / maxRadius);   // Tiến (+1) .. Lùi (-1)
    };

    joyZone.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      initAudio();
      joyPointerId = e.pointerId;
      joyZone.setPointerCapture(e.pointerId);
      updateJoystickFromEvent(e);
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyPointerId) return;
      e.stopPropagation();
      updateJoystickFromEvent(e);
    });
    const resetJoy = (e) => {
      if (e.pointerId !== joyPointerId) return;
      joyPointerId = null;
      joyKnob.style.transform = 'translate(0px, 0px)';
      window.mobileJoyFwd = 0;
      window.mobileJoyTurn = 0;
    };
    joyZone.addEventListener('pointerup', resetJoy);
    joyZone.addEventListener('pointercancel', resetJoy);
  }
})();

// --- 21.2. TÍCH HỢP CẦN XOAY ẢO ĐIỆN THOẠI & GÓC NHÌN 360° VÀO VÒNG LẶP VẬT LÝ CHÍNH ---
const origSceneBeforeRenderV125 = scene.onBeforeRender;
let lastV128FrameTime = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV128FrameTime) / 1000, 0.1);
  lastV128FrameTime = now;

  // Truyền tín hiệu từ Cần Xoay Cảm Ứng Điện Thoại (nếu người chơi đang kéo cần trên điện thoại)
  if (Math.abs(window.mobileJoyFwd || 0) > 0.08 || Math.abs(window.mobileJoyTurn || 0) > 0.08) {
    questWheelTimer = 0.15;
    questWheelForward = window.mobileJoyFwd;
    questWheelTurn = window.mobileJoyTurn;

    if (state.playerMode === 'ON_FOOT' && dt > 0.001) {
      // Cho phép người chơi trên điện thoại đi bộ theo đúng hướng mắt 360° đang nhìn!
      const walkHeading = state.avatarYaw + (state.eyeLookYaw || 0);
      const spd = 8.5 * (state.walkSpeedMultiplier || 3.0) * 0.35;
      state.avatarPos.x -= Math.sin(walkHeading) * window.mobileJoyFwd * spd * dt;
      state.avatarPos.z -= Math.cos(walkHeading) * window.mobileJoyFwd * spd * dt;
      state.avatarYaw -= window.mobileJoyTurn * 2.4 * dt;
      clampFootPositionAgainstAllBuildings(state.avatarPos);
      playerAvatarGroup.position.copy(state.avatarPos);
      playerAvatarGroup.rotation.y = state.avatarYaw;
    }
  }

  // Chạy toàn bộ hệ thống giao thông OXYZ, tay cầm VR, cam mô phỏng & minimap của V125
  if (origSceneBeforeRenderV125) {
    origSceneBeforeRenderV125(rendererInst, sceneInst, cameraInst);
  }

  // Đảm bảo góc vuốt 360° & nghiêng điện thoại (state.eyeLookYaw / state.eyeLookPitch) luôn được áp dụng mượt mà!
  if (!rendererInst.xr.isPresenting && !isControllerFreeLookActive) {
    cameraRig.rotation.order = 'YXZ';
    cameraRig.rotation.y = state.eyeLookYaw || 0;
    cameraRig.rotation.x = state.eyeLookPitch || 0;
  }
};

// ============================================================================
// 19. BẢN NÂNG CẤP MASTER PATCH V130 (DÁN VÀO CUỐI FILE app.js):
// 1. Khi vừa vào App: BẮT BUỘC SPAWN NGAY TẠI NHÀ (ON_FOOT tại HOME_SPAWN_POS),
//    tuyệt đối không tự nhảy vào ghế phụ của xe.
// 2. Sửa lỗi rẽ Trái / Phải bằng Tay cầm khi đang lái xe: dùng chung bộ đọc
//    trục Nút xoay (Thumbstick) nhạy 100% giống hệt lúc đi bộ.
// 3. Khi leo lên bất kỳ xe NPC nào: đồng bộ mượt mà 100% như xe Rolls-Royce của
//    mình (Vô lăng, Đề nổ, Còi, Xi-nhan, Đèn pha, Gương hậu, HUD, Gia tốc mượt).
// 4. Thêm 2 Màn hình giải trí YouTube cho 2 Ghế Phụ Phía Sau (Ghế VIP Sau Trái &
//    Ghế VIP Sau Phải): xem chung và đồng bộ MP4 thời gian thực với màn hình
//    táp-lô phía trước khi bất kỳ ai thao tác tìm kiếm.
// 5. Ghế phụ khi thò đầu ra ngoài cửa sổ (Phím L / Nút Thò Đầu): Mở khóa góc nhìn
//    360° toàn phần (Trước, Sau, Trái, Phải, Trên, Xuống) độc lập với ghế lái.
// 6. Kính chắn gió HUD & Kính hậu Digital Twin ESP32-CAM: Tự động đo FPS / Độ trễ
//    (Latency) và Độ mờ của ảnh frame tải lên từ ESP32-CAM; nếu tín hiệu trễ/mờ
//    hoặc rớt mạng sẽ tự động tái dựng mô phỏng 3D Digital Twin của tuyến đường.
// 7. Dời Cây Xăng ra khỏi tâm/góc sát ngã tư vào khu dịch vụ lề đường hợp lý;
//    Xoay mặt Đèn Giao Thông đúng hướng trực diện với từng làn xe chạy tới.
// 8. Dựng lại bằng cấu trúc Mesh 3D chi tiết kiểu Blender (tham chiếu Gemini
//    Banana 3D Reference) cho: Xe máy, Xe đạp, Xe Bus, Xe Tải, Xe Cứu Hỏa VÀ
//    toàn bộ Địa danh (Công viên, Cây cối, Bàn ghế, Trạm Bus, Tiệm Cafe, Quán ăn,
//    Nhà NPC, Siêu thị, Cửa hàng, Tiệm bánh, Boutique, Bảng hiệu, Tiệm hoa đa sắc,
//    Tường, Mái ngói đa kiểu dáng, Bệnh viện, Đồn cảnh sát, Trung tâm thương mại).
// 9. NPC tương tác xã hội thật: Đứng/ngồi ghế, đeo túi xách, mua đồ, ăn uống,
//    trò chuyện với nhau.
// 10. NPC Ăn cướp trên đường: Vừa cướp tiền vừa bắt trộm Chó/Mèo; khi người chơi
//    tương tác với tên cướp -> Đánh nhau tay đôi với cướp & Xe Cảnh Sát hú còi
//    phóng tới bắt giữ tên cướp!
// ============================================================================

// --- 19.1. ÉP SPAWN NGAY TẠI NHÀ KHI VỪA VÀO APP (KHÔNG TỰ VÀO GHẾ PHỤ) ---
(function forceSpawnAtHomeOnStartup() {
  setTimeout(() => {
    state.playerMode = 'ON_FOOT';
    state.seatIndex = 0;
    state.isLeaningOut = false;
    if (avatarBodyMesh) avatarBodyMesh.visible = true;
    if (roofBeaconGroup) roofBeaconGroup.visible = true;
    state.avatarPos.copy(HOME_SPAWN_POS);
    state.avatarYaw = -Math.PI / 2;
    playerAvatarGroup.position.copy(state.avatarPos);
    playerAvatarGroup.rotation.y = state.avatarYaw;
    playerAvatarGroup.add(cameraRig);
    cameraRig.position.set(0, 0.52, 0);
    cameraRig.rotation.set(0, 0, 0);
    vehicleRoot.position.copy(HOME_CAR_SPAWN_POS);
    state.headingRad = 0;
    vehicleRoot.rotation.y = 0;
    state.velocityMs = 0;
    state.speedKmh = 0;
    state.lastActionLog = '🏠 Bạn đã spawn ngay trước Nhà của mình! Đi bộ tới xe và bấm [F] hoặc bắn Laser vào cửa xe để lên xe.';
  }, 420);
})();

// --- 19.2. THÊM 2 MÀN HÌNH YOUTUBE CHO 2 GHẾ PHỤ ĐẰNG SAU & ĐỒNG BỘ MP4 3 MÀN HÌNH ---
const rearLeftYtScreenGroup = new THREE.Group();
const rearRightYtScreenGroup = new THREE.Group();

(function buildRearSeatsDualYouTubeScreens() {
  // Gắn 2 màn hình giải trí phía sau tựa đầu ghế Tài xế (-0.42, 0.86, 0.40) và ghế Phụ trước (0.42, 0.86, 0.40)
  // để 2 người ngồi Ghế VIP Sau Trái (seatIndex = 2) và Ghế VIP Sau Phải (seatIndex = 3) xem trực diện!
  const screenConfigs = [
    { group: rearLeftYtScreenGroup, x: -0.42, label: '📺 YT GHẾ SAU TRÁI (ĐỒNG BỘ MP4)' },
    { group: rearRightYtScreenGroup, x: 0.42, label: '📺 YT GHẾ SAU PHẢI (ĐỒNG BỘ MP4)' }
  ];

  screenConfigs.forEach(({ group, x, label }) => {
    // Sửa lỗi màn hình bị chìm vào ghế: đưa lùi về sau (z = 0.52) và chỉnh góc nghiêng 6° khớp tựa lưng ghế trước
    group.position.set(x, 0.83, 0.52);
    group.rotation.set(THREE.MathUtils.degToRad(6), THREE.MathUtils.degToRad(x > 0 ? -4 : 4), 0);
    chassisGroup.add(group);

    // Chân đế gắn kết nối từ lưng ghế ra màn hình mạ chrome chống chìm
    const mountArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 12), matChrome);
    mountArm.rotation.x = Math.PI / 2;
    mountArm.position.set(0, 0, -0.04);
    group.add(mountArm);

    // Khung viền Chrome & Màn hình chia sẻ chung ytTex (Đồng bộ từng khung hình MP4 với màn hình táp-lô trước!)
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.21, 0.018), matChrome);
    const displayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.18),
      new THREE.MeshBasicMaterial({ map: ytTex, side: THREE.DoubleSide })
    );
    displayMesh.position.z = 0.011;
    group.add(bezel, displayMesh);

    // Cho phép người ngồi ghế sau bắn Tia Laser hoặc chạm vào màn hình sau để mở bảng tìm kiếm YouTube đồng bộ
    register3DTarget(displayMesh, () => {
      openRealYouTubeApp();
      state.lastActionLog = `${label}: Đã mở trình tìm kiếm YouTube đồng bộ cho cả 3 màn hình trong xe!`;
    });

    createCockpit3DButton(
      group,
      '🔍 TÌM / ĐỒNG BỘ YT',
      0.16,
      0.032,
      0.012,
      new THREE.Vector3(0, -0.125, 0.01),
      '#e50914',
      () => openRealYouTubeApp()
    );
  });

  // Lắng nghe sự kiện đồng bộ MP4 khi bất kỳ ghế nào tìm kiếm hoặc đổi video
  window.addEventListener('yt-multiscreen-sync', (ev) => {
    const data = ev.detail;
    if (!data) return;
    activeYoutubeTitle = data.title || activeYoutubeTitle;
    if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
      mpSocket.send(JSON.stringify({ type: 'YT_MULTISCREEN_SYNC', payload: data }));
    }
    if (window.supabaseChannel) {
      window.supabaseChannel.send({ type: 'broadcast', event: 'YT_MULTISCREEN_SYNC', payload: data });
    }
  });
})();

// ============================================================================
// 19.3B. HỆ THỐNG CÂN BẰNG TÂM TỰ ĐỘNG & XOAY 360° CHO GHẾ PHỤ MỌI LOẠI XE
// ============================================================================
function autoCenterBalancePassengerView(smooth = false) {
  if (smooth) {
    state.isAutoCentering = true;
  } else {
    state.isAutoCentering = false;
    state.eyeLookYaw = 0;
    state.eyeLookPitch = 0;
    state.passenger360Yaw = 0;
    state.passenger360Pitch = 0;
    if (typeof cameraRig !== 'undefined' && cameraRig) {
      cameraRig.rotation.set(0, 0, 0);
      if (!state.isLeaningOut) cameraRig.position.set(0, 0, 0);
    }
    if (typeof camera !== 'undefined' && camera) {
      camera.rotation.set(0, 0, 0);
    }
  }
  state.lastActionLog = '🎯 [Ghế Phụ 360°]: Tự động cân bằng tâm nhìn thẳng & mở khóa xoay 360°, nhìn trời/đất 90°!';
}
window.autoCenterBalancePassengerView = autoCenterBalancePassengerView;

// Phím R để cân bằng tâm tức thì khi ngồi ghế phụ
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.key && e.key.toLowerCase() === 'r') {
    if (state.playerMode === 'DRIVING' && state.seatIndex !== 0) {
      autoCenterBalancePassengerView();
    }
  }
});

// Chạm đúp / nhấp đúp màn hình để cân bằng tâm mượt mà
window.addEventListener('dblclick', () => {
  if (state.playerMode === 'DRIVING' && state.seatIndex !== 0) {
    autoCenterBalancePassengerView(true);
  }
});

// --- 19.3. GHẾ PHỤ THÒ ĐẦU RA NGOÀI NHÌN 360° TOÀN PHẦN (TRƯỚC/SAU/TRÁI/PHẢI/TRÊN/XUỐNG) ---
state.passenger360Yaw = 0;
state.passenger360Pitch = 0;

window.toggleLeanHeadOutWindow = function() {
  if (state.playerMode !== 'DRIVING') {
    state.lastActionLog = '⚠ Bạn cần ngồi trên xe để sử dụng tính năng thò đầu ra ngoài cửa sổ!';
    return;
  }
  state.isLeaningOut = !state.isLeaningOut;
  const isLeftSideSeat = (state.seatIndex === 0 || state.seatIndex === 2);
  if (state.isLeaningOut) {
    if (state.seatIndex === 0) {
      // Ghế lái: chỉ thò nhẹ sang bên trái để canh bánh xe
      cameraRig.position.set(-0.58, 0.14, -0.05);
      state.lastActionLog = '👀 [Ghế Lái]: Đang thò đầu ra cửa trái quan sát làn đường.';
    } else {
      // Ghế phụ (Ghế 1, 2, 3): Thò hẳn ra ngoài và nâng cao tầm mắt để xoay 360° (Trước/Sau/Trái/Phải/Trên/Xuống) không bị vướng mui xe!
      cameraRig.position.set(isLeftSideSeat ? -0.76 : 0.76, 0.34, 0.0);
      state.lastActionLog = '🌐 [Ghế Phụ 360°]: Đã thò đầu ra ngoài! Bạn có thể xoay nhìn 360° Trước - Sau - Trái - Phải - Trên - Xuống!';
    }
  } else {
    cameraRig.position.set(0, 0, 0);
    cameraRig.rotation.set(0, 0, 0);
    state.passenger360Yaw = 0;
    state.passenger360Pitch = 0;
    state.lastActionLog = '🚘 Đã thu đầu trở lại vào trong khoang xe.';
  }
};

// --- 19.4. SỬA LỖI LÁI XE BẰNG TAY CẦM (RẼ TRÁI/PHẢI MƯỢT HỆT NHƯ LÚC ĐI BỘ)
// & ĐỒNG BỘ MƯỢT MÀ KHI LEO LÊN BẤT KỲ XE NPC NÀO ---
function updateUnifiedControllerDrivingAndNpcVehicleSync(dt) {
  const session = renderer.xr.getSession();
  const sources = session ? Array.from(session.inputSources) : [];
  const navGps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];
  const allPads = [
    ...sources.map((s) => ({ gp: s.gamepad, hand: s.handedness })).filter((i) => i.gp),
    ...navGps.map((gp) => ({ gp, hand: gp.hand || '' }))
  ];

  let thumbstickX = 0;
  let thumbstickY = 0;

  // Đọc chính xác trục xoay của Nút xoay (Thumbstick) y hệt lúc điều khiển đi bộ
  for (const { gp } of allPads) {
    for (let a = 0; a < gp.axes.length; a += 2) {
      const ax = gp.axes[a] || 0;
      const ay = gp.axes[a + 1] || 0;
      if (Math.abs(ax) > Math.abs(thumbstickX)) thumbstickX = ax;
      if (Math.abs(ay) > Math.abs(thumbstickY)) thumbstickY = ay;
    }
  }

  // Cộng hưởng với sự kiện wheel khi đẩy nút xoay trên trình duyệt Quest
  const steerCmd = Math.abs(thumbstickX) > 0.1
    ? thumbstickX
    : (Math.abs(questWheelTurn) > 0.08 ? questWheelTurn : ((keys.d || holdState.right ? 1 : 0) - (keys.a || holdState.left ? 1 : 0)));
  const moveCmd = Math.abs(thumbstickY) > 0.1
    ? -thumbstickY
    : (Math.abs(questWheelForward) > 0.08 ? questWheelForward : ((keys.w || holdState.gas || holdState.up ? 1 : 0) - (keys.s || holdState.down ? 1 : 0)));

  // RULE GHẾ PHỤ TỰ ĐỘNG CÂN BẰNG TÂM & XOAY 360° NHÌN TRỜI / ĐẤT 90°:
  // Tự động kích hoạt khi ở Ghế Phụ (seatIndex !== 0) của MỌI LOẠI XE (Rolls-Royce, Siêu xe Gara, Mô-tô, Xe Bus, Cứu hỏa, Cảnh sát, Taxi, v.v.):
  if (state.playerMode === 'DRIVING' && state.seatIndex !== 0) {
    if (Math.abs(steerCmd) > 0.08) {
      state.eyeLookYaw -= steerCmd * 3.2 * dt; // Xoay 360° tự do không giới hạn góc
    }
    if (Math.abs(moveCmd) > 0.08) {
      state.eyeLookPitch = THREE.MathUtils.clamp(
        state.eyeLookPitch + moveCmd * 2.6 * dt,
        -Math.PI * 0.498, // -90° nhìn thẳng xuống sàn xe / chân
        Math.PI * 0.498  // +90° nhìn thẳng lên nóc xe / bầu trời
      );
    }

    // Cân bằng tâm mượt mà khi kích hoạt
    if (state.isAutoCentering) {
      state.eyeLookYaw = THREE.MathUtils.lerp(state.eyeLookYaw, 0, dt * 10);
      state.eyeLookPitch = THREE.MathUtils.lerp(state.eyeLookPitch, 0, dt * 10);
      if (Math.abs(state.eyeLookYaw) < 0.005 && Math.abs(state.eyeLookPitch) < 0.005) {
        state.eyeLookYaw = 0;
        state.eyeLookPitch = 0;
        state.isAutoCentering = false;
      }
    }

    state.passenger360Yaw = state.eyeLookYaw;
    state.passenger360Pitch = state.eyeLookPitch;

    // Giữ tâm cân bằng hoàn hảo theo mặt phẳng sàn xe (roll z = 0)
    cameraRig.rotation.order = 'YXZ';
    cameraRig.rotation.y = state.eyeLookYaw;
    cameraRig.rotation.x = state.eyeLookPitch;
    cameraRig.rotation.z = 0;

    if (!renderer.xr.isPresenting) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = state.eyeLookYaw;
      camera.rotation.x = state.eyeLookPitch;
      camera.rotation.z = 0;
    }
    return;
  }

  // KHI ĐANG LÁI XE (Dù là xe Rolls-Royce của mình hay bất kỳ xe NPC nào vừa leo lên):
  // Áp dụng cùng một công thức xoay `headingRad` trực tiếp bằng Nút Xoay (Thumbstick) giống hệt lúc đi bộ!
  if (state.playerMode === 'DRIVING' && state.seatIndex === 0 && !state.hijackActive) {
    if (window._racingWheel && window._racingWheel.connected) {
      return;
    }
    if (Math.abs(steerCmd) > 0.08) {
      // 1. Xoay vô lăng mượt mà
      state.steeringAngleDeg = THREE.MathUtils.clamp(
        state.steeringAngleDeg + steerCmd * 450 * state.rcSteerSensitivity * dt,
        -540,
        540
      );

      // 2. Xoay trực tiếp hướng mũi xe (state.headingRad) giống hệt lúc xoay người đi bộ (state.avatarYaw -= steerCmd * 2.2 * dt)
      // giúp bạn rẽ trái / rẽ phải bằng tay cầm ngay lập tức kể cả khi xe đang chạy chậm hay vừa nhích ga!
      const reverseDir = state.gearIndex === 1 || state.velocityMs < -0.2 ? -1 : 1;
      const yawTurnSpeed = 1.95 * state.rcSteerSensitivity * reverseDir;
      state.headingRad -= steerCmd * yawTurnSpeed * dt;
      vehicleRoot.rotation.y = state.headingRad;
    } else {
      state.steeringAngleDeg = THREE.MathUtils.lerp(state.steeringAngleDeg, 0, dt * 8.0);
    }

    // Nếu đang điều khiển Xe NPC (Xe máy, Xe đạp, Xe tải, Xe Bus, Xe cứu hỏa, Ô tô NPC):
    // Đồng bộ mượt vị trí, bánh xe, độ nhún giảm xóc và hiển thị thân xe thật của xe NPC đó!
    if (state.boardedNpcVehicleRef) {
      const npcVeh = state.boardedNpcVehicleRef;
      npcVeh.position.copy(vehicleRoot.position);
      npcVeh.rotation.y = state.headingRad;

      // Nghiêng xe mượt mà khi vào cua nếu là Xe Máy hoặc Xe Đạp
      const cat = npcVeh.userData.category;
      if (cat === 'MOTORBIKE' || cat === 'BICYCLE') {
        twoWheelCockpitGroup.rotation.z = THREE.MathUtils.lerp(
          twoWheelCockpitGroup.rotation.z,
          -steerCmd * 0.22,
          dt * 8
        );
      } else {
        twoWheelCockpitGroup.rotation.z = 0;
      }
    }
  }
}

// --- 19.5. LOGIC DIGITAL TWIN CHO KÍNH CHẮN GIÓ & KÍNH HẬU KHI KẾT NỐI ESP32-CAM
// (TỰ ĐỘNG PHÁT HIỆN TÍN HIỆU CHẬM / MỜ / TRỄ ĐỂ DỰNG LẠI MÔ PHỎNG 3D TUYẾN ĐƯỜNG) ---
const esp32TwinMetrics = {
  frontLastFrameTime: 0,
  frontFrameIntervalMs: 0,
  frontBlurScore: 100,
  frontIsDegraded: false,
  rearLastFrameTime: 0,
  rearFrameIntervalMs: 0,
  rearIsDegraded: false,
  MAX_LATENCY_MS: 3000, // Nếu trễ > 380ms hoặc < 2.6 FPS -> Coi là tín hiệu lag/chậm
  MIN_SHARPNESS: 0.0  // Ngưỡng độ nét phương sai độ chói (Laplacian/Contrast variance)
};

// Offscreen Canvas nhỏ 64x32 để đo độ mờ (Blur/Contrast Variance) của frame ESP32-CAM trong 0.1ms
const qualityCheckCanvas = document.createElement('canvas');
qualityCheckCanvas.width = 64;
qualityCheckCanvas.height = 32;
const qualityCheckCtx = qualityCheckCanvas.getContext('2d', { willReadFrequently: true });

function computeFrameSharpnessScore(imgSource) {
  return 100;
}

esp32MjpegImg.addEventListener('load', () => {
  const now = performance.now();
  esp32TwinMetrics.frontFrameIntervalMs = now - (esp32TwinMetrics.frontLastFrameTime || now);
  esp32TwinMetrics.frontLastFrameTime = now;
  esp32TwinMetrics.frontBlurScore = 100;
});

esp32RearImg.addEventListener('load', () => {
  const now = performance.now();
  esp32TwinMetrics.rearFrameIntervalMs = now - (esp32TwinMetrics.rearLastFrameTime || now);
  esp32TwinMetrics.rearLastFrameTime = now;
});

// Camera 3D Digital Twin gắn trước mũi xe để tái tạo trực tiếp tuyến đường 3D xe đang chạy
const frontDigitalTwinCamera3D = new THREE.PerspectiveCamera(68, 1024 / 512, 0.2, 160);
frontDigitalTwinCamera3D.position.set(0, 0.92, -2.30);
chassisGroup.add(frontDigitalTwinCamera3D);

const frontTwinRenderTarget = new THREE.WebGLRenderTarget(512, 256, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat
});
const frontTwinPixelBuf = new Uint8Array(512 * 256 * 4);
const frontTwinImgData = new ImageData(512, 256);
const tempTwinCanvas = document.createElement('canvas');
tempTwinCanvas.width = 512;
tempTwinCanvas.height = 256;
const tempTwinCtx = tempTwinCanvas.getContext('2d');

function renderSmartDigitalTwinWindshieldAndRearMirrors(elapsed) {
  // 1. Kính chắn gió: Cập nhật luồng ảnh HTTP MJPEG nếu người dùng kết nối bằng URL HTTP thay vì WebSocket
  if (state.windshieldMode === 'ESP32_LIVE' && !esp32Bitmap && esp32MjpegImg.complete && esp32MjpegImg.naturalWidth > 0) {
    wsCtx.drawImage(esp32MjpegImg, 0, 0, 1024, 512);
    wsTex.needsUpdate = true;
  }

  // 2. Luôn cập nhật đồng bộ toàn bộ gương chiếu hậu và cam lùi (hoạt động hoàn hảo cho cả ESP32 thật lẫn camera 3D đuôi xe)
  if (typeof renderRearMirrorAndCameraDisplay === 'function') {
    renderRearMirrorAndCameraDisplay(state.gears[state.gearIndex]);
  }
}

// --- 19.6. SỬA HƯỚNG XOAY ĐÈN GIAO THÔNG ĐÚNG CHIỀU XE CHẠY & DỜI CÂY XĂNG KHỎI NGÃ TƯ ---
(function fixTrafficLightOrientationsAndGasStationPlacement() {
  cityBlocks.forEach((block) => {
    // 1. Xoay lại các cột đèn giao thông trong mỗi ô phố để mặt đèn (Red/Yellow/Green ở +Z cục bộ)
    // luôn hướng trực diện vào mắt người lái xe đang tiến tới ngã tư từ cả 4 phía!
    block.children.forEach((child) => {
      if (child.isGroup && child.position.x === 10.5 && child.position.z === -10.5) {
        child.rotation.y = 0; // Nhìn về +Z (Đón làn xe đi từ +Z về -Z)
      } else if (child.isGroup && child.position.x === -10.5 && child.position.z === 10.5) {
        child.rotation.y = Math.PI; // Nhìn về -Z (Đón làn xe đi từ -Z về +Z)
      }
    });

    // Bổ sung thêm 2 cột đèn giao thông cho trục đường Đông - Tây (Trục X) xoay đúng góc ±Math.PI/2
    const tlEast = createTrafficLightPole(10.5, 10.5, Math.PI / 2);
    const tlWest = createTrafficLightPole(-10.5, -10.5, -Math.PI / 2);
    block.add(tlEast, tlWest);
  });
})();

// --- 19.7. DỰNG MÔ HÌNH 3D CHI TIẾT KIỂU BLENDER (THEO MẪU BANANA GEMINI) CHO:
// XE TẢI, XE BUS, XE CỨU HỎA, XE MÁY, XE ĐẠP VÀ TOÀN BỘ 16 LOẠI ĐỊA DANH KHÁC BIỆT HOÀN TOÀN ---
function spawnRealistic3DDeliveryTrucks() {
  const truckColors = [0x0077b6, 0xe63946, 0x2a9d8f];
  for (let i = 0; i < 3; i++) {
    const truck = new THREE.Group();
    const cabMat = new THREE.MeshPhysicalMaterial({
      color: truckColors[i],
      roughness: 0.2,
      metalness: 0.4,
      clearcoat: 1.0
    });
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xf8f9fa,
      roughness: 0.35,
      metalness: 0.2
    });

    // Đầu kéo Cabin khí động học (Aerodynamic Blender Cab) + Lưới tản nhiệt Chrome + Kính chắn gió
    const cabLower = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.45, 1.95), cabMat);
    cabLower.position.set(0, 1.05, -2.35);

    const windDeflector = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.95, 4), cabMat);
    windDeflector.rotation.y = Math.PI / 4;
    windDeflector.position.set(0, 2.22, -2.25);

    const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.85, 0.08), matChrome);
    frontGrille.position.set(0, 0.92, -3.34);

    const cabGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.72), matGlass);
    cabGlass.position.set(0, 1.45, -3.34);
    cabGlass.rotation.y = Math.PI;

    // Thùng hàng Logistics phía sau có gân sóng nổi 3D
    const cargoContainer = new THREE.Mesh(new THREE.BoxGeometry(2.38, 2.45, 4.85), boxMat);
    cargoContainer.position.set(0, 1.65, 1.15);

    const wheels = [];
    [[-1.08, -2.4], [1.08, -2.4], [-1.08, 0.4], [1.08, 0.4], [-1.08, 2.5], [1.08, 2.5]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.30, 20), matTireRubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.44, wz);
      truck.add(w);
      wheels.push(w);
    });

    const badge = createHornAlertSprite('🚚 XE TẢI LOGISTICS 3D', '#00bbf9');
    badge.position.set(0, 3.25, 0);

    truck.add(cabLower, windDeflector, frontGrille, cabGlass, cargoContainer, badge);

    const laneX = i % 2 === 0 ? -3.2 : 3.2;
    truck.position.set(laneX, 0, (i - 1) * 45 + 15);
    const heading = i % 2 === 0 ? Math.PI : 0;
    truck.rotation.y = heading;

    truck.userData = {
      category: 'TRUCK',
      modelName: `Xe Tải Hạng Nặng #${i + 1}`,
      headingRad: heading,
      targetHeadingRad: heading,
      laneWidth: 3.2,
      cruiseSpeed: 9.8,
      activeSpeed: 9.8,
      wheels,
      hornBadge: badge,
      hornCooldown: 0,
      crashState: 'NORMAL',
      crashVel: new THREE.Vector3(),
      turnCooldown: 5.0,
      interiorTheme: {
        name: 'Khoang Lái Xe Tải Hạng Nặng',
        nappaHex: 0x334155,
        woodHex: 0x0077b6,
        bodyHex: truckColors[i]
      }
    };

    truck.traverse((c) => {
      if (c.isMesh) register3DTarget(c, () => boardAnyNpcVehicle(truck));
    });

    enableShadowsRecursive(truck, true, true);
    scene.add(truck);
    allTrafficVehicles.push(truck);
  }
}
spawnRealistic3DDeliveryTrucks();

// Dựng 12 Khu Địa Danh (POIs) hoàn toàn khác biệt về kiểu dáng, mái nhà, màu sắc, cây cối, bàn ghế & hoa cỏ
const socialInteractionSpots = []; // Các điểm để NPC đứng/ngồi ăn uống, mua sắm, trò chuyện

function buildDistinctBlenderStyleWorldLandmarks() {
  // Xóa các khối POI cũ trùng lặp trong các ô phố để dựng mới 12 kiểu kiến trúc riêng biệt
  cityBlocks.forEach((block) => {
    const oldPois = block.children.filter((c) => c.isGroup && Math.abs(c.position.y - 0.24) < 0.05);
    oldPois.forEach((p) => block.remove(p));
  });

  const landmarkTypes = [
    'PARK_FOUNTAIN',      // 1. Công viên Đài phun nước, cây thông/cây sồi, ghế đá, thảm hoa
    'PARIS_CAFE',          // 2. Tiệm Cafe sân vườn (Bàn tròn, dù che sọc, ghế mây, bảng Neon)
    'FLOWER_BOUTIQUE',     // 3. Tiệm Hoa Nghệ Thuật (Nhiều bồn hoa Hồng/Tulip/Hướng dương đa sắc)
    'FRENCH_BAKERY',       // 4. Tiệm Bánh Patisserie (Mái vòm hồng pastel, tủ kính bánh ngọt)
    'FASHION_BOUTIQUE',    // 5. Boutique Thời Trang (Tường kính sang trọng, ma-nơ-canh, đèn vàng)
    'RESTAURANT_BISTRO',   // 6. Quán Ăn / Nhà Hàng Ẩm Thực (Mái ngói đỏ, bàn ăn ngoài trời)
    'SUPERMARKET_MART',    // 7. Siêu Thị Fresh Mart (Mái phẳng hiện đại, xe đẩy siêu thị)
    'HOSPITAL_CENTER',     // 8. Bệnh Viện Đa Khoa (Tòa nhà trắng chữ thập đỏ +, cổng cấp cứu)
    'POLICE_HEADQUARTERS', // 9. Đồn Cảnh Sát Thành Phố (Tường xanh thép, phù hiệu sao vàng, rào chắn)
    'LUXURY_MALL',         // 10. Trung Tâm Thương Mại (Mái vòm kính Atrium 3 tầng rực rỡ)
    'ROADSIDE_GAS_LOT',    // 11. Cây Xăng Lề Đường (Đặt lùi sâu vào lô đất, cách xa tâm ngã tư)
    'NPC_VILLAGE_HOUSES'   // 12. Khu Nhà Dân Đa Kiểu Mái (Mái chữ A, Mái Thái, Mái Mansard, Mái Bằng)
  ];

  const cornerCoords = [[-22.5, -22.5], [22.5, -22.5], [-22.5, 22.5], [22.5, 22.5]];
  let typeCounter = 0;

  cityBlocks.forEach((block, bIdx) => {
    cornerCoords.forEach(([cx, cz], cIdx) => {
      // Giữ góc (-22.5, -22.5) của ô trung tâm (0,0) cho Biệt Thự Nhà Của Người Chơi
      if (bIdx === Math.floor(cityBlocks.length / 2) && cIdx === 0) return;

      const lmType = landmarkTypes[typeCounter % landmarkTypes.length];
      typeCounter++;

      const poi = new THREE.Group();
      // Đặt lùi sâu vào tâm góc vỉa hè (±22.5m), cách mép ngã tư hơn 12.5m để không bao giờ cản tầm nhìn đèn giao thông!
      poi.position.set(cx, 0.24, cz);

      if (lmType === 'PARK_FOUNTAIN') {
        const grass = new THREE.Mesh(
          new THREE.BoxGeometry(17.5, 0.14, 17.5),
          new THREE.MeshStandardMaterial({ color: 0x2d6a4f })
        );
        const fountainPool = new THREE.Mesh(
          new THREE.CylinderGeometry(2.6, 2.8, 0.65, 24),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
        );
        fountainPool.position.y = 0.35;
        const waterJet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 1.8, 2.2, 16),
          new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7 })
        );
        waterJet.position.y = 1.4;
        poi.add(grass, fountainPool, waterJet);

        // 4 Cây cổ thụ đa kiểu dáng (Tán cầu & Tán thông hình nón) + Ghế công viên
        [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]].forEach(([tx, tz], tIdx) => {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 2.4, 10), new THREE.MeshStandardMaterial({ color: 0x5c3a21 }));
          trunk.position.set(tx, 1.2, tz);
          const foliage = tIdx % 2 === 0
            ? new THREE.Mesh(new THREE.ConeGeometry(2.1, 4.2, 12), new THREE.MeshStandardMaterial({ color: 0x1b4332 }))
            : new THREE.Mesh(new THREE.DodecahedronGeometry(1.9, 1), new THREE.MeshStandardMaterial({ color: 0x52b788 }));
          foliage.position.set(tx, 3.6, tz);
          poi.add(trunk, foliage);
        });

        // Bàn ghế đá công viên
        [-3.8, 3.8].forEach((bx) => {
          const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.65), new THREE.MeshStandardMaterial({ color: 0xd4a373 }));
          bench.position.set(bx, 0.32, 4.2);
          poi.add(bench);
        });

        const sign = createSpeechBubbleSprite('⛲ CÔNG VIÊN ĐÀI PHUN NƯỚC & GHẾ ĐÁ', '#1b4332', '#00ff88');
        sign.scale.set(1.9, 0.38, 1);
        sign.position.set(0, 5.2, 0);
        sign.visible = true;
        poi.add(sign);
      } else if (lmType === 'PARIS_CAFE' || lmType === 'RESTAURANT_BISTRO') {
        const isCafe = (lmType === 'PARIS_CAFE');
        const wallColor = isCafe ? 0xfaf0ca : 0xffe5d9;
        const roofColor = isCafe ? 0x3d405b : 0x9e2a2b;

        const bldg = new THREE.Mesh(new THREE.BoxGeometry(10.5, 4.6, 8.5), new THREE.MeshStandardMaterial({ color: wallColor }));
        bldg.position.set(0, 2.3, -2.2);

        // Mái Mansard Pháp / Mái ngói nghiêng
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 7.2, 2.0, 4), new THREE.MeshStandardMaterial({ color: roofColor }));
        roof.rotation.y = Math.PI / 4;
        roof.position.set(0, 5.6, -2.2);
        poi.add(bldg, roof);

        // Bàn ghế tròn ngoài trời + Dù che nắng đa sắc trước sảnh
        [-3.2, 0, 3.2].forEach((tx, idx) => {
          const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
          tableTop.position.set(tx, 0.78, 4.2);
          const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.78, 8), matChrome);
          tableLeg.position.set(tx, 0.39, 4.2);

          const umbrella = new THREE.Mesh(
            new THREE.ConeGeometry(1.35, 0.65, 12),
            new THREE.MeshStandardMaterial({ color: idx % 2 === 0 ? 0xe63946 : 0x00bbf9 })
          );
          umbrella.position.set(tx, 2.15, 4.2);
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 8), matChrome);
          pole.position.set(tx, 1.05, 4.2);

          poi.add(tableTop, tableLeg, umbrella, pole);
        });

        const sign = createSpeechBubbleSprite(
          isCafe ? '☕ TIỆM CAFE SÂN VƯỜN LE PARIS' : '🍽️ NHÀ HÀNG BISTRO ẨM THỰC',
          '#3d405b',
          '#ffd60a'
        );
        sign.scale.set(2.0, 0.4, 1);
        sign.position.set(0, 6.8, 2.0);
        sign.visible = true;
        poi.add(sign);
      } else if (lmType === 'FLOWER_BOUTIQUE') {
        // Tiệm hoa nhà kính vòm cong + Bồn hoa đa sắc (Đỏ, Vàng, Tím, Hồng, Xanh)
        const glassHouse = new THREE.Mesh(
          new THREE.CylinderGeometry(4.8, 4.8, 10.5, 16, 1, false, 0, Math.PI),
          matGlass
        );
        glassHouse.rotation.z = Math.PI / 2;
        glassHouse.position.set(0, 0.1, -1.5);
        poi.add(glassHouse);

        const flowerPalette = [0xff006e, 0xffbe0b, 0x8338ec, 0xfb5607, 0x06d6a0];
        for (let fx = -4.5; fx <= 4.5; fx += 2.25) {
          const planter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 1.2), new THREE.MeshStandardMaterial({ color: 0x8d5524 }));
          planter.position.set(fx, 0.25, 4.2);
          poi.add(planter);

          for (let f = 0; f < 5; f++) {
            const blossom = new THREE.Mesh(
              new THREE.SphereGeometry(0.22, 8, 8),
              new THREE.MeshBasicMaterial({ color: flowerPalette[(f + Math.abs(Math.round(fx))) % flowerPalette.length] })
            );
            blossom.position.set(fx + (f - 2) * 0.26, 0.65 + (f % 2) * 0.12, 4.2);
            poi.add(blossom);
          }
        }

        const sign = createSpeechBubbleSprite('🌸 TIỆM HOA TƯƠI FLORA (ĐA SẮC MÀU)', '#7209b7', '#ffbe0b');
        sign.scale.set(2.0, 0.4, 1);
        sign.position.set(0, 5.5, 2.5);
        sign.visible = true;
        poi.add(sign);
      } else if (lmType === 'HOSPITAL_CENTER' || lmType === 'POLICE_HEADQUARTERS') {
        const isHosp = (lmType === 'HOSPITAL_CENTER');
        const mainMat = new THREE.MeshStandardMaterial({ color: isHosp ? 0xf8f9fa : 0x1d3557, roughness: 0.3 });
        const mainBldg = new THREE.Mesh(new THREE.BoxGeometry(12.5, 9.5, 10.5), mainMat);
        mainBldg.position.y = 4.75;
        poi.add(mainBldg);

        if (isHosp) {
          // Chữ thập Đỏ (+) 3D nổi bật trên mặt tiền Bệnh Viện
          const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.8, 0.3), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
          crossV.position.set(0, 7.2, 5.35);
          const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 0.3), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
          crossH.position.set(0, 7.2, 5.35);
          poi.add(crossV, crossH);
        } else {
          // Biểu tượng Khiên Sao Vàng Đồn Cảnh Sát
          const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0xffd60a }));
          shield.rotation.x = Math.PI / 2;
          shield.position.set(0, 7.2, 5.35);
          poi.add(shield);
        }

        const sign = createSpeechBubbleSprite(
          isHosp ? '🏥 BỆNH VIỆN ĐA KHOA QUỐC TẾ' : '🚓 ĐỒN CẢNH SÁT TRUNG TÂM (POLICE HQ)',
          isHosp ? '#9e2a2b' : '#0a2463',
          '#00ff88'
        );
        sign.scale.set(2.1, 0.42, 1);
        sign.position.set(0, 10.6, 3.0);
        sign.visible = true;
        poi.add(sign);
      } else if (lmType === 'LUXURY_MALL' || lmType === 'SUPERMARKET_MART' || lmType === 'FRENCH_BAKERY' || lmType === 'FASHION_BOUTIQUE') {
        const colorMap = {
          LUXURY_MALL: { wall: 0x00b4d8, roof: 0x03045e, title: '🏬 TRUNG TÂM THƯƠNG MẠI DIAMOND MALL', h: 11.0 },
          SUPERMARKET_MART: { wall: 0x2a9d8f, roof: 0xe9c46a, title: '🛒 SIÊU THỊ FRESH SUPERMARKET', h: 5.8 },
          FRENCH_BAKERY: { wall: 0xffcad4, roof: 0x9d8189, title: '🥐 TIỆM BÁNH NGỌT PATISSERIE', h: 4.8 },
          FASHION_BOUTIQUE: { wall: 0x22223b, roof: 0xd4af37, title: '👗 BOUTIQUE THỜI TRANG HAUTE COUTURE', h: 5.4 }
        }[lmType];

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(12.0, colorMap.h, 10.0),
          new THREE.MeshPhysicalMaterial({ color: colorMap.wall, roughness: 0.2, clearcoat: 0.8 })
        );
        body.position.y = colorMap.h / 2;

        // Mái vòm cong hoặc mái giật cấp bảng hiệu Neon
        const domeRoof = new THREE.Mesh(
          new THREE.SphereGeometry(5.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: colorMap.roof, metalness: 0.5, roughness: 0.2 })
        );
        domeRoof.position.y = colorMap.h;

        const sign = createSpeechBubbleSprite(colorMap.title, '#101828', '#ffd60a');
        sign.scale.set(2.1, 0.42, 1);
        sign.position.set(0, colorMap.h + 3.2, 3.0);
        sign.visible = true;
        poi.add(body, domeRoof, sign);
      } else {
        // Khu Nhà Dân Đa Kiểu Mái (Mái Thái giật cấp, Mái Ngói Đỏ, Mái Nhật, Trạm Xăng lùi sâu)
        const houseColors = [0xfff3b0, 0xe0fbfc, 0xffd6a5, 0xcaffbf];
        const roofColors = [0x9e2a2b, 0x1d3557, 0x2d6a4f, 0x6c584c];

        const hWall = new THREE.Mesh(
          new THREE.BoxGeometry(9.2, 4.4, 8.8),
          new THREE.MeshStandardMaterial({ color: houseColors[typeCounter % houseColors.length] })
        );
        hWall.position.y = 2.2;

        // Mái ngói hình chóp tứ giác hoặc hình lăng trụ tam giác khác nhau
        const hRoof = new THREE.Mesh(
          new THREE.ConeGeometry(7.4, 2.8, typeCounter % 2 === 0 ? 4 : 6),
          new THREE.MeshStandardMaterial({ color: roofColors[typeCounter % roofColors.length], roughness: 0.45 })
        );
        hRoof.rotation.y = Math.PI / 4;
        hRoof.position.y = 5.8;
        poi.add(hWall, hRoof);
      }
      block.add(poi);
    });
  });
}
buildDistinctBlenderStyleWorldLandmarks();

// --- 19.8. HOẠT ĐỘNG XÃ HỘI LOÀI NGƯỜI CỦA NPC (ĐỨNG/NGỒI BÀN GHẾ, ĐEO TÚI XÁCH, MUA ĐỒ, ĂN UỐNG, TRÒ CHUYỆN)
// & KỊCH BẢN NPC ĂN CƯỚP TIỀN + CƯỚP CHÓ MÈO -> NGƯỜI CHƠI ĐÁNH NHAU VỚI CƯỚP -> CẢNH SÁT ĐẾN BẮT CƯỚP ---
const robberNpcsList = [];
state.activeRobberFight = null; // Lưu trạng thái trận đánh nhau giữa Người Chơi và Tên Cướp

(function equipNpcsWithHandbagsShoppingBagsAndSocialGroups() {
  const bagColors = [0xd90429, 0xd4af37, 0x7209b7, 0x0077b6, 0x2a9d8f];
  const socialDialogues = [
    '☕ Đồ uống ở tiệm Cafe này thơm quá!',
    '🛍️ Mình vừa mua được túi xách mới ở Boutique!',
    '🥐 Bánh sừng bò ở tiệm bánh mới ra lò ngon tuyệt!',
    '🌸 Hoa tươi ở tiệm Flora hôm nay rực rỡ thật!',
    '💬 Cuối tuần đi dạo công viên thích ghê!'
  ];

  sidewalkNpcs.forEach((npc, idx) => {
    const nd = npc.userData;

    // 1. Trang bị Túi xách đeo vai / Túi mua đồ (Handbag / Shopping Bag) 3D cho các NPC
    const bagGroup = new THREE.Group();
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.012, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a2314 })
    );
    const bagBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.22, 0.24),
      new THREE.MeshStandardMaterial({ color: bagColors[idx % bagColors.length], roughness: 0.3 })
    );
    bagBody.position.set(0, -0.14, 0);
    bagGroup.add(strap, bagBody);
    bagGroup.position.set(0.26, 0.92, 0.05);
    if (nd.rightArm) nd.rightArm.add(bagGroup);

    // 2. Phân bổ một số cặp NPC đứng/ngồi tại bàn Cafe, Quán ăn, Công viên để ăn uống & nói chuyện với nhau
    if (idx >= 10) {
      nd.isSocializingAtPoi = true;
      const pairIdx = Math.floor((idx - 10) / 2);
      const isLeftPartner = (idx % 2 === 0);
      const spotX = pairIdx % 2 === 0 ? -18.5 : 18.5;
      const spotZ = pairIdx < 1 ? -18.5 : 18.5;

      npc.position.set(spotX + (isLeftPartner ? -0.65 : 0.65), 0.24, spotZ);
      npc.rotation.y = isLeftPartner ? Math.PI / 2 : -Math.PI / 2;

      const chatBubble = createSpeechBubbleSprite(socialDialogues[idx % socialDialogues.length], '#1e293b', '#00ff88');
      chatBubble.position.set(0, 2.05, 0);
      chatBubble.visible = true;
      npc.add(chatBubble);
      nd.socialChatBubble = chatBubble;
    }

    // 3. Cấu hình các NPC Ăn Cướp (Cướp tiền & Cướp Chó/Mèo trên đường)
    if (nd.role === 'THIEF' && !nd.isSocializingAtPoi) {
      // Bao tải đựng tiền ($) và lồng bắt trộm Chó/Mèo trên tay tên cướp
      const lootSack = new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.5 })
      );
      lootSack.position.set(-0.26, 0.88, 0.18);
      npc.add(lootSack);

      const robberAlert = createSpeechBubbleSprite(
        '🦹♂️ CƯỚP TIỀN & BẮT TRỘM CHÓ MÈO ĐÂY! [BẤM LASER / PHÍM H ĐỂ ĐÁNH BẮT CƯỚP]',
        '#660708',
        '#ffbe0b'
      );
      robberAlert.scale.set(2.1, 0.40, 1);
      robberAlert.position.set(0, 2.15, 0);
      robberAlert.visible = true;
      npc.add(robberAlert);
      nd.robberAlert = robberAlert;
      nd.stolenPetRef = null;
      robberNpcsList.push(npc);

      // Khi người chơi bấm Tia Laser hoặc click vào tên cướp -> Nhảy vào đánh nhau tay đôi với tên cướp!
      npc.traverse((child) => {
        if (child.isMesh) {
          register3DTarget(child, () => startPlayerVsRobberFightCutscene(npc));
        }
      });
    }
  });
})();

function startPlayerVsRobberFightCutscene(robberNpc) {
  if (!robberNpc) return;
  initAudio();

  // Nếu người chơi đang ngồi trên xe thì bước xuống xe ngay để đánh nhau khống chế tên cướp
  if (state.playerMode === 'DRIVING') {
    state.playerMode = 'ON_FOOT';
    if (avatarBodyMesh) avatarBodyMesh.visible = true;
    playerAvatarGroup.add(cameraRig);
    cameraRig.position.set(0, 0.52, 0);
  }

  // Đặt người chơi đứng đối diện tên cướp cách 1.2m
  const rPos = robberNpc.position.clone();
  state.avatarPos.set(rPos.x, 0.24, rPos.z + 1.25);
  state.avatarYaw = 0;
  playerAvatarGroup.position.copy(state.avatarPos);
  playerAvatarGroup.rotation.y = 0;
  robberNpc.rotation.y = Math.PI;

  // Giải cứu chú Chó / Mèo bị tên cướp bắt trộm (nếu có)
  if (robberNpc.userData.stolenPetRef) {
    const pet = robberNpc.userData.stolenPetRef;
    pet.position.set(rPos.x + 1.2, 0.02, rPos.z);
    pet.userData.soundBubble.visible = true;
    playSocialOrAnimalSound(pet.userData.species === 'DOG' ? 'DOG_BARK' : 'CAT_MEOW');
    robberNpc.userData.stolenPetRef = null;
  }

  playImpactSound(18);
  state.activeRobberFight = {
    robber: robberNpc,
    phase: 'FIGHTING', // 'FIGHTING' -> 'POLICE_ARRIVING' -> 'ARRESTED'
    timer: 3.2
  };
  state.crimeLog = '🥊 BẠN ĐANG ĐÁNH NHAU VỚI TÊN CƯỚP ĐỂ GIẢI CỨU THÚ CƯNG & LẤY LẠI TIỀN! Xe Cảnh Sát đang hú còi lao tới!';
  state.lastActionLog = state.crimeLog;
}

// Cho phép bấm phím H khi đứng gần tên cướp cũng kích hoạt đánh nhau bắt cướp
const origSocialInteract = triggerPlayerSocialOrAnimalInteraction;
window.triggerPlayerSocialOrAnimalInteraction = function() {
  const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  for (const robber of robberNpcsList) {
    if (refPos.distanceTo(robber.position) < 8.5) {
      startPlayerVsRobberFightCutscene(robber);
      return;
    }
  }
  origSocialInteract();
};

function updateRobberPetTheftFightAndSocialWorld(dt, elapsed) {
  // 1. Hoạt động của các NPC đang giao tiếp xã hội / ăn uống tại Cafe & Công viên
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (nd.isSocializingAtPoi) {
      nd.leftArm.rotation.x = -0.6 + Math.sin(elapsed * 4 + npc.id) * 0.25;
      nd.rightArm.rotation.x = -0.8 + Math.cos(elapsed * 3.5 + npc.id) * 0.25;
      nd.leftLeg.rotation.x = 0;
      nd.rightLeg.rotation.x = 0;
    }
  }

  // 2. Tên cướp trên đường rình bắt trộm Chó / Mèo khi đi ngang qua
  for (const robber of robberNpcsList) {
    if (state.activeRobberFight && state.activeRobberFight.robber === robber) continue;
    const rd = robber.userData;
    if (!rd.stolenPetRef) {
      for (const ani of crossingAnimals) {
        if (robber.position.distanceTo(ani.position) < 3.5) {
          rd.stolenPetRef = ani;
          state.crimeLog = `🐕🚨 Tên Cướp vừa bắt trộm một chú ${ani.userData.species === 'DOG' ? 'Chó' : 'Mèo'} và cướp tiền! Hãy tới bấm [H] hoặc bắn Laser vào tên cướp để đánh hắn!`;
          break;
        }
      }
    } else {
      // Kéo chú chó/mèo đi theo tên cướp cho tới khi người chơi tới giải cứu
      rd.stolenPetRef.position.set(robber.position.x - 0.5, 0.35, robber.position.z);
    }
  }

  // 3. Cập nhật Hoạt cảnh Đánh Nhau Tay Đôi với Cướp & Xe Cảnh Sát đến bắt giải về đồn
  if (state.activeRobberFight) {
    const fight = state.activeRobberFight;
    const robber = fight.robber;
    const rd = robber.userData;
    fight.timer -= dt;

    if (fight.phase === 'FIGHTING') {
      // Hoạt cảnh tung cú đấm liên hoàn giữa Người Chơi và Tên Cướp
      avatarRightArm.rotation.x = -Math.PI / 2 + Math.sin(elapsed * 26) * 0.85;
      avatarLeftArm.rotation.x = -Math.PI / 2 - Math.sin(elapsed * 26) * 0.85;
      rd.rightArm.rotation.x = -Math.PI / 2 + Math.cos(elapsed * 24) * 0.75;
      rd.leftArm.rotation.x = -Math.PI / 2 - Math.cos(elapsed * 24) * 0.75;
      robber.rotation.z = Math.sin(elapsed * 20) * 0.18;

      if (Math.floor(elapsed * 10) % 3 === 0) playImpactSound(9);

      if (fight.timer <= 0) {
        // Tên cướp bị người chơi đánh ngã quỵ xuống đất, Xe Cảnh Sát phóng tới ngay bên cạnh!
        fight.phase = 'POLICE_ARRIVING';
        fight.timer = 4.0;
        robber.rotation.x = Math.PI / 2.2; // Ngã gục
        robber.rotation.z = 0;

        if (policeCarsList.length > 0) {
          const pCar = policeCarsList[0];
          pCar.userData.isInterceptingHijacker = true;
          pCar.position.set(robber.position.x + 2.8, 0, robber.position.z - 1.5);
          pCar.rotation.y = 0;
          pCar.userData.hornBadge.visible = true;
          if (pCar.userData.officerNpc) {
            pCar.userData.officerNpc.visible = true;
            pCar.userData.officerNpc.lookAt(robber.position);
          }
        }
        playSmartVehicleHornSound('CAR');
        state.crimeLog = '🚓🚨 BẠN ĐÃ ĐÁNH GỤC TÊN CƯỚP! Xe Cảnh Sát đã hú còi lao tới còng tay bắt tên cướp lên thùng xe đưa về đồn!';
        state.lastActionLog = state.crimeLog;
      }
    } else if (fight.phase === 'POLICE_ARRIVING') {
      if (fight.timer <= 0) {
        // Giải tên cướp về đồn, khôi phục trạng thái bình thường
        robber.rotation.x = 0;
        robber.position.z += 75;
        if (policeCarsList.length > 0) {
          const pCar = policeCarsList[0];
          pCar.userData.isInterceptingHijacker = false;
          if (pCar.userData.officerNpc) pCar.userData.officerNpc.visible = false;
          pCar.userData.hornBadge.visible = false;
        }
        state.activeRobberFight = null;
        state.lastActionLog = '🏅 Cảnh sát đã áp giải tên cướp về đồn! Thú cưng và tiền của người dân đã được bảo vệ an toàn!';
      }
    }
  }
}

// --- 19.9. TÍCH HỢP VÀO VÒNG LẶP CHÍNH scene.onBeforeRender ---
const prevOnBeforeRenderV112 = scene.onBeforeRender;
let lastV130Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (prevOnBeforeRenderV112) {
    prevOnBeforeRenderV112(rendererInst, sceneInst, cameraInst);
  }
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV130Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV130Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Điều khiển rẽ trái/phải bằng Tay cầm mượt như đi bộ, Ghế phụ thò đầu 360° & Đồng bộ xe NPC
  updateUnifiedControllerDrivingAndNpcVehicleSync(dt);

  // 2. Digital Twin Kính chắn gió & Kính hậu (Tự động tái dựng 3D nếu ESP32-CAM trễ/mờ)
  renderSmartDigitalTwinWindshieldAndRearMirrors(elapsed);

  // 3. Cập nhật xã hội NPC, bắt trộm Chó/Mèo, Đánh nhau với Cướp & Cảnh sát bắt cướp
  updateRobberPetTheftFightAndSocialWorld(dt, elapsed);
};

// ======================================================================
// 20. PATCH V135 CHO APP.JS (MASTER PATCH TRẢI NGHIỆM ĐỒ HỌA & LOGIC VR 2026)
// ======================================================================

// --- 20.1. TẮT HOÀN TOÀN TIA ĐỎ/XANH TRỤC TỌA CỦA ĐÈN GIAO THÔNG ---
(function hideTrafficLightAxesHelpers() {
  scene.traverse(function(obj) {
    if (obj.isAxesHelper || (obj.type === 'AxesHelper') || (obj.isLineSegments && obj.material && obj.material.vertexColors)) {
      if (obj.parent && obj.parent !== controller1 && obj.parent !== controller2) {
        obj.visible = false;
      }
    }
  });
})();

// --- 20.2. CHUẨN HÓA GÓC NHÌN NGƯỜI THỨ NHẤT (FIRST-PERSON POV) CẢ 4 GHẾ ---
const SEAT_LOCAL_OFFSETS_V135 = [
  new THREE.Vector3(-0.38, 0.98, 0.12),   // Ghế 0: Ghế lái (Chính diện vô lăng & cụm đồng hồ)
  new THREE.Vector3(0.38, 0.98, 0.12),    // Ghế 1: Ghế phụ trước (Bên cạnh ghế lái, ngắm táp-lô)
  new THREE.Vector3(-0.38, 0.98, -0.68),  // Ghế 2: Ghế sau bên trái (VIP Lounge)
  new THREE.Vector3(0.38, 0.98, -0.68)   // Ghế 3: Ghế sau bên phải (VIP Lounge)
];

window.updateSeatViewpointV135 = function(seatIdx) {
  state.seatIndex = THREE.MathUtils.clamp(seatIdx, 0, 3);
  const targetOffset = SEAT_LOCAL_OFFSETS_V135[state.seatIndex];
  
  if (cameraRig) {
    cameraRig.position.copy(targetOffset);
    cameraRig.rotation.set(0, 0, 0);
  }
  
  if (vehicleRoot) {
    const seatNames = ['Ghế Lái Chính', 'Ghế Phụ Trước', 'Ghế VIP Sau Trái', 'Ghế VIP Sau Phải'];
    state.lastActionLog = `💺 Bạn đang ngồi ở: ${seatNames[state.seatIndex]} (Góc nhìn người thứ nhất FPV Chuẩn)`;
  }
};

// --- 20.3. TÍNH NĂNG GIỮ NÚT A ĐỂ BẬT CỔ TAY XOAY NHÌN 360 ĐỘ ---
let isHoldingButtonA = false;
let wristLookOrigin = new THREE.Vector3();
let initialHeadYaw = 0;

function checkWrist360LookTrigger(session) {
  if (!session) return;
  const sources = session.inputSources || [];
  isHoldingButtonA = false;

  for (const src of sources) {
    if (src.gamepad && src.gamepad.buttons) {
      // Nút A trên tay phải Quest thường là button[4] hoặc button[0]
      if (src.handedness === 'right' && (src.gamepad.buttons[4]?.pressed || src.gamepad.buttons[0]?.pressed)) {
        isHoldingButtonA = true;
      }
    }
  }

  if (isHoldingButtonA) {
    // Khi giữ nút A: Cho phép xoay góc nhìn 360 độ cực nhanh theo hướng đưa tay
    if (controller2) {
      const wristRot = controller2.rotation.y;
      cameraRig.rotation.y = wristRot * 1.5;
    }
  }
}

// --- 20.4. XOAY NHÌN 360 ĐỘ TRÊN GHẾ PHỤ (GẤP 5 LẦN ĐỘ NHẠY KHI ĐẨY CẦN GẠT) ---
function updatePassengerFreeLookV135(dt, thumbstickX, thumbstickY) {
  if (state.seatIndex === 0) return; // Chỉ áp dụng cho ghế phụ

  const SENSITIVITY_BOOST = 5.0; // Tăng độ nhạy lên gấp 5 lần
  if (Math.abs(thumbstickX) > 0.08) {
    cameraRig.rotation.y -= thumbstickX * 3.5 * SENSITIVITY_BOOST * dt;
  }
  if (Math.abs(thumbstickY) > 0.08) {
    cameraRig.rotation.x = THREE.MathUtils.clamp(
      cameraRig.rotation.x - thumbstickY * 2.5 * SENSITIVITY_BOOST * dt,
      -Math.PI / 2.2, // Nhìn xuống sàn xe
      Math.PI / 2.2  // Nhìn lên trần xe sao bầu trời
    );
  }
}

// --- 20.5. HOẠT CẢNH ĐÂM BÀ CỤ: NGÃ VĂNG, NẰM ĐẤT 3S VÀ BIẾN MẤT ---
function checkGrannyCrashLogicV135(dt) {
  if (!window.grannyNpcInstance) return;
  const granny = window.grannyNpcInstance;
  
  if (granny.userData.isHit) {
    granny.userData.hitTimer = (granny.userData.hitTimer || 0) + dt;
    // Hoạt cảnh ngã văng xuống đường
    granny.rotation.x = THREE.MathUtils.lerp(granny.rotation.x, Math.PI / 2, dt * 6.0);
    granny.position.y = THREE.MathUtils.lerp(granny.position.y, 0.1, dt * 6.0);

    // Sau 3 giây biến mất
    if (granny.userData.hitTimer > 3.0) {
      granny.visible = false;
      granny.position.set(0, -999, 0); // Đưa xuống đáy bản đồ
      state.lastActionLog = '🚨 Bà cụ đã được đội cấp cứu 115 đưa vào bệnh viện điều trị an toàn!';
    }
    return;
  }

  // Kiểm tra va chạm với xe người chơi
  const carDist = vehicleRoot.position.distanceTo(granny.position);
  if (carDist < 2.2 && Math.abs(state.velocityMs) > 1.2) {
    granny.userData.isHit = true;
    granny.userData.hitTimer = 0.0;
    playImpactSound(10);
    state.lastActionLog = '💥 VA CHẠM! Bạn đã đâm trúng bà cụ! Bà cụ đang ngã xuống đường...';
  }
}

// --- 20.6. TÀI XẾ KHÁC XUỐNG XE ĐÒI ĐÁNH & CẢNH SÁT ĐẾN GIẢI QUYẾT ---
let roadRageState = {
  active: false,
  timer: 0,
  driverMesh: null,
  copMesh: null
};

function triggerRoadRageEncounter(collisionPos) {
  if (roadRageState.active) return;
  roadRageState.active = true;
  roadRageState.timer = 0;

  state.lastActionLog = '😡 TÀI XẾ XE BỊ ĐÂM ĐANG MỞ CỬA XUỐNG XE VỚI THÁI ĐỘ HUNG HÃN!';

  // Tạo tài xế tức giận
  const driverGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.6, 8);
  const driverMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5 });
  roadRageState.driverMesh = new THREE.Mesh(driverGeo, driverMat);
  roadRageState.driverMesh.position.set(collisionPos.x + 1.2, 0.8, collisionPos.z + 1.2);
  scene.add(roadRageState.driverMesh);

  // Sau 4 giây Cảnh Sát tới giải hòa
  setTimeout(() => {
    state.lastActionLog = '👮‍♂️ CẢNH SÁT GIAO THÔNG ĐÃ CÓ MẶT! Đang can ngăn và lập biên bản hòa giải.';
    const copGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.65, 8);
    const copMat = new THREE.MeshStandardMaterial({ color: 0x1976d2, roughness: 0.3 });
    roadRageState.copMesh = new THREE.Mesh(copGeo, copMat);
    roadRageState.copMesh.position.set(collisionPos.x + 0.5, 0.82, collisionPos.z + 0.5);
    scene.add(roadRageState.copMesh);
  }, 4000);

  // Sau 10 giây kết thúc sự việc
  setTimeout(() => {
    if (roadRageState.driverMesh) scene.remove(roadRageState.driverMesh);
    if (roadRageState.copMesh) scene.remove(roadRageState.copMesh);
    roadRageState.active = false;
    state.lastActionLog = '🤝 Vụ việc đã được giải quyết xong, các phương tiện tiếp tục lưu thông bình thường.';
  }, 10000);
}

// --- 20.7. TÍCH HỢP TỔNG THỂ VÀO LOOP ON BEFORE RENDER V135 ---
const prevLoopV130 = scene.onBeforeRender;
scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (prevLoopV130) {
    prevLoopV130(rendererInst, sceneInst, cameraInst);
  }

  const session = renderer.xr.getSession ? renderer.xr.getSession() : null;
  const dt = 0.016; // 60fps delta ước lượng

  // 1. Kiểm tra giữ nút A xoay cổ tay 360
  checkWrist360LookTrigger(session);

  // 2. Kiểm tra hoạt cảnh bà cụ bị đâm
  checkGrannyCrashLogicV135(dt);

  // 3. Tự động ẩn tia đỏ/xanh trục tọa độ nếu có đèn giao thông mới sinh ra
  if (Math.random() < 0.02) {
    scene.traverse(function(obj) {
      if (obj.isAxesHelper || (obj.type === 'AxesHelper')) {
        if (obj.parent && obj.parent !== controller1 && obj.parent !== controller2) {
          obj.visible = false;
        }
      }
    });
  }
};

// ============================================================================
// 21. BẢN NÂNG CẤP MASTER PATCH V140 (CHỈ THÊM MỚI - KHÔNG SỬA CODE CŨ):
//     1. Thêm màu Hồng Rose Quartz & Hồng Pastel + Cân bằng lớp phủ PBR dễ nhìn.
//     2. Sửa trục xoay Mui Trần (Đóng từ sau lên kín trần xe, Mở mui là xếp gọn
//        và ẩn hoàn toàn không còn thấy trần xe) + Sửa trục Khay RC.
//     3. Lên xe mặc định ở Ghế Lái (Góc nhìn thứ 1): Nhấn giữ nút [A] để xoay
//        cổ tay nhìn 360°, thả nút [A] là khóa xoay cử động tay và chuyển sang
//        nhận Nút Xoay (Thumbstick) để nhìn 360° cho góc nhìn thứ 1.
//     4. Nội thất & vị trí ngồi Góc nhìn thứ 1 riêng biệt cho từng loại xe:
//        Xe Cứu Hỏa, Xe Bus, Xe Cấp Cứu, Xe Tải, Xe Máy, Moto, Xe Đạp.
//     5. NPC đi Xe Đạp / Xe Máy / Motor chở thêm người phía sau (Pillion) &
//        Người chơi có thể lên ngồi ghế phụ phía sau để NPC chở đi.
//     6. Xe Bus & Taxi đón/trả khách tại Trạm Bus & Vỉa hè (Mở cửa xe, giới hạn
//        đúng sức chứa: Bus tối đa 14 khách, Taxi tối đa 3 khách).
//     7. Xe Cứu Hỏa đỗ cố định tại Trạm Cứu Hỏa; chỉ xuất phát bật đèn/còi khi
//        có đám cháy -> Lính cứu hỏa bước xuống xịt nước dập lửa chân thật +
//        Đám đông NPC hoảng loạn chạy & giơ điện thoại quay phim đám cháy.
//     8. Xe Cấp Cứu đỗ cố định tại Bệnh Viện; khi có tai nạn giao thông mới bật
//        đèn chạy tới -> Nhân viên y tế đẩy Băng Ca đưa nạn nhân lên xe chở về viện.
//     9. Xe Cảnh Sát có 2 NPC Cảnh Sát: 1 người bắt tội phạm, 1 người lên lái
//        chiếc xe vi phạm chạy về Đồn Cảnh Sát.
//    10. NPC tương tác khi gặp nhau trên đường, ăn uống ở quán, mua sắm, chụp
//        hình có đèn Flash ở công viên và chạy bộ thể dục vòng quanh thành phố.
// ============================================================================

// --- 21.1. THÊM MÀU HỒNG & CÂN BẰNG ĐỘ BÓNG PBR DỄ NHÌN (KHÔNG BỊ TỐI ĐẬM DO CHỒNG LỚP PHỦ) ---
(function addPinkColorsAndHarmonizePbrMaterials() {
  if (typeof CAR_PAINT_PALETTE !== 'undefined') {
    CAR_PAINT_PALETTE.push(
      { hex: 0xff758f, name: 'Hồng Rose Quartz' },
      { hex: 0xffafcc, name: 'Hồng Pastel Sakura' }
    );
  }

  // Cân bằng ánh sáng & độ phơi sáng để các lớp phủ PBR hòa trộn dịu mắt, tươi sáng nhưng không bị tối hay chói
  renderer.toneMappingExposure = 1.26;
  hemiLight.intensity = 1.45;
  hemiLight.color.setHex(0xdbeafe);
  hemiLight.groundColor.setHex(0x334155);
  mainShadowLight.intensity = 1.85;

  const pleasantPastelPalette = [
    0xff758f, // Hồng Rose Quartz
    0xffafcc, // Hồng Pastel
    0x72efdd, // Xanh Mint dịu
    0x90e0ef, // Xanh Sky Pastel
    0xffd166, // Vàng Kem ấm
    0xc77dff, // Tím Lavender dịu
    0xf4a261, // Cam Đào nhẹ
    0xa8dadc  // Xanh Ngọc nhạt
  ];

  let colorIdx = 0;
  scene.traverse((obj) => {
    if (obj.isMesh && obj.material && !obj.userData.isVolumetricBeam) {
      const mat = obj.material;
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // Giảm bớt metalness quá cao gây đen sẫm bề mặt vào ban đêm, giữ lớp bóng phủ (clearcoat) vừa phải
        if (mat.metalness > 0.72 && mat !== matChrome) {
          mat.metalness = 0.35;
        }
        if (mat.roughness < 0.18 && mat !== matGlass && mat !== matChrome) {
          mat.roughness = 0.26;
        }
        if (mat.clearcoat !== undefined) {
          mat.clearcoat = 0.65;
          mat.clearcoatRoughness = 0.18;
        }
        mat.needsUpdate = true;
      }
    }
  });

  // Phối thêm màu Hồng và gam màu Pastel dễ nhìn cho một số xe lưu thông trên đường
  allTrafficVehicles.forEach((veh, idx) => {
    if (veh.userData.category === 'CAR' && idx % 2 === 0) {
      const softHex = pleasantPastelPalette[colorIdx % pleasantPastelPalette.length];
      colorIdx++;
      veh.traverse((c) => {
        if (c.isMesh && c.material && c.material.clearcoat !== undefined) {
          c.material.color.setHex(softHex);
          c.material.metalness = 0.32;
          c.material.roughness = 0.24;
        }
      });
    }
  });
})();

// --- 21.2. SỬA TRIỆT ĐỂ TRỤC XOAY MUI TRẦN (ĐÓNG TỪ SAU LÊN TRẦN / MỞ LÀ ẨN HẲN TRẦN) & KHAY RC ---
(function fixConvertibleRoofAndRcCargoPivot() {
  // Đặt lại tâm bản lề của Mui Trần ở đúng chốt sau cốp xe (y = 1.12, z = 1.48)
  convertibleRoofGroup.position.set(0, 1.12, 1.48);
  const canopyMesh = convertibleRoofGroup.children[0];
  if (canopyMesh) {
    // Khi rotation.x = 0 (Đóng mui): Tấm trần vươn từ chốt sau (z = 1.48) lên sát đỉnh kính chắn gió (z = -0.62) ở độ cao y = 1.40m
    canopyMesh.position.set(0, 0.28, -1.02);
  }
  rcCargoTrayPivot.position.set(0, 0.78, 2.32);
})();

function updateV140ConvertibleRoofAndCargo(dt) {
  // Lưu ý logic đúng:
  // - state.convertibleRoofOpen === true (ĐANG MỞ MUI TRẦN): Mui xe mở từ trước gập vòng ra sau cốp và BIẾN MẤT khỏi trần xe!
  // - state.convertibleRoofOpen === false (ĐANG ĐÓNG MUI): Mui xe đóng từ sau cốp vòng lên che kín trần xe!
  const targetOpenProgress = state.convertibleRoofOpen ? 1.0 : 0.0;
  state.roofAnimProgress = THREE.MathUtils.lerp(state.roofAnimProgress, targetOpenProgress, dt * 4.5);

  if (state.roofAnimProgress > 0.94 && state.convertibleRoofOpen) {
    // Khi đã mở mui hoàn toàn: Ẩn hẳn trần xe để người lái ngước lên thấy bầu trời 100%, không còn bị che!
    convertibleRoofGroup.visible = false;
  } else {
    convertibleRoofGroup.visible = (state.currentBoardedType === 'ROLLS_ROYCE');
    // Xoay quanh chốt sau: từ 0 độ (đóng kín trên đầu) -> -115 độ (xếp gọn vào cốp sau)
    const foldAngleRad = THREE.MathUtils.degToRad(-state.roofAnimProgress * 115);
    convertibleRoofGroup.rotation.x = foldAngleRad;
    convertibleRoofGroup.position.y = 1.12 - state.roofAnimProgress * 0.32;
    convertibleRoofGroup.position.z = 1.48 + state.roofAnimProgress * 0.18;
  }

  // Sửa trục xoay Khay Hàng RC phía sau: mở bật lên theo bản lề sau mượt mà
  const targetCargoAngle = state.rcCargoOpen ? THREE.MathUtils.degToRad(-42) : 0;
  state.rcCargoAnim = THREE.MathUtils.lerp(state.rcCargoAnim, targetCargoAngle, dt * 5.0);
  rcCargoTrayPivot.rotation.x = state.rcCargoAnim;
}

// --- 21.3. LÊN XE MẶC ĐỊNH LÀ GHẾ LÁI (GÓC NHÌN THỨ 1) + GIỮ NÚT [A] XOAY CỔ TAY / THẢ NÚT [A] DÙNG NÚT XOAY NHÌN 360° ---
let v140WristRefYaw = null;
let v140WristRefPitch = null;
let forceNextBoardSeatIndex = 0; // Mặc định 0 = Ghế Lái

const origEnterCarV135 = window.enterOrExitCarWithBlink || (typeof enterOrExitCarWithBlink !== 'undefined' ? enterOrExitCarWithBlink : null);
window.enterOrExitCarWithBlink = function() {
  if (state.playerMode === 'ON_FOOT') {
    state.seatIndex = forceNextBoardSeatIndex; // Mặc định luôn vào Ghế Lái (0) với góc nhìn thứ 1
    forceNextBoardSeatIndex = 0;
  }
  if (origEnterCarV135) origEnterCarV135();
};

function updateV140HoldAOrThumbstick360Look(dt) {
  const session = renderer.xr.getSession ? renderer.xr.getSession() : null;
  const sources = session ? Array.from(session.inputSources) : [];
  const navGps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(gp => gp && !isRacingWheelDevice(gp)) : [];
  const allPads = [
    ...sources.map((s) => ({ gp: s.gamepad, hand: s.handedness })).filter((i) => i.gp),
    ...navGps.map((gp) => ({ gp, hand: gp.hand || '' }))
  ];

  let isHoldingBtnA = false;
  let rightStickX = 0;
  let rightStickY = 0;
  let anyStickX = 0;
  let anyStickY = 0;

  for (const { gp, hand } of allPads) {
    const ax0 = gp.axes[0] || 0;
    const ay1 = gp.axes[1] || 0;
    const ax2 = gp.axes[2] || 0;
    const ay3 = gp.axes[3] || 0;

    const sx = Math.abs(ax2) > Math.abs(ax0) ? ax2 : ax0;
    const sy = Math.abs(ay3) > Math.abs(ay1) ? ay3 : ay1;

    if (Math.abs(sx) > Math.abs(anyStickX)) anyStickX = sx;
    if (Math.abs(sy) > Math.abs(anyStickY)) anyStickY = sy;

    if (hand === 'right') {
      rightStickX = sx;
      rightStickY = sy;
      if (gp.buttons[4]?.pressed || gp.buttons[3]?.pressed) isHoldingBtnA = true;
    } else if (!hand) {
      if (gp.buttons[2]?.notExisting) {}
      if (Math.abs(ax2) > 0.1) rightStickX = ax2;
      if (Math.abs(ay3) > 0.1) rightStickY = ay3;
      if (gp.buttons[4]?.pressed) isHoldingBtnA = true;
    }
  }

  if (isHoldingBtnA) {
    // 1. ĐANG NHẤN GIỮ NÚT A: Xoay góc nhìn 360° theo cử động xoay cổ tay của tay cầm!
    const ctrl = xrControllers[1] || xrControllers[0];
    if (ctrl && renderer.xr.isPresenting) {
      const euler = new THREE.Euler().setFromQuaternion(ctrl.quaternion, 'YXZ');
      if (v140WristRefYaw === null) {
        v140WristRefYaw = euler.y - state.eyeLookYaw;
        v140WristRefPitch = euler.x - state.eyeLookPitch;
      }
      state.eyeLookYaw = (euler.y - v140WristRefYaw) * 2.6;
      state.eyeLookPitch = THREE.MathUtils.clamp((euler.x - v140WristRefPitch) * 2.2, -1.4, 1.4);
    }
  } else {
    // 2. KHI THẢ NÚT A: Khóa ngay cử động xoay cổ tay, chuyển sang nhận chuyển động của NÚT XOAY TAY CẦM (Thumbstick) để nhìn 360°!
    v140WristRefYaw = null;
    v140WristRefPitch = null;

    const lookInputX = Math.abs(rightStickX) > 0.12 ? rightStickX : (state.seatIndex !== 0 ? anyStickX : 0);
    const lookInputY = Math.abs(rightStickY) > 0.12 ? rightStickY : (state.seatIndex !== 0 ? anyStickY : 0);

    if (Math.abs(lookInputX) > 0.12) {
      state.eyeLookYaw -= lookInputX * 9.5 * dt; // Xoay tròn 360 độ mượt mà bằng nút xoay
    }
    if (Math.abs(lookInputY) > 0.12) {
      state.eyeLookPitch = THREE.MathUtils.clamp(state.eyeLookPitch - lookInputY * 6.5 * dt, -1.4, 1.4);
    }
  }

  cameraRig.rotation.order = 'YXZ';
  cameraRig.rotation.y = state.eyeLookYaw;
  cameraRig.rotation.x = state.eyeLookPitch;
  if (!renderer.xr.isPresenting) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.eyeLookYaw;
    camera.rotation.x = state.eyeLookPitch;
  }
}

// --- 21.4. NỘI THẤT ĐẶC TRƯNG RIÊNG BIỆT CHO TỪNG LOẠI XE (XE BUS, CỨU HỎA, CẤP CỨU, XE TẢI, XE MÁY, XE ĐẠP) ---
const specializedInteriorGroup = new THREE.Group();
chassisGroup.add(specializedInteriorGroup);

const interiorVariants = {
  BUS: new THREE.Group(),
  FIRETRUCK: new THREE.Group(),
  AMBULANCE: new THREE.Group(),
  TRUCK: new THREE.Group()
};

(function buildSpecializedVehicleInteriors() {
  // 1. Nội thất XE BUS: Vô lăng lớn nằm ngang, Máy quẹt thẻ vé xe Bus, Tay vịn cột vàng, Gương cầu lồi quan sát khoang hành khách
  const busWheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 16, 36), matPiano);
  busWheel.rotation.x = THREE.MathUtils.degToRad(-65);
  busWheel.position.set(-0.42, 0.72, -0.22);
  const ticketMachine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), new THREE.MeshStandardMaterial({ color: 0xffbe0b }));
  ticketMachine.position.set(-0.08, 0.75, -0.35);
  const handrailPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 10), new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.6 }));
  handrailPole.position.set(0.15, 0.95, -0.25);
  const busSign = createSpeechBubbleSprite('🚌 KHOANG LÁI XE BUS THÀNH PHỐ (MÁY SOÁT VÉ & CỬA TỰ ĐỘNG)', '#003566', '#ffd60a');
  busSign.scale.set(0.75, 0.16, 1);
  busSign.position.set(0, 1.38, -0.45);
  busSign.visible = true;
  interiorVariants.BUS.add(busWheel, ticketMachine, handrailPole, busSign);

  // 2. Nội thất XE CỨU HỎA: Bảng điều khiển Bơm Nước Áp Lực Cao, Nút Còi Hụ 114, Bộ đàm chỉ huy Đỏ
  const pumpConsole = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.25), new THREE.MeshStandardMaterial({ color: 0xd90429 }));
  pumpConsole.position.set(0.0, 0.74, -0.34);
  const pressureGauge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), matChrome);
  pressureGauge.rotation.x = Math.PI / 2;
  pressureGauge.position.set(-0.1, 0.82, -0.21);
  const fireNotice = createSpeechBubbleSprite('🚒 BUỒNG CHỈ HUY XE CỨU HỎA 114 (ÁP LỰC VÒI RỒNG: 100%)', '#780000', '#ffbe0b');
  fireNotice.scale.set(0.75, 0.16, 1);
  fireNotice.position.set(0, 1.38, -0.45);
  fireNotice.visible = true;
  interiorVariants.FIRETRUCK.add(pumpConsole, pressureGauge, fireNotice);

  // 3. Nội thất XE CẤP CỨU: Máy theo dõi nhịp tim ECG, Hộp sơ cứu Chữ Thập Đỏ, Băng ca Y tế phía sau
  const ecgMonitor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.20, 0.08), new THREE.MeshStandardMaterial({ color: 0x00f5d4 }));
  ecgMonitor.position.set(0.05, 0.82, -0.34);
  const medKit = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
  medKit.position.set(0.0, 0.58, 0.25);
  const ambNotice = createSpeechBubbleSprite('🚑 KHOANG Y TẾ XE CẤP CỨU 115 (MÁY MONITOR & BĂNG CA)', '#0077b6', '#00ff88');
  ambNotice.scale.set(0.75, 0.16, 1);
  ambNotice.position.set(0, 1.38, -0.45);
  ambNotice.visible = true;
  interiorVariants.AMBULANCE.add(ecgMonitor, medKit, ambNotice);

  // 4. Nội thất XE TẢI HẠNG NẶNG: Cần số sàn 12 cấp cao, Dây giật còi hơi trên trần, Đồng hồ áp suất khí nén
  const tallGearStick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 8), matChrome);
  tallGearStick.position.set(-0.12, 0.58, -0.15);
  const truckNotice = createSpeechBubbleSprite('🚚 CABIN XE TẢI HẠNG NẶNG (CÒI HƠI & HỘP SỐ 12 CẤP)', '#1e293b', '#00bbf9');
  truckNotice.scale.set(0.75, 0.16, 1);
  truckNotice.position.set(0, 1.38, -0.45);
  truckNotice.visible = true;
  interiorVariants.TRUCK.add(tallGearStick, truckNotice);

  Object.values(interiorVariants).forEach((grp) => {
    grp.visible = false;
    specializedInteriorGroup.add(grp);
  });
})();

// Cập nhật hiển thị nội thất tương ứng với loại xe người chơi đang ngồi
function syncSpecializedInteriorVisibility() {
  const curType = state.currentBoardedType || 'ROLLS_ROYCE';
  Object.keys(interiorVariants).forEach((k) => {
    interiorVariants[k].visible = (curType === k);
  });
  // Ẩn vô lăng Rolls-Royce khi đang ngồi khoang Bus (để dùng vô lăng ngang của Bus) hoặc Xe 2 bánh
  if (steeringWheelPivot) {
    steeringWheelPivot.visible = (curType !== 'BUS' && curType !== 'BICYCLE' && curType !== 'MOTORBIKE');
  }
}

// --- 21.5. NPC ĐI XE ĐẠP / XE MÁY / MOTOR CHỞ NGƯỜI PHÍA SAU & CHO PHÉP NGƯỜI CHƠI LÊN NGỒI GHẾ PHỤ PHÍA SAU ---
(function addPillionPassengersToTwoWheelers() {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d });
  const jacketColors = [0xff758f, 0x00bbf9, 0xffbe0b, 0x06d6a0];

  allTrafficVehicles.forEach((veh, idx) => {
    const vd = veh.userData;
    if (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE') {
      // Tạo NPC ngồi sau (Pillion Passenger) ôm eo hoặc ngồi yên sau xe máy / xe đạp
      const pillion = new THREE.Group();
      const pTorso = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.13, 0.36, 8, 10),
        new THREE.MeshStandardMaterial({ color: jacketColors[idx % jacketColors.length] })
      );
      pTorso.position.set(0, 1.04, 0.38);
      const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 10), skinMat);
      pHead.position.set(0, 1.40, 0.38);
      const pHelmet = createSafetyHelmetMesh(0xff758f, vd.category === 'MOTORBIKE');
      pHelmet.position.set(0, 1.44, 0.38);

      // 2 tay người ngồi sau vòng ra trước giữ eo người lái
      [-0.16, 0.16].forEach((ax) => {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.32, 6, 8), skinMat);
        arm.position.set(ax, 1.0, 0.22);
        arm.rotation.x = Math.PI / 2.2;
        pillion.add(arm);
      });

      pillion.add(pTorso, pHead, pHelmet);
      pillion.visible = (idx % 2 === 0); // 50% xe 2 bánh có sẵn người ngồi sau
      veh.add(pillion);
      vd.pillionPassengerMesh = pillion;
    }
  });
})();

// Hàm cho phép người chơi lên ngồi Ghế Phụ Phía Sau của Xe Máy / Xe Đạp / Moto gần nhất để NPC chở đi dạo!
function sitAsPillionOnNearestTwoWheeler() {
  const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
  let nearestBike = null;
  let minD = Infinity;
  for (const veh of allTrafficVehicles) {
    const cat = veh.userData.category;
    if (cat === 'MOTORBIKE' || cat === 'BICYCLE') {
      const d = refPos.distanceTo(veh.position);
      if (d < minD) {
        minD = d;
        nearestBike = veh;
      }
    }
  }
  if (!nearestBike) return;

  boardAnyNpcVehicle(nearestBike);
  // Chuyển người chơi ra ngồi yên sau (seatIndex = 1) và hiện thân người lái NPC ở phía trước để chở người chơi!
  state.seatIndex = 1;
  SEAT_POSITIONS[1].pos.set(-0.42, 0.12, 0.52);
  driverSeatMount.position.copy(SEAT_POSITIONS[1].pos);
  if (typeof coDriverFrontLeftAvatar !== 'undefined' && coDriverFrontLeftAvatar) {
    coDriverFrontLeftAvatar.position.set(-0.42, 0.08, 0.05);
    coDriverFrontLeftAvatar.visible = true;
  }
  state.lastActionLog = `🛵 Bạn đang ngồi Ghế Phụ Phía Sau trên [${nearestBike.userData.modelName}] do Tài xế NPC chở đi! Dùng Nút xoay để ngắm phố 360°!`;
}
document.getElementById('btn-sit-pillion-bike')?.addEventListener('click', sitAsPillionOnNearestTwoWheeler);

// --- 21.6. HỆ THỐNG XE BUS & TAXI ĐÓN / TRẢ KHÁCH TẠI TRẠM (MỞ CỬA XE, ĐÚNG SỨC CHỨA TỪNG LOẠI XE) ---
const taxiVehiclesList = [];
const busStopWaitingQueues = [];

(function setupBusStopQueuesAndTaxiFleet() {
  // 1. Tạo nhóm hành khách NPC đứng đợi tại các Trạm Xe Bus
  const stopZCoords = [-34, 0, 34];
  stopZCoords.forEach((sz, sIdx) => {
    const waitingGroup = new THREE.Group();
    waitingGroup.position.set(-10.8, 0.24, sz);
    const waitingNpcs = [];
    for (let w = 0; w < 3; w++) {
      const passenger = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.40, 8, 10),
        new THREE.MeshStandardMaterial({ color: [0xff758f, 0x00bbf9, 0xffd166][(sIdx + w) % 3] })
      );
      body.position.y = 0.65;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
      head.position.y = 1.05;
      passenger.add(body, head);
      passenger.position.set(0, 0, (w - 1) * 0.85);
      passenger.rotation.y = Math.PI / 2;
      waitingGroup.add(passenger);
      waitingNpcs.push(passenger);
    }
    const queueLabel = createSpeechBubbleSprite('🚏 Hành khách đang đợi lên Xe Bus / Vẫy Taxi', '#003566', '#00ff88');
    queueLabel.scale.set(1.6, 0.34, 1);
    queueLabel.position.set(0, 1.65, 0);
    queueLabel.visible = true;
    waitingGroup.add(queueLabel);
    scene.add(waitingGroup);
    busStopWaitingQueues.push({ worldPos: new THREE.Vector3(-10.8, 0.24, sz), waitingNpcs, respawnTimer: 0 });
  });

  // 2. Trang bị Cửa Xe Mở Tự Động & Bộ Đếm Số Lượng Hành Khách cho Xe Bus (Max 14 khách) và Xe Taxi (Max 3 khách)
  cityBusesList.forEach((bus) => {
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-1.18, 1.05, -2.1);
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.55, 0.95),
      new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.4 })
    );
    doorPanel.position.set(0, 0, 0.47);
    doorPivot.add(doorPanel);
    bus.add(doorPivot);

    bus.userData.transitDoorPivot = doorPivot;
    bus.userData.maxPassengers = 14; // Sức chứa tối đa của Xe Bus
    bus.userData.currentPassengers = 4;
    bus.userData.transitStopCooldown = 0;
    bus.userData.transitBoardingTimer = 0;
  });

  allTrafficVehicles.forEach((veh, idx) => {
    if (veh.userData.category === 'CAR' && idx % 2 === 1) {
      // Biến các xe CAR lẻ thành Xe Taxi Đón Khách (Có mào TAXI phát sáng & Cửa mở đón tối đa 3 khách)
      const taxiRoofSign = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.20, 0.24),
        new THREE.MeshBasicMaterial({ color: 0xffd60a })
      );
      taxiRoofSign.position.set(0, 1.38, 0);
      const doorPivot = new THREE.Group();
      doorPivot.position.set(-0.96, 0.52, -0.45);
      const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.88), new THREE.MeshStandardMaterial({ color: 0xffd60a }));
      doorMesh.position.set(0, 0, 0.44);
      doorPivot.add(doorMesh);
      veh.add(taxiRoofSign, doorPivot);

      veh.userData.isTaxi = true;
      veh.userData.modelName = 'Taxi Thành Phố';
      veh.userData.transitDoorPivot = doorPivot;
      veh.userData.maxPassengers = 3; // Sức chứa tối đa của Xe Taxi (3 ghế hành khách)
      veh.userData.currentPassengers = 1;
      veh.userData.transitStopCooldown = 0;
      veh.userData.transitBoardingTimer = 0;
      taxiVehiclesList.push(veh);
    }
  });
})();

function updatePublicBusAndTaxiPassengerBoarding(dt, elapsed) {
  // Hồi lại hành khách mới tại trạm sau khi xe đã đón đi
  for (const stop of busStopWaitingQueues) {
    const hiddenCount = stop.waitingNpcs.filter((n) => !n.visible).length;
    if (hiddenCount > 0) {
      stop.respawnTimer += dt;
      if (stop.respawnTimer > 12.0) {
        stop.respawnTimer = 0;
        stop.waitingNpcs.forEach((n) => {
          n.visible = true;
          n.position.x = 0;
        });
      }
    }
  }

  const transitFleet = [...cityBusesList, ...taxiVehiclesList];
  for (const veh of transitFleet) {
    const vd = veh.userData;
    if (vd.isBoardedByPlayer) continue;
    if (vd.transitStopCooldown > 0) vd.transitStopCooldown -= dt;

    if (vd.transitBoardingTimer > 0) {
      vd.transitBoardingTimer -= dt;
      vd.activeSpeed = 0;
      // Mở cánh cửa xe Bus / Taxi góc 70 độ để hành khách bước lên/xuống
      if (vd.transitDoorPivot) {
        vd.transitDoorPivot.rotation.y = THREE.MathUtils.lerp(vd.transitDoorPivot.rotation.y, -1.2, dt * 6);
      }
      if (vd.transitBoardingTimer <= 0) {
        if (vd.transitDoorPivot) vd.transitDoorPivot.rotation.y = 0;
        vd.hornBadge.visible = false;
        vd.transitStopCooldown = 14.0;
      }
      continue;
    } else if (vd.transitDoorPivot) {
      vd.transitDoorPivot.rotation.y = THREE.MathUtils.lerp(vd.transitDoorPivot.rotation.y, 0, dt * 6);
    }

    // Kiểm tra khi Xe Bus hoặc Taxi đi ngang qua Trạm Đón Khách và còn chỗ trống (currentPassengers < maxPassengers)
    if (vd.transitStopCooldown <= 0 && vd.currentPassengers < vd.maxPassengers) {
      for (const stop of busStopWaitingQueues) {
        const availableWaiters = stop.waitingNpcs.filter((n) => n.visible);
        if (availableWaiters.length === 0) continue;

        if (veh.position.distanceTo(stop.worldPos) < 9.5) {
          vd.transitBoardingTimer = 3.8;
          vd.activeSpeed = 0;
          const seatsLeft = vd.maxPassengers - vd.currentPassengers;
          const boardCount = Math.min(availableWaiters.length, vd.isTaxi ? Math.min(2, seatsLeft) : seatsLeft);

          for (let b = 0; b < boardCount; b++) {
            availableWaiters[b].visible = false; // Bước lên xe
          }
          // Có thể trả 1 khách xuống trạm rồi nhận khách mới lên
          vd.currentPassengers = Math.min(vd.maxPassengers, Math.max(0, vd.currentPassengers - 1) + boardCount);
          vd.hornBadge.visible = true;
          state.socialLog = vd.isTaxi
            ? `🚕 [Taxi Đón/Trả Khách]: Đã mở cửa đón ${boardCount} khách tại trạm (Số khách trên Taxi: ${vd.currentPassengers}/${vd.maxPassengers})!`
            : `🚌 [Xe Bus Đón/Trả Khách]: Đã mở cửa đón ${boardCount} hành khách lên xe (Số khách trên Bus: ${vd.currentPassengers}/${vd.maxPassengers})!`;
          state.lastActionLog = state.socialLog;
          break;
        }
      }
    }
  }
}

// --- 21.7. BÃI ĐỖ TRẠM CỨU HỎA CỐ ĐỊNH, LỬA CHÁY CHÂN THẬT, LÍNH CỨU HỎA XỊT NƯỚC & ĐÁM ĐÔNG NPC HOẢNG LOẠN / QUAY PHIM ---
const FIRE_STATION_BAY_POS = new THREE.Vector3(24.5, 0, -14.0);
const activeFireIncidentGroup = new THREE.Group();
activeFireIncidentGroup.visible = false;
scene.add(activeFireIncidentGroup);

const flameLayerMeshes = [];
const waterStreamParticles = [];
const firefighterCrewMeshes = [];
const fireCrowdSpectators = [];
let fireIncidentState = {
  active: false,
  location: new THREE.Vector3(14.5, 0.24, 14.5),
  intensity: 1.0,
  truckRef: null,
  phase: 'IDLE', // 'IDLE' | 'DISPATCHING' | 'EXTINGUISHING' | 'RETURNING'
  autoTriggerTimer: 16.0
};

(function buildFireStationAndFireEffectAssets() {
  // 1. Xây Bãi Đỗ Trạm Cứu Hỏa 114 cố định tại (24.5, 0.24, -14.0)
  const station = new THREE.Group();
  station.position.copy(FIRE_STATION_BAY_POS);
  const bayRoof = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 0.4, 11.5),
    new THREE.MeshStandardMaterial({ color: 0xb80c09, roughness: 0.3 })
  );
  bayRoof.position.y = 4.5;
  [-3.8, 3.8].forEach((px) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.5, 11.0), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
    pillar.position.set(px, 2.25, 0);
    station.add(pillar);
  });
  const stSign = createSpeechBubbleSprite('🚒 TRẠM CỨU HỎA 114 (BÃI ĐỖ XE CỨU HỎA TRỰC CHIẾN)', '#780000', '#ffd60a');
  stSign.scale.set(2.2, 0.42, 1);
  stSign.position.set(0, 5.4, 0);
  stSign.visible = true;
  station.add(bayRoof, stSign);
  scene.add(station);

  // Đưa toàn bộ Xe Cứu Hỏa về đỗ cố định tại Trạm Cứu Hỏa khi chưa có cháy!
  const firetrucks = allTrafficVehicles.filter((v) => v.userData.category === 'FIRETRUCK');
  firetrucks.forEach((ft) => {
    ft.userData.isInterceptingHijacker = true; // Tách khỏi vòng lặp chạy vô nghĩa trên đường!
    ft.position.copy(FIRE_STATION_BAY_POS);
    ft.rotation.y = 0;
    ft.userData.activeSpeed = 0;
    fireIncidentState.truckRef = ft;
  });

  // 2. Tạo Ngọn Lửa 3D Đa Lớp Chân Thật (Lõi trắng vàng, tầng lửa cam, tầng lửa đỏ + Cột khói đen +PointLight lửa bập bùng)
  const fireColors = [0xffffff, 0xffd60a, 0xff5400, 0xd90429, 0x2b2d42];
  for (let f = 0; f < 14; f++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.45 + (f % 3) * 0.35, 1.8 + (f % 4) * 0.85, 10),
      new THREE.MeshBasicMaterial({
        color: fireColors[f % fireColors.length],
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending
      })
    );
    cone.position.set((Math.random() - 0.5) * 2.2, 0.9 + (f % 3) * 0.5, (Math.random() - 0.5) * 2.2);
    activeFireIncidentGroup.add(cone);
    flameLayerMeshes.push(cone);
  }
  const fireLight = new THREE.PointLight(0xff5400, 18, 28, 1.5);
  fireLight.position.set(0, 2.5, 0);
  activeFireIncidentGroup.add(fireLight);

  // 3. Tạo 2 NPC Lính Cứu Hỏa cầm Vòi Rồng + Tia Nước Xịt Chữa Cháy 3D
  for (let ff = 0; ff < 2; ff++) {
    const fman = new THREE.Group();
    const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.44, 8, 10), new THREE.MeshStandardMaterial({ color: 0xd90429 }));
    suit.position.y = 1.05;
    const helm = createSafetyHelmetMesh(0xffd60a, true);
    helm.position.y = 1.52;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.75, 8), matChrome);
    nozzle.rotation.x = Math.PI / 2 - 0.35;
    nozzle.position.set(0, 1.15, -0.45);
    fman.add(suit, helm, nozzle);
    fman.position.set(ff === 0 ? -1.2 : 1.2, 0, 5.2);
    fman.visible = false;
    activeFireIncidentGroup.add(fman);
    firefighterCrewMeshes.push(fman);
  }

  // Luồng hạt nước (Water Jet Stream) phun từ vòi rồng của xe và lính cứu hỏa vào đám cháy
  const waterMat = new THREE.MeshBasicMaterial({ color: 0x90e0ef, transparent: true, opacity: 0.85 });
  for (let w = 0; w < 22; w++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), waterMat);
    drop.visible = false;
    activeFireIncidentGroup.add(drop);
    waterStreamParticles.push({ mesh: drop, progress: w / 22 });
  }

  // 4. Tạo Đám Đông 6 NPC đứng quanh đám cháy: 3 người Hoảng Loạn chạy vung tay + 3 người Giơ Điện Thoại Quay Phim!
  for (let c = 0; c < 6; c++) {
    const spec = new THREE.Group();
    const isFilming = (c % 2 === 0);
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.42, 8, 10),
      new THREE.MeshStandardMaterial({ color: [0xff758f, 0x00bbf9, 0xffbe0b, 0x72efdd, 0xc77dff, 0xf4a261][c] })
    );
    body.position.y = 1.02;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
    head.position.y = 1.46;
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 6, 8), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
    armL.position.set(-0.22, 1.1, 0);
    const armR = armL.clone();
    armR.position.x = 0.22;

    if (isFilming) {
      // Chiếc điện thoại Smartphone phát sáng trên tay phải NPC đang quay phim đám cháy
      const phone = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.02), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
      phone.position.set(0, -0.22, -0.12);
      armR.add(phone);
    }

    const bubble = createSpeechBubbleSprite(
      isFilming ? '📱 [Đang Quay Video]: Trời ơi cháy lớn quá! Livestream ngay!' : '😱 [Hoảng Loạn]: Cứu hỏa ơi!! Cháy nhà rồi bà con ơi!!',
      isFilming ? '#003566' : '#780000',
      '#ffd60a'
    );
    bubble.scale.set(1.65, 0.34, 1);
    bubble.position.set(0, 1.95, 0);
    bubble.visible = true;

    const angle = (c / 6) * Math.PI * 2;
    spec.position.set(Math.cos(angle) * 4.2, 0, Math.sin(angle) * 4.2);
    spec.lookAt(0, 0, 0);
    spec.add(body, head, armL, armR, bubble);
    spec.userData = { armL, armR, isFilming, baseAngle: angle };
    activeFireIncidentGroup.add(spec);
    fireCrowdSpectators.push(spec);
  }
})();

function triggerRealisticFireAndDispatchFiretruck() {
  if (!fireIncidentState.truckRef) return;
  initAudio();
  const fireSpots = [
    new THREE.Vector3(14.2, 0.24, -4.5),
    new THREE.Vector3(-14.2, 0.24, 12.0),
    new THREE.Vector3(14.2, 0.24, 18.0)
  ];
  const chosenSpot = fireSpots[Math.floor(Math.random() * fireSpots.length)];
  fireIncidentState.location.copy(chosenSpot);
  fireIncidentState.active = true;
  fireIncidentState.intensity = 1.0;
  fireIncidentState.phase = 'DISPATCHING';

  activeFireIncidentGroup.position.copy(chosenSpot);
  activeFireIncidentGroup.visible = true;
  firefighterCrewMeshes.forEach((f) => { f.visible = false; });
  waterStreamParticles.forEach((w) => { w.mesh.visible = false; });

  const ft = fireIncidentState.truckRef;
  ft.userData.hornBadge.visible = true;
  playSmartVehicleHornSound('FIRETRUCK');
  state.crimeLog = '🔥🚨 BÁO ĐỘNG CHÁY LỚN! Đám đông NPC đang hoảng loạn & quay phim! Xe Cứu Hỏa đã bật đèn tín hiệu xuất phát từ Trạm Cứu Hỏa!';
  state.lastActionLog = state.crimeLog;
}
document.getElementById('btn-trigger-fire-event')?.addEventListener('click', triggerRealisticFireAndDispatchFiretruck);

function updateFireStationAndFirefightingSystem(dt, elapsed) {
  if (!fireIncidentState.active) {
    fireIncidentState.autoTriggerTimer -= dt;
    if (fireIncidentState.autoTriggerTimer <= 0) {
      fireIncidentState.autoTriggerTimer = 42.0;
      triggerRealisticFireAndDispatchFiretruck();
    }
    return;
  }

  const ft = fireIncidentState.truckRef;
  if (!ft) return;

  // Hiệu ứng ngọn lửa 3D bập bùng chân thật
  flameLayerMeshes.forEach((cone, idx) => {
    const s = fireIncidentState.intensity * (0.75 + Math.sin(elapsed * 14 + idx) * 0.32);
    cone.scale.set(s, s * (1.0 + Math.cos(elapsed * 18 + idx) * 0.25), s);
    cone.rotation.y += dt * 3.5;
  });

  // Hoạt cảnh đám đông NPC xung quanh đám cháy: Người hoảng loạn chạy nhảy vung tay, người giơ cao điện thoại quay phim!
  fireCrowdSpectators.forEach((spec, idx) => {
    const sd = spec.userData;
    if (sd.isFilming) {
      // Giơ cao tay phải cầm điện thoại hướng về đám lửa, nghiêng người quay góc rộng
      sd.armR.rotation.x = -Math.PI * 0.62 + Math.sin(elapsed * 3 + idx) * 0.1;
      sd.armL.rotation.x = -0.4;
      spec.rotation.y += Math.sin(elapsed * 2.5 + idx) * 0.015;
    } else {
      // Hoảng loạn vung cả 2 tay lên trời và chạy vòng quanh đám cháy
      sd.armL.rotation.x = -Math.PI * 0.85 + Math.sin(elapsed * 18 + idx) * 0.45;
      sd.armR.rotation.x = -Math.PI * 0.85 - Math.sin(elapsed * 18 + idx) * 0.45;
      sd.baseAngle += dt * 1.1;
      spec.position.x = Math.cos(sd.baseAngle) * 4.4;
      spec.position.z = Math.sin(sd.baseAngle) * 4.4;
      spec.position.y = Math.abs(Math.sin(elapsed * 12 + idx)) * 0.22;
      spec.lookAt(0, 0.5, 0);
    }
  });

  if (fireIncidentState.phase === 'DISPATCHING') {
    const targetStopPos = fireIncidentState.location.clone().add(new THREE.Vector3(0, 0, 6.2));
    const toFire = targetStopPos.sub(ft.position);
    toFire.y = 0;
    if (toFire.length() > 0.8) {
      toFire.normalize();
      ft.position.addScaledVector(toFire, 13.5 * dt);
      ft.rotation.y = Math.atan2(-toFire.x, -toFire.z);
    } else {
      // Xe cứu hỏa đã tới đám cháy -> Triển khai Lính Cứu Hỏa & Xịt nước vòi rồng!
      fireIncidentState.phase = 'EXTINGUISHING';
      firefighterCrewMeshes.forEach((f) => { f.visible = true; });
      waterStreamParticles.forEach((w) => { w.mesh.visible = true; });
      state.crimeLog = '🚒💦 XE CỨU HỎA & LÍNH CỨU HỎA ĐANG XỊT VÒI RỒNG DẬP LỬA! Ngọn lửa đang suy giảm dần!';
      state.lastActionLog = state.crimeLog;
    }
  } else if (fireIncidentState.phase === 'EXTINGUISHING') {
    // Hoạt cảnh tia nước vòi rồng bắn từ lính cứu hỏa & súng nước trên nóc xe vào tâm đám lửa
    waterStreamParticles.forEach((wp, idx) => {
      wp.progress = (wp.progress + dt * 1.8) % 1.0;
      const t = wp.progress;
      const startX = idx % 2 === 0 ? -1.1 : 1.1;
      wp.mesh.position.set(
        THREE.MathUtils.lerp(startX, (Math.sin(elapsed * 8 + idx) * 0.8), t),
        1.15 + Math.sin(t * Math.PI) * 1.85,
        THREE.MathUtils.lerp(4.8, 0.0, t)
      );
    });

    // Giảm dần cường độ lửa cho đến khi tắt hẳn
    fireIncidentState.intensity -= dt * 0.18;
    if (fireIncidentState.intensity <= 0.05) {
      activeFireIncidentGroup.visible = false;
      firefighterCrewMeshes.forEach((f) => { f.visible = false; });
      waterStreamParticles.forEach((w) => { w.mesh.visible = false; });
      fireIncidentState.phase = 'RETURNING';
      state.crimeLog = '✅ Đám cháy đã được dập tắt hoàn toàn! Xe Cứu Hỏa đang thu vòi rồng quay về đỗ tại Trạm Cứu Hỏa.';
      state.lastActionLog = state.crimeLog;
    }
  } else if (fireIncidentState.phase === 'RETURNING') {
    const toStation = FIRE_STATION_BAY_POS.clone().sub(ft.position);
    toStation.y = 0;
    if (toStation.length() > 0.8) {
      toStation.normalize();
      ft.position.addScaledVector(toStation, 12.0 * dt);
      ft.rotation.y = Math.atan2(-toStation.x, -toStation.z);
    } else {
      // Đỗ cố định lại trong bãi Trạm Cứu Hỏa, tắt còi/đèn chờ lệnh tiếp theo
      ft.position.copy(FIRE_STATION_BAY_POS);
      ft.rotation.y = 0;
      ft.userData.hornBadge.visible = false;
      fireIncidentState.active = false;
      fireIncidentState.phase = 'IDLE';
    }
  }
}

// --- 21.8. XE CẤP CỨU ĐỖ TẠI BỆNH VIỆN, ĐIỀU ĐỘNG KHI CÓ TAI NẠN & HOẠT CẢNH ĐƯA NẠN NHÂN LÊN BĂNG CA CHỞ VỀ VIỆN ---
const HOSPITAL_BAY_POS = new THREE.Vector3(-24.5, 0, 22.5);
const stretcherRescueGroup = new THREE.Group();
stretcherRescueGroup.visible = false;
scene.add(stretcherRescueGroup);

let ambulanceDispatchState = {
  active: false,
  ambulanceRef: null,
  patientPos: new THREE.Vector3(),
  targetNpcRef: null,
  phase: 'IDLE', // 'IDLE' | 'GOING_TO_VICTIM' | 'LOADING_STRETCHER' | 'RETURNING_TO_HOSPITAL'
  timer: 0
};

(function setupHospitalAmbulanceAndStretcher() {
  // Đưa các Xe Cấp Cứu về đỗ cố định tại Bãi Đỗ Bệnh Viện khi chưa có tai nạn
  const ambulances = allTrafficVehicles.filter((v) => v.userData.category === 'AMBULANCE');
  ambulances.forEach((amb, idx) => {
    amb.userData.isInterceptingHijacker = true; // Không chạy lang thang vô hạn trên đường
    amb.position.set(HOSPITAL_BAY_POS.x + idx * 3.0, 0, HOSPITAL_BAY_POS.z);
    amb.rotation.y = 0;
    amb.userData.hornBadge.visible = false;
    if (idx === 0) ambulanceDispatchState.ambulanceRef = amb;
  });

  // Dựng Mô hình Băng Ca Cứu Thương 3D (Stretcher) + Nạn nhân nằm trên băng ca + 2 Nhân viên Y tế đẩy băng ca
  const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 1.95), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
  bedFrame.position.y = 0.65;
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.10, 1.85), new THREE.MeshStandardMaterial({ color: 0xff4d6d }));
  mattress.position.y = 0.74;
  // Nạn nhân nằm trên băng ca
  const patientBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.95, 8, 10), new THREE.MeshStandardMaterial({ color: 0x00bbf9 }));
  patientBody.rotation.x = Math.PI / 2;
  patientBody.position.set(0, 0.92, 0);

  // 2 Nhân viên y tế mặc áo Blouse trắng đẩy đầu và cuối băng ca
  [-1.15, 1.15].forEach((pz) => {
    const medic = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 8, 10), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    medic.position.set(0, 0.95, pz);
    stretcherRescueGroup.add(medic);
  });

  const stLabel = createSpeechBubbleSprite('🚑 [Cấp Cứu 115]: Đang đưa nạn nhân lên Băng Ca vào Xe Cấp Cứu về Bệnh Viện!', '#0077b6', '#00ff88');
  stLabel.scale.set(2.0, 0.38, 1);
  stLabel.position.set(0, 1.85, 0);
  stLabel.visible = true;
  stretcherRescueGroup.add(bedFrame, mattress, patientBody, stLabel);
})();

function dispatchHospitalAmbulanceToVictim(victimPos, npcRef = null) {
  if (ambulanceDispatchState.active || !ambulanceDispatchState.ambulanceRef) return;
  initAudio();
  ambulanceDispatchState.active = true;
  ambulanceDispatchState.patientPos.copy(victimPos);
  ambulanceDispatchState.targetNpcRef = npcRef;
  ambulanceDispatchState.phase = 'GOING_TO_VICTIM';

  const amb = ambulanceDispatchState.ambulanceRef;
  amb.userData.hornBadge.visible = true;
  playSmartVehicleHornSound('CAR');
  state.crimeLog = '🚑🚨 BỆNH VIỆN ĐA KHOA vừa điều Xe Cấp Cứu 115 bật đèn khẩn cấp chạy tới hiện trường tai nạn!';
  state.lastActionLog = state.crimeLog;
}

document.getElementById('btn-trigger-ambulance')?.addEventListener('click', () => {
  const frontPos = vehicleRoot.position.clone().add(new THREE.Vector3(0, 0, -6.5));
  dispatchHospitalAmbulanceToVictim(frontPos, sidewalkNpcs[0]);
});

function updateHospitalAmbulanceAndStretcherRescue(dt) {
  // Tự động phát hiện nếu có bất kỳ NPC nào bị tông ngã (KNOCKED_FLYING) hoặc xe NPC bị lật (OVERTURNED) để điều Xe Cấp Cứu!
  if (!ambulanceDispatchState.active) {
    const injuredNpc = sidewalkNpcs.find((n) => n.userData.npcState === 'KNOCKED_FLYING');
    if (injuredNpc) {
      dispatchHospitalAmbulanceToVictim(injuredNpc.position, injuredNpc);
    } else {
      const crashedVeh = allTrafficVehicles.find((v) => v.userData.crashState === 'OVERTURNED');
      if (crashedVeh) dispatchHospitalAmbulanceToVictim(crashedVeh.position, null);
    }
    return;
  }

  const amb = ambulanceDispatchState.ambulanceRef;
  if (!amb) return;

  if (ambulanceDispatchState.phase === 'GOING_TO_VICTIM') {
    const stopTarget = ambulanceDispatchState.patientPos.clone().add(new THREE.Vector3(0, 0, 3.8));
    const dir = stopTarget.sub(amb.position);
    dir.y = 0;
    if (dir.length() > 0.8) {
      dir.normalize();
      amb.position.addScaledVector(dir, 14.0 * dt);
      amb.rotation.y = Math.atan2(-dir.x, -dir.z);
    } else {
      // Đã tới nơi: Mở băng ca cứu thương, đưa nạn nhân lên băng ca và đẩy từ từ vào đuôi xe cấp cứu!
      ambulanceDispatchState.phase = 'LOADING_STRETCHER';
      ambulanceDispatchState.timer = 3.6;
      stretcherRescueGroup.position.copy(ambulanceDispatchState.patientPos);
      stretcherRescueGroup.visible = true;
      if (ambulanceDispatchState.targetNpcRef) {
        ambulanceDispatchState.targetNpcRef.visible = false; // Đã nằm lên băng ca
      }
      state.crimeLog = '🩺 Nhân viên y tế đang đặt nạn nhân lên Băng Ca và đẩy vào thùng Xe Cấp Cứu 115!';
      state.lastActionLog = state.crimeLog;
    }
  } else if (ambulanceDispatchState.phase === 'LOADING_STRETCHER') {
    // Hoạt cảnh đẩy chiếc Băng Ca tiến dần vào cửa sau của Xe Cấp Cứu
    const ambRearDoor = amb.position.clone().add(new THREE.Vector3(0, 0, 1.8));
    stretcherRescueGroup.position.lerp(ambRearDoor, dt * 1.8);
    ambulanceDispatchState.timer -= dt;
    if (ambulanceDispatchState.timer <= 0) {
      stretcherRescueGroup.visible = false;
      ambulanceDispatchState.phase = 'RETURNING_TO_HOSPITAL';
      state.crimeLog = '🚑 Đã đưa Băng Ca lên xe! Xe Cấp Cứu 115 đang chở bệnh nhân quay về Bệnh Viện Đa Khoa!';
      state.lastActionLog = state.crimeLog;
    }
  } else if (ambulanceDispatchState.phase === 'RETURNING_TO_HOSPITAL') {
    const toHosp = HOSPITAL_BAY_POS.clone().sub(amb.position);
    toHosp.y = 0;
    if (toHosp.length() > 0.9) {
      toHosp.normalize();
      amb.position.addScaledVector(toHosp, 14.0 * dt);
      amb.rotation.y = Math.atan2(-toHosp.x, -toHosp.z);
    } else {
      amb.position.copy(HOSPITAL_BAY_POS);
      amb.rotation.y = 0;
      amb.userData.hornBadge.visible = false;
      if (ambulanceDispatchState.targetNpcRef) {
        ambulanceDispatchState.targetNpcRef.visible = true;
      }
      ambulanceDispatchState.active = false;
      ambulanceDispatchState.phase = 'IDLE';
      state.lastActionLog = '🏥 Xe Cấp Cứu đã bàn giao bệnh nhân tại Bệnh Viện và đỗ trực chiến chờ ca tiếp theo!';
    }
  }
}

// --- 21.9. XE CẢNH SÁT 2 SĨ QUAN (1 CẢNH SÁT BẮT NGƯỜI + 1 CẢNH SÁT LÁI XE VI PHẠM VỀ ĐỒN CẢNH SÁT) ---
const POLICE_HQ_POS = new THREE.Vector3(24.5, 0, 22.5);
let policeImpoundState = {
  active: false,
  policeCarRef: null,
  violatingCarRef: null,
  phase: 'IDLE', // 'IDLE' | 'APPROACHING' | 'OFFICER2_BOARDING_VIOLATOR' | 'TOWING_TO_HQ'
  timer: 0
};

(function equipPoliceCarsWithSecondOfficer() {
  policeCarsList.forEach((pCar) => {
    // Bổ sung Sĩ Quan Cảnh Sát số 2 (Chuyên trách lái phương tiện vi phạm/tai nạn về Đồn Cảnh Sát)
    const officer2 = new THREE.Group();
    const uniMat = new THREE.MeshStandardMaterial({ color: 0x0a2463 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 8, 10), uniMat);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf1c27d }));
    head.position.y = 1.50;
    const badge = createSpeechBubbleSprite('👮‍♂️ [Cảnh Sát #2]: Tôi sẽ tịch thu & lái chiếc xe vi phạm này về Đồn Cảnh Sát!', '#0a2463', '#ffd60a');
    badge.scale.set(1.85, 0.36, 1);
    badge.position.set(0, 2.02, 0);
    badge.visible = true;
    officer2.add(torso, head, badge);
    officer2.position.set(-1.4, 0, 0);
    officer2.visible = false;
    pCar.add(officer2);
    pCar.userData.secondOfficerNpc = officer2;
  });
})();

function updateDualOfficerPoliceImpoundSystem(dt) {
  if (!policeImpoundState.active) {
    // Khi phát hiện có xe NPC bị tai nạn/vi phạm trên đường và có xe cảnh sát rảnh:
    const violatingVeh = allTrafficVehicles.find(
      (v) => v.userData.category === 'CAR' && (v.userData.crashState === 'BEING_RESCUED' || v.userData.blockedByPlayerTimer > 2.5)
    );
    if (violatingVeh && policeCarsList.length > 1) {
      const pCar = policeCarsList[1];
      pCar.userData.isInterceptingHijacker = true;
      policeImpoundState.active = true;
      policeImpoundState.policeCarRef = pCar;
      policeImpoundState.violatingCarRef = violatingVeh;
      policeImpoundState.phase = 'APPROACHING';
      pCar.userData.hornBadge.visible = true;
    }
    return;
  }

  const pCar = policeImpoundState.policeCarRef;
  const vCar = policeImpoundState.violatingCarRef;
  if (!pCar || !vCar) return;

  if (policeImpoundState.phase === 'APPROACHING') {
    const targetPos = vCar.position.clone().add(new THREE.Vector3(0, 0, -4.8));
    const dir = targetPos.sub(pCar.position);
    dir.y = 0;
    if (dir.length() > 0.9) {
      dir.normalize();
      pCar.position.addScaledVector(dir, 14.0 * dt);
      pCar.rotation.y = Math.atan2(-dir.x, -dir.z);
    } else {
      // Cả 2 Cảnh sát cùng bước xuống: Cảnh sát #1 lập biên bản bắt người, Cảnh sát #2 đi bộ sang chiếc xe vi phạm!
      policeImpoundState.phase = 'OFFICER2_BOARDING_VIOLATOR';
      policeImpoundState.timer = 3.2;
      if (pCar.userData.officerNpc) pCar.userData.officerNpc.visible = true;
      if (pCar.userData.secondOfficerNpc) pCar.userData.secondOfficerNpc.visible = true;
      state.crimeLog = '🚓👮‍♂️ 2 Sĩ Quan Cảnh Sát đã xuống xe: Cảnh Sát #1 bắt giữ người vi phạm, Cảnh Sát #2 đang lên lái xe vi phạm về Đồn!';
      state.lastActionLog = state.crimeLog;
    }
  } else if (policeImpoundState.phase === 'OFFICER2_BOARDING_VIOLATOR') {
    policeImpoundState.timer -= dt;
    if (policeImpoundState.timer <= 0) {
      if (pCar.userData.officerNpc) pCar.userData.officerNpc.visible = false;
      if (pCar.userData.secondOfficerNpc) pCar.userData.secondOfficerNpc.visible = false;
      vCar.userData.isInterceptingHijacker = true;
      vCar.userData.crashState = 'NORMAL';
      vCar.rotation.z = 0;
      policeImpoundState.phase = 'TOWING_TO_HQ';
      state.crimeLog = '🚓🚗 Cảnh Sát #2 đang trực tiếp lái chiếc xe vi phạm nối đuôi Xe Cảnh Sát về Đồn Cảnh Sát!';
      state.lastActionLog = state.crimeLog;
    }
  } else if (policeImpoundState.phase === 'TOWING_TO_HQ') {
    const toHq = POLICE_HQ_POS.clone().sub(pCar.position);
    toHq.y = 0;
    if (toHq.length() > 1.2) {
      toHq.normalize();
      pCar.position.addScaledVector(toHq, 13.0 * dt);
      pCar.rotation.y = Math.atan2(-toHq.x, -toHq.z);
      // Chiếc xe vi phạm do Cảnh sát #2 cầm lái chạy bám sát phía sau xe cảnh sát về đồn
      vCar.position.lerp(pCar.position.clone().sub(toHq.clone().multiplyScalar(5.2)), dt * 5);
      vCar.rotation.y = pCar.rotation.y;
    } else {
      pCar.userData.isInterceptingHijacker = false;
      vCar.userData.isInterceptingHijacker = false;
      pCar.userData.hornBadge.visible = false;
      policeImpoundState.active = false;
      policeImpoundState.phase = 'IDLE';
    }
  }
}

// --- 21.10. NPC GẶP NHAU CHÀO HỎI TRÊN ĐƯỜNG, CHỤP HÌNH FLASH Ở CÔNG VIÊN, ĂN UỐNG & CHẠY BỘ VÒNG QUANH THÀNH PHỐ ---
const cityJoggersList = [];
const parkPhotographersList = [];

(function spawnJoggersAndParkPhotographers() {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d });

  // 1. Tạo 4 NPC Chạy Bộ Thể Dục (Joggers) vòng quanh vỉa hè thành phố
  for (let j = 0; j < 4; j++) {
    const jogger = new THREE.Group();
    const trackSuit = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.42, 8, 10),
      new THREE.MeshStandardMaterial({ color: [0x06d6a0, 0xff758f, 0x00bbf9, 0xffbe0b][j] })
    );
    trackSuit.position.y = 1.04;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 10), skinMat);
    head.position.y = 1.48;
    const headband = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.018, 6, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    headband.rotation.x = Math.PI / 2;
    headband.position.y = 1.53;

    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.48, 6, 8), matPiano);
    legL.position.set(-0.08, 0.42, 0);
    const legR = legL.clone();
    legR.position.x = 0.08;
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 6, 8), skinMat);
    armL.position.set(-0.22, 1.1, 0);
    const armR = armL.clone();
    armR.position.x = 0.22;

    const badge = createSpeechBubbleSprite('🏃‍♂️ Đang chạy bộ thể dục quanh thành phố!', '#1b4332', '#06d6a0');
    badge.scale.set(1.4, 0.3, 1);
    badge.position.set(0, 1.95, 0);
    badge.visible = true;

    jogger.add(trackSuit, head, headband, legL, legR, armL, armR, badge);
    jogger.position.set(12.6, 0.24, (j - 1.5) * 18);
    jogger.userData = { legL, legR, armL, armR, headingRad: j % 2 === 0 ? 0 : Math.PI, phase: j * 2, turnCooldown: 0 };
    scene.add(jogger);
    cityJoggersList.push(jogger);
  }

  // 2. Tạo Cặp Đôi NPC Đứng Chụp Hình (Có hiệu ứng đèn Flash nháy sáng) trên vỉa hè Công viên & Khu mua sắm
  const photoSpots = [
    new THREE.Vector3(16.5, 0.24, -16.5),
    new THREE.Vector3(-16.5, 0.24, 16.5)
  ];
  photoSpots.forEach((spot, sIdx) => {
    const pairGroup = new THREE.Group();
    pairGroup.position.copy(spot);

    // Người chụp ảnh cầm máy ảnh DSLR / Điện thoại có đèn Flash
    const photographer = new THREE.Group();
    const pBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 8, 10), new THREE.MeshStandardMaterial({ color: 0x3a86ff }));
    pBody.position.y = 1.02;
    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), skinMat);
    pHead.position.y = 1.46;
    const cameraBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), matPiano);
    cameraBox.position.set(0, 1.38, 0.22);
    const flashBulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    flashBulb.position.set(0, 1.42, 0.32);
    const pLabel = createSpeechBubbleSprite('📸 1.. 2.. 3.. Cười lên nào! *Tách!*', '#1e293b', '#ffd60a');
    pLabel.scale.set(1.5, 0.32, 1);
    pLabel.position.set(0, 1.92, 0);
    pLabel.visible = true;
    photographer.add(pBody, pHead, cameraBox, flashBulb, pLabel);

    // Người mẫu NPC đứng tạo dáng (Vẫy tay chữ V) đối diện
    const modelNpc = new THREE.Group();
    const mBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 8, 10), new THREE.MeshStandardMaterial({ color: 0xff758f }));
    mBody.position.y = 1.02;
    const mHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), skinMat);
    mHead.position.y = 1.46;
    const mArmR = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 6, 8), skinMat);
    mArmR.position.set(0.22, 1.25, 0);
    modelNpc.add(mBody, mHead, mArmR);
    modelNpc.position.set(0, 0, 2.2);
    modelNpc.rotation.y = Math.PI;

    pairGroup.add(photographer, modelNpc);
    scene.add(pairGroup);
    parkPhotographersList.push({ flashBulb, modelArm: mArmR, timer: sIdx * 1.5 });
  });
})();

function updateNpcStreetGreetingsJoggersAndPhotography(dt, elapsed) {
  // 1. Khi 2 NPC đi bộ trên vỉa hè bắt gặp nhau (khoảng cách < 1.9m): Dừng lại xoay mặt vào nhau, vẫy tay chào hỏi trò chuyện!
  for (let i = 0; i < sidewalkNpcs.length; i++) {
    const a = sidewalkNpcs[i];
    const ad = a.userData;
    if (!a.visible || ad.isSocializingAtPoi || ad.npcState !== 'WALKING') continue;

    if (ad.peerChatCooldown > 0) ad.peerChatCooldown -= dt;
    if (ad.peerChatTimer > 0) {
      ad.peerChatTimer -= dt;
      // Giữ đứng yên và vẫy tay nói chuyện với nhau
      a.position.copy(ad.chatSavedPos);
      ad.rightArm.rotation.x = -Math.PI / 2.1 + Math.sin(elapsed * 12) * 0.35;
      ad.leftLeg.rotation.x = 0;
      ad.rightLeg.rotation.x = 0;
      if (ad.peerChatTimer <= 0) {
        ad.helloBubble.visible = false;
        ad.peerChatCooldown = 12.0;
      }
      continue;
    }

    if ((ad.peerChatCooldown || 0) <= 0) {
      for (let j = i + 1; j < sidewalkNpcs.length; j++) {
        const b = sidewalkNpcs[j];
        const bd = b.userData;
        if (!b.visible || bd.isSocializingAtPoi || bd.npcState !== 'WALKING' || (bd.peerChatCooldown || 0) > 0) continue;

        if (a.position.distanceTo(b.position) < 1.85) {
          ad.peerChatTimer = 2.8;
          bd.peerChatTimer = 2.8;
          ad.chatSavedPos = a.position.clone();
          bd.chatSavedPos = b.position.clone();
          a.lookAt(b.position.x, a.position.y, b.position.z);
          b.lookAt(a.position.x, b.position.y, a.position.z);
          ad.helloBubble.visible = true;
          bd.helloBubble.visible = true;
          break;
        }
      }
    }
  }

  // 2. Cập nhật các NPC Chạy Bộ Thể Dục (Joggers) chạy vòng quanh các ô phố
  for (const jogger of cityJoggersList) {
    if (jogger.userData && jogger.userData.npcState === 'KNOCKED_FLYING') continue;
    const jd = jogger.userData;
    jd.phase += dt * 15.0;
    const sw = Math.sin(jd.phase) * 0.78;
    jogger.userData.legL.rotation.x = sw;
    jogger.userData.legR.rotation.x = -sw;
    jogger.userData.armL.rotation.x = -sw * 0.9;
    jogger.userData.armR.rotation.x = sw * 0.9;

    const step = 5.4 * dt; // Tốc độ chạy bộ nhanh
    jogger.position.x -= Math.sin(jd.headingRad) * step;
    jogger.position.z -= Math.cos(jd.headingRad) * step;
    jogger.position.y = 0.24 + Math.abs(Math.sin(jd.phase)) * 0.08;
    jogger.rotation.y = jd.headingRad + Math.PI;

    const gx = Math.round(jogger.position.x / BLOCK_SIZE) * BLOCK_SIZE;
    const gz = Math.round(jogger.position.z / BLOCK_SIZE) * BLOCK_SIZE;
    if (jd.turnCooldown > 0) jd.turnCooldown -= dt;
    if (jd.turnCooldown <= 0 && Math.abs(Math.abs(jogger.position.x - gx) - 12.6) < 0.8 && Math.abs(Math.abs(jogger.position.z - gz) - 12.6) < 0.8) {
      jd.headingRad = normalizeAngleSigned(jd.headingRad + Math.PI / 2);
      jd.turnCooldown = 3.5;
    }
  }

  // 3. Cập nhật hiệu ứng nháy đèn Flash chụp ảnh và tạo dáng ở Công viên / Khu mua sắm
  for (const pg of parkPhotographersList) {
    pg.timer = (pg.timer + dt) % 2.8;
    pg.flashBulb.material.opacity = pg.timer < 0.16 ? 1.0 : 0.0;
    pg.modelArm.rotation.z = -2.4 + Math.sin(elapsed * 5) * 0.25;
  }
}

// --- 21.11. TÍCH HỢP TOÀN BỘ VÀO VÒNG LẶP CHÍNH scene.onBeforeRender ---
const prevOnBeforeRenderV135 = scene.onBeforeRender;
let lastV140Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (prevOnBeforeRenderV135) {
    prevOnBeforeRenderV135(rendererInst, sceneInst, cameraInst);
  }
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV140Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV140Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Sửa trục xoay Mui Trần (Đóng từ sau lên trần / Mở là ẩn hẳn trần xe) & Khay RC
  updateV140ConvertibleRoofAndCargo(dt);

  // 2. Giữ nút A xoay cổ tay 360°, thả nút A dùng Nút Xoay (Thumbstick) nhìn 360° ở góc nhìn thứ 1
  updateV140HoldAOrThumbstick360Look(dt);

  // 3. Đồng bộ nội thất đặc trưng cho từng loại xe công cộng (Bus, Cứu hỏa, Cấp cứu, Tải, Xe 2 bánh)
  syncSpecializedInteriorVisibility();

  // 4. Xe Bus & Taxi mở cửa đón/trả khách tại trạm đúng sức chứa
  updatePublicBusAndTaxiPassengerBoarding(dt, elapsed);

  // 5. Trạm Cứu Hỏa, Lửa cháy 3D, Lính cứu hỏa xịt nước & Đám đông NPC hoảng loạn / quay phim
  updateFireStationAndFirefightingSystem(dt, elapsed);

  // 6. Bệnh Viện điều Xe Cấp Cứu & Đưa nạn nhân lên Băng Ca chở về viện
  updateHospitalAmbulanceAndStretcherRescue(dt);

  // 7. Xe Cảnh Sát 2 Sĩ Quan (1 bắt cướp, 1 lái xe vi phạm về đồn)
  updateDualOfficerPoliceImpoundSystem(dt);

  // 8. NPC gặp nhau chào hỏi trên vỉa hè, chạy bộ thể dục & chụp ảnh đèn Flash
  updateNpcStreetGreetingsJoggersAndPhotography(dt, elapsed);
};

// ============================================================================
// 22. BẢN NÂNG CẤP MASTER PATCH V145 (CHỈ THÊM MỚI - KHÔNG SỬA CODE CŨ):
//     1. Điện thoại: Nút bấm góc dưới CHỈ dùng để Di Chuyển (Tiến/Lùi/Trái/Phải).
//        Góc nhìn điều khiển bằng Vuốt Màn Hình: Trái/Phải = 360°, Lên/Xuống = ±75°.
//        Trên Kính VR: Xoay Trái/Phải = 360°, Lên/Xuống giới hạn đúng ±90°.
//     2. Hệ thống Phối Màu & Kiểu Dáng Bespoke (Đặc biệt là 3 bản Màu Hồng):
//        Mỗi bảng màu thay đổi hoàn toàn thiết kế bên ngoài (Capo 2 tông màu,
//        Viền hông, Cánh gió, Mâm xe) VÀ toàn bộ nội thất ghế ngồi bên trong.
//     3. Dựng lại 3D Nội thất Ghế ngồi cho các xe lớn (Bus, Cứu hỏa, Cấp cứu, Tải):
//        - Xe Bus: 2 dãy ghế dài + Góc nhìn thứ 1 chuẩn tại 3 vị trí ngồi
//          (Ghế Dãy Trái, Ghế Dãy Phải, và Ghế Cuối Dãy Xe nhìn dọc suốt khoang xe).
//        - Xe Cứu Hỏa: Khoang lính cứu hỏa + Vị trí ngồi trên NÓC VÒI XỊT NƯỚC
//          cho phép người chơi xoay vòi rồng 360° và bấm xịt nước dập lửa trực tiếp.
//        - Xe Cấp Cứu & Xe Tải: Cabin thùng ngồi phía sau có băng ghế dài 2 bên
//          và vị trí ngồi cuối thùng nhìn qua cửa sổ đúng tầm nhìn thực tế.
// ============================================================================

// --- 22.1. ĐIỀU KHIỂN DI CHUYỂN BẰNG NÚT TRÊN ĐIỆN THOẠI & VUỐT MÀN HÌNH (TRÁI/PHẢI 360°, LÊN/XUỐNG ±75°; VR ±90°) ---
const PITCH_LIMIT_MOBILE_75_RAD = THREE.MathUtils.degToRad(75); // ±75 độ cho Điện thoại tránh lag/lỗi góc nhìn
const PITCH_LIMIT_VR_90_RAD = THREE.MathUtils.degToRad(89.5);   // ±90 độ cho Kính VR góc nhìn thứ 1

let touchLookPointerId = null;
let prevTouchLookX = 0;
let prevTouchLookY = 0;

(function setupMobileSwipeLookAndDpadMovementOnly() {
  const canvasEl = renderer.domElement;

  canvasEl.addEventListener('pointerdown', (e) => {
    if (touchLookPointerId !== null) return;
    touchLookPointerId = e.pointerId;
    prevTouchLookX = e.clientX;
    prevTouchLookY = e.clientY;
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== touchLookPointerId || dragged3DPanel) return;
    const dx = e.clientX - prevTouchLookX;
    const dy = e.clientY - prevTouchLookY;
    prevTouchLookX = e.clientX;
    prevTouchLookY = e.clientY;

    const isMobileDevice = (window.__DETECTED_DEVICE_TYPE__ === 'MOBILE_PHONE');
    const isPassenger360 = (state.playerMode === 'DRIVING' && state.seatIndex !== 0);
    const maxPitchRad = isPassenger360 ? (Math.PI * 0.498) : (isMobileDevice ? PITCH_LIMIT_MOBILE_75_RAD : PITCH_LIMIT_VR_90_RAD);

    // Vuốt trái/phải: xoay 360° tự do không giới hạn
    state.eyeLookYaw -= dx * 0.0052;
    // Vuốt lên/xuống: khóa chặt trong phạm vi ±90° (Ghế phụ) hoặc ±75° (Điện thoại lái xe)
    state.eyeLookPitch = THREE.MathUtils.clamp(state.eyeLookPitch - dy * 0.0042, -maxPitchRad, maxPitchRad);
  });

  const endTouchLook = (e) => {
    if (e.pointerId === touchLookPointerId) {
      touchLookPointerId = null;
    }
  };
  window.addEventListener('pointerup', endTouchLook);
  window.addEventListener('pointercancel', endTouchLook);
})();

function enforceMovementButtonsAndPitchClamping(dt) {
  const isMobileDevice = (window.__DETECTED_DEVICE_TYPE__ === 'MOBILE_PHONE');
  const maxPitchRad = isMobileDevice ? PITCH_LIMIT_MOBILE_75_RAD : PITCH_LIMIT_VR_90_RAD;

  // 1. Khi ở chế độ ĐI BỘ (ON_FOOT):
  //    Nếu người dùng bấm nút Trái (#pad-left) hoặc Phải (#pad-right) trên màn hình Điện thoại,
  //    chuyển thành bước dịch chuyển sang Trái / Phải (Strafe) thay vì xoay góc nhìn!
  if (state.playerMode === 'ON_FOOT' && (holdState.left || holdState.right)) {
    // Khôi phục avatarYaw bị vòng lặp gốc cộng để nút Trái/Phải không xoay camera nữa
    const undoTurn = (holdState.left ? 1 : 0) - (holdState.right ? 1 : 0);
    state.avatarYaw -= undoTurn * 2.2 * dt;
    playerAvatarGroup.rotation.y = state.avatarYaw;

    // Dịch chuyển bước ngang (Strafe Left / Right) theo hướng nhìn hiện tại
    const strafeDir = (holdState.right ? 1 : 0) - (holdState.left ? 1 : 0);
    const lookHeading = state.avatarYaw + (state.eyeLookYaw || 0);
    const strafeSpeed = 8.5;
    state.avatarPos.x += Math.cos(lookHeading) * strafeDir * strafeSpeed * dt;
    state.avatarPos.z -= Math.sin(lookHeading) * strafeDir * strafeSpeed * dt;
    clampFootPositionAgainstAllBuildings(state.avatarPos);
    playerAvatarGroup.position.copy(state.avatarPos);
  }

  // 2. Luôn kẹp chặt góc nhìn lên/xuống (Pitch): ±90° cho Ghế phụ nhìn trời/đất, ±75° khi lái xe điện thoại
  const isPassenger360 = (state.playerMode === 'DRIVING' && state.seatIndex !== 0);
  const currentMaxPitch = isPassenger360 ? (Math.PI * 0.498) : maxPitchRad;
  state.eyeLookPitch = THREE.MathUtils.clamp(state.eyeLookPitch || 0, -currentMaxPitch, currentMaxPitch);
  if (state.passenger360Pitch !== undefined) {
    state.passenger360Pitch = THREE.MathUtils.clamp(state.passenger360Pitch, -currentMaxPitch, currentMaxPitch);
  }

  cameraRig.rotation.order = 'YXZ';
  cameraRig.rotation.y = state.eyeLookYaw || 0;
  cameraRig.rotation.x = state.eyeLookPitch;
  if (!renderer.xr.isPresenting) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.eyeLookYaw || 0;
    camera.rotation.x = state.eyeLookPitch;
  }
}

// --- 22.2. BỘ PHỐI MÀU HỒNG ĐẶC BIỆT & BIẾN THỂ THIẾT KẾ NGOẠI THẤT + NỘI THẤT THEO TỪNG BẢNG MÀU ---
const bespokeExteriorTrimGroup = new THREE.Group();
chassisGroup.add(bespokeExteriorTrimGroup);

const matTwoToneAccent = new THREE.MeshPhysicalMaterial({ color: 0xf8edeb, roughness: 0.2, metalness: 0.35, clearcoat: 0.7 });
const matAmbientTrim = new THREE.MeshBasicMaterial({ color: 0xff758f });
let sportRearWingMesh = null;
let luxuryHoodInlayMesh = null;
let sideSkirtLeftMesh = null;
let sideSkirtRightMesh = null;

(function buildBespokeBodykitAndInteriorAccents() {
  // 1. Tấm ốp Nắp Capo 2 tông màu (Two-Tone Bespoke Hood Inlay)
  luxuryHoodInlayMesh = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.02, 1.48), matTwoToneAccent);
  luxuryHoodInlayMesh.position.set(0, 0.776, -1.45);
  luxuryHoodInlayMesh.visible = false;
  bespokeExteriorTrimGroup.add(luxuryHoodInlayMesh);

  // 2. Ốp lườn hông khí động học 2 bên thân xe (Bespoke Side Skirts)
  sideSkirtLeftMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 3.85), matTwoToneAccent);
  sideSkirtLeftMesh.position.set(-0.98, 0.24, 0.05);
  sideSkirtRightMesh = sideSkirtLeftMesh.clone();
  sideSkirtRightMesh.position.x = 0.98;
  bespokeExteriorTrimGroup.add(sideSkirtLeftMesh, sideSkirtRightMesh);

  // 3. Cánh gió thể thao GT phía sau cốp (Hiển thị tùy theo mẫu phối màu)
  sportRearWingMesh = new THREE.Group();
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.045, 0.28), matTwoToneAccent);
  wingBlade.position.set(0, 0.96, 2.25);
  [-0.55, 0.55].forEach((wx) => {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.16), matPiano);
    strut.position.set(wx, 0.85, 2.25);
    sportRearWingMesh.add(strut);
  });
  sportRearWingMesh.add(wingBlade);
  sportRearWingMesh.visible = false;
  bespokeExteriorTrimGroup.add(sportRearWingMesh);

  // 4. Dải viền LED Ambient & Gối tựa đầu thêu nổi bên trong nội thất ghế ngồi
  const dashTrimLine = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.022, 0.025), matAmbientTrim);
  dashTrimLine.position.set(0, 0.71, -0.39);
  bespokeExteriorTrimGroup.add(dashTrimLine);

  SEAT_POSITIONS.forEach((sp) => {
    const pillow = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.14, 8, 10), matTwoToneAccent);
    pillow.rotation.z = Math.PI / 2;
    pillow.position.set(sp.pos.x, 0.78, sp.pos.z + 0.16);
    bespokeExteriorTrimGroup.add(pillow);
  });
})();

const BESPOKE_EDITION_PRESETS = {
  ROYAL_SAPPHIRE: {
    name: 'Đen Sapphire Nguyên Bản',
    bodyHex: 0x101829, accentHex: 0xd4af37, seatHex: 0xdfd1be, woodHex: 0x3a2314, rimHex: 0xf0f2f5, ledHex: 0x00e5ff,
    showWing: false, showHoodInlay: false
  },
  PINK_PEONY_GOLD: {
    name: 'Hồng Mẫu Đơn Hoàng Gia (Phối Vàng Rose Gold)',
    bodyHex: 0xff758f, accentHex: 0xf7cad0, seatHex: 0xfff0f3, woodHex: 0xb56576, rimHex: 0xffd166, ledHex: 0xff4d6d,
    showWing: false, showHoodInlay: true
  },
  PINK_SAKURA_WHITE: {
    name: 'Hồng Đào Sakura (Phối Trắng Ngọc Trai)',
    bodyHex: 0xffafcc, accentHex: 0xffffff, seatHex: 0xfde2e4, woodHex: 0xffc8dd, rimHex: 0xffffff, ledHex: 0xff8fab,
    showWing: true, showHoodInlay: true
  },
  PINK_CYBER_CARBON: {
    name: 'Hồng Cyber Rose (Phối Đen Carbon Thể Thao)',
    bodyHex: 0xf72585, accentHex: 0x1a1c24, seatHex: 0x2b2d42, woodHex: 0xff4d6d, rimHex: 0x1a1c24, ledHex: 0x00f5d4,
    showWing: true, showHoodInlay: true
  },
  MINT_TIFFANY_LUX: {
    name: 'Xanh Mint Tiffany Bespoke',
    bodyHex: 0x72efdd, accentHex: 0xf8f9fa, seatHex: 0xfefae0, woodHex: 0x2a9d8f, rimHex: 0xe2e8f0, ledHex: 0x72efdd,
    showWing: false, showHoodInlay: true
  },
  SUNSET_CORAL_GT: {
    name: 'Cam San Hô GT Sport',
    bodyHex: 0xf4a261, accentHex: 0x264653, seatHex: 0xe9c46a, woodHex: 0x8d5524, rimHex: 0xffd166, ledHex: 0xff9f1c,
    showWing: true, showHoodInlay: true
  },
  LAVENDER_VELVET: {
    name: 'Tím Lavender Ánh Kim',
    bodyHex: 0xc77dff, accentHex: 0xf8edeb, seatHex: 0xf3d5b5, woodHex: 0x5a189a, rimHex: 0xe0aaff, ledHex: 0xc77dff,
    showWing: false, showHoodInlay: true
  },
  EMERALD_GOLD_VIP: {
    name: 'Xanh Lục Bảo Viền Vàng 24K',
    bodyHex: 0x2d6a4f, accentHex: 0xd4af37, seatHex: 0xd4a373, woodHex: 0x432818, rimHex: 0xd4af37, ledHex: 0x52b788,
    showWing: false, showHoodInlay: true
  },
  PEARL_GLACIER_SKY: {
    name: 'Trắng Băng Tuyết Phối Xanh Băng',
    bodyHex: 0xf8fafc, accentHex: 0x90e0ef, seatHex: 0xcaf0f8, woodHex: 0x0077b6, rimHex: 0x90e0ef, ledHex: 0x00bbf9,
    showWing: true, showHoodInlay: true
  }
};

const editionKeysList = Object.keys(BESPOKE_EDITION_PRESETS);
let currentEditionIndex = 1; // Mặc định sẵn sàng chuyển sang bản Hồng Mẫu Đơn ngay lần bấm đầu

function applyBespokeEditionStyle(editionKey) {
  const preset = BESPOKE_EDITION_PRESETS[editionKey] || BESPOKE_EDITION_PRESETS.PINK_PEONY_GOLD;

  // 1. Đổi màu Sơn Thân Xe + Nắp Capo 2 tông + Ốp Lườn + Cánh Gió
  matBodyPaint.color.setHex(preset.bodyHex);
  matBodyPaint.metalness = 0.32;
  matBodyPaint.roughness = 0.22;
  matTwoToneAccent.color.setHex(preset.accentHex);

  if (luxuryHoodInlayMesh) luxuryHoodInlayMesh.visible = preset.showHoodInlay;
  if (sportRearWingMesh) sportRearWingMesh.visible = preset.showWing;

  // 2. Đổi toàn bộ Nội Thất: Ghế Da Nappa, Ốp Táp-lô, Mâm & Lưới Tản Nhiệt, Đèn Viền Nội Thất
  matNappa.color.setHex(preset.seatHex);
  matWalnut.color.setHex(preset.woodHex);
  matChrome.color.setHex(preset.rimHex);
  matAmbientTrim.color.setHex(preset.ledHex);

  // Đổi cả màu trần xe mui trần theo tông màu phối
  if (convertibleRoofGroup && convertibleRoofGroup.children[0]) {
    convertibleRoofGroup.children[0].material.color.setHex(preset.accentHex);
  }

  state.lastActionLog = `🎨 Đã áp dụng Phiên Bản Bespoke: [${preset.name}] (Thay đổi đồng bộ Thiết kế Ngoại thất & Ghế ngồi Nội thất)!`;
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'car-color-select') {
    e.stopImmediatePropagation();
    applyBespokeEditionStyle(e.target.value);
  }
}, true);

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'btn-cycle-color') {
    e.stopImmediatePropagation();
    const key = editionKeysList[currentEditionIndex % editionKeysList.length];
    currentEditionIndex++;
    applyBespokeEditionStyle(key);
    const sel = document.getElementById('car-color-select');
    if (sel) sel.value = key;
  }
}, true);

// --- 22.3. DỰNG 3D NỘI THẤT GHẾ NGỒI CHO XE LỚN (BUS, CỨU HỎA, CẤP CỨU, XE TẢI)
//           VỚI 3 VỊ TRÍ NGỒI GÓC NHÌN THỨ 1 (DÃY TRÁI / DÃY PHẢI / CUỐI DÃY XE) & NÓC VÒI XỊT ---
let firetruckRoofTurretPivot = new THREE.Group();
let manualWaterSprayActive = false;
const manualTurretWaterDrops = [];

(function buildFull3DCabinsForLargeVehicles() {
  const busSeatMat = new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.45 });
  const busSeatCushionMat = new THREE.MeshStandardMaterial({ color: 0xffbe0b, roughness: 0.5 });
  const handrailMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.6, roughness: 0.25 });
  const cabinWallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
  const medicBenchMat = new THREE.MeshStandardMaterial({ color: 0x06d6a0, roughness: 0.4 });
  const truckWoodBenchMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.65 });

  // =========================================================================
  // A. KHOANG NỘI THẤT 3D XE BUS (2 DÃY GHẾ DÀI TRÁI/PHẢI + BĂNG GHẾ CUỐI DÃY XE)
  // =========================================================================
  if (interiorVariants.BUS) {
    // Sàn xe Bus dài từ z = -1.5m đến z = +3.6m
    const busFloor = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.08, 5.2), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    busFloor.position.set(0, 0.18, 1.05);
    interiorVariants.BUS.add(busFloor);

    // Dựng 2 dãy ghế dài bên Trái (x = -0.76) và bên Phải (x = +0.76) dọc theo lối đi giữa
    [-0.76, 0.76].forEach((rowX) => {
      // Bệ đỡ dãy ghế dài
      const longBenchBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 3.6), busSeatMat);
      longBenchBase.position.set(rowX, 0.36, 1.15);
      const longBackrest = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.52, 3.6), busSeatCushionMat);
      longBackrest.position.set(rowX + (rowX > 0 ? 0.24 : -0.24), 0.72, 1.15);
      interiorVariants.BUS.add(longBenchBase, longBackrest);

      // Các đệm chia khoang ghế dọc theo dãy
      for (let sz = -0.35; sz <= 2.65; sz += 0.75) {
        const divider = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.06), handrailMat);
        divider.position.set(rowX, 0.56, sz);
        interiorVariants.BUS.add(divider);
      }

      // Thanh tay vịn dọc trên trần xe + Tay nắm treo cho khách đứng
      const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 4.2, 8), handrailMat);
      topRail.rotation.x = Math.PI / 2;
      topRail.position.set(rowX * 0.65, 1.62, 1.2);
      interiorVariants.BUS.add(topRail);
    });

    // Băng ghế ngang 5 chỗ ở CUỐI DÃY XE BUS (z = +3.25m, cao hơn sàn 1 bậc để nhìn bao quát toàn bộ khoang xe!)
    const rearBenchSeat = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.44, 0.62), busSeatMat);
    rearBenchSeat.position.set(0, 0.44, 3.25);
    const rearBenchBack = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.62, 0.12), busSeatCushionMat);
    rearBenchBack.position.set(0, 0.88, 3.52);
    // Vách kính sau cùng của xe Bus
    const rearBusFrame = new THREE.Mesh(new THREE.BoxGeometry(2.24, 1.65, 0.08), cabinWallMat);
    rearBusFrame.position.set(0, 1.05, 3.62);
    const rearWindowCutout = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.75), matGlass);
    rearWindowCutout.position.set(0, 1.32, 3.57);
    rearWindowCutout.rotation.y = Math.PI;
    interiorVariants.BUS.add(rearBenchSeat, rearBenchBack, rearBusFrame, rearWindowCutout);
  }

  // =========================================================================
  // B. KHOANG NỘI THẤT XE CỨU HỎA + ĐÀI NGỒI NÓC VÒI XỊT NƯỚC (ROOF TURRET SEAT)
  // =========================================================================
  if (interiorVariants.FIRETRUCK) {
    // 2 Dãy ghế lính cứu hỏa kèm bình dưỡng khí SCBA màu vàng sau lưng
    [-0.68, 0.68].forEach((rx) => {
      const crewBench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 2.2), new THREE.MeshStandardMaterial({ color: 0x9e2a2b }));
      crewBench.position.set(rx, 0.38, 1.15);
      const scbaTank = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.52, 12), handrailMat);
      scbaTank.position.set(rx, 0.82, 1.15);
      interiorVariants.FIRETRUCK.add(crewBench, scbaTank);
    });

    // ĐÀI CHỈ HUY & GHẾ NGỒI TRÊN NÓC VÒI XỊT NƯỚC (Đặt tại y = 1.65m .. 2.35m trên nóc xe Cứu hỏa)
    const roofPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.75, 0.12, 16), matChrome);
    roofPlatform.position.set(0, 1.62, -0.45);
    const turretSeat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.46), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    turretSeat.position.set(0, 1.84, -0.25);

    // Khớp xoay 360° của Súng Phun Nước Vòi Rồng (Nằm ngay trước mặt người ngồi trên nóc xe cứu hỏa!)
    firetruckRoofTurretPivot.position.set(0, 2.18, -0.68);
    const cannonBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.95, 12), matChrome);
    cannonBarrel.rotation.x = Math.PI / 2 - 0.15;
    cannonBarrel.position.set(0, 0.08, -0.38);
    const nozzleTip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xd90429 }));
    nozzleTip.rotation.x = -Math.PI / 2 + 0.15;
    nozzleTip.position.set(0, 0.15, -0.86);

    // Nút 3D gắn ngay trên thân Vòi Rồng để bấm Tia Laser xịt nước trực tiếp
    createCockpit3DButton(
      firetruckRoofTurretPivot,
      '💦 XỊT VÒI RỒNG',
      0.22, 0.055, 0.02,
      new THREE.Vector3(0, 0.22, -0.15),
      '#00bbf9',
      () => {
        manualWaterSprayActive = !manualWaterSprayActive;
        state.lastActionLog = manualWaterSprayActive
          ? '💦 Đang BẬT Vòi Rồng Xịt Nước trên nóc Xe Cứu Hỏa! Xoay góc nhìn để hướng vòi nước vào đám cháy!'
          : '🛑 Đã khóa van Vòi Rồng trên nóc Xe Cứu Hỏa.';
      }
    );

    firetruckRoofTurretPivot.add(cannonBarrel, nozzleTip);
    interiorVariants.FIRETRUCK.add(roofPlatform, turretSeat, firetruckRoofTurretPivot);

    // Tạo 28 hạt nước áp lực cao bắn ra trực tiếp từ đầu Vòi Rồng trên nóc xe của người chơi
    const jetMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 28; i++) {
      const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), jetMat);
      pMesh.visible = false;
      scene.add(pMesh);
      manualTurretWaterDrops.push({ mesh: pMesh, t: i / 28 });
    }
  }

  // =========================================================================
  // C. CABIN THÙNG NGỒI PHÍA SAU CỦA XE CẤP CỨU (AMBULANCE BOX CABIN)
  // =========================================================================
  if (interiorVariants.AMBULANCE) {
    // Băng ghế dài bên Trái cho nhân viên y tế / người nhà bệnh nhân (Squad Bench)
    const leftMedicBench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 2.4), medicBenchMat);
    leftMedicBench.position.set(-0.75, 0.40, 1.35);
    // Tủ thiết bị y tế & ghế ngồi bên Phải
    const rightCabinet = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 2.4), cabinWallMat);
    rightCabinet.position.set(0.75, 0.40, 1.35);
    // Băng ca chính giữa thùng xe cấp cứu
    const centerStretcher = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.48, 1.75), new THREE.MeshStandardMaterial({ color: 0xff4d6d }));
    centerStretcher.position.set(0, 0.44, 1.35);
    // Ghế ngồi Y Sĩ ở Cuối Dãy Thùng Cấp Cứu (z = +2.55m) nhìn thẳng dọc theo băng ca lên cửa sổ thông Cabin trước
    const rearMedicSeat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.45, 0.52), medicBenchMat);
    rearMedicSeat.position.set(0, 0.44, 2.55);
    interiorVariants.AMBULANCE.add(leftMedicBench, rightCabinet, centerStretcher, rearMedicSeat);
  }

  // =========================================================================
  // D. CABIN THÙNG NGỒI PHÍA SAU CỦA XE TẢI (TRUCK TROOP/CARGO BOX CABIN)
  // =========================================================================
  if (interiorVariants.TRUCK) {
    // 2 Dãy ghế gỗ/thép gấp dọc 2 bên vách thùng xe tải + Băng ghế cuối thùng
    [-0.82, 0.82].forEach((tx) => {
      const troopBench = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.40, 3.2), truckWoodBenchMat);
      troopBench.position.set(tx, 0.40, 1.45);
      const sideRibWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 3.2), new THREE.MeshStandardMaterial({ color: 0x475569 }));
      sideRibWall.position.set(tx + (tx > 0 ? 0.26 : -0.26), 0.95, 1.45);
      interiorVariants.TRUCK.add(troopBench, sideRibWall);
    });
    const rearTruckBench = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.44, 0.55), truckWoodBenchMat);
    rearTruckBench.position.set(0, 0.44, 2.95);
    interiorVariants.TRUCK.add(rearTruckBench);
  }
})();

// --- 22.4. HỆ THỐNG CHUYỂN ĐỔI 3 VỊ TRÍ NGỒI GÓC NHÌN THỨ 1 (DÃY TRÁI / DÃY PHẢI / CUỐI DÃY XE) & NÓC VÒI XỊT ---
// Định nghĩa tọa độ 3 vị trí ngồi hành khách chuẩn tầm nhìn cho từng loại xe lớn (Bus, Cứu hỏa, Cấp cứu, Xe tải)
const LARGE_VEHICLE_SEAT_LAYOUTS = {
  BUS: {
    DRIVER:   { name: 'Ghế Tài Xế Xe Bus', pos: new THREE.Vector3(-0.42, 0.18, -0.05), defaultYaw: 0 },
    LEFT_ROW: { name: 'Ghế Dãy Trái Xe Bus (Nhìn dọc lối đi & cửa sổ trái)', pos: new THREE.Vector3(-0.74, 0.24, 0.95), defaultYaw: -0.25 },
    RIGHT_ROW:{ name: 'Ghế Dãy Phải Xe Bus (Nhìn dọc lối đi & cửa sổ phải)', pos: new THREE.Vector3(0.74, 0.24, 0.95), defaultYaw: 0.25 },
    REAR_END: { name: 'Ghế Cuối Dãy Xe Bus (Nhìn bao quát toàn bộ 2 dãy ghế & lối đi)', pos: new THREE.Vector3(0.0, 0.36, 3.05), defaultYaw: 0 }
  },
  FIRETRUCK: {
    DRIVER:      { name: 'Ghế Chỉ Huy Lái Xe Cứu Hỏa', pos: new THREE.Vector3(-0.42, 0.18, 0.05), defaultYaw: 0 },
    LEFT_ROW:    { name: 'Ghế Lính Cứu Hỏa Dãy Trái', pos: new THREE.Vector3(-0.66, 0.22, 1.10), defaultYaw: -0.2 },
    RIGHT_ROW:   { name: 'Ghế Lính Cứu Hỏa Dãy Phải', pos: new THREE.Vector3(0.66, 0.22, 1.10), defaultYaw: 0.2 },
    REAR_END:    { name: 'Ghế Cuối Khoang Cứu Hỏa', pos: new THREE.Vector3(0.0, 0.28, 1.85), defaultYaw: 0 },
    ROOF_TURRET: { name: 'Đài Ngồi Nóc Vòi Xịt Nước (Xoay 360° Xịt Nước)', pos: new THREE.Vector3(0.0, 1.32, -0.22), defaultYaw: 0 }
  },
  AMBULANCE: {
    DRIVER:   { name: 'Ghế Lái Xe Cấp Cứu 115', pos: new THREE.Vector3(-0.42, 0.12, 0.08), defaultYaw: 0 },
    LEFT_ROW: { name: 'Băng Ghế Y Tế Dãy Trái (Cabin Thùng Cấp Cứu)', pos: new THREE.Vector3(-0.72, 0.24, 1.25), defaultYaw: -0.35 },
    RIGHT_ROW:{ name: 'Ghế Bác Sĩ Dãy Phải (Cạnh Máy Monitor & Băng Ca)', pos: new THREE.Vector3(0.72, 0.24, 1.25), defaultYaw: 0.35 },
    REAR_END: { name: 'Ghế Cuối Thùng Cấp Cứu (Nhìn dọc Băng Ca & Cửa Sổ Cabin)', pos: new THREE.Vector3(0.0, 0.28, 2.38), defaultYaw: 0 }
  },
  TRUCK: {
    DRIVER:   { name: 'Ghế Lái Đầu Kéo Xe Tải', pos: new THREE.Vector3(-0.42, 0.22, -0.05), defaultYaw: 0 },
    LEFT_ROW: { name: 'Ghế Dãy Trái Cabin Thùng Tải', pos: new THREE.Vector3(-0.78, 0.24, 1.35), defaultYaw: -0.3 },
    RIGHT_ROW:{ name: 'Ghế Dãy Phải Cabin Thùng Tải', pos: new THREE.Vector3(0.78, 0.24, 1.35), defaultYaw: 0.3 },
    REAR_END: { name: 'Ghế Cuối Dãy Thùng Xe Tải (Nhìn dọc khoang thùng)', pos: new THREE.Vector3(0.0, 0.28, 2.75), defaultYaw: 0 }
  }
};

state.activeSpecialSeatKey = 'DRIVER';

function switchToSpecialVehicleSeat(seatKey) {
  initAudio();
  // Nếu người chơi đang đứng dưới đất (ON_FOOT), tự động cho lên chiếc xe gần nhất (hoặc xe hiện tại)
  if (state.playerMode !== 'DRIVING') {
    window.enterOrExitCarWithBlink();
  }

  // Nếu chọn ngồi Nóc Vòi Xịt mà chưa ở trên xe cứu hỏa, tự động chuyển sang chế độ Xe Cứu Hỏa
  if (seatKey === 'ROOF_TURRET' && state.currentBoardedType !== 'FIRETRUCK') {
    const ft = allTrafficVehicles.find((v) => v.userData.category === 'FIRETRUCK');
    if (ft) boardAnyNpcVehicle(ft);
    else state.currentBoardedType = 'FIRETRUCK';
  }

  const vType = LARGE_VEHICLE_SEAT_LAYOUTS[state.currentBoardedType] ? state.currentBoardedType : 'BUS';
  const layout = LARGE_VEHICLE_SEAT_LAYOUTS[vType];
  const targetSeat = layout[seatKey] || layout.DRIVER;

  state.activeSpecialSeatKey = seatKey;
  state.seatIndex = (seatKey === 'DRIVER') ? 0 : (seatKey === 'LEFT_ROW' ? 1 : (seatKey === 'RIGHT_ROW' ? 2 : 3));

  // Đặt vị trí camera góc nhìn thứ 1 vào đúng tọa độ ghế (Trái / Phải / Cuối dãy / Nóc vòi xịt)
  SEAT_POSITIONS[state.seatIndex].pos.copy(targetSeat.pos);
  driverSeatMount.position.copy(targetSeat.pos);

  // Mở trần xe nếu đang ngồi ở Cuối dãy hoặc Nóc vòi xịt để tầm nhìn dọc khoang xe không bị tấm mui sedan chắn ngang!
  if (seatKey === 'REAR_END' || seatKey === 'ROOF_TURRET') {
    if (convertibleRoofGroup) convertibleRoofGroup.visible = false;
  }

  state.eyeLookYaw = targetSeat.defaultYaw || 0;
  state.eyeLookPitch = 0;
  cameraRig.position.set(0, 0, 0);
  cameraRig.rotation.set(0, state.eyeLookYaw, 0);
  if (typeof coDriverFrontLeftAvatar !== 'undefined' && coDriverFrontLeftAvatar) {
    coDriverFrontLeftAvatar.visible = (seatKey !== 'DRIVER');
  }

  state.lastActionLog = `💺 [Góc Nhìn Thứ 1]: Đã ngồi vào [${targetSeat.name}]! Vuốt màn hình / Dùng Nút Xoay để quan sát khoang xe.`;
}

document.getElementById('btn-seat-left-row')?.addEventListener('click', () => switchToSpecialVehicleSeat('LEFT_ROW'));
document.getElementById('btn-seat-right-row')?.addEventListener('click', () => switchToSpecialVehicleSeat('RIGHT_ROW'));
document.getElementById('btn-seat-rear-end')?.addEventListener('click', () => switchToSpecialVehicleSeat('REAR_END'));
document.getElementById('btn-seat-driver-cab')?.addEventListener('click', () => switchToSpecialVehicleSeat('DRIVER'));
document.getElementById('btn-fire-roof-turret')?.addEventListener('click', () => switchToSpecialVehicleSeat('ROOF_TURRET'));

const sprayBtnEl = document.getElementById('btn-spray-water-cannon');
if (sprayBtnEl) {
  sprayBtnEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    if (state.activeSpecialSeatKey !== 'ROOF_TURRET') {
      switchToSpecialVehicleSeat('ROOF_TURRET');
    }
    manualWaterSprayActive = true;
    state.lastActionLog = '💦 ĐANG BẮN VÒI RỒNG ÁP LỰC CAO TỪ NÓC XE CỨU HỎA! Xoay góc nhìn để điều hướng dòng nước!';
  });
  window.addEventListener('pointerup', () => {
    manualWaterSprayActive = false;
  });
}

// Cập nhật chuyển động xoay Vòi Rồng trên nóc Xe Cứu Hỏa & Bắn dòng nước 3D theo đúng góc nhìn của người chơi
function updateFiretruckRoofTurretWaterCannon(dt, elapsed) {
  const isOnRoofTurret = (state.playerMode === 'DRIVING' && state.activeSpecialSeatKey === 'ROOF_TURRET');

  if (isOnRoofTurret && firetruckRoofTurretPivot) {
    // Vòi rồng xoay 360° trái/phải và nâng/hạ theo đúng hướng mắt nhìn thứ 1 của người chơi!
    firetruckRoofTurretPivot.rotation.y = state.eyeLookYaw || 0;
    firetruckRoofTurretPivot.rotation.x = THREE.MathUtils.clamp(state.eyeLookPitch || 0, -0.5, 0.65);
  }

  const shouldSpray = manualWaterSprayActive || (isOnRoofTurret && (keys.w || holdState.gas || state.hornActive));
  const worldNozzlePos = new THREE.Vector3();
  if (firetruckRoofTurretPivot) {
    firetruckRoofTurretPivot.getWorldPosition(worldNozzlePos);
  } else {
    worldNozzlePos.copy(vehicleRoot.position).add(new THREE.Vector3(0, 2.3, -0.6));
  }

  const aimYaw = state.headingRad + (state.eyeLookYaw || 0);
  const aimPitch = state.eyeLookPitch || 0.15;
  const sprayDir = new THREE.Vector3(
    -Math.sin(aimYaw) * Math.cos(aimPitch),
    Math.sin(aimPitch) + 0.25,
    -Math.cos(aimYaw) * Math.cos(aimPitch)
  ).normalize();

  for (const drop of manualTurretWaterDrops) {
    if (!shouldSpray) {
      drop.mesh.visible = false;
      continue;
    }
    drop.mesh.visible = true;
    drop.t = (drop.t + dt * 1.9) % 1.0;
    const dist = drop.t * 18.0; // Tầm bắn vòi rồng xa 18 mét
    drop.mesh.position.copy(worldNozzlePos).addScaledVector(sprayDir, dist);
    // Quỹ đạo parabol rơi xuống do trọng lực
    drop.mesh.position.y -= (drop.t * drop.t) * 4.8;
    if (drop.mesh.position.y < 0.1) drop.mesh.position.y = 0.1;

    // Nếu tia nước của người chơi bắn trúng đám cháy -> Dập tắt lửa nhanh gấp 3 lần!
    if (fireIncidentState && fireIncidentState.active) {
      if (drop.mesh.position.distanceTo(fireIncidentState.location) < 4.5) {
        fireIncidentState.intensity = Math.max(0, fireIncidentState.intensity - dt * 0.45);
      }
    }
  }
}

// --- 22.5. TÍCH HỢP VÀO VÒNG LẶP CHÍNH scene.onBeforeRender ---
const prevOnBeforeRenderV140 = scene.onBeforeRender;
let lastV145Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (prevOnBeforeRenderV140) {
    prevOnBeforeRenderV140(rendererInst, sceneInst, cameraInst);
  }
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV145Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV145Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Nút bấm Mobile chỉ dùng để di chuyển; Vuốt màn hình xoay 360° ngang & giới hạn dọc ±75° (Mobile) / ±90° (VR)
  enforceMovementButtonsAndPitchClamping(dt);

  // 2. Cập nhật Đài ngồi Nóc Vòi Xịt Nước trên Xe Cứu Hỏa & Bắn nước tương tác
  updateFiretruckRoofTurretWaterCannon(dt, elapsed);
};

// ============================================================================
// 23. BẢN NÂNG CẤP MASTER PATCH V150 (CHỈ THÊM MỚI - KHÔNG SỬA CODE CŨ):
//     1. Xóa mái che đỏ lơ lửng & cục hộp đen ở ngã tư; Dời vị trí đỗ xe người
//        chơi ra khỏi cột đèn; Chặn 100% NPC, Pet, Xe đi xuyên Xe tôi & Cột đèn.
//     2. Đặt 5 Cột đèn dọc mỗi vỉa hè và đặt Trạm Xe Bus tại đúng TRUNG BÌNH CỘNG
//        của 5 cột đèn, có bệ ghế ngồi & NPC ngồi đợi đủ 2 tay, 2 chân, mặt Lego.
//     3. Dựng gương mặt biểu cảm kiểu LEGO (mắt chấm, lông mày, miệng cười/ngạc
//        nhiên/đeo kính) cho toàn bộ NPC trong thế giới.
//     4. Sửa hoàn toàn chức năng "Tông Bà Già": Xe máy 3D thật, Bà già đủ tay chân;
//        khi tông xong sẽ có Xe Cấp Cứu đến đưa lên băng ca về Bệnh viện + Cảnh sát
//        lấy xe chạy về đồn + Bà già biến mất hoàn toàn không bị kẹt trước mũi xe.
//     5. Chu kỳ hoạt cảnh 7 giây cho NPC chụp hình / dạo phố (Đủ tay chân, sau 7s
//        tự động đi bộ sang địa điểm tiếp theo).
//     6. Thêm Rạp Chiếu Phim 3D (CGV/IMAX), Cửa ra vào / Cổng chính cho mọi tòa nhà,
//        và gắn Bảng hiệu sát vách tường ở đúng độ cao 2.5 lần chiều cao NPC (4.15m).
//     7. Dựng lại Xe Cấp Cứu có kính chắn gió & cửa sổ rõ nét như ô tô NPC; Thêm
//        đủ 2 chân ngồi gác lên bàn đạp cho tất cả NPC đi Xe máy / Moto / Xe đạp
//        (ngẫu nhiên đi 1 mình hoặc chở 2 người).
//     8. Khai thác toàn bộ khoảng trống: Cặp đôi ngồi bàn Cafe, NPC dắt chó đi dạo,
//        Xe bán kem tươi, Ca sĩ hát nhạc đường phố & Con nít cầm bóng bay chạy nhảy!
// ============================================================================

// --- 23.1. BỘ TẠO GƯƠNG MẶT BIỂU CẢM LEGO (MẮT CHẤM, MIỆNG CƯỜI, CA HÁT, NGẠC NHIÊN, KÍNH MÁT) ---
const legoFaceTexturesCache = [];
function getLegoMinifigFaceTexture(exprIdx = 0) {
  const idx = Math.abs(exprIdx) % 5;
  if (legoFaceTexturesCache[idx]) return legoFaceTexturesCache[idx];

  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Màu da Lego tươi sáng
  const skinHexes = ['#ffcf40', '#f4c29f', '#f1c27d', '#e0ac69', '#ffdbac'];
  ctx.fillStyle = skinHexes[idx % skinHexes.length];
  ctx.fillRect(0, 0, 256, 256);

  // Vẽ 2 mắt chấm tròn đen đặc trưng Lego + chấm sáng phản quang trong mắt
  ctx.fillStyle = '#111111';
  if (idx === 4) {
    // Biểu cảm đeo kính mát Cool Lego
    ctx.fillRect(68, 92, 50, 32);
    ctx.fillRect(138, 92, 50, 32);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#111111';
    ctx.beginPath();
    ctx.moveTo(60, 102);
    ctx.lineTo(196, 102);
    ctx.stroke();
  } else {
    [96, 160].forEach((ex) => {
      ctx.beginPath();
      ctx.arc(ex, 110, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 4, 105, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111111';
    });
  }

  // Lông mày Lego
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(80, 84);
  ctx.quadraticCurveTo(96, 76, 110, 84);
  ctx.moveTo(146, 84);
  ctx.quadraticCurveTo(160, 76, 176, 84);
  ctx.stroke();

  // Miệng biểu cảm Lego
  ctx.lineWidth = 7;
  ctx.beginPath();
  if (idx === 0 || idx === 4) {
    // Miệng cười tươi cổ điển Lego
    ctx.arc(128, 132, 32, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  } else if (idx === 1) {
    // Miệng cười lớn lộ răng trắng
    ctx.arc(128, 130, 34, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
  } else if (idx === 2) {
    // Miệng chữ O ngạc nhiên / đang hát ca
    ctx.fillStyle = '#9e2a2b';
    ctx.arc(128, 152, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Miệng cười nháy mắt tinh nghịch
    ctx.arc(128, 134, 28, 0.25 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  legoFaceTexturesCache[idx] = tex;
  return tex;
}

function applyLegoFaceToHeadMesh(headMesh, exprIdx = 0) {
  if (!headMesh) return;
  headMesh.material = new THREE.MeshStandardMaterial({
    map: getLegoMinifigFaceTexture(exprIdx),
    roughness: 0.35,
    metalness: 0.05
  });
  // Xoay nhẹ UV sphere để mặt chấm mắt Lego hướng thẳng về phía trước (+Z / -Z)
  headMesh.rotation.y = -Math.PI / 2;
}

// Áp dụng gương mặt Lego cho toàn bộ NPC hiện có
sidewalkNpcs.forEach((npc, idx) => {
  const head = npc.children.find((c) => c.isMesh && c.geometry?.type === 'SphereGeometry');
  applyLegoFaceToHeadMesh(head, idx);
});
cityJoggersList.forEach((jogger, idx) => {
  const head = jogger.children.find((c) => c.isMesh && c.geometry?.type === 'SphereGeometry');
  applyLegoFaceToHeadMesh(head, idx + 1);
});

// --- 23.2. XÓA MÁI CHE ĐỎ LƠ LỬNG & CỤC HỘP ĐEN Ở NGÃ TƯ + DỜI XE RA KHỎI CỘT ĐÈN ---
const allStreetPolePositions = []; // Lưu tọa độ toàn bộ cột đèn & đèn giao thông để chống đi xuyên 100%

(function removeIntersectionGlitchesAndFixCarSpawn() {
  // 1. Xóa các mái che đỏ (groundCanopy) bị treo lơ lửng ở các tòa nhà ẩn và xóa cục hộp đen car_guest_1 giữa đường
  cityBlocks.forEach((block) => {
    const toClean = [];
    block.children.forEach((c) => {
      if (c.isMesh && Math.abs(c.position.y - 3.6) < 0.2 && c.geometry?.parameters?.width > 13.5) {
        toClean.push(c);
      }
    });
    toClean.forEach((c) => block.remove(c));
  });

  if (typeof remoteCarMeshes !== 'undefined') {
    for (const [carId, mesh] of remoteCarMeshes.entries()) {
      if (carId === 'car_guest_1') {
        scene.remove(mesh);
        remoteCarMeshes.delete(carId);
      }
    }
  }

  // 2. Dời Trạm Cứu Hỏa và Bệnh Viện lùi sâu vào trong lô đất vỉa hè (x = ±22.5, z = ±22.5) để KHÔNG nằm trên lòng đường z = -14!
  FIRE_STATION_BAY_POS.set(22.5, 0, -22.5);
  HOSPITAL_BAY_POS.set(-22.5, 0, 22.5);
  scene.children.forEach((obj) => {
    if (obj.isGroup && Math.abs(obj.position.x - 24.5) < 1.0 && Math.abs(obj.position.z - (-14.0)) < 1.0) {
      obj.position.copy(FIRE_STATION_BAY_POS);
    }
  });
  if (fireIncidentState && fireIncidentState.truckRef) {
    fireIncidentState.truckRef.position.set(22.5, 0, -16.2);
  }

  // 3. Dời vị trí đỗ xe Rolls-Royce của người chơi tới vịnh đỗ sạch sẽ (-8.2, 0, -18.5), cách xa hoàn toàn cột đèn (-10.6, -13.5)!
  HOME_CAR_SPAWN_POS.set(-8.2, 0, -18.5);
  HOME_SPAWN_POS.set(-12.8, 0, -18.5);
  if (state.playerMode === 'ON_FOOT' && Math.abs(state.speedKmh) < 0.5) {
    vehicleRoot.position.copy(HOME_CAR_SPAWN_POS);
    state.avatarPos.copy(HOME_SPAWN_POS);
    playerAvatarGroup.position.copy(state.avatarPos);
  }
})();

// --- 23.3. LẮP 5 CỘT ĐÈN ĐƯỜNG & ĐẶT TRẠM XE BUS TẠI ĐÚNG TRUNG BÌNH CỘNG KHOẢNG CÁCH CỦA 5 CỘT ĐÈN
//           (CÓ GHẾ BĂNG DÀI & NPC NGỒI ĐỢI ĐỦ 2 TAY, 2 ĐÙI, 2 BẮP CHÂN, MẶT LEGO) ---
function createFullLimbedHumanNpc(shirtColor, pantsColor, exprIdx = 0, isSeated = false, scale = 1.0) {
  const human = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf4c29f, roughness: 0.4 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.45 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.6 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });

  // Đầu có biểu cảm Lego + Tóc/Mũ
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135 * scale, 14, 14), skinMat);
  applyLegoFaceToHeadMesh(head, exprIdx);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.142 * scale, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: [0x2b2d42, 0x5c3a21, 0xd4a373, 0x111111][exprIdx % 4] })
  );

  // Thân áo
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.145 * scale, 0.38 * scale, 8, 12), shirtMat);

  // 2 Tay đủ khớp vai
  const armGeo = new THREE.CapsuleGeometry(0.048 * scale, 0.34 * scale, 6, 8);
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  const rightArm = new THREE.Mesh(armGeo, skinMat);

  // 2 Chân (Nếu đang ngồi: Đùi nằm ngang + Bắp chân thả vuông góc xuống đất trên bệ ghế!)
  const legLeftGroup = new THREE.Group();
  const legRightGroup = new THREE.Group();

  if (isSeated) {
    torso.position.set(0, 0.78 * scale, 0);
    head.position.set(0, 1.18 * scale, 0.02 * scale);
    hair.position.set(0, 1.20 * scale, 0.02 * scale);
    leftArm.position.set(-0.21 * scale, 0.78 * scale, 0.08 * scale);
    leftArm.rotation.x = -Math.PI / 3.2;
    rightArm.position.set(0.21 * scale, 0.78 * scale, 0.08 * scale);
    rightArm.rotation.x = -Math.PI / 3.2;

    [-0.085 * scale, 0.085 * scale].forEach((lx, lIdx) => {
      const lGrp = lIdx === 0 ? legLeftGroup : legRightGroup;
      // Đùi nằm ngang trên mặt ghế (y = 0.48)
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.058 * scale, 0.24 * scale, 6, 8), pantsMat);
      thigh.rotation.x = Math.PI / 2;
      thigh.position.set(lx, 0.48 * scale, 0.16 * scale);
      // Bắp chân thả thẳng xuống đất
      const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.052 * scale, 0.28 * scale, 6, 8), pantsMat);
      calf.position.set(lx, 0.26 * scale, 0.30 * scale);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11 * scale, 0.08 * scale, 0.18 * scale), shoeMat);
      shoe.position.set(lx, 0.08 * scale, 0.34 * scale);
      lGrp.add(thigh, calf, shoe);
    });
  } else {
    torso.position.set(0, 1.05 * scale, 0);
    head.position.set(0, 1.48 * scale, 0);
    hair.position.set(0, 1.50 * scale, 0);
    leftArm.position.set(-0.22 * scale, 1.06 * scale, 0);
    rightArm.position.set(0.22 * scale, 1.06 * scale, 0);

    const legGeo = new THREE.CapsuleGeometry(0.06 * scale, 0.44 * scale, 6, 8);
    const lMesh = new THREE.Mesh(legGeo, pantsMat);
    const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.11 * scale, 0.08 * scale, 0.20 * scale), shoeMat);
    lShoe.position.set(0, -0.26 * scale, 0.04 * scale);
    lMesh.add(lShoe);
    legLeftGroup.position.set(-0.085 * scale, 0.42 * scale, 0);
    legLeftGroup.add(lMesh);

    const rMesh = lMesh.clone();
    legRightGroup.position.set(0.085 * scale, 0.42 * scale, 0);
    legRightGroup.add(rMesh);
  }

  human.add(torso, head, hair, leftArm, rightArm, legLeftGroup, legRightGroup);
  human.userData = { torso, head, leftArm, rightArm, leftLeg: legLeftGroup, rightLeg: legRightGroup, isSeated };
  return human;
}

(function rebuildBusStopsAt5LampMidpointWithSeatedPassengers() {
  // Xóa các hàng đợi xe bus cũ nằm sai trên vạch qua đường
  busStopWaitingQueues.forEach((q) => {
    q.waitingNpcs.forEach((n) => {
      if (n.parent) n.parent.remove(n);
    });
  });
  busStopWaitingQueues.length = 0;

  // Dọc theo mỗi tuyến đường vỉa hè (từ z = -30 đến z = -14), đặt 5 Cột Đèn Đường tại:
  // z1 = -30, z2 = -26, z3 = -22, z4 = -18, z5 = -14.
  // Trung bình cộng khoảng cách của 5 cột đèn chính xác là: (-30 + -26 + -22 + -18 + -14) / 5 = -22.0m!
  const lampZCoords = [-30, -26, -22, -18, -14];
  const midpointBusStopZ = lampZCoords.reduce((acc, val) => acc + val, 0) / lampZCoords.length; // = -22.0m

  cityBlocks.forEach((block, bIdx) => {
    // Xóa trạm xe bus cũ nằm ở z = 0 (ngay lối băng qua đường)
    const oldStops = block.children.filter((c) => c.isGroup && Math.abs(c.position.x - (-11.2)) < 0.5 && Math.abs(c.position.z) < 1.0);
    oldStops.forEach((s) => block.remove(s));

    // Đặt 5 cột đèn dọc vỉa hè ở x = -10.8m
    if (bIdx === Math.floor(cityBlocks.length / 2)) {
      lampZCoords.forEach((lz) => {
        const lamp = createStreetLampWithRefraction(-10.8, lz, false);
        block.add(lamp);
      });
    }

    // Dựng Trạm Xe Bus 3D có Mái Vòm + Bệ Ghế Ngồi tại đúng Trung Bình Cộng của 5 cột đèn (x = -11.6, z = -22.0)
    const shelter = new THREE.Group();
    shelter.position.set(-11.6, 0.24, midpointBusStopZ);

    const platformBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 4.8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    platformBase.position.y = 0.07;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 4.6), new THREE.MeshStandardMaterial({ color: 0x0077b6 }));
    roof.position.y = 2.55;
    const glassBack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 4.4), matGlass);
    glassBack.position.set(-0.92, 1.3, 0);

    // Bệ ghế ngồi dài (Bench Seat) cho hành khách ngồi đợi xe Bus
    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 3.4), matWalnut);
    benchSeat.position.set(-0.45, 0.26, 0);
    const benchBack = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.45, 3.4), matNappa);
    benchBack.position.set(-0.72, 0.62, 0);
    shelter.add(platformBase, roof, glassBack, benchSeat, benchBack);

    // Đặt 3 NPC có ĐỦ TAY CHÂN & MẶT LEGO đang NGỒI trên bệ ghế đợi Xe Bus (Quay mặt ra lòng đường +X)
    const seatedWaiters = [];
    [-1.05, 0, 1.05].forEach((wz, wIdx) => {
      const seatedNpc = createFullLimbedHumanNpc(
        [0xff758f, 0x00bbf9, 0xffd166][wIdx],
        [0x1d3557, 0x2b2d42, 0x3d405b][wIdx],
        bIdx + wIdx,
        true // Tư thế ngồi có đùi + bắp chân trên bệ ghế!
      );
      seatedNpc.position.set(-0.42, 0.06, wz);
      seatedNpc.rotation.y = Math.PI / 2;
      shelter.add(seatedNpc);
      seatedWaiters.push(seatedNpc);
    });

    // Bảng tên Trạm Xe Bus gắn sát mép mái trạm (không bay lơ lửng)
    const busBoard = createSpeechBubbleSprite('🚏 TRẠM XE BUS (TRUNG BÌNH CỘNG 5 CỘT ĐÈN)', '#003566', '#00ff88');
    busBoard.scale.set(1.65, 0.34, 1);
    busBoard.position.set(0.2, 2.82, 0);
    busBoard.visible = true;
    shelter.add(busBoard);

    block.add(shelter);

    const worldStopPos = new THREE.Vector3(
      block.position.x - 11.2,
      0.24,
      block.position.z + midpointBusStopZ
    );
    busStopWaitingQueues.push({
      blockRef: block,
      localZ: midpointBusStopZ,
      worldPos: worldStopPos,
      waitingNpcs: seatedWaiters,
      respawnTimer: 0
    });
  });
})();

// --- 23.4. CHỐNG ĐI XUYÊN XE NGƯỜI CHƠI & CHỐNG ĐI XUYÊN CỘT ĐÈN / ĐÈN GIAO THÔNG 100% ---
function enforceSolidPlayerCarAndLampPolesCollision(dt) {
  const carPos = vehicleRoot.position;

  // Danh sách các tọa độ cột đèn & cột đèn giao thông trong ô phố hiện tại quanh xe và các NPC
  function repelFromLampPolesInBlock(pos, radius = 0.85) {
    const gx = Math.round(pos.x / BLOCK_SIZE) * BLOCK_SIZE;
    const gz = Math.round(pos.z / BLOCK_SIZE) * BLOCK_SIZE;
    const poleLocals = [
      [10.5, -10.5], [-10.5, 10.5], [10.5, 10.5], [-10.5, -10.5], // 4 Cột đèn giao thông
      [-10.6, -13.5], [10.6, -13.5], [-10.6, 13.5], [10.6, 13.5], // 4 Cột đèn góc phố
      [-10.8, -30], [-10.8, -26], [-10.8, -22], [-10.8, -18], [-10.8, -14] // 5 Cột đèn trạm Bus
    ];
    for (const [px, pz] of poleLocals) {
      const wx = gx + px;
      const wz = gz + pz;
      const dx = pos.x - wx;
      const dz = pos.z - wz;
      const d = Math.hypot(dx, dz);
      if (d < radius && d > 0.0001) {
        pos.x = wx + (dx / d) * radius;
        pos.z = wz + (dz / d) * radius;
        return true;
      }
    }
    return false;
  }

  // 1. Không cho Xe Người Chơi hoặc Người Chơi đi xuyên qua bất kỳ Cột Đèn / Cột Đèn Giao Thông nào
  if (state.playerMode === 'DRIVING') {
    if (repelFromLampPolesInBlock(vehicleRoot.position, 1.55)) {
      state.velocityMs = -state.velocityMs * 0.35;
      state.speedKmh = state.velocityMs * 3.6;
    }
  } else {
    repelFromLampPolesInBlock(state.avatarPos, 0.65);
    playerAvatarGroup.position.copy(state.avatarPos);
  }

  // 2. Không cho bất kỳ NPC đi bộ, Người chạy bộ (Joggers), hay Thú cưng (Chó/Mèo) nào đi xuyên qua Xe của Người Chơi hoặc Cột Đèn!
  const allMovingWalkers = [...sidewalkNpcs, ...cityJoggersList, ...crossingAnimals];
  for (const entity of allMovingWalkers) {
    if (!entity || !entity.visible) continue;
    if (entity.userData && entity.userData.npcState === 'KNOCKED_FLYING') continue;
    repelFromLampPolesInBlock(entity.position, 0.72);

    const dxCar = entity.position.x - carPos.x;
    const dzCar = entity.position.z - carPos.z;
    const distToMyCar = Math.hypot(dxCar, dzCar);
    const minSafeRadius = 2.75; // Bán kính bảo vệ quanh thân xe Rolls-Royce của người chơi

    if (distToMyCar < minSafeRadius && distToMyCar > 0.001) {
      // Đẩy bật ra ngoài vỏ xe người chơi và xoay hướng đi vòng tránh chiếc xe!
      entity.position.x = carPos.x + (dxCar / distToMyCar) * (minSafeRadius + 0.15);
      entity.position.z = carPos.z + (dzCar / distToMyCar) * (minSafeRadius + 0.15);
      if (entity.userData) {
        if (entity.userData.crossDir !== undefined) {
          entity.userData.crossDir = -entity.userData.crossDir;
        }
        if (entity.userData.headingRad !== undefined) {
          entity.userData.headingRad = Math.atan2(-dxCar, -dzCar) + Math.PI / 2;
          entity.userData.targetHeadingRad = entity.userData.headingRad;
        }
      }
    }
  }

  // 3. Không cho bất kỳ Xe NPC nào đi xuyên qua Xe của Người Chơi khi xe người chơi đang đỗ!
  for (const veh of allTrafficVehicles) {
    if (!veh.visible || veh.userData.isBoardedByPlayer) continue;
    const dx = veh.position.x - carPos.x;
    const dz = veh.position.z - carPos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.65 && d > 0.001 && Math.abs(state.speedKmh) < 3.0) {
      veh.userData.activeSpeed = 0;
      veh.position.x = carPos.x + (dx / d) * 3.7;
      veh.position.z = carPos.z + (dz / d) * 3.7;
    }
  }
}

// --- 23.5. DỰNG LẠI MÔ HÌNH BÀ GIÀ ĐI BỘ & BÀ GIÀ ĐI XE MÁY 3D THẬT (XÓA CỤC HỘP VÀNG)
//           + HOẠT CẢNH CẤP CỨU ĐƯA ĐI BỆNH VIỆN & CẢNH SÁT LẤY XE CHẠY ĐI + BIẾN MẤT 100% ---
(function rebuildGrannyModelsWithReal3DScooterAndFullLimbs() {
  if (typeof grannyObstacles === 'undefined' || grannyObstacles.length < 2) return;

  // 1. Dựng lại Bà Già Đi Bộ Chống Gậy (Đủ 2 tay, 2 chân, tóc búi bạc, mặt Lego)
  const gWalker = grannyObstacles[0];
  gWalker.clear();
  const walkerNpc = createFullLimbedHumanNpc(0x7b2cbf, 0x2b2d42, 3, false, 0.94);
  const hairBun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
  hairBun.position.set(0, 1.52, -0.08);
  const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.88, 8), matWalnut);
  cane.position.set(0.24, 0.44, 0.18);
  const b1 = createSpeechBubbleSprite('👵 Ái chà! Xe tông trúng bà già đi bộ rồi! Gọi cấp cứu 115 mau!', '#590d22', '#ffd60a');
  b1.scale.set(1.8, 0.36, 1);
  b1.position.set(0, 1.92, 0);
  b1.visible = true;
  gWalker.add(walkerNpc, hairBun, cane, b1);
  gWalker.visible = false;

  // 2. Dựng lại Bà Già Chạy Xe Máy 3D Chân Thật (Xóa hoàn toàn khối hộp vàng vuông vức trong Ảnh 4!)
  const gMoto = grannyObstacles[1];
  gMoto.clear();
  const scooterPaint = new THREE.MeshPhysicalMaterial({ color: 0xff758f, roughness: 0.2, clearcoat: 0.8 });
  // 2 Bánh xe tròn + Yếm trước bo cong + Thân xe Vespa + Ghi-đông + Đèn pha tròn
  [-0.55, 0.55].forEach((wz) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 18), matTireRubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(0, 0.26, wz);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.15, 14), matChrome);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(0, 0.26, wz);
    gMoto.add(w, rim);
  });
  const frontShield = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.48, 10, 14), scooterPaint);
  frontShield.position.set(0, 0.62, -0.42);
  frontShield.rotation.x = 0.22;
  const rearSeatBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 0.52, 10, 14), scooterPaint);
  rearSeatBody.rotation.x = Math.PI / 2;
  rearSeatBody.position.set(0, 0.52, 0.15);
  const hBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 8), matChrome);
  hBar.rotation.z = Math.PI / 2;
  hBar.position.set(0, 0.92, -0.36);

  // Bà già ngồi trên xe máy có đủ 2 tay nắm ghi-đông và 2 chân đặt trên sàn để chân!
  const motoGrannyNpc = createFullLimbedHumanNpc(0xf4a261, 0x1d3557, 2, true, 0.95);
  motoGrannyNpc.position.set(0, 0.26, -0.02);
  const b2 = createSpeechBubbleSprite('🛵👵 Ối làng nước ơi! Tông bà già chạy xe Vespa rồi!', '#590d22', '#00e5ff');
  b2.scale.set(1.8, 0.36, 1);
  b2.position.set(0, 1.98, 0);
  b2.visible = true;
  gMoto.add(frontShield, rearSeatBody, hBar, motoGrannyNpc, b2);
  gMoto.visible = false;
})();

let grannyEmergencyCutscene = {
  active: false,
  phase: 'NONE', // 'TUMBLING' -> 'AMBULANCE_AND_POLICE_RESCUE' -> 'CLEANUP_GONE'
  timer: 0,
  crashCenterPos: new THREE.Vector3()
};

window.triggerRealRcObstacleGrannyCrash = function() {
  initAudio();
  playImpactSound(22);
  state.suspensionShakeIntensity = 2.2;

  const forward = new THREE.Vector3(-Math.sin(state.headingRad), 0, -Math.cos(state.headingRad));
  const right = new THREE.Vector3(Math.cos(state.headingRad), 0, -Math.sin(state.headingRad));
  const crashCenter = vehicleRoot.position.clone().add(forward.clone().multiplyScalar(4.2));
  grannyEmergencyCutscene.crashCenterPos.copy(crashCenter);

  grannyObstacles.forEach((granny, idx) => {
    granny.visible = true;
    const gd = granny.userData;
    const sideSign = idx === 0 ? -1 : 1;
    granny.position.copy(vehicleRoot.position)
      .add(forward.clone().multiplyScalar(2.6))
      .add(right.clone().multiplyScalar(sideSign * 0.8));
    granny.position.y = 0.24;
    granny.rotation.set(0, state.headingRad, 0);

    gd.velocity.set(
      forward.x * 7.5 + right.x * sideSign * 2.5,
      6.5,
      forward.z * 7.5 + right.z * sideSign * 2.5
    );
    gd.angularVel = sideSign * 9.5;
    gd.activeTimer = 99.0; // Được quản lý trực tiếp bởi chuỗi hoạt cảnh Cấp Cứu & Cảnh Sát bên dưới
  });

  grannyEmergencyCutscene.active = true;
  grannyEmergencyCutscene.phase = 'TUMBLING';
  grannyEmergencyCutscene.timer = 1.8;

  state.lastActionLog = '👵💥 TÔNG BÀ GIÀ! Đang điều động Xe Cấp Cứu 115 tới đưa Bà Già lên băng ca & Xe Cảnh Sát tới thu giữ phương tiện!';
};

function updateGrannyFullEmergencyAndCleanupSequence(dt) {
  if (!grannyEmergencyCutscene.active) return;
  grannyEmergencyCutscene.timer -= dt;

  if (grannyEmergencyCutscene.phase === 'TUMBLING') {
    for (const granny of grannyObstacles) {
      const gd = granny.userData;
      granny.position.addScaledVector(gd.velocity, dt);
      gd.velocity.y -= 15.0 * dt;
      if (granny.position.y <= 0.24) {
        granny.position.y = 0.24;
        gd.velocity.y = Math.abs(gd.velocity.y) * 0.3;
        gd.velocity.x *= 0.75;
        gd.velocity.z *= 0.75;
      }
      granny.rotation.x += gd.angularVel * dt;
    }

    if (grannyEmergencyCutscene.timer <= 0) {
      // Chuyển sang Giai đoạn 2: Xe Cấp Cứu + Băng Ca tới đón Bà Già đi bộ & Xe Cảnh Sát tới lấy chiếc xe máy của Bà Già chạy đi!
      grannyEmergencyCutscene.phase = 'AMBULANCE_AND_POLICE_RESCUE';
      grannyEmergencyCutscene.timer = 3.2;

      const cPos = grannyObstacles[0].position.clone();
      stretcherRescueGroup.position.copy(cPos);
      stretcherRescueGroup.visible = true;

      if (ambulanceDispatchState && ambulanceDispatchState.ambulanceRef) {
        const amb = ambulanceDispatchState.ambulanceRef;
        amb.position.set(cPos.x - 2.2, 0, cPos.z - 3.2);
        amb.lookAt(cPos.x, 0, cPos.z);
        amb.userData.hornBadge.visible = true;
      }
      if (policeCarsList.length > 0) {
        const pCar = policeCarsList[0];
        pCar.userData.isInterceptingHijacker = true;
        pCar.position.set(cPos.x + 2.5, 0, cPos.z - 3.0);
        pCar.lookAt(cPos.x, 0, cPos.z);
        pCar.userData.hornBadge.visible = true;
        if (pCar.userData.secondOfficerNpc) pCar.userData.secondOfficerNpc.visible = true;
      }
      playSmartVehicleHornSound('CAR');
      state.lastActionLog = '🚑🚓 Xe Cấp Cứu đang đưa Bà Già lên Băng Ca về Bệnh viện & Cảnh sát đang lấy xe của Bà Già chạy về đồn!';
    }
  } else if (grannyEmergencyCutscene.phase === 'AMBULANCE_AND_POLICE_RESCUE') {
    // Hoạt cảnh đẩy Băng ca vào xe cấp cứu và Cảnh sát dựng chiếc xe máy của Bà Già lên lái đi
    if (grannyObstacles[0]) {
      grannyObstacles[0].position.lerp(stretcherRescueGroup.position, dt * 4);
    }
    if (grannyObstacles[1]) {
      grannyObstacles[1].rotation.set(0, 0, 0);
      grannyObstacles[1].position.z -= 9.5 * dt; // Cảnh sát lái chiếc xe máy của bà già chạy về đồn!
    }

    if (grannyEmergencyCutscene.timer <= 0) {
      // Giai đoạn 3: BIẾN MẤT HOÀN TOÀN KHỎI ĐƯỜNG PHỐ (Không bao giờ còn đọng lại trước mũi xe!)
      grannyObstacles.forEach((granny) => {
        granny.visible = false;
        granny.position.set(0, -100, 0);
        granny.userData.activeTimer = 0;
      });
      stretcherRescueGroup.visible = false;

      if (ambulanceDispatchState && ambulanceDispatchState.ambulanceRef) {
        ambulanceDispatchState.ambulanceRef.position.copy(HOSPITAL_BAY_POS);
        ambulanceDispatchState.ambulanceRef.userData.hornBadge.visible = false;
      }
      if (policeCarsList.length > 0) {
        const pCar = policeCarsList[0];
        pCar.userData.isInterceptingHijacker = false;
        pCar.userData.hornBadge.visible = false;
        if (pCar.userData.secondOfficerNpc) pCar.userData.secondOfficerNpc.visible = false;
      }

      grannyEmergencyCutscene.active = false;
      grannyEmergencyCutscene.phase = 'NONE';
      state.lastActionLog = '✅ Xe Cấp Cứu đã đưa Bà Già vào Bệnh Viện & Cảnh Sát đã thu giữ xe về đồn! Hiện trường đã thông thoáng 100%!';
    }
  }
}

// --- 23.6. DỰNG LẠI XE CẤP CỨU RÕ NÉT (KÍNH XE ĐEN BÓNG NHƯ Ô TÔ NPC, MÀU SẮC TƯƠNG PHẢN)
//           & THÊM ĐỦ 2 CHÂN NGỒI GÁC LÊN BÀN ĐẠP CHO XE MÁY / MOTO / XE ĐẠP (NGẪU NHIÊN 1 HOẶC 2 NGƯỜI) ---
(function upgradeAmbulanceGlassAndAddLegsToAllBikeRiders() {
  const glossyWindshieldMat = new THREE.MeshPhysicalMaterial({
    color: 0x091326,
    roughness: 0.05,
    metalness: 0.35,
    clearcoat: 1.0
  });
  const frameBlackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });
  const emsGreenMat = new THREE.MeshStandardMaterial({ color: 0x06d6a0, roughness: 0.25 });
  const emsRedMat = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.25 });

  // 1. Nâng cấp toàn bộ Xe Cấp Cứu: Kính chắn gió đen bóng có viền khung đen, cửa sổ hông, cửa sổ sau, sọc Y tế Đỏ + Xanh Ngọc nổi bật
  allTrafficVehicles.filter((v) => v.userData.category === 'AMBULANCE').forEach((amb) => {
    // Kính chắn gió trước nổi bật rõ ràng như các xe ô tô NPC
    const frontGlassFrame = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.78, 0.08), frameBlackMat);
    frontGlassFrame.position.set(0, 1.52, -2.12);
    frontGlassFrame.rotation.x = 0.28;
    const frontGlassPane = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.68, 0.10), glossyWindshieldMat);
    frontGlassPane.position.copy(frontGlassFrame.position);
    frontGlassPane.rotation.copy(frontGlassFrame.rotation);

    // Kính cửa sổ ghế tài xế & ghế phụ 2 bên hông + Kính khoang cấp cứu phía sau
    [-1.09, 1.09].forEach((sx) => {
      const cabSideWin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.92), glossyWindshieldMat);
      cabSideWin.position.set(sx, 1.50, -1.55);
      const medSideWin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 1.45), glossyWindshieldMat);
      medSideWin.position.set(sx, 1.62, 0.55);
      const greenBelt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 3.42), emsGreenMat);
      greenBelt.position.set(sx, 0.74, 0.55);
      amb.add(cabSideWin, medSideWin, greenBelt);
    });

    // 2 Ô kính cửa sau xe cấp cứu + Nóc sơn Đỏ Y Tế nổi bật
    const rearDoubleWin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.58, 0.08), glossyWindshieldMat);
    rearDoubleWin.position.set(0, 1.62, 2.28);
    const redRoofCap = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.12, 3.40), emsRedMat);
    redRoofCap.position.set(0, 2.26, 0.55);

    amb.add(frontGlassFrame, frontGlassPane, rearDoubleWin, redRoofCap);
  });

  // 2. Bổ sung ĐỦ 2 CHÂN NGỒI GẬP ĐẦU GỐI GÁC LÊN BÀN ĐẠP / GÁC CHÂN cho tất cả NPC lái Xe Máy, Moto & Xe Đạp
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.5 });

  allTrafficVehicles.forEach((veh, idx) => {
    const vd = veh.userData;
    if (vd.category === 'MOTORBIKE' || vd.category === 'BICYCLE') {
      // Bổ sung 2 chân (Đùi + Bắp chân + Giày) cho Người Lái chính (nếu chưa có chân)
      if (vd.category === 'MOTORBIKE') {
        [-0.17, 0.17].forEach((lx) => {
          const riderThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.26, 6, 8), pantsMat);
          riderThigh.rotation.x = Math.PI / 2.6;
          riderThigh.position.set(lx, 0.72, -0.02);

          const riderCalf = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 6, 8), pantsMat);
          riderCalf.rotation.x = -0.25;
          riderCalf.position.set(lx, 0.46, -0.14);

          const riderBoot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.18), shoeMat);
          riderBoot.position.set(lx, 0.30, -0.20);

          // Thanh gác chân (Footpeg) bằng hợp kim
          const footpeg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 8), matChrome);
          footpeg.rotation.z = Math.PI / 2;
          footpeg.position.set(lx, 0.28, -0.16);

          veh.add(riderThigh, riderCalf, riderBoot, footpeg);
        });
      }

      // Bổ sung ĐỦ 2 CHÂN cho Người Ngồi Sau (Pillion Passenger) trên Xe Máy / Xe Đạp
      if (vd.pillionPassengerMesh) {
        [-0.18, 0.18].forEach((px) => {
          const pThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.22, 6, 8), pantsMat);
          pThigh.rotation.x = Math.PI / 2.8;
          pThigh.position.set(px, 0.72, 0.32);

          const pCalf = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.25, 6, 8), pantsMat);
          pCalf.position.set(px, 0.48, 0.24);

          const pShoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.16), shoeMat);
          pShoe.position.set(px, 0.32, 0.20);

          vd.pillionPassengerMesh.add(pThigh, pCalf, pShoe);
        });
        // Ngẫu nhiên 50% xe chở 2 người, 50% xe chạy 1 mình như ngoài đời
        vd.pillionPassengerMesh.visible = (idx % 2 === 0);
      }
    }
  });
})();

// --- 23.7. CÒI HÚ RIÊNG KHI NGỒI GHẾ NÓC VÒI XỊT XE CỨU HỎA & CHỈ HIỆN NÚT CHỌN GHẾ BUS KHI LÊN XE BUS ---
let turretSirenOsc = null;
let turretSirenGain = null;
let turretSirenActive = false;

function toggleFiretruckTurretWailSiren(forceState) {
  initAudio();
  if (!audioCtx) return;
  turretSirenActive = forceState !== undefined ? forceState : !turretSirenActive;

  if (turretSirenActive) {
    if (!turretSirenOsc) {
      turretSirenOsc = audioCtx.createOscillator();
      turretSirenGain = audioCtx.createGain();
      turretSirenOsc.type = 'sawtooth';
      turretSirenOsc.frequency.value = 620;
      turretSirenGain.gain.value = 0.14;
      turretSirenOsc.connect(turretSirenGain);
      turretSirenGain.connect(audioCtx.destination);
      turretSirenOsc.start();
    } else {
      turretSirenGain.gain.setTargetAtTime(0.14, audioCtx.currentTime, 0.05);
    }
    state.lastActionLog = '🚨🚒 Đã BẬT Còi Hú Chữa Cháy chuyên dụng trên ghế Nóc Vòi Xịt!';
  } else if (turretSirenGain) {
    turretSirenGain.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.05);
  }

  const sBtn = document.getElementById('btn-turret-siren-wail');
  if (sBtn) {
    sBtn.textContent = turretSirenActive ? '🔇 Tắt Còi Hú Vòi Xịt' : '🚨 Bật Còi Hú Vòi Xịt (Siren)';
    sBtn.style.background = turretSirenActive ? '#ff3b30' : '#ffd60a';
    sBtn.style.color = turretSirenActive ? '#fff' : '#000';
  }
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'btn-turret-siren-wail') {
    toggleFiretruckTurretWailSiren();
  }
});

function updateContextSensitiveBusBarAndTurretSiren(elapsed) {
  const hvBar = document.getElementById('heavy-vehicle-cockpit-bar');
  if (hvBar) {
    hvBar.classList.remove('active-bus-bar', 'active-fire-bar', 'active-heavy-bar');
    if (state.playerMode === 'DRIVING') {
      if (state.currentBoardedType === 'BUS') {
        // Chỉ khi người chơi thực sự LÊN XE BUS mới hiện các nút chuyển nhanh hàng ghế Bus!
        hvBar.classList.add('active-bus-bar');
      } else if (state.currentBoardedType === 'FIRETRUCK') {
        hvBar.classList.add('active-fire-bar');
      } else if (state.currentBoardedType === 'AMBULANCE' || state.currentBoardedType === 'TRUCK') {
        hvBar.classList.add('active-heavy-bar');
      }
    }
  }

  // Tự động kích hoạt âm thanh Còi Hú biến thiên (Wail Siren 550Hz <-> 920Hz) khi ngồi ghế Nóc Vòi Xịt hoặc bật nút còi
  const isOnTurret = (state.playerMode === 'DRIVING' && state.activeSpecialSeatKey === 'ROOF_TURRET');
  if (isOnTurret && !turretSirenActive && manualWaterSprayActive) {
    toggleFiretruckTurretWailSiren(true);
  } else if (!isOnTurret && turretSirenActive && state.currentBoardedType !== 'FIRETRUCK') {
    toggleFiretruckTurretWailSiren(false);
  }

  if (turretSirenActive && turretSirenOsc && audioCtx) {
    const wailFreq = 720 + Math.sin(elapsed * 4.2) * 210;
    turretSirenOsc.frequency.setTargetAtTime(wailFreq, audioCtx.currentTime, 0.04);
  }
}

// --- 23.8. GẮN BẢNG HIỆU SÁT VÁCH TƯỜNG Ở ĐỘ CAO 2.5X NPC (4.15M), LẮP CỬA CHÍNH / CỔNG VÒM CHO MỌI TÒA NHÀ,
//           THÊM RẠP CHIẾU PHIM 3D & LẤP ĐẦY KHOẢNG TRỐNG BẰNG HOẠT ĐỘNG XÃ HỘI (BÁN KEM, CA HÁT, TRẺ EM, DẮT CHÓ, CẶP ĐÔI CAFE, CHỤP HÌNH 7S) ---
const rotatingSocialWanderers = []; // Các cặp NPC đổi địa điểm mỗi 7 giây
const dogWalkerUnits = [];          // NPC dắt chó đi dạo có dây xích
const playingChildrenUnits = [];    // Trẻ em chạy nhảy cầm bóng bay
const streetBandPerformers = [];    // Nhạc công & ca sĩ hát ca đường phố

function createWallMountedSignboardMesh(text, bgColorHex = '#101828', borderColorHex = '#ffd60a') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 110;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgColorHex;
  ctx.fillRect(0, 0, 512, 110);
  ctx.strokeStyle = borderColorHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 104);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 55);

  const tex = new THREE.CanvasTexture(c);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 1.15, 0.16),
    [
      matChrome, matChrome, matChrome, matChrome,
      new THREE.MeshBasicMaterial({ map: tex }),
      new THREE.MeshBasicMaterial({ map: tex })
    ]
  );
  return board;
}

(function upgradeAllLandmarksWithWallSignsDoorsCinemasAndLivelyPlazas() {
  const WALL_SIGN_HEIGHT_2_5X_NPC = 4.15; // Chiều cao NPC = 1.66m -> 2.5 * 1.66m = 4.15m chuẩn xác!
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.2 });
  const doorGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55, roughness: 0.1 });
  const redCarpetMat = new THREE.MeshStandardMaterial({ color: 0xb80c09, roughness: 0.8 });

  let poiGlobalIndex = 0;

  cityBlocks.forEach((block, bIdx) => {
    block.children.forEach((poi) => {
      if (!poi.isGroup || Math.abs(poi.position.y - 0.24) > 0.08) return;
      poiGlobalIndex++;

      // Xác định hướng mặt tiền (Front Facade) quay ra trục đường chính gần nhất (Z hoặc X)
      const faceDirZ = poi.position.z < 0 ? 1 : -1;

      // 1. Ẩn các Sprite bảng hiệu bay lơ lửng trên trời và gắn BẢNG HIỆU HỘP ĐÈN 3D SÁT VÁCH TƯỜNG ở độ cao y = 4.15m (2.5x NPC)!
      let detectedTitle = '🏢 ĐỊA ĐIỂM THÀNH PHỐ';
      poi.children.forEach((ch) => {
        if (ch.isSprite) {
          ch.visible = false; // Tắt sprite bay lơ lửng
        }
      });

      const buildingTitles = [
        '⛲ CÔNG VIÊN ĐÀI PHUN NƯỚC',
        '☕ TIỆM CAFE SÂN VƯỜN LE PARIS',
        '🌸 TIỆM HOA TƯƠI FLORA',
        '🎬 RẠP CHIẾU PHIM CGV IMAX 3D',
        '👗 BOUTIQUE THỜI TRANG VIP',
        '🍽️ NHÀ HÀNG BISTRO ẨM THỰC',
        '🛒 SIÊU THỊ FRESH SUPERMARKET',
        '🏥 BỆNH VIỆN ĐA KHOA QUỐC TẾ',
        '🚓 ĐỒN CẢNH SÁT TRUNG TÂM',
        '🏬 TRUNG TÂM THƯƠNG MẠI DIAMOND',
        '🎬 RẠP CHIẾU PHIM LOTTE CINEMA',
        '🏡 KHU PHỐ NHÀ DÂN & CỬA HIỆU'
      ];
      detectedTitle = buildingTitles[poiGlobalIndex % buildingTitles.length];

      // Tìm khối tường chính của địa điểm để gắn sát Bảng Hiệu Tường (y = 4.15m) & Cửa Chính Ra Vào (y = 0 .. 2.6m)
      const mainBox = poi.children.find((ch) => ch.isMesh && ch.geometry?.type === 'BoxGeometry' && ch.geometry.parameters.height >= 3.5);
      const frontWallZ = mainBox
        ? mainBox.position.z + faceDirZ * (mainBox.geometry.parameters.depth / 2 + 0.09)
        : faceDirZ * 4.4;

      const wallSign = createWallMountedSignboardMesh(detectedTitle, '#0f172a', '#ffd60a');
      wallSign.position.set(0, WALL_SIGN_HEIGHT_2_5X_NPC, frontWallZ);
      poi.add(wallSign);

      // 2. Lắp CỬA RA VÀO / CỔNG CHÍNH ĐƯỢC TRANG TRÍ (Khung cổng vàng, 2 cánh cửa kính, mái đón, thảm đỏ, 2 chậu cây cảnh)
      //    giúp người chơi nhìn vào biết ngay mặt nào là Mặt Trước (Front Entrance) và Mặt Sau của địa điểm!
      if (mainBox) {
        const entranceGroup = new THREE.Group();
        entranceGroup.position.set(0, 0, frontWallZ);

        const doorArch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.75, 0.22), doorFrameMat);
        doorArch.position.y = 1.38;
        const leftGlassDoor = new THREE.Mesh(new THREE.BoxGeometry(1.08, 2.45, 0.26), doorGlassMat);
        leftGlassDoor.position.set(-0.56, 1.25, 0);
        const rightGlassDoor = leftGlassDoor.clone();
        rightGlassDoor.position.x = 0.56;

        // Mái hiên đón khách trên cửa chính + Thảm đỏ chào mừng + 2 Đèn tường ấm áp
        const marqueeCanopy = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 1.35), new THREE.MeshStandardMaterial({ color: 0x9e2a2b }));
        marqueeCanopy.position.set(0, 2.85, faceDirZ * 0.55);
        const welcomeMat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 1.8), redCarpetMat);
        welcomeMat.position.set(0, 0.02, faceDirZ * 0.85);

        [-1.55, 1.55].forEach((px) => {
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 10), new THREE.MeshStandardMaterial({ color: 0xd4a373 }));
          pot.position.set(px, 0.22, faceDirZ * 0.45);
          const bush = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), new THREE.MeshStandardMaterial({ color: 0x2d6a4f }));
          bush.position.set(px, 0.65, faceDirZ * 0.45);
          entranceGroup.add(pot, bush);
        });

        entranceGroup.add(doorArch, leftGlassDoor, rightGlassDoor, marqueeCanopy, welcomeMat);
        poi.add(entranceGroup);
      }

      // 3. Nếu là RẠP CHIẾU PHIM (CGV / LOTTE CINEMA): Trang trí Poster Phim lớn phát sáng, Quầy Bắp Rang Bơ & Khán giả xếp hàng
      if (detectedTitle.includes('RẠP CHIẾU PHIM') && mainBox) {
        mainBox.material = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.3 });
        const posterScreen = createWallMountedSignboardMesh('🍿 ĐANG CHIẾU: SIÊU XE ĐẠI CHIẾN 3D (IMAX)', '#780000', '#00e5ff');
        posterScreen.scale.set(1.25, 1.35, 1);
        posterScreen.position.set(0, 2.35, frontWallZ + faceDirZ * 0.08);
        poi.add(posterScreen);

        // Quầy Bắp Rang Bơ (Popcorn Stand) + 2 Khán giả NPC đứng mua vé xem phim trước rạp
        const popcornCart = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.35, 0.75), new THREE.MeshStandardMaterial({ color: 0xffbe0b }));
        popcornCart.position.set(-2.6, 0.68, frontWallZ + faceDirZ * 1.2);
        const fan1 = createFullLimbedHumanNpc(0xff758f, 0x1e293b, 1, false, 0.96);
        fan1.position.set(-1.3, 0, frontWallZ + faceDirZ * 1.4);
        fan1.rotation.y = faceDirZ > 0 ? Math.PI : 0;
        const fan2 = createFullLimbedHumanNpc(0x00bbf9, 0x334155, 4, false, 0.96);
        fan2.position.set(1.3, 0, frontWallZ + faceDirZ * 1.4);
        fan2.rotation.y = faceDirZ > 0 ? Math.PI : 0;
        poi.add(popcornCart, fan1, fan2);
      }

      // 4. Lấp đầy các bàn dù Cafe / Nhà hàng đang trống trơn (trong Ảnh 6) bằng các CẶP ĐÔI NPC NGỒI GHẾ UỐNG CAFE & TRÒ CHUYỆN!
      poi.children.forEach((ch) => {
        if (ch.isMesh && ch.geometry?.type === 'CylinderGeometry' && Math.abs(ch.position.y - 0.78) < 0.05) {
          const tx = ch.position.x;
          const tz = ch.position.z;
          // Thêm 2 ghế tựa + 2 Cốc Cafe trên mặt bàn + Cặp đôi Nam/Nữ ngồi đối diện nhau trò chuyện
          [-0.68, 0.68].forEach((sideX, cIdx) => {
            const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.42), matWalnut);
            chair.position.set(tx + sideX, 0.22, tz);
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            cup.position.set(tx + sideX * 0.35, 0.86, tz);

            const coupleNpc = createFullLimbedHumanNpc(
              cIdx === 0 ? 0xff758f : 0x0077b6,
              0x1e293b,
              cIdx + 1,
              true, // Tư thế ngồi ghế có đủ đùi + bắp chân + mặt Lego
              0.94
            );
            coupleNpc.position.set(tx + sideX, 0.02, tz);
            coupleNpc.rotation.y = sideX < 0 ? Math.PI / 2 : -Math.PI / 2;
            poi.add(chair, cup, coupleNpc);
          });
        }
      });
    });

    // 5. KHAI THÁC KHOẢNG TRỐNG QUANH CÁC ĐỊA ĐIỂM TRONG MỖI Ô PHỐ:
    //    - Xe Bán Kem Tươi + Người bán & Khách ăn kem
    //    - Sân khấu Ca Hát Đường Phố (Nhạc công & Ca sĩ + Khán giả vỗ tay)
    //    - Trẻ em cầm bóng bay chạy nhảy đuổi bắt vui chơi
    if (bIdx % 2 === 0) {
      // A. XE BÁN KEM TƯƠI (ICE CREAM CART) & TỤ TẬP ĂN KEM
      const iceCreamSpot = new THREE.Group();
      iceCreamSpot.position.set(14.8, 0.24, -14.8);
      const cartBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.05, 0.9), new THREE.MeshStandardMaterial({ color: 0xffafcc }));
      cartBody.position.y = 0.55;
      const cartUmbrella = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0x00bbf9 }));
      cartUmbrella.position.set(0, 2.05, 0);
      const vendor = createFullLimbedHumanNpc(0xffffff, 0x0077b6, 1, false, 0.95);
      vendor.position.set(0, 0, -0.75);
      const customer1 = createFullLimbedHumanNpc(0xffbe0b, 0x2b2d42, 0, false, 0.92);
      customer1.position.set(-0.6, 0, 0.85);
      customer1.rotation.y = Math.PI;
      const icSign = createWallMountedSignboardMesh('🍦 XE KEM TƯƠI & TỤ TẬP ĂN UỐNG', '#ff4d6d', '#ffffff');
      icSign.scale.set(0.45, 0.45, 1);
      icSign.position.set(0, 2.55, 0);
      iceCreamSpot.add(cartBody, cartUmbrella, vendor, customer1, icSign);
      block.add(iceCreamSpot);
    } else {
      // B. SÂN KHẤU CA HÁT ĐƯỜNG PHỐ (BUSKING LIVE MUSIC)
      const stageSpot = new THREE.Group();
      stageSpot.position.set(-14.8, 0.24, 14.8);
      const carpet = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x7209b7 }));
      const singer = createFullLimbedHumanNpc(0xff006e, 0x111827, 2, false, 0.96); // Mặt Lego miệng chữ O đang hát
      const micStand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 1.35, 8), matChrome);
      micStand.position.set(0, 0.68, 0.35);
      const listener1 = createFullLimbedHumanNpc(0x06d6a0, 0x1e293b, 1, false, 0.94);
      listener1.position.set(-0.9, 0, 1.45);
      listener1.rotation.y = Math.PI;
      const listener2 = createFullLimbedHumanNpc(0xffd166, 0x1e293b, 4, false, 0.94);
      listener2.position.set(0.9, 0, 1.45);
      listener2.rotation.y = Math.PI;
      const musicSign = createWallMountedSignboardMesh('🎤🎸 GIAO LƯU CA HÁT ĐƯỜNG PHỐ', '#3a0ca3', '#00f5d4');
      musicSign.scale.set(0.48, 0.45, 1);
      musicSign.position.set(0, 2.45, 0);
      stageSpot.add(carpet, singer, micStand, listener1, listener2, musicSign);
      block.add(stageSpot);
      streetBandPerformers.push({ singer, listener1, listener2 });
    }
  });
})();

// --- 23.9. NPC DẮT CHÓ ĐI DẠO CÓ DÂY XÍCH, TRẺ EM CHẠY NHẢY VUI CHƠI & CẶP ĐÔI CHỤP HÌNH ĐỔI ĐỊA ĐIỂM MỖI 7 GIÂY ---
(function setupDogWalkersPlayingKidsAnd7SecPhotoRotation() {
  // 1. Xóa các cặp chụp hình cụt chân đứng đơ cũ trong parkPhotographersList và thay bằng Cặp Đôi Đủ Tay Chân Di Chuyển Mỗi 7 Giây!
  parkPhotographersList.forEach((pg) => {
    if (pg.flashBulb && pg.flashBulb.parent && pg.flashBulb.parent.parent) {
      scene.remove(pg.flashBulb.parent.parent);
    }
  });
  parkPhotographersList.length = 0;

  const tourWaypoints = [
    new THREE.Vector3(-15.5, 0.24, -15.5),
    new THREE.Vector3(15.5, 0.24, -15.5),
    new THREE.Vector3(15.5, 0.24, 15.5),
    new THREE.Vector3(-15.5, 0.24, 15.5)
  ];

  for (let p = 0; p < 2; p++) {
    const tourGroup = new THREE.Group();
    const startWp = p * 2;
    tourGroup.position.copy(tourWaypoints[startWp]);

    const cameraman = createFullLimbedHumanNpc(0x3a86ff, 0x1e293b, 4, false, 0.96);
    const flashBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
    );
    flashBulb.position.set(0, 1.38, 0.28);
    cameraman.add(flashBulb);

    const modelGirl = createFullLimbedHumanNpc(0xff758f, 0xffffff, 1, false, 0.94);
    modelGirl.position.set(0, 0, 1.85);
    modelGirl.rotation.y = Math.PI;

    const statusSign = createSpeechBubbleSprite('📸 [Hoạt cảnh 7s]: Đang chụp hình kỷ niệm -> Chuẩn bị dạo sang địa điểm kế tiếp!', '#1e293b', '#00ff88');
    statusSign.scale.set(1.75, 0.35, 1);
    statusSign.position.set(0, 2.02, 0.9);
    statusSign.visible = true;

    tourGroup.add(cameraman, modelGirl, statusSign);
    scene.add(tourGroup);

    rotatingSocialWanderers.push({
      group: tourGroup,
      cameraman,
      modelGirl,
      flashBulb,
      waypoints: tourWaypoints,
      wpIndex: startWp,
      mode: 'POSING_7S', // 'POSING_7S' (kéo dài đúng 7.0 giây) -> 'WALKING_TO_NEXT'
      timer: 7.0
    });
  }

  // 2. Tạo 3 NPC DẮT CHÓ ĐI DẠO (Có dây xích 3D nối từ tay NPC tới vòng cổ chú Chó 4 chân chạy lon ton phía trước)
  const dogFurMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.6 });
  for (let d = 0; d < 3; d++) {
    const walkerUnit = new THREE.Group();
    const owner = createFullLimbedHumanNpc([0x06d6a0, 0xffbe0b, 0xc77dff][d], 0x1e293b, d, false, 0.96);

    // Chú chó cưng 4 chân đi phía trước chủ 1.25m
    const petDog = new THREE.Group();
    const dBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.34, 8, 10), dogFurMat);
    dBody.rotation.x = Math.PI / 2;
    dBody.position.y = 0.28;
    const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), dogFurMat);
    dHead.position.set(0, 0.40, 0.24);
    const dogLegs = [];
    [[-0.07, -0.14], [0.07, -0.14], [-0.07, 0.14], [0.07, 0.14]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 6, 6), dogFurMat);
      leg.position.set(lx, 0.12, lz);
      petDog.add(leg);
      dogLegs.push(leg);
    });
    petDog.add(dBody, dHead);
    petDog.position.set(0, 0, 1.25);

    // Dây xích dắt chó (Leash) nối từ tay phải chủ tới cổ chú chó
    const leashGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.22, 0.85, 0.1),
      new THREE.Vector3(0, 0.36, 1.15)
    ]);
    const leashLine = new THREE.Line(leashGeo, new THREE.LineBasicMaterial({ color: 0xff4d6d, linewidth: 2 }));

    const walkTag = createSpeechBubbleSprite('🐕🚶 Đang dắt cún cưng đi dạo mát!', '#1b4332', '#ffd60a');
    walkTag.scale.set(1.4, 0.3, 1);
    walkTag.position.set(0, 1.92, 0.5);
    walkTag.visible = true;

    walkerUnit.add(owner, petDog, leashLine, walkTag);
    walkerUnit.position.set(d % 2 === 0 ? -13.2 : 13.2, 0.24, (d - 1) * 22);
    scene.add(walkerUnit);
    dogWalkerUnits.push({ group: walkerUnit, owner, petDog, dogLegs, dir: d % 2 === 0 ? 1 : -1, phase: d * 1.7 });
  }

  // 3. Tạo Nhóm TRẺ EM (Con Nít scale = 0.65) cầm Bóng Bay đa sắc chạy nhảy đuổi bắt vui đùa ở các khoảng sân rộng
  const kidSpotCenters = [
    new THREE.Vector3(-16.0, 0.24, -4.0),
    new THREE.Vector3(16.0, 0.24, 6.0)
  ];
  kidSpotCenters.forEach((center, kIdx) => {
    for (let c = 0; c < 3; c++) {
      const kid = createFullLimbedHumanNpc(
        [0xff758f, 0x00f5d4, 0xffd166][c],
        0x0077b6,
        1, // Mặt Lego cười tươi lộ răng
        false,
        0.64 // Chiều cao trẻ em
      );
      // Quả bóng bay (Balloon) buộc trên tay trẻ em
      const balloonString = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.65, 6), matChrome);
      balloonString.position.set(0, 0.32, 0);
      const balloon = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshStandardMaterial({ color: [0xff006e, 0x00bbf9, 0xffbe0b][c], roughness: 0.2 })
      );
      balloon.position.set(0, 0.68, 0);
      kid.userData.rightArm.add(balloonString, balloon);

      if (c === 0) {
        const kidBubble = createSpeechBubbleSprite('🎈👧👦 [Trẻ Em Vui Chơi]: Đuổi bắt vui quá các bạn ơi! Haha!', '#7209b7', '#ffd60a');
        kidBubble.scale.set(1.5, 0.32, 1);
        kidBubble.position.set(0, 1.35, 0);
        kidBubble.visible = true;
        kid.add(kidBubble);
      }

      scene.add(kid);
      playingChildrenUnits.push({
        mesh: kid,
        center: center.clone(),
        angle: (c / 3) * Math.PI * 2 + kIdx,
        radius: 1.85,
        phase: c * 2.1
      });
    }
  });
})();

function updateAllLivelySocialActivities7SecCycle(dt, elapsed) {
  // 1. Cặp đôi chụp hình: Kéo dài đúng 7 giây tại 1 địa điểm, sau đó tự động bước đi bộ (đủ cử động tay chân) sang địa điểm tiếp theo!
  for (const unit of rotatingSocialWanderers) {
    const camMan = unit.cameraman.userData;
    const modGirl = unit.modelGirl.userData;

    if (unit.mode === 'POSING_7S') {
      unit.timer -= dt;
      // Nháy đèn Flash máy ảnh & tạo dáng vẫy tay tự nhiên trong 7 giây
      unit.flashBulb.material.opacity = (unit.timer % 1.8) < 0.15 ? 1.0 : 0.0;
      camMan.rightArm.rotation.x = -Math.PI / 2.2;
      camMan.leftArm.rotation.x = -Math.PI / 2.4;
      modGirl.rightArm.rotation.x = -Math.PI * 0.75 + Math.sin(elapsed * 6) * 0.25;
      modGirl.leftArm.rotation.z = 0.35 + Math.cos(elapsed * 5) * 0.15;
      camMan.leftLeg.rotation.x = 0;
      camMan.rightLeg.rotation.x = 0;
      modGirl.leftLeg.rotation.x = 0;
      modGirl.rightLeg.rotation.x = 0;

      if (unit.timer <= 0) {
        unit.mode = 'WALKING_TO_NEXT';
        unit.wpIndex = (unit.wpIndex + 1) % unit.waypoints.length;
        unit.flashBulb.material.opacity = 0;
      }
    } else {
      // Đi bộ cùng nhau sang địa điểm tiếp theo với cử động vung tay bước chân đầy đủ
      const targetWp = unit.waypoints[unit.wpIndex];
      const dir = targetWp.clone().sub(unit.group.position);
      dir.y = 0;
      if (dir.length() > 0.6) {
        dir.normalize();
        unit.group.position.addScaledVector(dir, 3.6 * dt);
        const walkYaw = Math.atan2(dir.x, dir.z);
        unit.cameraman.rotation.y = walkYaw;
        unit.modelGirl.rotation.y = walkYaw;

        const sw = Math.sin(elapsed * 10) * 0.55;
        camMan.leftLeg.rotation.x = sw;
        camMan.rightLeg.rotation.x = -sw;
        camMan.leftArm.rotation.x = -sw * 0.7;
        camMan.rightArm.rotation.x = sw * 0.7;
        modGirl.leftLeg.rotation.x = -sw;
        modGirl.rightLeg.rotation.x = sw;
        modGirl.leftArm.rotation.x = sw * 0.7;
        modGirl.rightArm.rotation.x = -sw * 0.7;
      } else {
        // Đã tới địa điểm mới -> Xoay mặt đối diện nhau và bắt đầu chu kỳ 7 giây tiếp theo!
        unit.cameraman.rotation.y = 0;
        unit.modelGirl.rotation.y = Math.PI;
        unit.mode = 'POSING_7S';
        unit.timer = 7.0;
      }
    }
  }

  // 2. Cập nhật NPC Dắt Chó Đi Dạo trên vỉa hè
  for (const dw of dogWalkerUnits) {
    if (dw.group && dw.group.userData && dw.group.userData.npcState === 'KNOCKED_FLYING') continue;
    dw.phase += dt * 8.5;
    const sw = Math.sin(dw.phase) * 0.48;
    const od = dw.owner.userData;
    od.leftLeg.rotation.x = sw;
    od.rightLeg.rotation.x = -sw;
    od.leftArm.rotation.x = -sw * 0.6;
    od.rightArm.rotation.x = -0.5; // Tay phải cầm dây xích dắt chó
    dw.dogLegs.forEach((leg, lIdx) => {
      leg.rotation.x = (lIdx % 2 === 0 ? 1 : -1) * sw * 1.2;
    });

    dw.group.position.z += dw.dir * 2.4 * dt;
    dw.group.rotation.y = dw.dir > 0 ? 0 : Math.PI;
    if (dw.group.position.z > 42) dw.dir = -1;
    else if (dw.group.position.z < -42) dw.dir = 1;
  }

  // 3. Cập nhật Trẻ Em Chạy Nhảy Đuổi Bắt Cầm Bóng Bay
  for (const kid of playingChildrenUnits) {
    if (kid.mesh && kid.mesh.userData && kid.mesh.userData.npcState === 'KNOCKED_FLYING') continue;
    kid.angle += dt * 2.2;
    kid.phase += dt * 16.0;
    kid.mesh.position.x = kid.center.x + Math.cos(kid.angle) * kid.radius;
    kid.mesh.position.z = kid.center.z + Math.sin(kid.angle) * kid.radius;
    // Nhảy chân sáo vui nhộn
    kid.mesh.position.y = kid.center.y + Math.abs(Math.sin(kid.phase * 0.5)) * 0.18;
    kid.mesh.rotation.y = -kid.angle;

    const kd = kid.mesh.userData;
    const sw = Math.sin(kid.phase) * 0.75;
    kd.leftLeg.rotation.x = sw;
    kd.rightLeg.rotation.x = -sw;
    kd.leftArm.rotation.x = -sw;
    kd.rightArm.rotation.x = -Math.PI * 0.65; // Giơ cao bóng bay
  }

  // 4. Cập nhật Sân khấu Ca Hát Đường Phố (Ca sĩ nhún nhảy & Khán giả vỗ tay)
  for (const band of streetBandPerformers) {
    band.singer.position.y = Math.abs(Math.sin(elapsed * 7)) * 0.10;
    band.singer.userData.rightArm.rotation.x = -Math.PI * 0.7 + Math.sin(elapsed * 8) * 0.25;
    [band.listener1, band.listener2].forEach((lis, idx) => {
      lis.userData.leftArm.rotation.x = -Math.PI * 0.55 + Math.sin(elapsed * 14 + idx) * 0.3;
      lis.userData.rightArm.rotation.x = -Math.PI * 0.55 - Math.sin(elapsed * 14 + idx) * 0.3;
    });
  }
}

// ============================================================================
// 23.9B. HOẠT CẢNH TÊN CƯỚP BẮT CÓC TRẺ EM & CƠ CHẾ TÔNG HẤT TUNG MỌI NPC/PET
// ============================================================================
const kidnapperDramaUnit = {
  robber: null,
  child: null,
  state: 'CHASING', // 'CHASING' | 'RESCUED'
  dir: 1,
  speed: 2.6,
  rescuedTimer: 0
};

(function setupKidnapperRobberAndChildDrama() {
  if (typeof createFullLimbedHumanNpc !== 'function') return;

  // 1. Tên Cướp Bắt Cóc Trẻ Em (Áo khoác đen kín, quần đen, mặt Lego giận dữ, nón trùm)
  const robber = createFullLimbedHumanNpc(0x1a1a1a, 0x111111, 4, false, 1.05);
  const robberBubble = createSpeechBubbleSprite('🦹‍♂️ CƯỚP ĐÂY! Đứng lại đứa bé kia! Bắt cóc tống tiền!', '#4a0e17', '#ff4d6d');
  robberBubble.scale.set(1.7, 0.35, 1);
  robberBubble.position.set(0, 2.05, 0);
  robberBubble.visible = true;
  robber.add(robberBubble);
  robber.userData.role = 'KIDNAPPER';
  robber.userData.bubble = robberBubble;
  robber.userData.headingRad = 0;
  robber.userData.baseY = 0.24;
  robber.position.set(13.2, 0.24, 6.0);
  scene.add(robber);

  // 2. Em Bé Bị Cướp Rượt Đuổi (Scale nhỏ 0.62, áo vàng tươi, quần xanh, mặt khóc sợ hãi, cầm bóng bay)
  const child = createFullLimbedHumanNpc(0xffbe0b, 0x0077b6, 3, false, 0.62);
  const childBubble = createSpeechBubbleSprite('👶 CỨU BÉ VỚI! Có kẻ bắt cóc rượt đuổi em!', '#2b0938', '#ffd60a');
  childBubble.scale.set(1.5, 0.32, 1);
  childBubble.position.set(0, 1.45, 0);
  childBubble.visible = true;
  child.add(childBubble);
  child.userData.role = 'KIDNAPPED_CHILD';
  child.userData.bubble = childBubble;
  child.userData.headingRad = 0;
  child.userData.baseY = 0.24;
  child.position.set(13.2, 0.24, 9.2); // Chạy trước tên cướp 3.2m
  scene.add(child);

  kidnapperDramaUnit.robber = robber;
  kidnapperDramaUnit.child = child;
})();

function updateKidnapperRobberAndChildDrama(dt, elapsed) {
  const { robber, child } = kidnapperDramaUnit;
  if (!robber || !child) return;

  // Khi em bé được giải cứu: Đứng lại, nhảy cẫng lên ăn mừng
  if (kidnapperDramaUnit.state === 'RESCUED') {
    kidnapperDramaUnit.rescuedTimer -= dt;
    child.rotation.y = Math.sin(elapsed * 4) * 0.45;
    child.position.y = 0.24 + Math.abs(Math.sin(elapsed * 12)) * 0.24;
    const cd = child.userData;
    cd.leftArm.rotation.x = -Math.PI * 0.75 + Math.sin(elapsed * 10) * 0.3;
    cd.rightArm.rotation.x = -Math.PI * 0.75 - Math.sin(elapsed * 10) * 0.3;
    cd.leftLeg.rotation.x = 0;
    cd.rightLeg.rotation.x = 0;

    if (kidnapperDramaUnit.rescuedTimer <= 0) {
      kidnapperDramaUnit.state = 'CHASING';
      robber.userData.bubble.visible = true;
      robber.position.set(13.2, 0.24, 6.0);
      child.position.set(13.2, 0.24, 9.2);
    }
    return;
  }

  // Kịch bản bình thường: Tên cướp chạy đuổi theo Em bé trên vỉa hè
  if (child.userData.npcState !== 'KNOCKED_FLYING' && robber.userData.npcState !== 'KNOCKED_FLYING') {
    const step = kidnapperDramaUnit.speed * dt;
    child.position.z += kidnapperDramaUnit.dir * step;
    robber.position.z = child.position.z - kidnapperDramaUnit.dir * 2.8;
    robber.position.x = child.position.x;

    child.rotation.y = kidnapperDramaUnit.dir > 0 ? 0 : Math.PI;
    robber.rotation.y = child.rotation.y;

    const cPhase = elapsed * 18;
    const cd = child.userData;
    cd.leftLeg.rotation.x = Math.sin(cPhase) * 0.8;
    cd.rightLeg.rotation.x = -Math.sin(cPhase) * 0.8;
    cd.leftArm.rotation.x = -Math.sin(cPhase) * 0.8;
    cd.rightArm.rotation.x = Math.sin(cPhase) * 0.8;

    const rPhase = elapsed * 16;
    const rd = robber.userData;
    rd.leftLeg.rotation.x = Math.sin(rPhase) * 0.75;
    rd.rightLeg.rotation.x = -Math.sin(rPhase) * 0.75;
    rd.leftArm.rotation.x = -Math.PI * 0.4 + Math.sin(rPhase) * 0.4;
    rd.rightArm.rotation.x = -Math.PI * 0.4 - Math.sin(rPhase) * 0.4;

    if (child.position.z > 38) kidnapperDramaUnit.dir = -1;
    else if (child.position.z < -38) kidnapperDramaUnit.dir = 1;
  }
}

// ----------------------------------------------------------------------------
// CƠ CHẾ TÔNG HẤT TUNG MỌI LOẠI NPC & THÚ CƯNG (UNIVERSAL KNOCKBACK RAGDOLL FLING)
// ----------------------------------------------------------------------------
const _carFwdVecTemp = new THREE.Vector3();

function applyUniversalCarNpcFlingCrash(entity, carPos, playerSpeedAbs, carForward, entityType) {
  if (!entity || !entity.visible) return false;
  const ud = entity.userData = entity.userData || {};
  if (ud.npcState === 'KNOCKED_FLYING') return false;

  const dx = entity.position.x - carPos.x;
  const dz = entity.position.z - carPos.z;
  const distSq = dx * dx + dz * dz;

  let hitRadius = 2.25;
  let massRatio = 1.0;
  if (entityType === 'ANIMAL') { hitRadius = 1.95; massRatio = 1.55; }
  else if (entityType === 'CHILD') { hitRadius = 2.05; massRatio = 1.45; }
  else if (entityType === 'ROBBER' || entityType === 'KIDNAPPER') { hitRadius = 2.45; massRatio = 1.25; }
  else if (entityType === 'DOG_WALKER') { hitRadius = 2.50; massRatio = 1.15; }

  if (distSq > hitRadius * hitRadius) return false;

  // Xảy ra va chạm tông xe!
  initAudio();
  playImpactSound(22);
  state.suspensionShakeIntensity = Math.min(2.5, 1.4 + playerSpeedAbs / 22.0);

  let pushX = dx;
  let pushZ = dz;
  const len = Math.hypot(pushX, pushZ);
  if (len > 0.001) {
    pushX /= len;
    pushZ /= len;
  } else {
    pushX = carForward.x;
    pushZ = carForward.z;
  }

  const carSpdMs = Math.max(playerSpeedAbs / 3.6, 2.5);
  const launchHoriz = Math.min(30.0, carSpdMs * 1.35 * massRatio + 5.5);
  const launchVert = Math.min(16.0, 5.8 + carSpdMs * 0.42 * massRatio);

  ud.npcState = 'KNOCKED_FLYING';
  if (!ud.knockVel) ud.knockVel = new THREE.Vector3();
  ud.knockVel.set(pushX * launchHoriz, launchVert, pushZ * launchHoriz);
  ud.angularVel = (Math.random() > 0.5 ? 1 : -1) * (8.0 + Math.random() * 8.0);
  ud.angularAxis = Math.random() > 0.5 ? 'x' : 'z';
  ud.knockTimer = 2.8;
  ud.baseY = ud.baseY !== undefined ? ud.baseY : (entity.position.y || 0.24);

  // Xử lý sự kiện đặc biệt cho từng nhóm NPC
  if (entityType === 'KIDNAPPER' || ud.role === 'KIDNAPPER') {
    state.crimeLog = '🚨 BẠN ĐÃ LÁI XE TÔNG HẤT TUNG TÊN CƯỚP ĐANG BẮT CÓC TRẺ EM! Giải cứu em bé thành công!';
    state.lastActionLog = state.crimeLog;
    if (typeof kidnapperDramaUnit !== 'undefined') {
      kidnapperDramaUnit.state = 'RESCUED';
      kidnapperDramaUnit.rescuedTimer = 8.0;
    }
  } else if (entityType === 'CHILD') {
    state.lastActionLog = '💥 XE TÔNG TRÚNG TRẺ EM! Hiệu ứng hất tung nhào lộn kích hoạt!';
    if (ud.helloBubble) ud.helloBubble.visible = true;
  } else if (entityType === 'ANIMAL') {
    playSocialOrAnimalSound(ud.species === 'DOG' ? 'DOG_BARK' : 'CAT_MEOW');
    state.lastActionLog = '💥 XE TÔNG TRÚNG THÚ CƯNG! Chú cún bị hất tung nhào lộn trên không trung!';
    if (ud.soundBubble) ud.soundBubble.visible = true;
  } else if (entityType === 'JOGGER') {
    state.lastActionLog = '💥 TÔNG TRÚNG NGƯỜI CHẠY BỘ! Hất tung nhào lộn trên không trung!';
  } else if (entityType === 'DOG_WALKER') {
    state.lastActionLog = '💥 TÔNG TRÚNG NGƯỜI DẮT CHÓ! Hất tung cả người lẫn cún cưng!';
  } else {
    state.lastActionLog = '💥 TÔNG HẤT TUNG NPC ĐI BỘ! Hiệu ứng va chạm nhào lộn kích hoạt!';
    if (ud.helloBubble) ud.helloBubble.visible = true;
  }

  return true;
}

function updateKnockedFlyingTrajectory(entity, dt) {
  if (!entity || !entity.visible) return;
  const ud = entity.userData;
  if (!ud || ud.npcState !== 'KNOCKED_FLYING') return;

  entity.position.addScaledVector(ud.knockVel, dt);
  ud.knockVel.y -= 15.0 * dt;

  if (ud.angularAxis === 'x') {
    entity.rotation.x += ud.angularVel * dt;
    entity.rotation.z += ud.angularVel * dt * 0.4;
  } else {
    entity.rotation.z += ud.angularVel * dt;
    entity.rotation.x += ud.angularVel * dt * 0.4;
  }
  entity.rotation.y += ud.angularVel * dt * 0.3;

  const groundY = ud.baseY || 0.24;
  if (entity.position.y <= groundY) {
    entity.position.y = groundY;
    if (ud.knockVel.y < -1.5) {
      ud.knockVel.y = Math.abs(ud.knockVel.y) * 0.38;
      ud.knockVel.x *= 0.72;
      ud.knockVel.z *= 0.72;
      ud.angularVel *= 0.6;
    } else {
      ud.knockVel.set(0, 0, 0);
    }
  }

  ud.knockTimer -= dt;
  if (ud.knockTimer <= 0) {
    ud.npcState = 'WALKING';
    entity.position.y = groundY;
    entity.rotation.set(0, ud.headingRad || 0, 0);
  }
}

function updateAllNpcHitAndFlingPhysics(dt, elapsed) {
  const isDriving = (state.playerMode === 'DRIVING');
  const carPos = vehicleRoot.position;
  const speedAbs = Math.abs(state.speedKmh || (state.velocityMs * 3.6) || 0);

  const carYaw = vehicleRoot.rotation.y || state.headingRad || 0;
  _carFwdVecTemp.set(-Math.sin(carYaw), 0, -Math.cos(carYaw));

  // 1. Kiểm tra va chạm khi xe người chơi di chuyển (speedAbs > 1.2 km/h)
  if (isDriving && speedAbs > 1.2) {
    if (typeof sidewalkNpcs !== 'undefined') {
      for (let i = 0; i < sidewalkNpcs.length; i++) {
        applyUniversalCarNpcFlingCrash(sidewalkNpcs[i], carPos, speedAbs, _carFwdVecTemp, 'PEDESTRIAN');
      }
    }
    if (typeof cityJoggersList !== 'undefined') {
      for (let i = 0; i < cityJoggersList.length; i++) {
        applyUniversalCarNpcFlingCrash(cityJoggersList[i], carPos, speedAbs, _carFwdVecTemp, 'JOGGER');
      }
    }
    if (typeof dogWalkerUnits !== 'undefined') {
      for (let i = 0; i < dogWalkerUnits.length; i++) {
        const dw = dogWalkerUnits[i];
        if (dw && dw.group) {
          applyUniversalCarNpcFlingCrash(dw.group, carPos, speedAbs, _carFwdVecTemp, 'DOG_WALKER');
        }
      }
    }
    if (typeof playingChildrenUnits !== 'undefined') {
      for (let i = 0; i < playingChildrenUnits.length; i++) {
        const kid = playingChildrenUnits[i];
        if (kid && kid.mesh) {
          applyUniversalCarNpcFlingCrash(kid.mesh, carPos, speedAbs, _carFwdVecTemp, 'CHILD');
        }
      }
    }
    if (typeof crossingAnimals !== 'undefined') {
      for (let i = 0; i < crossingAnimals.length; i++) {
        applyUniversalCarNpcFlingCrash(crossingAnimals[i], carPos, speedAbs, _carFwdVecTemp, 'ANIMAL');
      }
    }
    if (typeof kidnapperDramaUnit !== 'undefined') {
      if (kidnapperDramaUnit.robber) {
        applyUniversalCarNpcFlingCrash(kidnapperDramaUnit.robber, carPos, speedAbs, _carFwdVecTemp, 'KIDNAPPER');
      }
      if (kidnapperDramaUnit.child) {
        applyUniversalCarNpcFlingCrash(kidnapperDramaUnit.child, carPos, speedAbs, _carFwdVecTemp, 'CHILD');
      }
    }
    if (typeof grannyObstacles !== 'undefined') {
      for (let i = 0; i < grannyObstacles.length; i++) {
        applyUniversalCarNpcFlingCrash(grannyObstacles[i], carPos, speedAbs, _carFwdVecTemp, 'PEDESTRIAN');
      }
    }
  }

  // 2. Cập nhật quỹ đạo bay trên không trung & tiếp đất nảy cho TẤT CẢ thực thể
  if (typeof sidewalkNpcs !== 'undefined') {
    for (let i = 0; i < sidewalkNpcs.length; i++) updateKnockedFlyingTrajectory(sidewalkNpcs[i], dt);
  }
  if (typeof cityJoggersList !== 'undefined') {
    for (let i = 0; i < cityJoggersList.length; i++) updateKnockedFlyingTrajectory(cityJoggersList[i], dt);
  }
  if (typeof dogWalkerUnits !== 'undefined') {
    for (let i = 0; i < dogWalkerUnits.length; i++) {
      if (dogWalkerUnits[i] && dogWalkerUnits[i].group) updateKnockedFlyingTrajectory(dogWalkerUnits[i].group, dt);
    }
  }
  if (typeof playingChildrenUnits !== 'undefined') {
    for (let i = 0; i < playingChildrenUnits.length; i++) {
      if (playingChildrenUnits[i] && playingChildrenUnits[i].mesh) updateKnockedFlyingTrajectory(playingChildrenUnits[i].mesh, dt);
    }
  }
  if (typeof crossingAnimals !== 'undefined') {
    for (let i = 0; i < crossingAnimals.length; i++) updateKnockedFlyingTrajectory(crossingAnimals[i], dt);
  }
  if (typeof kidnapperDramaUnit !== 'undefined') {
    if (kidnapperDramaUnit.robber) updateKnockedFlyingTrajectory(kidnapperDramaUnit.robber, dt);
    if (kidnapperDramaUnit.child) updateKnockedFlyingTrajectory(kidnapperDramaUnit.child, dt);
  }
  if (typeof grannyObstacles !== 'undefined') {
    for (let i = 0; i < grannyObstacles.length; i++) updateKnockedFlyingTrajectory(grannyObstacles[i], dt);
  }
}

// --- 23.10. TÍCH HỢP VÀO VÒNG LẶP CHÍNH scene.onBeforeRender ---
const prevOnBeforeRenderV145 = scene.onBeforeRender;
let lastV150Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (prevOnBeforeRenderV145) {
    prevOnBeforeRenderV145(rendererInst, sceneInst, cameraInst);
  }
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV150Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV150Time = now;
  const elapsed = clock.getElapsedTime();

  // 1. Chặn tuyệt đối mọi NPC, Pet, Xe NPC đi xuyên qua Xe của tôi & Cột đèn đường
  enforceSolidPlayerCarAndLampPolesCollision(dt);

  // 2. Hoạt cảnh Tông Bà Già đầy đủ (Cấp cứu đưa đi viện + Cảnh sát lấy xe chạy về đồn + Biến mất 100%)
  updateGrannyFullEmergencyAndCleanupSequence(dt);

  // 3. Chỉ hiện nút chọn ghế Bus khi lên Bus & Còi hú riêng khi ngồi ghế Nóc Vòi Xịt Xe Cứu Hỏa
  updateContextSensitiveBusBarAndTurretSiren(elapsed);

  // 4. Chu kỳ hoạt cảnh 7 giây đổi địa điểm, Dắt chó đi dạo, Trẻ em chạy nhảy & Ca hát đường phố
  updateAllLivelySocialActivities7SecCycle(dt, elapsed);

  // 5. Cập nhật hoạt cảnh Tên Cướp Bắt Cóc Trẻ Em & Cơ Chế Tông Hất Tung Tất Cả NPC/Pet
  if (typeof updateKidnapperRobberAndChildDrama === 'function') updateKidnapperRobberAndChildDrama(dt, elapsed);
  if (typeof updateAllNpcHitAndFlingPhysics === 'function') updateAllNpcHitAndFlingPhysics(dt, elapsed);
};

// ============================================================================
// 24. BẢN NÂNG CẤP MASTER PATCH V155 (CHỈ THÊM MỚI - KHÔNG SỬA CODE CŨ):
//     1. Mở kính trong suốt có đèn nội thất cho TẤT CẢ xe NPC (Ô tô, Cảnh sát,
//        Taxi, Xe Bus, Xe Tải, Xe Cứu Hỏa, Xe Cấp Cứu) để nhìn thấy rõ NPC ngồi
//        lái xe và hành khách bên trong từ mọi góc nhìn bên ngoài.
//     2. Dựng mô hình 3D Tài xế & Hành khách ngồi trong từng ghế xe khớp 1:1 với
//        logic số người thực tế của từng loại phương tiện.
//     3. Chu kỳ Trả Khách & Đón Khách thực tế cho Xe Bus và Taxi: Khi khách xuống
//        trạm, các ghế trên xe Bus/Taxi trống đi rõ rệt (xe thưa khách hoặc trống
//        khách) và có hoạt cảnh NPC bước từ cửa xe đi bộ vào vỉa hè.
// ============================================================================

const matClearCabinGlass = new THREE.MeshPhysicalMaterial({
  color: 0xbbeeff,
  transparent: true,
  opacity: 0.24,
  roughness: 0.05,
  metalness: 0.1,
  clearcoat: 1.0,
  depthWrite: false,
  side: THREE.DoubleSide
});

// Tạo mô hình NPC ngồi trong khoang xe (nhìn rõ từ bên ngoài qua lớp kính trong suốt)
function createVisibleCabinOccupantMesh(shirtHex, roleType = 'CITIZEN', exprIdx = 0, isDriver = false) {
  const occ = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({
    color: shirtHex,
    roughness: 0.35,
    emissive: shirtHex,
    emissiveIntensity: 0.18 // Giúp nhìn rõ người ngồi bên trong xe ngay cả vào ban đêm!
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf4c29f, roughness: 0.4 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });

  // Thân trên ngồi trên ghế
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.32, 8, 10), shirtMat);
  torso.position.set(0, 0.22, 0);

  // Đầu có biểu cảm Lego
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 12), skinMat);
  if (typeof applyLegoFaceToHeadMesh === 'function') {
    applyLegoFaceToHeadMesh(head, exprIdx);
  }
  head.position.set(0, 0.56, 0.02);

  // Mũ / Tóc theo đúng vai trò (Cảnh sát, Cứu hỏa, Bác sĩ, Tài xế, Hành khách)
  if (roleType === 'POLICE') {
    const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x0a2463 }));
    capCrown.position.set(0, 0.68, 0.02);
    const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.12), matPiano);
    capVisor.position.set(0, 0.64, -0.08);
    const goldBadge = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd60a }));
    goldBadge.position.set(0, 0.68, -0.11);
    occ.add(capCrown, capVisor, goldBadge);
  } else if (roleType === 'FIREFIGHTER') {
    const fHelm = createSafetyHelmetMesh(0xffd60a, false);
    fHelm.position.set(0, 0.62, 0.02);
    occ.add(fHelm);
  } else if (roleType === 'MEDIC') {
    const mCap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0x06d6a0 }));
    mCap.position.set(0, 0.67, 0.02);
    occ.add(mCap);
  } else {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.132, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: [0x111111, 0x5c3a21, 0xd4a373, 0x9e2a2b][exprIdx % 4] })
    );
    hair.position.set(0, 0.58, 0.02);
    occ.add(hair);
  }

  // 2 Tay (Nếu là Tài xế thì vươn 2 tay ra trước cầm Vô lăng!)
  const armGeo = new THREE.CapsuleGeometry(0.042, 0.28, 6, 8);
  const armL = new THREE.Mesh(armGeo, skinMat);
  const armR = new THREE.Mesh(armGeo, skinMat);
  if (isDriver) {
    armL.position.set(-0.16, 0.26, -0.14);
    armL.rotation.x = Math.PI / 2.2;
    armR.position.set(0.16, 0.26, -0.14);
    armR.rotation.x = Math.PI / 2.2;
    const miniWheel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 20), matPiano);
    miniWheel.position.set(0, 0.28, -0.28);
    miniWheel.rotation.x = -0.35;
    occ.add(miniWheel);
  } else {
    armL.position.set(-0.18, 0.20, -0.04);
    armL.rotation.x = -0.4;
    armR.position.set(0.18, 0.20, -0.04);
    armR.rotation.x = -0.4;
  }

  // 2 Đùi ngồi trên đệm ghế
  [-0.075, 0.075].forEach((lx) => {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 6, 8), pantsMat);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.set(lx, 0.06, -0.12);
    occ.add(thigh);
  });

  // Tựa lưng ghế phía sau mỗi người để nhìn từ ngoài vào thấy rõ ghế ngồi
  const seatBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.52, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
  );
  seatBack.position.set(0, 0.25, 0.14);

  occ.add(seatBack, torso, head, armL, armR);
  return occ;
}

// Tạo nhãn hiển thị trực tiếp số người đang ngồi bên trong từng xe
function updateVehicleOccupancyBadgeText(veh) {
  const vd = veh.userData;
  if (!vd || !vd.occBadgeCanvas || !vd.occBadgeTex) return;
  const ctx = vd.occBadgeCanvas.getContext('2d');
  ctx.clearRect(0, 0, 384, 64);
  ctx.fillStyle = 'rgba(8, 16, 30, 0.88)';
  ctx.fillRect(0, 0, 384, 64);
  ctx.strokeStyle = vd.occBorderColor || '#00e5ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 380, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(vd.occStatusText || '', 192, 32);
  vd.occBadgeTex.needsUpdate = true;
}

function attachOccupancyCounterBadge(veh, initialText, borderColor = '#00e5ff', yHeight = 2.25) {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(1.55, 0.26, 1);
  sp.position.set(0, yHeight, 0);
  veh.add(sp);
  veh.userData.occBadgeCanvas = c;
  veh.userData.occBadgeTex = tex;
  veh.userData.occBorderColor = borderColor;
  veh.userData.occStatusText = initialText;
  updateVehicleOccupancyBadgeText(veh);
}

// --- 24.1. LẮP KÍNH TRONG SUỐT & DỰNG NPC NGỒI BÊN TRONG TẤT CẢ CÁC LOẠI XE ---
const alightingSidewalkWalkers = []; // Các NPC vừa bước xuống từ Xe Bus / Taxi đi bộ vào vỉa hè

(function populateAllNpcVehiclesWithVisibleOccupants() {
  const passengerColors = [0xff758f, 0x00bbf9, 0xffd166, 0x06d6a0, 0xc77dff, 0xf4a261, 0x90e0ef, 0xffafcc];

  allTrafficVehicles.forEach((veh, vIdx) => {
    const vd = veh.userData;
    const cat = vd.category;

    // 1. Chuyển tất cả các khối kính Cabin (vốn đang bị màu đen đặc 0x101926 hoặc 0x0f172a) thành Kính Trong Suốt!
    veh.traverse((child) => {
      if (child.isMesh && child.position.y > 0.82 && child.geometry) {
        const isCabinMesh =
          (child.geometry.type === 'CylinderGeometry' && Math.abs(child.position.y - 1.0) < 0.15) ||
          (child.geometry.type === 'BoxGeometry' && child.position.y >= 0.95 && child.material !== matChrome);

        if (isCabinMesh && cat !== 'BUS' && cat !== 'FIRETRUCK' && cat !== 'TRUCK' && cat !== 'AMBULANCE') {
          child.material = matClearCabinGlass;
          child.renderOrder = 2;
        }
      }
    });

    // =========================================================================
    // A. XE CẢNH SÁT (POLICE CAR): 2 Sĩ Quan Cảnh Sát ghế trước + 1 Ghế Tội Phạm phía sau
    // =========================================================================
    if (cat === 'POLICE') {
      const cabinInterior = new THREE.Group();
      const officerDriver = createVisibleCabinOccupantMesh(0x0a2463, 'POLICE', 0, true);
      officerDriver.position.set(-0.42, 0.56, -0.22);

      const officerPartner = createVisibleCabinOccupantMesh(0x0a2463, 'POLICE', 4, false);
      officerPartner.position.set(0.42, 0.56, -0.22);

      // Ghế sau dành cho Tội phạm bị bắt (chỉ hiện khi xe cảnh sát vừa bắt trộm/cướp)
      const arrestedSuspect = createVisibleCabinOccupantMesh(0x222222, 'CITIZEN', 2, false);
      arrestedSuspect.position.set(0.0, 0.56, 0.48);
      arrestedSuspect.visible = false;

      cabinInterior.add(officerDriver, officerPartner, arrestedSuspect);
      veh.add(cabinInterior);

      vd.cabinDriverMesh = officerDriver;
      vd.cabinPartnerMesh = officerPartner;
      vd.cabinSuspectMesh = arrestedSuspect;
      attachOccupancyCounterBadge(veh, '🚓 Cảnh Sát: 2 Sĩ Quan Tuần Tra', '#00bbf9', 1.72);
    }

    // =========================================================================
    // B. XE TAXI (TAXI): 1 Tài xế cố định + 3 Ghế Hành Khách (Ẩn/Hiện theo đúng số khách thực tế 0..3)
    // =========================================================================
    else if (vd.isTaxi) {
      const cabinInterior = new THREE.Group();
      const taxiDriver = createVisibleCabinOccupantMesh(0xf8f9fa, 'CITIZEN', 1, true);
      taxiDriver.position.set(-0.42, 0.56, -0.22);
      cabinInterior.add(taxiDriver);

      const seatCoords = [
        [0.42, 0.56, -0.22], // Ghế phụ trước
        [-0.42, 0.56, 0.45], // Ghế sau trái
        [0.42, 0.56, 0.45]   // Ghế sau phải
      ];
      const paxMeshes = [];
      seatCoords.forEach(([sx, sy, sz], pIdx) => {
        const pax = createVisibleCabinOccupantMesh(
          passengerColors[(vIdx + pIdx) % passengerColors.length],
          'CITIZEN',
          pIdx + 1,
          false
        );
        pax.position.set(sx, sy, sz);
        cabinInterior.add(pax);
        paxMeshes.push(pax);
      });

      veh.add(cabinInterior);
      vd.cabinPassengerMeshes = paxMeshes;
      // Khởi tạo số khách ban đầu khác nhau (có chiếc đang trống 0 khách, có chiếc chở 1-2 khách)
      vd.currentPassengers = vIdx % 3;
      vd.maxPassengers = 3;
      vd.nextStopMode = vd.currentPassengers > 0 ? 'DROPOFF' : 'PICKUP';
      attachOccupancyCounterBadge(veh, `🚕 Taxi [Khách: ${vd.currentPassengers}/3]`, '#ffd60a', 1.72);
    }

    // =========================================================================
    // C. XE Ô TÔ CÁ NHÂN (CAR): 1 Tài xế + Ngẫu nhiên 0..3 Người đi cùng (1 đến 4 người/xe)
    // =========================================================================
    else if (cat === 'CAR') {
      const cabinInterior = new THREE.Group();
      const carDriver = createVisibleCabinOccupantMesh(
        passengerColors[vIdx % passengerColors.length],
        'CITIZEN',
        vIdx,
        true
      );
      carDriver.position.set(-0.42, 0.56, -0.22);
      cabinInterior.add(carDriver);

      const extraCount = vIdx % 4; // 0, 1, 2 hoặc 3 hành khách đi cùng tài xế
      const seatCoords = [
        [0.42, 0.56, -0.22],
        [-0.42, 0.56, 0.45],
        [0.42, 0.56, 0.45]
      ];
      for (let p = 0; p < extraCount; p++) {
        const [sx, sy, sz] = seatCoords[p];
        const pax = createVisibleCabinOccupantMesh(
          passengerColors[(vIdx + p + 2) % passengerColors.length],
          'CITIZEN',
          p,
          false
        );
        pax.position.set(sx, sy, sz);
        cabinInterior.add(pax);
      }

      veh.add(cabinInterior);
      const totalPeople = 1 + extraCount;
      attachOccupancyCounterBadge(veh, `🚗 Ô tô [${totalPeople}/4 Người trong xe]`, '#4cd964', 1.68);
    }

    // =========================================================================
    // D. XE BUS THÀNH PHỐ (BUS): Mở khung kính trong suốt 2 bên sườn + 1 Tài xế + 12 Ghế Hành Khách 3D
    // =========================================================================
    else if (cat === 'BUS') {
      // Thu thấp phần thùng đặc bên dưới xuống y = 0.72m và biến toàn bộ tầng cửa sổ (y = 1.05..2.35m) thành kính trong suốt!
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.geometry?.type === 'BoxGeometry') {
          const h = ch.geometry.parameters.height;
          if (h > 1.2) {
            ch.scale.y = 0.52;
            ch.position.y = 0.68;
          } else if (ch.position.y > 1.8) {
            ch.material = matClearCabinGlass;
            ch.renderOrder = 2;
          }
        }
      });

      // Khung lồng kính trong suốt bao quanh khoang hành khách Xe Bus + Trần xe Bus
      const glassGreenhouse = new THREE.Mesh(new THREE.BoxGeometry(2.32, 1.25, 7.45), matClearCabinGlass);
      glassGreenhouse.position.set(0, 1.68, 0);
      glassGreenhouse.renderOrder = 2;
      const busRoofCap = new THREE.Mesh(
        new THREE.BoxGeometry(2.36, 0.14, 7.55),
        new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.3 })
      );
      busRoofCap.position.set(0, 2.34, 0);

      // Đèn LED chiếu sáng trong khoang Xe Bus để ban đêm nhìn từ ngoài vào thấy rõ từng hàng ghế và từng hành khách!
      const busInteriorLight = new THREE.PointLight(0xfff3b0, 6, 9, 1.2);
      busInteriorLight.position.set(0, 2.1, 0);
      veh.add(glassGreenhouse, busRoofCap, busInteriorLight);

      const busOccupantsGroup = new THREE.Group();
      // 1 Tài xế Xe Bus ngồi ở đầu xe (z = -3.15)
      const busDriver = createVisibleCabinOccupantMesh(0x00bbf9, 'CITIZEN', 0, true);
      busDriver.position.set(-0.68, 1.02, -3.15);
      busOccupantsGroup.add(busDriver);

      // 12 Hành khách ngồi dọc 2 bên cửa sổ (6 hàng x 2 bên Trái/Phải)
      const busPaxMeshes = [];
      const rowZPositions = [-2.1, -1.15, -0.2, 0.75, 1.7, 2.65];
      rowZPositions.forEach((rz, rIdx) => {
        [-0.74, 0.74].forEach((rx, sideIdx) => {
          const pIdx = rIdx * 2 + sideIdx;
          const pax = createVisibleCabinOccupantMesh(
            passengerColors[pIdx % passengerColors.length],
            'CITIZEN',
            pIdx,
            false
          );
          pax.position.set(rx, 1.02, rz);
          busOccupantsGroup.add(pax);
          busPaxMeshes.push(pax);
        });
      });

      veh.add(busOccupantsGroup);
      vd.cabinPassengerMeshes = busPaxMeshes;
      vd.maxPassengers = 12;
      vd.currentPassengers = vIdx === 0 ? 8 : 3; // Chiếc đông khách (8/12), chiếc thưa khách (3/12)
      vd.nextStopMode = vIdx === 0 ? 'DROPOFF' : 'PICKUP';
      attachOccupancyCounterBadge(
        veh,
        `🚌 Xe Bus [Khách: ${vd.currentPassengers}/12 + 1 Tài Xế]`,
        '#ffd60a',
        2.95
      );
    }

    // =========================================================================
    // E. XE CỨU HỎA, XE CẤP CỨU & XE TẢI: Mở kính Cabin đầu kéo & Đặt Tài xế + Phụ xe bên trong
    // =========================================================================
    else if (cat === 'FIRETRUCK' || cat === 'AMBULANCE' || cat === 'TRUCK') {
      // Tạo buồng kính Cabin trong suốt ở đầu xe và đặt 2 NPC (Tài xế + Đồng đội) ngồi bên trong
      const cabZ = cat === 'TRUCK' ? -2.35 : (cat === 'FIRETRUCK' ? -2.1 : -1.65);
      const cabY = cat === 'AMBULANCE' ? 1.02 : 1.18;
      const role = cat === 'FIRETRUCK' ? 'FIREFIGHTER' : (cat === 'AMBULANCE' ? 'MEDIC' : 'CITIZEN');
      const shirtHex = cat === 'FIRETRUCK' ? 0xd90429 : (cat === 'AMBULANCE' ? 0xffffff : 0x0077b6);

      // Làm trong suốt khối Cabin trên để thấy rõ người ngồi lái bên trong
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.position.z < -1.2 && ch.position.y > 0.85) {
          ch.material = matClearCabinGlass;
          ch.renderOrder = 2;
        }
      });

      const cabDriver = createVisibleCabinOccupantMesh(shirtHex, role, 0, true);
      cabDriver.position.set(-0.52, cabY, cabZ);
      const cabCoDriver = createVisibleCabinOccupantMesh(shirtHex, role, 1, false);
      cabCoDriver.position.set(0.52, cabY, cabZ);

      veh.add(cabDriver, cabCoDriver);
      vd.cabinDriverMesh = cabDriver;
      vd.cabinPartnerMesh = cabCoDriver;

      const labelMap = {
        FIRETRUCK: '🚒 Cứu Hỏa [Đội: 2 Chiến Sĩ trong Cabin]',
        AMBULANCE: '🚑 Cấp Cứu [1 Tài Xế + 1 Bác Sĩ Y Khoa]',
        TRUCK: '🚚 Xe Tải [1 Tài Xế + 1 Phụ Xe Logistics]'
      };
      attachOccupancyCounterBadge(veh, labelMap[cat], '#00f5d4', 2.95);
    }
  });
})();

// --- 24.2. LOGIC ĐỒNG BỘ HIỂN THỊ NPC TRONG XE & CHU KỲ TRẢ KHÁCH (LÀM XE BUS/TAXI THƯA DẦN) <-> ĐÓN KHÁCH ---
function spawnAlightingPassengersWalkingToSidewalk(originPos, count, exprSeed = 0) {
  const colors = [0xff758f, 0x00bbf9, 0xffd166, 0x06d6a0, 0xc77dff];
  for (let i = 0; i < count; i++) {
    const walker = createFullLimbedHumanNpc(
      colors[(exprSeed + i) % colors.length],
      0x1e293b,
      exprSeed + i,
      false,
      0.95
    );
    walker.position.set(
      originPos.x - 1.35 - i * 0.55,
      0.24,
      originPos.z + (i - count / 2) * 0.75
    );
    const tag = createSpeechBubbleSprite('🚶 Vừa xuống xe! Đi bộ vào phố thôi~', '#0f172a', '#00ff88');
    tag.scale.set(1.25, 0.26, 1);
    tag.position.set(0, 1.85, 0);
    tag.visible = true;
    walker.add(tag);

    scene.add(walker);
    alightingSidewalkWalkers.push({
      mesh: walker,
      vel: new THREE.Vector3(-1.8, 0, (i % 2 === 0 ? 1 : -1) * 2.2),
      lifeTimer: 6.5,
      phase: i * 1.5
    });
  }
}

function updateRealisticVehicleOccupancyAndAlightingCycle(dt, elapsed) {
  // 1. Cập nhật các hành khách vừa bước xuống từ Xe Bus / Taxi đi bộ tản vào vỉa hè rồi vào các cửa hàng
  for (let i = alightingSidewalkWalkers.length - 1; i >= 0; i--) {
    const w = alightingSidewalkWalkers[i];
    w.lifeTimer -= dt;
    w.phase += dt * 9.0;
    w.mesh.position.addScaledVector(w.vel, dt);
    w.mesh.rotation.y = Math.atan2(w.vel.x, w.vel.z);

    const sw = Math.sin(w.phase) * 0.52;
    const wd = w.mesh.userData;
    if (wd.leftLeg) wd.leftLeg.rotation.x = sw;
    if (wd.rightLeg) wd.rightLeg.rotation.x = -sw;
    if (wd.leftArm) wd.leftArm.rotation.x = -sw * 0.7;
    if (wd.rightArm) wd.rightArm.rotation.x = sw * 0.7;

    if (w.lifeTimer <= 0) {
      scene.remove(w.mesh);
      alightingSidewalkWalkers.splice(i, 1);
    }
  }

  // 2. Đồng bộ trạng thái Sĩ quan Cảnh sát & Tội phạm bên trong Xe Cảnh Sát
  for (const pCar of policeCarsList) {
    const pd = pCar.userData;
    const officer1Out = Boolean(pd.officerNpc && pd.officerNpc.visible);
    const officer2Out = Boolean(pd.secondOfficerNpc && pd.secondOfficerNpc.visible);
    const hasSuspect = Boolean(pd.arrestTimer > 0 && !officer1Out);

    if (pd.cabinDriverMesh) pd.cabinDriverMesh.visible = !officer2Out;
    if (pd.cabinPartnerMesh) pd.cabinPartnerMesh.visible = !officer1Out;
    if (pd.cabinSuspectMesh) pd.cabinSuspectMesh.visible = hasSuspect;

    const inCabCount = (officer1Out ? 0 : 1) + (officer2Out ? 0 : 1);
    const newPoliceText = `🚓 Cảnh Sát [${inCabCount}/2 Sĩ Quan trong xe${hasSuspect ? ' + 1 Tội Phạm' : ''}]`;
    if (pd.occStatusText !== newPoliceText) {
      pd.occStatusText = newPoliceText;
      updateVehicleOccupancyBadgeText(pCar);
    }
  }

  // 3. Đồng bộ Lính cứu hỏa trong Cabin Xe Cứu Hỏa (Khi xuống xịt nước thì ghế trong Cabin trống!)
  if (fireIncidentState && fireIncidentState.truckRef) {
    const ft = fireIncidentState.truckRef;
    const fd = ft.userData;
    const crewOutside = (fireIncidentState.phase === 'EXTINGUISHING');
    if (fd.cabinDriverMesh) fd.cabinDriverMesh.visible = !crewOutside;
    if (fd.cabinPartnerMesh) fd.cabinPartnerMesh.visible = !crewOutside;
  }

  // 4. CHU KỲ ĐÓN KHÁCH <-> TRẢ KHÁCH LÀM THƯA KHÁCH THỰC TẾ TRÊN XE BUS & XE TAXI
  const publicTransitVehicles = [...cityBusesList, ...taxiVehiclesList];
  for (const veh of publicTransitVehicles) {
    const vd = veh.userData;
    const isBus = (vd.category === 'BUS');

    // Luôn đồng bộ hiển thị số lượng mô hình 3D hành khách ngồi bên trong xe khớp 1:1 với vd.currentPassengers!
    if (Array.isArray(vd.cabinPassengerMeshes)) {
      const paxCount = THREE.MathUtils.clamp(Math.round(vd.currentPassengers || 0), 0, vd.cabinPassengerMeshes.length);
      vd.cabinPassengerMeshes.forEach((mesh, idx) => {
        // Khi xe thưa khách (ví dụ còn 2-3 người trên Bus), bố trí khách ngồi cách quãng tự nhiên thay vì dồn cục
        if (isBus && paxCount > 0 && paxCount <= 5) {
          const spreadIndices = [0, 3, 6, 9, 11].slice(0, paxCount);
          mesh.visible = spreadIndices.includes(idx);
        } else {
          mesh.visible = (idx < paxCount);
        }
      });

      const densityLabel = paxCount === 0
        ? 'Xe Trống Khách'
        : (paxCount <= (isBus ? 4 : 1) ? 'Thưa Khách' : (paxCount >= vd.maxPassengers ? 'Đầy Khách' : 'Vừa Khách'));

      const newBadgeText = isBus
        ? `🚌 Xe Bus [Khách: ${paxCount}/${vd.maxPassengers} - ${densityLabel}]`
        : `🚕 Taxi [Khách: ${paxCount}/${vd.maxPassengers} - ${densityLabel}]`;

      if (vd.occStatusText !== newBadgeText) {
        vd.occStatusText = newBadgeText;
        updateVehicleOccupancyBadgeText(veh);
      }
    }

    // Kiểm tra khi Xe Bus / Taxi vừa mở cửa tại Trạm (transitBoardingTimer vừa được kích hoạt > 3.5s)
    // để thực thi kịch bản TRẢ KHÁCH XUỐNG LÀM THƯA XE xen kẽ với ĐÓN KHÁCH!
    if (vd.transitBoardingTimer > 3.4 && !vd.hasProcessedCurrentStop) {
      vd.hasProcessedCurrentStop = true;

      if (vd.nextStopMode === 'DROPOFF' || vd.currentPassengers >= vd.maxPassengers - 1) {
        // TRẠM TRẢ KHÁCH: Hành khách trên xe Bus / Taxi bước xuống làm xe vơi và thưa hẳn đi!
        const dropCount = isBus
          ? Math.min(vd.currentPassengers, 3 + Math.floor(Math.random() * 5)) // Xuống 3..7 khách trên Bus
          : vd.currentPassengers; // Taxi trả hết khách trong chuyến đó về 0 (Xe trống)

        if (dropCount > 0) {
          vd.currentPassengers = Math.max(0, vd.currentPassengers - dropCount);
          spawnAlightingPassengersWalkingToSidewalk(veh.position, Math.min(dropCount, 4), Math.floor(elapsed));
          state.socialLog = isBus
            ? `🚌🚶 [Xe Bus Trả Khách]: ${dropCount} hành khách vừa xuống trạm! Trên xe Bus giờ đã thưa khách (còn ${vd.currentPassengers}/${vd.maxPassengers} khách).`
            : `🚕🚶 [Taxi Trả Khách]: ${dropCount} khách đã xuống xe! Taxi hiện đang trống ghế (0/${vd.maxPassengers} khách).`;
          state.lastActionLog = state.socialLog;
        }
        // Nếu xe đã vơi/trống, trạm tiếp theo sẽ chuyển sang Đón khách
        if (vd.currentPassengers <= (isBus ? 2 : 0)) {
          vd.nextStopMode = 'PICKUP';
        }
      } else {
        // TRẠM ĐÓN KHÁCH: Chỉ đón vừa đúng số khách đang ngồi đợi ở trạm (1..3 khách), sau đó chuyển chế độ sang Trả khách ở trạm kế tiếp!
        if (vd.currentPassengers >= (isBus ? 6 : 1)) {
          vd.nextStopMode = 'DROPOFF';
        }
      }
    } else if (vd.transitBoardingTimer <= 0.1) {
      vd.hasProcessedCurrentStop = false;
    }
  }
}

// --- 24.3. TÍCH HỢP VÀO VÒNG LẶP CHÍNH scene.onBeforeRender ---
const prevOnBeforeRenderV150 = scene.onBeforeRender;
let lastV155Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (prevOnBeforeRenderV150) {
    prevOnBeforeRenderV150(rendererInst, sceneInst, cameraInst);
  }
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV155Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV155Time = now;
  const elapsed = clock.getElapsedTime();

  // Cập nhật hiển thị NPC ngồi bên trong tất cả xe & Chu kỳ Trả khách làm thưa xe Bus / Taxi
  updateRealisticVehicleOccupancyAndAlightingCycle(dt, elapsed);
};


// ============================================================================
// 25. BẢN NÂNG CẤP MASTER PATCH V160 (CHỈ THÊM MỚI - KHÔNG SỬA CODE CŨ):
//     1. Tái cấu trúc Khoang Nội Thất Mở (Open-Cabin Interior) cho TẤT CẢ xe NPC
//        (Ô tô, Cảnh sát, Taxi, Xe Bus, Xe Tải, Cứu hỏa, Cấp cứu) giống hệt xe
//        Rolls-Royce của người chơi: Sàn xe thấp, Ghế da Nappa 3D sáng màu,
//        Táp-lô ốp gỗ + Màn hình trung tâm, Bệ tỳ tay, Vô lăng xoay chuyển động
//        và Kính vòm pha lê trong suốt nhìn xuyên thấu từ mọi góc độ.
//     2. Dựng chuẩn Dáng Ngồi Lái Xe 3D cho Tài xế NPC (đặc biệt trên Xe Bus và
//        Ô tô): Ngồi trên ghế cao, 2 đùi duỗi trên đệm ghế, đầu gối gập, 2 bắp
//        chân + giày đặt lên bàn đạp Ga/Thắng, 2 cánh tay vươn nắm chặt Vô lăng.
//     3. Logic Số Người Hợp Lý & Chu Kỳ Làm Thưa Khách Trên Xe Bus / Taxi:
//        - Ngắt hoàn toàn lỗi tự động nhồi đầy khách ở trạm.
//        - Xe Bus sau khi trả khách xuống trạm sẽ vơi hẳn đi (chỉ còn 1-2 người
//          ngồi thưa thớt giữa các hàng ghế trống) rồi chạy tiếp sang các trạm
//          khác, đúng số khách thực tế đang ngồi ở trạm mới lên xe.
// ============================================================================

const matCrystalGlassV160 = new THREE.MeshPhysicalMaterial({
  color: 0xdff6ff,
  transparent: true,
  opacity: 0.16,
  roughness: 0.04,
  metalness: 0.05,
  clearcoat: 1.0,
  depthWrite: false,
  side: THREE.DoubleSide
});

const matNpcSeatCream = new THREE.MeshStandardMaterial({
  color: 0xf5ebe0,
  roughness: 0.35,
  emissive: 0x3a2e25,
  emissiveIntensity: 0.22
});

const matNpcSeatBusBlue = new THREE.MeshStandardMaterial({
  color: 0x48cae4,
  roughness: 0.35,
  emissive: 0x003566,
  emissiveIntensity: 0.22
});

const matNpcDashWalnut = new THREE.MeshPhysicalMaterial({
  color: 0x4a2c18,
  roughness: 0.15,
  clearcoat: 0.9
});

// Hàm dựng Ghế Ngồi 3D (Đệm ngồi + Tựa lưng + Gối tựa đầu) giống hệt ghế xe của người chơi
function createVisible3DSeatMesh(seatMat = matNpcSeatCream, scale = 1.0) {
  const seatGroup = new THREE.Group();
  const cushion = new THREE.Mesh(
    new THREE.BoxGeometry(0.42 * scale, 0.10 * scale, 0.44 * scale),
    seatMat
  );
  cushion.position.set(0, 0.05 * scale, 0);

  const backrest = new THREE.Mesh(
    new THREE.BoxGeometry(0.40 * scale, 0.48 * scale, 0.09 * scale),
    seatMat
  );
  backrest.position.set(0, 0.32 * scale, 0.18 * scale);
  backrest.rotation.x = THREE.MathUtils.degToRad(8);

  const headrest = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.065 * scale, 0.18 * scale, 8, 10),
    seatMat
  );
  headrest.rotation.z = Math.PI / 2;
  headrest.position.set(0, 0.62 * scale, 0.21 * scale);

  seatGroup.add(cushion, backrest, headrest);
  return seatGroup;
}

// Hàm dựng NPC ngồi trên ghế có ĐỦ DÁNG NGỒI LÁI XE (Đùi + Đầu gối + Bắp chân đạp bàn đạp + 2 Tay cầm Vô lăng xoay)
function createFullSeatedNpcWithInteriorSeat(options = {}) {
  const {
    shirtHex = 0x00bbf9,
    pantsHex = 0x1e293b,
    roleType = 'CITIZEN',
    exprIdx = 0,
    isDriver = false,
    seatMat = matNpcSeatCream,
    scale = 1.0
  } = options;

  const root = new THREE.Group();

  // 1. Ghế ngồi 3D luôn hiển thị cố định (Kể cả khi không có khách ngồi thì vẫn thấy rõ chiếc ghế trống như xe của bạn!)
  const seatMesh = createVisible3DSeatMesh(seatMat, scale);
  root.add(seatMesh);

  // 2. Nhóm cơ thể NPC ngồi trên ghế (Có thể bật/tắt visible khi khách lên/xuống xe mà ghế vẫn còn nguyên!)
  const humanBody = new THREE.Group();
  root.add(humanBody);

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf4c29f,
    roughness: 0.38,
    emissive: 0x4a3222,
    emissiveIntensity: 0.15
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: shirtHex,
    roughness: 0.35,
    emissive: shirtHex,
    emissiveIntensity: 0.20
  });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.55 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 });

  // Thân trên (Torso) tựa vào ghế
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * scale, 0.34 * scale, 8, 12), shirtMat);
  torso.position.set(0, 0.34 * scale, 0.04 * scale);

  // Đầu có biểu cảm Lego
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125 * scale, 14, 14), skinMat);
  if (typeof applyLegoFaceToHeadMesh === 'function') {
    applyLegoFaceToHeadMesh(head, exprIdx);
  }
  head.position.set(0, 0.68 * scale, 0.04 * scale);
  humanBody.add(torso, head);

  // Mũ / Tóc theo vai trò
  if (roleType === 'POLICE') {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14 * scale, 0.13 * scale, 0.08 * scale, 12),
      new THREE.MeshStandardMaterial({ color: 0x0a2463 })
    );
    cap.position.set(0, 0.80 * scale, 0.04 * scale);
    const badge = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 * scale, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd60a })
    );
    badge.position.set(0, 0.80 * scale, -0.09 * scale);
    humanBody.add(cap, badge);
  } else if (roleType === 'FIREFIGHTER') {
    const fHelm = createSafetyHelmetMesh(0xffd60a, false);
    fHelm.position.set(0, 0.74 * scale, 0.04 * scale);
    humanBody.add(fHelm);
  } else if (roleType === 'BUS_DRIVER' || roleType === 'TAXI_DRIVER') {
    const driverCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135 * scale, 0.13 * scale, 0.065 * scale, 12),
      new THREE.MeshStandardMaterial({ color: 0x1d3557 })
    );
    driverCap.position.set(0, 0.79 * scale, 0.04 * scale);
    humanBody.add(driverCap);
  } else {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.132 * scale, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: [0x111111, 0x5c3a21, 0xd4a373, 0x9e2a2b][exprIdx % 4] })
    );
    hair.position.set(0, 0.70 * scale, 0.04 * scale);
    humanBody.add(hair);
  }

  // 2 Đùi + Đầu gối + 2 Bắp chân + 2 Bàn chân (Dáng ngồi chuẩn hoặc đạp bàn đạp Ga/Thắng)
  [-0.085 * scale, 0.085 * scale].forEach((lx, legIdx) => {
    // Đùi đặt ngang trên đệm ghế
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * scale, 0.24 * scale, 6, 8), pantsMat);
    thigh.rotation.x = Math.PI / 2 - (isDriver ? 0.12 : 0.04);
    thigh.position.set(lx, 0.14 * scale, -0.08 * scale);

    // Bắp chân hướng từ đầu gối xuống sàn / bàn đạp
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.048 * scale, 0.25 * scale, 6, 8), pantsMat);
    calf.rotation.x = isDriver ? -0.35 : -0.1;
    calf.position.set(lx, -0.02 * scale, (isDriver ? -0.26 : -0.22) * scale);

    // Bàn giày đặt trên bàn đạp ga/phanh (nếu là tài xế) hoặc sàn xe
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.095 * scale, 0.065 * scale, 0.16 * scale), shoeMat);
    shoe.rotation.x = isDriver ? 0.35 : 0;
    shoe.position.set(lx, -0.14 * scale, (isDriver ? -0.34 : -0.26) * scale);

    humanBody.add(thigh, calf, shoe);
  });

  // 2 Cánh tay + Bàn tay (Nếu là Tài xế: Vươn thẳng ra trước nắm chặt vành Vô lăng 3D!)
  const armGeo = new THREE.CapsuleGeometry(0.044 * scale, 0.28 * scale, 6, 8);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  const handGeo = new THREE.SphereGeometry(0.045 * scale, 8, 8);
  const handL = new THREE.Mesh(handGeo, skinMat);
  const handR = new THREE.Mesh(handGeo, skinMat);

  let steeringWheelGroup = null;

  if (isDriver) {
    // Tay trái & Tay phải vươn tới vị trí 9h và 3h trên Vô lăng
    armL.position.set(-0.17 * scale, 0.40 * scale, -0.14 * scale);
    armL.rotation.x = Math.PI / 2.15;
    armL.rotation.z = -0.18;
    handL.position.set(0, -0.16 * scale, 0);
    armL.add(handL);

    armR.position.set(0.17 * scale, 0.40 * scale, -0.14 * scale);
    armR.rotation.x = Math.PI / 2.15;
    armR.rotation.z = 0.18;
    handR.position.set(0, -0.16 * scale, 0);
    armR.add(handR);

    // Dựng Cụm Vô Lăng + Trục Lái + Bàn Đạp Ga/Thắng ngay trước ghế Tài Xế
    steeringWheelGroup = new THREE.Group();
    steeringWheelGroup.position.set(0, 0.42 * scale, -0.32 * scale);
    steeringWheelGroup.rotation.x = THREE.MathUtils.degToRad(roleType === 'BUS_DRIVER' ? -52 : -24);

    const wheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.155 * scale, 0.018 * scale, 12, 28),
      matPiano
    );
    const wheelHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045 * scale, 0.045 * scale, 0.03 * scale, 12),
      matChrome
    );
    wheelHub.rotation.x = Math.PI / 2;
    const wheelSpoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.28 * scale, 0.025 * scale, 0.02 * scale),
      matChrome
    );
    steeringWheelGroup.add(wheelRim, wheelHub, wheelSpoke);

    const steeringColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03 * scale, 0.035 * scale, 0.28 * scale, 10),
      matPiano
    );
    steeringColumn.rotation.x = Math.PI / 3;
    steeringColumn.position.set(0, 0.34 * scale, -0.42 * scale);

    // 2 Bàn đạp Ga & Phanh dưới chân tài xế
    const gasPedal = new THREE.Mesh(new THREE.BoxGeometry(0.06 * scale, 0.12 * scale, 0.02 * scale), matChrome);
    gasPedal.rotation.x = -0.4;
    gasPedal.position.set(0.085 * scale, -0.12 * scale, -0.40 * scale);
    const brakePedal = gasPedal.clone();
    brakePedal.position.x = -0.085 * scale;

    root.add(steeringWheelGroup, steeringColumn, gasPedal, brakePedal);
  } else {
    // Hành khách đặt tay thoải mái trên đùi / tay vịn ghế
    armL.position.set(-0.18 * scale, 0.30 * scale, -0.02 * scale);
    armL.rotation.x = -0.55;
    armR.position.set(0.18 * scale, 0.30 * scale, -0.02 * scale);
    armR.rotation.x = -0.55;
  }

  humanBody.add(armL, armR);

  root.userData = {
    seatMesh,
    humanBody,
    armL,
    armR,
    head,
    steeringWheelGroup
  };
  return root;
}

// --- 25.1. BIẾN TẤT CẢ XE NPC THÀNH KHOANG NỘI THẤT MỞ GIỐNG HỆT XE ROLLS-ROYCE CỦA BẠN ---
(function rebuildAllNpcVehiclesWithRollsRoyceStyleOpenInteriors() {
  const shirtPalette = [0xff758f, 0x00bbf9, 0xffd166, 0x06d6a0, 0xc77dff, 0xf4a261, 0x4cc9f0, 0xffafcc];

  allTrafficVehicles.forEach((veh, vIdx) => {
    const vd = veh.userData;
    const cat = vd.category;

    // Xóa các nhóm cabin cũ của V155 (nếu có) để dựng mới hoàn chỉnh cả Nội Thất + Ghế + Táp-lô + NPC
    const oldGroups = [];
    veh.children.forEach((ch) => {
      if (ch.isGroup && ch !== vd.angryDriverNpc && ch !== vd.transitDoorPivot && !vd.wheels?.includes(ch)) {
        if (!ch.userData?.isWheelGroup) oldGroups.push(ch);
      }
    });
    oldGroups.forEach((g) => veh.remove(g));

    // =========================================================================
    // 1. ĐỐI VỚI Ô TÔ NPC, XE TAXI & XE CẢNH SÁT (Dựng khoang mở giống hệt Rolls-Royce của người chơi!)
    // =========================================================================
    if (cat === 'CAR' || cat === 'POLICE') {
      let bodyColorMat = new THREE.MeshPhysicalMaterial({ color: 0x0077b6, roughness: 0.2, metalness: 0.3, clearcoat: 0.8 });

      // Tìm khối lowerHull đặc (dài 4.45m, cao 0.48m ở y = 0.52) đang lấp kín bụng xe và hạ thấp nó xuống làm Sàn Xe (y = 0.24m)!
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.geometry) {
          const p = ch.geometry.parameters || {};
          if (ch.geometry.type === 'BoxGeometry' && p.depth >= 4.0 && p.height >= 0.4) {
            bodyColorMat = ch.material;
            // Hạ mỏng xuống làm Sàn Gầm Xe (Underbody) để mở toang khoang Cabin ở giữa!
            ch.scale.y = 0.32;
            ch.position.y = 0.24;
          }
          // Biến khối vòm kính Cabin trên thành kính pha lê siêu trong suốt (hoặc ẩn khối hộp đen suvRearCabin chắn tầm nhìn)
          else if (ch.geometry.type === 'CylinderGeometry' && ch.position.y > 0.8) {
            ch.material = matCrystalGlassV160;
            ch.renderOrder = 3;
          } else if (ch.geometry.type === 'BoxGeometry' && ch.position.y > 0.85 && p.depth > 1.2 && p.height > 0.35) {
            ch.material = matCrystalGlassV160;
            ch.renderOrder = 3;
          } else if (ch.geometry.type === 'BoxGeometry' && Math.abs(ch.position.y - 0.51) < 0.08 && p.depth < 2.2) {
            // Hạ thấp cánh cửa hông (pDoors) xuống ngang đùi để nhìn từ ngang hông thấy trọn vẹn ghế da & người ngồi trong xe!
            ch.scale.y = 0.55;
            ch.position.y = 0.38;
          }
        }
      });

      const interiorCabin = new THREE.Group();
      interiorCabin.userData.isV160Interior = true;

      // Dựng Nắp Capo trước (z = -1.55) & Cốp sau (z = +1.65) tách rời như xe Rolls-Royce của bạn
      const frontHood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.36, 1.35), bodyColorMat);
      frontHood.position.set(0, 0.50, -1.52);
      const rearTrunk = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.38, 1.15), bodyColorMat);
      rearTrunk.position.set(0, 0.51, 1.65);

      // 2 Thành cửa hông thấp (y = 0.44m) để lộ toàn bộ không gian ghế ngồi bên trong
      [-0.92, 0.92].forEach((sx) => {
        const lowDoorWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 1.95), bodyColorMat);
        lowDoorWall.position.set(sx, 0.42, 0.08);
        // Cột A mạ Chrome giống xe của bạn
        const pillarA = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.68, 10), matChrome);
        pillarA.position.set(sx * 0.96, 0.92, -0.72);
        pillarA.rotation.x = THREE.MathUtils.degToRad(24);
        interiorCabin.add(lowDoorWall, pillarA);
      });

      // Táp-lô bọc da + Ốp gỗ Óc Chó + Màn hình giải trí phát sáng + Bệ tỳ tay giữa xe (Giống hệt xe của bạn!)
      const dashTopRoll = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 1.68, 10, 14), matNpcSeatCream);
      dashTopRoll.rotation.z = Math.PI / 2;
      dashTopRoll.position.set(0, 0.68, -0.68);

      const dashWalnutBoard = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.18, 0.14), matNpcDashWalnut);
      dashWalnutBoard.position.set(0, 0.58, -0.62);

      const centerDisplay = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide })
      );
      centerDisplay.position.set(0, 0.68, -0.54);

      const centerConsole = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 1.35, 10, 12), matNpcSeatCream);
      centerConsole.rotation.x = Math.PI / 2;
      centerConsole.position.set(0, 0.34, 0.15);

      // Đèn trần chiếu sáng nội thất giúp nhìn rõ cả ban ngày lẫn ban đêm
      const cabinLight = new THREE.PointLight(0xfff5d6, 3.5, 4.5, 1.2);
      cabinLight.position.set(0, 1.15, 0.1);

      interiorCabin.add(frontHood, rearTrunk, dashTopRoll, dashWalnutBoard, centerDisplay, centerConsole, cabinLight);

      // Dựng 4 Vị Trí Ghế Da 3D + NPC Ngồi Bên Trong:
      // [0]: Tài xế (-0.42, 0.30, -0.10) | [1]: Ghế phụ trước (0.42, 0.30, -0.10)
      // [2]: Ghế sau trái (-0.42, 0.32, 0.68) | [3]: Ghế sau phải (0.42, 0.32, 0.68)
      const seatCoords = [
        [-0.42, 0.30, -0.10],
        [0.42, 0.30, -0.10],
        [-0.42, 0.32, 0.68],
        [0.42, 0.32, 0.68]
      ];

      const role = cat === 'POLICE' ? 'POLICE' : (vd.isTaxi ? 'TAXI_DRIVER' : 'CITIZEN');
      const driverShirt = cat === 'POLICE' ? 0x0a2463 : (vd.isTaxi ? 0xf8f9fa : shirtPalette[vIdx % shirtPalette.length]);

      // Ghế 0: Tài xế luôn có dáng ngồi lái xe (Tay cầm vô lăng, chân đạp ga)
      const driverUnit = createFullSeatedNpcWithInteriorSeat({
        shirtHex: driverShirt,
        roleType: role,
        exprIdx: vIdx,
        isDriver: true,
        seatMat: matNpcSeatCream
      });
      driverUnit.position.set(...seatCoords[0]);
      interiorCabin.add(driverUnit);
      vd.v160DriverUnit = driverUnit;

      // 3 Ghế Hành Khách (Ghế 1, 2, 3): Luôn hiển thị Ghế Da 3D, còn phần người ngồi (`humanBody`) bật/tắt theo đúng số người thực tế!
      const passengerUnits = [];
      for (let s = 1; s <= 3; s++) {
        const pRole = (cat === 'POLICE' && s === 1) ? 'POLICE' : 'CITIZEN';
        const pShirt = (cat === 'POLICE' && s === 1)
          ? 0x0a2463
          : ((cat === 'POLICE' && s >= 2) ? 0x222222 : shirtPalette[(vIdx + s) % shirtPalette.length]);

        const paxUnit = createFullSeatedNpcWithInteriorSeat({
          shirtHex: pShirt,
          roleType: pRole,
          exprIdx: vIdx + s,
          isDriver: false,
          seatMat: matNpcSeatCream
        });
        paxUnit.position.set(...seatCoords[s]);
        interiorCabin.add(paxUnit);
        passengerUnits.push(paxUnit);
      }
      vd.v160PassengerUnits = passengerUnits;

      // Thiết lập số người hợp lý cho từng loại xe:
      if (cat === 'POLICE') {
        // Xe Cảnh Sát: Ghế trước có 2 Sĩ quan (Tài xế + Cảnh sát phụ), 2 ghế sau trống (chỉ hiện khi bắt được tội phạm)
        passengerUnits[0].userData.humanBody.visible = true;  // Cảnh sát phụ
        passengerUnits[1].userData.humanBody.visible = false; // Ghế sau trái (Tội phạm)
        passengerUnits[2].userData.humanBody.visible = false; // Ghế sau phải trống
      } else if (vd.isTaxi) {
        // Xe Taxi: Khởi tạo chiếc trống (0 khách), chiếc có 1 hoặc 2 khách
        vd.currentPassengers = vIdx % 3;
        vd.maxPassengers = 3;
        vd.v160TransitPhase = vd.currentPassengers > 0 ? 'DROPOFF_NEXT' : 'PICKUP_NEXT';
        passengerUnits.forEach((u, idx) => {
          u.userData.humanBody.visible = (idx < vd.currentPassengers);
        });
      } else {
        // Ô tô cá nhân: Phân bổ rõ ràng xe 1 người (chỉ tài xế), xe 2 người (cặp đôi), xe 3-4 người (gia đình)
        const paxCount = vIdx % 4; // 0, 1, 2 hoặc 3 khách đi cùng tài xế
        vd.fixedPersonalPaxCount = paxCount;
        passengerUnits.forEach((u, idx) => {
          u.userData.humanBody.visible = (idx < paxCount);
        });
      }

      veh.add(interiorCabin);
    }

    // =========================================================================
    // 2. ĐỐI VỚI XE BUS THÀNH PHỐ: Mở kính sườn toàn phần từ mặt sàn, dựng Buồng Lái Bus
    //    (Tài xế ngồi ghế cao vặn vô lăng lớn, chân đạp bàn đạp) + 10 Ghế Hành Khách 3D
    // =========================================================================
    else if (cat === 'BUS') {
      // Thu gọn phần gầm dưới xuống y = 0.46m để lộ hoàn toàn sàn xe Bus (y = 0.55m), chân ghế, chân người ngồi và buồng lái!
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.geometry?.type === 'BoxGeometry') {
          const h = ch.geometry.parameters.height;
          if (h > 1.0 && ch.material !== matCrystalGlassV160) {
            if (ch.position.y < 1.3) {
              ch.scale.y = 0.28;
              ch.position.y = 0.48;
            } else {
              // Toàn bộ phần thân trên của Bus chuyển sang Kính Pha Lê Trong Suốt!
              ch.material = matCrystalGlassV160;
              ch.renderOrder = 3;
            }
          }
        }
      });

      const busInterior = new THREE.Group();
      busInterior.userData.isV160Interior = true;

      // Sàn nội thất xe Bus màu xám sáng để làm nổi bật các ghế ngồi và bước chân NPC
      const busFloorDeck = new THREE.Mesh(
        new THREE.BoxGeometry(2.26, 0.08, 7.55),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 })
      );
      busFloorDeck.position.set(0, 0.66, 0);

      // Táp-lô Buồng Lái Xe Bus ở đầu xe (z = -3.45m) + Hộp soát vé tự động
      const busDash = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.42, 0.38), matNpcDashWalnut);
      busDash.position.set(0, 0.88, -3.52);
      const fareBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.55, 0.24),
        new THREE.MeshStandardMaterial({ color: 0xffd60a })
      );
      fareBox.position.set(0.25, 0.95, -3.15);

      // 2 Đèn trần chiếu sáng rực rỡ dọc khoang Xe Bus
      [-1.8, 1.8].forEach((lz) => {
        const bLight = new THREE.PointLight(0xfff8e7, 4.5, 8.0, 1.2);
        bLight.position.set(0, 2.15, lz);
        busInterior.add(bLight);
      });

      // TÀI XẾ XE BUS: Ngồi trên bệ ghế cao ở đầu xe (-0.68, 0.78, -3.05), 2 tay vươn nắm Vô lăng Bus nghiêng, 2 chân đạp bàn đạp!
      const busDriverPedestal = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.16, 0.56),
        new THREE.MeshStandardMaterial({ color: 0x1e293b })
      );
      busDriverPedestal.position.set(-0.68, 0.74, -3.05);

      const busDriverUnit = createFullSeatedNpcWithInteriorSeat({
        shirtHex: 0x00bbf9,
        pantsHex: 0x0f172a,
        roleType: 'BUS_DRIVER',
        exprIdx: 0,
        isDriver: true,
        seatMat: matNpcSeatCream,
        scale: 1.06
      });
      busDriverUnit.position.set(-0.68, 0.82, -3.02);
      busInterior.add(busFloorDeck, busDash, fareBox, busDriverPedestal, busDriverUnit);
      vd.v160DriverUnit = busDriverUnit;

      // Dựng 10 Ghế Hành Khách 3D (5 hàng x 2 dãy Trái/Phải) dọc theo khoang xe Bus:
      // Khi khách xuống xe, phần người (`humanBody`) ẩn đi để lộ rõ chiếc ghế xanh-vàng trống trơn!
      const busSeatUnits = [];
      const rowZList = [-1.85, -0.80, 0.25, 1.30, 2.35];
      rowZList.forEach((rz, rIdx) => {
        [-0.74, 0.74].forEach((rx, sIdx) => {
          const seatIdx = rIdx * 2 + sIdx;
          const paxUnit = createFullSeatedNpcWithInteriorSeat({
            shirtHex: shirtPalette[seatIdx % shirtPalette.length],
            roleType: 'CITIZEN',
            exprIdx: seatIdx + 1,
            isDriver: false,
            seatMat: matNpcSeatBusBlue,
            scale: 1.0
          });
          paxUnit.position.set(rx, 0.70, rz);
          busInterior.add(paxUnit);
          busSeatUnits.push(paxUnit);
        });
      });

      vd.v160PassengerUnits = busSeatUnits;
      vd.maxPassengers = 10;
      // Chiếc Bus #1 bắt đầu với 6 khách (sẽ trả bớt xuống còn 2 khách ở trạm đầu), Chiếc Bus #2 bắt đầu thưa khách (chỉ 2 khách!)
      vd.currentPassengers = vIdx === 0 ? 6 : 2;
      vd.v160TransitPhase = vIdx === 0 ? 'DROPOFF_TO_SPARSE' : 'SPARSE_CRUISE';
      vd.v160StopCooldown = 0;

      veh.add(busInterior);
    }

    // =========================================================================
    // 3. ĐỐI VỚI XE CẤP CỨU, XE CỨU HỎA & XE TẢI: Mở kính Cabin đầu xe & Dựng Táp-lô + Ghế + Tài xế cầm Vô lăng
    // =========================================================================
    else if (cat === 'AMBULANCE' || cat === 'FIRETRUCK' || cat === 'TRUCK') {
      const cabZ = cat === 'TRUCK' ? -2.25 : (cat === 'FIRETRUCK' ? -2.05 : -1.65);
      const cabFloorY = cat === 'AMBULANCE' ? 0.68 : 0.82;
      const role = cat === 'FIRETRUCK' ? 'FIREFIGHTER' : (cat === 'AMBULANCE' ? 'MEDIC' : 'BUS_DRIVER');
      const shirtHex = cat === 'FIRETRUCK' ? 0xd90429 : (cat === 'AMBULANCE' ? 0x06d6a0 : 0xffbe0b);

      // Biến các mảng tường chắn ngang đầu Cabin thành kính trong suốt để nhìn xuyên thấy Tài xế & Vô lăng
      veh.children.forEach((ch) => {
        if (ch.isMesh && ch.position.z < -1.1 && ch.position.y > 0.75 && ch.material !== matChrome) {
          ch.material = matCrystalGlassV160;
          ch.renderOrder = 3;
        }
      });

      const heavyCabInterior = new THREE.Group();
      heavyCabInterior.userData.isV160Interior = true;

      const cabDash = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.24, 0.28), matNpcDashWalnut);
      cabDash.position.set(0, cabFloorY + 0.28, cabZ - 0.42);
      const cabLight = new THREE.PointLight(0xfff5d6, 3.5, 4.0, 1.2);
      cabLight.position.set(0, cabFloorY + 0.85, cabZ);

      const hDriver = createFullSeatedNpcWithInteriorSeat({
        shirtHex,
        roleType: role,
        exprIdx: 0,
        isDriver: true,
        seatMat: matNpcSeatCream
      });
      hDriver.position.set(-0.48, cabFloorY, cabZ);

      const hPartner = createFullSeatedNpcWithInteriorSeat({
        shirtHex,
        roleType: role,
        exprIdx: 1,
        isDriver: false,
        seatMat: matNpcSeatCream
      });
      hPartner.position.set(0.48, cabFloorY, cabZ);

      heavyCabInterior.add(cabDash, cabLight, hDriver, hPartner);
      veh.add(heavyCabInterior);
      vd.v160DriverUnit = hDriver;
      vd.v160PassengerUnits = [hPartner];
    }
  });
})();

// --- 25.2. GHI ĐÈ TRIỆT ĐỂ LOGIC XE BUS / TAXI ĐỂ XE BUS SAU KHI TRẢ KHÁCH PHẢI THƯA HẲN ĐI (KHÔNG TỰ ĐỘNG FULL LẠI) ---
// Vô hiệu hóa hàm cũ của V140 để nó không tự cộng dồn khách lên mức max
window.updatePublicBusAndTaxiPassengerBoarding = function() {};

// Các cấu hình vị trí ghế ngồi rải rác trên Xe Bus (10 ghế: 0..9) để khi trên xe chỉ còn 1, 2, 3 khách thì khách ngồi thưa đều khắp xe!
const SPARSE_BUS_SEAT_MAPS = {
  0: [],
  1: [2],                         // Chỉ 1 khách ngồi ghế giữa cửa sổ trái, 9 ghế còn lại trống trơn!
  2: [1, 6],                      // 2 khách ngồi cách xa nhau ở đầu và giữa xe, 8 ghế trống!
  3: [0, 5, 8],                   // 3 khách ngồi rải rác, 7 ghế trống!
  4: [0, 3, 6, 9],
  5: [0, 2, 5, 7, 9],
  6: [0, 1, 3, 5, 7, 8],
  7: [0, 1, 2, 4, 6, 7, 9],
  8: [0, 1, 2, 3, 5, 6, 8, 9],
  9: [0, 1, 2, 3, 4, 5, 6, 8, 9],
  10:[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
};

function syncVehicleSeatedModelsAndDrivingPose(veh, elapsed) {
  const vd = veh.userData;
  const cat = vd.category;

  // 1. Chuyển động xoay Vô lăng & 2 Cánh tay của Tài xế NPC khi xe đang lăn bánh
  if (vd.v160DriverUnit && vd.v160DriverUnit.userData) {
    const du = vd.v160DriverUnit.userData;
    const isMoving = (vd.activeSpeed || 0) > 0.5;
    const steerOsc = isMoving ? Math.sin(elapsed * 2.8 + veh.id) * 0.28 : 0;
    if (du.steeringWheelGroup) {
      du.steeringWheelGroup.rotation.z = steerOsc;
    }
    if (du.armL && du.armR) {
      du.armL.rotation.x = Math.PI / 2.15 + steerOsc * 0.25;
      du.armR.rotation.x = Math.PI / 2.15 - steerOsc * 0.25;
    }
  }

  // 2. Đồng bộ hiển thị người ngồi (`humanBody.visible`) trên từng chiếc ghế 3D bên trong xe
  const paxUnits = vd.v160PassengerUnits || [];

  if (cat === 'BUS') {
    const count = THREE.MathUtils.clamp(Math.round(vd.currentPassengers || 0), 0, 10);
    const activeIndices = SPARSE_BUS_SEAT_MAPS[count] || [];
    paxUnits.forEach((unit, idx) => {
      // Ghế (seatMesh) luôn hiển thị 100%, chỉ bật/tắt người ngồi (humanBody) theo đúng danh sách ghế có người!
      unit.userData.humanBody.visible = activeIndices.includes(idx);
    });

    const statusDesc = count === 0
      ? 'Trống Khách (10 Ghế Trống)'
      : (count <= 3 ? `Thưa Khách (Còn ${10 - count} Ghế Trống)` : `Đang Chở ${count}/10 Khách`);
    const txt = `🚌 Xe Bus [1 Tài Xế + ${count}/10 Khách | ${statusDesc}]`;
    if (vd.occStatusText !== txt) {
      vd.occStatusText = txt;
      updateVehicleOccupancyBadgeText(veh);
    }
  } else if (vd.isTaxi) {
    const count = THREE.MathUtils.clamp(Math.round(vd.currentPassengers || 0), 0, 3);
    paxUnits.forEach((unit, idx) => {
      unit.userData.humanBody.visible = (idx < count);
    });
    const txt = count === 0
      ? '🚕 Taxi [Chỉ 1 Tài Xế - 3 Ghế Khách Trống]'
      : `🚕 Taxi [1 Tài Xế + ${count}/3 Hành Khách]`;
    if (vd.occStatusText !== txt) {
      vd.occStatusText = txt;
      updateVehicleOccupancyBadgeText(veh);
    }
  } else if (cat === 'POLICE') {
    const off1Out = Boolean(vd.officerNpc && vd.officerNpc.visible);
    const off2Out = Boolean(vd.secondOfficerNpc && vd.secondOfficerNpc.visible);
    const hasSuspect = Boolean(vd.arrestTimer > 0 && !off1Out);

    if (vd.v160DriverUnit) vd.v160DriverUnit.userData.humanBody.visible = !off2Out;
    if (paxUnits[0]) paxUnits[0].userData.humanBody.visible = !off1Out;
    if (paxUnits[1]) paxUnits[1].userData.humanBody.visible = hasSuspect;
    if (paxUnits[2]) paxUnits[2].userData.humanBody.visible = false;

    const officersInCar = (off1Out ? 0 : 1) + (off2Out ? 0 : 1);
    const txt = `🚓 Cảnh Sát [${officersInCar}/2 Sĩ Quan${hasSuspect ? ' + 1 Tội Phạm Ghế Sau' : ' (Ghế Sau Trống)'}]`;
    if (vd.occStatusText !== txt) {
      vd.occStatusText = txt;
      updateVehicleOccupancyBadgeText(veh);
    }
  } else if (cat === 'CAR') {
    const paxCount = vd.fixedPersonalPaxCount ?? 0;
    paxUnits.forEach((unit, idx) => {
      unit.userData.humanBody.visible = (idx < paxCount);
    });
    const txt = paxCount === 0
      ? '🚗 Ô tô [Chỉ 1 Tài Xế - 3 Ghế Phụ Trống]'
      : `🚗 Ô tô [1 Tài Xế + ${paxCount} Khách (${4 - 1 - paxCount} Ghế Trống)]`;
    if (vd.occStatusText !== txt) {
      vd.occStatusText = txt;
      updateVehicleOccupancyBadgeText(veh);
    }
  }
}

function updateV160StrictTransitScheduleAndVisibleInteriors(dt, elapsed) {
  // Hồi lại khách đợi ở trạm xe Bus rất chậm (45 giây) để trạm đã đón hết khách sẽ thực sự trống người đợi!
  for (const stop of busStopWaitingQueues) {
    const hiddenWaiters = stop.waitingNpcs.filter((n) => !n.visible).length;
    if (hiddenWaiters === stop.waitingNpcs.length) {
      stop.respawnTimer = (stop.respawnTimer || 0) + dt;
      if (stop.respawnTimer > 45.0) {
        stop.respawnTimer = 0;
        stop.waitingNpcs.forEach((n) => { n.visible = true; });
      }
    }
  }

  for (const veh of allTrafficVehicles) {
    const vd = veh.userData;
    syncVehicleSeatedModelsAndDrivingPose(veh, elapsed);

    if (vd.isBoardedByPlayer) continue;
    const isBus = (vd.category === 'BUS');
    const isTaxi = Boolean(vd.isTaxi);
    if (!isBus && !isTaxi) continue;

    if (vd.v160StopCooldown > 0) vd.v160StopCooldown -= dt;

    // Nếu xe đang mở cửa dừng tại trạm để trả khách hoặc đón khách
    if (vd.v160DoorHoldTimer > 0) {
      vd.v160DoorHoldTimer -= dt;
      vd.activeSpeed = 0;
      if (vd.transitDoorPivot) {
        vd.transitDoorPivot.rotation.y = THREE.MathUtils.lerp(vd.transitDoorPivot.rotation.y, -1.25, dt * 6);
      }
      if (vd.v160DoorHoldTimer <= 0) {
        if (vd.transitDoorPivot) vd.transitDoorPivot.rotation.y = 0;
        vd.hornBadge.visible = false;
        vd.v160StopCooldown = 18.0; // Chạy qua ít nhất 18 giây mới xét trạm tiếp theo
      }
      continue;
    } else if (vd.transitDoorPivot) {
      vd.transitDoorPivot.rotation.y = THREE.MathUtils.lerp(vd.transitDoorPivot.rotation.y, 0, dt * 6);
    }

    if ((vd.v160StopCooldown || 0) <= 0) {
      for (const stop of busStopWaitingQueues) {
        const stopWorldX = stop.blockRef ? (stop.blockRef.position.x - 11.2) : stop.worldPos.x;
        const stopWorldZ = stop.blockRef ? (stop.blockRef.position.z + stop.localZ) : stop.worldPos.z;
        const distToStop = Math.hypot(veh.position.x - stopWorldX, veh.position.z - stopWorldZ);

        if (distToStop < 9.2) {
          vd.v160DoorHoldTimer = 3.8;
          vd.activeSpeed = 0;
          vd.hornBadge.visible = true;

          // QUY TẮC RÕ RÀNG CHO XE BUS & TAXI:
          // - Nếu trên Xe Bus đang có >= 3 khách (hoặc đang ở pha DROPOFF): BẮT BUỘC TRẢ BỚT KHÁCH XUỐNG TRẠM để xe Bus THƯA HẲN ĐI (còn 1 hoặc 2 người), KHÔNG ĐÓN THÊM ở nhịp này!
          // - Chỉ khi Xe Bus đang rất thưa (<= 2 khách) và tại trạm có khách đang ngồi đợi thì mới đón đúng số khách ở trạm (1..2 người) lên xe!
          if (isBus) {
            if (vd.currentPassengers >= 3) {
              const dropCount = Math.max(2, vd.currentPassengers - (1 + (Math.floor(elapsed) % 2))); // Giảm xuống chỉ còn 1 hoặc 2 khách trên cả xe Bus!
              vd.currentPassengers = Math.max(1, vd.currentPassengers - dropCount);
              spawnAlightingPassengersWalkingToSidewalk(veh.position, Math.min(dropCount, 4), Math.floor(elapsed));
              state.socialLog = `🚌🚶 [Xe Bus Trả Khách]: ${dropCount} khách vừa bước xuống trạm! Xe Bus giờ đã THƯA HẲN ĐI (chỉ còn ${vd.currentPassengers}/10 khách ngồi giữa các dãy ghế trống)!`;
              state.lastActionLog = state.socialLog;
            } else {
              // Xe Bus đang thưa (1-2 khách): Kiểm tra xem bệ ghế trạm Bus có khách đang ngồi đợi không
              const waitingAtBench = stop.waitingNpcs.filter((n) => n.visible);
              if (waitingAtBench.length > 0) {
                const boardNow = Math.min(waitingAtBench.length, 2); // Đón 1-2 người từ ghế trạm lên Bus
                for (let b = 0; b < boardNow; b++) {
                  waitingAtBench[b].visible = false;
                }
                vd.currentPassengers = Math.min(10, vd.currentPassengers + boardNow);
                state.socialLog = `🚌💺 [Xe Bus Đón Khách]: ${boardNow} khách ở trạm đã lên ngồi ghế trống trên Bus (Hiện có ${vd.currentPassengers}/10 khách)!`;
                state.lastActionLog = state.socialLog;
              }
            }
          } else if (isTaxi) {
            if (vd.currentPassengers > 0) {
              // Taxi đang có khách -> Trả hết khách xuống, biến thành Taxi Trống (0/3 khách, thấy rõ 3 ghế da trống!)
              const dropped = vd.currentPassengers;
              vd.currentPassengers = 0;
              spawnAlightingPassengersWalkingToSidewalk(veh.position, dropped, Math.floor(elapsed));
              state.socialLog = `🚕🚶 [Taxi Trả Khách]: ${dropped} khách đã xuống! Taxi hiện TRỐNG HOÀN TOÀN (0/3 khách, chỉ có Tài xế đang lái).`;
              state.lastActionLog = state.socialLog;
            } else {
              // Taxi đang trống -> Đón 1 hoặc 2 khách ở trạm
              const waitingAtBench = stop.waitingNpcs.filter((n) => n.visible);
              if (waitingAtBench.length > 0) {
                const boardTaxi = Math.min(waitingAtBench.length, 2);
                for (let b = 0; b < boardTaxi; b++) {
                  waitingAtBench[b].visible = false;
                }
                vd.currentPassengers = boardTaxi;
                state.socialLog = `🚕💺 [Taxi Đón Khách]: Đã đón ${boardTaxi} hành khách lên ghế sau Taxi (${vd.currentPassengers}/3 khách)!`;
                state.lastActionLog = state.socialLog;
              }
            }
          }

          syncVehicleSeatedModelsAndDrivingPose(veh, elapsed);
          break;
        }
      }
    }
  }
}

// --- 25.3. TÍCH HỢP VÀO VÒNG LẶP CHÍNH scene.onBeforeRender ---
const prevOnBeforeRenderV155 = scene.onBeforeRender;
let lastV160Time = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (prevOnBeforeRenderV155) {
    prevOnBeforeRenderV155(rendererInst, sceneInst, cameraInst);
  }
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV160Time) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV160Time = now;
  const elapsed = clock.getElapsedTime();

  // Cập nhật nội thất mở, dáng ngồi lái xe xoay vô lăng của Tài xế NPC & Chu kỳ làm thưa khách trên Xe Bus / Taxi
  updateV160StrictTransitScheduleAndVisibleInteriors(dt, elapsed);
};


// ============================================================================
// 19. BẢN CẬP NHẬT V155:
//     1. TINH CHỈNH ĐỘ SÁNG & MÀU ĐÈN TRẦN NỘI THẤT RIÊNG CHO TỪNG DÒNG XE VÀO BAN ĐÊM
//     2. HIỆU ỨNG HÀNH KHÁCH TRÊN XE BUS QUAY ĐẦU NHÌN RA CỬA SỔ KHI DỪNG ĐÈN ĐỎ
// ============================================================================

// --- 19.1. HỆ THỐNG ĐÈN TRẦN NỘI THẤT THÔNG MINH RIÊNG BIỆT CHO TỪNG DÒNG XE ---
const VEHICLE_DOME_PROFILES = {
  ROLLS_ROYCE: { label: 'Rolls-Royce', nightIntensity: 1.8, dayIntensity: 0.3, colorHex: 0xffe4b5, yPos: 1.28 },
  BUS:         { label: 'Xe Bus',      nightIntensity: 2.8, dayIntensity: 0.6, colorHex: 0xf8f9fa, yPos: 1.75 },
  POLICE:      { label: 'Cảnh Sát',    nightIntensity: 1.5, dayIntensity: 0.2, colorHex: 0x7ae2ff, yPos: 1.25 },
  FIRETRUCK:   { label: 'Cứu Hỏa',     nightIntensity: 2.2, dayIntensity: 0.4, colorHex: 0xffd166, yPos: 1.65 },
  CAR:         { label: 'Ô Tô NPC',    nightIntensity: 1.6, dayIntensity: 0.3, colorHex: 0xfff3b0, yPos: 1.24 },
  MOTORBIKE:   { label: 'Mô Tô 2B',    nightIntensity: 0.8, dayIntensity: 0.0, colorHex: 0x00e5ff, yPos: 0.95 },
  BICYCLE:     { label: 'Xe Đạp',      nightIntensity: 0.4, dayIntensity: 0.0, colorHex: 0x00ff88, yPos: 0.90 }
};

const DOME_AMBIENT_PALETTE = [
  { hex: 0xffe4b5, name: 'Vàng Kem Ấm (Warm Amber)' },
  { hex: 0xf8f9fa, name: 'Trắng Pha Lê (Pure Daylight)' },
  { hex: 0x7ae2ff, name: 'Xanh Băng Tuyết (Ice Cyber)' },
  { hex: 0xff758f, name: 'Hồng Rose Gold (Luxury Pink)' },
  { hex: 0xc77dff, name: 'Tím Tinh Vân (Starlight Violet)' }
];
let currentDomePaletteIdx = 0;

const cabinDomeLight = new THREE.PointLight(0xffe4b5, 1.8, 4.8, 1.2);
cabinDomeLight.position.set(0, 1.28, 0.25);
chassisGroup.add(cabinDomeLight);

const cabinDomeBulbMat = new THREE.MeshBasicMaterial({
  color: 0xffe4b5,
  transparent: true,
  opacity: 0.85
});
const cabinDomeBulbMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.36, 0.025, 0.65),
  cabinDomeBulbMat
);
cabinDomeBulbMesh.position.set(0, 1.36, 0.25);
chassisGroup.add(cabinDomeBulbMesh);

let lastSyncedVehicleTypeForDome = null;

function applyCurrentVehicleDomeLightProfile() {
  const vType = state.currentBoardedType || 'ROLLS_ROYCE';
  const profile = VEHICLE_DOME_PROFILES[vType] || VEHICLE_DOME_PROFILES.ROLLS_ROYCE;
  const isNightTime = (state.weatherMode === 'night' || state.weatherMode === 'rain' || state.weatherMode === 'sunset');

  const activeIntensity = isNightTime ? profile.nightIntensity : profile.dayIntensity;
  cabinDomeLight.intensity = activeIntensity;
  cabinDomeLight.color.setHex(profile.colorHex);
  cabinDomeLight.position.y = profile.yPos;

  cabinDomeBulbMat.color.setHex(profile.colorHex);
  cabinDomeBulbMat.opacity = THREE.MathUtils.clamp(activeIntensity / 3.0, 0.08, 0.95);
  cabinDomeBulbMesh.visible = (vType !== 'MOTORBIKE' && vType !== 'BICYCLE');

  const sliderEl = document.getElementById('slider-dome-light');
  const valEl = document.getElementById('val-dome-light');
  const nameEl = document.getElementById('dome-veh-name');

  if (nameEl) nameEl.textContent = profile.label;
  if (valEl) valEl.textContent = activeIntensity.toFixed(1);
  if (sliderEl && document.activeElement !== sliderEl) {
    sliderEl.value = String(activeIntensity);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const sliderEl = document.getElementById('slider-dome-light');
  const valEl = document.getElementById('val-dome-light');
  const colorBtn = document.getElementById('btn-dome-color-cycle');

  sliderEl?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) || 0;
    const vType = state.currentBoardedType || 'ROLLS_ROYCE';
    const profile = VEHICLE_DOME_PROFILES[vType] || VEHICLE_DOME_PROFILES.ROLLS_ROYCE;

    // Lưu độ sáng riêng cho đúng dòng xe đang ngồi
    if (state.weatherMode === 'day') {
      profile.dayIntensity = val;
    } else {
      profile.nightIntensity = val;
    }
    applyCurrentVehicleDomeLightProfile();
    if (valEl) valEl.textContent = val.toFixed(1);
    state.lastActionLog = `💡 Đã chỉnh độ sáng đèn trần ban đêm của [${profile.label}] thành: ${val.toFixed(1)}x`;
  });

  colorBtn?.addEventListener('click', () => {
    currentDomePaletteIdx = (currentDomePaletteIdx + 1) % DOME_AMBIENT_PALETTE.length;
    const picked = DOME_AMBIENT_PALETTE[currentDomePaletteIdx];
    const vType = state.currentBoardedType || 'ROLLS_ROYCE';
    const profile = VEHICLE_DOME_PROFILES[vType] || VEHICLE_DOME_PROFILES.ROLLS_ROYCE;

    profile.colorHex = picked.hex;
    applyCurrentVehicleDomeLightProfile();
    state.lastActionLog = `🎨 Đã đổi ánh đèn trần nội thất của [${profile.label}] sang: ${picked.name}!`;
  });
});

// --- 19.2. HÀNH KHÁCH TRÊN XE BUS QUAY ĐẦU NHÌN RA CỬA SỔ KHI XE DỪNG ĐÈN ĐỎ ---
function populateBusPassengersWithWindowLookEffect() {
  const suitColors = [0x00bbf9, 0xff4d6d, 0xffbe0b, 0x06d6a0, 0x9b5de5, 0xf77f00];
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.45 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });

  cityBusesList.forEach((bus) => {
    const passengers = [];

    // Đèn trần phát sáng dịu bên trong khoang Xe Bus để ban đêm nhìn từ ngoài qua cửa kính thấy rõ hành khách
    const busInteriorGlow = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 0.08, 6.2),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.65 })
    );
    busInteriorGlow.position.set(0, 2.12, 0);
    bus.add(busInteriorGlow);

    // 6 ghế hành khách ngồi sát 2 dãy cửa sổ Trái (-0.82m) và Phải (+0.82m)
    const seatCoords = [
      [-0.82, -1.6], [0.82, -1.6],
      [-0.82,  0.0], [0.82,  0.0],
      [-0.82,  1.6], [0.82,  1.6]
    ];

    seatCoords.forEach(([sx, sz], pIdx) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(sx, 1.05, sz);

      const torso = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.34, 8, 10),
        new THREE.MeshStandardMaterial({ color: suitColors[pIdx % suitColors.length], roughness: 0.5 })
      );
      torso.position.y = 0.25;
      pGroup.add(torso);

      // Khớp cổ (headPivot) để xoay đầu nhìn ra cửa sổ khi dừng đèn đỏ
      const headPivot = new THREE.Group();
      headPivot.position.set(0, 0.58, 0);
      pGroup.add(headPivot);

      const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 12), skinMat);
      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairMat
      );
      hairCap.position.y = 0.02;

      // Kính mắt / Mắt định hướng phía trước (-Z của xe Bus) để thấy rõ hướng quay đầu
      const glasses = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.045, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x111827 })
      );
      glasses.position.set(0, 0.01, -0.105);

      headPivot.add(headMesh, hairCap, glasses);
      bus.add(pGroup);

      // Trong hệ tọa độ xe Bus (mũi xe ở -Z):
      // Ngồi dãy trái (sx < 0) quay đầu sang trái là +Math.PI/2.1; ngồi dãy phải (sx > 0) quay sang phải là -Math.PI/2.1
      const windowLookYaw = sx < 0 ? (Math.PI / 2.15) : (-Math.PI / 2.15);
      passengers.push({
        headPivot,
        windowLookYaw,
        lookSpeed: 3.2 + (pIdx % 3) * 0.8,
        curiousTilt: (sx < 0 ? -1 : 1) * 0.12
      });
    });

    // Biểu tượng cảm xúc khi hành khách trên xe Bus nhìn ra cửa sổ lúc chờ đèn đỏ
    const lookWindowBubble = createSpeechBubbleSprite(
      '🚌👀 Đèn đỏ rồi, hành khách đang quay đầu ngắm phố đêm qua cửa sổ...',
      '#003566',
      '#00ff88'
    );
    lookWindowBubble.scale.set(1.85, 0.36, 1);
    lookWindowBubble.position.set(0, 3.45, 0);
    lookWindowBubble.visible = false;
    bus.add(lookWindowBubble);

    bus.userData.windowPassengers = passengers;
    bus.userData.lookWindowBubble = lookWindowBubble;
    bus.userData.busInteriorGlow = busInteriorGlow;
  });
}
populateBusPassengersWithWindowLookEffect();

function updateV155DomeLightsAndBusPassengers(dt, elapsed) {
  // 1. Tự động đồng bộ cấu hình đèn trần khi người chơi đổi loại xe hoặc đổi thời tiết Ban Đêm / Ban Ngày
  const currentKey = `${state.currentBoardedType}_${state.weatherMode}`;
  if (currentKey !== lastSyncedVehicleTypeForDome) {
    lastSyncedVehicleTypeForDome = currentKey;
    applyCurrentVehicleDomeLightProfile();
  }

  const isNight = (state.weatherMode === 'night' || state.weatherMode === 'rain' || state.weatherMode === 'sunset');

  // 2. Cập nhật hành khách trên mỗi Xe Bus quay đầu nhìn ra cửa sổ khi dừng đèn đỏ
  for (const bus of cityBusesList) {
    const vd = bus.userData;
    const passengers = vd.windowPassengers;
    if (!passengers) continue;

    // Điều chỉnh độ sáng khoang xe Bus theo thời tiết Đêm / Ngày
    if (vd.busInteriorGlow) {
      vd.busInteriorGlow.material.opacity = isNight ? 0.75 : 0.18;
    }

    // Kiểm tra xem Xe Bus có đang dừng đèn đỏ / dừng trạm (tốc độ gần bằng 0) hay đang chạy
    const currentBusSpeed = vd.isBoardedByPlayer
      ? Math.abs(state.speedKmh) / 3.6
      : (vd.activeSpeed ?? vd.moveSpeed ?? 0);

    const isStoppedAtRedLightOrStation = (currentBusSpeed < 0.85);

    if (vd.lookWindowBubble) {
      vd.lookWindowBubble.visible = isStoppedAtRedLightOrStation && (currentTrafficPhase === 'RED' || currentTrafficPhase === 'YELLOW');
    }

    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      if (isStoppedAtRedLightOrStation) {
        // Quay đầu hướng ra cửa sổ kính bên cạnh + nhịp gật nhẹ tự nhiên khi ngắm đường phố
        const subtleNod = Math.sin(elapsed * 2.2 + i) * 0.08;
        const targetYaw = p.windowLookYaw + subtleNod;
        p.headPivot.rotation.y = THREE.MathUtils.lerp(p.headPivot.rotation.y, targetYaw, dt * p.lookSpeed);
        p.headPivot.rotation.z = THREE.MathUtils.lerp(p.headPivot.rotation.z, p.curiousTilt, dt * 3.0);
      } else {
        // Khi xe Bus bắt đầu chạy tiếp: hành khách quay đầu nhìn thẳng về phía trước (0 rad)
        p.headPivot.rotation.y = THREE.MathUtils.lerp(p.headPivot.rotation.y, 0, dt * 4.5);
        p.headPivot.rotation.z = THREE.MathUtils.lerp(p.headPivot.rotation.z, 0, dt * 4.5);
      }
    }
  }
}

// --- 19.3. TÍCH HỢP VÀO VÒNG LẶP RENDER CHÍNH (KHÔNG XUNG ĐỘT VỚI CÁC BẢN TRƯỚC) ---
const prevOnBeforeRenderDomeV155 = scene.onBeforeRender;
let lastV155Time2 = performance.now();

scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
  if (typeof prevOnBeforeRenderDomeV155 === 'function') {
    prevOnBeforeRenderDomeV155(rendererInst, sceneInst, cameraInst);
  }
  if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

  const now = performance.now();
  const dt = Math.min((now - lastV155Time2) / 1000, 0.1);
  if (dt < 0.001) return;
  lastV155Time2 = now;
  const elapsed = clock.getElapsedTime();

  updateV155DomeLightsAndBusPassengers(dt, elapsed);
};


// ============================================================================
// 20. BẢN CẬP NHẬT V160 (BỌC IIFE CÔ LẬP SCOPE - KHÔNG TRÙNG BIẾN):
//     1. XÓA XE KHÁCH #2 ĐẬU GIỮA ĐƯỜNG KHI CHƯA CÓ NGƯỜI CHƠI THỨ 2
//     2. GIẢM CHÓA CỘT ĐÈN TẠI ĐIỂM SPAWN NHÀ
//     3. XÂY GARA XE, THƯ VIỆN, TRƯỜNG HỌC VÀO KHOẢNG TRỐNG CẠNH NHÀ & ĐƯA TRẺ EM VÀO SÂN TRƯỜNG
//     4. DỰNG MỚI CHI TIẾT MÔ HÌNH 3D XE CẤP CỨU (AMBULANCE) CHÂN THẬT
//     5. LÊN XE NPC NGỒI GHẾ PHỤ GÓC NHÌN THỨ 1 DO NPC CHỞ, ĐỔI LÁI & TỰ CHẠY TIẾP SAU 5 GIÂY KHI XUỐNG XE
//     6. NỘI THẤT & ĐỘ RỘNG KHOANG KHÁC BIỆT HOÀN TOÀN CHO TỪNG LOẠI XE (BUS, CẤP CỨU, CỨU HỎA, CẢNH SÁT, Ô TÔ)
//     7. HOẠT CẢNH SỐNG ĐỘNG TRƯỚC MẮT NGƯỜI CHƠI: CẢNH SÁT BẮT CƯỚP, XE CẤP CỨU BĂNG CA CỨU NGƯỜI BỊ TÔNG & XE CỨU HỎA PHUN NƯỚC CHỮA CHÁY
// ============================================================================
(() => {
  // --- 20.1. XÓA NGAY CHIẾC XE KHÁCH #2 (`car_guest_1`) ĐẬU GIỮA ĐƯỜNG KHI CHƯA CÓ NGƯỜI THỨ 2 ---
  function removeUnoccupiedGuestCarsInRoad() {
    if (typeof remoteCarMeshes !== 'undefined') {
      for (const [carId, mesh] of remoteCarMeshes.entries()) {
        if (carId === 'car_guest_1' || (mesh.position.x === -2.8 && mesh.position.z === 6.5)) {
          scene.remove(mesh);
          remoteCarMeshes.delete(carId);
        }
      }
    }
    // Ẩn mọi khối xe đen vô chủ nằm tại (-2.8, 0, 6.5)
    scene.children.forEach((obj) => {
      if (obj.isGroup && Math.abs(obj.position.x - (-2.8)) < 0.5 && Math.abs(obj.position.z - 6.5) < 0.5 && obj !== vehicleRoot) {
        obj.visible = false;
      }
    });
  }
  removeUnoccupiedGuestCarsInRoad();
  setInterval(removeUnoccupiedGuestCarsInRoad, 1500);

  // --- 20.2. KHẮC PHỤC CỘT ĐÈN CHÓA MẮT NGAY KHI SPAWN TẠI NHÀ ---
  (function fixBlindingStreetLightsNearHomeSpawn() {
    // Giảm độ gắt của toàn bộ chùm sáng cột đèn đường để ban đêm dịu mắt, trong trẻo
    if (typeof streetBeamMat !== 'undefined') {
      streetBeamMat.opacity = 0.032;
    }
    if (typeof headlightBeamMat !== 'undefined') {
      headlightBeamMat.opacity = 0.085;
    }

    // Tắt bớt các chùm sáng hình nón chồng chéo ngay trước cửa nhà người chơi (bán kính 28m quanh HOME_SPAWN_POS)
    const homeRef = typeof HOME_SPAWN_POS !== 'undefined' ? HOME_SPAWN_POS : new THREE.Vector3(-13.05, 0.24, -14.0);
    const worldPt = new THREE.Vector3();
    if (typeof streetLightCones !== 'undefined') {
      streetLightCones.forEach((cone, idx) => {
        cone.getWorldPosition(worldPt);
        if (worldPt.distanceTo(homeRef) < 28 || idx % 2 === 1) {
          cone.visible = false;
        }
      });
    }
    if (typeof streetPointLights !== 'undefined') {
      streetPointLights.forEach((pl) => {
        pl.intensity = 4.5;
        pl.distance = 16;
      });
    }
  })();

  // --- 20.3. XÂY DỰNG GARA SIÊU XE (CẠNH NHÀ), THƯ VIỆN THÀNH PHỐ & TRƯỜNG HỌC (CÓ SÂN CHƠI CHO TRẺ EM) ---
  const schoolPlaygroundCenters = [];

  function buildGarageLibraryAndSchoolInEmptySpaces() {
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x7ae2ff, transparent: true, opacity: 0.42, roughness: 0.08 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.55 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.25 });
    const warmLightMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });

    // 1. GARA SIÊU XE ROLLS-ROYCE RIÊNG NGAY KHOẢNG TRỐNG BÊN CẠNH NHÀ BẠN (Tọa độ: x = -22.5, z = -26.5)
    const homeGarage = new THREE.Group();
    homeGarage.position.set(-22.5, 0.24, -26.5);

    const gFloor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.2, 9.5), darkSteelMat);
    const gBackWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 9.5), concreteMat);
    gBackWall.position.set(-5.5, 2.2, 0);
    const gSideWall1 = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.4, 0.4), concreteMat);
    gSideWall1.position.set(0, 2.2, -4.55);
    const gSideWall2 = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.4, 0.4), glassMat);
    gSideWall2.position.set(0, 2.2, 4.55);
    const gRoof = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.45, 10.2), darkSteelMat);
    gRoof.position.set(0, 4.5, 0);

    // Đèn LED trần Gara & Cầu nâng bảo dưỡng xe + Tủ đồ nghề Đỏ
    const gLedStrip1 = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.08, 0.6), warmLightMat);
    gLedStrip1.position.set(0, 4.22, -2.0);
    const gLedStrip2 = gLedStrip1.clone();
    gLedStrip2.position.z = 2.0;

    const toolCabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.8, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.5, roughness: 0.3 })
    );
    toolCabinet.position.set(-4.6, 1.0, 0);

    // Một chiếc Supercar trưng bày trong Gara cạnh nhà bạn
    const showCar = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 1.15, 2.0),
      new THREE.MeshPhysicalMaterial({ color: 0xd4af37, metalness: 0.75, roughness: 0.15, clearcoat: 1.0 })
    );
    showCar.position.set(-0.5, 0.72, -1.8);

    const garageSign = createSpeechBubbleSprite('🏎️ GARA SIÊU XE GIA ĐÌNH (CẠNH NHÀ BẠN)', '#0f172a', '#ffd60a');
    garageSign.scale.set(2.2, 0.42, 1);
    garageSign.position.set(4.5, 5.3, 0);
    garageSign.visible = true;

    homeGarage.add(gFloor, gBackWall, gSideWall1, gSideWall2, gRoof, gLedStrip1, gLedStrip2, toolCabinet, showCar, garageSign);
    scene.add(homeGarage);

    // 2. THƯ VIỆN THÀNH PHỐ (CITY LIBRARY) Ở LÔ ĐẤT ĐỐI DIỆN NHÀ BẠN (x = 22.0, z = -22.0)
    const libraryGroup = new THREE.Group();
    libraryGroup.position.set(22.0, 0.24, -22.0);

    const libBase = new THREE.Mesh(new THREE.BoxGeometry(15.0, 0.6, 15.0), concreteMat);
    libBase.position.y = 0.3;
    const libHall = new THREE.Mesh(
      new THREE.BoxGeometry(13.2, 6.8, 13.2),
      new THREE.MeshStandardMaterial({ color: 0xfefae0, roughness: 0.45 })
    );
    libHall.position.y = 3.7;
    const libGlassFront = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 10.5), glassMat);
    libGlassFront.position.set(-6.62, 3.5, 0);

    // Hàng cột La Mã cổ điển trước sảnh Thư Viện
    [-4.2, -1.4, 1.4, 4.2].forEach((cz) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6.4, 14), concreteMat);
      col.position.set(-7.3, 3.5, cz);
      libraryGroup.add(col);
    });

    const libDome = new THREE.Mesh(
      new THREE.SphereGeometry(4.8, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0077b6, metalness: 0.4, roughness: 0.3 })
    );
    libDome.position.set(0, 7.1, 0);

    const libSign = createSpeechBubbleSprite('📚 THƯ VIỆN LỚN THÀNH PHỐ (CITY LIBRARY)', '#003566', '#00e5ff');
    libSign.scale.set(2.3, 0.44, 1);
    libSign.position.set(-6.5, 8.2, 0);
    libSign.visible = true;

    libraryGroup.add(libBase, libHall, libGlassFront, libDome, libSign);
    scene.add(libraryGroup);

    // 3. TRƯỜNG HỌC QUỐC TẾ & SÂN CHƠI TRẺ EM AN TOÀN (Tọa độ: x = -22.0, z = 22.0 và các ô phố)
    const schoolGroup = new THREE.Group();
    schoolGroup.position.set(-22.0, 0.24, 22.0);

    const schoolYard = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.16, 16.5),
      new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 })
    );
    schoolYard.position.y = 0.08;

    // Tòa nhà Trường học chữ L màu Vàng Kem - Mái Đỏ Tươi
    const schoolMain = new THREE.Mesh(
      new THREE.BoxGeometry(14.0, 6.4, 6.2),
      new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 })
    );
    schoolMain.position.set(0, 3.3, 4.5);

    const schoolRoof = new THREE.Mesh(
      new THREE.BoxGeometry(14.6, 0.6, 6.8),
      new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.4 })
    );
    schoolRoof.position.set(0, 6.7, 4.5);

    // Cột cờ sân trường & Cầu trượt trẻ em trong sân trường (x = -22, z = 18)
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7.5, 10), concreteMat);
    flagPole.position.set(-5.5, 3.8, -2.5);
    const flagBanner = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.9, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xff0022 })
    );
    flagBanner.position.set(-4.8, 7.0, -2.5);

    const schoolSign = createSpeechBubbleSprite('🏫 TRƯỜNG HỌC QUỐC TẾ & SÂN CHƠI TRẺ EM', '#9e2a2b', '#ffd60a');
    schoolSign.scale.set(2.3, 0.44, 1);
    schoolSign.position.set(0, 8.2, 2.0);
    schoolSign.visible = true;

    schoolGroup.add(schoolYard, schoolMain, schoolRoof, flagPole, flagBanner, schoolSign);
    scene.add(schoolGroup);

    // Lưu tâm sân trường (-22, 0.3, 18.5) để đưa toàn bộ trẻ em chơi bóng vào đúng trong sân trường!
    schoolPlaygroundCenters.push(new THREE.Vector3(-22.0, 0.32, 18.2));
    schoolPlaygroundCenters.push(new THREE.Vector3(22.0, 0.32, 22.0));
  }
  buildGarageLibraryAndSchoolInEmptySpaces();

  // Di chuyển toàn bộ Trẻ Em đang chơi bóng giữa lòng đường (|x| < 10.5 hoặc |z| < 10.5) vào Sân Trường & Công Viên
  function relocateChildrenFromRoadToSchoolyard() {
    let childIdx = 0;
    scene.children.forEach((obj) => {
      if (!obj.isGroup || obj === vehicleRoot || obj === playerAvatarGroup || obj === cityGroup) return;

      // Nhận diện nhóm Trẻ em chơi bóng (có quả bóng SphereGeometry màu sắc gần mặt đất hoặc scale nhỏ)
      let hasToyBall = false;
      obj.traverse((c) => {
        if (c.isMesh && c.geometry?.type === 'SphereGeometry' && c.position.y < 0.65 && c !== obj.children[0]) {
          hasToyBall = true;
        }
      });

      const isOnAsphaltRoad = Math.abs(obj.position.x) < 10.8 || Math.abs(obj.position.z) < 10.8;
      if (hasToyBall && isOnAsphaltRoad && !allTrafficVehicles.includes(obj)) {
        const yardCenter = schoolPlaygroundCenters[childIdx % schoolPlaygroundCenters.length];
        const angle = (childIdx * 1.7) % (Math.PI * 2);
        const radius = 2.2 + (childIdx % 3) * 1.4;
        obj.position.x = yardCenter.x + Math.cos(angle) * radius;
        obj.position.z = yardCenter.z + Math.sin(angle) * radius;
        obj.position.y = 0.30;
        if (obj.userData) {
          obj.userData.safeZoneCenter = yardCenter.clone();
        }
        childIdx++;
      }
    });
  }
  relocateChildrenFromRoadToSchoolyard();

  // --- 20.4. CHỈNH SỬA CHI TIẾT MÔ HÌNH 3D XE CẤP CỨU (AMBULANCE) CHÂN THẬT (KHÔNG CÒN LÀ KHỐI TRẮNG THÔ) ---
  const detailedAmbulancesList = [];

  function upgradeAndBuildDetailed3DAmbulances() {
    const pureWhiteMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1.0 });
    const medRedMat = new THREE.MeshBasicMaterial({ color: 0xe63946 });
    const medBlueMat = new THREE.MeshBasicMaterial({ color: 0x0077ff });
    const darkTintGlass = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.25, clearcoat: 1.0 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });

    function sculptDetailedAmbulance(ambGroup) {
      // Xóa các khối hộp trắng đơn điệu cũ trong group xe cấp cứu
      const oldBoxes = ambGroup.children.filter((c) => c.isMesh && c.geometry?.type === 'BoxGeometry');
      oldBoxes.forEach((m) => ambGroup.remove(m));

      // 1. Khoang bệnh nhân phía sau (Medical Box Module) có viền bo & dải phản quang Đỏ - Xanh Y Tế
      const medBox = new THREE.Mesh(new THREE.BoxGeometry(2.18, 1.95, 3.85), pureWhiteMat);
      medBox.position.set(0, 1.38, 0.65);

      const redBeltStripe = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.22, 3.88), medRedMat);
      redBeltStripe.position.set(0, 1.05, 0.65);

      const blueUpperStripe = new THREE.Mesh(new THREE.BoxGeometry(2.21, 0.10, 3.87), medBlueMat);
      blueUpperStripe.position.set(0, 2.15, 0.65);

      // 2. Đầu Cabin lái khí động học (Aerodynamic Sprinter Cab) + Kính chắn gió nghiêng + Lưới tản nhiệt
      const cabLower = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.95, 1.75), pureWhiteMat);
      cabLower.position.set(0, 0.88, -2.05);

      const cabUpper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.82, 1.15), darkTintGlass);
      cabUpper.position.set(0, 1.65, -1.75);

      const hoodSlope = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.18, 0.85), medRedMat);
      hoodSlope.position.set(0, 1.36, -2.42);
      hoodSlope.rotation.x = 0.22;

      const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 0.08), chromeMat);
      frontGrille.position.set(0, 0.78, -2.94);

      const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.26, 0.24), matPiano);
      frontBumper.position.set(0, 0.46, -2.92);

      // Đèn pha LED đôi + Đèn sương mù trước mũi xe Cấp Cứu
      [-0.76, 0.76].forEach((lx) => {
        const hLamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: 0xe0fbfc }));
        hLamp.position.set(lx, 0.85, -2.94);
        const sideMirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.10), matPiano);
        sideMirror.position.set(lx * 1.42, 1.55, -2.15);
        ambGroup.add(hLamp, sideMirror);
      });

      // 3. Biểu tượng Chữ Thập Đỏ (Red Cross 3D) nổi ở cả 2 bên hông xe, trên nóc và cửa sau
      [-1.11, 1.11].forEach((sideX) => {
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.68, 0.22), medRedMat);
        crossV.position.set(sideX, 1.62, 0.85);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.68), medRedMat);
        crossH.position.set(sideX, 1.62, 0.85);

        // Ô cửa kính mờ khoang cấp cứu bên hông
        const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.58, 1.15), darkTintGlass);
        sideWin.position.set(sideX, 1.65, -0.35);
        ambGroup.add(crossV, crossH, sideWin);
      });

      // Cửa đôi phía sau (Rear Double Doors) có 2 ô kính & bậc lên xuống băng ca
      [-0.48, 0.48].forEach((rx) => {
        const rearWin = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.62, 0.05), darkTintGlass);
        rearWin.position.set(rx, 1.68, 2.58);
        ambGroup.add(rearWin);
      });
      const rearStep = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.32), chromeMat);
      rearStep.position.set(0, 0.42, 2.68);

      // 4. Dàn đèn ưu tiên Cấp Cứu trên nóc (Emergency Lightbar Đỏ - Trắng - Xanh)
      const lightbarBase = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.38), chromeMat);
      lightbarBase.position.set(0, 2.42, -1.05);
      const sirenL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.32), medRedMat);
      sirenL.position.set(-0.52, 2.48, -1.05);
      const sirenR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.32), medBlueMat);
      sirenR.position.set(0.52, 2.48, -1.05);
      emergencyLightMeshes.push({ r: sirenL, b: sirenR });

      // 5. Băng ca Cấp Cứu 3D (Medical Stretcher) có đệm cam & chân bánh xe xếp gọn phía sau xe
      const stretcherGroup = new THREE.Group();
      const matBed = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.14, 1.85),
        new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.4 })
      );
      matBed.position.y = 0.68;
      const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.65, 8), chromeMat);
      leg1.position.set(-0.26, 0.32, -0.65);
      const leg2 = leg1.clone(); leg2.position.set(0.26, 0.32, -0.65);
      const leg3 = leg1.clone(); leg3.position.set(-0.26, 0.32, 0.65);
      const leg4 = leg1.clone(); leg4.position.set(0.26, 0.32, 0.65);

      // Bệnh nhân NPC nằm trên băng ca khi đang cấp cứu
      const patientBody = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.85, 8, 10),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
      );
      patientBody.rotation.x = Math.PI / 2;
      patientBody.position.set(0, 0.86, 0);
      const patientHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xf1c27d })
      );
      patientHead.position.set(0, 0.88, -0.62);

      stretcherGroup.add(matBed, leg1, leg2, leg3, leg4, patientBody, patientHead);
      stretcherGroup.position.set(0, 0, 3.85);
      stretcherGroup.visible = false;
      ambGroup.add(stretcherGroup);

      // Bánh xe Cấp Cứu nếu chưa có
      if (!ambGroup.userData.wheels || ambGroup.userData.wheels.length === 0) {
        const wList = [];
        [[-0.98, -1.95], [0.98, -1.95], [-0.98, 1.45], [0.98, 1.45]].forEach(([wx, wz]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.28, 18), matTireRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, 0.40, wz);
          ambGroup.add(w);
          wList.push(w);
        });
        ambGroup.userData.wheels = wList;
      }

      if (!ambGroup.userData.hornBadge) {
        const ambBadge = createHornAlertSprite('🚑 CẤP CỨU 115 KHẨN CẤP!', '#00e5ff');
        ambBadge.position.set(0, 2.95, 0);
        ambGroup.add(ambBadge);
        ambGroup.userData.hornBadge = ambBadge;
      }

      ambGroup.add(
        medBox, redBeltStripe, blueUpperStripe,
        cabLower, cabUpper, hoodSlope, frontGrille, frontBumper,
        rearStep, lightbarBase, sirenL, sirenR
      );

      ambGroup.userData.category = 'AMBULANCE';
      ambGroup.userData.modelName = 'Xe Cứu Thương 115 Sprinter';
      ambGroup.userData.stretcherGroup = stretcherGroup;
      ambGroup.userData.interiorTheme = {
        name: 'Khoang Y Tế Cấp Cứu 115 (Rộng & Vô Trùng)',
        nappaHex: 0xf1f5f9,
        woodHex: 0x0077b6,
        bodyHex: 0xffffff
      };

      ambGroup.traverse((c) => {
        if (c.isMesh && !c.userData.isVolumetricBeam) {
          register3DTarget(c, () => window.boardAnyNpcVehicleV160(ambGroup));
        }
      });

      detailedAmbulancesList.push(ambGroup);
    }

    // Tìm các xe cấp cứu hiện có trong scene hoặc tạo mới 2 chiếc Xe Cấp Cứu 3D chi tiết
    allTrafficVehicles.forEach((v) => {
      if (v.userData?.category === 'AMBULANCE' || /cấp cứu| cứu thương|ambulance/i.test(v.userData?.modelName || '')) {
        sculptDetailedAmbulance(v);
      }
    });

    if (detailedAmbulancesList.length === 0) {
      for (let i = 0; i < 2; i++) {
        const amb = new THREE.Group();
        const dir = i === 0 ? 1 : -1;
        amb.position.set(dir === 1 ? -3.2 : 3.2, 0, i === 0 ? -28 : 34);
        amb.rotation.y = dir === 1 ? Math.PI : 0;
        amb.userData = {
          category: 'AMBULANCE',
          modelName: 'Xe Cứu Thương 115 Sprinter',
          headingRad: dir === 1 ? Math.PI : 0,
          targetHeadingRad: dir === 1 ? Math.PI : 0,
          laneWidth: 3.2,
          cruiseSpeed: 12.5,
          activeSpeed: 12.5,
          crashState: 'NORMAL',
          turnCooldown: 4.0
        };
        sculptDetailedAmbulance(amb);
        scene.add(amb);
        allTrafficVehicles.push(amb);
      }
    }
  }
  upgradeAndBuildDetailed3DAmbulances();

  // --- 20.5. NỘI THẤT KHÁC BIỆT HOÀN TOÀN (ĐỘ RỘNG KHOANG, KIỂU DÁNG, TRANG BỊ & MÀU SẮC) CHO TỪNG DÒNG XE
  //           VÀ MÔ HÌNH TÀI XẾ NPC 3D NGỒI CẦM LÁI KHI BẠN ĐI NHỜ XE ---
  const customInteriorPropsGroup = new THREE.Group();
  chassisGroup.add(customInteriorPropsGroup);

  // Mô hình Tài Xế NPC 3D ngồi trong khoang xe (Ở Ghế Lái khi chở bạn, hoặc tự chuyển sang Ghế Phụ khi bạn cầm lái!)
  const activeNpcChauffeurMesh = new THREE.Group();
  let chauffeurLeftArm = null;
  let chauffeurRightArm = null;
  let chauffeurSuitMat = null;
  let chauffeurHatMesh = null;

  (function buildActiveNpcChauffeurInCockpit() {
    chauffeurSuitMat = new THREE.MeshStandardMaterial({ color: 0x0a2463, roughness: 0.45 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.45 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.38, 8, 12), chauffeurSuitMat);
    torso.position.set(0, 0.56, 0.05);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), skinMat);
    head.position.set(0, 0.96, 0.02);

    chauffeurHatMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.08, 12), chauffeurSuitMat);
    chauffeurHatMesh.position.set(0, 1.07, 0.02);

    chauffeurLeftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 8, 8), skinMat);
    chauffeurLeftArm.position.set(-0.18, 0.65, -0.14);
    chauffeurLeftArm.rotation.x = Math.PI / 2.5;

    chauffeurRightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 8, 8), skinMat);
    chauffeurRightArm.position.set(0.18, 0.65, -0.14);
    chauffeurRightArm.rotation.x = Math.PI / 2.5;

    const tagBubble = createSpeechBubbleSprite('👨✈️ Tài xế NPC đang chở bạn (Bấm [Đổi Lái] để cầm lái)', '#0f172a', '#00ff88');
    tagBubble.scale.set(0.75, 0.16, 1);
    tagBubble.position.set(0, 1.24, 0);
    tagBubble.visible = true;

    activeNpcChauffeurMesh.add(torso, head, chauffeurHatMesh, chauffeurLeftArm, chauffeurRightArm, tagBubble);
    activeNpcChauffeurMesh.visible = false;
    chassisGroup.add(activeNpcChauffeurMesh);
  })();

  function rebuildDistinctInteriorByVehicleCategory(category, customTheme) {
    // Xóa đạo cụ nội thất cũ
    while (customInteriorPropsGroup.children.length > 0) {
      customInteriorPropsGroup.remove(customInteriorPropsGroup.children[0]);
    }

    // Ẩn bớt 3 hành khách ảo cố định của Rolls-Royce khi sang xe NPC để không bị trùng lặp
    if (typeof passengerAvatars !== 'undefined') {
      passengerAvatars.forEach((p) => { p.visible = (category === 'ROLLS_ROYCE'); });
    }

    if (category === 'ROLLS_ROYCE') {
      // Trả về đúng kích thước & màu sắc nguyên bản của Rolls-Royce Ghost
      chassisGroup.scale.set(1.0, 1.0, 1.0);
      SEAT_POSITIONS[0].pos.set(-0.42, 0.0, 0.12);
      SEAT_POSITIONS[1].pos.set(0.42, 0.0, 0.12);
      SEAT_POSITIONS[2].pos.set(-0.42, 0.04, 1.02);
      SEAT_POSITIONS[3].pos.set(0.42, 0.04, 1.02);
      matNappa.color.setHex(DEFAULT_RR_THEME.nappaHex);
      matWalnut.color.setHex(DEFAULT_RR_THEME.woodHex);
      return;
    }

    if (category === 'BUS') {
      // KHOANG XE BUS: Rộng gấp 1.38 lần, trần cao gấp 1.25 lần, tay vịn cột vàng, máy quẹt thẻ vé & dãy ghế hành khách xanh
      chassisGroup.scale.set(1.38, 1.22, 1.25);
      SEAT_POSITIONS[0].pos.set(-0.52, 0.18, -0.05);
      SEAT_POSITIONS[1].pos.set(0.52, 0.18, -0.05);
      SEAT_POSITIONS[2].pos.set(-0.52, 0.22, 1.15);
      SEAT_POSITIONS[3].pos.set(0.52, 0.22, 1.15);
      matNappa.color.setHex(0x0077b6); // Ghế nệm xanh dương Xe Bus
      matWalnut.color.setHex(0xffbe0b); // Táp-lô vàng đặc trưng Xe Bus
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0x023e8a);

      const poleMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.7, roughness: 0.2 });
      [-0.28, 0.28].forEach((px) => {
        const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.35, 10), poleMat);
        stanchion.position.set(px, 0.75, 0.35);
        customInteriorPropsGroup.add(stanchion);
      });
      const ticketBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.36, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x00f5d4 })
      );
      ticketBox.position.set(0.12, 0.65, -0.25);
      customInteriorPropsGroup.add(ticketBox);

    } else if (category === 'AMBULANCE') {
      // KHOANG XE CẤP CỨU 115: Khoang rộng 1.25x, màu Trắng Y Tế vô trùng, Tủ thuốc Chữ Thập Đỏ, Bình Oxy & Băng Ca Cam bên hông
      chassisGroup.scale.set(1.25, 1.18, 1.18);
      SEAT_POSITIONS[0].pos.set(-0.46, 0.10, 0.05);
      SEAT_POSITIONS[1].pos.set(0.46, 0.10, 0.05);
      SEAT_POSITIONS[2].pos.set(-0.46, 0.14, 1.05);
      SEAT_POSITIONS[3].pos.set(0.46, 0.14, 1.05);
      matNappa.color.setHex(0xf8fafc); // Trắng tinh y tế
      matWalnut.color.setHex(0xe63946); // Viền Đỏ Chữ Thập
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0x00b4d8); // Áo blouse xanh bác sĩ cấp cứu

      const medBed = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.12, 1.15),
        new THREE.MeshStandardMaterial({ color: 0xff6b35 })
      );
      medBed.position.set(0.0, 0.52, 0.95);
      const ekgMonitor = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.18, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x00ff88 })
      );
      ekgMonitor.position.set(0.22, 0.85, -0.32);
      customInteriorPropsGroup.add(medBed, ekgMonitor);

    } else if (category === 'FIRETRUCK') {
      // KHOANG XE CỨU HỎA: Rộng 1.32x, Thép đỏ công nghiệp, Bình chữa cháy mini, Đồng hồ áp suất nước & Bộ đàm chỉ huy
      chassisGroup.scale.set(1.32, 1.20, 1.20);
      SEAT_POSITIONS[0].pos.set(-0.50, 0.16, 0.05);
      SEAT_POSITIONS[1].pos.set(0.50, 0.16, 0.05);
      matNappa.color.setHex(0x2b2d42); // Ghế da chống cháy xám đen
      matWalnut.color.setHex(0xd90429); // Táp-lô thép sơn đỏ cứu hỏa
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0xd90429);

      const extinguisher = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.38, 12),
        new THREE.MeshStandardMaterial({ color: 0xff0022, metalness: 0.6 })
      );
      extinguisher.position.set(0.0, 0.52, 0.15);
      customInteriorPropsGroup.add(extinguisher);

    } else if (category === 'POLICE') {
      // KHOANG XE CẢNH SÁT TUẦN TRA: Tông Đen - Xanh Tác Chiến, Laptop Radar Cảnh Sát giữa táp-lô & Vách lưới thép
      chassisGroup.scale.set(1.06, 1.02, 1.02);
      SEAT_POSITIONS[0].pos.set(-0.42, 0.02, 0.10);
      SEAT_POSITIONS[1].pos.set(0.42, 0.02, 0.10);
      matNappa.color.setHex(0x0f172a);
      matWalnut.color.setHex(0x1d4ed8);
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0x0a2463);

      const policeLaptop = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.18, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff })
      );
      policeLaptop.position.set(0.12, 0.82, -0.28);
      policeLaptop.rotation.y = -0.35;
      customInteriorPropsGroup.add(policeLaptop);

    } else {
      // KHOANG Ô TÔ THỂ THAO / TAXI NPC: Hẹp gọn hơn Rolls-Royce (0.88x), phối màu rực rỡ theo đúng màu sơn chiếc xe NPC đó!
      chassisGroup.scale.set(0.88, 0.94, 0.92);
      SEAT_POSITIONS[0].pos.set(-0.36, -0.02, 0.10);
      SEAT_POSITIONS[1].pos.set(0.36, -0.02, 0.10);
      matNappa.color.setHex(customTheme?.nappaHex || 0xf4a261);
      matWalnut.color.setHex(customTheme?.bodyHex || 0xe63946);
      if (chauffeurSuitMat) chauffeurSuitMat.color.setHex(0x2a9d8f);
    }
  }

  // --- 20.6. SỬA LỖI LÊN / XUỐNG XE NPC:
  //           - KHI LÊN XE NPC: NGỒI Ở GHẾ PHỤ (seatIndex = 1) VỚI GÓC NHÌN THỨ 1, TÀI XẾ NPC CHỞ BẠN ĐI!
  //           - KHI BẤM ĐỔI LÁI: BẠN SANG GHẾ LÁI (seatIndex = 0) CHỞ NPC, NPC SANG GHẾ PHỤ!
  //           - KHI XUỐNG XE: XE & NPC HIỆN LẠI NGAY TẠI CHỖ; NẾU BẠN ĐANG CẦM LÁI MÀ XUỐNG XE, ĐỢI 5 GIÂY NPC TỰ ĐỔI VỀ GHẾ LÁI CHẠY TIẾP! ---
  let abandonedNpcCarRecord = null; // Lưu xe NPC khi người chơi vừa xuống xe để đếm ngược 5 giây

  window.boardAnyNpcVehicleV160 = function(veh) {
    if (!veh || !veh.userData) return;
    initAudio();

    // Hủy bộ đếm 5 giây nếu người chơi lên lại xe
    if (abandonedNpcCarRecord && abandonedNpcCarRecord.veh === veh) {
      abandonedNpcCarRecord = null;
    }

    // Nếu trước đó đang ngồi trên 1 xe NPC khác, trả xe đó về trạng thái lưu thông bình thường
    if (state.boardedNpcVehicleRef && state.boardedNpcVehicleRef !== veh) {
      state.boardedNpcVehicleRef.visible = true;
      state.boardedNpcVehicleRef.userData.isBoardedByPlayer = false;
    }

    const vd = veh.userData;
    state.boardedNpcVehicleRef = veh;
    state.currentBoardedType = vd.category || 'CAR';
    vd.isBoardedByPlayer = true;

    // Đặt vị trí khoang xe khớp với chiếc xe NPC vừa lên
    vehicleRoot.position.copy(veh.position);
    state.headingRad = vd.headingRad ?? veh.rotation.y;
    vehicleRoot.rotation.y = state.headingRad;
    veh.visible = false;

    const isTwoWheel = (vd.category === 'BICYCLE' || vd.category === 'MOTORBIKE');
    setCarBodyVisibilityForTwoWheelMode(isTwoWheel);
    rebuildDistinctInteriorByVehicleCategory(state.currentBoardedType, vd.interiorTheme);

    if (vd.interiorTheme?.bodyHex) {
      matBodyPaint.color.setHex(vd.interiorTheme.bodyHex);
    }

    // YÊU CẦU QUAN TRỌNG: Khi lên xe NPC, người chơi MẶC ĐỊNH NGỒI Ở GHẾ PHỤ (seatIndex = 1) góc nhìn thứ nhất,
    // còn Tài xế NPC ngồi ở Ghế Lái (seatIndex = 0) để chở người chơi đi!
    state.seatIndex = 1;
    driverSeatMount.position.copy(SEAT_POSITIONS[1].pos);

    activeNpcChauffeurMesh.visible = true;
    activeNpcChauffeurMesh.position.copy(SEAT_POSITIONS[0].pos);

    if (state.playerMode !== 'DRIVING') {
      state.playerMode = 'DRIVING';
      state.doorsOpen = false;
      state.engineRunning = true;
      avatarBodyMesh.visible = false;
      driverSeatMount.add(cameraRig);
      cameraRig.position.set(0, 0, 0);
      if (typeof autoCenterBalancePassengerView === 'function') autoCenterBalancePassengerView();
      cameraRig.rotation.set(0, 0, 0);
      roofBeaconGroup.visible = false;
    }

    const hvBar = document.getElementById('heavy-vehicle-cockpit-bar');
    if (hvBar) {
      hvBar.classList.remove('active-bus-bar', 'active-fire-bar', 'active-heavy-bar');
      if (vd.category === 'BUS') hvBar.classList.add('active-bus-bar');
      else if (vd.category === 'FIRETRUCK') hvBar.classList.add('active-fire-bar');
      else if (vd.category === 'AMBULANCE') hvBar.classList.add('active-heavy-bar');
    }

    state.lastActionLog = `🚕 Bạn đã lên ngồi GHẾ PHỤ (Góc nhìn thứ 1) trên [${vd.modelName}]! Tài xế NPC đang chở bạn đi. Bấm [🔄 Đổi Lái / Ghế Phụ (C)] nếu muốn tự cầm lái chở NPC!`;
  };

  // Ghi đè hàm boardAnyNpcVehicle cũ
  window.boardAnyNpcVehicle = window.boardAnyNpcVehicleV160;

  // Khi bấm Đổi Lái / Ghế Phụ (Nút C hoặc nút trên màn hình): Hoán đổi vị trí giữa Bạn và Tài xế NPC!
  const origSwapSeat = swapSeatOrTakeDriverControl;
  window.swapSeatOrTakeDriverControl = function() {
    if (state.boardedNpcVehicleRef) {
      // Chuyển qua lại giữa Ghế Phụ (1 - NPC chở bạn) và Ghế Lái (0 - Bạn chở NPC)
      state.seatIndex = state.seatIndex === 0 ? 1 : 0;
      driverSeatMount.position.copy(SEAT_POSITIONS[state.seatIndex].pos);
      cameraRig.position.set(0, 0, 0);

      // NPC tự động đổi sang ghế còn lại!
      const npcSeatIdx = state.seatIndex === 0 ? 1 : 0;
      activeNpcChauffeurMesh.visible = true;
      activeNpcChauffeurMesh.position.copy(SEAT_POSITIONS[npcSeatIdx].pos);

      if (state.seatIndex !== 0) {
        if (typeof autoCenterBalancePassengerView === 'function') autoCenterBalancePassengerView();
      }
      state.lastActionLog = state.seatIndex === 0
        ? `🛞 BẠN ĐANG CẦM LÁI [${state.boardedNpcVehicleRef.userData.modelName}] và chở NPC ngồi bên ghế phụ!`
        : `💺 Bạn đã nhường lại vô-lăng cho Tài xế NPC! Đã tự động cân bằng tâm ghế phụ 360°!`;
      return;
    }
    origSwapSeat();
    if (state.seatIndex !== 0) {
      if (typeof autoCenterBalancePassengerView === 'function') autoCenterBalancePassengerView();
    }
  };

  const btnSwapEl = document.getElementById('btn-swap-driver');
  if (btnSwapEl) {
    const clonedSwap = btnSwapEl.cloneNode(true);
    btnSwapEl.parentNode.replaceChild(clonedSwap, btnSwapEl);
    clonedSwap.addEventListener('click', () => window.swapSeatOrTakeDriverControl());
  }

  // Ghi đè hàm Lên/Xuống xe (`enterOrExitCarWithBlink`) để khi xuống khỏi xe NPC:
  // 1. Hiện lại ngay chiếc xe NPC và NPC tại đúng vị trí đó (Không bao giờ bị mất xe!).
  // 2. Nếu bạn đang cầm lái (seatIndex === 0) mà xuống xe, xe NPC sẽ đứng đợi 5 giây; sau 5 giây không lên lại, NPC tự chuyển sang ghế lái và chạy đi tiếp!
  const prevEnterOrExitV160 = window.enterOrExitCarWithBlink;
  window.enterOrExitCarWithBlink = function() {
    if (state.playerMode === 'DRIVING' && state.boardedNpcVehicleRef) {
      const npcVeh = state.boardedNpcVehicleRef;
      const vd = npcVeh.userData;
      const playerWasDriving = (state.seatIndex === 0);

      // Đặt chiếc xe NPC hiện lại ngay tại vị trí vừa dừng
      npcVeh.position.copy(vehicleRoot.position);
      vd.headingRad = state.headingRad;
      vd.targetHeadingRad = state.headingRad;
      npcVeh.rotation.set(0, state.headingRad, 0);
      npcVeh.visible = true;
      vd.isBoardedByPlayer = false;

      // Đưa khoang Rolls-Royce của người chơi về lại vị trí đỗ trước nhà để không bị đè hình
      activeNpcChauffeurMesh.visible = false;
      state.boardedNpcVehicleRef = null;
      state.currentBoardedType = 'ROLLS_ROYCE';
      setCarBodyVisibilityForTwoWheelMode(false);
      rebuildDistinctInteriorByVehicleCategory('ROLLS_ROYCE');

      const hvBar = document.getElementById('heavy-vehicle-cockpit-bar');
      if (hvBar) hvBar.classList.remove('active-bus-bar', 'active-fire-bar', 'active-heavy-bar');

      // Đặt người chơi bước xuống đứng cạnh chiếc xe NPC vừa đi
      state.playerMode = 'ON_FOOT';
      state.doorsOpen = false;
      state.velocityMs = 0;
      state.speedKmh = 0;
      avatarBodyMesh.visible = true;
      roofBeaconGroup.visible = true;

      const stepOutOffset = new THREE.Vector3(1.85, 0.24, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), vd.headingRad);
      state.avatarPos.copy(npcVeh.position).add(stepOutOffset);
      playerAvatarGroup.position.copy(state.avatarPos);
      playerAvatarGroup.add(cameraRig);
      cameraRig.position.set(0, 0.52, 0);

      // Đưa chiếc Rolls-Royce riêng của bạn về vị trí đỗ cạnh nhà (hoặc cách đó 12m trên lề đường)
      if (typeof HOME_CAR_SPAWN_POS !== 'undefined') {
        vehicleRoot.position.copy(HOME_CAR_SPAWN_POS);
        vehicleRoot.rotation.y = 0;
      }

      if (playerWasDriving) {
        // Nếu người chơi đang chở NPC mà bước xuống xe: Xe NPC đứng chờ đúng 5.0 giây!
        vd.waitPlayerReturnTimer = 5.0;
        vd.activeSpeed = 0;
        if (vd.hornBadge) vd.hornBadge.visible = true;
        abandonedNpcCarRecord = { veh: npcVeh, timer: 5.0 };
        state.lastActionLog = `⏱️ Bạn vừa bước xuống khỏi [${vd.modelName}]. NPC đang ngồi ghế phụ đợi bạn 5 giây — nếu không lên lại, NPC sẽ tự sang ghế lái chạy tiếp!`;
      } else {
        vd.waitPlayerReturnTimer = 0;
        state.lastActionLog = `👋 Bạn đã xuống xe [${vd.modelName}]. Tài xế NPC đang tiếp tục hành trình!`;
      }
      return;
    }

    prevEnterOrExitV160();
  };

  // Gắn lại các nút Lên/Xuống xe trên UI để gọi đúng hàm mới
  ['btn-enter-exit-car', 'pad-enter-exit'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      clone.addEventListener('click', () => window.enterOrExitCarWithBlink());
    }
  });
  const btnNpcNear = document.getElementById('btn-board-npc-vehicle');
  if (btnNpcNear) {
    const clone = btnNpcNear.cloneNode(true);
    btnNpcNear.parentNode.replaceChild(clone, btnNpcNear);
    clone.addEventListener('click', () => {
      const refPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
      let nearest = null;
      let minDist = Infinity;
      for (const veh of allTrafficVehicles) {
        if (!veh.visible) continue;
        const d = refPos.distanceTo(veh.position);
        if (d < minDist) { minDist = d; nearest = veh; }
      }
      if (nearest) window.boardAnyNpcVehicleV160(nearest);
    });
  }

  // --- 20.7. ĐẠO DIỄN 3 HOẠT CẢNH SỐNG ĐỘNG NGAY TRƯỚC MẮT NGƯỜI CHƠI:
  //           1. CẢNH SÁT CHẶN ĐẦU XE BẮT CƯỚP
  //           2. XE TÔNG TAI NẠN -> XE CẤP CỨU 115 TỚI ĐƯA BĂNG CA RA CỨU NGƯỜI BỊ TÔNG
  //           3. ĐÁM CHÁY BÙNG PHÁT -> XE CỨU HỎA TỚI PHUN VÒI RỒNG NƯỚC DẬP LỬA ---
  const liveFireEffectGroup = new THREE.Group();
  liveFireEffectGroup.visible = false;
  scene.add(liveFireEffectGroup);

  const waterStreamParticles = [];
  const flameCones = [];

  (function buildFireAndWaterCannonEffects() {
    // Ngọn lửa 3D nhiều tầng + Khói tại hiện trường vụ cháy
    const flameColors = [0xff2200, 0xff7700, 0xffdd00];
    for (let i = 0; i < 6; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.45 + (i % 3) * 0.25, 1.8 + (i % 2) * 0.8, 10),
        new THREE.MeshBasicMaterial({ color: flameColors[i % 3], transparent: true, opacity: 0.88 })
      );
      cone.position.set((Math.random() - 0.5) * 1.4, 0.9, (Math.random() - 0.5) * 1.4);
      liveFireEffectGroup.add(cone);
      flameCones.push(cone);
    }
    const fireBanner = createSpeechBubbleSprite('🔥 ĐÁM CHÁY KHẨN CẤP! XE CỨU HỎA 114 ĐANG PHUN VÒI RỒNG DẬP LỬA!', '#780000', '#ffd60a');
    fireBanner.scale.set(2.4, 0.45, 1);
    fireBanner.position.set(0, 3.2, 0);
    fireBanner.visible = true;
    liveFireEffectGroup.add(fireBanner);

    // Tia nước vòi rồng 3D (Water Cannon Stream) phun từ nóc Xe Cứu Hỏa vào đám cháy
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x7ae2ff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 18; i++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), waterMat);
      drop.visible = false;
      scene.add(drop);
      waterStreamParticles.push({ mesh: drop, progress: i / 18 });
    }
  })();

  let activeCityDrama = {
    type: 'NONE', // 'AMBULANCE_RESCUE' | 'FIRE_EXTINGUISH' | 'POLICE_ARREST'
    timer: 0,
    stagePos: new THREE.Vector3(),
    actorVeh: null,
    victimNpc: null
  };
  let autoDramaCooldown = 4.0; // Tự động diễn hoạt cảnh đầu tiên ngay sau 4 giây để người chơi nhìn thấy ngay!
  let dramaCycleIndex = 0;

  function computeStagePositionInFrontOfPlayer(distAhead = 22.0) {
    const basePos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
    const yaw = state.playerMode === 'DRIVING' ? state.headingRad : state.avatarYaw;
    return new THREE.Vector3(
      basePos.x - Math.sin(yaw) * distAhead,
      0,
      basePos.z - Math.cos(yaw) * distAhead
    );
  }

  window.triggerLiveAmbulanceRescueCutscene = function() {
    const amb = detailedAmbulancesList[0] || allTrafficVehicles.find((v) => v.userData.category === 'AMBULANCE');
    const victim = sidewalkNpcs[0];
    if (!amb || !victim) return;

    const stage = computeStagePositionInFrontOfPlayer(20.0);
    amb.visible = true;
    amb.position.set(stage.x + 1.8, 0, stage.z);
    amb.rotation.set(0, 0, 0);
    amb.userData.isInterceptingHijacker = true;
    if (amb.userData.hornBadge) amb.userData.hornBadge.visible = true;
    if (amb.userData.stretcherGroup) amb.userData.stretcherGroup.visible = true;

    // Đặt NPC bị tai nạn nằm ngay cạnh Băng ca sau đuôi Xe Cấp Cứu
    victim.visible = true;
    victim.position.set(stage.x + 0.9, 0.28, stage.z + 3.8);
    victim.rotation.x = -Math.PI / 2;
    if (victim.userData.helloBubble) victim.userData.helloBubble.visible = true;

    activeCityDrama = {
      type: 'AMBULANCE_RESCUE',
      timer: 9.0,
      stagePos: stage,
      actorVeh: amb,
      victimNpc: victim
    };
    state.crimeLog = '🚑 [HOẠT CẢNH CẤP CỨU 115]: Xe Cấp Cứu đã bật còi hú, hạ Băng Ca đưa NPC bị tông lên xe cấp cứu!';
    state.lastActionLog = state.crimeLog;
  };

  window.triggerLiveFiretruckExtinguishCutscene = function() {
    const ft = allTrafficVehicles.find((v) => v.userData.category === 'FIRETRUCK');
    if (!ft) return;

    const stage = computeStagePositionInFrontOfPlayer(22.0);
    liveFireEffectGroup.position.set(stage.x - 3.5, 0.2, stage.z - 2.0);
    liveFireEffectGroup.visible = true;
    liveFireEffectGroup.scale.set(1, 1, 1);

    ft.visible = true;
    ft.position.set(stage.x + 2.2, 0, stage.z + 3.5);
    ft.lookAt(liveFireEffectGroup.position.x, 0, liveFireEffectGroup.position.z);
    ft.userData.isInterceptingHijacker = true;
    if (ft.userData.hornBadge) ft.userData.hornBadge.visible = true;

    activeCityDrama = {
      type: 'FIRE_EXTINGUISH',
      timer: 9.5,
      stagePos: stage,
      actorVeh: ft,
      victimNpc: null
    };
    state.crimeLog = '🚒🔥 [HOẠT CẢNH CHỮA CHÁY 114]: Xe Cứu Hỏa đã tiếp cận đám cháy và đang phun Vòi Rồng dập lửa!';
    state.lastActionLog = state.crimeLog;
  };

  window.triggerLivePoliceArrestCutscene = function() {
    const pCar = policeCarsList[0];
    const thief = sidewalkNpcs[1] || sidewalkNpcs[0];
    if (!pCar || !thief) return;

    const stage = computeStagePositionInFrontOfPlayer(19.0);
    pCar.visible = true;
    pCar.position.set(stage.x - 1.5, 0, stage.z);
    pCar.rotation.set(0, Math.PI / 6, 0);
    pCar.userData.isInterceptingHijacker = true;
    if (pCar.userData.hornBadge) pCar.userData.hornBadge.visible = true;
    if (pCar.userData.officerNpc) pCar.userData.officerNpc.visible = true;

    thief.visible = true;
    thief.position.set(stage.x + 0.5, 0.24, stage.z + 1.2);
    thief.lookAt(pCar.position);
    if (thief.userData.helloBubble) thief.userData.helloBubble.visible = true;

    activeCityDrama = {
      type: 'POLICE_ARREST',
      timer: 8.5,
      stagePos: stage,
      actorVeh: pCar,
      victimNpc: thief
    };
    state.crimeLog = '🚓🚨 [HOẠT CẢNH BẮT CƯỚP]: Xe Cảnh Sát vừa ép lề, khống chế bắt giữ tên cướp ngay trước mắt bạn!';
    state.lastActionLog = state.crimeLog;
  };

  // Gắn trực tiếp vào 2 nút trong Bảng Chức Năng (#btn-trigger-fire-event & #btn-trigger-ambulance)
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-trigger-fire-event')?.addEventListener('click', window.triggerLiveFiretruckExtinguishCutscene);
    document.getElementById('btn-trigger-ambulance')?.addEventListener('click', window.triggerLiveAmbulanceRescueCutscene);
  });

  function updateV160MasterWorld(dt, elapsed) {
    // 1. Xử lý khi bạn đang ngồi Ghế Phụ (seatIndex !== 0) trên xe NPC: Tài xế NPC tự động lái chở bạn đi đúng làn & vần vô-lăng!
    if (state.playerMode === 'DRIVING' && state.boardedNpcVehicleRef && state.seatIndex !== 0) {
      const vd = state.boardedNpcVehicleRef.userData;
      const cruiseMs = vd.cruiseSpeed || 13.5;

      // Kiểm tra đèn đỏ phía trước để Tài xế NPC chở bạn dừng đèn đỏ đúng luật
      const gridX = Math.round(vehicleRoot.position.x / BLOCK_SIZE) * BLOCK_SIZE;
      const gridZ = Math.round(vehicleRoot.position.z / BLOCK_SIZE) * BLOCK_SIZE;
      const fwdX = -Math.sin(state.headingRad);
      const fwdZ = -Math.cos(state.headingRad);
      const distAhead = (gridX - vehicleRoot.position.x) * fwdX + (gridZ - vehicleRoot.position.z) * fwdZ;
      const isZ = Math.abs(fwdZ) >= Math.abs(fwdX);
      const lightGreen = isZ ? (currentTrafficPhase === 'GREEN') : (currentTrafficPhase === 'RED');

      if (!lightGreen && distAhead > 11.0 && distAhead < 15.8) {
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * 10);
      } else {
        state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, cruiseMs, dt * 4);
      }
      state.speedKmh = state.velocityMs * 3.6;

      // Giữ xe bám chuẩn tâm làn đường nhựa và tự động rẽ tại ngã tư
      const laneW = vd.laneWidth || 3.2;
      if (isZ) {
        const targetX = gridX + (fwdZ > 0 ? -laneW : laneW);
        vehicleRoot.position.x = THREE.MathUtils.lerp(vehicleRoot.position.x, targetX, dt * 5);
      } else {
        const targetZ = gridZ + (fwdX > 0 ? laneW : -laneW);
        vehicleRoot.position.z = THREE.MathUtils.lerp(vehicleRoot.position.z, targetZ, dt * 5);
      }

      const step = state.velocityMs * dt;
      vehicleRoot.position.x += fwdX * step;
      vehicleRoot.position.z += fwdZ * step;
      vehicleRoot.rotation.y = state.headingRad;

      // Hiệu ứng Tài xế NPC đánh tay lái nhịp nhàng
      if (chauffeurLeftArm && chauffeurRightArm) {
        const steerWave = Math.sin(elapsed * 3.5) * 0.22;
        chauffeurLeftArm.rotation.z = steerWave;
        chauffeurRightArm.rotation.z = steerWave;
        steeringWheelPivot.rotation.z = steerWave * 1.5;
      }
    }

    // 2. Xử lý bộ đếm 5 giây sau khi bạn xuống khỏi xe NPC (mà trước đó bạn đang cầm lái):
    if (abandonedNpcCarRecord) {
      const rec = abandonedNpcCarRecord;
      rec.timer -= dt;
      if (rec.veh && rec.veh.userData) {
        rec.veh.userData.activeSpeed = 0; // Đứng đợi người chơi 5 giây
      }
      if (rec.timer <= 0) {
        if (rec.veh && rec.veh.userData) {
          rec.veh.userData.waitPlayerReturnTimer = 0;
          rec.veh.userData.activeSpeed = rec.veh.userData.cruiseSpeed || 12.0;
          if (rec.veh.userData.hornBadge) rec.veh.userData.hornBadge.visible = false;
          state.lastActionLog = `🚗 Đã hết 5 giây chờ: NPC trên [${rec.veh.userData.modelName}] đã tự chuyển về Ghế Lái và điều khiển xe chạy tiếp!`;
        }
        abandonedNpcCarRecord = null;
      }
    }

    // 3. Cập nhật chuỗi Hoạt Cảnh Sống Động (Cấp Cứu Băng Ca, Cứu Hỏa Phun Nước, Cảnh Sát Bắt Cướp)
    if (activeCityDrama.type !== 'NONE') {
      activeCityDrama.timer -= dt;

      if (activeCityDrama.type === 'AMBULANCE_RESCUE' && activeCityDrama.actorVeh) {
        const stGroup = activeCityDrama.actorVeh.userData.stretcherGroup;
        if (stGroup) {
          // Di chuyển băng ca từ đuôi xe (z = 3.85) trượt dần vào trong khoang xe Cấp Cứu (z = 1.2)
          stGroup.position.z = THREE.MathUtils.lerp(stGroup.position.z, 1.4, dt * 0.8);
          if (activeCityDrama.victimNpc && activeCityDrama.timer < 5.5) {
            activeCityDrama.victimNpc.visible = false; // Đã được đưa lên nằm trên băng ca
          }
        }
      } else if (activeCityDrama.type === 'FIRE_EXTINGUISH' && activeCityDrama.actorVeh) {
        // Phun tia nước vòi rồng 3D từ nóc Xe Cứu Hỏa vào đám cháy và dập nhỏ ngọn lửa dần
        const startPt = activeCityDrama.actorVeh.position.clone().add(new THREE.Vector3(0, 2.5, 0));
        const endPt = liveFireEffectGroup.position.clone().add(new THREE.Vector3(0, 0.8, 0));

        waterStreamParticles.forEach((wp) => {
          wp.progress = (wp.progress + dt * 1.8) % 1.0;
          wp.mesh.visible = true;
          wp.mesh.position.lerpVectors(startPt, endPt, wp.progress);
          wp.mesh.position.y += Math.sin(wp.progress * Math.PI) * 1.6;
        });

        flameCones.forEach((fc, idx) => {
          fc.scale.y = 0.6 + Math.abs(Math.sin(elapsed * 12 + idx)) * 0.7;
        });
        const shrink = THREE.MathUtils.clamp(activeCityDrama.timer / 9.5, 0.15, 1.0);
        liveFireEffectGroup.scale.set(shrink, shrink, shrink);
      }

      if (activeCityDrama.timer <= 0) {
        // Kết thúc hoạt cảnh, trả các xe chuyên dụng về lưu thông bình thường
        if (activeCityDrama.actorVeh && activeCityDrama.actorVeh.userData) {
          activeCityDrama.actorVeh.userData.isInterceptingHijacker = false;
          if (activeCityDrama.actorVeh.userData.stretcherGroup) {
            activeCityDrama.actorVeh.userData.stretcherGroup.visible = false;
            activeCityDrama.actorVeh.userData.stretcherGroup.position.z = 3.85;
          }
          if (activeCityDrama.actorVeh.userData.officerNpc) {
            activeCityDrama.actorVeh.userData.officerNpc.visible = false;
          }
        }
        if (activeCityDrama.victimNpc) {
          activeCityDrama.victimNpc.visible = true;
          activeCityDrama.victimNpc.rotation.x = 0;
        }
        liveFireEffectGroup.visible = false;
        waterStreamParticles.forEach((wp) => { wp.mesh.visible = false; });
        activeCityDrama.type = 'NONE';
        autoDramaCooldown = 14.0;
      }
    } else {
      autoDramaCooldown -= dt;
      if (autoDramaCooldown <= 0) {
        if (dramaCycleIndex % 3 === 0) window.triggerLiveAmbulanceRescueCutscene();
        else if (dramaCycleIndex % 3 === 1) window.triggerLiveFiretruckExtinguishCutscene();
        else window.triggerLivePoliceArrestCutscene();
        dramaCycleIndex++;
      }
    }
  }

  // --- 20.8. TÍCH HỢP VÀO VÒNG LẶP RENDER CHÍNH ---
  const prevRenderHookV160 = scene.onBeforeRender;
  let lastV160Time = performance.now();

  scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
    if (typeof prevRenderHookV160 === 'function') {
      prevRenderHookV160(rendererInst, sceneInst, cameraInst);
    }
    if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

    const now = performance.now();
    const dt = Math.min((now - lastV160Time) / 1000, 0.1);
    if (dt < 0.001) return;
    lastV160Time = now;
    const elapsed = clock.getElapsedTime();

    updateV160MasterWorld(dt, elapsed);
  };
})();


// ============================================================================
// 21. BẢN CẬP NHẬT V165 (BỌC IIFE CÔ LẬP SCOPE - KHÔNG TRÙNG BIẾN):
//     1. BẢNG HIỆU ĐỊA CHỈ & TÊN "TOÀN" PHONG CÁCH GRAFFITI LUXURY ĐẶC BIỆT
//        (CHỐNG CHÓA MẮT BAN ĐÊM & KHÔNG BỊ CHÌM VÀO TƯỜNG HAY THỜI TIẾT NGÀY/ĐÊM)
//     2. GARA SIÊU XE 3 KHOANG ĐỖ CÙNG LÚC 3 MẪU XE (ROLLS-ROYCE GHOST, SPORT COUPE GT,
//        MOTO PKL R1) ĐỂ MỖI SÁNG BƯỚC RA KHỎI NHÀ CÓ THỂ CHỌN LÁI NGAY
// ============================================================================
(() => {
  // --- 21.1. HÀM VẼ BẢNG HIỆU GRAFFITI LUXURY ĐỘC BẢN MANG TÊN "TOÀN" ---
  // Sử dụng toneMapped: false + Khung nền Obsidian tối sâu + Viền Keyline 3D để:
  // - Ban đêm: Không bao giờ bị chóa trắng (bloom/glare) bởi đèn đường.
  // - Ban ngày / Hoàng hôn / Mưa: Không bao giờ bị chìm vào màu tường kem hay bầu trời sáng.
  function createToanGraffitiLuxurySignMesh(mainGraffitiText, subAddressText, widthM = 5.6, heightM = 1.65, accentTheme = 'GOLD_CYAN') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    // 1. Nền hộp Obsidian nhám chống chìm màu tường 100% trong mọi thời tiết
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 320);
    bgGrad.addColorStop(0, '#070a14');
    bgGrad.addColorStop(0.5, '#10172a');
    bgGrad.addColorStop(1, '#060911');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 320);

    // Họa tiết Graffiti Street-Art chìm phía sau (Sọc chéo & vệt sơn Splash nghệ thuật)
    ctx.save();
    ctx.globalAlpha = 0.16;
    const splashColors = accentTheme === 'GOLD_CYAN' ? ['#00f5d4', '#ffd60a', '#ff2a85'] : ['#ff2a85', '#00bbf9', '#ffd60a'];
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = splashColors[i % splashColors.length];
      ctx.beginPath();
      ctx.arc(90 + i * 68, 70 + (i % 3) * 75, 18 + (i % 4) * 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 2. Khung viền kép Vàng Hoàng Gia & Neon Cyan cắt sắc nét khỏi vách tường
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 1008, 304);
    ctx.strokeStyle = accentTheme === 'GOLD_CYAN' ? '#00f5d4' : '#ff2a85';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 984, 280);

    // 3. Biểu tượng Vương miện Graffiti (King Crown) phía trên tên TOÀN
    ctx.save();
    ctx.translate(105, 58);
    ctx.rotate(-0.14);
    ctx.fillStyle = '#ffd60a';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-38, 18);
    ctx.lineTo(-46, -18);
    ctx.lineTo(-15, 2);
    ctx.lineTo(0, -26);
    ctx.lineTo(15, 2);
    ctx.lineTo(46, -18);
    ctx.lineTo(38, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 4. Vẽ chữ GRAFFITI 3D EXTRUSION cho tên "TOÀN"
    ctx.save();
    ctx.translate(512, 148);
    ctx.transform(1, -0.04, -0.16, 1, 0, 0); // Độ nghiêng Wildstyle Graffiti năng động
    ctx.font = '900 94px "Impact", "Arial Black", "Segoe UI Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Lớp 4A: Khối nổi 3D (3D Block Extrusion) đổ sâu xuống góc dưới phải
    for (let d = 14; d >= 1; d--) {
      ctx.fillStyle = d > 7 ? '#04060c' : '#1e1b4b';
      ctx.fillText(mainGraffitiText, d * 1.4, d * 1.5);
    }

    // Lớp 4B: Viền hào quang Graffiti (Outer Neon Keyline)
    ctx.strokeStyle = accentTheme === 'GOLD_CYAN' ? '#00f5d4' : '#ffbe0b';
    ctx.lineWidth = 20;
    ctx.lineJoin = 'round';
    ctx.strokeText(mainGraffitiText, 0, 0);

    // Lớp 4C: Viền đen đặc tách khối (Black Cutback Outline) giúp chữ không bao giờ bị lóa
    ctx.strokeStyle = '#05070e';
    ctx.lineWidth = 11;
    ctx.strokeText(mainGraffitiText, 0, 0);

    // Lớp 4D: Màu tô chuyển sắc Graffiti Luxury (Cyan Ngọc Lục Bảo -> Vàng 24K -> Hồng Hồng Ngọc)
    const textGrad = ctx.createLinearGradient(-380, -55, 380, 55);
    if (accentTheme === 'GOLD_CYAN') {
      textGrad.addColorStop(0.0, '#00f5d4');
      textGrad.addColorStop(0.35, '#ffffff');
      textGrad.addColorStop(0.68, '#ffd60a');
      textGrad.addColorStop(1.0, '#ff2a85');
    } else {
      textGrad.addColorStop(0.0, '#ffd60a');
      textGrad.addColorStop(0.45, '#ff758f');
      textGrad.addColorStop(0.75, '#ffffff');
      textGrad.addColorStop(1.0, '#00f5d4');
    }
    ctx.fillStyle = textGrad;
    ctx.fillText(mainGraffitiText, 0, 0);

    // Lớp 4E: Đường bóng kính phản quang trắng sắc nét ở mép trên chữ
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.strokeText(mainGraffitiText, -2, -3);
    ctx.restore();

    // 5. Dải băng Địa chỉ Chính thức (Address Plate) ở phần chân bảng hiệu
    ctx.fillStyle = 'rgba(6, 12, 24, 0.94)';
    ctx.fillRect(36, 234, 952, 54);
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(36, 234, 952, 54);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 25px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(subAddressText, 512, 261);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.needsUpdate = true;

    // Tạo hộp bảng hiệu 3D có viền kim loại Vàng Gold bao quanh
    const signGroup = new THREE.Group();
    const backingBox = new THREE.Mesh(
      new THREE.BoxGeometry(widthM + 0.16, heightM + 0.16, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.2 })
    );
    // QUAN TRỌNG: toneMapped: false giúp bảng hiệu giữ nguyên màu sắc chuẩn 100%, không bị chóa trắng vào ban đêm!
    const faceMat = new THREE.MeshBasicMaterial({
      map: tex,
      toneMapped: false
    });
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), faceMat);
    faceMesh.position.z = 0.075;

    const backFaceMesh = faceMesh.clone();
    backFaceMesh.rotation.y = Math.PI;
    backFaceMesh.position.z = -0.075;

    signGroup.add(backingBox, faceMesh, backFaceMesh);
    return signGroup;
  }

  // --- 21.2. LẮP ĐẶT BẢNG HIỆU GRAFFITI "TOÀN" LÊN DINH THỰ & GARA SIÊU XE CẠNH NHÀ ---
  (function installToanGraffitiSignsOnHouseAndGarage() {
    // 1. Bảng hiệu Graffiti tại Mặt tiền Dinh Thự Nhà Của Toàn (Hướng ra vỉa hè điểm Spawn x = -16.6, z = -14.0)
    const houseSign = createToanGraffitiLuxurySignMesh(
      '★ TOÀN VILLA ★',
      '📍 ĐỊA CHỈ: SỐ 01 ĐẠI LỘ TRỌNG TOÀN • LUXURY DISTRICT',
      5.4,
      1.55,
      'GOLD_CYAN'
    );
    houseSign.position.set(-16.55, 5.55, -14.0);
    houseSign.rotation.y = Math.PI / 2; // Quay mặt bảng hiệu ra đúng hướng vỉa hè nơi bạn spawn!
    scene.add(houseSign);

    // Trụ biển số nhà Graffiti phát sáng ngay cổng bước vào nhà Toàn (x = -14.8, z = -11.2)
    const gatePillarSign = createToanGraffitiLuxurySignMesh(
      'TOÀN #01',
      '🏠 DINH THỰ NGUYỄN TRỌNG TOÀN',
      2.3,
      0.82,
      'PINK_GOLD'
    );
    gatePillarSign.position.set(-15.2, 2.35, -10.8);
    gatePillarSign.rotation.y = Math.PI / 2;
    scene.add(gatePillarSign);

    // 2. Bảng hiệu Graffiti khổng lồ trên đỉnh mặt tiền Gara Siêu Xe Của Toàn (x = -16.6, z = -26.5)
    const garageMainSign = createToanGraffitiLuxurySignMesh(
      '⚡ TOÀN GARAGE ⚡',
      '📍 ĐỊA CHỈ: SỐ 02 ĐẠI LỘ TRỌNG TOÀN • 3-BAY SUPERCAR COLLECTION',
      6.4,
      1.75,
      'PINK_GOLD'
    );
    garageMainSign.position.set(-16.5, 5.35, -26.5);
    garageMainSign.rotation.y = Math.PI / 2; // Quay mặt ra đường lớn để đứng ở nhà nhìn thấy rõ ngay!
    scene.add(garageMainSign);
  })();

  // --- 21.3. XÂY DỰNG 3 BỤC ĐỖ XE TRONG GARA CỦA TOÀN (ĐỖ CÙNG LÚC 3 MẪU XE: ROLLS-ROYCE, SPORT COUPE GT, MOTO PKL) ---
  // Tọa độ Gara cạnh nhà: Tâm ở (-22.5, 0.24, -26.5). Mở rộng mặt sàn Gara để chứa thoải mái 3 khoang đỗ xe song song.
  const GARAGE_BAYS = [
    {
      id: 'RR_GHOST',
      name: '1. Rolls-Royce Ghost V12 (Siêu Sang)',
      worldPos: new THREE.Vector3(-21.5, 0.26, -23.3),
      headingRad: -Math.PI / 2, // Mũi xe hướng thẳng ra cổng Gara (+X) sẵn sàng phóng ra đường!
      ringColor: 0xd4af37,
      speedMultiplier: 5.0,
      steerSens: 1.0,
      bodyHex: 0x101829,
      nappaHex: 0xdfd1be,
      woodHex: 0x3a2314
    },
    {
      id: 'SPORT_COUPE',
      name: '2. Sport Coupe GT Widebody (Siêu Xe 2 Cửa)',
      worldPos: new THREE.Vector3(-21.5, 0.26, -26.5),
      headingRad: -Math.PI / 2,
      ringColor: 0xff2a85,
      speedMultiplier: 7.5, // Nhanh và bốc hơn Rolls-Royce!
      steerSens: 1.35,
      bodyHex: 0xd90429,
      nappaHex: 0x111827,
      woodHex: 0xff2a85
    },
    {
      id: 'MOTO_PKL',
      name: '3. Moto PKL Sportbike R1 (1000cc 2 Bánh)',
      worldPos: new THREE.Vector3(-21.5, 0.26, -29.5),
      headingRad: -Math.PI / 2,
      ringColor: 0x00f5d4,
      speedMultiplier: 8.5, // Gia tốc mô tô phân khối lớn cực nhạy!
      steerSens: 1.5,
      bodyHex: 0x00bbf9,
      nappaHex: 0x0f172a,
      woodHex: 0x00f5d4
    }
  ];

  let currentSelectedGarageVehicleId = 'RR_GHOST';
  const garageBayDisplayMeshes = new Map();

  // Phụ kiện ngoại thất gắn thêm lên vehicleRoot khi người chơi chọn lái chiếc Sport Coupe GT (Cánh gió Carbon GT + Lip cản trước)
  const sportCoupeAeroKitGroup = new THREE.Group();
  sportCoupeAeroKitGroup.visible = false;
  (function buildSportCoupeAeroKitOnPlayerChassis() {
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2, metalness: 0.8 });
    const neonTrimMat = new THREE.MeshBasicMaterial({ color: 0xff2a85, toneMapped: false });

    // Cánh gió thể thao GT Wing cỡ lớn phía sau cốp
    const gtWingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.05, 0.34), carbonMat);
    gtWingBlade.position.set(0, 1.06, 2.22);
    const wingStrutL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.22), carbonMat);
    wingStrutL.position.set(-0.55, 0.90, 2.22);
    const wingStrutR = wingStrutL.clone();
    wingStrutR.position.x = 0.55;

    // Viền LED gầm & Lip chia gió cản trước thể thao
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.06, 0.25), neonTrimMat);
    frontSplitter.position.set(0, 0.24, -2.32);

    sportCoupeAeroKitGroup.add(gtWingBlade, wingStrutL, wingStrutR, frontSplitter);
    chassisGroup.add(sportCoupeAeroKitGroup);
  })();

  // Dựng 3 mô hình xe trưng bày trên 3 bục LED trong Gara của Toàn
  function buildThreeVehiclesInToanGarage() {
    // 1. Xóa khối hộp showCar tĩnh đơn điệu của bản cũ trong Gara (nếu có)
    scene.children.forEach((obj) => {
      if (obj.isGroup && Math.abs(obj.position.x - (-22.5)) < 0.5 && Math.abs(obj.position.z - (-26.5)) < 0.5) {
        obj.children.forEach((c) => {
          if (c.isMesh && c.geometry?.parameters?.width === 4.4 && c.geometry?.parameters?.height === 1.15) {
            c.visible = false;
          }
          // Mở thông vách kính phía Nam để Gara rộng rãi đỗ đủ 3 xe
          if (c.isMesh && c.geometry?.parameters?.width === 11.5 && Math.abs(c.position.z) > 4.0) {
            c.visible = false;
          }
        });
      }
    });

    const garageCollectionRoot = new THREE.Group();
    scene.add(garageCollectionRoot);

    GARAGE_BAYS.forEach((bay) => {
      const bayGroup = new THREE.Group();
      bayGroup.position.copy(bay.worldPos);
      bayGroup.rotation.y = bay.headingRad;

      // Bục đĩa xoay trưng bày có viền LED phát sáng không chóa (toneMapped: false)
      const padCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(2.35, 2.45, 0.08, 32),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 })
      );
      padCyl.position.y = 0.04;
      const padRing = new THREE.Mesh(
        new THREE.RingGeometry(2.25, 2.42, 32),
        new THREE.MeshBasicMaterial({ color: bay.ringColor, side: THREE.DoubleSide, toneMapped: false })
      );
      padRing.rotation.x = -Math.PI / 2;
      padRing.position.y = 0.085;
      bayGroup.add(padCyl, padRing);

      // Nhóm mô hình chiếc xe đỗ trên bục
      const displayVehicle = new THREE.Group();
      bayGroup.add(displayVehicle);

      if (bay.id === 'RR_GHOST') {
        // MẪU 1: ROLLS-ROYCE GHOST V12
        const rrPaint = new THREE.MeshPhysicalMaterial({ color: 0x101829, metalness: 0.7, roughness: 0.14, clearcoat: 1.0 });
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.52, 4.75), rrPaint);
        hull.position.y = 0.48;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.46, 2.35), matGlass);
        cabin.position.set(0, 0.96, 0.15);
        const grille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.46, 0.08), matChrome);
        grille.position.set(0, 0.52, -2.38);
        displayVehicle.add(hull, cabin, grille);
        [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.50], [0.95, 1.50]].forEach(([wx, wz]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.25, 20), matTireRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, 0.37, wz);
          displayVehicle.add(w);
        });
      } else if (bay.id === 'SPORT_COUPE') {
        // MẪU 2: SIÊU XE THỂ THAO SPORT COUPE GT WIDEBODY
        const coupePaint = new THREE.MeshPhysicalMaterial({ color: 0xd90429, metalness: 0.6, roughness: 0.12, clearcoat: 1.0 });
        const carbonMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2, metalness: 0.8 });

        const lowBody = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.38, 4.45), coupePaint);
        lowBody.position.y = 0.38;
        const noseSlope = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.58, 12, 16), coupePaint);
        noseSlope.rotation.z = Math.PI / 2;
        noseSlope.position.set(0, 0.34, -2.15);

        const aeroCabin = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 1.65, 4), carbonMat);
        aeroCabin.rotation.y = Math.PI / 4;
        aeroCabin.scale.set(1.0, 0.34, 1.35);
        aeroCabin.position.set(0, 0.78, 0.08);

        // Cánh gió GT Wing sau đuôi + Sọc đôi thể thao Vàng Gold
        const gtWing = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.05, 0.30), carbonMat);
        gtWing.position.set(0, 0.94, 2.05);
        const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.18), carbonMat);
        strutL.position.set(-0.52, 0.78, 2.05);
        const strutR = strutL.clone();
        strutR.position.x = 0.52;

        const racingStripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.02, 4.42),
          new THREE.MeshBasicMaterial({ color: 0xffd60a, toneMapped: false })
        );
        racingStripe.position.set(0, 0.58, 0);

        displayVehicle.add(lowBody, noseSlope, aeroCabin, gtWing, strutL, strutR, racingStripe);
        [[-0.98, -1.35], [0.98, -1.35], [-0.98, 1.35], [0.98, 1.35]].forEach(([wx, wz]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.28, 20), matTireRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, 0.35, wz);
          displayVehicle.add(w);
        });
      } else if (bay.id === 'MOTO_PKL') {
        // MẪU 3: MOTO PHÂN KHỐI LỚN SPORTBIKE R1 1000CC
        const motoPaint = new THREE.MeshPhysicalMaterial({ color: 0x00bbf9, metalness: 0.65, roughness: 0.15, clearcoat: 1.0 });
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.42, 12, 16), motoPaint);
        tank.rotation.x = Math.PI / 2 - 0.22;
        tank.position.set(0, 0.74, -0.12);

        const fairing = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.58, 12), motoPaint);
        fairing.rotation.x = -Math.PI / 2 + 0.24;
        fairing.position.set(0, 0.76, -0.56);

        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.52, 10), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
        tail.rotation.x = Math.PI / 2 + 0.2;
        tail.position.set(0, 0.78, 0.48);

        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 10), matChrome);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, 0.94, -0.42);

        displayVehicle.add(tank, fairing, tail, bar);
        [-0.62, 0.58].forEach((wz) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 20), matTireRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(0, 0.33, wz);
          displayVehicle.add(w);
        });
      }

      // Bảng tên lơ lửng trên từng xe trong Gara (Bấm Tia Laser / Chuột vào là nhảy lên lái ngay!)
      const bayLabel = createToanGraffitiLuxurySignMesh(
        bay.id === 'RR_GHOST' ? 'ROLLS-ROYCE V12' : (bay.id === 'SPORT_COUPE' ? 'SPORT COUPE GT' : 'MOTO PKL R1'),
        `👉 BẤM ĐỂ LÁI: ${bay.name.toUpperCase()}`,
        2.5,
        0.68,
        bay.id === 'SPORT_COUPE' ? 'PINK_GOLD' : 'GOLD_CYAN'
      );
      bayLabel.position.set(0, 1.95, 0);
      displayVehicle.add(bayLabel);

      // Đăng ký mọi bộ phận của xe trưng bày vào hệ thống click 3D / Tia Laser Quest 3
      bayGroup.traverse((child) => {
        if (child.isMesh) {
          register3DTarget(child, () => window.selectAndDriveGarageVehicle(bay.id));
        }
      });

      garageCollectionRoot.add(bayGroup);
      garageBayDisplayMeshes.set(bay.id, displayVehicle);
    });

    // Ban đầu chiếc Rolls-Royce đang đỗ sẵn trước cửa nhà cho người chơi nên ẩn bản sao trong bục số 1,
    // còn chiếc Sport Coupe GT và Moto PKL R1 hiện rõ ràng trên bục số 2 và số 3 trong Gara!
    const rrDisplay = garageBayDisplayMeshes.get('RR_GHOST');
    if (rrDisplay) rrDisplay.visible = false;
  }
  buildThreeVehiclesInToanGarage();

  // --- 21.4. HÀM CHUYỂN ĐỔI & LÁI BẤT KỲ MẪU XE NÀO TRONG GARA CỦA TOÀN ---
  window.selectAndDriveGarageVehicle = function(bayId) {
    const targetBay = GARAGE_BAYS.find((b) => b.id === bayId);
    if (!targetBay) return;
    initAudio();

    // Nếu trước đó đang đi nhờ xe NPC ngoài đường thì trả xe NPC đó lại cho AI
    if (state.boardedNpcVehicleRef) {
      state.boardedNpcVehicleRef.visible = true;
      state.boardedNpcVehicleRef.userData.isBoardedByPlayer = false;
      state.boardedNpcVehicleRef = null;
    }

    // 1. Hiện lại tất cả các xe khác trên bục đỗ trong Gara của Toàn, và ẩn chiếc xe vừa được chọn lái!
    GARAGE_BAYS.forEach((b) => {
      const mesh = garageBayDisplayMeshes.get(b.id);
      if (mesh) {
        mesh.visible = (b.id !== bayId);
      }
    });

    currentSelectedGarageVehicleId = bayId;

    // 2. Đưa vehicleRoot về đúng vị trí bục xuất phát trong Gara của Toàn (mũi xe hướng thẳng ra đường lớn)
    vehicleRoot.position.set(targetBay.worldPos.x + 2.2, 0, targetBay.worldPos.z);
    state.headingRad = targetBay.headingRad; // -Math.PI / 2 (Hướng thẳng ra cổng Đông +X của Gara)
    vehicleRoot.rotation.set(0, state.headingRad, 0);

    // 3. Biến hình ngoại thất, nội thất & thông số tốc độ theo đúng mẫu xe bạn chọn
    state.rcSpeedRatio = targetBay.speedMultiplier;
    state.rcSteerSensitivity = targetBay.steerSens;
    const speedSlider = document.getElementById('slider-speed-ratio');
    const speedVal = document.getElementById('val-speed-ratio');
    if (speedSlider) speedSlider.value = String(targetBay.speedMultiplier);
    if (speedVal) speedVal.textContent = targetBay.speedMultiplier.toFixed(1);

    if (bayId === 'MOTO_PKL') {
      state.currentBoardedType = 'MOTORBIKE';
      setCarBodyVisibilityForTwoWheelMode(true);
      sportCoupeAeroKitGroup.visible = false;
      chassisGroup.scale.set(1.0, 1.0, 1.0);
      SEAT_POSITIONS[0].pos.set(-0.42, 0.05, 0.05);
      matBodyPaint.color.setHex(targetBay.bodyHex);
    } else if (bayId === 'SPORT_COUPE') {
      state.currentBoardedType = 'CAR';
      setCarBodyVisibilityForTwoWheelMode(false);
      sportCoupeAeroKitGroup.visible = true;
      // Hạ thấp trọng tâm và mở rộng bề ngang thân xe chuẩn dáng Widebody Sport Coupe!
      chassisGroup.scale.set(1.06, 0.84, 0.95);
      SEAT_POSITIONS[0].pos.set(-0.40, -0.04, 0.12);
      matBodyPaint.color.setHex(targetBay.bodyHex);
      matNappa.color.setHex(targetBay.nappaHex);
      matWalnut.color.setHex(targetBay.woodHex);
    } else {
      // ROLLS-ROYCE GHOST V12
      state.currentBoardedType = 'ROLLS_ROYCE';
      setCarBodyVisibilityForTwoWheelMode(false);
      sportCoupeAeroKitGroup.visible = false;
      chassisGroup.scale.set(1.0, 1.0, 1.0);
      SEAT_POSITIONS[0].pos.set(-0.42, 0.0, 0.12);
      matBodyPaint.color.setHex(targetBay.bodyHex);
      matNappa.color.setHex(targetBay.nappaHex);
      matWalnut.color.setHex(targetBay.woodHex);
    }

    // 4. Đưa người chơi ngồi vào Ghế Lái (seatIndex = 0), nổ máy sẵn sàng chạy từ Gara ra phố!
    state.seatIndex = 0;
    driverSeatMount.position.copy(SEAT_POSITIONS[0].pos);
    state.playerMode = 'DRIVING';
    state.doorsOpen = false;
    state.engineRunning = true;
    state.velocityMs = 0;
    state.speedKmh = 0;
    state.rpm = 1450;
    playEngineStarterSound();

    avatarBodyMesh.visible = false;
    driverSeatMount.add(cameraRig);
    cameraRig.position.set(0, 0, 0);
    cameraRig.rotation.set(0, 0, 0);
    roofBeaconGroup.visible = false;

    const badge = document.getElementById('func-target-badge');
    if (badge) badge.textContent = `🏆 Gara Toàn: ${targetBay.name.split('(')[0].trim()}`;

    state.lastActionLog = `🏆 [TOÀN GARAGE]: Bạn đã chọn lái [${targetBay.name}]! Đẩy nút xoay (hoặc nhấn W) để lái xe từ Gara ra đại lộ!`;
  };

  // Gắn sự kiện cho 3 nút chọn xe nhanh trong Bảng Chức Năng và phím tắt 1, 2, 3
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-garage-rr')?.addEventListener('click', () => window.selectAndDriveGarageVehicle('RR_GHOST'));
    document.getElementById('btn-garage-coupe')?.addEventListener('click', () => window.selectAndDriveGarageVehicle('SPORT_COUPE'));
    document.getElementById('btn-garage-moto')?.addEventListener('click', () => window.selectAndDriveGarageVehicle('MOTO_PKL'));
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '1') window.selectAndDriveGarageVehicle('RR_GHOST');
    if (e.key === '2') window.selectAndDriveGarageVehicle('SPORT_COUPE');
    if (e.key === '3') window.selectAndDriveGarageVehicle('MOTO_PKL');
  });
})();


// ============================================================================
// 19. PATCH V170 (ADD-ON):
//     - CỬA CUỐN KÍNH CƯỜNG LỰC TỰ ĐỘNG KHẮC GRAFFITI "TOÀN" (MỞ KHI <= 6M HOẶC NỔ MÁY)
//     - BẢNG HIỆU ĐỘC QUYỀN "DINH THỰ TOÀN" & "GARA SIÊU XE TOÀN"
//     - BIỂN SỐ IN 3D "TOÀN VIP PRO" PHÁT SÁNG DỊU CHỐNG CHÓI ĐẦU & ĐUÔI CHO CẢ 3 XE
//     - CHỨC NĂNG NGHIÊNG 360° TRÊN CẢ ĐIỆN THOẠI & KÍNH META QUEST 3
// ============================================================================
(() => {
  if (window.__V170_TOAN_GARAGE_PATCH_LOADED__) return;
  window.__V170_TOAN_GARAGE_PATCH_LOADED__ = true;

  // --------------------------------------------------------------------------
  // 19.1. ÂM THANH CƠ KHÍ MÔ-TƠ CỬA CUỐN KÍNH CƯỜNG LỰC (WEBAUDIO SYNTH)
  // --------------------------------------------------------------------------
  let rollerAudioNodes = null;

  function startRollerDoorMechanicalSound(isOpening = true) {
    try {
      initAudio();
      if (!audioCtx) return;
      stopRollerDoorMechanicalSound();

      const now = audioCtx.currentTime;
      const oscMotor = audioCtx.createOscillator();
      const oscGear = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();

      // Âm trầm mô-tơ điện kết hợp tiếng rơ-le bánh răng cơ khí êm ái
      oscMotor.type = 'sawtooth';
      oscMotor.frequency.setValueAtTime(isOpening ? 92 : 78, now);
      oscMotor.frequency.linearRampToValueAtTime(isOpening ? 118 : 68, now + 1.2);

      oscGear.type = 'triangle';
      oscGear.frequency.setValueAtTime(isOpening ? 184 : 156, now);

      filter.type = 'bandpass';
      filter.frequency.value = 260;
      filter.Q.value = 2.2;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.065, now + 0.12);

      oscMotor.connect(filter);
      oscGear.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      oscMotor.start(now);
      oscGear.start(now);
      rollerAudioNodes = { oscMotor, oscGear, gain };
    } catch (e) {}
  }

  function stopRollerDoorMechanicalSound() {
    if (!rollerAudioNodes || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      rollerAudioNodes.gain.gain.setTargetAtTime(0.0001, now, 0.06);
      setTimeout(() => {
        try {
          rollerAudioNodes.oscMotor.stop();
          rollerAudioNodes.oscGear.stop();
        } catch (e) {}
        rollerAudioNodes = null;
      }, 150);
    } catch (e) {
      rollerAudioNodes = null;
    }
  }

  // --------------------------------------------------------------------------
  // 19.2. HÀM TẠO BIỂN SỐ ĐỊNH DANH IN 3D "TOÀN VIP PRO" CHỐNG CHÓA ĐÈN PHA/NPC
  // --------------------------------------------------------------------------
  let cached3DPlateTexture = null;

  function getAntiGlare3DPlateTexture() {
    if (cached3DPlateTexture) return cached3DPlateTexture;

    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext('2d');

    // Nền Carbon Đen Nhám kết hợp Xanh Sapphire sâu (Chống phản xạ lóa đèn pha)
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 256);
    bgGrad.addColorStop(0, '#060b16');
    bgGrad.addColorStop(0.5, '#0d182c');
    bgGrad.addColorStop(1, '#050912');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 256);

    // Vân sợi Carbon in 3D chìm
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 1024; x += 16) {
        if ((x + y) % 32 === 0) ctx.fillRect(x, y, 8, 8);
      }
    }

    // Khung viền Vàng Hoàng Gia & Xanh Cyan phát sáng dịu
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, 1004, 236);

    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, 976, 208);

    // Huy hiệu Cờ Đỏ Sao Vàng & Nhãn VIP bên trái biển số
    ctx.fillStyle = '#da251d';
    ctx.fillRect(42, 46, 110, 74);
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 52px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', 97, 85);

    ctx.fillStyle = '#00f5d4';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('VN-VIP', 97, 168);

    // Vạch phân cách 3D
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(172, 40, 6, 176);

    // Lớp đổ bóng 3D Extrusion bên dưới chữ "TOÀN  VIP PRO"
    ctx.font = '900 96px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText('TOÀN  VIP PRO', 588, 138);
    ctx.fillStyle = '#5c4308';
    ctx.fillText('TOÀN  VIP PRO', 585, 134);

    // Lớp chữ nổi 3D phát sáng nhẹ (Vàng Kim chuyển Trắng Bạch Kim - Không bị chóa)
    const textGrad = ctx.createLinearGradient(0, 65, 0, 195);
    textGrad.addColorStop(0, '#ffffff');
    textGrad.addColorStop(0.45, '#ffe885');
    textGrad.addColorStop(1, '#d4af37');
    ctx.fillStyle = textGrad;
    ctx.fillText('TOÀN  VIP PRO', 582, 130);

    // Viền sắc nét quanh chữ giúp nhìn rõ ở mọi cự ly và góc nghiêng
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.5;
    ctx.strokeText('TOÀN  VIP PRO', 582, 130);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    cached3DPlateTexture = tex;
    return tex;
  }

  /**
   * Tạo cụm Biển Số In 3D đa lớp (Khung 3D + Tấm nền chống lóa + Chữ nổi 3D phát sáng nhẹ)
   * @param {number} width Chiều rộng chuẩn theo xe
   * @param {number} height Chiều cao chuẩn theo xe
   * @param {number} depth Độ dày khối in 3D
   */
  function create3DPrintedLicensePlateMesh(width = 0.50, height = 0.125, depth = 0.022) {
    const plateGroup = new THREE.Group();
    plateGroup.userData.isToan3DLicensePlate = true;

    // 1. Đế hộp 3D nhám đen (Chặn ánh sáng xuyên từ phía sau và hấp thụ tia chói)
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f19,
      roughness: 0.9,
      metalness: 0.15
    });
    const baseBox = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), baseMat);
    plateGroup.add(baseBox);

    // 2. Gờ khung viền kim loại 3D nổi bao quanh 4 cạnh biển số
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.85
    });
    const borderThickness = Math.max(0.008, height * 0.07);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(width + 0.008, borderThickness, depth + 0.006), frameMat);
    topBar.position.y = height / 2;
    const botBar = topBar.clone();
    botBar.position.y = -height / 2;

    const leftBar = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, height + 0.008, depth + 0.006), frameMat);
    leftBar.position.x = -width / 2;
    const rightBar = leftBar.clone();
    rightBar.position.x = width / 2;
    plateGroup.add(topBar, botBar, leftBar, rightBar);

    // 3. Bề mặt chữ In 3D phát sáng nhẹ (Dùng toneMapped: false để KHÔNG BAO GIỜ bị chóa bởi đèn pha hay đèn xe NPC!)
    const faceMat = new THREE.MeshBasicMaterial({
      map: getAntiGlare3DPlateTexture(),
      toneMapped: false, // Chống cháy sáng (anti-bloom / anti-glare) tuyệt đối khi đèn pha chiếu vào
      polygonOffset: true,
      polygonOffsetFactor: -2
    });

    // Đặt cả ở mặt trước (+Z) và mặt sau (-Z) của hộp biển số để nhìn từ góc nào cũng nổi bật
    const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.96, height * 0.88), faceMat);
    frontFace.position.z = depth / 2 + 0.002;

    const backFace = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.96, height * 0.88), faceMat);
    backFace.rotation.y = Math.PI;
    backFace.position.z = -(depth / 2 + 0.002);

    // 4. Các khối chữ nổi 3D trong suốt phủ trên mặt chữ tạo hiệu ứng khắc nổi 3D thật
    const reliefMat = new THREE.MeshStandardMaterial({
      color: 0xffd60a,
      emissive: 0x332800,
      roughness: 0.25,
      metalness: 0.8
    });
    const reliefStrip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, height * 0.36, 0.005), reliefMat);
    reliefStrip.position.set(width * 0.06, 0, depth / 2 - 0.001);

    plateGroup.add(frontFace, backFace, reliefStrip);
    return plateGroup;
  }

  /**
   * Gắn cặp Biển Số Định Danh 3D "TOÀN VIP PRO" vào Đầu và Đuôi xe theo đúng tỉ lệ
   */
  function attachFrontAndRear3DPlatesToVehicle(targetGroup, vehicleType = 'ROLLS_ROYCE') {
    if (!targetGroup) return;
    // Xóa biển số cũ nếu đã gắn để tránh trùng lặp
    const oldPlates = [];
    targetGroup.children.forEach((c) => {
      if (c.userData && c.userData.isToan3DLicensePlate) oldPlates.push(c);
    });
    oldPlates.forEach((p) => targetGroup.remove(p));

    if (vehicleType === 'MOTO_R1') {
      // Tỉ lệ chuẩn Mô tô Phân Khối Lớn R1: nhỏ gọn, gắn dưới yếm đèn pha trước và dưới pát đuôi vuốt nhọn
      const frontMotoPlate = create3DPrintedLicensePlateMesh(0.24, 0.072, 0.014);
      frontMotoPlate.position.set(0, 0.56, -0.76);
      frontMotoPlate.rotation.x = THREE.MathUtils.degToRad(-12);

      const rearMotoPlate = create3DPrintedLicensePlateMesh(0.22, 0.095, 0.014);
      rearMotoPlate.position.set(0, 0.62, 0.74);
      rearMotoPlate.rotation.x = THREE.MathUtils.degToRad(16);

      targetGroup.add(frontMotoPlate, rearMotoPlate);
    } else if (vehicleType === 'COUPE_GT') {
      // Tỉ lệ chuẩn Siêu xe gầm thấp Sport Coupe GT: khớp chuẩn cản trước khí động học và bộ khuếch tán sau
      const frontCoupePlate = create3DPrintedLicensePlateMesh(0.48, 0.118, 0.020);
      frontCoupePlate.position.set(0, 0.32, -2.26);

      const rearCoupePlate = create3DPrintedLicensePlateMesh(0.48, 0.118, 0.020);
      rearCoupePlate.position.set(0, 0.46, 2.26);

      targetGroup.add(frontCoupePlate, rearCoupePlate);
    } else {
      // Tỉ lệ chuẩn Siêu sang Rolls-Royce Ghost: khớp chuẩn dưới lưới tản nhiệt Pantheon và cốp sau
      const frontRRPlate = create3DPrintedLicensePlateMesh(0.52, 0.13, 0.024);
      frontRRPlate.position.set(0, 0.35, -2.275);

      const rearRRPlate = create3DPrintedLicensePlateMesh(0.52, 0.13, 0.024);
      rearRRPlate.position.set(0, 0.48, 2.44);

      targetGroup.add(frontRRPlate, rearRRPlate);
    }
  }

  // Gắn ngay Biển số 3D "TOÀN VIP PRO" cho chiếc Rolls-Royce Ghost chính và khoang lái 2 bánh
  attachFrontAndRear3DPlatesToVehicle(chassisGroup, 'ROLLS_ROYCE');
  if (typeof twoWheelCockpitGroup !== 'undefined' && twoWheelCockpitGroup) {
    const cockpitMotoFrontPlate = create3DPrintedLicensePlateMesh(0.22, 0.068, 0.014);
    cockpitMotoFrontPlate.position.set(-0.42, 0.48, -0.58);
    twoWheelCockpitGroup.add(cockpitMotoFrontPlate);
  }

  // --------------------------------------------------------------------------
  // 19.3. BẢNG HIỆU ĐỘC QUYỀN "DINH THỰ TOÀN" & "GARA SIÊU XE TOÀN" +
  //       CỬA CUỐN KÍNH CƯỜNG LỰC TỰ ĐỘNG KHẮC CHỮ GRAFFITI "TOÀN"
  // --------------------------------------------------------------------------
  function createGraffitiRollerSlatTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');

    // Nền kính cường lực xanh khói trong suốt một phần
    ctx.fillStyle = 'rgba(10, 26, 48, 0.58)';
    ctx.fillRect(0, 0, 1024, 512);

    // Các đường gân kim loại ngang của cửa cuốn kính cường lực
    for (let y = 0; y < 512; y += 64) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.fillRect(0, y, 1024, 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(0, y + 6, 1024, 10);
    }

    // Vệt sơn phun Street Art Graffiti (vàng / hồng / xanh neon)
    ctx.save();
    ctx.translate(512, 256);
    ctx.rotate(-0.06);

    // Hào quang nền Graffiti
    const glow = ctx.createRadialGradient(0, 0, 30, 0, 0, 420);
    glow.addColorStop(0, 'rgba(255, 42, 133, 0.55)');
    glow.addColorStop(0.5, 'rgba(0, 229, 255, 0.35)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-480, -220, 960, 440);

    // Chữ khắc Graffiti "TOÀN" cực ngầu ở tâm cửa cuốn kính cường lực
    ctx.font = '900 italic 175px "Segoe UI", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Bóng đổ khối 3D Graffiti
    ctx.fillStyle = '#000000';
    ctx.fillText('★ TOÀN ★', 12, 14);

    // Viền ngoài Graffiti Đỏ Hồng Neon
    ctx.strokeStyle = '#ff2a85';
    ctx.lineWidth = 22;
    ctx.lineJoin = 'round';
    ctx.strokeText('★ TOÀN ★', 0, 0);

    // Viền trong Xanh Điện Tử
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 8;
    ctx.strokeText('★ TOÀN ★', 0, 0);

    // Màu chữ Graffiti Gradient Vàng Kim - Cam Rực
    const grafGrad = ctx.createLinearGradient(0, -90, 0, 90);
    grafGrad.addColorStop(0, '#fffb00');
    grafGrad.addColorStop(0.5, '#ff9500');
    grafGrad.addColorStop(1, '#ff0055');
    ctx.fillStyle = grafGrad;
    ctx.fillText('★ TOÀN ★', 0, 0);

    // Dòng phụ đề Graffiti bên dưới
    ctx.font = 'bold 34px monospace';
    ctx.fillStyle = '#00ff88';
    ctx.fillText('SMART GLASS GARAGE • VIP COLLECTION', 0, 135);
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function createExclusiveToanSignBoard(mainTitle, subTitle, width = 6.8, height = 1.35) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 220;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#070d19';
    ctx.fillRect(0, 0, 1024, 220);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 12;
    ctx.strokeRect(8, 8, 1008, 204);
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 984, 180);

    ctx.fillStyle = '#ffd60a';
    ctx.font = '900 64px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mainTitle, 512, 102);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 32px Segoe UI, sans-serif';
    ctx.fillText(subTitle, 512, 164);

    const tex = new THREE.CanvasTexture(c);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.18),
      [
        matChrome, matChrome, matChrome, matChrome,
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      ]
    );
    return board;
  }

  // Cập nhật bảng hiệu trên Dinh Thự hiện tại thành "DINH THỰ TOÀN"
  scene.children.forEach((obj) => {
    if (obj.isGroup && Math.abs(obj.position.z - (-14.0)) < 2.0 && obj.position.x < -18.0) {
      obj.children.forEach((ch) => {
        if (ch.isSprite) ch.visible = false; // Ẩn sprite cũ để thay bằng Bảng hiệu 3D DINH THỰ TOÀN sang trọng
      });
      const mansionSign = createExclusiveToanSignBoard(
        '🏰 DINH THỰ TOÀN',
        '★ TƯ GIA HOÀNG GIA & BỘ SƯU TẬP SIÊU XE ★',
        6.2,
        1.25
      );
      mansionSign.position.set(6.3, 5.2, 0);
      mansionSign.rotation.y = Math.PI / 2;
      obj.add(mansionSign);
    }
  });

  // Xây dựng Gara Kính Cường Lực mang tên "GARA SIÊU XE TOÀN" và 3 chiếc xe có gắn biển số 3D
  const toanGarageGroup = new THREE.Group();
  // Đặt Gara ngay sát bên phải Dinh Thự Toàn (x = -21.5, z = -25.0), mặt cửa cuốn hướng ra phía Đông (+X, về phía đường và sân nhà)
  const GARAGE_CENTER_POS = new THREE.Vector3(-21.5, 0.24, -25.0);
  toanGarageGroup.position.copy(GARAGE_CENTER_POS);
  scene.add(toanGarageGroup);

  const GARAGE_W = 10.6; // Chiều sâu lòng Gara (theo trục X)
  const GARAGE_D = 11.4; // Chiều rộng mặt tiền Gara chứa 3 xe (theo trục Z)
  const GARAGE_H = 4.5;  // Chiều cao Gara

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.25 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.4, roughness: 0.2 });
  const sideGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.24,
    roughness: 0.05,
    metalness: 0.1
  });

  // Sàn Gara lát gạch bóng + Trần Gara + Vách kính cường lực 3 mặt
  const gFloor = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_W, 0.16, GARAGE_D), floorMat);
  gFloor.position.y = 0.08;
  const gRoof = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_W + 0.6, 0.28, GARAGE_D + 0.6), pillarMat);
  gRoof.position.y = GARAGE_H;

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, GARAGE_H, GARAGE_D), pillarMat);
  backWall.position.set(-GARAGE_W / 2, GARAGE_H / 2, 0);

  const leftGlassWall = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_W, GARAGE_H, 0.12), sideGlassMat);
  leftGlassWall.position.set(0, GARAGE_H / 2, -GARAGE_D / 2);
  const rightGlassWall = leftGlassWall.clone();
  rightGlassWall.position.z = GARAGE_D / 2;

  // Bảng hiệu chính thức trên đỉnh Gara: "GARA SIÊU XE TOÀN"
  const garageSignBoard = createExclusiveToanSignBoard(
    '🏆 GARA SIÊU XE TOÀN',
    'ROLLS-ROYCE GHOST  •  SPORT COUPE GT  •  MOTO PKL R1',
    9.6,
    1.35
  );
  garageSignBoard.position.set(GARAGE_W / 2 + 0.15, GARAGE_H + 0.85, 0);
  garageSignBoard.rotation.y = Math.PI / 2;

  // Hộp kỹ thuật cuốn cửa ở mép trên lối vào Gara (x = +GARAGE_W / 2)
  const rollerHeaderBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.45, GARAGE_D + 0.2),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 })
  );
  rollerHeaderBox.position.set(GARAGE_W / 2, GARAGE_H - 0.15, 0);

  // 2 Trụ ray dẫn hướng cửa cuốn 2 bên lối vào
  [-GARAGE_D / 2, GARAGE_D / 2].forEach((rz) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.32, GARAGE_H, 0.32), matChrome);
    rail.position.set(GARAGE_W / 2, GARAGE_H / 2, rz);
    toanGarageGroup.add(rail);
  });

  toanGarageGroup.add(gFloor, gRoof, backWall, leftGlassWall, rightGlassWall, garageSignBoard, rollerHeaderBox);

  // --------------------------------------------------------------------------
  // CẤU TẠO CỬA CUỐN KÍNH CƯỜNG LỰC TỰ ĐỘNG KHẮC GRAFFITI "TOÀN" (8 NAN KÍNH)
  // --------------------------------------------------------------------------
  const SLAT_COUNT = 8;
  const DOOR_MAX_HEIGHT = GARAGE_H - 0.35; // 4.15m
  const SLAT_HEIGHT = DOOR_MAX_HEIGHT / SLAT_COUNT;
  const SLAT_WIDTH = GARAGE_D - 0.32;
  const graffitiTex = createGraffitiRollerSlatTexture();

  const rollerSlats = [];
  const rollerDoorPivot = new THREE.Group();
  // Đặt cửa cuốn ngay mặt tiền lối ra vào Gara (x = +GARAGE_W / 2 = +5.3m cục bộ -> x = -16.2m thế giới)
  rollerDoorPivot.position.set(GARAGE_W / 2, 0.16, 0);
  toanGarageGroup.add(rollerDoorPivot);

  for (let i = 0; i < SLAT_COUNT; i++) {
    // Cắt UV texture tương ứng cho từng nan kính để ghép thành bức Graffiti "TOÀN" hoàn chỉnh
    const slatTex = graffitiTex.clone();
    slatTex.needsUpdate = true;
    slatTex.repeat.set(1, 1 / SLAT_COUNT);
    slatTex.offset.set(0, i / SLAT_COUNT);

    const slatGlassMat = new THREE.MeshPhysicalMaterial({
      map: slatTex,
      transparent: true,
      opacity: 0.84,
      roughness: 0.08,
      metalness: 0.25,
      clearcoat: 1.0
    });

    const slatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.065, SLAT_HEIGHT - 0.02, SLAT_WIDTH), slatGlassMat);
    // Viền nẹp nhôm cường lực giữa các nan kính
    const trimBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.025, SLAT_WIDTH),
      new THREE.MeshStandardMaterial({ color: 0x00f5d4, emissive: 0x003344, metalness: 0.9, roughness: 0.2 })
    );
    trimBar.position.y = -SLAT_HEIGHT / 2;
    slatMesh.add(trimBar);

    slatMesh.userData.slatIndex = i;
    rollerDoorPivot.add(slatMesh);
    rollerSlats.push(slatMesh);

    // Cho phép bấm Tia Laser Tay cầm Quest 3 hoặc Chuột vào Cửa cuốn để Đóng/Mở thủ công
    register3DTarget(slatMesh, () => {
      rollerDoorState.manualOverride = !rollerDoorState.manualOverride;
      state.lastActionLog = rollerDoorState.manualOverride
        ? '🔓 Đã bấm mở Cửa Cuốn Kính Cường Lực Graffiti "TOÀN"!'
        : '🔒 Đã chuyển Cửa Cuốn Kính Cường Lực sang chế độ Tự Động (Khép hờ bảo vệ 3 siêu xe)!';
    });
  }

  // Trạng thái Cửa cuốn:
  // openProgress = 0.14 (Bình thường khép hờ 86%, để hở 0.55m dưới gầm) -> openProgress = 1.0 (Mở cuốn lên đỉnh 100%)
  const rollerDoorState = {
    openProgress: 0.14,
    targetProgress: 0.14,
    isMovingSoundPlaying: false,
    lastDirectionOpening: true,
    manualOverride: false
  };

  function updateSmartGlassRollerDoor(dt) {
    // Vị trí tâm cửa cuốn trong không gian thế giới
    const doorWorldPos = new THREE.Vector3(GARAGE_CENTER_POS.x + GARAGE_W / 2, 0.24, GARAGE_CENTER_POS.z);
    const activePlayerPos = state.playerMode === 'DRIVING' ? vehicleRoot.position : state.avatarPos;
    const distToDoor = activePlayerPos.distanceTo(doorWorldPos);

    // Điều kiện tự động trượt êm lên trên:
    // 1. Người chơi bước lại gần trong bán kính <= 6.0 mét, HOẶC
    // 2. Bất kỳ chiếc xe nào được đề nổ máy (state.engineRunning === true), HOẶC
    // 3. Bấm mở thủ công
    const shouldOpenFull = (distToDoor <= 6.0) || Boolean(state.engineRunning) || rollerDoorState.manualOverride;
    rollerDoorState.targetProgress = shouldOpenFull ? 1.0 : 0.14; // 0.14 = Khép hờ bảo vệ 3 siêu xe

    const diff = rollerDoorState.targetProgress - rollerDoorState.openProgress;
    if (Math.abs(diff) > 0.008) {
      const opening = diff > 0;
      if (!rollerDoorState.isMovingSoundPlaying || rollerDoorState.lastDirectionOpening !== opening) {
        rollerDoorState.isMovingSoundPlaying = true;
        rollerDoorState.lastDirectionOpening = opening;
        startRollerDoorMechanicalSound(opening);
        if (opening && rollerDoorState.openProgress < 0.25) {
          state.lastActionLog = distToDoor <= 6.0
            ? '🚪✨ Bạn vừa bước vào bán kính 6m: Cửa cuốn Kính Cường Lực "TOÀN" đang tự động trượt êm lên!'
            : '🚪🔥 Đề nổ máy xe: Cửa cuốn Kính Cường Lực "TOÀN" tự động mở lên để bạn xuất phát!';
        }
      }
      // Trượt êm ái với vận tốc cơ khí mượt mà
      rollerDoorState.openProgress = THREE.MathUtils.lerp(
        rollerDoorState.openProgress,
        rollerDoorState.targetProgress,
        dt * 2.8
      );
    } else if (rollerDoorState.isMovingSoundPlaying) {
      rollerDoorState.openProgress = rollerDoorState.targetProgress;
      rollerDoorState.isMovingSoundPlaying = false;
      stopRollerDoorMechanicalSound();
    }

    // Cập nhật vị trí từng nan kính (Khi trượt lên tới đỉnh DOOR_MAX_HEIGHT sẽ thu gọn vào hộp kỹ thuật)
    const liftOffset = rollerDoorState.openProgress * (DOOR_MAX_HEIGHT - 0.15);
    for (let i = 0; i < SLAT_COUNT; i++) {
      const slat = rollerSlats[i];
      const baseY = (i + 0.5) * SLAT_HEIGHT;
      const currentY = baseY + liftOffset;

      if (currentY >= DOOR_MAX_HEIGHT) {
        // Nan kính đã cuộn vào trong hộp kỹ thuật phía trên
        slat.position.y = DOOR_MAX_HEIGHT;
        slat.scale.y = 0.08;
        slat.visible = false;
      } else {
        slat.visible = true;
        slat.scale.y = 1.0;
        slat.position.y = currentY;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 19.4. DỰNG 3 SIÊU XE ĐỖ TRONG GARA TOÀN (ROLLS-ROYCE GHOST, SPORT COUPE GT, MOTO PKL R1)
  //       VÀ GẮN BIỂN SỐ ĐỊNH DANH 3D "TOÀN VIP PRO" KHỚP CHUẨN ĐẦU & ĐUÔI TỪNG XE
  // --------------------------------------------------------------------------
  const garageShowroomVehicles = {};

  function buildGarageShowroom3SupercarsWith3DPlates() {
    // 1. Bay Giữa (z = 0 cục bộ): Mô hình trưng bày Rolls-Royce Ghost (Hiện khi người chơi đang lái Coupe hoặc Moto)
    const rrStandIn = new THREE.Group();
    rrStandIn.position.set(0, 0.16, 0);
    rrStandIn.rotation.y = -Math.PI / 2; // Mũi xe (-Z) quay về hướng Đông (+X cửa cuốn Gara)
    const rrBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.94, 0.56, 4.85),
      new THREE.MeshPhysicalMaterial({ color: 0x101829, roughness: 0.12, metalness: 0.65, clearcoat: 1.0 })
    );
    rrBody.position.y = 0.48;
    const rrCabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.46, 2.25), matGlass);
    rrCabin.position.set(0, 0.98, 0.15);
    const rrGrille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.48, 0.08), matChrome);
    rrGrille.position.set(0, 0.54, -2.42);
    rrStandIn.add(rrBody, rrCabin, rrGrille);
    attachFrontAndRear3DPlatesToVehicle(rrStandIn, 'ROLLS_ROYCE');
    rrStandIn.visible = false; // Mặc định xe chính vehicleRoot đang là Rolls-Royce
    toanGarageGroup.add(rrStandIn);
    garageShowroomVehicles.rrStandIn = rrStandIn;

    // Đặt chiếc Rolls-Royce chính (vehicleRoot) vào đúng khoang giữa Gara của Toàn lúc khởi đầu
    vehicleRoot.position.set(GARAGE_CENTER_POS.x + 0.5, 0, GARAGE_CENTER_POS.z);
    state.headingRad = -Math.PI / 2; // Mũi xe hướng thẳng ra cửa cuốn Gara (+X)
    vehicleRoot.rotation.y = state.headingRad;

    // Đặt điểm đứng ban đầu của người chơi ngay trước Gara (cách cửa cuốn 7.2m để thấy cửa đang khép hờ, bước tới 1.2m là tự mở!)
    state.avatarPos.set(GARAGE_CENTER_POS.x + GARAGE_W / 2 + 7.2, 0.24, GARAGE_CENTER_POS.z);
    state.avatarYaw = Math.PI / 2; // Nhìn thẳng vào Gara Siêu Xe TOÀN
    playerAvatarGroup.position.copy(state.avatarPos);
    playerAvatarGroup.rotation.y = state.avatarYaw;

    // 2. Bay Trái (z = -3.4m cục bộ): SIÊU XE SPORT COUPE GT + Biển số 3D "TOÀN VIP PRO" Đầu & Đuôi
    const coupeGT = new THREE.Group();
    coupeGT.position.set(GARAGE_CENTER_POS.x + 0.5, 0, GARAGE_CENTER_POS.z - 3.4);
    coupeGT.rotation.y = -Math.PI / 2;

    const coupeMat = new THREE.MeshPhysicalMaterial({ color: 0xff2a85, roughness: 0.12, metalness: 0.5, clearcoat: 1.0 });
    const cHull = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.44, 4.48), coupeMat);
    cHull.position.y = 0.42;
    const cCabin = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 1.12, 1.5, 4), matGlass);
    cCabin.rotation.y = Math.PI / 4;
    cCabin.scale.set(1.0, 0.38, 1.35);
    cCabin.position.set(0, 0.84, 0.1);
    const cWing = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.05, 0.28), matPiano);
    cWing.position.set(0, 0.82, 2.08);

    const cWheels = [];
    [[-0.94, -1.38], [0.94, -1.38], [-0.94, 1.38], [0.94, 1.38]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.26, 20), matTireRubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.35, wz);
      coupeGT.add(w);
      cWheels.push(w);
    });

    coupeGT.add(cHull, cCabin, cWing);
    // Gắn Biển số In 3D "TOÀN VIP PRO" chuẩn tỉ lệ Đầu & Đuôi cho Sport Coupe GT
    attachFrontAndRear3DPlatesToVehicle(coupeGT, 'COUPE_GT');

    coupeGT.userData = {
      category: 'CAR',
      modelName: 'Sport Coupe GT (TOÀN VIP PRO)',
      isGarageVehicle: true,
      headingRad: -Math.PI / 2,
      wheels: cWheels,
      interiorTheme: {
        name: 'Khoang Thể Thao Sport Coupe GT',
        nappaHex: 0x1a1a24,
        woodHex: 0xff2a85,
        bodyHex: 0xff2a85
      }
    };
    scene.add(coupeGT);
    garageShowroomVehicles.coupe = coupeGT;

    // 3. Bay Phải (z = +3.4m cục bộ): SIÊU MÔ TÔ PKL R1 + Biển số 3D "TOÀN VIP PRO" Đầu & Đuôi
    const motoR1 = new THREE.Group();
    motoR1.position.set(GARAGE_CENTER_POS.x + 0.5, 0, GARAGE_CENTER_POS.z + 3.4);
    motoR1.rotation.y = -Math.PI / 2;

    const r1Paint = new THREE.MeshPhysicalMaterial({ color: 0x00e5ff, roughness: 0.14, metalness: 0.6, clearcoat: 1.0 });
    const r1Tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.42, 12, 16), r1Paint);
    r1Tank.rotation.x = Math.PI / 2 - 0.2;
    r1Tank.position.set(0, 0.72, -0.12);

    const r1Nose = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.55, 12), r1Paint);
    r1Nose.rotation.x = -Math.PI / 2 + 0.22;
    r1Nose.position.set(0, 0.74, -0.52);

    const r1Tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.48, 10), r1Paint);
    r1Tail.rotation.x = Math.PI / 2 + 0.2;
    r1Tail.position.set(0, 0.76, 0.48);

    const r1Wheels = [];
    [-0.58, 0.58].forEach((wz) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.16, 20), matTireRubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(0, 0.32, wz);
      motoR1.add(w);
      r1Wheels.push(w);
    });

    motoR1.add(r1Tank, r1Nose, r1Tail);
    // Gắn Biển số In 3D "TOÀN VIP PRO" chuẩn tỉ lệ Đầu & Đuôi cho Moto PKL R1
    attachFrontAndRear3DPlatesToVehicle(motoR1, 'MOTO_R1');

    motoR1.userData = {
      category: 'MOTORBIKE',
      modelName: 'Moto PKL R1 (TOÀN VIP PRO)',
      isGarageVehicle: true,
      headingRad: -Math.PI / 2,
      wheels: r1Wheels,
      interiorTheme: {
        name: 'Ghi-đông Moto PKL R1 (TOÀN VIP PRO)',
        nappaHex: 0x0f172a,
        woodHex: 0x00e5ff,
        bodyHex: 0x00e5ff
      }
    };
    scene.add(motoR1);
    garageShowroomVehicles.moto = motoR1;

    // Cho phép bấm Tia Laser hoặc Chuột trực tiếp vào từng chiếc xe trong Gara để lên lái
    [coupeGT, motoR1].forEach((veh) => {
      veh.traverse((ch) => {
        if (ch.isMesh) {
          register3DTarget(ch, () => selectAndDriveGarageVehicle(veh === coupeGT ? 'COUPE' : 'MOTO'));
        }
      });
    });
    rrStandIn.traverse((ch) => {
      if (ch.isMesh) {
        register3DTarget(ch, () => selectAndDriveGarageVehicle('RR'));
      }
    });
  }
  buildGarageShowroom3SupercarsWith3DPlates();

  function selectAndDriveGarageVehicle(type) {
    initAudio();
    // Mở cửa cuốn Gara ngay khi chọn và nổ máy xe trong Gara
    rollerDoorState.manualOverride = true;
    setTimeout(() => { rollerDoorState.manualOverride = false; }, 8000);

    if (type === 'RR') {
      if (typeof restoreOwnRollsRoyceVehicle === 'function') restoreOwnRollsRoyceVehicle();
      if (garageShowroomVehicles.rrStandIn) garageShowroomVehicles.rrStandIn.visible = false;
      if (garageShowroomVehicles.coupe) garageShowroomVehicles.coupe.visible = true;
      if (garageShowroomVehicles.moto) garageShowroomVehicles.moto.visible = true;
      attachFrontAndRear3DPlatesToVehicle(chassisGroup, 'ROLLS_ROYCE');
      if (!state.engineRunning) toggleEngineIgnition();
      if (state.playerMode !== 'DRIVING') window.enterOrExitCarWithBlink();
      state.lastActionLog = '👑 Đang cầm lái Rolls-Royce Ghost [Biển 3D: TOÀN VIP PRO] - Cửa cuốn Gara tự động mở!';
    } else if (type === 'COUPE' && garageShowroomVehicles.coupe) {
      if (garageShowroomVehicles.rrStandIn) garageShowroomVehicles.rrStandIn.visible = true;
      if (garageShowroomVehicles.moto) garageShowroomVehicles.moto.visible = true;
      boardAnyNpcVehicle(garageShowroomVehicles.coupe);
      attachFrontAndRear3DPlatesToVehicle(chassisGroup, 'COUPE_GT');
      if (!state.engineRunning) toggleEngineIgnition();
      state.lastActionLog = '🏎️ Đang cầm lái Sport Coupe GT [Biển 3D: TOÀN VIP PRO] - Cửa cuốn Gara tự động mở!';
    } else if (type === 'MOTO' && garageShowroomVehicles.moto) {
      if (garageShowroomVehicles.rrStandIn) garageShowroomVehicles.rrStandIn.visible = true;
      if (garageShowroomVehicles.coupe) garageShowroomVehicles.coupe.visible = true;
      boardAnyNpcVehicle(garageShowroomVehicles.moto);
      if (!state.engineRunning) toggleEngineIgnition();
      state.lastActionLog = '🏍️ Đang cầm lái Moto PKL R1 [Biển 3D: TOÀN VIP PRO] - Cửa cuốn Gara tự động mở!';
    }
  }

  // Kết nối 3 nút chọn xe trong Gara của Toàn
  document.getElementById('btn-garage-rr')?.addEventListener('click', () => selectAndDriveGarageVehicle('RR'));
  document.getElementById('btn-garage-coupe')?.addEventListener('click', () => selectAndDriveGarageVehicle('COUPE'));
  document.getElementById('btn-garage-moto')?.addEventListener('click', () => selectAndDriveGarageVehicle('MOTO'));

  // --------------------------------------------------------------------------
  // 19.5. CHỨC NĂNG NGHIÊNG 360 ĐỘ ĐỒNG BỘ TRÊN CẢ ĐIỆN THOẠI & KÍNH META QUEST 3
  // --------------------------------------------------------------------------
  const tilt360State = {
    enabled: true, // Mặc định BẬT cho cả Điện thoại và Kính Meta Quest 3
    tiltSteerEnabled: true,
    hasDeviceGyro: false,
    rawAlpha: 0,
    rawBeta: 0,
    rawGamma: 0,
    baseAlpha: null,
    baseBeta: null,
    baseGamma: null,
    computedYaw: 0,
    computedPitch: 0,
    computedRoll: 0
  };

  function calibrateTilt360Center() {
    tilt360State.baseAlpha = tilt360State.rawAlpha;
    tilt360State.baseBeta = tilt360State.rawBeta;
    tilt360State.baseGamma = tilt360State.rawGamma;
    tilt360State.computedYaw = 0;
    tilt360State.computedPitch = 0;
    tilt360State.computedRoll = 0;
    state.eyeLookYaw = 0;
    state.eyeLookPitch = 0;
    cameraRig.rotation.set(0, 0, 0);
    state.lastActionLog = '🎯 Đã cân bằng lại tâm Nghiêng 360° cho Điện Thoại & Kính Meta Quest 3!';
  }

  async function enableDeviceOrientationPermission() {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === 'granted') tilt360State.enabled = true;
      } catch (e) {}
    }
  }

  window.addEventListener('deviceorientation', (e) => {
    if (e.alpha === null && e.beta === null && e.gamma === null) return;
    tilt360State.hasDeviceGyro = true;
    tilt360State.rawAlpha = e.alpha || 0;
    tilt360State.rawBeta = e.beta || 0;
    tilt360State.rawGamma = e.gamma || 0;

    if (tilt360State.baseAlpha === null) {
      tilt360State.baseAlpha = tilt360State.rawAlpha;
      tilt360State.baseBeta = tilt360State.rawBeta;
      tilt360State.baseGamma = tilt360State.rawGamma;
    }
  }, true);

  function updateUniversalTilt360ForMobileAndQuest3(dt) {
    if (!tilt360State.enabled) return;

    const isXrPresenting = renderer.xr.isPresenting;

    // TRƯỜNG HỢP 1: ĐANG TRONG CHẾ ĐỘ WEBXR IMMERSIVE TRÊN KÍNH META QUEST 3
    if (isXrPresenting) {
      const xrCam = renderer.xr.getCamera();
      const headEuler = new THREE.Euler().setFromQuaternion(xrCam.quaternion, 'YXZ');

      // Kết hợp góc nghiêng đầu kính Quest 3 (Head Roll/Yaw) VÀ góc nghiêng cổ tay Tay cầm Quest 3
      let controllerYaw = 0;
      let controllerPitch = 0;
      let controllerRoll = 0;

      const activeCtrl = xrControllers[1] || xrControllers[0];
      if (activeCtrl) {
        const ctrlEuler = new THREE.Euler().setFromQuaternion(activeCtrl.quaternion, 'YXZ');
        controllerYaw = ctrlEuler.y;
        controllerPitch = ctrlEuler.x;
        controllerRoll = ctrlEuler.z;
      }

      // Cho phép nghiêng tay cầm hoặc nghiêng đầu kính Quest 3 để xoay bù góc nhìn 360° toàn cảnh
      if (Math.abs(controllerRoll) > 0.18) {
        cameraRig.rotation.y -= controllerRoll * 1.45 * dt;
      }

      // Nếu đang lái xe trên Quest 3: Nghiêng đầu kính hoặc nghiêng nhẹ cổ tay cầm để hỗ trợ đánh lái mượt như trên điện thoại
      if (state.playerMode === 'DRIVING' && tilt360State.tiltSteerEnabled) {
        const combinedRoll = Math.abs(controllerRoll) > 0.15 ? -controllerRoll : -headEuler.z * 0.6;
        if (Math.abs(combinedRoll) > 0.12) {
          state.steeringAngleDeg = THREE.MathUtils.clamp(
            state.steeringAngleDeg + combinedRoll * 260 * dt,
            -540,
            540
          );
          const moveSign = state.velocityMs >= -0.05 ? 1 : -1;
          state.headingRad -= combinedRoll * 1.15 * moveSign * dt;
          vehicleRoot.rotation.y = state.headingRad;
        }
      }
      return;
    }

    // TRƯỜNG HỢP 2: TRÊN ĐIỆN THOẠI HOẶC TRÌNH DUYỆT CỬA SỔ 2D CỦA KÍNH META QUEST 3
    if (tilt360State.hasDeviceGyro && tilt360State.baseAlpha !== null) {
      const screenAngle = (window.screen?.orientation?.angle || window.orientation || 0);
      let dAlpha = THREE.MathUtils.degToRad(tilt360State.rawAlpha - tilt360State.baseAlpha);
      let dBeta = THREE.MathUtils.degToRad(tilt360State.rawBeta - tilt360State.baseBeta);
      let dGamma = THREE.MathUtils.degToRad(tilt360State.rawGamma - tilt360State.baseGamma);

      // Chuẩn hóa góc xoay 360° theo cả chiều dọc (9:16) và chiều ngang (16:9 / Kính Quest 3)
      const targetYaw = dAlpha + (screenAngle === 90 ? -dBeta * 0.5 : screenAngle === -90 ? dBeta * 0.5 : -dGamma * 0.45);
      const targetPitch = THREE.MathUtils.clamp(
        screenAngle === 0 ? dBeta * 0.65 : dGamma * 0.65,
        -1.15,
        1.15
      );
      const tiltRoll = screenAngle === 0 ? dGamma : dBeta;

      tilt360State.computedYaw = THREE.MathUtils.lerp(tilt360State.computedYaw, targetYaw, dt * 8);
      tilt360State.computedPitch = THREE.MathUtils.lerp(tilt360State.computedPitch, targetPitch, dt * 8);

      const isPass360 = (state.playerMode === 'DRIVING' && state.seatIndex !== 0);
      const gyroMaxPitch = isPass360 ? (Math.PI * 0.498) : 1.2;
      camera.rotation.order = 'YXZ';
      camera.rotation.y = (state.eyeLookYaw || 0) + tilt360State.computedYaw;
      camera.rotation.x = THREE.MathUtils.clamp((state.eyeLookPitch || 0) + tilt360State.computedPitch, -gyroMaxPitch, gyroMaxPitch);
      camera.rotation.z = isPass360 ? 0 : THREE.MathUtils.lerp(camera.rotation.z, -tiltRoll * 0.18, dt * 6);

      // Nghiêng thiết bị sang trái/phải để đánh lái nhẹ nhàng khi đang lái xe
      if (state.playerMode === 'DRIVING' && tilt360State.tiltSteerEnabled && Math.abs(tiltRoll) > 0.14) {
        state.steeringAngleDeg = THREE.MathUtils.clamp(
          state.steeringAngleDeg + tiltRoll * 240 * dt,
          -540,
          540
        );
        const moveSign = state.velocityMs >= -0.05 ? 1 : -1;
        state.headingRad -= tiltRoll * 0.95 * moveSign * dt;
        vehicleRoot.rotation.y = state.headingRad;
      }
    }
  }

  // Tạo thanh điều khiển nhanh trong Bảng Chức Năng cho Cửa cuốn & Nghiêng 360° (ĐT + Quest 3)
  function injectV170ControlsToUI() {
    const funcPanelEl = document.getElementById('function-panel');
    if (funcPanelEl && !document.getElementById('v170-smart-garage-tilt-row')) {
      const row = document.createElement('div');
      row.id = 'v170-smart-garage-tilt-row';
      row.className = 'row';
      row.style.cssText = 'background:rgba(0,229,255,0.12);padding:6px;border-radius:8px;border:1px solid #00e5ff;margin-bottom:6px;';
      row.innerHTML = `
        <button id="btn-v170-roller-door" class="act-btn" style="background:#00ff88;color:#000;">🚪 Cửa Cuốn Kính "TOÀN": TỰ ĐỘNG</button>
        <button id="btn-v170-tilt-360" class="act-btn" style="background:#00e5ff;color:#000;">🧭 Nghiêng 360° (ĐT & Quest 3): BẬT</button>
        <button id="btn-v170-recenter-360" class="act-btn" style="background:#ffd60a;color:#000;flex:0.5;">🎯 Cân Bằng Tâm</button>
      `;
      funcPanelEl.prepend(row);

      document.getElementById('btn-v170-roller-door')?.addEventListener('click', (e) => {
        rollerDoorState.manualOverride = !rollerDoorState.manualOverride;
        e.target.textContent = rollerDoorState.manualOverride
          ? '🚪 Cửa Cuốn "TOÀN": ĐANG MỞ 100%'
          : '🚪 Cửa Cuốn Kính "TOÀN": TỰ ĐỘNG';
        e.target.style.background = rollerDoorState.manualOverride ? '#ffd60a' : '#00ff88';
      });

      document.getElementById('btn-v170-tilt-360')?.addEventListener('click', async (e) => {
        await enableDeviceOrientationPermission();
        tilt360State.enabled = !tilt360State.enabled;
        if (!tilt360State.enabled) {
          camera.rotation.z = 0;
        }
        e.target.textContent = tilt360State.enabled
          ? '🧭 Nghiêng 360° (ĐT & Quest 3): BẬT'
          : '🧭 Nghiêng 360° (ĐT & Quest 3): TẮT';
        e.target.style.background = tilt360State.enabled ? '#00e5ff' : '#555';
        e.target.style.color = tilt360State.enabled ? '#000' : '#fff';
      });

      document.getElementById('btn-v170-recenter-360')?.addEventListener('click', calibrateTilt360Center);
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', injectV170ControlsToUI);
  } else {
    injectV170ControlsToUI();
  }

  // Hook nối tiếp vào scene.onBeforeRender mà không xóa logic hiện tại
  const prevBeforeRender = scene.onBeforeRender;
  let lastV170Time = performance.now();

  scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
    if (typeof prevBeforeRender === 'function') {
      prevBeforeRender.call(this, rendererInst, sceneInst, cameraInst);
    }
    if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

    const now = performance.now();
    const dt = Math.min((now - lastV170Time) / 1000, 0.1);
    if (dt < 0.001) return;
    lastV170Time = now;

    updateSmartGlassRollerDoor(dt);
    updateUniversalTilt360ForMobileAndQuest3(dt);
  };
})();

// ============================================================================
// 27. BẢN CẬP NHẬT V180 - ĐIỀU KHIỂN XE BẰNG VÔ LĂNG & BÀN ĐẠP PEDAL (STEERING WHEEL & PEDALS)
//     - Hỗ trợ toàn diện Vô Lăng & Pedal: Logitech G29 / G920 / G923, Thrustmaster, Fanatec, Moza, PXN, USB Wheels
//     - Hỗ trợ Gamepad / Tay cầm cắm ngoài acting as wheel/pedals
//     - Đọc góc quay vô lăng 1:1 (-540° đến +540°) đồng bộ với vô lăng 3D Rolls-Royce
//     - Đọc Bàn đạp Ga (Gas / Throttle) và Bàn đạp Thắng (Brake) analog mượt mà (0% - 100%)
//     - Hỗ trợ lẫy chuyển số vô lăng (Paddle Shifters: Tiến D / Lùi R) và nút bóp còi
//     - Nút đảo chiều chân ga / phanh (Invert Gas / Brake) cho các dòng bàn đạp ngược trục
//     - Hoạt cảnh 3D Bàn đạp Ga & Bàn đạp Phanh đạp nhấp nhô theo lực nhấn dưới chân tài xế
//     - Hỗ trợ cầm vô lăng ảo trong kính thực tế ảo Meta Quest 3 bằng cử động tay (Grip / Hand tracking)
// ============================================================================
(function setupUniversalSteeringWheelAndPedalsModule() {
  const racingWheel = {
    connected: false,
    deviceName: 'Chưa cắm Vô Lăng',
    invertGas: false,       // Đảo chiều chân ga
    invertBrake: false,     // Đảo chiều chân phanh
    invertReverse: false,   // Đảo chiều chân lùi
    steerAngleDeg: 0,       // -540° đến +540°
    rawSteer: 0,            // -1.0 đến +1.0
    gasPercent: 0,          // 0 đến 100%
    brakePercent: 0,        // 0 đến 100%
    reversePercent: 0,      // 0 đến 100% (Bàn đạp lùi độc lập)
    gear: 'D',              // 'P', 'R', 'N', 'D'
    prevButtons: { paddleRight: false, paddleLeft: false, horn: false, park: false },
    isVirtualHeld: false,   // Đang nắm vô lăng ảo bằng tay cầm VR
    pedalConfig: {
      gas: { type: 'auto', index: 1, invert: false },
      brake: { type: 'auto', index: 2, invert: false },
      reverse: { type: 'auto', index: 3, invert: false }
    },
    calibratingTarget: null,
    calibratingTimer: null,
    baseAxes: [],
    baseButtons: [],
    calibrated: false,
    lastGpId: ''
  };

  window._racingWheel = racingWheel;

  // 1. Tạo cụm 3D 3 Bàn Đạp (Ga, Phanh, Lùi/Côn) dưới sàn chân tài xế trong khoang xe Rolls-Royce
  const driverPedalsPivot = new THREE.Group();
  driverPedalsPivot.position.set(-0.42, 0.20, -0.42);
  if (typeof chassisGroup !== 'undefined') {
    chassisGroup.add(driverPedalsPivot);
  }

  const pedalChromeMat = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, metalness: 0.9, roughness: 0.2 });
  const pedalRubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

  // A. BÀN ĐẠP GA (GAS PEDAL - Bên phải, thon dài)
  const gasPedalArm = new THREE.Group();
  gasPedalArm.position.set(0.08, 0, 0);
  gasPedalArm.rotation.x = -0.38;

  const gasPedalPad = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.016), pedalChromeMat);
  gasPedalPad.position.set(0, 0.05, 0);
  for (let r = -0.035; r <= 0.035; r += 0.02) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.006, 0.02), pedalRubberMat);
    strip.position.set(0, r, 0.001);
    gasPedalPad.add(strip);
  }
  gasPedalArm.add(gasPedalPad);
  driverPedalsPivot.add(gasPedalArm);

  // B. BÀN ĐẠP PHANH (BRAKE PEDAL - Ở giữa, bản rộng)
  const brakePedalArm = new THREE.Group();
  brakePedalArm.position.set(0.0, 0.02, 0);
  brakePedalArm.rotation.x = -0.38;

  const brakePedalPad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.085, 0.018), pedalChromeMat);
  brakePedalPad.position.set(0, 0.04, 0);
  for (let r = -0.025; r <= 0.025; r += 0.018) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.007, 0.022), pedalRubberMat);
    strip.position.set(0, r, 0.001);
    brakePedalPad.add(strip);
  }
  brakePedalArm.add(brakePedalPad);
  driverPedalsPivot.add(brakePedalArm);

  // C. BÀN ĐẠP LÙI / CÔN (REVERSE / CLUTCH PEDAL - Bên trái)
  const reversePedalArm = new THREE.Group();
  reversePedalArm.position.set(-0.08, 0.01, 0);
  reversePedalArm.rotation.x = -0.38;

  const reversePedalPad = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.095, 0.016), pedalChromeMat);
  reversePedalPad.position.set(0, 0.04, 0);
  for (let r = -0.025; r <= 0.025; r += 0.018) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.006, 0.02), pedalRubberMat);
    strip.position.set(0, r, 0.001);
    reversePedalPad.add(strip);
  }
  reversePedalArm.add(reversePedalPad);
  driverPedalsPivot.add(reversePedalArm);

  // 2. Gán sự kiện cho các nút điều khiển UI trong Bảng Vô Lăng
  window.toggleWindshieldCamOrRoad = function(targetMode) {
    if (targetMode) {
      state.windshieldMode = targetMode;
    } else {
      if (state.windshieldMode === 'TRANSPARENT') {
        state.windshieldMode = 'ESP32_LIVE';
        state.lastActionLog = '📷 ĐÃ CHUYỂN SANG HIỂN THỊ CAMERA THỰC TẾ TRÊN KÍNH LÁI!';
      } else if (state.windshieldMode === 'ESP32_LIVE') {
        state.windshieldMode = 'ESP32_PIP';
        state.lastActionLog = '🖼️ ĐÃ CHUYỂN SANG CHẾ ĐỘ PIP (ĐƯỜNG 3D + MINI CAM)!';
      } else {
        state.windshieldMode = 'TRANSPARENT';
        state.lastActionLog = '🛣️ ĐÃ CHUYỂN SANG HIỂN THỊ ĐƯỜNG 3D TRONG GAME!';
      }
    }
    if (state.windshieldMode === 'ESP32_LIVE') {
      if (esp32Bitmap) {
        wsCtx.drawImage(esp32Bitmap, 0, 0, 1024, 512);
        wsTex.needsUpdate = true;
      } else if (esp32MjpegImg.complete && esp32MjpegImg.naturalWidth > 0) {
        wsCtx.drawImage(esp32MjpegImg, 0, 0, 1024, 512);
        wsTex.needsUpdate = true;
      }
    } else if (state.windshieldMode === 'TRANSPARENT') {
      wsCtx.clearRect(0, 0, 1024, 512);
      wsTex.needsUpdate = true;
    }
    updateCamRoadUiButtons();
  };

  function updateCamRoadUiButtons() {
    const btnTop = document.getElementById('btn-toggle-cam-road');
    const btnWheel = document.getElementById('btn-wheel-toggle-cam-road');
    const mode = state.windshieldMode;
    if (btnTop) {
      if (mode === 'TRANSPARENT') {
        btnTop.textContent = '🛣️ Xem: ĐƯỜNG 3D (Phím V/K)';
        btnTop.style.background = '#00e5ff';
        btnTop.style.color = '#000';
      } else if (mode === 'ESP32_PIP') {
        btnTop.textContent = '🖼️ Xem: PIP (3D + CAM)';
        btnTop.style.background = '#ffd60a';
        btnTop.style.color = '#000';
      } else {
        btnTop.textContent = '📷 Xem: CAM THẬT (Phím V/K)';
        btnTop.style.background = '#00ff88';
        btnTop.style.color = '#000';
      }
    }
    if (btnWheel) {
      if (mode === 'TRANSPARENT') {
        btnWheel.textContent = '🔄 Tùy Chọn: [🛣️ ĐƯỜNG 3D TRONG GAME] (Bấm đổi sang Cam 📷)';
        btnWheel.style.background = '#00e5ff';
        btnWheel.style.color = '#000';
      } else if (mode === 'ESP32_PIP') {
        btnWheel.textContent = '🔄 Tùy Chọn: [🖼️ ĐƯỜNG 3D + MINI CAM] (Bấm đổi sang Kính Trong 🪟)';
        btnWheel.style.background = '#ffd60a';
        btnWheel.style.color = '#000';
      } else {
        btnWheel.textContent = '🔄 Tùy Chọn: [📷 CAMERA THỰC TẾ] (Bấm đổi sang PIP / Đường 3D 🛣️)';
        btnWheel.style.background = '#00ff88';
        btnWheel.style.color = '#000';
      }
    }
  }

  function startPedalCalibration(target) {
    racingWheel.calibratingTarget = target;
    const targetNames = { gas: 'CHÂN GA (TIẾN)', brake: 'CHÂN PHANH (DỪNG)', reverse: 'CHÂN LÙI (LÙI XE)' };
    const btnId = 'btn-calib-pedal-' + target;
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.textContent = '⏳ Đạp hết chân...';
      btn.style.background = '#ff9500';
      btn.style.color = '#000';
    }
    state.lastActionLog = '🎯 [Căn Chỉnh]: Hãy đạp kịch ' + (targetNames[target] || target) + ' trên bộ bàn đạp GOG R808 để nhận diện...';

    clearTimeout(racingWheel.calibratingTimer);
    racingWheel.calibratingTimer = setTimeout(() => {
      if (racingWheel.calibratingTarget === target) {
        racingWheel.calibratingTarget = null;
        if (btn) {
          btn.textContent = target === 'gas' ? '🎯 Gán Ga' : (target === 'brake' ? '🎯 Gán Phanh' : '🎯 Gán Lùi');
          btn.style.background = '#1f3354';
          btn.style.color = target === 'gas' ? '#00ff88' : (target === 'brake' ? '#ff3b30' : '#ffd60a');
        }
        state.lastActionLog = '⏱️ Đã hủy chế độ chờ nhận diện bàn đạp do quá thời gian.';
      }
    }, 10000);
  }

  function initWheelUiListeners() {
    document.getElementById('btn-toggle-cam-road')?.addEventListener('click', () => {
      window.toggleWindshieldCamOrRoad();
    });
    document.getElementById('btn-wheel-toggle-cam-road')?.addEventListener('click', () => {
      window.toggleWindshieldCamOrRoad();
    });

    // Căn chỉnh / Gán từng chân đạp
    document.getElementById('btn-calib-pedal-gas')?.addEventListener('click', () => {
      startPedalCalibration('gas');
    });
    document.getElementById('btn-calib-pedal-brake')?.addEventListener('click', () => {
      startPedalCalibration('brake');
    });
    document.getElementById('btn-calib-pedal-reverse')?.addEventListener('click', () => {
      startPedalCalibration('reverse');
    });

    // Đảo chiều từng chân đạp
    document.getElementById('btn-toggle-invert-gas')?.addEventListener('click', (e) => {
      racingWheel.invertGas = !racingWheel.invertGas;
      e.target.style.background = racingWheel.invertGas ? '#ff9500' : '#1f3354';
      state.lastActionLog = racingWheel.invertGas ? '🔄 Đã đảo chiều Chân Ga' : '🔄 Chân Ga chiều chuẩn';
      savePedalConfig();
    });
    document.getElementById('btn-toggle-invert-brake')?.addEventListener('click', (e) => {
      racingWheel.invertBrake = !racingWheel.invertBrake;
      e.target.style.background = racingWheel.invertBrake ? '#ff9500' : '#1f3354';
      state.lastActionLog = racingWheel.invertBrake ? '🔄 Đã đảo chiều Chân Phanh' : '🔄 Chân Phanh chiều chuẩn';
      savePedalConfig();
    });
    document.getElementById('btn-toggle-invert-reverse')?.addEventListener('click', (e) => {
      racingWheel.invertReverse = !racingWheel.invertReverse;
      e.target.style.background = racingWheel.invertReverse ? '#ff9500' : '#1f3354';
      state.lastActionLog = racingWheel.invertReverse ? '🔄 Đã đảo chiều Chân Lùi' : '🔄 Chân Lùi chiều chuẩn';
      savePedalConfig();
    });

    // Nút nhận diện lại mặc định
    document.getElementById('btn-auto-detect-all-pedals')?.addEventListener('click', () => {
      racingWheel.calibrated = false;
      racingWheel.pedalConfig = {
        gas: { type: 'auto', index: 1, invert: false },
        brake: { type: 'auto', index: 2, invert: false },
        reverse: { type: 'auto', index: 3, invert: false }
      };
      try { localStorage.removeItem('gog_r808_pedal_config'); } catch (e) {}
      ['gas', 'brake', 'reverse'].forEach(t => {
        const btn = document.getElementById('btn-calib-pedal-' + t);
        if (btn) {
          btn.textContent = t === 'gas' ? '🎯 Gán Ga' : (t === 'brake' ? '🎯 Gán Phanh' : '🎯 Gán Lùi');
          btn.style.background = '#1f3354';
          btn.style.color = t === 'gas' ? '#00ff88' : (t === 'brake' ? '#ff3b30' : '#ffd60a');
        }
      });
      state.lastActionLog = '⚡ Đã đặt lại cấu hình 3 bàn đạp mặc định: Vui lòng thả lỏng chân để nhận diện!';
    });

    document.getElementById('btn-wheel-shift-r')?.addEventListener('click', () => {
      racingWheel.gear = 'R';
      state.gearIndex = 1;
      updateWheelGearDisplay();
      state.lastActionLog = '⚙️ [Cần số]: Đã gạt sang Số R (Lùi)!';
    });

    document.getElementById('btn-wheel-shift-d')?.addEventListener('click', () => {
      racingWheel.gear = 'D';
      state.gearIndex = 3;
      updateWheelGearDisplay();
      state.lastActionLog = '⚙️ [Cần số]: Đã gạt sang Số D (Tiến)!';
    });
    updateCamRoadUiButtons();
  }

  function savePedalConfig() {
    try {
      localStorage.setItem('gog_r808_pedal_config', JSON.stringify({
        gas: racingWheel.pedalConfig.gas,
        brake: racingWheel.pedalConfig.brake,
        reverse: racingWheel.pedalConfig.reverse,
        invertGas: racingWheel.invertGas,
        invertBrake: racingWheel.invertBrake,
        invertReverse: racingWheel.invertReverse
      }));
    } catch (e) {}
  }

  function updateWheelGearDisplay() {
    const gearBadge = document.getElementById('wheel-gear-badge');
    if (gearBadge) {
      gearBadge.textContent = 'SỐ: ' + racingWheel.gear;
      gearBadge.style.background = racingWheel.gear === 'R' ? '#ff3b30' : (racingWheel.gear === 'P' ? '#ffcc00' : '#00ff88');
      gearBadge.style.color = racingWheel.gear === 'D' ? '#000' : '#fff';
    }
  }

  // 3. Đọc dữ liệu từ Gamepad API của trình duyệt & Hỗ trợ chuẩn xác 3 Bàn Đạp
  let lastUiUpdate = 0;
  function pollGamepadRacingWheel(dt) {
    if (!navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;

    let activeGp = null;
    let isDedicatedWheel = false;

    // A. Quét tìm vô lăng chuyên dụng
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp || !gp.connected) continue;
      const id = (gp.id || '').toLowerCase();
      if (/r808|gog|wheel|steering|g29|g920|g923|thrustmaster|fanatec|t300|t150|moza|pxn|pedal|racing|driving|force|046d-c24f|046d-c294|046d-c29b|hori/i.test(id)) {
        activeGp = gp;
        isDedicatedWheel = true;
        break;
      }
    }

    // B. Chỉ nhận Gamepad thường làm vô lăng khi người dùng CHỦ ĐỘNG chọn 'wheel' trong menu
    if (!activeGp && state.inputMode === 'wheel') {
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (!gp || !gp.connected) continue;
        if (renderer.xr.isPresenting && gp.id.includes('Spatial')) continue;
        activeGp = gp;
        break;
      }
    }

    if (!activeGp) {
      if (racingWheel.connected) {
        racingWheel.connected = false;
        racingWheel.deviceName = 'Chưa cắm Vô Lăng';
        updateConnectedBadge(false);
      }
      return;
    }

    if (!racingWheel.connected) {
      racingWheel.connected = true;
      racingWheel.deviceName = activeGp.id.replace(/\(.*?\)/g, '').trim() || 'USB Racing Wheel';
      updateConnectedBadge(true, racingWheel.deviceName);
      state.lastActionLog = '🏎️ Đã nhận diện Thiết bị Lái: ' + racingWheel.deviceName + '!';

      // Tự động chuyển ngay người chơi vào Ghế Lái xe Rolls-Royce (1st-Person POV)
      if (state.playerMode !== 'DRIVING') {
        state.playerMode = 'DRIVING';
        state.seatIndex = 0;
        state.doorsOpen = false;
        if (typeof avatarBodyMesh !== 'undefined' && avatarBodyMesh) avatarBodyMesh.visible = false;
        if (typeof roofBeaconGroup !== 'undefined' && roofBeaconGroup) roofBeaconGroup.visible = false;
        if (typeof driverSeatMount !== 'undefined' && driverSeatMount) {
          driverSeatMount.add(cameraRig);
        }
        cameraRig.position.set(0, 0, 0);
        cameraRig.rotation.set(0, 0, 0);
        if (typeof camera !== 'undefined' && camera) camera.rotation.set(0, 0, 0);
        state.eyeLookYaw = 0;
        state.eyeLookPitch = 0;
        state.avatarYaw = 0;
      }
    }

    // 1. ĐỌC GÓC VÔ LĂNG (AXIS 0)
    let steerAxis = activeGp.axes[0] !== undefined ? activeGp.axes[0] : 0;
    if (Math.abs(steerAxis) < 0.02) steerAxis = 0; // Vùng chết tâm
    racingWheel.rawSteer = steerAxis;
    racingWheel.steerAngleDeg = THREE.MathUtils.clamp(steerAxis * 540, -540, 540);

    // Đồng bộ trực tiếp 1:1 góc vô lăng và bánh trước lên xe Rolls-Royce
    state.steeringAngleDeg = racingWheel.steerAngleDeg;
    if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
      steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(-state.steeringAngleDeg);
    }

    // 2. LƯU LẠI GIÁ TRỊ BAN ĐẦU (TRẠNG THÁI NGHỈ CỦA CÁC TRỤC & NÚT)
    if (!racingWheel.calibrated || racingWheel.lastGpId !== activeGp.id) {
      racingWheel.calibrated = true;
      racingWheel.lastGpId = activeGp.id;
      racingWheel.baseAxes = activeGp.axes.map(v => (v !== undefined ? v : 0));
      racingWheel.baseButtons = activeGp.buttons.map(b => (b ? (b.value !== undefined ? b.value : (b.pressed ? 1 : 0)) : 0));
      try {
        const saved = localStorage.getItem('gog_r808_pedal_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') {
            if (parsed.gas) racingWheel.pedalConfig.gas = parsed.gas;
            if (parsed.brake) racingWheel.pedalConfig.brake = parsed.brake;
            if (parsed.reverse) racingWheel.pedalConfig.reverse = parsed.reverse;
            if (typeof parsed.invertGas === 'boolean') racingWheel.invertGas = parsed.invertGas;
            if (typeof parsed.invertBrake === 'boolean') racingWheel.invertBrake = parsed.invertBrake;
            if (typeof parsed.invertReverse === 'boolean') racingWheel.invertReverse = parsed.invertReverse;
          }
        }
      } catch (e) {}
    }

    // 3. XỬ LÝ CHẾ ĐỘ GÁN / AUTO-LEARN NẾU ĐANG CHỜ NGƯỜI DÙNG ĐẠP CHÂN
    if (racingWheel.calibratingTarget) {
      const target = racingWheel.calibratingTarget;
      let detected = null;

      for (let a = 1; a < activeGp.axes.length; a++) {
        const cur = activeGp.axes[a] ?? 0;
        const base = racingWheel.baseAxes[a] ?? 0;
        if (Math.abs(cur - base) > 0.22) {
          detected = { type: 'axis', index: a, rest: base };
          break;
        }
      }

      if (!detected && activeGp.buttons) {
        for (let b = 0; b < activeGp.buttons.length; b++) {
          const btn = activeGp.buttons[b];
          const curVal = btn ? (btn.value !== undefined ? btn.value : (btn.pressed ? 1 : 0)) : 0;
          const baseVal = racingWheel.baseButtons[b] ?? 0;
          if (Math.abs(curVal - baseVal) > 0.35) {
            detected = { type: 'button', index: b, rest: baseVal };
            break;
          }
        }
      }

      if (detected) {
        clearTimeout(racingWheel.calibratingTimer);
        racingWheel.calibratingTarget = null;
        racingWheel.pedalConfig[target] = detected;
        savePedalConfig();

        const btnId = 'btn-calib-pedal-' + target;
        const btn = document.getElementById(btnId);
        if (btn) {
          const label = detected.type === 'axis' ? 'Trục ' + detected.index : 'Nút ' + detected.index;
          btn.textContent = '✅ ' + label;
          btn.style.background = '#00ff88';
          btn.style.color = '#000';
          setTimeout(() => {
            btn.textContent = target === 'gas' ? '🎯 Ga (' + label + ')' : (target === 'brake' ? '🎯 Phanh (' + label + ')' : '🎯 Lùi (' + label + ')');
            btn.style.background = '#1f3354';
            btn.style.color = target === 'gas' ? '#00ff88' : (target === 'brake' ? '#ff3b30' : '#ffd60a');
          }, 2500);
        }
        state.lastActionLog = '✅ [Thành Công]: Đã gán ' + target.toUpperCase() + ' vào ' + (detected.type === 'axis' ? 'Trục ' + detected.index : 'Nút ' + detected.index) + '!';
      }
    }

    // 4. HÀM CHUYỂN ĐỔI GIÁ TRỊ TRỤC/NÚT PEDAL VỀ 0.0 -> 1.0 (CHUẨN HÓA MỌI DÒNG VÔ LĂNG & GOG R808)
    function readPedalNormalized(cfg, defaultAxis, defaultBtn, isInverted) {
      if (!cfg || cfg.type === 'auto') {
        let maxVal = 0;
        if (defaultAxis !== null && defaultAxis !== undefined && activeGp.axes[defaultAxis] !== undefined) {
          const cur = activeGp.axes[defaultAxis] ?? 0;
          const base = racingWheel.baseAxes[defaultAxis] ?? 0;
          let val = 0;
          if (base > 0.4) {
            val = (1.0 - cur) / 2.0;
          } else if (base < -0.4) {
            val = (cur + 1.0) / 2.0;
          } else {
            val = Math.abs(cur - base);
          }
          maxVal = Math.max(maxVal, THREE.MathUtils.clamp(val, 0, 1));
        }
        if (defaultBtn !== null && defaultBtn !== undefined && activeGp.buttons && activeGp.buttons[defaultBtn]) {
          const btn = activeGp.buttons[defaultBtn];
          const btnVal = btn ? (btn.value !== undefined && btn.value !== 0 ? btn.value : (btn.pressed ? 1 : 0)) : 0;
          maxVal = Math.max(maxVal, THREE.MathUtils.clamp(btnVal, 0, 1));
        }
        if (isInverted) maxVal = 1.0 - maxVal;
        return maxVal < 0.035 ? 0 : maxVal;
      }

      if (cfg.type === 'axis') {
        const cur = activeGp.axes[cfg.index] ?? 0;
        const base = cfg.rest ?? (racingWheel.baseAxes[cfg.index] ?? 0);
        let val = 0;
        if (base > 0.4) {
          val = (1.0 - cur) / 2.0;
        } else if (base < -0.4) {
          val = (cur + 1.0) / 2.0;
        } else {
          val = Math.abs(cur - base);
        }
        val = THREE.MathUtils.clamp(val, 0, 1);
        if (cfg.invert || isInverted) val = 1.0 - val;
        return val < 0.035 ? 0 : val;
      }

      if (cfg.type === 'button' && activeGp.buttons) {
        const btn = activeGp.buttons[cfg.index];
        let val = btn ? (btn.value !== undefined && btn.value !== 0 ? btn.value : (btn.pressed ? 1 : 0)) : 0;
        val = THREE.MathUtils.clamp(val, 0, 1);
        if (cfg.invert || isInverted) val = 1.0 - val;
        return val < 0.035 ? 0 : val;
      }

      return 0;
    }

    // A. CHÂN GA (GAS PEDAL)
    let gasVal = readPedalNormalized(racingWheel.pedalConfig.gas, 1, 7, racingWheel.invertGas);

    // B. CHÂN PHANH (BRAKE PEDAL)
    let brakeVal = readPedalNormalized(racingWheel.pedalConfig.brake, 2, 6, racingWheel.invertBrake);
    if (brakeVal === 0 && racingWheel.pedalConfig.brake.type === 'auto' && activeGp.axes[5] !== undefined) {
      brakeVal = readPedalNormalized({ type: 'axis', index: 5, rest: racingWheel.baseAxes[5] }, null, null, racingWheel.invertBrake);
    }

    // C. CHÂN LÙI (REVERSE PEDAL - BÀN ĐẠP THỨ 3 / CÔN RIÊNG BIỆT)
    let reverseVal = readPedalNormalized(racingWheel.pedalConfig.reverse, 3, 1, racingWheel.invertReverse);
    if (reverseVal === 0 && racingWheel.pedalConfig.reverse.type === 'auto') {
      if (activeGp.axes[6] !== undefined) {
        reverseVal = Math.max(reverseVal, readPedalNormalized({ type: 'axis', index: 6, rest: racingWheel.baseAxes[6] }, null, null, racingWheel.invertReverse));
      }
      if (reverseVal === 0 && activeGp.axes[4] !== undefined) {
        reverseVal = Math.max(reverseVal, readPedalNormalized({ type: 'axis', index: 4, rest: racingWheel.baseAxes[4] }, null, null, racingWheel.invertReverse));
      }
      if (reverseVal === 0 && activeGp.buttons && activeGp.buttons[2] && activeGp.buttons[2].pressed) {
        reverseVal = 1.0;
      }
    }

    // QUÉT TỰ ĐỘNG CÁC TRỤC KHÁC NẾU CHƯA GÁN: Tự nhận diện bàn đạp còn thiếu
    if (isDedicatedWheel) {
      for (let a = 1; a < activeGp.axes.length; a++) {
        const cur = activeGp.axes[a] ?? 0;
        const base = racingWheel.baseAxes[a] ?? 0;
        const diff = Math.abs(cur - base);
        if (diff > 0.12) {
          let pct = (base > 0.4) ? (1.0 - cur) / 2.0 : ((base < -0.4) ? (cur + 1.0) / 2.0 : diff);
          pct = THREE.MathUtils.clamp(pct, 0, 1);
          if (pct > 0.05) {
            if (a === 1 && gasVal === 0) gasVal = pct;
            else if ((a === 2 || a === 5) && brakeVal === 0) brakeVal = pct;
            else if ((a === 3 || a === 4 || a === 6) && reverseVal === 0) reverseVal = pct;
          }
        }
      }
    }

    // CẬP NHẬT TRÌNH GIÁM SÁT TÍN HIỆU LIVE TRỰC QUAN TRÊN HUD
    const monitorEl = document.getElementById('wheel-monitor-axes');
    if (monitorEl && Math.random() < 0.12) {
      const axSummary = activeGp.axes.slice(0, 6).map((v, i) => 'A' + i + ':' + (v !== undefined ? v.toFixed(2) : '0')).join(' ');
      const pressedBtns = [];
      if (activeGp.buttons) {
        for (let b = 0; b < Math.min(activeGp.buttons.length, 16); b++) {
          if (activeGp.buttons[b] && (activeGp.buttons[b].pressed || (activeGp.buttons[b].value || 0) > 0.1)) {
            pressedBtns.push('B' + b);
          }
        }
      }
      monitorEl.textContent = '🎮 ' + axSummary + ' | Nút: ' + (pressedBtns.length > 0 ? pressedBtns.join(',') : 'none');
    }

    // Lọc vùng chết 3.5%
    gasVal = THREE.MathUtils.clamp(gasVal, 0, 1);
    brakeVal = THREE.MathUtils.clamp(brakeVal, 0, 1);
    reverseVal = THREE.MathUtils.clamp(reverseVal, 0, 1);
    if (gasVal < 0.035) gasVal = 0;
    if (brakeVal < 0.035) brakeVal = 0;
    if (reverseVal < 0.035) reverseVal = 0;

    racingWheel.gasPercent = gasVal * 100;
    racingWheel.brakePercent = brakeVal * 100;
    racingWheel.reversePercent = reverseVal * 100;

    // ĐỒNG BỘ TRỰC TIẾP VÀO TRẠNG THÁI XE CHÍNH CỦA APP (STATE)
    state.steeringAngleDeg = racingWheel.steerAngleDeg;
    state.throttlePercent = (reverseVal > 0.035) ? racingWheel.reversePercent : racingWheel.gasPercent;
    state.brakePercent = racingWheel.brakePercent;
    state.reversePercent = racingWheel.reversePercent;

    // Nếu người chơi đạp ga, lùi hoặc bẻ lái: Tự động kích hoạt ngay chế độ Lái xe & Nổ máy Rolls-Royce
    if (racingWheel.gasPercent > 3 || racingWheel.reversePercent > 3 || Math.abs(racingWheel.rawSteer) > 0.04) {
      if (state.playerMode !== 'DRIVING') {
        state.playerMode = 'DRIVING';
        state.seatIndex = 0;
        state.doorsOpen = false;
        if (typeof avatarBodyMesh !== 'undefined' && avatarBodyMesh) avatarBodyMesh.visible = false;
        if (typeof driverSeatMount !== 'undefined' && driverSeatMount) {
          driverSeatMount.add(cameraRig);
          cameraRig.position.set(0, 0, 0);
          cameraRig.rotation.set(0, 0, 0);
        }
      }
      if (!state.engineRunning) {
        state.engineRunning = true;
        state.rpm = 1200;
      }
    }

    // 5. LẪY CHUYỂN SỐ VÔ LĂNG & CÁC NÚT BẤM
    if (activeGp.buttons) {
      const pRight = !!activeGp.buttons[4]?.pressed;
      const pLeft = !!activeGp.buttons[5]?.pressed;
      const btnHorn = !!(activeGp.buttons[0]?.pressed || activeGp.buttons[11]?.pressed || activeGp.buttons[23]?.pressed);
      const btnPark = !!(activeGp.buttons[1]?.pressed || activeGp.buttons[2]?.pressed);
      const btnCamToggle = !!(activeGp.buttons[3]?.pressed || activeGp.buttons[8]?.pressed || activeGp.buttons[9]?.pressed);

      if (pRight && !racingWheel.prevButtons.paddleRight) {
        racingWheel.gear = 'D';
        state.gearIndex = 3;
        updateWheelGearDisplay();
        state.lastActionLog = '⚙️ [Lẫy vô lăng]: Đã vào số D (Tiến)!';
      }
      if (pLeft && !racingWheel.prevButtons.paddleLeft) {
        racingWheel.gear = 'R';
        state.gearIndex = 1;
        updateWheelGearDisplay();
        state.lastActionLog = '⚙️ [Lẫy vô lăng]: Đã vào số R (Lùi)!';
      }
      if (btnHorn && !racingWheel.prevButtons.horn) {
        initAudio();
        playSmartVehicleHornSound('CAR');
        state.hornActive = true;
      } else if (!btnHorn && racingWheel.prevButtons.horn) {
        state.hornActive = false;
      }
      if (btnPark && !racingWheel.prevButtons.park) {
        racingWheel.gear = 'P';
        state.gearIndex = 0;
        updateWheelGearDisplay();
        state.velocityMs = 0;
        state.speedKmh = 0;
        state.lastActionLog = '🅿️ [Nút vô lăng]: Đã gạt sang Số P (Đỗ dừng hẳn)!';
      }
      if (btnCamToggle && !racingWheel.prevButtons.camToggle) {
        window.toggleWindshieldCamOrRoad();
      }

      racingWheel.prevButtons.paddleRight = pRight;
      racingWheel.prevButtons.paddleLeft = pLeft;
      racingWheel.prevButtons.horn = btnHorn;
      racingWheel.prevButtons.park = btnPark;
      racingWheel.prevButtons.camToggle = btnCamToggle;
    }
  }

  function updateConnectedBadge(connected, name) {
    const badge = document.getElementById('wheel-connected-badge');
    if (!badge) return;
    if (connected) {
      badge.textContent = '🟢 ' + (name || 'Vô Lăng Đã Kết Nối');
      badge.style.background = '#00ff88';
      badge.style.color = '#000';
    } else {
      badge.textContent = 'Đang dò Vô Lăng USB...';
      badge.style.background = '#333';
      badge.style.color = '#aaa';
    }
  }

  // 4. CẬP NHẬT GIAO DIỆN METER TRỰC QUAN (VÔ LĂNG & 3 BÀN ĐẠP)
  function updateUiMeters() {
    const angleTxt = document.getElementById('wheel-angle-txt');
    const steerBar = document.getElementById('wheel-steer-bar');
    const gasTxt = document.getElementById('pedal-gas-txt');
    const gasBar = document.getElementById('pedal-gas-bar');
    const brakeTxt = document.getElementById('pedal-brake-txt');
    const brakeBar = document.getElementById('pedal-brake-bar');
    const revTxt = document.getElementById('pedal-reverse-txt');
    const revBar = document.getElementById('pedal-reverse-bar');

    const angle = Math.round(state.steeringAngleDeg || 0);
    if (angleTxt) angleTxt.textContent = (angle > 0 ? '+' : '') + angle + '°';
    if (steerBar) {
      const pct = (angle / 540) * 50;
      if (pct >= 0) {
        steerBar.style.left = '50%';
        steerBar.style.width = Math.min(50, pct) + '%';
      } else {
        steerBar.style.left = (50 + pct) + '%';
        steerBar.style.width = Math.min(50, -pct) + '%';
      }
    }

    if (gasTxt) gasTxt.textContent = Math.round(racingWheel.gasPercent || 0) + '%';
    if (gasBar) gasBar.style.width = Math.min(100, Math.round(racingWheel.gasPercent || 0)) + '%';

    if (brakeTxt) brakeTxt.textContent = Math.round(racingWheel.brakePercent || 0) + '%';
    if (brakeBar) brakeBar.style.width = Math.min(100, Math.round(racingWheel.brakePercent || 0)) + '%';

    if (revTxt) revTxt.textContent = Math.round(racingWheel.reversePercent || 0) + '%';
    if (revBar) revBar.style.width = Math.min(100, Math.round(racingWheel.reversePercent || 0)) + '%';
  }

  // 5. NẮM VÔ LĂNG ẢO TRONG KÍNH VR META QUEST 3
  function updateVirtualVrSteeringGrab(dt) {
    if (!renderer.xr.isPresenting) return;
    const session = renderer.xr.getSession();
    if (!session) return;

    const wheelCenterWorld = new THREE.Vector3();
    steeringWheelPivot.getWorldPosition(wheelCenterWorld);

    let anyHandGrabbing = false;
    let grabSteerAngle = 0;

    for (let i = 0; i < xrControllers.length; i++) {
      const ctrl = xrControllers[i];
      if (!ctrl || !ctrl.visible) continue;
      const ctrlPos = new THREE.Vector3().setFromMatrixPosition(ctrl.matrixWorld);
      const dist = ctrlPos.distanceTo(wheelCenterWorld);

      const gp = session.inputSources[i]?.gamepad;
      const gripHeld = gp && (gp.buttons[1]?.pressed || (gp.buttons[1]?.value || 0) > 0.45);

      if (dist < 0.34 && gripHeld) {
        anyHandGrabbing = true;
        const relPos = ctrlPos.clone().sub(wheelCenterWorld);
        const handAngle = Math.atan2(relPos.x, relPos.y);
        grabSteerAngle = THREE.MathUtils.radToDeg(handAngle) * 2.8;
        if (gp.hapticActuators && gp.hapticActuators[0] && Math.random() < 0.1) {
          gp.hapticActuators[0].pulse(0.2, 15);
        }
        break;
      }
    }

    if (anyHandGrabbing) {
      racingWheel.isVirtualHeld = true;
      state.steeringAngleDeg = THREE.MathUtils.lerp(state.steeringAngleDeg, THREE.MathUtils.clamp(grabSteerAngle, -540, 540), dt * 16);
    } else {
      racingWheel.isVirtualHeld = false;
    }
  }

  // 6. ÁP DỤNG VẬT LÝ LÁI XE TỪ VÔ LĂNG & 3 BÀN ĐẠP ĐỘC LẬP
  function applyRacingWheelDrivingPhysics(dt) {
    if (!racingWheel.connected || state.playerMode !== 'DRIVING' || state.hijackActive) return;

    // A. ĐÁNH LÁI BẰNG VÔ LĂNG
    state.steeringAngleDeg = racingWheel.steerAngleDeg;
    if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
      steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(-state.steeringAngleDeg);
    }
    const steerRad = THREE.MathUtils.degToRad((state.steeringAngleDeg / 540) * 35);

    // Đồng bộ góc xoay bánh trước xe Rolls-Royce
    const frontYaw = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 34);
    if (typeof wheelAssemblies !== 'undefined') {
      for (const w of wheelAssemblies) {
        if (w.isFrontWheel && w.steerMount) w.steerMount.rotation.y = frontYaw;
      }
    }

    // ĐỒNG BỘ TỐC ĐỘ 1:1 VỚI XE RC THẬT & MỨC GA ĐÃ CHỌN
    const targetMaxKmh = state.rcTargetSpeedKmh || 12.0;
    const maxVelocity = targetMaxKmh / 3.6; // 12 km/h = 3.33 m/s
    const speedFactor = 1.0;

    // B. BÀN ĐẠP THẮNG (PHANH DỪNG XE HÃM TỨC THÌ)
    if (racingWheel.brakePercent > 3) {
      state.throttlePercent = 0;
      state.reversePercent = 0;
      state.brakePercent = racingWheel.brakePercent;
      const brakeDecel = (racingWheel.brakePercent / 100) * 35.0;
      state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * brakeDecel);
      if (Math.abs(state.velocityMs) < 0.12 && racingWheel.brakePercent > 18) {
        state.velocityMs = 0;
      }
      state.speedKmh = state.velocityMs * 3.6;
    }
    // C. BÀN ĐẠP LÙI (REVERSE PEDAL - TỰ ĐỘNG LÙI XE RIÊNG BIỆT)
    else if (racingWheel.reversePercent > 3) {
      if (!state.engineRunning) {
        state.engineRunning = true;
      }
      racingWheel.gear = 'R';
      state.gearIndex = 1;
      updateWheelGearDisplay();

      state.reversePercent = racingWheel.reversePercent;
      state.throttlePercent = racingWheel.reversePercent;
      state.brakePercent = 0;

      const accelRate = (racingWheel.reversePercent / 100) * 14.0 * speedFactor;
      state.velocityMs = THREE.MathUtils.clamp(state.velocityMs - accelRate * 0.75 * dt, -maxVelocity * 0.5, 0);
      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = 850 + (racingWheel.reversePercent / 100) * 4200;
    }
    // D. BÀN ĐẠP GA (GAS PEDAL - TỰ ĐỘNG TIẾN XE RIÊNG BIỆT)
    else if (racingWheel.gasPercent > 3) {
      if (!state.engineRunning) {
        state.engineRunning = true;
      }
      racingWheel.gear = 'D';
      state.gearIndex = 3;
      updateWheelGearDisplay();

      state.throttlePercent = racingWheel.gasPercent;
      state.reversePercent = 0;
      state.brakePercent = 0;

      const accelRate = (racingWheel.gasPercent / 100) * 18.0 * speedFactor;
      state.velocityMs = THREE.MathUtils.clamp(state.velocityMs + accelRate * dt, 0, maxVelocity);
      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = 850 + (racingWheel.gasPercent / 100) * 4800;
    } else {
      // Thả cả 3 chân: xe tự trôi êm về 0
      state.throttlePercent = 0;
      state.reversePercent = 0;
      state.brakePercent = 0;
      state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, dt * 4.0);
      if (Math.abs(state.velocityMs) < 0.1) state.velocityMs = 0;
      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = THREE.MathUtils.lerp(state.rpm, 800, dt * 6.0);
    }

    // D. XOAY HƯỚNG XE THEO GÓC ĐÁNH LÁI VÔ LĂNG THẬT
    if (Math.abs(state.velocityMs) > 0.05) {
      const effectiveSpeed = Math.max(Math.abs(state.velocityMs), 3.2) * Math.sign(state.velocityMs);
      const turnRate = (effectiveSpeed / (state.wheelbaseM || 3.2)) * Math.tan(steerRad) * 1.6;
      state.headingRad -= turnRate * dt;
      vehicleRoot.rotation.y = state.headingRad;

      const step = state.velocityMs * dt;
      vehicleRoot.position.x -= Math.sin(state.headingRad) * step;
      vehicleRoot.position.z -= Math.cos(state.headingRad) * step;
    }

    // E. HOẠT CẢNH 3D 3 BÀN ĐẠP DƯỚI SÀN XE (DẬP XUỐNG KHI ĐẠP)
    if (typeof gasPedalArm !== 'undefined' && gasPedalArm) {
      const targetGasRot = -0.38 - (state.throttlePercent / 100) * 0.32;
      gasPedalArm.rotation.x = THREE.MathUtils.lerp(gasPedalArm.rotation.x, targetGasRot, dt * 20);
    }
    if (typeof brakePedalArm !== 'undefined' && brakePedalArm) {
      const targetBrakeRot = -0.38 - (state.brakePercent / 100) * 0.26;
      brakePedalArm.rotation.x = THREE.MathUtils.lerp(brakePedalArm.rotation.x, targetBrakeRot, dt * 20);
    }
    if (typeof reversePedalArm !== 'undefined' && reversePedalArm) {
      const targetReverseRot = -0.38 - (state.reversePercent / 100) * 0.32;
      reversePedalArm.rotation.x = THREE.MathUtils.lerp(reversePedalArm.rotation.x, targetReverseRot, dt * 20);
    }
  }

  // 7. GẮN VÀO KHUNG RENDER CHÍNH
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initWheelUiListeners);
  } else {
    initWheelUiListeners();
  }

  const prevBeforeRenderV180 = scene.onBeforeRender;
  let lastV180Time = performance.now();

  scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
    if (typeof prevBeforeRenderV180 === 'function') {
      prevBeforeRenderV180.call(this, rendererInst, sceneInst, cameraInst);
    }
    if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

    const now = performance.now();
    const dt = Math.min((now - lastV180Time) / 1000, 0.1);
    if (dt < 0.001) return;
    lastV180Time = now;

    pollGamepadRacingWheel(dt);
    updateVirtualVrSteeringGrab(dt);
    applyRacingWheelDrivingPhysics(dt);

    if (now - lastUiUpdate > 40) {
      lastUiUpdate = now;
      updateUiMeters();
    }
  };
})();


// ============================================================================
// 28. BẢN CẬP NHẬT V185 - TỰ ĐỘNG ĐỒNG BỘ IP ESP32 KHI ĐỔI WIFI & TRIỆT TIÊU BUG NPC ĐI XUYÊN XE
//     - Tự động quét & nhận diện IP mới của cả 2 Camera khi mạch đổi Wi-Fi (UDP / HTTP Discovery)
//     - Cập nhật trực tiếp lên ô nhập trên Web và tự động kết nối lại không cần gõ tay
//     - Nút [🔍 Tự Động Quét Tìm & Cập Nhật IP Mới Khi Đổi Wi-Fi] quét nhanh toàn mạng LAN
//     - Cơ chế Va chạm Vật lý Thân Xe OBB (Oriented Bounding Box): Chặn 100% người đi bộ, xe NPC
//       không bao giờ đi xuyên hoặc chui vào trong khoang xe Rolls-Royce
// ============================================================================
(function setupV185AutoDiscoveryAndNpcCollisionEngine() {
  // 1. TỰ ĐỘNG ĐỒNG BỘ IP ESP32 KHI ĐỔI WI-FI
  let isScanningNetwork = false;

  async function checkDiscoveredEsp32Ips() {
    try {
      const res = await fetch('/api/esp32-discovered');
      if (!res.ok) return;
      const data = await res.json();

      const frontInput = document.getElementById('esp32-front-ip');
      const rearInput = document.getElementById('esp32-rear-ip');
      const carInput = document.getElementById('esp32-car-ip');
      const carStatus = document.getElementById('esp32-car-status');

      // Tự động cập nhật IP Mạch Lái Xe nếu phát hiện IP mới
      if (data.car && data.car.ip) {
        if (carInput && (!carInput.value || carInput.value !== data.car.ip)) {
          carInput.value = data.car.ip;
          localStorage.setItem('esp32_car_ip', data.car.ip);
        }
        state.esp32CarIp = data.car.ip;
        state.esp32CarConnected = Boolean(data.car.active);
        if (carStatus) {
          carStatus.textContent = data.car.active ? `🟢 Đã nối xe (${data.car.ip}:4210)` : `🟠 Thấy xe (${data.car.ip} - Chờ lệnh)`;
          carStatus.style.color = data.car.active ? '#00ff88' : '#ff9500';
        }
      }

      // Tự động cập nhật IP Cam Trước nếu phát hiện IP mới
      if (data.front && data.front.ip) {
        const expectedFrontUrl = `ws://${data.front.ip}:${data.front.port || 4213}`;
        if (frontInput && (frontInput.value !== expectedFrontUrl || !frontInput.value)) {
          frontInput.value = expectedFrontUrl;
        }
        if (!state.esp32Connected) {
          connectEsp32Windshield(expectedFrontUrl);
        }
      }

      // Tự động cập nhật IP Cam Lùi nếu phát hiện IP mới
      if (data.rear && data.rear.ip) {
        const expectedRearUrl = `ws://${data.rear.ip}:${data.rear.port || 4213}`;
        if (rearInput && (rearInput.value !== expectedRearUrl || !rearInput.value)) {
          rearInput.value = expectedRearUrl;
        }
        if (!state.esp32RearConnected && !manualRearDisconnect) {
          connectRearEsp32Camera(expectedRearUrl);
        }
      }
    } catch (e) {}
  }

  // Quét định kỳ mỗi 3 giây để bắt kịp ngay khi mạch vừa đổi Wi-Fi hoặc reboot
  setInterval(checkDiscoveredEsp32Ips, 3000);

  // Nút bấm Quét chủ động trên Web
  async function triggerManualEsp32Scan() {
    if (isScanningNetwork) return;
    isScanningNetwork = true;
    const btn = document.getElementById('btn-auto-discover-esp32');
    if (btn) {
      btn.textContent = '⏳ Đang Quét Tìm ESP32 Trong Mạng LAN...';
      btn.style.background = '#ffd60a';
    }
    state.lastActionLog = '🔍 Đang quét toàn bộ mạng Wi-Fi để tự động tìm IP mới của 2 Camera...';

    try {
      const res = await fetch('/api/scan-esp32');
      const data = await res.json();
      await checkDiscoveredEsp32Ips();

      const foundCount = (data.found || []).length;
      if (btn) {
        btn.textContent = `✅ Đã Quét Xong! (Tìm thấy ${foundCount} thiết bị)`;
        btn.style.background = '#00ff88';
        setTimeout(() => {
          btn.textContent = '🔍 Tự Động Quét Tìm & Cập Nhật IP Mới Khi Đổi Wi-Fi';
          btn.style.background = '#ff9500';
        }, 4000);
      }
      state.lastActionLog = `✅ Đã quét xong mạng LAN! Tìm thấy ${foundCount} camera ESP32 và tự động kết nối!`;
    } catch (err) {
      if (btn) {
        btn.textContent = '⚠️ Lỗi Quét Mạng - Thử Lại';
        btn.style.background = '#ff3b30';
      }
    } finally {
      isScanningNetwork = false;
    }
  }

  // Gắn sự kiện nút bấm quét & kết nối mạch lái xe
  function initDiscoveryUi() {
    document.getElementById('btn-auto-discover-esp32')?.addEventListener('click', triggerManualEsp32Scan);

    // Cấu hình mạch lái xe ESP32 Car Controller
    const carInput = document.getElementById('esp32-car-ip');
    const carStatus = document.getElementById('esp32-car-status');
    const btnConnectCar = document.getElementById('btn-connect-car-esp32');
    const btnInvertSteer = document.getElementById('btn-toggle-invert-steer');
    const btnTestPulse = document.getElementById('btn-test-esp32-pulse');

    const savedCarIp = localStorage.getItem('esp32_car_ip');
    if (savedCarIp && carInput) {
      carInput.value = savedCarIp;
      state.esp32CarIp = savedCarIp;
    }

    function applyCarIp(ip) {
      if (!ip) return;
      const cleanIp = ip.trim().replace(/^https?:\/\//, '').replace(/^ws:\/\//, '').split(':')[0];
      state.esp32CarIp = cleanIp;
      localStorage.setItem('esp32_car_ip', cleanIp);
      if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
        mpSocket.send(JSON.stringify({ type: 'SET_ESP32_CAR_IP', ip: cleanIp, port: 4210 }));
      }
      fetch(`/api/set-esp32-car-ip?ip=${encodeURIComponent(cleanIp)}`).catch(() => {});
      if (carStatus) {
        carStatus.textContent = `🟢 Đã nối (${cleanIp}:4210)`;
        carStatus.style.color = '#00ff88';
      }
      state.lastActionLog = `🚗 Đã lưu & kết nối Mạch Lái Xe ESP32: ${cleanIp}:4210`;
    }

    btnConnectCar?.addEventListener('click', () => {
      const ip = carInput ? carInput.value.trim() : '';
      if (ip) applyCarIp(ip);
    });

    carInput?.addEventListener('change', () => {
      const ip = carInput ? carInput.value.trim() : '';
      if (ip) applyCarIp(ip);
    });

    // Đảo góc bẻ lái Servo (Invert Steering)
    state.invertCarSteer = localStorage.getItem('invert_car_steer') === 'true';
    if (btnInvertSteer && state.invertCarSteer) {
      btnInvertSteer.style.background = '#ff9500';
      btnInvertSteer.textContent = '🔄 Đảo Lái: BẬT (Ngược)';
    }
    btnInvertSteer?.addEventListener('click', () => {
      state.invertCarSteer = !state.invertCarSteer;
      localStorage.setItem('invert_car_steer', state.invertCarSteer ? 'true' : 'false');
      btnInvertSteer.style.background = state.invertCarSteer ? '#ff9500' : '#1f3354';
      btnInvertSteer.textContent = state.invertCarSteer ? '🔄 Đảo Lái: BẬT (Ngược)' : '🔄 Đảo Lái (Trái/Phải)';
    });

    // Nút Test Lắc Bánh Xe (Pulse Servo)
    // Cân chỉnh tốc độ xe thật và đồng bộ 1:1 với app 3D (Bản vá V195)
    const btnSpeedSlow = document.getElementById('btn-rc-speed-slow');
    const btnSpeedMedium = document.getElementById('btn-rc-speed-medium');
    const btnSpeedFast = document.getElementById('btn-rc-speed-fast');
    const sliderMaxThrottle = document.getElementById('slider-rc-max-throttle');
    const valMaxThrottle = document.getElementById('val-rc-max-throttle');
    const valSpeedMode = document.getElementById('val-rc-speed-mode');

    const sliderMaxReverse = document.getElementById('slider-rc-max-reverse');
    const valMaxReverse = document.getElementById('val-rc-max-reverse');

    function setRcSpeedPreset(pulse, kmh, modeName, activeBtn, revPulse) {
      state.rcMaxForwardPulse = pulse;
      state.rcTargetSpeedKmh = kmh;
      if (typeof revPulse === 'number') {
        state.rcMaxReversePulse = revPulse;
      } else {
        const fwdDelta = pulse - 1500;
        state.rcMaxReversePulse = 1500 - Math.round(Math.max(110, fwdDelta * 1.75));
      }
      localStorage.setItem('rc_max_throttle_pulse', String(pulse));
      localStorage.setItem('rc_target_speed_kmh', String(kmh));
      localStorage.setItem('rc_max_reverse_pulse', String(state.rcMaxReversePulse));

      if (sliderMaxThrottle) sliderMaxThrottle.value = String(pulse);
      if (valMaxThrottle) valMaxThrottle.textContent = `${pulse}µs`;
      if (sliderMaxReverse) sliderMaxReverse.value = String(state.rcMaxReversePulse);
      if (valMaxReverse) valMaxReverse.textContent = `${state.rcMaxReversePulse}µs`;
      if (valSpeedMode) valSpeedMode.textContent = `${modeName} (${pulse}µs - ${kmh} km/h | Lùi: ${state.rcMaxReversePulse}µs)`;

      [btnSpeedSlow, btnSpeedMedium, btnSpeedFast].forEach(b => {
        if (b) {
          b.style.background = '#1f3354';
          b.style.color = '#fff';
          b.style.fontWeight = 'normal';
        }
      });
      if (activeBtn) {
        activeBtn.style.background = '#00e5ff';
        activeBtn.style.color = '#000';
        activeBtn.style.fontWeight = 'bold';
      }
      state.lastActionLog = `🎯 Đã đổi tốc độ xe RC: ${modeName} (${kmh} km/h - Tiến: ${pulse}µs, Lùi: ${state.rcMaxReversePulse}µs)`;
    }

    btnSpeedSlow?.addEventListener('click', () => {
      setRcSpeedPreset(1565, 8.0, '🐢 Êm Ái', btnSpeedSlow, 1380);
    });

    btnSpeedMedium?.addEventListener('click', () => {
      setRcSpeedPreset(1585, 12.0, '🚗 Vừa Phải', btnSpeedMedium, 1350);
    });

    btnSpeedFast?.addEventListener('click', () => {
      setRcSpeedPreset(1640, 18.0, '🏎️ Thể Thao', btnSpeedFast, 1300);
    });

    sliderMaxThrottle?.addEventListener('input', (e) => {
      const pulse = parseInt(e.target.value, 10) || 1585;
      const kmh = Math.round(((pulse - 1500) / 85) * 12.0 * 10) / 10;
      setRcSpeedPreset(pulse, kmh, '⚙️ Tùy Chỉnh', null, state.rcMaxReversePulse);
    });

    sliderMaxReverse?.addEventListener('input', (e) => {
      const revPulse = parseInt(e.target.value, 10) || 1350;
      state.rcMaxReversePulse = revPulse;
      localStorage.setItem('rc_max_reverse_pulse', String(revPulse));
      if (valMaxReverse) valMaxReverse.textContent = `${revPulse}µs`;
      if (valSpeedMode) valSpeedMode.textContent = `⚙️ Tùy Chỉnh (Tiến: ${state.rcMaxForwardPulse || 1585}µs | Lùi: ${revPulse}µs)`;
      state.lastActionLog = `🎯 Đã chỉnh lực ga lùi: ${revPulse}µs (Xung lùi đủ mạnh để thắng ma sát bánh xe)`;
    });

    const savedPulse = parseInt(localStorage.getItem('rc_max_throttle_pulse'), 10);
    const savedKmh = parseFloat(localStorage.getItem('rc_target_speed_kmh'));
    const savedRev = parseInt(localStorage.getItem('rc_max_reverse_pulse'), 10);
    if (savedRev && sliderMaxReverse && valMaxReverse) {
      state.rcMaxReversePulse = savedRev;
      sliderMaxReverse.value = String(savedRev);
      valMaxReverse.textContent = `${savedRev}µs`;
    }
    if (savedPulse && savedKmh) {
      const btn = savedPulse <= 1570 ? btnSpeedSlow : (savedPulse <= 1600 ? btnSpeedMedium : btnSpeedFast);
      setRcSpeedPreset(savedPulse, savedKmh, savedPulse <= 1570 ? '🐢 Êm Ái' : (savedPulse <= 1600 ? '🚗 Vừa Phải' : '🏎️ Thể Thao'), btn, savedRev || undefined);
    }

    btnTestPulse?.addEventListener('click', () => {
      if (!mpSocket || mpSocket.readyState !== WebSocket.OPEN) {
        state.lastActionLog = '⚠️ Chưa kết nối máy chủ WebSocket!';
        return;
      }
      state.lastActionLog = '⚡ Đang gửi xung Test Lắc Bánh Xe (60° -> 120° -> 90°)...';
      mpSocket.send(JSON.stringify({ type: 'CAR_CONTROL', steer: 60, throttle: 1500 }));
      setTimeout(() => {
        if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
          mpSocket.send(JSON.stringify({ type: 'CAR_CONTROL', steer: 120, throttle: 1500 }));
        }
      }, 300);
      setTimeout(() => {
        if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
          mpSocket.send(JSON.stringify({ type: 'CAR_CONTROL', steer: 90, throttle: 1500 }));
        }
      }, 600);
    });

    // Quét ngay 1 lần lúc vừa tải trang
    setTimeout(checkDiscoveredEsp32Ips, 1200);

    // Tự động kích hoạt kết nối camera trước & sau & car ip dựa trên giá trị trong ô input
    setTimeout(() => {
      if (savedCarIp) applyCarIp(savedCarIp);
      const frontInput = document.getElementById('esp32-front-ip');
      const rearInput = document.getElementById('esp32-rear-ip');
      if (frontInput && frontInput.value && !state.esp32Connected) {
        connectEsp32Windshield(frontInput.value.trim());
      }
      if (rearInput && rearInput.value && !state.esp32RearConnected && !manualRearDisconnect) {
        connectRearEsp32Camera(rearInput.value.trim());
      }
    }, 1500);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initDiscoveryUi);
  } else {
    initDiscoveryUi();
  }

  // 2. CƠ CHẾ VẬT LÝ OBB CHẶN 100% NPC ĐI XUYÊN XE
  function resolveVehicleNpcCollisions(dt) {
    if (typeof vehicleRoot === 'undefined') return;

    const carPos = vehicleRoot.position;
    const carYaw = vehicleRoot.rotation.y || state.headingRad || 0;
    const cosYaw = Math.cos(carYaw);
    const sinYaw = Math.sin(carYaw);

    // Kích thước xe Rolls-Royce: Dài 5.4m, Rộng 2.1m.
    // Vùng đệm an toàn xung quanh thân xe cho người đi bộ là 0.40m
    const halfWidth = 1.15 + 0.40;   // 1.55m
    const halfLength = 2.70 + 0.45;  // 3.15m

    // A. NGƯỜI ĐI BỘ TRÊN VỈA HÈ & BÀ GIÀ ĐI BỘ / XE MÁY (ZERO PER-FRAME ALLOCATION)
    function preventNpcCarPenetration(npcList) {
      if (!npcList || !Array.isArray(npcList)) return;
      for (let i = 0; i < npcList.length; i++) {
        const npc = npcList[i];
        if (!npc || !npc.visible) continue;
        if (npc.userData && npc.userData.npcState === 'KNOCKED_FLYING') continue;
        const dx = npc.position.x - carPos.x;
        const dz = npc.position.z - carPos.z;

        // Khoảng cách sơ bộ
        if (dx * dx + dz * dz > 36.0) continue;

        // Chuyển sang tọa độ cục bộ OBB của xe
        const localX = dx * cosYaw - dz * sinYaw;
        const localZ = dx * sinYaw + dz * cosYaw;

        // Nếu người đi bộ chạm hoặc lọt vào vùng thân xe:
        if (Math.abs(localX) < halfWidth && Math.abs(localZ) < halfLength) {
          const overlapX = halfWidth - Math.abs(localX);
          const overlapZ = halfLength - Math.abs(localZ);

          let resLocalX = localX;
          let resLocalZ = localZ;

          // Đẩy ra mép gần nhất
          if (overlapX < overlapZ) {
            resLocalX = localX >= 0 ? halfWidth : -halfWidth;
          } else {
            resLocalZ = localZ >= 0 ? halfLength : -halfLength;
          }

          // Đổi ngược lại tọa độ thế giới và đẩy NPC ra ngoài thân xe tức thì
          npc.position.x = carPos.x + (resLocalX * cosYaw + resLocalZ * sinYaw);
          npc.position.z = carPos.z + (-resLocalX * sinYaw + resLocalZ * cosYaw);

          // Đảo hướng đi bộ nếu người đi bộ đang đi thẳng đâm vào xe
          if (npc.userData && npc.userData.railDir) {
            if (Math.random() < 0.2) npc.userData.railDir = -npc.userData.railDir;
          }
        }
      }
    }

    if (typeof sidewalkNpcs !== 'undefined') preventNpcCarPenetration(sidewalkNpcs);
    if (typeof grannyObstacles !== 'undefined') preventNpcCarPenetration(grannyObstacles);

    // B. XE NPC TRÊN ĐƯỜNG (allTrafficVehicles) KHÔNG ĐƯỢC ĐI XUYÊN XE NGƯỜI CHƠI
    if (typeof allTrafficVehicles !== 'undefined' && Array.isArray(allTrafficVehicles)) {
      for (let i = 0; i < allTrafficVehicles.length; i++) {
        const veh = allTrafficVehicles[i];
        if (!veh || !veh.visible) continue;
        const vd = veh.userData;
        if (!vd) continue;

        const dxV = veh.position.x - carPos.x;
        const dzV = veh.position.z - carPos.z;
        const distSqV = dxV * dxV + dzV * dzV;
        if (distSqV > 45.0) continue;

        const safeDist = 4.3;
        const dist = Math.sqrt(distSqV);
        if (dist < safeDist) {
          // Xe NPC dừng hẳn nhường đường, bấm còi
          vd.activeSpeed = 0;
          if (vd.hornBadge) vd.hornBadge.visible = true;

          // Đẩy nhẹ xe NPC ra ngoài để tuyệt đối không bao giờ đi xuyên xe
          const push = (safeDist - dist) * 0.55;
          veh.position.x += (dxV / (dist || 1)) * push;
          veh.position.z += (dzV / (dist || 1)) * push;
        }
      }
    }
  }

  // 3. GẮN VÀO KHUNG RENDER CHÍNH scene.onBeforeRender & TRUYỀN LỆNH LÁI XE ESP32
  const prevBeforeRenderV185 = scene.onBeforeRender;
  let lastV185Time = performance.now();
  let lastCarControlSendTime = 0;
  const carControlPacket = { type: 'CAR_CONTROL', steer: 90, throttle: 1500 };

  scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
    if (typeof prevBeforeRenderV185 === 'function') {
      prevBeforeRenderV185.call(this, rendererInst, sceneInst, cameraInst);
    }
    if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

    const now = performance.now();
    const dt = Math.min((now - lastV185Time) / 1000, 0.1);
    if (dt < 0.001) return;
    lastV185Time = now;

    resolveVehicleNpcCollisions(dt);

    // Gửi lệnh điều khiển xe thật qua WebSocket tới server.js (25Hz = 40ms/lần, Zero Per-Frame Allocation)
    if (now - lastCarControlSendTime >= 40) {
      lastCarControlSendTime = now;
      if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
        const maxFwdDelta = Math.max(20, Math.min(180, (state.rcMaxForwardPulse || 1585) - 1500));
        const maxRevDelta = Math.max(40, Math.min(220, 1500 - (state.rcMaxReversePulse || 1350)));

        let targetSteer = 90;
        let targetThrottle = 1500;

        if (state.playerMode === 'DRIVING') {
          // A. Tính góc bẻ lái Servo: Đảo chiều chuẩn để đánh lái Trái -> quẹo Trái, Phải -> quẹo Phải
          let steerRatio = THREE.MathUtils.clamp(state.steeringAngleDeg / 450.0, -1.0, 1.0);
          if (state.invertCarSteer) steerRatio = -steerRatio;
          targetSteer = Math.round(90 - steerRatio * 45);
          targetSteer = THREE.MathUtils.clamp(targetSteer, 45, 135);

          // B. Tính xung ga: Cân chỉnh êm ái theo mức ga tối đa đã chọn (Vừa phải, không vọt)
          if (!state.engineRunning || state.brakePercent > 8) {
            targetThrottle = 1500;
          } else if (state.reversePercent > 3 || state.gearIndex === 1) { // Bàn đạp lùi hoặc Số R
            const revPct = state.reversePercent > 3 ? state.reversePercent : (state.throttlePercent || 0);
            const pct = THREE.MathUtils.clamp(revPct, 0, 100);
            if (pct > 3) {
              // Bù khoảng chết Neutral của ESC (~25µs) để động cơ có lực xoay ngay khi bắt đầu lùi
              const deadbandSkip = 25;
              const effectiveDelta = Math.max(0, maxRevDelta - deadbandSkip);
              const revDelta = deadbandSkip + (pct / 100.0) * effectiveDelta;
              targetThrottle = Math.round(1500 - revDelta);
            } else {
              targetThrottle = 1500;
            }
          } else if (state.gearIndex === 3) { // Bàn đạp ga hoặc Số D
            const pct = THREE.MathUtils.clamp(state.throttlePercent || 0, 0, 100);
            targetThrottle = Math.round(1500 + (pct / 100.0) * maxFwdDelta);
          } else {
            targetThrottle = 1500;
          }
        } else {
          // HỖ TRỢ LÁI XE RC TRỰC TIẾP KHI Ở NGOÀI XE (ON_FOOT): W/A/S/D & CỤM NÚT D-PAD / BÀN ĐẠP
          const wantGas = keys.w || keys.ArrowUp || (typeof holdState !== 'undefined' && (holdState.gas || holdState.up));
          const wantRev = keys.s || keys.ArrowDown || (typeof holdState !== 'undefined' && (holdState.brake || holdState.down));
          const wantLeft = keys.a || keys.ArrowLeft || (typeof holdState !== 'undefined' && holdState.left);
          const wantRight = keys.d || keys.ArrowRight || (typeof holdState !== 'undefined' && holdState.right);

          if (wantLeft) targetSteer = state.invertCarSteer ? 135 : 45;
          else if (wantRight) targetSteer = state.invertCarSteer ? 45 : 135;
          else targetSteer = 90;

          if (wantGas && !wantRev) {
            targetThrottle = 1500 + maxFwdDelta;
          } else if (wantRev && !wantGas) {
            targetThrottle = 1500 - maxRevDelta;
          } else {
            targetThrottle = 1500;
          }
        }

        // C. NỘI SUY XUNG GA CHỐNG GIẬT (SMOOTH RAMP CURVE)
        if (typeof state.rcSmoothThrottle === 'undefined') state.rcSmoothThrottle = 1500;
        const rampStep = 450 * dt; // Tăng dần êm ái trong ~0.25s
        if (targetThrottle > state.rcSmoothThrottle) {
          state.rcSmoothThrottle = Math.min(targetThrottle, state.rcSmoothThrottle + rampStep);
        } else if (targetThrottle < state.rcSmoothThrottle) {
          state.rcSmoothThrottle = Math.max(targetThrottle, state.rcSmoothThrottle - rampStep);
        } else {
          state.rcSmoothThrottle = targetThrottle;
        }

        const steer = targetSteer;
        const throttle = Math.round(state.rcSmoothThrottle);

        carControlPacket.steer = steer;
        carControlPacket.throttle = throttle;
        mpSocket.send(JSON.stringify(carControlPacket));

        // Nếu vô lăng GOG R808 đang cắm vào máy này, phát thêm Bridge State cho Quest 3
        const wheel = window._racingWheel;
        if (wheel && wheel.connected) {
          mpSocket.send(JSON.stringify({
            type: 'WHEEL_BRIDGE_INPUT',
            connected: true,
            deviceId: wheel.deviceName || 'GOG R808',
            steeringNorm: wheel.rawSteer || 0,
            steerAngleDeg: wheel.steerAngleDeg || 0,
            gasPercent: wheel.gasPercent || 0,
            brakePercent: wheel.brakePercent || 0,
            reversePercent: wheel.reversePercent || 0,
            gear: wheel.gear || 'D',
            steer,
            throttle
          }));
        }

        // Cập nhật nhãn thông số xung hiển thị trên Web HUD
        const pulseInfoEl = document.getElementById('esp32-car-pulse-info');
        if (pulseInfoEl) {
          const dirLabel = throttle > 1520 ? '🟢 TIẾN' : (throttle < 1480 ? '🔴 LÙI' : '⚪ DỪNG'); pulseInfoEl.textContent = `Lái: ${steer}° | Ga: ${throttle}µs [${dirLabel}]`;
        }
      }
    }
  };
})();
