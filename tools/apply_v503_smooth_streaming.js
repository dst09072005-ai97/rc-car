const fs = require('fs');
const path = require('path');

console.log('[V503] Bắt đầu triển khai Bản vá Luồng Mượt 50Hz, Gỡ Banner Vướng Menu & Hiệu Chỉnh Toàn Diện...');

// ============================================================================
// 1. CẬP NHẬT TOOLS/WINMM_MULTISLOT_READER.PS1 VỚI CONSOLE.OUT.FLUSH()
// ============================================================================
const psScriptContent = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class MultiSlotWheelReader {
    [StructLayout(LayoutKind.Sequential)]
    public struct JOYINFOEX {
        public uint dwSize;
        public uint dwFlags;
        public uint dwXpos;
        public uint dwYpos;
        public uint dwZpos;
        public uint dwRpos;
        public uint dwUpos;
        public uint dwVpos;
        public uint dwButtons;
        public uint dwButtonNumber;
        public uint dwPOV;
        public uint dwReserved1;
        public uint dwReserved2;
    }

    [DllImport("winmm.dll")]
    public static extern uint joyGetPosEx(uint uJoyID, ref JOYINFOEX pji);

    public static void Run() {
        JOYINFOEX info = new JOYINFOEX();
        info.dwSize = (uint)Marshal.SizeOf(info);
        info.dwFlags = 0xFF; // JOY_RETURNALL

        while (true) {
            for (uint id = 0; id < 16; id++) {
                if (joyGetPosEx(id, ref info) == 0) {
                    Console.WriteLine("W500:" + id + ":" + info.dwXpos + ":" + info.dwYpos + ":" + info.dwZpos + ":" + info.dwRpos + ":" + info.dwUpos + ":" + info.dwVpos + ":" + info.dwButtons);
                    Console.Out.Flush(); // BẮT BUỘC ĐẨY TỨC THỜI — KHÔNG ĐỆM ĐƯỜNG ỐNG
                }
            }
            Thread.Sleep(20); // 50Hz mượt mà
        }
    }
}
"@
[MultiSlotWheelReader]::Run()
`;
fs.writeFileSync(path.join(process.cwd(), 'tools', 'winmm_multislot_reader.ps1'), psScriptContent, 'utf8');
console.log('✅ Đã cập nhật tools/winmm_multislot_reader.ps1 với Console.Out.Flush()');

// ============================================================================
// 2. CẬP NHẬT SERVER.JS & SERVER/SERVER.JS (V503 - STREAMING LIÊN TỤC 50Hz KHÔNG KHỰNG)
// ============================================================================
const serverFiles = ['server.js', 'server/server.js'];

serverFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');

  // Gỡ bỏ khối V502 cũ từ mốc attachV501StableWheelBridge
  const marker = '// ============================================================================\n// [PATCH V501 - SERVER]';
  const idx = code.indexOf(marker);
  if (idx !== -1) {
    code = code.substring(0, idx);
  }

  const v503ServerCode = `// ============================================================================
// [PATCH V503 - SERVER] PHÁT SÓNG LIÊN TỤC 50Hz KHÔNG KHỰNG, FLUSH TỨC THÌ,
// KHÓA LỖI SẬP VÀ THỰC THI BỘ QUY TẮC BÀN ĐẠP CHUẨN XÁC TRÊN SERVER & LOCALHOST
// ============================================================================
(function attachV503ContinuousWheelBridge() {
  'use strict';

  global.buttonEvents = [];
  global.btnEvents = [];

  if (!global.__V501_CRASH_GUARD_INSTALLED__) {
    global.__V501_CRASH_GUARD_INSTALLED__ = true;
    process.on('uncaughtException', (err) => {
      console.error('⚠️ [ANTI-CRASH GUARD] Đã chặn 1 lỗi:', err ? err.message : err);
    });
    process.on('unhandledRejection', (reason) => {
      console.error('⚠️ [ANTI-CRASH GUARD] Unhandled Rejection:', reason);
    });
  }

  if (global.__V503_SERVER_ACTIVE__) return;
  global.__V503_SERVER_ACTIVE__ = true;

  const os = require('os');
  const http = require('http');
  const https = require('https');
  const { spawn } = require('child_process');
  const WebSocket = require('ws');
  const path = require('path');
  const fs = require('fs');

  const connectedClients = new Set();

  const wheelState = {
    connected: false,
    slotId: -1,
    steerNorm: 0,
    gasNorm: 0,
    brakeNorm: 0,
    reverseNorm: 0,
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
    if (!SrvClass || !SrvClass.prototype || SrvClass.prototype.__v503HttpHooked) return;
    SrvClass.prototype.__v503HttpHooked = true;
    const origEmit = SrvClass.prototype.emit;
    SrvClass.prototype.emit = function (event, req, res, ...rest) {
      if (event === 'request' && handlePingAndWheelHttp(req, res)) return true;
      return origEmit.call(this, event, req, res, ...rest);
    };
  });

  const WssProto = WebSocket.Server ? WebSocket.Server.prototype : null;
  if (WssProto && !WssProto.__v503EmitHooked) {
    WssProto.__v503EmitHooked = true;
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
              resolveAndBroadcastPedalRules(
                Number(src.steerNorm ?? src.steer ?? 0) || 0,
                Number(src.gasNorm ?? (src.gasPercent ? src.gasPercent / 100 : 0)) || 0,
                Number(src.brakeNorm ?? (src.brakePercent ? src.brakePercent / 100 : 0)) || 0,
                Number(src.reverseNorm ?? 0) || 0,
                safeBtnList,
                src.gear || 'D'
              );
            }
          } catch (e) {}
        });
      }
      return origWssEmit.call(this, event, ws, req, ...rest);
    };
  }

  // --------------------------------------------------------------------------
  // BỘ ĐIỀU TIẾT PHÁT SÓNG 50Hz LIÊN TỤC (KHÔNG BỊ DỪNG / KHỰNG KHI ĐANG GIỮ CHÂN GA)
  // --------------------------------------------------------------------------
  let lastBroadcastMs = 0;
  let lastUdpSendMs = 0;
  let lastTerminalLogMs = 0;
  let neutralSendCount = 0;

  function resolveAndBroadcastPedalRules(steerNorm, rawGas, rawBrake, rawReverse, safeButtons, requestedGear) {
    try {
      const now = Date.now();

      // ======================================================================
      // BỘ QUY TẮC BÀN ĐẠP CHUẨN XÁC (STRICT PEDAL RULES ENGINE)
      // ======================================================================
      let effectiveGas = 0;
      let effectiveBrake = 0;
      let effectiveReverse = 0;
      let gear = requestedGear || 'D';

      // RULE 1: Vừa Ga vừa Phanh -> Ưu tiên PHANH DỪNG XE (Brake Overrides Gas)
      if (rawBrake > 0.05 && rawGas > 0.05) {
        effectiveGas = 0;
        effectiveBrake = rawBrake;
        effectiveReverse = 0;
      }
      // RULE 2: Vừa Lùi vừa Phanh -> Ưu tiên PHANH DỪNG XE (Brake Overrides Reverse)
      else if (rawBrake > 0.05 && (rawReverse > 0.05 || gear === 'R')) {
        effectiveGas = 0;
        effectiveBrake = rawBrake;
        effectiveReverse = 0;
      }
      // RULE 3: Vừa Ga vừa Lùi -> Ưu tiên GIẢM TỐC VỀ 0 TRƯỚC RỒI MỚI LÙI
      else if (rawGas > 0.05 && (rawReverse > 0.05 || gear === 'R')) {
        effectiveGas = 0;
        effectiveBrake = 0.85; // Hãm tốc độ về 0 an toàn
        effectiveReverse = 0;
      }
      // RULE 4: Đạp Ga Tiến (Gas Alone) -> TIẾN TỚI (Số D)
      else if (rawGas > 0.03 && gear !== 'R') {
        effectiveGas = rawGas;
        effectiveBrake = 0;
        effectiveReverse = 0;
        gear = 'D';
      }
      // RULE 5: Đạp Phanh (Brake Alone) -> PHANH DỪNG XE (KHÔNG BAO GIỜ LÙI KHI PHANH!)
      else if (rawBrake > 0.03) {
        effectiveGas = 0;
        effectiveBrake = rawBrake;
        effectiveReverse = 0;
      }
      // RULE 6: Đạp Lùi (Reverse Alone) -> LÙI XE (Số R)
      else if (rawReverse > 0.03 || gear === 'R') {
        effectiveGas = 0;
        effectiveBrake = 0;
        effectiveReverse = rawReverse > 0.03 ? rawReverse : rawGas;
        gear = 'R';
      }
      // RULE 7: Nhả toàn bộ chân -> Trung tính
      else {
        effectiveGas = 0;
        effectiveBrake = 0;
        effectiveReverse = 0;
      }

      let driveNorm = 0;
      if (effectiveBrake > 0.04) {
        driveNorm = 0;
      } else if (effectiveGas > 0.04) {
        driveNorm = effectiveGas;
        gear = 'D';
      } else if (effectiveReverse > 0.04) {
        driveNorm = -effectiveReverse;
        gear = 'R';
      }

      wheelState.connected = true;
      wheelState.steerNorm = Number(steerNorm.toFixed(4));
      wheelState.gasNorm = Number(effectiveGas.toFixed(4));
      wheelState.brakeNorm = Number(effectiveBrake.toFixed(4));
      wheelState.reverseNorm = Number(effectiveReverse.toFixed(4));
      wheelState.driveNorm = Number(driveNorm.toFixed(4));
      wheelState.gear = gear;
      wheelState.buttonEvents = safeButtons;
      wheelState.updatedAt = now;

      // KIỂM TRA ĐANG ĐIỀU KHIỂN:
      // Khi người lái đang giữ chân ga hoặc đang giữ vô lăng, PHẢI PHÁT SÓNG LIÊN TỤC 50Hz (mỗi 20ms)!
      // Tuyệt đối không dừng phát chỉ vì deltaChange == 0!
      const isActiveInput = (
        Math.abs(wheelState.steerNorm) > 0.02 ||
        wheelState.gasNorm > 0.02 ||
        wheelState.brakeNorm > 0.02 ||
        wheelState.reverseNorm > 0.02 ||
        safeButtons.length > 0
      );

      const shouldBroadcastWs = (now - lastBroadcastMs >= 20) && (isActiveInput || neutralSendCount < 8 || safeButtons.length > 0);

      if (shouldBroadcastWs) {
        lastBroadcastMs = now;
        if (!isActiveInput) neutralSendCount++;
        else neutralSendCount = 0;
        wheelState.seq++;

        if (isActiveInput && now - lastTerminalLogMs > 600) {
          lastTerminalLogMs = now;
          console.log(
            \`🛞 [GOG808 50Hz MƯỢT] Lái: \${wheelState.steerNorm.toFixed(2)} | Ga: \${wheelState.gasNorm.toFixed(2)} | Phanh: \${wheelState.brakeNorm.toFixed(2)} | Số \${wheelState.gear} | Kính: \${connectedClients.size}\`
          );
        }

        const packetStr = JSON.stringify({
          type: 'WHEEL_BRIDGE_STATE',
          steerNorm: wheelState.steerNorm,
          gasNorm: wheelState.gasNorm,
          brakeNorm: wheelState.brakeNorm,
          reverseNorm: wheelState.reverseNorm,
          driveNorm: wheelState.driveNorm,
          gear: wheelState.gear,
          buttonEvents: safeButtons,
          seq: wheelState.seq,
          payload: {
            steerNorm: wheelState.steerNorm,
            gasNorm: wheelState.gasNorm,
            brakeNorm: wheelState.brakeNorm,
            reverseNorm: wheelState.reverseNorm,
            driveNorm: wheelState.driveNorm,
            gear: wheelState.gear,
            buttonEvents: safeButtons,
            seq: wheelState.seq
          },
          timestamp: now
        });

        for (const client of connectedClients) {
          if (client.readyState === 1 && client.bufferedAmount < 65536) {
            try { client.send(packetStr); } catch (err) {}
          }
        }
      }

      // Phát lệnh UDP xuống xe RC ESP32 ở tần số 33Hz (30ms)
      if (now - lastUdpSendMs >= 30) {
        lastUdpSendMs = now;
        const steerDeg = Math.round(90 + wheelState.steerNorm * 45);
        let escUs = 1500;
        if (wheelState.brakeNorm > 0.04) {
          escUs = 1500; // Phanh dừng xe
        } else if (wheelState.driveNorm > 0.04) {
          escUs = Math.round(1500 + wheelState.driveNorm * 260); // Tiến
        } else if (wheelState.driveNorm < -0.04) {
          escUs = Math.round(1500 + wheelState.driveNorm * 220); // Lùi
        }

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
              gear: wheelState.gear
            });
          } catch (e) {}
        }
      }
    } catch (err) {}
  }

  // Khởi chạy trình đọc USB WinMM trực tiếp từ Windows
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
          if (stdoutBuffer.length > 16384) stdoutBuffer = stdoutBuffer.slice(-4096);
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
              console.log(\`✅ [V503 USB] Đã nhận diện Vô lăng GOG R808 tại cổng ID=\${id}\`);
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

            // Góc lái
            let steerNorm = (rx - 32767.5) / 32767.5;
            if (Math.abs(steerNorm) < 0.035) steerNorm = 0;
            steerNorm = Math.max(-1, Math.min(1, steerNorm));

            let rawGas = 0;
            let rawBrake = 0;
            let rawReverse = 0;

            const bGas = (btns & (1 << 7)) !== 0; // Nút Ga digital
            const bBrake = (btns & (1 << 6)) !== 0; // Nút Phanh digital
            const bReverse = (btns & (1 << 13)) !== 0 || (btns & (1 << 3)) !== 0 || (btns & (1 << 1)) !== 0; // Nút R

            const deltaY = Math.abs(ry - st.restY);
            const deltaZ = Math.abs(rz - st.restZ);
            const deltaR = Math.abs(rr - st.restR);

            // Xử lý 3 bàn đạp độc lập
            if (deltaZ > 2000 || deltaR > 2000) {
              rawGas = Math.min(1, Math.max(0, deltaY / (st.restY > 40000 ? 65535 : 32767)));
              rawBrake = Math.min(1, Math.max(0, deltaZ / (st.restZ > 40000 ? 65535 : 32767)));
              rawReverse = Math.min(1, Math.max(0, deltaR / (st.restR > 40000 ? 65535 : 32767)));
            } else if (deltaY > 1800) {
              if (ry > st.restY + 1800) {
                rawGas = Math.min(1, (ry - st.restY) / 32767);
              } else if (ry < st.restY - 1800) {
                rawBrake = Math.min(1, (st.restY - ry) / 32767);
              }
            }

            if (bGas) rawGas = Math.max(rawGas, 1.0);
            if (bBrake) rawBrake = Math.max(rawBrake, 1.0);
            if (bReverse) rawReverse = Math.max(rawReverse, 1.0);

            const currentButtonEvents = [];
            for (const item of BTN_MAP) {
              const isDown = (btns & (1 << item.bit)) !== 0;
              const wasDown = (st.prevBtns & (1 << item.bit)) !== 0;
              if (isDown && !wasDown) currentButtonEvents.push(item.act);
            }
            st.prevBtns = btns;
            global.buttonEvents = currentButtonEvents;

            const reqGear = rawReverse > 0.05 || bReverse ? 'R' : 'D';
            resolveAndBroadcastPedalRules(steerNorm, rawGas, rawBrake, rawReverse, currentButtonEvents, reqGear);
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

  code = code + '\n' + v503ServerCode;
  fs.writeFileSync(file, code, 'utf8');
  console.log('✅ Đã cập nhật V503 Server vào:', file);
});

// ============================================================================
// 3. CẬP NHẬT CLIENT APP.JS (GỠ BỎ HOÀN TOÀN FLOATING BANNER VƯỚNG MENU TRÊN CÙNG)
// & ĐƯA TRẠNG THÁI VÀO FUNCTION PANEL, KẾT NỐI TOÀN BỘ CÁC NÚT GÁN BÀN ĐẠP
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

  // Gỡ bỏ khối V500/V502 cũ
  const marker = '// ============================================================================\n// [PATCH V502 - CLIENT]';
  const idx = code.indexOf(marker);
  if (idx !== -1) {
    code = code.substring(0, idx);
  }

  const v503ClientCode = `// ============================================================================
// [PATCH V503 - CLIENT] TÍCH HỢP BẢNG CHỨC NĂNG GỌN GÀNG (KHÔNG VƯỚNG MENU TRÊN CÙNG),
// HỖ TRỢ ĐẦY ĐỦ CÁC NÚT GÁN BÀN ĐẠP QUA WI-FI & CHẠY MƯỢT 50Hz KHÔNG KHỰNG
// ============================================================================
(function setupV503SmoothQuestWheel() {
  if (typeof window === 'undefined' || window.__V503_SMOOTH_WHEEL_ACTIVE__) return;
  window.__V503_SMOOTH_WHEEL_ACTIVE__ = true;

  window.__V200_DEVICE_ROLE__ = 'META_QUEST';
  window.__DETECTED_DEVICE_TYPE__ = 'META_QUEST';

  // 1. GỠ BỎ TRIỆT ĐỂ MỌI BANNER NỔI LƠ LỬNG TRÊN CÙNG LÀM VƯỚNG NÚT MENU
  const purgeOldBanners = () => {
    ['v500-quest-bridge-banner', 'v400-wifi-status-banner', 'v300-apk-top-bridge-bar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (typeof el.remove === 'function') el.remove();
        else if (el.parentNode && typeof el.parentNode.removeChild === 'function') el.parentNode.removeChild(el);
      }
    });
  };
  purgeOldBanners();
  setInterval(purgeOldBanners, 2000);

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

  // 2. CẬP NHẬT TRẠNG THÁI VÀO BẢNG CHỨC NĂNG (FUNCTION PANEL) THAY VÌ NỔI TRÊN MENU
  function updateStatusInsideFunctionPanel(ok, text) {
    // Cập nhật ô input IP trong bảng chức năng
    const pcIpInput = document.getElementById('pc-server-ip-input');
    if (pcIpInput && activeLaptopIp && !(typeof pcIpInput.matches === 'function' && pcIpInput.matches(':focus'))) {
      pcIpInput.value = activeLaptopIp;
    }

    // Cập nhật nhãn trạng thái mạch lái hoặc thông tin trong bảng chức năng
    const hostStatusEl = document.getElementById('vr-host-status-badge') || document.getElementById('esp32-car-status');
    if (hostStatusEl) {
      hostStatusEl.textContent = ok ? \`● Laptop: \${activeLaptopIp} (OK)\` : '● Đang tìm Laptop...';
      hostStatusEl.style.color = ok ? '#00ff88' : '#ff9500';
    }

    const pulseInfo = document.getElementById('esp32-car-pulse-info');
    if (pulseInfo && ok) {
      pulseInfo.textContent = \`Lái: \${(liveWheel.steerNorm * 45 + 90).toFixed(0)}° | Ga: \${(liveWheel.gasNorm * 100).toFixed(0)}% [Số \${liveWheel.gear}]\`;
      pulseInfo.style.color = '#00ff88';
    }

    if (typeof state !== 'undefined' && state) {
      state.lastActionLog = text;
    }
  }

  // 3. XỬ LÝ DỮ LIỆU TÍN HIỆU VÀ KẾT NỐI TOÀN BỘ CÁC NÚT GÁN BÀN ĐẠP (CALIBRATION)
  function ingestWheelData(w) {
    if (!w) return;
    liveWheel.steerNorm = Number(w.steerNorm ?? w.steer ?? 0) || 0;
    liveWheel.gasNorm = Number(w.gasNorm ?? 0) || 0;
    liveWheel.brakeNorm = Number(w.brakeNorm ?? w.brake ?? 0) || 0;
    liveWheel.reverseNorm = Number(w.reverseNorm ?? (w.gear === 'R' ? w.brakeNorm : 0)) || 0;
    liveWheel.driveNorm = Number(w.driveNorm ?? (liveWheel.gasNorm - liveWheel.brakeNorm)) || 0;
    liveWheel.gear = w.gear || (liveWheel.driveNorm < -0.05 ? 'R' : 'D');
    liveWheel.updatedAt = performance.now();

    // HỖ TRỢ TẤT CẢ CÁC NÚT GÁN BÀN ĐẠP TRONG BẢNG QUA WI-FI (GÁN GA, GÁN PHANH, GÁN LÙI, GÁN LÁI)
    if (typeof racingWheel !== 'undefined' && racingWheel && racingWheel.calibratingTarget) {
      const target = racingWheel.calibratingTarget;
      let detectedActivity = false;

      if (target === 'gas' && liveWheel.gasNorm > 0.25) detectedActivity = true;
      else if (target === 'brake' && liveWheel.brakeNorm > 0.25) detectedActivity = true;
      else if (target === 'reverse' && liveWheel.reverseNorm > 0.25) detectedActivity = true;
      else if (target === 'steer' && Math.abs(liveWheel.steerNorm) > 0.3) detectedActivity = true;

      if (detectedActivity) {
        racingWheel.calibratingTarget = null;
        const btn = document.getElementById('btn-calib-pedal-' + target) || document.getElementById('btn-calib-' + target);
        if (btn) {
          btn.textContent = '✅ Đã Gán Xong!';
          btn.style.background = '#00ff88';
          btn.style.color = '#000';
          setTimeout(() => {
            btn.textContent = target === 'gas' ? '🎯 Gán Ga' : (target === 'brake' ? '🎯 Gán Phanh' : (target === 'reverse' ? '🎯 Gán Lùi' : '🎯 Gán Lái'));
            btn.style.background = '#1f3354';
            btn.style.color = target === 'gas' ? '#00ff88' : (target === 'brake' ? '#ff3b30' : (target === 'reverse' ? '#ffd60a' : '#00e5ff'));
          }, 2500);
        }
        if (typeof state !== 'undefined' && state) {
          state.lastActionLog = \`🎯 Đã nhận diện & gán thành công \${target.toUpperCase()} qua Wi-Fi!\`;
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

    // Cập nhật thanh hiển thị bàn đạp trong bảng chức năng nếu có
    const barGas = document.getElementById('pedal-gas-bar');
    if (barGas) barGas.style.width = \`\${rw.gasPercent}%\`;
    const txtGas = document.getElementById('pedal-gas-txt');
    if (txtGas) txtGas.textContent = \`\${rw.gasPercent}%\`;

    const barBrake = document.getElementById('pedal-brake-bar');
    if (barBrake) barBrake.style.width = \`\${rw.brakePercent}%\`;
    const txtBrake = document.getElementById('pedal-brake-txt');
    if (txtBrake) txtBrake.textContent = \`\${rw.brakePercent}%\`;

    const barRev = document.getElementById('pedal-reverse-bar');
    if (barRev) barRev.style.width = \`\${rw.reversePercent}%\`;
    const txtRev = document.getElementById('pedal-reverse-txt');
    if (txtRev) txtRev.textContent = \`\${rw.reversePercent}%\`;

    if (typeof w.seq === 'number' && w.seq !== lastProcessedSeq) {
      lastProcessedSeq = w.seq;
      if (Array.isArray(w.buttonEvents) && w.buttonEvents.length > 0) {
        w.buttonEvents.forEach((act) => triggerWheelAction(act));
      }
    }
  }

  // 4. TỰ ĐỘNG DÒ TÌM IP LAPTOP
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
        updateStatusInsideFunctionPanel(true, \`🟢 Đã kết nối Laptop (\${ip}:8080) — Sẵn sàng lái GOG R808\`);
        sock.send(JSON.stringify({ type: 'PLAYER_HELLO', deviceType: 'META_QUEST' }));
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

      const subnets = ['192.168.1', '192.168.0', '192.168.2', '192.168.4', '10.0.0', '172.20.10'];
      for (const prefix of subnets) {
        const batch = [];
        for (let i = 1; i <= 254; i++) batch.push(\`\${prefix}.\${i}\`);
        const batchSize = 35;
        for (let i = 0; i < batch.length; i += batchSize) {
          if (isConnected) { isScanningSubnet = false; return; }
          const chunk = batch.slice(i, i + batchSize);
          const results = await Promise.all(chunk.map(ip => checkHostAlive(ip, 300)));
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

  // 5. HTTP POLLING DỰ PHÒNG 150MS
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
            updateStatusInsideFunctionPanel(true, \`🟢 Đã kết nối Laptop (\${testIp}:8080)\`);
            connectWebSocketToIp(testIp);
          }
        }
      } catch (e) {}
    }
  }, 150);

  // 6. ĐIỀU KHIỂN XE THEO BỘ QUY TẮC BÀN ĐẠP CHUẨN XÁC VÀ MƯỢT MÀ
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

  const carStateV503 = {
    ready: false,
    x: -3.2,
    z: -14.0,
    heading: 0,
    velMs: 0
  };

  setTimeout(() => {
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
      if (!carStateV503.ready) {
        carStateV503.x = vehicleRoot.position.x;
        carStateV503.z = vehicleRoot.position.z;
        carStateV503.heading = state.headingRad || vehicleRoot.rotation.y || 0;
        carStateV503.velMs = state.velocityMs || 0;
        carStateV503.ready = true;
      }

      state.engineRunning = true;
      state.steeringAngleDeg = steer * 540;
      if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
        steeringWheelPivot.rotation.z = -THREE.MathUtils.degToRad(state.steeringAngleDeg);
      }

      // THỰC THI BỘ QUY TẮC BÀN ĐẠP (RULES ENGINE XE ẢO)
      // RULE 1: Vừa Ga vừa Phanh -> Ưu tiên Phanh dừng xe!
      if (brake > 0.04 && gas > 0.04) {
        state.throttlePercent = 0;
        state.brakePercent = Math.round(brake * 100);
        carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, 0, dt * 10.0);
        if (Math.abs(carStateV503.velMs) < 0.05) carStateV503.velMs = 0;
      }
      // RULE 2: Vừa Lùi vừa Phanh -> Ưu tiên Phanh dừng xe!
      else if (brake > 0.04 && (reverse > 0.04 || isReverseGear)) {
        state.throttlePercent = 0;
        state.brakePercent = Math.round(brake * 100);
        carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, 0, dt * 10.0);
        if (Math.abs(carStateV503.velMs) < 0.05) carStateV503.velMs = 0;
      }
      // RULE 3: Vừa Ga vừa Lùi -> Ưu tiên giảm tốc về 0 trước!
      else if (gas > 0.04 && (reverse > 0.04 || isReverseGear)) {
        state.throttlePercent = 0;
        state.brakePercent = 90;
        carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, 0, dt * 8.0);
        if (Math.abs(carStateV503.velMs) < 0.05) carStateV503.velMs = 0;
      }
      // RULE 4: Đạp Ga Tiến (Gas Alone) -> TIẾN TỚI!
      else if (gas > 0.03 && !isReverseGear) {
        state.gearIndex = 3; // D (Tiến)
        state.throttlePercent = Math.round(gas * 100);
        state.brakePercent = 0;
        if (carStateV503.velMs < -0.1) {
          carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, 0, dt * 10.0);
        } else {
          const targetForwardVel = gas * 24.0;
          carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, targetForwardVel, dt * 5.0);
        }
      }
      // RULE 5: Đạp Phanh (Brake Alone) -> PHANH DỪNG XE (KHÔNG BAO GIỜ LÙI KHI PHANH!)
      else if (brake > 0.03) {
        state.throttlePercent = 0;
        state.brakePercent = Math.round(brake * 100);
        carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, 0, dt * 8.5);
        if (Math.abs(carStateV503.velMs) < 0.05) carStateV503.velMs = 0;
      }
      // RULE 6: Đạp Lùi (Reverse Alone) -> LÙI XE VỀ SAU!
      else if (reverse > 0.03 || isReverseGear) {
        const revVal = reverse > 0.03 ? reverse : Math.abs(liveWheel.driveNorm);
        state.gearIndex = 1; // R (Lùi)
        state.throttlePercent = Math.round(revVal * 100);
        state.brakePercent = 0;
        if (carStateV503.velMs > 0.1) {
          carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, 0, dt * 10.0);
        } else {
          const targetRevVel = -revVal * 11.0;
          carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, targetRevVel, dt * 5.5);
        }
      }
      // RULE 7: Nhả toàn bộ chân ga/phanh -> Giảm tốc tự nhiên theo quán tính
      else {
        state.throttlePercent = 0;
        state.brakePercent = 0;
        carStateV503.velMs = THREE.MathUtils.lerp(carStateV503.velMs, 0, dt * 3.5);
        if (Math.abs(carStateV503.velMs) < 0.03) carStateV503.velMs = 0;
      }

      if (Math.abs(steer) > 0.025 && Math.abs(carStateV503.velMs) > 0.03) {
        const sign = carStateV503.velMs < -0.03 ? -1 : 1;
        carStateV503.heading -= steer * 1.95 * sign * dt;
      }

      carStateV503.x -= Math.sin(carStateV503.heading) * carStateV503.velMs * dt;
      carStateV503.z -= Math.cos(carStateV503.heading) * carStateV503.velMs * dt;

      vehicleRoot.position.x = carStateV503.x;
      vehicleRoot.position.z = carStateV503.z;
      vehicleRoot.rotation.y = carStateV503.heading;

      state.headingRad = carStateV503.heading;
      state.velocityMs = carStateV503.velMs;
      state.speedKmh = carStateV503.velMs * 3.6;
    }
  };
})();
`;

  code = code + '\n' + v503ClientCode;
  fs.writeFileSync(file, code, 'utf8');
  console.log('✅ Đã cập nhật V503 Client vào:', file);
});

console.log('[V503] Hoàn tất triển khai!');
