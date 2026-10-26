'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');
const { URL } = require('url');
const { WebSocket } = require('ws');

const MAGIC_FRONT_JPEG = Buffer.from([0x52, 0x43, 0x46, 0x01]); // "RCF\x01"
const MAGIC_REAR_JPEG = Buffer.from([0x52, 0x43, 0x46, 0x02]);  // "RCF\x02"
const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    // Bỏ qua nếu không đọc được file .env local
  }
  return out;
}

function parseJsonConfig(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function loadNetworkConfig(overrides = {}) {
  const envFileVars = parseEnvFile(path.join(__dirname, '.env'));
  const jsonCfg = parseJsonConfig(path.join(__dirname, 'config.json'));
  const getVar = (envKey, jsonKey, fallback) => {
    if (overrides[jsonKey] !== undefined) return overrides[jsonKey];
    if (process.env[envKey] !== undefined && process.env[envKey] !== '') return process.env[envKey];
    if (envFileVars[envKey] !== undefined && envFileVars[envKey] !== '') return envFileVars[envKey];
    if (jsonCfg[jsonKey] !== undefined && jsonCfg[jsonKey] !== '') return jsonCfg[jsonKey];
    return fallback;
  };

  return {
    esp32Host: String(getVar('ESP32_CONTROLLER_HOST', 'esp32Host', '192.168.4.1')),
    esp32UdpPort: Number(getVar('ESP32_CONTROLLER_UDP_PORT', 'esp32Port', 4210)),
    rearCamHost: String(getVar('REAR_CAM_HOST', 'rearCamHost', '192.168.4.10')),
    rearCamPort: Number(getVar('REAR_CAM_PORT', 'rearCamPort', 80)),
    rearCamPath: String(getVar('REAR_CAM_PATH', 'rearCamPath', '/stream')),
    rearCamProtocol: String(getVar('REAR_CAM_PROTOCOL', 'rearCamProtocol', 'http-mjpeg')), // 'http-mjpeg' | 'ws-jpeg'
    frontCamProtocol: String(getVar('FRONT_CAM_PROTOCOL', 'frontCamProtocol', 'ws-jpeg')),
    watchdogTimeoutMs: Number(getVar('RC_WATCHDOG_MS', 'watchdogTimeoutMs', 300)),
    maxFrameBytes: Number(getVar('MAX_FRAME_BYTES', 'maxFrameBytes', 256 * 1024))
  };
}

// Đóng gói Packet điều khiển 4-byte khớp với firmware ESP32:
// int16_t steering (45..135, trung tính 90), int16_t throttle/ESC (1000..2000 µs, trung tính 1500)
function buildEsp32ControlPacket(steeringDeg, escPulseUs) {
  const s = Number(steeringDeg);
  const e = Number(escPulseUs);
  if (!Number.isFinite(s) || !Number.isFinite(e)) {
    throw new TypeError('Invalid non-finite control values');
  }
  const clampedSteer = Math.max(45, Math.min(135, Math.round(s)));
  const clampedEsc = Math.max(1000, Math.min(2000, Math.round(e)));

  const packet = Buffer.alloc(4);
  packet.writeInt16LE(clampedSteer, 0);
  packet.writeInt16LE(clampedEsc, 2);
  return { packet, clampedSteer, clampedEsc };
}

function createRCBridge(options = {}) {
  const config = loadNetworkConfig(options);
  const udpClient = dgram.createSocket('udp4');

  const state = {
    armed: false,
    activeControllerId: null,
    lastCommandTs: 0,
    lastSentPacket: { steeringDeg: 90, escPulseUs: 1500 },
    lastUdpError: null,
    clients: new Map(), // ws -> { id, role, subscribedCamera }
    mjpegStreamReq: null,
    mjpegReconnectTimer: null,
    mjpegActive: false
  };

  udpClient.on('error', (err) => {
    state.lastUdpError = err.code || err.message;
  });

  function sendUdpToEsp32(steeringDeg, escPulseUs) {
    try {
      const { packet, clampedSteer, clampedEsc } = buildEsp32ControlPacket(steeringDeg, escPulseUs);
      state.lastSentPacket = { steeringDeg: clampedSteer, escPulseUs: clampedEsc };
      udpClient.send(packet, 0, 4, config.esp32UdpPort, config.esp32Host, (err) => {
        if (err) state.lastUdpError = err.code || err.message;
        else state.lastUdpError = null;
      });
    } catch {
      // Bỏ qua nếu tham số không hợp lệ
    }
  }

  function broadcastToControllers(msgObj) {
    const raw = JSON.stringify(msgObj);
    for (const [ws, meta] of state.clients.entries()) {
      if (meta.role === 'twin_controller' && ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  function disarmAndNeutral(reason) {
    const wasArmed = state.armed;
    state.armed = false;
    sendUdpToEsp32(90, 1500);
    if (wasArmed) {
      broadcastToControllers({
        type: 'rc_arm_state',
        armed: false,
        reason: reason || 'DISARMED',
        neutralPacket: { steeringDeg: 90, escPulseUs: 1500 }
      });
    }
  }

  // Watchdog độc lập ở Backend (300ms < 500ms của Firmware ESP32)
  const watchdogTimer = setInterval(() => {
    if (state.armed && Date.now() - state.lastCommandTs > config.watchdogTimeoutMs) {
      disarmAndNeutral('BACKEND_WATCHDOG_TIMEOUT');
    }
  }, 50);
  if (typeof watchdogTimer.unref === 'function') watchdogTimer.unref();

  // Phát frame JPEG tới các twin_controller kèm 4-byte Magic Prefix ("RCF\x01" hoặc "RCF\x02")
  function broadcastJpegFrame(cameraRole, jpegBuffer) {
    if (!Buffer.isBuffer(jpegBuffer) || jpegBuffer.length < 4 || jpegBuffer.length > config.maxFrameBytes) {
      return;
    }
    const prefix = cameraRole === 'rear' ? MAGIC_REAR_JPEG : MAGIC_FRONT_JPEG;
    const framed = Buffer.concat([prefix, jpegBuffer], 4 + jpegBuffer.length);

    for (const [ws, meta] of state.clients.entries()) {
      if (meta.role === 'twin_controller' && ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount < config.maxFrameBytes * 2) {
          ws.send(framed, { binary: true });
        }
      }
    }
  }

  function hasActiveControllerClients() {
    for (const meta of state.clients.values()) {
      if (meta.role === 'twin_controller') return true;
    }
    return false;
  }

  function stopRearMjpegPuller() {
    clearTimeout(state.mjpegReconnectTimer);
    state.mjpegReconnectTimer = null;
    if (state.mjpegStreamReq) {
      state.mjpegStreamReq.destroy();
      state.mjpegStreamReq = null;
    }
    state.mjpegActive = false;
  }

  function scheduleRearMjpegReconnect() {
    if (!hasActiveControllerClients() || config.rearCamProtocol !== 'http-mjpeg') return;
    if (state.mjpegReconnectTimer) return;
    state.mjpegReconnectTimer = setTimeout(() => {
      state.mjpegReconnectTimer = null;
      startRearMjpegPuller();
    }, 2000);
  }

  // Đọc luồng HTTP MJPEG từ ESP32-CAM (port 80 /stream) và tách từng frame JPEG (0xFF 0xD8 .. 0xFF 0xD9)
  function startRearMjpegPuller() {
    if (config.rearCamProtocol !== 'http-mjpeg' || state.mjpegStreamReq || !hasActiveControllerClients()) {
      return;
    }
    const req = http.get({
      host: config.rearCamHost,
      port: config.rearCamPort,
      path: config.rearCamPath,
      timeout: 4000
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        stopRearMjpegPuller();
        scheduleRearMjpegReconnect();
        return;
      }
      state.mjpegActive = true;
      broadcastToControllers({ type: 'rc_camera_status', camera: 'rear', status: 'STREAMING' });

      let acc = Buffer.alloc(0);
      res.on('data', (chunk) => {
        acc = Buffer.concat([acc, chunk]);
        if (acc.length > config.maxFrameBytes * 2) {
          acc = Buffer.alloc(0);
          return;
        }
        while (true) {
          const soi = acc.indexOf(JPEG_SOI);
          if (soi === -1) {
            if (acc.length > 2) acc = acc.subarray(acc.length - 2);
            break;
          }
          const eoi = acc.indexOf(JPEG_EOI, soi + 2);
          if (eoi === -1) {
            if (soi > 0) acc = acc.subarray(soi);
            break;
          }
          const frameEnd = eoi + 2;
          const jpegFrame = acc.subarray(soi, frameEnd);
          acc = acc.subarray(frameEnd);
          broadcastJpegFrame('rear', jpegFrame);
        }
      });

      res.on('end', () => {
        stopRearMjpegPuller();
        broadcastToControllers({ type: 'rc_camera_status', camera: 'rear', status: 'DISCONNECTED' });
        scheduleRearMjpegReconnect();
      });
    });

    req.on('timeout', () => req.destroy());
    req.on('error', () => {
      stopRearMjpegPuller();
      broadcastToControllers({ type: 'rc_camera_status', camera: 'rear', status: 'ERROR' });
      scheduleRearMjpegReconnect();
    });

    state.mjpegStreamReq = req;
  }

  // Đăng ký HTTP routes (Health / Status & MJPEG Proxy có Allowlist chống SSRF)
  function registerExpressRoutes(app) {
    if (!app || typeof app.get !== 'function') return;

    app.get('/api/rc/status', (req, res) => {
      res.json({
        ok: true,
        armed: state.armed,
        activeControllerId: state.activeControllerId,
        lastSentPacket: state.lastSentPacket,
        lastUdpError: state.lastUdpError,
        esp32Target: { host: config.esp32Host, udpPort: config.esp32UdpPort },
        rearCamera: {
          protocol: config.rearCamProtocol,
          host: config.rearCamHost,
          port: config.rearCamPort,
          path: config.rearCamPath,
          streaming: state.mjpegActive
        },
        telemetryAvailable: false
      });
    });

    app.get('/api/rc/rear-stream', (req, res) => {
      const targetUrl = new URL(`http://${config.rearCamHost}:${config.rearCamPort}${config.rearCamPath}`);
      const proxyReq = http.get(targetUrl, { timeout: 4000 }, (proxyRes) => {
        res.status(proxyRes.statusCode || 200);
        if (proxyRes.headers['content-type']) {
          res.setHeader('Content-Type', proxyRes.headers['content-type']);
        }
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Rear camera unreachable', code: err.code || err.message });
        }
      });
      req.on('close', () => proxyReq.destroy());
    });
  }

  // Xử lý message RC từ một kết nối WebSocket (Có thể dùng chung WS của Baseline mà không xung đột)
  function handleWsMessage(ws, data, isBinary) {
    let meta = state.clients.get(ws);

    if (isBinary) {
      if (!meta) return false;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      // Chấp nhận Raw JPEG (0xFF 0xD8) từ iPhone hoặc ESP32-CAM WS Publisher
      if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        if (meta.role === 'front_cam_publisher') {
          broadcastJpegFrame('front', buf);
          return true;
        }
        if (meta.role === 'rear_cam_publisher') {
          broadcastJpegFrame('rear', buf);
          return true;
        }
      }
      return false;
    }

    let msg;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));
    } catch {
      return false;
    }

    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('rc_')) {
      return false; // Không phải message của RC -> trả về false để handler cũ của Baseline xử lý bình thường
    }

    if (!meta) {
      meta = { id: crypto.randomUUID(), role: 'unregistered', subscribedCamera: 'front' };
      state.clients.set(ws, meta);
      ws.once('close', () => handleWsClose(ws));
    }

    switch (msg.type) {
      case 'rc_register': {
        const allowedRoles = ['twin_controller', 'front_cam_publisher', 'rear_cam_publisher', 'diagnostic'];
        if (!allowedRoles.includes(msg.role)) return true;
        meta.role = msg.role;
        if (msg.role === 'twin_controller' && !state.activeControllerId) {
          state.activeControllerId = meta.id;
        }
        ws.send(JSON.stringify({
          type: 'rc_registered',
          clientId: meta.id,
          role: meta.role,
          isPrimaryController: state.activeControllerId === meta.id
        }));
        ws.send(JSON.stringify({ type: 'rc_arm_state', armed: state.armed }));
        if (msg.role === 'twin_controller' && config.rearCamProtocol === 'http-mjpeg') {
          startRearMjpegPuller();
        }
        return true;
      }

      case 'rc_arm_request': {
        if (meta.role !== 'twin_controller' || state.activeControllerId !== meta.id) {
          ws.send(JSON.stringify({ type: 'rc_error', error: 'NOT_PRIMARY_CONTROLLER' }));
          return true;
        }
        state.armed = Boolean(msg.arm);
        state.lastCommandTs = Date.now();
        sendUdpToEsp32(90, 1500);
        broadcastToControllers({
          type: 'rc_arm_state',
          armed: state.armed,
          neutralPacket: { steeringDeg: 90, escPulseUs: 1500 }
        });
        return true;
      }

      case 'rc_disarm':
      case 'rc_emergency_stop': {
        if (meta.role === 'twin_controller' || meta.role === 'diagnostic') {
          disarmAndNeutral(msg.type === 'rc_emergency_stop' ? 'EMERGENCY_STOP' : (msg.reason || 'USER_DISARM'));
        }
        return true;
      }

      case 'rc_control': {
        if (meta.role !== 'twin_controller' || state.activeControllerId !== meta.id || !state.armed) {
          return true;
        }
        const steer = Number(msg.steeringDeg);
        const esc = Number(msg.escPulseUs);
        if (!Number.isFinite(steer) || !Number.isFinite(esc)) {
          return true;
        }
        state.lastCommandTs = Date.now();
        sendUdpToEsp32(steer, esc);
        return true;
      }

      case 'rc_camera_select': {
        if (msg.view === 'front' || msg.view === 'rear') {
          meta.subscribedCamera = msg.view;
        }
        return true;
      }

      default:
        return true;
    }
  }

  function handleWsClose(ws) {
    const meta = state.clients.get(ws);
    if (!meta) return;
    state.clients.delete(ws);

    if (state.activeControllerId === meta.id) {
      state.activeControllerId = null;
      disarmAndNeutral('PRIMARY_CONTROLLER_DISCONNECTED');
      for (const nextMeta of state.clients.values()) {
        if (nextMeta.role === 'twin_controller') {
          state.activeControllerId = nextMeta.id;
          break;
        }
      }
    }

    if (!hasActiveControllerClients()) {
      stopRearMjpegPuller();
    }
  }

  function close() {
    clearInterval(watchdogTimer);
    stopRearMjpegPuller();
    disarmAndNeutral('SERVER_SHUTDOWN');
    try {
      udpClient.close();
    } catch {
      // Socket đã đóng
    }
  }

  return {
    config,
    state,
    registerExpressRoutes,
    handleWsMessage,
    handleWsClose,
    disarmAndNeutral,
    close
  };
}

module.exports = {
  createRCBridge,
  buildEsp32ControlPacket,
  loadNetworkConfig,
  MAGIC_FRONT_JPEG,
  MAGIC_REAR_JPEG
};
