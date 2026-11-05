import re
import sys

def patch_server_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update /api/bridge-ping wheelConnected status
    old_ping = '''    wheelConnected: true,
    car: {'''
    new_ping = '''    wheelConnected: Boolean(latestBridgeState && latestBridgeState.connected),
    wheel: latestBridgeState,
    car: {'''
    if old_ping in content:
        content = content.replace(old_ping, new_ping, 1)
        print(f"Patched /api/bridge-ping in {filepath}")

    # 2. Update attachMultiplayerServer to handle RC_CONTROL_CMD alongside CAR_CONTROL
    old_car_ctrl = '''        } else if (data.type === 'CAR_CONTROL') {
          // CHỈ TÀI XẾ (Seat 0) hoặc Laptop Admin MỚI ĐƯỢC PHÉP ĐIỀU KHIỂN XE THẬT:
          const canControlHardware = (p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin);
          if (!canControlHardware) {
            // Khách ngồi ghế phụ (Kính Quest 2, điện thoại khách) bị chặn lệnh lái/ga ra xe thật
            return;
          }
          // BỘ TRỌNG TÀI LÁI XE DUY NHẤT (Active Driver Arbitration):
          // Chỉ client đang chủ động cầm lái mới được quyền phát xung tới xe RC ESP32.
          // Các tab phụ / tab nền / spectator TUYỆT ĐỐI KHÔNG thể gửi xung 1500 đè lên người đang lái gây giật xe!
          let steer = 90;
          if (data.steeringDeg !== undefined || (data.steer !== undefined && Math.abs(Number(data.steer)) > 1.5)) {
            steer = Math.max(45, Math.min(135, Math.round(Number(data.steeringDeg ?? data.steer) || 90)));
          } else if (data.steeringNorm !== undefined || data.steerNorm !== undefined || data.steer !== undefined) {
            const sNorm = Math.max(-1, Math.min(1, Number(data.steeringNorm ?? data.steerNorm ?? data.steer) || 0));
            steer = Math.round(90 + sNorm * 45);
          }
          const rawThrottle = typeof computeSafeEscPulseUs === 'function' ? computeSafeEscPulseUs(data) : (Number(data.throttle) || 1500);
          const throttle = Math.abs(rawThrottle - 1500) < 15 ? 1500 : rawThrottle;
          if (Math.abs(steer - 90) < 3) steer = 90;
          const isActivelyDriving = (throttle !== 1500 || steer !== 90);'''

    new_car_ctrl = '''        } else if (data.type === 'CAR_CONTROL' || data.type === 'RC_CONTROL_CMD') {
          // CHỈ TÀI XẾ (Seat 0) hoặc Laptop Admin hoặc Tay Cầm Kính VR MỚI ĐƯỢC PHÉP ĐIỀU KHIỂN XE THẬT:
          const canControlHardware = (p.seatIndex === 0 || p.isHost || p.isLocalhostAdmin || p.deviceType === 'META_QUEST');
          if (!canControlHardware) {
            return;
          }
          // BỘ TRỌNG TÀI LÁI XE DUY NHẤT (Active Driver Arbitration):
          let steer = 90;
          if (data.steeringNorm !== undefined || data.steerNorm !== undefined) {
            const sNorm = Math.max(-1, Math.min(1, Number(data.steeringNorm ?? data.steerNorm) || 0));
            steer = Math.round(90 - sNorm * 45); // Chú ý: 90 - sNorm*45 đồng bộ góc lái
          } else if (data.steeringDeg !== undefined || (data.steer !== undefined && Math.abs(Number(data.steer)) > 1.5)) {
            steer = Math.max(45, Math.min(135, Math.round(Number(data.steeringDeg ?? data.steer) || 90)));
          }
          let throttle = 1500;
          if (data.throttleNorm !== undefined || data.driveNorm !== undefined) {
            const dNorm = Math.max(-1, Math.min(1, Number(data.throttleNorm ?? data.driveNorm) || 0));
            throttle = computeAsymmetricEscPulseUs(dNorm, null, data.gear || (dNorm < -0.02 ? 'R' : 'D'));
          } else {
            const rawThrottle = typeof computeSafeEscPulseUs === 'function' ? computeSafeEscPulseUs(data) : (Number(data.throttle) || 1500);
            throttle = Math.abs(rawThrottle - 1500) < 15 ? 1500 : rawThrottle;
          }
          if (Math.abs(steer - 90) < 3) steer = 90;
          const isActivelyDriving = (throttle !== 1500 || steer !== 90);'''

    if old_car_ctrl in content:
        content = content.replace(old_car_ctrl, new_car_ctrl, 1)
        print(f"Patched attachMultiplayerServer CAR_CONTROL/RC_CONTROL_CMD in {filepath}")
    else:
        print(f"Warning: old_car_ctrl not found in {filepath}")

    # 3. Update bindUnifiedWss handler to extract steeringNorm / throttleNorm / steer / throttle
    old_unified_ctrl = '''        // 2. Nhận lệnh điều khiển từ Bàn phím (Localhost) hoặc Tay cầm VR (Kính) gửi xuống ESP32
        if (data.type === 'RC_CONTROL_CMD' || data.type === 'CAR_CONTROL') {
          const sNorm = Number(data.steeringNorm ?? data.steerNorm ?? 0);
          const tNorm = Number(data.throttleNorm ?? data.driveNorm ?? 0);
          sendRateLimitedEsp32Udp(sNorm, tNorm, null, 'D', 'QUEST_CAR_CONTROL');
          return;
        }'''

    new_unified_ctrl = '''        // 2. Nhận lệnh điều khiển từ Bàn phím (Localhost) hoặc Tay cầm VR (Kính) gửi xuống ESP32
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
        }'''

    if old_unified_ctrl in content:
        content = content.replace(old_unified_ctrl, new_unified_ctrl, 1)
        print(f"Patched bindUnifiedWss in {filepath}")
    else:
        print(f"Warning: old_unified_ctrl not found in {filepath}")

    # 4. Handle GOG808 disconnect event in nativeWheelChild stdout and exit
    old_wheel_stdout = '''        try {
          const data = JSON.parse(trimmed);
          if (data && data.type === 'WHEEL_BRIDGE_STATE' && data.connected) {
            latestBridgeState.connected = true;'''

    new_wheel_stdout = '''        try {
          const data = JSON.parse(trimmed);
          if (data && data.type === 'WHEEL_BRIDGE_STATE') {
            if (data.connected) {
              latestBridgeState.connected = true;'''

    old_wheel_stdout_end = '''            // Gửi xuống ESP32 RC Car qua UDP (Port 4210)
            sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, null, data.gear, 'WINMM_USB');
          }
        } catch (e) {}'''

    new_wheel_stdout_end = '''            // Gửi xuống ESP32 RC Car qua UDP (Port 4210)
            sendRateLimitedEsp32Udp(data.steerNorm, data.driveNorm, null, data.gear, 'WINMM_USB');
          } else {
            // Khi rút dây USB GOG808 hoặc không tìm thấy joystick:
            if (latestBridgeState.connected) {
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
        } catch (e) {}'''

    if old_wheel_stdout in content and old_wheel_stdout_end in content:
        content = content.replace(old_wheel_stdout, new_wheel_stdout, 1)
        content = content.replace(old_wheel_stdout_end, new_wheel_stdout_end, 1)
        print(f"Patched nativeWheelChild stdout in {filepath}")
    else:
        print(f"Warning: nativeWheelChild stdout pattern not found in {filepath}")

    # 5. Handle nativeWheelChild exit cleanly
    old_child_exit = '''    nativeWheelChild.on('exit', () => {
      nativeWheelChild = null;
      setTimeout(startNativeWheelBridge, 2500);
    });'''

    new_child_exit = '''    nativeWheelChild.on('exit', () => {
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
    });'''

    if old_child_exit in content:
        content = content.replace(old_child_exit, new_child_exit, 1)
        print(f"Patched nativeWheelChild exit in {filepath}")
    else:
        print(f"Warning: old_child_exit not found in {filepath}")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Successfully updated server file: {filepath}")
    return True

def patch_app_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add isRemoteBridgeActive() helper function
    helper_def = '''  function isRemoteBridgeActive() {
    const w = (typeof window !== 'undefined') ? window._racingWheel : null;
    if (!w || !w.isRemoteBridge || !w.connected) return false;
    const nowPerf = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (w.lastInputTime && (nowPerf - w.lastInputTime > 800)) {
      w.isRemoteBridge = false;
      w.connected = false;
      if (typeof racingWheel !== 'undefined' && racingWheel) {
        racingWheel.isRemoteBridge = false;
        racingWheel.connected = false;
      }
      return false;
    }
    return true;
  }
'''

    if 'function isRemoteBridgeActive()' not in content:
        # Insert before pollGamepadRacingWheel
        content = content.replace('function pollGamepadRacingWheel(dt) {', helper_def + '  function pollGamepadRacingWheel(dt) {', 1)
        print(f"Inserted isRemoteBridgeActive in {filepath}")

    # 2. Update pollGamepadRacingWheel to use isRemoteBridgeActive()
    old_poll_guard = '''    // [ANTI-CONFLICT] Nếu đang nhận Remote Bridge từ Laptop (GOG R808 cắm vào laptop):
    // Không cho Gamepad / Touch Controller trên kính tự ý ghi đè hoặc set racingWheel.connected = false!
    if (racingWheel.isRemoteBridge || (window._racingWheel && window._racingWheel.isRemoteBridge)) {
      return;
    }'''

    new_poll_guard = '''    // [ANTI-CONFLICT] Nếu đang nhận Remote Bridge từ Laptop (GOG R808 cắm vào laptop và đang hoạt động):
    // Không cho Gamepad / Touch Controller trên kính tự ý ghi đè hoặc set racingWheel.connected = false!
    if (isRemoteBridgeActive()) {
      return;
    }'''

    if old_poll_guard in content:
        content = content.replace(old_poll_guard, new_poll_guard, 1)
        print(f"Updated pollGamepadRacingWheel guard in {filepath}")

    # 3. Update 40ms CAR_CONTROL sending loop to use isRemoteBridgeActive()
    old_echo_guard = '''        // [ANTI-ECHO] Nếu đang nhận Remote Bridge từ Laptop (GOG R808 cắm máy tính):
        // Laptop đã là master điều khiển xe RC và phát broadcast.
        // Client (Kính VR) KHÔNG gửi ngược CAR_CONTROL hay WHEEL_BRIDGE_INPUT về server để triệt tiêu vĩnh viễn echo loop nhảy loạn góc lái!
        if (window._racingWheel && window._racingWheel.isRemoteBridge) {
          return;
        }'''

    new_echo_guard = '''        // [ANTI-ECHO] Nếu đang nhận Remote Bridge từ Laptop (GOG R808 cắm máy tính và đang phát sóng):
        // Laptop đã là master điều khiển xe RC và phát broadcast.
        // Client (Kính VR) KHÔNG gửi ngược CAR_CONTROL hay WHEEL_BRIDGE_INPUT về server để triệt tiêu vĩnh viễn echo loop nhảy loạn góc lái!
        if (isRemoteBridgeActive()) {
          return;
        }'''

    if old_echo_guard in content:
        content = content.replace(old_echo_guard, new_echo_guard, 1)
        print(f"Updated CAR_CONTROL echo guard in {filepath}")

    # 4. In carControlPacket, ensure steeringNorm and throttleNorm are included
    old_packet_send = '''        carControlPacket.gear = state.gearIndex === 1 ? 'R' : 'D';
        mpSocket.send(JSON.stringify(carControlPacket));'''

    new_packet_send = '''        carControlPacket.gear = state.gearIndex === 1 ? 'R' : 'D';
        carControlPacket.steeringNorm = Number(((90 - steer) / 45.0).toFixed(4));
        carControlPacket.throttleNorm = Number(((throttle - 1500) / 350.0).toFixed(4));
        mpSocket.send(JSON.stringify(carControlPacket));'''

    if old_packet_send in content:
        content = content.replace(old_packet_send, new_packet_send, 1)
        print(f"Updated carControlPacket fields in {filepath}")

    # 5. In ingestWheelData, handle connected === false cleanly
    old_ingest_start = '''  function ingestWheelData(w) {
    if (!w) return;
    const nowPerf = performance.now();
    const nowDate = Date.now();

    liveWheel.connected = true;
    liveWheel.isRemoteBridge = true;'''

    new_ingest_start = '''  function ingestWheelData(w) {
    if (!w) return;
    const nowPerf = performance.now();
    const nowDate = Date.now();

    if (w.connected === false) {
      liveWheel.connected = false;
      liveWheel.isRemoteBridge = false;
      if (window._racingWheel) {
        window._racingWheel.connected = false;
        window._racingWheel.isRemoteBridge = false;
      }
      if (typeof racingWheel !== 'undefined' && racingWheel) {
        racingWheel.connected = false;
        racingWheel.isRemoteBridge = false;
      }
      return;
    }

    liveWheel.connected = true;
    liveWheel.isRemoteBridge = true;'''

    if old_ingest_start in content:
        content = content.replace(old_ingest_start, new_ingest_start, 1)
        print(f"Updated ingestWheelData in {filepath}")

    # 6. In connectEsp32Windshield, prevent duplicate reconnects to same URL
    old_connect_front = '''function connectEsp32Windshield(rawUrl) {
  state.esp32StreamUrl = rawUrl;
  if (esp32Socket) {
    try { esp32Socket.close(); } catch (e) {}
    esp32Socket = null;
  }'''

    new_connect_front = '''function connectEsp32Windshield(rawUrl) {
  if (!rawUrl) return;
  // [ANTI-THRASH] Nếu socket đang kết nối hoặc đã mở với đúng URL này, không đóng kết nối!
  if (esp32Socket && (esp32Socket.readyState === WebSocket.CONNECTING || esp32Socket.readyState === WebSocket.OPEN)) {
    if (state.esp32StreamUrl === rawUrl) return;
  }
  state.esp32StreamUrl = rawUrl;
  if (esp32Socket) {
    try { esp32Socket.close(); } catch (e) {}
    esp32Socket = null;
  }'''

    if old_connect_front in content:
        content = content.replace(old_connect_front, new_connect_front, 1)
        print(f"Updated connectEsp32Windshield in {filepath}")

    # 7. In connectRearEsp32Camera, prevent duplicate reconnects to same URL
    old_connect_rear = '''function connectRearEsp32Camera(rawUrl) {
  if (!rawUrl) return;
  state.esp32RearStreamUrl = rawUrl;
  manualRearDisconnect = false;
  if (esp32RearSocket) {
    try { esp32RearSocket.close(); } catch (e) {}
    esp32RearSocket = null;
  }'''

    new_connect_rear = '''function connectRearEsp32Camera(rawUrl) {
  if (!rawUrl) return;
  // [ANTI-THRASH] Nếu socket đang kết nối hoặc đã mở với đúng URL này, không đóng kết nối!
  if (esp32RearSocket && (esp32RearSocket.readyState === WebSocket.CONNECTING || esp32RearSocket.readyState === WebSocket.OPEN)) {
    if (state.esp32RearStreamUrl === rawUrl) return;
  }
  state.esp32RearStreamUrl = rawUrl;
  manualRearDisconnect = false;
  if (esp32RearSocket) {
    try { esp32RearSocket.close(); } catch (e) {}
    esp32RearSocket = null;
  }'''

    if old_connect_rear in content:
        content = content.replace(old_connect_rear, new_connect_rear, 1)
        print(f"Updated connectRearEsp32Camera in {filepath}")

    # 8. In applyEsp32CameraIps, check if socket is already open or connecting before calling connect
    old_apply_cams = '''    // 2. Tự động cập nhật IP Cam Trước
    if (front && front.ip) {
      const expectedFrontUrl = `ws://${front.ip}:${front.port || 4213}`;
      state.esp32FrontIp = front.ip;
      if (typeof localStorage !== 'undefined') localStorage.setItem('rc_front_cam_ip', front.ip);
      if (frontInput && (frontInput.value !== expectedFrontUrl || !frontInput.value)) {
        frontInput.value = expectedFrontUrl;
      }
      if (!state.esp32Connected || (state.esp32StreamUrl && !state.esp32StreamUrl.includes(front.ip) && !state.esp32StreamUrl.includes('esp32-front-ws'))) {
        console.log('📹 [VR CAM FRONT] Đang tự động kết nối Cam Trước:', expectedFrontUrl);
        connectEsp32Windshield(expectedFrontUrl);
        if (state.windshieldMode !== 'TRANSPARENT' && state.windshieldMode !== 'ESP32_PIP') {
          state.windshieldMode = 'ESP32_LIVE';
        }
      }
    }

    // 3. Tự động cập nhật IP Cam Lùi
    if (rear && rear.ip) {
      const expectedRearUrl = `ws://${rear.ip}:${rear.port || 4213}`;
      state.esp32RearIp = rear.ip;
      if (typeof localStorage !== 'undefined') localStorage.setItem('rc_rear_cam_ip', rear.ip);
      if (rearInput && (rearInput.value !== expectedRearUrl || !rearInput.value)) {
        rearInput.value = expectedRearUrl;
      }
      if (!state.esp32RearConnected && !manualRearDisconnect) {
        console.log('📹 [VR CAM REAR] Đang tự động kết nối Cam Lùi:', expectedRearUrl);
        connectRearEsp32Camera(expectedRearUrl);
      }
    }'''

    new_apply_cams = '''    // 2. Tự động cập nhật IP Cam Trước
    if (front && front.ip) {
      const expectedFrontUrl = `ws://${front.ip}:${front.port || 4213}`;
      state.esp32FrontIp = front.ip;
      if (typeof localStorage !== 'undefined') localStorage.setItem('rc_front_cam_ip', front.ip);
      if (frontInput && (frontInput.value !== expectedFrontUrl || !frontInput.value)) {
        frontInput.value = expectedFrontUrl;
      }
      const isFrontConnectingOrOpen = esp32Socket && (esp32Socket.readyState === WebSocket.CONNECTING || esp32Socket.readyState === WebSocket.OPEN);
      if (!isFrontConnectingOrOpen || state.esp32StreamUrl !== expectedFrontUrl) {
        console.log('📹 [VR CAM FRONT] Đang tự động kết nối Cam Trước:', expectedFrontUrl);
        connectEsp32Windshield(expectedFrontUrl);
        if (state.windshieldMode !== 'TRANSPARENT' && state.windshieldMode !== 'ESP32_PIP') {
          state.windshieldMode = 'ESP32_LIVE';
        }
      }
    }

    // 3. Tự động cập nhật IP Cam Lùi
    if (rear && rear.ip) {
      const expectedRearUrl = `ws://${rear.ip}:${rear.port || 4213}`;
      state.esp32RearIp = rear.ip;
      if (typeof localStorage !== 'undefined') localStorage.setItem('rc_rear_cam_ip', rear.ip);
      if (rearInput && (rearInput.value !== expectedRearUrl || !rearInput.value)) {
        rearInput.value = expectedRearUrl;
      }
      const isRearConnectingOrOpen = esp32RearSocket && (esp32RearSocket.readyState === WebSocket.CONNECTING || esp32RearSocket.readyState === WebSocket.OPEN);
      if ((!isRearConnectingOrOpen || state.esp32RearStreamUrl !== expectedRearUrl) && !manualRearDisconnect) {
        console.log('📹 [VR CAM REAR] Đang tự động kết nối Cam Lùi:', expectedRearUrl);
        connectRearEsp32Camera(expectedRearUrl);
      }
    }'''

    if old_apply_cams in content:
        content = content.replace(old_apply_cams, new_apply_cams, 1)
        print(f"Updated applyEsp32CameraIps in {filepath}")

    # 9. In connectWebSocketToIp, do not kill connection if already connecting/open to same IP
    old_conn_ip = '''  function connectWebSocketToIp(ip) {
    if (!ip || ip === 'localhost' || ip === '127.0.0.1') return;
    if (wsConn && wsConn.readyState === WebSocket.OPEN && activeLaptopIp === ip) return;
    if (wsConn) {
      try { wsConn.close(); } catch (e) {}
    }'''

    new_conn_ip = '''  function connectWebSocketToIp(ip) {
    if (!ip || ip === 'localhost' || ip === '127.0.0.1') return;
    if (wsConn && (wsConn.readyState === WebSocket.OPEN || wsConn.readyState === WebSocket.CONNECTING) && activeLaptopIp === ip) return;
    if (wsConn) {
      try { wsConn.close(); } catch (e) {}
    }'''

    if old_conn_ip in content:
        content = content.replace(old_conn_ip, new_conn_ip, 1)
        print(f"Updated connectWebSocketToIp in {filepath}")

    # 10. In candidate polling interval, stop thrashing when connected
    old_candidate_poll = '''  // 4. HTTP POLLING DỰ PHÒNG 180MS (KHI WEBSOCKET ĐANG NỐI LẠI)
  let candidatePollIdx = 0;
  setInterval(async () => {
    hookMainMpSocket();
    const ips = getCandidateIps();
    if (ips.length === 0) return;

    const testIp = isConnected && activeLaptopIp ? activeLaptopIp : ips[candidatePollIdx % ips.length];
    if (!isConnected) {
      candidatePollIdx++;
      connectWebSocketToIp(testIp);
    }

    if (!wsConn || wsConn.readyState !== WebSocket.OPEN) {
      try {
        const hit = await checkHostAlive(testIp, 250);
        if (hit) {
          isConnected = true;
          onServerFound(hit.ip, hit.data);
        }
      } catch (e) {}
    }
  }, 180);'''

    new_candidate_poll = '''  // 4. HTTP POLLING DỰ PHÒNG (KHI WEBSOCKET ĐANG NỐI LẠI)
  let candidatePollIdx = 0;
  let lastCandidatePollMs = 0;
  setInterval(async () => {
    hookMainMpSocket();
    const nowMs = Date.now();
    // Nếu WebSocket đã kết nối ổn định: Tuyệt đối không nhảy IP khác làm nghẽn mạng!
    if (isConnected && wsConn && wsConn.readyState === WebSocket.OPEN) return;

    // Giãn khoảng cách thăm dò tối thiểu 1500ms để kết nối TCP/WS kịp hoàn tất handshake
    if (nowMs - lastCandidatePollMs < 1500) return;
    lastCandidatePollMs = nowMs;

    const ips = getCandidateIps();
    if (ips.length === 0) return;

    // Nếu socket đang trong quá trình CONNECTING, cho nó tối đa 2500ms hoàn thành, không vội đóng
    if (wsConn && wsConn.readyState === WebSocket.CONNECTING) return;

    const testIp = activeLaptopIp || ips[candidatePollIdx % ips.length];
    candidatePollIdx++;
    connectWebSocketToIp(testIp);

    try {
      const hit = await checkHostAlive(testIp, 500);
      if (hit) {
        isConnected = true;
        onServerFound(hit.ip, hit.data);
      }
    } catch (e) {}
  }, 1000);'''

    if old_candidate_poll in content:
        content = content.replace(old_candidate_poll, new_candidate_poll, 1)
        print(f"Updated candidate polling interval in {filepath}")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Successfully updated client file: {filepath}")
    return True

if __name__ == '__main__':
    ok1 = patch_server_file('server.js')
    ok2 = patch_server_file('server/server.js')
    ok3 = patch_app_file('app.js')
    ok4 = patch_app_file('www/app.js')
    ok5 = patch_app_file('server/public/app.js')
    ok6 = patch_app_file('android/app/src/main/assets/public/app.js')
    print("ALL SUCCESS:", all([ok1, ok2, ok3, ok4, ok5, ok6]))
