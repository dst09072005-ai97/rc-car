const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. ĐỌC VÀ CẬP NHẬT APP.JS
const appJsPath = path.join(rootDir, 'app.js');
let appCode = fs.readFileSync(appJsPath, 'utf8');

const oldSwitcherRegex = /async function setupSeamless3D2DSwitcher\(\)[\s\S]*?^setupSeamless3D2DSwitcher\(\);/m;

const newSwitcherCode = `async function setupSeamless3D2DSwitcher() {
  if (!smartVrBtn) return;

  // Khởi tạo sẵn cấu hình IP Server Máy tính trong localStorage (Mặc định 192.168.1.32 để người dùng không phải nhập tay)
  if (typeof localStorage !== 'undefined' && !localStorage.getItem('pc_server_ip')) {
    const fallbackDefaultIp = (typeof window !== 'undefined' && window.QuestVRBridge && typeof window.QuestVRBridge.getDefaultHostIp === 'function')
      ? window.QuestVRBridge.getDefaultHostIp()
      : '192.168.1.32';
    localStorage.setItem('pc_server_ip', fallbackDefaultIp);
  }

  // Kết nối ô cấu hình IP Máy tính (#pc-server-ip-input)
  const pcIpInput = document.getElementById('pc-server-ip-input');
  const btnSavePcIp = document.getElementById('btn-save-pc-ip');
  if (pcIpInput) {
    const curIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || '192.168.1.32';
    pcIpInput.value = curIp;
    const saveIp = () => {
      const val = pcIpInput.value.trim();
      if (val && typeof localStorage !== 'undefined') {
        localStorage.setItem('pc_server_ip', val);
        state.lastActionLog = \`💾 Đã lưu IP máy tính VR: \${val}\`;
      }
    };
    pcIpInput.addEventListener('change', saveIp);
    if (btnSavePcIp) btnSavePcIp.addEventListener('click', saveIp);
  }

  smartVrBtn.addEventListener('click', async () => {
    initAudio();

    // 1. Nếu đang ở trong phiên WebXR 360° thực sự, bấm sẽ thoát ra cửa sổ 2D
    if (currentXrSession) {
      try { await currentXrSession.end(); } catch (e) {}
      currentXrSession = null;
      setImmersedWorldUIState(false);
      return;
    }

    // 2. Nếu đang ở chế độ Panorama 360° toàn cảnh, bấm lần nữa sẽ thoát về 2D
    if (isPanorama360Fallback) {
      isPanorama360Fallback = false;
      setImmersedWorldUIState(false);
      document.getElementById('quest-laser-cockpit')?.classList.remove('panel-hidden');
      return;
    }

    // 2.5 NẾU ĐANG CHẠY TRONG BẢN APK LAUNCHER TRÊN KÍNH META QUEST (MỤC UNAUTHORIZED / UNKNOWN SOURCES)
    // Tự động phóng sang Meta Quest Browser với URL HTTPS để kích hoạt Immersive WebXR 6DoF
    const isQuestApkLauncher = (typeof window !== 'undefined' && window.QuestVRBridge && typeof window.QuestVRBridge.launchQuestVR === 'function');
    if (isQuestApkLauncher) {
      let pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || '';
      if (!pcIp && typeof window.QuestVRBridge.getDefaultHostIp === 'function') {
        try { pcIp = window.QuestVRBridge.getDefaultHostIp(); } catch (e) {}
      }
      if (!pcIp) pcIp = '192.168.1.32';
      if (typeof localStorage !== 'undefined') localStorage.setItem('pc_server_ip', pcIp);

      const vrTargetUrl = \`https://\${pcIp}:8443/?vr=immersive\`;
      state.lastActionLog = \`🚀 Đang tự động phóng sang Meta Quest Browser Immersive VR (\${pcIp})...\`;
      try {
        window.QuestVRBridge.launchQuestVR(vrTargetUrl);
        return;
      } catch (bridgeErr) {
        console.warn('[QuestVRBridge] Lỗi gọi launchQuestVR:', bridgeErr);
      }
    }

    // 3. KÍCH HOẠT WEBXR 'immersive-vr' CHUẨN (KHÔNG DÙNG dom-overlay ĐỂ TRÁNH KẸT CỬA SỔ 2D!)
    if ('xr' in navigator) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-vr');
        if (supported) {
          const session = await navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
          });
          try {
            renderer.xr.setReferenceSpaceType('local-floor');
            await renderer.xr.setSession(session);
          } catch (refErr) {
            console.warn('[WebXR] Fallback reference space sang local:', refErr);
            renderer.xr.setReferenceSpaceType('local');
            await renderer.xr.setSession(session);
          }
          currentXrSession = session;
          setImmersedWorldUIState(true);
          smartVrBtn.textContent = '🚪 THOÁT VR 360° VỀ CỬA SỔ 2D';
          smartVrBtn.className = 'bar-btn btn-exit-2d';
          state.lastActionLog = '🥽 Đã vào Thế giới Ảo VR 360° toàn phần (Nhìn 360° xung quanh hoàn toàn là thế giới 3D)!';

          session.addEventListener('end', () => {
            currentXrSession = null;
            setImmersedWorldUIState(false);
          });
          return;
        }
      } catch (err) {
        console.warn('WebXR direct session fallback:', err);
      }
    }

    // 4. CHẾ ĐỘ TOÀN CẢNH 360° TRỰC TIẾP (Ẩn toàn bộ khung 2D vướng mắt, mở rộng FOV 360° xoay tự do bằng con quay hồi chuyển / tay cầm / chuột)
    isPanorama360Fallback = true;
    setImmersedWorldUIState(true);
    camera.fov = 88;
    camera.updateProjectionMatrix();
    smartVrBtn.textContent = '🚪 THOÁT TOÀN CẢNH 360° VỀ 2D';
    smartVrBtn.className = 'bar-btn btn-exit-2d';
    state.lastActionLog = '🌐 Đã bật chế độ Toàn Cảnh 3D 360°! Dùng Tay cầm / Xoay kính / Kéo chuột để nhìn 360° quanh xe!';
  });
}
setupSeamless3D2DSwitcher();

// ----------------------------------------------------------------------------
// HỖ TRỢ AUTO-ENTER VÀO BUỒNG LÁI VR KHI MỞ BẰNG ?vr=immersive TRÊN META QUEST BROWSER
// ----------------------------------------------------------------------------
(function setupAutoEnterVrFromQuestIntent() {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  if (p.get('vr') === 'immersive' && !window.QuestVRBridge) {
    window.addEventListener('DOMContentLoaded', () => {
      const vrPrompt = document.createElement('div');
      vrPrompt.id = 'vr-immersive-intent-prompt';
      vrPrompt.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;background:rgba(8,16,32,0.95);border:2px solid #00ff88;box-shadow:0 0 35px rgba(0,255,136,0.65);border-radius:18px;padding:22px 30px;text-align:center;font-family:sans-serif;color:#fff;backdrop-filter:blur(10px);cursor:pointer;user-select:none;';
      vrPrompt.innerHTML = '<div style="font-size:42px;margin-bottom:8px;">🥽</div><div style="font-size:18px;font-weight:bold;color:#00ff88;margin-bottom:6px;">BẤM VÀO ĐÂY ĐỂ VÀO BUỒNG LÁI VR 360°</div><div style="font-size:12px;color:#a0c0e0;">(Tự động chuyển từ Launcher 2D sang Không gian Ảo 6DoF)</div>';
      vrPrompt.addEventListener('click', () => {
        vrPrompt.remove();
        if (typeof smartVrBtn !== 'undefined' && smartVrBtn) smartVrBtn.click();
      });
      document.body.appendChild(vrPrompt);

      if (typeof navigator !== 'undefined' && navigator.xr && typeof navigator.xr.offerSession === 'function') {
        navigator.xr.offerSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
        }).then(async (session) => {
          if (vrPrompt.parentNode) vrPrompt.remove();
          try {
            renderer.xr.setReferenceSpaceType('local-floor');
            await renderer.xr.setSession(session);
          } catch (e) {
            renderer.xr.setReferenceSpaceType('local');
            await renderer.xr.setSession(session);
          }
          currentXrSession = session;
          setImmersedWorldUIState(true);
        }).catch(() => {});
      }
    });
  }
})();`;

if (!oldSwitcherRegex.test(appCode)) {
  console.error('Không tìm thấy khối setupSeamless3D2DSwitcher trong app.js');
  process.exit(1);
}

appCode = appCode.replace(oldSwitcherRegex, newSwitcherCode);

// 2. ĐỌC VÀ CẬP NHẬT INDEX.HTML
const indexHtmlPath = path.join(rootDir, 'index.html');
let indexCode = fs.readFileSync(indexHtmlPath, 'utf8');

const targetSectionTitle = '<div class="section-title">🚘 2. Kết Nối Phần Cứng Xe Thật (ESP32 Car &amp; Cam)</div>';
const pcIpSnippet = `    <!-- CẤU HÌNH IP MÁY TÍNH ĐỂ PHÓNG TỰ ĐỘNG SANG META QUEST BROWSER IMMERSIVE VR -->
    <div class="row" style="background:rgba(0,255,136,0.08);padding:6px;border-radius:6px;border:1px solid rgba(0,255,136,0.3);flex-direction:column;gap:4px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <label style="font-weight:bold;color:#00ff88;font-size:11.5px;width:auto;">🖥️ Máy Tính Chạy Server (VR Host):</label>
        <span style="font-size:10px;color:#a0e0ff;">Tự động lưu vĩnh viễn</span>
      </div>
      <div style="display:flex;gap:5px;width:100%;">
        <input id="pc-server-ip-input" type="text" placeholder="192.168.1.32" value="192.168.1.32" style="flex:1;font-family:monospace;background:#0f172a;color:#00ff88;border:1px solid #334155;border-radius:4px;padding:4px 6px;font-size:11px;" />
        <button id="btn-save-pc-ip" class="act-btn" style="background:#00ff88;color:#000;font-weight:bold;flex:0.4;">💾 Lưu IP</button>
      </div>
    </div>\n\n`;

if (!indexCode.includes('id="pc-server-ip-input"')) {
  if (indexCode.includes(targetSectionTitle)) {
    indexCode = indexCode.replace(targetSectionTitle, pcIpSnippet + targetSectionTitle);
  }
}

// 3. ĐỒNG BỘ GHI TẤT CẢ CÁC VỊ TRÍ
const filesToWrite = [
  [appJsPath, appCode],
  [path.join(rootDir, 'www/app.js'), appCode],
  [path.join(rootDir, 'server/public/app.js'), appCode],
  [path.join(rootDir, 'android/app/src/main/assets/public/app.js'), appCode],
  [indexHtmlPath, indexCode],
  [path.join(rootDir, 'www/index.html'), indexCode],
  [path.join(rootDir, 'android/app/src/main/assets/public/index.html'), indexCode]
];

for (const [fPath, content] of filesToWrite) {
  if (fs.existsSync(path.dirname(fPath))) {
    fs.writeFileSync(fPath, content, 'utf8');
    console.log('[SYNC] Đã cập nhật:', path.relative(rootDir, fPath));
  }
}

console.log('✅ Hoàn tất vá và đồng bộ mã nguồn!');
