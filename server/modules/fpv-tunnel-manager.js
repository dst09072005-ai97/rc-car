'use strict';

/** Phone FPV DuckDNS updates and Cloudflare process lifecycle. */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { getLocalLanIp, loadEnvConfig } = require('./network-utils');

let cloudflareTunnelProcess = null;

let cloudflareTunnelUrl = null;

function startCloudflareTunnelManager(httpPort = 8080, onTunnelReady) {
  if (cloudflareTunnelProcess) return;
  const wingetLink = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe')
    : '';
  const binaryCandidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    ...(wingetLink ? [wingetLink] : []),
    'cloudflared'
  ];
  let binaryPath = binaryCandidates.find(p => p && fs.existsSync(p));
  if (!binaryPath) {
    try {
      require('child_process').execSync('where cloudflared', { stdio: 'ignore' });
      binaryPath = 'cloudflared';
    } catch (e) {
      console.warn('⚠️ [Cloudflare Tunnel] Chưa tìm thấy binary cloudflared trên máy.');
      return;
    }
  }

  try {
    const cp = require('child_process');
    cloudflareTunnelProcess = cp.spawn(binaryPath, ['tunnel', '--url', `http://127.0.0.1:${httpPort}`, '--no-autoupdate'], {
      windowsHide: true
    });

    let urlCaptured = false;
    cloudflareTunnelProcess.on('error', (err) => {
      console.warn(`[Cloudflare Tunnel] Lỗi tiến trình cloudflared: ${err.message}`);
    });
    cloudflareTunnelProcess.stderr.on('data', (data) => {
      if (urlCaptured) return;
      const str = data.toString();
      const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
      if (match) {
        urlCaptured = true;
        cloudflareTunnelUrl = match[0].trim();
        printCloudflareTunnelQr(cloudflareTunnelUrl);
        onTunnelReady?.();
      }
    });

    process.on('exit', () => {
      if (cloudflareTunnelProcess) {
        try { cloudflareTunnelProcess.kill(); } catch (e) {}
      }
    });
  } catch (err) {
    console.warn(`[Cloudflare Tunnel] Không thể khởi động đường hầm: ${err.message}`);
  }
}

function printCloudflareTunnelQr(tunnelUrl) {
  try {
    const qrcode = require('qrcode-terminal');
    const fpvTunnelUrl = `${tunnelUrl}/fpv-cam.html`;
    const passengerTunnelUrl = `${tunnelUrl}/?mode=passenger_mobile`;

    console.log('\n======================================================================');
    console.log('🌐 [MÃ QR 1B - TOÀN NĂNG XUYÊN WI-FI CÔNG CỘNG & 4G/5G] (CLOUDFLARE SSL XANH):');
    console.log('👉 Quét bằng BẤT KỲ điện thoại nào (kể cả Wi-Fi quán cafe bật cô lập thiết bị AP Isolation)');
    console.log('👉 100% Khóa Xanh SSL Quốc Tế - Tuyệt đối không cảnh báo riêng tư - Không cần cài đặt!');
    console.log(`🔗 URL SSL Công Cộng (Cloudflare): ${fpvTunnelUrl}`);
    console.log('======================================================================');
    qrcode.generate(fpvTunnelUrl, { small: true });
    console.log(`📱 Link Ghế Phụ công cộng (Xem 3D & YouTube): ${passengerTunnelUrl}\n`);
  } catch (e) {}
}

function setupFpvPhoneAndDuckDnsManager() {
  loadEnvConfig();
  let lanIp = typeof getLocalLanIp === 'function' ? getLocalLanIp() : '192.168.1.76';
  const rawDomain = process.env.DUCKDNS_DOMAIN || 'vr-cam-fpv';
  const token = process.env.DUCKDNS_TOKEN;
  const domain = rawDomain.replace(/\.duckdns\.org/g, '');
  const primarySubdomain = domain.split(',')[0].trim();
  const fullDomain = `${primarySubdomain}.duckdns.org`;

  function pushDuckDnsUpdate(targetIp, isDynamicChange = false) {
    if (!domain || !token) return;
    const updateUrl = `https://www.duckdns.org/update?domains=${encodeURIComponent(domain)}&token=${encodeURIComponent(token)}&ip=${encodeURIComponent(targetIp)}`;
    https.get(updateUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.trim() === 'OK') {
          if (isDynamicChange) {
            console.log(`\n======================================================================`);
            console.log(`🔄 [MẠNG ĐÃ THAY ĐỔI] Phát hiện Wi-Fi mới! IP chuyển: ➔ ${targetIp}`);
            console.log(`🦆 [DuckDNS] Đã tự động cập nhật ${fullDomain} -> ${targetIp}: THÀNH CÔNG (OK)!`);
            console.log(`👉 Điện thoại khác chỉ cần quét mã QR là vào ngay IP mới!`);
            console.log(`======================================================================\n`);
          } else {
            console.log(`🦆 [DuckDNS] Tự động ánh xạ ${domain}.duckdns.org -> ${targetIp}: THÀNH CÔNG (OK)`);
          }
        } else {
          console.log(`🦆 [DuckDNS] Cập nhật ${domain}.duckdns.org: ${data.trim()}`);
        }
      });
    }).on('error', (err) => {
      console.warn(`🦆 [DuckDNS] Không thể kết nối cập nhật DuckDNS: ${err.message}`);
    });
  }

  // Cập nhật ngay khi khởi động
  pushDuckDnsUpdate(lanIp, false);

  // [DYNAMIC NETWORK WATCHER] Giám sát mạng động định kỳ 6 giây: Tự động đổi IP DuckDNS khi đổi Wi-Fi / Hotspot
  if (!globalThis.__networkWatcherStarted) {
    globalThis.__networkWatcherStarted = true;
    let lastIp = lanIp;
    setInterval(() => {
      const currentIp = typeof getLocalLanIp === 'function' ? getLocalLanIp() : lastIp;
      if (currentIp && currentIp !== 'localhost' && currentIp !== lastIp) {
        lastIp = currentIp;
        lanIp = currentIp;
        pushDuckDnsUpdate(currentIp, true);
      }
    }, 6000);
  }

  return { domain, fullDomain, lanIp };
}

function stopCloudflareTunnelManager() {
  if (cloudflareTunnelProcess) {
    try {
      const pid = cloudflareTunnelProcess.pid;
      if (process.platform === 'win32') {
        if (Number.isInteger(pid) && pid > 0) {
          require('node:child_process').execFileSync('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' });
        }
      } else {
        cloudflareTunnelProcess.kill('SIGKILL');
      }
    } catch (e) {}
    cloudflareTunnelProcess = null;
  }
}

function getCloudflareTunnelUrl() {
  return cloudflareTunnelUrl;
}

module.exports = { setupFpvPhoneAndDuckDnsManager, startCloudflareTunnelManager, stopCloudflareTunnelManager, getCloudflareTunnelUrl };
