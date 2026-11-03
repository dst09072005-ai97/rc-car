// tools/patch_server_stability.js
const fs = require('fs');

['server.js', 'server/server.js'].forEach(file => {
  let s = fs.readFileSync(file, 'utf8');

  // 1. Throttled auto-discovery logs for camera and car
  s = s.replace(
    `      discoveredEsp32Cams[role] = {
        ip: rinfo.address,
        port: Number(data.port || 4213),
        lastSeen: Date.now()
      };
      console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 \${role.toUpperCase()}: \${rinfo.address}:\${data.port || 4213}\`);`,
    `      const isNewCam = !discoveredEsp32Cams[role] || discoveredEsp32Cams[role].ip !== rinfo.address || discoveredEsp32Cams[role].port !== Number(data.port || 4213);
      discoveredEsp32Cams[role] = {
        ip: rinfo.address,
        port: Number(data.port || 4213),
        lastSeen: Date.now()
      };
      if (isNewCam) {
        console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 \${role.toUpperCase()}: \${rinfo.address}:\${data.port || 4213}\`);
      }`
  );

  s = s.replace(
    `      esp32CarConfig.ip = rinfo.address;
      esp32CarConfig.port = Number(data.port || 4210);
      esp32CarConfig.lastSeen = Date.now();
      console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: \${rinfo.address}:\${esp32CarConfig.port}\`);`,
    `      const isNewCar = esp32CarConfig.ip !== rinfo.address || esp32CarConfig.port !== Number(data.port || 4210);
      esp32CarConfig.ip = rinfo.address;
      esp32CarConfig.port = Number(data.port || 4210);
      esp32CarConfig.lastSeen = Date.now();
      if (isNewCar) {
        console.log(\`[AUTO-DISCOVERY UDP] Đã nhận diện ESP32 MẠCH LÁI XE: \${rinfo.address}:\${esp32CarConfig.port}\`);
      }`
  );

  // 2. Add uncaughtException & unhandledRejection handlers at top
  if (!s.includes('CRITICAL UNCAUGHT EXCEPTION')) {
    const errorHandlers = `
process.on('uncaughtException', (err) => {
  console.error('❌ [CRITICAL UNCAUGHT EXCEPTION]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [CRITICAL UNHANDLED REJECTION]', reason && reason.stack ? reason.stack : reason);
});
`;
    s = errorHandlers + s;
  }

  fs.writeFileSync(file, s, 'utf8');
  console.log('✅ Đã cập nhật ổn định và chống spam log cho', file);
});
