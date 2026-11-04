const fs = require('fs');
const path = require('path');

console.log('🔧 [PATCH ESP32 CAM SYNC] Bắt đầu đồng bộ Cam Trước & Cam Lùi lên Kính Meta Quest 3...');

function safeReplace(content, targetStr, replacementStr) {
  const normContent = content.replace(/\r\n/g, '\n');
  const normTarget = targetStr.replace(/\r\n/g, '\n');
  const normRepl = replacementStr.replace(/\r\n/g, '\n');
  if (!normContent.includes(normTarget)) {
    return content;
  }
  const result = normContent.replace(normTarget, normRepl);
  return content.includes('\r\n') ? result.replace(/\n/g, '\r\n') : result;
}

// ============================================================================
// 1. CẬP NHẬT SERVER.JS & SERVER/SERVER.JS
// ============================================================================
const serverFiles = ['server.js', 'server/server.js'];

serverFiles.forEach(sFile => {
  if (!fs.existsSync(sFile)) return;
  let code = fs.readFileSync(sFile, 'utf8');

  // A. Thêm broadcastCameraIpUpdate nếu chưa có
  if (!code.includes('function broadcastCameraIpUpdate()')) {
    const marker = 'function broadcastWorldState() {';
    const broadcastFn = `function broadcastCameraIpUpdate() {
  if (typeof activeMultiplayerSockets === 'undefined' || !activeMultiplayerSockets) return;
  const camPacket = JSON.stringify({
    type: 'CAM_IP_UPDATED',
    cams: {
      front: discoveredEsp32Cams.front,
      rear: discoveredEsp32Cams.rear
    },
    car: esp32CarConfig,
    front: discoveredEsp32Cams.front,
    rear: discoveredEsp32Cams.rear
  });
  for (const client of activeMultiplayerSockets) {
    if (client.readyState === 1) { // WebSocket.OPEN
      try { client.send(camPacket); } catch (e) {}
    }
  }
}

`;
    const updated = safeReplace(code, marker, broadcastFn + marker);
    if (updated !== code) {
      code = updated;
      console.log(`✅ [${sFile}] Đã thêm broadcastCameraIpUpdate()`);
    }
  }

  // B. Kích hoạt broadcastCameraIpUpdate trong UDP discovery
  const oldUdpCam = `console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 \${role.toUpperCase()}: \${rinfo.address}:\${data.port || 4213}\`);\n      return;`;
  const newUdpCam = `console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 \${role.toUpperCase()}: \${rinfo.address}:\${data.port || 4213}\`);
      if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
      return;`;
  const updUdpCam = safeReplace(code, oldUdpCam, newUdpCam);
  if (updUdpCam !== code) {
    code = updUdpCam;
    console.log(`✅ [${sFile}] Đã gắn broadcastCameraIpUpdate vào UDP Camera`);
  }

  const oldUdpCar = `console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: \${rinfo.address}:\${esp32CarConfig.port}\`);\n      return;`;
  const newUdpCar = `console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: \${rinfo.address}:\${esp32CarConfig.port}\`);
      if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
      return;`;
  const updUdpCar = safeReplace(code, oldUdpCar, newUdpCar);
  if (updUdpCar !== code) {
    code = updUdpCar;
    console.log(`✅ [${sFile}] Đã gắn broadcastCameraIpUpdate vào UDP Car`);
  }

  // C. Kích hoạt broadcastCameraIpUpdate trong /api/register-esp32
  const oldHttpReg = `console.log(\`[HTTP REGISTRATION] ESP32 \${role.toUpperCase()} đã đăng ký IP mới: \${cleanIp}:\${port}\`);\n  res.json({ status: 'ok', role, ip: cleanIp, port });`;
  const newHttpReg = `console.log(\`[HTTP REGISTRATION] ESP32 \${role.toUpperCase()} đã đăng ký IP mới: \${cleanIp}:\${port}\`);
  if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
  res.json({ status: 'ok', role, ip: cleanIp, port });`;
  const updHttpReg = safeReplace(code, oldHttpReg, newHttpReg);
  if (updHttpReg !== code) {
    code = updHttpReg;
    console.log(`✅ [${sFile}] Đã gắn broadcastCameraIpUpdate vào /api/register-esp32`);
  }

  // D. Kích hoạt broadcastCameraIpUpdate trong /api/scan-esp32
  const oldScanRes = `res.json({ found: results, discovered: discoveredEsp32Cams });`;
  const newScanRes = `if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();\n  res.json({ found: results, discovered: discoveredEsp32Cams });`;
  if (!code.includes('broadcastCameraIpUpdate();\n  res.json({ found: results')) {
    const updScanRes = safeReplace(code, oldScanRes, newScanRes);
    if (updScanRes !== code) {
      code = updScanRes;
      console.log(`✅ [${sFile}] Đã gắn broadcastCameraIpUpdate vào /api/scan-esp32`);
    }
  }

  // E. Gửi cams & car trong SERVER_LAN_INFO ở attachMultiplayerServer
  const oldAttachLanInfo = `ws.send(JSON.stringify({\n      type: 'SERVER_LAN_INFO',\n      lanIp: getLocalLanIp(),\n      port: HTTP_PORT\n    }));`;
  const newAttachLanInfo = `ws.send(JSON.stringify({
      type: 'SERVER_LAN_INFO',
      lanIp: getLocalLanIp(),
      port: HTTP_PORT,
      car: {
        ip: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.ip) ? esp32CarConfig.ip : '192.168.1.238',
        port: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.port) ? esp32CarConfig.port : 4210
      },
      cams: {
        front: discoveredEsp32Cams.front,
        rear: discoveredEsp32Cams.rear
      }
    }));
    if (discoveredEsp32Cams.front.ip || discoveredEsp32Cams.rear.ip) {
      try {
        ws.send(JSON.stringify({
          type: 'CAM_IP_UPDATED',
          cams: {
            front: discoveredEsp32Cams.front,
            rear: discoveredEsp32Cams.rear
          },
          front: discoveredEsp32Cams.front,
          rear: discoveredEsp32Cams.rear
        }));
      } catch (e) {}
    }`;
  const updAttachLanInfo = safeReplace(code, oldAttachLanInfo, newAttachLanInfo);
  if (updAttachLanInfo !== code) {
    code = updAttachLanInfo;
    console.log(`✅ [${sFile}] Đã gắn cams & car vào SERVER_LAN_INFO (attachMultiplayerServer)`);
  }

  // F. Gửi cams & car trong SERVER_LAN_INFO ở bindUnifiedWss
  const oldWssLanInfo = `ws.send(JSON.stringify({\n          type: 'SERVER_LAN_INFO',\n          ips: getLanIpv4List(),\n          port: 8080\n        }));`;
  const newWssLanInfo = `if (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) {
        activeMultiplayerSockets.add(ws);
        ws.on('close', () => activeMultiplayerSockets.delete(ws));
        ws.on('error', () => activeMultiplayerSockets.delete(ws));
      }
      ws.send(JSON.stringify({
          type: 'SERVER_LAN_INFO',
          ips: getLanIpv4List(),
          lanIp: typeof getLocalLanIp === 'function' ? getLocalLanIp() : (getLanIpv4List()[0] || '127.0.0.1'),
          port: 8080,
          car: {
            ip: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.ip) ? esp32CarConfig.ip : '192.168.1.238',
            port: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.port) ? esp32CarConfig.port : 4210
          },
          cams: {
            front: discoveredEsp32Cams.front,
            rear: discoveredEsp32Cams.rear
          }
        }));
        if (discoveredEsp32Cams.front.ip || discoveredEsp32Cams.rear.ip) {
          try {
            ws.send(JSON.stringify({
              type: 'CAM_IP_UPDATED',
              cams: {
                front: discoveredEsp32Cams.front,
                rear: discoveredEsp32Cams.rear
              },
              front: discoveredEsp32Cams.front,
              rear: discoveredEsp32Cams.rear
            }));
          } catch (e) {}
        }`;
  const updWssLanInfo = safeReplace(code, oldWssLanInfo, newWssLanInfo);
  if (updWssLanInfo !== code) {
    code = updWssLanInfo;
    console.log(`✅ [${sFile}] Đã gắn cams & car vào bindUnifiedWss`);
  }

  // G. Bổ sung cams & car vào /api/bridge-ping
  const oldPingPattern = `wheelConnected: true,\n    timestamp: Date.now()`;
  const newPingPattern = `wheelConnected: true,
    car: {
      ip: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.ip) ? esp32CarConfig.ip : '192.168.1.238',
      port: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.port) ? esp32CarConfig.port : 4210
    },
    cams: (typeof discoveredEsp32Cams !== 'undefined') ? discoveredEsp32Cams : {},
    timestamp: Date.now()`;
  const updPingPattern = safeReplace(code, oldPingPattern, newPingPattern);
  if (updPingPattern !== code) {
    code = updPingPattern;
    console.log(`✅ [${sFile}] Đã thêm cams & car vào /api/bridge-ping`);
  }

  fs.writeFileSync(sFile, code, 'utf8');
});

// ============================================================================
// 2. CẬP NHẬT APP.JS (VÀ CÁC MIRRORS)
// ============================================================================
const clientFiles = [
  'app.js',
  'www/app.js',
  'server/public/app.js',
  'android/app/src/main/assets/public/app.js'
];

clientFiles.forEach(cFile => {
  if (!fs.existsSync(cFile)) return;
  let code = fs.readFileSync(cFile, 'utf8');

  // A. Thêm proxy fallback cho connectEsp32Windshield nếu chưa có
  const oldFrontErr = `      esp32Socket.onerror = () => {\n        state.lastActionLog = '⚠️ Loi ket noi WebSocket ESP32';\n      };`;
  const newFrontErr = `      esp32Socket.onerror = () => {
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
  const updFrontErr = safeReplace(code, oldFrontErr, newFrontErr);
  if (updFrontErr !== code) {
    code = updFrontErr;
    console.log(`✅ [${cFile}] Đã thêm fallback Proxy cho connectEsp32Windshield`);
  }

  // B. Thêm proxy fallback cho connectRearEsp32Camera nếu chưa có
  const oldRearErr = `      esp32RearSocket.onerror = () => {\n        state.lastActionLog = '⚠️ Lỗi kết nối WebSocket ESP32 Cam Lùi (' + rawUrl + ')';\n      };`;
  const newRearErr = `      esp32RearSocket.onerror = () => {
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
  const updRearErr = safeReplace(code, oldRearErr, newRearErr);
  if (updRearErr !== code) {
    code = updRearErr;
    console.log(`✅ [${cFile}] Đã thêm fallback Proxy cho connectRearEsp32Camera`);
  }

  // C. Thêm CAM_IP_UPDATED & cams sync vào mpSocket.onmessage
  const oldMpLanInfo = `if (msg.type === 'SERVER_LAN_INFO' && msg.lanIp) {\n          if (typeof localStorage !== 'undefined' && msg.lanIp !== '127.0.0.1') {\n            localStorage.setItem('pc_server_ip', msg.lanIp);\n          }\n        } else if (msg.type === 'WELCOME') {`;
  const newMpLanInfo = `if (msg.type === 'SERVER_LAN_INFO') {
          if (msg.lanIp && typeof localStorage !== 'undefined' && msg.lanIp !== '127.0.0.1') {
            localStorage.setItem('pc_server_ip', msg.lanIp);
          }
          if (msg.cams && typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps(msg.cams);
          }
          if (msg.car && typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps({ car: msg.car });
          }
        } else if (msg.type === 'CAM_IP_UPDATED' || msg.type === 'ESP32_CAM_UPDATE') {
          if (typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps(msg.cams || msg);
          }
        } else if (msg.type === 'WELCOME') {`;
  const updMpLanInfo = safeReplace(code, oldMpLanInfo, newMpLanInfo);
  if (updMpLanInfo !== code) {
    code = updMpLanInfo;
    console.log(`✅ [${cFile}] Đã gắn CAM_IP_UPDATED & cams vào mpSocket.onmessage`);
  }

  // D. Thay thế khối Auto-Discovery IP ESP32 trong setupV185AutoDiscoveryAndNpcCollisionEngine
  const oldV185DiscoveryTarget = `(function setupV185AutoDiscoveryAndNpcCollisionEngine() {
  // 1. TỰ ĐỘNG ĐỒNG BỘ IP ESP32 KHI ĐỔI WI-FI
  let isScanningNetwork = false;

  async function checkDiscoveredEsp32Ips() {
    try {
      const res = await fetch('/api/esp32-discovered');
      if (!res.ok) return;
      const data = await res.json();

      const frontInput = document.getElementById('esp32-front-ip');
      const rearInput = document.getElementById('esp32-rear-ip');
      const carInput = document.getElementById('esp32-car-ip');
      const carStatus = document.getElementById('esp32-car-status');

      // Tự động cập nhật IP Mạch Lái Xe nếu phát hiện IP mới
      if (data.car && data.car.ip) {
        if (carInput && (!carInput.value || carInput.value !== data.car.ip)) {
          carInput.value = data.car.ip;
          localStorage.setItem('esp32_car_ip', data.car.ip);
        }
        state.esp32CarIp = data.car.ip;
        state.esp32CarConnected = Boolean(data.car.active);
        if (carStatus) {
          carStatus.textContent = data.car.active ? \`🟢 Đã nối xe (\${data.car.ip}:4210)\` : \`🟠 Thấy xe (\${data.car.ip} - Chờ lệnh)\`;
          carStatus.style.color = data.car.active ? '#00ff88' : '#ff9500';
        }
      }

      // Tự động cập nhật IP Cam Trước nếu phát hiện IP mới
      if (data.front && data.front.ip) {
        const expectedFrontUrl = \`ws://\${data.front.ip}:\${data.front.port || 4213}\`;
        if (frontInput && (frontInput.value !== expectedFrontUrl || !frontInput.value)) {
          frontInput.value = expectedFrontUrl;
        }
        if (!state.esp32Connected) {
          connectEsp32Windshield(expectedFrontUrl);
        }
      }

      // Tự động cập nhật IP Cam Lùi nếu phát hiện IP mới
      if (data.rear && data.rear.ip) {
        const expectedRearUrl = \`ws://\${data.rear.ip}:\${data.rear.port || 4213}\`;
        if (rearInput && (rearInput.value !== expectedRearUrl || !rearInput.value)) {
          rearInput.value = expectedRearUrl;
        }
        if (!state.esp32RearConnected && !manualRearDisconnect) {
          connectRearEsp32Camera(expectedRearUrl);
        }
      }
    } catch (e) {}
  }

  // Quét định kỳ mỗi 3 giây để bắt kịp ngay khi mạch vừa đổi Wi-Fi hoặc reboot
  setInterval(checkDiscoveredEsp32Ips, 3000);

  // Nút bấm Quét chủ động trên Web
  async function triggerManualEsp32Scan() {
    if (isScanningNetwork) return;
    isScanningNetwork = true;
    const btn = document.getElementById('btn-auto-discover-esp32');
    if (btn) {
      btn.textContent = '⏳ Đang Quét Tìm ESP32 Trong Mạng LAN...';
      btn.style.background = '#ffd60a';
    }
    state.lastActionLog = '🔍 Đang quét toàn bộ mạng Wi-Fi để tự động tìm IP mới của 2 Camera...';

    try {
      const res = await fetch('/api/scan-esp32');`;

  const newV185DiscoveryTarget = `(function setupV185AutoDiscoveryAndNpcCollisionEngine() {
  // 1. TỰ ĐỘNG ĐỒNG BỘ IP ESP32 KHI ĐỔI WI-FI
  let isScanningNetwork = false;

  // ============================================================================
  // [ESP32 CAM AUTO-SYNC] HÀM CẬP NHẬT & TỰ ĐỘNG KẾT NỐI CAMERA TRÊN KÍNH VR & WEB
  // ============================================================================
  function applyEsp32CameraIps(data) {
    if (!data) return;
    const front = data.front || (data.role === 'front' ? data : null);
    const rear = data.rear || (data.role === 'rear' ? data : null);
    const car = data.car || (data.role === 'car' ? data : null);

    const frontInput = document.getElementById('esp32-front-ip');
    const rearInput = document.getElementById('esp32-rear-ip');
    const carInput = document.getElementById('esp32-car-ip');
    const carStatus = document.getElementById('esp32-car-status');

    // 1. Tự động cập nhật IP Mạch Lái Xe
    if (car && car.ip) {
      if (carInput && (!carInput.value || carInput.value !== car.ip)) {
        carInput.value = car.ip;
        if (typeof localStorage !== 'undefined') localStorage.setItem('esp32_car_ip', car.ip);
      }
      state.esp32CarIp = car.ip;
      state.esp32CarConnected = Boolean(car.active);
      if (carStatus) {
        carStatus.textContent = car.active ? \`🟢 Đã nối xe (\${car.ip}:4210)\` : \`🟠 Thấy xe (\${car.ip} - Chờ lệnh)\`;
        carStatus.style.color = car.active ? '#00ff88' : '#ff9500';
      }
    }

    // 2. Tự động cập nhật IP Cam Trước
    if (front && front.ip) {
      const expectedFrontUrl = \`ws://\${front.ip}:\${front.port || 4213}\`;
      state.esp32FrontIp = front.ip;
      if (typeof localStorage !== 'undefined') localStorage.setItem('rc_front_cam_ip', front.ip);
      if (frontInput && (frontInput.value !== expectedFrontUrl || !frontInput.value)) {
        frontInput.value = expectedFrontUrl;
      }
      if (!state.esp32Connected || (state.esp32StreamUrl && !state.esp32StreamUrl.includes(front.ip) && !state.esp32StreamUrl.includes('esp32-front-ws'))) {
        console.log('📹 [VR CAM FRONT] Đang tự động kết nối Cam Trước:', expectedFrontUrl);
        connectEsp32Windshield(expectedFrontUrl);
        if (state.windshieldMode !== 'TRANSPARENT' && state.windshieldMode !== 'ESP32_PIP') {
          state.windshieldMode = 'ESP32_LIVE';
        }
      }
    }

    // 3. Tự động cập nhật IP Cam Lùi
    if (rear && rear.ip) {
      const expectedRearUrl = \`ws://\${rear.ip}:\${rear.port || 4213}\`;
      state.esp32RearIp = rear.ip;
      if (typeof localStorage !== 'undefined') localStorage.setItem('rc_rear_cam_ip', rear.ip);
      if (rearInput && (rearInput.value !== expectedRearUrl || !rearInput.value)) {
        rearInput.value = expectedRearUrl;
      }
      if (!state.esp32RearConnected && !manualRearDisconnect) {
        console.log('📹 [VR CAM REAR] Đang tự động kết nối Cam Lùi:', expectedRearUrl);
        connectRearEsp32Camera(expectedRearUrl);
      }
    }
  }
  if (typeof window !== 'undefined') window.applyEsp32CameraIps = applyEsp32CameraIps;

  async function checkDiscoveredEsp32Ips() {
    try {
      const pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || window.__ACTIVE_DISCOVERED_IP__ || ((typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? window.location.hostname : '127.0.0.1');
      const baseUrl = (pcIp && pcIp !== 'localhost' && pcIp !== '127.0.0.1') ? \`http://\${pcIp}:8080\` : '';
      const res = await fetch(\`\${baseUrl}/api/esp32-discovered\`);
      if (!res.ok) return;
      const data = await res.json();
      applyEsp32CameraIps(data);
    } catch (e) {}
  }

  // Quét định kỳ mỗi 3 giây để bắt kịp ngay khi mạch vừa đổi Wi-Fi hoặc reboot
  setInterval(checkDiscoveredEsp32Ips, 3000);

  // Nút bấm Quét chủ động trên Web
  async function triggerManualEsp32Scan() {
    if (isScanningNetwork) return;
    isScanningNetwork = true;
    const btn = document.getElementById('btn-auto-discover-esp32');
    if (btn) {
      btn.textContent = '⏳ Đang Quét Tìm ESP32 Trong Mạng LAN...';
      btn.style.background = '#ffd60a';
    }
    state.lastActionLog = '🔍 Đang quét toàn bộ mạng Wi-Fi để tự động tìm IP mới của 2 Camera...';

    try {
      const pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || window.__ACTIVE_DISCOVERED_IP__ || ((typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? window.location.hostname : '127.0.0.1');
      const baseUrl = (pcIp && pcIp !== 'localhost' && pcIp !== '127.0.0.1') ? \`http://\${pcIp}:8080\` : '';
      const res = await fetch(\`\${baseUrl}/api/scan-esp32\`);`;

  const updV185Discovery = safeReplace(code, oldV185DiscoveryTarget, newV185DiscoveryTarget);
  if (updV185Discovery !== code) {
    code = updV185Discovery;
    console.log(`✅ [${cFile}] Đã cập nhật applyEsp32CameraIps và dynamic baseUrl`);
  }

  // E. Gắn listener vào bindSocketListeners (chặn packet cho mọi websocket kết nối)
  const oldBindWheelTarget = `// Nhận trạng thái vô lăng & bàn đạp GOG R808 đồng bộ từ Laptop sang Kính VR\n        if (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT') {`;
  const newBindWheelTarget = `// Nhận thông tin Server LAN & Camera IP
        if (msg.type === 'SERVER_LAN_INFO') {
          if (msg.lanIp && typeof localStorage !== 'undefined' && msg.lanIp !== '127.0.0.1') {
            localStorage.setItem('pc_server_ip', msg.lanIp);
          }
          if (msg.cams && typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps(msg.cams);
          }
          if (msg.car && typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps({ car: msg.car });
          }
        }
        if (msg.type === 'CAM_IP_UPDATED' || msg.type === 'ESP32_CAM_UPDATE') {
          if (typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps(msg.cams || msg);
          }
        }

        // Nhận trạng thái vô lăng & bàn đạp GOG R808 đồng bộ từ Laptop sang Kính VR
        if (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT') {`;
  const updBindWheel = safeReplace(code, oldBindWheelTarget, newBindWheelTarget);
  if (updBindWheel !== code) {
    code = updBindWheel;
    console.log(`✅ [${cFile}] Đã gắn listener CAM_IP_UPDATED vào bindSocketListeners`);
  }

  fs.writeFileSync(cFile, code, 'utf8');
});

console.log('🎉 Hoàn tất áp dụng bản vá ESP32 Camera Auto-Sync!');
