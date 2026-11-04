const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('💎 [V504 COMPREHENSIVE FIX] BẮT ĐẦU CẬP NHẬT TOÀN DIỆN HỆ THỐNG');
console.log('================================================================');

function normalizeNewlines(content) {
  return content.replace(/\r\n/g, '\n');
}

function safeReplace(content, targetStr, replacementStr) {
  const normContent = normalizeNewlines(content);
  const normTarget = normalizeNewlines(targetStr);
  const normRepl = normalizeNewlines(replacementStr);
  if (!normContent.includes(normTarget)) {
    return content;
  }
  const result = normContent.replace(normTarget, normRepl);
  return content.includes('\r\n') ? result.replace(/\n/g, '\r\n') : result;
}

// ============================================================================
// 1. CẬP NHẬT MAINACTIVITY.JAVA: TRẢ VỀ DEFAULT IP 192.168.1.228
// ============================================================================
const mainActivityFile = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'luxuryvr', 'rollsroyce', 'quest3', 'MainActivity.java');
if (fs.existsSync(mainActivityFile)) {
  let content = fs.readFileSync(mainActivityFile, 'utf8');
  content = content.replace(/return "(?:192\.168\.1\.\d+|127\.0\.0\.1|localhost)";/, 'return "192.168.1.228";');
  fs.writeFileSync(mainActivityFile, content, 'utf8');
  console.log('✅ [MainActivity.java] Đã cập nhật getDefaultHostIp() -> 192.168.1.228');
}

// ============================================================================
// 2. CẬP NHẬT SERVER.JS & SERVER/SERVER.JS
// ============================================================================
const serverFiles = ['server.js', 'server/server.js'];
serverFiles.forEach(sFile => {
  if (!fs.existsSync(sFile)) return;
  let code = fs.readFileSync(sFile, 'utf8');

  // A. Nới lỏng giới hạn xung lùi trong sendUdpCarCommand về 1050µs (đáp ứng 1100µs)
  code = code.replace(
    /const t = Math\.max\(1150, Math\.min\(1850, Math\.round\(Number\(throttle\) \|\| 1500\)\)\);/,
    'const t = Math.max(1050, Math.min(1950, Math.round(Number(throttle) || 1500)));'
  );

  // B. Bổ sung service, car, cams vào /api/bridge-ping trong HTTP Server emit interceptor
  const oldBridgePing = `        res.end(JSON.stringify({\n          ok: true,\n          ips: getLanIpv4List(),\n          wheel: latestBridgeState\n        }));`;
  const newBridgePing = `        res.end(JSON.stringify({
          ok: true,
          service: 'GOG808_LAPTOP_BRIDGE',
          ips: getLanIpv4List(),
          wheel: latestBridgeState,
          car: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig) ? esp32CarConfig : { ip: '192.168.1.238', port: 4210 },
          cams: (typeof discoveredEsp32Cams !== 'undefined') ? discoveredEsp32Cams : {},
          timestamp: Date.now()
        }));`;
  code = safeReplace(code, oldBridgePing, newBridgePing);

  // C. Thay thế khối sendRateLimitedEsp32Udp bằng Bộ Trọng Tài Ưu Tiên & Ga Lùi 1100µs chuẩn V504
  const oldUdpBlock = `  function sendRateLimitedEsp32Udp(steerNorm, driveNorm, forceImmediate) {
    const now = Date.now();
    const s = Math.max(-1, Math.min(1, Number(steerNorm) || 0));
    const d = Math.max(-1, Math.min(1, Number(driveNorm) || 0));

    // [FIX ĐẢO LÁI XE NGOÀI] Đảo góc lái cho servo xe RC thật (-s thay vì +s)
    const steerDeg = Math.max(45, Math.min(135, Math.round(90 - s * 45)));
    const escUs = Math.max(1000, Math.min(2000, Math.round(1500 + d * 220)));

    const changed = (steerDeg !== lastSteerDegSent) || (escUs !== lastEscUsSent);
    if (!forceImmediate && !changed && (now - lastUdpSendMs < 200)) return;
    if (!forceImmediate && (now - lastUdpSendMs < 30)) return; // Giới hạn tối đa ~33Hz

    lastUdpSendMs = now;
    lastSteerDegSent = steerDeg;
    lastEscUsSent = escUs;

    const pkt = Buffer.alloc(4);
    pkt.writeInt16LE(steerDeg, 0);
    pkt.writeInt16LE(escUs, 2);
    const targetHost = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.ip) ? esp32CarConfig.ip : ESP32_HOST;
    const targetPort = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.port) ? esp32CarConfig.port : ESP32_PORT;
    udpOutSocket.send(pkt, 0, 4, targetPort, targetHost);
  }`;

  const newUdpBlock = `  // ============================================================================
  // [V504 RESTORED + 1100µs REVERSE] BỘ TRỌNG TÀI ƯU TIÊN VÔ LĂNG & UDP 4210 CHUẨN
  // ============================================================================
  const rcArbitration = {
    lastPhysicalWheelActiveAt: 0,
    lastSentSteerDeg: 90,
    lastSentEscUs: 1500,
    idleNeutralCount: 0,
    lastUdpSendMs: 0,
    WHEEL_PRIORITY_WINDOW_MS: 350
  };

  function computeAsymmetricEscPulseUs(driveNorm, explicitPulseUs, gear = 'D') {
    const rawExplicit = Number(explicitPulseUs);
    if (Number.isFinite(rawExplicit) && rawExplicit >= 1000 && rawExplicit <= 2000 && Math.abs(rawExplicit - 1500) > 5) {
      if (rawExplicit < 1445 && rawExplicit >= 1250 && driveNorm < -0.05) {
        const revMag = Math.min(1, Math.max(0, Math.abs(driveNorm)));
        return Math.round(1445 - Math.pow(revMag, 0.85) * 345);
      }
      return Math.round(rawExplicit);
    }

    const d = Math.max(-1, Math.min(1, Number(driveNorm) || 0));
    if (Math.abs(d) <= 0.025) return 1500;

    if (d > 0.025 && gear !== 'R') {
      return Math.round(1535 + Math.pow(d, 0.9) * 315);
    } else {
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

    if (source === 'WHEEL_BRIDGE' || source === 'WINMM_USB') {
      if (isInputActive) {
        rcArbitration.lastPhysicalWheelActiveAt = now;
        rcArbitration.idleNeutralCount = 0;
      } else {
        rcArbitration.idleNeutralCount++;
        if (rcArbitration.idleNeutralCount > 2) return;
      }
    }

    if (source === 'QUEST_CAR_CONTROL' && !isInputActive) {
      if (now - rcArbitration.lastPhysicalWheelActiveAt < rcArbitration.WHEEL_PRIORITY_WINDOW_MS) {
        return;
      }
    }

    const steerDeg = Math.max(45, Math.min(135, Math.round(90 - sNorm * 45)));
    const escPulseUs = computeAsymmetricEscPulseUs(dNorm, explicitEscPulseUs, gear);

    const changed = (steerDeg !== rcArbitration.lastSentSteerDeg) || (escPulseUs !== rcArbitration.lastSentEscUs);
    if (!changed && (now - rcArbitration.lastUdpSendMs < 200)) return;
    if (now - rcArbitration.lastUdpSendMs < 25) return;

    rcArbitration.lastUdpSendMs = now;
    rcArbitration.lastSentSteerDeg = steerDeg;
    rcArbitration.lastSentEscUs = escPulseUs;

    const pkt = Buffer.alloc(4);
    pkt.writeInt16LE(steerDeg, 0);
    pkt.writeInt16LE(escPulseUs, 2);
    const targetHost = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.ip) ? esp32CarConfig.ip : ESP32_HOST;
    const targetPort = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.port) ? esp32CarConfig.port : ESP32_PORT;
    udpOutSocket.send(pkt, 0, 4, targetPort, targetHost);
  }`;

  code = safeReplace(code, oldUdpBlock, newUdpBlock);

  // D. Cập nhật các nơi gọi sendRateLimitedEsp32Udp để truyền source rõ ràng
  code = code.replace(
    /sendRateLimitedEsp32Udp\(steerNorm, driveNorm, buttonEvents\.length > 0\);/g,
    "sendRateLimitedEsp32Udp(steerNorm, driveNorm, null, gear, 'WHEEL_BRIDGE');"
  );
  code = code.replace(
    /sendRateLimitedEsp32Udp\(sNorm, tNorm, false\);/g,
    "sendRateLimitedEsp32Udp(sNorm, tNorm, null, 'D', 'QUEST_CAR_CONTROL');"
  );
  code = code.replace(
    /sendRateLimitedEsp32Udp\(data\.steerNorm, data\.driveNorm, false\);/g,
    "sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, null, data.gear, 'WINMM_USB');"
  );

  fs.writeFileSync(sFile, code, 'utf8');
  console.log(`✅ [${sFile}] Đã cập nhật Bộ Trọng Tài Ưu Tiên, Ga Lùi 1100µs & Bridge Ping`);
});

// ============================================================================
// 3. KHỐI V504 GOLD MASTER DÀNH CHO CLIENT (AUTO SUBNET DISCOVERY & DRIVING)
// ============================================================================
const v504FullBlock = `// ============================================================================
// [PATCH V504 GOLD MASTER - CLIENT] BỘ DÒ TÌM IP TỰ ĐỘNG ĐA MẠNG WI-FI & HOTSPOT
// ĐỒNG BỘ TOÀN DIỆN VÔ LĂNG GOG R808, BÀN ĐẠP LÙI 1100µs, AUTO-CREEP & CÂN BẰNG TÂM
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

  try {
    const savedRev = Number(storage.getItem('rc_max_reverse_pulse'));
    if (!savedRev || savedRev >= 1250) {
      storage.setItem('rc_max_reverse_pulse', '1100');
    }
  } catch (e) {}

  const bakedIps = ['192.168.1.228', '192.168.1.21', '192.168.1.32', '192.168.1.60'];
  let activeLaptopIp = storage.getItem('pc_server_ip') || storage.getItem('V500_LAPTOP_IP') || bakedIps[0];
  if (activeLaptopIp === 'localhost' || activeLaptopIp === '127.0.0.1') activeLaptopIp = bakedIps[0];

  let wsConn = null;
  let isConnected = false;
  let isScanningSubnet = false;
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

  // 1. THANH TRẠNG THÁI HIỂN THỊ TRỰC QUAN TRÊN MÀN HÌNH KÍNH & NÚT ĐỔI IP
  function getOrCreateV500Banner() {
    let el = document.getElementById('v500-quest-bridge-banner');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'v500-quest-bridge-banner';
    el.style.cssText =
      'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:10px;padding:8px 18px;border-radius:999px;background:rgba(15,23,42,0.95);border:2px solid #38bdf8;color:#38bdf8;font-family:Segoe UI,sans-serif;font-size:12.5px;font-weight:700;box-shadow:0 6px 24px rgba(0,0,0,0.75);backdrop-filter:blur(6px);user-select:none;';

    const label = document.createElement('span');
    label.id = 'v500-quest-bridge-label';
    label.textContent = \`📡 Đang kết nối Laptop (\${activeLaptopIp || 'Dò tự động'} : 8080)...\`;

    const btnIp = document.createElement('button');
    btnIp.textContent = 'Đổi IP Laptop';
    btnIp.style.cssText =
      'background:#0284c7;color:#fff;border:none;border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;cursor:pointer;';
    btnIp.onclick = () => {
      const hint = activeLaptopIp || bakedIps.join(', ');
      const inp = prompt('Nhập IP Wi-Fi của Laptop đang chạy node server.js:', hint);
      if (inp && inp.trim()) {
        const cleanIp = inp.trim().replace(/^https?:\\/\\//, '').replace(/:\\d+$/, '');
        activeLaptopIp = cleanIp;
        storage.setItem('V500_LAPTOP_IP', cleanIp);
        storage.setItem('pc_server_ip', cleanIp);
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

  // 2. ĐỒNG BỘ TÍN HIỆU VÔ LĂNG VÀO TẤT CẢ CÁC BIẾN & UI
  function ingestWheelData(w) {
    if (!w) return;
    const nowPerf = performance.now();
    const nowDate = Date.now();

    liveWheel.connected = true;
    liveWheel.steerNorm = Number(w.steerNorm ?? w.steeringNorm ?? w.steer ?? 0) || 0;
    liveWheel.gasNorm = Number(w.gasNorm ?? (w.gasPercent ? w.gasPercent / 100 : 0)) || 0;
    liveWheel.brakeNorm = Number(w.brakeNorm ?? (w.brakePercent ? w.brakePercent / 100 : 0)) || 0;
    liveWheel.driveNorm = w.driveNorm !== undefined
      ? Number(w.driveNorm) || 0
      : (liveWheel.gasNorm - liveWheel.brakeNorm);
    liveWheel.gear = w.gear || (liveWheel.driveNorm < -0.025 ? 'R' : 'D');
    liveWheel.escPulseUs = Number(w.escPulseUs) || 1500;
    liveWheel.updatedAt = nowPerf;

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

    if (typeof racingWheel !== 'undefined' && racingWheel) {
      racingWheel.connected = true;
      racingWheel.gasPercent = Math.round(liveWheel.gasNorm * 100);
      racingWheel.brakePercent = Math.round(liveWheel.brakeNorm * 100);
      racingWheel.reversePercent = liveWheel.gear === 'R' ? Math.round(liveWheel.brakeNorm * 100) : 0;
      racingWheel.steerAngleDeg = Math.round(liveWheel.steerNorm * 540);
      racingWheel.gear = liveWheel.gear;
      racingWheel.lastInputTime = nowPerf;
    }

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

    if (typeof syncWheelToFunctionPanel === 'function') {
      try {
        syncWheelToFunctionPanel({
          steerNorm: liveWheel.steerNorm,
          steerAngleDeg: Math.round(liveWheel.steerNorm * 540),
          gasNorm: liveWheel.gasNorm,
          gasPercent: Math.round(liveWheel.gasNorm * 100),
          brakeNorm: liveWheel.brakeNorm,
          brakePercent: Math.round(liveWheel.brakeNorm * 100),
          reverseNorm: liveWheel.gear === 'R' ? liveWheel.brakeNorm : 0,
          reversePercent: liveWheel.gear === 'R' ? Math.round(liveWheel.brakeNorm * 100) : 0,
          driveNorm: liveWheel.driveNorm,
          gear: liveWheel.gear
        });
      } catch (e) {}
    }

    const isActivelyOperated = Math.abs(liveWheel.steerNorm) > 0.02 || liveWheel.gasNorm > 0.02 || liveWheel.brakeNorm > 0.02;
    if (isActivelyOperated) {
      ensureSeatedInDriverChair();
    }

    if (typeof w.seq === 'number' && w.seq !== lastProcessedSeq) {
      lastProcessedSeq = w.seq;
      if (Array.isArray(w.buttonEvents)) {
        w.buttonEvents.forEach((act) => triggerWheelAction(act));
      }
    }
  }

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
          } else if (msg && (msg.type === 'CAM_IP_UPDATED' || msg.type === 'ESP32_CAM_UPDATE' || msg.type === 'SERVER_LAN_INFO')) {
            if (msg.cams && typeof window.applyEsp32CameraIps === 'function') {
              window.applyEsp32CameraIps(msg.cams);
            }
          }
        } catch (e) {}
      });
    }
  }

  // 3. TỰ ĐỘNG DÒ TÌM IP LAPTOP QUA WI-FI (HỖ TRỢ MỌI DẢI MẠNG & HOTSPOT)
  function getCandidateIps() {
    const list = [];
    bakedIps.forEach((ip) => { if (ip && !list.includes(ip) && ip !== 'localhost' && ip !== '127.0.0.1') list.push(ip); });
    const pcIp = storage.getItem('pc_server_ip');
    if (pcIp && !list.includes(pcIp) && pcIp !== 'localhost' && pcIp !== '127.0.0.1') list.push(pcIp);
    if (activeLaptopIp && !list.includes(activeLaptopIp) && activeLaptopIp !== 'localhost' && activeLaptopIp !== '127.0.0.1') list.push(activeLaptopIp);
    const saved = storage.getItem('V500_LAPTOP_IP');
    if (saved && !list.includes(saved) && saved !== 'localhost' && saved !== '127.0.0.1') list.push(saved);

    const gateways = ['192.168.1.1', '192.168.43.1', '192.168.137.1', '172.20.10.1', '192.168.0.1', '10.0.0.1', '192.168.2.1'];
    gateways.forEach((ip) => { if (!list.includes(ip)) list.push(ip); });

    if (loc && loc.hostname && loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1' && !list.includes(loc.hostname)) {
      list.push(loc.hostname);
    }
    return list;
  }

  async function checkHostAlive(ip, timeoutMs = 300) {
    if (!ip || ip === 'localhost' || ip === '127.0.0.1') return null;
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(\`http://\${ip}:8080/api/bridge-ping\`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.ok || data.service === 'GOG808_LAPTOP_BRIDGE')) {
          if (data.wheel) ingestWheelData(data.wheel);
          if (data.car && data.car.ip) {
            state.rcCarIp = data.car.ip;
            storage.setItem('rc_car_ip', data.car.ip);
          }
          if (data.cams && typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps(data.cams);
          }
          return { ip, data };
        }
      }
    } catch (e) {
      if (timer) clearTimeout(timer);
    }
    return null;
  }

  function detectSubnetViaWebRtc() {
    return new Promise((resolve) => {
      try {
        const RTCPC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
        if (!RTCPC) return resolve(null);
        const pc = new RTCPC({ iceServers: [] });
        let done = false;
        const finish = (val) => {
          if (!done) {
            done = true;
            try { pc.close(); } catch (e) {}
            resolve(val);
          }
        };
        setTimeout(() => finish(null), 500);
        pc.createDataChannel('');
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => finish(null));
        pc.onicecandidate = (e) => {
          if (!e || !e.candidate || !e.candidate.candidate) return;
          const cand = e.candidate.candidate;
          const m = cand.match(/\\b(192\\.168\\.\\d+|10\\.\\d+\\.\\d+|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d+)\\.(\\d+)\\b/);
          if (m && m[1]) finish(m[1]);
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function performDeepNetworkDiscovery() {
    if (isScanningSubnet || isConnected) return;
    isScanningSubnet = true;

    try {
      const candidates = getCandidateIps();
      const results = await Promise.all(candidates.map(ip => checkHostAlive(ip, 350)));
      const hit = results.find(Boolean);
      if (hit) {
        onServerFound(hit.ip, hit.data);
        isScanningSubnet = false;
        return;
      }

      updateV500Banner(false, '🔍 Đang tự động quét Wi-Fi tìm Laptop & Xe RC...');
      const detectedSubnet = await detectSubnetViaWebRtc();
      const subnets = [];
      if (detectedSubnet) subnets.push(detectedSubnet);

      const commonSubnets = ['192.168.1', '192.168.43', '192.168.137', '192.168.0', '172.20.10', '10.0.0', '192.168.2'];
      commonSubnets.forEach((s) => { if (!subnets.includes(s)) subnets.push(s); });

      for (const prefix of subnets) {
        if (isConnected) { isScanningSubnet = false; return; }
        const batch = [];
        for (let i = 1; i <= 254; i++) batch.push(\`\${prefix}.\${i}\`);
        const batchSize = 45;
        for (let i = 0; i < batch.length; i += batchSize) {
          if (isConnected) { isScanningSubnet = false; return; }
          const chunk = batch.slice(i, i + batchSize);
          const chunkResults = await Promise.all(chunk.map(ip => checkHostAlive(ip, 280)));
          const found = chunkResults.find(Boolean);
          if (found) {
            onServerFound(found.ip, found.data);
            isScanningSubnet = false;
            return;
          }
        }
      }
    } catch (e) {}
    isScanningSubnet = false;
  }

  function onServerFound(foundIp, data) {
    activeLaptopIp = foundIp;
    storage.setItem('V500_LAPTOP_IP', foundIp);
    storage.setItem('pc_server_ip', foundIp);
    window.__ACTIVE_DISCOVERED_IP__ = foundIp;
    const carLabel = (data && data.car && data.car.ip) ? data.car.ip : (state.rcCarIp || '4210');
    updateV500Banner(true, \`🟢 ĐÃ KẾT NỐI LAPTOP (\${foundIp}:8080) | XE: \${carLabel}\`);
    connectWebSocketToIp(foundIp);

    if (data && data.cams && typeof window.applyEsp32CameraIps === 'function') {
      window.applyEsp32CameraIps(data.cams);
    }

    if (typeof mpSocket === 'undefined' || !mpSocket || mpSocket.readyState !== WebSocket.OPEN) {
      if (typeof initMultiplayerClient === 'function') {
        try { initMultiplayerClient(); } catch (e) {}
      }
    }
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
        storage.setItem('V500_LAPTOP_IP', ip);
        storage.setItem('pc_server_ip', ip);
        window.__ACTIVE_DISCOVERED_IP__ = ip;
        const carLabel = state.rcCarIp || '4210';
        updateV500Banner(
          true,
          \`🟢 ĐÃ KẾT NỐI LAPTOP (\${ip}:8080) | XE: \${carLabel}\`
        );
        try { sock.send(JSON.stringify({ type: 'PLAYER_HELLO', deviceType: 'META_QUEST' })); } catch (e) {}
      };

      sock.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT')) {
            ingestWheelData(msg.payload || msg);
          } else if (msg && (msg.type === 'CAR_IP_UPDATED' || msg.type === 'SERVER_LAN_INFO')) {
            if (msg.car && msg.car.ip) {
              state.rcCarIp = msg.car.ip;
              storage.setItem('rc_car_ip', msg.car.ip);
            }
            if (msg.cams && typeof window.applyEsp32CameraIps === 'function') {
              window.applyEsp32CameraIps(msg.cams);
            }
          } else if (msg && (msg.type === 'CAM_IP_UPDATED' || msg.type === 'ESP32_CAM_UPDATE')) {
            if (typeof window.applyEsp32CameraIps === 'function') {
              window.applyEsp32CameraIps(msg.cams || msg);
            }
          }
        } catch (e) {}
      };

      sock.onclose = () => {
        isConnected = false;
        setTimeout(() => { if (!isConnected) performDeepNetworkDiscovery(); }, 1500);
      };
      sock.onerror = () => { try { sock.close(); } catch (e) {} };
    } catch (e) {}
  }

  // 4. HTTP POLLING DỰ PHÒNG 180MS (KHI WEBSOCKET ĐANG NỐI LẠI)
  let candidatePollIdx = 0;
  setInterval(async () => {
    hookMainMpSocket();
    const ips = getCandidateIps();
    if (ips.length === 0) return;

    const testIp = isConnected && activeLaptopIp ? activeLaptopIp : ips[candidatePollIdx % ips.length];
    if (!isConnected) {
      candidatePollIdx++;
      connectWebSocketToIp(testIp);
    }

    if (!wsConn || wsConn.readyState !== WebSocket.OPEN) {
      try {
        const hit = await checkHostAlive(testIp, 250);
        if (hit) {
          isConnected = true;
          onServerFound(hit.ip, hit.data);
        }
      } catch (e) {}
    }
  }, 180);

  // 5. ĐIỀU KHIỂN BUỒNG LÁI & CÂN BẰNG TÂM GÓC NHÌN
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
      if (typeof resetAndCenterViewpoint === 'function') resetAndCenterViewpoint('DRIVING', state.seatIndex);
    }
  }

  // 6. VÒNG LẶP VẬT LÝ XE V504 (AUTO-CREEP, LÙI SÂU 1100µs, CHỐNG KÉO LÙI XE)
  const carStateV504 = {
    ready: false,
    x: -3.2,
    z: -14.0,
    heading: 0,
    velMs: 0,
    lastValidPos: new THREE.Vector3(-3.2, 0, -14.0)
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
      prevBeforeRender.call(this, rendererInst, sceneInst, cameraInst);
    }

    const now = performance.now();
    const dt = Math.min(Math.max((now - lastFrameMs) / 1000, 0.001), 0.05);
    lastFrameMs = now;

    if (typeof state === 'undefined' || !state || typeof vehicleRoot === 'undefined' || !vehicleRoot) return;

    const wheelFresh = (now - liveWheel.updatedAt) <= 850;
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
    } else if (wheelFresh) {
      steer = liveWheel.steerNorm;
      gas = liveWheel.gasNorm;
      brake = liveWheel.brakeNorm;
      hasControlSignal = Math.abs(carStateV504.velMs) > 0.02;
    }

    if (wheelMoved) {
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

      const frontYaw = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 34);
      if (typeof wheelAssemblies !== 'undefined') {
        for (const w of wheelAssemblies) {
          if (w.isFrontWheel && w.steerMount) w.steerMount.rotation.y = frontYaw;
        }
      }

      if (gas > 0.025) {
        state.gearIndex = 3;
        state.gear = 'D';
        state.throttlePercent = Math.round(gas * 100);
        state.brakePercent = 0;
        state.reversePercent = 0;
        carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, gas * 24.0, dt * 4.5);
      } else if (brake > 0.025) {
        if (carStateV504.velMs > 1.0) {
          state.brakePercent = Math.round(brake * 100);
          state.throttlePercent = 0;
          carStateV504.velMs = Math.max(0, carStateV504.velMs - 26.0 * brake * dt);
        } else {
          state.gearIndex = 1;
          state.gear = 'R';
          state.reversePercent = Math.round(brake * 100);
          state.throttlePercent = Math.round(brake * 100);
          state.brakePercent = 0;
          carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, -brake * 14.0, dt * 6.0);
        }
      } else if (Math.abs(steer) > 0.04 && Math.abs(carStateV504.velMs) < 1.2) {
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

      const step = carStateV504.velMs * dt;
      carStateV504.x -= Math.sin(carStateV504.heading) * step;
      carStateV504.z -= Math.cos(carStateV504.heading) * step;

      if (typeof state.wheelRotationRad === 'number') {
        state.wheelRotationRad += (step / 0.38);
      }
      if (typeof wheelAssemblies !== 'undefined' && Array.isArray(wheelAssemblies)) {
        for (const w of wheelAssemblies) {
          if (w.spinHub) w.spinHub.rotation.x = -state.wheelRotationRad;
        }
      }

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

// ============================================================================
// 4. ÁP DỤNG LÊN 4 FILE CLIENT: APP.JS, WWW/APP.JS, SERVER/PUBLIC/APP.JS, ANDROID/.../APP.JS
// ============================================================================
const clientFiles = [
  'app.js',
  'www/app.js',
  'server/public/app.js',
  'android/app/src/main/assets/public/app.js'
];

clientFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // A. Cập nhật IP mặc định từ 192.168.1.60 thành 192.168.1.228
  content = content.replace(/['"]192\.168\.1\.60['"]/g, "'192.168.1.228'");
  content = content.replace(/['"]192\.168\.1\.32['"]/g, "'192.168.1.228'");

  // B. Khắc phục lỗi kết nối Camera trên Capacitor WebView (tránh wss://localhost)
  // Trong connectEsp32Windshield:
  const oldWsTargetWindshield = `      let targetWs = rawUrl;\n      if (window.location.protocol === 'https:' && rawUrl.startsWith('ws://')) {\n        targetWs = \`wss://\${window.location.host}/api/esp32-front-ws\`;\n      }`;
  const newWsTargetWindshield = `      let targetWs = rawUrl;
      const isApkEnv = (typeof window !== 'undefined' && (window.QuestVRBridge || window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || window.location.hostname === 'localhost'));
      if (!isApkEnv && window.location.protocol === 'https:' && rawUrl.startsWith('ws://')) {
        const pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.228';
        const host = (window.location.hostname && window.location.hostname !== 'localhost') ? window.location.host : \`\${pcIp}:8443\`;
        targetWs = \`wss://\${host}/esp32-front-ws\`;
      }`;
  content = safeReplace(content, oldWsTargetWindshield, newWsTargetWindshield);

  // Trong esp32Socket.onerror (Windshield):
  const oldWsErrorWindshield = `      esp32Socket.onerror = () => {
        state.lastActionLog = '⚠️ Lỗi kết nối direct ESP32 Cam, chuyển sang Proxy Server...';
        if (!targetWs.includes('esp32-front-ws')) {
          const isHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
          const pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || window.__ACTIVE_DISCOVERED_IP__ || ((typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? window.location.hostname : '127.0.0.1');
          const proxyProto = isHttps ? 'wss:' : 'ws:';
          const proxyPort = isHttps ? ((window.location && window.location.port) || '8443') : '8080';
          const host = (window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? \`\${window.location.hostname}:\${proxyPort}\` : \`\${pcIp}:\${proxyPort}\`;
          const proxyWs = \`\${proxyProto}//\${host}/esp32-front-ws\`;
          console.log('🔄 [ESP32-FRONT] Chuyển hướng kết nối qua Proxy Server:', proxyWs);
          setTimeout(() => {
            if (!state.esp32Connected) connectEsp32Windshield(proxyWs);
          }, 1000);
        }
      };`;

  const newWsErrorWindshield = `      esp32Socket.onerror = () => {
        state.lastActionLog = '⚠️ Lỗi kết nối direct ESP32 Cam, chuyển sang Proxy Server...';
        const isApkEnv = (typeof window !== 'undefined' && (window.QuestVRBridge || window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || window.location.hostname === 'localhost'));
        const pcIp = (typeof localStorage !== 'undefined' && (localStorage.getItem('pc_server_ip') || localStorage.getItem('V500_LAPTOP_IP'))) || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.228';
        const isHttps = !isApkEnv && (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:');
        const proxyProto = isHttps ? 'wss:' : 'ws:';
        const proxyPort = isHttps ? ((window.location && window.location.port) || '8443') : '8080';
        const host = (!isApkEnv && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? \`\${window.location.hostname}:\${proxyPort}\` : \`\${pcIp}:\${proxyPort}\`;
        const proxyWs = \`\${proxyProto}//\${host}/esp32-front-ws\`;
        if (targetWs !== proxyWs) {
          console.log('🔄 [ESP32-FRONT] Chuyển hướng kết nối qua Proxy Server:', proxyWs);
          setTimeout(() => {
            if (!state.esp32Connected) connectEsp32Windshield(proxyWs);
          }, 800);
        }
      };`;
  content = safeReplace(content, oldWsErrorWindshield, newWsErrorWindshield);

  // Trong connectRearEsp32Camera:
  const oldWsTargetRear = `      let targetWs = rawUrl;\n      if (window.location.protocol === 'https:' && rawUrl.startsWith('ws://')) {\n        targetWs = \`wss://\${window.location.host}/api/esp32-rear-ws\`;\n      }`;
  const newWsTargetRear = `      let targetWs = rawUrl;
      const isApkEnv = (typeof window !== 'undefined' && (window.QuestVRBridge || window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || window.location.hostname === 'localhost'));
      if (!isApkEnv && window.location.protocol === 'https:' && rawUrl.startsWith('ws://')) {
        const pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.228';
        const host = (window.location.hostname && window.location.hostname !== 'localhost') ? window.location.host : \`\${pcIp}:8443\`;
        targetWs = \`wss://\${host}/esp32-rear-ws\`;
      }`;
  content = safeReplace(content, oldWsTargetRear, newWsTargetRear);

  // Trong esp32RearSocket.onerror (Rear):
  const oldWsErrorRear = `      esp32RearSocket.onerror = () => {
        state.lastActionLog = '⚠️ Lỗi kết nối direct ESP32 Cam Lùi (' + rawUrl + '), chuyển sang Proxy Server...';
        if (!targetWs.includes('esp32-rear-ws')) {
          const isHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
          const pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || window.__ACTIVE_DISCOVERED_IP__ || ((typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? window.location.hostname : '127.0.0.1');
          const proxyProto = isHttps ? 'wss:' : 'ws:';
          const proxyPort = isHttps ? ((window.location && window.location.port) || '8443') : '8080';
          const host = (window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? \`\${window.location.hostname}:\${proxyPort}\` : \`\${pcIp}:\${proxyPort}\`;
          const proxyWs = \`\${proxyProto}//\${host}/esp32-rear-ws\`;
          console.log('🔄 [ESP32-REAR] Chuyển hướng kết nối qua Proxy Server:', proxyWs);
          setTimeout(() => {
            if (!state.esp32RearConnected && !manualRearDisconnect) connectRearEsp32Camera(proxyWs);
          }, 1000);
        }
      };`;

  const newWsErrorRear = `      esp32RearSocket.onerror = () => {
        state.lastActionLog = '⚠️ Lỗi kết nối direct ESP32 Cam Lùi (' + rawUrl + '), chuyển sang Proxy Server...';
        const isApkEnv = (typeof window !== 'undefined' && (window.QuestVRBridge || window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || window.location.hostname === 'localhost'));
        const pcIp = (typeof localStorage !== 'undefined' && (localStorage.getItem('pc_server_ip') || localStorage.getItem('V500_LAPTOP_IP'))) || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.228';
        const isHttps = !isApkEnv && (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:');
        const proxyProto = isHttps ? 'wss:' : 'ws:';
        const proxyPort = isHttps ? ((window.location && window.location.port) || '8443') : '8080';
        const host = (!isApkEnv && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? \`\${window.location.hostname}:\${proxyPort}\` : \`\${pcIp}:\${proxyPort}\`;
        const proxyWs = \`\${proxyProto}//\${host}/esp32-rear-ws\`;
        if (targetWs !== proxyWs) {
          console.log('🔄 [ESP32-REAR] Chuyển hướng kết nối qua Proxy Server:', proxyWs);
          setTimeout(() => {
            if (!state.esp32RearConnected && !manualRearDisconnect) connectRearEsp32Camera(proxyWs);
          }, 800);
        }
      };`;
  content = safeReplace(content, oldWsErrorRear, newWsErrorRear);

  // C. Xử lý khối setupV504GoldMasterQuestDriving
  const marker = '// ============================================================================\n// [PATCH V504 GOLD MASTER - CLIENT]';
  const altMarker = '(function setupV504GoldMasterQuestDriving()';

  if (content.includes(marker)) {
    const idx = content.indexOf(marker);
    content = content.substring(0, idx) + v504FullBlock;
  } else if (content.includes(altMarker)) {
    const idx = content.indexOf(altMarker);
    content = content.substring(0, idx) + v504FullBlock;
  } else {
    content = content + '\n\n' + v504FullBlock;
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log(`✅ [${file}] Đã tích hợp V504 Gold Master, sửa URL camera WebSocket APK & cập nhật IP`);
});

console.log('🎉 Hoàn tất cập nhật toàn bộ files!');
