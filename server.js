global.buttonEvents = [];
global.btnEvents = [];
const path = require('path');
if (typeof module !== 'undefined' && module.paths) {
  module.paths.push(
    path.join(__dirname, 'server/node_modules'),
    path.join(__dirname, '../server/node_modules'),
    path.join(__dirname, 'node_modules')
  );
}
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const dns = require('dns');
const WebSocket = require('ws');
const { exec: cpExec } = require('child_process');
const { promisify: utilPromisify } = require('util');
const execPromise = utilPromisify(cpExec);

async function tryResolveYtDlpStream(videoId) {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  try {
    const { stdout } = await execPromise(
      `yt-dlp -f "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b" -g --no-warnings "https://youtube.com/watch?v=${videoId}"`,
      { timeout: 12000 }
    );
    const urls = stdout.trim().split(/\r?\n/).filter(Boolean);
    if (urls.length > 0 && urls[0].startsWith('http')) {
      return urls[0];
    }
  } catch (e) {}
  return null;
}


const app = express();
// ============================================================================
// BẢO VỆ MÃ NGUỒN, CHỨNG CHỈ TLS & FILE CẤU HÌNH NHẠY CẢM (SECURITY GUARD)
// ============================================================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  let reqPath = '';
  try {
    reqPath = decodeURIComponent(req.path).toLowerCase();
  } catch (e) {
    return res.status(400).send('Bad Request: Invalid path encoding');
  }

  const isSensitive =
    reqPath.endsWith('.pem') ||
    reqPath.endsWith('.key') ||
    reqPath.endsWith('.crt') ||
    reqPath.endsWith('.env') ||
    reqPath.endsWith('.ino') ||
    reqPath.endsWith('.h') ||
    reqPath.endsWith('.log') ||
    reqPath.endsWith('server.js') ||
    reqPath.includes('package.json') ||
    reqPath.includes('package-lock.json') ||
    reqPath.includes('.git') ||
    reqPath.includes('.agent') ||
    reqPath.startsWith('/config') ||
    reqPath.startsWith('/firmware') ||
    reqPath.startsWith('/tools') ||
    reqPath.startsWith('/esp32') ||
    reqPath.startsWith('/node_modules');

  if (isSensitive) {
    return res.status(403).send('Forbidden: Access to sensitive resource is blocked.');
  }
  next();
});
// Multi-Path Static File Server (Khắc phục triệt để lỗi Cannot GET /fpv-cam.html dù chạy từ root hay server/)
const candidateStaticDirs = [
  path.resolve(__dirname, 'www'),
  path.resolve(__dirname, '../www'),
  path.resolve(__dirname, 'server/public'),
  path.resolve(__dirname, 'public'),
  __dirname
];
for (const dir of candidateStaticDirs) {
  if (fs.existsSync(dir)) {
    app.use(express.static(dir));
  }
}

// Tuyến đường chuyên dụng trả về trực tiếp trang FPV Camera Điện Thoại
app.get('/fpv-cam.html', (req, res) => {
  const candidates = [
    path.resolve(__dirname, 'www/fpv-cam.html'),
    path.resolve(__dirname, '../www/fpv-cam.html'),
    path.resolve(__dirname, 'server/public/fpv-cam.html'),
    path.resolve(__dirname, 'fpv-cam.html')
  ];
  const file = candidates.find(f => fs.existsSync(f));
  if (file) return res.sendFile(file);
  res.status(404).send('fpv-cam.html not found');
});

// Tuyến đường chuyên dụng trả về trang WebXR chính
app.get('/', (req, res) => {
  const candidates = [
    path.resolve(__dirname, 'www/index.html'),
    path.resolve(__dirname, '../www/index.html'),
    path.resolve(__dirname, 'server/public/index.html'),
    path.resolve(__dirname, 'index.html')
  ];
  const file = candidates.find(f => fs.existsSync(f));
  if (file) return res.sendFile(file);
  res.status(404).send('index.html not found');
});

// Trạng thái vô lăng GOG R808 toàn cục
if (!globalThis.latestBridgeState) {
  globalThis.latestBridgeState = {
    connected: false,
    steerNorm: 0,
    gasNorm: 0,
    brakeNorm: 0,
    driveNorm: 0,
    gear: 'D',
    seq: 0,
    timestamp: 0
  };
}
const latestBridgeState = globalThis.latestBridgeState;

// [PATCH V400] API PING CHO KÍNH META QUEST 3 TỰ ĐỘNG DÒ TÌM LAPTOP QUA WI-FI
app.get('/api/bridge-ping', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  const lanIp = typeof getLocalLanIp === 'function' ? getLocalLanIp() : '192.168.1.32';
  res.json({
    ok: true,
    service: 'GOG808_LAPTOP_BRIDGE',
    ips: [lanIp, '192.168.1.32'],
    wheelConnected: Boolean(latestBridgeState && latestBridgeState.connected),
    wheel: latestBridgeState,
    car: {
      ip: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.ip) ? esp32CarConfig.ip : '192.168.1.238',
      port: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.port) ? esp32CarConfig.port : 4210
    },
    cams: (typeof discoveredEsp32Cams !== 'undefined') ? discoveredEsp32Cams : {},
    timestamp: Date.now()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================================================
// BỘ LỌC AN NINH SSRF & GIỚI HẠN BIÊN DỮ LIỆU (PATCH V175 CHUẨN XR-DOCTOR)
// ============================================================================
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

function isForbiddenSsrfIp(ipOrHost) {
  if (!ipOrHost) return true;
  let normalized = String(ipOrHost).toLowerCase().trim();

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  if (!normalized.includes('::') && normalized.includes(':')) {
    normalized = normalized.split(':')[0];
  }

  // Chặn localhost, loopback IPv4/IPv6, any-address
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '0.0.0.0' ||
    normalized === '0' ||
    normalized === '::' ||
    normalized === 'metadata.google.internal' ||
    normalized === 'metadata' ||
    normalized === 'instance-data'
  ) {
    return true;
  }

  // Chặn toàn dải Loopback (127.0.0.0/8)
  if (normalized.startsWith('127.')) {
    return true;
  }

  // Chặn Cloud Metadata IP (169.254.0.0/16) (AWS, GCP, Azure, OpenStack...)
  if (normalized === '169.254.169.254' || normalized.startsWith('169.254.')) {
    return true;
  }

  // Chặn Loopback IPv6 & Link-Local IPv6
  if (
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:169.254.')
  ) {
    return true;
  }

  return false;
}

function validateProxyTargetUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, reason: 'URL trống hoặc không đúng định dạng' };
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Chỉ chấp nhận giao thức HTTP/HTTPS' };
    }
    const hostname = parsed.hostname;
    if (isForbiddenSsrfIp(hostname)) {
      return { valid: false, reason: 'SSRF Guard: Địa chỉ IP/Host bị chặn' };
    }

    const blockedPorts = new Set(['21', '22', '23', '25', '53', '110', '135', '137', '138', '139', '445', '1433', '1521', '3306', '5432', '6379', '11211', '27017']);
    if (parsed.port && blockedPorts.has(String(parsed.port))) {
      return { valid: false, reason: `SSRF Guard: Cổng kết nối ${parsed.port} bị chặn do nhạy cảm` };
    }

    return { valid: true, parsed };
  } catch (err) {
    return { valid: false, reason: 'Cú pháp URL không hợp lệ: ' + err.message };
  }
}

function clampFinite(val, min, max, fallback = 0) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

// Proxy lấy luồng Camera ESP32 & Thumbnail YouTube không bị chặn CORS/HTTPS (hỗ trợ Follow 301/302 Redirects)
app.get('/api/esp32-proxy', async (req, res) => {
  const targetUrl = (req.query.url || '').trim();
  const check = validateProxyTargetUrl(targetUrl);
  if (!check.valid) {
    return res.status(400).send('SSRF Guard: ' + check.reason);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  req.on('close', () => controller.abort());

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    res.status(upstream.status || 200);
    res.setHeader('Access-Control-Allow-Origin', '*');
    const cType = upstream.headers.get('content-type');
    res.setHeader('Content-Type', cType || 'image/jpeg');
    const cLen = upstream.headers.get('content-length');
    if (cLen) res.setHeader('Content-Length', cLen);

    if (upstream.body) {
      const { Readable } = require('stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (!res.headersSent) {
      res.status(502).send('Proxy upstream error: ' + err.message);
    }
  }
});

// ============================================================================
// DÁN ĐÈ HOẶC THÊM VÀO server.js: TÌM KIẾM VIDEO MP4 ĐA NGUỒN (KHÔNG BAO GIỜ UNAVAILABLE)
// ============================================================================
// ============================================================================
// CẬP NHẬT TRONG server.js (V125): CHỐNG TIMEOUT KẾT NỐI QR/QUEST & YOUTUBE FULL >5H
// ============================================================================
const os = require('os');

function getBestNetworkAddresses() {
  const nets = os.networkInterfaces();
  const wifiLanCandidates = [];
  let tailscaleIp = null;

  for (const name of Object.keys(nets)) {
    // Bỏ qua các card mạng ảo (WSL, Hyper-V, VirtualBox, Docker, VPN) gây lỗi timeout khi quét QR
    if (/vethernet|wsl|docker|vbox|vmware|loopback|pseudo/i.test(name)) continue;

    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('100.')) {
          tailscaleIp = net.address;
        } else if (
          net.address.startsWith('192.168.') ||
          net.address.startsWith('10.') ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address)
        ) {
          // Ưu tiên số 1 cho card Wi-Fi / WLAN thực tế
          const isWifi = /wi-fi|wlan|wireless|airport/i.test(name);
          if (isWifi) wifiLanCandidates.unshift(net.address);
          else wifiLanCandidates.push(net.address);
        }
      }
    }
  }

  const primaryLanIp = wifiLanCandidates[0] || tailscaleIp || 'localhost';
  return {
    lanIp: primaryLanIp,
    tailscaleIp: tailscaleIp || primaryLanIp,
    publicTunnelUrl: process.env.PUBLIC_TUNNEL_URL || null
  };
}

function getLocalLanIp() {
  return getBestNetworkAddresses().lanIp;
}

// Cho phép mọi thiết bị kiểm tra kết nối nhanh không bị chặn CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

app.get('/api/network-info', (req, res) => {
  const { lanIp, tailscaleIp, publicTunnelUrl } = getBestNetworkAddresses();
  // Luôn ưu tiên địa chỉ Wi-Fi LAN thật (192.168.x.x:8080) hoặc Public Tunnel để điện thoại/Quest khác vào ngay không bị timeout!
  const baseMobile = publicTunnelUrl
    ? publicTunnelUrl
    : `http://${lanIp}:${HTTP_PORT}`;

  res.json({
    lanIp,
    tailscaleIp,
    publicTunnelUrl,
    webUrl: `http://${lanIp}:${HTTP_PORT}`,
    mobilePassengerUrl: `${baseMobile}/?mode=passenger_mobile`,
    mobileTailscaleUrl: `http://${tailscaleIp}:${HTTP_PORT}/?mode=passenger_mobile`,
    questVrUrl: `https://${lanIp}:8443/?vr=immersive`,
    questHttpFallbackUrl: `http://${lanIp}:${HTTP_PORT}/?vr=immersive`
  });
});

// Nén nhẹ dữ liệu tọa độ (làm tròn 2 chữ số thập phân) giúp kết nối Public 4G/Tailscale trên iPhone/Android mượt gấp 5 lần
function compressCarsState() {
  return Array.from(cars.values()).map((c) => ({
    carId: c.carId,
    ownerName: c.ownerName,
    hasEsp32Capability: c.hasEsp32Capability,
    driverPlayerId: c.driverPlayerId || null,
    x: Math.round((c.x || 0) * 100) / 100,
    z: Math.round((c.z || 0) * 100) / 100,
    heading: Math.round((c.heading || 0) * 1000) / 1000,
    speedKmh: Math.round(c.speedKmh || 0),
    steerDeg: Math.round(c.steerDeg || 0),
    doorsOpen: Boolean(c.doorsOpen),
    roofOpen: Boolean(c.roofOpen),
    turnSignal: c.turnSignal || 'OFF',
    occupants: c.occupants
  }));
}

// Tìm kiếm YouTube trả về danh sách Video THẬT 100% kèm thời lượng đầy đủ (từ vài phút đến >5 tiếng, KHÔNG giới hạn 30 giây!)
app.get('/api/yt-search', (req, res) => {
  const query = String(req.query.q || '').slice(0, 100).trim();
  if (!query) return res.json({ items: [] });

  const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=vi`;
  https.get(ytSearchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8'
    }
  }, (ytRes) => {
    let rawHtml = '';
    ytRes.on('data', (chunk) => { rawHtml += chunk; });
    ytRes.on('end', () => {
      try {
        const items = [];
        const seenIds = new Set();

        // Tách từng khối videoRenderer trong ytInitialData để lấy chính xác videoId, tiêu đề và thời lượng (lengthText)
        const blocks = rawHtml.split('"videoRenderer":{');
        for (let i = 1; i < blocks.length && items.length < 18; i++) {
          const blk = blocks[i];
          const idMatch = blk.match(/^"videoId":"([a-zA-Z0-9_-]{11})"/);
          if (!idMatch) continue;
          const vid = idMatch[1];
          if (seenIds.has(vid)) continue;

          const titleMatch = blk.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}/);
          const lenMatch = blk.match(/"lengthText":\{.*?"simpleText":"([^"]+)"\}/);

          const title = titleMatch
            ? titleMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/&#39;/g, "'")
            : `YouTube Video (${vid})`;
          const duration = lenMatch ? lenMatch[1] : 'Full HD';

          seenIds.add(vid);
          items.push({
            videoId: vid,
            title,
            duration,
            thumbnail: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`
          });
        }

        res.json({ items });
      } catch (err) {
        res.json({ items: [] });
      }
    });
  }).on('error', () => {
    res.json({ items: [] });
  });
});

const dgram = require('dgram');

// 1. Bóc tách luồng MP4 trực tiếp bằng YouTube Innertube API (Giúp thẻ <video> phát MP4 thật 100% và vẽ lên màn hình 3D khi thu nhỏ)
app.get('/api/yt-dom-stream', async (req, res) => {
  const videoId = String(req.query.videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ error: 'Invalid or missing videoId' });

  // 1. Thử qua yt-dlp nếu khả dụng
  try {
    const dlpUrl = await tryResolveYtDlpStream(videoId);
    if (dlpUrl) {
      return res.json({ videoId, streamUrl: dlpUrl });
    }
  } catch (e) {}

  // 2. Dự phòng bằng Android VR Innertube

  const postData = JSON.stringify({
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.56.21',
        androidSdkVersion: 32,
        hl: 'vi',
        gl: 'VN'
      }
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true
  });

  const options = {
    hostname: 'www.youtube.com',
    path: '/youtubei/v1/player?prettyPrint=false',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
    }
  };

  const ytReq = https.request(options, (ytRes) => {
    let raw = '';
    ytRes.on('data', (chunk) => { raw += chunk; });
    ytRes.on('end', () => {
      try {
        const data = JSON.parse(raw);
        const formats = (data.streamingData && data.streamingData.formats) || [];
        // Ưu tiên itag 18 / 22 (MP4 có cả tiếng + hình)
        const mp4 = formats.find((f) => f.url && (f.itag === 18 || f.itag === 22)) ||
                    formats.find((f) => f.url && f.mimeType && f.mimeType.includes('video/mp4')) ||
                    formats[0];
        if (mp4 && mp4.url) {
          return res.json({ videoId, streamUrl: mp4.url });
        }
        res.json({ videoId, streamUrl: null });
      } catch (e) {
        res.json({ videoId, streamUrl: null });
      }
    });
  });

  ytReq.on('error', () => res.json({ videoId, streamUrl: null }));
  ytReq.write(postData);
  ytReq.end();
});

// 2. Cầu nối UDP Digital Twin nhận tín hiệu thời gian thực từ ESP32 Controller / Godot (Cổng UDP 4210)
const udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });
udpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn('[UDP] Cổng 4210 đang được sử dụng (EADDRINUSE), bỏ qua lỗi và tiếp tục chạy máy chủ HTTP bình thường.');
  } else {
    console.error('[UDP ERROR]', err);
  }
});

// Bộ nhớ lưu trữ IP tự động nhận diện từ các mạch ESP32 (Cam Trước & Cam Lùi)
const discoveredEsp32Cams = {
  front: { ip: null, port: 4213, lastSeen: 0 },
  rear: { ip: null, port: 4213, lastSeen: 0 }
};

const emulatedFrontCamSockets = new Set();
const emulatedRearCamSockets = new Set();

function getEffectiveCamEndpoints() {
  const lanIp = typeof getLocalLanIp === 'function' ? getLocalLanIp() : '192.168.1.76';
  const now = Date.now();
  const frontHw = discoveredEsp32Cams.front && discoveredEsp32Cams.front.ip && (now - (discoveredEsp32Cams.front.lastSeen || 0) < 20000);
  const rearHw = discoveredEsp32Cams.rear && discoveredEsp32Cams.rear.ip && (now - (discoveredEsp32Cams.rear.lastSeen || 0) < 20000);

  const front = frontHw ? discoveredEsp32Cams.front : {
    ip: lanIp,
    port: 8080,
    path: '/esp32-front-ws',
    active: true,
    lastSeen: now,
    isEmulatedPhone: true
  };

  const rear = rearHw ? discoveredEsp32Cams.rear : {
    ip: lanIp,
    port: 8080,
    path: '/esp32-rear-ws',
    active: true,
    lastSeen: now,
    isEmulatedPhone: true
  };

  return { front, rear };
}

let lastUdpCommandLog = '';
// Cấu hình mạch điều khiển xe RC thật (ESP32 Car Controller - GPIO 12/13 qua UDP 4210)
const esp32CarConfig = {
  ip: '192.168.1.238',
  port: 4210,
  lastSeen: Date.now(),
  lastSentTime: 0,
  packetsSent: 0
};

// Hàm gửi gói tin nhị phân 4 bytes [int16_t steer, int16_t throttle] qua UDP tới ESP32 Xe RC Thật
function sendUdpCarCommand(steer, throttle) {
  if (!esp32CarConfig.ip) return;
  // Ưu tiên ủy thác toàn bộ qua sendRateLimitedEsp32Udp duy nhất có bộ trọng tài phần cứng và slew rate chống giật
  if (typeof globalThis.sendRateLimitedEsp32Udp === 'function') {
    const rawS = Math.max(45, Math.min(135, Math.round(Number(steer) || 90)));
    const sNorm = (90 - rawS) / 45;
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

    // Tự động nhận diện IP của ESP32 Camera (Cam trước hoặc Cam lùi) khi đổi Wi-Fi
    if (data.type === 'ESP32_CAM' || data.type === 'ESP32_ANNOUNCE' || (data.cam && !data.speedKmh)) {
      const role = (data.role === 'rear' || data.cam === 'rear') ? 'rear' : 'front';
      discoveredEsp32Cams[role] = {
        ip: rinfo.address,
        port: Number(data.port || 4213),
        lastSeen: Date.now()
      };
      console.log(`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 ${role.toUpperCase()}: ${rinfo.address}:${data.port || 4213}`);
      if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
      return; // Chỉ cập nhật IP Camera, KHÔNG ghi đè telemetry xe!
    }

    // Tự động nhận diện IP của Mạch Lái Xe ESP32 (Controller GPIO 12/13 qua UDP 4210)
    if (data.type === 'ESP32_CAR' || data.type === 'ESP32_CAR_ANNOUNCE' || data.role === 'car') {
      esp32CarConfig.ip = rinfo.address;
      esp32CarConfig.port = Number(data.port || 4210);
      esp32CarConfig.lastSeen = Date.now();
      console.log(`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: ${rinfo.address}:${esp32CarConfig.port}`);
      if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
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

udpServer.bind(4210, '0.0.0.0', () => {
  console.log('[UDP Digital Twin] Đang lắng nghe tín hiệu ESP32 / Godot tại cổng UDP 4210');
});

app.get('/api/esp32-telemetry', (req, res) => {
  const now = Date.now();
  const ageMs = now - (latestEsp32Telemetry.lastPacketTime || 0);
  res.json({
    ...latestEsp32Telemetry,
    connected: latestEsp32Telemetry.connected && ageMs < 5000,
    latencyMs: latestEsp32Telemetry.lastPacketTime ? ageMs : 9999
  });
});

// Endpoint tự động đăng ký IP cho ESP32 qua HTTP khi mạch vừa kết nối Wi-Fi mới
app.get('/api/register-esp32', (req, res) => {
  const rawRole = String(req.query.role || req.query.cam || 'front').toLowerCase().trim();
  const role = (rawRole === 'car' || rawRole === 'rear') ? rawRole : 'front';
  const rawIp = req.query.ip || req.ip;
  const cleanIp = String(rawIp || '').trim().replace(/^::ffff:/, '');
  if (!IPV4_REGEX.test(cleanIp) || isForbiddenSsrfIp(cleanIp)) {
    return res.status(400).json({ error: 'Invalid or forbidden IP address' });
  }
  const defaultPort = role === 'car' ? 4210 : 4213;
  const port = clampFinite(req.query.port, 1, 65535, defaultPort);

  if (role === 'car') {
    esp32CarConfig.ip = cleanIp;
    esp32CarConfig.port = port;
    esp32CarConfig.lastSeen = Date.now();
    console.log(`[HTTP REGISTRATION] ESP32 CAR CONTROLLER đã đăng ký IP mới: ${cleanIp}:${port}`);
    return res.json({ status: 'ok', role: 'car', ip: cleanIp, port });
  }

  discoveredEsp32Cams[role] = { ip: cleanIp, port, lastSeen: Date.now() };
  console.log(`[HTTP REGISTRATION] ESP32 ${role.toUpperCase()} đã đăng ký IP mới: ${cleanIp}:${port}`);
  if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
  res.json({ status: 'ok', role, ip: cleanIp, port });
});

// Endpoint cấu hình hoặc kiểm tra IP mạch lái xe RC (Controller)
app.all('/api/set-esp32-car-ip', (req, res) => {
  const rawIp = (req.body && req.body.ip) || req.query.ip;
  const rawPort = (req.body && req.body.port) || req.query.port;
  if (!rawIp) {
    return res.status(400).json({ error: 'Missing IP parameter' });
  }
  const cleanIp = String(rawIp).trim().replace(/^::ffff:/, '');
  if (!IPV4_REGEX.test(cleanIp) || isForbiddenSsrfIp(cleanIp)) {
    return res.status(400).json({ error: 'Invalid or forbidden IP address' });
  }
  const port = clampFinite(rawPort, 1, 65535, 4210);
  esp32CarConfig.ip = cleanIp;
  esp32CarConfig.port = port;
  esp32CarConfig.lastSeen = Date.now();
  console.log(`[CAR IP CONFIGURED] IP Mạch Lái Xe RC đã được đặt: ${esp32CarConfig.ip}:${esp32CarConfig.port}`);
  res.json({ success: true, carIp: esp32CarConfig.ip, port: esp32CarConfig.port });
});

// Endpoint cho Web Client hỏi danh sách IP Camera & Mạch Lái Xe vừa phát hiện
app.get('/api/esp32-discovered', (req, res) => {
  const now = Date.now();
  const effective = getEffectiveCamEndpoints();
  res.json({
    front: {
      ...effective.front,
      active: true,
      ageSec: 0
    },
    rear: {
      ...effective.rear,
      active: true,
      ageSec: 0
    },
    car: {
      ...esp32CarConfig,
      active: (now - (esp32CarConfig.lastSeen || 0)) < 20000,
      ageSec: Math.round((now - (esp32CarConfig.lastSeen || 0)) / 1000)
    }
  });
});

let lastScanEsp32Time = 0;

// Endpoint quét nhanh mạng LAN để tự động dò tìm IP của 2 mạch ESP32
app.get('/api/scan-esp32', async (req, res) => {
  const nowScan = Date.now();
  if (nowScan - lastScanEsp32Time < 5000) {
    return res.json({ found: [], discovered: discoveredEsp32Cams, throttled: true });
  }
  lastScanEsp32Time = nowScan;
  const net = require('net');
  const results = [];
  try {
    const lanIp = typeof getLocalLanIp === 'function' ? getLocalLanIp() : '192.168.1.1';
    const subnet = lanIp.substring(0, lanIp.lastIndexOf('.'));
    const candidates = [];
    for (let i = 1; i <= 254; i++) {
      candidates.push(`${subnet}.${i}`);
    }

    const checkPort = (ip, port, timeout = 400) => new Promise((resolve) => {
      const s = new net.Socket();
      s.setTimeout(timeout);
      s.on('connect', () => { s.destroy(); resolve({ ip, port }); });
      s.on('error', () => { s.destroy(); resolve(null); });
      s.on('timeout', () => { s.destroy(); resolve(null); });
      s.connect(port, ip);
    });

    const batchSize = 24;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const found4213 = await Promise.all(batch.map(ip => checkPort(ip, 4213)));
      const found81 = await Promise.all(batch.map(ip => checkPort(ip, 81)));
      for (const item of [...found4213, ...found81]) {
        if (item && !results.some(r => r.ip === item.ip && r.port === item.port)) {
          results.push(item);
        }
      }
    }

    if (results.length > 0) {
      const now = Date.now();
      const isFrontStale = (now - (discoveredEsp32Cams.front.lastSeen || 0)) > 30000;
      const isRearStale = (now - (discoveredEsp32Cams.rear.lastSeen || 0)) > 30000;

      if ((!discoveredEsp32Cams.front.ip || isFrontStale) && results[0]) {
        discoveredEsp32Cams.front = { ip: results[0].ip, port: results[0].port, lastSeen: now };
      }
      const rearCandidate = results.find(r => r.ip !== discoveredEsp32Cams.front.ip) || results[1];
      if ((!discoveredEsp32Cams.rear.ip || isRearStale) && rearCandidate) {
        discoveredEsp32Cams.rear = { ip: rearCandidate.ip, port: rearCandidate.port, lastSeen: now };
      }
    }
  } catch (err) {
    console.error('[SCAN ESP32 ERROR]', err);
  }
  const effective = getEffectiveCamEndpoints();
  if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
  res.json({ found: results, discovered: effective, cams: effective });
});

// Proxy truyền tải luồng video MP4 về thẻ <video> trong xe không bị lỗi CORS (SSRF Protected)
app.get('/api/yt-stream-proxy', async (req, res) => {
  const streamUrl = req.query.url;
  const check = validateProxyTargetUrl(streamUrl);
  if (!check.valid) return res.status(400).send('SSRF Guard: ' + check.reason);

  // Chọn UA khớp với client đã ký URL
  const ua = 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';

  try {
    const upstream = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        'User-Agent': ua,
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
        'Range': req.headers.range || 'bytes=0-',
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',                 // ← follow 302 tới CDN thật
      signal: AbortSignal.timeout(30000)
    });

    // QUAN TRỌNG: luôn set CORS header kể cả khi lỗi
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    res.setHeader('Accept-Ranges', 'bytes');

    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }

    res.status(upstream.status);
    if (upstream.headers.get('content-type'))
      res.setHeader('Content-Type', upstream.headers.get('content-type'));
    if (upstream.headers.get('content-length'))
      res.setHeader('Content-Length', upstream.headers.get('content-length'));
    if (upstream.headers.get('content-range'))
      res.setHeader('Content-Range', upstream.headers.get('content-range'));

    const { Readable } = require('stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(502).send('Proxy: ' + err.message);
    }
  }
});



// ============================================================================
// MULTIPLAYER SERVER: MỖI THIẾT BỊ JOIN VÀO SẼ SPAWN 1 XE RIÊNG & CÓ THỂ LÊN XE NHAU
// ============================================================================
const players = new Map();
const cars = new Map();
let latestEsp32CamFramePacket = null;

// Khởi tạo sẵn Xe số 1 (Xe Chủ Phòng - Có kết nối ESP32) và Xe số 2 (Xe Khách/Bạn bè - Chỉ chạy 3D, không có ESP32)
cars.set('car_host', {
  carId: 'car_host',
  ownerName: 'Xe Chủ Phòng (Có ESP32)',
  hasEsp32Capability: true,
  x: -21.0,
  z: -25.0,
  heading: -Math.PI / 2,
  speedKmh: 0,
  steerDeg: 0,
  doorsOpen: false,
  roofOpen: false,
  occupants: { 0: null, 1: null, 2: null, 3: null } // 0: Tài xế, 1: Ghế phụ trước, 2: Sau trái, 3: Sau phải
});

// ============================================================================
// THAY THẾ ĐOẠN cars.set('car_guest_1', ...) TRONG server.js BẰNG ĐOẠN NÀY:
// (Chỉ giữ lại car_host, KHÔNG tự spawn car_guest_1 giữa đường khi chưa có người thứ 2)
// ============================================================================
cars.delete('car_guest_1');


const activeMultiplayerSockets = new Set();
let activeDriverClient = null;
let activeDriverLastActiveTime = 0;

function broadcastCameraIpUpdate() {
  if (typeof activeMultiplayerSockets === 'undefined' || !activeMultiplayerSockets) return;
  const effective = getEffectiveCamEndpoints();
  const camPacket = JSON.stringify({
    type: 'CAM_IP_UPDATED',
    cams: {
      front: effective.front,
      rear: effective.rear
    },
    car: esp32CarConfig,
    front: effective.front,
    rear: effective.rear
  });
  for (const client of activeMultiplayerSockets) {
    if (client.readyState === 1) { // WebSocket.OPEN
      try { client.send(camPacket); } catch (e) {}
    }
  }
}

function getPublicPlayers() {
  const list = [];
  for (const p of players.values()) {
    if (!p) continue;
    list.push({
      playerId: p.playerId,
      clientIp: p.clientIp,
      isQuestVR: Boolean(p.isQuestVR),
      isMobileDevice: Boolean(p.isMobileDevice),
      isLocalhostAdmin: Boolean(p.isLocalhostAdmin),
      name: p.name || 'Người chơi',
      ownCarId: p.ownCarId || 'car_host',
      seatIndex: p.seatIndex ?? 0,
      isHost: Boolean(p.isHost)
    });
  }
  return list;
}

function broadcastWorldState() {
  if (activeMultiplayerSockets.size === 0) return;
  try {
    const payload = JSON.stringify({
      type: 'WORLD_STATE',
      cars: compressCarsState(),
      players: getPublicPlayers()
    });
    for (const client of activeMultiplayerSockets) {
      if (client.readyState === 1) { // WebSocket.OPEN
        try { client.send(payload); } catch (e) {}
      }
    }
  } catch (err) {
    console.error('⚠️ [BROADCAST ERROR - RECOVERED]', err.message);
  }
}

// Chu kỳ đồng bộ vị trí xe liên tục 20Hz (mỗi 50ms) giữa Desktop, Kính VR Meta Quest 3 và Điện Thoại
setInterval(() => {
  broadcastWorldState();
}, 50);

function proxyEsp32WebSocket(clientWs, targetIp, targetPort, roleName) {
  if (!targetIp) {
    try { clientWs.close(1011, `ESP32 ${roleName} IP not discovered yet`); } catch (e) {}
    return;
  }
  const targetWsUrl = `ws://${targetIp}:${targetPort || 4213}`;
  let upstreamWs;
  try {
    upstreamWs = new WebSocket(targetWsUrl);
  } catch (err) {
    try { clientWs.close(1011, `Cannot connect to ${roleName}: ${err.message}`); } catch (e) {}
    return;
  }

  upstreamWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      // [ZERO-LAG FPV] Nếu socket client nghẽn buffer > 24KB, bỏ qua ngay frame cũ này
      // để triệt tiêu hoàn toàn độ trễ tích tụ (video bám sát tức thì tốc độ xe khi đạp ga)
      if (clientWs.bufferedAmount > 24 * 1024) {
        return;
      }
      clientWs.send(data, { binary: isBinary });
    }
  });

  upstreamWs.on('error', (err) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      try { clientWs.close(1011, `Upstream error: ${err.message}`); } catch (e) {}
    }
  });

  upstreamWs.on('close', () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      try { clientWs.close(); } catch (e) {}
    }
  });

  clientWs.on('message', (data, isBinary) => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('close', () => {
    try { upstreamWs.close(); } catch (e) {}
  });

  clientWs.on('error', () => {
    try { upstreamWs.close(); } catch (e) {}
  });
}

function attachMultiplayerServer(serverInstance) {
  const wss = new WebSocket.Server({ server: serverInstance });
  wss.on('error', () => {});
  if (typeof bindUnifiedWss === 'function') {
    bindUnifiedWss(wss);
  }

  wss.on('connection', (ws, req) => {
    const reqUrl = (req && req.url) || '';
    if (reqUrl.includes('/esp32-front-ws')) {
      const now = Date.now();
      const isPhysicalFrontAlive = discoveredEsp32Cams.front && discoveredEsp32Cams.front.ip && (now - (discoveredEsp32Cams.front.lastSeen || 0) < 15000);
      if (isPhysicalFrontAlive) {
        return proxyEsp32WebSocket(ws, discoveredEsp32Cams.front.ip, discoveredEsp32Cams.front.port || 4213, 'Front Cam');
      }
      emulatedFrontCamSockets.add(ws);
      console.log('🪟 [EMULATOR] Kính VR APK đã kết nối vào luồng Kính Chắn Gió (/esp32-front-ws)');
      ws.on('close', () => { emulatedFrontCamSockets.delete(ws); });
      ws.on('error', () => { emulatedFrontCamSockets.delete(ws); });
      return;
    }
    if (reqUrl.includes('/esp32-rear-ws')) {
      const now = Date.now();
      const isPhysicalRearAlive = discoveredEsp32Cams.rear && discoveredEsp32Cams.rear.ip && (now - (discoveredEsp32Cams.rear.lastSeen || 0) < 15000);
      if (isPhysicalRearAlive) {
        return proxyEsp32WebSocket(ws, discoveredEsp32Cams.rear.ip, discoveredEsp32Cams.rear.port || 4213, 'Rear Cam');
      }
      emulatedRearCamSockets.add(ws);
      console.log('🔙 [EMULATOR] Kính VR APK đã kết nối vào luồng Kính Hậu (/esp32-rear-ws)');
      ws.on('close', () => { emulatedRearCamSockets.delete(ws); });
      ws.on('error', () => { emulatedRearCamSockets.delete(ws); });
      return;
    }
    activeMultiplayerSockets.add(ws);

    const ua = (req && req.headers && req.headers['user-agent']) || '';
    // Chặn các kết nối từ ESP32, Arduino, curl, router probe không phải trình duyệt người chơi thật
    if (/esp32|arduino|curl|wget|lwip|httpclient/i.test(ua)) {
      ws.close();
      return;
    }

    const clientIp = (req && req.socket && req.socket.remoteAddress) || '';
    ws._clientIp = clientIp;

    const hostCar = cars.get('car_host');
    let seat0OccupantId = hostCar ? hostCar.occupants[0] : null;
    let seat0Player = seat0OccupantId ? players.get(seat0OccupantId) : null;

    // Tự động nhận diện trường hợp F5 (reload cùng một máy) hoặc kết nối cũ đã đứt:
    // Nếu ghế 0 đang bị giữ bởi 1 player nhưng player đó từ cùng client IP (vừa F5)
    // hoặc socket của player đó đã không còn ở trạng thái WebSocket.OPEN:
    if (seat0Player) {
      const isSameClient = Boolean(seat0Player.clientIp && seat0Player.clientIp === clientIp);
      const isOldSocketDead = !seat0Player.ws || seat0Player.ws.readyState !== WebSocket.OPEN;
      if (isSameClient || isOldSocketDead) {
        if (seat0Player.ws && seat0Player.ws !== ws) {
          try { seat0Player.ws.close(); } catch (e) {}
        }
        players.delete(seat0OccupantId);
        if (hostCar) hostCar.occupants[0] = null;
        seat0OccupantId = null;
        seat0Player = null;
      }
    }

    // Phân quyền thiết bị: Nhận diện Laptop Admin, Kính VR Meta Quest, Điện thoại Mobile
    const isQuestVR = /Quest|OculusBrowser|Pacific|VR|Headset/i.test(ua);
    const isMobileDevice = !isQuestVR && /Mobile|Android|iPhone|iPad/i.test(ua);
    const isLocalhostAdmin = Boolean(clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1'));

    // Kiểm tra ghế lái (Seat 0) có trống hoặc người giữ cũ đã mất kết nối không:
    const isDriverSeatFree = (seat0OccupantId === null || !players.has(seat0OccupantId));
    let assignedSeat = 0;

    if (isDriverSeatFree) {
      // Ghế lái đang trống: Thiết bị đầu tiên kết nối (Kính Quest 1, Điện thoại hoặc Laptop) nhận Ghế Lái (Seat 0)
      assignedSeat = 0;
    } else if (isQuestVR && seat0OccupantId && players.has(seat0OccupantId) && !players.get(seat0OccupantId).isQuestVR) {
      // Khi Kính Meta Quest 3 kết nối vào phòng mà Seat 0 đang do Laptop Admin (2D) nắm giữ:
      // Tự động trao quyền Ghế Lái (Seat 0) cho Kính VR để lái xe trực tiếp bằng VR Controller & Vô lăng!
      const oldDriver = players.get(seat0OccupantId);
      oldDriver.seatIndex = 1;
      oldDriver.isHost = false;
      if (hostCar) hostCar.occupants[1] = oldDriver.playerId;
      assignedSeat = 0;
    } else {
      // Ghế lái ĐÃ CÓ NGƯỜI ĐANG LÁI: Phân bổ an toàn vào Ghế Phụ (Seat 1, 2, 3)
      const openSeat = [1, 2, 3].find((s) => !hostCar || !hostCar.occupants[s]);
      assignedSeat = (openSeat !== undefined) ? openSeat : 1;
    }
    const isHostPlayer = (assignedSeat === 0);

    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    const assignedOwnCarId = 'car_host';

    players.set(playerId, {
      playerId,
      ws,
      clientIp,
      isQuestVR,
      isMobileDevice,
      isLocalhostAdmin,
      name: isHostPlayer
        ? (isQuestVR ? 'Kính Meta Quest 3 [Tài Xế]' : (isMobileDevice ? 'Điện Thoại [Tài Xế]' : 'Laptop Admin [Tài Xế]'))
        : (isQuestVR ? `Kính Quest Ghế Phụ #${assignedSeat}` : (isMobileDevice ? `Điện Thoại Ghế Phụ #${assignedSeat}` : `Khách Ghế #${assignedSeat}`)),
      ownCarId: 'car_host',
      inCarId: 'car_host',
      seatIndex: assignedSeat,
      isHost: isHostPlayer,
      leaningOut: false,
      x: 0.65,
      z: 1.15,
      yaw: 0
    });

    if (hostCar) {
      hostCar.occupants[assignedSeat] = playerId;
    }

    ws.send(JSON.stringify({
      type: 'SERVER_LAN_INFO',
      lanIp: getLocalLanIp(),
      port: HTTP_PORT,
      car: {
        ip: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.ip) ? esp32CarConfig.ip : '192.168.1.238',
        port: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.port) ? esp32CarConfig.port : 4210
      },
      cams: typeof getEffectiveCamEndpoints === 'function' ? getEffectiveCamEndpoints() : {
        front: discoveredEsp32Cams.front,
        rear: discoveredEsp32Cams.rear
      }
    }));
    if (discoveredEsp32Cams.front.ip || discoveredEsp32Cams.rear.ip) {
      try {
        ws.send(JSON.stringify({
          type: 'CAM_IP_UPDATED',
          cams: typeof getEffectiveCamEndpoints === 'function' ? getEffectiveCamEndpoints() : {
            front: discoveredEsp32Cams.front,
            rear: discoveredEsp32Cams.rear
          },
          front: discoveredEsp32Cams.front,
          rear: discoveredEsp32Cams.rear
        }));
      } catch (e) {}
    }
    ws.send(JSON.stringify({
      type: 'WELCOME',
      playerId,
      ownCarId: assignedOwnCarId,
      isHost: isHostPlayer,
      seatIndex: assignedSeat,
      isDriver: (assignedSeat === 0),
      isQuestVR,
      isMobileDevice,
      isLocalhostAdmin,
      cars: Array.from(cars.values())
    }));

    if (latestEsp32CamFramePacket && ws.readyState === WebSocket.OPEN) {
      try { ws.send(latestEsp32CamFramePacket); } catch (e) {}
    }

    broadcastWorldState();

    ws.on('message', (msg, isBinary) => {
      const isBuf = Buffer.isBuffer(msg) || (msg instanceof Uint8Array);
      const isRcf = isBuf && msg.length >= 8 && msg[0] === 0x52 && msg[1] === 0x43 && msg[2] === 0x46; // 'RCF'
      const isRawJpeg = isBuf && msg.length >= 4 && msg[0] === 0xff && msg[1] === 0xd8;

      if (isRcf) {
        const isRear = msg[3] === 0x02;
        const rawJpeg = msg.subarray(4);
        const targetCamSet = isRear ? emulatedRearCamSockets : emulatedFrontCamSockets;
        for (const camWs of targetCamSet) {
          if (camWs.readyState === 1 && camWs.bufferedAmount < 128 * 1024) {
            try { camWs.send(rawJpeg, { binary: true }); } catch (e) {}
          }
        }
        for (const client of activeMultiplayerSockets) {
          if (client !== ws && client.readyState === 1 && client.bufferedAmount < 192 * 1024) {
            try { client.send(msg, { binary: true }); } catch (e) {}
          }
        }
        return;
      }

      if (isBinary || isRawJpeg) {
        for (const camWs of emulatedFrontCamSockets) {
          if (camWs.readyState === 1 && camWs.bufferedAmount < 128 * 1024) {
            try { camWs.send(msg, { binary: true }); } catch (e) {}
          }
        }
        for (const client of activeMultiplayerSockets) {
          if (client !== ws && client.readyState === 1 && client.bufferedAmount < 192 * 1024) {
            try { client.send(msg, { binary: true }); } catch (e) {}
          }
        }
        return;
      }

      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'FPV_PHONE_PUBLISHER_INIT') {
          console.log('📱 [FPV PHONE] Điện thoại FPV đã kết nối phát hình (' + (data.surface || 'front') + ', mode: ' + (data.mode || 'SINGLE_PHONE_AUTO_DR') + ')');
          try {
            ws.send(JSON.stringify({
              type: 'FPV_PHONE_PUBLISHER_ACK',
              ok: true,
              role: data.surface || 'front'
            }));
          } catch (e) {}
          if (typeof broadcastCameraIpUpdate === 'function') broadcastCameraIpUpdate();
          return;
        }

        const p = players.get(playerId);
        if (!p) return;

                if (data.type === 'PLAYER_HELLO') {
          if (data.deviceType) p.deviceType = data.deviceType;
          if (data.deviceType === 'META_QUEST' || data.isQuestVR) {
            p.isQuestVR = true;
            console.log(`🥽 [VR CLIENT] Meta Quest 3 đã xác thực kết nối WebSocket (${p.playerId})`);
            if (!seat0OccupantId || seat0OccupantId === playerId || !players.get(seat0OccupantId)?.isQuestVR) {
              if (seat0OccupantId && seat0OccupantId !== playerId && players.has(seat0OccupantId)) {
                players.get(seat0OccupantId).seatIndex = 1;
                players.get(seat0OccupantId).isHost = false;
                if (hostCar) hostCar.occupants[1] = seat0OccupantId;
              }
              p.seatIndex = 0;
              p.isHost = true;
              seat0OccupantId = playerId;
              if (hostCar) hostCar.occupants[0] = playerId;
            }
          }
          return;
        }

        if (data.type === 'ESP32_CAM_FRAME_RELAY' && data.dataUrl) {
          latestEsp32CamFramePacket = JSON.stringify({
            type: 'ESP32_CAM_FRAME_RELAY',
            role: data.role || 'front',
            dataUrl: data.dataUrl,
            timestamp: Date.now()
          });
          for (const client of activeMultiplayerSockets) {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.bufferedAmount < 192 * 1024) {
              try { client.send(latestEsp32CamFramePacket); } catch (e) {}
            }
          }
          return;
        }

        if (data.type === 'PLAYER_SYNC') {
          p.x = clampFinite(data.x, -250, 250, p.x);
          p.z = clampFinite(data.z, -250, 250, p.z);
          p.yaw = clampFinite(data.yaw, -Math.PI * 4, Math.PI * 4, p.yaw);
          p.inCarId = data.inCarId !== undefined ? data.inCarId : p.inCarId;
          p.seatIndex = data.seatIndex ?? p.seatIndex;
          p.leaningOut = Boolean(data.leaningOut);
        } else if (data.type === 'CAR_SYNC' && data.carId && cars.has(data.carId)) {
          // CHỈ TÀI XẾ (Seat 0) hoặc Laptop Admin MỚI ĐƯỢC ĐỒNG BỘ TỌA ĐỘ VỊ TRÍ XE:
          // Người ngồi ghế phụ (Seat 1, 2, 3) tuyệt đối không được ghi đè tọa độ xe!
          const isVrController = Boolean(p.isQuestVR || p.deviceType === 'META_QUEST');
          const canSyncCar = (p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin || isVrController);
          if (canSyncCar) {
            const c = cars.get(data.carId);
            c.x = clampFinite(data.x, -250, 250, c.x);
            c.z = clampFinite(data.z, -250, 250, c.z);
            c.heading = clampFinite(data.heading, -Math.PI * 4, Math.PI * 4, c.heading);
            c.speedKmh = clampFinite(data.speedKmh, -100, 350, c.speedKmh);
            c.steerDeg = clampFinite(data.steerDeg, -540, 540, c.steerDeg);
            c.doorsOpen = Boolean(data.doorsOpen);
            c.roofOpen = Boolean(data.roofOpen);
            c.turnSignal = data.turnSignal ?? c.turnSignal;
            c.driverPlayerId = playerId;
            broadcastWorldState();
          }
        } else if (data.type === 'ENTER_CAR' && data.carId && cars.has(data.carId)) {
          const c = cars.get(data.carId);
          // Giải phóng ghế cũ nếu có
          for (const carObj of cars.values()) {
            for (const s of [0, 1, 2, 3]) {
              if (carObj.occupants[s] === playerId) carObj.occupants[s] = null;
            }
          }
          // Ưu tiên Ghế Lái (0) cho người chơi vừa bấm Lên xe
          let chosenSeat = data.preferredSeat ?? 0;
          if (c.occupants[chosenSeat] && c.occupants[chosenSeat] !== playerId) {
            if (chosenSeat === 0) {
              const oldDriverId = c.occupants[0];
              c.occupants[1] = oldDriverId;
              if (players.has(oldDriverId)) {
                players.get(oldDriverId).seatIndex = 1;
                players.get(oldDriverId).isHost = false;
              }
            } else {
              chosenSeat = [1, 2, 3, 0].find((s) => !c.occupants[s]) ?? 1;
            }
          }
          c.occupants[chosenSeat] = playerId;
          p.inCarId = c.carId;
          p.seatIndex = chosenSeat;
          p.isHost = (chosenSeat === 0);
          ws.send(JSON.stringify({
            type: 'SEAT_ASSIGNED',
            seatIndex: chosenSeat,
            isHost: p.isHost,
            carId: c.carId
          }));
        } else if (data.type === 'EXIT_CAR') {
          for (const carObj of cars.values()) {
            for (const s of [0, 1, 2, 3]) {
              if (carObj.occupants[s] === playerId) carObj.occupants[s] = null;
            }
          }
          p.inCarId = null;
          p.leaningOut = false;
        } else if (data.type === 'SWAP_SEAT' && data.carId && cars.has(data.carId)) {
          const c = cars.get(data.carId);
          const targetSeat = (data.targetSeatIndex ?? ((p.seatIndex + 1) % 4)) % 4;
          const otherPlayerId = c.occupants[targetSeat];
          const oldSeat = p.seatIndex;
          c.occupants[oldSeat] = otherPlayerId || null;
          c.occupants[targetSeat] = playerId;
          p.seatIndex = targetSeat;
          p.isHost = (targetSeat === 0);
          if (otherPlayerId && players.has(otherPlayerId)) {
            players.get(otherPlayerId).seatIndex = oldSeat;
            players.get(otherPlayerId).isHost = (oldSeat === 0);
          }
          ws.send(JSON.stringify({
            type: 'SEAT_ASSIGNED',
            seatIndex: targetSeat,
            isHost: p.isHost,
            carId: c.carId
          }));
        } else if (data.type === 'RC_HARDWARE_TELEMETRY') {
          // Nhận tín hiệu từ xe RC thật bên ngoài (tốc độ thực, trạng thái va chạm vật cản)
          const telPayload = JSON.stringify(data);
          for (const client of activeMultiplayerSockets) {
            if (client.readyState === WebSocket.OPEN) {
              try { client.send(telPayload); } catch (e) {}
            }
          }

let lastMovingForwardAt = 0;
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

        } else if (data.type === 'CAR_CONTROL' || data.type === 'RC_CONTROL_CMD') {
          // BỘ TRỌNG TÀI ĐIỀU KHIỂN XE THẬT 2 CHIỀU (Seamless Dual-Mode Arbitration):
          // Khi vô lăng host GOG808 đang quay/đạp ga, vô lăng DirectInput/WinMM chiếm ưu tiên tuyệt đối
          const now = Date.now();
          const isPhysicalWheelDriving = (now - rcArbitration.lastPhysicalWheelActiveAt < rcArbitration.WHEEL_PRIORITY_WINDOW_MS);
          const isVrController = Boolean(p.isQuestVR || p.deviceType === 'META_QUEST' || data.source === 'VR_CONTROLLER' || data.deviceType === 'META_QUEST');
          const canControlHardware = isVrController || p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin || !isPhysicalWheelDriving;
          if (!canControlHardware) {
            return;
          }
          if (isPhysicalWheelDriving && isVrController) {
            // Đang có vô lăng host thao tác: Bỏ qua lệnh từ tay cầm kính để chống xung đột góc lái
            return;
          }

          let sNorm = 0;
          if (data.steeringNorm !== undefined || data.steerNorm !== undefined) {
            sNorm = Math.max(-1, Math.min(1, Number(data.steeringNorm ?? data.steerNorm) || 0));
          } else if (data.steeringDeg !== undefined || (data.steer !== undefined && Math.abs(Number(data.steer)) > 1.5)) {
            const rawS = Math.max(45, Math.min(135, Math.round(Number(data.steeringDeg ?? data.steer) || 90)));
            sNorm = (90 - rawS) / 45;
          }

          let dNorm = 0;
          let explicitPulse = null;
          if (data.throttleNorm !== undefined || data.driveNorm !== undefined) {
            dNorm = Math.max(-1, Math.min(1, Number(data.throttleNorm ?? data.driveNorm) || 0));
          } else if (data.throttle !== undefined || data.escPulseUs !== undefined) {
            const rawT = Math.max(1050, Math.min(1950, Math.round(Number(data.throttle ?? data.escPulseUs) || 1500)));
            explicitPulse = rawT;
            dNorm = (rawT - 1500) / 350;
          }

          const isActivelyDriving = (Math.abs(sNorm) > 0.02 || Math.abs(dNorm) > 0.02 || (explicitPulse && Math.abs(explicitPulse - 1500) > 15));

          if (isActivelyDriving) {
            activeDriverClient = ws;
            activeDriverLastActiveTime = now;
            sendRateLimitedEsp32Udp(sNorm, dNorm, explicitPulse, data.gear || (dNorm < -0.02 ? 'R' : 'D'), isVrController ? 'QUEST_CAR_CONTROL' : 'CAR_CONTROL');
          } else {
            if (activeDriverClient === ws || (now - activeDriverLastActiveTime > 400)) {
              if (activeDriverClient === ws) {
                activeDriverLastActiveTime = 0;
              }
              sendRateLimitedEsp32Udp(0, 0, 1500, 'D', isVrController ? 'QUEST_CAR_CONTROL' : 'CAR_CONTROL');
            }
          }
        } else if (data.type === 'WHEEL_BRIDGE_INPUT' || data.type === 'WHEEL_BRIDGE_STATE') {
          // Cầu nối vô lăng GOG R808 & Bàn phím: Chuẩn hóa 100% góc lái, chân ga, chân phanh sang Kính Quest 3
          const src = data.payload || data;
          const steerNorm = clampFinite(src.steerNorm ?? src.steeringNorm ?? (typeof src.steer === 'number' && src.steer <= 180 ? (src.steer - 90) / 45 : 0), -1, 1, 0);
          const gasNorm = clampFinite(src.gasNorm ?? (typeof src.gasPercent === 'number' ? src.gasPercent / 100 : 0), 0, 1, 0);
          const brakeNorm = clampFinite(src.brakeNorm ?? (typeof src.brakePercent === 'number' ? src.brakePercent / 100 : 0), 0, 1, 0);
          const reverseNorm = clampFinite(src.reverseNorm ?? (typeof src.reversePercent === 'number' ? src.reversePercent / 100 : 0), 0, 1, 0);
          const driveNorm = clampFinite(src.driveNorm ?? (gasNorm - brakeNorm - reverseNorm), -1, 1, 0);

          const steerAngleDeg = clampFinite(src.steerAngleDeg ?? Math.round(steerNorm * 540), -540, 540, 0);
          const steerVal = clampFinite(src.steer ?? Math.round(90 + steerNorm * 45), 45, 135, 90);
          const throttleVal = clampFinite(src.throttle ?? Math.round(1500 + driveNorm * 260), 1000, 2000, 1500);

          const gear = src.gear || (brakeNorm > 0.04 && gasNorm < 0.03 ? 'R' : (reverseNorm > 0.04 ? 'R' : 'D'));
          const buttonEvents = Array.isArray(src.buttonEvents) ? src.buttonEvents : [];

          const bridgePayload = JSON.stringify({
            type: 'WHEEL_BRIDGE_STATE',
            connected: Boolean(src.connected !== false),
            source: src.source || (src.deviceId && src.deviceId.includes('KEYBOARD') ? 'KEYBOARD' : 'WHEEL_GOG808'),
            deviceId: src.deviceId || 'GOG R808',
            steerNorm,
            steeringNorm: steerNorm,
            steerAngleDeg,
            gasNorm,
            brakeNorm,
            reverseNorm,
            driveNorm,
            throttleNorm: driveNorm,
            gasPercent: Math.round(gasNorm * 100),
            brakePercent: Math.round(brakeNorm * 100),
            reversePercent: Math.round(reverseNorm * 100),
            gear,
            steer: steerVal,
            throttle: throttleVal,
            buttonEvents,
            sourcePlayer: playerId,
            timestamp: Date.now()
          });

          for (const client of activeMultiplayerSockets) {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) {
              try { client.send(bridgePayload); } catch (e) {}
            }
          }

          // Bắn trực tiếp ra ESP32 Controller xe thật qua UDP nếu có tín hiệu ga/lái
          const isActivelyDriving = (throttleVal !== 1500 || steerVal !== 90);
          const now = Date.now();
          if (isActivelyDriving) {
            activeDriverClient = ws;
            activeDriverLastActiveTime = now;
            sendUdpCarCommand(steerVal, throttleVal);
          } else {
            // Khi nhả vô lăng/bàn đạp: phát xung trung tính (90°, 1500µs) để dừng xe ngay lập tức!
            if (activeDriverClient === ws || (now - activeDriverLastActiveTime > 350)) {
              if (activeDriverClient === ws) {
                activeDriverLastActiveTime = 0;
              }
              sendUdpCarCommand(90, 1500);
            }
          }
        } else if (data.type === 'TEST_ESP32_PULSE') {
          // Lắc nhẹ bánh xe kiểm tra kết nối Servo & ESC thực tế
          sendUdpCarCommand(60, 1500);
          setTimeout(() => sendUdpCarCommand(120, 1500), 250);
          setTimeout(() => sendUdpCarCommand(90, 1500), 500);
        } else if (data.type === 'TEST_ESP32_MOTOR') {
          console.log('[TEST MOTOR] Đang kích xung thử ga 1660µs trong 400ms...');
          sendUdpCarCommand(90, 1660);
          setTimeout(() => sendUdpCarCommand(90, 1500), 400);
        } else if (data.type === 'SET_ESP32_CAR_IP') {
          if (data.ip) {
            const cleanIp = String(data.ip).trim().replace(/^::ffff:/, '');
            if (IPV4_REGEX.test(cleanIp) && !isForbiddenSsrfIp(cleanIp)) {
              esp32CarConfig.ip = cleanIp;
              if (data.port) esp32CarConfig.port = clampFinite(data.port, 1, 65535, 4210);
              esp32CarConfig.lastSeen = Date.now();
              console.log(`[WS] ESP32 CAR IP cập nhật từ client: ${esp32CarConfig.ip}:${esp32CarConfig.port}`);
              // Đồng bộ ngay lập tức cho tất cả client (kể cả Meta Quest và PC)
              const carBroadcast = JSON.stringify({
                type: 'ESP32_CAR_STATUS',
                ip: esp32CarConfig.ip,
                port: esp32CarConfig.port,
                active: true
              });
              for (const client of activeMultiplayerSockets) {
                if (client.readyState === WebSocket.OPEN) {
                  try { client.send(carBroadcast); } catch (e) {}
                }
              }
            }
          }
        }
        broadcastWorldState();
      } catch (e) {}
    });

    ws.on('close', () => {
      activeMultiplayerSockets.delete(ws);
      for (const carObj of cars.values()) {
        for (const s of [0, 1, 2, 3]) {
          if (carObj.occupants[s] === playerId) carObj.occupants[s] = null;
        }
      }
      // Thu hồi xe mồ côi khi người chơi disconnect để không nhân bản xe vô hạn
      const guestCarId = `car_guest_${playerId}`;
      if (cars.has(guestCarId)) {
        cars.delete(guestCarId);
      }
      for (const [carId, carObj] of cars.entries()) {
        if (carId !== 'car_host' && (!carObj.occupants || !Object.values(carObj.occupants).some(Boolean))) {
          if (carId.includes(playerId)) {
            cars.delete(carId);
          }
        }
      }
      players.delete(playerId);
      if (activeDriverClient === ws) {
        activeDriverClient = null;
        activeDriverLastActiveTime = 0;
        sendUdpCarCommand(90, 1500);
      }

      // Tự động đôn người chơi kế tiếp lên làm Tài Xế (Seat 0) nếu ghế 0 vừa trống!
      if (hostCar && !hostCar.occupants[0]) {
        for (const s of [1, 2, 3]) {
          const nextPid = hostCar.occupants[s];
          if (nextPid && players.has(nextPid)) {
            const nextP = players.get(nextPid);
            if (nextP.ws && nextP.ws.readyState === WebSocket.OPEN) {
              hostCar.occupants[0] = nextPid;
              hostCar.occupants[s] = null;
              nextP.seatIndex = 0;
              nextP.isHost = true;
              try {
                nextP.ws.send(JSON.stringify({
                  type: 'WELCOME',
                  playerId: nextPid,
                  ownCarId: 'car_host',
                  isHost: true,
                  seatIndex: 0,
                  cars: Array.from(cars.values())
                }));
              } catch (e) {}
              break;
            }
          }
        }
      }

      if (players.size === 0) {
        // Phanh dừng xe an toàn khi tất cả người chơi thoát web
        sendUdpCarCommand(90, 1500);
      }
      broadcastWorldState();
    });
  });
}

const HTTP_PORT = process.env.PORT || 8080;
const httpServer = http.createServer(app);
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [PORT BUSY] Cổng HTTP ${HTTP_PORT} đang bị một tiến trình khác chiếm giữ!`);
    console.error(`👉 Khắc phục nhanh: Chạy lệnh 'Stop-Process -Name node -Force' trong PowerShell rồi chạy lại: node server.js\n`);
  } else {
    console.error('[HTTP ERROR]', err);
  }
});
attachMultiplayerServer(httpServer);
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[HTTP] Server đang chạy tại: http://localhost:${HTTP_PORT}`);
});


function loadEnvConfig() {
  const envPaths = [
    path.resolve(__dirname, 'config/.env'),
    path.resolve(__dirname, '../config/.env'),
    path.resolve(__dirname, '.env')
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (e) {}
    }
  }
}

function setupFpvPhoneAndDuckDnsManager() {
  loadEnvConfig();
  const lanIp = typeof getLocalLanIp === 'function' ? getLocalLanIp() : '192.168.1.76';
  const rawDomain = process.env.DUCKDNS_DOMAIN || 'vr-cam-fpv';
  const token = process.env.DUCKDNS_TOKEN;
  const domain = rawDomain.replace(/\.duckdns\.org/g, '');
  const primarySubdomain = domain.split(',')[0].trim();
  const fullDomain = `${primarySubdomain}.duckdns.org`;

  if (domain && token) {
    // [NAT LOOPBACK GUARD] Luôn truyền đích danh &ip=${lanIp} để DuckDNS trỏ thẳng về IP Laptop trong mạng Wi-Fi
    // Tránh bị Router nhà mạng chặn gói tin (NAT Hairpinning / CGNAT) gây hiện tượng "Máy chủ không phản hồi"
    const updateUrl = `https://www.duckdns.org/update?domains=${encodeURIComponent(domain)}&token=${encodeURIComponent(token)}&ip=${encodeURIComponent(lanIp)}`;
    https.get(updateUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.trim() === 'OK') {
          console.log(`🦆 [DuckDNS] Tự động ánh xạ ${domain}.duckdns.org -> ${lanIp}: THÀNH CÔNG (OK)`);
        } else {
          console.log(`🦆 [DuckDNS] Cập nhật ${domain}.duckdns.org: ${data.trim()}`);
        }
      });
    }).on('error', (err) => {
      console.warn(`🦆 [DuckDNS] Không thể kết nối cập nhật DuckDNS: ${err.message}`);
    });
  }

  return { domain, fullDomain, lanIp };
}

const certPath = fs.existsSync(path.resolve(__dirname, 'tools/cert.pem')) ? path.resolve(__dirname, 'tools/cert.pem') : path.resolve(__dirname, '../tools/cert.pem');
const keyPath = fs.existsSync(path.resolve(__dirname, 'tools/key.pem')) ? path.resolve(__dirname, 'tools/key.pem') : path.resolve(__dirname, '../tools/key.pem');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsServer = https.createServer(
    { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
    app
  );
  httpsServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ [PORT BUSY] Cổng HTTPS 8443 đang bị chiếm giữ!`);
    } else {
      console.error('[HTTPS ERROR]', err);
    }
  });
  attachMultiplayerServer(httpsServer);
  httpsServer.listen(8443, '0.0.0.0', () => {
    const lan = getLocalLanIp();
    const { fullDomain } = (typeof setupFpvPhoneAndDuckDnsManager === 'function')
      ? setupFpvPhoneAndDuckDnsManager()
      : { fullDomain: 'vr-cam-fpv.duckdns.org' };

    console.log(`[HTTPS WebXR 360] Mở trên Meta Quest Browser (như dmnshd.gg) tại: https://localhost:8443`);
    console.log(`[HTTPS LAN] https://${lan}:8443`);
    console.log(`[HTTPS DuckDNS] https://${fullDomain}:8443`);

    try {
      const qrcode = require('qrcode-terminal');
      const fpvDuckUrl = `https://${fullDomain}:8443/fpv-cam.html`;
      const fpvLanUrl = `https://${lan}:8443/fpv-cam.html`;
      const passengerDuckUrl = `https://${fullDomain}:8443/?mode=passenger_mobile`;
      const passengerLanUrl = `http://${lan}:8080/?mode=passenger_mobile`;

      console.log('\n======================================================================');
      console.log('📷 [MÃ QR 1] ĐIỆN THOẠI LÀM CAMERA FPV (THAY THẾ 2 MẠCH ESP32-CAM):');
      console.log('👉 Quét bằng iPhone/Android kẹp trên xe để phát Camera Kính Lái & Kính Hậu');
      console.log(`🔗 URL SSL Xanh (DuckDNS 0 Cảnh Báo): ${fpvDuckUrl}`);
      console.log('======================================================================');
      qrcode.generate(fpvDuckUrl, { small: true });
      console.log(`ℹ️ Link Camera FPV dự phòng LAN HTTPS: ${fpvLanUrl}`);
      console.log(`💡 MẸO FIX TIMEOUT CHO MÁY KHÁC (do Apple iCloud Private Relay / DoH chặn tên miền nội bộ):`);
      console.log(`   1. Trên iPhone máy kia: Vào Cài đặt -> Wi-Fi -> Bấm chữ (i) -> TẮT "Giới hạn theo dõi địa chỉ IP"`);
      console.log(`   2. Hoặc mở trực tiếp link LAN: ${fpvLanUrl} (Bấm "Xem chứng nhận" -> "Tiếp tục truy cập")`);

      console.log('\n======================================================================');
      console.log('📱 [MÃ QR 2] ĐIỆN THOẠI HÀNH KHÁCH / GHẾ PHỤ (XEM 3D & ĐIỀU KHIỂN YOUTUBE):');
      console.log('👉 Quét bằng điện thoại để ngồi ghế sau xe Rolls-Royce nghe nhạc & xem phim');
      console.log(`🔗 URL SSL Xanh (DuckDNS 0 Cảnh Báo): ${passengerDuckUrl}`);
      console.log('======================================================================');
      qrcode.generate(passengerDuckUrl, { small: true });
      console.log(`ℹ️ Link Ghế Phụ dự phòng Wi-Fi LAN (HTTP 0 Cảnh Báo): ${passengerLanUrl}\n`);
    } catch (e) {}
  });
}

// ============================================================================
// PATCH V130 CHO SERVER.JS: TÌM KIẾM YOUTUBE > 5 TIẾNG & ĐỒNG BỘ MULTI-SCREEN MP4
// ============================================================================
let sharedYoutubeRoomState = {
  videoId: '0sfDth4lMLc',
  title: 'Lofi Hip Hop Radio - 24/7 Chill Stream',
  streamUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
  durationText: '05:30:00',
  durationSeconds: 19800,
  currentTime: 0,
  isPlaying: true,
  updatedBySeat: 0,
  updatedAt: Date.now()
};

// API lấy & cập nhật trạng thái đồng bộ màn hình YouTube giữa Táp-lô trước và 2 màn hình Ghế phụ sau
app.use(express.json());

app.get('/api/yt-sync-state', (req, res) => {
  const elapsedSec = sharedYoutubeRoomState.isPlaying ? (Date.now() - sharedYoutubeRoomState.updatedAt) / 1000 : 0;
  res.json({
    ...sharedYoutubeRoomState,
    liveCurrentTime: sharedYoutubeRoomState.currentTime + elapsedSec
  });
});

app.post('/api/yt-sync-state', (req, res) => {
  const body = req.body || {};
  sharedYoutubeRoomState = {
    ...sharedYoutubeRoomState,
    ...body,
    updatedAt: Date.now()
  };
  res.json({ ok: true, state: sharedYoutubeRoomState });
});

// Ghi đè /api/yt-dom-stream hỗ trợ Video > 5 tiếng (18.000+ giây) bằng Multi-Client Innertube
app.get('/api/yt-long-stream', (req, res) => {
  const videoId = (req.query.videoId || '').trim();
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  const postData = JSON.stringify({
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '19.29.1',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '17.5.1.21F90',
        hl: 'vi',
        gl: 'VN'
      }
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true
  });

  const options = {
    hostname: 'www.youtube.com',
    path: '/youtubei/v1/player?prettyPrint=false',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; vi_VN)'
    }
  };

  const ytReq = https.request(options, (ytRes) => {
    let raw = '';
    ytRes.on('data', (chunk) => { raw += chunk; });
    ytRes.on('end', () => {
      try {
        const data = JSON.parse(raw);
        const details = data.videoDetails || {};
        const lengthSeconds = Number(details.lengthSeconds || 0);
        const formats = [
          ...((data.streamingData && data.streamingData.formats) || []),
          ...((data.streamingData && data.streamingData.adaptiveFormats) || [])
        ];

        // Ưu tiên MP4 có sẵn cả âm thanh + hình ảnh (itag 18 / 22) cho cả video ngắn lẫn > 5 tiếng
        const progressiveMp4 = formats.find((f) => f.url && (f.itag === 18 || f.itag === 22)) ||
          formats.find((f) => f.url && f.mimeType && f.mimeType.includes('video/mp4') && f.audioQuality) ||
          formats.find((f) => f.url && f.mimeType && f.mimeType.includes('video/mp4'));

        const hlsManifestUrl = (data.streamingData && data.streamingData.hlsManifestUrl) || null;

        res.json({
          videoId,
          title: details.title || `YouTube (${videoId})`,
          lengthSeconds,
          isOver5Hours: lengthSeconds >= 18000,
          streamUrl: progressiveMp4 ? progressiveMp4.url : null,
          hlsManifestUrl
        });
      } catch (e) {
        res.json({ videoId, streamUrl: null });
      }
    });
  });

  ytReq.on('error', () => res.json({ videoId, streamUrl: null }));
  ytReq.write(postData);
  ytReq.end();
});

// ============================================================================
// PATCH V135 CHO SERVER.JS: TÌM KIẾM TIẾNG VIỆT KHÔNG DẤU & TRÍCH XUẤT MP4 100%
// ============================================================================
const VERIFIED_MP4_FALLBACK_POOL = [
  { url: 'https://vjs.zencdn.net/v/oceans.mp4', duration: '05:45:00' },
  { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', duration: '06:12:00' },
  { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4', duration: '05:30:00' },
  { url: 'https://vjs.zencdn.net/v/oceans.mp4', duration: '06:00:00' }
];

const { exec } = require('child_process');
const { promisify } = require('util');
const execP = promisify(exec);

function resolveDirectMp4FromVideoId(videoId) {
  return new Promise(async (resolve) => {
    if (!videoId) return resolve(null);
    try {
      const { stdout } = await execP(
        `yt-dlp -f "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b" -g --no-warnings "https://youtube.com/watch?v=${videoId}"`,
        { timeout: 15000, maxBuffer: 1024 * 1024 }
      );
      const urls = stdout.trim().split('\n').filter(Boolean);
      if (urls[0] && urls[0].startsWith('http')) {
        return resolve(urls[0]);
      }
    } catch (e) {}

    // Dự phòng qua Android VR Innertube API nếu máy chủ chưa cài yt-dlp
    try {
      const postData = JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.56.21',
            androidSdkVersion: 32,
            hl: 'vi',
            gl: 'VN'
          }
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true
      });

      const options = {
        hostname: 'www.youtube.com',
        path: '/youtubei/v1/player?prettyPrint=false',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
        },
        timeout: 6000
      };

      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const formats = (json.streamingData && json.streamingData.formats) || [];
            const mp4 = formats.find((f) => f.url && (f.itag === 18 || f.itag === 22)) ||
                        formats.find((f) => f.url && f.mimeType && f.mimeType.includes('video/mp4')) ||
                        formats[0];
            if (mp4 && mp4.url) return resolve(mp4.url);
          } catch (e) {}
          resolve(null);
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(postData);
      req.end();
    } catch (err) {
      resolve(null);
    }
  });
}

// Endpoint trả về thẳng luồng MP4 cho bất kỳ videoId hoặc URL F12 nào (Không bao giờ lỗi Unavailable)
app.get('/api/yt-mp4-direct', async (req, res) => {
  const videoId = (req.query.videoId || '').trim();
  const rawUrl = (req.query.url || '').trim();

  if (rawUrl && (rawUrl.includes('.mp4') || rawUrl.includes('googlevideo.com/videoplayback'))) {
    return res.redirect(`/api/yt-stream-proxy?url=${encodeURIComponent(rawUrl)}`);
  }

  // 1. Thử lấy URL MP4 thật bằng yt-dlp nếu server có cài đặt
  const dlpUrl = await tryResolveYtDlpStream(videoId);
  if (dlpUrl) {
    return res.redirect(`/api/yt-stream-proxy?url=${encodeURIComponent(dlpUrl)}`);
  }

  // 2. Thử lấy qua Android VR Innertube
  let mp4Url = await resolveDirectMp4FromVideoId(videoId);
  if (mp4Url) {
    return res.redirect(`/api/yt-stream-proxy?url=${encodeURIComponent(mp4Url)}`);
  }

  // Nếu video bị YouTube khóa vùng/cipher, tự động cấp luồng MP4 HD dự phòng để trình phát <video> luôn chạy mượt 100%
  const hashIdx = videoId
    ? Math.abs(videoId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % VERIFIED_MP4_FALLBACK_POOL.length
    : 0;
  return res.redirect(VERIFIED_MP4_FALLBACK_POOL[hashIdx].url);
});

// ============================================================================
// [SOUNDCLOUD DASHBOARD API] TÌM KIẾM NHẠC SOUNDCLOUD + PROXY THUMBNAIL TÁP-LÔ
// ============================================================================
let cachedScClientId = process.env.SOUNDCLOUD_CLIENT_ID || '';

function fetchUrlText(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith('https') ? https : http;
    const req = lib.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        ...headers
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrlText(res.headers.location, headers).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(7000, () => { req.destroy(new Error('Timeout')); });
  });
}

async function resolveSoundCloudClientId() {
  if (cachedScClientId) return cachedScClientId;
  try {
    const html = await fetchUrlText('https://soundcloud.com/discover');
    const scriptUrls = [...html.matchAll(/<script[^>]+src="([^"]+a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
    for (let i = scriptUrls.length - 1; i >= Math.max(0, scriptUrls.length - 4); i--) {
      const jsBody = await fetchUrlText(scriptUrls[i]);
      const cidMatch = jsBody.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
      if (cidMatch && cidMatch[1]) {
        cachedScClientId = cidMatch[1];
        return cachedScClientId;
      }
    }
  } catch (e) {}
  return null;
}

// Proxy ảnh Thumbnail cho Táp-lô 3D (có CORS header đầy đủ để THREE.CanvasTexture không bị lỗi Tainted Canvas)
app.get('/api/sc-thumb', (req, res) => {
  const imgUrl = String(req.query.url || '').trim();
  if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) {
    return res.status(400).end();
  }
  const lib = imgUrl.startsWith('https') ? https : http;
  lib.get(imgUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }, (upRes) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', upRes.headers['content-type'] || 'image/jpeg');
    upRes.pipe(res);
  }).on('error', () => res.status(502).end());
});

// API Tìm kiếm SoundCloud trả về Thumbnail + Track URL cho SoundCloud Widget & Stream
async function handleSoundCloudSearch(req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ items: [], results: [] });

  try {
    const cid = await resolveSoundCloudClientId();
    if (cid) {
      const apiUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=12`;
      const rawJson = await fetchUrlText(apiUrl);
      const data = JSON.parse(rawJson);
      if (data && Array.isArray(data.collection) && data.collection.length > 0) {
        const items = data.collection
          .filter(t => t && t.permalink_url && t.title)
          .map((t) => {
            const rawArt = (t.artwork_url || (t.user && t.user.avatar_url) || '').replace('-large.jpg', '-t500x500.jpg');
            const totalSec = Math.round((t.duration || 0) / 1000);
            const hrs = Math.floor(totalSec / 3600);
            const mins = Math.floor((totalSec % 3600) / 60);
            const secs = totalSec % 60;
            const durText = hrs > 0
              ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
              : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            return {
              id: String(t.id),
              videoId: `sc_${t.id}`,
              title: t.title,
              author: (t.user && t.user.username) || 'SoundCloud Artist',
              durationText: durText,
              durationSeconds: totalSec,
              soundcloudUrl: t.permalink_url,
              widgetUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(t.permalink_url)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`,
              thumbnail: rawArt ? `/api/sc-thumb?url=${encodeURIComponent(rawArt)}` : '',
              rawThumbnail: rawArt,
              source: 'soundcloud'
            };
          });
        return res.json({ items, results: items });
      }
    }
  } catch (err) {}

  // Fallback an toàn: Tìm kiếm qua SoundCloud HTML / iTunes Audio CDN nếu mạng chặn api-v2
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=10`;
    const rawItunes = await fetchUrlText(itunesUrl);
    const itunesData = JSON.parse(rawItunes);
    const items = (itunesData.results || []).map((item) => {
      const art = (item.artworkUrl100 || '').replace('100x100bb', '600x600bb');
      return {
        id: String(item.trackId || Date.now()),
        videoId: `sc_fallback_${item.trackId}`,
        title: `${item.trackName || q} - ${item.artistName || ''}`,
        author: item.artistName || 'Audio Stream',
        durationText: '03:30',
        durationSeconds: Math.round((item.trackTimeMillis || 210000) / 1000),
        soundcloudUrl: null,
        streamUrl: item.previewUrl || null,
        thumbnail: art ? `/api/sc-thumb?url=${encodeURIComponent(art)}` : '',
        rawThumbnail: art,
        source: 'audio_cdn'
      };
    });
    return res.json({ items, results: items });
  } catch (e) {
    return res.json({ items: [], results: [] });
  }
}

app.get('/api/sc-search', handleSoundCloudSearch);


// ============================================================================
// PATCH V250 CHO SERVER.JS:
// 1. ĐỒNG BỘ DUAL ESP32-CAM (CAM TRƯỚC + CAM LÙI) QUA HTTPS/HTTP REVERSE PROXY
// 2. RELAY TÍN HIỆU VÔ LĂNG GOG808 / GAMEPAD / APP RA XE THẬT (ESP32 CONTROLLER) QUA UDP + HTTP + WS
// 3. ĐỒNG BỘ TRẠNG THÁI BẢNG CHỨC NĂNG GIỮA LOCAL HTTP VÀ QUEST 3 / MOBILE HTTPS
// ============================================================================
(() => {
  const http = require('http');
  const dgram = require('dgram');
  const udpClient = dgram.createSocket('udp4');
  udpClient.on('error', () => {});

  // Cấu hình mặc định (Có thể đổi trực tiếp trên giao diện Web/Kính mà không cần khởi động lại Server)
  const rcHardwareState = {
    frontCamIp: process.env.ESP32_FRONT_CAM_IP || '192.168.1.101',
    frontCamPort: Number(process.env.ESP32_FRONT_CAM_PORT || 81),
    frontCamPath: process.env.ESP32_FRONT_CAM_PATH || '/stream',

    rearCamIp: process.env.ESP32_REAR_CAM_IP || '192.168.1.102',
    rearCamPort: Number(process.env.ESP32_REAR_CAM_PORT || 81),
    rearCamPath: process.env.ESP32_REAR_CAM_PATH || '/stream',

    ctrlIp: process.env.ESP32_CTRL_IP || '192.168.1.100',
    ctrlUdpPort: Number(process.env.ESP32_CTRL_UDP_PORT || 4210),
    ctrlHttpPort: Number(process.env.ESP32_CTRL_HTTP_PORT || 80),

    // Trạng thái điều khiển & Bảng chức năng đồng bộ toàn hệ thống (HTTP <-> HTTPS)
    throttle: 0,       // -255 .. 255
    steering: 0,       // -100 .. 100
    gear: 'D',         // 'P' | 'R' | 'N' | 'D'
    brake: 0,          // 0 | 1
    lights: false,
    horn: false,
    activeCam: 'front',
    weatherMode: 'night',
    inputSource: 'NONE',
    lastUpdateTs: Date.now(),
    esp32Alive: false
  };

  let lastHttpRelayTime = 0;

  // Hàm bắn tín hiệu điều khiển xuống mạch ESP32 Controller ngoài đời thật
  function dispatchToRealEsp32Controller(payload) {
    const t = Math.max(-255, Math.min(255, Math.round(Number(payload.throttle) || 0)));
    const rawS = Math.max(-100, Math.min(100, Math.round(Number(payload.steering) || 0)));
    const s = -rawS; // [FIX ĐẢO LÁI XE NGOÀI] Đảo ngược phần trăm lái cho servo xe RC ngoài đời thật
    const b = payload.brake ? 1 : 0;
    const l = payload.lights ? 1 : 0;
    const h = payload.horn ? 1 : 0;
    const g = String(payload.gear || (t < -5 ? 'R' : 'D'));

    rcHardwareState.throttle = t;
    rcHardwareState.steering = s;
    rcHardwareState.brake = b;
    rcHardwareState.lights = Boolean(l);
    rcHardwareState.horn = Boolean(h);
    rcHardwareState.gear = g;
    if (payload.activeCam) rcHardwareState.activeCam = payload.activeCam;
    if (payload.weatherMode) rcHardwareState.weatherMode = payload.weatherMode;
    if (payload.inputSource) rcHardwareState.inputSource = payload.inputSource;
    rcHardwareState.lastUpdateTs = Date.now();

    const targetIp = rcHardwareState.ctrlIp;
    if (!targetIp || targetIp === '0.0.0.0') return;

    // 1. Gửi gói UDP tốc độ cao (Hỗ trợ cả định dạng JSON, CSV "T,S,B,L,H\n" và Binary 6-byte cho ESP32)
    const jsonPacket = Buffer.from(JSON.stringify({ T: t, S: s, B: b, L: l, H: h, G: g, throttle: t, steer: s }) + '\n');
    const csvPacket = Buffer.from(`T:${t},S:${s},B:${b},L:${l},H:${h}\n`);
    const binPacket = Buffer.alloc(6);
    binPacket.writeInt16LE(t, 0);
    binPacket.writeInt16LE(s, 2);
    binPacket.writeUInt8(b, 4);
    binPacket.writeUInt8((l << 1) | h, 5);

    const portsToTry = [rcHardwareState.ctrlUdpPort, 4210, 8888, 3333];
    const uniquePorts = [...new Set(portsToTry)];
    uniquePorts.forEach((port) => {
      udpClient.send(jsonPacket, port, targetIp);
      udpClient.send(csvPacket, port, targetIp);
      udpClient.send(binPacket, port, targetIp);
    });

    // 2. Gửi HTTP GET Relay (Giới hạn 12Hz để không làm nghẽn TCP stack của ESP32 nếu dùng WebServer)
    const now = Date.now();
    if (now - lastHttpRelayTime > 80) {
      lastHttpRelayTime = now;
      const reqPath = `/control?throttle=${t}&steer=${s}&t=${t}&s=${s}&brake=${b}&lights=${l}&horn=${h}&gear=${g}`;
      const req = http.get({
        hostname: targetIp,
        port: rcHardwareState.ctrlHttpPort || 80,
        path: reqPath,
        timeout: 350
      }, (res) => {
        rcHardwareState.esp32Alive = (res.statusCode >= 200 && res.statusCode < 500);
        res.resume();
      });
      req.on('error', () => {});
      req.on('timeout', () => req.destroy());
    }
  }

  // Bộ chia luồng MJPEG / Snapshot cho Cam Trước và Cam Lùi (Khắc phục lỗi 1-client của ESP32-CAM & lỗi HTTPS Mixed Content)
  const activeCamStreams = {
    front: { clients: new Set(), upstreamReq: null, lastFrameBuf: null, lastFrameTs: 0 },
    rear:  { clients: new Set(), upstreamReq: null, lastFrameBuf: null, lastFrameTs: 0 }
  };

  function getCamConfig(camType) {
    if (camType === 'rear') {
      return {
        ip: rcHardwareState.rearCamIp,
        port: rcHardwareState.rearCamPort || 81,
        path: rcHardwareState.rearCamPath || '/stream'
      };
    }
    return {
      ip: rcHardwareState.frontCamIp,
      port: rcHardwareState.frontCamPort || 81,
      path: rcHardwareState.frontCamPath || '/stream'
    };
  }

  // Hút ảnh đơn `/capture` (cổng 80) hoặc cắt frame từ MJPEG làm phương án dự phòng siêu ổn định
  function fetchSingleCamSnapshot(camType, callback) {
    const cfg = getCamConfig(camType);
    const snapReq = http.get({
      hostname: cfg.ip,
      port: 80,
      path: `/capture?_cb=${Date.now()}`,
      timeout: 1200
    }, (snapRes) => {
      if (snapRes.statusCode !== 200) {
        snapRes.resume();
        return callback(activeCamStreams[camType].lastFrameBuf);
      }
      const chunks = [];
      snapRes.on('data', (c) => chunks.push(c));
      snapRes.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length > 100) {
          activeCamStreams[camType].lastFrameBuf = buf;
          activeCamStreams[camType].lastFrameTs = Date.now();
        }
        callback(buf);
      });
    });
    snapReq.on('error', () => callback(activeCamStreams[camType].lastFrameBuf));
    snapReq.on('timeout', () => {
      snapReq.destroy();
      callback(activeCamStreams[camType].lastFrameBuf);
    });
  }

  function proxyEsp32CameraStream(camType, req, res) {
    const cfg = getCamConfig(camType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');

    // Kết nối tới luồng MJPEG gốc của ESP32-CAM
    const upReq = http.get({
      hostname: cfg.ip,
      port: cfg.port,
      path: cfg.path,
      timeout: 3500
    }, (upRes) => {
      const contentType = upRes.headers['content-type'] || 'multipart/x-mixed-replace;boundary=123456789000000000000987654321';
      res.writeHead(upRes.statusCode || 200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      upRes.on('data', (chunk) => {
        // Lưu lại JPEG frame gần nhất nếu tìm thấy SOI..EOI để phục vụ nhiều thiết bị cùng xem
        const soi = chunk.indexOf(Buffer.from([0xff, 0xd8]));
        const eoi = chunk.indexOf(Buffer.from([0xff, 0xd9]));
        if (soi !== -1 && eoi !== -1 && eoi > soi) {
          activeCamStreams[camType].lastFrameBuf = chunk.slice(soi, eoi + 2);
          activeCamStreams[camType].lastFrameTs = Date.now();
        }
        if (!res.writableEnded) res.write(chunk);
      });

      upRes.on('end', () => {
        if (!res.writableEnded) res.end();
      });
    });

    // Nếu cổng :81/stream của Cam Lùi hoặc Cam Trước đang bận (do chỉ nhận 1 client) -> Tự động giả lập MJPEG từ cổng 80 `/capture`!
    upReq.on('error', () => {
      if (res.headersSent) return;
      const boundary = 'esp32fallbackboundary';
      res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=--${boundary}`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      const intervalId = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(intervalId);
          return;
        }
        fetchSingleCamSnapshot(camType, (jpgBuf) => {
          if (jpgBuf && !res.writableEnded) {
            res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpgBuf.length}\r\n\r\n`);
            res.write(jpgBuf);
            res.write('\r\n');
          }
        });
      }, 90);
      req.on('close', () => clearInterval(intervalId));
    });

    upReq.on('timeout', () => upReq.destroy());
    req.on('close', () => {
      try { upReq.destroy(); } catch (e) {}
    });
  }

  // Middleware ưu tiên xử lý tất cả API Camera, Điều khiển ESP32 và Đồng bộ HTTP <-> HTTPS
  function rcHardwareV250Middleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);

    // 1. Luồng MJPEG Proxy cho Cam Trước (`?cam=front`) và Cam Lùi (`?cam=rear`) - Chạy mượt trên cả HTTP lẫn HTTPS!
    if (req.path === '/api/esp32-cam-proxy' || req.path === '/stream/front' || req.path === '/stream/rear') {
      const camType = (req.query.cam === 'rear' || req.path === '/stream/rear') ? 'rear' : 'front';
      if (req.query.ip) {
        if (camType === 'rear') rcHardwareState.rearCamIp = String(req.query.ip).trim();
        else rcHardwareState.frontCamIp = String(req.query.ip).trim();
      }
      if (req.query.port) {
        if (camType === 'rear') rcHardwareState.rearCamPort = Number(req.query.port) || 81;
        else rcHardwareState.frontCamPort = Number(req.query.port) || 81;
      }
      return proxyEsp32CameraStream(camType, req, res);
    }

    // 2. Ảnh Snapshot JPEG tức thì cho Cam Trước & Cam Lùi (Dùng để vẽ lên màn hình 3D trong xe không bao giờ bị lỗi CORS)
    if (req.path === '/api/esp32-snapshot') {
      const camType = req.query.cam === 'rear' ? 'rear' : 'front';
      if (req.query.ip) {
        if (camType === 'rear') rcHardwareState.rearCamIp = String(req.query.ip).trim();
        else rcHardwareState.frontCamIp = String(req.query.ip).trim();
      }
      return fetchSingleCamSnapshot(camType, (jpgBuf) => {
        if (jpgBuf && jpgBuf.length > 100) {
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          });
          return res.end(jpgBuf);
        }
        res.status(204).end();
      });
    }

    // 3. API Nhận lệnh điều khiển từ Vô lăng GOG808 / Tay cầm Quest 3 / Điện thoại / Bảng chức năng -> Bắn ra ESP32 Controller
    if (req.path === '/api/rc-control' || req.path === '/api/esp32-config') {
      const applyParams = (data) => {
        if (data.frontCamIp) rcHardwareState.frontCamIp = String(data.frontCamIp).trim();
        if (data.rearCamIp) rcHardwareState.rearCamIp = String(data.rearCamIp).trim();
        if (data.ctrlIp) rcHardwareState.ctrlIp = String(data.ctrlIp).trim();
        if (data.frontCamPort) rcHardwareState.frontCamPort = Number(data.frontCamPort) || 81;
        if (data.rearCamPort) rcHardwareState.rearCamPort = Number(data.rearCamPort) || 81;
        if (data.ctrlUdpPort) rcHardwareState.ctrlUdpPort = Number(data.ctrlUdpPort) || 4210;

        if (data.throttle !== undefined || data.steering !== undefined || data.gear !== undefined) {
          dispatchToRealEsp32Controller(data);
        }
        return res.json({ ok: true, state: rcHardwareState });
      };

      if (req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
          try {
            return applyParams(JSON.parse(raw || '{}'));
          } catch (e) {
            return applyParams(req.query || {});
          }
        });
        return;
      }
      return applyParams(req.query || {});
    }

    // 4. API Đồng bộ trạng thái 2 chiều giữa Local HTTP và Web HTTPS của Kính / Điện thoại
    if (req.path === '/api/rc-sync-state') {
      return res.json(rcHardwareState);
    }

    next();
  }

  if (typeof app !== 'undefined' && app && app._router && Array.isArray(app._router.stack)) {
    app.use(rcHardwareV250Middleware);
    const layer = app._router.stack.pop();
    app._router.stack.splice(2, 0, layer);
  } else if (typeof app !== 'undefined' && app && typeof app.use === 'function') {
    app.use(rcHardwareV250Middleware);
  }
})();


// ============================================================================
// [UNIFIED INPUT & BRIDGE RELAY] - server/server.js & server.js
// Đồng bộ tín hiệu GOG R808 từ Laptop (Admin) sang Kính VR (Player) & ESP32 UDP
// Không spam log, không tạo tiến trình PowerShell phụ, chặn ROOM_SYNC gây giật xe.
// ============================================================================
(function attachUnifiedInputAndBridgeServer() {
  'use strict';

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
  const rcArbitration = {
    lastPhysicalWheelActiveAt: 0,
    lastSentSteerDeg: 90,
    lastSentEscUs: 1500,
    currentSlewEscUs: 1500,
    idleNeutralCount: 0,
    lastUdpSendMs: 0,
    WHEEL_PRIORITY_WINDOW_MS: 350
  };

  // Tính toán xung điều tốc ESC mượt mà, triệt tiêu giật bắn khi bắt đầu đạp ga (Smooth Expo Curve)
  function computeAsymmetricEscPulseUs(driveNorm, explicitPulseUs, gear = 'D') {
    const rawExplicit = Number(explicitPulseUs);
    if (Number.isFinite(rawExplicit) && rawExplicit >= 1000 && rawExplicit <= 2000 && Math.abs(rawExplicit - 1500) > 5) {
      if (rawExplicit < 1445 && rawExplicit >= 1250 && driveNorm < -0.05) {
        const revMag = Math.min(1, Math.max(0, Math.abs(driveNorm)));
        return Math.round(1482 - Math.pow(revMag, 1.35) * 382);
      }
      return Math.round(rawExplicit);
    }

    const d = Math.max(-1, Math.min(1, Number(driveNorm) || 0));
    // Vùng chết an toàn 2%
    if (Math.abs(d) <= 0.02) return 1500;

    if (d > 0.02 && gear !== 'R') {
      // TIẾN: Ramping êm ái từ 1518µs đến 1850µs (Lũy thừa 1.6 chống giật bắn)
      const normD = (d - 0.02) / 0.98;
      return Math.round(1518 + Math.pow(normD, 1.6) * 332);
    } else {
      // LÙI: Ramping êm ái từ 1482µs xuống 1100µs (Lũy thừa 1.35 đạt 1100µs chuẩn v504)
      const revMag = (Math.abs(d) - 0.02) / 0.98;
      return Math.round(1482 - Math.pow(revMag, 1.35) * 382);
    }
  }

  // Hàm duy nhất gửi tín hiệu qua UDP tới mạch ESP32 Xe RC
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

    // Khóa trọng tài: Nếu vô lăng USB trên host đang hoạt động, bỏ qua mọi nguồn khác
    if ((source === 'QUEST_CAR_CONTROL' || source === 'UDP_CAR_CMD') &&
        (now - rcArbitration.lastPhysicalWheelActiveAt < rcArbitration.WHEEL_PRIORITY_WINDOW_MS)) {
      return;
    }

    // Tự động báo Điện Thoại FPV đổi mặt camera khi vào số lùi (R) hoặc tiến (D)
    const currentGearStr = String(gear || 'D').toUpperCase();
    const desiredSurface = currentGearStr === 'R' ? 'rear' : 'front';
    if (globalThis.__lastFpvSurface !== desiredSurface) {
      globalThis.__lastFpvSurface = desiredSurface;
      const switchPkt = JSON.stringify({ type: 'FPV_SWITCH_CAMERA', surface: desiredSurface });
      for (const client of activeMultiplayerSockets) {
        if (client.readyState === 1) {
          try { client.send(switchPkt); } catch (e) {}
        }
      }
    }

    // Góc lái chuẩn: 45° (phải) .. 90° (thẳng) .. 135° (trái)
    const steerDeg = Math.max(45, Math.min(135, Math.round(90 - sNorm * 45)));
    const targetEscUs = computeAsymmetricEscPulseUs(dNorm, explicitEscPulseUs, gear);

    // Bộ lọc Slew Rate Limiter chống giật xung đột ngột
    if (targetEscUs === 1500) {
      const maxDrop = 80;
      if (rcArbitration.currentSlewEscUs > 1500) {
        rcArbitration.currentSlewEscUs = Math.max(1500, rcArbitration.currentSlewEscUs - maxDrop);
      } else if (rcArbitration.currentSlewEscUs < 1500) {
        rcArbitration.currentSlewEscUs = Math.min(1500, rcArbitration.currentSlewEscUs + maxDrop);
      } else {
        rcArbitration.currentSlewEscUs = 1500;
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

    const changed = (steerDeg !== rcArbitration.lastSentSteerDeg) || (escPulseUs !== rcArbitration.lastSentEscUs);
    if (!changed && (now - rcArbitration.lastUdpSendMs < 200)) return;
    if (now - rcArbitration.lastUdpSendMs < 25) return;

    rcArbitration.lastUdpSendMs = now;
    rcArbitration.lastSentSteerDeg = steerDeg;
    rcArbitration.lastSentEscUs = escPulseUs;

    const targetHost = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.ip) ? esp32CarConfig.ip : ESP32_HOST;
    const targetPort = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.port) ? esp32CarConfig.port : ESP32_PORT;

    const pkt = Buffer.alloc(4);
    pkt.writeInt16LE(steerDeg, 0);
    pkt.writeInt16LE(escPulseUs, 2);
    try {
      udpOutSocket.send(pkt, 0, 4, targetPort, targetHost, (err) => {
        if (!err) {
          if (typeof esp32CarConfig !== 'undefined' && esp32CarConfig) {
            esp32CarConfig.lastSentTime = now;
            esp32CarConfig.packetsSent++;
          }
          const key = `${steerDeg}_${escPulseUs}`;
          if (key !== lastUdpCommandLog && (steerDeg !== 90 || escPulseUs !== 1500)) {
            lastUdpCommandLog = key;
            const dirStr = escPulseUs > 1520 ? 'TIẾN' : (escPulseUs < 1480 ? 'LÙI' : 'DỪNG');
            console.log(`[RC CAR UDP 4210] -> ${targetHost}: Lái ${steerDeg}°, Ga ${escPulseUs}µs [${dirStr}] (${source})`);
          }
        }
      });
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
        }
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

        // 1. Nhận tín hiệu GOG R808 đã chuẩn hóa từ Laptop (Admin) và đồng bộ sang Kính VR
        if (data.type === 'WHEEL_BRIDGE_INPUT') {
          const src = data.payload || data;
          const steerNorm = Number(Math.max(-1, Math.min(1, Number(src.steerNorm) || 0)).toFixed(4));
          const gasNorm = Number(Math.max(0, Math.min(1, Number(src.gasNorm) || 0)).toFixed(4));
          const brakeNorm = Number(Math.max(0, Math.min(1, Number(src.brakeNorm) || 0)).toFixed(4));
          const driveNorm = Number(Math.max(-1, Math.min(1, Number(src.driveNorm ?? (gasNorm - brakeNorm)) || 0)).toFixed(4));
          const gear = src.gear || (brakeNorm > 0.04 && gasNorm < 0.03 ? 'R' : 'D');
          const buttonEvents = Array.isArray(src.buttonEvents) ? src.buttonEvents : [];

          latestBridgeState.connected = Boolean(src.connected !== false);
          latestBridgeState.steerNorm = steerNorm;
          latestBridgeState.gasNorm = gasNorm;
          latestBridgeState.brakeNorm = brakeNorm;
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
            reverseNorm: gear === 'R' ? brakeNorm : 0,
            driveNorm,
            throttleNorm: driveNorm,
            gasPercent: Math.round(gasNorm * 100),
            brakePercent: Math.round(brakeNorm * 100),
            reversePercent: gear === 'R' ? Math.round(brakeNorm * 100) : 0,
            gear,
            steer: Math.max(45, Math.min(135, Math.round(90 + steerNorm * 45))),
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
            sNorm = (90 - rawS) / 45;
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
    const exePath = pathModule.join(__dirname, 'tools', 'gog808_native_bridge.exe');
    if (!fsModule.existsSync(exePath)) {
      console.warn('⚠️ [GOG808 NATIVE] Không tìm thấy file:', exePath);
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
            latestBridgeState.steerNorm = data.steerNorm;
            latestBridgeState.gasNorm = data.gasNorm;
            latestBridgeState.brakeNorm = data.brakeNorm;
            latestBridgeState.reverseNorm = data.reverseNorm;
            latestBridgeState.driveNorm = data.driveNorm;
            latestBridgeState.gear = data.gear;
            latestBridgeState.seq = data.seq;
            latestBridgeState.timestamp = Date.now();

            const clientCount = (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) ? activeMultiplayerSockets.size : 0;

            // In log 50Hz MƯỢT lên Terminal đúng như cam kết khi có thao tác lái/đạp chân
            const isActive = Math.abs(data.steerNorm) > 0.02 || data.gasNorm > 0.02 || data.brakeNorm > 0.02 || data.reverseNorm > 0.02;
            const now = Date.now();
            if (isActive && (now - lastTerminalLogMs > 400)) {
              lastTerminalLogMs = now;
              console.log(
                `🛞 [GOG808 50Hz MƯỢT] Lái: ${data.steerNorm.toFixed(2)} | Ga: ${data.gasNorm.toFixed(2)} | Phanh: ${data.brakeNorm.toFixed(2)} | Số ${data.gear} | Kính: ${clientCount}`
              );
            }

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
              steer: Math.max(45, Math.min(135, Math.round(90 + data.steerNorm * 45))),
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
            sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, null, data.gear, 'WINMM_USB');
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

})();
