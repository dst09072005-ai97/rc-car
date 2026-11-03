// tools/patch_native_bridge_stability.js
const fs = require('fs');

['server.js', 'server/server.js'].forEach(file => {
  let s = fs.readFileSync(file, 'utf8');

  // Normalize line endings to LF for replacement
  const isCRLF = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');

  // 1. Add wheelConnectedLogged variable
  if (!s.includes('let wheelConnectedLogged = false;')) {
    s = s.replace(
      'let lastTerminalLogMs = 0;',
      'let lastTerminalLogMs = 0;\n  let wheelConnectedLogged = false;'
    );
  }

  // 2. Remove unconditional fake console.log on start
  s = s.replace(
    "    console.log('✅ [V503 USB] Đã nhận diện Vô lăng GOG R808 tại cổng ID=0 (Native Host 50Hz)');\n",
    ""
  );

  // 3. Log real detection only when data.connected is true
  if (!s.includes('wheelConnectedLogged = true;')) {
    s = s.replace(
      "if (data && data.type === 'WHEEL_BRIDGE_STATE' && data.connected) {",
      `if (data && data.type === 'WHEEL_BRIDGE_STATE' && data.connected) {
            if (!wheelConnectedLogged) {
              console.log('✅ [V503 USB] Đã nhận diện Vô lăng GOG R808 tại cổng ID=' + (data.joyId ?? 0) + ' (Native Host 50Hz)');
              wheelConnectedLogged = true;
            }`
    );
  }

  // 4. Handle disconnected state cleanly
  if (!s.includes('Vô lăng đã ngắt kết nối')) {
    s = s.replace(
      "sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, false);\n          }",
      `sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, false);
          } else if (data && data.type === 'WHEEL_BRIDGE_STATE' && !data.connected) {
            latestBridgeState.connected = false;
            if (wheelConnectedLogged) {
              console.log('🔌 [GOG808 NATIVE] Vô lăng đã ngắt kết nối, đang chờ cắm lại...');
              wheelConnectedLogged = false;
            }
          }`
    );
  }

  // 5. Prevent memory leak of process.on('exit')
  s = s.replace(
    `    nativeWheelChild.on('exit', () => {
      nativeWheelChild = null;
      setTimeout(startNativeWheelBridge, 2500);
    });

    process.on('exit', () => {
      if (nativeWheelChild) {
        try { nativeWheelChild.kill(); } catch (e) {}
        nativeWheelChild = null;
      }
    });
  }

  startNativeWheelBridge();`,
    `    nativeWheelChild.on('exit', () => {
      nativeWheelChild = null;
      wheelConnectedLogged = false;
      setTimeout(startNativeWheelBridge, 3500);
    });
  }

  process.on('exit', () => {
    if (nativeWheelChild) {
      try { nativeWheelChild.kill(); } catch (e) {}
      nativeWheelChild = null;
    }
  });

  startNativeWheelBridge();`
  );

  if (isCRLF) {
    s = s.replace(/\n/g, '\r\n');
  }

  fs.writeFileSync(file, s, 'utf8');
  console.log('✅ Đã cập nhật ổn định Native Bridge cho', file);
});
