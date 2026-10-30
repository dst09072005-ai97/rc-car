const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const appJsPath = path.join(rootDir, 'app.js');
let appCode = fs.readFileSync(appJsPath, 'utf8');

const targetStr = 'mpSocket = new WebSocket(`${wsProto}//${window.location.host}`);';
console.log('Includes targetStr:', appCode.includes(targetStr));

if (appCode.includes(targetStr)) {
  const replacement = `let hostTarget = window.location.host;

    // ĐỊNH TUYẾN KẾT NỐI TỚI LAPTOP SERVER CHO CẢ BẢN WEB VÀ APK META QUEST
    const isApkEnvironment = (
      (typeof window !== 'undefined' && window.QuestVRBridge) ||
      (typeof window !== 'undefined' && window.Capacitor) ||
      (typeof window !== 'undefined' && window.location.protocol === 'capacitor:') ||
      (typeof window !== 'undefined' && window.location.protocol === 'file:') ||
      (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port !== '8080' && window.location.port !== '8443')
    );

    if (isApkEnvironment) {
      const pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || '192.168.1.32';
      hostTarget = \`\${pcIp}:8080\`;
      wsProto = 'ws:';
    }

    mpSocket = new WebSocket(\`\${wsProto}//\${hostTarget}\`);

    mpSocket.onopen = () => {
      console.log('[Multiplayer] ✅ Đã kết nối WebSocket thành công tới server:', hostTarget);
      state.lastActionLog = '📶 Đã kết nối Server Máy tính! Nhận tín hiệu Vô lăng GOG808 & Xe.';
    };

    mpSocket.onclose = () => {
      console.warn('[Multiplayer] ⚠️ Mất kết nối WebSocket, tự động thử lại sau 2.5s...');
      setTimeout(() => {
        if (!mpSocket || mpSocket.readyState !== WebSocket.OPEN) {
          try { initMultiplayerClient(); } catch (e) {}
        }
      }, 2500);
    };

    mpSocket.onerror = (err) => {
      console.warn('[Multiplayer] Lỗi kết nối WebSocket:', err);
    };`;

  appCode = appCode.replace(targetStr, replacement);
  console.log('✅ Đã cập nhật định tuyến WebSocket thông minh!');
}

// Thay thế khai báo (function initMultiplayerClient() { thành function initMultiplayerClient() {
appCode = appCode.replace('(function initMultiplayerClient() {', 'function initMultiplayerClient() {');
if (!appCode.includes('initMultiplayerClient();\n// 20.')) {
  // Đảm bảo hàm được gọi ngay
  appCode = appCode.replace('initMultiplayerClient();', 'initMultiplayerClient();');
}

// Đồng bộ ghi ra tất cả các file mirror
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
