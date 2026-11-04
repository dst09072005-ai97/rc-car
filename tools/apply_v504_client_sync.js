const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('📱 [CLIENT V504 LAN AUTO-DISCOVERY] Cập nhật 4 files client app.js...');
console.log('================================================================');

const clientFiles = [
  'app.js',
  'www/app.js',
  'server/public/app.js',
  'android/app/src/main/assets/public/app.js'
];

// 1. KHỐI LAN DISCOVERY CHO INITMULTIPLAYERCLIENT
const lanDiscoveryEngineCode = `    // ========================================================================
    // [V504 GOLD] BỘ DÒ TÌM IP TỰ ĐỘNG TOÀN DIỆN CHO APK QUEST 3 & MOBILE
    // Quét song song đa mạng (WebRTC Subnet + Fast Sweep) khi đổi Wi-Fi / Hotspot
    // ========================================================================
    let isLanScanning = false;
    let lanScanResolved = false;

    function getDiscoveryCandidateIps() {
      const list = [];
      const savedPc = (typeof localStorage !== 'undefined') ? (localStorage.getItem('pc_server_ip') || localStorage.getItem('V500_LAPTOP_IP')) : null;
      if (savedPc && !list.includes(savedPc) && savedPc !== 'localhost' && savedPc !== '127.0.0.1') list.push(savedPc);

      const baked = ['192.168.1.228', '192.168.1.21', '192.168.1.60', '192.168.1.32'];
      baked.forEach((ip) => { if (!list.includes(ip)) list.push(ip); });

      const gateways = ['192.168.1.1', '192.168.43.1', '192.168.137.1', '172.20.10.1', '192.168.0.1', '10.0.0.1', '192.168.2.1'];
      gateways.forEach((ip) => { if (!list.includes(ip)) list.push(ip); });

      if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !list.includes(window.location.hostname)) {
        list.push(window.location.hostname);
      }
      return list;
    }

    function checkHostBridgePing(ip, timeoutMs = 280) {
      return new Promise((resolve) => {
        if (!ip || ip === 'localhost' || ip === '127.0.0.1') return resolve(null);
        let resolved = false;
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            if (ctrl) try { ctrl.abort(); } catch (e) {}
            resolve(null);
          }
        }, timeoutMs);

        fetch(\`http://\${ip}:8080/api/bridge-ping\`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          signal: ctrl ? ctrl.signal : undefined
        })
          .then((res) => {
            if (!resolved && res.ok) {
              return res.json().then((data) => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timer);
                  if (data && (data.ok || data.service === 'GOG808_LAPTOP_BRIDGE')) {
                    resolve({ ip, data });
                  } else {
                    resolve(null);
                  }
                }
              });
            }
          })
          .catch(() => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(null);
            }
          });
      });
    }

    function detectLocalSubnetWebRtc() {
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
          setTimeout(() => finish(null), 600);
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

    async function sweepSubnetIps(prefix, timeoutMs = 280, batchSize = 45) {
      const batch = [];
      for (let i = 1; i <= 254; i++) batch.push(\`\${prefix}.\${i}\`);
      for (let i = 0; i < batch.length; i += batchSize) {
        if (lanScanResolved) return null;
        const chunk = batch.slice(i, i + batchSize);
        const results = await Promise.all(chunk.map(ip => checkHostBridgePing(ip, timeoutMs)));
        const hit = results.find(Boolean);
        if (hit) return hit;
      }
      return null;
    }

    async function triggerAutoLanDiscovery() {
      if (isLanScanning) return;
      isLanScanning = true;
      lanScanResolved = false;

      if (typeof updateV500Banner === 'function') {
        updateV500Banner(false, '🔍 Đang tự động quét Wi-Fi tìm Laptop & Xe RC...');
      }

      try {
        // Bước 1: Quét song song toàn bộ các IP ưu tiên (Cực nhanh: 30-50ms)
        const candidates = getDiscoveryCandidateIps();
        const candResults = await Promise.all(candidates.map(ip => checkHostBridgePing(ip, 350)));
        const candHit = candResults.find(Boolean);
        if (candHit) {
          lanScanResolved = true;
          applyFoundServerHost(candHit.ip, candHit.data);
          isLanScanning = false;
          return;
        }

        // Bước 2: Dò Subnet mạng thực qua WebRTC và quét dải Subnet đó trước
        const detectedSubnet = await detectLocalSubnetWebRtc();
        const subnetsToScan = [];
        if (detectedSubnet) subnetsToScan.push(detectedSubnet);

        const commonSubnets = ['192.168.1', '192.168.43', '192.168.137', '192.168.0', '172.20.10', '10.0.0', '192.168.2'];
        commonSubnets.forEach((s) => { if (!subnetsToScan.includes(s)) subnetsToScan.push(s); });

        for (const subnet of subnetsToScan) {
          if (lanScanResolved) break;
          const hit = await sweepSubnetIps(subnet, 300, 45);
          if (hit) {
            lanScanResolved = true;
            applyFoundServerHost(hit.ip, hit.data);
            isLanScanning = false;
            return;
          }
        }
      } catch (e) {}

      isLanScanning = false;
    }

    window.__triggerAutoLanDiscovery = triggerAutoLanDiscovery;

    function applyFoundServerHost(foundIp, data) {
      if (!foundIp) return;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pc_server_ip', foundIp);
        localStorage.setItem('V500_LAPTOP_IP', foundIp);
      }
      window.__ACTIVE_DISCOVERED_IP__ = foundIp;

      if (data && data.car && data.car.ip) {
        state.rcCarIp = data.car.ip;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('rc_car_ip', data.car.ip);
        }
      }

      const carLabel = (data && data.car && data.car.ip) ? data.car.ip : (state.rcCarIp || '4210');
      if (typeof updateV500Banner === 'function') {
        updateV500Banner(true, \`🟢 ĐÃ KẾT NỐI LAPTOP (\${foundIp}:8080) | XE: \${carLabel}\`);
      }

      // Nối WebSocket ngay lập tức nếu chưa nối hoặc đang nối sai IP
      if (!mpSocket || mpSocket.readyState !== WebSocket.OPEN || (mpSocket.__targetHost && !mpSocket.__targetHost.startsWith(foundIp))) {
        connectToHost(foundIp);
      }
    }

    function connectToHost(ip) {
      if (!ip || ip === 'localhost' || ip === '127.0.0.1') {
        if (isApkEnvironment) return; // Trên APK không nối localhost của kính
      }

      if (mpSocket && mpSocket.readyState === WebSocket.OPEN && mpSocket.__targetHost && mpSocket.__targetHost.startsWith(ip)) {
        return;
      }

      if (mpSocket) {
        try { mpSocket.close(); } catch (e) {}
        mpSocket = null;
      }

      const wsProtocol = (window.location.protocol === 'https:' && !isApkEnvironment) ? 'wss:' : 'ws:';
      const target = \`\${ip}:8080\`;

      try {
        const sock = new WebSocket(\`\${wsProtocol}//\${target}\`);
        sock.__targetHost = target;
        mpSocket = sock;
        window.multiplayerWs = sock;
        window.rcSocket = sock;

        sock.onopen = () => {
          console.log('[Multiplayer] ✅ Đã kết nối WebSocket thành công tới server:', target);
          state.lastActionLog = \`📶 Đã kết nối Server Máy tính (\${target})! Nhận tín hiệu Vô lăng GOG808 & Xe.\`;
          const carLabel = state.rcCarIp || '4210';
          if (typeof updateV500Banner === 'function') {
            updateV500Banner(true, \`🟢 ĐÃ KẾT NỐI LAPTOP (\${ip}:8080) | XE: \${carLabel}\`);
          }
          try { sock.send(JSON.stringify({ type: 'PLAYER_HELLO', deviceType: isQuestHeadset ? 'META_QUEST' : 'DESKTOP' })); } catch (e) {}
        };

        sock.onclose = () => {
          console.warn('[Multiplayer] ⚠️ Mất kết nối WebSocket, tự động quét tìm lại...');
          if (typeof updateV500Banner === 'function') {
            updateV500Banner(false, '⚠️ Mất kết nối, đang tự động quét Wi-Fi tìm lại...');
          }
          setTimeout(() => {
            if (!mpSocket || mpSocket.readyState !== WebSocket.OPEN) {
              if (isApkEnvironment) triggerAutoLanDiscovery();
              else try { initMultiplayerClient(); } catch (e) {}
            }
          }, 1500);
        };

        sock.onerror = (err) => {
          console.warn('[Multiplayer] Lỗi kết nối WebSocket:', err);
        };

        sock.onmessage = handleMpSocketMessage;
      } catch (err) {}
    }
`;

clientFiles.forEach(cFile => {
  if (!fs.existsSync(cFile)) return;
  let code = fs.readFileSync(cFile, 'utf8');

  // A. Thêm Auto-Creep vào applyRacingWheelDrivingPhysics
  const autoCreepOld = `      state.speedKmh = state.velocityMs * 3.6;\n      state.rpm = 850 + (racingWheel.gasPercent / 100) * 4800;\n    } else {\n      // Thả cả 3 chân: xe tự trôi êm về 0`;
  const autoCreepNew = `      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = 850 + (racingWheel.gasPercent / 100) * 4800;
    } else if (Math.abs(racingWheel.steerAngleDeg || 0) > 18 && Math.abs(state.velocityMs) < 1.2) {
      // [V504 AUTO-CREEP] Xoay vô lăng trên bàn (chưa đạp ga) xe tự lăn bánh nhẹ 3.0 m/s để rẽ ngay
      if (!state.engineRunning) state.engineRunning = true;
      state.gearIndex = 3;
      state.gear = 'D';
      state.throttlePercent = 18;
      state.reversePercent = 0;
      state.brakePercent = 0;
      state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 3.0, dt * 3.5);
      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = 950;
    } else {
      // Thả cả 3 chân: xe tự trôi êm về 0`;

  if (code.includes(autoCreepOld)) {
    code = code.replace(autoCreepOld, autoCreepNew);
    console.log(`✅ Đã thêm V504 Auto-Creep vào applyRacingWheelDrivingPhysics trong ${cFile}`);
  }

  // B. Thêm auto-seat vào pollGamepadRacingWheel
  const pollWheelOld = `racingWheel.lastInputTime = window._racingWheel.lastInputTime || performance.now();\n        updateConnectedBadge(true, racingWheel.deviceName);\n        return;\n      }`;
  const pollWheelNew = `racingWheel.lastInputTime = window._racingWheel.lastInputTime || performance.now();
        updateConnectedBadge(true, racingWheel.deviceName);

        // Tự động lên xe DRIVING và căn thẳng góc nhìn qua kính chắn gió khi có thao tác vô lăng
        const isMoved = Math.abs(racingWheel.steerAngleDeg) > 12 || racingWheel.gasPercent > 2 || racingWheel.brakePercent > 2 || racingWheel.reversePercent > 2;
        if (isMoved && state.playerMode !== 'DRIVING') {
          state.playerMode = 'DRIVING';
          state.seatIndex = 0;
          state.doorsOpen = false;
          state.engineRunning = true;
          if (typeof avatarBodyMesh !== 'undefined' && avatarBodyMesh) avatarBodyMesh.visible = false;
          if (typeof resetAndCenterViewpoint === 'function') {
            try { resetAndCenterViewpoint('DRIVING', 0); } catch (e) {}
          } else if (typeof driverSeatMount !== 'undefined' && driverSeatMount && typeof cameraRig !== 'undefined' && cameraRig) {
            driverSeatMount.add(cameraRig);
            cameraRig.position.set(0, 0, 0);
            cameraRig.rotation.set(0, 0, 0);
          }
        }
        return;
      }`;

  if (code.includes(pollWheelOld)) {
    code = code.replace(pollWheelOld, pollWheelNew);
    console.log(`✅ Đã thêm auto-seat & viewpoint centering vào pollGamepadRacingWheel trong ${cFile}`);
  }

  // C. Đồng bộ CAR_IP_UPDATED & SERVER_LAN_INFO trong mpSocket.onmessage
  const oldServerLanMsg = `if (msg.type === 'SERVER_LAN_INFO' && msg.lanIp) {\n          if (typeof localStorage !== 'undefined' && msg.lanIp !== '127.0.0.1') {\n            localStorage.setItem('pc_server_ip', msg.lanIp);\n          }\n        } else if (msg.type === 'WELCOME') {`;
  const newServerLanMsg = `if (msg.type === 'SERVER_LAN_INFO') {
          if (msg.lanIp && typeof localStorage !== 'undefined' && msg.lanIp !== '127.0.0.1') {
            localStorage.setItem('pc_server_ip', msg.lanIp);
          }
          if (msg.car && msg.car.ip) {
            state.rcCarIp = msg.car.ip;
            if (typeof localStorage !== 'undefined') localStorage.setItem('rc_car_ip', msg.car.ip);
            console.log('🚗 [CAR IP SYNC] Đã nhận IP Xe RC từ SERVER_LAN_INFO:', state.rcCarIp);
          }
        } else if (msg.type === 'CAR_IP_UPDATED' && (msg.ip || msg.carIp)) {
          state.rcCarIp = msg.ip || msg.carIp;
          if (typeof localStorage !== 'undefined') localStorage.setItem('rc_car_ip', state.rcCarIp);
          console.log('🚗 [CAR IP SYNC] Đã cập nhật IP Xe RC mới:', state.rcCarIp);
        } else if (msg.type === 'WELCOME') {`;

  if (code.includes(oldServerLanMsg)) {
    code = code.replace(oldServerLanMsg, newServerLanMsg);
    console.log(`✅ Đã thêm xử lý CAR_IP_UPDATED vào onmessage trong ${cFile}`);
  }

  fs.writeFileSync(cFile, code, 'utf8');
});

console.log('✅ Hoàn tất cập nhật các khối logic lái xe!');
