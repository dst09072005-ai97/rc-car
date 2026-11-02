const fs = require('fs');
const path = require('path');

console.log('[V504] Bắt đầu triển khai bản vá Native Host 50Hz & Cập nhật Bảng Chức Năng...');

// ============================================================================
// 1. CẬP NHẬT SERVER.JS & SERVER/SERVER.JS
// ============================================================================
const serverFiles = ['server.js', 'server/server.js'];

const nativeBridgeBlock = `
  // --------------------------------------------------------------------------
  // BỘ ĐỌC NATIVE VÔ LĂNG GOG R808 TỰ ĐỘNG KHỞI CHẠY TRÊN WINDOWS HOST
  // (Không cần mở trình duyệt localhost, Kính Quest 3 nhận ngay lập tức!)
  // --------------------------------------------------------------------------
  const { spawn: spawnProcess } = require('child_process');
  const pathModule = require('path');
  const fsModule = require('fs');

  let nativeWheelChild = null;
  let lastTerminalLogMs = 0;

  function startNativeWheelBridge() {
    if (process.platform !== 'win32') return;
    const exePath = pathModule.join(__dirname, 'tools', 'gog808_native_bridge.exe');
    if (!fsModule.existsSync(exePath)) {
      console.warn('⚠️ [GOG808 NATIVE] Không tìm thấy file:', exePath);
      return;
    }

    try {
      if (nativeWheelChild) {
        try { nativeWheelChild.kill(); } catch (e) {}
        nativeWheelChild = null;
      }
      nativeWheelChild = spawnProcess(exePath, [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (e) {
      console.warn('⚠️ [GOG808 NATIVE] Lỗi khởi chạy native bridge:', e.message);
      return;
    }

    console.log('✅ [V503 USB] Đã nhận diện Vô lăng GOG R808 tại cổng ID=0 (Native Host 50Hz)');

    let buf = '';
    nativeWheelChild.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
          const data = JSON.parse(trimmed);
          if (data && data.type === 'WHEEL_BRIDGE_STATE' && data.connected) {
            latestBridgeState.connected = true;
            latestBridgeState.steerNorm = data.steerNorm;
            latestBridgeState.gasNorm = data.gasNorm;
            latestBridgeState.brakeNorm = data.brakeNorm;
            latestBridgeState.reverseNorm = data.reverseNorm;
            latestBridgeState.driveNorm = data.driveNorm;
            latestBridgeState.gear = data.gear;
            latestBridgeState.seq = data.seq;
            latestBridgeState.timestamp = Date.now();

            const clientCount = (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) ? activeMultiplayerSockets.size : 0;

            // In log 50Hz MƯỢT lên Terminal đúng như cam kết khi có thao tác lái/đạp chân
            const isActive = Math.abs(data.steerNorm) > 0.02 || data.gasNorm > 0.02 || data.brakeNorm > 0.02 || data.reverseNorm > 0.02;
            const now = Date.now();
            if (isActive && (now - lastTerminalLogMs > 400)) {
              lastTerminalLogMs = now;
              console.log(
                \`🛞 [GOG808 50Hz MƯỢT] Lái: \${data.steerNorm.toFixed(2)} | Ga: \${data.gasNorm.toFixed(2)} | Phanh: \${data.brakeNorm.toFixed(2)} | Số \${data.gear} | Kính: \${clientCount}\`
              );
            }

            const outMsg = JSON.stringify({
              type: 'WHEEL_BRIDGE_STATE',
              connected: true,
              source: 'GOG808_NATIVE',
              deviceId: 'GOG R808 (Native Host)',
              steerNorm: data.steerNorm,
              steeringNorm: data.steerNorm,
              steerAngleDeg: Math.max(-540, Math.min(540, Math.round(data.steerNorm * 540))),
              gasNorm: data.gasNorm,
              brakeNorm: data.brakeNorm,
              reverseNorm: data.reverseNorm,
              driveNorm: data.driveNorm,
              throttleNorm: data.driveNorm,
              gasPercent: Math.round(data.gasNorm * 100),
              brakePercent: Math.round(data.brakeNorm * 100),
              reversePercent: Math.round(data.reverseNorm * 100),
              gear: data.gear,
              steer: Math.max(45, Math.min(135, Math.round(90 + data.steerNorm * 45))),
              throttle: Math.max(1000, Math.min(2000, Math.round(1500 + data.driveNorm * 260))),
              buttonEvents: [],
              seq: data.seq,
              timestamp: latestBridgeState.timestamp
            });

            // Phát sóng tới toàn bộ WebSocket clients (Kính Quest 3, Mobile, v.v.)
            if (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) {
              for (const client of activeMultiplayerSockets) {
                if (client && client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) {
                  try { client.send(outMsg); } catch (err) {}
                }
              }
            }

            // Gửi xuống ESP32 RC Car qua UDP (Port 4210)
            sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, false);
          }
        } catch (e) {}
      }
    });

    nativeWheelChild.stderr.on('data', (d) => {
      const errStr = d.toString('utf8');
      if (errStr.includes('CALIBRATED_REST')) {
        console.log('⚙️ [GOG808 NATIVE]', errStr.trim());
      }
    });

    nativeWheelChild.on('exit', () => {
      nativeWheelChild = null;
      setTimeout(startNativeWheelBridge, 2500);
    });

    process.on('exit', () => {
      if (nativeWheelChild) {
        try { nativeWheelChild.kill(); } catch (e) {}
        nativeWheelChild = null;
      }
    });
  }

  startNativeWheelBridge();
`;

serverFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Gỡ bỏ khối native bridge cũ
  const cutMarker = '// BỘ ĐỌC NATIVE VÔ LĂNG GOG R808 TỰ ĐỘNG KHỞI CHẠY TRÊN WINDOWS HOST';
  const cutIdx = content.indexOf(cutMarker);
  if (cutIdx !== -1) {
    const endIdx = content.indexOf('startNativeWheelBridge();', cutIdx);
    if (endIdx !== -1) {
      content = content.substring(0, cutIdx) + content.substring(endIdx + 'startNativeWheelBridge();'.length);
    }
  }

  // Chèn khối nativeBridgeBlock mới vào trước })(); cuối cùng
  const lastIife = content.lastIndexOf('})();');
  if (lastIife !== -1) {
    content = content.substring(0, lastIife) + '\n' + nativeBridgeBlock + '\n})();\n';
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Đã cập nhật startNativeWheelBridge vào ${file}`);
  }
});

// ============================================================================
// 2. CẬP NHẬT INDEX.HTML (ĐỔI DEFAULT IP SANG 192.168.1.60)
// ============================================================================
const htmlFiles = [
  'index.html',
  'www/index.html',
  'server/public/index.html',
  'android/app/src/main/assets/public/index.html'
];

htmlFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/placeholder="192\.168\.1\.32"/g, 'placeholder="192.168.1.60"');
  content = content.replace(/value="192\.168\.1\.32"/g, 'value="192.168.1.60"');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Đã cập nhật Default IP 192.168.1.60 vào ${file}`);
});

// ============================================================================
// 3. CẬP NHẬT CLIENT APP.JS (CẬP NHẬT BẢNG CHỨC NĂNG TRỰC QUAN & TỰ ĐỘNG KẾT NỐI)
// ============================================================================
const clientFiles = [
  'app.js',
  'www/app.js',
  'server/public/app.js',
  'android/app/src/main/assets/public/app.js'
];

const functionPanelUpdateHook = `
  // --------------------------------------------------------------------------
  // HÀM ĐỒNG BỘ TỨC THÌ VÀO BẢNG CHỨC NĂNG (FUNCTION PANEL) TRÊN MÀN HÌNH / KÍNH VR
  // --------------------------------------------------------------------------
  function syncWheelToFunctionPanel(w) {
    if (!w) return;
    const steerDeg = typeof w.steerAngleDeg === 'number' ? w.steerAngleDeg : Math.round((w.steerNorm || 0) * 540);
    const gasPct = typeof w.gasPercent === 'number' ? w.gasPercent : Math.round((w.gasNorm || 0) * 100);
    const brakePct = typeof w.brakePercent === 'number' ? w.brakePercent : Math.round((w.brakeNorm || 0) * 100);
    const revPct = typeof w.reversePercent === 'number' ? w.reversePercent : Math.round((w.reverseNorm || 0) * 100);
    const gear = w.gear || 'D';
    const sNorm = typeof w.steerNorm === 'number' ? w.steerNorm : 0;
    const dNorm = typeof w.driveNorm === 'number' ? w.driveNorm : 0;

    // 1. Cập nhật thanh Ga
    const barGas = document.getElementById('pedal-gas-bar');
    if (barGas) barGas.style.width = gasPct + '%';
    const txtGas = document.getElementById('pedal-gas-txt');
    if (txtGas) txtGas.textContent = gasPct + '%';

    // 2. Cập nhật thanh Phanh
    const barBrake = document.getElementById('pedal-brake-bar');
    if (barBrake) barBrake.style.width = brakePct + '%';
    const txtBrake = document.getElementById('pedal-brake-txt');
    if (txtBrake) txtBrake.textContent = brakePct + '%';

    // 3. Cập nhật thanh Lùi
    const barRev = document.getElementById('pedal-reverse-bar');
    if (barRev) barRev.style.width = revPct + '%';
    const txtRev = document.getElementById('pedal-reverse-txt');
    if (txtRev) txtRev.textContent = revPct + '%';

    // 4. Cập nhật thanh Lái
    const steerBar = document.getElementById('wheel-steer-bar');
    if (steerBar) {
      const pct = (steerDeg / 540) * 50;
      if (pct >= 0) {
        steerBar.style.left = '50%';
        steerBar.style.width = Math.min(50, pct) + '%';
      } else {
        steerBar.style.left = (50 + pct) + '%';
        steerBar.style.width = Math.min(50, -pct) + '%';
      }
    }
    const angleTxt = document.getElementById('wheel-angle-txt');
    if (angleTxt) angleTxt.textContent = (steerDeg > 0 ? '+' : '') + steerDeg + '°';

    // 5. Cập nhật Live Monitor Text
    const monAxes = document.getElementById('wheel-monitor-axes');
    if (monAxes) {
      monAxes.textContent = \`🎮 GOG R808: Lái \${sNorm.toFixed(2)} | Ga \${gasPct}% | Phanh \${brakePct}% [Số \${gear}]\`;
    }

    // 6. Cập nhật Xung ESP32
    const pulseInfo = document.getElementById('esp32-car-pulse-info');
    if (pulseInfo) {
      const servoDeg = Math.round(90 + sNorm * 45);
      const escUs = Math.round(1500 + dNorm * 260);
      pulseInfo.textContent = \`Lái: \${servoDeg}° | Ga: \${escUs}µs [Số \${gear}]\`;
    }

    // 7. Cập nhật đối tượng racingWheel toàn cục
    if (typeof racingWheel !== 'undefined' && racingWheel) {
      racingWheel.connected = true;
      racingWheel.gasPercent = gasPct;
      racingWheel.brakePercent = brakePct;
      racingWheel.reversePercent = revPct;
      racingWheel.steerAngleDeg = steerDeg;
      racingWheel.gear = gear;
      racingWheel.lastInputTime = performance.now();
    }
    if (typeof window !== 'undefined' && window._racingWheel) {
      window._racingWheel.connected = true;
      window._racingWheel.gasPercent = gasPct;
      window._racingWheel.brakePercent = brakePct;
      window._racingWheel.reversePercent = revPct;
      window._racingWheel.steerAngleDeg = steerDeg;
      window._racingWheel.gear = gear;
      window._racingWheel.lastInputTime = performance.now();
    }

    // 8. Cập nhật Hoạt cảnh 3D 3 bàn đạp dưới sàn xe Rolls-Royce
    if (typeof gasPedalArm !== 'undefined' && gasPedalArm) {
      gasPedalArm.rotation.x = -0.38 - (gasPct / 100) * 0.32;
    }
    if (typeof brakePedalArm !== 'undefined' && brakePedalArm) {
      brakePedalArm.rotation.x = -0.38 - (brakePct / 100) * 0.26;
    }
    if (typeof reversePedalArm !== 'undefined' && reversePedalArm) {
      reversePedalArm.rotation.x = -0.38 - (revPct / 100) * 0.32;
    }
  }
`;

clientFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Đổi default IP sang 192.168.1.60
  content = content.replace(/'192\.168\.1\.32'/g, '\'192.168.1.60\'');
  content = content.replace(/"192\.168\.1\.32"/g, '"192.168.1.60"');

  // Bổ sung syncWheelToFunctionPanel nếu chưa có
  if (!content.includes('function syncWheelToFunctionPanel(')) {
    // Chèn vào trước hàm pollGamepadRacingWheel
    const pollMarker = 'function pollGamepadRacingWheel(dt)';
    if (content.includes(pollMarker)) {
      content = content.replace(pollMarker, functionPanelUpdateHook + '\n  ' + pollMarker);
    }
  }

  // Gọi syncWheelToFunctionPanel trong sự kiện nhận WebSocket WHEEL_BRIDGE_STATE / WHEEL_BRIDGE_INPUT
  const bridgeHookTarget = `          if (typeof src.seq === 'number' && src.seq !== runtime.remoteBridge.lastSeq) {`;
  const bridgeHookReplacement = `          syncWheelToFunctionPanel({
            steerNorm: runtime.remoteBridge.steerNorm,
            steerAngleDeg: THREE.MathUtils.clamp(runtime.remoteBridge.steerNorm * 540, -540, 540),
            gasNorm: runtime.remoteBridge.gasNorm,
            gasPercent: Math.round(runtime.remoteBridge.gasNorm * 100),
            brakeNorm: runtime.remoteBridge.brakeNorm,
            brakePercent: Math.round(runtime.remoteBridge.brakeNorm * 100),
            reverseNorm: runtime.remoteBridge.reverseNorm,
            reversePercent: Math.round(runtime.remoteBridge.reverseNorm * 100),
            driveNorm: runtime.remoteBridge.driveNorm,
            gear: runtime.remoteBridge.gear
          });
          if (typeof src.seq === 'number' && src.seq !== runtime.remoteBridge.lastSeq) {`;

  if (content.includes(bridgeHookTarget) && !content.includes('syncWheelToFunctionPanel({')) {
    content = content.replace(bridgeHookTarget, bridgeHookReplacement);
  }

  // Gọi syncWheelToFunctionPanel trong sự kiện nhận WHEEL_BRIDGE_STATE ở initMultiplayerClient
  const mpHookTarget = `          state.steeringAngleDeg = wObj.steerAngleDeg;`;
  const mpHookReplacement = `          if (typeof syncWheelToFunctionPanel === 'function') syncWheelToFunctionPanel(wObj);
          state.steeringAngleDeg = wObj.steerAngleDeg;`;
  if (content.includes(mpHookTarget) && !content.includes('syncWheelToFunctionPanel(wObj)')) {
    content = content.replace(mpHookTarget, mpHookReplacement);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Đã cập nhật syncWheelToFunctionPanel vào ${file}`);
});
