import re
import sys

def patch_server_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update sendUdpCarCommand at top to delegate to globalThis.sendRateLimitedEsp32Udp
    old_send_udp = '''// Hàm gửi gói tin nhị phân 4 bytes [int16_t steer, int16_t throttle] qua UDP tới ESP32 Xe RC Thật
function sendUdpCarCommand(steer, throttle) {
  if (!esp32CarConfig.ip) return;
  // [FIX ĐẢO LÁI XE NGOÀI] Đảo ngược góc lái 45..135° cho servo xe RC ngoài đời thật (180 - rawS)
  const rawS = Math.max(45, Math.min(135, Math.round(Number(steer) || 90)));
  const s = 180 - rawS;
  const t = Math.max(1050, Math.min(1950, Math.round(Number(throttle) || 1500)));

  const buf = Buffer.alloc(4);
  buf.writeInt16LE(s, 0); // Little Endian int16: Góc lái 45..135 (90 thẳng)
  buf.writeInt16LE(t, 2); // Little Endian int16: Xung ga 1000..2000 (1500 dừng)

  try {
    udpServer.send(buf, 0, 4, esp32CarConfig.port || 4210, esp32CarConfig.ip, (err) => {
      if (!err) {
        esp32CarConfig.lastSentTime = Date.now();
        esp32CarConfig.packetsSent++;
        const key = `${s}_${t}`;
        if (key !== lastUdpCommandLog && (s !== 90 || t !== 1500)) {
          lastUdpCommandLog = key;
          console.log(`[RC CAR UDP 4210] -> ${esp32CarConfig.ip}: Lái ${s}°, Ga ${t}µs (${t > 1520 ? 'TIẾN' : (t < 1480 ? 'LÙI' : 'DỪNG')})`);
        }
      }
    });
  } catch (err) {}
}'''

    new_send_udp = '''// Hàm gửi gói tin nhị phân 4 bytes [int16_t steer, int16_t throttle] qua UDP tới ESP32 Xe RC Thật
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
}'''

    if old_send_udp in content:
        content = content.replace(old_send_udp, new_send_udp, 1)
        print(f"Replaced sendUdpCarCommand in {filepath}")
    else:
        print(f"Error: old_send_udp not found in {filepath}")
        return False

    # 2. Update rcArbitration, computeAsymmetricEscPulseUs, sendRateLimitedEsp32Udp inside attachUnifiedInputAndBridgeServer
    old_arb_block = '''  const rcArbitration = {
    lastPhysicalWheelActiveAt: 0,
    lastSentSteerDeg: 90,
    lastSentEscUs: 1500,
    idleNeutralCount: 0,
    lastUdpSendMs: 0,
    WHEEL_PRIORITY_WINDOW_MS: 350
  };

  function computeAsymmetricEscPulseUs(driveNorm, explicitPulseUs, gear = 'D') {
    const rawExplicit = Number(explicitPulseUs);
    if (Number.isFinite(rawExplicit) && rawExplicit >= 1000 && rawExplicit <= 2000 && Math.abs(rawExplicit - 1500) > 5) {
      if (rawExplicit < 1445 && rawExplicit >= 1250 && driveNorm < -0.05) {
        const revMag = Math.min(1, Math.max(0, Math.abs(driveNorm)));
        return Math.round(1445 - Math.pow(revMag, 0.85) * 345);
      }
      return Math.round(rawExplicit);
    }

    const d = Math.max(-1, Math.min(1, Number(driveNorm) || 0));
    if (Math.abs(d) <= 0.025) return 1500;

    if (d > 0.025 && gear !== 'R') {
      return Math.round(1535 + Math.pow(d, 0.9) * 315);
    } else {
      const revMag = Math.abs(d);
      return Math.round(1445 - Math.pow(revMag, 0.85) * 345);
    }
  }

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

    if (source === 'QUEST_CAR_CONTROL' && !isInputActive) {
      if (now - rcArbitration.lastPhysicalWheelActiveAt < rcArbitration.WHEEL_PRIORITY_WINDOW_MS) {
        return;
      }
    }

    const steerDeg = Math.max(45, Math.min(135, Math.round(90 - sNorm * 45)));
    const escPulseUs = computeAsymmetricEscPulseUs(dNorm, explicitEscPulseUs, gear);

    const changed = (steerDeg !== rcArbitration.lastSentSteerDeg) || (escPulseUs !== rcArbitration.lastSentEscUs);
    if (!changed && (now - rcArbitration.lastUdpSendMs < 200)) return;
    if (now - rcArbitration.lastUdpSendMs < 25) return;

    rcArbitration.lastUdpSendMs = now;
    rcArbitration.lastSentSteerDeg = steerDeg;
    rcArbitration.lastSentEscUs = escPulseUs;

    const pkt = Buffer.alloc(4);
    pkt.writeInt16LE(steerDeg, 0);
    pkt.writeInt16LE(escPulseUs, 2);
    const targetHost = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.ip) ? esp32CarConfig.ip : ESP32_HOST;
    const targetPort = (typeof esp32CarConfig !== 'undefined' && esp32CarConfig && esp32CarConfig.port) ? esp32CarConfig.port : ESP32_PORT;
    udpOutSocket.send(pkt, 0, 4, targetPort, targetHost);
  }'''

    new_arb_block = '''  const rcArbitration = {
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
  globalThis.rcArbitration = rcArbitration;'''

    if old_arb_block in content:
        content = content.replace(old_arb_block, new_arb_block, 1)
        print(f"Replaced arbitration block in {filepath}")
    else:
        print(f"Error: old_arb_block not found in {filepath}")
        return False

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Successfully patched {filepath}")
    return True

def patch_app_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Change A: In pollGamepadRacingWheel(dt), add remote bridge guard at top
    old_poll = 'function pollGamepadRacingWheel(dt) {'
    new_poll = '''function pollGamepadRacingWheel(dt) {
    // [ANTI-CONFLICT] Nếu đang nhận Remote Bridge từ Laptop (GOG R808 cắm vào laptop):
    // Không cho Gamepad / Touch Controller trên kính tự ý ghi đè hoặc set racingWheel.connected = false!
    if (racingWheel.isRemoteBridge || (window._racingWheel && window._racingWheel.isRemoteBridge)) {
      return;
    }'''
    if old_poll in content:
        content = content.replace(old_poll, new_poll, 1)
        print(f"Patched pollGamepadRacingWheel in {filepath}")
    else:
        print(f"Warning: old_poll not found in {filepath}")
        return False

    # Change B: In 40ms CAR_CONTROL sending loop, do NOT echo when isRemoteBridge is true
    old_echo = '''    // Gửi lệnh điều khiển xe thật qua WebSocket tới server.js (25Hz = 40ms/lần, Zero Per-Frame Allocation)
    if (now - lastCarControlSendTime >= 40) {
      lastCarControlSendTime = now;
      if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {'''

    new_echo = '''    // Gửi lệnh điều khiển xe thật qua WebSocket tới server.js (25Hz = 40ms/lần, Zero Per-Frame Allocation)
    if (now - lastCarControlSendTime >= 40) {
      lastCarControlSendTime = now;
      if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
        // [ANTI-ECHO] Nếu đang nhận Remote Bridge từ Laptop (GOG R808 cắm máy tính):
        // Laptop đã là master điều khiển xe RC và phát broadcast.
        // Client (Kính VR) KHÔNG gửi ngược CAR_CONTROL hay WHEEL_BRIDGE_INPUT về server để triệt tiêu vĩnh viễn echo loop nhảy loạn góc lái!
        if (window._racingWheel && window._racingWheel.isRemoteBridge) {
          return;
        }'''
    if old_echo in content:
        content = content.replace(old_echo, new_echo, 1)
        print(f"Patched CAR_CONTROL loop in {filepath}")
    else:
        print(f"Warning: old_echo not found in {filepath}")
        return False

    # Change C: In ingestWheelData, ensure smooth steering and robust fields
    old_ingest = '''  function ingestWheelData(w) {
    if (!w) return;
    const nowPerf = performance.now();
    const nowDate = Date.now();

    liveWheel.connected = true;
    liveWheel.steerNorm = Number(w.steerNorm ?? w.steeringNorm ?? w.steer ?? 0) || 0;'''

    new_ingest = '''  function ingestWheelData(w) {
    if (!w) return;
    const nowPerf = performance.now();
    const nowDate = Date.now();

    liveWheel.connected = true;
    liveWheel.isRemoteBridge = true;

    // Chuẩn hóa sNorm [-1..1]
    const rawS = typeof w.steerNorm === 'number' ? w.steerNorm :
                 (typeof w.steeringNorm === 'number' ? w.steeringNorm :
                 (typeof w.steer === 'number' && w.steer > 1.5 ? (w.steer - 90) / 45 : (Number(w.steer) || 0)));
    liveWheel.steerNorm = Math.max(-1, Math.min(1, rawS));'''
    if old_ingest in content:
        content = content.replace(old_ingest, new_ingest, 1)
        print(f"Patched ingestWheelData in {filepath}")
    else:
        print(f"Warning: old_ingest not found in {filepath}")
        return False

    # Change D: In WebSocket message handler line 4157, route WHEEL_BRIDGE_STATE directly to ingestWheelData
    old_ws_block = '''        } else if (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT') {
          // Cầu nối vô lăng GOG R808 & Bàn phím Laptop sang kính Meta Quest 3
          if (!window._racingWheel) {'''

    new_ws_block = '''        } else if (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT') {
          // Cầu nối vô lăng GOG R808 & Bàn phím Laptop sang kính Meta Quest 3
          const srcData = msg.payload || msg;
          if (typeof ingestWheelData === 'function') {
            ingestWheelData(srcData);
          }
          if (!window._racingWheel) {'''
    if old_ws_block in content:
        content = content.replace(old_ws_block, new_ws_block, 1)
        print(f"Patched WS WHEEL_BRIDGE_STATE in {filepath}")
    else:
        print(f"Warning: old_ws_block not found in {filepath}")
        return False

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Successfully patched {filepath}")
    return True

if __name__ == '__main__':
    ok1 = patch_server_file('server.js')
    ok2 = patch_server_file('server/server.js')
    ok3 = patch_app_file('app.js')
    ok4 = patch_app_file('www/app.js')
    ok5 = patch_app_file('server/public/app.js')
    ok6 = patch_app_file('android/app/src/main/assets/public/app.js')
    print("ALL SUCCESS:", all([ok1, ok2, ok3, ok4, ok5, ok6]))
