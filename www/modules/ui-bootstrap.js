/** Browser DOM bindings and on-demand Supabase multi-screen synchronization. */

(function setupDeviceDetectionAndHamburgerMenu() {
  const ua = navigator.userAgent || '';
  const isQuestVR = /Quest|OculusBrowser|Pacific|VR|Headset/i.test(ua);
  const isTouchMobile = !isQuestVR && (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024));

  // Lưu trạng thái thiết bị toàn cục để app.js phân quyền nút bấm và góc nhìn
  window.__DETECTED_DEVICE_TYPE__ = isQuestVR ? 'VR_QUEST_3' : (isTouchMobile ? 'MOBILE_PHONE' : 'VR_OR_PC');

  if (!isTouchMobile) {
    // Nếu là Kính Meta Quest 3 hoặc PC: Xóa sạch giao diện điện thoại bị đè ở mép trên
    document.body.classList.remove('mobile-clean-ui', 'show-mobile-map', 'show-mobile-topbar');
    document.body.classList.add('device-vr-quest');
    // Ẩn các nút tự sinh của mobile nếu có
    window.addEventListener('DOMContentLoaded', () => {
      ['mob-lean', 'mob-swap', 'mob-door', 'mob-yt'].forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.parentElement) el.parentElement.style.display = 'none';
      });
      // Ẩn các thanh bar nhỏ màu vàng/xanh của mobile ở mép trên
      document.querySelectorAll('button, div').forEach((el) => {
        const txt = (el.textContent || '').trim();
        if ((txt === 'Lên/Xuống' || txt === 'Đổi Ghế' || txt === 'Thò Đầu' || txt.includes('Nghiêng ĐT')) && el.id !== 'btn-enter-exit-car') {
          if (el.parentElement && !el.closest('#function-panel') && el.parentElement.id !== 'top-bar') {
            el.parentElement.style.display = 'none';
          }
        }
      });
    });
  } else {
    document.body.classList.add('device-mobile-phone');
  }

  // Gắn sự kiện đóng/mở thanh Menu 3 gạch (☰)
  const menuBtn = document.getElementById('hamburger-menu-btn');
  const topBar = document.getElementById('top-bar');
  if (menuBtn && topBar) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = topBar.classList.toggle('menu-expanded');
      menuBtn.textContent = expanded ? '✖' : '☰';
      menuBtn.style.color = expanded ? '#ff3b30' : '#00ff88';
      menuBtn.style.borderColor = expanded ? '#ff3b30' : '#00ff88';
    });
  }
})();

// HỖ TRỢ CHẠY 100% OFFLINE KHI KẾT NỐI WI-FI SOFTAP CỦA ESP32 (KHÔNG BỊ TREO TẢI CDN)
let optionalSupabaseInit;
window.ensureOptionalSupabaseMultiScreen = function () {
  if (typeof navigator !== "undefined" && !navigator.onLine) return optionalSupabaseInit;
  return optionalSupabaseInit ??= initOptionalSupabaseMultiScreen();
};

async function initOptionalSupabaseMultiScreen() {
  try {
    const response = await fetch('/api/network-info');
    if (!response.ok) return;
    const { optionalSupabase } = await response.json();
    if (optionalSupabase?.url?.startsWith('https://') && optionalSupabase.anonKey) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(optionalSupabase.url, optionalSupabase.anonKey);
      const channel = supabase.channel("rolls-royce-vr-room", {
        config: { broadcast: { self: false } }
      });
      channel
        .on("broadcast", { event: "YT_MULTISCREEN_SYNC" }, ({ payload }) => {
          if (payload && window.playExtractedVideoUrlInFrame) {
            window.playExtractedVideoUrlInFrame({
              videoId: payload.videoId,
              title: payload.title,
              directUrl: payload.streamUrl,
              duration: payload.durationText
            });
          }
        })
        .subscribe();
      window.supabaseChannel = channel;
      return channel;
    }
  } catch (err) {
    console.info("[Offline Mode] Bỏ qua Supabase CDN; sử dụng WebSocket nội bộ để đồng bộ.");
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // 1. Thêm tùy chọn Màu Hồng Rose Quartz & Hồng Pastel vào bảng chọn màu xe (#car-color-select)
  const colorSelect = document.getElementById('car-color-select');
  if (colorSelect && !colorSelect.querySelector('option[value="#ff758f"]')) {
    const optPink1 = document.createElement('option');
    optPink1.value = '#ff758f';
    optPink1.textContent = '🌸 Hồng Rose Quartz (Mới - Bóng Dịu)';
    const optPink2 = document.createElement('option');
    optPink2.value = '#ffafcc';
    optPink2.textContent = '🌷 Hồng Pastel Sakura (Mới - Dễ Nhìn)';
    colorSelect.appendChild(optPink1);
    colorSelect.appendChild(optPink2);
  }

  // 2. Thêm hàng nút kích hoạt nhanh Chữa Cháy, Cấp Cứu Băng Ca & Ngồi Sau Xe Máy/Xe Đạp vào Bảng Chức Năng
  const worldTab = document.getElementById('tab-world');
  if (worldTab && !document.getElementById('v140-dispatch-row')) {
    const row = document.createElement('div');
    row.id = 'v140-dispatch-row';
    row.className = 'row';
    row.innerHTML = `
      <button id="btn-trigger-fire-event" class="act-btn" style="background:#ff4d6d;color:#fff;">🔥 Báo Cháy (Xe Cứu Hỏa Xịt Nước)</button>
      <button id="btn-trigger-ambulance" class="act-btn" style="background:#00bbf9;color:#000;">🚑 Gọi Cấp Cứu (Băng Ca)</button>
      <button id="btn-sit-pillion-bike" class="act-btn" style="background:#ffafcc;color:#000;">🛵 Ngồi Sau Xe Máy/Đạp NPC</button>
    `;
    worldTab.append(row);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  // Cập nhật danh sách phối màu & kiểu dáng Bespoke hoàn toàn mới (Bao gồm 3 phiên bản Màu Hồng Đặc Biệt)
  const colorSelect = document.getElementById('car-color-select');
  if (colorSelect) {
    colorSelect.innerHTML = `
      <option value="ROYAL_SAPPHIRE" selected>⚫ Đen Sapphire Nguyên Bản (Nappa Kem - Gỗ Óc Chó)</option>
      <option value="PINK_PEONY_GOLD">🌸 Hồng Mẫu Đơn Hoàng Gia (Phối Vàng Rose Gold - Ghế Hồng Kem)</option>
      <option value="PINK_SAKURA_WHITE">🌷 Hồng Đào Sakura (Mui Trắng Ngọc Trai - Nội Thất Trắng Hồng)</option>
      <option value="PINK_CYBER_CARBON">🌺 Hồng Cyber Rose (Nắp Capo Đen Carbon - Ghế Thể Thao Đen Viền Hồng)</option>
      <option value="MINT_TIFFANY_LUX">💎 Xanh Mint Tiffany (Mui Bạc Silk - Nội Thất Kem Sữa)</option>
      <option value="SUNSET_CORAL_GT">🧡 Cam San Hô GT (Bodykit Thể Thao - Ghế Da Cognac)</option>
      <option value="LAVENDER_VELVET">🔮 Tím Lavender Ánh Kim (Phối Bạc Chrome - Nội Thất Tím Nhung)</option>
      <option value="EMERALD_GOLD_VIP">🟢 Xanh Lục Bảo Hoàng Gia (Viền Vàng 24K - Nội Thất Da Bò)</option>
      <option value="PEARL_GLACIER_SKY">⚪ Trắng Băng Tuyết (Mui Xanh Băng - Nội Thất Xanh Navy)</option>
    `;
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const hvBar = document.getElementById('heavy-vehicle-cockpit-bar');
  if (!hvBar) return;

  // Gắn class phân loại cho các nút ghế Bus và nút Nóc Vòi Xịt Cứu Hỏa
  ['btn-seat-left-row', 'btn-seat-right-row', 'btn-seat-rear-end', 'btn-seat-driver-cab'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.add('bus-only-seat-btn');
  });
  ['btn-fire-roof-turret', 'btn-spray-water-cannon'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.add('fire-only-turret-btn');
  });

  // Thêm nút Bật/Tắt Còi Hú Đặc Biệt khi ngồi trên ghế Nóc Vòi Xịt Xe Cứu Hỏa
  if (!document.getElementById('btn-turret-siren-wail')) {
    const sirenBtn = document.createElement('button');
    sirenBtn.id = 'btn-turret-siren-wail';
    sirenBtn.className = 'hv-btn fire-only-turret-btn';
    sirenBtn.style.cssText = 'background:#ffd60a;color:#000;';
    sirenBtn.textContent = '🚨 Bật Còi Hú Vòi Xịt (Siren)';
    hvBar.appendChild(sirenBtn);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const worldTab = document.getElementById('tab-world');
  if (!worldTab || document.getElementById('v155-dome-light-row')) return;

  const domeRow = document.createElement('div');
  domeRow.id = 'v155-dome-light-row';
  domeRow.className = 'row';
  domeRow.style.cssText = 'background:rgba(212,175,55,0.12);padding:6px 8px;border-radius:6px;border:1px solid #d4af37;margin-top:6px;';
  domeRow.innerHTML = `
    <label style="width:155px;color:#ffd60a;">
      💡 Đèn Trần [<span id="dome-veh-name">RR</span>] (<span id="val-dome-light">1.8</span>x):
    </label>
    <input id="slider-dome-light" type="range" min="0.0" max="5.0" step="0.1" value="1.8" />
    <button id="btn-dome-color-cycle" class="act-btn" style="background:#ffd60a;color:#000;flex:0.48;">
      🎨 Đổi Ánh Đèn
    </button>
  `;
  worldTab.append(domeRow);
});

window.addEventListener('DOMContentLoaded', () => {
  // Xóa các thanh nút trùng lặp ở mép trên trên điện thoại (như nút紫 Menu bị đè lên nút 3 gạch)
  document.querySelectorAll('button, div').forEach((el) => {
    const txt = (el.textContent || '').trim();
    if (txt === '☰ Menu' || txt === '🧭 Nghiêng 360°: TẮT' || txt === '🗺️ Map') {
      if (el.parentElement && el.parentElement.id !== 'top-bar' && el.parentElement.id !== 'v160-mobile-minimal-dock') {
        el.parentElement.style.display = 'none';
      }
    }
  });

  // Nút Fullscreen đa nền tảng (Hỗ trợ cả Android Fullscreen API và iOS Safari Viewport Lock)
  const fsBtn = document.getElementById('v160-mob-fs');
  fsBtn?.addEventListener('click', () => {
    const docEl = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => {});
      else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
      window.scrollTo(0, 1);
      document.body.classList.toggle('mobile-immersive-fs');
      fsBtn.textContent = '🗗 Thoát';
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      fsBtn.textContent = '⛶ Full';
    }
  });

  document.getElementById('v160-mob-door')?.addEventListener('click', () => {
    document.getElementById('btn-enter-exit-car')?.click();
  });
  document.getElementById('v160-mob-npc-car')?.addEventListener('click', () => {
    document.getElementById('btn-board-npc-vehicle')?.click();
  });
  document.getElementById('v160-mob-swap')?.addEventListener('click', () => {
    document.getElementById('btn-swap-driver')?.click();
  });
  document.getElementById('v160-mob-center')?.addEventListener('click', () => {
    if (typeof window.autoCenterBalancePassengerView === 'function') window.autoCenterBalancePassengerView();
  });
  document.getElementById('v160-mob-yt')?.addEventListener('click', () => {
    document.getElementById('btn-open-yt-modal')?.click();
  });

  // Giữ nút "🏃 Đi Tới (Giữ)" trên điện thoại để đi bộ hoặc đạp ga mượt mà
  const walkBtn = document.getElementById('v160-mob-walk');
  const padUp = document.getElementById('pad-up');
  if (walkBtn && padUp) {
    const startMove = (e) => {
      e.preventDefault();
      padUp.dispatchEvent(new PointerEvent('pointerdown'));
    };
    const stopMove = () => {
      padUp.dispatchEvent(new PointerEvent('pointerup'));
    };
    walkBtn.addEventListener('pointerdown', startMove);
    walkBtn.addEventListener('pointerup', stopMove);
    walkBtn.addEventListener('pointerleave', stopMove);
    walkBtn.addEventListener('pointercancel', stopMove);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const worldTab = document.getElementById('tab-world');
  if (worldTab && !document.getElementById('v165-toan-garage-row')) {
    const template = document.getElementById('garage-controls-template');
    if (template) worldTab.prepend(template.content.cloneNode(true));
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const dock = document.getElementById('v160-mobile-minimal-dock');
  if (dock && !document.getElementById('v170-dock-tilt360')) {
    const tiltBtn = document.createElement('button');
    tiltBtn.id = 'v170-dock-tilt360';
    tiltBtn.className = 'mob-min-btn';
    tiltBtn.style.cssText = 'background:#00e5ff;color:#000;';
    tiltBtn.textContent = '🧭 360° BẬT';
    tiltBtn.addEventListener('click', () => {
      document.getElementById('btn-v170-tilt-360')?.click();
      const mainBtn = document.getElementById('btn-v170-tilt-360');
      if (mainBtn) {
        tiltBtn.textContent = mainBtn.textContent.includes('BẬT') ? '🧭 360° BẬT' : '🧭 360° TẮT';
      }
    });
    dock.appendChild(tiltBtn);

    const doorBtn = document.createElement('button');
    doorBtn.id = 'v170-dock-roller';
    doorBtn.className = 'mob-min-btn';
    doorBtn.style.cssText = 'background:#ffd60a;color:#000;';
    doorBtn.textContent = '🚪 Cửa Gara';
    doorBtn.addEventListener('click', () => {
      document.getElementById('btn-v170-roller-door')?.click();
    });
    dock.appendChild(doorBtn);
  }
});

(function fixThreeWayDeviceClassification() {
  const ua = navigator.userAgent || '';
  const isQuestVR = /Quest|OculusBrowser|Pacific|VR|Headset/i.test(ua);
  const isTouchMobile = !isQuestVR && (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024));

  document.body.classList.remove('device-vr-quest', 'device-mobile-phone', 'device-pc-desktop');

  if (isQuestVR) {
    window.__DETECTED_DEVICE_TYPE__ = 'VR_QUEST_3';
    document.body.classList.add('device-vr-quest');
  } else if (isTouchMobile) {
    window.__DETECTED_DEVICE_TYPE__ = 'MOBILE_PHONE';
    document.body.classList.add('device-mobile-phone');
  } else {
    window.__DETECTED_DEVICE_TYPE__ = 'PC_DESKTOP';
    document.body.classList.add('device-pc-desktop');
  }
})();

function initV250Esp32HwBox() {
  const legacyTab = document.getElementById('tab-camera-legacy');
  if (legacyTab && !document.getElementById('v250-esp32-hw-box')) {
    const hwBox = document.createElement('div');
    hwBox.id = 'v250-esp32-hw-box';
    hwBox.style.cssText = 'background:rgba(0,229,255,0.08);border:1.5px solid #00e5ff;border-radius:10px;padding:8px;margin-bottom:8px;';
    hwBox.innerHTML = `
      <div style="font-weight:800;color:#00e5ff;font-size:12px;margin-bottom:6px;">
        📡 KẾT NỐI ĐỒNG BỘ ESP32 & VÔ LĂNG GOG808 (HTTP & HTTPS):
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:6px;">
        <input id="v250-ip-front" type="text" placeholder="IP Cam Trước (VD: 192.168.1.101)" style="background:#0f172a;color:#00ff88;border:1px solid #334155;border-radius:5px;padding:4px;font-size:11px;" />
        <input id="v250-ip-rear" type="text" placeholder="IP Cam Lùi (VD: 192.168.1.102)" style="background:#0f172a;color:#ffd60a;border:1px solid #334155;border-radius:5px;padding:4px;font-size:11px;" />
        <input id="v250-ip-ctrl" type="text" placeholder="IP Mạch Xe (VD: 192.168.1.100)" style="background:#0f172a;color:#38bdf8;border:1px solid #334155;border-radius:5px;padding:4px;font-size:11px;" />
      </div>
      <div class="row" style="gap:4px;">
        <button id="v250-btn-connect-all" class="act-btn" style="background:#00ff88;color:#000;font-weight:700;">🔗 Kết Nối Cả 2 Cam & Mạch Xe</button>
        <button id="v250-btn-toggle-cam-hud" class="act-btn" style="background:#0284c7;color:#fff;">👁️ Ẩn/Hiện Cửa Sổ 2 Cam</button>
        <button id="v250-btn-test-esp32" class="act-btn" style="background:#f59e0b;color:#000;">⚡ Test Nhích Ga Xe Thật</button>
      </div>
      <div id="v250-hw-telemetry-bar" style="font-size:11px;color:#e2e8f0;margin-top:5px;font-family:monospace;">
        🎮 Thiết bị: Đang quét GOG808 / Tay cầm Quest 3... | 📡 ESP32: Chờ lệnh
      </div>
    `;
    legacyTab.append(hwBox);
  }
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initV250Esp32HwBox);
} else {
  initV250Esp32HwBox();
}
