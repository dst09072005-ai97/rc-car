const fs = require('fs');
const path = require('path');

console.log('[PATCH V400] Bắt đầu tích hợp Native USB GOG R808 & Auto-Discovery...');

// 1. CẬP NHẬT SERVER.JS
const serverFiles = ['server.js', 'server/server.js'];
serverFiles.forEach(sFile => {
  if (!fs.existsSync(sFile)) return;
  let serverCode = fs.readFileSync(sFile, 'utf8');

  // Đảm bảo có route /api/bridge-ping
  if (!serverCode.includes('/api/bridge-ping')) {
    const pingRoute = `
// [PATCH V400] API PING CHO KÍNH META QUEST 3 TỰ ĐỘNG DÒ TÌM LAPTOP QUA WI-FI
app.get('/api/bridge-ping', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  const lanIp = typeof getLocalLanIp === 'function' ? getLocalLanIp() : '192.168.1.32';
  res.json({
    ok: true,
    service: 'GOG808_LAPTOP_BRIDGE',
    ips: [lanIp, '192.168.1.32'],
    wheelConnected: true,
    timestamp: Date.now()
  });
});
`;
    // Chèn trước app.use(express.static hoặc route static
    if (serverCode.includes('app.use(express.static')) {
      serverCode = serverCode.replace('app.use(express.static', pingRoute + '\napp.use(express.static');
    } else {
      serverCode = serverCode + '\n' + pingRoute;
    }
  }

  // Đảm bảo có Native WinMM USB Reader
  if (!serverCode.includes('attachNativeWinMmReaderV400')) {
    const nativeReaderCode = `
// ============================================================================
// [PATCH V400 - SERVER] ĐỌC TRỰC TIẾP USB VÔ LĂNG GOG R808 TỪ WINDOWS KERNEL 50Hz
// (TỰ ĐỘNG PHÁT RA XE RC & SANG KÍNH QUEST 3 MÀ KHÔNG CẦN MỞ TRÌNH DUYỆT LOCALHOST!)
// ============================================================================
(function attachNativeWinMmReaderV400() {
  if (process.platform !== 'win32') return;
  const { spawn } = require('child_process');
  const path = require('path');

  const psScriptPath = path.join(__dirname, 'tools', 'winmm_wheel_reader.ps1');
  if (!fs.existsSync(psScriptPath)) {
    const altPath = path.join(process.cwd(), 'tools', 'winmm_wheel_reader.ps1');
    if (!fs.existsSync(altPath)) return;
  }

  let psProc = null;
  try {
    psProc = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', fs.existsSync(psScriptPath) ? psScriptPath : path.join(process.cwd(), 'tools', 'winmm_wheel_reader.ps1')
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    console.warn('[V400 USB] Lỗi khởi chạy WinMM Wheel Reader:', err.message);
    return;
  }

  let loggedConnect = false;
  let restCalibrated = false;
  let calibSamples = 0;
  let restY = 32767, restZ = 32767, restR = 32767;
  let prevButtonsMask = 0;
  let stdoutBuf = '';

  const BUTTON_BIT_ACTIONS = [
    { bit: 4, action: 'TURN_LEFT' },
    { bit: 14, action: 'TURN_LEFT' },
    { bit: 5, action: 'TURN_RIGHT' },
    { bit: 15, action: 'TURN_RIGHT' },
    { bit: 0, action: 'HORN' },
    { bit: 8, action: 'HORN' },
    { bit: 9, action: 'HORN' },
    { bit: 2, action: 'ENTER_EXIT_CAR' },
    { bit: 3, action: 'ENTER_EXIT_CAR' },
    { bit: 1, action: 'CYCLE_SEAT' },
    { bit: 12, action: 'CYCLE_SEAT' }
  ];

  psProc.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split(/\\r?\\n/);
    stdoutBuf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('USB_WHEEL:')) continue;
      const parts = line.split(':');
      if (parts.length < 7) continue;

      const rawX = Number(parts[2]);
      const rawY = Number(parts[3]);
      const rawZ = Number(parts[4]);
      const rawR = Number(parts[5]);
      const buttons = Number(parts[6]) >>> 0;

      if (!loggedConnect) {
        loggedConnect = true;
        const lanIp = typeof getLocalLanIp === 'function' ? getLocalLanIp() : '192.168.1.32';
        console.log('🎮 [GOG R808 USB] Đã nhận tín hiệu trực tiếp từ cổng USB Laptop (50Hz)!');
        console.log('📡 [Wi-Fi Bridge] IP Laptop cho kính Meta Quest 3:', lanIp);
      }

      // Tự động căn chỉnh điểm nghỉ bàn đạp trong 10 mẫu đầu
      if (!restCalibrated) {
        if (calibSamples === 0) { restY = rawY; restZ = rawZ; restR = rawR; }
        else {
          restY = Math.round((restY + rawY) * 0.5);
          restZ = Math.round((restZ + rawZ) * 0.5);
          restR = Math.round((restR + rawR) * 0.5);
        }
        calibSamples++;
        if (calibSamples >= 10) restCalibrated = true;
        continue;
      }

      // Chuẩn hóa góc lái [-1.0 .. +1.0]
      let steerNorm = (rawX - 32767.5) / 32767.5;
      if (Math.abs(steerNorm) < 0.035) steerNorm = 0;
      steerNorm = Math.max(-1, Math.min(1, steerNorm));

      // Chuẩn hóa bàn đạp Ga và Phanh/Lùi
      let gasNorm = 0, brakeNorm = 0;
      const btnGas = (buttons & (1 << 6)) !== 0 ? 1 : 0;
      const btnBrake = (buttons & (1 << 7)) !== 0 ? 1 : 0;
      const deltaY = restY - rawY;
      const deltaZ = Math.abs(rawZ - restZ);
      const deltaR = Math.abs(rawR - restR);

      if (deltaZ > 2500 || deltaR > 2500) {
        const normY = Math.abs(rawY - restY) / (restY > 40000 ? 65535 : 32767);
        const normZR = Math.max(deltaZ, deltaR) / (Math.max(restZ, restR) > 40000 ? 65535 : 32767);
        gasNorm = Math.min(1, Math.max(0, normY));
        brakeNorm = Math.min(1, Math.max(0, normZR));
      } else if (Math.abs(deltaY) > 1800) {
        if (deltaY > 1800) gasNorm = Math.min(1, deltaY / 32767);
        else if (deltaY < -1800) brakeNorm = Math.min(1, (-deltaY) / 32767);
      } else if (btnGas || btnBrake) {
        gasNorm = btnGas;
        brakeNorm = btnBrake;
      }

      const btnEvents = [];
      for (const item of BUTTON_BIT_ACTIONS) {
        const isDown = (buttons & (1 << item.bit)) !== 0;
        const wasDown = (prevButtonsMask & (1 << item.bit)) !== 0;
        if (isDown && !wasDown) btnEvents.push(item.action);
      }
      prevButtonsMask = buttons;

      const driveNorm = Number((gasNorm - brakeNorm).toFixed(4));
      const gear = brakeNorm > 0.04 && gasNorm < 0.03 ? 'R' : 'D';
      const steerDeg = Math.round(90 + steerNorm * 45);
      const throttleVal = Math.round(1500 + driveNorm * 260);

      // 1. Gửi lệnh UDP ra mạch ESP32 xe RC thật
      if (typeof sendUdpCarCommand === 'function') {
        const isActivelyDriving = (throttleVal !== 1500 || steerDeg !== 90);
        if (isActivelyDriving) {
          sendUdpCarCommand(steerDeg, throttleVal);
        }
      }

      // 2. Phát WebSocket sang kính Meta Quest 3
      if (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets.size > 0) {
        const wheelPayload = JSON.stringify({
          type: 'WHEEL_BRIDGE_STATE',
          connected: true,
          source: 'NATIVE_WINMM_GOG808',
          deviceId: 'GOG R808 Native',
          steeringNorm: Number(steerNorm.toFixed(3)),
          steerAngleDeg: Number((steerNorm * 540).toFixed(1)),
          gasPercent: Math.round(gasNorm * 100),
          brakePercent: Math.round(brakeNorm * 100),
          reversePercent: gear === 'R' ? Math.round(brakeNorm * 100) : 0,
          gear,
          steer: steerDeg,
          throttle: throttleVal,
          buttonEvents
        });

        for (const client of activeMultiplayerSockets) {
          if (client.readyState === 1) {
            try { client.send(wheelPayload); } catch (e) {}
          }
        }
      }
    }
  });

  const cleanupPs = () => {
    if (psProc) {
      try { psProc.kill(); } catch (e) {}
      psProc = null;
    }
  };
  process.on('exit', cleanupPs);
  process.on('SIGINT', () => { cleanupPs(); process.exit(0); });
  process.on('SIGTERM', () => { cleanupPs(); process.exit(0); });
})();
`;
    serverCode += '\n' + nativeReaderCode;
  }

  fs.writeFileSync(sFile, serverCode, 'utf8');
  console.log('✅ Đã cập nhật V400 vào:', sFile);
});

// 2. CẬP NHẬT CLIENT APP.JS
const clientFiles = [
  'app.js',
  'www/app.js',
  'server/public/app.js',
  'android/app/src/main/assets/public/app.js'
];

const v400ClientCode = `
// ============================================================================
// [PATCH V400 - CLIENT] TỰ ĐỘNG DÒ TÌM LAPTOP QUA WI-FI (KHÔNG CẦN CÁP TYPE-C)
// & HIỂN THỊ THANH TRẠNG THÁI MÀU XANH TRÊN MÀN HÌNH 2D UNKNOWN SOURCES
// ============================================================================
(function setupV400WirelessQuestBridge() {
  if (typeof window === 'undefined' || window.__V400_WIRELESS_BRIDGE_INSTALLED__) return;
  window.__V400_WIRELESS_BRIDGE_INSTALLED__ = true;

  const BAKED_LAPTOP_IPS = ['192.168.1.32', '127.0.0.1'];
  let activeBridgeWs = null;
  let isScanningSubnet = false;

  function ensureStatusBanner() {
    let banner = document.getElementById('v400-wifi-status-banner');
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = 'v400-wifi-status-banner';
    banner.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;align-items:center;gap:10px;padding:8px 18px;border-radius:999px;background:rgba(10,16,28,0.92);border:2px solid #f59e0b;color:#fbbf24;font-family:Segoe UI,sans-serif;font-size:12.5px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,0.6);backdrop-filter:blur(6px);user-select:none;';

    const textSpan = document.createElement('span');
    textSpan.id = 'v400-wifi-status-text';
    textSpan.textContent = '📡 Đang tự động tìm Laptop trên mạng Wi-Fi...';

    const manualBtn = document.createElement('button');
    manualBtn.textContent = 'Đổi IP';
    manualBtn.style.cssText =
      'background:#1e293b;color:#38bdf8;border:1px solid #38bdf8;border-radius:999px;padding:3px 10px;font-size:11px;cursor:pointer;font-weight:700;';
    manualBtn.onclick = () => {
      const saved = localStorage.getItem('pc_server_ip') || '192.168.1.32';
      const entered = prompt('Nhập IP Wi-Fi của Laptop (VD: 192.168.1.32):', saved);
      if (entered && entered.trim()) {
        const cleanIp = entered.trim().replace(/^https?:\\/\\//, '').replace(/:\\d+$/, '');
        localStorage.setItem('pc_server_ip', cleanIp);
        connectToLaptopWs(cleanIp);
      }
    };

    banner.appendChild(textSpan);
    banner.appendChild(manualBtn);
    document.body.appendChild(banner);
    return banner;
  }

  function setBannerState(isConnected, message) {
    ensureStatusBanner();
    const banner = document.getElementById('v400-wifi-status-banner');
    const textSpan = document.getElementById('v400-wifi-status-text');
    if (!banner || !textSpan) return;

    if (isConnected) {
      banner.style.borderColor = '#10b981';
      banner.style.color = '#34d399';
      banner.style.background = 'rgba(6, 36, 24, 0.94)';
      textSpan.textContent = message;
    } else {
      banner.style.borderColor = '#f59e0b';
      banner.style.color = '#fbbf24';
      banner.style.background = 'rgba(10, 16, 28, 0.92)';
      textSpan.textContent = message;
    }
  }

  async function checkHostAlive(ip, timeoutMs = 500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(\`http://\${ip}:8080/api/bridge-ping\`, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) return ip;
      }
    } catch (e) {
      clearTimeout(timer);
    }
    return null;
  }

  async function discoverLaptopOnWifi() {
    if (isScanningSubnet) return;
    if (activeBridgeWs && activeBridgeWs.readyState === WebSocket.OPEN) return;
    isScanningSubnet = true;

    try {
      const priorityIps = [];
      const savedIp = localStorage.getItem('pc_server_ip');
      if (savedIp && savedIp !== 'localhost' && savedIp !== '127.0.0.1') priorityIps.push(savedIp);
      BAKED_LAPTOP_IPS.forEach(ip => {
        if (ip && !priorityIps.includes(ip)) priorityIps.push(ip);
      });

      for (const ip of priorityIps) {
        const found = await checkHostAlive(ip, 450);
        if (found) {
          localStorage.setItem('pc_server_ip', found);
          connectToLaptopWs(found);
          isScanningSubnet = false;
          return;
        }
      }

      // Quét nhanh các dải mạng phổ biến nếu laptop đổi IP
      setBannerState(false, '🔍 Đang quét dải Wi-Fi tìm Laptop...');
      const subnets = ['192.168.1', '192.168.0', '192.168.4'];
      for (const prefix of subnets) {
        const candidates = [];
        for (let i = 1; i <= 254; i++) candidates.push(\`\${prefix}.\${i}\`);
        const batchSize = 35;
        for (let i = 0; i < candidates.length; i += batchSize) {
          if (activeBridgeWs && activeBridgeWs.readyState === WebSocket.OPEN) {
            isScanningSubnet = false;
            return;
          }
          const batch = candidates.slice(i, i + batchSize);
          const results = await Promise.all(batch.map(ip => checkHostAlive(ip, 350)));
          const winner = results.find(Boolean);
          if (winner) {
            localStorage.setItem('pc_server_ip', winner);
            connectToLaptopWs(winner);
            isScanningSubnet = false;
            return;
          }
        }
      }
    } catch (e) {}
    isScanningSubnet = false;
  }

  function connectToLaptopWs(ip) {
    if (activeBridgeWs && activeBridgeWs.readyState === WebSocket.OPEN) return;
    if (activeBridgeWs) {
      try { activeBridgeWs.close(); } catch (e) {}
    }

    try {
      const sock = new WebSocket(\`ws://\${ip}:8080\`);
      activeBridgeWs = sock;

      sock.addEventListener('open', () => {
        localStorage.setItem('pc_server_ip', ip);
        setBannerState(true, \`🟢 ĐÃ KẾT NỐI LAPTOP (\${ip}:8080) — SẴN SÀNG LÁI GOG R808\`);
        sock.send(JSON.stringify({ type: 'PLAYER_HELLO', deviceType: 'META_QUEST' }));
      });

      sock.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg) return;

        if (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT') {
          // Tự động lên ghế lái khi có tín hiệu vô lăng
          if (typeof state !== 'undefined' && state) {
            if (state.playerMode !== 'DRIVING' || state.seatIndex !== 0) {
              state.playerMode = 'DRIVING';
              state.seatIndex = 0;
              state.engineRunning = true;
              state.gearIndex = 3;
            }
          }
        }
      });

      sock.addEventListener('close', () => {
        setBannerState(false, \`🟡 Mất kết nối tới \${ip}:8080 — Đang thử lại...\`);
      });

      sock.addEventListener('error', () => {
        try { sock.close(); } catch (e) {}
      });
    } catch (e) {}
  }

  // Khởi động dò tìm
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureStatusBanner();
      discoverLaptopOnWifi();
    });
  } else {
    ensureStatusBanner();
    discoverLaptopOnWifi();
  }

  setInterval(() => {
    if (!activeBridgeWs || activeBridgeWs.readyState === WebSocket.CLOSED) {
      discoverLaptopOnWifi();
    }
  }, 3000);
})();
`;

clientFiles.forEach(cFile => {
  if (!fs.existsSync(cFile)) return;
  let code = fs.readFileSync(cFile, 'utf8');
  if (!code.includes('setupV400WirelessQuestBridge')) {
    code = code + '\n' + v400ClientCode;
    fs.writeFileSync(cFile, code, 'utf8');
    console.log('✅ Đã thêm setupV400WirelessQuestBridge vào:', cFile);
  } else {
    console.log('ℹ️ Đã tồn tại setupV400WirelessQuestBridge trong:', cFile);
  }
});

console.log('[PATCH V400] Hoàn tất nạp mã nguồn!');
