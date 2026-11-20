'use strict';

const { isTrustedLocalControlRequest, hardwareActions } = require('./local-control-guard');

/** UDP arbitration, ESP32 command output and native GOG808 bridge. */
function attachUnifiedInputAndBridgeServer(ctx) {
  'use strict';
  const {
    serverDir, nativeWheelSource,
    HTTP_PORT, activeMultiplayerSockets, discoveredEsp32Cams, esp32CarConfig,
    getEffectiveCamEndpoints, getLocalLanIp, rcBatteryEstimator, udpServer,
  } = ctx;

  const os = require('os');
  const http = require('http');
  const dgram = require('dgram');
  const WebSocket = require('ws');

  const ESP32_HOST = process.env.ESP32_CONTROLLER_HOST || process.env.ESP32_CAR_IP || '192.168.1.238';
  const ESP32_PORT = Number(process.env.ESP32_CONTROLLER_UDP_PORT || process.env.ESP32_CAR_PORT || 4210);

  const udpOutSocket = dgram.createSocket('udp4');
  udpOutSocket.on('error', () => {});

  let lastUdpSendMs = 0;
  let lastSteerDegSent = 90;
  let lastEscUsSent = 1500;

  // ============================================================================
  // [V504 RESTORED + 1100µs REVERSE] BỘ TRỌNG TÀI ƯU TIÊN VÔ LĂNG & UDP 4210 CHUẨN
  // ============================================================================
  const serverStartTime = Date.now();

  const rcArbitration = {
    lastPhysicalWheelActiveAt: 0,
    lastSentSteerDeg: 90,
    lastSentEscUs: 1500,
    currentSlewEscUs: 1500,
    idleNeutralCount: 0,
    lastUdpSendMs: 0,
    WHEEL_PRIORITY_WINDOW_MS: 350
  };

  // Trạng thái sự kiện gần nhất để chỉ in log 1 lần khi có thay đổi thực tế (Event-driven)
  const rcEventState = {
    action: 'DỪNG',
    steerSector: 'THẲNG',
    lastLoggedSteerDeg: 90,
    lastLoggedEscUs: 1500,
    lastLoggedSteerTime: 0
  };

  // Tính toán xung điều tốc ESC mượt mà, triệt tiêu giật bắn và tiếng kêu hú motor
  function computeAsymmetricEscPulseUs(driveNorm, explicitPulseUs, gear = 'D') {
    const rawExplicit = Number(explicitPulseUs);
    if (Number.isFinite(rawExplicit) && rawExplicit >= 1000 && rawExplicit <= 2000 && Math.abs(rawExplicit - 1500) > 15) {
      if (rawExplicit < 1445 && rawExplicit >= 1250 && driveNorm < -0.05) {
        const revMag = Math.min(1, Math.max(0, Math.abs(driveNorm)));
        return Math.round(1480 - Math.pow(revMag, 1.35) * 380);
      }
      return Math.round(rawExplicit);
    }

    const d = Math.max(-1, Math.min(1, Number(driveNorm) || 0));
    // Vùng chết an toàn 4.5% - Đảm bảo triệt để khi xe dừng/khởi động server ESC nhận chuẩn 1500µs, không bao giờ bị kêu hú motor
    if (Math.abs(d) <= 0.045) return 1500;

    if (d > 0.045 && gear !== 'R') {
      // TIẾN: Ramping êm ái từ 1522µs đến 1850µs (Lũy thừa 1.6 chống giật bắn)
      const normD = (d - 0.045) / 0.955;
      return Math.round(1522 + Math.pow(normD, 1.6) * 328);
    } else {
      // LÙI: Ramping êm ái từ 1478µs xuống 1100µs (Lũy thừa 1.35 đạt 1100µs chuẩn v504)
      const revMag = (Math.abs(d) - 0.045) / 0.955;
      return Math.round(1478 - Math.pow(revMag, 1.35) * 378);
    }
  }

  // Hàm duy nhất gửi tín hiệu qua UDP tới mạch ESP32 Xe RC
  function sendRateLimitedEsp32Udp(steerNorm, driveNorm, explicitEscPulseUs, gear = 'D', source = 'UNKNOWN') {
    const now = Date.now();
    const rawS = Math.max(-1, Math.min(1, Number(steerNorm) || 0));
    const rawD = Math.max(-1, Math.min(1, Number(driveNorm) || 0));

    // Lọc deadzone sạch sẽ chống rung cảm biến DirectInput
    const sNorm = Math.abs(rawS) < 0.035 ? 0 : rawS;
    const dNorm = Math.abs(rawD) < 0.045 ? 0 : rawD;

    const isInputActive = sNorm !== 0 || dNorm !== 0 ||
      (Number.isFinite(Number(explicitEscPulseUs)) && Math.abs(Number(explicitEscPulseUs) - 1500) > 20);

    if (isInputActive) {
      rcArbitration.idleNeutralCount = 0;
      if (source === nativeWheelSource) {
        rcArbitration.lastPhysicalWheelActiveAt = now;
      }
    } else {
      // Khi xe ở trạng thái nghỉ: Duy trì nhịp heartbeat 350ms gửi gói Neutral [90°, 1500µs]
      // để duy trì failsafe ESP32 luôn an toàn, không bị mất tín hiệu hoặc nhiễu
      if (now - rcArbitration.lastUdpSendMs < 350) {
        return;
      }
    }

    // Khóa trọng tài: Nếu vô lăng USB vật lý trên host (WINMM_USB) đang kết nối hoặc vừa hoạt động,
    // TUYỆT ĐỐI BỎ QUA mọi nguồn điều khiển khác (WHEEL_BRIDGE, QUEST_CAR_CONTROL, UDP_CAR_CMD) để chống xung đột và ga/lùi ảo từ trình duyệt!
    const isNativeWheelMaster = Boolean(latestBridgeState && latestBridgeState.connected && latestBridgeState.source === 'GOG808_NATIVE' && (now - (latestBridgeState.timestamp || 0) < 2000));
    if (source !== nativeWheelSource &&
        (isNativeWheelMaster || (now - rcArbitration.lastPhysicalWheelActiveAt < rcArbitration.WHEEL_PRIORITY_WINDOW_MS))) {
      return;
    }

    // Tự động báo Điện Thoại FPV đổi mặt camera khi vào số lùi (R) hoặc tiến (D)
    let effectiveGear = String(gear || 'D').toUpperCase();
    if (dNorm < -0.04) {
      effectiveGear = 'R';
    } else if (dNorm > 0.04) {
      effectiveGear = 'D';
    }
    const desiredSurface = effectiveGear === 'R' ? 'rear' : 'front';
    if (globalThis.__lastFpvSurface !== desiredSurface) {
      globalThis.__lastFpvSurface = desiredSurface;
      const switchPkt1 = JSON.stringify({ type: 'SWITCH_FPV_SURFACE', surface: desiredSurface, gear: effectiveGear });
      const switchPkt2 = JSON.stringify({ type: 'FPV_SWITCH_CAMERA', surface: desiredSurface, gear: effectiveGear });
      for (const client of activeMultiplayerSockets) {
        if (client.readyState === 1) {
          try {
            client.send(switchPkt1);
            client.send(switchPkt2);
          } catch (e) {}
        }
      }
    }

    // Góc lái chuẩn RC Servo (V504): 45° (phải) .. 90° (thẳng) .. 135° (trái)
    let steerDeg = Math.max(45, Math.min(135, Math.round(90 - sNorm * 45)));
    let targetEscUs = computeAsymmetricEscPulseUs(dNorm, explicitEscPulseUs, effectiveGear);

    // KHÓA AN TOÀN KHỞI ĐỘNG (Startup Safety Gate 3.0s):
    // Trong 3 giây đầu khi server mới bật, KHÓA CỨNG xung ga ở 1500µs (Neutral) và lái ở 90°,
    // tuyệt đối không phát bất kỳ xung ga tiến/lùi nào để chờ phần cứng và driver vô lăng ổn định!
    if (now - serverStartTime < 3000) {
      steerDeg = 90;
      targetEscUs = 1500;
      rcArbitration.currentSlewEscUs = 1500;
    }

    // Bộ lọc Slew Rate Limiter chống giật xung đột ngột
    if (targetEscUs === 1500) {
      // Trả về neutral dứt khoát triệt tiêu tiếng hú motor
      if (Math.abs(rcArbitration.currentSlewEscUs - 1500) <= 80) {
        rcArbitration.currentSlewEscUs = 1500;
      } else if (rcArbitration.currentSlewEscUs > 1500) {
        rcArbitration.currentSlewEscUs -= 80;
      } else {
        rcArbitration.currentSlewEscUs += 80;
      }
    } else {
      const maxSlewPerTick = 45;
      if (targetEscUs > rcArbitration.currentSlewEscUs) {
        rcArbitration.currentSlewEscUs = Math.min(targetEscUs, rcArbitration.currentSlewEscUs + maxSlewPerTick);
      } else if (targetEscUs < rcArbitration.currentSlewEscUs) {
        rcArbitration.currentSlewEscUs = Math.max(targetEscUs, rcArbitration.currentSlewEscUs - maxSlewPerTick);
      }
    }
    const escPulseUs = rcArbitration.currentSlewEscUs;

    // Giới hạn tần số gửi gói tin UDP:
    // - Khi xe đang có thao tác lái/ga: duy trì dòng xung liên tục ~22Hz (45ms) để servo giữ góc vững, tuyệt đối không bị dính failsafe ESP32 500ms
    // - Khi xe đứng yên ở neutral: giãn cách heartbeat 250ms để tiết kiệm băng thông và chống tràn log
    const isActivelyControlling = (sNorm !== 0 || dNorm !== 0 || targetEscUs !== 1500 || steerDeg !== 90);
    const keepaliveIntervalMs = isActivelyControlling ? 45 : 250;
    const changed = (steerDeg !== rcArbitration.lastSentSteerDeg) || (escPulseUs !== rcArbitration.lastSentEscUs);
    if (!changed && (now - rcArbitration.lastUdpSendMs < keepaliveIntervalMs)) return;
    if (now - rcArbitration.lastUdpSendMs < 25) return;

    rcArbitration.lastUdpSendMs = now;
    rcArbitration.lastSentSteerDeg = steerDeg;
    rcArbitration.lastSentEscUs = escPulseUs;

    // --- CƠ CHẾ LOG SỰ KIỆN DUY NHẤT (STRICT EVENT-DRIVEN: CHỈ IN 1 LẦN KHI SỰ KIỆN THAY ĐỔI) ---
    const action = escPulseUs > 1520 ? 'TIẾN' : (escPulseUs < 1480 ? 'LÙI' : 'DỪNG');
    const steerSector = steerDeg < 85 ? 'PHẢI' : (steerDeg > 95 ? 'TRÁI' : 'THẲNG');
    const actionChanged = action !== rcEventState.action;
    const steerSectorChanged = steerSector !== rcEventState.steerSector && (now - (rcEventState.lastLoggedSteerTime || 0) > 600);

    if (actionChanged || steerSectorChanged) {
      rcEventState.action = action;
      rcEventState.steerSector = steerSector;
      rcEventState.lastLoggedSteerDeg = steerDeg;
      rcEventState.lastLoggedEscUs = escPulseUs;

      if (actionChanged) {
        if (action === 'TIẾN') {
          const gasPct = Math.round(((escPulseUs - 1520) / 330) * 100);
          console.log(`🏎️ [RC EVENT] TIẾN | Ga: ${escPulseUs}µs (~${Math.max(1, gasPct)}%) | Lái: ${steerDeg}° [${steerSector}] (${source})`);
        } else if (action === 'LÙI') {
          const revPct = Math.round(((1480 - escPulseUs) / 380) * 100);
          console.log(`🔙 [RC EVENT] LÙI | Ga: ${escPulseUs}µs (~${Math.max(1, revPct)}%) | Lái: ${steerDeg}° [${steerSector}] (${source})`);
        } else if (action === 'DỪNG') {
          console.log(`🛑 [RC EVENT] DỪNG XE (Neutral 1500µs) | Lái: ${steerDeg}° [${steerSector}] (${source})`);
        }
      } else if (steerSectorChanged) {
        rcEventState.lastLoggedSteerTime = now;
        console.log(`🛞 [RC EVENT] ĐÁNH LÁI: ${steerDeg}° [${steerSector}] (${source})`);
      }
    }

    const targetHost = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.ip) ? esp32CarConfig.ip : ESP32_HOST;
    const targetPort = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.port) ? esp32CarConfig.port : ESP32_PORT;

    const pkt = Buffer.alloc(4);
    pkt.writeInt16LE(steerDeg, 0);
    rcBatteryEstimator.recordControlInput({ escPulseUs, steerDeg, gear: effectiveGear, source, nowMs: now });
    pkt.writeInt16LE(escPulseUs, 2);
    const activeUdpSocket = (typeof udpOutSocket !== 'undefined' && udpOutSocket) ? udpOutSocket : udpServer;
    try {
      if (activeUdpSocket) {
        activeUdpSocket.send(pkt, 0, 4, targetPort, targetHost, (err) => {
          if (!err && typeof esp32CarConfig !== 'undefined' && esp32CarConfig) {
            esp32CarConfig.lastSentTime = now;
            esp32CarConfig.packetsSent++;
          }
        });
      }
    } catch (e) {}
  }

  // Xuất ra globalThis để sendUdpCarCommand sử dụng thống nhất 1 socket và 1 bộ trọng tài
  globalThis.sendRateLimitedEsp32Udp = sendRateLimitedEsp32Udp;
  globalThis.rcArbitration = rcArbitration;

  function getLanIpv4List() {
    const list = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      if (/vmware|vbox|vethernet|wsl|tailscale|loopback|tun|tap/i.test(name)) continue;
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
          list.push(net.address);
        }
      }
    }
    return list.length ? list : ['127.0.0.1'];
  }

  const latestBridgeState = globalThis.latestBridgeState;

  // Endpoint nhẹ cho phép kính VR khám phá IP LAN một lần khi khởi động
  if (!http.Server.prototype.__unifiedBridgePingBound) {
    http.Server.prototype.__unifiedBridgePingBound = true;
    const origEmit = http.Server.prototype.emit;
    http.Server.prototype.emit = function (event, req, res, ...rest) {
      if (event === 'request' && req && res && req.url && req.url.startsWith('/api/bridge-ping')) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
          ok: true,
          service: 'GOG808_LAPTOP_BRIDGE',
          ips: getLanIpv4List(),
          wheel: latestBridgeState,
          car: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig) ? esp32CarConfig : { ip: '192.168.1.238', port: 4210 },
          cams: (typeof discoveredEsp32Cams !== 'undefined') ? discoveredEsp32Cams : {},
          timestamp: Date.now()
        }));
        return true;
      }
      return origEmit.call(this, event, req, res, ...rest);
    };
  }

  function bindUnifiedWss(wssInstance) {
    if (!wssInstance || wssInstance.__unifiedInputBound) return;
    wssInstance.__unifiedInputBound = true;

    wssInstance.on('connection', (ws, req) => {
      const reqUrl = (req && req.url) || '';
      if (reqUrl.includes('/esp32-front-ws') || reqUrl.includes('/esp32-rear-ws')) {
        return;
      }
      if (ws.readyState === WebSocket.OPEN) {
        if (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) {
        activeMultiplayerSockets.add(ws);
        ws.on('close', () => activeMultiplayerSockets.delete(ws));
        ws.on('error', () => activeMultiplayerSockets.delete(ws));
      }
      const unifiedCams = typeof getEffectiveCamEndpoints === 'function' ? getEffectiveCamEndpoints() : {
        front: discoveredEsp32Cams.front,
        rear: discoveredEsp32Cams.rear
      };
      ws.send(JSON.stringify({
          type: 'SERVER_LAN_INFO',
          ips: getLanIpv4List(),
          lanIp: typeof getLocalLanIp === 'function' ? getLocalLanIp() : (getLanIpv4List()[0] || '127.0.0.1'),
          port: typeof HTTP_PORT === 'number' ? HTTP_PORT : 8080,
          publicTunnelUrl: unifiedCams.publicTunnelUrl || null,
          fpvPhone: unifiedCams.fpvPhone || null,
          car: {
            ip: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.ip) ? esp32CarConfig.ip : '192.168.1.238',
            port: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.port) ? esp32CarConfig.port : 4210
          },
          cams: unifiedCams
        }));
        try {
          ws.send(JSON.stringify({
            type: 'CAM_IP_UPDATED',
            cams: unifiedCams,
            fpvPhone: unifiedCams.fpvPhone || null,
            publicTunnelUrl: unifiedCams.publicTunnelUrl || null,
            front: unifiedCams.front,
            rear: unifiedCams.rear
          }));
        } catch (e) {}
        if (latestBridgeState.connected && (Date.now() - latestBridgeState.timestamp < 2000)) {
          ws.send(JSON.stringify({
            type: 'WHEEL_BRIDGE_STATE',
            ...latestBridgeState
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'WHEEL_BRIDGE_STATE',
            connected: false,
            source: 'NONE',
            deviceId: 'None (Disconnected)',
            steerNorm: 0,
            gasNorm: 0,
            brakeNorm: 0,
            driveNorm: 0,
            gear: 'D',
            timestamp: Date.now()
          }));
        }
      }

      ws.on('message', (raw, isBinary) => {
        if (isBinary) return;
        let data;
        try {
          const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
          if (!str.startsWith('{')) return;
          data = JSON.parse(str);
        } catch (e) {
          return;
        }
        if (!data || typeof data !== 'object') return;
        if (hardwareActions.has(data.type) && !isTrustedLocalControlRequest(req)) return;

        // 1. Nhận tín hiệu GOG R808 đã chuẩn hóa từ Laptop (Admin) và đồng bộ sang Kính VR
        if (data.type === 'WHEEL_BRIDGE_INPUT') {
          const src = data.payload || data;
          const steerNorm = Number(Math.max(-1, Math.min(1, Number(src.steerNorm ?? src.steeringNorm ?? 0))).toFixed(4));
          const gasNorm = Number(Math.max(0, Math.min(1, Number(src.gasNorm ?? (typeof src.gasPercent === 'number' ? src.gasPercent / 100 : 0))).toFixed(4)));
          const brakeNorm = Number(Math.max(0, Math.min(1, Number(src.brakeNorm ?? (typeof src.brakePercent === 'number' ? src.brakePercent / 100 : 0))).toFixed(4)));
          const reverseNorm = Number(Math.max(0, Math.min(1, Number(src.reverseNorm ?? (typeof src.reversePercent === 'number' ? src.reversePercent / 100 : 0))).toFixed(4)));
          const driveNorm = Number(Math.max(-1, Math.min(1, Number(src.driveNorm ?? (gasNorm - brakeNorm - reverseNorm)))).toFixed(4));
          const gear = src.gear || (brakeNorm > 0.04 && gasNorm < 0.03 ? 'R' : (reverseNorm > 0.04 ? 'R' : 'D'));
          const buttonEvents = Array.isArray(src.buttonEvents) ? src.buttonEvents : [];

          latestBridgeState.connected = Boolean(src.connected !== false);
          latestBridgeState.source = src.source || 'BROWSER_BRIDGE';
          latestBridgeState.steerNorm = steerNorm;
          latestBridgeState.gasNorm = gasNorm;
          latestBridgeState.brakeNorm = brakeNorm;
          latestBridgeState.reverseNorm = reverseNorm;
          latestBridgeState.driveNorm = driveNorm;
          latestBridgeState.gear = gear;
          latestBridgeState.seq = (latestBridgeState.seq + 1) % 1000000;
          latestBridgeState.timestamp = Date.now();

          const outMsg = JSON.stringify({
            type: 'WHEEL_BRIDGE_STATE',
            connected: latestBridgeState.connected,
            steerNorm,
            steeringNorm: steerNorm,
            steerAngleDeg: Math.max(-540, Math.min(540, Math.round(steerNorm * 540))),
            gasNorm,
            brakeNorm,
            reverseNorm: gear === 'R' ? Math.max(brakeNorm, reverseNorm) : reverseNorm,
            driveNorm,
            throttleNorm: driveNorm,
            gasPercent: Math.round(gasNorm * 100),
            brakePercent: Math.round(brakeNorm * 100),
            reversePercent: gear === 'R' ? Math.round(Math.max(brakeNorm, reverseNorm) * 100) : Math.round(reverseNorm * 100),
            gear,
            steer: Math.max(45, Math.min(135, Math.round(90 - steerNorm * 45))),
            throttle: Math.max(1000, Math.min(2000, Math.round(1500 + driveNorm * 260))),
            buttonEvents,
            seq: latestBridgeState.seq,
            timestamp: latestBridgeState.timestamp
          });

          if (wssInstance.clients) {
            wssInstance.clients.forEach((client) => {
              // Chỉ gửi khi buffer của client thông thoáng (< 64KB) để tránh dồn gói gây giật lag
              if (client !== ws && client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) {
                client.send(outMsg);
              }
            });
          }

          sendRateLimitedEsp32Udp(steerNorm, driveNorm, null, gear, 'WHEEL_BRIDGE');
          return;
        }

        // 2. Nhận lệnh điều khiển từ Bàn phím (Localhost) hoặc Tay cầm VR (Kính) gửi xuống ESP32
        if (data.type === 'RC_CONTROL_CMD' || data.type === 'CAR_CONTROL') {
          let sNorm = 0;
          if (data.steeringNorm !== undefined || data.steerNorm !== undefined) {
            sNorm = Number(data.steeringNorm ?? data.steerNorm ?? 0);
          } else if (data.steer !== undefined || data.steeringDeg !== undefined) {
            const rawS = Math.max(45, Math.min(135, Math.round(Number(data.steer ?? data.steeringDeg) || 90)));
            sNorm = (rawS - 90) / 45;
          }
          let dNorm = 0;
          let explicitPulse = null;
          if (data.throttleNorm !== undefined || data.driveNorm !== undefined) {
            dNorm = Number(data.throttleNorm ?? data.driveNorm ?? 0);
          } else if (data.throttle !== undefined || data.escPulseUs !== undefined) {
            const rawT = Math.max(1050, Math.min(1950, Math.round(Number(data.throttle ?? data.escPulseUs) || 1500)));
            dNorm = (rawT - 1500) / 350;
            explicitPulse = rawT;
          }
          sendRateLimitedEsp32Udp(sNorm, dNorm, explicitPulse, data.gear || (dNorm < -0.02 ? 'R' : 'D'), 'QUEST_CAR_CONTROL');
          return;
        }
      });
    });
  }

  if (typeof wss !== 'undefined' && wss) {
    bindUnifiedWss(wss);
  }
  const WssProto = WebSocket.Server ? WebSocket.Server.prototype : null;
  if (WssProto && !WssProto.__unifiedProtoHooked) {
    WssProto.__unifiedProtoHooked = true;
    const origOn = WssProto.on;
    WssProto.on = function (evt, listener) {
      if (evt === 'connection') bindUnifiedWss(this);
      return origOn.call(this, evt, listener);
    };
  }


  // --------------------------------------------------------------------------
  



  // --------------------------------------------------------------------------
  // BỘ ĐỌC NATIVE VÔ LĂNG GOG R808 TỰ ĐỘNG KHỞI CHẠY TRÊN WINDOWS HOST
  // (Không cần mở trình duyệt localhost, Kính Quest 3 nhận ngay lập tức!)
  // --------------------------------------------------------------------------
  const { spawn: spawnProcess } = require('child_process');
  const pathModule = require('path');
  const fsModule = require('fs');

  let nativeWheelChild = null;
  let lastTerminalLogMs = 0;

  function startNativeWheelBridge() {
    if (process.platform !== 'win32') return;
    const exeCandidates = [
      pathModule.join(serverDir, 'tools', 'gog808_native_bridge.exe'),
      pathModule.join(serverDir, '..', 'tools', 'gog808_native_bridge.exe'),
      pathModule.resolve('tools/gog808_native_bridge.exe')
    ];
    const exePath = exeCandidates.find(p => fsModule.existsSync(p));
    if (!exePath) {
      console.warn('⚠️ [GOG808 NATIVE] Không tìm thấy file gog808_native_bridge.exe');
      return;
    }

    try {
      if (nativeWheelChild) {
        try { nativeWheelChild.kill(); } catch (e) {}
        nativeWheelChild = null;
      }
      nativeWheelChild = spawnProcess(exePath, [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (e) {
      console.warn('⚠️ [GOG808 NATIVE] Lỗi khởi chạy native bridge:', e.message);
      return;
    }

    console.log('✅ [V503 USB] Đã nhận diện Vô lăng GOG R808 tại cổng ID=0 (Native Host 50Hz)');

    let buf = '';
    nativeWheelChild.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
          const data = JSON.parse(trimmed);
          if (data && data.type === 'WHEEL_BRIDGE_STATE') {
            if (data.connected) {
              latestBridgeState.connected = true;
              latestBridgeState.source = 'GOG808_NATIVE';
            latestBridgeState.steerNorm = data.steerNorm;
            latestBridgeState.gasNorm = data.gasNorm;
            latestBridgeState.brakeNorm = data.brakeNorm;
            latestBridgeState.reverseNorm = data.reverseNorm;
            latestBridgeState.driveNorm = data.driveNorm;
            latestBridgeState.gear = data.gear;
            latestBridgeState.seq = data.seq;
            latestBridgeState.timestamp = Date.now();

            const clientCount = (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) ? activeMultiplayerSockets.size : 0;

            const outMsg = JSON.stringify({
              type: 'WHEEL_BRIDGE_STATE',
              connected: true,
              source: 'GOG808_NATIVE',
              deviceId: 'GOG R808 (Native Host)',
              steerNorm: data.steerNorm,
              steeringNorm: data.steerNorm,
              steerAngleDeg: Math.max(-540, Math.min(540, Math.round(data.steerNorm * 540))),
              gasNorm: data.gasNorm,
              brakeNorm: data.brakeNorm,
              reverseNorm: data.reverseNorm,
              driveNorm: data.driveNorm,
              throttleNorm: data.driveNorm,
              gasPercent: Math.round(data.gasNorm * 100),
              brakePercent: Math.round(data.brakeNorm * 100),
              reversePercent: Math.round(data.reverseNorm * 100),
              gear: data.gear,
              steer: Math.max(45, Math.min(135, Math.round(90 - data.steerNorm * 45))),
              throttle: Math.max(1000, Math.min(2000, Math.round(1500 + data.driveNorm * 260))),
              buttonEvents: [],
              seq: data.seq,
              timestamp: latestBridgeState.timestamp
            });

            // Phát sóng tới toàn bộ WebSocket clients (Kính Quest 3, Mobile, v.v.)
            if (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) {
              for (const client of activeMultiplayerSockets) {
                if (client && client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) {
                  try { client.send(outMsg); } catch (err) {}
                }
              }
            }

            // Gửi xuống ESP32 RC Car qua UDP (Port 4210)
            sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, null, data.gear, nativeWheelSource);
          } else {
            // Khi rút dây USB GOG808 hoặc không tìm thấy joystick:
            if (latestBridgeState.connected || rcArbitration.lastPhysicalWheelActiveAt > 0) {
              latestBridgeState.connected = false;
              rcArbitration.lastPhysicalWheelActiveAt = 0;
              console.log('🔌 [GOG808] Vô lăng USB ngắt kết nối -> Nhượng quyền điều khiển cho Kính VR / Tay cầm!');
              const outMsg = JSON.stringify({
                type: 'WHEEL_BRIDGE_STATE',
                connected: false,
                source: 'GOG808_NATIVE',
                deviceId: 'None (Disconnected)',
                steerNorm: 0,
                gasNorm: 0,
                brakeNorm: 0,
                driveNorm: 0,
                gear: 'D',
                timestamp: Date.now()
              });
              if (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) {
                for (const client of activeMultiplayerSockets) {
                  if (client && client.readyState === WebSocket.OPEN) {
                    try { client.send(outMsg); } catch (err) {}
                  }
                }
              }
            }
          }
        }
      } catch (e) {}
      }
    });

    nativeWheelChild.stderr.on('data', (d) => {
      const errStr = d.toString('utf8');
      if (errStr.includes('CALIBRATED_REST')) {
        console.log('⚙️ [GOG808 NATIVE]', errStr.trim());
      }
    });

    nativeWheelChild.on('exit', () => {
      nativeWheelChild = null;
      if (latestBridgeState.connected) {
        latestBridgeState.connected = false;
        rcArbitration.lastPhysicalWheelActiveAt = 0;
        const outMsg = JSON.stringify({
          type: 'WHEEL_BRIDGE_STATE',
          connected: false,
          source: 'GOG808_NATIVE',
          deviceId: 'None (Disconnected)',
          timestamp: Date.now()
        });
        if (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) {
          for (const client of activeMultiplayerSockets) {
            if (client && client.readyState === WebSocket.OPEN) {
              try { client.send(outMsg); } catch (err) {}
            }
          }
        }
      }
      setTimeout(startNativeWheelBridge, 2500);
    });

    process.on('exit', () => {
      if (nativeWheelChild) {
        try { nativeWheelChild.kill(); } catch (e) {}
        nativeWheelChild = null;
      }
    });
  }

  startNativeWheelBridge();
}

function clampNum(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function computeSafeEscPulseUs(msg) {
  const rawBrake = clampNum(msg.brakeNorm ?? msg.brake ?? 0, 0, 1, 0);
  const gear = String(msg.gear || 'D').toUpperCase();

  // 1. Nếu có lệnh phanh chủ động -> cắt ga đưa về trung tính 1500 µs ngay lập tức (không bao giờ lùi)
  if (rawBrake > 0.05) {
    return 1500;
  }

  // 2. Nếu client gửi trực tiếp xung micro-giây (ví dụ CAR_CONTROL: { steer: 90, throttle: 1500 })
  if (msg.escPulseUs !== undefined || (msg.throttle !== undefined && Math.abs(Number(msg.throttle)) >= 500)) {
    const rawUs = clampNum(msg.escPulseUs ?? msg.throttle, 1150, 1850, 1500);
    if (rawUs > 1520) {
      lastMovingForwardAt = Date.now();
      return Math.round(rawUs);
    }
    if (rawUs < 1480) {
      // Interlock: Nếu vừa mới chạy tiến trong vòng 350ms và chưa sang số R, khóa ở 1500 µs để tránh biến phanh thành lùi
      if (gear !== 'R' && (Date.now() - lastMovingForwardAt < 350)) {
        return 1500;
      }
      return Math.round(rawUs);
    }
    return 1500;
  }

  // 3. Nếu client gửi giá trị chuẩn hóa [-1..1] (throttleNorm / steerNorm / steeringNorm)
  const normDrive = clampNum(msg.throttleNorm ?? msg.throttle ?? 0, -1, 1, 0);
  if (normDrive > 0.02) {
    if (gear === 'R') {
      // Đang cài số R và đạp ga -> Lùi trong dải an toàn [1500..1300 µs]
      return Math.round(1500 - normDrive * 200);
    }
    lastMovingForwardAt = Date.now();
    // Đang ở số D và đạp ga -> Tiến trong dải an toàn [1500..1700 µs]
    return Math.round(1500 + normDrive * 200);
  }

  if (normDrive < -0.02) {
    // Nếu giá trị âm được gửi khi chưa gạt số R và xe vừa tiến -> coi là phanh dừng (1500 µs)
    if (gear !== 'R' && (Date.now() - lastMovingForwardAt < 350)) {
      return 1500;
    }
    return Math.round(1500 + normDrive * 200); // normDrive âm -> [1500..1300 µs]
  }

  return 1500;
}

/** Attach the UDP discovery and telemetry listener to the server socket. */
function attachUdpTelemetry({ udpServer, discoveredEsp32Cams, esp32CarConfig, broadcastCameraIpUpdate }) {
  // Hàm gửi xung Neutral trực tiếp tới ESP32 Car để arming an toàn ngay lập tức
  function sendDirectNeutralPulseToCar(targetIp, targetPort) {
    if (!targetIp) return;
    const p = Buffer.alloc(4);
    p.writeInt16LE(90, 0);   // 90° thẳng lái
    p.writeInt16LE(1500, 2); // 1500µs Neutral dừng an toàn tuyệt đối
    try {
      udpServer.send(p, 0, 4, Number(targetPort || 4210), targetIp, () => {});
      if (typeof udpOutSocket !== 'undefined' && udpOutSocket) {
        udpOutSocket.send(p, 0, 4, Number(targetPort || 4210), targetIp, () => {});
      }
    } catch (e) {}
  }

  // Hàm gửi gói tin nhị phân 4 bytes [int16_t steer, int16_t throttle] qua UDP tới ESP32 Xe RC Thật
  function sendUdpCarCommand(steer, throttle) {
    if (!esp32CarConfig.ip) return;
    // Ưu tiên ủy thác toàn bộ qua sendRateLimitedEsp32Udp duy nhất có bộ trọng tài phần cứng và slew rate chống giật
    if (typeof globalThis.sendRateLimitedEsp32Udp === 'function') {
      const rawS = Math.max(45, Math.min(135, Math.round(Number(steer) || 90)));
      const sNorm = (rawS - 90) / 45;
      const rawT = Math.max(1050, Math.min(1950, Math.round(Number(throttle) || 1500)));
      const dNorm = (rawT - 1500) / 350;
      globalThis.sendRateLimitedEsp32Udp(sNorm, dNorm, rawT, (rawT < 1490 ? 'R' : 'D'), 'UDP_CAR_CMD');
      return;
    }

    const rawS = Math.max(45, Math.min(135, Math.round(Number(steer) || 90)));
    const s = rawS;
    const t = Math.max(1050, Math.min(1950, Math.round(Number(throttle) || 1500)));

    const buf = Buffer.alloc(4);
    buf.writeInt16LE(s, 0);
    buf.writeInt16LE(t, 2);

    try {
      udpServer.send(buf, 0, 4, esp32CarConfig.port || 4210, esp32CarConfig.ip);
    } catch (err) {}
  }

  let latestEsp32Telemetry = {
    connected: false,
    lastPacketTime: 0,
    speedKmh: 0,
    steerDeg: 0,
    gear: 'P',
    rpm: 0,
    esp32RefSpeed: 1.0,
    obstacleHit: false,
    x: null,
    z: null,
    heading: null
  };

  udpServer.on('message', (msg, rinfo) => {
    try {
      const str = msg.toString().trim();
      const data = str.startsWith('{') ? JSON.parse(str) : {};

      // Tự động nhận diện IP của ESP32 Camera (Cam trước hoặc Cam lùi) khi đổi Wi-Fi (có chống spam flood log)
      if (data.type === 'ESP32_CAM' || data.type === 'ESP32_ANNOUNCE' || (data.cam && !data.speedKmh)) {
        const role = (data.role === 'rear' || data.cam === 'rear') ? 'rear' : 'front';
        const newCamIp = rinfo.address;
        const newCamPort = Number(data.port || 4213);
        const prevCam = discoveredEsp32Cams[role];
        const isNewCam = !prevCam || prevCam.ip !== newCamIp || prevCam.port !== newCamPort;
        const now = Date.now();

        discoveredEsp32Cams[role] = {
          ip: newCamIp,
          port: newCamPort,
          lastSeen: now,
          lastLoggedTime: prevCam ? prevCam.lastLoggedTime : 0
        };

        if (isNewCam) {
          discoveredEsp32Cams[role].lastLoggedTime = now;
          console.log(`📡 [AUTO-DISCOVERY UDP] Đã nhận diện ESP32 ${role.toUpperCase()}: ${newCamIp}:${newCamPort}`);
          if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
        }
        return; // Chỉ cập nhật IP Camera, KHÔNG ghi đè telemetry xe!
      }

      // Tự động nhận diện IP của Mạch Lái Xe ESP32 (Controller GPIO 12/13 qua UDP 4210)
      if (data.type === 'ESP32_CAR' || data.type === 'ESP32_CAR_ANNOUNCE' || data.role === 'car') {
        const newIp = rinfo.address;
        const newPort = Number(data.port || 4210);
        const isNewCar = (esp32CarConfig.ip !== newIp) || (esp32CarConfig.port !== newPort);
        const now = Date.now();

        esp32CarConfig.ip = newIp;
        esp32CarConfig.port = newPort;
        esp32CarConfig.lastSeen = now;

        // Chống flood log Terminal: Chỉ in log khi IP/Port của mạch xe mới xuất hiện
        if (isNewCar) {
          esp32CarConfig.lastLoggedTime = now;
          console.log(`📡 [AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: ${newIp}:${newPort}`);
          if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
        }

        // ARMING KHÓA AN TOÀN TUYỆT ĐỐI (SAFETY ARMING):
        // Khi vừa nhận diện xe hoặc kết nối mới, phát ngay lệnh Neutral 1500µs cho ESC để khóa motor dừng hẳn!
        if (isNewCar) {
          sendDirectNeutralPulseToCar(newIp, newPort);
        }
        return;
      }

      // Chỉ nhận Telemetry nếu gói tin thực sự chứa thông số lái xe ESP32 Twin / Godot
      if (data.speedKmh !== undefined || data.speed !== undefined || data.steerDeg !== undefined || data.steer !== undefined) {
        latestEsp32Telemetry = {
          connected: true,
          lastPacketTime: Date.now(),
          remoteIp: rinfo.address,
          remotePort: rinfo.port,
          speedKmh: Number(data.speedKmh ?? data.speed ?? 0),
          steerDeg: Number(data.steerDeg ?? data.steer ?? 0),
          gear: data.gear || (Number(data.speedKmh) > 0.1 ? 'D' : Number(data.speedKmh) < -0.1 ? 'R' : 'P'),
          rpm: Number(data.rpm ?? 800),
          esp32RefSpeed: Number(data.esp32RefSpeed ?? data.refSpeed ?? 1.0),
          obstacleHit: Boolean(data.obstacleHit || data.crash),
          x: data.x !== undefined ? Number(data.x) : null,
          z: data.z !== undefined ? Number(data.z) : null,
          heading: data.heading !== undefined ? Number(data.heading) : null
        };
      }
    } catch (e) {}
  });

  return { sendUdpCarCommand, getLatestEsp32Telemetry: () => latestEsp32Telemetry };
}

module.exports = { attachUdpTelemetry, attachUnifiedInputAndBridgeServer, computeSafeEscPulseUs };
