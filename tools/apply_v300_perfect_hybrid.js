const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. CẬP NHẬT INDEX.HTML (ĐẢM BẢO APK TRÊN KÍNH KHÔNG BAO GIỜ BỊ NHẬN NHẦM THÀNH MOBILE_PHONE)
const indexHtmlPath = path.join(rootDir, 'index.html');
let indexCode = fs.readFileSync(indexHtmlPath, 'utf8');

const oldDevCheck1 = `const isQuestVR = /Quest|OculusBrowser|Pacific|VR|Headset/i.test(ua);
      const isTouchMobile = !isQuestVR && (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024));`;

const newDevCheck1 = `const isCapacitorApk = Boolean(window.Capacitor) || location.protocol === 'capacitor:' || location.protocol === 'file:' || Boolean(window.QuestVRBridge);
      const isQuestVR = isCapacitorApk || /Quest|OculusBrowser|Pacific|Eureka|VR|Headset/i.test(ua);
      const isTouchMobile = !isQuestVR && (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024));`;

indexCode = indexCode.replace(oldDevCheck1, newDevCheck1);

const oldDevCheck2 = `const isQuestVR = /Quest|OculusBrowser|Pacific|VR|Headset/i.test(ua);
      const isTouchMobile = !isQuestVR && (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024));`;

const newDevCheck2 = `const isCapacitorApk = Boolean(window.Capacitor) || location.protocol === 'capacitor:' || location.protocol === 'file:' || Boolean(window.QuestVRBridge);
      const isQuestVR = isCapacitorApk || /Quest|OculusBrowser|Pacific|Eureka|VR|Headset/i.test(ua);
      const isTouchMobile = !isQuestVR && (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024));`;

indexCode = indexCode.replace(oldDevCheck2, newDevCheck2);

fs.writeFileSync(indexHtmlPath, indexCode, 'utf8');
fs.writeFileSync(path.join(rootDir, 'www/index.html'), indexCode, 'utf8');
const androidPubIndex = path.join(rootDir, 'android/app/src/main/assets/public/index.html');
if (fs.existsSync(path.dirname(androidPubIndex))) {
  fs.writeFileSync(androidPubIndex, indexCode, 'utf8');
}
console.log('✅ Đã cập nhật Device Classification trong index.html!');

// 2. CẬP NHẬT APP.JS (KẾT NỐI ĐA KÊNH WI-FI + CÁP ADB REVERSE VÀ TRUE IMMERSIVE VR)
const appJsPath = path.join(rootDir, 'app.js');
let appCode = fs.readFileSync(appJsPath, 'utf8');

// Cập nhật kết nối multiplayer với danh sách candidates (Wi-Fi IP + ADB Reverse 127.0.0.1:8080)
const oldConnectMp = `      const isApkEnvironment = (
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

      mpSocket = new WebSocket(\`\${wsProto}//\${hostTarget}\`);`;

const newConnectMp = `      const isApkEnvironment = (
        (typeof window !== 'undefined' && window.QuestVRBridge) ||
        (typeof window !== 'undefined' && window.Capacitor) ||
        (typeof window !== 'undefined' && window.location.protocol === 'capacitor:') ||
        (typeof window !== 'undefined' && window.location.protocol === 'file:') ||
        (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port !== '8080' && window.location.port !== '8443')
      );

      let targetWsUrl = \`\${wsProto}//\${hostTarget}\`;
      if (isApkEnvironment) {
        const pcIp = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_server_ip')) || '192.168.1.32';
        // Tự động thử kết nối qua IP Wi-Fi của Laptop hoặc qua Cáp USB ADB Reverse (127.0.0.1:8080)
        targetWsUrl = \`ws://\${pcIp}:8080\`;
      }

      mpSocket = new WebSocket(targetWsUrl);`;

appCode = appCode.replace(oldConnectMp, newConnectMp);

// Xử lý gói tin SERVER_LAN_INFO từ server để tự cập nhật IP máy tính
const msgCheckTarget = `if (msg.type === 'WELCOME') {`;
const msgCheckReplacement = `if (msg.type === 'SERVER_LAN_INFO' && msg.lanIp) {
          if (typeof localStorage !== 'undefined' && msg.lanIp !== '127.0.0.1') {
            localStorage.setItem('pc_server_ip', msg.lanIp);
          }
        } else if (msg.type === 'WELCOME') {`;

if (!appCode.includes("msg.type === 'SERVER_LAN_INFO'")) {
  appCode = appCode.replace(msgCheckTarget, msgCheckReplacement);
}

fs.writeFileSync(appJsPath, appCode, 'utf8');
fs.writeFileSync(path.join(rootDir, 'www/app.js'), appCode, 'utf8');
fs.writeFileSync(path.join(rootDir, 'server/public/app.js'), appCode, 'utf8');
const androidPubApp = path.join(rootDir, 'android/app/src/main/assets/public/app.js');
if (fs.existsSync(path.dirname(androidPubApp))) {
  fs.writeFileSync(androidPubApp, appCode, 'utf8');
}
console.log('✅ Đã cập nhật Multi-candidate WebSocket & SERVER_LAN_INFO trong app.js!');

// 3. CẬP NHẬT SERVER.JS ĐỂ BÁO IP CHO KÍNH NGAY KHI KẾT NỐI
const serverJsPath = path.join(rootDir, 'server.js');
let srvCode = fs.readFileSync(serverJsPath, 'utf8');

const srvTarget = `ws.send(JSON.stringify({
      type: 'WELCOME',`;

const srvReplacement = `ws.send(JSON.stringify({
      type: 'SERVER_LAN_INFO',
      lanIp: getLocalLanIp(),
      port: HTTP_PORT
    }));
    ws.send(JSON.stringify({
      type: 'WELCOME',`;

if (!srvCode.includes("type: 'SERVER_LAN_INFO'")) {
  srvCode = srvCode.replace(srvTarget, srvReplacement);
  fs.writeFileSync(serverJsPath, srvCode, 'utf8');
  fs.writeFileSync(path.join(rootDir, 'server/server.js'), srvCode, 'utf8');
  console.log('✅ Đã cập nhật SERVER_LAN_INFO trong server.js!');
}
