const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. CẬP NHẬT MAINACTIVITY.JAVA
const mainActivityPath = path.join(rootDir, 'android/app/src/main/java/com/luxuryvr/rollsroyce/quest3/MainActivity.java');
const mainActivityCode = `package com.luxuryvr.rollsroyce.quest3;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean isVrBridgeRegistered = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupVrBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupVrBridge();
    }

    private void setupVrBridge() {
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            if (!isVrBridgeRegistered) {
                webView.addJavascriptInterface(new QuestVRNativeBridge(), "QuestVRBridge");
                isVrBridgeRegistered = true;
            }
        }
    }

    public class QuestVRNativeBridge {
        @JavascriptInterface
        public void launchQuestVR(final String vrUrl) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(vrUrl));
                        intent.setPackage("com.oculus.browser");
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        try {
                            Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(vrUrl));
                            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(fallback);
                        } catch (Exception ex) {
                            Toast.makeText(MainActivity.this, "Lỗi kích hoạt VR: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public String getDefaultHostIp() {
            return "192.168.1.32";
        }
    }
}
`;

fs.writeFileSync(mainActivityPath, mainActivityCode, 'utf8');
console.log('✅ Đã cập nhật MainActivity.java với setupVrBridge tại onCreate & onResume!');

// 2. CẬP NHẬT APP.JS
const appJsPath = path.join(rootDir, 'app.js');
let appCode = fs.readFileSync(appJsPath, 'utf8');

// Định nghĩa helper getAppServerHost & getAppWsProtocol
const serverHostHelper = `// ----------------------------------------------------------------------------
// HELPER ĐỊNH TUYẾN MÁY CHỦ CHO CẢ WEB LOCALHOST VÀ APK TRÊN KÍNH META QUEST
// ----------------------------------------------------------------------------
function getAppServerIp() {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) {
    return localStorage.getItem('pc_server_ip').trim();
  }
  if (typeof window !== 'undefined' && window.QuestVRBridge && typeof window.QuestVRBridge.getDefaultHostIp === 'function') {
    try { return window.QuestVRBridge.getDefaultHostIp(); } catch (e) {}
  }
  return '192.168.1.32';
}

function getAppServerHost() {
  const isCapacitorOrApk = (
    (typeof window !== 'undefined' && window.QuestVRBridge) ||
    (typeof window !== 'undefined' && window.Capacitor) ||
    (typeof window !== 'undefined' && window.location.protocol === 'capacitor:') ||
    (typeof window !== 'undefined' && window.location.protocol === 'file:') ||
    (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port !== '8080' && window.location.port !== '8443')
  );
  if (isCapacitorOrApk) {
    return \`\${getAppServerIp()}:8080\`;
  }
  return window.location.host || 'localhost:8080';
}
`;

if (!appCode.includes('function getAppServerHost()')) {
  // Chèn vào ngay trước setupSeamless3D2DSwitcher
  appCode = appCode.replace('async function setupSeamless3D2DSwitcher()', serverHostHelper + '\nasync function setupSeamless3D2DSwitcher()');
}

// Cập nhật nút bấm 3D switcher để hỗ trợ cả window.open fallback nếu chưa gắn bridge
const oldSwitcherRegex = /async function setupSeamless3D2DSwitcher\(\)[\s\S]*?^setupSeamless3D2DSwitcher\(\);/m;
const newSwitcherCode = `async function setupSeamless3D2DSwitcher() {
  if (!smartVrBtn) return;

  // Khởi tạo sẵn cấu hình IP Server Máy tính trong localStorage (Mặc định 192.168.1.32 để người dùng không phải nhập tay)
  if (typeof localStorage !== 'undefined' && !localStorage.getItem('pc_server_ip')) {
    localStorage.setItem('pc_server_ip', getAppServerIp());
  }

  // Kết nối ô cấu hình IP Máy tính (#pc-server-ip-input)
  const pcIpInput = document.getElementById('pc-server-ip-input');
  const btnSavePcIp = document.getElementById('btn-save-pc-ip');
  if (pcIpInput) {
    pcIpInput.value = getAppServerIp();
    const saveIp = () => {
      const val = pcIpInput.value.trim();
      if (val && typeof localStorage !== 'undefined') {
        localStorage.setItem('pc_server_ip', val);
        state.lastActionLog = \`💾 Đã lưu IP máy tính VR: \${val}\`;
        // Khởi động lại kết nối multiplayer với IP mới
        if (typeof initMultiplayerClient === 'function') initMultiplayerClient();
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
    // Tự động chuyển hướng sang Meta Quest Browser với URL HTTPS để kích hoạt Immersive WebXR 6DoF
    const isQuestDevice = /Quest|OculusBrowser/i.test(navigator.userAgent);
    const isApkEnvironment = (typeof window !== 'undefined' && (window.QuestVRBridge || window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:' || (isQuestDevice && !window.isSecureContext)));

    if (isApkEnvironment) {
      const pcIp = getAppServerIp();
      const vrTargetUrl = \`https://\${pcIp}:8443/?vr=immersive\`;
      state.lastActionLog = \`🚀 Đang tự động phóng sang Meta Quest Browser Immersive VR (\${pcIp})...\`;
      
      if (window.QuestVRBridge && typeof window.QuestVRBridge.launchQuestVR === 'function') {
        try {
          window.QuestVRBridge.launchQuestVR(vrTargetUrl);
          return;
        } catch (bridgeErr) {
          console.warn('[QuestVRBridge] Lỗi gọi launchQuestVR:', bridgeErr);
        }
      }
      
      // Fallback nếu chạy trong WebView chưa tiêm bridge: Mở URL ra trình duyệt ngoài
      try {
        window.open(vrTargetUrl, '_system');
        return;
      } catch (e) {
        window.location.href = vrTargetUrl;
        return;
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
setupSeamless3D2DSwitcher();`;

appCode = appCode.replace(oldSwitcherRegex, newSwitcherCode);

// Cập nhật WebSocket multiplayer client với auto-reconnect & định tuyến chính xác tới laptop
const oldMpRegex = /\(function initMultiplayerClient\(\)[\s\S]*?mpSocket = new WebSocket\(`\$\{wsProto\}\/\/\$\{window\.location\.host\}`\);/m;
const newMpCode = `let mpReconnectTimer = null;
function initMultiplayerClient() {
  try {
    if (mpSocket && mpSocket.readyState === WebSocket.OPEN) {
      try { mpSocket.close(); } catch (e) {}
    }
    const hostTarget = (typeof getAppServerHost === 'function') ? getAppServerHost() : window.location.host;
    const isHttps = (window.location.protocol === 'https:' && !hostTarget.includes(':8080'));
    const wsProto = isHttps ? 'wss:' : 'ws:';
    console.log('[Multiplayer] Đang kết nối tới server:', \`\${wsProto}//\${hostTarget}\`);
    mpSocket = new WebSocket(\`\${wsProto}//\${hostTarget}\`);

    mpSocket.onopen = () => {
      console.log('[Multiplayer] ✅ Đã kết nối WebSocket thành công tới server!');
      state.lastActionLog = '📶 Đã kết nối Server Máy tính! Nhận tín hiệu Vô lăng GOG808 & Xe.';
      clearTimeout(mpReconnectTimer);
    };

    mpSocket.onclose = () => {
      console.warn('[Multiplayer] ⚠️ Mất kết nối WebSocket, tự động thử lại sau 2.5s...');
      clearTimeout(mpReconnectTimer);
      mpReconnectTimer = setTimeout(initMultiplayerClient, 2500);
    };

    mpSocket.onerror = (err) => {
      console.warn('[Multiplayer] Lỗi kết nối WebSocket:', err);
    };`;

appCode = appCode.replace(oldMpRegex, newMpCode);

// Thay thế dòng cuối đóng ngoặc của initMultiplayerClient cũ thành khởi chạy hàm
appCode = appCode.replace(/\}\)\(\);\s*\n\s*\/\/ --- 19\.1\. SỬA LỖI MÀN HÌNH TRẮNG/m, '}\ninitMultiplayerClient();\n\n// --- 19.1. SỬA LỖI MÀN HÌNH TRẮNG');

// Đồng bộ ghi ra tất cả các thư mục mirror
const filesToWrite = [
  [appJsPath, appCode],
  [path.join(rootDir, 'www/app.js'), appCode],
  [path.join(rootDir, 'server/public/app.js'), appCode],
  [path.join(rootDir, 'android/app/src/main/assets/public/app.js'), appCode]
];

for (const [fPath, content] of filesToWrite) {
  if (fs.existsSync(path.dirname(fPath))) {
    fs.writeFileSync(fPath, content, 'utf8');
    console.log('[SYNC] Đã cập nhật:', path.relative(rootDir, fPath));
  }
}

console.log('✅ Hoàn tất vá WebSocket kết nối Laptop và Native Bridge!');
