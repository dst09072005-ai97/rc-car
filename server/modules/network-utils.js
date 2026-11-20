'use strict';

/** LAN discovery, environment loading and local phone FPV QR rendering. */

const fs = require('node:fs');
const path = require('node:path');
const serverDir = path.resolve(__dirname, '..');

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

function loadEnvConfig() {
  const envPaths = [
    path.resolve(serverDir, 'config/.env'),
    path.resolve(serverDir, '../config/.env'),
    path.resolve(serverDir, '.env')
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

function renderPhoneFpvQrSvg(value) {
  const QRCode = require('qrcode-terminal/vendor/QRCode');
  const { L } = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
  const code = new QRCode(-1, L);
  code.addData(value);
  code.make();
  const size = code.getModuleCount() + 8;
  const modules = code.modules.map((row, y) => row.map((dark, x) =>
    dark ? `M${x + 4} ${y + 4}h1v1h-1z` : '').join('')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${modules}"/></svg>`;
}

module.exports = { getBestNetworkAddresses, getLocalLanIp, loadEnvConfig, renderPhoneFpvQrSvg };
