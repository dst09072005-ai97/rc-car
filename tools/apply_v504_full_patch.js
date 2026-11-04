const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('💎 [V504 FULL INTEGRATION] Triển khai Bộ Dò Tìm IP Đa Mạng & Lái Xe Chuẩn...');
console.log('================================================================');

const clientFiles = [
  'app.js',
  'www/app.js',
  'server/public/app.js',
  'android/app/src/main/assets/public/app.js'
];

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

  // Tự động nâng giới hạn xung lùi trong localStorage về chuẩn 1100µs
  try {
    const savedRev = Number(storage.getItem('rc_max_reverse_pulse'));
    if (!savedRev || savedRev >= 1250) {
      storage.setItem('rc_max_reverse_pulse', '1100');
    }
  } catch (e) {}

  const bakedIps = ['192.168.1.228', '192.168.1.21', '192.168.1.60', '192.168.1.32'];
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

  // --------------------------------------------------------------------------
  // 1. THANH TRẠNG THÁI HIỂN THỊ TRỰC QUAN TRÊN MÀN HÌNH KÍNH & NÚT ĐỔI IP
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // 2. ĐỒNG BỘ TÍN HIỆU VÔ LĂNG VÀO TẤT CẢ CÁC BIẾN & UI
  // --------------------------------------------------------------------------
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

    // 2. Đồng bộ vào racingWheel nội bộ của app
    if (typeof racingWheel !== 'undefined' && racingWheel) {
      racingWheel.connected = true;
      racingWheel.gasPercent = Math.round(liveWheel.gasNorm * 100);
      racingWheel.brakePercent = Math.round(liveWheel.brakeNorm * 100);
      racingWheel.reversePercent = liveWheel.gear === 'R' ? Math.round(liveWheel.brakeNorm * 100) : 0;
      racingWheel.steerAngleDeg = Math.round(liveWheel.steerNorm * 540);
      racingWheel.gear = liveWheel.gear;
      racingWheel.lastInputTime = nowPerf;
    }

    // 3. Đồng bộ vào runtime.remoteBridge
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

    // 4. Đồng bộ thanh đo Function Panel UI & 3 Bàn đạp 3D
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

    // 5. Tự động lên xe DRIVING và cân bằng tâm khi có thao tác vô lăng/bàn đạp
    const isActivelyOperated = Math.abs(liveWheel.steerNorm) > 0.02 || liveWheel.gasNorm > 0.02 || liveWheel.brakeNorm > 0.02;
    if (isActivelyOperated) {
      ensureSeatedInDriverChair();
    }

    // 6. Thực thi sự kiện nút bấm trên vô lăng (Xi-nhan, Còi, Đổi ghế, Lên/Xuống xe)
    if (typeof w.seq === 'number' && w.seq !== lastProcessedSeq) {
      lastProcessedSeq = w.seq;
      if (Array.isArray(w.buttonEvents)) {
        w.buttonEvents.forEach((act) => triggerWheelAction(act));
      }
    }
  }

  // Bắt sự kiện từ mpSocket chính của app
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
  // 3. TỰ ĐỘNG DÒ TÌM IP LAPTOP QUA WI-FI (HỖ TRỢ MỌI DẢI MẠNG & HOTSPOT)
  // --------------------------------------------------------------------------
  function getCandidateIps() {
    const list = [];
    const pcIp = storage.getItem('pc_server_ip');
    if (pcIp && !list.includes(pcIp) && pcIp !== 'localhost' && pcIp !== '127.0.0.1') list.push(pcIp);
    if (activeLaptopIp && !list.includes(activeLaptopIp) && activeLaptopIp !== 'localhost' && activeLaptopIp !== '127.0.0.1') list.push(activeLaptopIp);
    const saved = storage.getItem('V500_LAPTOP_IP');
    if (saved && !list.includes(saved) && saved !== 'localhost' && saved !== '127.0.0.1') list.push(saved);

    bakedIps.forEach((ip) => { if (ip && !list.includes(ip) && ip !== 'localhost' && ip !== '127.0.0.1') list.push(ip); });

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
      // Bước A: Thử song song toàn bộ các IP ưu tiên (30-50ms)
      const candidates = getCandidateIps();
      const results = await Promise.all(candidates.map(ip => checkHostAlive(ip, 350)));
      const hit = results.find(Boolean);
      if (hit) {
        onServerFound(hit.ip, hit.data);
        isScanningSubnet = false;
        return;
      }

      // Bước B: Dò tìm dải Subnet thực và quét nhanh toàn mạng LAN
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
    const carLabel = (data && data.car && data.car.ip) ? data.car.ip : (state.rcCarIp || '4210');
    updateV500Banner(true, \`🟢 ĐÃ KẾT NỐI LAPTOP (\${foundIp}:8080) | XE: \${carLabel}\`);
    connectWebSocketToIp(foundIp);

    // Kích hoạt kết nối của mpSocket chính nếu chưa nối
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

  // --------------------------------------------------------------------------
  // 4. HTTP POLLING DỰ PHÒNG 180MS (KHI WEBSOCKET ĐANG NỐI LẠI)
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // 5. ĐIỀU KHIỂN BUỒNG LÁI & CÂN BẰNG TÂM GÓC NHÌN
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // 6. VÒNG LẶP VẬT LÝ XE V504 (AUTO-CREEP, LÙI SÂU 1100µs, CHỐNG KÉO LÙI XE)
  // --------------------------------------------------------------------------
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

      // Khóa vị trí khi dừng hẳn: Chống các script cũ giật xe về điểm spawn
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

      // Đồng bộ góc bánh trước xe Rolls-Royce
      const frontYaw = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 34);
      if (typeof wheelAssemblies !== 'undefined') {
        for (const w of wheelAssemblies) {
          if (w.isFrontWheel && w.steerMount) w.steerMount.rotation.y = frontYaw;
        }
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
          // Phanh giảm tốc
          state.brakePercent = Math.round(brake * 100);
          state.throttlePercent = 0;
          carStateV504.velMs = Math.max(0, carStateV504.velMs - 26.0 * brake * dt);
        } else {
          // Cài số R và lùi sâu mạnh mẽ tương ứng dải xung 1100µs
          state.gearIndex = 1; // R (Lùi)
          state.gear = 'R';
          state.reversePercent = Math.round(brake * 100);
          state.throttlePercent = Math.round(brake * 100);
          state.brakePercent = 0;
          carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, -brake * 14.0, dt * 6.0);
        }
      } else if (Math.abs(steer) > 0.04 && Math.abs(carStateV504.velMs) < 1.2) {
        // [V504 AUTO-CREEP] Xoay vô lăng trên bàn (chưa đạp ga) xe tự lăn bánh nhẹ 3.0 m/s để rẽ ngay
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

clientFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Tìm khối setupV504GoldMasterQuestDriving cũ và thay thế hoàn toàn
  const marker = '// ============================================================================\n// [PATCH V504 GOLD MASTER - CLIENT]';
  const altMarker = '(function setupV504GoldMasterQuestDriving()';

  if (content.includes(marker)) {
    const idx = content.indexOf(marker);
    content = content.substring(0, idx) + v504FullBlock;
    fs.writeFileSync(file, content, 'utf8');
    console.log(`✅ Đã thay thế hoàn thiện khối V504 Gold Master trong ${file}`);
  } else if (content.includes(altMarker)) {
    const idx = content.indexOf(altMarker);
    content = content.substring(0, idx) + v504FullBlock;
    fs.writeFileSync(file, content, 'utf8');
    console.log(`✅ Đã thay thế hoàn thiện khối V504 Gold Master trong ${file}`);
  } else {
    content = content + '\n\n' + v504FullBlock;
    fs.writeFileSync(file, content, 'utf8');
    console.log(`✅ Đã thêm mới khối V504 Gold Master vào ${file}`);
  }
});

console.log('🎉 Toàn bộ 4 file client đã được tích hợp bản vá V504 chuẩn xác!');
