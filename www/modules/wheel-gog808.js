/** GOG R808 steering wheel, pedal calibration and bridge synchronization. */

export function setupUniversalSteeringWheelAndPedalsModule(ctx) {
  const {
    THREE, camera, chassisGroup, getVirtualDrivingScale, initAudio, playSmartVehicleHornSound,
    renderer, scene, setWindshieldMode, showWindshieldCamera, state, steeringWheelPivot,
    updateCamRoadUiButtons, updateEsp32PulseInfo, vehicleRoot, wheelAssemblies, xrControllers,
  } = ctx;
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
    invertSteer: false,
    steerConfig: { type: 'auto', index: 0, invert: false },
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
    if (targetMode === 'ESP32_LIVE' || targetMode === 'ESP32_REAR_LIVE') {
      showWindshieldCamera(targetMode === 'ESP32_REAR_LIVE' ? 'rear' : 'front');
    } else if (targetMode) setWindshieldMode(targetMode);
    else if (state.windshieldCamEnabled) setWindshieldMode('TRANSPARENT');
    else showWindshieldCamera();
  };

  function startPedalCalibration(target) {
    racingWheel.calibratingTarget = target;
    const targetNames = { steer: 'VÔ LĂNG (ĐÁNH LÁI TRÁI/PHẢI)', gas: 'CHÂN GA (TIẾN)', brake: 'CHÂN PHANH (DỪNG)', reverse: 'CHÂN LÙI (LÙI XE)' };
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
    document.getElementById('btn-calib-steer')?.addEventListener('click', () => {
      startPedalCalibration('steer');
    });
    document.getElementById('btn-toggle-wheel-invert-steer')?.addEventListener('click', (e) => {
      racingWheel.invertSteer = !racingWheel.invertSteer;
      e.target.style.background = racingWheel.invertSteer ? '#ff9500' : '#1f3354';
      state.lastActionLog = racingWheel.invertSteer ? '🔄 Đã đảo chiều Vô Lăng' : '🔄 Vô Lăng chiều chuẩn';
      savePedalConfig();
    });
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
      monAxes.textContent = `🎮 GOG R808: Lái ${sNorm.toFixed(2)} | Ga ${gasPct}% | Phanh ${brakePct}% [Số ${gear}]`;
    }

    // 6. Cập nhật Xung ESP32
    const servoDeg = Math.round(90 + sNorm * 45);
    const escUs = Math.round(1500 + dNorm * 260);
    updateEsp32PulseInfo(`Lái: ${servoDeg}° | Ga: ${escUs}µs [Số ${gear}]`);

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

    function isRemoteBridgeActive() {
    const w = (typeof window !== 'undefined') ? window._racingWheel : null;
    if (!w || !w.isRemoteBridge || !w.connected) return false;
    const nowPerf = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (w.lastInputTime && (nowPerf - w.lastInputTime > 800)) {
      w.isRemoteBridge = false;
      w.connected = false;
      if (typeof racingWheel !== 'undefined' && racingWheel) {
        racingWheel.isRemoteBridge = false;
        racingWheel.connected = false;
      }
      return false;
    }
    return true;
  }
  if (typeof window !== 'undefined') window.isRemoteBridgeActive = isRemoteBridgeActive;

  function pollGamepadRacingWheel(dt) {
    // [ANTI-CONFLICT] Nếu đang nhận Remote Bridge từ Laptop (GOG R808 cắm vào laptop và đang hoạt động):
    // Không cho Gamepad / Touch Controller trên kính tự ý ghi đè hoặc set racingWheel.connected = false!
    if (isRemoteBridgeActive()) {
      return;
    }
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
    if (!activeGp.axes || !activeGp.buttons) return;

    if (!racingWheel.connected) {
      racingWheel.connected = true;
      racingWheel.deviceName = activeGp.id.replace(/\(.*?\)/g, '').trim() || 'USB Racing Wheel';
      updateConnectedBadge(true, racingWheel.deviceName);
      state.lastActionLog = '🏎️ Đã nhận diện Thiết bị Lái: ' + racingWheel.deviceName + '!';
    }

    // 1. ĐỌC GÓC VÔ LĂNG (HỖ TRỢ MỌI TRỤC & GÁN TỰ DO)
    let steerAxis = 0;
    const sIdx = racingWheel.steerConfig?.index ?? 0;
    if (activeGp.axes[sIdx] !== undefined) {
      const cur = activeGp.axes[sIdx];
      const base = racingWheel.baseAxes[sIdx] ?? 0;
      steerAxis = cur - (Math.abs(base) < 0.3 ? base : 0);
    }
    // Nếu trục sIdx không nhúc nhích mà trục khác xoay mạnh: tự bắt trục lái
    if (Math.abs(steerAxis) < 0.05) {
      for (let ax = 0; ax < Math.min(activeGp.axes.length, 4); ax++) {
        if (ax !== (racingWheel.pedalConfig.gas?.index ?? 1) && ax !== (racingWheel.pedalConfig.brake?.index ?? 2) && ax !== (racingWheel.pedalConfig.reverse?.index ?? 3)) {
          const diff = (activeGp.axes[ax] ?? 0) - (racingWheel.baseAxes[ax] ?? 0);
          if (Math.abs(diff) > 0.15) {
            steerAxis = diff;
            break;
          }
        }
      }
    }
    if (racingWheel.steerConfig?.invert || racingWheel.invertSteer) steerAxis = -steerAxis;
    if (Math.abs(steerAxis) < 0.02) steerAxis = 0;
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
    let reverseVal = readPedalNormalized(racingWheel.pedalConfig.reverse, 3, null, racingWheel.invertReverse);
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

    // QUÉT TỰ ĐỘNG CÁC TRỤC KHÁC NẾU CHƯA GÁN: Tự nhận diện bàn đạp còn thiếu (Chống nhiễu crosstalk trục chéo)
    if (isDedicatedWheel) {
      for (let a = 1; a < activeGp.axes.length; a++) {
        const cur = activeGp.axes[a] ?? 0;
        const base = racingWheel.baseAxes[a] ?? 0;
        const diff = Math.abs(cur - base);
        // Ngưỡng 0.25 để chỉ bắt khi người lái thực sự đạp chân, không bắt nhiễu điện thế analog
        if (diff > 0.25) {
          let pct = (base > 0.4) ? (1.0 - cur) / 2.0 : ((base < -0.4) ? (cur + 1.0) / 2.0 : diff);
          pct = THREE.MathUtils.clamp(pct, 0, 1);
          if (pct > 0.08) {
            if (a === 1 && gasVal === 0) gasVal = pct;
            // Chỉ nhận phanh tự động nếu chân ga và chân lùi không đạp (tránh ngắt ga do trục phanh bị nhiễu)
            else if ((a === 2 || a === 5) && brakeVal === 0 && gasVal === 0 && reverseVal === 0) brakeVal = pct;
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

    // Lọc vùng chết chống nhiễu potentiometer 5%
    gasVal = THREE.MathUtils.clamp(gasVal, 0, 1);
    brakeVal = THREE.MathUtils.clamp(brakeVal, 0, 1);
    reverseVal = THREE.MathUtils.clamp(reverseVal, 0, 1);
    if (gasVal < 0.05) gasVal = 0;
    if (brakeVal < 0.05) brakeVal = 0;
    if (reverseVal < 0.05) reverseVal = 0;

    racingWheel.gasPercent = gasVal * 100;
    racingWheel.brakePercent = brakeVal * 100;
    racingWheel.reversePercent = reverseVal * 100;

    // ĐỒNG BỘ TRỰC TIẾP VÀO TRẠNG THÁI XE CHÍNH CỦA APP (STATE)
    state.steeringAngleDeg = racingWheel.steerAngleDeg;
    state.throttlePercent = (reverseVal > 0.05) ? racingWheel.reversePercent : racingWheel.gasPercent;
    state.brakePercent = racingWheel.brakePercent;
    state.reversePercent = racingWheel.reversePercent;

    if (state.playerMode === 'DRIVING' && state.seatIndex === 0 && !state.engineRunning &&
        (racingWheel.gasPercent > 3 || racingWheel.reversePercent > 3 || Math.abs(racingWheel.rawSteer) > 0.04)) {
      state.engineRunning = true;
      state.rpm = 1200;
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
    const maxVelocity = targetMaxKmh * getVirtualDrivingScale() / 3.6;
    const speedFactor = 1.0;

    // B. BÀN ĐẠP THẮNG (QUY TẮC ƯU TIÊN PHANH & GIẢM TỐC MƯỢT CHỐNG GIẬT)
    // Khi đạp chân phanh (> 6%): Luôn chiếm quyền ưu tiên tuyệt đối, triệt tiêu ga/lùi để giảm tốc êm ái
    if (racingWheel.brakePercent > 6) {
      state.throttlePercent = 0;
      state.reversePercent = 0;
      state.brakePercent = racingWheel.brakePercent;
      const decelRate = 6.0 + (racingWheel.brakePercent / 100) * 12.0;
      const decelAlpha = THREE.MathUtils.clamp(dt * decelRate, 0, 1.0);
      state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, decelAlpha);
      if (Math.abs(state.velocityMs) < 0.08) {
        state.velocityMs = 0;
      }
      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = THREE.MathUtils.lerp(state.rpm, 850, Math.min(1, dt * 6.0));
    }
    // C. BÀN ĐẠP LÙI (REVERSE PEDAL - TỰ ĐỘNG LÙI XE RIÊNG BIỆT)
    else if (racingWheel.reversePercent > 5 && racingWheel.reversePercent > racingWheel.gasPercent) {
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
    else if (racingWheel.gasPercent > 5) {
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
}

/** Install the V260 background wheel reader and transmitter. */
export function setupV260WheelBridge({ THREE, state, isLaptopAdmin, getMpSocket }) {
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

    // 1. Camera ESP32 đã truyền trực tiếp qua WebSocket Binary tốc độ 30 FPS Zero-Lag
    // Triệt tiêu hoàn toàn việc nén base64 toDataURL() để giải phóng băng thông mạng và CPU

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
    // [ANTI-ECHO V504] Nếu Native Host Bridge đang đọc vô lăng USB ở 50Hz -> Browser không phát đè WHEEL_BRIDGE_INPUT
    if (typeof window !== 'undefined' && typeof window.isRemoteBridgeActive === 'function' && window.isRemoteBridgeActive()) return;

    // Tự động hiệu chuẩn trạng thái nghỉ của các trục (bỏ qua 10 frame đầu chống frame 0 dummy)
    if (!restAxesCalibrated) {
      restCalibrationFrames++;
      if (restCalibrationFrames < 10) return;
      restAxes = wheelPad.axes.map((v) => Number(v) || 0);
      restButtons = wheelPad.buttons.map((b) => (b ? Number(b.value) || 0 : 0));
      if (restCalibrationFrames >= 12) {
        restAxesCalibrated = true;
      } else {
        return;
      }
    }

    // A. Trục vô lăng (Axis 0)
    const rawSteerAxis = wheelPad.axes[0] || 0;
    const steerDeadband = Math.abs(rawSteerAxis) < 0.035 ? 0 : rawSteerAxis;
    const steerNorm = THREE.MathUtils.clamp(steerDeadband, -1.0, 1.0);

    // B. Đọc bàn đạp Ga & Bàn đạp Phanh / Lùi (Deadzone an toàn 0.08 chống phanh/lùi ảo)
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
      else gasVal = Math.abs(rawGasAxis - restGas) > 0.08 ? Math.max(0, Math.abs(rawGasAxis - restGas)) : 0;

      if (restBrake < -0.65) brakeVal = Math.max(0, (rawBrakeAxis + 1.0) / 2.0);
      else if (restBrake > 0.65) brakeVal = Math.max(0, (1.0 - rawBrakeAxis) / 2.0);
      else brakeVal = Math.abs(rawBrakeAxis - restBrake) > 0.08 ? Math.max(0, Math.abs(rawBrakeAxis - restBrake)) : 0;
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
        if (typeof getMpSocket() !== 'undefined' && getMpSocket() && getMpSocket().readyState === WebSocket.OPEN) {
          getMpSocket().send(JSON.stringify({
            type: 'WHEEL_BRIDGE_INPUT',
            connected: true,
            deviceId: wheelPad.id.replace(/\(.*?\)/g, '').trim() || 'GOG R808',
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
        if (typeof getMpSocket() !== 'undefined' && getMpSocket() && getMpSocket().readyState === WebSocket.OPEN) {
          getMpSocket().send(JSON.stringify({
            type: 'WHEEL_BRIDGE_INPUT',
            connected: true,
            deviceId: wheelPad.id.replace(/\(.*?\)/g, '').trim() || 'GOG R808',
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
    if (window.__GOG808_WORKER__) return;
    if (typeof Worker === 'undefined') {
      setInterval(runDedicatedLaptopWheelAndCameraTransmitter, 20);
      return;
    }
    try {
      const workerScript = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) timer = setInterval(function() { postMessage('tick'); }, 20);
          } else if (e.data === 'stop') {
            if (timer) { clearInterval(timer); timer = null; }
          }
        };
      `;
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      worker.onmessage = function() {
        runDedicatedLaptopWheelAndCameraTransmitter();
      };
      worker.postMessage('start');
      window.__GOG808_WORKER__ = worker;
      worker.onerror = () => {
        if (window.__GOG808_WORKER__ !== worker) return;
        worker.terminate();
        window.__GOG808_WORKER__ = null;
        setInterval(runDedicatedLaptopWheelAndCameraTransmitter, 20);
      };
    } catch (err) {
      console.warn('[GOG808] Web Worker fallback to setInterval:', err);
      setInterval(runDedicatedLaptopWheelAndCameraTransmitter, 20);
    }
  }

  if (isLaptopAdmin) {
    startGog808UnthrottledWorker();
  }

  if (typeof window !== 'undefined') {
    window.toggleGog808Pedals = () => {
      window.__GOG808_SWAP_PEDALS__ = !window.__GOG808_SWAP_PEDALS__;
      restAxesCalibrated = false;
      restCalibrationFrames = 0;
      console.log('🔄 Đã đảo chiều bàn đạp GOG R808:', window.__GOG808_SWAP_PEDALS__);
      return window.__GOG808_SWAP_PEDALS__;
    };
  }
}
