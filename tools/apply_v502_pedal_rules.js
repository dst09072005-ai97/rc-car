const fs = require('fs');
const path = require('path');

console.log('[V502] Bắt đầu triển khai Bộ Quy Tắc Bàn Đạp Chuẩn (Pedal Rules Engine)...');

// ============================================================================
// 1. CẬP NHẬT SERVER.JS & SERVER/SERVER.JS
// ============================================================================
const serverFiles = ['server.js', 'server/server.js'];

serverFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');

  // Gỡ bỏ khối SafeWheelReader cũ từ dòng W501 trở đi
  const marker = '// 5. Trình đọc USB GOG R808 trên Windows';
  const idx = code.indexOf(marker);
  if (idx !== -1) {
    code = code.substring(0, idx);
  }

  const v502ServerBlock = `// 5. Trình đọc USB GOG R808 trên Windows với Bộ Quy Tắc Bàn Đạp Chuẩn Xác (Pedal Rules Engine)
  if (process.platform === 'win32') {
    const psScriptPath = path.join(__dirname, 'tools', 'winmm_multislot_reader.ps1');
    const actualPath = fs.existsSync(psScriptPath) ? psScriptPath : path.join(process.cwd(), 'tools', 'winmm_multislot_reader.ps1');

    if (fs.existsSync(actualPath)) {
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', actualPath
      ], { stdio: ['ignore', 'pipe', 'ignore'] });

      ps.on('error', () => {});

      const slots = new Map();
      let activeSlot = -1;

      const BTN_MAP = [
        { bit: 4, act: 'TURN_LEFT' },
        { bit: 14, act: 'TURN_LEFT' },
        { bit: 5, act: 'TURN_RIGHT' },
        { bit: 15, act: 'TURN_RIGHT' },
        { bit: 0, act: 'HORN' },
        { bit: 8, act: 'HORN' },
        { bit: 9, act: 'HORN' },
        { bit: 2, act: 'ENTER_EXIT_CAR' },
        { bit: 3, act: 'ENTER_EXIT_CAR' },
        { bit: 1, act: 'CYCLE_SEAT' },
        { bit: 12, act: 'CYCLE_SEAT' }
      ];

      let stdoutBuffer = '';
      ps.stdout.on('data', (chunk) => {
        try {
          stdoutBuffer += chunk.toString();
          if (stdoutBuffer.length > 16384) {
            stdoutBuffer = stdoutBuffer.slice(-4096);
          }
          const lines = stdoutBuffer.split(/\\r?\\n/);
          stdoutBuffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('W500:')) continue;
            const p = line.split(':');
            if (p.length < 9) continue;

            const id = Number(p[1]);
            const rx = Number(p[2]); // Vô lăng
            const ry = Number(p[3]); // Bàn đạp Ga
            const rz = Number(p[4]); // Bàn đạp Phanh
            const rr = Number(p[5]); // Bàn đạp Lùi / Côn
            const btns = Number(p[8]) >>> 0;

            let st = slots.get(id);
            if (!st) {
              st = { samples: 0, restY: ry, restZ: rz, restR: rr, prevBtns: btns };
              slots.set(id, st);
              console.log(\`✅ [V502 USB] Đã nhận diện Vô lăng GOG R808 tại cổng ID=\${id}\`);
            }

            if (st.samples < 8) {
              st.restY = Math.round((st.restY + ry) * 0.5);
              st.restZ = Math.round((st.restZ + rz) * 0.5);
              st.restR = Math.round((st.restR + rr) * 0.5);
              st.samples++;
              if (activeSlot === -1) activeSlot = id;
              continue;
            }

            const motion = Math.abs(rx - 32767) + Math.abs(ry - st.restY) + Math.abs(rz - st.restZ) + (btns !== 0 ? 10000 : 0);
            if (motion > 2500 && activeSlot !== id) {
              activeSlot = id;
            }
            if (id !== activeSlot) continue;

            // 1. Chuẩn hóa góc lái vô lăng [-1.0 .. +1.0]
            let steerNorm = (rx - 32767.5) / 32767.5;
            if (Math.abs(steerNorm) < 0.035) steerNorm = 0;
            steerNorm = Math.max(-1, Math.min(1, steerNorm));

            // 2. Đọc thô các tín hiệu Ga, Phanh, Lùi
            let rawGas = 0;
            let rawBrake = 0;
            let rawReverse = 0;

            const bGas = (btns & (1 << 7)) !== 0; // Nút Ga digital / Lẫy phải
            const bBrake = (btns & (1 << 6)) !== 0; // Nút Phanh digital
            const bReverse = (btns & (1 << 13)) !== 0 || (btns & (1 << 3)) !== 0 || (btns & (1 << 1)) !== 0; // Cần số Lùi / Nút R

            const deltaY = Math.abs(ry - st.restY);
            const deltaZ = Math.abs(rz - st.restZ);
            const deltaR = Math.abs(rr - st.restR);

            // Xử lý 3 bàn đạp độc lập (Chuẩn HID GOG R808: Y=Ga, Z=Phanh, R=Lùi)
            if (deltaZ > 2000 || deltaR > 2000) {
              rawGas = Math.min(1, Math.max(0, deltaY / (st.restY > 40000 ? 65535 : 32767)));
              rawBrake = Math.min(1, Math.max(0, deltaZ / (st.restZ > 40000 ? 65535 : 32767)));
              rawReverse = Math.min(1, Math.max(0, deltaR / (st.restR > 40000 ? 65535 : 32767)));
            }
            // Trường hợp 2 bàn đạp chung trục Y
            else if (deltaY > 1800) {
              if (ry > st.restY + 1800) {
                rawGas = Math.min(1, (ry - st.restY) / 32767);
              } else if (ry < st.restY - 1800) {
                rawBrake = Math.min(1, (st.restY - ry) / 32767);
              }
            }

            if (bGas) rawGas = Math.max(rawGas, 1.0);
            if (bBrake) rawBrake = Math.max(rawBrake, 1.0);
            if (bReverse) rawReverse = Math.max(rawReverse, 1.0);

            // ================================================================
            // 3. BỘ QUY TẮC ĐIỀU KHIỂN BÀN ĐẠP CHUẨN XÁC (PEDAL RULES MATRIX)
            // ================================================================
            let effectiveGas = 0;
            let effectiveBrake = 0;
            let effectiveReverse = 0;
            let targetGear = wheelState.gear || 'D';

            // RULE 1: Vừa Ga Vừa Phanh -> ƯU TIÊN PHANH (Brake Overrides Gas)
            if (rawBrake > 0.05 && rawGas > 0.05) {
              effectiveGas = 0;
              effectiveBrake = rawBrake;
              effectiveReverse = 0;
            }
            // RULE 2: Vừa Lùi Vừa Phanh -> ƯU TIÊN PHANH (Brake Overrides Reverse)
            else if (rawBrake > 0.05 && rawReverse > 0.05) {
              effectiveGas = 0;
              effectiveBrake = rawBrake;
              effectiveReverse = 0;
            }
            // RULE 3: Vừa Ga Vừa Lùi -> ƯU TIÊN GIẢM TỐC TRƯỚC RỒI MỚI LÙI
            else if (rawGas > 0.05 && rawReverse > 0.05) {
              effectiveGas = 0;
              effectiveBrake = 0.85; // Tự động hãm tốc độ về 0 trước
              effectiveReverse = 0;
            }
            // RULE 4: Đạp Ga Tiến (Gas Alone) -> TIẾN TỚI!
            else if (rawGas > 0.04) {
              effectiveGas = rawGas;
              effectiveBrake = 0;
              effectiveReverse = 0;
              targetGear = 'D';
            }
            // RULE 5: Đạp Phanh (Brake Alone) -> PHANH DỪNG XE!
            else if (rawBrake > 0.04) {
              effectiveGas = 0;
              effectiveBrake = rawBrake;
              effectiveReverse = 0;
            }
            // RULE 6: Đạp Lùi (Reverse Alone) -> LÙI XE!
            else if (rawReverse > 0.04) {
              effectiveGas = 0;
              effectiveBrake = 0;
              effectiveReverse = rawReverse;
              targetGear = 'R';
            }
            // RULE 7: Nhả toàn bộ chân -> Trung tính
            else {
              effectiveGas = 0;
              effectiveBrake = 0;
              effectiveReverse = 0;
            }

            // 4. Tính toán Drive Norm và Xung ESC cho xe RC thật
            let driveNorm = 0;
            if (effectiveBrake > 0.04) {
              driveNorm = 0; // Phanh triệt tiêu hoàn toàn lực kéo, xe dừng hẳn!
            } else if (effectiveGas > 0.04) {
              driveNorm = effectiveGas; // Lực kéo tiến [0..+1.0]
              targetGear = 'D';
            } else if (effectiveReverse > 0.04) {
              driveNorm = -effectiveReverse; // Lực kéo lùi [-1.0..0]
              targetGear = 'R';
            }

            wheelState.gear = targetGear;
            wheelState.reverseNorm = Number(effectiveReverse.toFixed(4));

            const currentButtonEvents = [];
            for (const item of BTN_MAP) {
              const isDown = (btns & (1 << item.bit)) !== 0;
              const wasDown = (st.prevBtns & (1 << item.bit)) !== 0;
              if (isDown && !wasDown) currentButtonEvents.push(item.act);
            }
            st.prevBtns = btns;
            global.buttonEvents = currentButtonEvents;

            pushWheelUpdateThrottled(steerNorm, effectiveGas, effectiveBrake, currentButtonEvents);
          }
        } catch (err) {}
      });

      const killPs = () => {
        try { ps.kill(); } catch (e) {}
      };
      process.on('exit', killPs);
      process.on('SIGINT', () => { killPs(); process.exit(0); });
      process.on('SIGTERM', () => { killPs(); process.exit(0); });
    }
  }
})();
`;

  code = code + '\n' + v502ServerBlock;
  fs.writeFileSync(file, code, 'utf8');
  console.log('✅ Đã cập nhật V502 Server vào:', file);
});

// ============================================================================
// 2. CẬP NHẬT CLIENT APP.JS (V502 RULES VÀ GÁN GA QUA WI-FI)
// ============================================================================
const clientFiles = [
  'app.js',
  'www/app.js',
  'server/public/app.js',
  'android/app/src/main/assets/public/app.js'
];

clientFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');

  // Gỡ bỏ khối setupV500DualChannelQuestWheel cũ để thay bằng V502 hoàn chỉnh
  const marker = '// ============================================================================\n// [PATCH V500 - CLIENT]';
  const idx = code.indexOf(marker);
  if (idx !== -1) {
    code = code.substring(0, idx);
  }

  const v502ClientBlock = `// ============================================================================
// [PATCH V502 - CLIENT] BỘ QUY TẮC BÀN ĐẠP CHUẨN XÁC & HỖ TRỢ GÁN GA QUA WI-FI
// ƯU TIÊN PHANH ĐÈ GA, PHANH ĐÈ LÙI, HÃM TỐC TRƯỚC KHI LÙI, KHÔNG BAO GIỜ LÙI KHI PHANH
// ============================================================================
(function setupV502PerfectPedalsQuestWheel() {
  if (typeof window === 'undefined' || window.__V502_PERFECT_PEDALS_ACTIVE__) return;
  window.__V502_PERFECT_PEDALS_ACTIVE__ = true;

  window.__V200_DEVICE_ROLE__ = 'META_QUEST';
  window.__DETECTED_DEVICE_TYPE__ = 'META_QUEST';

  const oldBanner = document.getElementById('v400-wifi-status-banner');
  if (oldBanner) oldBanner.style.display = 'none';

  const bakedIps = Array.isArray(window.__BAKED_LAPTOP_IPS__) ? window.__BAKED_LAPTOP_IPS__ : ['192.168.1.32'];
  let activeLaptopIp = localStorage.getItem('V500_LAPTOP_IP') || localStorage.getItem('pc_server_ip') || bakedIps[0] || '';
  if (activeLaptopIp === 'localhost' || activeLaptopIp === '127.0.0.1') activeLaptopIp = '192.168.1.32';

  let wsConn = null;
  let isConnected = false;
  let lastProcessedSeq = -1;
  let isScanningSubnet = false;
  let invertGasDrive = localStorage.getItem('V502_INVERT_GAS') === 'true';

  const liveWheel = {
    steerNorm: 0,
    gasNorm: 0,
    brakeNorm: 0,
    reverseNorm: 0,
    driveNorm: 0,
    gear: 'D',
    updatedAt: 0
  };

  // 1. THANH TRẠNG THÁI HIỂN THỊ KÈM NÚT ĐỔI CHIỀU GA & ĐỔI IP
  function getOrCreateV502Banner() {
    let el = document.getElementById('v500-quest-bridge-banner');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'v500-quest-bridge-banner';
    el.style.cssText =
      'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;padding:6px 16px;border-radius:999px;background:rgba(15,23,42,0.95);border:2px solid #38bdf8;color:#38bdf8;font-family:Segoe UI,sans-serif;font-size:12px;font-weight:700;box-shadow:0 6px 24px rgba(0,0,0,0.75);backdrop-filter:blur(6px);user-select:none;';

    const label = document.createElement('span');
    label.id = 'v500-quest-bridge-label';
    label.textContent = \`📡 Đang kết nối Laptop (\${activeLaptopIp || 'dò tự động'} : 8080)...\`;

    const btnInvert = document.createElement('button');
    btnInvert.id = 'v502-btn-toggle-invert';
    btnInvert.textContent = invertGasDrive ? '🔄 Chiều Ga: ĐẢO' : '🔄 Chiều Ga: CHUẨN';
    btnInvert.style.cssText =
      'background:#1e293b;color:#facc15;border:1px solid #facc15;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;';
    btnInvert.onclick = () => {
      invertGasDrive = !invertGasDrive;
      localStorage.setItem('V502_INVERT_GAS', String(invertGasDrive));
      btnInvert.textContent = invertGasDrive ? '🔄 Chiều Ga: ĐẢO' : '🔄 Chiều Ga: CHUẨN';
    };

    const btnIp = document.createElement('button');
    btnIp.textContent = 'Đổi IP';
    btnIp.style.cssText =
      'background:#0284c7;color:#fff;border:none;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;';
    btnIp.onclick = () => {
      const hint = activeLaptopIp || bakedIps.join(', ') || '192.168.1.32';
      const inp = prompt('Nhập IP Wi-Fi của Laptop đang chạy node server.js:', hint);
      if (inp && inp.trim()) {
        const cleanIp = inp.trim().replace(/^https?:\\/\\//, '').replace(/:\\d+$/, '');
        activeLaptopIp = cleanIp;
        localStorage.setItem('V500_LAPTOP_IP', cleanIp);
        localStorage.setItem('pc_server_ip', cleanIp);
        connectWebSocketToIp(cleanIp);
      }
    };

    el.appendChild(label);
    el.appendChild(btnInvert);
    el.appendChild(btnIp);
    document.body.appendChild(el);
    return el;
  }

  function updateV502Banner(ok, text) {
    getOrCreateV502Banner();
    const banner = document.getElementById('v500-quest-bridge-banner');
    const label = document.getElementById('v500-quest-bridge-label');
    if (!banner || !label) return;
    label.textContent = text;
    if (ok) {
      banner.style.borderColor = '#10b981';
      banner.style.color = '#34d399';
      banner.style.background = 'rgba(6, 40, 28, 0.95)';
    } else {
      banner.style.borderColor = '#f59e0b';
      banner.style.color = '#fbbf24';
      banner.style.background = 'rgba(15, 23, 42, 0.95)';
    }
  }

  // 2. NẠP DỮ LIỆU VÔ LĂNG TỪ LAPTOP VÀ KÍCH HOẠT HỖ TRỢ GÁN GA
  function ingestWheelData(w) {
    if (!w) return;
    liveWheel.steerNorm = Number(w.steerNorm ?? w.steer ?? 0) || 0;
    liveWheel.gasNorm = Number(w.gasNorm ?? 0) || 0;
    liveWheel.brakeNorm = Number(w.brakeNorm ?? w.brake ?? 0) || 0;
    liveWheel.reverseNorm = Number(w.reverseNorm ?? (w.gear === 'R' ? w.brakeNorm : 0)) || 0;
    liveWheel.driveNorm = Number(w.driveNorm ?? (liveWheel.gasNorm - liveWheel.brakeNorm)) || 0;
    liveWheel.gear = w.gear || (liveWheel.driveNorm < -0.05 ? 'R' : 'D');
    liveWheel.updatedAt = performance.now();

    // Hỗ trợ nút "🎯 Gán Ga" trên giao diện Kính hoạt động qua sóng Wi-Fi
    if (typeof racingWheel !== 'undefined' && racingWheel && racingWheel.calibratingTarget) {
      const target = racingWheel.calibratingTarget;
      let detectedVal = 0;
      if (target === 'gas') detectedVal = liveWheel.gasNorm;
      else if (target === 'brake') detectedVal = liveWheel.brakeNorm;
      else if (target === 'reverse') detectedVal = liveWheel.reverseNorm;

      if (detectedVal > 0.25) {
        racingWheel.calibratingTarget = null;
        const btn = document.getElementById('btn-calib-pedal-' + target);
        if (btn) {
          btn.textContent = '✅ Đã Gán Xong!';
          btn.style.background = '#00ff88';
          btn.style.color = '#000';
          setTimeout(() => {
            btn.textContent = target === 'gas' ? '🎯 Gán Ga' : (target === 'brake' ? '🎯 Gán Phanh' : '🎯 Gán Lùi');
            btn.style.background = '#1f3354';
            btn.style.color = target === 'gas' ? '#00ff88' : (target === 'brake' ? '#ff3b30' : '#ffd60a');
          }, 2500);
        }
        if (typeof state !== 'undefined' && state) {
          state.lastActionLog = \`🎯 Đã nhận diện thành công bàn đạp: \${target.toUpperCase()} qua Wi-Fi!\`;
        }
      }
    }

    if (!window._racingWheel) {
      window._racingWheel = {
        connected: true,
        deviceName: 'GOG R808 Native Bridge',
        steerAngleDeg: 0,
        rawSteer: 0,
        gasPercent: 0,
        brakePercent: 0,
        reversePercent: 0,
        gear: 'D',
        lastInputTime: performance.now()
      };
    }
    const rw = window._racingWheel;
    rw.connected = true;
    rw.rawSteer = liveWheel.steerNorm;
    rw.steerAngleDeg = liveWheel.steerNorm * 540;
    rw.gasPercent = Math.round(liveWheel.gasNorm * 100);
    rw.brakePercent = Math.round(liveWheel.brakeNorm * 100);
    rw.reversePercent = Math.round(liveWheel.reverseNorm * 100);
    rw.gear = liveWheel.gear;
    rw.lastInputTime = performance.now();

    if (typeof w.seq === 'number' && w.seq !== lastProcessedSeq) {
      lastProcessedSeq = w.seq;
      if (Array.isArray(w.buttonEvents) && w.buttonEvents.length > 0) {
        w.buttonEvents.forEach((act) => triggerWheelAction(act));
      }
    }
  }

  // 3. TỰ ĐỘNG DÒ TÌM IP LAPTOP QUA WI-FI
  function getCandidateIps() {
    const list = [];
    if (activeLaptopIp && !list.includes(activeLaptopIp)) list.push(activeLaptopIp);
    const saved = localStorage.getItem('V500_LAPTOP_IP') || localStorage.getItem('pc_server_ip');
    if (saved && saved !== 'localhost' && saved !== '127.0.0.1' && !list.includes(saved)) list.push(saved);
    bakedIps.forEach(ip => {
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1' && !list.includes(ip)) list.push(ip);
    });
    if (location.hostname && location.hostname !== 'localhost' && !list.includes(location.hostname)) {
      list.push(location.hostname);
    }
    return list;
  }

  async function checkHostAlive(ip, timeoutMs = 450) {
    if (!ip || ip === 'localhost' || ip === '127.0.0.1') return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(\`http://\${ip}:8080/api/bridge-ping\`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          if (data.wheel) ingestWheelData(data.wheel);
          return ip;
        }
      }
    } catch (e) {
      clearTimeout(timer);
    }
    return null;
  }

  function connectWebSocketToIp(ip) {
    if (!ip || ip === 'localhost' || ip === '127.0.0.1') return;
    if (wsConn && wsConn.readyState === WebSocket.OPEN && activeLaptopIp === ip) return;
    if (wsConn) {
      try { wsConn.close(); } catch (e) {}
    }

    try {
      const sock = new WebSocket(\`ws://\${ip}:8080\`);
      wsConn = sock;
      window.__v200Socket = sock;
      window.multiplayerWs = sock;
      window.rcSocket = sock;

      sock.onopen = () => {
        isConnected = true;
        activeLaptopIp = ip;
        localStorage.setItem('V500_LAPTOP_IP', ip);
        localStorage.setItem('pc_server_ip', ip);
        updateV502Banner(
          true,
          \`🟢 ĐÃ KẾT NỐI (\${ip}:8080) | LÁI: \${(liveWheel.steerNorm * 100).toFixed(0)}% | SỐ \${liveWheel.gear}\`
        );
        sock.send(JSON.stringify({ type: 'PLAYER_HELLO', deviceType: 'META_QUEST' }));
      };

      sock.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT')) {
            ingestWheelData(msg.payload || msg);
            updateV502Banner(
              true,
              \`🟢 ĐÃ KẾT NỐI (\${ip}:8080) | LÁI: \${(liveWheel.steerNorm * 100).toFixed(0)}% | GA: \${(liveWheel.gasNorm * 100).toFixed(0)}% | SỐ \${liveWheel.gear}\`
            );
          }
        } catch (e) {}
      };

      sock.onclose = () => { isConnected = false; };
      sock.onerror = () => { try { sock.close(); } catch (e) {} };
    } catch (e) {}
  }

  async function performDeepNetworkDiscovery() {
    if (isScanningSubnet || isConnected) return;
    isScanningSubnet = true;

    try {
      const candidates = getCandidateIps();
      for (const ip of candidates) {
        const found = await checkHostAlive(ip, 500);
        if (found) {
          activeLaptopIp = found;
          localStorage.setItem('V500_LAPTOP_IP', found);
          localStorage.setItem('pc_server_ip', found);
          connectWebSocketToIp(found);
          isScanningSubnet = false;
          return;
        }
      }

      updateV502Banner(false, '🔍 Đang tự động quét Wi-Fi tìm Laptop...');
      const subnets = ['192.168.1', '192.168.0', '192.168.2', '192.168.4', '10.0.0', '172.20.10'];
      for (const prefix of subnets) {
        const batch = [];
        for (let i = 1; i <= 254; i++) batch.push(\`\${prefix}.\${i}\`);
        const batchSize = 35;
        for (let i = 0; i < batch.length; i += batchSize) {
          if (isConnected) { isScanningSubnet = false; return; }
          const chunk = batch.slice(i, i + batchSize);
          const results = await Promise.all(chunk.map(ip => checkHostAlive(ip, 320)));
          const hit = results.find(Boolean);
          if (hit) {
            activeLaptopIp = hit;
            localStorage.setItem('V500_LAPTOP_IP', hit);
            localStorage.setItem('pc_server_ip', hit);
            connectWebSocketToIp(hit);
            isScanningSubnet = false;
            return;
          }
        }
      }
    } catch (e) {}
    isScanningSubnet = false;
  }

  // 4. HTTP POLLING DỰ PHÒNG 150MS
  let pollCandidateIdx = 0;
  setInterval(async () => {
    const ips = getCandidateIps();
    if (ips.length === 0) return;

    const testIp = isConnected && activeLaptopIp ? activeLaptopIp : ips[pollCandidateIdx % ips.length];
    if (!isConnected) {
      pollCandidateIdx++;
      connectWebSocketToIp(testIp);
    }

    if (!wsConn || wsConn.readyState !== WebSocket.OPEN) {
      try {
        const res = await fetch(\`http://\${testIp}:8080/api/bridge-ping\`, { mode: 'cors', cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok) {
            isConnected = true;
            activeLaptopIp = testIp;
            localStorage.setItem('V500_LAPTOP_IP', testIp);
            localStorage.setItem('pc_server_ip', testIp);
            if (data.wheel) ingestWheelData(data.wheel);
            updateV502Banner(
              true,
              \`🟢 ĐÃ KẾT NỐI (\${testIp}:8080) | LÁI: \${(liveWheel.steerNorm * 100).toFixed(0)}% | SỐ \${liveWheel.gear}\`
            );
            connectWebSocketToIp(testIp);
          }
        }
      } catch (e) {}
    }
  }, 150);

  // 5. ĐIỀU KHIỂN XE THEO BỘ QUY TẮC BÀN ĐẠP CHUẨN XÁC
  function ensureSeatedInDriverChair() {
    if (typeof state === 'undefined' || !state) return;
    if (state.playerMode !== 'DRIVING' || state.seatIndex !== 0) {
      state.playerMode = 'DRIVING';
      state.seatIndex = 0;
      state.engineRunning = true;
      if (typeof avatarBodyMesh !== 'undefined' && avatarBodyMesh) avatarBodyMesh.visible = false;
      if (typeof chassisGroup !== 'undefined' && typeof cameraRig !== 'undefined' && chassisGroup && cameraRig) {
        chassisGroup.add(cameraRig);
        cameraRig.position.set(-0.38, 0.88, 0.08);
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

  const carStateV502 = {
    ready: false,
    x: -3.2,
    z: -14.0,
    heading: 0,
    velMs: 0
  };

  setTimeout(() => {
    getOrCreateV502Banner();
    ensureSeatedInDriverChair();
    const ips = getCandidateIps();
    if (ips[0]) connectWebSocketToIp(ips[0]);
    performDeepNetworkDiscovery();
  }, 400);

  setInterval(() => {
    if (!isConnected) performDeepNetworkDiscovery();
  }, 3500);

  const prevBeforeRender = scene.onBeforeRender;
  let lastFrameMs = performance.now();

  scene.onBeforeRender = function (rendererInst, sceneInst, cameraInst) {
    if (typeof prevBeforeRender === 'function') {
      prevBeforeRender(rendererInst, sceneInst, cameraInst);
    }

    const now = performance.now();
    const dt = Math.min(Math.max((now - lastFrameMs) / 1000, 0.001), 0.05);
    lastFrameMs = now;

    if (now - liveWheel.updatedAt > 800) return;
    if (typeof state === 'undefined' || !state || typeof vehicleRoot === 'undefined' || !vehicleRoot) return;

    let steer = liveWheel.steerNorm;
    let gas = invertGasDrive ? liveWheel.brakeNorm : liveWheel.gasNorm;
    let brake = invertGasDrive ? liveWheel.gasNorm : liveWheel.brakeNorm;
    let reverse = liveWheel.reverseNorm || (liveWheel.gear === 'R' ? Math.max(0, -liveWheel.driveNorm) : 0);
    const isReverseGear = (liveWheel.gear === 'R' || liveWheel.driveNorm < -0.05);

    if (Math.abs(steer) > 0.02 || gas > 0.02 || brake > 0.02 || reverse > 0.02) {
      ensureSeatedInDriverChair();
    }

    if (state.playerMode === 'DRIVING' && state.seatIndex === 0) {
      if (!carStateV502.ready) {
        carStateV502.x = vehicleRoot.position.x;
        carStateV502.z = vehicleRoot.position.z;
        carStateV502.heading = state.headingRad || vehicleRoot.rotation.y || 0;
        carStateV502.velMs = state.velocityMs || 0;
        carStateV502.ready = true;
      }

      state.engineRunning = true;
      state.steeringAngleDeg = steer * 540;
      if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
        steeringWheelPivot.rotation.z = -THREE.MathUtils.degToRad(state.steeringAngleDeg);
      }

      // ======================================================================
      // THỰC THI BỘ QUY TẮC BÀN ĐẠP (RULES ENGINE CHO XE ẢO)
      // ======================================================================
      // RULE 1: Vừa Ga vừa Phanh -> Ưu tiên Phanh dừng xe!
      if (brake > 0.04 && gas > 0.04) {
        state.throttlePercent = 0;
        state.brakePercent = Math.round(brake * 100);
        carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, 0, dt * 10.0);
        if (Math.abs(carStateV502.velMs) < 0.05) carStateV502.velMs = 0;
      }
      // RULE 2: Vừa Lùi vừa Phanh -> Ưu tiên Phanh dừng xe!
      else if (brake > 0.04 && (reverse > 0.04 || isReverseGear)) {
        state.throttlePercent = 0;
        state.brakePercent = Math.round(brake * 100);
        carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, 0, dt * 10.0);
        if (Math.abs(carStateV502.velMs) < 0.05) carStateV502.velMs = 0;
      }
      // RULE 3: Vừa Ga vừa Lùi -> Ưu tiên giảm tốc về 0 trước!
      else if (gas > 0.04 && (reverse > 0.04 || isReverseGear)) {
        state.throttlePercent = 0;
        state.brakePercent = 90;
        carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, 0, dt * 8.0);
        if (Math.abs(carStateV502.velMs) < 0.05) carStateV502.velMs = 0;
      }
      // RULE 4: Đạp Ga Tiến (Gas Alone) -> TIẾN TỚI!
      else if (gas > 0.03 && !isReverseGear) {
        state.gearIndex = 3; // D (Tiến)
        state.throttlePercent = Math.round(gas * 100);
        state.brakePercent = 0;
        if (carStateV502.velMs < -0.1) {
          carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, 0, dt * 10.0);
        } else {
          const targetForwardVel = gas * 24.0;
          carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, targetForwardVel, dt * 4.5);
        }
      }
      // RULE 5: Đạp Phanh (Brake Alone) -> PHANH DỪNG XE (KHÔNG BAO GIỜ LÙI KHI PHANH!)
      else if (brake > 0.03) {
        state.throttlePercent = 0;
        state.brakePercent = Math.round(brake * 100);
        carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, 0, dt * 8.5);
        if (Math.abs(carStateV502.velMs) < 0.05) carStateV502.velMs = 0;
      }
      // RULE 6: Đạp Lùi (Reverse Alone) -> LÙI XE VỀ SAU!
      else if (reverse > 0.03 || isReverseGear) {
        const revVal = reverse > 0.03 ? reverse : Math.abs(liveWheel.driveNorm);
        state.gearIndex = 1; // R (Lùi)
        state.throttlePercent = Math.round(revVal * 100);
        state.brakePercent = 0;
        if (carStateV502.velMs > 0.1) {
          carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, 0, dt * 10.0);
        } else {
          const targetRevVel = -revVal * 11.0;
          carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, targetRevVel, dt * 5.0);
        }
      }
      // RULE 7: Nhả toàn bộ chân ga/phanh -> Giảm tốc tự nhiên theo quán tính
      else {
        state.throttlePercent = 0;
        state.brakePercent = 0;
        carStateV502.velMs = THREE.MathUtils.lerp(carStateV502.velMs, 0, dt * 3.5);
        if (Math.abs(carStateV502.velMs) < 0.03) carStateV502.velMs = 0;
      }

      // Xoay bánh lái
      if (Math.abs(steer) > 0.025 && Math.abs(carStateV502.velMs) > 0.03) {
        const sign = carStateV502.velMs < -0.03 ? -1 : 1;
        carStateV502.heading -= steer * 1.95 * sign * dt;
      }

      carStateV502.x -= Math.sin(carStateV502.heading) * carStateV502.velMs * dt;
      carStateV502.z -= Math.cos(carStateV502.heading) * carStateV502.velMs * dt;

      vehicleRoot.position.x = carStateV502.x;
      vehicleRoot.position.z = carStateV502.z;
      vehicleRoot.rotation.y = carStateV502.heading;

      state.headingRad = carStateV502.heading;
      state.velocityMs = carStateV502.velMs;
      state.speedKmh = carStateV502.velMs * 3.6;
    }
  };
})();
`;

  code = code + '\n' + v502ClientBlock;
  fs.writeFileSync(file, code, 'utf8');
  console.log('✅ Đã cập nhật V502 Client vào:', file);
});

console.log('[V502] Hoàn tất triển khai Pedal Rules Engine!');
