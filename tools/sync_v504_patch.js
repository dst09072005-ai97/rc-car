// tools/sync_v504_patch.js
const fs = require('fs');
const path = require('path');

console.log('🚀 Bắt đầu áp dụng V504 Gold Master Patch (Vô lăng, Auto-Creep, 1100µs Reverse)...');

function normalize(s) {
  return s.replace(/\r\n/g, '\n');
}

// ============================================================================
// 1. SỬA SERVER.JS
// ============================================================================
let serverCode = normalize(fs.readFileSync('server.js', 'utf8'));

// A. Khai báo rcArbitration và hàm computeAsymmetricEscPulseUs + sendRateLimitedEsp32Udp chuẩn V504
const v504ServerArbitration = `// ============================================================================
// [V504 RESTORED + 1100µs REVERSE] BỘ TRỌNG TÀI ƯU TIÊN VÔ LĂNG & UDP 4210 CHUẨN
// ============================================================================
const rcArbitration = {
  lastPhysicalWheelActiveAt: 0, // Timestamp lần cuối vô lăng Laptop thực sự có thao tác
  lastSentSteerDeg: 90,
  lastSentEscUs: 1500,
  idleNeutralCount: 0,
  WHEEL_PRIORITY_WINDOW_MS: 350 // Khóa ưu tiên 350ms cho vô lăng vật lý, chống kính gửi đè 1500us
};

// Hàm quy đổi xung ESC bất đối xứng: Tiến [1535..1850µs] | Trung tính [1500µs] | Lùi sâu [1445..1100µs]
function computeAsymmetricEscPulseUs(driveNorm, explicitPulseUs, gear = 'D') {
  const rawExplicit = Number(explicitPulseUs);
  if (Number.isFinite(rawExplicit) && rawExplicit >= 1000 && rawExplicit <= 2000 && Math.abs(rawExplicit - 1500) > 5) {
    // Nếu gói gửi lên bị kẹp ở ngưỡng lùi cũ (1250..1320), tự động mở rộng xuống dải 1100us
    if (rawExplicit < 1445 && rawExplicit >= 1250 && driveNorm < -0.05) {
      const revMag = Math.min(1, Math.max(0, Math.abs(driveNorm)));
      return Math.round(1445 - Math.pow(revMag, 0.85) * 345); // Chạm ngưỡng 1100µs khi đạp hết cỡ
    }
    return Math.round(rawExplicit);
  }

  const d = Math.max(-1, Math.min(1, Number(driveNorm) || 0));
  if (Math.abs(d) <= 0.025) return 1500;

  if (d > 0.025 && gear !== 'R') {
    // Dải tiến: khởi động từ 1535µs lên tối đa 1850µs
    return Math.round(1535 + Math.pow(d, 0.9) * 315);
  } else {
    // Dải lùi: vượt deadband 1445µs xuống sâu tới 1100µs
    const revMag = Math.abs(d);
    return Math.round(1445 - Math.pow(revMag, 0.85) * 345);
  }
}

function sendRateLimitedEsp32Udp(steerNorm, driveNorm, explicitEscPulseUs, gear = 'D', source = 'UNKNOWN') {
  const now = Date.now();
  const sNorm = Math.max(-1, Math.min(1, Number(steerNorm) || 0));
  const dNorm = Math.max(-1, Math.min(1, Number(driveNorm) || 0));
  const isInputActive = Math.abs(sNorm) > 0.025 || Math.abs(dNorm) > 0.025 ||
    (Number.isFinite(Number(explicitEscPulseUs)) && Math.abs(Number(explicitEscPulseUs) - 1500) > 15);

  // 1. Nếu tín hiệu đến từ Vô lăng trên Laptop (WINMM_USB hoặc WHEEL_BRIDGE_INPUT)
  if (source === 'WHEEL_BRIDGE' || source === 'WINMM_USB' || source === 'NATIVE_WHEEL') {
    if (isInputActive) {
      rcArbitration.lastPhysicalWheelActiveAt = now;
      rcArbitration.idleNeutralCount = 0;
    } else {
      // Nếu vô lăng đang thả tay ở vị trí nghỉ: chỉ gửi tối đa 2 gói dừng 1500µs rồi ngắt
      // để nhường kênh cho Kính Quest 3 (tránh spam 50Hz trung tính đè tín hiệu kính)
      rcArbitration.idleNeutralCount++;
      if (rcArbitration.idleNeutralCount > 2) return;
    }
  }

  // 2. Nếu tín hiệu đến từ Kính Quest (CAR_CONTROL), nhưng Vô lăng Laptop vừa thao tác trong 350ms qua
  //    và gói từ kính lại là gói dừng trung tính (1500µs) -> BỎ QUA để không làm khựng xe thật!
  if ((source === 'QUEST_CAR_CONTROL' || source === 'CAR_CONTROL') && !isInputActive) {
    if (now - rcArbitration.lastPhysicalWheelActiveAt < rcArbitration.WHEEL_PRIORITY_WINDOW_MS) {
      return;
    }
  }

  const steerDeg = Math.max(45, Math.min(135, Math.round(90 + sNorm * 45)));
  const escPulseUs = computeAsymmetricEscPulseUs(dNorm, explicitEscPulseUs, gear);

  rcArbitration.lastSentSteerDeg = steerDeg;
  rcArbitration.lastSentEscUs = escPulseUs;

  // Ưu tiên gọi qua hàm chuẩn sendUdpCarCommand (Port 4210)
  if (typeof sendUdpCarCommand === 'function') {
    sendUdpCarCommand(steerDeg, escPulseUs);
  }
}`;

// Thay thế khối computeAsymmetricEscPulseUs cũ trong server.js
const oldComputeEscRegex = /\/\/ Trạng thái theo dõi hướng chuyển động để kích hoạt chốt lùi[\s\S]*?function computeSafeEscPulseUs\(msg\)/;
if (oldComputeEscRegex.test(serverCode)) {
  serverCode = serverCode.replace(oldComputeEscRegex, `${v504ServerArbitration}\n\nfunction computeSafeEscPulseUs(msg)`);
  console.log('✅ Đã chèn v504ServerArbitration vào server.js');
}

// Thay thế khối WHEEL_BRIDGE_INPUT & CAR_CONTROL trong server.js
const oldCarControlBlockRegex = /\} else if \(data\.type === 'CAR_CONTROL'\) \{[\s\S]*?\} else if \(data\.type === 'TEST_ESP32_PULSE'\) \{/;
const newCarControlBlock = `} else if (data.type === 'CAR_CONTROL') {
          // CHỈ TÀI XẾ (Seat 0), Kính Quest VR hoặc Laptop Admin MỚI ĐƯỢC PHÉP ĐIỀU KHIỂN XE THẬT:
          const canControlHardware = Boolean(
            !p ||
            p.seatIndex === 0 ||
            p.isHost ||
            p.isLocalhostAdmin ||
            p.isQuestVR ||
            ws.seatIndex === 0 ||
            ws.isLocalhostAdmin ||
            ws.isQuestVR
          );
          if (!canControlHardware) return;

          let steer = 90;
          if (data.steeringDeg !== undefined || (data.steer !== undefined && Math.abs(Number(data.steer)) > 1.5)) {
            steer = Math.max(45, Math.min(135, Math.round(Number(data.steeringDeg ?? data.steer) || 90)));
          } else if (data.steeringNorm !== undefined || data.steerNorm !== undefined || data.steer !== undefined) {
            const sNorm = Math.max(-1, Math.min(1, Number(data.steeringNorm ?? data.steerNorm ?? data.steer) || 0));
            steer = Math.round(90 + sNorm * 45);
          }
          const rawPulse = Number(data.escPulseUs ?? (Math.abs(Number(data.throttle)) >= 500 ? data.throttle : NaN));
          const dNorm = Number(
            data.throttleNorm ??
            data.driveNorm ??
            (Number.isFinite(rawPulse) ? (rawPulse - 1500) / (rawPulse < 1500 ? 345 : 315) : 0)
          );
          const gear = data.gear || (dNorm < -0.025 || rawPulse < 1460 ? 'R' : 'D');
          sendRateLimitedEsp32Udp((steer - 90) / 45, dNorm, rawPulse, gear, 'QUEST_CAR_CONTROL');
        } else if (data.type === 'WHEEL_BRIDGE_INPUT' || data.type === 'WHEEL_BRIDGE_STATE') {
          const src = data.payload || data;
          const steerNorm = clampFinite(src.steerNorm ?? src.steeringNorm ?? (typeof src.steer === 'number' && src.steer <= 180 ? (src.steer - 90) / 45 : 0), -1, 1, 0);
          const gasNorm = clampFinite(src.gasNorm ?? (typeof src.gasPercent === 'number' ? src.gasPercent / 100 : 0), 0, 1, 0);
          const brakeNorm = clampFinite(src.brakeNorm ?? (typeof src.brakePercent === 'number' ? src.brakePercent / 100 : 0), 0, 1, 0);
          const reverseNorm = clampFinite(src.reverseNorm ?? (typeof src.reversePercent === 'number' ? src.reversePercent / 100 : 0), 0, 1, 0);
          const driveNorm = clampFinite(src.driveNorm ?? (gasNorm - brakeNorm - reverseNorm), -1, 1, 0);

          const steerAngleDeg = clampFinite(src.steerAngleDeg ?? Math.round(steerNorm * 540), -540, 540, 0);
          const gear = src.gear || (brakeNorm > 0.04 && gasNorm < 0.03 ? 'R' : (reverseNorm > 0.04 ? 'R' : 'D'));
          const escPulseUs = computeAsymmetricEscPulseUs(driveNorm, src.escPulseUs, gear);
          const buttonEvents = Array.isArray(src.buttonEvents) ? src.buttonEvents : [];

          const bridgePayload = JSON.stringify({
            type: 'WHEEL_BRIDGE_STATE',
            connected: Boolean(src.connected !== false),
            source: src.source || (src.deviceId && src.deviceId.includes('KEYBOARD') ? 'KEYBOARD' : 'WHEEL_GOG808'),
            deviceId: src.deviceId || 'GOG R808',
            steerNorm,
            steeringNorm: steerNorm,
            steerAngleDeg,
            gasNorm,
            brakeNorm,
            reverseNorm,
            driveNorm,
            throttleNorm: driveNorm,
            gasPercent: Math.round(gasNorm * 100),
            brakePercent: Math.round(brakeNorm * 100),
            reversePercent: Math.round(reverseNorm * 100),
            gear,
            escPulseUs,
            throttle: escPulseUs,
            steer: Math.round(90 + steerNorm * 45),
            buttonEvents,
            sourcePlayer: playerId,
            timestamp: Date.now()
          });

          for (const client of activeMultiplayerSockets) {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) {
              try { client.send(bridgePayload); } catch (e) {}
            }
          }

          sendRateLimitedEsp32Udp(steerNorm, driveNorm, escPulseUs, gear, 'WHEEL_BRIDGE');
        } else if (data.type === 'TEST_ESP32_PULSE') {`;

if (oldCarControlBlockRegex.test(serverCode)) {
  serverCode = serverCode.replace(oldCarControlBlockRegex, newCarControlBlock);
  console.log('✅ Đã cập nhật CAR_CONTROL & WHEEL_BRIDGE_INPUT trong WebSocket handler chính của server.js');
}

// Cập nhật nativeWheelChild UDP gửi với nhãn NATIVE_WHEEL
const oldNativeSendRegex = /sendRateLimitedEsp32Udp\(data\.steerNorm,\s*data\.driveNorm,[\s\S]*?\);/;
serverCode = serverCode.replace(oldNativeSendRegex, `sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, computeAsymmetricEscPulseUs(data.driveNorm, NaN, data.gear), data.gear, 'NATIVE_WHEEL');`);

// Cập nhật bindUnifiedWss
const oldWssControlRegex = /\/\/\s*2\.\s*Nhận lệnh điều khiển từ Bàn phím \(Localhost\) hoặc Tay cầm VR \(Kính\) gửi xuống ESP32[\s\S]*?sendRateLimitedEsp32Udp\(s,\s*d,\s*rawPulse,\s*data\.gear.*?\);\s*return;\s*\}/;
const newWssControl = `// 2. Nhận lệnh điều khiển từ Bàn phím (Localhost) hoặc Tay cầm VR (Kính) gửi xuống ESP32
        if (data.type === 'RC_CONTROL_CMD' || data.type === 'CAR_CONTROL') {
          const s = Number(data.steeringNorm ?? data.steerNorm ?? (data.steer !== undefined ? (Number(data.steer) - 90) / 45 : 0));
          const rawPulse = Number(data.escPulseUs ?? (Math.abs(Number(data.throttle)) >= 500 ? data.throttle : NaN));
          const d = Number(
            data.throttleNorm ??
            data.driveNorm ??
            (Number.isFinite(rawPulse) ? (rawPulse - 1500) / (rawPulse < 1500 ? 345 : 315) : 0)
          );
          const gear = data.gear || (d < -0.025 || rawPulse < 1460 ? 'R' : 'D');
          sendRateLimitedEsp32Udp(s, d, rawPulse, gear, 'QUEST_CAR_CONTROL');
          return;
        }`;
if (oldWssControlRegex.test(serverCode)) {
  serverCode = serverCode.replace(oldWssControlRegex, newWssControl);
  console.log('✅ Đã cập nhật bindUnifiedWss RC_CONTROL_CMD trong server.js');
}

fs.writeFileSync('server.js', serverCode, 'utf8');
fs.writeFileSync('server/server.js', serverCode, 'utf8');
console.log('✅ Đã đồng bộ server.js sang server/server.js');

// ============================================================================
// 2. SỬA APP.JS
// ============================================================================
let appCode = normalize(fs.readFileSync('app.js', 'utf8'));

// Part 2: Sửa nơi gửi CAR_CONTROL (khoảng dòng 21820)
const oldSendCarControlRegex = /if\s*\(state\.swapSteerAndThrottle\)\s*\{[\s\S]*?mpSocket\.send\(JSON\.stringify\(carControlPacket\)\);/;
const newSendCarControlCode = `const hasActiveDriveInput =
          Math.abs(state.steeringAngleDeg || 0) > 1.5 ||
          (state.throttlePercent || 0) > 1 ||
          (state.brakePercent || 0) > 1 ||
          (state.reversePercent || 0) > 1 ||
          Math.abs(state.velocityMs || 0) > 0.08;

        // Nếu đang nhận tín hiệu cầu nối Vô lăng từ Server (WHEEL_BRIDGE_STATE còn mới < 400ms),
        // Server đã trực tiếp phát UDP 4210 xuống xe RC -> Kính KHÔNG gửi lặp lại để tránh trễ & đè xung!
        const bridgeRecentlyActive =
          window._racingWheel &&
          window._racingWheel.isRemoteBridge &&
          (performance.now() - (window._racingWheel.lastUpdateMs || 0) < 400);

        if (!bridgeRecentlyActive) {
          if (hasActiveDriveInput) {
            window._questNeutralSentCount = 0;
            carControlPacket.steer = steer;
            carControlPacket.throttle = throttle;
            carControlPacket.steeringDeg = steer;
            carControlPacket.escPulseUs = throttle;
            carControlPacket.gear = state.gearIndex === 1 ? 'R' : 'D';
            mpSocket.send(JSON.stringify(carControlPacket));
          } else if ((window._questNeutralSentCount || 0) < 2) {
            // Khi vừa nhả ga/phanh trên kính: chỉ gửi đúng 2 gói 1500µs để dừng xe rồi ngưng hẳn
            window._questNeutralSentCount = (window._questNeutralSentCount || 0) + 1;
            carControlPacket.steer = 90;
            carControlPacket.throttle = 1500;
            carControlPacket.steeringDeg = 90;
            carControlPacket.escPulseUs = 1500;
            carControlPacket.gear = 'N';
            mpSocket.send(JSON.stringify(carControlPacket));
          }
        }`;

if (oldSendCarControlRegex.test(appCode)) {
  appCode = appCode.replace(oldSendCarControlRegex, newSendCarControlCode);
  console.log('✅ Đã cập nhật CAR_CONTROL rate-limiting và bridge-priority check trong app.js');
}

// Thay thế đoạn gửi WHEEL_BRIDGE_INPUT để kính không gửi đè lên server
const oldBridgeSendRegex = /\/\/\s*Phát Bridge State cho Quest 3[\s\S]*?mpSocket\.send\(JSON\.stringify\(\{\s*type:\s*'WHEEL_BRIDGE_INPUT'[\s\S]*?\}\)\);\s*\}/;
const newBridgeSendCode = `// Phát Bridge State cho Quest 3 (CHỈ GỬI TỪ LAPTOP HOST, Kính Quest & Điện thoại là thiết bị NHẬN)
        const isHeadsetOrMobile = (typeof window !== 'undefined') && (
          window.QuestVRBridge ||
          window.Capacitor ||
          (typeof navigator !== 'undefined' && /android|quest|mobile/i.test(navigator.userAgent || ''))
        );
        const isKeyboardDriving = !isHeadsetOrMobile && (wantGas || wantRev || keys.a || keys.d || keys.ArrowLeft || keys.ArrowRight);
        const hasWheel = !isHeadsetOrMobile && (wheel && wheel.connected && !wheel.isRemoteBridge);
        if (hasWheel || isKeyboardDriving || Math.abs(steer - 90) > 1 || throttle !== 1500) {
          const steeringNorm = hasWheel ? (wheel.rawSteer || 0) : ((steer - 90) / 45.0);
          const steerAngleDeg = hasWheel ? (wheel.steerAngleDeg || 0) : (steeringNorm * 45.0);
          const throttleNorm = (throttle - 1500) / 350.0;
          const gasPct = hasWheel ? (wheel.gasPercent || 0) : Math.max(0, throttleNorm * 100);
          const revPct = hasWheel ? (wheel.reversePercent || 0) : (throttleNorm < 0 ? Math.abs(throttleNorm * 100) : 0);
          const brkPct = hasWheel ? (wheel.brakePercent || 0) : (isHardBraking ? 100 : 0);

          mpSocket.send(JSON.stringify({
            type: 'WHEEL_BRIDGE_INPUT',
            connected: true,
            deviceId: hasWheel ? (wheel.deviceName || 'GOG R808') : 'PC Keyboard (WASD)',
            steeringNorm,
            steerAngleDeg,
            gasPercent: gasPct,
            brakePercent: brkPct,
            reversePercent: revPct,
            gear: (state.gearIndex === 1 || revPct > 5) ? 'R' : 'D',
            steer,
            throttle
          }));
        }`;

if (oldBridgeSendRegex.test(appCode)) {
  appCode = appCode.replace(oldBridgeSendRegex, newBridgeSendCode);
  console.log('✅ Đã cập nhật chặn gửi ngược WHEEL_BRIDGE_INPUT từ kính Quest');
}

// Part 3: Thay thế khối cuối file app.js bằng V504 Gold Master
const v504GoldMasterModule = `// ============================================================================
// [PATCH V504 GOLD MASTER - CLIENT] ĐỒNG BỘ TOÀN DIỆN VÔ LĂNG GOG R808,
// TAY CẦM VR & NÚT HUD + BỘ VẬT LÝ TRỰC TIẾP CHỐNG GIẬT XE (CHUẨN 5ce6247)
// ============================================================================
(function setupV504GoldMasterQuestDriving() {
  if (window.__V504_GOLD_MASTER_ACTIVE__) return;
  window.__V504_GOLD_MASTER_ACTIVE__ = true;
  window.__V500_DUAL_BRIDGE_ACTIVE__ = true;
  window.__UNIFIED_VEHICLE_CONTROL_ACTIVE__ = true;

  window.__V200_DEVICE_ROLE__ = 'META_QUEST';
  window.__DETECTED_DEVICE_TYPE__ = 'META_QUEST';

  const loc = (typeof window !== 'undefined' && window.location) ? window.location : (typeof location !== 'undefined' ? location : { hostname: '127.0.0.1', protocol: 'http:', port: '8080', host: '127.0.0.1:8080' });
  const storage = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {} });

  // Tự động nâng giới hạn xung lùi trong localStorage về chuẩn 1100µs
  try {
    const savedRev = Number(storage.getItem('rc_max_reverse_pulse'));
    if (!savedRev || savedRev >= 1250) {
      storage.setItem('rc_max_reverse_pulse', '1100');
    }
  } catch (e) {}

  const bakedIps = Array.isArray(window.__BAKED_LAPTOP_IPS__) ? window.__BAKED_LAPTOP_IPS__ : ['192.168.1.21', '192.168.1.60'];
  let activeLaptopIp = storage.getItem('pc_server_ip') || storage.getItem('V500_LAPTOP_IP') || bakedIps[0] || '192.168.1.21';
  let wsConn = null;
  let isConnected = false;
  let lastProcessedSeq = -1;

  const liveWheel = {
    connected: false,
    steerNorm: 0,
    gasNorm: 0,
    brakeNorm: 0,
    driveNorm: 0,
    escPulseUs: 1500,
    gear: 'D',
    updatedAt: 0
  };

  // --------------------------------------------------------------------------
  // 1. ĐỒNG BỘ TÍN HIỆU VÔ LĂNG VÀO TẤT CẢ CÁC BIẾN TRONG APP.JS
  // --------------------------------------------------------------------------
  function ingestWheelData(w) {
    if (!w) return;
    const nowPerf = performance.now();
    const nowDate = Date.now();

    liveWheel.connected = true;
    liveWheel.steerNorm = Number(w.steerNorm ?? w.steeringNorm ?? w.steer ?? 0) || 0;
    liveWheel.gasNorm = Number(w.gasNorm ?? w.throttleNorm ?? 0) || 0;
    liveWheel.brakeNorm = Number(w.brakeNorm ?? w.brake ?? 0) || 0;
    liveWheel.driveNorm = w.driveNorm !== undefined
      ? Number(w.driveNorm) || 0
      : (liveWheel.gasNorm - liveWheel.brakeNorm);
    liveWheel.gear = w.gear || (liveWheel.driveNorm < -0.025 ? 'R' : 'D');
    liveWheel.escPulseUs = Number(w.escPulseUs) || 1500;
    liveWheel.updatedAt = nowPerf;

    // 1. Đồng bộ vào window._racingWheel (cho đồng hồ HUD & vô lăng 3D)
    if (!window._racingWheel) window._racingWheel = {};
    Object.assign(window._racingWheel, {
      connected: true,
      isRemoteBridge: true,
      steerNorm: liveWheel.steerNorm,
      rawSteer: liveWheel.steerNorm,
      steerAngleDeg: Math.round(liveWheel.steerNorm * 540),
      gasNorm: liveWheel.gasNorm,
      gasPercent: Math.round(liveWheel.gasNorm * 100),
      brakeNorm: liveWheel.brakeNorm,
      brakePercent: Math.round(liveWheel.brakeNorm * 100),
      reversePercent: liveWheel.gear === 'R' ? Math.round(liveWheel.brakeNorm * 100) : 0,
      driveNorm: liveWheel.driveNorm,
      gear: liveWheel.gear,
      lastUpdateMs: nowPerf,
      lastInputTime: nowPerf
    });

    // 2. Đồng bộ vào runtime.remoteBridge (để resolveActiveDrivingCommand luôn nhận diện bridgeFresh = true)
    if (typeof runtime !== 'undefined' && runtime) {
      if (!runtime.remoteBridge) runtime.remoteBridge = {};
      Object.assign(runtime.remoteBridge, {
        connected: true,
        steerNorm: liveWheel.steerNorm,
        gasNorm: liveWheel.gasNorm,
        brakeNorm: liveWheel.brakeNorm,
        reverseNorm: liveWheel.gear === 'R' ? liveWheel.brakeNorm : 0,
        driveNorm: liveWheel.driveNorm,
        gear: liveWheel.gear,
        updatedAt: nowPerf,
        timestamp: nowDate
      });
    }

    // 3. Đồng bộ vào window.__GOG_R808_STATE__
    if (window.__GOG_R808_STATE__) {
      window.__GOG_R808_STATE__.remoteSteer = liveWheel.steerNorm;
      window.__GOG_R808_STATE__.remoteGas = liveWheel.gasNorm;
      window.__GOG_R808_STATE__.remoteBrake = liveWheel.brakeNorm;
      window.__GOG_R808_STATE__.remoteDrive = liveWheel.driveNorm;
      window.__GOG_R808_STATE__.remoteUpdatedAt = nowPerf;
    }

    // 4. Đồng bộ thanh đo Function Panel UI
    if (typeof syncWheelToFunctionPanel === 'function') {
      try {
        syncWheelToFunctionPanel({
          steerNorm: liveWheel.steerNorm,
          steerAngleDeg: Math.round(liveWheel.steerNorm * 540),
          gasPercent: Math.round(liveWheel.gasNorm * 100),
          brakePercent: Math.round(liveWheel.brakeNorm * 100),
          reversePercent: liveWheel.gear === 'R' ? Math.round(liveWheel.brakeNorm * 100) : 0,
          gear: liveWheel.gear
        });
      } catch (e) {}
    }

    // 5. Thực thi sự kiện nút bấm trên vô lăng (Xi-nhan, Còi, Đổi ghế, Lên/Xuống xe)
    if (typeof w.seq === 'number' && w.seq !== lastProcessedSeq) {
      lastProcessedSeq = w.seq;
      if (Array.isArray(w.buttonEvents)) {
        w.buttonEvents.forEach((act) => triggerWheelAction(act));
      }
    }
  }

  // Bắt thêm sự kiện từ mpSocket chính của app nếu có gói WHEEL_BRIDGE_STATE gửi về đó
  function hookMainMpSocket() {
    const mainSock = (typeof mpSocket !== 'undefined' && mpSocket) ? mpSocket : window.multiplayerWs;
    if (mainSock && !mainSock.__v504Hooked) {
      mainSock.__v504Hooked = true;
      mainSock.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT')) {
            ingestWheelData(msg.payload || msg);
          }
        } catch (e) {}
      });
    }
  }

  // --------------------------------------------------------------------------
  // 2. KẾT NỐI KÉP WEBSOCKET + HTTP POLLING (/api/bridge-ping)
  // --------------------------------------------------------------------------
  function getCandidateIps() {
    const list = [];
    const pcIp = storage.getItem('pc_server_ip');
    if (pcIp && !list.includes(pcIp) && pcIp !== 'localhost' && pcIp !== '127.0.0.1') list.push(pcIp);
    if (activeLaptopIp && !list.includes(activeLaptopIp) && activeLaptopIp !== 'localhost' && activeLaptopIp !== '127.0.0.1') list.push(activeLaptopIp);
    const saved = storage.getItem('V500_LAPTOP_IP');
    if (saved && !list.includes(saved) && saved !== 'localhost' && saved !== '127.0.0.1') list.push(saved);
    bakedIps.forEach((ip) => { if (ip && !list.includes(ip) && ip !== 'localhost' && ip !== '127.0.0.1') list.push(ip); });
    if (!list.includes('192.168.1.21')) list.push('192.168.1.21');
    if (!list.includes('192.168.1.60')) list.push('192.168.1.60');
    if (loc && loc.hostname && loc.hostname !== 'localhost' && !list.includes(loc.hostname)) {
      list.push(loc.hostname);
    }
    if (!list.includes('127.0.0.1')) list.push('127.0.0.1');
    return list;
  }

  function connectWebSocketToIp(ip) {
    if (!ip) return;
    if (wsConn && wsConn.readyState === WebSocket.OPEN && activeLaptopIp === ip) return;
    if (wsConn) {
      try { wsConn.close(); } catch (e) {}
    }

    const wsProtocol = (loc && loc.protocol === 'https:') ? 'wss' : 'ws';
    const port = (loc && loc.port) || '8080';
    const wsUrl = (loc && ip === loc.hostname && loc.host)
      ? \`\${wsProtocol}://\${loc.host}\`
      : \`ws://\${ip}:8080\`;

    try {
      const sock = new WebSocket(wsUrl);
      wsConn = sock;

      sock.onopen = () => {
        isConnected = true;
        activeLaptopIp = ip;
        storage.setItem('V500_LAPTOP_IP', ip);
        try { sock.send(JSON.stringify({ type: 'PLAYER_HELLO', deviceType: 'META_QUEST' })); } catch (e) {}
      };

      sock.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT')) {
            ingestWheelData(msg.payload || msg);
          }
        } catch (e) {}
      };

      sock.onclose = () => { isConnected = false; };
      sock.onerror = () => { try { sock.close(); } catch (e) {} };
    } catch (e) {}
  }

  let candidateIdx = 0;
  setInterval(async () => {
    hookMainMpSocket();
    const ips = getCandidateIps();
    if (ips.length === 0) return;

    const testIp = isConnected && activeLaptopIp ? activeLaptopIp : ips[candidateIdx % ips.length];
    if (!isConnected) {
      candidateIdx++;
      connectWebSocketToIp(testIp);
    }

    if (!wsConn || wsConn.readyState !== WebSocket.OPEN) {
      try {
        if (typeof fetch === 'function') {
          const res = await fetch(\`http://\${testIp}:8080/api/bridge-ping\`, { mode: 'cors', cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok) {
              isConnected = true;
              activeLaptopIp = testIp;
              storage.setItem('V500_LAPTOP_IP', testIp);
              if (data.wheel) ingestWheelData(data.wheel);
              connectWebSocketToIp(testIp);
            }
          }
        }
      } catch (e) {}
    }
  }, 150);

  // --------------------------------------------------------------------------
  // 3. ĐỌC TAY CẦM VR QUEST & NÚT CẢM ỨNG HUD KHI KHÔNG DÙNG VÔ LĂNG
  // --------------------------------------------------------------------------
  function readLocalQuestOrHudInput() {
    let steer = 0;
    let gas = 0;
    let brake = 0;

    // 1. Nút cảm ứng trên màn hình HUD (holdState) & Bàn phím (keys)
    if (typeof holdState !== 'undefined' && holdState) {
      if (holdState.left) steer -= 1;
      if (holdState.right) steer += 1;
      if (holdState.gas || holdState.up) gas = 1;
      if (holdState.brake || holdState.down) brake = 1;
    }
    if (typeof keys !== 'undefined' && keys) {
      if (keys.a || keys.ArrowLeft) steer -= 1;
      if (keys.d || keys.ArrowRight) steer += 1;
      if (keys.w || keys.ArrowUp) gas = Math.max(gas, 1);
      if (keys.s || keys.ArrowDown) brake = Math.max(brake, 1);
    }

    // 2. Tay cầm VR Meta Quest Touch Controllers (WebXR session inputSources)
    if (typeof renderer !== 'undefined' && renderer.xr) {
      const session = renderer.xr.getSession ? renderer.xr.getSession() : null;
      if (session && session.inputSources) {
        for (const src of session.inputSources) {
          const gp = src.gamepad;
          if (!gp) continue;
          // Thumbstick X/Y (axes[2], axes[3] hoặc axes[0], axes[1])
          const axX = Math.abs(gp.axes[2] || 0) > Math.abs(gp.axes[0] || 0) ? (gp.axes[2] || 0) : (gp.axes[0] || 0);
          const axY = Math.abs(gp.axes[3] || 0) > Math.abs(gp.axes[1] || 0) ? (gp.axes[3] || 0) : (gp.axes[1] || 0);
          if (Math.abs(axX) > 0.12) steer = axX;
          if (axY < -0.15) gas = Math.max(gas, -axY);
          if (axY > 0.15) brake = Math.max(brake, axY);

          // Cò Trigger (buttons[0]) làm Ga phải / Phanh trái
          const trigVal = gp.buttons[0] ? (typeof gp.buttons[0].value === 'number' ? gp.buttons[0].value : (gp.buttons[0].pressed ? 1 : 0)) : 0;
          if (trigVal > 0.15) {
            if (src.handedness === 'right') gas = Math.max(gas, trigVal);
            else if (src.handedness === 'left') brake = Math.max(brake, trigVal);
          }
        }
      }
    }

    const active = Math.abs(steer) > 0.05 || gas > 0.05 || brake > 0.05;
    return { active, steer: Math.max(-1, Math.min(1, steer)), gas, brake };
  }

  function ensureSeatedInDriverChair() {
    if (typeof state === 'undefined' || !state) return;
    if (state.playerMode !== 'DRIVING' || state.seatIndex !== 0) {
      state.playerMode = 'DRIVING';
      state.seatIndex = 0;
      state.engineRunning = true;
      state.gearIndex = 3;
      if (typeof avatarBodyMesh !== 'undefined' && avatarBodyMesh) avatarBodyMesh.visible = false;
      if (typeof resetAndCenterViewpoint === 'function') {
        try { resetAndCenterViewpoint('DRIVING', 0); } catch (e) {}
      } else if (typeof driverSeatMount !== 'undefined' && driverSeatMount && typeof cameraRig !== 'undefined' && cameraRig) {
        if (typeof SEAT_POSITIONS !== 'undefined' && SEAT_POSITIONS[0]) {
          driverSeatMount.position.copy(SEAT_POSITIONS[0].pos);
        }
        driverSeatMount.add(cameraRig);
        cameraRig.position.set(0, 0, 0);
        cameraRig.rotation.set(0, 0, 0);
      }
    }
  }

  function triggerWheelAction(act) {
    if (typeof state === 'undefined' || !state) return;
    if (act === 'TURN_LEFT') {
      state.turnSignal = state.turnSignal === 'LEFT' ? 'OFF' : 'LEFT';
      state.turnSignalLeft = state.turnSignal === 'LEFT';
      if (state.turnSignalLeft) state.turnSignalRight = false;
    } else if (act === 'TURN_RIGHT') {
      state.turnSignal = state.turnSignal === 'RIGHT' ? 'OFF' : 'RIGHT';
      state.turnSignalRight = state.turnSignal === 'RIGHT';
      if (state.turnSignalRight) state.turnSignalLeft = false;
    } else if (act === 'HORN') {
      if (typeof playSmartVehicleHornSound === 'function') playSmartVehicleHornSound('CAR');
      else if (typeof playHornSound === 'function') playHornSound();
    } else if (act === 'ENTER_EXIT_CAR') {
      ensureSeatedInDriverChair();
    } else if (act === 'CYCLE_SEAT' && state.playerMode === 'DRIVING') {
      state.seatIndex = ((state.seatIndex || 0) + 1) % 4;
    }
  }

  // --------------------------------------------------------------------------
  // 4. VÒNG LẶP VẬT LÝ TRỰC TIẾP V504 (CHỐNG RESET VẬN TỐC & CHỐNG GIẬT VỊ TRÍ)
  // --------------------------------------------------------------------------
  const carStateV504 = {
    ready: false,
    x: -3.2,
    z: -14.0,
    heading: 0,
    velMs: 0,
    lastValidPos: new THREE.Vector3(-3.2, 0, -14.0)
  };

  const prevBeforeRender = scene.onBeforeRender;
  let lastFrameMs = performance.now();

  scene.onBeforeRender = function (rendererInst, sceneInst, cameraInst) {
    if (typeof prevBeforeRender === 'function') {
      prevBeforeRender.call(this, rendererInst, sceneInst, cameraInst);
    }

    const now = performance.now();
    const dt = Math.min(Math.max((now - lastFrameMs) / 1000, 0.001), 0.05);
    lastFrameMs = now;

    if (typeof state === 'undefined' || !state || typeof vehicleRoot === 'undefined' || !vehicleRoot) return;

    const wheelFresh = (now - liveWheel.updatedAt) <= 850;
    const localInput = readLocalQuestOrHudInput();

    // Chọn nguồn điều khiển: Ưu tiên thao tác thực tế từ Vô lăng GOG R808 hoặc Tay cầm/HUD
    let steer = 0;
    let gas = 0;
    let brake = 0;
    let hasControlSignal = false;

    const wheelMoved = wheelFresh && (Math.abs(liveWheel.steerNorm) > 0.02 || liveWheel.gasNorm > 0.02 || liveWheel.brakeNorm > 0.02);

    if (wheelMoved) {
      steer = liveWheel.steerNorm;
      gas = liveWheel.gasNorm;
      brake = liveWheel.brakeNorm;
      hasControlSignal = true;
    } else if (localInput.active) {
      steer = localInput.steer;
      gas = localInput.gas;
      brake = localInput.brake;
      hasControlSignal = true;
    } else if (wheelFresh) {
      steer = liveWheel.steerNorm;
      gas = liveWheel.gasNorm;
      brake = liveWheel.brakeNorm;
      hasControlSignal = Math.abs(carStateV504.velMs) > 0.02;
    }

    if (wheelMoved || localInput.active) {
      ensureSeatedInDriverChair();
    }

    if (state.playerMode === 'DRIVING' && state.seatIndex === 0) {
      if (!carStateV504.ready) {
        carStateV504.x = vehicleRoot.position.x;
        carStateV504.z = vehicleRoot.position.z;
        carStateV504.heading = state.headingRad || vehicleRoot.rotation.y || 0;
        carStateV504.velMs = state.velocityMs || 0;
        carStateV504.lastValidPos.copy(vehicleRoot.position);
        carStateV504.ready = true;
      }

      // Nếu không có tín hiệu điều khiển và xe đã dừng, bảo vệ vị trí xe khỏi bị script cũ kéo giật về chỗ cũ
      if (!hasControlSignal && Math.abs(carStateV504.velMs) < 0.03) {
        if (vehicleRoot.position.distanceToSquared(carStateV504.lastValidPos) > 9.0) {
          vehicleRoot.position.x = carStateV504.lastValidPos.x;
          vehicleRoot.position.z = carStateV504.lastValidPos.z;
        } else {
          carStateV504.x = vehicleRoot.position.x;
          carStateV504.z = vehicleRoot.position.z;
          carStateV504.heading = state.headingRad || vehicleRoot.rotation.y || 0;
          carStateV504.lastValidPos.copy(vehicleRoot.position);
        }
        return;
      }

      state.engineRunning = true;
      state.steeringAngleDeg = steer * 540;
      if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
        steeringWheelPivot.rotation.z = -THREE.MathUtils.degToRad(state.steeringAngleDeg);
      }

      if (gas > 0.025) {
        state.gearIndex = 3; // D (Tiến)
        state.gear = 'D';
        state.throttlePercent = Math.round(gas * 100);
        state.brakePercent = 0;
        state.reversePercent = 0;
        carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, gas * 24.0, dt * 4.5);
      } else if (brake > 0.025) {
        if (carStateV504.velMs > 1.0) {
          // Đang chạy tiến nhanh -> Phanh giảm tốc
          state.brakePercent = Math.round(brake * 100);
          state.throttlePercent = 0;
          carStateV504.velMs = Math.max(0, carStateV504.velMs - 26.0 * brake * dt);
        } else {
          // Đã dừng -> Cài số R và lùi mượt mà (tương ứng xung 1445 -> 1100µs)
          state.gearIndex = 1; // R (Lùi)
          state.gear = 'R';
          state.reversePercent = Math.round(brake * 100);
          state.throttlePercent = Math.round(brake * 100);
          state.brakePercent = 0;
          carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, -brake * 12.5, dt * 6.0);
        }
      } else if (Math.abs(steer) > 0.04 && Math.abs(carStateV504.velMs) < 1.2) {
        // Tính năng chuẩn V504: Xoay vô lăng trên bàn (chưa đạp ga) xe tự lăn bánh nhẹ để rẽ ngay
        state.gearIndex = 3;
        state.gear = 'D';
        state.throttlePercent = 18;
        carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, 3.0, dt * 3.5);
      } else {
        state.throttlePercent = 0;
        state.brakePercent = 0;
        state.reversePercent = 0;
        carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, 0, dt * 3.2);
        if (Math.abs(carStateV504.velMs) < 0.03) carStateV504.velMs = 0;
      }

      if (Math.abs(steer) > 0.025 && Math.abs(carStateV504.velMs) > 0.03) {
        const sign = carStateV504.velMs < -0.03 ? -1 : 1;
        carStateV504.heading -= steer * 1.95 * sign * dt;
      }

      carStateV504.x -= Math.sin(carStateV504.heading) * carStateV504.velMs * dt;
      carStateV504.z -= Math.cos(carStateV504.heading) * carStateV504.velMs * dt;

      vehicleRoot.position.x = carStateV504.x;
      vehicleRoot.position.z = carStateV504.z;
      vehicleRoot.rotation.y = carStateV504.heading;
      carStateV504.lastValidPos.copy(vehicleRoot.position);

      state.headingRad = carStateV504.heading;
      state.velocityMs = carStateV504.velMs;
      state.speedKmh = Math.abs(carStateV504.velMs) * 3.6;
    }
  };
})();
`;

// Thay thế phần đuôi của app.js
const oldTailRegex = /\/\/\s*={10,}\s*\n\/\/\s*(\[UNIFIED VEHICLE CONTROL & GOG R808 BRIDGE\]|\[PATCH V504 GOLD MASTER - CLIENT\])[\s\S]*$/;
if (oldTailRegex.test(appCode)) {
  appCode = appCode.replace(oldTailRegex, v504GoldMasterModule);
  console.log('✅ Đã thay thế khối đuôi app.js bằng V504 Gold Master');
} else {
  // Nếu có tên khối khác, nối vào cuối file
  appCode = appCode + '\n\n' + v504GoldMasterModule;
  console.log('✅ Đã nối V504 Gold Master vào cuối file app.js');
}

// Ghi đè vào tất cả mirror của app.js
const appMirrors = ['app.js', 'www/app.js', 'server/public/app.js', 'android/app/src/main/assets/public/app.js'];
appMirrors.forEach(p => {
  if (fs.existsSync(path.dirname(p))) {
    fs.writeFileSync(p, appCode, 'utf8');
    console.log(`✅ Đã đồng bộ app.js sang ${p}`);
  }
});

// Ghi đè vào tất cả mirror của index.html
const indexMirrors = ['index.html', 'www/index.html', 'server/public/index.html', 'android/app/src/main/assets/public/index.html'];
const indexCode = fs.readFileSync('index.html', 'utf8');
indexMirrors.forEach(p => {
  if (fs.existsSync(path.dirname(p))) {
    fs.writeFileSync(p, indexCode, 'utf8');
    console.log(`✅ Đã đồng bộ index.html sang ${p}`);
  }
});

console.log('🎉 Hoàn tất áp dụng các bản vá V504 Gold Master!');
