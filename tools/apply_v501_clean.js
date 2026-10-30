const fs = require('fs');
const path = require('path');

console.log('[V501] Bắt đầu dọn dẹp các khối trùng lặp và cài đặt V501 Anti-Crash...');

const targetFiles = ['server.js', 'server/server.js'];

const v501Code = `
// ============================================================================
// [PATCH V501 - SERVER] CHỐNG SẬP SERVER KHI LÁI LIÊN TỤC (ANTI-CRASH GUARD),
// KHÓA LỖI BUTTONEVENTS & ĐIỀU TIẾT LUỒNG TÍN HIỆU 30Hz MƯỢT MÀ KHÔNG NGHẼN MẠNG
// ============================================================================
(function attachV501StableWheelBridge() {
  'use strict';

  // 1. Khóa cứng biến toàn cục & Bẫy lỗi để Server KHÔNG BAO GIỜ bị văng (Crash)
  global.buttonEvents = [];
  global.btnEvents = [];

  if (!global.__V501_CRASH_GUARD_INSTALLED__) {
    global.__V501_CRASH_GUARD_INSTALLED__ = true;
    process.on('uncaughtException', (err) => {
      console.error('⚠️ [ANTI-CRASH GUARD] Đã chặn 1 lỗi phát sinh:', err ? err.message : err);
    });
    process.on('unhandledRejection', (reason) => {
      console.error('⚠️ [ANTI-CRASH GUARD] Unhandled Rejection:', reason);
    });
  }

  if (global.__V501_WHEEL_BRIDGE_ACTIVE__) return;
  global.__V501_WHEEL_BRIDGE_ACTIVE__ = true;

  const os = require('os');
  const http = require('http');
  const https = require('https');
  const { spawn } = require('child_process');
  const WebSocket = require('ws');

  const connectedClients = new Set();

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

  // 2. HTTP Endpoint cho kính Quest 3 kiểm tra kết nối & đồng bộ góc lái dự phòng
  function handlePingAndWheelHttp(req, res) {
    if (!req || !res || !req.url) return false;
    if (req.url.startsWith('/api/bridge-ping') || req.url.startsWith('/api/wheel-state')) {
      try {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-store'
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
      } catch (e) {}
      return true;
    }
    return false;
  }

  [http.Server, https.Server].forEach((SrvClass) => {
    if (!SrvClass || !SrvClass.prototype || SrvClass.prototype.__v501HttpHooked) return;
    SrvClass.prototype.__v501HttpHooked = true;
    const origEmit = SrvClass.prototype.emit;
    SrvClass.prototype.emit = function (event, req, res, ...rest) {
      if (event === 'request' && handlePingAndWheelHttp(req, res)) return true;
      return origEmit.call(this, event, req, res, ...rest);
    };
  });

  // 3. Quản lý kết nối WebSocket an toàn 100%
  const WssProto = WebSocket.Server ? WebSocket.Server.prototype : null;
  if (WssProto && !WssProto.__v501EmitHooked) {
    WssProto.__v501EmitHooked = true;
    const origWssEmit = WssProto.emit;
    WssProto.emit = function (event, ws, req, ...rest) {
      if (event === 'connection' && ws) {
        connectedClients.add(ws);
        ws.on('close', () => connectedClients.delete(ws));
        ws.on('error', () => connectedClients.delete(ws));

        try {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'WHEEL_BRIDGE_STATE',
              ...wheelState,
              payload: wheelState
            }));
          }
        } catch (e) {}

        ws.on('message', (raw, isBinary) => {
          if (isBinary) return;
          try {
            const data = JSON.parse(raw.toString());
            if (data && data.type === 'WHEEL_BRIDGE_INPUT') {
              const src = data.payload || data;
              const safeBtnList = Array.isArray(src.buttonEvents) ? src.buttonEvents : [];
              pushWheelUpdateThrottled(
                Number(src.steerNorm ?? src.steer ?? 0) || 0,
                Number(src.gasNorm ?? 0) || 0,
                Number(src.brakeNorm ?? src.brake ?? 0) || 0,
                safeBtnList
              );
            }
          } catch (e) {}
        });
      }
      return origWssEmit.call(this, event, ws, req, ...rest);
    };
  }

  // 4. BỘ ĐIỀU TIẾT LUỒNG TÍN HIỆU 30Hz & CHỐNG TRÀN BỘ ĐỆM MẠNG
  let lastBroadcastMs = 0;
  let lastSentSteer = 0;
  let lastSentGas = 0;
  let lastSentBrake = 0;
  let lastUdpSendMs = 0;
  let lastTerminalLogMs = 0;

  function pushWheelUpdateThrottled(steerNorm, gasNorm, brakeNorm, btnEventsList) {
    try {
      const safeButtons = Array.isArray(btnEventsList) ? btnEventsList : [];
      const driveNorm = Math.max(-1, Math.min(1, gasNorm - brakeNorm));
      const gear = brakeNorm > 0.04 && gasNorm < 0.03 ? 'R' : 'D';
      const now = Date.now();

      wheelState.connected = true;
      wheelState.steerNorm = Number(steerNorm.toFixed(4));
      wheelState.gasNorm = Number(gasNorm.toFixed(4));
      wheelState.brakeNorm = Number(brakeNorm.toFixed(4));
      wheelState.driveNorm = Number(driveNorm.toFixed(4));
      wheelState.gear = gear;
      wheelState.buttonEvents = safeButtons;
      wheelState.updatedAt = now;

      const deltaChange =
        Math.abs(wheelState.steerNorm - lastSentSteer) +
        Math.abs(wheelState.gasNorm - lastSentGas) +
        Math.abs(wheelState.brakeNorm - lastSentBrake);

      const isActiveInput =
        Math.abs(wheelState.steerNorm) > 0.025 ||
        wheelState.gasNorm > 0.025 ||
        wheelState.brakeNorm > 0.025 ||
        safeButtons.length > 0;

      // Điều tiết phát WebSocket tối đa 30Hz (~33ms/gói)
      const shouldSendWs =
        safeButtons.length > 0 ||
        (now - lastBroadcastMs >= 33 && (deltaChange > 0.004 || isActiveInput));

      if (shouldSendWs) {
        lastBroadcastMs = now;
        lastSentSteer = wheelState.steerNorm;
        lastSentGas = wheelState.gasNorm;
        lastSentBrake = wheelState.brakeNorm;
        wheelState.seq++;

        if (isActiveInput && now - lastTerminalLogMs > 600) {
          lastTerminalLogMs = now;
          console.log(
            \`🛞 [GOG808 MƯỢT 30Hz] Lái: \${wheelState.steerNorm.toFixed(2)} | Ga: \${wheelState.gasNorm.toFixed(2)} | Phanh/Lùi: \${wheelState.brakeNorm.toFixed(2)} | Kính đang nối: \${connectedClients.size}\`
          );
        }

        const packetStr = JSON.stringify({
          type: 'WHEEL_BRIDGE_STATE',
          steerNorm: wheelState.steerNorm,
          gasNorm: wheelState.gasNorm,
          brakeNorm: wheelState.brakeNorm,
          driveNorm: wheelState.driveNorm,
          gear: wheelState.gear,
          buttonEvents: safeButtons,
          seq: wheelState.seq,
          payload: {
            steerNorm: wheelState.steerNorm,
            gasNorm: wheelState.gasNorm,
            brakeNorm: wheelState.brakeNorm,
            driveNorm: wheelState.driveNorm,
            gear: wheelState.gear,
            buttonEvents: safeButtons,
            seq: wheelState.seq
          },
          timestamp: now
        });

        // Kiểm tra chống tràn bộ đệm (bufferedAmount < 64KB)
        for (const client of connectedClients) {
          if (client.readyState === 1 && client.bufferedAmount < 65536) {
            try {
              client.send(packetStr);
            } catch (err) {}
          }
        }
      }

      // Điều tiết gửi UDP xuống mạch ESP32 ở mức 25Hz (40ms) chống quá tải Wi-Fi ESP32
      if (now - lastUdpSendMs >= 40) {
        lastUdpSendMs = now;
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
    } catch (err) {}
  }

  // 5. Trình đọc USB GOG R808 trên Windows
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
            const rx = Number(p[2]);
            const ry = Number(p[3]);
            const rz = Number(p[4]);
            const rr = Number(p[5]);
            const btns = Number(p[8]) >>> 0;

            let st = slots.get(id);
            if (!st) {
              st = { samples: 0, restY: ry, restZ: rz, restR: rr, prevBtns: btns };
              slots.set(id, st);
              console.log(\`✅ [V501 USB] Đã kết nối Vô lăng GOG R808 tại ID=\${id}\`);
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

            const currentButtonEvents = [];
            for (const item of BTN_MAP) {
              const isDown = (btns & (1 << item.bit)) !== 0;
              const wasDown = (st.prevBtns & (1 << item.bit)) !== 0;
              if (isDown && !wasDown) currentButtonEvents.push(item.act);
            }
            st.prevBtns = btns;
            global.buttonEvents = currentButtonEvents;

            pushWheelUpdateThrottled(steerNorm, gasNorm, brakeNorm, currentButtonEvents);
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

targetFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');

  // Gỡ bỏ toàn bộ các khối PATCH V400, V500, V501 cũ từ mốc rcHardwareV250Middleware trở đi
  const marker = 'app.use(rcHardwareV250Middleware);';
  const lastIdx = code.lastIndexOf(marker);
  if (lastIdx !== -1) {
    const endOfMiddlewareBlock = code.indexOf('})();', lastIdx);
    if (endOfMiddlewareBlock !== -1) {
      code = code.substring(0, endOfMiddlewareBlock + 5);
    }
  }

  // Khai báo global.buttonEvents = [] ngay đầu file nếu chưa có
  if (!code.includes('global.buttonEvents')) {
    code = 'global.buttonEvents = [];\nglobal.btnEvents = [];\n' + code;
  }

  // Gắn khối V501 hoàn chỉnh vào cuối
  code = code + '\n' + v501Code;

  fs.writeFileSync(file, code, 'utf8');
  console.log('✅ Đã làm sạch và cập nhật V501 vào:', file);
});

console.log('[V501] Hoàn tất triển khai!');
