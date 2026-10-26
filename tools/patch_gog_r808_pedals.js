const fs = require('fs');
const path = require('path');

console.log('>>> [PATCH] Bắt đầu nâng cấp hỗ trợ 3 Bàn Đạp Độc Lập cho Vô Lăng GOG R808...');

// ============================================================================
// 1. CẬP NHẬT SERVER.JS: Chuyển tiếp reversePercent trong WHEEL_BRIDGE_INPUT
// ============================================================================
const serverPath = path.join(__dirname, '../server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

if (!serverContent.includes('reversePercent: data.reversePercent')) {
  serverContent = serverContent.replace(
    /brakePercent:\s*data\.brakePercent\s*\|\|\s*0,/,
    'brakePercent: data.brakePercent || 0,\n            reversePercent: data.reversePercent || 0,'
  );
  fs.writeFileSync(serverPath, serverContent, 'utf8');
  console.log('✅ Đã cập nhật server.js (hỗ trợ reversePercent qua bridge)');
} else {
  console.log('ℹ️ server.js đã có reversePercent');
}

// ============================================================================
// 2. CẬP NHẬT INDEX.HTML: 3 Bàn Đạp Độc Lập (Ga, Phanh, Lùi) & Trình Soi Tín Hiệu
// ============================================================================
const indexPath = path.join(__dirname, '../index.html');
let indexContent = fs.readFileSync(indexPath, 'utf8');

const oldPedalSectionRegex = /<!-- Bàn đạp Ga & Bàn đạp Phanh -->[\s\S]*?<!-- Các nút căn chỉnh & sang số nhanh & chuyển đổi hiển thị -->[\s\S]*?<button id="btn-wheel-shift-d"[\s\S]*?<\/div>/;

const newPedalSection = `<!-- Bàn đạp Ga, Phanh, và Lùi (3 Bàn Đạp Độc Lập Cho Vô Lăng GOG R808) -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#ccc;">
            <span>🟢 Ga (Tiến):</span>
            <strong id="pedal-gas-txt" style="color:#00ff88;">0%</strong>
          </div>
          <div style="background:#141e33;height:8px;border-radius:4px;overflow:hidden;margin-top:2px;border:1px solid rgba(255,255,255,0.1);">
            <div id="pedal-gas-bar" style="height:100%;width:0%;background:#00ff88;transition:width 0.04s ease-out;"></div>
          </div>
          <div style="display:flex;gap:3px;margin-top:4px;">
            <button id="btn-calib-pedal-gas" class="act-btn" style="background:#1f3354;color:#00ff88;font-size:9px;padding:3px 2px;flex:1;cursor:pointer;" title="Bấm rồi đạp hết chân Ga để nhận diện">🎯 Gán Ga</button>
            <button id="btn-toggle-invert-gas" class="act-btn" style="background:#1f3354;color:#ccc;font-size:9px;padding:3px 4px;cursor:pointer;" title="Đảo chiều chân Ga">🔄</button>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#ccc;">
            <span>🔴 Phanh (Dừng):</span>
            <strong id="pedal-brake-txt" style="color:#ff3b30;">0%</strong>
          </div>
          <div style="background:#141e33;height:8px;border-radius:4px;overflow:hidden;margin-top:2px;border:1px solid rgba(255,255,255,0.1);">
            <div id="pedal-brake-bar" style="height:100%;width:0%;background:#ff3b30;transition:width 0.04s ease-out;"></div>
          </div>
          <div style="display:flex;gap:3px;margin-top:4px;">
            <button id="btn-calib-pedal-brake" class="act-btn" style="background:#1f3354;color:#ff3b30;font-size:9px;padding:3px 2px;flex:1;cursor:pointer;" title="Bấm rồi đạp hết chân Phanh để nhận diện">🎯 Gán Phanh</button>
            <button id="btn-toggle-invert-brake" class="act-btn" style="background:#1f3354;color:#ccc;font-size:9px;padding:3px 4px;cursor:pointer;" title="Đảo chiều chân Phanh">🔄</button>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#ccc;">
            <span>🟡 Lùi (Chân Côn):</span>
            <strong id="pedal-reverse-txt" style="color:#ffd60a;">0%</strong>
          </div>
          <div style="background:#141e33;height:8px;border-radius:4px;overflow:hidden;margin-top:2px;border:1px solid rgba(255,255,255,0.1);">
            <div id="pedal-reverse-bar" style="height:100%;width:0%;background:#ffd60a;transition:width 0.04s ease-out;"></div>
          </div>
          <div style="display:flex;gap:3px;margin-top:4px;">
            <button id="btn-calib-pedal-reverse" class="act-btn" style="background:#1f3354;color:#ffd60a;font-size:9px;padding:3px 2px;flex:1;cursor:pointer;" title="Bấm rồi đạp hết chân Lùi (hoặc Côn) để nhận diện">🎯 Gán Lùi</button>
            <button id="btn-toggle-invert-reverse" class="act-btn" style="background:#1f3354;color:#ccc;font-size:9px;padding:3px 4px;cursor:pointer;" title="Đảo chiều chân Lùi">🔄</button>
          </div>
        </div>
      </div>

      <!-- Live Input Monitor: Soi trực tiếp các trục và nút của GOG R808 -->
      <div id="wheel-live-monitor" style="background:#0c1524;border:1px dashed #204060;border-radius:4px;padding:3px 6px;margin-bottom:6px;font-family:monospace;font-size:10px;color:#79c0ff;display:flex;justify-content:space-between;align-items:center;">
        <span id="wheel-monitor-axes">🎮 Tín hiệu: Đang dò vô lăng...</span>
        <button id="btn-auto-detect-all-pedals" class="act-btn" style="background:#00e5ff;color:#000;font-weight:bold;font-size:9px;padding:2px 5px;cursor:pointer;">⚡ Nhận Diện Lại</button>
      </div>

      <!-- Các nút căn chỉnh & sang số nhanh & chuyển đổi hiển thị -->
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">
        <button id="btn-wheel-toggle-cam-road" class="act-btn" style="background:#00e5ff;color:#000;font-weight:bold;font-size:11px;padding:5px 8px;width:100%;margin-bottom:3px;cursor:pointer;">🔄 Tùy Chọn: [🛣️ ĐƯỜNG 3D TRONG GAME] (Bấm đổi sang Cam 📷)</button>
        <button id="btn-wheel-shift-r" class="act-btn" style="background:#ff3b30;color:#fff;font-size:10px;padding:3px 6px;flex:1;">[R] Lùi</button>
        <button id="btn-wheel-shift-d" class="act-btn" style="background:#00ff88;color:#000;font-size:10px;padding:3px 6px;flex:1;">[D] Tiến</button>
      </div>`;

if (oldPedalSectionRegex.test(indexContent)) {
  indexContent = indexContent.replace(oldPedalSectionRegex, newPedalSection);
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  console.log('✅ Đã cập nhật index.html (giao diện 3 bàn đạp & live monitor)');
} else {
  console.warn('⚠️ Không tìm thấy oldPedalSectionRegex trong index.html');
}

// ============================================================================
// 3. CẬP NHẬT APP.JS: Module Vô Lăng & 3 Bàn Đạp Độc Lập
// ============================================================================
const appPath = path.join(__dirname, '../app.js');
let appContent = fs.readFileSync(appPath, 'utf8');

// A. Thêm reversePercent vào state ban đầu nếu chưa có
if (!appContent.includes('reversePercent:')) {
  appContent = appContent.replace(
    /brakePercent:\s*0,/,
    'brakePercent: 0,\n  reversePercent: 0,'
  );
  console.log('✅ Đã thêm reversePercent vào state của app.js');
}

// B. Cập nhật WHEEL_BRIDGE_STATE receiver trong app.js
if (!appContent.includes('wObj.reversePercent = msg.reversePercent')) {
  appContent = appContent.replace(
    /wObj\.brakePercent\s*=\s*msg\.brakePercent\s*\?\?\s*0;/,
    `wObj.brakePercent = msg.brakePercent ?? 0;
            wObj.reversePercent = msg.reversePercent ?? 0;`
  );
  appContent = appContent.replace(
    /state\.brakePercent\s*=\s*wObj\.brakePercent;/,
    `state.brakePercent = wObj.brakePercent;
            state.reversePercent = wObj.reversePercent;
            if (wObj.reversePercent > 3) {
              state.gearIndex = 1;
              wObj.gear = 'R';
              state.throttlePercent = wObj.reversePercent;
            } else if (wObj.gasPercent > 3) {
              state.gearIndex = 3;
              wObj.gear = 'D';
            }`
  );
  console.log('✅ Đã cập nhật WHEEL_BRIDGE_STATE receiver trong app.js');
}

// C. Cập nhật bộ phát carControlPacket cho ESP32 và WHEEL_BRIDGE_INPUT
appContent = appContent.replace(
  /if\s*\(!state\.engineRunning\s*\|\|\s*state\.brakePercent\s*>\s*8\)\s*\{\s*throttle\s*=\s*1500;\s*\}\s*else\s*if\s*\(state\.gearIndex\s*===\s*1\)\s*\{[\s\S]*?\}\s*else\s*if\s*\(state\.gearIndex\s*===\s*3\)\s*\{[\s\S]*?\}\s*else\s*\{\s*throttle\s*=\s*1500;\s*\}/,
  `if (!state.engineRunning || state.brakePercent > 8) {
            throttle = 1500;
          } else if (state.reversePercent > 3 || state.gearIndex === 1) { // Bàn đạp lùi hoặc Số R (1500us -> 1300us)
            const revPct = state.reversePercent > 3 ? state.reversePercent : (state.throttlePercent || 0);
            const pct = THREE.MathUtils.clamp(revPct, 0, 100);
            throttle = Math.round(1500 - (pct / 100.0) * 200); // 1500 - 200 = 1300us max
          } else if (state.gearIndex === 3) { // Bàn đạp ga hoặc Số D (1500us -> 1700us)
            const pct = THREE.MathUtils.clamp(state.throttlePercent || 0, 0, 100);
            throttle = Math.round(1500 + (pct / 100.0) * 200); // 1500 + 200 = 1700us max
          } else {
            throttle = 1500;
          }`
);

if (!appContent.includes('reversePercent: wheel.reversePercent')) {
  appContent = appContent.replace(
    /brakePercent:\s*wheel\.brakePercent\s*\|\|\s*0,/,
    'brakePercent: wheel.brakePercent || 0,\n            reversePercent: wheel.reversePercent || 0,'
  );
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('✅ Đã cập nhật các móc nối ESP32 và Bridge trong app.js');

// D. Thay thế toàn bộ khối setupUniversalSteeringWheelAndPedalsModule trong app.js
const moduleStartMarker = '(function setupUniversalSteeringWheelAndPedalsModule() {';
const startIdx = appContent.indexOf(moduleStartMarker);
const nextClosingIdx = startIdx !== -1 ? appContent.indexOf('})();', startIdx) : -1;
const endIdx = nextClosingIdx !== -1 ? nextClosingIdx + 5 : -1;

if (startIdx !== -1 && endIdx !== -1) {
  const newModuleCode = `(function setupUniversalSteeringWheelAndPedalsModule() {
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
      racingWheel.deviceName = activeGp.id.replace(/\\(.*?\\)/g, '').trim() || 'USB Racing Wheel';
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

    const speedFactor = state.esp32UdpConnected ? (state.esp32GdRefSpeed || 1.0) : (state.rcSpeedRatio || 5.0);
    const maxVelocity = 12.0 * speedFactor;

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
})();`;

  appContent = appContent.slice(0, startIdx) + newModuleCode + appContent.slice(endIdx);
  fs.writeFileSync(appPath, appContent, 'utf8');
  console.log('✅ Đã cập nhật toàn bộ setupUniversalSteeringWheelAndPedalsModule trong app.js');
} else {
  console.error('❌ Không tìm thấy markers trong app.js:', { startIdx, endIdx });
}

console.log('>>> [PATCH HOÀN TẤT] Hãy chạy node tools/xr-doctor.js để kiểm định!');
