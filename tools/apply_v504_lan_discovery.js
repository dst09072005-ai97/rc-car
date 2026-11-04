const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🚀 [LAN DISCOVERY & V504 RESTORATION] Đang tạo bản vá hoàn thiện...');
console.log('================================================================');

// 1. CẬP NHẬT SERVER.JS VÀ SERVER/SERVER.JS
const serverFiles = ['server.js', 'server/server.js'];

serverFiles.forEach(sFile => {
  if (!fs.existsSync(sFile)) return;
  let code = fs.readFileSync(sFile, 'utf8');

  // Đảm bảo getLanIpv4List có ở đầu file
  if (!code.includes('function getLanIpv4List()')) {
    const netMarker = 'function getBestNetworkAddresses() {';
    if (code.includes(netMarker)) {
      const getLanCode = `function getLanIpv4List() {
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

`;
      code = code.replace(netMarker, getLanCode + netMarker);
      console.log(`✅ Đã thêm getLanIpv4List() vào ${sFile}`);
    }
  }

  // Cập nhật app.get('/api/bridge-ping'
  const oldPingRegex = /app\.get\('\/api\/bridge-ping'[\s\S]*?res\.json\(\{[\s\S]*?\}\);\s*\}\);/;
  const newPingCode = `app.get('/api/bridge-ping', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-store');
  const lanIps = typeof getLanIpv4List === 'function' ? getLanIpv4List() : (typeof getLocalLanIp === 'function' ? [getLocalLanIp()] : ['127.0.0.1']);
  res.json({
    ok: true,
    service: 'GOG808_LAPTOP_BRIDGE',
    hostIp: lanIps[0] || '127.0.0.1',
    ips: lanIps,
    car: {
      ip: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.ip) ? esp32CarConfig.ip : '192.168.1.238',
      port: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.port) ? esp32CarConfig.port : 4210,
      lastSeen: (typeof esp32CarConfig !== 'undefined') ? esp32CarConfig.lastSeen : 0,
      active: (typeof esp32CarConfig !== 'undefined') ? ((Date.now() - (esp32CarConfig.lastSeen || 0)) < 30000) : false
    },
    cams: (typeof discoveredEsp32Cams !== 'undefined') ? discoveredEsp32Cams : {},
    wheel: (typeof latestBridgeState !== 'undefined') ? latestBridgeState : { connected: false },
    timestamp: Date.now()
  });
});`;

  if (oldPingRegex.test(code)) {
    code = code.replace(oldPingRegex, newPingCode);
    console.log(`✅ Đã cập nhật Express route /api/bridge-ping vào ${sFile}`);
  }

  // Cập nhật HTTP hook cho /api/bridge-ping
  const oldHttpPingRegex = /res\.end\(JSON\.stringify\(\{\s*ok:\s*true,\s*ips:\s*getLanIpv4List\(\),\s*wheel:\s*latestBridgeState\s*\}\)\);/;
  const newHttpPingCode = `const lanIps = getLanIpv4List();
        res.end(JSON.stringify({
          ok: true,
          service: 'GOG808_LAPTOP_BRIDGE',
          hostIp: lanIps[0] || '127.0.0.1',
          ips: lanIps,
          car: {
            ip: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.ip) ? esp32CarConfig.ip : '192.168.1.238',
            port: (typeof esp32CarConfig !== 'undefined' && esp32CarConfig.port) ? esp32CarConfig.port : 4210,
            lastSeen: (typeof esp32CarConfig !== 'undefined') ? esp32CarConfig.lastSeen : 0,
            active: (typeof esp32CarConfig !== 'undefined') ? ((Date.now() - (esp32CarConfig.lastSeen || 0)) < 30000) : false
          },
          cams: (typeof discoveredEsp32Cams !== 'undefined') ? discoveredEsp32Cams : {},
          wheel: latestBridgeState,
          timestamp: Date.now()
        }));`;

  if (oldHttpPingRegex.test(code)) {
    code = code.replace(oldHttpPingRegex, newHttpPingCode);
    console.log(`✅ Đã cập nhật HTTP hook /api/bridge-ping vào ${sFile}`);
  }

  // Phát sóng khi phát hiện IP Mạch Xe ESP32 mới
  const oldCarAnnounce = `if (isNewCar) {\n        console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: \${rinfo.address}:\${targetPort}\`);\n      }`;
  const newCarAnnounce = `if (isNewCar) {
        console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: \${rinfo.address}:\${targetPort}\`);
        if (typeof activeMultiplayerSockets !== 'undefined' && activeMultiplayerSockets) {
          const carUpdatePacket = JSON.stringify({
            type: 'CAR_IP_UPDATED',
            carIp: esp32CarConfig.ip,
            ip: esp32CarConfig.ip,
            port: esp32CarConfig.port
          });
          for (const client of activeMultiplayerSockets) {
            if (client.readyState === 1) {
              try { client.send(carUpdatePacket); } catch (e) {}
            }
          }
        }
      }`;

  if (code.includes(oldCarAnnounce)) {
    code = code.replace(oldCarAnnounce, newCarAnnounce);
    console.log(`✅ Đã thêm CAR_IP_UPDATED broadcast vào ${sFile}`);
  }

  fs.writeFileSync(sFile, code, 'utf8');
});

console.log('✅ Hoàn tất cập nhật Server files!');
