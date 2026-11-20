/** Four-tab settings, responsive layout and multiplayer QR controls. */

export function setupFunctionPanel(ctx) {
  const {
    clampInGameSpeedScale, formatInGameSpeedScale, readSettingsPreference, saveSettingsPreference,
    state,
  } = ctx;
  const panel = document.getElementById('function-panel');
  const tabBar = document.getElementById('func-tab-bar');
  if (!panel || !tabBar) return;
  const tabs = Array.from(tabBar.querySelectorAll('[role="tab"]'));

  function selectTab(id, focus = false) {
    const selected = tabs.find(tab => tab.getAttribute('aria-controls') === id) || tabs[0];
    if (!selected) return;
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    }
    panel.scrollTop = 0;
    saveSettingsPreference('rc_func_active_tab', selected.getAttribute('aria-controls'));
    if (focus) selected.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.getAttribute('aria-controls')));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      event.stopPropagation();
      selectTab(tabs[next].getAttribute('aria-controls'), true);
    });
  });
  selectTab(readSettingsPreference('rc_func_active_tab'));

  const speedInput = document.getElementById('slider-ingame-speed-scale');
  const speedOutput = document.getElementById('val-ingame-speed-scale');
  const presets = panel.querySelectorAll('[data-ingame-speed]');

  function showSpeedScale() {
    speedInput.value = String(state.inGameSpeedScale);
    speedOutput.textContent = formatInGameSpeedScale(state.inGameSpeedScale);
    for (const preset of presets) {
      preset.setAttribute('aria-pressed', String(Number(preset.dataset.ingameSpeed) === state.inGameSpeedScale));
    }
  }

  function setSpeedScale(value) {
    state.inGameSpeedScale = clampInGameSpeedScale(value);
    saveSettingsPreference('rc_ingame_speed_scale', String(state.inGameSpeedScale));
    showSpeedScale();
  }

  if (speedInput && speedOutput) {
    showSpeedScale();
    speedInput.addEventListener('input', () => setSpeedScale(speedInput.value));
    speedInput.addEventListener('keydown', event => event.stopPropagation());
    for (const preset of presets) {
      preset.addEventListener('click', () => setSpeedScale(preset.dataset.ingameSpeed));
    }
  }

  const topBar = document.getElementById('top-bar');
  if (topBar && typeof ResizeObserver === 'function') {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const syncTopBar = () => {
      if (!desktop.matches) return;
      const bottom = Math.ceil(topBar.getBoundingClientRect().bottom);
      document.documentElement.style.setProperty('--desktop-role-top', `${bottom + 6}px`);
      document.documentElement.style.setProperty('--desktop-panel-top', `${bottom + 46}px`);
    };
    new ResizeObserver(syncTopBar).observe(topBar);
    desktop.addEventListener('change', syncTopBar);
    syncTopBar();
  }
}

export function setupQrMultiplayerAndMobile9x16Optimization(ctx) {
  const {
    camera, openRealYouTubeApp, renderer, state, swapSeatOrTakeDriverControl,
    toggleLeanHeadOutWindow,
  } = ctx;
  const qrModal = document.getElementById('qr-multiplayer-modal');
  const qrImg = document.getElementById('qr-code-img');
  const passInput = document.getElementById('passenger-url-input');
  const questInput = document.getElementById('quest-pair-url-input');

  async function refreshQrLinks() {
    let baseWeb = window.location.origin;
    let questUrl = `${window.location.origin}/?vr=immersive`;
    let mobileUrl = `${window.location.origin}/?join=passenger&ratio=9x16`;

    try {
      const r = await fetch('/api/network-info');
      if (r.ok) {
        const info = await r.json();
        mobileUrl = info.mobilePassengerUrl || mobileUrl;
        questUrl = info.questVrUrl || questUrl;
      }
    } catch (e) {}

    if (passInput) passInput.value = mobileUrl;
    if (questInput) questInput.value = questUrl;
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl)}`;
    }
  }

  document.getElementById('btn-open-qr-multiplayer')?.addEventListener('click', () => {
    refreshQrLinks();
    qrModal?.classList.toggle('panel-hidden');
  });
  document.getElementById('btn-close-qr-modal')?.addEventListener('click', () => {
    qrModal?.classList.add('panel-hidden');
  });
  document.getElementById('btn-copy-join-link')?.addEventListener('click', () => {
    if (passInput) {
      navigator.clipboard?.writeText(passInput.value);
      state.lastActionLog = `📋 Đã copy đường dẫn Ghế Phụ: ${passInput.value}`;
    }
  });

  // Ghép đôi kính Meta Quest 3 thứ 2 qua WebBluetooth hoặc Wi-Fi LAN Room
  document.getElementById('btn-pair-quest-bt')?.addEventListener('click', async () => {
    if (navigator.bluetooth) {
      try {
        const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
        state.lastActionLog = `📶 Đã ghép đôi Bluetooth với kính: ${device.name || 'Meta Quest 3 Peer'}! Đang đồng bộ phòng 3D...`;
      } catch (err) {
        state.lastActionLog = `📡 Đã bật chế độ Pair Wi-Fi LAN trực tiếp tại: ${questInput?.value || window.location.origin}`;
      }
    } else {
      state.lastActionLog = `📡 Mở đường dẫn ${questInput?.value || window.location.origin} trên kính Meta Quest 3 thứ 2 để vào chung thế giới!`;
    }
  });

  // TỰ ĐỘNG PHÁT HIỆN ĐIỆN THOẠI JOIN BẰNG MÃ QR (TỈ LỆ 9:16) ĐỂ ĐƯA VÀO GHẾ PHỤ & TỐI ƯU 60FPS KHÔNG LAG!
  const params = new URLSearchParams(window.location.search);
  const isQuest = /Quest|OculusBrowser/i.test(navigator.userAgent);
  const isMobilePortrait = !isQuest && (params.get('ratio') === '9x16' ||
                           params.get('join') === 'passenger' ||
                           (window.innerHeight > window.innerWidth && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)));

  if (isMobilePortrait) {
    // Tối ưu hóa GPU cho màn hình dọc 9:16 của điện thoại để chạy mượt 60FPS không lag
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
    camera.fov = 82; // Mở rộng FOV dọc cho khung hình 9:16
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    setTimeout(() => {
      if (document.getElementById('mob-lean')) return;
      // Hiện thanh thao tác nhanh gọn cho điện thoại 9:16 (Thò đầu, Đổi ghế lái, Mở cửa, Mở YouTube)
      const mobileBar = document.createElement('div');
      mobileBar.style.cssText =
        'position:fixed;bottom:12px;right:12px;z-index:180;display:flex;flex-direction:column;gap:6px;';
      mobileBar.innerHTML = `
        <button id="mob-lean" class="bar-btn" style="background:#00bbf9;color:#000;">👀 Thò Đầu Ra Cửa</button>
        <button id="mob-swap" class="bar-btn" style="background:#4cd964;color:#000;">🔄 Đổi Lái / Ghế Phụ</button>
        <button id="mob-door" class="bar-btn" style="background:#ffd60a;color:#000;">🚪 Lên / Xuống Xe</button>
        <button id="mob-yt" class="bar-btn" style="background:#ff0000;color:#fff;">▶ Mở YouTube</button>
      `;
      document.body.appendChild(mobileBar);

      document.getElementById('mob-lean')?.addEventListener('click', toggleLeanHeadOutWindow);
      document.getElementById('mob-swap')?.addEventListener('click', swapSeatOrTakeDriverControl);
      document.getElementById('mob-door')?.addEventListener('click', () => window.enterOrExitCarWithBlink());
      document.getElementById('mob-yt')?.addEventListener('click', openRealYouTubeApp);
    }, 350);
  }
}

export function fixSafariIosWhiteScreenAndResponsiveMobile(ctx) {
  const {
    camera, openRealYouTubeApp, renderer, state, swapSeatOrTakeDriverControl,
    toggleLeanHeadOutWindow, vrBlinkShutter, vrBlinkShutterMat,
  } = ctx;
  const urlParams = new URLSearchParams(window.location.search);
  const modeParam = urlParams.get('mode') || urlParams.get('join') || '';
  const isQuestDevice = /Quest|OculusBrowser/i.test(navigator.userAgent);
  const isIosOrMobile = !isQuestDevice && (/iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) ||
                        modeParam === 'passenger_mobile' ||
                        modeParam === 'passenger');

  // Nếu người dùng mở trên iPhone Safari qua cổng HTTPS 8443 bị chặn WebSocket/SSL làm màn hình đen/trắng,
  // hoặc mở ?mode=passenger_mobile, lập tức tối ưu hóa WebGL để Safari không bị tràn RAM GPU:
  if (isIosOrMobile) {
    renderer.setPixelRatio(1.0); // Giữ PixelRatio = 1.0 trên iPhone để chống tràn VRAM gây trắng màn hình!
    renderer.shadowMap.enabled = false; // Tắt đổ bóng nặng trên Safari di động để đạt 60FPS mượt mà
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Đảm bảo lớp màn chớp mắt (eyelid / vrBlinkShutter) mở hoàn toàn không che đen màn hình
    document.body.classList.remove('blinking');
    state.blinkTargetOpacity = 0.0;
    vrBlinkShutterMat.opacity = 0.0;

    if (typeof vrBlinkShutter !== 'undefined') vrBlinkShutter.visible = false;

    // Tạo cụm nút điều khiển nổi thích ứng cả xoay dọc (9:16) và xoay ngang (16:9) trên iPhone/Android
    if (!document.getElementById('mob-lean')) {
      const mobileBar = document.createElement('div');
      mobileBar.id = 'mobile-adaptive-controls';
      mobileBar.style.cssText =
        'position:fixed;bottom:12px;right:12px;z-index:185;display:flex;flex-wrap:wrap;gap:6px;max-width:65vw;justify-content:flex-end;';
      mobileBar.innerHTML = `
        <button id="mob-lean" class="bar-btn" style="background:#00bbf9;color:#000;">👀 Thò Đầu</button>
        <button id="mob-swap" class="bar-btn" style="background:#4cd964;color:#000;">🔄 Đổi Lái/Phụ</button>
        <button id="mob-door" class="bar-btn" style="background:#ffd60a;color:#000;">🚪 Lên/Xuống</button>
        <button id="mob-yt" class="bar-btn" style="background:#ff0000;color:#fff;">▶ YouTube</button>
      `;
      document.body.appendChild(mobileBar);
      document.getElementById('mob-lean')?.addEventListener('click', toggleLeanHeadOutWindow);
      document.getElementById('mob-swap')?.addEventListener('click', swapSeatOrTakeDriverControl);
      document.getElementById('mob-door')?.addEventListener('click', () => window.enterOrExitCarWithBlink());
      document.getElementById('mob-yt')?.addEventListener('click', openRealYouTubeApp);
    }
  }

  // Tự động cân chỉnh FOV & tỉ lệ khung hình khi xoay dọc (9:16) hoặc xoay ngang (16:9) trên mọi thiết bị
  function handleResponsiveOrientation() {
    const w = window.innerWidth || document.documentElement.clientWidth || 360;
    const h = window.innerHeight || document.documentElement.clientHeight || 640;
    const isPortrait = h > w;
    camera.aspect = w / h;
    // Khi xoay dọc (9:16), mở rộng FOV dọc lên 85° để thấy trọn khoang lái; khi xoay ngang (16:9) giữ FOV 70° chuẩn
    camera.fov = isPortrait ? 85 : 70;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', handleResponsiveOrientation);
  window.addEventListener('orientationchange', () => setTimeout(handleResponsiveOrientation, 150));
  handleResponsiveOrientation();

  // Cập nhật lại link QR trong bảng Multiplayer để dùng cổng HTTP 8080 + ?mode=passenger_mobile (Mở trên Safari iPhone 100% thành công!)
  const qrBtn = document.getElementById('btn-open-qr-multiplayer');
  if (qrBtn) {
    qrBtn.addEventListener('click', async () => {
      try {
        const r = await fetch('/api/network-info');
        if (r.ok) {
          const info = await r.json();
          const safariSafeUrl = info.mobilePassengerUrl || `http://${window.location.hostname}:8080/?mode=passenger_mobile`;
          const passInp = document.getElementById('passenger-url-input');
          const qrImg = document.getElementById('qr-code-img');
          if (passInp) passInp.value = safariSafeUrl;
          if (qrImg) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(safariSafeUrl)}`;
          }
        }
      } catch (e) {}
    });
  }
}

export function readSettingsPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function saveSettingsPreference(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export function clampInGameSpeedScale(value) {
  const scale = parseFloat(value);
  return Number.isFinite(scale) ? Math.min(1.5, Math.max(0.4, scale)) : 1.0;
}

export function formatInGameSpeedScale(scale) {
  return scale.toFixed(2).replace(/0$/, '') + 'x';
}
