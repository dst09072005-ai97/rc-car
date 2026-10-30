const fs = require('fs');
const path = require('path');

console.log('[PATCH V500] Bắt đầu triển khai Bản vá Toàn diện V500...');

// ============================================================================
// 1. CẬP NHẬT MAINACTIVITY.JAVA (Bật onStart và MIXED_CONTENT_ALWAYS_ALLOW)
// ============================================================================
const mainActivityPath = path.join('android', 'app', 'src', 'main', 'java', 'com', 'luxuryvr', 'rollsroyce', 'quest3', 'MainActivity.java');
if (fs.existsSync(mainActivityPath)) {
  let mainJava = fs.readFileSync(mainActivityPath, 'utf8');
  if (!mainJava.includes('onStart()')) {
    mainJava = mainJava.replace(
      'public class MainActivity extends BridgeActivity {',
      `public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        setupVrBridge();
    }`
    );
    fs.writeFileSync(mainActivityPath, mainJava, 'utf8');
    console.log('✅ Đã cập nhật onStart() vào MainActivity.java');
  }
}

// ============================================================================
// 2. CẬP NHẬT SERVER.JS & SERVER/SERVER.JS (V500)
// ============================================================================
const serverFiles = ['server.js', 'server/server.js'];
const v500ServerCode = `
// ============================================================================
// [PATCH V500 - SERVER] ĐỌC USB GOG R808 ĐA KÊNH + PHÁT KÉP (WEBSOCKET & HTTP)
// & TỰ ĐỘNG BẮT MỌI KẾT NỐI TỪ KÍNH META QUEST 3 (KHÔNG BỊ LỆCH SCOPE WSS)
// ============================================================================
(function attachV500GuaranteedWheelBridge() {
  'use strict';

  if (global.__V500_SERVER_BRIDGE_ACTIVE__) return;
  global.__V500_SERVER_BRIDGE_ACTIVE__ = true;

  const os = require('os');
  const http = require('http');
  const https = require('https');
  const { spawn } = require('child_process');
  const WebSocket = require('ws');
  const fs = require('fs');
  const path = require('path');

  // Tập hợp toàn cục lưu mọi kết nối WebSocket từ kính Quest 3 (Bất chấp wss nằm trong hàm kín)
  const connectedSockets = new Set();

  const wheelState = {
    connected: false,
    slotId: -1,
    steerNorm: 0,
    gasNorm: 0,
    brakeNorm: 0,
    driveNorm: 0,
    gear: 'D',
    buttonEvents: [],
    seq: 0,
    updatedAt: 0
  };

  function getLaptopLanIps() {
    const ips = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      if (/vmware|vbox|vethernet|wsl|tailscale|loopback|tun|tap/i.test(name)) continue;
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('100.') && !net.address.startsWith('169.254.')) {
          ips.push(net.address);
        }
      }
    }
    return ips.length > 0 ? ips : ['127.0.0.1'];
  }

  // 1. Trả lời trực tiếp tại /api/bridge-ping KÈM THEO TÍN HIỆU VÔ LĂNG MỚI NHẤT
  function handleBridgePingRequest(req, res) {
    if (!req || !res || !req.url) return false;
    if (req.url.startsWith('/api/bridge-ping') || req.url.startsWith('/api/wheel-state')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      });
      if (req.method === 'OPTIONS') {
        res.end();
        return true;
      }
      res.end(JSON.stringify({
        ok: true,
        ips: getLaptopLanIps(),
        wheel: wheelState,
        timestamp: Date.now()
      }));
      return true;
    }
    return false;
  }

  [http.Server, https.Server].forEach((SrvClass) => {
    if (!SrvClass || !SrvClass.prototype || SrvClass.prototype.__v500HttpHooked) return;
    SrvClass.prototype.__v500HttpHooked = true;
    const origEmit = SrvClass.prototype.emit;
    SrvClass.prototype.emit = function (event, req, res, ...rest) {
      if (event === 'request' && handleBridgePingRequest(req, res)) {
        return true;
      }
      return origEmit.call(this, event, req, res, ...rest);
    };
  });

  // 2. Chặn trực tiếp WebSocket.Server.prototype.emit('connection')
  const WssProto = WebSocket.Server ? WebSocket.Server.prototype : null;
  if (WssProto && !WssProto.__v500EmitHooked) {
    WssProto.__v500EmitHooked = true;
    const origWssEmit = WssProto.emit;
    WssProto.emit = function (event, ws, req, ...rest) {
      if (event === 'connection' && ws) {
        connectedSockets.add(ws);
        ws.on('close', () => connectedSockets.delete(ws));
        ws.on('error', () => connectedSockets.delete(ws));

        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'WHEEL_BRIDGE_STATE',
            ...wheelState,
            payload: wheelState
          }));
        }

        ws.on('message', (raw, isBinary) => {
          if (isBinary) return;
          try {
            const data = JSON.parse(raw.toString());
            if (data && data.type === 'WHEEL_BRIDGE_INPUT') {
              const src = data.payload || data;
              updateAndBroadcastWheel(
                Number(src.steerNorm ?? src.steer ?? 0) || 0,
                Number(src.gasNorm ?? 0) || 0,
                Number(src.brakeNorm ?? src.brake ?? 0) || 0,
                Array.isArray(src.buttonEvents) ? src.buttonEvents : [],
                'BROWSER_LOCALHOST'
              );
            }
          } catch (e) {}
        });
      }
      return origWssEmit.call(this, event, ws, req, ...rest);
    };
  }

  let lastConsoleLogAt = 0;

  function updateAndBroadcastWheel(steerNorm, gasNorm, brakeNorm, btnEvents, sourceTag) {
    const driveNorm = Math.max(-1, Math.min(1, gasNorm - brakeNorm));
    const gear = brakeNorm > 0.04 && gasNorm < 0.03 ? 'R' : 'D';

    wheelState.connected = true;
    wheelState.steerNorm = Number(steerNorm.toFixed(4));
    wheelState.gasNorm = Number(gasNorm.toFixed(4));
    wheelState.brakeNorm = Number(brakeNorm.toFixed(4));
    wheelState.driveNorm = Number(driveNorm.toFixed(4));
    wheelState.gear = gear;
    wheelState.buttonEvents = btnEvents || [];
    wheelState.seq++;
    wheelState.updatedAt = Date.now();

    const now = Date.now();
    if ((Math.abs(steerNorm) > 0.04 || gasNorm > 0.04 || brakeNorm > 0.04 || btnEvents.length > 0) && now - lastConsoleLogAt > 400) {
      lastConsoleLogAt = now;
      console.log(
        \`🛞 [GOG808 -> QUEST] Lái: \${wheelState.steerNorm.toFixed(2)} | Ga: \${wheelState.gasNorm.toFixed(2)} | Phanh/Lùi: \${wheelState.brakeNorm.toFixed(2)} | Kính đang nối: \${connectedSockets.size}\`
      );
    }

    // A. Phát qua WebSocket cho tất cả kính Meta Quest 3 đang mở
    const packetStr = JSON.stringify({
      type: 'WHEEL_BRIDGE_STATE',
      ...wheelState,
      payload: wheelState,
      timestamp: now
    });

    for (const client of connectedSockets) {
      if (client.readyState === 1) {
        try { client.send(packetStr); } catch (e) {}
      }
    }

    // B. Điều khiển xe RC ngoài đời qua UDP 4210
    const steerDeg = Math.round(90 + wheelState.steerNorm * 45);
    const escUs = Math.round(1500 + wheelState.driveNorm * 220);

    if (typeof sendSafeEsp32Udp === 'function') {
      try { sendSafeEsp32Udp(steerDeg, escUs); } catch (e) {}
    } else if (typeof sendUdpCarCommand === 'function') {
      try { sendUdpCarCommand(steerDeg, escUs); } catch (e) {}
    } else if (typeof processIncomingControl === 'function') {
      try {
        processIncomingControl({
          type: 'CAR_CONTROL',
          steer: steerDeg,
          throttle: escUs,
          steeringNorm: wheelState.steerNorm,
          throttleNorm: wheelState.driveNorm,
          gear
        });
      } catch (e) {}
    }
  }

  // 3. Đọc trực tiếp USB Vô lăng GOG R808 trên Windows (Multi-Slot Reader 50Hz)
  if (process.platform === 'win32') {
    console.log('================================================================');
    console.log('📡 [V500 BRIDGE] Địa chỉ IP Wi-Fi của Laptop:', getLaptopLanIps().join(' , '));
    console.log('🎮 [V500 BRIDGE] Đang khởi động trình đọc USB Vô lăng GOG R808 đa cổng...');
    console.log('================================================================');

    const psScriptPath = path.join(__dirname, 'tools', 'winmm_multislot_reader.ps1');
    const actualPath = fs.existsSync(psScriptPath) ? psScriptPath : path.join(process.cwd(), 'tools', 'winmm_multislot_reader.ps1');

    if (fs.existsSync(actualPath)) {
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', actualPath
      ], { stdio: ['ignore', 'pipe', 'ignore'] });

      const slots = new Map();
      let preferredSlotId = -1;

      const BTN_ACTIONS = [
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

      let buf = '';
      ps.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split(/\\r?\\n/);
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('W500:')) continue;
          const p = line.split(':');
          if (p.length < 9) continue;

          const id = Number(p[1]);
          const rx = Number(p[2]);
          const ry = Number(p[3]);
          const rz = Number(p[4]);
          const rr = Number(p[5]);
          const btns = Number(p[8]) >>> 0;

          let st = slots.get(id);
          if (!st) {
            st = { samples: 0, restX: 32767, restY: ry, restZ: rz, restR: rr, prevBtns: btns };
            slots.set(id, st);
            console.log(\`✅ [USB HID] Phát hiện thiết bị điều khiển tại cổng ID=\${id} (X=\${rx}, Y=\${ry})\`);
          }

          if (st.samples < 8) {
            st.restY = Math.round((st.restY + ry) * 0.5);
            st.restZ = Math.round((st.restZ + rz) * 0.5);
            st.restR = Math.round((st.restR + rr) * 0.5);
            st.samples++;
            if (preferredSlotId === -1) preferredSlotId = id;
            continue;
          }

          const activity = Math.abs(rx - 32767) + Math.abs(ry - st.restY) + Math.abs(rz - st.restZ) + (btns !== 0 ? 10000 : 0);
          if (activity > 2500 && preferredSlotId !== id) {
            preferredSlotId = id;
            console.log(\`🎯 [GOG R808] Đã khóa luồng tín hiệu vào Vô lăng ở cổng USB ID=\${id}!\`);
          }

          if (id !== preferredSlotId) continue;

          let steerNorm = (rx - 32767.5) / 32767.5;
          if (Math.abs(steerNorm) < 0.035) steerNorm = 0;
          steerNorm = Math.max(-1, Math.min(1, steerNorm));

          let gasNorm = 0;
          let brakeNorm = 0;

          const b6 = (btns & (1 << 6)) !== 0 ? 1 : 0;
          const b7 = (btns & (1 << 7)) !== 0 ? 1 : 0;
          const dy = st.restY - ry;
          const dz = Math.abs(rz - st.restZ);
          const dr = Math.abs(rr - st.restR);

          if (dz > 2200 || dr > 2200) {
            gasNorm = Math.min(1, Math.max(0, Math.abs(ry - st.restY) / (st.restY > 40000 ? 65535 : 32767)));
            brakeNorm = Math.min(1, Math.max(0, Math.max(dz, dr) / (Math.max(st.restZ, st.restR) > 40000 ? 65535 : 32767)));
          } else if (Math.abs(dy) > 1600) {
            if (dy > 1600) gasNorm = Math.min(1, dy / 32767);
            else brakeNorm = Math.min(1, (-dy) / 32767);
          } else if (b6 || b7) {
            gasNorm = b6;
            brakeNorm = b7;
          }

          const events = [];
          for (const item of BTN_ACTIONS) {
            const isDown = (btns & (1 << item.bit)) !== 0;
            const wasDown = (st.prevBtns & (1 << item.bit)) !== 0;
            if (isDown && !wasDown) events.push(item.act);
          }
          st.prevBtns = btns;

          wheelState.slotId = id;
          updateAndBroadcastWheel(steerNorm, gasNorm, brakeNorm, events, 'WINMM_USB');
        }
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

serverFiles.forEach(sFile => {
  if (!fs.existsSync(sFile)) return;
  let code = fs.readFileSync(sFile, 'utf8');
  if (!code.includes('attachV500GuaranteedWheelBridge')) {
    code = code + '\n' + v500ServerCode;
    fs.writeFileSync(sFile, code, 'utf8');
    console.log('✅ Đã thêm V500 vào:', sFile);
  }
});

// ============================================================================
// 3. CẬP NHẬT CLIENT APP.JS (V500 DUAL CHANNEL + SUBNET AUTO SCAN)
// ============================================================================
const clientFiles = [
  'app.js',
  'www/app.js',
  'server/public/app.js',
  'android/app/src/main/assets/public/app.js'
];

const v500ClientCode = `
// ============================================================================
// [PATCH V500 - CLIENT] KẾT NỐI KÉP (WEBSOCKET + HTTP POLLING) CHO APK QUEST 3
// TỰ ĐỘNG DÒ TÌM IP LAPTOP TRÊN MỌI MẠNG WI-FI — CÀI ĐẶT 1 LẦN DUY NHẤT VĨNH VIỄN
// ============================================================================
(function setupV500DualChannelQuestWheel() {
  if (typeof window === 'undefined' || window.__V500_DUAL_BRIDGE_ACTIVE__) return;
  window.__V500_DUAL_BRIDGE_ACTIVE__ = true;

  // Khóa cứng vai trò META_QUEST
  window.__V200_DEVICE_ROLE__ = 'META_QUEST';
  window.__DETECTED_DEVICE_TYPE__ = 'META_QUEST';

  // Dọn dẹp các banner cũ nếu có
  const oldBanner = document.getElementById('v400-wifi-status-banner');
  if (oldBanner) oldBanner.style.display = 'none';

  const bakedIps = Array.isArray(window.__BAKED_LAPTOP_IPS__) ? window.__BAKED_LAPTOP_IPS__ : ['192.168.1.32'];
  let activeLaptopIp = localStorage.getItem('V500_LAPTOP_IP') || localStorage.getItem('pc_server_ip') || bakedIps[0] || '';
  if (activeLaptopIp === 'localhost' || activeLaptopIp === '127.0.0.1') activeLaptopIp = '192.168.1.32';

  let wsConn = null;
  let isConnected = false;
  let lastProcessedSeq = -1;
  let isScanningSubnet = false;

  const liveWheel = {
    steerNorm: 0,
    gasNorm: 0,
    brakeNorm: 0,
    driveNorm: 0,
    updatedAt: 0
  };

  // 1. THANH TRẠNG THÁI HIỂN THỊ TRỰC QUAN TRÊN MÀN HÌNH 2D KÍNH
  function getOrCreateV500Banner() {
    let el = document.getElementById('v500-quest-bridge-banner');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'v500-quest-bridge-banner';
    el.style.cssText =
      'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:10px;padding:8px 18px;border-radius:999px;background:rgba(15,23,42,0.95);border:2px solid #38bdf8;color:#38bdf8;font-family:Segoe UI,sans-serif;font-size:12.5px;font-weight:700;box-shadow:0 6px 24px rgba(0,0,0,0.75);backdrop-filter:blur(6px);user-select:none;';

    const label = document.createElement('span');
    label.id = 'v500-quest-bridge-label';
    label.textContent = \`📡 Đang kết nối Laptop (\${activeLaptopIp || 'dò tự động'} : 8080)...\`;

    const btnIp = document.createElement('button');
    btnIp.textContent = 'Đổi IP Laptop';
    btnIp.style.cssText =
      'background:#0284c7;color:#fff;border:none;border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;cursor:pointer;';
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
    el.appendChild(btnIp);
    document.body.appendChild(el);
    return el;
  }

  function updateV500Banner(ok, text) {
    getOrCreateV500Banner();
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

  // 2. NẠP DỮ LIỆU VÔ LĂNG TỪ CẢ WEBSOCKET VÀ HTTP POLLING
  function ingestWheelData(w) {
    if (!w) return;
    liveWheel.steerNorm = Number(w.steerNorm ?? w.steer ?? 0) || 0;
    liveWheel.gasNorm = Number(w.gasNorm ?? 0) || 0;
    liveWheel.brakeNorm = Number(w.brakeNorm ?? w.brake ?? 0) || 0;
    liveWheel.driveNorm = Number(w.driveNorm ?? (liveWheel.gasNorm - liveWheel.brakeNorm)) || 0;
    liveWheel.updatedAt = performance.now();

    // Đồng bộ vào window._racingWheel để tương thích với toàn bộ hệ thống xe hiện tại
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
    rw.reversePercent = liveWheel.driveNorm < 0 ? Math.round(Math.abs(liveWheel.driveNorm) * 100) : 0;
    rw.gear = w.gear || (liveWheel.driveNorm < -0.05 ? 'R' : 'D');
    rw.lastInputTime = performance.now();

    if (typeof w.seq === 'number' && w.seq !== lastProcessedSeq) {
      lastProcessedSeq = w.seq;
      if (Array.isArray(w.buttonEvents) && w.buttonEvents.length > 0) {
        w.buttonEvents.forEach((act) => triggerWheelAction(act));
      }
    }
  }

  // 3. TỰ ĐỘNG DÒ TÌM IP LAPTOP QUA WI-FI (HỖ TRỢ MỌI DẢI MẠNG)
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
        updateV500Banner(
          true,
          \`🟢 ĐÃ KẾT NỐI LAPTOP (\${ip}:8080) | LÁI: \${(liveWheel.steerNorm * 100).toFixed(0)}%\`
        );
        sock.send(JSON.stringify({ type: 'PLAYER_HELLO', deviceType: 'META_QUEST' }));
      };

      sock.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT')) {
            ingestWheelData(msg.payload || msg);
            updateV500Banner(
              true,
              \`🟢 ĐÃ KẾT NỐI LAPTOP (\${ip}:8080) | LÁI: \${(liveWheel.steerNorm * 100).toFixed(0)}% | GA: \${(liveWheel.gasNorm * 100).toFixed(0)}%\`
            );
          }
        } catch (e) {}
      };

      sock.onclose = () => { isConnected = false; };
      sock.onerror = () => { try { sock.close(); } catch (e) {} };
    } catch (e) {}
  }

  // Quét mạng song song khi chưa kết nối
  async function performDeepNetworkDiscovery() {
    if (isScanningSubnet || isConnected) return;
    isScanningSubnet = true;

    try {
      // Bước A: Thử các IP ưu tiên
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

      // Bước B: Quét các dải mạng phổ biến nếu đổi Wi-Fi
      updateV500Banner(false, '🔍 Đang tự động quét Wi-Fi tìm Laptop...');
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

  // 4. VÒNG LẶP HTTP POLLING DỰ PHÒNG 150MS
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
            updateV500Banner(
              true,
              \`🟢 ĐÃ KẾT NỐI LAPTOP (\${testIp}:8080) | LÁI: \${(liveWheel.steerNorm * 100).toFixed(0)}% | GA: \${(liveWheel.gasNorm * 100).toFixed(0)}%\`
            );
            connectWebSocketToIp(testIp);
          }
        }
      } catch (e) {}
    }
  }, 150);

  // 5. ĐIỀU KHIỂN XE TRONG BUỒNG LÁI
  function ensureSeatedInDriverChair() {
    if (typeof state === 'undefined' || !state) return;
    if (state.playerMode !== 'DRIVING' || state.seatIndex !== 0) {
      state.playerMode = 'DRIVING';
      state.seatIndex = 0;
      state.engineRunning = true;
      state.gearIndex = 3;
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

  const carStateV500 = {
    ready: false,
    x: -3.2,
    z: -14.0,
    heading: 0,
    velMs: 0
  };

  setTimeout(() => {
    getOrCreateV500Banner();
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

    const steer = liveWheel.steerNorm;
    const gas = liveWheel.gasNorm;
    const brake = liveWheel.brakeNorm;

    if (Math.abs(steer) > 0.02 || gas > 0.02 || brake > 0.02) {
      ensureSeatedInDriverChair();
    }

    if (state.playerMode === 'DRIVING' && state.seatIndex === 0) {
      if (!carStateV500.ready) {
        carStateV500.x = vehicleRoot.position.x;
        carStateV500.z = vehicleRoot.position.z;
        carStateV500.heading = state.headingRad || vehicleRoot.rotation.y || 0;
        carStateV500.velMs = state.velocityMs || 0;
        carStateV500.ready = true;
      }

      state.engineRunning = true;
      state.steeringAngleDeg = steer * 540;
      if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
        steeringWheelPivot.rotation.z = -THREE.MathUtils.degToRad(state.steeringAngleDeg);
      }

      if (gas > 0.025) {
        state.gearIndex = 3; // D
        carStateV500.velMs = THREE.MathUtils.lerp(carStateV500.velMs, gas * 24.0, dt * 4.5);
      } else if (brake > 0.025) {
        if (carStateV500.velMs > 1.0) {
          carStateV500.velMs = Math.max(0, carStateV500.velMs - 26.0 * brake * dt);
        } else {
          state.gearIndex = 1; // R
          carStateV500.velMs = THREE.MathUtils.lerp(carStateV500.velMs, -brake * 11.0, dt * 6.0);
        }
      } else if (Math.abs(steer) > 0.04 && Math.abs(carStateV500.velMs) < 1.2) {
        state.gearIndex = 3;
        carStateV500.velMs = THREE.MathUtils.lerp(carStateV500.velMs, 3.0, dt * 3.5);
      } else {
        carStateV500.velMs = THREE.MathUtils.lerp(carStateV500.velMs, 0, dt * 3.2);
        if (Math.abs(carStateV500.velMs) < 0.03) carStateV500.velMs = 0;
      }

      if (Math.abs(steer) > 0.025 && Math.abs(carStateV500.velMs) > 0.03) {
        const sign = carStateV500.velMs < -0.03 ? -1 : 1;
        carStateV500.heading -= steer * 1.95 * sign * dt;
      }

      carStateV500.x -= Math.sin(carStateV500.heading) * carStateV500.velMs * dt;
      carStateV500.z -= Math.cos(carStateV500.heading) * carStateV500.velMs * dt;

      vehicleRoot.position.x = carStateV500.x;
      vehicleRoot.position.z = carStateV500.z;
      vehicleRoot.rotation.y = carStateV500.heading;

      state.headingRad = carStateV500.heading;
      state.velocityMs = carStateV500.velMs;
      state.speedKmh = carStateV500.velMs * 3.6;
    }
  };
})();
`;

clientFiles.forEach(cFile => {
  if (!fs.existsSync(cFile)) return;
  let code = fs.readFileSync(cFile, 'utf8');
  if (!code.includes('setupV500DualChannelQuestWheel')) {
    code = code + '\n' + v500ClientCode;
    fs.writeFileSync(cFile, code, 'utf8');
    console.log('✅ Đã thêm setupV500DualChannelQuestWheel vào:', cFile);
  }
});

console.log('[PATCH V500] Hoàn tất triển khai mã nguồn!');
