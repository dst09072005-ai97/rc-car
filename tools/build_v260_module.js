const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'v260_master_module.js');

const code = `// ============================================================================
// 25. BẢN CẬP NHẬT MASTER V260 (KIẾN TRÚC HỆ THỐNG HỢP NHẤT — KHÔNG XUNG ĐỘT)
//     1. ĐỒNG BỘ VÔ LĂNG GOG R808 TỪ LAPTOP (ADMIN) SANG KÍNH META QUEST 3 (PLAYER CHÍNH)
//     2. TĂNG TỐC ĐỘ XE TRÊN APP LÊN GẤP 5 LẦN (VIRTUAL 5X) — GIỮ NGUYÊN TỐC ĐỘ 1X XE THẬT
//     3. PHÂN BỔ GHẾ TÀI XẾ (SEAT 0) ĐỘC QUYỀN: KÍNH QUEST 2 HOẶC MOBILE KHÔNG CƯỚP ĐƯỢC LÁI
//     4. BÀN ĐẠP GA/PHANH/LÙI: GA TIẾN, PHANH ƯU TIÊN GIẢM TỐC MƯỢT MÀ, CHỐNG GIẬT (ANTI-JERK)
//     5. WEB WORKER 50HZ UNTHROTTLED: PHÁT VÔ LĂNG LIÊN TỤC KHI TAB LAPTOP CHẠY NGẦM
//     6. BẢN ĐIỆN THOẠI: TỐI ƯU KHÔNG GIAN MÀN HÌNH, VUỐT LƯỚT 360° + XOAY LẮC GYROSCOPE
//     7. CAMERA ESP32-CAM: RELAY KHÔNG GIÁN ĐOẠN, TỰ ĐỘNG VẼ NỀN GƯƠNG CHIẾU HẬU TRÁNH BẢNG ĐEN
//     8. GƯƠNG HẬU & 3D INTERIOR: DỌN SẠCH BẢNG TÊN / MESH THỪA CHẮN TẦM NHÌN KÍNH HẬU
//     9. LIQUID GEAR WIDGET & ROLE SEAT BADGE HIỂN THỊ TRẠNG THÁI THEO THỜI GIAN THỰC
// ============================================================================
(() => {
  'use strict';

  if (typeof window !== 'undefined' && window.__V260_MASTER_ACTIVE__) return;
  if (typeof window !== 'undefined') window.__V260_MASTER_ACTIVE__ = true;

  // HỆ SỐ NHÂN TỐC ĐỘ XE ẢO TRÊN APP (Nhanh gấp 5 lần so với xe thật ngoài đời)
  const VIRTUAL_APP_SPEED_SCALE = 5.0;

  // --------------------------------------------------------------------------
  // 25.1. NHẬN DIỆN THIẾT BỊ & PHÂN BỔ VAI TRÒ
  // --------------------------------------------------------------------------
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const isQuestHeadset = /Quest|OculusBrowser|Pacific/i.test(ua);
  const isMobilePhone = !isQuestHeadset && (
    (typeof window !== 'undefined' && window.__DETECTED_DEVICE_TYPE__ === 'MOBILE_PHONE') ||
    (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) && (typeof window !== 'undefined' && window.innerWidth < 1024))
  );
  const isLaptopAdmin = !isQuestHeadset && !isMobilePhone;

  // --------------------------------------------------------------------------
  // 25.2. CẤU HÌNH CAMERA ESP32 & GƯƠNG CHIẾU HẬU 3D
  // --------------------------------------------------------------------------
  const hwConfig = {
    frontCamIp: (typeof localStorage !== 'undefined' && localStorage.getItem('rc_front_cam_ip')) || '192.168.1.101',
    rearCamIp: (typeof localStorage !== 'undefined' && localStorage.getItem('rc_rear_cam_ip')) || '192.168.1.102',
    ctrlIp: (typeof localStorage !== 'undefined' && localStorage.getItem('rc_ctrl_ip')) || '192.168.1.100',
    frontConnected: false,
    rearConnected: false,
    useSnapshotFallbackFront: false,
    useSnapshotFallbackRear: false
  };

  // Khởi tạo nền gương chiếu hậu mặc định (Tránh hiện bảng đen khi chưa có tín hiệu Cam Lùi ESP32)
  function initRearMirrorDefaultBackdrop() {
    if (typeof rearCamCtx !== 'undefined' && rearCamCtx && typeof rearCamCanvas !== 'undefined' && rearCamCanvas) {
      const w = rearCamCanvas.width || 512;
      const h = rearCamCanvas.height || 256;
      const grad = rearCamCtx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d1828');
      grad.addColorStop(0.5, '#070d16');
      grad.addColorStop(1, '#020509');
      rearCamCtx.fillStyle = grad;
      rearCamCtx.fillRect(0, 0, w, h);

      // Viền gương & góc hiển thị
      rearCamCtx.strokeStyle = 'rgba(0, 255, 136, 0.45)';
      rearCamCtx.lineWidth = 3;
      rearCamCtx.strokeRect(6, 6, w - 12, h - 12);

      // Nhãn OSD
      rearCamCtx.fillStyle = 'rgba(0, 255, 136, 0.85)';
      rearCamCtx.font = 'bold 15px monospace';
      rearCamCtx.textAlign = 'center';
      rearCamCtx.fillText('🪞 GƯƠNG CHIẾU HẬU 3D | ESP32 CAM LÙI STANDBY', w / 2, 34);

      // Vạch căn khoảng cách lùi
      rearCamCtx.strokeStyle = 'rgba(255, 214, 10, 0.4)';
      rearCamCtx.lineWidth = 2;
      rearCamCtx.beginPath();
      rearCamCtx.moveTo(w * 0.22, h - 16);
      rearCamCtx.lineTo(w * 0.35, h * 0.62);
      rearCamCtx.lineTo(w * 0.65, h * 0.62);
      rearCamCtx.lineTo(w * 0.78, h - 16);
      rearCamCtx.stroke();

      if (typeof rearCamTex !== 'undefined' && rearCamTex) {
        rearCamTex.needsUpdate = true;
      }
    }
  }

  // ESP32-CAM Relay qua WebSocket cho Kính Meta Quest 3 (Vượt chặn Mixed Content HTTPS)
  if (typeof window !== 'undefined') {
    window.__questRelayImg = new Image();
    window.__questRelayImg.crossOrigin = 'anonymous';
    window.__questRelayImg.onload = () => {
      if (typeof wsCtx !== 'undefined' && wsCtx && typeof wsTex !== 'undefined' && wsTex) {
        wsCtx.drawImage(window.__questRelayImg, 0, 0, 1024, 512);
        wsTex.needsUpdate = true;
      }
      if (typeof rearCamCtx !== 'undefined' && rearCamCtx && typeof rearCamTex !== 'undefined' && rearCamTex) {
        rearCamCtx.drawImage(window.__questRelayImg, 0, 0, 512, 256);
        rearCamTex.needsUpdate = true;
      }
      if (typeof state !== 'undefined' && state) {
        state.esp32Connected = true;
        state.windshieldMode = 'ESP32_LIVE';
      }
    };
  }

  function connectBothEsp32CamerasAndController() {
    if (typeof document === 'undefined') return;
    const inFront = document.getElementById('v250-ip-front');
    const inRear = document.getElementById('v250-ip-rear');
    const inCtrl = document.getElementById('v250-ip-ctrl');

    if (inFront && inFront.value && inFront.value.trim()) hwConfig.frontCamIp = inFront.value.trim();
    if (inRear && inRear.value && inRear.value.trim()) hwConfig.rearCamIp = inRear.value.trim();
    if (inCtrl && inCtrl.value && inCtrl.value.trim()) hwConfig.ctrlIp = inCtrl.value.trim();

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rc_front_cam_ip', hwConfig.frontCamIp);
      localStorage.setItem('rc_rear_cam_ip', hwConfig.rearCamIp);
      localStorage.setItem('rc_ctrl_ip', hwConfig.ctrlIp);
    }

    if (typeof fetch !== 'undefined') {
      fetch('/api/esp32-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontCamIp: hwConfig.frontCamIp,
          rearCamIp: hwConfig.rearCamIp,
          ctrlIp: hwConfig.ctrlIp
        })
      }).catch(() => {});
    }

    const frontImg = document.getElementById('v250-front-cam-img');
    const rearImg = document.getElementById('v250-rear-cam-img');
    if (frontImg) frontImg.src = \`/api/esp32-proxy?ip=\${hwConfig.frontCamIp}&port=81&t=\${Date.now()}\`;
    if (rearImg) rearImg.src = \`/api/esp32-proxy?ip=\${hwConfig.rearCamIp}&port=81&t=\${Date.now()}\`;
  }

  // --------------------------------------------------------------------------
  // 25.3. PHÁT LỆNH ĐIỀU KHIỂN XUỐNG ESP32 RC CAR (UDP 4210) — GIỮ NGUYÊN 1X AN TOÀN
  // --------------------------------------------------------------------------
  let lastEsp32SendTime = 0;
  let lastSentThrottle = 0;
  let lastSentSteer = 0;

  function sendHardwareControlToEsp32(throttlePwm, steerPercent, gearStr, brakeFlag, sourceName) {
    // ĐỘC LẬP HOÀN TOÀN: Xung phát ra phần cứng xe RC thật luôn nằm trong dải [-255, 255] an toàn
    const payload = {
      throttle: Math.max(-255, Math.min(255, Math.round(throttlePwm))),
      steering: Math.max(-100, Math.min(100, Math.round(steerPercent))),
      gear: gearStr || (throttlePwm < -5 ? 'R' : 'D'),
      brake: brakeFlag ? 1 : 0,
      lights: Boolean(typeof state !== 'undefined' && state && state.headlightsOn),
      horn: Boolean(typeof state !== 'undefined' && state && state.hornActive),
      activeCam: throttlePwm < -5 ? 'rear' : 'front',
      weatherMode: (typeof state !== 'undefined' && state && state.weatherMode) || 'night',
      inputSource: sourceName || 'APP'
    };

    if (typeof fetch !== 'undefined') {
      fetch('/api/rc-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    }

    if (typeof document !== 'undefined') {
      const statusBar = document.getElementById('v250-hw-telemetry-bar');
      if (statusBar) {
        statusBar.textContent = \`🎮 Đầu vào: \${payload.inputSource} | ⚡ Ga ESP32: \${payload.throttle} | 🛞 Lái: \${payload.steering}% | Số: \${payload.gear}\`;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 25.4. ĐỌC VÔ LĂNG & BÀN ĐẠP GOG R808 TRÊN LAPTOP + WEB WORKER CHỐNG BỊ GIẢM FPS KHI CHẠY NGẦM
  // --------------------------------------------------------------------------
  let lastBgSendWheelTime = 0;
  let consecutiveNeutralCount = 0;
  let restAxesCalibrated = false;
  let restCalibrationFrames = 0;
  let restAxes = [];
  let restButtons = [];
  let prevWheelBtns = {};

  let lastCamRelaySentAt = 0;
  const relayCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (relayCanvas) {
    relayCanvas.width = 480;
    relayCanvas.height = 270;
  }
  const relayCtx = relayCanvas ? relayCanvas.getContext('2d') : null;

  function runDedicatedLaptopWheelAndCameraTransmitter() {
    if (!isLaptopAdmin) return;
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    // 1. Chuyển tiếp khung hình ESP32 Cam từ Laptop sang Quest 3 (~12 FPS)
    if (relayCtx && typeof mpSocket !== 'undefined' && mpSocket && mpSocket.readyState === WebSocket.OPEN) {
      if (now - lastCamRelaySentAt > 80) {
        const frontImg = document.getElementById('v250-front-cam-img');
        if (frontImg && frontImg.complete && (frontImg.naturalWidth || 0) > 0) {
          try {
            relayCtx.drawImage(frontImg, 0, 0, 480, 270);
            const dataUrl = relayCanvas.toDataURL('image/jpeg', 0.60);
            lastCamRelaySentAt = now;
            mpSocket.send(JSON.stringify({
              type: 'ESP32_CAM_FRAME_RELAY',
              role: 'front',
              dataUrl
            }));
          } catch (e) {}
        }
      }
    }

    // 2. Đọc Gamepad API quét Vô lăng & Bàn đạp GOG R808
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    if (!pads) return;

    let wheelPad = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const id = (p.id || '').toLowerCase();
      if (/quest|oculus|touch|openxr|hands/i.test(id)) continue;
      if (/808|gog|wheel|steering|g29|g920|thrustmaster|fanatec|racing/i.test(id) || p.mapping === '' || p.axes.length >= 2) {
        wheelPad = p;
        break;
      }
    }
    if (!wheelPad) return;

    // Tự động hiệu chuẩn trạng thái nghỉ của các trục
    if (!restAxesCalibrated) {
      if (restCalibrationFrames === 0) {
        restAxes = wheelPad.axes.map((v) => Number(v) || 0);
        restButtons = wheelPad.buttons.map((b) => (b ? Number(b.value) || 0 : 0));
      }
      restCalibrationFrames++;
      if (restCalibrationFrames >= 12) {
        restAxesCalibrated = true;
      }
    }

    // A. Trục vô lăng (Axis 0)
    const rawSteerAxis = wheelPad.axes[0] || 0;
    const steerDeadband = Math.abs(rawSteerAxis) < 0.035 ? 0 : rawSteerAxis;
    const steerNorm = THREE.MathUtils.clamp(steerDeadband, -1.0, 1.0);

    // B. Đọc bàn đạp Ga & Bàn đạp Phanh / Lùi
    let gasVal = 0;
    let brakeVal = 0;

    const swapPedals = (typeof window !== 'undefined' && window.__GOG808_SWAP_PEDALS__ === true);
    const gasAxisIdx = swapPedals ? 2 : 1;
    const brakeAxisIdx = swapPedals ? 1 : 2;

    if (wheelPad.axes.length > Math.max(gasAxisIdx, brakeAxisIdx)) {
      const rawGasAxis = wheelPad.axes[gasAxisIdx];
      const rawBrakeAxis = wheelPad.axes[brakeAxisIdx];

      const restGas = restAxes[gasAxisIdx] !== undefined ? restAxes[gasAxisIdx] : -1.0;
      const restBrake = restAxes[brakeAxisIdx] !== undefined ? restAxes[brakeAxisIdx] : -1.0;

      if (restGas < -0.65) gasVal = Math.max(0, (rawGasAxis + 1.0) / 2.0);
      else if (restGas > 0.65) gasVal = Math.max(0, (1.0 - rawGasAxis) / 2.0);
      else gasVal = Math.max(0, rawGasAxis);

      if (restBrake < -0.65) brakeVal = Math.max(0, (rawBrakeAxis + 1.0) / 2.0);
      else if (restBrake > 0.65) brakeVal = Math.max(0, (1.0 - rawBrakeAxis) / 2.0);
      else brakeVal = Math.max(0, rawBrakeAxis);
    }

    // Nút cò L2 / R2 nếu bàn đạp báo qua Buttons
    const btnR2 = wheelPad.buttons[7] ? wheelPad.buttons[7].value : 0;
    const btnL2 = wheelPad.buttons[6] ? wheelPad.buttons[6].value : 0;
    if (btnR2 > gasVal) gasVal = btnR2;
    if (btnL2 > brakeVal) brakeVal = btnL2;

    // Lọc nhiễu trạng thái nghỉ
    if (gasVal < 0.04) gasVal = 0;
    if (brakeVal < 0.04) brakeVal = 0;

    // C. Logic Gài Số & Ưu tiên Phanh chống giật:
    let gear = 'D';
    let netThrottleNorm = 0;
    const curSpeed = (typeof state !== 'undefined' && state) ? (state.velocityMs || 0) : 0;

    // QUY TẮC ƯU TIÊN PHANH (BRAKE PRIORITY INTERLOCK):
    if (brakeVal > 0.04) {
      if (Math.abs(curSpeed) > 0.20 || gasVal > 0.04) {
        gear = 'D';
        netThrottleNorm = 0; // Cắt ga hoàn toàn để giảm tốc mượt mà
      } else {
        gear = 'R';
        netThrottleNorm = -brakeVal;
      }
    } else if (gasVal > 0.04) {
      gear = 'D';
      netThrottleNorm = gasVal;
    }

    // D. Nút bấm trên Vô lăng GOG R808
    const btnEvents = [];
    const checkBtnPress = (btnIndex, eventName) => {
      const b = wheelPad.buttons[btnIndex];
      const isPressed = Boolean(b && (b.pressed || b.value > 0.5));
      if (isPressed && !prevWheelBtns[btnIndex]) {
        btnEvents.push(eventName);
      }
      prevWheelBtns[btnIndex] = isPressed;
    };

    checkBtnPress(4, 'TURN_LEFT');
    checkBtnPress(5, 'TURN_RIGHT');
    checkBtnPress(0, 'HORN');
    checkBtnPress(1, 'ENTER_EXIT');
    checkBtnPress(2, 'SWAP_SEAT');
    checkBtnPress(3, 'HEADLIGHT');

    // E. Phát gói WHEEL_BRIDGE_INPUT sang Kính Meta Quest 3 và Xe RC
    const steerDeg = Math.round(90 + steerNorm * 45);
    const throttlePulse = Math.round(1500 + netThrottleNorm * 260);

    const isDrivingActive = (Math.abs(steerNorm) > 0.02 || Math.abs(netThrottleNorm) > 0.02 || brakeVal > 0.04 || btnEvents.length > 0);

    if (now - lastBgSendWheelTime >= 20) {
      if (isDrivingActive) {
        consecutiveNeutralCount = 0;
        lastBgSendWheelTime = now;
        if (typeof mpSocket !== 'undefined' && mpSocket && mpSocket.readyState === WebSocket.OPEN) {
          mpSocket.send(JSON.stringify({
            type: 'WHEEL_BRIDGE_INPUT',
            connected: true,
            deviceId: wheelPad.id.replace(/\\(.*?\\)/g, '').trim() || 'GOG R808',
            steeringNorm: Number(steerNorm.toFixed(3)),
            steerAngleDeg: Number((steerNorm * 540).toFixed(1)),
            gasPercent: Math.round(gasVal * 100),
            brakePercent: Math.round(brakeVal * 100),
            reversePercent: gear === 'R' ? Math.round(brakeVal * 100) : 0,
            gear: gear,
            steer: steerDeg,
            throttle: throttlePulse,
            buttonEvents: btnEvents
          }));
        }
      } else if (consecutiveNeutralCount < 5) {
        consecutiveNeutralCount++;
        lastBgSendWheelTime = now;
        if (typeof mpSocket !== 'undefined' && mpSocket && mpSocket.readyState === WebSocket.OPEN) {
          mpSocket.send(JSON.stringify({
            type: 'WHEEL_BRIDGE_INPUT',
            connected: true,
            deviceId: wheelPad.id.replace(/\\(.*?\\)/g, '').trim() || 'GOG R808',
            steeringNorm: 0,
            steerAngleDeg: 0,
            gasPercent: 0,
            brakePercent: 0,
            reversePercent: 0,
            gear: 'D',
            steer: 90,
            throttle: 1500,
            buttonEvents: []
          }));
        }
      }
    }
  }

  // Khởi động Web Worker 50Hz trên Laptop để KHÔNG BỊ TRÌNH DUYỆT GIẢM XUỐNG 1HZ KHI CHẠY NGẦM
  function startGog808UnthrottledWorker() {
    if (typeof window === 'undefined' || !window.Worker) return;
    if (window.__GOG808_WORKER__) return;
    try {
      const workerScript = \`
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) timer = setInterval(function() { postMessage('tick'); }, 20);
          } else if (e.data === 'stop') {
            if (timer) { clearInterval(timer); timer = null; }
          }
        };
      \`;
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      worker.onmessage = function() {
        runDedicatedLaptopWheelAndCameraTransmitter();
      };
      worker.postMessage('start');
      window.__GOG808_WORKER__ = worker;
    } catch (err) {
      console.warn('[GOG808] Web Worker fallback to setInterval:', err);
      setInterval(runDedicatedLaptopWheelAndCameraTransmitter, 20);
    }
  }

  if (isLaptopAdmin) {
    startGog808UnthrottledWorker();
  }

  // Fallback định kỳ
  setInterval(runDedicatedLaptopWheelAndCameraTransmitter, 20);

  if (typeof window !== 'undefined') {
    window.toggleGog808Pedals = () => {
      window.__GOG808_SWAP_PEDALS__ = !window.__GOG808_SWAP_PEDALS__;
      restAxesCalibrated = false;
      restCalibrationFrames = 0;
      console.log('🔄 Đã đảo chiều bàn đạp GOG R808:', window.__GOG808_SWAP_PEDALS__);
      return window.__GOG808_SWAP_PEDALS__;
    };
  }

  // --------------------------------------------------------------------------
  // 25.5. BỘ ĐỌC TRỘN ĐA THIẾT BỊ: GOG R808 + TAY CẦM TOUCH META QUEST 3
  //       + PHÂN QUYỀN ĐỘC QUYỀN GHẾ TÀI XẾ (CHỐNG CƯỚP LÁI TỪ KÍNH 2 / MOBILE)
  // --------------------------------------------------------------------------
  let smoothedSteerInput = 0;
  let smoothedThrottleInput = 0;
  let lastTouchSeatSwapTime = 0;
  let lastEnterExitTime = 0;
  let lastRecenterTime = 0;
  let lastHornTime = 0;
  let lastCarSyncTime = 0;

  function applyDeadzone(val, dz = 0.08) {
    if (Math.abs(val) < dz) return 0;
    return Math.sign(val) * ((Math.abs(val) - dz) / (1 - dz));
  }

  function pollAllGamepadsWheelGog808AndThumbsticks(dt) {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    let rawSteer = 0;
    let rawThrottle = 0;
    let isBraking = false;
    let activeDeviceName = '';
    let isBridgeWheelActive = false;

    // ------------------------------------------------------------------------
    // KIỂM TRA PHÂN QUYỀN LÁI XE: CHỈ TÀI XẾ (SEAT 0) HOẶC LAPTOP ADMIN MỚI ĐƯỢC LÁI!
    // ------------------------------------------------------------------------
    const isDriver = (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING' && (state.seatIndex === 0 || state.isHostPlayer === true));
    const isLaptopLocalAdmin = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
    const canDrive = isDriver || (isLaptopLocalAdmin && typeof state !== 'undefined' && state && state.playerMode === 'DRIVING');

    // 0. Quét cầu nối Vô lăng GOG 808 từ WebSocket (Laptop sang Meta Quest 3)
    if (typeof window !== 'undefined' && window._racingWheel && window._racingWheel.connected) {
      const rw = window._racingWheel;
      // Nới rộng cửa sổ tươi mới lên 850ms để chống rớt gói khi mạng Wi-Fi chập chờn
      const isFresh = (now - (rw.lastInputTime || 0)) < 850;
      if (isFresh) {
        const bridgeSteer = (typeof rw.rawSteer === 'number') ? rw.rawSteer : (rw.steerAngleDeg ? rw.steerAngleDeg / 540 : 0);
        let bridgeThrottle = (rw.gasPercent > 0) ? (rw.gasPercent / 100) : (rw.reversePercent > 0 ? -(rw.reversePercent / 100) : 0);
        const curSpd = (typeof state !== 'undefined' && state) ? (state.velocityMs || 0) : 0;

        if (rw.brakePercent > 8) {
          isBraking = true;
          if (Math.abs(curSpd) > 0.15 || rw.gasPercent > 8) {
            bridgeThrottle = 0;
          }
        }

        if (Math.abs(bridgeSteer) > 0.02 || Math.abs(bridgeThrottle) > 0.02 || isBraking) {
          isBridgeWheelActive = true;
          rawSteer = bridgeSteer;
          rawThrottle = bridgeThrottle;
          activeDeviceName = rw.deviceName || 'Vô lăng GOG808 (Cầu nối)';
        }
      }
    }

    // 1. Quét Gamepad cắm trực tiếp vào thiết bị hiện tại (nếu ở Laptop)
    const gamepads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp || !gp.connected) continue;
      const idLower = (gp.id || '').toLowerCase();
      if (/quest|oculus|touch|openxr|hands/i.test(idLower)) continue;

      const isWheelGog808 = /808|gog|wheel|steering|g29|g920|thrustmaster|racing/i.test(idLower) || gp.mapping === '';
      const ax0 = applyDeadzone(gp.axes[0] || 0, 0.04);
      if (Math.abs(ax0) > Math.abs(rawSteer)) {
        rawSteer = ax0;
        activeDeviceName = isWheelGog808 ? 'Vô lăng GOG808' : 'Gamepad';
      }

      const r2Val = gp.buttons[7] ? gp.buttons[7].value : 0;
      const l2Val = gp.buttons[6] ? gp.buttons[6].value : 0;
      const curSpd = (typeof state !== 'undefined' && state) ? (state.velocityMs || 0) : 0;

      if (l2Val > 0.04) {
        isBraking = true;
        if (Math.abs(curSpd) > 0.15 || r2Val > 0.04) {
          rawThrottle = 0;
        } else {
          rawThrottle = -l2Val;
        }
        activeDeviceName = isWheelGog808 ? 'Bàn đạp GOG808' : 'Triggers';
      } else if (r2Val > 0.04) {
        rawThrottle = r2Val;
        activeDeviceName = isWheelGog808 ? 'Bàn đạp GOG808' : 'Triggers';
      }
      if (gp.buttons[2]?.pressed) isBraking = true;
    }

    // 2. Quét Tay Cầm Meta Quest Touch trong WebXR
    if (typeof renderer !== 'undefined' && renderer && renderer.xr && renderer.xr.isPresenting) {
      const session = renderer.xr.getSession();
      if (session && session.inputSources) {
        for (const src of session.inputSources) {
          if (!src.gamepad) continue;
          const axes = src.gamepad.axes || [];
          const btns = src.gamepad.buttons || [];

          const tx = applyDeadzone(axes.length >= 4 ? axes[2] : (axes[0] || 0), 0.08);
          const ty = -applyDeadzone(axes.length >= 4 ? axes[3] : (axes[1] || 0), 0.08);
          const trigVal = btns[0] ? btns[0].value : 0;
          const gripVal = btns[1] ? btns[1].value : 0;

          // NẾU LÀ HÀNH KHÁCH (KÍNH 2 HOẶC GHẾ PHỤ):
          // Cần gạt thumbstick dùng để XOAY ĐẦU QUAN SÁT 360° TRONG CABIN, TUYỆT ĐỐI KHÔNG LÁI XE!
          if (!canDrive) {
            if (typeof state !== 'undefined' && state) {
              if (Math.abs(tx) > 0.12) {
                state.eyeLookYaw = (state.eyeLookYaw || 0) + tx * 1.6 * dt;
              }
              if (Math.abs(ty) > 0.12) {
                state.eyeLookPitch = THREE.MathUtils.clamp((state.eyeLookPitch || 0) - ty * 1.2 * dt, -0.85, 0.85);
              }
            }
          } else {
            // NẾU LÀ TÀI XẾ HỢP LỆ (SEAT 0):
            const isTouchIntentionallyUsed = Math.abs(tx) > 0.15 || Math.abs(ty) > 0.15 || trigVal > 0.18;
            if (!isBridgeWheelActive || isTouchIntentionallyUsed) {
              if (Math.abs(tx) > Math.abs(rawSteer)) {
                rawSteer = tx;
                activeDeviceName = \`Quest 3 Touch (\${src.handedness})\`;
              }
              if (Math.abs(ty) > Math.abs(rawThrottle)) {
                rawThrottle = ty;
                activeDeviceName = \`Quest 3 Touch (\${src.handedness})\`;
              }
              if (trigVal > 0.12 && src.handedness === 'right' && trigVal > rawThrottle) {
                rawThrottle = trigVal;
                activeDeviceName = 'Quest 3 Trigger';
              }
              if (trigVal > 0.12 && src.handedness === 'left' && -trigVal < rawThrottle) {
                rawThrottle = -trigVal;
                activeDeviceName = 'Quest 3 Reverse Trigger';
              }
              if (gripVal > 0.5) isBraking = true;
            }
          }

          // Nút bấm trên tay cầm Touch
          const isLeftHand = (src.handedness === 'left');
          const isRightHand = (src.handedness === 'right');

          // Nút X (Tay trái): Lên/Xuống xe
          if (isLeftHand && btns[4]?.pressed && (now - lastEnterExitTime > 500)) {
            lastEnterExitTime = now;
            if (typeof window.enterOrExitCarWithBlink === 'function') window.enterOrExitCarWithBlink();
            else if (typeof toggleEnterExitVehicle === 'function') toggleEnterExitVehicle();
          }

          // Nút Y (Tay trái): Đổi ghế ngồi giữa các ghế phụ (1, 2, 3)
          if (isLeftHand && btns[5]?.pressed && (now - lastTouchSeatSwapTime > 400)) {
            lastTouchSeatSwapTime = now;
            if (typeof window.swapSeatOrTakeDriverControl === 'function') window.swapSeatOrTakeDriverControl();
            else if (typeof cycleCabinSeatPosition === 'function') cycleCabinSeatPosition();
          }

          // Nút B (Tay phải): Cân bằng tâm góc nhìn
          if (isRightHand && btns[5]?.pressed && (now - lastRecenterTime > 300)) {
            lastRecenterTime = now;
            if (typeof state !== 'undefined' && state) {
              state.eyeLookYaw = 0;
              state.eyeLookPitch = 0;
            }
            if (typeof autoCenterBalancePassengerView === 'function') autoCenterBalancePassengerView();
          }

          // Nút A (Tay phải): Còi xe
          if (isRightHand && btns[4]?.pressed && (now - lastHornTime > 350)) {
            lastHornTime = now;
            if (typeof playSmartVehicleHornSound === 'function') playSmartVehicleHornSound('CAR');
            else if (typeof playHonkSound === 'function') playHonkSound();
          }
        }
      }
    }

    // NẾU NGƯỜI CHƠI KHÔNG CÓ QUYỀN LÁI (KHÁCH GHẾ PHỤ / KÍNH 2):
    // Khóa hoàn toàn ga/lái về 0 và bỏ qua bước tính vật lý xe / CAR_SYNC / ESP32!
    if (!canDrive) {
      smoothedSteerInput = 0;
      smoothedThrottleInput = 0;
      return;
    }

    // Nội suy mượt mà tín hiệu điều khiển của Tài Xế
    const hasActiveInput = Math.abs(rawSteer) > 0.015 || Math.abs(rawThrottle) > 0.015 || isBraking;
    smoothedSteerInput = THREE.MathUtils.lerp(smoothedSteerInput, rawSteer, Math.min(1, dt * 14));
    smoothedThrottleInput = THREE.MathUtils.lerp(smoothedThrottleInput, rawThrottle, Math.min(1, dt * 10));

    // ------------------------------------------------------------------------
    // VẬT LÝ XE: TÍCH PHÂN VẬN TỐC, RẼ MƯỢT & NHÂN TỐC ĐỘ 5X TRÊN APP
    // ------------------------------------------------------------------------
    if (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING') {
      if (hasActiveInput) {
        state.engineRunning = true;
        const curvedSteer = Math.sign(smoothedSteerInput) * Math.pow(Math.abs(smoothedSteerInput), 1.25);
        const maxSpeedMs = 24.0; // ~86 km/h

        if (isBraking) {
          const decelAlpha = THREE.MathUtils.clamp(dt * 8.5, 0, 1.0);
          state.velocityMs = THREE.MathUtils.lerp(state.velocityMs || 0, 0, decelAlpha);
          if (Math.abs(state.velocityMs) < 0.06) {
            state.velocityMs = 0;
          }
        } else {
          const targetVel = smoothedThrottleInput * maxSpeedMs;
          const accelAlpha = THREE.MathUtils.clamp(dt * 5.2, 0, 1.0);
          state.velocityMs = THREE.MathUtils.lerp(state.velocityMs || 0, targetVel, accelAlpha);
        }

        // Tốc độ ảo hiển thị trên màn hình HUD tăng gấp 5 lần
        state.speedKmh = Math.abs(state.velocityMs || 0) * 3.6 * VIRTUAL_APP_SPEED_SCALE;

        // Rẽ lái tự nhiên theo vận tốc
        const turnDirection = state.velocityMs >= -0.05 ? 1 : -1;
        const speedFactor = Math.max(0.35, Math.min(1.25, Math.abs(state.velocityMs) / 7.0));
        const yawDelta = -curvedSteer * 1.90 * speedFactor * turnDirection * dt;
        state.headingRad += yawDelta;

        if (typeof vehicleRoot !== 'undefined' && vehicleRoot) {
          vehicleRoot.rotation.y = state.headingRad;
          // QUÃNG ĐƯỜNG DỊCH CHUYỂN 3D NHANH GẤP 5 LẦN TRÊN APP
          const step = (state.velocityMs || 0) * VIRTUAL_APP_SPEED_SCALE * dt;
          vehicleRoot.position.x -= Math.sin(state.headingRad) * step;
          vehicleRoot.position.z -= Math.cos(state.headingRad) * step;
        }

        if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
          steeringWheelPivot.rotation.z = -curvedSteer * 1.35;
        }
        if (typeof state.wheelRotationRad === 'number') {
          state.wheelRotationRad += (((state.velocityMs || 0) * VIRTUAL_APP_SPEED_SCALE * dt) / 0.38);
        }
      } else {
        // Nhả bàn đạp -> Giảm tốc tự nhiên theo quán tính và DỪNG YÊN TẠI VỊ TRÍ MỚI
        if (Math.abs(state.velocityMs || 0) > 0.03) {
          state.velocityMs *= Math.pow(0.22, dt);
          state.speedKmh = Math.abs(state.velocityMs || 0) * 3.6 * VIRTUAL_APP_SPEED_SCALE;
          const step = (state.velocityMs || 0) * VIRTUAL_APP_SPEED_SCALE * dt;
          if (typeof vehicleRoot !== 'undefined' && vehicleRoot) {
            vehicleRoot.position.x -= Math.sin(state.headingRad) * step;
            vehicleRoot.position.z -= Math.cos(state.headingRad) * step;
          }
          if (typeof state.wheelRotationRad === 'number') {
            state.wheelRotationRad += (step / 0.38);
          }
        } else {
          state.velocityMs = 0;
          state.speedKmh = 0;
        }
      }

      // Phát CAR_SYNC ở tần số 20Hz để đồng bộ vị trí xe sang Kính Quest / Điện thoại / Server
      if (now - lastCarSyncTime >= 50 && typeof vehicleRoot !== 'undefined' && vehicleRoot) {
        lastCarSyncTime = now;
        if (typeof mpSocket !== 'undefined' && mpSocket && mpSocket.readyState === WebSocket.OPEN) {
          mpSocket.send(JSON.stringify({
            type: 'CAR_SYNC',
            carId: state.activeCarId || 'car_host',
            x: Number(vehicleRoot.position.x.toFixed(3)),
            z: Number(vehicleRoot.position.z.toFixed(3)),
            heading: Number(state.headingRad.toFixed(4)),
            speedKmh: Number(state.speedKmh.toFixed(1)),
            steerDeg: Number((state.steeringAngleDeg || 0).toFixed(1))
          }));
        }
      }
    }

    // Gửi lệnh điều khiển phần cứng xuống ESP32 ngoài đời (40ms ~ 25Hz) — GIỮ NGUYÊN 1X AN TOÀN
    if (now - lastEsp32SendTime >= 40) {
      let outThrottlePwm = 0;
      let outSteerPercent = 0;
      if (hasActiveInput) {
        outThrottlePwm = isBraking ? 0 : Math.round(smoothedThrottleInput * 255);
        outSteerPercent = Math.round(smoothedSteerInput * 100);
      }
      const changedEnough =
        Math.abs(outThrottlePwm - lastSentThrottle) >= 2 ||
        Math.abs(outSteerPercent - lastSentSteer) >= 2 ||
        (outThrottlePwm === 0 && lastSentThrottle !== 0);

      if (changedEnough) {
        lastEsp32SendTime = now;
        lastSentThrottle = outThrottlePwm;
        lastSentSteer = outSteerPercent;
        const gearMode = outThrottlePwm < -5 ? 'R' : (outThrottlePwm > 5 ? 'D' : 'N');
        sendHardwareControlToEsp32(outThrottlePwm, outSteerPercent, gearMode, isBraking, activeDeviceName || 'APP');
      }
    }
  }

  // --------------------------------------------------------------------------
  // 25.6. BẢN ĐIỆN THOẠI: TỐI ƯU KHÔNG GIAN, VUỐT LƯỚT 360° & XOAY LẮC GYROSCOPE
  // --------------------------------------------------------------------------
  if (isMobilePhone && typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const funcPanel = document.getElementById('function-panel');
      if (funcPanel) funcPanel.classList.add('mobile-compact-hidden');
      const camHud = document.getElementById('v250-dual-cam-hud');
      if (camHud) camHud.style.display = 'none';
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let isTouching = false;

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1 && !e.target.closest('button, input, select, #liquid-gear-widget-container')) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isTouching = true;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isTouching || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      touchStartX = t.clientX;
      touchStartY = t.clientY;

      if (typeof state !== 'undefined' && state) {
        state.eyeLookYaw = (state.eyeLookYaw || 0) - dx * 0.006;
        state.eyeLookPitch = THREE.MathUtils.clamp((state.eyeLookPitch || 0) - dy * 0.006, -1.0, 1.0);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isTouching = false;
    }, { passive: true });

    let initialBeta = null;
    let initialGamma = null;

    window.addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      if (initialBeta === null) {
        initialBeta = e.beta;
        initialGamma = e.gamma;
      }
      const dGamma = (e.gamma - initialGamma);
      const dBeta = (e.beta - initialBeta);
      if (typeof state !== 'undefined' && state && !isTouching) {
        state.eyeLookYaw = THREE.MathUtils.degToRad(-dGamma * 0.75);
        state.eyeLookPitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(-dBeta * 0.5, -45, 45));
      }
    });
  }

  // --------------------------------------------------------------------------
  // 25.7. CHUẨN HÓA NỘI THẤT 3D & 3 MÀN HÌNH YOUTUBE (Z = 0.48M, DIRTY-CHECK 24FPS)
  // --------------------------------------------------------------------------
  function alignSteeringWheelAndCleanShaftOnly() {
    if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
      steeringWheelPivot.position.set(-0.41, 0.72, -0.42);
      steeringWheelPivot.rotation.x = THREE.MathUtils.degToRad(-20);
      steeringWheelPivot.visible = true;
    }

    if (typeof chassisGroup === 'undefined' || !chassisGroup) return;

    chassisGroup.traverse((obj) => {
      if (!obj) return;
      if (obj.isMesh) {
        // Chỉ ẩn đúng ống hình trụ dư thừa của trục lái cũ
        if (obj.geometry && obj.geometry.type === 'CylinderGeometry' && obj.parent !== steeringWheelPivot) {
          const p = obj.geometry.parameters || {};
          if (p.radiusTop < 0.065 && p.height > 0.25 &&
              Math.abs(obj.position.x - (-0.38)) < 0.14 &&
              obj.position.y > 0.42 && obj.position.y < 1.05 &&
              obj.position.z < -0.32 && obj.position.z > -0.78) {
            obj.visible = false;
          }
        }
      }
      // Ẩn tuyệt đối mọi bảng tên / notice / speech bubble lơ lửng trong cabin xe chắn tầm nhìn kính hậu và kính chắn gió
      if (obj.isSprite || (obj.material && obj.material.isSpriteMaterial)) {
        if (obj.position.y > 0.8 && obj.position.z < 0.6) {
          obj.visible = false;
        }
      }
    });

    if (typeof specializedInteriorGroup !== 'undefined' && specializedInteriorGroup) {
      specializedInteriorGroup.traverse((obj) => {
        if (obj && (obj.isSprite || (obj.material && obj.material.isSpriteMaterial))) {
          obj.visible = false;
        }
      });
    }

    if (typeof roofBeaconGroup !== 'undefined' && roofBeaconGroup && typeof state !== 'undefined' && state && state.playerMode === 'DRIVING') {
      roofBeaconGroup.visible = false;
    }
  }

  const ytCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (ytCanvas) {
    ytCanvas.width = 640;
    ytCanvas.height = 360;
  }
  const ytCtx = ytCanvas ? ytCanvas.getContext('2d') : null;
  const ytTex = ytCanvas ? new THREE.CanvasTexture(ytCanvas) : null;
  if (ytTex && THREE.SRGBColorSpace) ytTex.colorSpace = THREE.SRGBColorSpace;
  let ytCanvasDirty = true;
  let frameCounter = 0;

  function setupSyncedThreeYouTubeScreens() {
    const carGroup = (typeof chassisGroup !== 'undefined' && chassisGroup)
      ? chassisGroup
      : (typeof vehicleRoot !== 'undefined' ? vehicleRoot : null);
    if (!carGroup || carGroup.userData.v260ScreensMounted) return;
    carGroup.userData.v260ScreensMounted = true;

    // Gắn màn hình táp-lô phía trước
    carGroup.traverse((obj) => {
      if (obj && obj.isMesh && obj.geometry?.type === 'PlaneGeometry' &&
          obj.position.z < -0.15 && obj.position.y > 0.55 && obj.position.y < 0.96) {
        obj.material = new THREE.MeshBasicMaterial({ map: ytTex, side: THREE.DoubleSide });
      }
    });

    // Gắn 2 màn hình ghế phụ hàng sau tại z = 0.48m (Nổi hoàn toàn trên đệm ghế trước 0.38m)
    const rearConfigs = [
      { name: 'RearLeftYtV260', x: -0.41, y: 0.88, z: 0.48 },
      { name: 'RearRightYtV260', x: 0.41, y: 0.88, z: 0.48 }
    ];

    rearConfigs.forEach((cfg) => {
      const mount = new THREE.Group();
      mount.name = cfg.name;
      mount.position.set(cfg.x, cfg.y, cfg.z);
      mount.rotation.x = THREE.MathUtils.degToRad(-5);

      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.20, 0.014),
        new THREE.MeshStandardMaterial({ color: 0x101726, roughness: 0.25, metalness: 0.85 })
      );
      mount.add(bezel);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.18),
        new THREE.MeshBasicMaterial({ map: ytTex, side: THREE.DoubleSide })
      );
      screen.position.z = 0.009;
      mount.add(screen);
      carGroup.add(mount);
    });
  }

  function updateSyncedYouTubeCanvas() {
    if (!ytCtx) return;
    const vid = document.getElementById('yt-direct-mp4-view') || document.getElementById('yt-html5-player');
    const isPlaying = Boolean(vid && !vid.paused && vid.readyState >= 2);

    if (!isPlaying && !ytCanvasDirty) return;
    ytCanvasDirty = false;

    ytCtx.fillStyle = '#070b14';
    ytCtx.fillRect(0, 0, 640, 360);

    if (isPlaying) {
      try {
        ytCtx.drawImage(vid, 0, 36, 640, 284);
      } catch (e) {}
    }

    // Thanh Header
    ytCtx.fillStyle = 'rgba(9, 14, 26, 0.88)';
    ytCtx.fillRect(0, 0, 640, 36);
    ytCtx.fillStyle = '#ff0033';
    ytCtx.fillRect(10, 6, 88, 24);
    ytCtx.fillStyle = '#ffffff';
    ytCtx.font = 'bold 13.5px sans-serif';
    ytCtx.fillText('▶ YouTube', 16, 23);

    // Tiêu đề video
    ytCtx.fillStyle = '#e2e8f0';
    ytCtx.font = '13px sans-serif';
    const titleText = (typeof state !== 'undefined' && state.nowPlayingTitle) ? state.nowPlayingTitle : 'YouTube Đa Màn Hình Buồng Lái Rolls-Royce';
    ytCtx.fillText(titleText.slice(0, 52), 108, 23);

    // Thanh Footer
    ytCtx.fillStyle = 'rgba(9, 14, 26, 0.92)';
    ytCtx.fillRect(0, 320, 640, 40);
    ytCtx.fillStyle = '#00ff88';
    ytCtx.font = 'bold 12.5px monospace';
    const curTime = (vid && vid.currentTime) ? Number(vid.currentTime).toFixed(1) : '0.0';
    const durTime = (vid && vid.duration && Number.isFinite(vid.duration)) ? Number(vid.duration).toFixed(1) : 'LIVE';
    ytCtx.fillText(\`▶ \${isPlaying ? 'ĐANG PHÁT' : 'TẠM DỪNG'}: \${curTime}s / \${durTime}s | ĐỒNG BỘ 3 MÀN HÌNH\`, 14, 345);

    if (ytTex) ytTex.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // 25.8. ĐỒNG BỘ 1 CHIỀU RA LIQUID GEAR WIDGET & ROLE SEAT BADGE
  // --------------------------------------------------------------------------
  function updateRoleSeatBadge() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('v260-role-seat-badge');
    if (!badge) return;

    const isDriver = (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING' && (state.seatIndex === 0 || state.isHostPlayer === true));
    const isDrivingMode = (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING');
    const seat = (typeof state !== 'undefined' && state.seatIndex !== undefined) ? state.seatIndex : 0;

    let deviceTag = isQuestHeadset ? '🥽 Quest 3' : (isMobilePhone ? '📱 Mobile' : '💻 Laptop Admin');

    if (!isDrivingMode) {
      badge.textContent = \`\${deviceTag} | 🚶 ĐI BỘ TỰ DO\`;
      badge.className = 'v260-role-badge role-foot';
    } else if (isDriver) {
      badge.textContent = \`\${deviceTag} | 🚗 TÀI XẾ (GHẾ 0) — ĐIỀU KHIỂN CHÍNH [5X SPEED]\`;
      badge.className = 'v260-role-badge role-driver';
    } else {
      const seatNames = ['Tài Xế', 'Ghế Phụ Trước', 'Ghế Sau Trái', 'Ghế Sau Phải'];
      badge.textContent = \`\${deviceTag} | 🛋️ HÀNH KHÁCH (\${seatNames[seat] || 'Ghế Phụ ' + seat}) — QUAN SÁT 360°\`;
      badge.className = 'v260-role-badge role-passenger';
    }
  }

  function syncLiquidGearWidget() {
    if (typeof document === 'undefined') return;
    const sig = (typeof state !== 'undefined' && state.turnSignal) ? state.turnSignal : 'OFF';
    const isHead = Boolean(typeof state !== 'undefined' && state.headlightsOn);
    const seat = (typeof state !== 'undefined' && state.seatIndex !== undefined) ? state.seatIndex : 0;

    const setItem = (cmd, active, badgeText) => {
      const btn = document.querySelector(\`[data-liquid-cmd="\${cmd}"]\`);
      if (!btn) return;
      btn.classList.toggle('active-true', Boolean(active));
      const badge = btn.querySelector('.liquid-badge');
      if (badge && badgeText !== undefined) badge.textContent = badgeText;
    };

    setItem('TOGGLE_HEADLIGHT', isHead, isHead ? 'BẬT' : 'TẮT');
    setItem('TURN_LEFT', sig === 'LEFT', sig === 'LEFT' ? 'ĐANG CHỚP' : 'TẮT');
    setItem('TURN_RIGHT', sig === 'RIGHT', sig === 'RIGHT' ? 'ĐANG CHỚP' : 'TẮT');
    setItem('SWAP_SEAT', true, \`GHẾ \${seat + 1}\`);
  }

  function bindLiquidGearEvents() {
    if (typeof document === 'undefined') return;
    const trigger = document.getElementById('liquid-gear-trigger-btn');
    const menu = document.getElementById('liquid-gear-menu-list');
    if (trigger && menu && !trigger.getAttribute('data-bound')) {
      trigger.setAttribute('data-bound', 'true');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.classList.toggle('liquid-expanded');
        trigger.classList.toggle('liquid-open', open);
      });

      menu.querySelectorAll('.liquid-item-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cmd = btn.getAttribute('data-liquid-cmd');
          switch (cmd) {
            case 'DRIVE_RR':
            case 'DRIVE_COUPE':
            case 'DRIVE_MOTO': {
              const k = cmd === 'DRIVE_RR' ? '4' : (cmd === 'DRIVE_COUPE' ? '5' : '6');
              window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
              break;
            }
            case 'SWAP_SEAT':
              if (typeof window.swapSeatOrTakeDriverControl === 'function') window.swapSeatOrTakeDriverControl();
              else if (typeof cycleCabinSeatPosition === 'function') cycleCabinSeatPosition();
              break;
            case 'TOGGLE_HEADLIGHT':
              if (typeof toggleHeadlights === 'function') toggleHeadlights();
              break;
            case 'TURN_LEFT':
              if (typeof cycleTurnSignals === 'function') cycleTurnSignals('LEFT');
              else if (typeof toggleTurnSignal === 'function') toggleTurnSignal('LEFT');
              break;
            case 'TURN_RIGHT':
              if (typeof cycleTurnSignals === 'function') cycleTurnSignals('RIGHT');
              else if (typeof toggleTurnSignal === 'function') toggleTurnSignal('RIGHT');
              break;
            case 'GARAGE_DOOR':
              if (typeof window.toggleRollingShutterWithAudio === 'function') window.toggleRollingShutterWithAudio();
              break;
            case 'OPEN_YOUTUBE':
              if (typeof openRealYouTubeApp === 'function') openRealYouTubeApp();
              break;
            case 'TOGGLE_REARCAM':
              if (typeof toggleRearCamPiPModal === 'function') toggleRearCamPiPModal();
              break;
            case 'CALL_AMBULANCE':
              if (typeof spawnEmergencyAmbulanceConvoy === 'function') spawnEmergencyAmbulanceConvoy();
              break;
            case 'TOGGLE_ALL_NPCS':
              if (typeof toggleAllWorldCharactersAndVehicles === 'function') toggleAllWorldCharactersAndVehicles();
              break;
          }
          syncLiquidGearWidget();
        });
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#liquid-gear-widget-container')) {
          menu.classList.remove('liquid-expanded');
          trigger.classList.remove('liquid-open');
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // 25.9. VẬT LÝ TÔNG HẤT TUNG / HẤT VĂNG NPC & THÚ CƯNG (RAGDOLL LAUNCH)
  // --------------------------------------------------------------------------
  const ragdollLaunchedEntities = new Set();
  let cachedHitTargets = [];
  let lastTargetScanTime = 0;
  const _carWorldPos = new THREE.Vector3();
  const _targetWorldPos = new THREE.Vector3();

  function collectAllPedestriansAndPetsInScene() {
    const targets = new Set();
    if (typeof sidewalkNpcs !== 'undefined' && Array.isArray(sidewalkNpcs)) {
      sidewalkNpcs.forEach((npc) => { if (npc) targets.add(npc); });
    }
    if (typeof scene !== 'undefined' && scene && scene.children) {
      scene.children.forEach((obj) => {
        if (!obj || !obj.isGroup) return;
        if (typeof vehicleRoot !== 'undefined' && obj === vehicleRoot) return;
        if (typeof playerAvatarGroup !== 'undefined' && obj === playerAvatarGroup) return;
        if (typeof cityGroup !== 'undefined' && obj === cityGroup) return;
        if (typeof allTrafficVehicles !== 'undefined' && Array.isArray(allTrafficVehicles) && allTrafficVehicles.includes(obj)) return;

        const ud = obj.userData || {};
        const isPedOrPet = ud.isPedestrian || ud.isPet || ud.isDog || ud.walkSpeed !== undefined || /npc|dog|pet|child|walker/i.test(obj.name || '');
        if (isPedOrPet) targets.add(obj);
      });
    }
    return Array.from(targets);
  }

  function updateUniversalNpcAndPetRagdollCollisions(dt, elapsed) {
    if (typeof state === 'undefined' || !state || typeof vehicleRoot === 'undefined' || !vehicleRoot) return;

    if (elapsed - lastTargetScanTime > 2.0 || cachedHitTargets.length === 0) {
      cachedHitTargets = collectAllPedestriansAndPetsInScene();
      lastTargetScanTime = elapsed;
    }

    vehicleRoot.getWorldPosition(_carWorldPos);
    const carSpeedAbs = Math.abs(state.velocityMs || 0);
    const isMovingFast = state.playerMode === 'DRIVING' && carSpeedAbs > 1.2;

    if (isMovingFast) {
      const hitRadius = 2.65;
      for (let i = 0; i < cachedHitTargets.length; i++) {
        const entity = cachedHitTargets[i];
        if (!entity || !entity.visible) continue;
        const ud = entity.userData || (entity.userData = {});
        if (ud.ragdollActive && ud.ragdollTimer > 2.0) continue;

        entity.getWorldPosition(_targetWorldPos);
        const distSq = _carWorldPos.distanceToSquared(_targetWorldPos);

        if (distSq < hitRadius * hitRadius) {
          const impactSpeed = Math.max(carSpeedAbs * VIRTUAL_APP_SPEED_SCALE, 10.0);
          const fwdX = -Math.sin(state.headingRad || 0) * Math.sign(state.velocityMs || 1);
          const fwdZ = -Math.cos(state.headingRad || 0) * Math.sign(state.velocityMs || 1);

          ud.ragdollActive = true;
          ud.ragdollTimer = 0;
          ud.ragdollVelX = fwdX * (impactSpeed * 0.95) + (Math.random() - 0.5) * 5.0;
          ud.ragdollVelY = 7.5 + Math.min(impactSpeed * 0.45, 14.0);
          ud.ragdollVelZ = fwdZ * (impactSpeed * 0.95) + (Math.random() - 0.5) * 5.0;
          ud.ragdollRotSpeedX = (Math.random() - 0.5) * 16.0;
          ud.ragdollRotSpeedY = (Math.random() - 0.5) * 16.0;
          ud.ragdollRotSpeedZ = (Math.random() - 0.5) * 16.0;

          ragdollLaunchedEntities.add(entity);

          if (typeof playBicycleCrashSound === 'function') {
            playBicycleCrashSound();
          }
        }
      }
    }

    if (ragdollLaunchedEntities.size > 0) {
      const gravity = 22.0;
      for (const entity of Array.from(ragdollLaunchedEntities)) {
        if (!entity) {
          ragdollLaunchedEntities.delete(entity);
          continue;
        }
        const ud = entity.userData;
        if (!ud || !ud.ragdollActive) {
          ragdollLaunchedEntities.delete(entity);
          continue;
        }

        ud.ragdollTimer += dt;
        ud.ragdollVelY -= gravity * dt;

        entity.position.x += ud.ragdollVelX * dt;
        entity.position.y += ud.ragdollVelY * dt;
        entity.position.z += ud.ragdollVelZ * dt;

        entity.rotation.x += ud.ragdollRotSpeedX * dt;
        entity.rotation.y += ud.ragdollRotSpeedY * dt;
        entity.rotation.z += ud.ragdollRotSpeedZ * dt;

        const groundLevel = ud.baseY || 0;
        if (entity.position.y <= groundLevel) {
          entity.position.y = groundLevel;
          ud.ragdollVelY = -ud.ragdollVelY * 0.35;
          ud.ragdollVelX *= 0.65;
          ud.ragdollVelZ *= 0.65;
          ud.ragdollRotSpeedX *= 0.5;
          ud.ragdollRotSpeedY *= 0.5;
          ud.ragdollRotSpeedZ *= 0.5;

          if (Math.abs(ud.ragdollVelY) < 1.0 && ud.ragdollTimer > 2.5) {
            ud.ragdollActive = false;
            ragdollLaunchedEntities.delete(entity);
            entity.rotation.set(0, entity.rotation.y, 0);
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 25.10. TÍCH HỢP DUY NHẤT VÀO VÒNG LẶP RENDER CHÍNH (SCENE.ONBEFORERENDER)
  // --------------------------------------------------------------------------
  if (typeof scene !== 'undefined' && scene) {
    const prevOnBeforeRenderV260 = scene.onBeforeRender;
    let lastV260Time = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
      if (typeof prevOnBeforeRenderV260 === 'function') {
        prevOnBeforeRenderV260.call(this, rendererInst, sceneInst, cameraInst);
      }
      if (typeof camera !== 'undefined' && cameraInst !== camera && (!rendererInst || !rendererInst.xr || !rendererInst.xr.isPresenting)) return;

      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      const dt = Math.min((now - lastV260Time) / 1000, 0.1);
      if (dt < 0.001) return;
      lastV260Time = now;
      const elapsed = (typeof clock !== 'undefined' && clock) ? clock.getElapsedTime() : (now / 1000);
      frameCounter++;

      // Điều khiển xe bằng GOG R808 & Quest Touch (Nhân tốc độ ảo 5x, bảo toàn 1x phần cứng)
      pollAllGamepadsWheelGog808AndThumbsticks(dt);

      // Vật lý tông hất tung NPC & Thú cưng
      updateUniversalNpcAndPetRagdollCollisions(dt, elapsed);

      // Cập nhật 3 màn hình YouTube & UI ở tần số tiết kiệm VRAM 24 FPS (mỗi 3 frame)
      if (frameCounter % 3 === 0) {
        updateSyncedYouTubeCanvas();
        syncLiquidGearWidget();
        updateRoleSeatBadge();
      }
    };
  }

  // Khởi tạo ban đầu
  if (typeof window !== 'undefined') {
    const initV260Dom = () => {
      initRearMirrorDefaultBackdrop();
      alignSteeringWheelAndCleanShaftOnly();
      setupSyncedThreeYouTubeScreens();
      bindLiquidGearEvents();
      syncLiquidGearWidget();
      updateRoleSeatBadge();
      setTimeout(connectBothEsp32CamerasAndController, 600);
    };
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initV260Dom);
    } else {
      initV260Dom();
    }
  }
})();
`;

fs.writeFileSync(targetFile, code, 'utf8');
console.log('[BUILD SUCCESS] tools/v260_master_module.js updated!');
