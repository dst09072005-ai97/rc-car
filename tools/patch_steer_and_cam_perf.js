const fs = require('fs');
const path = require('path');

console.log('🔧 [PATCH STEER & CAM PERF] Bắt đầu sửa đảo lái xe RC thật và tối ưu Zero-Lag Camera ESP32...');

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
// 1. CẬP NHẬT SERVER.JS & SERVER/SERVER.JS (ĐẢO LÁI XE RC THẬT & ZERO-LAG PROXY)
// ============================================================================
const serverFiles = ['server.js', 'server/server.js'];

serverFiles.forEach(sFile => {
  if (!fs.existsSync(sFile)) return;
  let code = fs.readFileSync(sFile, 'utf8');

  // A. Đảo góc lái trong sendUdpCarCommand: s = 180 - rawS
  const oldSendUdpCar = `function sendUdpCarCommand(steer, throttle) {
  if (!esp32CarConfig.ip) return;
  // Giới hạn biên an toàn: Góc lái 45..135°, Xung ga cân chỉnh 1300..1700us (1500us dừng)
  const s = Math.max(45, Math.min(135, Math.round(Number(steer) || 90)));`;

  const newSendUdpCar = `function sendUdpCarCommand(steer, throttle) {
  if (!esp32CarConfig.ip) return;
  // [FIX ĐẢO LÁI XE NGOÀI] Đảo ngược góc lái 45..135° cho servo xe RC ngoài đời thật (180 - rawS)
  const rawS = Math.max(45, Math.min(135, Math.round(Number(steer) || 90)));
  const s = 180 - rawS;`;

  const updSendUdpCar = safeReplace(code, oldSendUdpCar, newSendUdpCar);
  if (updSendUdpCar !== code) {
    code = updSendUdpCar;
    console.log(`✅ [${sFile}] Đã đảo lái servo trong sendUdpCarCommand`);
  }

  // B. Đảo góc lái trong sendRateLimitedEsp32Udp: 90 - s * 45
  const oldRateLimitedSteer = `const steerDeg = Math.max(45, Math.min(135, Math.round(90 + s * 45)));`;
  const newRateLimitedSteer = `// [FIX ĐẢO LÁI XE NGOÀI] Đảo góc lái cho servo xe RC thật (-s thay vì +s)
    const steerDeg = Math.max(45, Math.min(135, Math.round(90 - s * 45)));`;

  const updRateLimitedSteer = safeReplace(code, oldRateLimitedSteer, newRateLimitedSteer);
  if (updRateLimitedSteer !== code) {
    code = updRateLimitedSteer;
    console.log(`✅ [${sFile}] Đã đảo lái servo trong sendRateLimitedEsp32Udp`);
  }

  // C. Đảo góc lái trong dispatchToRealEsp32Controller: s = -rawS
  const oldDispatchSteer = `const s = Math.max(-100, Math.min(100, Math.round(Number(payload.steering) || 0)));`;
  const newDispatchSteer = `const rawS = Math.max(-100, Math.min(100, Math.round(Number(payload.steering) || 0)));
    const s = -rawS; // [FIX ĐẢO LÁI XE NGOÀI] Đảo ngược phần trăm lái cho servo xe RC ngoài đời thật`;

  const updDispatchSteer = safeReplace(code, oldDispatchSteer, newDispatchSteer);
  if (updDispatchSteer !== code) {
    code = updDispatchSteer;
    console.log(`✅ [${sFile}] Đã đảo lái servo trong dispatchToRealEsp32Controller`);
  }

  // D. Chống lag tích tụ trong proxyEsp32WebSocket: Drop frame khi buffer > 24KB
  const oldProxyMsg = `  upstreamWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });`;

  const newProxyMsg = `  upstreamWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      // [ZERO-LAG FPV] Nếu socket client nghẽn buffer > 24KB, bỏ qua ngay frame cũ này
      // để triệt tiêu hoàn toàn độ trễ tích tụ (video bám sát tức thì tốc độ xe khi đạp ga)
      if (clientWs.bufferedAmount > 24 * 1024) {
        return;
      }
      clientWs.send(data, { binary: isBinary });
    }
  });`;

  const updProxyMsg = safeReplace(code, oldProxyMsg, newProxyMsg);
  if (updProxyMsg !== code) {
    code = updProxyMsg;
    console.log(`✅ [${sFile}] Đã gắn bộ lọc Zero-Lag Drop Frame vào proxyEsp32WebSocket`);
  }

  fs.writeFileSync(sFile, code, 'utf8');
});

// ============================================================================
// 2. CẬP NHẬT APP.JS & CÁC BẢN GƯƠNG (TỐI ƯU HIỂN THỊ CAMERA & TRIỆT TIÊU BASE64 OVERHEAD)
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

  // A. Tối ưu CanvasTexture: Tắt generateMipmaps, bật LinearFilter & desynchronized context
  const oldCanvasDefs = `const windshieldCanvas = document.createElement('canvas');
windshieldCanvas.width = 1024;
windshieldCanvas.height = 512;
const wsCtx = windshieldCanvas.getContext('2d');
const wsTex = new THREE.CanvasTexture(windshieldCanvas);

const ytCanvas = document.createElement('canvas');
ytCanvas.width = 640;
ytCanvas.height = 360;
const ytCtx = ytCanvas.getContext('2d');
const ytTex = new THREE.CanvasTexture(ytCanvas);

const rearCamCanvas = document.createElement('canvas');
rearCamCanvas.width = 512;
rearCamCanvas.height = 256;
const rearCamCtx = rearCamCanvas.getContext('2d');
const rearCamTex = new THREE.CanvasTexture(rearCamCanvas);`;

  const newCanvasDefs = `const windshieldCanvas = document.createElement('canvas');
windshieldCanvas.width = 1024;
windshieldCanvas.height = 512;
const wsCtx = windshieldCanvas.getContext('2d', { alpha: false, desynchronized: true });
const wsTex = new THREE.CanvasTexture(windshieldCanvas);
wsTex.generateMipmaps = false;
wsTex.minFilter = THREE.LinearFilter;
wsTex.magFilter = THREE.LinearFilter;

const ytCanvas = document.createElement('canvas');
ytCanvas.width = 640;
ytCanvas.height = 360;
const ytCtx = ytCanvas.getContext('2d');
const ytTex = new THREE.CanvasTexture(ytCanvas);
ytTex.generateMipmaps = false;
ytTex.minFilter = THREE.LinearFilter;
ytTex.magFilter = THREE.LinearFilter;

const rearCamCanvas = document.createElement('canvas');
rearCamCanvas.width = 512;
rearCamCanvas.height = 256;
const rearCamCtx = rearCamCanvas.getContext('2d', { alpha: false, desynchronized: true });
const rearCamTex = new THREE.CanvasTexture(rearCamCanvas);
rearCamTex.generateMipmaps = false;
rearCamTex.minFilter = THREE.LinearFilter;
rearCamTex.magFilter = THREE.LinearFilter;`;

  const updCanvasDefs = safeReplace(code, oldCanvasDefs, newCanvasDefs);
  if (updCanvasDefs !== code) {
    code = updCanvasDefs;
    console.log(`✅ [${cFile}] Đã tối ưu CanvasTexture & desynchronized context`);
  }

  // B. Tối ưu decodePendingFrontFrame: Đóng ngay bitmap sau khi drawImage để giải phóng GPU
  const oldDecodeFront = `    // DIRECT ZERO-LATENCY DRAW: Vẽ trực tiếp lên kính lái ngay khi giải mã xong bitmap, không viền, không lag
    if (state.windshieldMode === 'ESP32_LIVE') {
      wsCtx.drawImage(bmp, 0, 0, 1024, 512);
      wsTex.needsUpdate = true;
    } else if (state.windshieldMode === 'ESP32_REAR_LIVE' && !esp32RearBitmap) {
      wsCtx.drawImage(bmp, 0, 0, 1024, 512);
      wsTex.needsUpdate = true;
    }
    frontCamNeedsRedraw = false;
  }).catch(() => {}).finally(() => {`;

  const newDecodeFront = `    // DIRECT ZERO-LATENCY DRAW: Vẽ trực tiếp lên kính lái ngay khi giải mã xong bitmap, không viền, không lag
    if (state.windshieldMode === 'ESP32_LIVE') {
      wsCtx.drawImage(bmp, 0, 0, 1024, 512);
      wsTex.needsUpdate = true;
    } else if (state.windshieldMode === 'ESP32_PIP') {
      const pipW = 340, pipH = 190, pipX = 1024 - pipW - 16, pipY = 56;
      wsCtx.drawImage(bmp, pipX, pipY, pipW, pipH);
      wsTex.needsUpdate = true;
    } else if (state.windshieldMode === 'ESP32_REAR_LIVE' && !esp32RearBitmap) {
      wsCtx.drawImage(bmp, 0, 0, 1024, 512);
      wsTex.needsUpdate = true;
    }
    try { bmp.close(); } catch (e) {}
    esp32Bitmap = true;
    frontCamNeedsRedraw = false;
  }).catch(() => {}).finally(() => {`;

  const updDecodeFront = safeReplace(code, oldDecodeFront, newDecodeFront);
  if (updDecodeFront !== code) {
    code = updDecodeFront;
    console.log(`✅ [${cFile}] Đã tối ưu giải phóng bộ nhớ GPU trong decodePendingFrontFrame`);
  }

  // C. Triệt tiêu vòng lặp chuyển tiếp base64 đè lên multiplayer socket
  const oldRelayBlock = `    // 1. Chuyển tiếp khung hình ESP32 Cam từ Laptop sang Quest 3 (~12 FPS)
    if (relayCtx && typeof mpSocket !== 'undefined' && mpSocket && mpSocket.readyState === WebSocket.OPEN) {
      if (now - lastCamRelaySentAt > 80) {
        const frontImg = document.getElementById('v250-front-cam-img');
        if (frontImg && frontImg.complete && (frontImg.naturalWidth || 0) > 0) {
          try {
            relayCtx.drawImage(frontImg, 0, 0, 480, 270);
            const dataUrl = relayCanvas.toDataURL('image/jpeg', 0.60);
            lastCamRelaySentAt = now;
            mpSocket.send(JSON.stringify({
              type: 'ESP32_CAM_FRAME_RELAY',
              role: 'front',
              dataUrl
            }));
          } catch (e) {}
        }
      }
    }`;

  const newRelayBlock = `    // 1. Camera ESP32 đã truyền trực tiếp qua WebSocket Binary tốc độ 30 FPS Zero-Lag
    // Triệt tiêu hoàn toàn việc nén base64 toDataURL() để giải phóng băng thông mạng và CPU`;

  const updRelayBlock = safeReplace(code, oldRelayBlock, newRelayBlock);
  if (updRelayBlock !== code) {
    code = updRelayBlock;
    console.log(`✅ [${cFile}] Đã gỡ bỏ base64 frame relay gây nghẽn mạng`);
  }

  // D. Chặn base64 vẽ đè lên luồng binary tốc độ cao trong mpSocket.onmessage
  const oldMpRelayMsg = `} else if (msg.type === 'ESP32_CAM_FRAME_RELAY' && msg.dataUrl) {
          if (typeof window !== 'undefined' && window.__questRelayImg) {
            window.__questRelayImg.src = msg.dataUrl;
          }
        }`;

  const newMpRelayMsg = `} else if (msg.type === 'ESP32_CAM_FRAME_RELAY' && msg.dataUrl) {
          // Chỉ nhận fallback khi chưa có kết nối WebSocket nhị phân trực tiếp
          if (!state.esp32Connected && typeof window !== 'undefined' && window.__questRelayImg) {
            window.__questRelayImg.src = msg.dataUrl;
          }
        }`;

  const updMpRelayMsg = safeReplace(code, oldMpRelayMsg, newMpRelayMsg);
  if (updMpRelayMsg !== code) {
    code = updMpRelayMsg;
    console.log(`✅ [${cFile}] Đã chặn frame cũ đè lên luồng live trong mpSocket.onmessage`);
  }

  fs.writeFileSync(cFile, code, 'utf8');
});

console.log('🎉 Hoàn tất áp dụng bản vá Đảo Lái Xe Ngoài & Zero-Lag Camera ESP32!');
