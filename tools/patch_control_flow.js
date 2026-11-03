// tools/patch_control_flow.js
const fs = require('fs');

console.log('🔧 Bắt đầu áp dụng bản vá hoàn chỉnh khôi phục khả năng lái xe 100%...');

function normalizeLines(str) {
  return str.replace(/\r\n/g, '\n');
}

// 1. SỬA SERVER.JS
let serverCode = normalizeLines(fs.readFileSync('server.js', 'utf8'));

// A. sendRateLimitedEsp32Udp: Dùng sendUdpCarCommand trực tiếp thay vì udpOutSocket cổng ngẫu nhiên không có log
const oldSendRateLimited = normalizeLines(`    lastSteerDegSent = steerDeg;
    lastEscUsSent = escUs;

    const pkt = Buffer.alloc(4);
    pkt.writeInt16LE(steerDeg, 0);
    pkt.writeInt16LE(escUs, 2);
    const targetHost = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.ip) ? esp32CarConfig.ip : ESP32_HOST;
    const targetPort = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.port) ? esp32CarConfig.port : ESP32_PORT;
    udpOutSocket.send(pkt, 0, 4, targetPort, targetHost);
  }`);

const newSendRateLimited = normalizeLines(`    lastSteerDegSent = steerDeg;
    lastEscUsSent = escUs;

    // Gửi qua hàm chuẩn sendUdpCarCommand (udpServer port 4210 có in log Terminal chi tiết)
    sendUdpCarCommand(steerDeg, escUs);
  }`);

if (serverCode.includes(oldSendRateLimited)) {
  serverCode = serverCode.replace(oldSendRateLimited, newSendRateLimited);
  console.log('✅ Đã cập nhật sendRateLimitedEsp32Udp trong server.js');
} else {
  console.log('⚠️ oldSendRateLimited not found in server.js');
}

// B. nativeWheelChild.stdout: Chỉ gửi xuống ESP32 khi vô lăng/bàn đạp đang được thao tác thật (chống đè xung 1500 lên Kính)
const oldNativeUdpSend = normalizeLines(`            // Gửi xuống ESP32 RC Car qua UDP (Port 4210)
            sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, computeAsymmetricEscPulseUs(data.driveNorm, NaN, data.gear), data.gear);`);

const newNativeUdpSend = normalizeLines(`            // Gửi xuống ESP32 RC Car qua UDP (Port 4210) - Kiểm tra trạng thái thao tác để không cướp quyền Kính VR
            const isWheelActivelyMoved = Math.abs(data.steerNorm) > 0.02 || data.gasNorm > 0.02 || data.brakeNorm > 0.02 || data.reverseNorm > 0.02;
            const nowTime = Date.now();
            if (isWheelActivelyMoved) {
              activeDriverClient = 'nativeWheel';
              activeDriverLastActiveTime = nowTime;
              sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, computeAsymmetricEscPulseUs(data.driveNorm, NaN, data.gear), data.gear, true);
            } else if (activeDriverClient === 'nativeWheel') {
              activeDriverClient = null;
              activeDriverLastActiveTime = 0;
              sendRateLimitedEsp32Udp(0, 0, 1500, 'D', true);
            }`);

if (serverCode.includes(oldNativeUdpSend)) {
  serverCode = serverCode.replace(oldNativeUdpSend, newNativeUdpSend);
  console.log('✅ Đã cập nhật nativeWheelChild UDP arbitration trong server.js');
} else {
  console.log('⚠️ oldNativeUdpSend not found in server.js');
}

// Handler 2 trong bindUnifiedWss: gắn activeDriverClient khi nhận RC_CONTROL_CMD / CAR_CONTROL
const oldWssControl = normalizeLines(`        // 2. Nhận lệnh điều khiển từ Bàn phím (Localhost) hoặc Tay cầm VR (Kính) gửi xuống ESP32
        if (data.type === 'RC_CONTROL_CMD' || data.type === 'CAR_CONTROL') {
          const s = Number(data.steeringNorm ?? data.steerNorm ?? (typeof data.steer === 'number' && data.steer <= 180 ? (data.steer - 90) / 45 : 0));
          const rawPulse = Number(data.escPulseUs ?? (Math.abs(Number(data.throttle)) >= 500 ? data.throttle : NaN));
          const d = Number(
            data.throttleNorm ??
            data.driveNorm ??
            (Number.isFinite(rawPulse) ? (rawPulse - 1500) / (rawPulse < 1500 ? 400 : 260) : 0)
          );
          sendRateLimitedEsp32Udp(s, d, rawPulse, data.gear);
          return;
        }`);

const newWssControl = normalizeLines(`        // 2. Nhận lệnh điều khiển từ Bàn phím (Localhost) hoặc Tay cầm VR (Kính) gửi xuống ESP32
        if (data.type === 'RC_CONTROL_CMD' || data.type === 'CAR_CONTROL') {
          const s = Number(data.steeringNorm ?? data.steerNorm ?? (typeof data.steer === 'number' && data.steer <= 180 ? (data.steer - 90) / 45 : 0));
          const rawPulse = Number(data.escPulseUs ?? (Math.abs(Number(data.throttle)) >= 500 ? data.throttle : NaN));
          const d = Number(
            data.throttleNorm ??
            data.driveNorm ??
            (Number.isFinite(rawPulse) ? (rawPulse - 1500) / (rawPulse < 1500 ? 400 : 260) : 0)
          );
          const isDriving = Math.abs(s) > 0.02 || Math.abs(d) > 0.02;
          const now = Date.now();
          if (isDriving) {
            activeDriverClient = ws;
            activeDriverLastActiveTime = now;
          }
          sendRateLimitedEsp32Udp(s, d, rawPulse, data.gear, isDriving);
          return;
        }`);

if (serverCode.includes(oldWssControl)) {
  serverCode = serverCode.replace(oldWssControl, newWssControl);
  console.log('✅ Đã cập nhật wss RC_CONTROL_CMD trong server.js');
} else {
  console.log('⚠️ oldWssControl not found in server.js');
}

fs.writeFileSync('server.js', serverCode, 'utf8');
fs.writeFileSync('server/server.js', serverCode, 'utf8');
console.log('✅ Đã đồng bộ server.js sang server/server.js');

// 2. SỬA APP.JS
let appCode = normalizeLines(fs.readFileSync('app.js', 'utf8'));

// B. pollGamepadRacingWheel: Không ngắt kết nối racingWheel nếu window._racingWheel đang kết nối
const oldPollNoPad = normalizeLines(`    if (!activeGp) {
      if (racingWheel.connected) {
        racingWheel.connected = false;
        racingWheel.deviceName = 'Chưa cắm Vô Lăng';
        updateConnectedBadge(false);
      }
      return;
    }`);

const newPollNoPad = normalizeLines(`    if (!activeGp) {
      if (typeof window !== 'undefined' && window._racingWheel && window._racingWheel.connected) {
        racingWheel.connected = true;
        racingWheel.deviceName = window._racingWheel.deviceName || 'GOG R808 Bridge';
        racingWheel.steerAngleDeg = window._racingWheel.steerAngleDeg || 0;
        racingWheel.gasPercent = window._racingWheel.gasPercent || 0;
        racingWheel.brakePercent = window._racingWheel.brakePercent || 0;
        racingWheel.reversePercent = window._racingWheel.reversePercent || 0;
        racingWheel.gear = window._racingWheel.gear || 'D';
        racingWheel.lastInputTime = window._racingWheel.lastInputTime || performance.now();
        updateConnectedBadge(true, racingWheel.deviceName);
        return;
      }
      if (racingWheel.connected) {
        racingWheel.connected = false;
        racingWheel.deviceName = 'Chưa cắm Vô Lăng';
        updateConnectedBadge(false);
      }
      return;
    }`);

if (appCode.includes(oldPollNoPad)) {
  appCode = appCode.replace(oldPollNoPad, newPollNoPad);
  console.log('✅ Đã cập nhật pollGamepadRacingWheel trong app.js');
} else {
  console.log('⚠️ oldPollNoPad not found in app.js');
}

// C. Cài đặt tốc độ và di chuyển localStorage ga lùi về 1100µs
const oldRevDefault = normalizeLines(`      const revPulse = parseInt(e.target.value, 10) || 1350;`);
const newRevDefault = normalizeLines(`      const revPulse = parseInt(e.target.value, 10) || 1100;`);
if (appCode.includes(oldRevDefault)) {
  appCode = appCode.replace(oldRevDefault, newRevDefault);
  console.log('✅ Đã cập nhật revDefault trong app.js');
}

const oldMediumSpeed = normalizeLines(`    btnSpeedMedium?.addEventListener('click', () => {
      setRcSpeedPreset(1585, 12.0, '🚗 Vừa Phải', btnSpeedMedium, 1150);
    });`);
const newMediumSpeed = normalizeLines(`    btnSpeedMedium?.addEventListener('click', () => {
      setRcSpeedPreset(1585, 12.0, '🚗 Vừa Phải', btnSpeedMedium, 1100);
    });`);
if (appCode.includes(oldMediumSpeed)) {
  appCode = appCode.replace(oldMediumSpeed, newMediumSpeed);
  console.log('✅ Đã cập nhật btnSpeedMedium trong app.js');
}

const oldSavedRev = normalizeLines(`    const savedRev = parseInt(localStorage.getItem('rc_max_reverse_pulse'), 10);
    if (savedRev && sliderMaxReverse && valMaxReverse) {
      state.rcMaxReversePulse = savedRev;
      sliderMaxReverse.value = String(savedRev);
      valMaxReverse.textContent = \`\${savedRev}µs\`;
    }`);

const newSavedRev = normalizeLines(`    let savedRev = parseInt(localStorage.getItem('rc_max_reverse_pulse'), 10);
    if (!savedRev || savedRev > 1300 || savedRev < 1050) {
      savedRev = 1100;
      localStorage.setItem('rc_max_reverse_pulse', '1100');
    }
    state.rcMaxReversePulse = savedRev;
    if (sliderMaxReverse && valMaxReverse) {
      sliderMaxReverse.value = String(savedRev);
      valMaxReverse.textContent = \`\${savedRev}µs\`;
    }`);

if (appCode.includes(oldSavedRev)) {
  appCode = appCode.replace(oldSavedRev, newSavedRev);
  console.log('✅ Đã cập nhật auto-migrate savedRev sang 1100µs trong app.js');
} else {
  console.log('⚠️ oldSavedRev not found in app.js');
}

// D. Sửa hệ số ga lùi trong broadcast WHEEL_BRIDGE_INPUT của scene.onBeforeRender
const oldRevSend1 = normalizeLines(`          throttle: wheel.driveNorm < -0.025
            ? Math.round(1445 - Math.pow(Math.abs(wheel.driveNorm), 0.85) * 295)
            : (wheel.driveNorm > 0.025 ? Math.round(1535 + wheel.driveNorm * 185) : 1500),
          escPulseUs: wheel.driveNorm < -0.025
            ? Math.round(1445 - Math.pow(Math.abs(wheel.driveNorm), 0.85) * 295)
            : (wheel.driveNorm > 0.025 ? Math.round(1535 + wheel.driveNorm * 185) : 1500),`);

const newRevSend1 = normalizeLines(`          throttle: wheel.driveNorm < -0.025
            ? Math.round(1445 - Math.pow(Math.abs(wheel.driveNorm), 0.85) * 345)
            : (wheel.driveNorm > 0.025 ? Math.round(1535 + wheel.driveNorm * 185) : 1500),
          escPulseUs: wheel.driveNorm < -0.025
            ? Math.round(1445 - Math.pow(Math.abs(wheel.driveNorm), 0.85) * 345)
            : (wheel.driveNorm > 0.025 ? Math.round(1535 + wheel.driveNorm * 185) : 1500),`);

if (appCode.includes(oldRevSend1)) {
  appCode = appCode.replace(oldRevSend1, newRevSend1);
  console.log('✅ Đã cập nhật biên độ ga lùi 1100µs (hệ số 345) trong app.js');
} else {
  console.log('⚠️ oldRevSend1 not found in app.js');
}

// E. Cập nhật resolveActiveDrivingCommand & attachSceneLoop
const oldResolveCommand = normalizeLines(`  function resolveActiveDrivingCommand(now) {
    // 1. RULE ĐÁNH DẤU LOCALHOST ĐANG CẮM VÔ LĂNG VẬT LÝ (CHỐNG ECHO):
    const localWheel = readLocalGog808State();
    window.__LOCAL_GOG808_CONNECTED__ = Boolean(localWheel && localWheel.connected);

    // Nguồn 1: Vô lăng GOG R808 cắm trực tiếp (trên Localhost Admin)
    if (localWheel && localWheel.active) {
      return {
        source: 'GOG808_LOCAL',
        active: true,
        steerNorm: localWheel.steerNorm,
        gasNorm: localWheel.gasNorm,
        brakeNorm: localWheel.brakeNorm
      };
    }

    // Nguồn 2: Vô lăng GOG R808 truyền qua WebSocket Bridge (trên Kính VR)
    const rb = runtime.remoteBridge;
    const bridgeFresh = rb.connected && (now - rb.updatedAt < CFG.bridgeTimeoutMs);
    const bridgeActive = bridgeFresh && (
      Math.abs(rb.steerNorm) > 0.01 || rb.gasNorm > 0.01 || rb.brakeNorm > 0.01 || rb.reverseNorm > 0.01
    );
    if (bridgeActive) {
      return {
        source: 'GOG808_BRIDGE',
        active: true,
        steerNorm: rb.steerNorm,
        gasNorm: rb.gasNorm,
        brakeNorm: Math.max(rb.brakeNorm, rb.reverseNorm)
      };
    }

    // Nguồn 3: Tay cầm VR (trên Kính Meta Quest 3)
    const xrInput = readXrControllerDriveInput();
    if (xrInput && xrInput.active) {
      return {
        source: 'VR_CONTROLLER',
        active: true,
        steerNorm: xrInput.steerNorm,
        gasNorm: xrInput.gasNorm,
        brakeNorm: xrInput.brakeNorm
      };
    }

    // Nguồn 4: Bàn phím (trên Localhost Admin)
    const k = runtime.keys;
    const keySteer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const keyGas = k.up ? 1 : 0;
    const keyBrake = (k.down || k.brake) ? 1 : 0;
    if (keySteer !== 0 || keyGas !== 0 || keyBrake !== 0) {
      return {
        source: 'KEYBOARD',
        active: true,
        steerNorm: keySteer,
        gasNorm: k.brake ? 0 : keyGas,
        brakeNorm: keyBrake
      };
    }

    return { source: 'IDLE', active: false, steerNorm: 0, gasNorm: 0, brakeNorm: 0 };
  }`);

const newResolveCommand = normalizeLines(`  function resolveActiveDrivingCommand(now) {
    // 1. RULE ĐÁNH DẤU LOCALHOST ĐANG CẮM VÔ LĂNG VẬT LÝ (CHỐNG ECHO):
    const localWheel = readLocalGog808State();
    window.__LOCAL_GOG808_CONNECTED__ = Boolean(localWheel && localWheel.connected);

    // Nguồn 1: Vô lăng GOG R808 cắm trực tiếp (trên Localhost Admin)
    if (localWheel && localWheel.active) {
      return {
        source: 'GOG808_LOCAL',
        active: true,
        steerNorm: localWheel.steerNorm,
        gasNorm: localWheel.gasNorm,
        brakeNorm: localWheel.brakeNorm
      };
    }

    // Nguồn 2: Vô lăng GOG R808 truyền qua WebSocket Bridge (trên Kính VR)
    const rw = (typeof window !== 'undefined' && window._racingWheel && window._racingWheel.connected) ? window._racingWheel : null;
    const rb = runtime.remoteBridge;
    const bridgeConnected = Boolean((rw && rw.connected) || (rb && rb.connected));
    const bridgeLastTime = Math.max(rw ? (rw.lastInputTime || 0) : 0, rb ? (rb.updatedAt || 0) : 0);
    const bridgeFresh = bridgeConnected && (now - bridgeLastTime < CFG.bridgeTimeoutMs);

    const sNorm = rw ? (rw.rawSteer ?? (rw.steerAngleDeg ? rw.steerAngleDeg / 540 : 0)) : (rb?.steerNorm || 0);
    const gNorm = rw ? ((rw.gasPercent || 0) / 100) : (rb?.gasNorm || 0);
    const bNorm = rw ? ((rw.brakePercent || 0) / 100) : (rb?.brakeNorm || 0);
    const rNorm = rw ? ((rw.reversePercent || 0) / 100) : (rb?.reverseNorm || 0);
    const effBrakeNorm = Math.max(bNorm, rNorm);

    if (bridgeFresh && (Math.abs(sNorm) > 0.01 || gNorm > 0.01 || effBrakeNorm > 0.01)) {
      return {
        source: 'GOG808_BRIDGE',
        active: true,
        steerNorm: THREE.MathUtils.clamp(sNorm, -1, 1),
        gasNorm: THREE.MathUtils.clamp(gNorm, 0, 1),
        brakeNorm: THREE.MathUtils.clamp(effBrakeNorm, 0, 1)
      };
    }

    // Nguồn 3: Tay cầm VR (trên Kính Meta Quest 3)
    const xrInput = readXrControllerDriveInput();
    if (xrInput && xrInput.active) {
      return {
        source: 'VR_CONTROLLER',
        active: true,
        steerNorm: xrInput.steerNorm,
        gasNorm: xrInput.gasNorm,
        brakeNorm: xrInput.brakeNorm
      };
    }

    // Nguồn 4: Cụm nút bấm HUD / Laser Pointer
    if (typeof holdState !== 'undefined' && holdState && (holdState.gas || holdState.brake || holdState.left || holdState.right || holdState.up || holdState.down)) {
      const touchSteer = (holdState.right ? 1 : 0) - (holdState.left ? 1 : 0);
      const touchGas = (holdState.gas || holdState.up) ? 1 : 0;
      const touchBrake = (holdState.brake || holdState.down) ? 1 : 0;
      if (touchSteer !== 0 || touchGas !== 0 || touchBrake !== 0) {
        return {
          source: 'TOUCH_HUD',
          active: true,
          steerNorm: THREE.MathUtils.clamp(touchSteer, -1, 1),
          gasNorm: touchBrake ? 0 : touchGas,
          brakeNorm: touchBrake
        };
      }
    }

    // Nguồn 5: Bàn phím (trên Localhost Admin)
    const k = runtime.keys;
    const keySteer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const keyGas = k.up ? 1 : 0;
    const keyBrake = (k.down || k.brake) ? 1 : 0;
    if (keySteer !== 0 || keyGas !== 0 || keyBrake !== 0) {
      return {
        source: 'KEYBOARD',
        active: true,
        steerNorm: keySteer,
        gasNorm: k.brake ? 0 : keyGas,
        brakeNorm: keyBrake
      };
    }

    return { source: 'IDLE', active: false, steerNorm: 0, gasNorm: 0, brakeNorm: 0 };
  }`);

if (appCode.includes(oldResolveCommand)) {
  appCode = appCode.replace(oldResolveCommand, newResolveCommand);
  console.log('✅ Đã cập nhật resolveActiveDrivingCommand trong app.js');
} else {
  console.log('⚠️ oldResolveCommand not found in app.js');
}

// F. ensureVehicleReadyForDriving: Tự động cân bằng tâm góc nhìn
const oldEnsureReady = normalizeLines(`  function ensureVehicleReadyForDriving() {
    if (typeof state === 'undefined' || !state) return;
    if (state.playerMode !== 'DRIVING') {
      state.playerMode = 'DRIVING';
      state.seatIndex = 0;
      if (typeof avatarBodyMesh !== 'undefined' && avatarBodyMesh) {
        avatarBodyMesh.visible = false;
      }
      if (typeof driverSeatMount !== 'undefined' && driverSeatMount && typeof cameraRig !== 'undefined' && cameraRig) {
        if (cameraRig.parent !== driverSeatMount) driverSeatMount.add(cameraRig);
        cameraRig.position.set(0, 0, 0);
      } else if (typeof chassisGroup !== 'undefined' && chassisGroup && typeof cameraRig !== 'undefined' && cameraRig) {
        if (cameraRig.parent !== chassisGroup) chassisGroup.add(cameraRig);
        cameraRig.position.set(-0.38, 0.88, 0.08);
      }
    }
    state.engineRunning = true;
    if (!state.gearIndex || state.gearIndex === 0) {
      state.gearIndex = 3;
      state.gear = 'D';
    }
  }`);

const newEnsureReady = normalizeLines(`  function ensureVehicleReadyForDriving() {
    if (typeof state === 'undefined' || !state) return;
    if (state.playerMode !== 'DRIVING') {
      state.playerMode = 'DRIVING';
      state.seatIndex = 0;
      if (typeof avatarBodyMesh !== 'undefined' && avatarBodyMesh) {
        avatarBodyMesh.visible = false;
      }
      if (typeof driverSeatMount !== 'undefined' && driverSeatMount && typeof cameraRig !== 'undefined' && cameraRig) {
        if (cameraRig.parent !== driverSeatMount) driverSeatMount.add(cameraRig);
        cameraRig.position.set(0, 0, 0);
      } else if (typeof chassisGroup !== 'undefined' && chassisGroup && typeof cameraRig !== 'undefined' && cameraRig) {
        if (cameraRig.parent !== chassisGroup) chassisGroup.add(cameraRig);
        cameraRig.position.set(-0.38, 0.88, 0.08);
      }
      if (typeof resetAndCenterViewpoint === 'function') {
        resetAndCenterViewpoint('DRIVING', 0);
      }
    }
    state.engineRunning = true;
    if (!state.gearIndex || state.gearIndex === 0) {
      state.gearIndex = 3;
      state.gear = 'D';
    }
  }`);

if (appCode.includes(oldEnsureReady)) {
  appCode = appCode.replace(oldEnsureReady, newEnsureReady);
  console.log('✅ Đã cập nhật ensureVehicleReadyForDriving trong app.js');
} else {
  console.log('⚠️ oldEnsureReady not found in app.js');
}

// G. attachSceneLoop: Gửi RC_CONTROL_CMD khi có thao tác lái từ Kính hoặc Bàn phím
const oldHwSend = normalizeLines(`      // 4. Gửi lệnh phần cứng xuống ESP32 (Rate-limited 25Hz)
      if (cmd.source === 'KEYBOARD' || cmd.source === 'VR_CONTROLLER') {
        if (now - runtime.lastHwSendMs >= 40 && (cmd.active || runtime.wasDrivingInputActive)) {
          runtime.lastHwSendMs = now;
          runtime.wasDrivingInputActive = cmd.active;
          const sock = getActiveSocket();
          if (sock && sock.readyState === 1 && sock.bufferedAmount < 65536) {
            const driveNorm = cmd.active ? clamp(cmd.gasNorm - cmd.brakeNorm, -1, 1) : 0;
            sock.send(JSON.stringify({
              type: 'RC_CONTROL_CMD',
              steeringNorm: Number(cmd.steerNorm.toFixed(4)),
              throttleNorm: Number(driveNorm.toFixed(4)),
              gear: state.gear || 'D'
            }));
          }
        }
      }`);

const newHwSend = normalizeLines(`      // 4. Gửi lệnh phần cứng xuống ESP32 (Rate-limited 25Hz)
      const shouldSendHwCmd = (
        cmd.source === 'KEYBOARD' ||
        cmd.source === 'VR_CONTROLLER' ||
        cmd.source === 'TOUCH_HUD' ||
        (isQuestHeadset && cmd.active)
      );
      if (shouldSendHwCmd) {
        if (now - runtime.lastHwSendMs >= 40 && (cmd.active || runtime.wasDrivingInputActive)) {
          runtime.lastHwSendMs = now;
          runtime.wasDrivingInputActive = cmd.active;
          const sock = getActiveSocket();
          if (sock && sock.readyState === 1 && sock.bufferedAmount < 65536) {
            const driveNorm = cmd.active ? (cmd.gasNorm > 0.04 ? cmd.gasNorm : (cmd.brakeNorm > 0.04 ? -cmd.brakeNorm : 0)) : 0;
            sock.send(JSON.stringify({
              type: 'RC_CONTROL_CMD',
              steeringNorm: Number(cmd.steerNorm.toFixed(4)),
              throttleNorm: Number(driveNorm.toFixed(4)),
              gear: state.gear || 'D'
            }));
          }
        }
      }`);

if (appCode.includes(oldHwSend)) {
  appCode = appCode.replace(oldHwSend, newHwSend);
  console.log('✅ Đã cập nhật RC_CONTROL_CMD hardware send trong attachSceneLoop');
} else {
  console.log('⚠️ oldHwSend not found in app.js');
}

// Ghi đè vào tất cả các mirror của app.js
const appMirrors = ['app.js', 'www/app.js', 'server/public/app.js', 'android/app/src/main/assets/public/app.js'];
appMirrors.forEach(p => {
  if (fs.existsSync(p)) {
    fs.writeFileSync(p, appCode, 'utf8');
    console.log(`✅ Đã đồng bộ sang ${p}`);
  }
});

console.log('🎉 Hoàn tất áp dụng bản vá hoàn chỉnh!');
