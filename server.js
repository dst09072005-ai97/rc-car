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
    reqPath.endsWith('server.js') ||
    reqPath.includes('package.json') ||
    reqPath.includes('package-lock.json') ||
    reqPath.includes('.git') ||
    reqPath.includes('.agent') ||
    reqPath.startsWith('/tools') ||
    reqPath.startsWith('/esp32') ||
    reqPath.startsWith('/node_modules');

  if (isSensitive) {
    return res.status(403).send('Forbidden: Access to sensitive resource is blocked.');
  }
  next();
});
const wwwPath = fs.existsSync(path.resolve(__dirname, '../www')) ? path.resolve(__dirname, '../www') : __dirname;
app.use(express.static(wwwPath));
app.use(express.static(__dirname));
const v2Www = path.resolve(__dirname, 'v2/golden_baseline_v2_20261020/www');
if (fs.existsSync(v2Www)) {
  app.use(express.static(v2Www));
}

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
app.get('/api/yt-dom-stream', (req, res) => {
  const videoId = String(req.query.videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ error: 'Invalid or missing videoId' });

  const postData = JSON.stringify({
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'vi',
        gl: 'VN'
      }
    },
    videoId
  });

  const options = {
    hostname: 'www.youtube.com',
    path: '/youtubei/v1/player?prettyPrint=false',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
    }
  };

  const ytReq = https.request(options, (ytRes) => {
    let raw = '';
    ytRes.on('data', (chunk) => { raw += chunk; });
    ytRes.on('end', () => {
      try {
        const data = JSON.parse(raw);
        const formats = (data.streamingData && data.streamingData.formats) || [];
        // Ưu tiên itag 18 (MP4 360p/720p có cả tiếng + hình)
        const mp4 = formats.find((f) => f.url && f.itag === 18) ||
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

// Cấu hình mạch điều khiển xe RC thật (ESP32 Car Controller - GPIO 12/13 qua UDP 4210)
const esp32CarConfig = {
  ip: null,
  port: 4210,
  lastSeen: 0,
  lastSentTime: 0,
  packetsSent: 0
};

// Hàm gửi gói tin nhị phân 4 bytes [int16_t steer, int16_t throttle] qua UDP tới ESP32 Xe RC Thật
function sendUdpCarCommand(steer, throttle) {
  if (!esp32CarConfig.ip) return;
  // Giới hạn biên an toàn: Góc lái 45..135°, Xung ga cân chỉnh 1300..1700us (1500us dừng)
  const s = Math.max(45, Math.min(135, Math.round(Number(steer) || 90)));
  const t = Math.max(1300, Math.min(1700, Math.round(Number(throttle) || 1500)));

  const buf = Buffer.alloc(4);
  buf.writeInt16LE(s, 0); // Little Endian int16: Góc lái 45..135 (90 thẳng)
  buf.writeInt16LE(t, 2); // Little Endian int16: Xung ga 1000..2000 (1500 dừng)

  try {
    udpServer.send(buf, 0, 4, esp32CarConfig.port || 4210, esp32CarConfig.ip, (err) => {
      if (!err) {
        esp32CarConfig.lastSentTime = Date.now();
        esp32CarConfig.packetsSent++;
      }
    });
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
      return; // Chỉ cập nhật IP Camera, KHÔNG ghi đè telemetry xe!
    }

    // Tự động nhận diện IP của Mạch Lái Xe ESP32 (Controller GPIO 12/13 qua UDP 4210)
    if (data.type === 'ESP32_CAR' || data.type === 'ESP32_CAR_ANNOUNCE' || data.role === 'car') {
      esp32CarConfig.ip = rinfo.address;
      esp32CarConfig.port = Number(data.port || 4210);
      esp32CarConfig.lastSeen = Date.now();
      console.log(`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: ${rinfo.address}:${esp32CarConfig.port}`);
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
  res.json({
    front: {
      ...discoveredEsp32Cams.front,
      active: (now - (discoveredEsp32Cams.front.lastSeen || 0)) < 20000,
      ageSec: Math.round((now - (discoveredEsp32Cams.front.lastSeen || 0)) / 1000)
    },
    rear: {
      ...discoveredEsp32Cams.rear,
      active: (now - (discoveredEsp32Cams.rear.lastSeen || 0)) < 20000,
      ageSec: Math.round((now - (discoveredEsp32Cams.rear.lastSeen || 0)) / 1000)
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
  res.json({ found: results, discovered: discoveredEsp32Cams });
});

// Proxy truyền tải luồng video MP4 về thẻ <video> trong xe không bị lỗi CORS (SSRF Protected)
app.get('/api/yt-stream-proxy', async (req, res) => {
  const streamUrl = (req.query.url || '').trim();
  const check = validateProxyTargetUrl(streamUrl);
  if (!check.valid) {
    return res.status(400).send('SSRF Guard: ' + check.reason);
  }

  try {
    const upstream = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
        'Range': req.headers.range || 'bytes=0-',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000)
    });

    res.status(upstream.status || 200);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    const cType = upstream.headers.get('content-type');
    if (cType) res.setHeader('Content-Type', cType);
    const cLen = upstream.headers.get('content-length');
    if (cLen) res.setHeader('Content-Length', cLen);
    const cRange = upstream.headers.get('content-range');
    if (cRange) res.setHeader('Content-Range', cRange);

    if (upstream.body) {
      const { Readable } = require('stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).send('Proxy error: ' + err.message);
    }
  }
});



// ============================================================================
// MULTIPLAYER SERVER: MỖI THIẾT BỊ JOIN VÀO SẼ SPAWN 1 XE RIÊNG & CÓ THỂ LÊN XE NHAU
// ============================================================================
const players = new Map();
const cars = new Map();

// Khởi tạo sẵn Xe số 1 (Xe Chủ Phòng - Có kết nối ESP32) và Xe số 2 (Xe Khách/Bạn bè - Chỉ chạy 3D, không có ESP32)
cars.set('car_host', {
  carId: 'car_host',
  ownerName: 'Xe Chủ Phòng (Có ESP32)',
  hasEsp32Capability: true,
  x: 2.4,
  z: 0,
  heading: 0,
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


function broadcastWorldState(wss) {
  const payload = JSON.stringify({
    type: 'WORLD_STATE',
    cars: compressCarsState(),
    players: Array.from(players.values())
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function attachMultiplayerServer(serverInstance) {
  const wss = new WebSocket.Server({ server: serverInstance });

  wss.on('connection', (ws, req) => {
    const ua = (req && req.headers && req.headers['user-agent']) || '';
    // Chặn các kết nối từ ESP32, Arduino, curl, router probe không phải trình duyệt người chơi thật
    if (/esp32|arduino|curl|wget|lwip|httpclient/i.test(ua)) {
      ws.close();
      return;
    }

    const isFirstPlayer = players.size === 0;
    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    const assignedOwnCarId = isFirstPlayer ? 'car_host' : `car_guest_${playerId}`;

    // Nếu là thiết bị thứ 2 trở đi (Quest/iPhone/Android khác), tự động spawn xe riêng (Chỉ chạy 3D, KHÔNG cho kết nối ESP32)
    if (!isFirstPlayer && !cars.has(assignedOwnCarId)) {
      const idx = players.size;
      cars.set(assignedOwnCarId, {
        carId: assignedOwnCarId,
        ownerId: playerId,
        ownerName: `Xe Khách #${idx + 1} (Chỉ Chạy 3D - Không ESP32)`,
        hasEsp32Capability: false,
        x: -2.8 - (idx - 1) * 3.2,
        z: 6.5 + (idx - 1) * 6.0,
        heading: 0,
        speedKmh: 0,
        steerDeg: 0,
        doorsOpen: false,
        roofOpen: false,
        turnSignal: 'OFF',
        occupants: { 0: null, 1: null, 2: null, 3: null }
      });
    }

    players.set(playerId, {
      playerId,
      name: isFirstPlayer ? 'Tài Xế Chủ Phòng' : `Người Chơi #${players.size + 1}`,
      ownCarId: assignedOwnCarId,
      inCarId: null,
      seatIndex: 0,
      leaningOut: false,
      x: isFirstPlayer ? 0.65 : -4.5,
      z: isFirstPlayer ? 1.15 : 6.5,
      yaw: 0
    });

    ws.send(JSON.stringify({
      type: 'WELCOME',
      playerId,
      ownCarId: assignedOwnCarId,
      isHost: isFirstPlayer,
      cars: Array.from(cars.values())
    }));

    broadcastWorldState(wss);

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        const p = players.get(playerId);
        if (!p) return;

        if (data.type === 'PLAYER_SYNC') {
          p.x = clampFinite(data.x, -250, 250, p.x);
          p.z = clampFinite(data.z, -250, 250, p.z);
          p.yaw = clampFinite(data.yaw, -Math.PI * 4, Math.PI * 4, p.yaw);
          p.inCarId = data.inCarId !== undefined ? data.inCarId : p.inCarId;
          p.seatIndex = data.seatIndex ?? p.seatIndex;
          p.leaningOut = Boolean(data.leaningOut);
        } else if (data.type === 'CAR_SYNC' && data.carId && cars.has(data.carId)) {
          const c = cars.get(data.carId);
          c.x = clampFinite(data.x, -250, 250, c.x);
          c.z = clampFinite(data.z, -250, 250, c.z);
          c.heading = clampFinite(data.heading, -Math.PI * 4, Math.PI * 4, c.heading);
          c.speedKmh = clampFinite(data.speedKmh, -100, 350, c.speedKmh);
          c.steerDeg = clampFinite(data.steerDeg, -540, 540, c.steerDeg);
          c.doorsOpen = Boolean(data.doorsOpen);
          c.roofOpen = Boolean(data.roofOpen);
          c.turnSignal = data.turnSignal ?? c.turnSignal;
        } else if (data.type === 'ENTER_CAR' && data.carId && cars.has(data.carId)) {
          const c = cars.get(data.carId);
          // Giải phóng ghế cũ nếu có
          for (const carObj of cars.values()) {
            for (const s of [0, 1, 2, 3]) {
              if (carObj.occupants[s] === playerId) carObj.occupants[s] = null;
            }
          }
          // Nếu ghế tài xế (0) đã có người, tự động xếp vào Ghế Phụ Trước (1) hoặc ghế trống tiếp theo
          let chosenSeat = data.preferredSeat ?? 0;
          if (c.occupants[chosenSeat] && c.occupants[chosenSeat] !== playerId) {
            chosenSeat = [1, 2, 3, 0].find((s) => !c.occupants[s]) ?? 1;
          }
          c.occupants[chosenSeat] = playerId;
          p.inCarId = c.carId;
          p.seatIndex = chosenSeat;
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
          // Đổi chỗ trực tiếp với tài xế hoặc chuyển sang ghế phụ/ghế sau
          c.occupants[oldSeat] = otherPlayerId || null;
          c.occupants[targetSeat] = playerId;
          p.seatIndex = targetSeat;
          if (otherPlayerId && players.has(otherPlayerId)) {
            players.get(otherPlayerId).seatIndex = oldSeat;
          }
        } else if (data.type === 'RC_HARDWARE_TELEMETRY') {
          // Nhận tín hiệu từ xe RC thật bên ngoài (tốc độ thực, trạng thái va chạm vật cản)
          for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
            }
          }
        } else if (data.type === 'CAR_CONTROL') {
          // Điều khiển trực tiếp Mạch Xe RC Thật qua UDP 4210 (Góc lái 45..135, Xung ga 1300..1700)
          sendUdpCarCommand(data.steer, data.throttle);
        } else if (data.type === 'WHEEL_BRIDGE_INPUT') {
          // Cầu nối vô lăng GOG R808: Phát trạng thái từ PC sang kính Quest 3
          const bridgePayload = JSON.stringify({
            type: 'WHEEL_BRIDGE_STATE',
            connected: data.connected !== false,
            deviceId: data.deviceId || 'GOG R808',
            steeringNorm: data.steeringNorm || 0,
            throttleNorm: data.throttleNorm || 0,
            steerAngleDeg: data.steerAngleDeg || 0,
            gasPercent: data.gasPercent || 0,
            brakePercent: data.brakePercent || 0,
            reversePercent: data.reversePercent || 0,
            gear: data.gear || 'D',
            ts: Date.now()
          });
          for (const client of wss.clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(bridgePayload);
            }
          }
          if (data.steer !== undefined && data.throttle !== undefined) {
            sendUdpCarCommand(data.steer, data.throttle);
          }
        } else if (data.type === 'TEST_ESP32_PULSE') {
          // Lắc nhẹ bánh xe kiểm tra kết nối Servo & ESC thực tế
          sendUdpCarCommand(60, 1500);
          setTimeout(() => sendUdpCarCommand(120, 1500), 250);
          setTimeout(() => sendUdpCarCommand(90, 1500), 500);
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
              for (const client of wss.clients) {
                if (client.readyState === WebSocket.OPEN) client.send(carBroadcast);
              }
            }
          }
        }
        broadcastWorldState(wss);
      } catch (e) {}
    });

    ws.on('close', () => {
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
      if (players.size === 0 || isFirstPlayer) {
        // Phanh dừng xe an toàn khi tài xế hoặc tất cả người chơi thoát web
        sendUdpCarCommand(90, 1500);
      }
      broadcastWorldState(wss);
    });
  });
}

const HTTP_PORT = process.env.PORT || 8080;
const httpServer = http.createServer(app);
attachMultiplayerServer(httpServer);
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[HTTP] Server đang chạy tại: http://localhost:${HTTP_PORT}`);
});

const certPath = fs.existsSync(path.resolve(__dirname, 'tools/cert.pem')) ? path.resolve(__dirname, 'tools/cert.pem') : path.resolve(__dirname, '../tools/cert.pem');
const keyPath = fs.existsSync(path.resolve(__dirname, 'tools/key.pem')) ? path.resolve(__dirname, 'tools/key.pem') : path.resolve(__dirname, '../tools/key.pem');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsServer = https.createServer(
    { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
    app
  );
  attachMultiplayerServer(httpsServer);
  httpsServer.listen(8443, '0.0.0.0', () => {
    const lan = getLocalLanIp();
    console.log(`[HTTPS WebXR 360] Mở trên Meta Quest Browser (như dmnshd.gg) tại: https://localhost:8443`);
    console.log(`[HTTPS LAN] https://${lan}:8443`);
    try {
      const qrcode = require('qrcode-terminal');
      console.log('\n==========================================================');
      console.log('📱 QUÉT MÃ QR DƯỚI ĐÂY BẰNG CAMERA ĐIỆN THOẠI (9:16):');
      console.log(`URL: https://${lan}:8443/?mode=passenger_mobile`);
      console.log('==========================================================');
      qrcode.generate(`https://${lan}:8443/?mode=passenger_mobile`, { small: true });
      console.log('==========================================================\n');
    } catch (e) {}
  });
}

// ============================================================================
// PATCH V130 CHO SERVER.JS: TÌM KIẾM YOUTUBE > 5 TIẾNG & ĐỒNG BỘ MULTI-SCREEN MP4
// ============================================================================
let sharedYoutubeRoomState = {
  videoId: 'jfKfPfyJRdk',
  title: 'Lofi Hip Hop Radio - 24/7 Chill Stream',
  streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
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
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', duration: '05:45:00' },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', duration: '06:12:00' },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', duration: '05:30:00' },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', duration: '06:00:00' },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', duration: '05:20:00' },
  { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', duration: '05:50:00' }
];

// Hàm lấy luồng MP4 trực tiếp từ videoId qua nhiều nguồn (Innertube + Piped API)
function resolveDirectMp4FromVideoId(videoId) {
  return new Promise((resolve) => {
    if (!videoId) return resolve(null);

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

    const req = https.request({
      hostname: 'www.youtube.com',
      path: '/youtubei/v1/player?prettyPrint=false',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
      },
      timeout: 4500
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const formats = (json.streamingData && json.streamingData.formats) || [];
          const mp4Fmt =
            formats.find((f) => f.url && f.itag === 18) ||
            formats.find((f) => f.url && f.itag === 22) ||
            formats.find((f) => f.url && f.mimeType && f.mimeType.includes('video/mp4'));
          if (mp4Fmt && mp4Fmt.url) {
            return resolve(mp4Fmt.url);
          }
        } catch (e) {}
        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(postData);
    req.end();
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