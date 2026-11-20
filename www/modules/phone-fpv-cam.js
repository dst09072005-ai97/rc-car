/** Phone FPV setup, frame routing and front/rear windshield camera control. */

export function setupPhoneFpvHub() {
  const urlInput = document.getElementById('phone-fpv-url-input');
  const copyButton = document.getElementById('btn-copy-phone-fpv-url');
  const qrDialog = document.getElementById('phone-fpv-qr-dialog');
  const qrImage = document.getElementById('phone-fpv-qr-img');
  if (!urlInput || !copyButton || !qrDialog || !qrImage) return;

  function setCameraUrl(host) {
    if (!host) return;
    const url = new URL('https://localhost:8443/fpv-cam.html');
    if (host.includes(':') && !host.startsWith('[')) host = `[${host}]`;
    url.hostname = host;
    if (url.hostname !== 'localhost' || host === 'localhost') urlInput.value = url.href;
  }

  setCameraUrl(window.location.hostname);
  if (typeof fetch === 'function') {
    fetch('/api/network-info')
      .then(response => response.ok ? response.json() : null)
      .then(info => setCameraUrl(info?.lanIp))
      .catch(() => {});
  }

  let copyFeedbackTimer;
  const copyLabel = copyButton.textContent;
  copyButton.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(urlInput.value);
      copyButton.textContent = 'Đã copy!';
    } catch {
      urlInput.select();
      if (document.execCommand?.('copy')) copyButton.textContent = 'Đã copy!';
      else copyButton.textContent = 'Ctrl+C để copy';
    }
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => { copyButton.textContent = copyLabel; }, 2000);
  });
  document.getElementById('btn-open-phone-fpv-qr')?.addEventListener('click', () => {
    qrImage.src = `/api/phone-fpv-qr?url=${encodeURIComponent(urlInput.value)}`;
    qrDialog.showModal();
  });
}

export function createPhoneFpvCamera(ctx) {
  const phoneFpvLastFrame = { front: 0, rear: 0 };

  const PHONE_FPV_TIMEOUT_MS = 4000;

  let phoneFpvExpiryTimer = null;

  function normalizeEsp32CameraSocketUrl(rawUrl, proxyPath) {
    const isWebSocket = rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://');
    if (isWebSocket && ctx.getHostedServerHostname() && (rawUrl.includes(proxyPath) ||
        (window.location.protocol === 'https:' && rawUrl.startsWith('ws://')))) {
      return ctx.getEsp32ProxySocketUrl(proxyPath);
    }
    return rawUrl;
  }

  function connectEsp32Windshield(rawUrl) {
    if (!rawUrl) return;
    const targetWs = normalizeEsp32CameraSocketUrl(rawUrl, '/esp32-front-ws');
    // [ANTI-THRASH] Nếu socket đang kết nối hoặc đã mở với đúng URL này, không đóng kết nối!
    if (ctx.esp32Socket && (ctx.esp32Socket.readyState === WebSocket.CONNECTING || ctx.esp32Socket.readyState === WebSocket.OPEN)) {
      if (ctx.state.esp32StreamUrl === targetWs) return;
    }
    ctx.state.esp32StreamUrl = targetWs;
    if (ctx.esp32Socket) {
      try { ctx.esp32Socket.close(); } catch (e) {}
      ctx.esp32Socket = null;
    }
    if (rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://')) {
      try {
        ctx.esp32Socket = new WebSocket(targetWs);
        ctx.esp32Socket.binaryType = 'arraybuffer';
        ctx.esp32Socket.onopen = () => {
          ctx.state.esp32Connected = true;
          ctx.state.lastActionLog = '🟢 Da ket noi WebSocket ESP32-CAM!';
        };
        ctx.esp32Socket.onmessage = (msg) => {
          if (ctx.state.phoneFpvFrontLive) return;
          const now = performance.now();
          if (typeof ctx.esp32TwinMetrics !== 'undefined') {
            ctx.esp32TwinMetrics.frontFrameIntervalMs = now - (ctx.esp32TwinMetrics.frontLastFrameTime || now);
            ctx.esp32TwinMetrics.frontLastFrameTime = now;
            ctx.esp32TwinMetrics.frontBlurScore = 80;
          }

          // Ho tro ca JPEG Hardware va Raw RGB565 (Chong giat lag nho co che Pending Frame moi nhat)
          if (msg.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(msg.data);
            if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
              ctx.pendingFrontBlob = new Blob([msg.data], { type: 'image/jpeg' });
              ctx.decodePendingFrontFrame();
              return;
            }
            if (bytes.length >= ctx.rawCamW * ctx.rawCamH * 2) {
              ctx.latestRawFrameBytes = bytes;
              if (!ctx.rawFrameScheduled) {
                ctx.rawFrameScheduled = true;
                queueMicrotask(ctx.decodeLatestRawFrame);
              }
            }
          } else if (msg.data instanceof Blob) {
            ctx.pendingFrontBlob = msg.data;
            ctx.decodePendingFrontFrame();
          }
        };
        ctx.esp32Socket.onerror = () => {
          ctx.state.lastActionLog = '⚠️ Lỗi kết nối direct ESP32 Cam, chuyển sang Proxy Server...';
          const pcIp = ctx.getHostedServerHostname() || localStorage.getItem('pc_server_ip') ||
            localStorage.getItem('V500_LAPTOP_IP') || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.76';
          const proxyWs = ctx.getEsp32ProxySocketUrl('/esp32-front-ws', pcIp);
          if (targetWs !== proxyWs) {
            console.log('🔄 [ESP32-FRONT] Chuyển hướng kết nối qua Proxy Server:', proxyWs);
            setTimeout(() => {
              if (!ctx.state.esp32Connected) connectEsp32Windshield(proxyWs);
            }, 800);
          }
        };
        ctx.esp32Socket.onclose = () => {
          ctx.state.esp32Connected = ctx.state.phoneFpvFrontLive;
          ctx.state.lastActionLog = '🔌 Da ngat ket noi WebSocket ESP32';
        };
      } catch (e) {}
    } else {
      const finalUrl = window.location.protocol === 'https:' && rawUrl.startsWith('http://')
        ? `/api/esp32-proxy?url=${encodeURIComponent(rawUrl)}`
        : rawUrl;
      ctx.esp32MjpegImg.src = finalUrl;
    }
  }

  function decodePendingRearFrame() {
    if (ctx.isRearDecoding || !ctx.pendingRearBlob) return;
    const blob = ctx.pendingRearBlob;
    ctx.pendingRearBlob = null;
    ctx.isRearDecoding = true;

    createImageBitmap(blob).then((bmp) => {
      const isPhoneFrame = ctx.phoneFpvBlobs.has(blob);
      if (!isPhoneFrame && ctx.state.phoneFpvRearLive) {
        bmp.close();
        return;
      }
      if (ctx.esp32RearBitmap && typeof ctx.esp32RearBitmap.close === 'function') {
        try { ctx.esp32RearBitmap.close(); } catch (e) {}
      }
      ctx.esp32RearBitmap = bmp;
      ctx.state.esp32RearConnected = true;
      if (isPhoneFrame) notePhoneFpvFrame('rear');
      if (typeof ctx.renderRearMirrorAndCameraDisplay === 'function') {
        ctx.renderRearMirrorAndCameraDisplay(ctx.state.gears[ctx.state.gearIndex]);
      }
      // Khi đang cài số lùi (R) hoặc ở chế độ xem cam sau: Vẽ trực tiếp lên kính lái
      if (ctx.state.windshieldMode === 'ESP32_REAR_LIVE' || (!isPhoneFrame && ctx.state.gear === 'R' && ctx.state.windshieldMode === 'ESP32_LIVE')) {
        ctx.wsCtx.drawImage(ctx.rearCamCanvas, 0, 0, 1024, 512);
        ctx.wsTex.needsUpdate = true;
      }
    }).catch((e) => {}).finally(() => {
      ctx.isRearDecoding = false;
      if (ctx.pendingRearBlob) decodePendingRearFrame();
    });
  }

  function updatePhoneFpvStatus() {
    const badge = document.getElementById('phone-fpv-status-badge');
    if (!badge) return;
    const rear = ctx.state.phoneFpvRearLive && (getPhoneFpvSurface() === 'rear' || !ctx.state.phoneFpvFrontLive);
    const live = rear || ctx.state.phoneFpvFrontLive;
    let label = '🟡 Chờ kết nối từ điện thoại';
    if (live) {
      label = ctx.state.windshieldCamEnabled
        ? (rear ? '🟢 Đang phát Cam Lùi' : '🟢 Đang phát Cam Trước')
        : '🟢 Điện thoại đã sẵn sàng (Kính đang trong — bấm Kết Nối Cam để xem)';
    }
    if (badge.textContent !== label) {
      badge.textContent = label;
      badge.setAttribute('data-live', String(live));
    }
  }

  function getPhoneFpvSurface() {
    return ctx.state.phoneFpvSurface || (ctx.state.gears[ctx.state.gearIndex] === 'R' ? 'rear' : 'front');
  }

  function selectPhoneFpvSurface(surface) {
    if (surface === 'front' || surface === 'rear') ctx.state.phoneFpvSurface = surface;
    if (ctx.state.windshieldCamEnabled && (ctx.state.phoneFpvFrontLive || ctx.state.phoneFpvRearLive) &&
        (ctx.state.windshieldMode === 'ESP32_LIVE' || ctx.state.windshieldMode === 'ESP32_REAR_LIVE')) {
      const mode = ctx.state.phoneFpvRearLive && getPhoneFpvSurface() === 'rear' ? 'ESP32_REAR_LIVE' : 'ESP32_LIVE';
      if (mode !== ctx.state.windshieldMode) setWindshieldMode(mode);
    }
    updatePhoneFpvStatus();
  }

  function setWindshieldMode(mode) {
    ctx.state.windshieldCamEnabled = mode !== 'TRANSPARENT';
    ctx.state.windshieldMode = mode;
    ctx.windshieldScreenMesh.visible = ctx.state.windshieldCamEnabled;
    ctx.wsCtx.clearRect(0, 0, 1024, 512);
    if (mode === 'ESP32_LIVE' || mode === 'ESP32_REAR_LIVE') {
      const rear = mode === 'ESP32_REAR_LIVE';
      const bitmap = rear ? ctx.esp32RearBitmap : ctx.esp32Bitmap;
      const mjpeg = rear ? ctx.esp32RearImg : ctx.esp32MjpegImg;
      const frame = bitmap || (mjpeg.naturalWidth > 0 ? mjpeg : null);
      if (frame) ctx.wsCtx.drawImage(frame, 0, 0, 1024, 512);
    }
    ctx.wsTex.needsUpdate = true;
    updatePhoneFpvStatus();
    updateCamRoadUiButtons();
  }

  function updateCamRoadUiButtons() {
    const btnTop = document.getElementById('btn-toggle-cam-road');
    const btnWheel = document.getElementById('btn-wheel-toggle-cam-road');
    const btnPhone = document.getElementById('btn-phone-fpv-connect-cam');
    if (btnPhone) {
      btnPhone.setAttribute('aria-pressed', String(ctx.state.windshieldCamEnabled));
      btnPhone.textContent = ctx.state.windshieldCamEnabled ? '🪟 Kính Trong' : '📡 Kết Nối & Hiện Cam Lên Kính';
    }
    const mode = ctx.state.windshieldMode;
    if (btnTop) {
      if (mode === 'TRANSPARENT') {
        btnTop.textContent = '🛣️ Xem: ĐƯỜNG 3D (Phím V/K)';
        btnTop.style.background = '#00e5ff';
        btnTop.style.color = '#000';
      } else if (mode === 'ESP32_PIP') {
        btnTop.textContent = '🖼️ Xem: PIP (3D + CAM)';
        btnTop.style.background = '#ffd60a';
        btnTop.style.color = '#000';
      } else {
        btnTop.textContent = '📷 Xem: CAM THẬT (Phím V/K)';
        btnTop.style.background = '#00ff88';
        btnTop.style.color = '#000';
      }
    }
    if (btnWheel) {
      if (mode === 'TRANSPARENT') {
        btnWheel.textContent = '🔄 Tùy Chọn: [🛣️ ĐƯỜNG 3D TRONG GAME] (Bấm đổi sang Cam 📷)';
        btnWheel.style.background = '#00e5ff';
        btnWheel.style.color = '#000';
      } else if (mode === 'ESP32_PIP') {
        btnWheel.textContent = '🔄 Tùy Chọn: [🖼️ ĐƯỜNG 3D + MINI CAM] (Bấm đổi sang Kính Trong 🪟)';
        btnWheel.style.background = '#ffd60a';
        btnWheel.style.color = '#000';
      } else {
        btnWheel.textContent = '🔄 Tùy Chọn: [📷 CAMERA THỰC TẾ] (Bấm đổi sang Đường 3D 🛣️)';
        btnWheel.style.background = '#00ff88';
        btnWheel.style.color = '#000';
      }
    }
  }

  function connectConfiguredEsp32Camera(surface) {
    const rear = surface === 'rear';
    const input = document.getElementById(rear ? 'esp32-rear-ip' : 'esp32-front-ip');
    const raw = input?.value.trim();
    const obsoleteIp = rear ? /192\.168\.1\.90/ : /192\.168\.1\.(88|184)/;
    const host = ctx.getHostedServerHostname() || localStorage.getItem('pc_server_ip') ||
      localStorage.getItem('V500_LAPTOP_IP') || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.76';
    const url = raw && !obsoleteIp.test(raw) ? raw : ctx.getEsp32ProxySocketUrl(rear ? '/esp32-rear-ws' : '/esp32-front-ws', host);
    if (input) input.value = url;
    if (rear) connectRearEsp32Camera(url);
    else connectEsp32Windshield(url);
  }

  function showWindshieldCamera(surface) {
    const rear = surface === 'rear' || (!surface && ctx.state.phoneFpvRearLive && getPhoneFpvSurface() === 'rear');
    setWindshieldMode(rear ? 'ESP32_REAR_LIVE' : 'ESP32_LIVE');
    if (!ctx.state.phoneFpvFrontLive && (surface === 'front' || (!ctx.state.esp32Connected && !ctx.isSocketActive(ctx.esp32Socket)))) {
      connectConfiguredEsp32Camera('front');
    }
    if (!ctx.state.phoneFpvRearLive && (surface === 'rear' || (!ctx.state.esp32RearConnected && !ctx.isSocketActive(ctx.esp32RearSocket)))) {
      connectConfiguredEsp32Camera('rear');
    }
  }

  function expirePhoneFpvFrames() {
    phoneFpvExpiryTimer = null;
    const now = Date.now();
    if (ctx.state.phoneFpvFrontLive && now - phoneFpvLastFrame.front >= PHONE_FPV_TIMEOUT_MS) {
      ctx.state.phoneFpvFrontLive = false;
      ctx.state.esp32Connected = ctx.esp32MjpegImg.naturalWidth > 0;
      ctx.esp32Bitmap?.close();
      ctx.esp32Bitmap = null;
      if (ctx.state.windshieldMode === 'ESP32_LIVE' && ctx.state.esp32Connected) {
        ctx.wsCtx.drawImage(ctx.esp32MjpegImg, 0, 0, 1024, 512);
        ctx.wsTex.needsUpdate = true;
      }
    }
    if (ctx.state.phoneFpvRearLive && now - phoneFpvLastFrame.rear >= PHONE_FPV_TIMEOUT_MS) {
      ctx.state.phoneFpvRearLive = false;
      ctx.state.esp32RearConnected = ctx.esp32RearImg.naturalWidth > 0;
      ctx.esp32RearBitmap?.close();
      ctx.esp32RearBitmap = null;
    }
    updatePhoneFpvStatus();
    if (ctx.state.phoneFpvFrontLive || ctx.state.phoneFpvRearLive) {
      const nextFrame = ctx.state.phoneFpvFrontLive && ctx.state.phoneFpvRearLive
        ? Math.min(phoneFpvLastFrame.front, phoneFpvLastFrame.rear)
        : (ctx.state.phoneFpvFrontLive ? phoneFpvLastFrame.front : phoneFpvLastFrame.rear);
      phoneFpvExpiryTimer = setTimeout(expirePhoneFpvFrames, Math.max(1, nextFrame + PHONE_FPV_TIMEOUT_MS - now));
    }
  }

  function notePhoneFpvFrame(surface) {
    phoneFpvLastFrame[surface] = Date.now();
    const wasLive = surface === 'rear' ? ctx.state.phoneFpvRearLive : ctx.state.phoneFpvFrontLive;
    if (surface === 'rear') ctx.state.phoneFpvRearLive = true;
    else ctx.state.phoneFpvFrontLive = true;
    if (!wasLive) selectPhoneFpvSurface();
    if (phoneFpvExpiryTimer === null) phoneFpvExpiryTimer = setTimeout(expirePhoneFpvFrames, PHONE_FPV_TIMEOUT_MS);
  }

  function handleIncomingFpvBinary(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 8) return;
    const bytes = new Uint8Array(arrayBuffer);
    let target = 'front';
    let offset = 0;
    if (bytes[0] === 0x52 && bytes[1] === 0x43 && bytes[2] === 0x46) {
      target = bytes[3] === 0x02 ? 'rear' : 'front';
      offset = 4;
    }
    if (bytes.length - offset < 4 || bytes[offset] !== 0xFF || bytes[offset + 1] !== 0xD8) return;
    // Chỉ bỏ qua JPEG không có nhãn khi đường ESP32 trực tiếp đang mở.
    if (!offset && target === 'front' && typeof ctx.esp32Socket !== 'undefined' && ctx.esp32Socket && ctx.esp32Socket.readyState === WebSocket.OPEN) return;
    const jpegBlob = new Blob([bytes.subarray(offset)], { type: 'image/jpeg' });
    if (offset) ctx.phoneFpvBlobs.add(jpegBlob);
    if (target === 'rear') {
      ctx.pendingRearBlob = jpegBlob;
      decodePendingRearFrame();
    } else {
      ctx.pendingFrontBlob = jpegBlob;
      ctx.decodePendingFrontFrame();
    }
  }

  function connectRearEsp32Camera(rawUrl) {
    if (!rawUrl) return;
    const targetWs = normalizeEsp32CameraSocketUrl(rawUrl, '/esp32-rear-ws');
    // [ANTI-THRASH] Nếu socket đang kết nối hoặc đã mở với đúng URL này, không đóng kết nối!
    if (ctx.esp32RearSocket && (ctx.esp32RearSocket.readyState === WebSocket.CONNECTING || ctx.esp32RearSocket.readyState === WebSocket.OPEN)) {
      if (ctx.state.esp32RearStreamUrl === targetWs) return;
    }
    ctx.state.esp32RearStreamUrl = targetWs;
    ctx.manualRearDisconnect = false;
    if (ctx.esp32RearSocket) {
      try { ctx.esp32RearSocket.close(); } catch (e) {}
      ctx.esp32RearSocket = null;
    }

    if (rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://')) {
      try {
        console.log('[ESP32-REAR] Đang kết nối WebSocket Cam Lùi:', targetWs);
        ctx.esp32RearSocket = new WebSocket(targetWs);
        ctx.esp32RearSocket.binaryType = 'arraybuffer';
        ctx.esp32RearSocket.onopen = () => {
          ctx.state.esp32RearConnected = true;
          clearTimeout(ctx.rearReconnectTimer);
          ctx.state.lastActionLog = '🟢 Đã kết nối WebSocket ESP32 Cam Lùi!';
          console.log('[ESP32-REAR] Kết nối thành công tới:', rawUrl);
        };
        ctx.esp32RearSocket.onmessage = (msg) => {
          if (ctx.state.phoneFpvRearLive) return;
          const now = performance.now();
          if (typeof ctx.esp32TwinMetrics !== 'undefined') {
            ctx.esp32TwinMetrics.rearFrameIntervalMs = now - (ctx.esp32TwinMetrics.rearLastFrameTime || now);
            ctx.esp32TwinMetrics.rearLastFrameTime = now;
          }

          if (msg.data instanceof ArrayBuffer) {
            ctx.pendingRearBlob = new Blob([msg.data], { type: 'image/jpeg' });
            decodePendingRearFrame();
          } else if (msg.data instanceof Blob) {
            ctx.pendingRearBlob = msg.data;
            decodePendingRearFrame();
          }
        };
        ctx.esp32RearSocket.onerror = () => {
          ctx.state.lastActionLog = '⚠️ Lỗi kết nối direct ESP32 Cam Lùi (' + rawUrl + '), chuyển sang Proxy Server...';
          const pcIp = ctx.getHostedServerHostname() || localStorage.getItem('pc_server_ip') ||
            localStorage.getItem('V500_LAPTOP_IP') || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.76';
          const proxyWs = ctx.getEsp32ProxySocketUrl('/esp32-rear-ws', pcIp);
          if (targetWs !== proxyWs) {
            console.log('🔄 [ESP32-REAR] Chuyển hướng kết nối qua Proxy Server:', proxyWs);
            setTimeout(() => {
              if (!ctx.state.esp32RearConnected && !ctx.manualRearDisconnect) connectRearEsp32Camera(proxyWs);
            }, 800);
          }
        };
        ctx.esp32RearSocket.onclose = () => {
          ctx.state.esp32RearConnected = ctx.state.phoneFpvRearLive;
          ctx.state.lastActionLog = '🔌 Mất kết nối Cam Lùi (' + rawUrl + ') - Sẽ tự động kết nối lại...';
          if (!ctx.manualRearDisconnect) {
            clearTimeout(ctx.rearReconnectTimer);
            ctx.rearReconnectTimer = setTimeout(() => {
              if (!ctx.state.esp32RearConnected && !ctx.manualRearDisconnect) {
                connectRearEsp32Camera(ctx.state.esp32RearStreamUrl);
              }
            }, 3000);
          }
        };
      } catch (e) {
        console.warn('[ESP32-REAR] Lỗi tạo WebSocket:', e);
      }
    } else {
      const finalUrl = (window.location.protocol === 'https:' && rawUrl.startsWith('http://'))
        ? `/api/esp32-proxy?url=${encodeURIComponent(rawUrl)}`
        : rawUrl;
      ctx.esp32RearImg.src = finalUrl;
      ctx.state.esp32RearConnected = true;
    }
  }

  return {
    normalizeEsp32CameraSocketUrl, connectEsp32Windshield, updatePhoneFpvStatus,
    getPhoneFpvSurface, selectPhoneFpvSurface, setWindshieldMode, updateCamRoadUiButtons,
    connectConfiguredEsp32Camera, showWindshieldCamera, notePhoneFpvFrame, handleIncomingFpvBinary,
    connectRearEsp32Camera,
  };
}
