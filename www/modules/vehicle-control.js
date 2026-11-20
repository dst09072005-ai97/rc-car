import { setupV260WheelBridge } from './wheel-gog808.js';

/** Vehicle control, multiplayer transmission and V504 Quest driving. */

export function setupV185AutoDiscoveryAndNpcCollisionEngine(ctx) {
  const {
    THREE, allTrafficVehicles, camera, connectEsp32Windshield, connectRearEsp32Camera,
    getHostedServerHostname, grannyObstacles, holdState, keys, normalizeEsp32CameraSocketUrl,
    scene, selectPhoneFpvSurface, sidewalkNpcs, state, updateEsp32PulseInfo, updatePhoneFpvStatus,
    vehicleRoot,
  } = ctx;
  // 1. TỰ ĐỘNG ĐỒNG BỘ IP ESP32 KHI ĐỔI WI-FI
  let isScanningNetwork = false;

  // ============================================================================
  // [ESP32 CAM AUTO-SYNC] HÀM CẬP NHẬT & TỰ ĐỘNG KẾT NỐI CAMERA TRÊN KÍNH VR & WEB
  // ============================================================================
  function applyEsp32CameraIps(data) {
    if (!data) return;
    const front = data.front || (data.role === 'front' ? data : null);
    const rear = data.rear || (data.role === 'rear' ? data : null);
    const car = data.car || (data.role === 'car' ? data : null);
    const fpvPhone = data.fpvPhone || null;
    const publicTunnelUrl = data.publicTunnelUrl || (front && front.publicTunnelUrl) || (typeof window !== 'undefined' && window.__PUBLIC_TUNNEL_URL__) || null;
    if (publicTunnelUrl && typeof window !== 'undefined') window.__PUBLIC_TUNNEL_URL__ = publicTunnelUrl;

    const frontInput = document.getElementById('esp32-front-ip');
    const rearInput = document.getElementById('esp32-rear-ip');
    const carInput = document.getElementById('esp32-car-ip');
    const carStatus = document.getElementById('esp32-car-status');

    const isApkCamEnv = (typeof window !== 'undefined' && (window.QuestVRBridge || window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '8080' && window.location.port !== '8443')));
    const isServedCamHost = !isApkCamEnv && typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http');

    const resolveCamWsUrl = (cam, fallbackPort) => {
      if (!cam || !cam.ip) return '';
      if (!cam.path) return `ws://${cam.ip}:${cam.port || fallbackPort}`;
      if (isServedCamHost) {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${window.location.host}${cam.path}`;
      }
      if (isApkCamEnv && window.__USE_TUNNEL_FALLBACK__ && publicTunnelUrl) {
        try {
          const u = new URL(publicTunnelUrl);
          return `wss://${u.host}${cam.path}`;
        } catch (e) {}
      }
      return `ws://${cam.ip}:${cam.port || 8080}${cam.path}`;
    };

    // Báo trạng thái Điện thoại FPV cho Kính Quest 3 (kể cả qua Wi-Fi LAN hoặc Cloudflare Public Tunnel)
    if (fpvPhone) {
      if (!state.phoneFpvSurface && fpvPhone.connected) selectPhoneFpvSurface(fpvPhone.surface);
      else updatePhoneFpvStatus();
    }
    if (fpvPhone && fpvPhone.connected) {
      const phoneLabel = fpvPhone.ip || (publicTunnelUrl ? 'Cloudflare Tunnel' : 'FPV Phone');
      if (state.fpvPhoneIp !== phoneLabel || !state.fpvPhoneConnected) {
        state.fpvPhoneIp = phoneLabel;
        state.fpvPhoneConnected = true;
        state.lastActionLog = `📱 Đã tìm thấy Điện Thoại Cam FPV (${phoneLabel}) -> Kính Lái & Gương Hậu sẵn sàng!`;
      }
    } else if (fpvPhone && fpvPhone.connected === false && state.fpvPhoneConnected) {
      state.fpvPhoneConnected = false;
    }

    // 1. Tự động cập nhật IP Mạch Lái Xe
    if (car && car.ip) {
      if (carInput && (!carInput.value || carInput.value !== car.ip)) {
        carInput.value = car.ip;
        if (typeof localStorage !== 'undefined') localStorage.setItem('esp32_car_ip', car.ip);
      }
      state.esp32CarIp = car.ip;
      state.esp32CarConnected = Boolean(car.active);
      if (carStatus) {
        const phoneBadge = (fpvPhone && fpvPhone.connected) ? ` | 📱 FPV: ${fpvPhone.ip || 'Tunnel OK'}` : '';
        carStatus.textContent = (car.active ? `🟢 Đã nối xe (${car.ip}:4210)` : `🟠 Thấy xe (${car.ip} - Chờ lệnh)`) + phoneBadge;
        carStatus.style.color = car.active ? '#00ff88' : '#ff9500';
      }
    }

    // 2. Tự động cập nhật IP Cam Trước
    if (front && front.ip) {
      const expectedFrontUrl = resolveCamWsUrl(front, 4213);
      state.esp32FrontIp = (fpvPhone && fpvPhone.connected && fpvPhone.ip) ? fpvPhone.ip : front.ip;
      if (typeof localStorage !== 'undefined') localStorage.setItem('rc_front_cam_ip', front.ip);
      if (frontInput && (frontInput.value !== expectedFrontUrl || !frontInput.value)) {
        frontInput.value = expectedFrontUrl;
      }
      const isFrontConnectingOrOpen = ctx.esp32Socket && (ctx.esp32Socket.readyState === WebSocket.CONNECTING || ctx.esp32Socket.readyState === WebSocket.OPEN);
      if (!isFrontConnectingOrOpen || state.esp32StreamUrl !== normalizeEsp32CameraSocketUrl(expectedFrontUrl, '/esp32-front-ws')) {
        console.log('📹 [VR CAM FRONT] Đang tự động kết nối Cam Trước:', expectedFrontUrl);
        connectEsp32Windshield(expectedFrontUrl);
      }
    }

    // 3. Tự động cập nhật IP Cam Lùi
    if (rear && rear.ip) {
      const expectedRearUrl = resolveCamWsUrl(rear, 4213);
      state.esp32RearIp = (fpvPhone && fpvPhone.connected && fpvPhone.ip) ? fpvPhone.ip : rear.ip;
      if (typeof localStorage !== 'undefined') localStorage.setItem('rc_rear_cam_ip', rear.ip);
      if (rearInput && (rearInput.value !== expectedRearUrl || !rearInput.value)) {
        rearInput.value = expectedRearUrl;
      }
      const isRearConnectingOrOpen = ctx.esp32RearSocket && (ctx.esp32RearSocket.readyState === WebSocket.CONNECTING || ctx.esp32RearSocket.readyState === WebSocket.OPEN);
      if ((!isRearConnectingOrOpen || state.esp32RearStreamUrl !== normalizeEsp32CameraSocketUrl(expectedRearUrl, '/esp32-rear-ws')) && !ctx.manualRearDisconnect) {
        console.log('📹 [VR CAM REAR] Đang tự động kết nối Cam Lùi:', expectedRearUrl);
        connectRearEsp32Camera(expectedRearUrl);
      }
    }
  }
  if (typeof window !== 'undefined') window.applyEsp32CameraIps = applyEsp32CameraIps;

  async function checkDiscoveredEsp32Ips() {
    try {
      const isApkEnv = (typeof window !== 'undefined' && (window.QuestVRBridge || window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '8080' && window.location.port !== '8443')));
      const savedIp = (typeof localStorage !== 'undefined' && (localStorage.getItem('pc_server_ip') || localStorage.getItem('V500_LAPTOP_IP')));
      const pcIp = getHostedServerHostname() || savedIp || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.76';
      const isHttps = !isApkEnv && typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
      const isCurrentHost = !isApkEnv && typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http');
      const baseUrl = isCurrentHost ? '' : (isHttps ? `https://${pcIp}:8443` : `http://${pcIp}:8080`);
      const res = await fetch(`${baseUrl}/api/esp32-discovered`);
      if (!res.ok) return;
      const data = await res.json();
      applyEsp32CameraIps(data);
    } catch (e) {}
  }

  // Quét định kỳ mỗi 3 giây để bắt kịp ngay khi mạch vừa đổi Wi-Fi hoặc reboot
  setInterval(checkDiscoveredEsp32Ips, 3000);

  // Nút bấm Quét chủ động trên Web
  async function triggerManualEsp32Scan() {
    if (isScanningNetwork) return;
    isScanningNetwork = true;
    const btn = document.getElementById('btn-auto-discover-esp32');
    if (btn) {
      btn.textContent = '⏳ Đang Quét Tìm ESP32 & FPV Trong LAN...';
      btn.style.background = '#ffd60a';
    }
    state.lastActionLog = '🔍 Đang quét toàn bộ mạng Wi-Fi để tự động tìm IP mới của Camera & Xe...';

    try {
      const isApkEnv = (typeof window !== 'undefined' && (window.QuestVRBridge || window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '8080' && window.location.port !== '8443')));
      const savedIp = (typeof localStorage !== 'undefined' && (localStorage.getItem('pc_server_ip') || localStorage.getItem('V500_LAPTOP_IP')));
      const pcIp = getHostedServerHostname() || savedIp || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.76';
      const isHttps = !isApkEnv && typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
      const isCurrentHost = !isApkEnv && typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http');
      const baseUrl = isCurrentHost ? '' : (isHttps ? `https://${pcIp}:8443` : `http://${pcIp}:8080`);
      const res = await fetch(`${baseUrl}/api/scan-esp32`);
      const data = await res.json();
      await checkDiscoveredEsp32Ips();

      if (btn) {
        btn.textContent = `✅ Đã Quét Xong! (Đã kết nối FPV & Xe)`;
        btn.style.background = '#00ff88';
        setTimeout(() => {
          btn.textContent = '🔍 Tự Động Quét Tìm & Cập Nhật IP Mới Khi Đổi Wi-Fi';
          btn.style.background = '#ff9500';
        }, 4000);
      }
      state.lastActionLog = `✅ Đã quét xong mạng LAN! Tự động kết nối Camera Laptop FPV (${pcIp})!`;
    } catch (err) {
      console.warn('[SCAN AUTO-FALLBACK]', err);
      const savedIp = (typeof localStorage !== 'undefined' && (localStorage.getItem('pc_server_ip') || localStorage.getItem('V500_LAPTOP_IP')));
      const pcIp = getHostedServerHostname() || savedIp || window.__ACTIVE_DISCOVERED_IP__ || '192.168.1.76';
      if (typeof applyEsp32CameraIps === 'function') {
        applyEsp32CameraIps({
          front: { ip: pcIp, port: 8080, path: '/esp32-front-ws', active: true },
          rear: { ip: pcIp, port: 8080, path: '/esp32-rear-ws', active: true }
        });
      }
      if (btn) {
        btn.textContent = `✅ Đã Áp Dụng IP Laptop (${pcIp})`;
        btn.style.background = '#00ff88';
        setTimeout(() => {
          btn.textContent = '🔍 Tự Động Quét Tìm & Cập Nhật IP Mới Khi Đổi Wi-Fi';
          btn.style.background = '#ff9500';
        }, 4000);
      }
    } finally {
      isScanningNetwork = false;
    }
  }

  // Gắn sự kiện nút bấm quét & kết nối mạch lái xe
  function initDiscoveryUi() {
    document.getElementById('btn-auto-discover-esp32')?.addEventListener('click', triggerManualEsp32Scan);

    // Cấu hình mạch lái xe ESP32 Car Controller
    const carInput = document.getElementById('esp32-car-ip');
    const carStatus = document.getElementById('esp32-car-status');
    const btnConnectCar = document.getElementById('btn-connect-car-esp32');
    const btnInvertSteer = document.getElementById('btn-toggle-invert-steer');
    const btnTestPulse = document.getElementById('btn-test-esp32-pulse');

    const savedCarIp = localStorage.getItem('esp32_car_ip');
    if (savedCarIp && carInput) {
      carInput.value = savedCarIp;
      state.esp32CarIp = savedCarIp;
    }

    function applyCarIp(ip) {
      if (!ip) return;
      const cleanIp = ip.trim().replace(/^https?:\/\//, '').replace(/^ws:\/\//, '').split(':')[0];
      state.esp32CarIp = cleanIp;
      localStorage.setItem('esp32_car_ip', cleanIp);
      if (ctx.mpSocket && ctx.mpSocket.readyState === WebSocket.OPEN) {
        ctx.mpSocket.send(JSON.stringify({ type: 'SET_ESP32_CAR_IP', ip: cleanIp, port: 4210 }));
      }
      fetch(`/api/set-esp32-car-ip?ip=${encodeURIComponent(cleanIp)}`).catch(() => {});
      if (carStatus) {
        carStatus.textContent = `🟢 Đã nối (${cleanIp}:4210)`;
        carStatus.style.color = '#00ff88';
      }
      state.lastActionLog = `🚗 Đã lưu & kết nối Mạch Lái Xe ESP32: ${cleanIp}:4210`;
    }

    btnConnectCar?.addEventListener('click', () => {
      const ip = carInput ? carInput.value.trim() : '';
      if (ip) applyCarIp(ip);
    });

    carInput?.addEventListener('change', () => {
      const ip = carInput ? carInput.value.trim() : '';
      if (ip) applyCarIp(ip);
    });

    // Đảo góc bẻ lái Servo (Invert Steering)
    state.invertCarSteer = localStorage.getItem('invert_car_steer') === 'true';
    if (btnInvertSteer && state.invertCarSteer) {
      btnInvertSteer.style.background = '#ff9500';
      btnInvertSteer.textContent = '🔄 Đảo Lái: BẬT (Ngược)';
    }
    btnInvertSteer?.addEventListener('click', () => {
      if (typeof window.toggleGog808Steer === 'function') {
        window.toggleGog808Steer();
      } else {
        state.invertCarSteer = !state.invertCarSteer;
        localStorage.setItem('invert_car_steer', state.invertCarSteer ? 'true' : 'false');
      }
      btnInvertSteer.style.background = state.invertCarSteer ? '#ff9500' : '#1f3354';
      btnInvertSteer.textContent = state.invertCarSteer ? '🔄 Đảo Lái: BẬT (Ngược)' : '🔄 Đảo Lái (Trái/Phải)';
    });

    // Đảo kênh Bàn Đạp GOG R808 (Ga ⇋ Phanh)
    const btnSwapPedals = document.getElementById('btn-toggle-swap-pedals');
    function updateSwapPedalsBtn() {
      const isSwapped = (typeof window !== 'undefined' && window.__GOG808_SWAP_PEDALS__) || (localStorage.getItem('gog808_swap_pedals') === 'true');
      if (btnSwapPedals) {
        btnSwapPedals.style.background = isSwapped ? '#ff9500' : '#1f3354';
        btnSwapPedals.textContent = isSwapped ? '🛞 Đảo Bàn Đạp: BẬT (Trục 2=Ga, Trục 1=Phanh)' : '🛞 Đảo Bàn Đạp (Ga ⇋ Phanh)';
      }
    }
    updateSwapPedalsBtn();
    btnSwapPedals?.addEventListener('click', () => {
      if (typeof window.toggleGog808Pedals === 'function') {
        window.toggleGog808Pedals();
      } else {
        window.__GOG808_SWAP_PEDALS__ = !window.__GOG808_SWAP_PEDALS__;
        localStorage.setItem('gog808_swap_pedals', window.__GOG808_SWAP_PEDALS__ ? 'true' : 'false');
      }
      updateSwapPedalsBtn();
    });

    // Hoán đổi kênh Servo & ESC linh hoạt
    const btnSwapPorts = document.getElementById('btn-toggle-swap-ports');
    state.swapSteerAndThrottle = localStorage.getItem('rc_swap_ports') === 'true';
    function updateSwapPortsBtn() {
      if (btnSwapPorts) {
        btnSwapPorts.style.background = state.swapSteerAndThrottle ? '#eb4d4b' : '#1f3354';
        btnSwapPorts.textContent = state.swapSteerAndThrottle ? '🔀 Đổi Cổng: BẬT (ESC=P12, Servo=P13)' : '🔀 Đổi Cổng (Servo ⇋ ESC)';
      }
    }
    updateSwapPortsBtn();
    btnSwapPorts?.addEventListener('click', () => {
      state.swapSteerAndThrottle = !state.swapSteerAndThrottle;
      localStorage.setItem('rc_swap_ports', state.swapSteerAndThrottle ? 'true' : 'false');
      updateSwapPortsBtn();
      state.lastActionLog = state.swapSteerAndThrottle
        ? '🔀 ĐÃ ĐỔI CỔNG: Phím W/S lái ESC (cổng 12), phím A/D bẻ lái Servo (cổng 13)!'
        : '🔀 CHẾ ĐỘ CHUẨN: Phím A/D bẻ lái Servo (cổng 12), phím W/S lái ESC (cổng 13)!';
    });

    // Nút Test Lắc Bánh Xe (Pulse Servo)
    // Cân chỉnh tốc độ xe thật và đồng bộ 1:1 với app 3D (Bản vá V195)
    const btnSpeedSlow = document.getElementById('btn-rc-speed-slow');
    const btnSpeedMedium = document.getElementById('btn-rc-speed-medium');
    const btnSpeedFast = document.getElementById('btn-rc-speed-fast');
    const sliderMaxThrottle = document.getElementById('slider-rc-max-throttle');
    const valMaxThrottle = document.getElementById('val-rc-max-throttle');
    const valSpeedMode = document.getElementById('val-rc-speed-mode');

    const sliderMaxReverse = document.getElementById('slider-rc-max-reverse');
    const valMaxReverse = document.getElementById('val-rc-max-reverse');

    function setRcSpeedPreset(pulse, kmh, modeName, activeBtn, revPulse) {
      state.rcMaxForwardPulse = pulse;
      state.rcTargetSpeedKmh = kmh;
      if (typeof revPulse === 'number') {
        state.rcMaxReversePulse = revPulse;
      } else {
        const fwdDelta = pulse - 1500;
        state.rcMaxReversePulse = 1500 - Math.round(Math.max(110, fwdDelta * 1.75));
      }
      localStorage.setItem('rc_max_throttle_pulse', String(pulse));
      localStorage.setItem('rc_target_speed_kmh', String(kmh));
      localStorage.setItem('rc_max_reverse_pulse', String(state.rcMaxReversePulse));

      if (sliderMaxThrottle) sliderMaxThrottle.value = String(pulse);
      if (valMaxThrottle) valMaxThrottle.textContent = `${pulse}µs`;
      if (sliderMaxReverse) sliderMaxReverse.value = String(state.rcMaxReversePulse);
      if (valMaxReverse) valMaxReverse.textContent = `${state.rcMaxReversePulse}µs`;
      if (valSpeedMode) valSpeedMode.textContent = `${modeName} (${pulse}µs - ${kmh} km/h | Lùi: ${state.rcMaxReversePulse}µs)`;

      [btnSpeedSlow, btnSpeedMedium, btnSpeedFast].forEach(b => {
        if (b) {
          b.style.background = '#1f3354';
          b.style.color = '#fff';
          b.style.fontWeight = 'normal';
        }
      });
      if (activeBtn) {
        activeBtn.style.background = '#00e5ff';
        activeBtn.style.color = '#000';
        activeBtn.style.fontWeight = 'bold';
      }
      state.lastActionLog = `🎯 Đã đổi tốc độ xe RC: ${modeName} (${kmh} km/h - Tiến: ${pulse}µs, Lùi: ${state.rcMaxReversePulse}µs)`;
    }

    btnSpeedSlow?.addEventListener('click', () => {
      setRcSpeedPreset(1565, 8.0, '🐢 Êm Ái', btnSpeedSlow, 1380);
    });

    btnSpeedMedium?.addEventListener('click', () => {
      setRcSpeedPreset(1585, 12.0, '🚗 Vừa Phải', btnSpeedMedium, 1350);
    });

    btnSpeedFast?.addEventListener('click', () => {
      setRcSpeedPreset(1640, 18.0, '🏎️ Thể Thao', btnSpeedFast, 1300);
    });

    sliderMaxThrottle?.addEventListener('input', (e) => {
      const pulse = parseInt(e.target.value, 10) || 1585;
      const kmh = Math.round(((pulse - 1500) / 85) * 12.0 * 10) / 10;
      setRcSpeedPreset(pulse, kmh, '⚙️ Tùy Chỉnh', null, state.rcMaxReversePulse);
    });

    sliderMaxReverse?.addEventListener('input', (e) => {
      const revPulse = parseInt(e.target.value, 10) || 1350;
      state.rcMaxReversePulse = revPulse;
      localStorage.setItem('rc_max_reverse_pulse', String(revPulse));
      if (valMaxReverse) valMaxReverse.textContent = `${revPulse}µs`;
      if (valSpeedMode) valSpeedMode.textContent = `⚙️ Tùy Chỉnh (Tiến: ${state.rcMaxForwardPulse || 1585}µs | Lùi: ${revPulse}µs)`;
      state.lastActionLog = `🎯 Đã chỉnh lực ga lùi: ${revPulse}µs (Xung lùi đủ mạnh để thắng ma sát bánh xe)`;
    });

    const savedPulse = parseInt(localStorage.getItem('rc_max_throttle_pulse'), 10);
    const savedKmh = parseFloat(localStorage.getItem('rc_target_speed_kmh'));
    const savedRev = parseInt(localStorage.getItem('rc_max_reverse_pulse'), 10);
    if (savedRev && sliderMaxReverse && valMaxReverse) {
      state.rcMaxReversePulse = savedRev;
      sliderMaxReverse.value = String(savedRev);
      valMaxReverse.textContent = `${savedRev}µs`;
    }
    if (savedPulse && savedKmh) {
      const btn = savedPulse <= 1570 ? btnSpeedSlow : (savedPulse <= 1600 ? btnSpeedMedium : btnSpeedFast);
      setRcSpeedPreset(savedPulse, savedKmh, savedPulse <= 1570 ? '🐢 Êm Ái' : (savedPulse <= 1600 ? '🚗 Vừa Phải' : '🏎️ Thể Thao'), btn, savedRev || undefined);
    }

    const btnTestMotor = document.getElementById('btn-test-esp32-motor');
    btnTestMotor?.addEventListener('click', () => {
      if (!ctx.mpSocket || ctx.mpSocket.readyState !== WebSocket.OPEN) {
        state.lastActionLog = '⚠️ Chưa kết nối máy chủ WebSocket!';
        return;
      }
      state.lastActionLog = '🏎️ Đang thử nhấp ga 1660µs tới xe RC trong 400ms...';
      ctx.mpSocket.send(JSON.stringify({ type: 'TEST_ESP32_MOTOR' }));
    });

    btnTestPulse?.addEventListener('click', () => {
      if (!ctx.mpSocket || ctx.mpSocket.readyState !== WebSocket.OPEN) {
        state.lastActionLog = '⚠️ Chưa kết nối máy chủ WebSocket!';
        return;
      }
      state.lastActionLog = '⚡ Đang gửi xung Test Lắc Bánh Xe (60° -> 120° -> 90°)...';
      ctx.mpSocket.send(JSON.stringify({ type: 'CAR_CONTROL', steer: 60, throttle: 1500 }));
      setTimeout(() => {
        if (ctx.mpSocket && ctx.mpSocket.readyState === WebSocket.OPEN) {
          ctx.mpSocket.send(JSON.stringify({ type: 'CAR_CONTROL', steer: 120, throttle: 1500 }));
        }
      }, 300);
      setTimeout(() => {
        if (ctx.mpSocket && ctx.mpSocket.readyState === WebSocket.OPEN) {
          ctx.mpSocket.send(JSON.stringify({ type: 'CAR_CONTROL', steer: 90, throttle: 1500 }));
        }
      }, 600);
    });

    // Quét ngay 1 lần lúc vừa tải trang
    setTimeout(checkDiscoveredEsp32Ips, 1200);

    // Tự động kích hoạt kết nối camera trước & sau & car ip dựa trên giá trị trong ô input
    setTimeout(() => {
      if (savedCarIp) applyCarIp(savedCarIp);
      const frontInput = document.getElementById('esp32-front-ip');
      const rearInput = document.getElementById('esp32-rear-ip');
      if (frontInput && frontInput.value && !state.esp32Connected) {
        connectEsp32Windshield(frontInput.value.trim());
      }
      if (rearInput && rearInput.value && !state.esp32RearConnected && !ctx.manualRearDisconnect) {
        connectRearEsp32Camera(rearInput.value.trim());
      }
    }, 1500);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initDiscoveryUi);
  } else {
    initDiscoveryUi();
  }

  // 2. CƠ CHẾ VẬT LÝ OBB CHẶN 100% NPC ĐI XUYÊN XE
  function resolveVehicleNpcCollisions(dt) {
    if (typeof vehicleRoot === 'undefined') return;

    const carPos = vehicleRoot.position;
    const carYaw = vehicleRoot.rotation.y || state.headingRad || 0;
    const cosYaw = Math.cos(carYaw);
    const sinYaw = Math.sin(carYaw);

    // Kích thước xe Rolls-Royce: Dài 5.4m, Rộng 2.1m.
    // Vùng đệm an toàn xung quanh thân xe cho người đi bộ là 0.40m
    const halfWidth = 1.15 + 0.40;   // 1.55m
    const halfLength = 2.70 + 0.45;  // 3.15m

    // A. NGƯỜI ĐI BỘ TRÊN VỈA HÈ & BÀ GIÀ ĐI BỘ / XE MÁY (ZERO PER-FRAME ALLOCATION)
    function preventNpcCarPenetration(npcList) {
      if (!npcList || !Array.isArray(npcList)) return;
      for (let i = 0; i < npcList.length; i++) {
        const npc = npcList[i];
        if (!npc || !npc.visible) continue;
        if (npc.userData && npc.userData.npcState === 'KNOCKED_FLYING') continue;
        const dx = npc.position.x - carPos.x;
        const dz = npc.position.z - carPos.z;

        // Khoảng cách sơ bộ
        if (dx * dx + dz * dz > 36.0) continue;

        // Chuyển sang tọa độ cục bộ OBB của xe
        const localX = dx * cosYaw - dz * sinYaw;
        const localZ = dx * sinYaw + dz * cosYaw;

        // Nếu người đi bộ chạm hoặc lọt vào vùng thân xe:
        if (Math.abs(localX) < halfWidth && Math.abs(localZ) < halfLength) {
          const overlapX = halfWidth - Math.abs(localX);
          const overlapZ = halfLength - Math.abs(localZ);

          let resLocalX = localX;
          let resLocalZ = localZ;

          // Đẩy ra mép gần nhất
          if (overlapX < overlapZ) {
            resLocalX = localX >= 0 ? halfWidth : -halfWidth;
          } else {
            resLocalZ = localZ >= 0 ? halfLength : -halfLength;
          }

          // Đổi ngược lại tọa độ thế giới và đẩy NPC ra ngoài thân xe tức thì
          npc.position.x = carPos.x + (resLocalX * cosYaw + resLocalZ * sinYaw);
          npc.position.z = carPos.z + (-resLocalX * sinYaw + resLocalZ * cosYaw);

          // Đảo hướng đi bộ nếu người đi bộ đang đi thẳng đâm vào xe
          if (npc.userData && npc.userData.railDir) {
            if (Math.random() < 0.2) npc.userData.railDir = -npc.userData.railDir;
          }
        }
      }
    }

    if (typeof sidewalkNpcs !== 'undefined') preventNpcCarPenetration(sidewalkNpcs);
    if (typeof grannyObstacles !== 'undefined') preventNpcCarPenetration(grannyObstacles);

    // B. XE NPC TRÊN ĐƯỜNG (allTrafficVehicles) KHÔNG ĐƯỢC ĐI XUYÊN XE NGƯỜI CHƠI
    if (typeof allTrafficVehicles !== 'undefined' && Array.isArray(allTrafficVehicles)) {
      for (let i = 0; i < allTrafficVehicles.length; i++) {
        const veh = allTrafficVehicles[i];
        if (!veh || !veh.visible) continue;
        const vd = veh.userData;
        if (!vd) continue;

        const dxV = veh.position.x - carPos.x;
        const dzV = veh.position.z - carPos.z;
        const distSqV = dxV * dxV + dzV * dzV;
        if (distSqV > 45.0) continue;

        const safeDist = 4.3;
        const dist = Math.sqrt(distSqV);
        if (dist < safeDist) {
          // Xe NPC dừng hẳn nhường đường, bấm còi
          vd.activeSpeed = 0;
          if (vd.hornBadge) vd.hornBadge.visible = true;

          // Đẩy nhẹ xe NPC ra ngoài để tuyệt đối không bao giờ đi xuyên xe
          const push = (safeDist - dist) * 0.55;
          veh.position.x += (dxV / (dist || 1)) * push;
          veh.position.z += (dzV / (dist || 1)) * push;
        }
      }
    }
  }

  // 3. GẮN VÀO KHUNG RENDER CHÍNH scene.onBeforeRender & TRUYỀN LỆNH LÁI XE ESP32
  const prevBeforeRenderV185 = scene.onBeforeRender;
  let lastV185Time = performance.now();
  let lastCarControlSendTime = 0;
  const carControlPacket = { type: 'CAR_CONTROL', steer: 90, throttle: 1500 };

  scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
    if (typeof prevBeforeRenderV185 === 'function') {
      prevBeforeRenderV185.call(this, rendererInst, sceneInst, cameraInst);
    }
    if (cameraInst !== camera && !rendererInst.xr.isPresenting) return;

    // Chặn hoàn toàn gửi lệnh điều khiển xe khi tab trình duyệt đang chạy ngầm / bị ẩn
    if (typeof document !== 'undefined' && document.hidden) return;

    const now = performance.now();
    const dt = Math.min((now - lastV185Time) / 1000, 0.1);
    if (dt < 0.001) return;
    lastV185Time = now;

    resolveVehicleNpcCollisions(dt);

    // Chỉ client đang ở chế độ LÁI XE (DRIVING) mới được quyền gửi CAR_CONTROL tới xe RC thật!
    if (state.playerMode !== 'DRIVING') {
      if (state._wasDrivingRc) {
        state._wasDrivingRc = false;
        // Gửi 1 lệnh dừng duy nhất khi vừa thoát chế độ lái để xe dừng hẳn, sau đó hoàn toàn im lặng
        if (ctx.mpSocket && ctx.mpSocket.readyState === WebSocket.OPEN) {
          carControlPacket.steer = 90;
          carControlPacket.throttle = 1500;
          ctx.mpSocket.send(JSON.stringify(carControlPacket));
        }
      }
      return;
    }
    state._wasDrivingRc = true;

    // Gửi lệnh điều khiển xe thật qua WebSocket tới server.js (25Hz = 40ms/lần, Zero Per-Frame Allocation)
    if (now - lastCarControlSendTime >= 40) {
      lastCarControlSendTime = now;
      if (ctx.mpSocket && ctx.mpSocket.readyState === WebSocket.OPEN) {
        // [ANTI-ECHO] Nếu đang nhận Remote Bridge từ Laptop (GOG R808 cắm máy tính và đang phát sóng):
        // Laptop đã là master điều khiển xe RC và phát broadcast.
        // Client (Kính VR) KHÔNG gửi ngược CAR_CONTROL hay WHEEL_BRIDGE_INPUT về server để triệt tiêu vĩnh viễn echo loop nhảy loạn góc lái!
        if (typeof window !== 'undefined' && typeof window.isRemoteBridgeActive === 'function' && window.isRemoteBridgeActive()) {
          return;
        }
        const maxFwdDelta = Math.max(20, Math.min(260, (state.rcMaxForwardPulse || 1660) - 1500));
        const maxRevDelta = Math.max(40, Math.min(260, 1500 - (state.rcMaxReversePulse || 1320)));

        let targetSteer = 90;
        let targetThrottle = 1500;

        // A. TÍNH TOÁN GÓC BẺ LÁI SERVO CHO XE RC (45° TRÁI .. 90° THẲNG .. 135° PHẢI)
        let steerNorm = 0; // -1.0 (trái) .. 0 (thẳng) .. +1.0 (phải)

        // 1. Đọc từ Vô Lăng GOG R808 thật
        const wheel = window._racingWheel;
        if (wheel && wheel.connected && Math.abs(wheel.rawSteer || 0) > 0.02) {
          steerNorm = THREE.MathUtils.clamp(wheel.rawSteer, -1.0, 1.0);
        } else if (Math.abs(state.steeringAngleDeg || 0) > 1.0) {
          steerNorm = THREE.MathUtils.clamp(state.steeringAngleDeg / 450.0, -1.0, 1.0);
        }

        // 2. Nhận từ Bàn phím A/D hoặc Cụm nút cảm ứng D-Pad (Ưu tiên cao nhất khi người dùng ấn phím)
        const wantLeft = keys.a || keys.ArrowLeft || (typeof holdState !== 'undefined' && holdState.left);
        const wantRight = keys.d || keys.ArrowRight || (typeof holdState !== 'undefined' && holdState.right);
        if (wantLeft && !wantRight) {
          steerNorm = -1.0;
          state.steeringAngleDeg = -450;
        } else if (wantRight && !wantLeft) {
          steerNorm = 1.0;
          state.steeringAngleDeg = 450;
        }

        if (state.invertCarSteer) {
          steerNorm = -steerNorm;
        }

        targetSteer = Math.round(90 - steerNorm * 45);
        targetSteer = THREE.MathUtils.clamp(targetSteer, 45, 135);

        // B. TÍNH TOÁN XUNG GA ĐIỀU TỐC ESC CHO XE RC (1300..1700µs - SIÊU MƯỢT EXPO + DAMPED)
        const wantGas = keys.w || keys.ArrowUp || (typeof holdState !== 'undefined' && (holdState.gas || holdState.up));
        const wantRev = keys.s || keys.ArrowDown || (typeof holdState !== 'undefined' && (holdState.brake || holdState.down));

        const isHardBraking = (state.brakePercent > 35) && (state.brakePercent > (state.reversePercent || 0));
        const isReversing = (state.reversePercent > 5) || (state.gearIndex === 1 && !wantGas) || (wantRev && !wantGas);
        const isForward = (state.throttlePercent > 5 && state.gearIndex === 3) || (wantGas && !wantRev);

        // Gia tốc phím lùi (S / ArrowDown): Ramping lũy tiến êm ái từ 0 -> 100% trong ~0.4s
        if (typeof state.rcKeyReverseRamp === 'undefined') state.rcKeyReverseRamp = 0;
        if (wantRev && !wantGas) {
          state.rcKeyReverseRamp = Math.min(1.0, state.rcKeyReverseRamp + dt * 2.5);
        } else {
          state.rcKeyReverseRamp = Math.max(0.0, state.rcKeyReverseRamp - dt * 4.5);
        }

        // Chuyển làn an toàn: Nếu đang tiến (>1530µs) mà muốn lùi, dừng êm ở 1500µs trong 100ms trước khi lùi
        if (typeof state.rcReverseBrakeDelay === 'undefined') state.rcReverseBrakeDelay = 0;
        if (isReversing && state.rcSmoothThrottle > 1530) {
          state.rcReverseBrakeDelay = now + 100;
        }

        if (isHardBraking || (isReversing && now < state.rcReverseBrakeDelay)) {
          targetThrottle = 1500;
        } else if (isReversing) {
          let rawRevPct = 0;
          if (state.reversePercent > 5) {
            rawRevPct = state.reversePercent;
          } else if (state.gearIndex === 1 && state.throttlePercent > 5) {
            rawRevPct = state.throttlePercent;
          } else if (wantRev && !wantGas) {
            rawRevPct = state.rcKeyReverseRamp * 100;
          }

          const pct = THREE.MathUtils.clamp(rawRevPct, 0, 100);
          if (pct > 2.0) {
            // Đường cong lũy tiến mượt mà C0+C1 continuous, hòa trộn êm vùng chết 20µs trong 15% hành trình đầu (Zero-Discontinuity)
            const normPct = pct / 100.0;
            const blendIn = Math.min(1.0, normPct / 0.15);
            const expoPct = Math.pow(normPct, 1.35);
            const deadbandSkip = 20.0;
            const effectiveDelta = Math.max(0, maxRevDelta - deadbandSkip);
            const revDelta = (deadbandSkip * blendIn) + (expoPct * effectiveDelta);
            targetThrottle = Math.round(1500 - revDelta);
          } else {
            targetThrottle = 1500;
          }
        } else if (isForward) {
          const rawFwdPct = (state.throttlePercent > 5) ? state.throttlePercent : (wantGas ? 100 : 0);
          const pct = THREE.MathUtils.clamp(rawFwdPct, 0, 100);
          if (pct > 2.0) {
            // Hòa trộn êm ái vùng chết 18µs trong 15% hành trình đầu, không bị khấc giật tại điểm 0
            const normPct = pct / 100.0;
            const blendIn = Math.min(1.0, normPct / 0.15);
            const deadbandSkip = 18.0;
            const effectiveDelta = Math.max(0, maxFwdDelta - deadbandSkip);
            const fwdDelta = (deadbandSkip * blendIn) + (normPct * effectiveDelta);
            targetThrottle = Math.round(1500 + fwdDelta);
          } else {
            targetThrottle = 1500;
          }
        } else {
          targetThrottle = 1500;
        }

        // C. BỘ LỌC DAMPING CHỐNG GIẬT C1-SMOOTH (EXPONENTIAL SPRING DAMPER)
        if (typeof state.rcSmoothThrottle === 'undefined') state.rcSmoothThrottle = 1500;
        const dampLambda = (targetThrottle === 1500) ? 10.0 : (targetThrottle < 1500 ? 8.5 : 9.0);
        state.rcSmoothThrottle = THREE.MathUtils.damp(state.rcSmoothThrottle, targetThrottle, dampLambda, dt);

        if (Math.abs(state.rcSmoothThrottle - 1500) < 2.0 && targetThrottle === 1500) {
          state.rcSmoothThrottle = 1500;
        }

        const steer = targetSteer;
        const throttle = Math.round(state.rcSmoothThrottle);

        if (state.swapSteerAndThrottle) {
          const gasNorm = (throttle - 1500) / 350.0;
          const escAnglePort12 = Math.round(90 - gasNorm * 45);
          const steerNorm = (steer - 90) / 45.0;
          const servoPulsePort13 = Math.round(1500 + steerNorm * 350);
          carControlPacket.steer = escAnglePort12;
          carControlPacket.throttle = servoPulsePort13;
          carControlPacket.steeringDeg = escAnglePort12;
          carControlPacket.escPulseUs = servoPulsePort13;
        } else {
          carControlPacket.steer = steer;
          carControlPacket.throttle = throttle;
          carControlPacket.steeringDeg = steer;
          carControlPacket.escPulseUs = throttle;
        }
        carControlPacket.gear = state.gearIndex === 1 ? 'R' : 'D';
        carControlPacket.steeringNorm = Number(((steer - 90) / 45.0).toFixed(4));
        carControlPacket.throttleNorm = Number(((throttle - 1500) / 350.0).toFixed(4));
        ctx.mpSocket.send(JSON.stringify(carControlPacket));

        // Phát Bridge State cho Quest 3 (Vô lăng GOG R808 HOẶC Bàn phím Laptop WASD / Mũi tên)
        const isKeyboardDriving = (wantGas || wantRev || keys.a || keys.d || keys.ArrowLeft || keys.ArrowRight);
        const hasWheel = (wheel && wheel.connected);
        if (hasWheel || isKeyboardDriving || Math.abs(steer - 90) > 1 || throttle !== 1500) {
          const steeringNorm = hasWheel ? (wheel.rawSteer || 0) : ((steer - 90) / 45.0);
          const steerAngleDeg = hasWheel ? (wheel.steerAngleDeg || 0) : (steeringNorm * 45.0);
          const throttleNorm = (throttle - 1500) / 350.0;
          const gasPct = hasWheel ? (wheel.gasPercent || 0) : Math.max(0, throttleNorm * 100);
          const revPct = hasWheel ? (wheel.reversePercent || 0) : (throttleNorm < 0 ? Math.abs(throttleNorm * 100) : 0);
          const brkPct = hasWheel ? (wheel.brakePercent || 0) : (isHardBraking ? 100 : 0);

          ctx.mpSocket.send(JSON.stringify({
            type: 'WHEEL_BRIDGE_INPUT',
            connected: true,
            deviceId: hasWheel ? (wheel.deviceName || 'GOG R808') : 'PC Keyboard (WASD)',
            steeringNorm,
            steerAngleDeg,
            gasPercent: gasPct,
            brakePercent: brkPct,
            reversePercent: revPct,
            gear: (state.gearIndex === 1 || revPct > 5) ? 'R' : 'D',
            steer,
            throttle
          }));
        }

        // Cập nhật nhãn thông số xung hiển thị trên Web HUD
        const dirLabel = throttle > 1520 ? '🟢 TIẾN' : (throttle < 1480 ? '🔴 LÙI' : '⚪ DỪNG');
        updateEsp32PulseInfo(`Lái: ${steer}° | Ga: ${throttle}µs [${dirLabel}]`);
      }
    }
  };
}

export function setupV260DashboardAndWheelBridge(ctx) {
  'use strict';
  const {
    THREE, VIRTUAL_APP_SPEED_SCALE, VIRTUAL_FORWARD_SPEED_MS, VIRTUAL_REVERSE_SPEED_MS,
    allTrafficVehicles, autoCenterBalancePassengerView, camera, chassisGroup, cityGroup, clock,
    cycleTurnSignals, formatInGameSpeedScale, getVirtualDrivingScale, openRealYouTubeApp,
    playSmartVehicleHornSound, playerAvatarGroup, rearCamCanvas, rearCamCtx, rearCamTex, renderer,
    roofBeaconGroup, scene, sidewalkNpcs, specializedInteriorGroup, state, steeringWheelPivot,
    toggleRearCamPiPModal, vehicleRoot, wsCtx, wsTex,
  } = ctx;

  if (typeof window !== 'undefined' && window.__V260_MASTER_ACTIVE__) return;
  if (typeof window !== 'undefined') window.__V260_MASTER_ACTIVE__ = true;

  // HỆ SỐ NHÂN TỐC ĐỘ XE ẢO TRÊN APP (Nhanh gấp 5 lần so với xe thật ngoài đời)

  // --------------------------------------------------------------------------
  // 25.1. NHẬN DIỆN THIẾT BỊ & PHÂN BỔ VAI TRÒ
  // --------------------------------------------------------------------------
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const isQuestHeadset = /Quest|OculusBrowser|Pacific/i.test(ua);
  const isMobilePhone = !isQuestHeadset && (
    (typeof window !== 'undefined' && window.__DETECTED_DEVICE_TYPE__ === 'MOBILE_PHONE') ||
    (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) && (typeof window !== 'undefined' && window.innerWidth < 1024))
  );
  const isLaptopAdmin = !isQuestHeadset && !isMobilePhone;

  // --------------------------------------------------------------------------
  // 25.2. CẤU HÌNH CAMERA ESP32 & GƯƠNG CHIẾU HẬU 3D
  // --------------------------------------------------------------------------
  const hwConfig = {
    frontCamIp: (typeof localStorage !== 'undefined' && localStorage.getItem('rc_front_cam_ip')) || '192.168.1.101',
    rearCamIp: (typeof localStorage !== 'undefined' && localStorage.getItem('rc_rear_cam_ip')) || '192.168.1.102',
    ctrlIp: (typeof localStorage !== 'undefined' && localStorage.getItem('rc_ctrl_ip')) || '192.168.1.100',
    frontConnected: false,
    rearConnected: false,
    useSnapshotFallbackFront: false,
    useSnapshotFallbackRear: false
  };

  // Khởi tạo nền gương chiếu hậu mặc định (Tránh hiện bảng đen khi chưa có tín hiệu Cam Lùi ESP32)
  function initRearMirrorDefaultBackdrop() {
    if (typeof rearCamCtx !== 'undefined' && rearCamCtx && typeof rearCamCanvas !== 'undefined' && rearCamCanvas) {
      const w = rearCamCanvas.width || 512;
      const h = rearCamCanvas.height || 256;
      const grad = rearCamCtx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d1828');
      grad.addColorStop(0.5, '#070d16');
      grad.addColorStop(1, '#020509');
      rearCamCtx.fillStyle = grad;
      rearCamCtx.fillRect(0, 0, w, h);

      // Viền gương & góc hiển thị
      rearCamCtx.strokeStyle = 'rgba(0, 255, 136, 0.45)';
      rearCamCtx.lineWidth = 3;
      rearCamCtx.strokeRect(6, 6, w - 12, h - 12);

      // Nhãn OSD
      rearCamCtx.fillStyle = 'rgba(0, 255, 136, 0.85)';
      rearCamCtx.font = 'bold 15px monospace';
      rearCamCtx.textAlign = 'center';
      rearCamCtx.fillText('🪞 GƯƠNG CHIẾU HẬU 3D | ESP32 CAM LÙI STANDBY', w / 2, 34);

      // Vạch căn khoảng cách lùi
      rearCamCtx.strokeStyle = 'rgba(255, 214, 10, 0.4)';
      rearCamCtx.lineWidth = 2;
      rearCamCtx.beginPath();
      rearCamCtx.moveTo(w * 0.22, h - 16);
      rearCamCtx.lineTo(w * 0.35, h * 0.62);
      rearCamCtx.lineTo(w * 0.65, h * 0.62);
      rearCamCtx.lineTo(w * 0.78, h - 16);
      rearCamCtx.stroke();

      if (typeof rearCamTex !== 'undefined' && rearCamTex) {
        rearCamTex.needsUpdate = true;
      }
    }
  }

  // ESP32-CAM Relay qua WebSocket cho Kính Meta Quest 3 (Vượt chặn Mixed Content HTTPS)
  if (typeof window !== 'undefined') {
    window.__questRelayImg = new Image();
    window.__questRelayImg.crossOrigin = 'anonymous';
    window.__questRelayImg.onload = () => {
      if (state.windshieldCamEnabled && state.windshieldMode === 'ESP32_LIVE') {
        wsCtx.drawImage(window.__questRelayImg, 0, 0, 1024, 512);
        wsTex.needsUpdate = true;
      }
      if (typeof rearCamCtx !== 'undefined' && rearCamCtx && typeof rearCamTex !== 'undefined' && rearCamTex) {
        rearCamCtx.drawImage(window.__questRelayImg, 0, 0, 512, 256);
        rearCamTex.needsUpdate = true;
      }
      if (typeof state !== 'undefined' && state) {
        state.esp32Connected = true;
      }
    };
  }

  function connectBothEsp32CamerasAndController() {
    if (typeof document === 'undefined') return;
    const inFront = document.getElementById('v250-ip-front');
    const inRear = document.getElementById('v250-ip-rear');
    const inCtrl = document.getElementById('v250-ip-ctrl');
    const frontHudIp = (inFront ? inFront.value : localStorage.getItem('rc_front_cam_ip'))?.trim();
    const rearHudIp = (inRear ? inRear.value : localStorage.getItem('rc_rear_cam_ip'))?.trim();

    if (inFront && inFront.value && inFront.value.trim()) hwConfig.frontCamIp = inFront.value.trim();
    if (inRear && inRear.value && inRear.value.trim()) hwConfig.rearCamIp = inRear.value.trim();
    if (inCtrl && inCtrl.value && inCtrl.value.trim()) hwConfig.ctrlIp = inCtrl.value.trim();

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rc_front_cam_ip', hwConfig.frontCamIp);
      localStorage.setItem('rc_rear_cam_ip', hwConfig.rearCamIp);
      localStorage.setItem('rc_ctrl_ip', hwConfig.ctrlIp);
    }

    if (typeof fetch !== 'undefined') {
      fetch('/api/esp32-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontCamIp: hwConfig.frontCamIp,
          rearCamIp: hwConfig.rearCamIp,
          ctrlIp: hwConfig.ctrlIp
        })
      }).catch(() => {});
    }

    const hud = document.getElementById('v250-dual-cam-hud');
    const hudVisible = hud && hud.getClientRects().length > 0 && getComputedStyle(hud).visibility === 'visible';
    const frontImg = document.getElementById('v250-front-cam-img');
    const rearImg = document.getElementById('v250-rear-cam-img');
    if (hudVisible && frontImg && frontHudIp) {
      frontImg.src = '/api/esp32-proxy?url=' + encodeURIComponent('http://' + frontHudIp + ':81/stream');
    }
    if (hudVisible && rearImg && rearHudIp) {
      rearImg.src = '/api/esp32-proxy?url=' + encodeURIComponent('http://' + rearHudIp + ':81/stream');
    }
  }

  // --------------------------------------------------------------------------
  // 25.3. PHÁT LỆNH ĐIỀU KHIỂN XUỐNG ESP32 RC CAR (UDP 4210) — GIỮ NGUYÊN 1X AN TOÀN
  // --------------------------------------------------------------------------
  let lastEsp32SendTime = 0;
  let lastSentThrottle = 0;
  let lastSentSteer = 0;

  function sendHardwareControlToEsp32(throttlePwm, steerPercent, gearStr, brakeFlag, sourceName) {
    // ĐỘC LẬP HOÀN TOÀN: Xung phát ra phần cứng xe RC thật luôn nằm trong dải [-255, 255] an toàn
    const payload = {
      throttle: Math.max(-255, Math.min(255, Math.round(throttlePwm))),
      steering: Math.max(-100, Math.min(100, Math.round(steerPercent))),
      gear: gearStr || (throttlePwm < -5 ? 'R' : 'D'),
      brake: brakeFlag ? 1 : 0,
      lights: Boolean(typeof state !== 'undefined' && state && state.headlightsOn),
      horn: Boolean(typeof state !== 'undefined' && state && state.hornActive),
      activeCam: throttlePwm < -5 ? 'rear' : 'front',
      weatherMode: (typeof state !== 'undefined' && state && state.weatherMode) || 'night',
      inputSource: sourceName || 'APP'
    };

    if (typeof fetch !== 'undefined') {
      fetch('/api/rc-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    }

    if (typeof document !== 'undefined') {
      const statusBar = document.getElementById('v250-hw-telemetry-bar');
      if (statusBar) {
        statusBar.textContent = `🎮 Đầu vào: ${payload.inputSource} | ⚡ Ga ESP32: ${payload.throttle} | 🛞 Lái: ${payload.steering}% | Số: ${payload.gear}`;
      }
    }
  }

  setupV260WheelBridge({ THREE, state, isLaptopAdmin, getMpSocket: () => ctx.mpSocket });

  // --------------------------------------------------------------------------
  // 25.5. BỘ ĐỌC TRỘN ĐA THIẾT BỊ: GOG R808 + TAY CẦM TOUCH META QUEST 3
  //       + PHÂN QUYỀN ĐỘC QUYỀN GHẾ TÀI XẾ (CHỐNG CƯỚP LÁI TỪ KÍNH 2 / MOBILE)
  // --------------------------------------------------------------------------
  let smoothedSteerInput = 0;
  let smoothedThrottleInput = 0;
  let lastTouchSeatSwapTime = 0;
  let lastEnterExitTime = 0;
  let lastRecenterTime = 0;
  let lastHornTime = 0;
  let lastCarSyncTime = 0;

  function applyDeadzone(val, dz = 0.08) {
    if (Math.abs(val) < dz) return 0;
    return Math.sign(val) * ((Math.abs(val) - dz) / (1 - dz));
  }

  function pollAllGamepadsWheelGog808AndThumbsticks(dt) {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    let rawSteer = 0;
    let rawThrottle = 0;
    let isBraking = false;
    let activeDeviceName = '';
    let isBridgeWheelActive = false;

    // ------------------------------------------------------------------------
    // KIỂM TRA PHÂN QUYỀN LÁI XE: CHỈ TÀI XẾ (SEAT 0) HOẶC LAPTOP ADMIN MỚI ĐƯỢC LÁI!
    // ------------------------------------------------------------------------
    const isDriver = (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING' && (state.seatIndex === 0 || state.isHostPlayer === true));
    const isLaptopLocalAdmin = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
    const canDrive = isDriver || (isLaptopLocalAdmin && typeof state !== 'undefined' && state && state.playerMode === 'DRIVING');

    // 0. Quét cầu nối Vô lăng GOG 808 từ WebSocket (Laptop sang Meta Quest 3)
    if (typeof window !== 'undefined' && window._racingWheel && window._racingWheel.connected) {
      const rw = window._racingWheel;
      // Nới rộng cửa sổ tươi mới lên 850ms để chống rớt gói khi mạng Wi-Fi chập chờn
      const isFresh = (now - (rw.lastInputTime || 0)) < 850;
      if (isFresh) {
        const bridgeSteer = (typeof rw.rawSteer === 'number') ? rw.rawSteer : (rw.steerAngleDeg ? rw.steerAngleDeg / 540 : 0);
        let bridgeThrottle = (rw.gasPercent > 0) ? (rw.gasPercent / 100) : (rw.reversePercent > 0 ? -(rw.reversePercent / 100) : 0);
        const curSpd = (typeof state !== 'undefined' && state) ? (state.velocityMs || 0) : 0;

        if (rw.brakePercent > 8) {
          isBraking = true;
          if (Math.abs(curSpd) > 0.15 || rw.gasPercent > 8) {
            bridgeThrottle = 0;
          }
        }

        if (Math.abs(bridgeSteer) > 0.02 || Math.abs(bridgeThrottle) > 0.02 || isBraking) {
          isBridgeWheelActive = true;
          rawSteer = bridgeSteer;
          rawThrottle = bridgeThrottle;
          activeDeviceName = rw.deviceName || 'Vô lăng GOG808 (Cầu nối)';
        }
      }
    }

    // 1. Quét Gamepad cắm trực tiếp vào thiết bị hiện tại (nếu ở Laptop)
    const gamepads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp || !gp.connected) continue;
      const idLower = (gp.id || '').toLowerCase();
      if (/quest|oculus|touch|openxr|hands/i.test(idLower)) continue;

      const isWheelGog808 = /808|gog|wheel|steering|g29|g920|thrustmaster|racing/i.test(idLower) || gp.mapping === '';
      const ax0 = applyDeadzone(gp.axes[0] || 0, 0.04);
      if (Math.abs(ax0) > Math.abs(rawSteer)) {
        rawSteer = ax0;
        activeDeviceName = isWheelGog808 ? 'Vô lăng GOG808' : 'Gamepad';
      }

      const r2Val = gp.buttons[7] ? gp.buttons[7].value : 0;
      const l2Val = gp.buttons[6] ? gp.buttons[6].value : 0;
      const curSpd = (typeof state !== 'undefined' && state) ? (state.velocityMs || 0) : 0;

      if (l2Val > 0.04) {
        isBraking = true;
        if (Math.abs(curSpd) > 0.15 || r2Val > 0.04) {
          rawThrottle = 0;
        } else {
          rawThrottle = -l2Val;
        }
        activeDeviceName = isWheelGog808 ? 'Bàn đạp GOG808' : 'Triggers';
      } else if (r2Val > 0.04) {
        rawThrottle = r2Val;
        activeDeviceName = isWheelGog808 ? 'Bàn đạp GOG808' : 'Triggers';
      }
      if (gp.buttons[2]?.pressed) isBraking = true;
    }

    // 2. Quét Tay Cầm Meta Quest Touch trong WebXR
    if (typeof renderer !== 'undefined' && renderer && renderer.xr && renderer.xr.isPresenting) {
      const session = renderer.xr.getSession();
      if (session && session.inputSources) {
        for (const src of session.inputSources) {
          if (!src.gamepad) continue;
          const axes = src.gamepad.axes || [];
          const btns = src.gamepad.buttons || [];

          const tx = applyDeadzone(axes.length >= 4 ? axes[2] : (axes[0] || 0), 0.08);
          const ty = -applyDeadzone(axes.length >= 4 ? axes[3] : (axes[1] || 0), 0.08);
          const trigVal = btns[0] ? btns[0].value : 0;
          const gripVal = btns[1] ? btns[1].value : 0;

          // NẾU LÀ HÀNH KHÁCH (KÍNH 2 HOẶC GHẾ PHỤ):
          // Cần gạt thumbstick dùng để XOAY ĐẦU QUAN SÁT 360° TRONG CABIN, TUYỆT ĐỐI KHÔNG LÁI XE!
          if (!canDrive) {
            if (typeof state !== 'undefined' && state) {
              if (Math.abs(tx) > 0.12) {
                state.eyeLookYaw = (state.eyeLookYaw || 0) + tx * 1.6 * dt;
              }
              if (Math.abs(ty) > 0.12) {
                state.eyeLookPitch = THREE.MathUtils.clamp((state.eyeLookPitch || 0) - ty * 1.2 * dt, -0.85, 0.85);
              }
            }
          } else {
            // NẾU LÀ TÀI XẾ HỢP LỆ (SEAT 0):
            const isTouchIntentionallyUsed = Math.abs(tx) > 0.15 || Math.abs(ty) > 0.15 || trigVal > 0.18;
            if (!isBridgeWheelActive || isTouchIntentionallyUsed) {
              if (Math.abs(tx) > Math.abs(rawSteer)) {
                rawSteer = tx;
                activeDeviceName = `Quest 3 Touch (${src.handedness})`;
              }
              if (Math.abs(ty) > Math.abs(rawThrottle)) {
                rawThrottle = ty;
                activeDeviceName = `Quest 3 Touch (${src.handedness})`;
              }
              if (trigVal > 0.12 && src.handedness === 'right' && trigVal > rawThrottle) {
                rawThrottle = trigVal;
                activeDeviceName = 'Quest 3 Trigger';
              }
              if (trigVal > 0.12 && src.handedness === 'left' && -trigVal < rawThrottle) {
                rawThrottle = -trigVal;
                activeDeviceName = 'Quest 3 Reverse Trigger';
              }
              if (gripVal > 0.5) isBraking = true;
            }
          }

          // Nút bấm trên tay cầm Touch
          const isLeftHand = (src.handedness === 'left');
          const isRightHand = (src.handedness === 'right');

          // Nút X (Tay trái): Lên/Xuống xe
          if (isLeftHand && btns[4]?.pressed && (now - lastEnterExitTime > 500)) {
            lastEnterExitTime = now;
            if (typeof window.enterOrExitCarWithBlink === 'function') window.enterOrExitCarWithBlink();
            else if (typeof toggleEnterExitVehicle === 'function') toggleEnterExitVehicle();
          }

          // Nút Y (Tay trái): Đổi ghế ngồi giữa các ghế phụ (1, 2, 3)
          if (isLeftHand && btns[5]?.pressed && (now - lastTouchSeatSwapTime > 400)) {
            lastTouchSeatSwapTime = now;
            if (typeof window.swapSeatOrTakeDriverControl === 'function') window.swapSeatOrTakeDriverControl();
            else if (typeof cycleCabinSeatPosition === 'function') cycleCabinSeatPosition();
          }

          // Nút B (Tay phải): Cân bằng tâm góc nhìn
          if (isRightHand && btns[5]?.pressed && (now - lastRecenterTime > 300)) {
            lastRecenterTime = now;
            if (typeof state !== 'undefined' && state) {
              state.eyeLookYaw = 0;
              state.eyeLookPitch = 0;
            }
            if (typeof autoCenterBalancePassengerView === 'function') autoCenterBalancePassengerView();
          }

          // Nút A (Tay phải): Còi xe
          if (isRightHand && btns[4]?.pressed && (now - lastHornTime > 350)) {
            lastHornTime = now;
            if (typeof playSmartVehicleHornSound === 'function') playSmartVehicleHornSound('CAR');
            else if (typeof playHonkSound === 'function') playHonkSound();
          }
        }
      }
    }

    // NẾU NGƯỜI CHƠI KHÔNG CÓ QUYỀN LÁI (KHÁCH GHẾ PHỤ / KÍNH 2):
    // Khóa hoàn toàn ga/lái về 0 và bỏ qua bước tính vật lý xe / CAR_SYNC / ESP32!
    if (!canDrive) {
      smoothedSteerInput = 0;
      smoothedThrottleInput = 0;
      return;
    }

    // Nội suy mượt mà tín hiệu điều khiển của Tài Xế
    const hasActiveInput = Math.abs(rawSteer) > 0.015 || Math.abs(rawThrottle) > 0.015 || isBraking;
    smoothedSteerInput = THREE.MathUtils.lerp(smoothedSteerInput, rawSteer, Math.min(1, dt * 14));
    smoothedThrottleInput = THREE.MathUtils.lerp(smoothedThrottleInput, rawThrottle, Math.min(1, dt * 10));

    // ------------------------------------------------------------------------
    // VẬT LÝ XE: TÍCH PHÂN VẬN TỐC, RẼ MƯỢT & NHÂN TỐC ĐỘ 5X TRÊN APP
    // ------------------------------------------------------------------------
    if (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING') {
      const virtualSpeedScale = VIRTUAL_APP_SPEED_SCALE * getVirtualDrivingScale();
      if (hasActiveInput) {
        state.engineRunning = true;
        const curvedSteer = Math.sign(smoothedSteerInput) * Math.pow(Math.abs(smoothedSteerInput), 1.25);

        if (isBraking) {
          const decelAlpha = THREE.MathUtils.clamp(dt * 8.5, 0, 1.0);
          state.velocityMs = THREE.MathUtils.lerp(state.velocityMs || 0, 0, decelAlpha);
          if (Math.abs(state.velocityMs) < 0.06) {
            state.velocityMs = 0;
          }
        } else {
          const maxSpeedMs = smoothedThrottleInput < 0 ? VIRTUAL_REVERSE_SPEED_MS : VIRTUAL_FORWARD_SPEED_MS;
          const targetVel = smoothedThrottleInput * maxSpeedMs;
          const accelAlpha = THREE.MathUtils.clamp(dt * 3.4, 0, 1.0);
          state.velocityMs = THREE.MathUtils.lerp(state.velocityMs || 0, targetVel, accelAlpha);
        }

        state.speedKmh = Math.abs(state.velocityMs || 0) * 3.6 * virtualSpeedScale;

        // Rẽ lái tự nhiên theo vận tốc
        const turnDirection = state.velocityMs >= -0.05 ? 1 : -1;
        const speedFactor = Math.max(0.35, Math.min(1.25, Math.abs(state.velocityMs) / 7.0));
        const yawDelta = -curvedSteer * 1.90 * speedFactor * turnDirection * dt;
        state.headingRad += yawDelta;

        if (typeof vehicleRoot !== 'undefined' && vehicleRoot && !window.__UNIFIED_VEHICLE_CONTROL_ACTIVE__) {
          vehicleRoot.rotation.y = state.headingRad;
          const step = (state.velocityMs || 0) * virtualSpeedScale * dt;
          vehicleRoot.position.x -= Math.sin(state.headingRad) * step;
          vehicleRoot.position.z -= Math.cos(state.headingRad) * step;
        }

        if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
          steeringWheelPivot.rotation.z = -curvedSteer * 1.35;
        }
        if (typeof state.wheelRotationRad === 'number') {
          state.wheelRotationRad += (((state.velocityMs || 0) * virtualSpeedScale * dt) / 0.38);
        }
      } else {
        // Nhả bàn đạp -> Giảm tốc tự nhiên theo quán tính và DỪNG YÊN TẠI VỊ TRÍ MỚI
        if (Math.abs(state.velocityMs || 0) > 0.03) {
          state.velocityMs *= Math.pow(0.22, dt);
          state.speedKmh = Math.abs(state.velocityMs || 0) * 3.6 * virtualSpeedScale;
          const step = (state.velocityMs || 0) * virtualSpeedScale * dt;
          if (typeof vehicleRoot !== 'undefined' && vehicleRoot) {
            vehicleRoot.position.x -= Math.sin(state.headingRad) * step;
            vehicleRoot.position.z -= Math.cos(state.headingRad) * step;
          }
          if (typeof state.wheelRotationRad === 'number') {
            state.wheelRotationRad += (step / 0.38);
          }
        } else {
          state.velocityMs = 0;
          state.speedKmh = 0;
        }
      }

      // Phát CAR_SYNC ở tần số 20Hz để đồng bộ vị trí xe sang Kính Quest / Điện thoại / Server
      if (now - lastCarSyncTime >= 50 && typeof vehicleRoot !== 'undefined' && vehicleRoot) {
        lastCarSyncTime = now;
        if (typeof ctx.mpSocket !== 'undefined' && ctx.mpSocket && ctx.mpSocket.readyState === WebSocket.OPEN) {
          ctx.mpSocket.send(JSON.stringify({
            type: 'CAR_SYNC',
            carId: state.activeCarId || 'car_host',
            x: Number(vehicleRoot.position.x.toFixed(3)),
            z: Number(vehicleRoot.position.z.toFixed(3)),
            heading: Number(state.headingRad.toFixed(4)),
            speedKmh: Number(state.speedKmh.toFixed(1)),
            steerDeg: Number((state.steeringAngleDeg || 0).toFixed(1))
          }));
        }
      }
    }

    // Gửi lệnh điều khiển phần cứng xuống ESP32 ngoài đời (40ms ~ 25Hz) — GIỮ NGUYÊN 1X AN TOÀN
    if (now - lastEsp32SendTime >= 40) {
      let outThrottlePwm = 0;
      let outSteerPercent = 0;
      if (hasActiveInput) {
        outThrottlePwm = isBraking ? 0 : Math.round(smoothedThrottleInput * 255);
        outSteerPercent = Math.round(smoothedSteerInput * 100);
      }
      const changedEnough =
        Math.abs(outThrottlePwm - lastSentThrottle) >= 2 ||
        Math.abs(outSteerPercent - lastSentSteer) >= 2 ||
        (outThrottlePwm === 0 && lastSentThrottle !== 0);

      if (changedEnough) {
        lastEsp32SendTime = now;
        lastSentThrottle = outThrottlePwm;
        lastSentSteer = outSteerPercent;
        const gearMode = outThrottlePwm < -5 ? 'R' : (outThrottlePwm > 5 ? 'D' : 'N');
        sendHardwareControlToEsp32(outThrottlePwm, outSteerPercent, gearMode, isBraking, activeDeviceName || 'APP');
      }
    }
  }

  // --------------------------------------------------------------------------
  // 25.6. BẢN ĐIỆN THOẠI: TỐI ƯU KHÔNG GIAN, VUỐT LƯỚT 360° & XOAY LẮC GYROSCOPE
  // --------------------------------------------------------------------------
  if (isMobilePhone && typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const funcPanel = document.getElementById('function-panel');
      if (funcPanel) funcPanel.classList.add('mobile-compact-hidden');
      const camHud = document.getElementById('v250-dual-cam-hud');
      if (camHud) camHud.style.display = 'none';
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let isTouching = false;

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1 && !e.target.closest('button, input, select, #liquid-gear-widget-container')) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isTouching = true;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isTouching || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      touchStartX = t.clientX;
      touchStartY = t.clientY;

      if (typeof state !== 'undefined' && state) {
        state.eyeLookYaw = (state.eyeLookYaw || 0) - dx * 0.006;
        state.eyeLookPitch = THREE.MathUtils.clamp((state.eyeLookPitch || 0) - dy * 0.006, -1.0, 1.0);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isTouching = false;
    }, { passive: true });

    let initialBeta = null;
    let initialGamma = null;

    window.addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      if (initialBeta === null) {
        initialBeta = e.beta;
        initialGamma = e.gamma;
      }
      const dGamma = (e.gamma - initialGamma);
      const dBeta = (e.beta - initialBeta);
      if (typeof state !== 'undefined' && state && !isTouching) {
        state.eyeLookYaw = THREE.MathUtils.degToRad(-dGamma * 0.75);
        state.eyeLookPitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(-dBeta * 0.5, -45, 45));
      }
    });
  }

  // --------------------------------------------------------------------------
  // 25.7. CHUẨN HÓA NỘI THẤT 3D & 3 MÀN HÌNH YOUTUBE (Z = 0.48M, DIRTY-CHECK 24FPS)
  // --------------------------------------------------------------------------
  function alignSteeringWheelAndCleanShaftOnly() {
    if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
      steeringWheelPivot.position.set(-0.41, 0.72, -0.42);
      steeringWheelPivot.rotation.x = THREE.MathUtils.degToRad(-20);
      steeringWheelPivot.visible = true;
    }

    if (typeof chassisGroup === 'undefined' || !chassisGroup) return;

    chassisGroup.traverse((obj) => {
      if (!obj) return;
      if (obj.isMesh) {
        // Chỉ ẩn đúng ống hình trụ dư thừa của trục lái cũ
        if (obj.geometry && obj.geometry.type === 'CylinderGeometry' && obj.parent !== steeringWheelPivot) {
          const p = obj.geometry.parameters || {};
          if (p.radiusTop < 0.065 && p.height > 0.25 &&
              Math.abs(obj.position.x - (-0.38)) < 0.14 &&
              obj.position.y > 0.42 && obj.position.y < 1.05 &&
              obj.position.z < -0.32 && obj.position.z > -0.78) {
            obj.visible = false;
          }
        }
      }
      // Ẩn tuyệt đối mọi bảng tên / notice / speech bubble lơ lửng trong cabin xe chắn tầm nhìn kính hậu và kính chắn gió
      if (obj.isSprite || (obj.material && obj.material.isSpriteMaterial)) {
        if (obj.position.y > 0.8 && obj.position.z < 0.6) {
          obj.visible = false;
        }
      }
    });

    if (typeof specializedInteriorGroup !== 'undefined' && specializedInteriorGroup) {
      specializedInteriorGroup.traverse((obj) => {
        if (obj && (obj.isSprite || (obj.material && obj.material.isSpriteMaterial))) {
          obj.visible = false;
        }
      });
    }

    if (typeof roofBeaconGroup !== 'undefined' && roofBeaconGroup && typeof state !== 'undefined' && state && state.playerMode === 'DRIVING') {
      roofBeaconGroup.visible = false;
    }
  }

  const ytCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (ytCanvas) {
    ytCanvas.width = 640;
    ytCanvas.height = 360;
  }
  const ytCtx = ytCanvas ? ytCanvas.getContext('2d') : null;
  const ytTex = ytCanvas ? new THREE.CanvasTexture(ytCanvas) : null;
  if (ytTex && THREE.SRGBColorSpace) ytTex.colorSpace = THREE.SRGBColorSpace;
  let ytCanvasDirty = true;
  let frameCounter = 0;

  function setupSyncedThreeYouTubeScreens() {
    const carGroup = (typeof chassisGroup !== 'undefined' && chassisGroup)
      ? chassisGroup
      : (typeof vehicleRoot !== 'undefined' ? vehicleRoot : null);
    if (!carGroup || carGroup.userData.v260ScreensMounted) return;
    carGroup.userData.v260ScreensMounted = true;

    // Gắn màn hình táp-lô phía trước
    carGroup.traverse((obj) => {
      if (obj && obj.isMesh && obj.geometry?.type === 'PlaneGeometry' &&
          obj.position.z < -0.15 && obj.position.y > 0.55 && obj.position.y < 0.96) {
        obj.material = new THREE.MeshBasicMaterial({ map: ytTex, side: THREE.DoubleSide });
      }
    });

    // Gắn 2 màn hình ghế phụ hàng sau tại z = 0.48m (Nổi hoàn toàn trên đệm ghế trước 0.38m)
    const rearConfigs = [
      { name: 'RearLeftYtV260', x: -0.41, y: 0.88, z: 0.48 },
      { name: 'RearRightYtV260', x: 0.41, y: 0.88, z: 0.48 }
    ];

    rearConfigs.forEach((cfg) => {
      const mount = new THREE.Group();
      mount.name = cfg.name;
      mount.position.set(cfg.x, cfg.y, cfg.z);
      mount.rotation.x = THREE.MathUtils.degToRad(-5);

      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.20, 0.014),
        new THREE.MeshStandardMaterial({ color: 0x101726, roughness: 0.25, metalness: 0.85 })
      );
      mount.add(bezel);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.18),
        new THREE.MeshBasicMaterial({ map: ytTex, side: THREE.DoubleSide })
      );
      screen.position.z = 0.009;
      mount.add(screen);
      carGroup.add(mount);
    });
  }

  function updateSyncedYouTubeCanvas() {
    if (!ytCtx) return;
    const vid = document.getElementById('yt-direct-mp4-view') || document.getElementById('yt-html5-player');
    const isPlaying = Boolean(vid && !vid.paused && vid.readyState >= 2);

    if (!isPlaying && !ytCanvasDirty) return;
    ytCanvasDirty = false;

    ytCtx.fillStyle = '#070b14';
    ytCtx.fillRect(0, 0, 640, 360);

    if (isPlaying) {
      try {
        ytCtx.drawImage(vid, 0, 36, 640, 284);
      } catch (e) {}
    }

    // Thanh Header
    ytCtx.fillStyle = 'rgba(9, 14, 26, 0.88)';
    ytCtx.fillRect(0, 0, 640, 36);
    ytCtx.fillStyle = '#ff0033';
    ytCtx.fillRect(10, 6, 88, 24);
    ytCtx.fillStyle = '#ffffff';
    ytCtx.font = 'bold 13.5px sans-serif';
    ytCtx.fillText('▶ YouTube', 16, 23);

    // Tiêu đề video
    ytCtx.fillStyle = '#e2e8f0';
    ytCtx.font = '13px sans-serif';
    const titleText = (typeof state !== 'undefined' && state.nowPlayingTitle) ? state.nowPlayingTitle : 'YouTube Đa Màn Hình Buồng Lái Rolls-Royce';
    ytCtx.fillText(titleText.slice(0, 52), 108, 23);

    // Thanh Footer
    ytCtx.fillStyle = 'rgba(9, 14, 26, 0.92)';
    ytCtx.fillRect(0, 320, 640, 40);
    ytCtx.fillStyle = '#00ff88';
    ytCtx.font = 'bold 12.5px monospace';
    const curTime = (vid && vid.currentTime) ? Number(vid.currentTime).toFixed(1) : '0.0';
    const durTime = (vid && vid.duration && Number.isFinite(vid.duration)) ? Number(vid.duration).toFixed(1) : 'LIVE';
    ytCtx.fillText(`▶ ${isPlaying ? 'ĐANG PHÁT' : 'TẠM DỪNG'}: ${curTime}s / ${durTime}s | ĐỒNG BỘ 3 MÀN HÌNH`, 14, 345);

    if (ytTex) ytTex.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // 25.8. ĐỒNG BỘ 1 CHIỀU RA LIQUID GEAR WIDGET & ROLE SEAT BADGE
  // --------------------------------------------------------------------------
  function updateRoleSeatBadge() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('v260-role-seat-badge');
    if (!badge) return;

    const isDriver = (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING' && (state.seatIndex === 0 || state.isHostPlayer === true));
    const isDrivingMode = (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING');
    const seat = (typeof state !== 'undefined' && state.seatIndex !== undefined) ? state.seatIndex : 0;

    let deviceTag = isQuestHeadset ? '🥽 Quest 3' : (isMobilePhone ? '📱 Mobile' : '💻 Laptop Admin');

    if (!isDrivingMode) {
      badge.textContent = `${deviceTag} | 🚶 ĐI BỘ TỰ DO`;
      badge.className = 'v260-role-badge role-foot';
    } else if (isDriver) {
      badge.textContent = `${deviceTag} | 🚗 TÀI XẾ (GHẾ 0) — ĐIỀU KHIỂN CHÍNH [${formatInGameSpeedScale(state.inGameSpeedScale)} ÊM]`;
      badge.className = 'v260-role-badge role-driver';
    } else {
      const seatNames = ['Tài Xế', 'Ghế Phụ Trước', 'Ghế Sau Trái', 'Ghế Sau Phải'];
      badge.textContent = `${deviceTag} | 🛋️ HÀNH KHÁCH (${seatNames[seat] || 'Ghế Phụ ' + seat}) — QUAN SÁT 360°`;
      badge.className = 'v260-role-badge role-passenger';
    }
  }

  function syncLiquidGearWidget() {
    if (typeof document === 'undefined') return;
    const sig = (typeof state !== 'undefined' && state.turnSignal) ? state.turnSignal : 'OFF';
    const isHead = Boolean(typeof state !== 'undefined' && state.headlightsOn);
    const seat = (typeof state !== 'undefined' && state.seatIndex !== undefined) ? state.seatIndex : 0;

    const setItem = (cmd, active, badgeText) => {
      const btn = document.querySelector(`[data-liquid-cmd="${cmd}"]`);
      if (!btn) return;
      btn.classList.toggle('active-true', Boolean(active));
      const badge = btn.querySelector('.liquid-badge');
      if (badge && badgeText !== undefined) badge.textContent = badgeText;
    };

    setItem('TOGGLE_HEADLIGHT', isHead, isHead ? 'BẬT' : 'TẮT');
    setItem('TURN_LEFT', sig === 'LEFT', sig === 'LEFT' ? 'ĐANG CHỚP' : 'TẮT');
    setItem('TURN_RIGHT', sig === 'RIGHT', sig === 'RIGHT' ? 'ĐANG CHỚP' : 'TẮT');
    setItem('SWAP_SEAT', true, `GHẾ ${seat + 1}`);
  }

  function bindLiquidGearEvents() {
    if (typeof document === 'undefined') return;
    const trigger = document.getElementById('liquid-gear-trigger-btn');
    const menu = document.getElementById('liquid-gear-menu-list');
    if (trigger && menu && !trigger.getAttribute('data-bound')) {
      trigger.setAttribute('data-bound', 'true');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.classList.toggle('liquid-expanded');
        trigger.classList.toggle('liquid-open', open);
      });

      menu.querySelectorAll('.liquid-item-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cmd = btn.getAttribute('data-liquid-cmd');
          switch (cmd) {
            case 'DRIVE_RR':
            case 'DRIVE_COUPE':
            case 'DRIVE_MOTO': {
              const k = cmd === 'DRIVE_RR' ? '4' : (cmd === 'DRIVE_COUPE' ? '5' : '6');
              window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
              break;
            }
            case 'SWAP_SEAT':
              if (typeof window.swapSeatOrTakeDriverControl === 'function') window.swapSeatOrTakeDriverControl();
              else if (typeof cycleCabinSeatPosition === 'function') cycleCabinSeatPosition();
              break;
            case 'TOGGLE_HEADLIGHT':
              if (typeof toggleHeadlights === 'function') toggleHeadlights();
              break;
            case 'TURN_LEFT':
              if (typeof cycleTurnSignals === 'function') cycleTurnSignals('LEFT');
              else if (typeof toggleTurnSignal === 'function') toggleTurnSignal('LEFT');
              break;
            case 'TURN_RIGHT':
              if (typeof cycleTurnSignals === 'function') cycleTurnSignals('RIGHT');
              else if (typeof toggleTurnSignal === 'function') toggleTurnSignal('RIGHT');
              break;
            case 'GARAGE_DOOR':
              if (typeof window.toggleRollingShutterWithAudio === 'function') window.toggleRollingShutterWithAudio();
              break;
            case 'OPEN_YOUTUBE':
              if (typeof openRealYouTubeApp === 'function') openRealYouTubeApp();
              break;
            case 'TOGGLE_REARCAM':
              if (typeof toggleRearCamPiPModal === 'function') toggleRearCamPiPModal();
              break;
            case 'CALL_AMBULANCE':
              if (typeof spawnEmergencyAmbulanceConvoy === 'function') spawnEmergencyAmbulanceConvoy();
              break;
            case 'TOGGLE_ALL_NPCS':
              if (typeof toggleAllWorldCharactersAndVehicles === 'function') toggleAllWorldCharactersAndVehicles();
              break;
          }
          syncLiquidGearWidget();
        });
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#liquid-gear-widget-container')) {
          menu.classList.remove('liquid-expanded');
          trigger.classList.remove('liquid-open');
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // 25.9. VẬT LÝ TÔNG HẤT TUNG / HẤT VĂNG NPC & THÚ CƯNG (RAGDOLL LAUNCH)
  // --------------------------------------------------------------------------
  const ragdollLaunchedEntities = new Set();
  let cachedHitTargets = [];
  let lastTargetScanTime = 0;
  const _carWorldPos = new THREE.Vector3();
  const _targetWorldPos = new THREE.Vector3();

  function collectAllPedestriansAndPetsInScene() {
    const targets = new Set();
    if (typeof sidewalkNpcs !== 'undefined' && Array.isArray(sidewalkNpcs)) {
      sidewalkNpcs.forEach((npc) => { if (npc) targets.add(npc); });
    }
    if (typeof scene !== 'undefined' && scene && scene.children) {
      scene.children.forEach((obj) => {
        if (!obj || !obj.isGroup) return;
        if (typeof vehicleRoot !== 'undefined' && obj === vehicleRoot) return;
        if (typeof playerAvatarGroup !== 'undefined' && obj === playerAvatarGroup) return;
        if (typeof cityGroup !== 'undefined' && obj === cityGroup) return;
        if (typeof allTrafficVehicles !== 'undefined' && Array.isArray(allTrafficVehicles) && allTrafficVehicles.includes(obj)) return;

        const ud = obj.userData || {};
        const isPedOrPet = ud.isPedestrian || ud.isPet || ud.isDog || ud.walkSpeed !== undefined || /npc|dog|pet|child|walker/i.test(obj.name || '');
        if (isPedOrPet) targets.add(obj);
      });
    }
    return Array.from(targets);
  }

  function updateUniversalNpcAndPetRagdollCollisions(dt, elapsed) {
    if (typeof state === 'undefined' || !state || typeof vehicleRoot === 'undefined' || !vehicleRoot) return;

    if (elapsed - lastTargetScanTime > 2.0 || cachedHitTargets.length === 0) {
      cachedHitTargets = collectAllPedestriansAndPetsInScene();
      lastTargetScanTime = elapsed;
    }

    vehicleRoot.getWorldPosition(_carWorldPos);
    const carSpeedAbs = Math.abs(state.velocityMs || 0);
    const isMovingFast = state.playerMode === 'DRIVING' && carSpeedAbs > 1.2;

    if (isMovingFast) {
      const hitRadius = 2.65;
      for (let i = 0; i < cachedHitTargets.length; i++) {
        const entity = cachedHitTargets[i];
        if (!entity || !entity.visible) continue;
        const ud = entity.userData || (entity.userData = {});
        if (ud.ragdollActive && ud.ragdollTimer > 2.0) continue;

        entity.getWorldPosition(_targetWorldPos);
        const distSq = _carWorldPos.distanceToSquared(_targetWorldPos);

        if (distSq < hitRadius * hitRadius) {
          const impactSpeed = Math.max(carSpeedAbs * VIRTUAL_APP_SPEED_SCALE, 10.0);
          const fwdX = -Math.sin(state.headingRad || 0) * Math.sign(state.velocityMs || 1);
          const fwdZ = -Math.cos(state.headingRad || 0) * Math.sign(state.velocityMs || 1);

          ud.ragdollActive = true;
          ud.ragdollTimer = 0;
          ud.ragdollVelX = fwdX * (impactSpeed * 0.95) + (Math.random() - 0.5) * 5.0;
          ud.ragdollVelY = 7.5 + Math.min(impactSpeed * 0.45, 14.0);
          ud.ragdollVelZ = fwdZ * (impactSpeed * 0.95) + (Math.random() - 0.5) * 5.0;
          ud.ragdollRotSpeedX = (Math.random() - 0.5) * 16.0;
          ud.ragdollRotSpeedY = (Math.random() - 0.5) * 16.0;
          ud.ragdollRotSpeedZ = (Math.random() - 0.5) * 16.0;

          ragdollLaunchedEntities.add(entity);

          if (typeof playBicycleCrashSound === 'function') {
            playBicycleCrashSound();
          }
        }
      }
    }

    if (ragdollLaunchedEntities.size > 0) {
      const gravity = 22.0;
      for (const entity of Array.from(ragdollLaunchedEntities)) {
        if (!entity) {
          ragdollLaunchedEntities.delete(entity);
          continue;
        }
        const ud = entity.userData;
        if (!ud || !ud.ragdollActive) {
          ragdollLaunchedEntities.delete(entity);
          continue;
        }

        ud.ragdollTimer += dt;
        ud.ragdollVelY -= gravity * dt;

        entity.position.x += ud.ragdollVelX * dt;
        entity.position.y += ud.ragdollVelY * dt;
        entity.position.z += ud.ragdollVelZ * dt;

        entity.rotation.x += ud.ragdollRotSpeedX * dt;
        entity.rotation.y += ud.ragdollRotSpeedY * dt;
        entity.rotation.z += ud.ragdollRotSpeedZ * dt;

        const groundLevel = ud.baseY || 0;
        if (entity.position.y <= groundLevel) {
          entity.position.y = groundLevel;
          ud.ragdollVelY = -ud.ragdollVelY * 0.35;
          ud.ragdollVelX *= 0.65;
          ud.ragdollVelZ *= 0.65;
          ud.ragdollRotSpeedX *= 0.5;
          ud.ragdollRotSpeedY *= 0.5;
          ud.ragdollRotSpeedZ *= 0.5;

          if (Math.abs(ud.ragdollVelY) < 1.0 && ud.ragdollTimer > 2.5) {
            ud.ragdollActive = false;
            ragdollLaunchedEntities.delete(entity);
            entity.rotation.set(0, entity.rotation.y, 0);
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 25.10. TÍCH HỢP DUY NHẤT VÀO VÒNG LẶP RENDER CHÍNH (SCENE.ONBEFORERENDER)
  // --------------------------------------------------------------------------
  if (typeof scene !== 'undefined' && scene) {
    const prevOnBeforeRenderV260 = scene.onBeforeRender;
    let lastV260Time = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    scene.onBeforeRender = function(rendererInst, sceneInst, cameraInst) {
      if (typeof prevOnBeforeRenderV260 === 'function') {
        prevOnBeforeRenderV260.call(this, rendererInst, sceneInst, cameraInst);
      }
      if (typeof camera !== 'undefined' && cameraInst !== camera && (!rendererInst || !rendererInst.xr || !rendererInst.xr.isPresenting)) return;

      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      const dt = Math.min((now - lastV260Time) / 1000, 0.1);
      if (dt < 0.001) return;
      lastV260Time = now;
      const elapsed = (typeof clock !== 'undefined' && clock) ? clock.getElapsedTime() : (now / 1000);
      frameCounter++;

      // Điều khiển xe bằng GOG R808 & Quest Touch (Nhân tốc độ ảo 5x, bảo toàn 1x phần cứng)
      pollAllGamepadsWheelGog808AndThumbsticks(dt);

      // Vật lý tông hất tung NPC & Thú cưng
      updateUniversalNpcAndPetRagdollCollisions(dt, elapsed);

      // Cập nhật 3 màn hình YouTube & UI ở tần số tiết kiệm VRAM 24 FPS (mỗi 3 frame)
      if (frameCounter % 3 === 0) {
        updateSyncedYouTubeCanvas();
        syncLiquidGearWidget();
        updateRoleSeatBadge();
      }
    };
  }

  // Khởi tạo ban đầu
  if (typeof window !== 'undefined') {
    const initV260Dom = () => {
      initRearMirrorDefaultBackdrop();
      alignSteeringWheelAndCleanShaftOnly();
      setupSyncedThreeYouTubeScreens();
      bindLiquidGearEvents();
      syncLiquidGearWidget();
      updateRoleSeatBadge();
      setTimeout(connectBothEsp32CamerasAndController, 600);
    };
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initV260Dom);
    } else {
      initV260Dom();
    }
  }
}

export function attachUnifiedVehicleControlSystem(ctx) {
  'use strict';
  const {
    THREE, VIRTUAL_APP_SPEED_SCALE, VIRTUAL_FORWARD_SPEED_MS, VIRTUAL_REVERSE_SPEED_MS,
    cycleTurnSignals, getVirtualDrivingScale, isRacingWheelDevice, playSmartVehicleHornSound,
    renderer, scene, state, steeringWheelPivot, vehicleRoot, wheelAssemblies,
  } = ctx;

  if (typeof window !== 'undefined' && window.__UNIFIED_VEHICLE_CONTROL_ACTIVE__) return;
  if (typeof window !== 'undefined') window.__UNIFIED_VEHICLE_CONTROL_ACTIVE__ = true;

  const CFG = {
    wheelDeadzone: 0.035,
    pedalDeadzone: 0.04,
    xrStickDeadzone: 0.08,
    maxForwardSpeedMs: VIRTUAL_FORWARD_SPEED_MS,
    maxReverseSpeedMs: VIRTUAL_REVERSE_SPEED_MS,
    virtualSpeedScale: VIRTUAL_APP_SPEED_SCALE,
    accelRate: 3.4,
    brakeDecelRate: 20.0,
    naturalDragRate: 2.5,
    steerMaxVisualDeg: 540,
    yawTurnFactor: 1.95,
    bridgeTickMs: 33,         // ~30Hz đọc USB GOG R808 trên Laptop
    bridgeHeartbeatMs: 250,   // Heartbeat khi giữ cố định bàn đạp/vô lăng
    bridgeTimeoutMs: 850      // Nới rộng cửa sổ tươi mới cho Kính Quest
  };

  const isQuestHeadset = (typeof navigator !== 'undefined' && /quest|oculus|pacific/i.test(navigator.userAgent || ''));
  const locHost = (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'localhost';
  const isLocalAdmin = !isQuestHeadset && (
    locHost === 'localhost' ||
    locHost === '127.0.0.1'
  );

  const runtime = {
    role: isLocalAdmin ? 'ADMIN_LOCAL' : 'VR_PLAYER',
    keys: { up: false, down: false, left: false, right: false, brake: false },
    calibration: {
      gamepadIndex: -1,
      samples: 0,
      ready: false,
      centerAxis0: 0,
      restAxis1: 1,
      restAxis2: 1,
      restBtn6: 0,
      restBtn7: 0
    },
    prevButtons: {},
    lastBridgeSent: {
      steerNorm: 0,
      gasNorm: 0,
      brakeNorm: 0,
      ts: 0,
      wasActive: false
    },
    remoteBridge: {
      connected: false,
      steerNorm: 0,
      gasNorm: 0,
      brakeNorm: 0,
      reverseNorm: 0,
      driveNorm: 0,
      gear: 'D',
      lastSeq: -1,
      updatedAt: 0
    },
    lastHwSendMs: 0,
    lastCarSyncMs: 0,
    wasDrivingInputActive: false
  };

  function clamp(v, min, max) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;
  }

  function applyDeadzone(val, dz) {
    const v = clamp(val, -1, 1);
    if (Math.abs(v) <= dz) return 0;
    return (v < 0 ? -1 : 1) * ((Math.abs(v) - dz) / (1 - dz));
  }

  // --------------------------------------------------------------------------
  // 1. QUẢN LÝ KẾT NỐI WEBSOCKET & CHẶN GÓI ROOM_SYNC GÂY GIẬT XE VỀ CHỖ CŨ
  // --------------------------------------------------------------------------
  function getActiveSocket() {
    if (ctx.mpSocket && ctx.mpSocket.readyState === WebSocket.OPEN) {
      bindSocketListeners(ctx.mpSocket);
      return ctx.mpSocket;
    }
    const candidates = [
      (typeof window !== 'undefined' ? window.multiplayerWs : null),
      (typeof window !== 'undefined' ? window.rcSocket : null),
      (typeof window !== 'undefined' ? window.ws : null)
    ];
    for (const sock of candidates) {
      if (sock && sock.readyState === 1) {
        bindSocketListeners(sock);
        return sock;
      }
    }
    return null;
  }

  function bindSocketListeners(sock) {
    if (!sock || sock.__unifiedControlBound) return;
    sock.__unifiedControlBound = true;

    sock.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string' || !ev.data.startsWith('{')) return;
      try {
        const msg = JSON.parse(ev.data);
        if (!msg || !msg.type) return;

        // Chặn gói ROOM_SYNC ghi đè ngược vào tọa độ xe của Admin/Player đang lái
        if (msg.type === 'ROOM_SYNC') {
          if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
          return;
        }

        // Chặn WORLD_STATE ghi đè tọa độ xe mình đang lái (chống snap-back / rubber-banding)
        if (msg.type === 'WORLD_STATE' && Array.isArray(msg.cars)) {
          if (typeof state !== 'undefined' && state && (state.playerMode === 'DRIVING' || Math.abs(state.velocityMs || 0) > 0.05) && typeof vehicleRoot !== 'undefined' && vehicleRoot) {
            for (const c of msg.cars) {
              if (c.carId === (state.activeCarId || 'car_host')) {
                c.x = vehicleRoot.position.x;
                c.z = vehicleRoot.position.z;
                c.heading = state.headingRad;
              }
            }
          }
        }

        // Nhận thông tin Server LAN & Camera IP
        if (msg.type === 'SERVER_LAN_INFO') {
          if (msg.lanIp && typeof localStorage !== 'undefined' && msg.lanIp !== '127.0.0.1') {
            localStorage.setItem('pc_server_ip', msg.lanIp);
          }
          if (msg.cams && typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps(msg.cams);
          }
          if (msg.car && typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps({ car: msg.car });
          }
        }
        if (msg.type === 'CAM_IP_UPDATED' || msg.type === 'ESP32_CAM_UPDATE') {
          if (typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps(msg.cams || msg);
          }
        }

        // Nhận trạng thái vô lăng & bàn đạp GOG R808 đồng bộ từ Laptop sang Kính VR
        if (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT') {
          const src = msg.payload || msg;
          runtime.remoteBridge.connected = Boolean(src.connected !== false);

          const rawS = typeof src.steerNorm === 'number' ? src.steerNorm : (typeof src.steeringNorm === 'number' ? src.steeringNorm : (typeof src.steer === 'number' && src.steer <= 180 ? (src.steer - 90) / 45 : 0));
          runtime.remoteBridge.steerNorm = clamp(rawS, -1, 1);

          const rawG = typeof src.gasNorm === 'number' ? src.gasNorm : (typeof src.gasPercent === 'number' ? src.gasPercent / 100 : 0);
          runtime.remoteBridge.gasNorm = clamp(rawG, 0, 1);

          const rawB = typeof src.brakeNorm === 'number' ? src.brakeNorm : (typeof src.brakePercent === 'number' ? src.brakePercent / 100 : 0);
          runtime.remoteBridge.brakeNorm = clamp(rawB, 0, 1);

          const rawR = typeof src.reverseNorm === 'number' ? src.reverseNorm : (typeof src.reversePercent === 'number' ? src.reversePercent / 100 : 0);
          runtime.remoteBridge.reverseNorm = clamp(rawR, 0, 1);

          runtime.remoteBridge.driveNorm = clamp(
            src.driveNorm ?? (runtime.remoteBridge.gasNorm - runtime.remoteBridge.brakeNorm - runtime.remoteBridge.reverseNorm),
            -1,
            1
          );
          runtime.remoteBridge.gear = src.gear || (runtime.remoteBridge.brakeNorm > 0.04 && runtime.remoteBridge.gasNorm < 0.03 ? 'R' : (runtime.remoteBridge.reverseNorm > 0.04 ? 'R' : 'D'));
          runtime.remoteBridge.updatedAt = (typeof performance !== 'undefined') ? performance.now() : Date.now();

          // Cập nhật cả vào đối tượng toàn cục _racingWheel để tương thích với mọi UI / HUD
          if (typeof window !== 'undefined') {
            if (!window._racingWheel) window._racingWheel = { connected: true };
            window._racingWheel.connected = true;
            window._racingWheel.rawSteer = runtime.remoteBridge.steerNorm;
            window._racingWheel.steerAngleDeg = THREE.MathUtils.clamp(runtime.remoteBridge.steerNorm * 540, -540, 540);
            window._racingWheel.gasPercent = Math.round(runtime.remoteBridge.gasNorm * 100);
            window._racingWheel.brakePercent = Math.round(runtime.remoteBridge.brakeNorm * 100);
            window._racingWheel.reversePercent = Math.round(runtime.remoteBridge.reverseNorm * 100);
            window._racingWheel.gear = runtime.remoteBridge.gear;
            window._racingWheel.lastInputTime = runtime.remoteBridge.updatedAt;
          }

          syncWheelToFunctionPanel({
            steerNorm: runtime.remoteBridge.steerNorm,
            steerAngleDeg: THREE.MathUtils.clamp(runtime.remoteBridge.steerNorm * 540, -540, 540),
            gasNorm: runtime.remoteBridge.gasNorm,
            gasPercent: Math.round(runtime.remoteBridge.gasNorm * 100),
            brakeNorm: runtime.remoteBridge.brakeNorm,
            brakePercent: Math.round(runtime.remoteBridge.brakeNorm * 100),
            reverseNorm: runtime.remoteBridge.reverseNorm,
            reversePercent: Math.round(runtime.remoteBridge.reverseNorm * 100),
            driveNorm: runtime.remoteBridge.driveNorm,
            gear: runtime.remoteBridge.gear
          });
          if (typeof src.seq === 'number' && src.seq !== runtime.remoteBridge.lastSeq) {
            runtime.remoteBridge.lastSeq = src.seq;
            if (Array.isArray(src.buttonEvents)) {
              src.buttonEvents.forEach(executeWheelButtonAction);
            }
          }
        }
      } catch (e) {}
    }, true);
  }

  // --------------------------------------------------------------------------
  // 2. BỘ ĐỌC BÀN PHÍM (CHO ADMIN LOCALHOST)
  // --------------------------------------------------------------------------
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const code = e.code || e.key;
      if (code === 'KeyW' || code === 'ArrowUp') runtime.keys.up = true;
      if (code === 'KeyS' || code === 'ArrowDown') runtime.keys.down = true;
      if (code === 'KeyA' || code === 'ArrowLeft') runtime.keys.left = true;
      if (code === 'KeyD' || code === 'ArrowRight') runtime.keys.right = true;
      if (code === 'Space') runtime.keys.brake = true;
    }, { passive: true });

    window.addEventListener('keyup', (e) => {
      const code = e.code || e.key;
      if (code === 'KeyW' || code === 'ArrowUp') runtime.keys.up = false;
      if (code === 'KeyS' || code === 'ArrowDown') runtime.keys.down = false;
      if (code === 'KeyA' || code === 'ArrowLeft') runtime.keys.left = false;
      if (code === 'KeyD' || code === 'ArrowRight') runtime.keys.right = false;
      if (code === 'Space') runtime.keys.brake = false;
    }, { passive: true });

    window.addEventListener('blur', () => {
      runtime.keys.up = false;
      runtime.keys.down = false;
      runtime.keys.left = false;
      runtime.keys.right = false;
      runtime.keys.brake = false;
    });
  }

  // --------------------------------------------------------------------------
  // 3. BỘ ĐỌC VÔ LĂNG & BÀN ĐẠP GOG R808 CHUẨN HÓA DUY NHẤT (LOCAL USB)
  // --------------------------------------------------------------------------
  function findGog808Gamepad() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;

    let fallbackPad = null;
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) continue;
      const id = (gp.id || '').toLowerCase();
      // Loại trừ tay cầm VR của Meta Quest để không nhận nhầm làm vô lăng USB
      if (/oculus|quest|meta|touch|openxr|xr-standard/i.test(id)) continue;
      if (/808|gog|wheel|racing|driving|steering|logitech|thrustmaster/i.test(id) || gp.mapping === '') {
        return gp;
      }
      if (!fallbackPad && gp.axes && gp.axes.length >= 2) {
        fallbackPad = gp;
      }
    }
    return fallbackPad;
  }

  function readLocalGog808State() {
    const gp = findGog808Gamepad();
    const cal = runtime.calibration;
    if (!gp) {
      cal.gamepadIndex = -1;
      cal.ready = false;
      cal.samples = 0;
      return null;
    }

    // Tự động lấy mẫu điểm nghỉ (Rest Position) trong 6 lần đọc đầu tiên khi chưa đạp
    if (cal.gamepadIndex !== gp.index) {
      cal.gamepadIndex = gp.index;
      cal.samples = 0;
      cal.ready = false;
    }
    if (!cal.ready) {
      const a0 = gp.axes[0] ?? 0;
      const a1 = gp.axes[1] ?? 1;
      const a2 = gp.axes[2] ?? 1;
      const b6 = gp.buttons[6] ? (typeof gp.buttons[6].value === 'number' ? gp.buttons[6].value : (gp.buttons[6].pressed ? 1 : 0)) : 0;
      const b7 = gp.buttons[7] ? (typeof gp.buttons[7].value === 'number' ? gp.buttons[7].value : (gp.buttons[7].pressed ? 1 : 0)) : 0;
      if (cal.samples === 0) {
        cal.centerAxis0 = Math.abs(a0) < 0.2 ? a0 : 0;
        cal.restAxis1 = a1;
        cal.restAxis2 = a2;
        cal.restBtn6 = b6;
        cal.restBtn7 = b7;
      } else {
        cal.restAxis1 = (cal.restAxis1 + a1) * 0.5;
        cal.restAxis2 = (cal.restAxis2 + a2) * 0.5;
        cal.restBtn6 = Math.max(cal.restBtn6, b6);
        cal.restBtn7 = Math.max(cal.restBtn7, b7);
      }
      cal.samples++;
      if (cal.samples >= 6) cal.ready = true;
    }

    // Tùy chọn đảo chiều lái và đảo vị trí chân đạp (lưu trong localStorage)
    const invertSteer = Boolean(
      (typeof window !== 'undefined' && window.__GOG808_INVERT_STEER__) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('invert_car_steer') === 'true') ||
      (typeof state !== 'undefined' && state && state.invertCarSteer)
    );
    const swapPedals = Boolean(
      (typeof window !== 'undefined' && window.__GOG808_SWAP_PEDALS__) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('gog808_swap_pedals') === 'true')
    );

    // 1. Trục xoay vô lăng (axes[0]): [-1.0 .. +1.0]
    const rawSteer = (gp.axes[0] ?? 0) - cal.centerAxis0;
    let steerNorm = applyDeadzone(rawSteer, CFG.wheelDeadzone);
    if (invertSteer) steerNorm = -steerNorm;

    // 2. Bàn đạp Ga & Phanh:
    // Trên GOG R808: Trục 1 (axes[1]) = Ga, Trục 2 (axes[2]) = Phanh
    const gasAxisIdx = swapPedals ? 2 : 1;
    const brakeAxisIdx = swapPedals ? 1 : 2;
    const gasBtnIdx = swapPedals ? 6 : 7;
    const brakeBtnIdx = swapPedals ? 7 : 6;

    const restGas = (gasAxisIdx === 1 ? cal.restAxis1 : cal.restAxis2);
    const restBrake = (brakeAxisIdx === 1 ? cal.restAxis1 : cal.restAxis2);

    const aGas = gp.axes[gasAxisIdx] ?? restGas;
    const aBrake = gp.axes[brakeAxisIdx] ?? restBrake;

    function readPedalAxis(val, restVal) {
      if (restVal > 0.4) {
        return clamp((restVal - val) / (restVal > 0.8 ? 1.8 : 0.8), 0, 1);
      } else if (restVal < -0.4) {
        return clamp((val - restVal) / (Math.abs(restVal) > 0.8 ? 1.8 : 0.8), 0, 1);
      } else {
        return clamp(Math.abs(val - restVal), 0, 1);
      }
    }

    let bGas = gp.buttons[gasBtnIdx] ? (typeof gp.buttons[gasBtnIdx].value === 'number' ? gp.buttons[gasBtnIdx].value : (gp.buttons[gasBtnIdx].pressed ? 1 : 0)) : 0;
    let bBrake = gp.buttons[brakeBtnIdx] ? (typeof gp.buttons[brakeBtnIdx].value === 'number' ? gp.buttons[brakeBtnIdx].value : (gp.buttons[brakeBtnIdx].pressed ? 1 : 0)) : 0;

    if (cal.restBtn6 > 0.5 && brakeBtnIdx === 6) bBrake = 0;
    if (cal.restBtn7 > 0.5 && gasBtnIdx === 7) bGas = 0;

    let gasNorm = Math.max(
      applyDeadzone(readPedalAxis(aGas, restGas), CFG.pedalDeadzone),
      applyDeadzone(bGas, CFG.pedalDeadzone)
    );
    let brakeNorm = Math.max(
      applyDeadzone(readPedalAxis(aBrake, restBrake), CFG.pedalDeadzone),
      applyDeadzone(bBrake, CFG.pedalDeadzone)
    );

    // Bàn đạp 3 (Côn / Lùi riêng biệt nếu có)
    let reverseNorm = 0;
    if (gp.axes && gp.axes.length > 3) {
      const aRev = gp.axes[3] ?? 1;
      reverseNorm = applyDeadzone(readPedalAxis(aRev, 1), CFG.pedalDeadzone);
    }
    if (gp.buttons && gp.buttons[2] && gp.buttons[2].pressed) {
      reverseNorm = Math.max(reverseNorm, 1.0);
    }

    // 3. Sự kiện nút bấm theo sườn lên (Rising-Edge)
    const pressed = (idx) => Boolean(gp.buttons[idx] && (gp.buttons[idx].pressed || gp.buttons[idx].value > 0.5));
    const currentBtns = {
      TURN_LEFT: pressed(4) || pressed(14),
      TURN_RIGHT: pressed(5) || pressed(15),
      HORN: pressed(0) || pressed(8) || pressed(9),
      ENTER_EXIT_CAR: pressed(2) || pressed(3),
      CYCLE_SEAT: pressed(1) || pressed(12)
    };

    const buttonEvents = [];
    for (const key of Object.keys(currentBtns)) {
      if (currentBtns[key] && !runtime.prevButtons[key]) {
        buttonEvents.push(key);
      }
    }
    runtime.prevButtons = currentBtns;

    const driveNorm = clamp(gasNorm - brakeNorm - reverseNorm, -1, 1);
    const gear = (brakeNorm > 0.04 && gasNorm < 0.03) ? 'R' : (reverseNorm > 0.04 ? 'R' : 'D');
    const isActive = Math.abs(steerNorm) > 0.01 || gasNorm > 0.01 || brakeNorm > 0.01 || reverseNorm > 0.01 || buttonEvents.length > 0;

    return {
      connected: true,
      active: isActive,
      steerNorm,
      gasNorm,
      brakeNorm,
      reverseNorm,
      driveNorm,
      gear,
      buttonEvents
    };
  }

  function executeWheelButtonAction(action) {
    if (typeof state === 'undefined' || !state) return;
    if (action === 'TURN_LEFT') {
      if (typeof cycleTurnSignals === 'function') cycleTurnSignals('LEFT');
      else state.turnSignal = state.turnSignal === 'LEFT' ? 'OFF' : 'LEFT';
    } else if (action === 'TURN_RIGHT') {
      if (typeof cycleTurnSignals === 'function') cycleTurnSignals('RIGHT');
      else state.turnSignal = state.turnSignal === 'RIGHT' ? 'OFF' : 'RIGHT';
    } else if (action === 'HORN') {
      if (typeof document !== 'undefined') document.getElementById('btn-horn')?.click();
      else if (typeof playSmartVehicleHornSound === 'function') playSmartVehicleHornSound('CAR');
    } else if (action === 'ENTER_EXIT_CAR') {
      if (typeof window.enterOrExitCarWithBlink === 'function') window.enterOrExitCarWithBlink();
      else if (typeof document !== 'undefined') document.getElementById('btn-open-door')?.click();
    } else if (action === 'CYCLE_SEAT' && state.playerMode === 'DRIVING') {
      if (typeof window.swapSeatOrTakeDriverControl === 'function') window.swapSeatOrTakeDriverControl();
      else state.seatIndex = ((state.seatIndex || 0) + 1) % 4;
    }
  }

  // --------------------------------------------------------------------------
  // 4. BỘ PHÁT CẦU NỐI TỪ LAPTOP (ADMIN) LÊN SERVER (30HZ + DELTA COMPRESSION)
  // --------------------------------------------------------------------------
  function pollAndRelayLocalWheelBridge() {
    const wheel = readLocalGog808State();
    if (!wheel) return;

    if (wheel.buttonEvents.length > 0) {
      wheel.buttonEvents.forEach(executeWheelButtonAction);
    }

    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const prev = runtime.lastBridgeSent;
    const dSteer = Math.abs(wheel.steerNorm - prev.steerNorm);
    const dGas = Math.abs(wheel.gasNorm - prev.gasNorm);
    const dBrake = Math.abs(wheel.brakeNorm - prev.brakeNorm);

    const hasSignificantChange = dSteer > 0.004 || dGas > 0.004 || dBrake > 0.004 || wheel.buttonEvents.length > 0;
    const justReleasedToZero = prev.wasActive && !wheel.active;
    const needHeartbeat = wheel.active && (now - prev.ts >= CFG.bridgeHeartbeatMs);

    if (!hasSignificantChange && !justReleasedToZero && !needHeartbeat) return;

    prev.steerNorm = wheel.steerNorm;
    prev.gasNorm = wheel.gasNorm;
    prev.brakeNorm = wheel.brakeNorm;
    prev.wasActive = wheel.active;
    prev.ts = now;

    const sock = getActiveSocket();
    if (sock && sock.readyState === 1 && sock.bufferedAmount < 65536) {
      sock.send(JSON.stringify({
        type: 'WHEEL_BRIDGE_INPUT',
        payload: {
          connected: true,
          steerNorm: wheel.steerNorm,
          steeringNorm: wheel.steerNorm,
          steerAngleDeg: Math.round(wheel.steerNorm * 540),
          gasNorm: wheel.gasNorm,
          brakeNorm: wheel.brakeNorm,
          reverseNorm: wheel.reverseNorm || 0,
          driveNorm: wheel.driveNorm,
          throttleNorm: wheel.driveNorm,
          gasPercent: Math.round(wheel.gasNorm * 100),
          brakePercent: Math.round(wheel.brakeNorm * 100),
          reversePercent: Math.round((wheel.reverseNorm || 0) * 100),
          gear: wheel.gear,
          steer: Math.max(45, Math.min(135, Math.round(90 + wheel.steerNorm * 45))),
          throttle: Math.max(1000, Math.min(2000, Math.round(1500 + wheel.driveNorm * 260))),
          buttonEvents: wheel.buttonEvents
        }
      }));
    }
  }

  // Chạy bằng Web Worker trên Laptop để khi đeo kính VR vẫn truyền mượt 30Hz
  if (isLocalAdmin) {
    try {
      if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const workerBlob = new Blob(
          ['setInterval(function(){ postMessage(1); }, ' + CFG.bridgeTickMs + ');'],
          { type: 'application/javascript' }
        );
        const bridgeWorker = new Worker(URL.createObjectURL(workerBlob));
        bridgeWorker.onmessage = pollAndRelayLocalWheelBridge;
        bridgeWorker.addEventListener('error', () => {
          bridgeWorker.terminate();
          setInterval(pollAndRelayLocalWheelBridge, CFG.bridgeTickMs);
        }, { once: true });
      } else {
        setInterval(pollAndRelayLocalWheelBridge, CFG.bridgeTickMs);
      }
    } catch (e) {
      setInterval(pollAndRelayLocalWheelBridge, CFG.bridgeTickMs);
    }
  }

  // --------------------------------------------------------------------------
  // 5. ĐỌC TAY CẦM VR (META QUEST TOUCH CONTROLLERS) TRÊN KÍNH
  // --------------------------------------------------------------------------
  function readXrControllerDriveInput() {
    let steerNorm = 0;
    let gasNorm = 0;
    let brakeNorm = 0;
    let active = false;

    // 1. Đọc từ WebXR inputSources nếu đang trong immersive session
    const session = (typeof renderer !== 'undefined' && renderer && renderer.xr) ? (renderer.xr.getSession ? renderer.xr.getSession() : null) : null;
    const xrSources = (session && session.inputSources) ? Array.from(session.inputSources) : [];

    // 2. Đọc từ Standard Gamepad API (WebXR Gamepad hoặc Touch Controller)
    const navGamepads = (typeof navigator !== 'undefined' && navigator.getGamepads)
      ? Array.from(navigator.getGamepads()).filter(gp => gp && (typeof isRacingWheelDevice !== 'function' || !isRacingWheelDevice(gp)))
      : [];

    const padList = [
      ...xrSources.map(s => ({ gp: s.gamepad, hand: s.handedness })).filter(i => i.gp),
      ...navGamepads.map(gp => ({ gp, hand: gp.hand || '' }))
    ];

    for (const { gp, hand } of padList) {
      if (!gp) continue;
      const axes = gp.axes || [];
      const btns = gp.buttons || [];

      // Cần xoay Thumbstick: axes[2] (X), axes[3] (Y) trên Quest Browser; fallback axes[0], axes[1]
      const stickX = (Math.abs(axes[2] || 0) > Math.abs(axes[0] || 0)) ? (axes[2] || 0) : (axes[0] || 0);
      const stickY = (Math.abs(axes[3] || 0) > Math.abs(axes[1] || 0)) ? (axes[3] || 0) : (axes[1] || 0);

      const deadX = applyDeadzone(stickX, CFG.xrStickDeadzone || 0.10);
      const deadY = applyDeadzone(stickY, CFG.xrStickDeadzone || 0.10);

      if (Math.abs(deadX) > Math.abs(steerNorm)) {
        steerNorm = deadX;
        active = true;
      }

      // Đẩy cần lên (deadY < 0): GA TIẾN
      if (deadY < -0.05) {
        gasNorm = Math.max(gasNorm, -deadY);
        active = true;
      }
      // Kéo cần xuống (deadY > 0): PHANH / LÙI
      else if (deadY > 0.05) {
        brakeNorm = Math.max(brakeNorm, deadY);
        active = true;
      }

      // Cò Trigger: Tay phải làm Ga, Tay trái làm Phanh/Lùi
      const trigVal = btns[0] ? (typeof btns[0].value === 'number' ? btns[0].value : (btns[0].pressed ? 1 : 0)) : 0;
      if (trigVal > 0.08) {
        if (hand === 'right') {
          gasNorm = Math.max(gasNorm, applyDeadzone(trigVal, 0.08));
          active = true;
        } else if (hand === 'left') {
          brakeNorm = Math.max(brakeNorm, applyDeadzone(trigVal, 0.08));
          active = true;
        } else {
          gasNorm = Math.max(gasNorm, applyDeadzone(trigVal, 0.08));
          active = true;
        }
      }

      // Nút Grip (Cò báng cầm btns[1]): Phanh dừng xe
      const gripVal = btns[1] ? (typeof btns[1].value === 'number' ? btns[1].value : (btns[1].pressed ? 1 : 0)) : 0;
      if (gripVal > 0.35) {
        brakeNorm = Math.max(brakeNorm, 1.0);
        active = true;
      }
    }

    return active ? { active: true, steerNorm, gasNorm, brakeNorm } : null;
  }

  // --------------------------------------------------------------------------
    // 6. HỢP NHẤT NGUỒN ĐIỀU KHIỂN & VẬT LÝ XE THỐNG NHẤT CHO ADMIN & VR PLAYER
  // --------------------------------------------------------------------------
  function resolveActiveDrivingCommand(now) {
    // Nguồn 1: Vô lăng GOG R808 cắm trực tiếp (trên Localhost Admin)
    const localWheel = readLocalGog808State();
    if (localWheel && localWheel.active) {
      return {
        source: 'GOG808_LOCAL',
        active: true,
        steerNorm: localWheel.steerNorm,
        gasNorm: localWheel.gasNorm,
        brakeNorm: localWheel.brakeNorm,
        driveNorm: localWheel.driveNorm,
        gear: localWheel.gear
      };
    }

    // Nguồn 2: Vô lăng GOG R808 truyền qua WebSocket Bridge (trên Kính VR)
    const rb = runtime.remoteBridge;
    const bridgeFresh = rb.connected && (now - rb.updatedAt < CFG.bridgeTimeoutMs);
    const bridgeActive = bridgeFresh && (
      Math.abs(rb.steerNorm) > 0.01 || Math.abs(rb.driveNorm) > 0.01 || rb.gasNorm > 0.01 || rb.brakeNorm > 0.01 || rb.reverseNorm > 0.01
    );
    if (bridgeActive) {
      const effDrive = typeof rb.driveNorm === 'number' ? rb.driveNorm : (rb.gasNorm - rb.brakeNorm);
      return {
        source: 'GOG808_BRIDGE',
        active: true,
        steerNorm: rb.steerNorm,
        gasNorm: rb.gasNorm,
        brakeNorm: rb.brakeNorm,
        driveNorm: effDrive,
        gear: rb.gear || (effDrive < -0.03 ? 'R' : 'D')
      };
    }

    // Nguồn 3: Tay cầm VR (trên Kính Meta Quest 3)
    const xrInput = readXrControllerDriveInput();
    if (xrInput && xrInput.active) {
      return {
        source: 'VR_CONTROLLER',
        active: true,
        steerNorm: xrInput.steerNorm,
        gasNorm: xrInput.gasNorm,
        brakeNorm: xrInput.brakeNorm
      };
    }

    // Nguồn 4: Bàn phím (trên Localhost Admin)
    const k = runtime.keys;
    const keySteer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const keyGas = k.up ? 1 : 0;
    const keyBrake = (k.down || k.brake) ? 1 : 0;
    if (keySteer !== 0 || keyGas !== 0 || keyBrake !== 0) {
      return {
        source: 'KEYBOARD',
        active: true,
        steerNorm: keySteer,
        gasNorm: k.brake ? 0 : keyGas,
        brakeNorm: keyBrake
      };
    }

    return { source: 'IDLE', active: false, steerNorm: 0, gasNorm: 0, brakeNorm: 0 };
  }

  function ensureVehicleReadyForDriving() {
    state.engineRunning = true;
    if (!state.gearIndex || state.gearIndex === 0) {
      state.gearIndex = 3;
      state.gear = 'D';
    }
  }

  // Móc nối duy nhất vào scene.onBeforeRender (Không tạo biến neo tọa độ phụ gây giật lùi xe)
  function attachSceneLoop() {
    if (typeof scene === 'undefined' || !scene || scene.__unifiedVehicleLoopBound) return false;
    scene.__unifiedVehicleLoopBound = true;

    const prevOnBeforeRender = scene.onBeforeRender;
    let lastTickMs = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    scene.onBeforeRender = function (rendererInst, sceneInst, cameraInst) {
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      const dt = Math.min(Math.max((now - lastTickMs) / 1000, 0.001), 0.05);
      lastTickMs = now;

      getActiveSocket();

      if (typeof prevOnBeforeRender === 'function') {
        prevOnBeforeRender.call(this, rendererInst, sceneInst, cameraInst);
      }

      const hasVehicle = (typeof vehicleRoot !== 'undefined' && vehicleRoot && typeof state !== 'undefined' && state);
      if (!hasVehicle || state.playerMode !== 'DRIVING') {
        window.__UNIFIED_IS_DRIVING_ACTIVE__ = false;
        return;
      }

      const cmd = resolveActiveDrivingCommand(now);

      // Khi có bất kỳ lệnh điều khiển chủ động nào (GOG R808, Tay cầm VR, Bàn phím):
      // Đánh dấu để chống server kéo giật xe về điểm ban đầu
      window.__UNIFIED_IS_DRIVING_ACTIVE__ = cmd.active;

      if (cmd.active) {
        ensureVehicleReadyForDriving();
      }

      // Cho phép lái nếu ở ghế lái (seatIndex === 0) hoặc là Localhost Admin hoặc đang điều khiển từ Tay cầm VR
      const canDrive = (state.seatIndex === 0 || isLocalAdmin || (isQuestHeadset && cmd.active));
      if (!canDrive) return;

      let velMs = state.velocityMs || 0;
      let heading = state.headingRad ?? (vehicleRoot.rotation.y || 0);

      // 1. Góc xoay vô lăng 3D mượt theo tín hiệu chuẩn hóa (giới hạn cứng [-540, 540] độ)
      const targetSteerDeg = THREE.MathUtils.clamp(cmd.steerNorm * CFG.steerMaxVisualDeg, -540, 540);
      if (typeof THREE !== 'undefined' && THREE.MathUtils) {
        state.steeringAngleDeg = THREE.MathUtils.lerp(
          state.steeringAngleDeg || 0,
          targetSteerDeg,
          Math.min(1, dt * 18)
        );
      } else {
        state.steeringAngleDeg = targetSteerDeg;
      }
      state.steeringAngleDeg = THREE.MathUtils.clamp(state.steeringAngleDeg, -540, 540);

      if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot && typeof THREE !== 'undefined' && THREE.MathUtils) {
        steeringWheelPivot.rotation.z = -THREE.MathUtils.degToRad(state.steeringAngleDeg);
      }
      // Đánh lái góc bánh xe trước
      const frontYaw = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 34);
      if (typeof wheelAssemblies !== 'undefined' && Array.isArray(wheelAssemblies)) {
        for (const w of wheelAssemblies) {
          if (w.isFrontWheel && w.steerMount) w.steerMount.rotation.y = frontYaw;
        }
      }

      // 2. Quy tắc Bàn đạp Ga / Phanh / Lùi thống nhất trên cả Admin & Kính VR
      const lerpFn = (typeof THREE !== 'undefined' && THREE.MathUtils) ? THREE.MathUtils.lerp : (a, b, t) => a + (b - a) * t;

      const effectiveDrive = (typeof cmd.driveNorm === 'number' && Math.abs(cmd.driveNorm) > 0.02)
        ? cmd.driveNorm
        : (cmd.gasNorm - cmd.brakeNorm);

      if (effectiveDrive > 0.03 || (cmd.gasNorm > 0.04 && effectiveDrive >= 0)) {
        state.gear = 'D';
        state.gearIndex = 3;
        const driveMag = Math.max(cmd.gasNorm, effectiveDrive);
        state.throttlePercent = Math.round(driveMag * 100);
        state.brakePercent = 0;
        state.reversePercent = 0;
        const targetVel = driveMag * CFG.maxForwardSpeedMs * getVirtualDrivingScale();
        velMs = lerpFn(velMs, targetVel, Math.min(1, dt * CFG.accelRate));
      } else if (effectiveDrive < -0.03 || (cmd.brakeNorm > 0.04 && effectiveDrive < 0)) {
        const revMag = Math.abs(effectiveDrive);
        if (runtime.keys.brake || velMs > 0.4) {
          // Đang chạy tiến hoặc nhấn Space -> Phanh giảm tốc về 0
          state.brakePercent = Math.round(revMag * 100);
          state.throttlePercent = 0;
          state.reversePercent = 0;
          velMs = Math.max(0, velMs - revMag * CFG.brakeDecelRate * dt);
        } else {
          // Đã dừng -> Chuyển sang số Lùi (R) và lùi mượt
          state.gear = 'R';
          state.gearIndex = 1;
          state.reversePercent = Math.round(revMag * 100);
          state.throttlePercent = 0;
          state.brakePercent = 0;
          const targetRevVel = -revMag * CFG.maxReverseSpeedMs * getVirtualDrivingScale();
          velMs = lerpFn(velMs, targetRevVel, Math.min(1, dt * CFG.accelRate));
        }
      } else {
        // Khi nhả cả bàn đạp, bàn phím và tay cầm -> Giảm tốc tự nhiên theo quán tính
        state.throttlePercent = 0;
        state.brakePercent = 0;
        state.reversePercent = 0;
        velMs = lerpFn(velMs, 0, Math.min(1, dt * CFG.naturalDragRate));
        if (Math.abs(velMs) < 0.03) velMs = 0;
      }

      // 3. Tích phân góc hướng (Heading) và dịch chuyển tọa độ xe (Position)
      if (Math.abs(velMs) > 0.02) {
        const steerRatio = (state.steeringAngleDeg || 0) / CFG.steerMaxVisualDeg;
        const dirSign = velMs >= -0.05 ? 1 : -1;
        const speedFactor = Math.min(1.25, Math.max(0.35, Math.abs(velMs) / 6.0));
        heading -= steerRatio * CFG.yawTurnFactor * dirSign * speedFactor * dt;

        const step = velMs * CFG.virtualSpeedScale * dt;
        vehicleRoot.position.x -= Math.sin(heading) * step;
        vehicleRoot.position.z -= Math.cos(heading) * step;

        if (typeof state.wheelRotationRad === 'number') {
          state.wheelRotationRad += (step / 0.38);
        }
        if (typeof wheelAssemblies !== 'undefined' && Array.isArray(wheelAssemblies)) {
          for (const w of wheelAssemblies) {
            if (w.spinHub) w.spinHub.rotation.x = -state.wheelRotationRad;
          }
        }
      }

      vehicleRoot.rotation.y = heading;
      state.headingRad = heading;
      state.velocityMs = velMs;
      state.speedKmh = Math.abs(velMs) * 3.6 * CFG.virtualSpeedScale;

      // 4. Gửi lệnh phần cứng xuống ESP32 (Rate-limited 25Hz)
      if (cmd.source === 'KEYBOARD' || cmd.source === 'VR_CONTROLLER') {
        if (now - runtime.lastHwSendMs >= 40 && (cmd.active || runtime.wasDrivingInputActive)) {
          runtime.lastHwSendMs = now;
          runtime.wasDrivingInputActive = cmd.active;
          const sock = getActiveSocket();
          if (sock && sock.readyState === 1 && sock.bufferedAmount < 65536) {
            const driveNorm = cmd.active ? (typeof cmd.driveNorm === 'number' ? cmd.driveNorm : clamp(cmd.gasNorm - cmd.brakeNorm, -1, 1)) : 0;
            sock.send(JSON.stringify({
              type: 'RC_CONTROL_CMD',
              source: cmd.source,
              deviceType: (typeof isQuestHeadset !== 'undefined' && isQuestHeadset) ? 'META_QUEST' : 'PC',
              steeringNorm: Number(cmd.steerNorm.toFixed(4)),
              throttleNorm: Number(driveNorm.toFixed(4)),
              gear: state.gear || 'D'
            }));
          }
        }
      }

      // 5. Đồng bộ vị trí xe lên Server (CAR_SYNC 20Hz)
      if (now - runtime.lastCarSyncMs >= 50) {
        runtime.lastCarSyncMs = now;
        const sock = getActiveSocket();
        if (sock && sock.readyState === 1 && sock.bufferedAmount < 65536) {
          sock.send(JSON.stringify({
            type: 'CAR_SYNC',
            carId: (typeof state !== 'undefined' && state && state.activeCarId) || 'car_host',
            driverPlayerId: (typeof state !== 'undefined' && state && state.playerId) || undefined,
            x: Number(vehicleRoot.position.x.toFixed(3)),
            z: Number(vehicleRoot.position.z.toFixed(3)),
            heading: Number(heading.toFixed(3)),
            speedKmh: Number((state.speedKmh || 0).toFixed(1)),
            steerDeg: Number((state.steeringAngleDeg || 0).toFixed(1))
          }));
        }
      }
    };
    return true;
  }

  // 7. Cung cấp hàm chuyển đổi nhanh cho UI & Console
  if (typeof window !== 'undefined') {
    window.toggleGog808Steer = function () {
      window.__GOG808_INVERT_STEER__ = !window.__GOG808_INVERT_STEER__;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('invert_car_steer', window.__GOG808_INVERT_STEER__ ? 'true' : 'false');
      }
      if (typeof state !== 'undefined' && state) {
        state.invertCarSteer = window.__GOG808_INVERT_STEER__;
      }
      console.log('🔄 [GOG808] Đảo Lái:', window.__GOG808_INVERT_STEER__ ? 'BẬT (Đảo)' : 'TẮT (Chuẩn)');
      return window.__GOG808_INVERT_STEER__;
    };

    window.toggleGog808Pedals = function () {
      window.__GOG808_SWAP_PEDALS__ = !window.__GOG808_SWAP_PEDALS__;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('gog808_swap_pedals', window.__GOG808_SWAP_PEDALS__ ? 'true' : 'false');
      }
      runtime.calibration.ready = false;
      runtime.calibration.samples = 0;
      console.log('🔄 [GOG808] Đảo Bàn Đạp (Ga <-> Phanh):', window.__GOG808_SWAP_PEDALS__ ? 'BẬT (Trục 2=Ga, Trục 1=Phanh)' : 'TẮT (Trục 1=Ga, Trục 2=Phanh)');
      return window.__GOG808_SWAP_PEDALS__;
    };
  }

  if (!attachSceneLoop()) {
    const waitTimer = setInterval(() => {
      if (attachSceneLoop()) clearInterval(waitTimer);
    }, 50);
  }
}

export function setupV504GoldMasterQuestDriving(ctx) {
  const {
    THREE, VIRTUAL_FORWARD_SPEED_MS, VIRTUAL_REVERSE_SPEED_MS, enterOrExitCarWithBlink,
    getHostedServerHostname, getVirtualDrivingScale, initMultiplayerClient, isSocketActive,
    playSmartVehicleHornSound, resetAndCenterViewpoint, scene, state, steeringWheelPivot,
    vehicleRoot, wheelAssemblies,
  } = ctx;
  if (window.__V504_GOLD_MASTER_ACTIVE__) return;
  window.__V504_GOLD_MASTER_ACTIVE__ = true;
  window.__V500_DUAL_BRIDGE_ACTIVE__ = true;
  window.__UNIFIED_VEHICLE_CONTROL_ACTIVE__ = true;

  window.__V200_DEVICE_ROLE__ = 'META_QUEST';
  window.__DETECTED_DEVICE_TYPE__ = 'META_QUEST';

  const loc = (typeof window !== 'undefined' && window.location) ? window.location : (typeof location !== 'undefined' ? location : { hostname: '127.0.0.1', protocol: 'http:', port: '8080', host: '127.0.0.1:8080' });
  const storage = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {} });

  try {
    const savedRev = Number(storage.getItem('rc_max_reverse_pulse'));
    if (!savedRev || savedRev >= 1250) {
      storage.setItem('rc_max_reverse_pulse', '1100');
    }
  } catch (e) {}

  const bakedIps = ['192.168.1.76', '192.168.1.228', '192.168.1.21', '192.168.1.32', '192.168.1.60'];
  let activeLaptopIp = getHostedServerHostname() || storage.getItem('pc_server_ip') || storage.getItem('V500_LAPTOP_IP') || bakedIps[0];
  let isConnected = false;
  let isScanningSubnet = false;
  let lastProcessedSeq = -1;

  const liveWheel = {
    connected: false,
    steerNorm: 0,
    gasNorm: 0,
    brakeNorm: 0,
    driveNorm: 0,
    escPulseUs: 1500,
    gear: 'D',
    updatedAt: 0
  };

  // 1. THANH TRẠNG THÁI HIỂN THỊ TRỰC QUAN TRÊN MÀN HÌNH KÍNH & NÚT ĐỔI IP
  function getOrCreateV500Banner() {
    let el = document.getElementById('v500-quest-bridge-banner');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'v500-quest-bridge-banner';
    el.style.cssText =
      'position:fixed;top:62px;left:50%;transform:translateX(-50%);z-index:900;display:flex;align-items:center;gap:10px;padding:6px 16px;border-radius:999px;background:rgba(15,23,42,0.92);border:1.5px solid #38bdf8;color:#38bdf8;font-family:Segoe UI,sans-serif;font-size:12px;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,0.65);backdrop-filter:blur(6px);user-select:none;transition:opacity 0.35s ease, transform 0.35s ease;pointer-events:auto;';

    const label = document.createElement('span');
    label.id = 'v500-quest-bridge-label';
    label.textContent = `📡 Đang kết nối Laptop (${activeLaptopIp || 'Dò tự động'} : 8080)...`;

    const btnIp = document.createElement('button');
    btnIp.textContent = 'Đổi IP Laptop';
    btnIp.style.cssText =
      'background:#0284c7;color:#fff;border:none;border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;cursor:pointer;';
    btnIp.onclick = () => {
      const hint = activeLaptopIp || bakedIps.join(', ');
      const inp = prompt('Nhập IP Wi-Fi của Laptop đang chạy node server.js:', hint);
      if (inp && inp.trim()) {
        const cleanIp = inp.trim().replace(/^https?:\/\//, '').replace(/:\d+$/, '');
        activeLaptopIp = cleanIp;
        storage.setItem('V500_LAPTOP_IP', cleanIp);
        storage.setItem('pc_server_ip', cleanIp);
        connectWebSocketToIp(cleanIp);
      }
    };

    el.appendChild(label);
    el.appendChild(btnIp);
    document.body.appendChild(el);
    return el;
  }

  function showV500DiscoveryBanner(text) {
    getOrCreateV500Banner();
    const banner = document.getElementById('v500-quest-bridge-banner');
    const label = document.getElementById('v500-quest-bridge-label');
    if (!banner || !label) return;
    label.textContent = text;
    banner.style.display = 'flex';
  }

  function syncMainBridgeConnection() {
    isConnected = Boolean(isSocketActive(ctx.mpSocket));
    if (isConnected) {
      const banner = document.getElementById('v500-quest-bridge-banner');
      if (banner) banner.style.display = 'none';
    }
    return isConnected;
  }

  // 2. ĐỒNG BỘ TÍN HIỆU VÔ LĂNG VÀO TẤT CẢ CÁC BIẾN & UI
  function ingestWheelData(w) {
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
    liveWheel.isRemoteBridge = true;
    liveWheel.isPhysical = !w.deviceId || /808|wheel|racing|steering|logitech|thrustmaster/i.test(w.deviceId);

    // Chuẩn hóa sNorm [-1..1]
    const rawS = typeof w.steerNorm === 'number' ? w.steerNorm :
                 (typeof w.steeringNorm === 'number' ? w.steeringNorm :
                 (typeof w.steer === 'number' && w.steer > 1.5 ? (w.steer - 90) / 45 : (Number(w.steer) || 0)));
    liveWheel.steerNorm = Math.max(-1, Math.min(1, rawS));
    liveWheel.gasNorm = Number(w.gasNorm ?? (w.gasPercent ? w.gasPercent / 100 : 0)) || 0;
    liveWheel.brakeNorm = Number(w.brakeNorm ?? (w.brakePercent ? w.brakePercent / 100 : 0)) || 0;
    const revNorm = Number(w.reverseNorm ?? (typeof w.reversePercent === 'number' ? w.reversePercent / 100 : (w.gear === 'R' ? liveWheel.brakeNorm : 0))) || 0;
    liveWheel.driveNorm = w.driveNorm !== undefined
      ? Number(w.driveNorm) || 0
      : (liveWheel.gasNorm - Math.max(liveWheel.brakeNorm, revNorm));
    liveWheel.gear = w.gear || (liveWheel.driveNorm < -0.025 ? 'R' : 'D');
    liveWheel.escPulseUs = Number(w.escPulseUs) || 1500;
    liveWheel.updatedAt = nowPerf;

    if (!window._racingWheel) window._racingWheel = {};
    Object.assign(window._racingWheel, {
      connected: true,
      isRemoteBridge: true,
      steerNorm: liveWheel.steerNorm,
      rawSteer: liveWheel.steerNorm,
      steerAngleDeg: Math.round(liveWheel.steerNorm * 540),
      gasNorm: liveWheel.gasNorm,
      gasPercent: Math.round(liveWheel.gasNorm * 100),
      brakeNorm: liveWheel.brakeNorm,
      brakePercent: Math.round(liveWheel.brakeNorm * 100),
      reversePercent: liveWheel.gear === 'R' ? Math.round(Math.max(liveWheel.brakeNorm, revNorm) * 100) : Math.round(revNorm * 100),
      driveNorm: liveWheel.driveNorm,
      gear: liveWheel.gear,
      lastUpdateMs: nowPerf,
      lastInputTime: nowPerf
    });

    if (typeof racingWheel !== 'undefined' && racingWheel) {
      racingWheel.connected = true;
      racingWheel.gasPercent = Math.round(liveWheel.gasNorm * 100);
      racingWheel.brakePercent = Math.round(liveWheel.brakeNorm * 100);
      racingWheel.reversePercent = liveWheel.gear === 'R' ? Math.round(Math.max(liveWheel.brakeNorm, revNorm) * 100) : Math.round(revNorm * 100);
      racingWheel.steerAngleDeg = Math.round(liveWheel.steerNorm * 540);
      racingWheel.gear = liveWheel.gear;
      racingWheel.lastInputTime = nowPerf;
    }

    if (typeof runtime !== 'undefined' && runtime) {
      if (!runtime.remoteBridge) runtime.remoteBridge = {};
      Object.assign(runtime.remoteBridge, {
        connected: true,
        steerNorm: liveWheel.steerNorm,
        gasNorm: liveWheel.gasNorm,
        brakeNorm: liveWheel.brakeNorm,
        reverseNorm: liveWheel.gear === 'R' ? liveWheel.brakeNorm : 0,
        driveNorm: liveWheel.driveNorm,
        gear: liveWheel.gear,
        updatedAt: nowPerf,
        timestamp: nowDate
      });
    }

    if (typeof syncWheelToFunctionPanel === 'function') {
      try {
        syncWheelToFunctionPanel({
          steerNorm: liveWheel.steerNorm,
          steerAngleDeg: Math.round(liveWheel.steerNorm * 540),
          gasNorm: liveWheel.gasNorm,
          gasPercent: Math.round(liveWheel.gasNorm * 100),
          brakeNorm: liveWheel.brakeNorm,
          brakePercent: Math.round(liveWheel.brakeNorm * 100),
          reverseNorm: liveWheel.gear === 'R' ? liveWheel.brakeNorm : 0,
          reversePercent: liveWheel.gear === 'R' ? Math.round(liveWheel.brakeNorm * 100) : 0,
          driveNorm: liveWheel.driveNorm,
          gear: liveWheel.gear
        });
      } catch (e) {}
    }

    if (typeof w.seq === 'number' && w.seq !== lastProcessedSeq) {
      lastProcessedSeq = w.seq;
      if (Array.isArray(w.buttonEvents)) {
        w.buttonEvents.forEach((act) => triggerWheelAction(act));
      }
    }
  }

  function hookMainMpSocket() {
    const mainSock = ctx.mpSocket;
    if (mainSock && typeof mainSock.addEventListener === 'function' && !mainSock.__v504Hooked) {
      mainSock.__v504Hooked = true;
      mainSock.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT')) {
            ingestWheelData(msg.payload || msg);
          } else if (msg && (msg.type === 'CAM_IP_UPDATED' || msg.type === 'ESP32_CAM_UPDATE' || msg.type === 'SERVER_LAN_INFO')) {
            if (msg.cams && typeof window.applyEsp32CameraIps === 'function') {
              window.applyEsp32CameraIps(msg.cams);
            }
          }
        } catch (e) {}
      });
    }
  }

  // 3. TỰ ĐỘNG DÒ TÌM IP LAPTOP QUA WI-FI (HỖ TRỢ MỌI DẢI MẠNG & HOTSPOT)
  function getCandidateIps() {
    const list = [];
    let nativeSubnet = null;
    if (typeof window !== 'undefined' && window.QuestVRBridge && typeof window.QuestVRBridge.getDeviceSubnet === 'function') {
      try { nativeSubnet = window.QuestVRBridge.getDeviceSubnet(); } catch (e) {}
    }
    if (nativeSubnet) {
      const gw = nativeSubnet + '.1';
      if (!list.includes(gw)) list.push(gw);
    }
    bakedIps.forEach((ip) => { if (ip && !list.includes(ip) && ip !== 'localhost' && ip !== '127.0.0.1') list.push(ip); });
    const pcIp = storage.getItem('pc_server_ip');
    if (pcIp && !list.includes(pcIp) && pcIp !== 'localhost' && pcIp !== '127.0.0.1') list.push(pcIp);
    if (activeLaptopIp && !list.includes(activeLaptopIp) && activeLaptopIp !== 'localhost' && activeLaptopIp !== '127.0.0.1') list.push(activeLaptopIp);
    const saved = storage.getItem('V500_LAPTOP_IP');
    if (saved && !list.includes(saved) && saved !== 'localhost' && saved !== '127.0.0.1') list.push(saved);

    const gateways = ['192.168.1.1', '192.168.43.1', '192.168.137.1', '172.20.10.1', '192.168.0.1', '10.0.0.1', '192.168.2.1'];
    gateways.forEach((ip) => { if (!list.includes(ip)) list.push(ip); });

    if (loc && loc.hostname && loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1' && !list.includes(loc.hostname)) {
      list.push(loc.hostname);
    }
    return list;
  }

  async function checkHostAlive(ip, timeoutMs = 300) {
    if (!ip || syncMainBridgeConnection()) return null;
    const isLocal = (ip === 'localhost' || ip === '127.0.0.1');
    const isCurrentHost = (typeof window !== 'undefined' && window.location && (window.location.hostname === ip || (isLocal && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))));
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      let pingUrl;
      if (isCurrentHost && typeof window !== 'undefined' && window.location && window.location.origin) {
        pingUrl = `${window.location.origin}/api/bridge-ping`;
      } else {
        const isHttps = (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:');
        const proto = isHttps ? 'https:' : 'http:';
        const port = loc.port || (isHttps ? '8443' : '8080');
        pingUrl = `${proto}//${ip}:${port}/api/bridge-ping`;
      }
      const res = await fetch(pingUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (res.ok && !syncMainBridgeConnection()) {
        const data = await res.json();
        if (data && (data.ok || data.service === 'GOG808_LAPTOP_BRIDGE')) {
          if (data.wheel) ingestWheelData(data.wheel);
          if (data.car && data.car.ip) {
            state.rcCarIp = data.car.ip;
            storage.setItem('rc_car_ip', data.car.ip);
          }
          if (data.cams && typeof window.applyEsp32CameraIps === 'function') {
            window.applyEsp32CameraIps(data.cams);
          }
          return { ip, data };
        }
      }
    } catch (e) {
      if (timer) clearTimeout(timer);
    }
    return null;
  }

  function detectSubnetViaWebRtc() {
    return new Promise((resolve) => {
      try {
        const RTCPC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
        if (!RTCPC) return resolve(null);
        const pc = new RTCPC({ iceServers: [] });
        let done = false;
        const finish = (val) => {
          if (!done) {
            done = true;
            try { pc.close(); } catch (e) {}
            resolve(val);
          }
        };
        setTimeout(() => finish(null), 500);
        pc.createDataChannel('');
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => finish(null));
        pc.onicecandidate = (e) => {
          if (!e || !e.candidate || !e.candidate.candidate) return;
          const cand = e.candidate.candidate;
          const m = cand.match(/\b(192\.168\.\d+|10\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+)\.(\d+)\b/);
          if (m && m[1]) finish(m[1]);
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function performDeepNetworkDiscovery() {
    if (syncMainBridgeConnection() || getHostedServerHostname() || isScanningSubnet) return;
    isScanningSubnet = true;

    try {
      const candidates = getCandidateIps();
      const results = await Promise.all(candidates.map(ip => checkHostAlive(ip, 350)));
      if (syncMainBridgeConnection()) {
        isScanningSubnet = false;
        return;
      }
      const hit = results.find(Boolean);
      if (hit) {
        onServerFound(hit.ip, hit.data);
        isScanningSubnet = false;
        return;
      }

      showV500DiscoveryBanner('🔍 Đang tự động quét Wi-Fi tìm Laptop & Xe RC...');
      let nativeSubnet = null;
      if (typeof window !== 'undefined' && window.QuestVRBridge && typeof window.QuestVRBridge.getDeviceSubnet === 'function') {
        try { nativeSubnet = window.QuestVRBridge.getDeviceSubnet(); } catch (e) {}
      }
      const detectedSubnet = nativeSubnet || (await detectSubnetViaWebRtc());
      const subnets = [];
      if (detectedSubnet && !subnets.includes(detectedSubnet)) subnets.push(detectedSubnet);

      const commonSubnets = ['192.168.1', '192.168.43', '192.168.137', '192.168.0', '172.20.10', '10.0.0', '192.168.2'];
      commonSubnets.forEach((s) => { if (!subnets.includes(s)) subnets.push(s); });

      for (const prefix of subnets) {
        if (syncMainBridgeConnection()) { isScanningSubnet = false; return; }
        const batch = [];
        for (let i = 1; i <= 254; i++) batch.push(`${prefix}.${i}`);
        const batchSize = 45;
        for (let i = 0; i < batch.length; i += batchSize) {
          if (syncMainBridgeConnection()) { isScanningSubnet = false; return; }
          const chunk = batch.slice(i, i + batchSize);
          const chunkResults = await Promise.all(chunk.map(ip => checkHostAlive(ip, 280)));
          const found = chunkResults.find(Boolean);
          if (found) {
            onServerFound(found.ip, found.data);
            isScanningSubnet = false;
            return;
          }
        }
      }
    } catch (e) {}
    isScanningSubnet = false;
  }

  function onServerFound(foundIp, data) {
    if (syncMainBridgeConnection()) return;
    activeLaptopIp = foundIp;
    storage.setItem('V500_LAPTOP_IP', foundIp);
    storage.setItem('pc_server_ip', foundIp);
    window.__ACTIVE_DISCOVERED_IP__ = foundIp;
    connectWebSocketToIp(foundIp);

    if (data && data.cams && typeof window.applyEsp32CameraIps === 'function') {
      window.applyEsp32CameraIps(data.cams);
    }
  }

  function connectWebSocketToIp(ip) {
    if (!ip || syncMainBridgeConnection()) return;
    const isHttps = window.location.protocol === 'https:';
    const port = window.location.port || (isHttps ? '8443' : '8080');
    initMultiplayerClient(ip + ':' + port);
    hookMainMpSocket();
    syncMainBridgeConnection();
  }

  hookMainMpSocket();
  setInterval(() => {
    hookMainMpSocket();
    if (!syncMainBridgeConnection()) performDeepNetworkDiscovery();
  }, 3500);

  // 5. ĐIỀU KHIỂN BUỒNG LÁI & CÂN BẰNG TÂM GÓC NHÌN
  function triggerWheelAction(act) {
    if (typeof state === 'undefined' || !state) return;
    if (act === 'TURN_LEFT') {
      state.turnSignal = state.turnSignal === 'LEFT' ? 'OFF' : 'LEFT';
      state.turnSignalLeft = state.turnSignal === 'LEFT';
      if (state.turnSignalLeft) state.turnSignalRight = false;
    } else if (act === 'TURN_RIGHT') {
      state.turnSignal = state.turnSignal === 'RIGHT' ? 'OFF' : 'RIGHT';
      state.turnSignalRight = state.turnSignal === 'RIGHT';
      if (state.turnSignalRight) state.turnSignalLeft = false;
    } else if (act === 'HORN') {
      if (typeof playSmartVehicleHornSound === 'function') playSmartVehicleHornSound('CAR');
      else if (typeof playHornSound === 'function') playHornSound();
    } else if (act === 'ENTER_EXIT_CAR') {
      if (typeof window.enterOrExitCarWithBlink === 'function') window.enterOrExitCarWithBlink();
      else enterOrExitCarWithBlink();
    } else if (act === 'CYCLE_SEAT' && state.playerMode === 'DRIVING') {
      state.seatIndex = ((state.seatIndex || 0) + 1) % 4;
      if (typeof resetAndCenterViewpoint === 'function') resetAndCenterViewpoint('DRIVING', state.seatIndex);
    }
  }

  // 6. VÒNG LẶP VẬT LÝ XE V504 (AUTO-CREEP, LÙI SÂU 1100µs, CHỐNG KÉO LÙI XE)
  const carStateV504 = {
    ready: false,
    x: -3.2,
    z: -14.0,
    heading: 0,
    velMs: 0,
    lastValidPos: new THREE.Vector3(-3.2, 0, -14.0)
  };

  const prevBeforeRender = scene.onBeforeRender;
  let lastFrameMs = performance.now();
  let reportedRenderHookError = false;

  scene.onBeforeRender = function (rendererInst, sceneInst, cameraInst) {
    try {
      prevBeforeRender.call(this, rendererInst, sceneInst, cameraInst);
    } catch (error) {
      if (!reportedRenderHookError) {
        reportedRenderHookError = true;
        console.error('[WebXR] Scene render hook failed:', error);
      }
    }

    const now = performance.now();
    const dt = Math.min(Math.max((now - lastFrameMs) / 1000, 0.001), 0.05);
    lastFrameMs = now;

    if (typeof state === 'undefined' || !state || typeof vehicleRoot === 'undefined' || !vehicleRoot) return;

    const wheelFresh = liveWheel.connected && liveWheel.isPhysical && (now - liveWheel.updatedAt) <= 850;
    let steer = 0;
    let gas = 0;
    let brake = 0;
    const effWheelDrive = (typeof liveWheel.driveNorm === 'number' && Math.abs(liveWheel.driveNorm) > 0.02)
      ? liveWheel.driveNorm
      : (liveWheel.gasNorm - liveWheel.brakeNorm);

    const wheelMoved = wheelFresh && (
      Math.abs(liveWheel.steerNorm) > 0.02 ||
      Math.abs(effWheelDrive) > 0.02 ||
      liveWheel.gasNorm > 0.02 ||
      liveWheel.brakeNorm > 0.02
    );

    if (wheelMoved) {
      steer = liveWheel.steerNorm;
      gas = liveWheel.gasNorm;
      brake = liveWheel.brakeNorm;
    } else {
      carStateV504.x = vehicleRoot.position.x;
      carStateV504.z = vehicleRoot.position.z;
      carStateV504.heading = state.headingRad || vehicleRoot.rotation.y || 0;
      carStateV504.velMs = 0;
      carStateV504.lastValidPos.copy(vehicleRoot.position);
      return;
    }

    if (state.playerMode === 'DRIVING' && state.seatIndex === 0) {
      if (!carStateV504.ready) {
        carStateV504.x = vehicleRoot.position.x;
        carStateV504.z = vehicleRoot.position.z;
        carStateV504.heading = state.headingRad || vehicleRoot.rotation.y || 0;
        carStateV504.velMs = state.velocityMs || 0;
        carStateV504.lastValidPos.copy(vehicleRoot.position);
        carStateV504.ready = true;
      }

      state.engineRunning = true;
      state.steeringAngleDeg = steer * 540;
      if (typeof steeringWheelPivot !== 'undefined' && steeringWheelPivot) {
        steeringWheelPivot.rotation.z = -THREE.MathUtils.degToRad(state.steeringAngleDeg);
      }

      const frontYaw = THREE.MathUtils.degToRad((-state.steeringAngleDeg / 540) * 34);
      if (typeof wheelAssemblies !== 'undefined') {
        for (const w of wheelAssemblies) {
          if (w.isFrontWheel && w.steerMount) w.steerMount.rotation.y = frontYaw;
        }
      }

      if (effWheelDrive > 0.025 || (gas > 0.025 && effWheelDrive >= 0)) {
        state.gearIndex = 3;
        state.gear = 'D';
        const driveMag = Math.max(gas, effWheelDrive);
        state.throttlePercent = Math.round(driveMag * 100);
        state.brakePercent = 0;
        state.reversePercent = 0;
        carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, driveMag * VIRTUAL_FORWARD_SPEED_MS * getVirtualDrivingScale(), Math.min(1, dt * 3.2));
      } else if (effWheelDrive < -0.025) {
        const revMag = Math.abs(effWheelDrive);
        if (carStateV504.velMs > 1.0) {
          state.brakePercent = Math.round(revMag * 100);
          state.throttlePercent = 0;
          carStateV504.velMs = Math.max(0, carStateV504.velMs - 26.0 * revMag * dt);
        } else {
          state.gearIndex = 1;
          state.gear = 'R';
          state.reversePercent = Math.round(revMag * 100);
          state.throttlePercent = Math.round(revMag * 100);
          state.brakePercent = 0;
          carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, -revMag * VIRTUAL_REVERSE_SPEED_MS * getVirtualDrivingScale(), Math.min(1, dt * 4.2));
        }
      } else if (Math.abs(steer) > 0.04 && Math.abs(carStateV504.velMs) < 1.2) {
        state.gearIndex = 3;
        state.gear = 'D';
        state.throttlePercent = 18;
        carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, 3.0 * getVirtualDrivingScale(), dt * 3.5);
      } else {
        state.throttlePercent = 0;
        state.brakePercent = 0;
        state.reversePercent = 0;
        carStateV504.velMs = THREE.MathUtils.lerp(carStateV504.velMs, 0, dt * 3.2);
        if (Math.abs(carStateV504.velMs) < 0.03) carStateV504.velMs = 0;
      }

      if (Math.abs(steer) > 0.025 && Math.abs(carStateV504.velMs) > 0.03) {
        const sign = carStateV504.velMs < -0.03 ? -1 : 1;
        carStateV504.heading -= steer * 1.95 * sign * dt;
      }

      const step = carStateV504.velMs * dt;
      carStateV504.x -= Math.sin(carStateV504.heading) * step;
      carStateV504.z -= Math.cos(carStateV504.heading) * step;

      if (typeof state.wheelRotationRad === 'number') {
        state.wheelRotationRad += (step / 0.38);
      }
      if (typeof wheelAssemblies !== 'undefined' && Array.isArray(wheelAssemblies)) {
        for (const w of wheelAssemblies) {
          if (w.spinHub) w.spinHub.rotation.x = -state.wheelRotationRad;
        }
      }

      vehicleRoot.position.x = carStateV504.x;
      vehicleRoot.position.z = carStateV504.z;
      vehicleRoot.rotation.y = carStateV504.heading;
      carStateV504.lastValidPos.copy(vehicleRoot.position);

      state.headingRad = carStateV504.heading;
      state.velocityMs = carStateV504.velMs;
      state.speedKmh = Math.abs(carStateV504.velMs) * 3.6;
    }
  };
}
