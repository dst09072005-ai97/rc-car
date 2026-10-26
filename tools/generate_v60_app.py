#!/usr/bin/env python3
"""
tools/generate_v60_app.py
Generates the complete, unified www/app.js incorporating all requirements and code from:
- Guide V1/V18: GLTFLoader (rolls_royce_cabin.glb), ESP32 createImageBitmap worker, draggable handles, 90 FPS WebXR
- Guide V20: 4 luxury ergonomic cushioned seats, curved 3-tier dashboard, vector RR monogram, Quest 3 A/B/X/Y controller mapping, whisper-quiet idle V12 sound, rigid-body collision solver with bounce-back
- Guide V30: Start/Stop engine, 4 coach doors opening/closing, convertible roof, wipers, 4-seat POV switcher
- Guide V60: PCF Soft Shadow mapping, volumetric headlight beams, multi-modal traffic (cars, buses, motorbikes & bicycles with safety helmets), smart conditional horn AI, sidewalk pedestrians with handshake "Hello" interaction, animals (dogs, cats, landing birds), weather lighting modes (clear night, sunset, rain, day).
"""

import os
import sys

TARGET_APP = r"D:\XE_RC_FPV_V10\www\app.js"

code = '''import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================================
// 1. SCENE, RENDERER CÓ ĐỔ BÓNG THỜI GIAN THỰC (PCF SOFT SHADOW) & VR BLINK
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);
scene.fog = new THREE.FogExp2(0x050811, 0.0065);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 380);

// Màn chập chớp mắt VR khi đổi ghế hoặc chuyển trạng thái
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

document.body.appendChild(
  VRButton.createButton(renderer, {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
  })
);

// Ánh sáng bầu trời và đèn mặt trời / mặt trăng đổ bóng toàn cảnh
const hemiLight = new THREE.HemisphereLight(0x6688cc, 0x10141f, 0.75);
scene.add(hemiLight);

const mainShadowLight = new THREE.DirectionalLight(0xaaccff, 1.45);
mainShadowLight.position.set(40, 75, 30);
mainShadowLight.castShadow = true;
mainShadowLight.shadow.mapSize.width = 2048;
mainShadowLight.shadow.mapSize.height = 2048;
mainShadowLight.shadow.camera.near = 1;
mainShadowLight.shadow.camera.far = 220;
const dCam = 60;
mainShadowLight.shadow.camera.left = -dCam;
mainShadowLight.shadow.camera.right = dCam;
mainShadowLight.shadow.camera.top = dCam;
mainShadowLight.shadow.camera.bottom = -dCam;
mainShadowLight.shadow.bias = -0.0004;
scene.add(mainShadowLight);
scene.add(mainShadowLight.target);

function enableShadowsRecursive(obj, cast = true, receive = true) {
  obj.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = cast;
      n.receiveShadow = receive;
    }
  });
}

// ============================================================================
// 2. GỐC TỌA ĐỘ XE ROLLS-ROYCE & 4 VỊ TRÍ GHẾ NGỒI CÔNG THÁI HỌC
// ============================================================================
const vehicleRoot = new THREE.Group();
scene.add(vehicleRoot);

const chassisGroup = new THREE.Group();
vehicleRoot.add(chassisGroup);

// 4 Vị trí ghế ngồi trong xe Rolls-Royce
const SEAT_POSITIONS = [
  { name: 'Ghế Tài Xế (Driver)', pos: new THREE.Vector3(-0.42, 1.12, 0.12) },
  { name: 'Ghế Phụ Trước (Passenger)', pos: new THREE.Vector3(0.42, 1.12, 0.12) },
  { name: 'Ghế Thương Gia Sau Trái (Rear Left)', pos: new THREE.Vector3(-0.42, 1.12, 1.02) },
  { name: 'Ghế Thương Gia Sau Phải (Rear Right)', pos: new THREE.Vector3(0.42, 1.12, 1.02) }
];

const driverSeatMount = new THREE.Group();
driverSeatMount.position.copy(SEAT_POSITIONS[0].pos);
chassisGroup.add(driverSeatMount);

// Biểu tượng beacon trên nóc xe Rolls-Royce khi đi bộ
const roofBeaconGroup = new THREE.Group();
roofBeaconGroup.position.set(0, 1.95, 0.15);
chassisGroup.add(roofBeaconGroup);
const beaconDiamond = new THREE.Mesh(
  new THREE.ConeGeometry(0.18, 0.38, 4),
  new THREE.MeshBasicMaterial({ color: 0x00ff88 })
);
beaconDiamond.rotation.x = Math.PI;
roofBeaconGroup.add(beaconDiamond);
roofBeaconGroup.visible = false;

// Nhân vật Meta Avatar của người chơi (dùng cho chế độ ON_FOOT đi bộ)
const playerAvatarGroup = new THREE.Group();
playerAvatarGroup.position.set(8.5, 0, 4.0);
scene.add(playerAvatarGroup);

let avatarLeftLeg = null;
let avatarRightLeg = null;
let avatarLeftArm = null;
let avatarRightArm = null;
let avatarBodyMesh = null;

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
  playerAvatarGroup.add(avatarLeftArm, avatarRightArm);

  avatarBodyMesh.visible = false; // Mặc định ở chế độ DRIVING
  enableShadowsRecursive(playerAvatarGroup, true, true);
}
buildPlayerMetaAvatar();

const cameraRig = new THREE.Group();
// Khởi tạo gắn vào driverSeatMount
driverSeatMount.add(cameraRig);
cameraRig.add(camera);
cameraRig.position.set(0, 0, 0);

// ============================================================================
// 3. VẬT LIỆU PBR SIÊU SANG ROLLS-ROYCE & ĐÈN PHA VOLUMETRIC
// ============================================================================
const matBodyPaint = new THREE.MeshPhysicalMaterial({
  color: 0x090d16,
  metalness: 0.85,
  roughness: 0.12,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05
});
const matNappa = new THREE.MeshStandardMaterial({ color: 0xdfd1be, roughness: 0.42 });
const matNappaPiping = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.5 });
const matWalnut = new THREE.MeshPhysicalMaterial({ color: 0x361f12, roughness: 0.06, clearcoat: 1.0 });
const matChrome = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.12, metalness: 0.95 });
const matPiano = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05 });
const matRoofFabric = new THREE.MeshStandardMaterial({ color: 0x161922, roughness: 0.85 });
const matTireRubber = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.88 });

// Khối nón ánh sáng khúc xạ bán trong suốt (Volumetric Light Cone) cho đèn pha
function createHeadlightRefractionBeam(length = 18, radius = 2.4, colorHex = 0xfffaed) {
  const geo = new THREE.ConeGeometry(radius, length, 16, 1, true);
  geo.translate(0, -length / 2, 0);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  return new THREE.Mesh(geo, mat);
}

// Đèn pha trước xe chiếu sáng mặt đường
const headlightL = new THREE.SpotLight(0xffffff, 22, 75, Math.PI / 5, 0.45, 1.2);
headlightL.position.set(-0.68, 0.65, -1.8);
headlightL.target.position.set(-0.68, 0.1, -22);
headlightL.castShadow = true;
chassisGroup.add(headlightL, headlightL.target);

const headlightR = new THREE.SpotLight(0xffffff, 22, 75, Math.PI / 5, 0.45, 1.2);
headlightR.position.set(0.68, 0.65, -1.8);
headlightR.target.position.set(0.68, 0.1, -22);
headlightR.castShadow = true;
chassisGroup.add(headlightR, headlightR.target);

const beamL = createHeadlightRefractionBeam(24, 3.2);
beamL.position.set(-0.68, 0.65, -1.85);
chassisGroup.add(beamL);
vehicleLightBeams.push(beamL);

const beamR = createHeadlightRefractionBeam(24, 3.2);
beamR.position.set(0.68, 0.65, -1.85);
chassisGroup.add(beamR);
vehicleLightBeams.push(beamR);

// Đèn trần nội thất
const cabinDomeLight = new THREE.PointLight(0xffeedd, 1.2, 3.6);
cabinDomeLight.position.set(0, 1.28, 0.15);
chassisGroup.add(cabinDomeLight);

// ============================================================================
// 4. TRẠNG THÁI HỆ THỐNG XE, AN NINH & ĐIỀU KHIỂN
// ============================================================================
// Các mảng quản lý nguồn sáng & hiệu ứng thể tích
const streetLightCones = [];
const streetPointLights = [];
const vehicleLightBeams = [];

const vehicleState = {
  seatIndex: 0,
  playerMode: 'DRIVING', // 'DRIVING' | 'ON_FOOT'
  isBlinking: false,
  blinkTargetOpacity: 0.0,
  avatarPos: new THREE.Vector3(8.5, 0, 4.0),
  avatarYaw: 0.4,
  avatarWalkPhase: 0,
  distanceToCarDoor: 4.5,
  rcConnected: true,
  rcSpeedRatio: 1.0,
  rcSteerSensitivity: 1.0,
  suspensionShakeIntensity: 0,
  suspensionShakePhase: 0,
  esp32Url: 'ws://192.168.4.102:4213',
  signalConnected: false,
  streamFps: 0,
  vrFps: 90,
  speedKmh: 0,
  velocityMs: 0,
  headingRad: 0,
  steeringAngleDeg: 0,
  throttlePercent: 0,
  brakePercent: 0,
  rpm: 650,
  gears: ['P', 'R', 'N', 'D'],
  gearIndex: 3, // Khởi động sẵn ở D
  engineRunning: true,
  turnSignal: 0, // 0: Tắt, 1: Trái, 2: Phải, 3: Hazard
  turnSignalTimer: 0,
  wipersActive: false,
  wiperPhase: 0,
  doorsOpen: false,
  doorAnimAngle: 0,
  convertibleRoofOpen: false,
  roofAnimAngle: 0,
  weatherMode: 'night',
  nightLightsActive: true,
  hornActive: false,
  collisionCooldown: 0,
  lastActionLog: 'Sẵn sàng - Đang ở số [D], Bóp Cò Phải để tăng tốc!',
  activeSeat: 0,
  windshieldFilterMode: 0,
  windshieldTransparent: true,
  cinemaOnWindshield: false,
  mediaPlaying: false,
  mediaVolume: 80,
  currentChannelIdx: 0
};

// ============================================================================
// 5. HỆ THỐNG ÂM THANH 3D: V12 ÊM ÁI KHI ĐỖ, CÒI XE, TIẾNG VA CHẠM, THÚ CƯNG
// ============================================================================
let audioCtx = null;
let v12Osc1 = null;
let v12Osc2 = null;
let v12Osc3 = null;
let v12GainNode = null;
let v12FilterNode = null;
let roadNoiseNode = null;
let roadNoiseGain = null;
let audioAnalyser = null;
let frequencyData = null;

function initSpatialAudioSystem() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    v12FilterNode = audioCtx.createBiquadFilter();
    v12FilterNode.type = 'lowpass';
    v12FilterNode.frequency.setValueAtTime(320, audioCtx.currentTime);

    v12GainNode = audioCtx.createGain();
    v12GainNode.gain.setValueAtTime(0.04, audioCtx.currentTime); // Whisper-quiet idle khi đỗ xe

    v12Osc1 = audioCtx.createOscillator();
    v12Osc1.type = 'sawtooth';
    v12Osc1.frequency.setValueAtTime(38, audioCtx.currentTime);

    v12Osc2 = audioCtx.createOscillator();
    v12Osc2.type = 'triangle';
    v12Osc2.frequency.setValueAtTime(76, audioCtx.currentTime);

    v12Osc3 = audioCtx.createOscillator();
    v12Osc3.type = 'sine';
    v12Osc3.frequency.setValueAtTime(114, audioCtx.currentTime);

    v12Osc1.connect(v12FilterNode);
    v12Osc2.connect(v12FilterNode);
    v12Osc3.connect(v12FilterNode);
    v12FilterNode.connect(v12GainNode);
    v12GainNode.connect(audioCtx.destination);

    v12Osc1.start();
    v12Osc2.start();
    v12Osc3.start();

    // Tiếng ma sát lốp xe với mặt đường
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.25;
    }
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(260, audioCtx.currentTime);

    roadNoiseGain = audioCtx.createGain();
    roadNoiseGain.gain.setValueAtTime(0, audioCtx.currentTime);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(roadNoiseGain);
    roadNoiseGain.connect(audioCtx.destination);
    whiteNoise.start();

    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 64;
    frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
    v12GainNode.connect(audioAnalyser);

    console.log('[Audio] 3D Spatial Audio System online.');
  } catch (err) {
    console.warn('[Audio] Web Audio API init note:', err);
  }
}

function updateEngineAudio(dt) {
  if (!audioCtx || !v12GainNode) return;
  const targetRpm = vehicleState.engineRunning
    ? 650 + (vehicleState.throttlePercent / 100) * 4800
    : 0;
  vehicleState.rpm = THREE.MathUtils.lerp(vehicleState.rpm, targetRpm, dt * 5.5);

  const baseFreq = Math.max(12, (vehicleState.rpm / 60) * 3.5);
  v12Osc1.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.04);
  v12Osc2.frequency.setTargetAtTime(baseFreq * 2.0, audioCtx.currentTime, 0.04);
  v12Osc3.frequency.setTargetAtTime(baseFreq * 3.0, audioCtx.currentTime, 0.04);

  // Whisper-quiet khi dừng xe ở 0 km/h: âm lượng giảm cực êm để không nhức đầu
  const isParked = Math.abs(vehicleState.speedKmh) < 1.0 && vehicleState.throttlePercent < 2;
  const targetGain = vehicleState.engineRunning
    ? (isParked ? 0.035 : 0.06 + (vehicleState.throttlePercent / 100) * 0.16)
    : 0;
  v12GainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);

  const filterFreq = 280 + (vehicleState.throttlePercent / 100) * 1200;
  v12FilterNode.frequency.setTargetAtTime(filterFreq, audioCtx.currentTime, 0.05);

  if (roadNoiseGain) {
    const roadGain = Math.min(0.09, (Math.abs(vehicleState.speedKmh) / 120) * 0.09);
    roadNoiseGain.gain.setTargetAtTime(roadGain, audioCtx.currentTime, 0.08);
  }
}

function playCrashSound3D(impactSpeed = 10) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(28, audioCtx.currentTime + 0.35);

    const vol = Math.min(0.5, 0.15 + (impactSpeed / 30) * 0.35);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.38);
  } catch (e) {}
}

function playDualHornSound() {
  if (!audioCtx) return;
  try {
    [370, 466].forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.58);
    });
  } catch (e) {}
}

function playSmartVehicleHornSound(category) {
  if (!audioCtx) return;
  try {
    if (category === 'BICYCLE') {
      [1450, 1850].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.12);
        g.gain.setValueAtTime(0.08, audioCtx.currentTime + idx * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.12 + 0.22);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.12);
        osc.stop(audioCtx.currentTime + idx * 0.12 + 0.24);
      });
    } else if (category === 'MOTORBIKE') {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, audioCtx.currentTime);
      g.gain.setValueAtTime(0.09, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.30);
    } else {
      [310, 390].forEach((freq) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        g.gain.setValueAtTime(0.10, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.48);
      });
    }
  } catch (e) {}
}

function playAnimalSound(species) {
  if (!audioCtx) return;
  try {
    if (species === 'DOG') {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(95, audioCtx.currentTime + 0.22);
      g.gain.setValueAtTime(0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.24);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } else if (species === 'CAT') {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(680, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(920, audioCtx.currentTime + 0.18);
      osc.frequency.exponentialRampToValueAtTime(510, audioCtx.currentTime + 0.42);
      g.gain.setValueAtTime(0.09, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.44);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.46);
    } else {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(2900, audioCtx.currentTime + 0.08);
      g.gain.setValueAtTime(0.06, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.14);
    }
  } catch (e) {}
}

function playHandshakeHelloSound() {
  if (!audioCtx) return;
  try {
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.09);
      g.gain.setValueAtTime(0.08, audioCtx.currentTime + idx * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.09 + 0.25);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + idx * 0.09);
      osc.stop(audioCtx.currentTime + idx * 0.09 + 0.27);
    });
  } catch (e) {}
}

// ============================================================================
// 6. HUY HIỆU LOGO ROLLS-ROYCE CHUẨN VECTOR & 4 GHẾ ĐỆM CAO CẤP
// ============================================================================
function createRollsRoyceMonogramTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  const radGrad = ctx.createRadialGradient(256, 256, 20, 256, 256, 250);
  radGrad.addColorStop(0, '#1c222d');
  radGrad.addColorStop(1, '#05070a');
  ctx.fillStyle = radGrad;
  ctx.beginPath();
  ctx.arc(256, 256, 250, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#e6e8ec';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(256, 256, 228, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(256, 256, 206, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 8;
  ctx.strokeRect(148, 86, 216, 340);

  ctx.fillStyle = '#e6e8ec';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('ROLLS', 256, 122);
  ctx.fillText('ROYCE', 256, 412);

  ctx.font = 'bold 215px Georgia, "Times New Roman", serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('R', 232, 315);
  ctx.fillStyle = '#d8dde6';
  ctx.fillText('R', 284, 342);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const cabinGroup = new THREE.Group();
chassisGroup.add(cabinGroup);

const steeringWheelPivot = new THREE.Group();
const doorPivots = [];
const interactiveButtons = [];
let throttlePedalMesh = null;
let brakePedalMesh = null;
let blinkerFrontL = null;
let blinkerFrontR = null;
let wiperLeftPivot = new THREE.Group();
let wiperRightPivot = new THREE.Group();
let convertibleRoofGroup = new THREE.Group();

function createErgonomicCushionedSeat(xPos, zPos) {
  const seat = new THREE.Group();
  seat.position.set(xPos, 0, zPos);

  // Đệm ngồi gồm 3 múi bo tròn
  for (let i = -1; i <= 1; i++) {
    const flute = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.36, 12, 16), matNappa);
    flute.rotation.x = Math.PI / 2;
    flute.scale.set(1.15, 1.0, 0.72);
    flute.position.set(i * 0.13, 0.30, 0.0);
    seat.add(flute);
  }

  const baseSupport = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.18, 24), matPiano);
  baseSupport.position.set(0, 0.16, 0.02);
  seat.add(baseSupport);

  [-0.23, 0.23].forEach((bx) => {
    const bolster = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.40, 12, 16), matNappa);
    bolster.rotation.x = Math.PI / 2;
    bolster.position.set(bx, 0.34, 0.0);
    seat.add(bolster);
  });

  // Tựa lưng thẳng công thái học nghiêng nhẹ 8 độ
  const backrest = new THREE.Group();
  backrest.position.set(0, 0.34, 0.22);
  backrest.rotation.x = THREE.MathUtils.degToRad(8);
  seat.add(backrest);

  for (let i = -1; i <= 1; i++) {
    const backFlute = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.52, 12, 16), matNappa);
    backFlute.scale.set(1.15, 1.0, 0.65);
    backFlute.position.set(i * 0.13, 0.32, 0);
    backrest.add(backFlute);
  }

  [-0.23, 0.23].forEach((bx) => {
    const shoulder = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.50, 12, 16), matNappa);
    shoulder.position.set(bx, 0.32, 0.03);
    backrest.add(shoulder);

    const piping = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.54, 8), matNappaPiping);
    piping.position.set(bx * 1.05, 0.32, 0.08);
    backrest.add(piping);
  });

  // Tựa đầu bo tròn sang trọng
  const headrest = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.16, 16, 16), matNappa);
  headrest.rotation.z = Math.PI / 2;
  headrest.scale.set(1.0, 1.0, 0.72);
  headrest.position.set(0, 0.72, -0.02);
  backrest.add(headrest);

  [-0.08, 0.08].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 12), matChrome);
    post.position.set(px, 0.62, 0);
    backrest.add(post);
  });

  enableShadowsRecursive(seat, true, true);
  cabinGroup.add(seat);
}

function create3DButton(parent, label, w, h, d, pos, onClick) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101520';
  ctx.fillRect(0, 0, 160, 64);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 156, 60);
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 21px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 80, 32);

  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
    matChrome, matChrome, matChrome, matChrome,
    new THREE.MeshBasicMaterial({ map: tex }),
    matPiano
  ]);
  mesh.position.copy(pos);
  mesh.userData = { isInteractiveButton: true, baseZ: pos.z, pressedOffset: 0, lastPoke: 0, onClick };
  parent.add(mesh);
  interactiveButtons.push(mesh);
  return mesh;
}

// Canvases cho màn hình YouTube và Camera lùi
const ytCanvas = document.createElement('canvas');
ytCanvas.width = 640;
ytCanvas.height = 340;
const ytCtx = ytCanvas.getContext('2d');
const ytTex = new THREE.CanvasTexture(ytCanvas);

const rearCamCanvas = document.createElement('canvas');
rearCamCanvas.width = 512;
rearCamCanvas.height = 256;
const rearCamCtx = rearCamCanvas.getContext('2d');
const rearCamTex = new THREE.CanvasTexture(rearCamCanvas);

function buildFullLuxuryCarAnd4Seats() {
  // Sàn xe
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.05, 3.1), matPiano);
  floor.position.set(0, 0.025, 0.25);
  cabinGroup.add(floor);

  // Nắp capo
  const hoodMain = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.16, 1.40), matBodyPaint);
  hoodMain.position.set(0, 0.62, -1.42);
  cabinGroup.add(hoodMain);

  // Biểu tượng Spirit of Ecstasy
  const hoodOrnament = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.11, 16), matChrome);
  hoodOrnament.position.set(0, 0.74, -2.06);
  hoodOrnament.rotation.x = -Math.PI / 5;
  cabinGroup.add(hoodOrnament);

  // Đèn xi-nhan trước
  const blinkerMatL = new THREE.MeshBasicMaterial({ color: 0x332200 });
  const blinkerMatR = new THREE.MeshBasicMaterial({ color: 0x332200 });
  blinkerFrontL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), blinkerMatL);
  blinkerFrontL.position.set(-0.88, 0.74, -2.02);
  blinkerFrontR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), blinkerMatR);
  blinkerFrontR.position.set(0.88, 0.74, -2.02);
  cabinGroup.add(blinkerFrontL, blinkerFrontR);

  // 4 Cửa xe đóng mở tự động
  [-0.96, 0.96].forEach((sideX) => {
    [-0.30, 0.85].forEach((doorZ, dIdx) => {
      const doorPivot = new THREE.Group();
      doorPivot.position.set(sideX, 0.38, doorZ - 0.5);
      doorPivot.userData = { sideSign: sideX < 0 ? -1 : 1 };
      cabinGroup.add(doorPivot);
      doorPivots.push(doorPivot);

      const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 0.95), matBodyPaint);
      doorMesh.position.set(0, 0, 0.47);
      doorPivot.add(doorMesh);

      const doorTrim = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.92, 8, 12), matNappa);
      doorTrim.rotation.x = Math.PI / 2;
      doorTrim.position.set(sideX * 0.03, 0.34, 0.47);
      doorPivot.add(doorTrim);
    });

    // Gương chiếu hậu 2 bên cửa
    const mirrorArm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.15, 12), matChrome);
    mirrorArm.rotation.z = Math.PI / 2;
    mirrorArm.position.set(sideX * 1.05, 0.78, -0.52);
    cabinGroup.add(mirrorArm);

    const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.10), new THREE.MeshBasicMaterial({ map: rearCamTex }));
    mirrorGlass.position.set(sideX * 1.14, 0.80, -0.45);
    mirrorGlass.rotation.y = sideX < 0 ? THREE.MathUtils.degToRad(18) : THREE.MathUtils.degToRad(-18);
    cabinGroup.add(mirrorGlass);
  });

  // Kính chắn gió & Gương chiếu hậu trong xe
  const centerMirror = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.075), new THREE.MeshBasicMaterial({ map: rearCamTex }));
  centerMirror.position.set(0, 1.30, -0.44);
  centerMirror.rotation.y = Math.PI;
  cabinGroup.add(centerMirror);

  // 2 Cần gạt nước mưa
  wiperLeftPivot.position.set(-0.45, 0.72, -0.76);
  const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.48, 0.015), matPiano);
  bladeL.position.set(0, 0.24, 0);
  wiperLeftPivot.add(bladeL);
  cabinGroup.add(wiperLeftPivot);

  wiperRightPivot.position.set(0.15, 0.72, -0.76);
  const bladeR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.48, 0.015), matPiano);
  bladeR.position.set(0, 0.24, 0);
  wiperRightPivot.add(bladeR);
  cabinGroup.add(wiperRightPivot);

  // Mui trần đóng/mở
  convertibleRoofGroup.position.set(0, 1.38, 1.45);
  cabinGroup.add(convertibleRoofGroup);
  const roofCanopy = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.05, 1.90), matRoofFabric);
  roofCanopy.position.set(0, 0.02, -0.95);
  convertibleRoofGroup.add(roofCanopy);

  // Táp-lô bo tròn công thái học
  const dashUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.80, 16, 24), matNappa);
  dashUpper.rotation.z = Math.PI / 2;
  dashUpper.position.set(0, 0.74, -0.56);
  cabinGroup.add(dashUpper);

  const dashFascia = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.82, 24), matWalnut);
  dashFascia.rotation.z = Math.PI / 2;
  dashFascia.scale.set(1.0, 1.0, 0.35);
  dashFascia.position.set(0, 0.64, -0.45);
  cabinGroup.add(dashFascia);

  // 4 Hốc gió điều hòa mạ chrome
  [-0.65, -0.22, 0.22, 0.65].forEach((vx) => {
    const vent = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 12, 24), matChrome);
    vent.position.set(vx, 0.63, -0.39);
    cabinGroup.add(vent);
  });

  // Bệ trung tâm
  const centerTunnel = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.55, 16, 24), matNappa);
  centerTunnel.rotation.x = Math.PI / 2;
  centerTunnel.position.set(0, 0.32, 0.35);
  cabinGroup.add(centerTunnel);

  // Cụm nút chọn số P - R - N - D trên bệ trung tâm
  const gearPositions = [
    { g: 'P', idx: 0, x: -0.075 },
    { g: 'R', idx: 1, x: -0.025 },
    { g: 'N', idx: 2, x:  0.025 },
    { g: 'D', idx: 3, x:  0.075 }
  ];
  gearPositions.forEach((item) => {
    create3DButton(cabinGroup, `[${item.g}]`, 0.044, 0.032, 0.015, new THREE.Vector3(item.x, 0.47, -0.15), () => {
      vehicleState.gearIndex = item.idx;
      vehicleState.lastActionLog = `Đã gạt cần sang số [${item.g}]`;
    });
  });

  // 4 Ghế ngồi đệm êm ái Nappa Leather
  createErgonomicCushionedSeat(-0.42, 0.12); // Tài xế
  createErgonomicCushionedSeat(0.42, 0.12);  // Phụ trước
  createErgonomicCushionedSeat(-0.42, 1.02); // Thương gia sau trái
  createErgonomicCushionedSeat(0.42, 1.02);  // Thương gia sau phải

  // Vô lăng tròn kèm huy hiệu [RR] Vector chính xác
  steeringWheelPivot.position.set(-0.42, 0.68, -0.25);
  steeringWheelPivot.rotation.x = THREE.MathUtils.degToRad(-23);
  cabinGroup.add(steeringWheelPivot);

  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.019, 24, 64), matNappa);
  steeringWheelPivot.add(wheelRim);

  const airbagHub = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.062, 0.038, 32), matNappa);
  airbagHub.rotation.x = Math.PI / 2;
  steeringWheelPivot.add(airbagHub);

  const hornBezel = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.004, 16, 48), matChrome);
  hornBezel.position.z = 0.021;
  steeringWheelPivot.add(hornBezel);

  const textureLoader = new THREE.TextureLoader();
  const rrLogoTex = createRollsRoyceMonogramTexture();
  const hornCapMat = new THREE.MeshBasicMaterial({ map: rrLogoTex });
  textureLoader.load('./textures/wheel_car.png', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    hornCapMat.map = tex;
    hornCapMat.needsUpdate = true;
  }, undefined, () => {
    // Giữ nguyên rrLogoTex procedural nếu ảnh không nạp được
  });
  const hornCap = new THREE.Mesh(new THREE.CircleGeometry(0.044, 48), hornCapMat);
  hornCap.position.z = 0.022;
  steeringWheelPivot.add(hornCap);

  // 3 Chấu vô lăng
  const spokeL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.046, 0.02), matPiano);
  spokeL.position.set(-0.115, -0.01, 0);
  const spokeR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.046, 0.02), matPiano);
  spokeR.position.set(0.115, -0.01, 0);
  const spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.02), matWalnut);
  spokeB.position.set(0, -0.115, 0);
  steeringWheelPivot.add(spokeL, spokeR, spokeB);

  // Màn hình YouTube trung tâm 14 inch
  const ytGroup = new THREE.Group();
  ytGroup.position.set(0.0, 0.73, -0.37);
  ytGroup.rotation.x = THREE.MathUtils.degToRad(-10);
  cabinGroup.add(ytGroup);

  const ytScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.18), new THREE.MeshBasicMaterial({ map: ytTex }));
  ytGroup.add(ytScreen);

  create3DButton(ytGroup, '⏯ PLAY', 0.08, 0.026, 0.01, new THREE.Vector3(-0.11, -0.11, 0.005), () => {
    vehicleState.mediaPlaying = !vehicleState.mediaPlaying;
    vehicleState.lastActionLog = vehicleState.mediaPlaying ? 'Bật phát Media/YouTube' : 'Tạm dừng Media';
  });
  create3DButton(ytGroup, '⏭ NEXT', 0.08, 0.026, 0.01, new THREE.Vector3(0.0, -0.11, 0.005), () => {
    vehicleState.currentChannelIdx = (vehicleState.currentChannelIdx + 1) % 3;
    vehicleState.lastActionLog = `Chuyển sang Kênh ${vehicleState.currentChannelIdx + 1}/3`;
  });
  create3DButton(ytGroup, '🌤 MUI XE', 0.08, 0.026, 0.01, new THREE.Vector3(0.11, -0.11, 0.005), () => {
    vehicleState.convertibleRoofOpen = !vehicleState.convertibleRoofOpen;
    vehicleState.lastActionLog = `Mui xe: ${vehicleState.convertibleRoofOpen ? 'Đang MỞ' : 'Đang ĐÓNG'}`;
  });

  // Màn hình Cam lùi / La bàn bên phải
  const rearScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.12), new THREE.MeshBasicMaterial({ map: rearCamTex }));
  rearScreen.position.set(0.42, 0.73, -0.37);
  rearScreen.rotation.x = THREE.MathUtils.degToRad(-10);
  cabinGroup.add(rearScreen);

  // Bàn đạp Ga & Phanh
  const pedalGeo = new THREE.BoxGeometry(0.06, 0.11, 0.015);
  brakePedalMesh = new THREE.Mesh(pedalGeo, matChrome);
  brakePedalMesh.position.set(-0.42, 0.12, -0.48);
  cabinGroup.add(brakePedalMesh);

  throttlePedalMesh = new THREE.Mesh(pedalGeo, matChrome);
  throttlePedalMesh.position.set(-0.30, 0.12, -0.48);
  cabinGroup.add(throttlePedalMesh);

  enableShadowsRecursive(cabinGroup, true, true);
}

buildFullLuxuryCarAnd4Seats();

// ============================================================================
// 7. GLTFLOADER NẠP ROLLS_ROYCE_CABIN.GLB (KIỂM TRA TÍNH TOÀN VẸN & CHẨN ĐOÁN)
// ============================================================================
// CHIẾN LƯỢC RENDER (RULE 3):
// Khoang lái Thủ công Sang trọng (Procedural Luxury Cabin) là đối tượng hoạt động chính
// (Authoritative active scene model) do tích hợp đầy đủ: 4 ghế da Nappa công thái học,
// 4 cửa mở suicide doors, mui xếp convertible, cần gạt mưa động, nút bấm 3D P-R-N-D và logo vector RR.
// Mô hình GLB rolls_royce_cabin.glb được nạp và phân tích cấu trúc lưới để kiểm tra
// pipeline tài nguyên 3D, cập nhật bảng chẩn đoán (Diagnostic Monitor), nhưng KHÔNG thêm
// vào scene đang render để triệt tiêu 100% hiện tượng trùng lặp hình học (Duplicate Cabin)
// và Z-fighting.
const gltfLoader = new GLTFLoader();
let gltfCabinModel = null;

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024;
hudCanvas.height = 768;
const hudCtx = hudCanvas.getContext('2d');
const hudTexture = new THREE.CanvasTexture(hudCanvas);

const wsCanvas = document.createElement('canvas');
wsCanvas.width = 1280;
wsCanvas.height = 720;
const wsCtx = wsCanvas.getContext('2d');
const wsTexture = new THREE.CanvasTexture(wsCanvas);

gltfLoader.load(
  './models/rolls_royce_cabin.glb',
  (gltf) => {
    gltfCabinModel = gltf.scene;
    let meshCount = 0;
    let vertexCount = 0;
    gltfCabinModel.traverse((node) => {
      if (node.isMesh) {
        meshCount++;
        if (node.geometry?.attributes?.position) vertexCount += node.geometry.attributes.position.count;
      }
    });

    runtimeDiagnostics.cabinStatus = `VERIFIED: ${meshCount} meshes, ${vertexCount.toLocaleString()} verts (Authoritative: Procedural 4-Seat)`;
    console.log(`[GLTF Pipeline] rolls_royce_cabin.glb verified: ${meshCount} meshes, ${vertexCount} vertices.`);
    updateDiagnosticDisplay();
  },
  undefined,
  (err) => {
    runtimeDiagnostics.cabinStatus = `FAILED: ${err.message || 'Network / Parser Error'}`;
    console.warn('[GLTF Loader Error]:', err);
    updateDiagnosticDisplay();
  }
);

// ============================================================================
// 8. BẢNG HUD TẬP TRUNG, KÍNH CHẮN GIÓ XR & CƠ CHẾ KÉO THẢ (DRAG & DROP)
// ============================================================================
const draggableHandles = [];
let activeGrabState = { interactor: null, panelGroup: null, distance: 1.0 };

function attachDragHandle(group, width, height) {
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.038, 0.024),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 })
  );
  handle.position.set(0, height / 2 + 0.032, 0);
  handle.userData = { isDragHandle: true, parentPanel: group };
  group.add(handle);
  draggableHandles.push(handle);
  return handle;
}

const hudPanelGroup = new THREE.Group();
hudPanelGroup.position.set(-0.42, 1.15, -0.65);
chassisGroup.add(hudPanelGroup);

const hudScreenMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.58, 0.38),
  new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, opacity: 0.96 })
);
hudPanelGroup.add(hudScreenMesh);
attachDragHandle(hudPanelGroup, 0.58, 0.38);

const windshieldGroup = new THREE.Group();
windshieldGroup.position.set(0, 1.18, -1.05);
chassisGroup.add(windshieldGroup);

const windshieldMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.48, 0.68),
  new THREE.MeshBasicMaterial({ map: wsTexture, transparent: true, opacity: 0.92 })
);
windshieldGroup.add(windshieldMesh);
attachDragHandle(windshieldGroup, 1.48, 0.68);

// ============================================================================
// 9. THÀNH PHỐ 3D VÔ TẬN & HỆ THỐNG VA CHẠM HẤT VĂNG (RIGID-BODY BOUNCE)
// ============================================================================
const cityGroup = new THREE.Group();
scene.add(cityGroup);

const BLOCK_SIZE = 60;
const GRID_RADIUS = 3;
const cityBlocks = [];
const matRoad = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.88 });
const matSidewalk = new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.72 });
const matTreeTrunk = new THREE.MeshStandardMaterial({ color: 0x2d1e14, roughness: 0.85 });
const matTreeCrown = new THREE.MeshStandardMaterial({ color: 0x1a3820, roughness: 0.65 });

function createWindowTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b101c';
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

function createCityBlock(gx, gz) {
  const block = new THREE.Group();
  const localObstacles = [];

  const road = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE, BLOCK_SIZE), matRoad);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  block.add(road);

  // Vỉa hè
  [-11.5, 11.5].forEach((sx) => {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.22, BLOCK_SIZE), matSidewalk);
    sw.position.set(sx, 0.11, 0);
    sw.receiveShadow = true;
    block.add(sw);
  });

  // Tòa nhà cao tầng và cây cối
  [-18.5, 18.5].forEach((bx) => {
    [-18.5, 18.5].forEach((bz) => {
      const bH = 18 + Math.random() * 38;
      const bMesh = new THREE.Mesh(
        new THREE.BoxGeometry(14, bH, 14),
        new THREE.MeshStandardMaterial({ map: buildingTex, roughness: 0.35 })
      );
      bMesh.position.set(bx, bH / 2 + 0.22, bz);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      block.add(bMesh);

      localObstacles.push({ type: 'Tòa Nhà Cao Tầng', localX: bx, localZ: bz, halfW: 8.0, halfD: 8.0 });
    });
  });

  // Cột đèn đường chiếu sáng ban đêm
  [-10.2, 10.2].forEach((lx) => {
    [-14, 14].forEach((lz) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.5, 8), matPiano);
      pole.position.set(lx, 2.75, lz);
      pole.castShadow = true;
      block.add(pole);

      const lampLight = new THREE.PointLight(0xffeedd, 1.1, 14);
      lampLight.position.set(lx, 5.2, lz);
      block.add(lampLight);
      streetPointLights.push(lampLight);

      const lampBeam = createHeadlightRefractionBeam(6.5, 2.0, 0xffd180);
      lampBeam.position.set(lx, 5.2, lz);
      lampBeam.userData.isVolumetricBeam = true;
      block.add(lampBeam);
      streetLightCones.push(lampBeam);
    });
  });

  block.userData = { gridX: gx, gridZ: gz, obstacles: localObstacles };
  block.position.set(gx * BLOCK_SIZE, 0, gz * BLOCK_SIZE);
  cityGroup.add(block);
  return block;
}

for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
  for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
    cityBlocks.push(createCityBlock(gx, gz));
  }
}

function checkAndResolveCityCollisions() {
  const carX = vehicleRoot.position.x;
  const carZ = vehicleRoot.position.z;
  const carGridX = Math.round(carX / BLOCK_SIZE);
  const carGridZ = Math.round(carZ / BLOCK_SIZE);
  const span = GRID_RADIUS * 2 + 1;

  for (const block of cityBlocks) {
    let dx = block.userData.gridX - carGridX;
    let dz = block.userData.gridZ - carGridZ;
    if (dx > GRID_RADIUS) block.userData.gridX -= span;
    else if (dx < -GRID_RADIUS) block.userData.gridX += span;
    if (dz > GRID_RADIUS) block.userData.gridZ -= span;
    else if (dz < -GRID_RADIUS) block.userData.gridZ += span;

    const bx = block.userData.gridX * BLOCK_SIZE;
    const bz = block.userData.gridZ * BLOCK_SIZE;
    block.position.set(bx, 0, bz);

    if (Math.abs(block.userData.gridX - carGridX) <= 1 && Math.abs(block.userData.gridZ - carGridZ) <= 1) {
      for (const obs of block.userData.obstacles) {
        const ox = bx + obs.localX;
        const oz = bz + obs.localZ;
        const distX = carX - ox;
        const distZ = carZ - oz;

        if (Math.abs(distX) < obs.halfW && Math.abs(distZ) < obs.halfD) {
          const overlapX = obs.halfW - Math.abs(distX);
          const overlapZ = obs.halfD - Math.abs(distZ);

          if (overlapX < overlapZ) {
            vehicleRoot.position.x += distX > 0 ? overlapX + 0.35 : -(overlapX + 0.35);
          } else {
            vehicleRoot.position.z += distZ > 0 ? overlapZ + 0.35 : -(overlapZ + 0.35);
          }

          const impactSpeed = Math.abs(vehicleState.velocityMs);
          vehicleState.velocityMs = -Math.sign(vehicleState.velocityMs || 1) * Math.max(5.5, impactSpeed * 0.65);
          vehicleState.throttlePercent = 0;
          vehicleState.turnSignal = 3; // Bật đèn khẩn cấp Hazard
          vehicleState.lastActionLog = `💥 ĐỤNG ${obs.type.toUpperCase()}! Bị hất văng & phanh khẩn cấp!`;

          playCrashSound3D(impactSpeed);
          triggerDualControllerHaptics(1.0, 200);
          return;
        }
      }
    }
  }
}

// ============================================================================
// 10. GIAO THÔNG ĐA PHƯƠNG TIỆN (XE ĐẠP, XE MÁY, Ô TÔ) VÀ CÒI THÔNG MINH
// ============================================================================
const allTrafficVehicles = [];

// Hàm tạo nhãn 3D nổi trên nóc phương tiện khi đang Bóp Còi
function createHornAlertBadge(text, borderColor = '#ffd60a') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 20, 32, 0.92)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, 252, 60);
  ctx.fillStyle = borderColor;
  ctx.font = 'bold 24px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 41);

  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.24),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, side: THREE.DoubleSide })
  );
  badge.visible = false;
  return badge;
}

// Bong bóng hội thoại tương tác xã hội (Speech Bubble)
function createSpeechBubbleMesh(text, bgHex = '#0f243c', borderHex = '#4cd964') {
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

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.25),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, side: THREE.DoubleSide })
  );
  mesh.visible = false;
  return mesh;
}

function createSafetyHelmetMesh(helmetColor, isMotorbike = true) {
  const helmet = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.68),
    new THREE.MeshPhysicalMaterial({ color: helmetColor, roughness: 0.2, clearcoat: 1.0 })
  );
  helmet.add(shell);

  if (isMotorbike) {
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.158, 0.158, 0.09, 16, 1, true, -Math.PI * 0.35, Math.PI * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x111824, roughness: 0.1, metalness: 0.8 })
    );
    visor.rotation.y = Math.PI;
    visor.position.y = -0.02;
    helmet.add(visor);
  }
  return helmet;
}

function spawnTrafficFleet() {
  // 1. Xe Đạp có nón bảo hiểm (Làn trong X = ±6.5m)
  for (let i = 0; i < 6; i++) {
    const bike = new THREE.Group();
    const wheelGeo = new THREE.TorusGeometry(0.30, 0.028, 10, 24);
    const fw = new THREE.Mesh(wheelGeo, matTireRubber);
    fw.rotation.y = Math.PI / 2;
    fw.position.set(0, 0.32, -0.52);
    const rw = new THREE.Mesh(wheelGeo, matTireRubber);
    rw.rotation.y = Math.PI / 2;
    rw.position.set(0, 0.32, 0.52);
    bike.add(fw, rw);

    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.05, 8), matChrome);
    frame.rotation.x = Math.PI / 2;
    frame.position.set(0, 0.52, 0);
    bike.add(frame);

    const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), matNappa);
    riderHead.position.set(0, 1.42, -0.02);
    bike.add(riderHead);

    const helmet = createSafetyHelmetMesh(0xffbe0b, false);
    helmet.position.set(0, 1.46, -0.02);
    bike.add(helmet);

    const dir = i % 2 === 0 ? 1 : -1;
    bike.position.set(dir * 6.5, 0, (i - 3) * 26);
    bike.rotation.y = dir > 0 ? 0 : Math.PI;

    enableShadowsRecursive(bike, true, true);
    const hornBadge = createHornAlertBadge('🔔 KENG KENG!', '#00ff88');
    hornBadge.position.set(0, 1.85, 0);
    bike.add(hornBadge);
    bike.userData = { category: 'BICYCLE', dir, baseSpeed: 4.5, currentSpeed: 4.5, hornCooldown: 0, frontWheel: fw, rearWheel: rw, hornBadge };
    scene.add(bike);
    allTrafficVehicles.push(bike);
  }

  // 2. Xe Máy có nón bảo hiểm Full-Face (Làn giữa X = ±4.2m)
  for (let i = 0; i < 6; i++) {
    const moto = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 1.6), matBodyPaint);
    body.position.set(0, 0.48, 0);
    moto.add(body);

    const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 8, 12), matPiano);
    rider.position.set(0, 1.05, -0.05);
    moto.add(rider);

    const helmet = createSafetyHelmetMesh(0xff3b30, true);
    helmet.position.set(0, 1.45, -0.05);
    moto.add(helmet);

    const dir = i % 2 === 0 ? 1 : -1;
    moto.position.set(dir * 4.2, 0, (i - 3) * 32);
    moto.rotation.y = dir > 0 ? 0 : Math.PI;

    enableShadowsRecursive(moto, true, true);
    const hornBadge = createHornAlertBadge('📢 BÍP BÍP!', '#00e5ff');
    hornBadge.position.set(0, 1.92, 0);
    moto.add(hornBadge);
    moto.userData = { category: 'MOTORBIKE', dir, baseSpeed: 10.5, currentSpeed: 10.5, hornCooldown: 0, hornBadge };
    scene.add(moto);
    allTrafficVehicles.push(moto);
  }

  // 3. Ô tô & Xe Buýt (Làn chính X = ±1.8m)
  for (let i = 0; i < 6; i++) {
    const car = new THREE.Group();
    const isBus = (i % 3 === 0);
    const carW = isBus ? 2.4 : 1.85;
    const carH = isBus ? 2.8 : 1.35;
    const carL = isBus ? 8.2 : 4.4;
    const carMesh = new THREE.Mesh(
      new THREE.BoxGeometry(carW, carH, carL),
      new THREE.MeshStandardMaterial({ color: isBus ? 0x2b5c8f : (i % 2 === 0 ? 0x8a1c14 : 0x22262d), roughness: 0.35 })
    );
    carMesh.position.set(0, carH / 2 + 0.15, 0);
    car.add(carMesh);

    const dir = i % 2 === 0 ? 1 : -1;
    car.position.set(dir * 1.8, 0, (i - 3) * 38);
    car.rotation.y = dir > 0 ? 0 : Math.PI;

    enableShadowsRecursive(car, true, true);
    const hornBadge = createHornAlertBadge('📢 PÍ PO! CÒI Ô TÔ!', '#ff9500');
    hornBadge.position.set(0, carH + 0.5, 0);
    car.add(hornBadge);
    car.userData = { category: 'CAR', dir, baseSpeed: 13.0, currentSpeed: 13.0, hornCooldown: 0, hornBadge };
    scene.add(car);
    allTrafficVehicles.push(car);
  }
}
spawnTrafficFleet();

// ============================================================================
// 11. NPC ĐI BỘ TRÊN VỈA HÈ (BẮT TAY HELLO) & ĐỘNG VẬT QUA ĐƯỜNG, CHIM ĐÁP
// ============================================================================
const sidewalkNpcs = [];
const crossingAnimals = [];
let playerHandshakeTimer = 0;

function spawnPedestriansAndAnimals() {
  // Người đi bộ trên vỉa hè
  for (let i = 0; i < 14; i++) {
    const npc = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 8, 12), matNappa);
    body.position.set(0, 1.15, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), matNappaPiping);
    head.position.set(0, 1.55, 0);
    const rArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.42, 8, 8), matNappa);
    rArm.position.set(0.22, 1.15, 0);
    npc.add(body, head, rArm);

    const helloBubble = createSpeechBubbleMesh('🤝 Hello! Rất vui được gặp bạn!');
    helloBubble.position.set(0, 1.98, 0);
    npc.add(helloBubble);

    const side = i % 2 === 0 ? 1 : -1;
    npc.position.set(side * 10.6, 0.12, (i - 7) * 16);
    enableShadowsRecursive(npc, true, true);

    npc.userData = { rArm, helloBubble, dir: side, speed: 1.3, handshakeTimer: 0 };
    scene.add(npc);
    sidewalkNpcs.push(npc);
  }

  // Chó & Mèo băng qua đường
  for (let i = 0; i < 6; i++) {
    const isDog = (i % 2 === 0);
    const animal = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.12, 0.36, 8, 8),
      new THREE.MeshStandardMaterial({ color: isDog ? 0xb07d4b : 0xe8e8ea, roughness: 0.6 })
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.26;
    animal.add(body);

    const soundBubble = createSpeechBubbleMesh(
      isDog ? '🐕 Gâu gâu! Woof!' : '🐈 Meo meo~ Purr~',
      '#24190e',
      '#ffd60a'
    );
    soundBubble.position.set(0, 0.85, 0);
    animal.add(soundBubble);

    const crossDir = i % 2 === 0 ? 1 : -1;
    animal.position.set(-crossDir * 3.5, 0.02, (i - 3) * 20);
    animal.rotation.y = crossDir > 0 ? Math.PI / 2 : -Math.PI / 2;

    enableShadowsRecursive(animal, true, true);
    animal.userData = { species: isDog ? 'DOG' : 'CAT', soundBubble, soundTimer: 0, crossDir, crossSpeed: 0.65, isOnRoad: true };
    scene.add(animal);
    crossingAnimals.push(animal);
  }

  // Đàn chim sà xuống mặt đường
  for (let b = 0; b < 8; b++) {
    const bird = new THREE.Group();
    const bMesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x4a7c59 }));
    bMesh.rotation.x = -Math.PI / 2;
    bMesh.position.y = 0.10;
    bird.add(bMesh);

    const chirpBubble = createSpeechBubbleMesh('🐦 Chíp chíp!', '#102820', '#00ff88');
    chirpBubble.position.set(0, 0.65, 0);
    bird.add(chirpBubble);

    bird.position.set((b % 3 - 1) * 3.0, 0.04, (b - 4) * 18);
    enableShadowsRecursive(bird, true, true);
    bird.userData = { species: 'BIRD', soundBubble: chirpBubble, soundTimer: 0, state: 'WALK', timer: 8, crossDir: 1, crossSpeed: 0.45, isOnRoad: true };
    scene.add(bird);
    crossingAnimals.push(bird);
  }
}
spawnPedestriansAndAnimals();

function triggerHandshakeHello() {
  initSpatialAudioSystem();
  playerHandshakeTimer = 3.5;
  playHandshakeHelloSound();

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance('Hello! Rất vui được gặp bạn!');
      utter.lang = 'vi-VN';
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
    } catch(e) {}
  }

  const refPos = vehicleState.playerMode === 'ON_FOOT' ? vehicleState.avatarPos : vehicleRoot.position;
  let greeted = false;
  for (const npc of sidewalkNpcs) {
    if (npc.position.distanceTo(refPos) < 18) {
      npc.userData.handshakeTimer = 3.5;
      if (npc.userData.helloBubble) npc.userData.helloBubble.visible = true;
      npc.lookAt(refPos.x, npc.position.y, refPos.z);
      greeted = true;
    }
  }
  for (const ani of crossingAnimals) {
    if (ani.position.distanceTo(refPos) < 14) {
      playAnimalSound(ani.userData.species);
      if (ani.userData.soundBubble) {
        ani.userData.soundBubble.visible = true;
        ani.userData.soundTimer = 3.0;
      }
    }
  }
  vehicleState.lastActionLog = greeted ? '🤝 Đang bắt tay "Hello" với người đi bộ trên vỉa hè!' : 'Bắt tay & chào hỏi cư dân đô thị!';
}

// ============================================================================
// 12. CẬP NHẬT GIAO THÔNG THÔNG MINH, CÒI AI & ĐỘNG VẬT TRÊN ĐƯỜNG
// ============================================================================
function updateSmartTrafficAndAnimals(dt, elapsed) {
  const refPos = vehicleRoot.position;

  // 1. Động vật qua đường và chim đi bộ
  for (const ani of crossingAnimals) {
    const ad = ani.userData;
    if (ad.soundTimer > 0) {
      ad.soundTimer -= dt;
      if (ad.soundTimer <= 0 && ad.soundBubble) ad.soundBubble.visible = false;
    }
    ani.position.x += ad.crossDir * ad.crossSpeed * dt;
    if (ani.position.x > 10.5) ad.crossDir = -1;
    else if (ani.position.x < -10.5) ad.crossDir = 1;
    ani.rotation.y = ad.crossDir > 0 ? Math.PI / 2 : -Math.PI / 2;

    if (ani.position.z - refPos.z > 80) ani.position.z -= 160;
    else if (ani.position.z - refPos.z < -80) ani.position.z += 160;
  }

  // 2. Người đi bộ trên vỉa hè
  for (const npc of sidewalkNpcs) {
    const nd = npc.userData;
    if (nd.handshakeTimer > 0) {
      nd.handshakeTimer -= dt;
      nd.rArm.rotation.x = -Math.PI / 2.2 + Math.sin(elapsed * 14) * 0.25;
      if (nd.handshakeTimer <= 0 && nd.helloBubble) nd.helloBubble.visible = false;
      continue;
    }
    nd.rArm.rotation.x = THREE.MathUtils.lerp(nd.rArm.rotation.x, 0, dt * 6);
    npc.position.z += nd.dir * nd.speed * dt;
    if (npc.position.z - refPos.z > 80) npc.position.z -= 160;
    else if (npc.position.z - refPos.z < -80) npc.position.z += 160;
  }

  // 3. Phương tiện giao thông & AI Radar bóp còi khi có vật cản
  for (const veh of allTrafficVehicles) {
    const vd = veh.userData;
    if (vd.hornCooldown > 0) vd.hornCooldown -= dt;

    let obstacleDetected = false;
    let obsName = '';

    for (const ani of crossingAnimals) {
      const dz = (ani.position.z - veh.position.z) * vd.dir;
      const dx = Math.abs(ani.position.x - veh.position.x);
      if (dz > 1.2 && dz < 10.0 && dx < 2.2) {
        obstacleDetected = true;
        obsName = ani.userData.species;
        break;
      }
    }

    if (!obstacleDetected) {
      const dzCar = (refPos.z - veh.position.z) * vd.dir;
      const dxCar = Math.abs(refPos.x - veh.position.x);
      if (dzCar > 1.5 && dzCar < 11.0 && dxCar < 2.4) {
        obstacleDetected = true;
        obsName = 'Xe Người Chơi';
      }
    }

    if (obstacleDetected) {
      vd.currentSpeed = THREE.MathUtils.lerp(vd.currentSpeed, 0, dt * 6.5);
      if (vd.hornBadge) vd.hornBadge.visible = true;
      if (vd.hornCooldown <= 0 && veh.position.distanceTo(refPos) < 45) {
        playSmartVehicleHornSound(vd.category);
        vd.hornCooldown = 2.6 + Math.random() * 1.5;
        vehicleState.lastActionLog = `📢 [${vd.category}] bóp còi nhường đường cho ${obsName}!`;
      }
    } else {
      vd.currentSpeed = THREE.MathUtils.lerp(vd.currentSpeed, vd.baseSpeed, dt * 3.0);
      if (vd.hornBadge && vd.hornCooldown <= 1.2) vd.hornBadge.visible = false;
    }

    veh.position.z += vd.dir * vd.currentSpeed * dt;
    if (veh.position.z - refPos.z > 95) veh.position.z -= 190;
    else if (veh.position.z - refPos.z < -95) veh.position.z += 190;
  }
}

// ============================================================================
// 13. TAY CẦM META QUEST 3 (A/B/X/Y) & BÀN TAY HAND TRACKING (POKE & PINCH)
// ============================================================================
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllerModelFactory = new XRControllerModelFactory();
const handModelFactory = new XRHandModelFactory();

const prevGamepadButtons = {
  rightA: false,
  rightB: false,
  rightStick: false,
  leftX: false,
  leftY: false,
  leftStick: false
};

function triggerDualControllerHaptics(intensity = 0.8, durationMs = 50) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    if (src.gamepad?.hapticActuators?.[0]) {
      src.gamepad.hapticActuators[0].pulse(intensity, durationMs);
    }
  }
}

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  cameraRig.add(controller);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2.4)]),
    new THREE.LineBasicMaterial({ color: 0x00e5ff })
  );
  controller.add(line);

  controller.addEventListener('squeezestart', () => {
    initSpatialAudioSystem();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const handleHits = raycaster.intersectObjects(draggableHandles, false);
    if (handleHits.length > 0) {
      activeGrabState = {
        interactor: controller,
        panelGroup: handleHits[0].object.userData.parentPanel,
        distance: handleHits[0].distance
      };
      return;
    }

    const btnHits = raycaster.intersectObjects(interactiveButtons, false);
    if (btnHits.length > 0 && btnHits[0].object.userData.onClick) {
      btnHits[0].object.userData.pressedOffset = -0.005;
      btnHits[0].object.userData.onClick();
      triggerDualControllerHaptics(0.7, 40);
    }
  });

  controller.addEventListener('squeezeend', () => {
    if (activeGrabState.interactor === controller) {
      activeGrabState.interactor = null;
      activeGrabState.panelGroup = null;
    }
  });

  controller.addEventListener('disconnected', () => {
    if (activeGrabState.interactor === controller) {
      activeGrabState.interactor = null;
      activeGrabState.panelGroup = null;
    }
    updateDiagnosticDisplay();
  });

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  cameraRig.add(grip);

  const hand = renderer.xr.getHand(i);
  hand.add(handModelFactory.createHandModel(hand, 'mesh'));
  cameraRig.add(hand);

  hand.addEventListener('pinchstart', () => {
    initSpatialAudioSystem();
    const indexTip = hand.joints['index-finger-tip'];
    if (!indexTip) return;
    const tipPos = new THREE.Vector3().setFromMatrixPosition(indexTip.matrixWorld);

    for (const handle of draggableHandles) {
      const handlePos = new THREE.Vector3();
      handle.getWorldPosition(handlePos);
      if (tipPos.distanceTo(handlePos) < 0.28) {
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

function pollQuest3Controllers(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;

  const isManipulatingUI = Boolean(activeGrabState.panelGroup);
  let vrSteeringActive = false;
  let activeCount = 0;

  for (const src of session.inputSources) {
    if (!src.gamepad) continue;
    activeCount++;
    const gp = src.gamepad;
    const b = gp.buttons;

    if (src.handedness === 'right') {
      if (!isManipulatingUI && b[0]) vehicleState.throttlePercent = b[0].value * 100;

      // Phím A: Lên số
      const aPressed = Boolean(b[4]?.pressed);
      if (aPressed && !prevGamepadButtons.rightA) {
        initSpatialAudioSystem();
        vehicleState.gearIndex = Math.min(vehicleState.gears.length - 1, vehicleState.gearIndex + 1);
        vehicleState.lastActionLog = `Phím [A]: Lên số [${vehicleState.gears[vehicleState.gearIndex]}]`;
        triggerDualControllerHaptics(0.7, 40);
        updateDiagnosticDisplay();
      }
      prevGamepadButtons.rightA = aPressed;

      // Phím B: Về số
      const bPressed = Boolean(b[5]?.pressed);
      if (bPressed && !prevGamepadButtons.rightB) {
        initSpatialAudioSystem();
        vehicleState.gearIndex = Math.max(0, vehicleState.gearIndex - 1);
        vehicleState.lastActionLog = `Phím [B]: Về số [${vehicleState.gears[vehicleState.gearIndex]}]`;
        triggerDualControllerHaptics(0.7, 40);
        updateDiagnosticDisplay();
      }
      prevGamepadButtons.rightB = bPressed;

      // Nhấn Thumbstick Phải: Còi
      const rStick = Boolean(b[3]?.pressed);
      vehicleState.hornActive = rStick;
      if (rStick && !prevGamepadButtons.rightStick) {
        initSpatialAudioSystem();
        playDualHornSound();
        vehicleState.lastActionLog = '📢 Đang bấm còi kép Rolls-Royce!';
        updateDiagnosticDisplay();
      }
      prevGamepadButtons.rightStick = rStick;
    }

    if (src.handedness === 'left') {
      if (!isManipulatingUI && b[0]) vehicleState.brakePercent = b[0].value * 100;

      // Phím X: Xi-nhan
      const xPressed = Boolean(b[4]?.pressed);
      if (xPressed && !prevGamepadButtons.leftX) {
        initSpatialAudioSystem();
        vehicleState.turnSignal = (vehicleState.turnSignal + 1) % 4;
        const sigNames = ['TẮT', 'XI-NHAN TRÁI', 'XI-NHAN PHẢI', 'KHẨN CẤP HAZARD'];
        vehicleState.lastActionLog = `Phím [X]: Đèn ${sigNames[vehicleState.turnSignal]}`;
        triggerDualControllerHaptics(0.6, 35);
        updateDiagnosticDisplay();
      }
      prevGamepadButtons.leftX = xPressed;

      // Phím Y: Gạt mưa & Mui trần
      const yPressed = Boolean(b[5]?.pressed);
      if (yPressed && !prevGamepadButtons.leftY) {
        initSpatialAudioSystem();
        if (!vehicleState.wipersActive) {
          vehicleState.wipersActive = true;
          vehicleState.lastActionLog = 'Phím [Y]: Bật gạt nước mưa';
        } else {
          vehicleState.wipersActive = false;
          vehicleState.convertibleRoofOpen = !vehicleState.convertibleRoofOpen;
          vehicleState.lastActionLog = `Phím [Y]: Tắt gạt mưa & ${vehicleState.convertibleRoofOpen ? 'MỞ' : 'ĐÓNG'} Mui!`;
        }
        triggerDualControllerHaptics(0.6, 35);
        updateDiagnosticDisplay();
      }
      prevGamepadButtons.leftY = yPressed;

      // Nhấn Thumbstick Trái: Đổi ghế ngồi POV
      const lStick = Boolean(b[3]?.pressed);
      if (lStick && !prevGamepadButtons.leftStick) {
        initSpatialAudioSystem();
        cycleSeatViewpoint();
        triggerDualControllerHaptics(0.8, 50);
      }
      prevGamepadButtons.leftStick = lStick;

      // Cần gạt Trái: Lái xe (Steering) - Cách ly với tay phải chống xung đột (Rule 5)
      const stickX = gp.axes[2] || 0;
      if (!isManipulatingUI) {
        if (Math.abs(stickX) > 0.08) {
          vehicleState.steeringAngleDeg = THREE.MathUtils.clamp(vehicleState.steeringAngleDeg + stickX * 260 * dt, -540, 540);
          vrSteeringActive = true;
        }
      }
    }

    // Khi đang nắm giữ panel (isManipulatingUI): Dùng cần gạt để chỉnh khoảng cách và thu phóng
    if (isManipulatingUI) {
      const stickX = gp.axes[2] || 0;
      const stickY = gp.axes[3] || 0;
      if (Math.abs(stickY) > 0.08) {
        activeGrabState.distance = THREE.MathUtils.clamp(activeGrabState.distance - stickY * dt * 1.2, 0.4, 2.8);
      }
      if (Math.abs(stickX) > 0.08) {
        const nextScale = THREE.MathUtils.clamp(activeGrabState.panelGroup.scale.x + stickX * dt * 0.8, 0.5, 2.5);
        activeGrabState.panelGroup.scale.setScalar(nextScale);
      }
    }
  }

  runtimeDiagnostics.activeControllers = activeCount;

  // Trả vô lăng về tâm khi nhả tay lái (Rule 5)
  if (!vrSteeringActive && !keys.a && !keys.d) {
    vehicleState.steeringAngleDeg = THREE.MathUtils.lerp(vehicleState.steeringAngleDeg, 0, dt * 3.0);
  }
}

function enterOrExitCarWithBlink() {
  const bannerEl = document.getElementById('mode-banner');
  if (vehicleState.playerMode === 'ON_FOOT') {
    vehicleState.doorsOpen = true;
    document.body.classList.add('blinking');
    setTimeout(() => {
      vehicleState.playerMode = 'DRIVING';
      vehicleState.engineRunning = true;
      vehicleState.doorsOpen = false;
      if (avatarBodyMesh) avatarBodyMesh.visible = false;
      roofBeaconGroup.visible = false;

      driverSeatMount.add(cameraRig);
      cameraRig.position.set(0, 0, 0);
      cameraRig.rotation.set(0, 0, 0);

      document.body.classList.remove('blinking');
      vehicleState.lastActionLog = '🚘 Đã lên xe Rolls-Royce (Góc nhìn thứ nhất)';
      if (bannerEl) bannerEl.textContent = '🚘 ĐANG LÁI XE (1ST-PERSON POV): Nhấn [F] để Xuống Xe Đi Bộ';
      updateDiagnosticDisplay();
    }, 280);
  } else {
    vehicleState.doorsOpen = true;
    vehicleState.velocityMs = 0;
    document.body.classList.add('blinking');
    setTimeout(() => {
      vehicleState.playerMode = 'ON_FOOT';
      vehicleState.doorsOpen = false;
      if (avatarBodyMesh) avatarBodyMesh.visible = true;
      roofBeaconGroup.visible = true;

      const exitOffset = new THREE.Vector3(-1.5, 0, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicleState.headingRad);
      vehicleState.avatarPos.copy(vehicleRoot.position).add(exitOffset);
      playerAvatarGroup.position.copy(vehicleState.avatarPos);
      playerAvatarGroup.add(cameraRig);
      cameraRig.position.set(0, 0.52, 0);
      cameraRig.rotation.set(0, 0, 0);

      document.body.classList.remove('blinking');
      vehicleState.lastActionLog = '🚶 Đã xuống xe đi bộ (Meta Avatar)';
      if (bannerEl) bannerEl.textContent = '🚶 ĐANG ĐI BỘ (META AVATAR): Lại gần NPC bấm [H] để Bắt tay | Lại gần xe bấm [F] để Lên xe';
      updateDiagnosticDisplay();
    }, 280);
  }
}

function cycleSeatViewpoint(targetIdx = null) {
  if (vehicleState.playerMode === 'ON_FOOT') return;
  const nextIdx = (targetIdx !== null) ? targetIdx : (vehicleState.seatIndex + 1) % SEAT_POSITIONS.length;
  vehicleState.seatIndex = nextIdx;
  document.body.classList.add('blinking');
  setTimeout(() => {
    const seat = SEAT_POSITIONS[nextIdx];
    chassisGroup.add(cameraRig);
    const targetY = renderer.xr.isPresenting ? 0.0 : 1.12;
    cameraRig.position.set(seat.pos.x, targetY, seat.pos.z);
    cameraRig.rotation.set(0, 0, 0);
    document.body.classList.remove('blinking');
    vehicleState.lastActionLog = `Đổi góc nhìn: ${seat.name}`;
    updateDiagnosticDisplay();
  }, 280);
}

// Bàn phím máy tính PC
const keys = { w: false, s: false, a: false, d: false };
window.addEventListener('keydown', (e) => {
  initSpatialAudioSystem();
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') keys.w = true;
  if (k === 's' || e.key === 'ArrowDown') keys.s = true;
  if (k === 'a' || e.key === 'ArrowLeft') keys.a = true;
  if (k === 'd' || e.key === 'ArrowRight') keys.d = true;
  if (k === 'e') vehicleState.gearIndex = Math.min(3, vehicleState.gearIndex + 1);
  if (k === 'q') vehicleState.gearIndex = Math.max(0, vehicleState.gearIndex - 1);
  if (k === 'h') triggerHandshakeHello();
  if (k === 'f') enterOrExitCarWithBlink();
  if (k === 'i') {
    vehicleState.engineRunning = !vehicleState.engineRunning;
    vehicleState.lastActionLog = `Động cơ: ${vehicleState.engineRunning ? 'Đã KHỞI ĐỘNG' : 'Đã TẮT'}`;
  }
  if (k === 'p') {
    vehicleState.suspensionShakeIntensity = 1.35;
    vehicleState.lastActionLog = '🕳️ Vấp ổ gà! Khung xe và 4 bánh đang lắc lư mạnh!';
  }
  if (e.code === 'Space') {
    playDualHornSound();
    vehicleState.lastActionLog = '📢 Bóp còi hơi Rolls-Royce!';
  }
  if (k === 'c') cycleSeatViewpoint();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') keys.w = false;
  if (k === 's' || e.key === 'ArrowDown') keys.s = false;
  if (k === 'a' || e.key === 'ArrowLeft') keys.a = false;
  if (k === 'd' || e.key === 'ArrowRight') keys.d = false;
});

// ============================================================================
// 14. ESP32-CAM WEB WORKER VỚI CREATEIMAGEBITMAP KHÔNG GIẬT LAG
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
      if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        self.postMessage({ type: 'status', connected: false, error: 'Protocol must start with ws:// or wss://' });
        return;
      }
      try {
        ws = new WebSocket(url);
        ws.binaryType = 'blob';
        ws.onopen = () => self.postMessage({ type: 'status', connected: true });
        ws.onclose = () => self.postMessage({ type: 'status', connected: false });
        ws.onerror = () => self.postMessage({ type: 'status', connected: false, error: 'WebSocket error / unreachable' });
        ws.onmessage = async (msg) => {
          if (busy) return;
          busy = true;
          try {
            const data = (msg.data instanceof Blob) ? msg.data : new Blob([msg.data], { type: 'image/jpeg' });
            const bmp = await createImageBitmap(data);
            self.postMessage({ type: 'frame', bitmap: bmp }, [bmp]);
          } catch (err) {}
          busy = false;
        };
      } catch (err) {
        self.postMessage({ type: 'status', connected: false, error: err.message });
      }
    }
  };
`;
const streamWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
streamWorker.onmessage = (e) => {
  if (e.data.type === 'status') {
    vehicleState.signalConnected = e.data.connected;
    if (e.data.error) {
      runtimeDiagnostics.errors.push(`ESP32: ${e.data.error}`);
    }
    updateDiagnosticDisplay();
  } else if (e.data.type === 'frame') {
    if (latestEsp32Bitmap) latestEsp32Bitmap.close();
    latestEsp32Bitmap = e.data.bitmap;
    vehicleState.signalConnected = true;
    vehicleState.windshieldTransparent = false;
    streamFrameCounter++;
    runtimeDiagnostics.totalFrames++;
    const d = new Date();
    runtimeDiagnostics.lastFrameTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${Math.floor(d.getMilliseconds() / 100)}`;
    if (runtimeDiagnostics.totalFrames % 15 === 0) {
      updateDiagnosticDisplay();
    }
  }
};

document.getElementById('btn-connect')?.addEventListener('click', () => {
  initSpatialAudioSystem();
  const url = document.getElementById('esp32-ip').value.trim();
  vehicleState.esp32Url = url;
  streamWorker.postMessage({ cmd: 'connect', url });
});

document.getElementById('select-weather')?.addEventListener('change', (e) => {
  applyWeather(e.target.value);
});
document.getElementById('select-seat')?.addEventListener('change', (e) => {
  cycleSeatViewpoint(parseInt(e.target.value, 10));
});
document.getElementById('btn-handshake')?.addEventListener('click', () => triggerHandshakeHello());
document.getElementById('btn-toggle-doors')?.addEventListener('click', () => {
  vehicleState.doorsOpen = !vehicleState.doorsOpen;
  vehicleState.lastActionLog = `4 Cửa xe: ${vehicleState.doorsOpen ? 'Đang MỞ' : 'Đang ĐÓNG'}`;
});
document.getElementById('btn-toggle-roof')?.addEventListener('click', () => {
  vehicleState.convertibleRoofOpen = !vehicleState.convertibleRoofOpen;
  vehicleState.lastActionLog = `Mui xe: ${vehicleState.convertibleRoofOpen ? 'Đang MỞ' : 'Đang ĐÓNG'}`;
});

document.getElementById('btn-enter-exit-car')?.addEventListener('click', () => {
  enterOrExitCarWithBlink();
});

document.getElementById('btn-engine-start')?.addEventListener('click', () => {
  initSpatialAudioSystem();
  vehicleState.engineRunning = !vehicleState.engineRunning;
  vehicleState.lastActionLog = `Động cơ: ${vehicleState.engineRunning ? 'Đã KHỞI ĐỘNG' : 'Đã TẮT'}`;
});

document.getElementById('btn-hit-pothole')?.addEventListener('click', () => {
  vehicleState.suspensionShakeIntensity = 1.35;
  vehicleState.lastActionLog = '🕳️ Vấp ổ gà! Khung xe và 4 bánh đang lắc lư mạnh!';
});

document.getElementById('btn-force-animal-cross')?.addEventListener('click', () => {
  initSpatialAudioSystem();
  const refZ = vehicleState.playerMode === 'ON_FOOT' ? vehicleState.avatarPos.z : vehicleRoot.position.z;
  crossingAnimals.forEach((ani, idx) => {
    ani.position.set((idx % 3 - 1) * 2.8, 0.04, refZ - 10 - (idx % 4) * 5);
    ani.userData.isOnRoad = true;
    if (ani.userData.soundBubble) {
      ani.userData.soundBubble.visible = true;
      ani.userData.soundTimer = 5.0;
    }
  });
  vehicleState.lastActionLog = '🐕🐈🐦 Động vật vừa đáp xuống băng chậm qua đường! Hãy quan sát các xe bóp còi!';
});

document.getElementById('slider-speed-ratio')?.addEventListener('input', (e) => {
  vehicleState.rcSpeedRatio = parseFloat(e.target.value);
  const el = document.getElementById('val-speed-ratio');
  if (el) el.textContent = vehicleState.rcSpeedRatio.toFixed(1);
});

document.getElementById('slider-steer-sens')?.addEventListener('input', (e) => {
  vehicleState.rcSteerSensitivity = parseFloat(e.target.value);
  const el = document.getElementById('val-steer-sens');
  if (el) el.textContent = vehicleState.rcSteerSensitivity.toFixed(1);
});

function applyWeather(mode) {
  vehicleState.weatherMode = mode;
  const isDark = (mode === 'night' || mode === 'sunset' || mode === 'rain');
  vehicleState.nightLightsActive = isDark;

  if (mode === 'day') {
    scene.background.setHex(0x64a6e8);
    scene.fog.color.setHex(0x64a6e8);
    hemiLight.intensity = 1.6;
    mainShadowLight.color.setHex(0xfff6e5);
    mainShadowLight.intensity = 2.2;
  } else if (mode === 'sunset') {
    scene.background.setHex(0xc95f42);
    scene.fog.color.setHex(0xc95f42);
    hemiLight.intensity = 1.1;
    mainShadowLight.color.setHex(0xffaa66);
    mainShadowLight.intensity = 1.8;
  } else if (mode === 'rain') {
    scene.background.setHex(0x0a101d);
    scene.fog.color.setHex(0x0a101d);
    hemiLight.intensity = 0.55;
    mainShadowLight.color.setHex(0x6688aa);
    mainShadowLight.intensity = 0.95;
    vehicleState.wipersActive = true;
  } else {
    scene.background.setHex(0x050811);
    scene.fog.color.setHex(0x050811);
    hemiLight.intensity = 0.75;
    mainShadowLight.color.setHex(0xaaccff);
    mainShadowLight.intensity = 1.45;
  }

  // Bật/tắt các luồng tia sáng khúc xạ và đèn đường
  for (const cone of streetLightCones) cone.visible = isDark;
  for (const pl of streetPointLights) pl.visible = isDark;
  for (const beam of vehicleLightBeams) beam.visible = isDark;
}

// Chẩn đoán lỗi thời gian thực (Rule 8)
const runtimeDiagnostics = {
  webEngine: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
  webgl: 'Detecting WebGL...',
  navigatorXr: (typeof navigator !== 'undefined' && 'xr' in navigator) ? 'PRESENT (window.navigator.xr)' : 'UNDEFINED',
  immersiveVrSupport: 'Checking isSessionSupported...',
  xrSession: 'INACTIVE (2D Viewport)',
  cabinStatus: 'Loading rolls_royce_cabin.glb...',
  lastFrameTime: 'N/A',
  totalFrames: 0,
  activeControllers: 0,
  errors: []
};

try {
  const gl = renderer.getContext();
  const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbgInfo) {
    const gpu = gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL);
    runtimeDiagnostics.webgl = `WebGL 2.0 | GPU: ${gpu}`;
  } else {
    runtimeDiagnostics.webgl = 'WebGL 2.0 (Standard)';
  }
} catch (e) {
  runtimeDiagnostics.webgl = 'WebGL 2.0 Active';
}

window.addEventListener('error', (e) => {
  const errStr = `${e.message || 'Error'} @ ${e.filename ? e.filename.split('/').pop() : ''}:${e.lineno || '?'}`;
  runtimeDiagnostics.errors.push(errStr);
  updateDiagnosticDisplay();
});

window.addEventListener('unhandledrejection', (e) => {
  const errStr = `Unhandled: ${e.reason?.message || e.reason || 'Promise rejected'}`;
  runtimeDiagnostics.errors.push(errStr);
  updateDiagnosticDisplay();
});

function updateDiagnosticDisplay() {
  const elEngine = document.getElementById('diag-engine');
  if (elEngine) elEngine.textContent = runtimeDiagnostics.webEngine.slice(0, 48) + '...';
  const elWebgl = document.getElementById('diag-webgl');
  if (elWebgl) elWebgl.textContent = runtimeDiagnostics.webgl;
  const elNavXr = document.getElementById('diag-navxr');
  if (elNavXr) elNavXr.textContent = runtimeDiagnostics.navigatorXr;
  const elVrSup = document.getElementById('diag-vrsupport');
  if (elVrSup) elVrSup.textContent = runtimeDiagnostics.immersiveVrSupport;
  const elXrSes = document.getElementById('diag-xrsession');
  if (elXrSes) {
    elXrSes.textContent = `${runtimeDiagnostics.xrSession} | Controllers: ${runtimeDiagnostics.activeControllers}`;
  }
  const elCabin = document.getElementById('diag-cabin');
  if (elCabin) elCabin.textContent = runtimeDiagnostics.cabinStatus;
  const elStream = document.getElementById('diag-stream');
  if (elStream) {
    if (vehicleState.signalConnected) {
      elStream.textContent = `CONNECTED: ${vehicleState.esp32Url} | Frames: ${runtimeDiagnostics.totalFrames} | Last: ${runtimeDiagnostics.lastFrameTime} (${vehicleState.streamFps} FPS)`;
      elStream.style.color = '#39ff14';
    } else {
      elStream.textContent = 'DISCONNECTED (SIMULATOR ACTIVE)';
      elStream.style.color = '#ff9f0a';
    }
  }
  const elErrors = document.getElementById('diag-errors');
  if (elErrors) {
    if (runtimeDiagnostics.errors.length === 0) {
      elErrors.textContent = 'None (All systems nominal)';
      elErrors.style.color = '#39ff14';
    } else {
      elErrors.textContent = runtimeDiagnostics.errors.slice(-2).join(' | ');
      elErrors.style.color = '#ff3b30';
    }
  }
}

if (typeof navigator !== 'undefined' && 'xr' in navigator) {
  navigator.xr.isSessionSupported('immersive-vr').then((sup) => {
    runtimeDiagnostics.immersiveVrSupport = sup ? 'SUPPORTED (Meta Quest 6DoF 90FPS)' : 'NOT SUPPORTED (2D WebView)';
    updateDiagnosticDisplay();
  });
}

renderer.xr.addEventListener('sessionstart', () => {
  const session = renderer.xr.getSession();
  if (session && 'supportedFrameRates' in session && session.updateTargetFrameRate) {
    try {
      if (session.supportedFrameRates.includes(90)) session.updateTargetFrameRate(90);
    } catch (e) {}
  }
  // Trong local-floor space: đặt cameraRig Y=0.0 để tầm mắt người ngồi khớp chuẩn ghế xe
  const seat = SEAT_POSITIONS[vehicleState.seatIndex];
  cameraRig.position.set(seat.pos.x, 0.0, seat.pos.z);
  runtimeDiagnostics.xrSession = 'ACTIVE (Immersive 6DoF VR @ 90Hz)';
  updateDiagnosticDisplay();
});

renderer.xr.addEventListener('sessionend', () => {
  activeGrabState.interactor = null;
  activeGrabState.panelGroup = null;
  const seat = SEAT_POSITIONS[vehicleState.seatIndex];
  cameraRig.position.set(seat.pos.x, 1.12, seat.pos.z);
  camera.position.set(0, 0, 0);
  runtimeDiagnostics.xrSession = 'ENDED (2D Viewport)';
  updateDiagnosticDisplay();
});

const presetSelect = document.getElementById('webxr-url-preset');
const urlInput = document.getElementById('webxr-url-input');
if (presetSelect && urlInput) {
  presetSelect.addEventListener('change', () => {
    if (presetSelect.value !== 'custom') urlInput.value = presetSelect.value;
  });
}
document.getElementById('btn-open-quest-browser')?.addEventListener('click', () => {
  const targetUrl = urlInput ? urlInput.value.trim() : window.location.href;
  window.open(targetUrl, '_blank');
});
updateDiagnosticDisplay();

// ============================================================================
// 15. VÒNG LẶP RENDER CHÍNH (THROTTLED HUD CANVAS, VẬT LÝ, GIAO THÔNG & BÓNG ĐỔ)
// ============================================================================
const clock = new THREE.Clock();
let vrFrameCount = 0;
let uiTimer = 0;

// Pre-allocated vectors for HUD panel dragging (Triệt tiêu cấp phát bộ nhớ mỗi frame - Rule 7)
const _grabOrigin = new THREE.Vector3();
const _grabDir = new THREE.Vector3();
const _grabTarget = new THREE.Vector3();

function updateCanvases() {
  const gear = vehicleState.gears[vehicleState.gearIndex];

  // 1. HUD Tập trung
  hudCtx.fillStyle = '#060a12';
  hudCtx.fillRect(0, 0, 1024, 768);
  hudCtx.strokeStyle = '#d4af37';
  hudCtx.lineWidth = 6;
  hudCtx.strokeRect(6, 6, 1012, 756);

  hudCtx.fillStyle = '#00e5ff';
  hudCtx.font = 'bold 36px Segoe UI, monospace';
  hudCtx.fillText(`★ ROLLS-ROYCE VR V60 | SPEED: ${Math.round(Math.abs(vehicleState.speedKmh))} KM/H | GEAR: [${gear}]`, 35, 55);

  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = '22px Segoe UI, sans-serif';
  hudCtx.fillText(`• VÒNG TUA V12: ${Math.round(vehicleState.rpm)} RPM  |  GA: ${Math.round(vehicleState.throttlePercent)}%  |  PHANH: ${Math.round(vehicleState.brakePercent)}%`, 35, 105);
  hudCtx.fillText(`• QUEST VR FPS: ${vehicleState.vrFps}  |  ESP32 STREAM FPS: ${vehicleState.streamFps}  |  VỊ TRÍ: ${SEAT_POSITIONS[vehicleState.seatIndex].name}`, 35, 142);
  hudCtx.fillText(`• THỜI TIẾT: ${vehicleState.weatherMode.toUpperCase()}  |  MUI XE: ${vehicleState.convertibleRoofOpen ? 'MỞ' : 'ĐÓNG'}  |  CỬA: ${vehicleState.doorsOpen ? 'MỞ' : 'ĐÓNG'}`, 35, 180);

  hudCtx.fillStyle = '#39ff14';
  hudCtx.fillText(`• TRẠNG THÁI: ${vehicleState.lastActionLog}`, 35, 225);

  hudCtx.fillStyle = '#8ba0b8';
  hudCtx.font = '19px Segoe UI, sans-serif';
  hudCtx.fillText('★ ĐIỀU KHIỂN: Cò Phải=Ga, Cò Trái=Phanh, A=Lên Số, B=Về Số, X=Xi-nhan, Y=Gạt Mưa/Mui, H=Bắt Tay', 35, 270);
  hudTexture.needsUpdate = true;

  // 2. Kính chắn gió XR Render
  wsCtx.clearRect(0, 0, 1280, 720);
  if (!vehicleState.windshieldTransparent && latestEsp32Bitmap) {
    wsCtx.drawImage(latestEsp32Bitmap, 0, 0, 1280, 720);
  } else {
    wsCtx.fillStyle = 'rgba(0, 20, 42, 0.35)';
    wsCtx.fillRect(0, 0, 1280, 46);
    wsCtx.fillStyle = '#00e5ff';
    wsCtx.font = 'bold 22px monospace';
    wsCtx.fillText(`★ XR WINDSHIELD AR HUD | ${Math.round(Math.abs(vehicleState.speedKmh))} KM/H | GEAR [${gear}] | ${Math.round(vehicleState.rpm)} RPM`, 24, 32);

    const steerCurve = (vehicleState.steeringAngleDeg / 540) * 260;
    wsCtx.strokeStyle = 'rgba(0, 229, 255, 0.65)';
    wsCtx.lineWidth = 5;
    wsCtx.beginPath();
    wsCtx.moveTo(420, 700);
    wsCtx.quadraticCurveTo(500 + steerCurve * 0.4, 520, 560 + steerCurve, 400);
    wsCtx.moveTo(860, 700);
    wsCtx.quadraticCurveTo(780 + steerCurve * 0.4, 520, 720 + steerCurve, 400);
    wsCtx.stroke();
  }
  wsTexture.needsUpdate = true;

  // 3. YouTube Media Canvas
  ytCtx.fillStyle = '#090d14';
  ytCtx.fillRect(0, 0, 640, 340);
  if (audioAnalyser && vehicleState.mediaPlaying) {
    audioAnalyser.getByteFrequencyData(frequencyData);
    for (let i = 0; i < 20; i++) {
      const h = ((frequencyData[i] || 15) / 255) * 85;
      ytCtx.fillStyle = '#00e5ff';
      ytCtx.fillRect(35 + i * 28, 260 - h, 18, h);
    }
  }
  ytCtx.fillStyle = '#ffffff';
  ytCtx.font = 'bold 20px Segoe UI, sans-serif';
  ytCtx.fillText('▶ YouTube Luxury Cinema', 35, 45);
  ytCtx.font = '16px Segoe UI, sans-serif';
  ytCtx.fillStyle = '#dfcba8';
  ytCtx.fillText(`Kênh ${vehicleState.currentChannelIdx + 1}: Rolls-Royce Phantom Symphony V12`, 35, 80);
  ytTex.needsUpdate = true;

  // 4. Màn hình Cam lùi & La bàn
  rearCamCtx.fillStyle = '#0c121b';
  rearCamCtx.fillRect(0, 0, 512, 256);
  rearCamCtx.fillStyle = (gear === 'R') ? '#ff3b30' : '#00d2ff';
  rearCamCtx.font = 'bold 22px monospace';
  rearCamCtx.fillText((gear === 'R') ? 'REAR CAMERA [ACTIVE]' : 'DIGITAL COMPASS [CITY DRIVE]', 20, 35);
  rearCamTex.needsUpdate = true;
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();
  vrFrameCount++;

  const now = performance.now();
  if (now - lastFpsTimestamp >= 1000) {
    vehicleState.streamFps = streamFrameCounter;
    vehicleState.vrFps = vrFrameCount;
    streamFrameCounter = 0;
    vrFrameCount = 0;
    lastFpsTimestamp = now;
  }

  pollQuest3Controllers(dt);

  // Kéo thả HUD panel (Tái sử dụng vector có sẵn để triệt tiêu GC Spikes trong VR - Rule 7)
  if (activeGrabState.interactor && activeGrabState.panelGroup) {
    tempMatrix.identity().extractRotation(activeGrabState.interactor.matrixWorld);
    _grabOrigin.setFromMatrixPosition(activeGrabState.interactor.matrixWorld);
    _grabDir.set(0, 0, -1).applyMatrix4(tempMatrix);
    _grabTarget.copy(_grabOrigin).addScaledVector(_grabDir, activeGrabState.distance);
    chassisGroup.worldToLocal(_grabTarget);
    activeGrabState.panelGroup.position.lerp(_grabTarget, 0.25);
  }

  // 1. Phân luồng điều khiển: ĐI BỘ (META AVATAR) hoặc LÁI XE (1ST-PERSON POV)
  if (vehicleState.playerMode === 'ON_FOOT') {
    roofBeaconGroup.rotation.y += dt * 1.8;
    const walkFwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    const turnDir = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);
    vehicleState.avatarYaw += turnDir * 2.2 * dt;
    playerAvatarGroup.rotation.y = vehicleState.avatarYaw;

    if (walkFwd !== 0) {
      const walkSpeed = 3.4;
      vehicleState.avatarPos.x -= Math.sin(vehicleState.avatarYaw) * walkFwd * walkSpeed * dt;
      vehicleState.avatarPos.z -= Math.cos(vehicleState.avatarYaw) * walkFwd * walkSpeed * dt;
      playerAvatarGroup.position.copy(vehicleState.avatarPos);

      vehicleState.avatarWalkPhase += dt * 9;
      const sw = Math.sin(vehicleState.avatarWalkPhase) * 0.48;
      if (avatarLeftLeg) avatarLeftLeg.rotation.x = sw;
      if (avatarRightLeg) avatarRightLeg.rotation.x = -sw;
      if (avatarLeftArm) avatarLeftArm.rotation.x = -sw * 0.7;
    }

    const doorPos = new THREE.Vector3(-0.98, 0, -0.1).applyMatrix4(vehicleRoot.matrixWorld);
    vehicleState.distanceToCarDoor = vehicleState.avatarPos.distanceTo(doorPos);
    vehicleState.doorsOpen = vehicleState.distanceToCarDoor <= 1.3;
  } else {
    // Điều khiển Lái xe PC W/A/S/D
    if (keys.w) vehicleState.throttlePercent = THREE.MathUtils.lerp(vehicleState.throttlePercent, 100, dt * 4);
    else if (!renderer.xr.getSession()) vehicleState.throttlePercent = THREE.MathUtils.lerp(vehicleState.throttlePercent, 0, dt * 5);
    if (keys.s) vehicleState.brakePercent = 100;
    else if (!renderer.xr.getSession()) vehicleState.brakePercent = 0;

    const steerRate = 240 * (vehicleState.rcSteerSensitivity || 1.0);
    if (keys.a) vehicleState.steeringAngleDeg = Math.max(-540, vehicleState.steeringAngleDeg - steerRate * dt);
    else if (keys.d) vehicleState.steeringAngleDeg = Math.min(540, vehicleState.steeringAngleDeg + steerRate * dt);
    else if (!renderer.xr.getSession()) vehicleState.steeringAngleDeg = THREE.MathUtils.lerp(vehicleState.steeringAngleDeg, 0, dt * 3);

    // Động lực học xe chạy
    const gear = vehicleState.gears[vehicleState.gearIndex];
    let accelMs2 = 0;
    if ((gear === 'D' || gear === 'R') && vehicleState.engineRunning) {
      accelMs2 = ((vehicleState.throttlePercent / 100) * 11.5 * (vehicleState.rcSpeedRatio || 1.0)) - (vehicleState.brakePercent / 100) * 20.0 - 1.2;
      vehicleState.velocityMs = THREE.MathUtils.clamp(vehicleState.velocityMs + accelMs2 * dt, 0, 55 * (vehicleState.rcSpeedRatio || 1.0));
    } else {
      vehicleState.velocityMs = THREE.MathUtils.lerp(vehicleState.velocityMs, 0, dt * 3.5);
    }
    vehicleState.speedKmh = vehicleState.velocityMs * 3.6;

    const frontWheelSteerRad = THREE.MathUtils.degToRad((vehicleState.steeringAngleDeg / 540) * 34);
    const dirSign = (gear === 'R') ? -1 : 1;
    const angularVelocity = dirSign * (vehicleState.velocityMs / 3.2) * Math.tan(frontWheelSteerRad);

    vehicleState.headingRad -= angularVelocity * dt;
    vehicleRoot.rotation.y = vehicleState.headingRad;

    const moveDist = dirSign * vehicleState.velocityMs * dt;
    vehicleRoot.position.x -= Math.sin(vehicleState.headingRad) * moveDist;
    vehicleRoot.position.z -= Math.cos(vehicleState.headingRad) * moveDist;

    // Nhún giảm xóc chassis + Lắc lư khi vấp ổ gà
    const targetPitch = THREE.MathUtils.clamp(accelMs2 * 0.0025, -0.035, 0.025);
    let targetRoll = THREE.MathUtils.clamp(angularVelocity * vehicleState.velocityMs * 0.0012, -0.04, 0.04);

    if (vehicleState.suspensionShakeIntensity > 0.01) {
      vehicleState.suspensionShakePhase += dt * 38;
      const amp = vehicleState.suspensionShakeIntensity;
      chassisGroup.position.y = Math.abs(Math.sin(vehicleState.suspensionShakePhase)) * 0.14 * amp;
      targetRoll += Math.sin(vehicleState.suspensionShakePhase * 0.8) * 0.065 * amp;
      vehicleState.suspensionShakeIntensity = THREE.MathUtils.lerp(vehicleState.suspensionShakeIntensity, 0, dt * 3.2);
    } else {
      chassisGroup.position.y = 0;
    }

    chassisGroup.rotation.x = THREE.MathUtils.lerp(chassisGroup.rotation.x, targetPitch, dt * 6);
    chassisGroup.rotation.z = THREE.MathUtils.lerp(chassisGroup.rotation.z, targetRoll, dt * 6);
  }

  // Cập nhật vị trí bóng đổ bám theo tâm người chơi
  const focusPos = vehicleState.playerMode === 'ON_FOOT' ? vehicleState.avatarPos : vehicleRoot.position;
  mainShadowLight.position.set(focusPos.x + 35, 65, focusPos.z + 25);
  mainShadowLight.target.position.copy(focusPos);

  checkAndResolveCityCollisions();
  updateSmartTrafficAndAnimals(dt, elapsed);

  // Hoạt ảnh cửa xe đóng mở
  const targetDoor = vehicleState.doorsOpen ? THREE.MathUtils.degToRad(62) : 0;
  vehicleState.doorAnimAngle = THREE.MathUtils.lerp(vehicleState.doorAnimAngle, targetDoor, dt * 5);
  for (const dp of doorPivots) {
    dp.rotation.y = dp.userData.sideSign * vehicleState.doorAnimAngle;
  }

  // Hoạt ảnh mui trần
  const targetRoof = vehicleState.convertibleRoofOpen ? THREE.MathUtils.degToRad(-85) : 0;
  vehicleState.roofAnimAngle = THREE.MathUtils.lerp(vehicleState.roofAnimAngle, targetRoof, dt * 4);
  convertibleRoofGroup.rotation.x = vehicleState.roofAnimAngle;

  // Hoạt ảnh gạt nước mưa
  if (vehicleState.wipersActive) {
    vehicleState.wiperPhase += dt * 4.5;
    const sweep = Math.sin(vehicleState.wiperPhase) * THREE.MathUtils.degToRad(48);
    wiperLeftPivot.rotation.z = sweep;
    wiperRightPivot.rotation.z = sweep;
  } else {
    wiperLeftPivot.rotation.z = THREE.MathUtils.lerp(wiperLeftPivot.rotation.z, 0, dt * 5);
    wiperRightPivot.rotation.z = THREE.MathUtils.lerp(wiperRightPivot.rotation.z, 0, dt * 5);
  }

  // Xoay vô lăng quanh trục cột lái
  steeringWheelPivot.rotation.z = THREE.MathUtils.degToRad(-vehicleState.steeringAngleDeg);
  if (gltfCabinModel) {
    const gltfWheel = gltfCabinModel.getObjectByName('SteeringWheel_Pivot');
    if (gltfWheel) {
      if (!gltfWheel.userData.baseQuaternion) gltfWheel.userData.baseQuaternion = gltfWheel.quaternion.clone();
      const steerRad = THREE.MathUtils.degToRad(-vehicleState.steeringAngleDeg);
      gltfWheel.quaternion.copy(gltfWheel.userData.baseQuaternion);
      gltfWheel.rotateOnAxis(new THREE.Vector3(0, 1, 0), steerRad);
    }
  }

  // Bàn đạp xoay
  if (throttlePedalMesh) throttlePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25 + (vehicleState.throttlePercent / 100) * 25);
  if (brakePedalMesh) brakePedalMesh.rotation.x = THREE.MathUtils.degToRad(-25 + (vehicleState.brakePercent / 100) * 25);

  updateEngineAudio(dt);

  // Throttled UI updates (~15 FPS)
  uiTimer += dt;
  if (uiTimer >= 0.065) {
    uiTimer = 0;
    updateCanvases();
  }

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
'''

with open(TARGET_APP, 'w', encoding='utf-8') as f:
    f.write(code)

print(f"SUCCESS: Written {len(code)} bytes to {TARGET_APP}!")
