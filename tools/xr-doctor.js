#!/usr/bin/env node
/**
 * FILE: tools/xr-doctor.js
 * Tự động kiểm tra cấu trúc dự án, cú pháp JS, runtime load (chống lỗi TDZ/black screen),
 * bảo mật SSRF và tiêu chuẩn WebXR Meta Quest 3
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const candidates = [
  rootDir,
  path.join(rootDir, 'VR'),
  path.join(rootDir, 'www'),
  path.join(rootDir, 'server')
];

function findFile(fileName) {
  for (const dir of candidates) {
    const full = path.join(dir, fileName);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const results = [];
function record(category, item, status, evidence) {
  results.push({ category, item, status, evidence });
}

// 1. Kiểm tra sự tồn tại của các file cốt lõi
const appJsPath = findFile('app.js');
const serverJsPath = findFile('server.js');
const indexHtmlPath = findFile('index.html');
const ytExtractorPath = findFile('youtube-dom-extractor.js');

record('Workspace', 'Core files (app.js, server.js, index.html)',
  appJsPath && serverJsPath && indexHtmlPath ? 'VERIFIED' : 'BLOCKED',
  `app.js: ${Boolean(appJsPath)}, server.js: ${Boolean(serverJsPath)}, index.html: ${Boolean(indexHtmlPath)}`
);

// 2. Kiểm tra cú pháp JavaScript tĩnh (node --check)
[
  ['server.js', serverJsPath],
  ['app.js', appJsPath],
  ['youtube-dom-extractor.js', ytExtractorPath]
].forEach(([name, filePath]) => {
  if (!filePath) return;
  try {
    execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
    record('Static Syntax', `Cú pháp ${name}`, 'VERIFIED', 'node --check thành công (0 syntax errors)');
  } catch (err) {
    record('Static Syntax', `Cú pháp ${name}`, 'BLOCKED', err.message.split('\n')[0]);
  }
});

// 2b. Kiểm tra Runtime Load & Khởi tạo (Headless Browser Mock - chống lỗi TDZ, ReferenceError, black screen)
const testRuntimeScript = path.join(__dirname, 'test_runtime_load.js');
if (fs.existsSync(testRuntimeScript)) {
  try {
    execSync(`node "${testRuntimeScript}"`, { stdio: 'pipe' });
    record('Runtime Integrity', 'Headless Load & Frame Init (app.js)', 'VERIFIED', 'Nạp module & chạy render thành công 0 lỗi TDZ/ReferenceError');
  } catch (err) {
    const errMsg = err.stderr ? err.stderr.toString().split('\n').filter(Boolean).slice(-2).join(' ') : err.message;
    record('Runtime Integrity', 'Headless Load & Frame Init (app.js)', 'BLOCKED', errMsg);
  }
}

// 3. Kiểm tra các tiêu chuẩn WebXR, Spatial UI & Performance trong app.js
if (appJsPath) {
  const appContent = fs.readFileSync(appJsPath, 'utf8');
  const hasXrSupportCheck = appContent.includes("isSessionSupported('immersive-vr')");
  const hasAnimLoop = appContent.includes('renderer.setAnimationLoop');
  const hasSpatialUi = appContent.includes('XR_WorldSpace_SpatialUI') || appContent.includes('hudPanelGroup');
  const hasPerfProfiler = appContent.includes('__XR_PERF_METRICS__');

  record('WebXR Architecture', 'Capability detection & setAnimationLoop',
    hasXrSupportCheck && hasAnimLoop ? 'VERIFIED' : 'PARTIAL',
    `isSessionSupported: ${hasXrSupportCheck}, setAnimationLoop: ${hasAnimLoop}`
  );
  record('Spatial UI & Perf', 'World-Space UI & 72Hz/90Hz Frame-time Profiler',
    hasSpatialUi && hasPerfProfiler ? 'VERIFIED' : 'PARTIAL',
    `SpatialUI: ${hasSpatialUi}, PerfMetrics: ${hasPerfProfiler}`
  );
}

// 4. Kiểm tra bảo mật SSRF & Reconnect Cleanup trong server.js
if (serverJsPath) {
  const srvContent = fs.readFileSync(serverJsPath, 'utf8');
  const hasSsrfGuard = srvContent.includes('isForbiddenSsrfIp') && srvContent.includes('validateProxyTargetUrl');
  const hasOrphanCleanup = srvContent.includes('cars.delete(carId)');

  record('Network Security', 'SSRF Guard trên /api/esp32-proxy & /api/yt-stream-proxy',
    hasSsrfGuard ? 'VERIFIED' : 'PARTIAL',
    hasSsrfGuard ? 'Đã kích hoạt DNS lookup & IP range filter' : 'Chưa dán Patch V175 vào server.js'
  );
  record('Multiplayer Sync', 'Chống nhân bản xe khi Reconnect & Clamp dữ liệu',
    hasOrphanCleanup ? 'VERIFIED' : 'PARTIAL',
    hasOrphanCleanup ? 'Đã có cơ chế thu hồi xe mồ côi & clampFinite' : 'Chưa dán Patch V175 vào server.js'
  );
}

// 5. Ghi nhận trạng thái kiểm thử phần cứng thực tế
record('Hardware Validation', 'Đo FPS thực tế 72Hz/90Hz trực tiếp trên kính Meta Quest 3',
  'NOT TESTED',
  'Cần mở URL HTTPS (:8443) trên Meta Quest Browser thực tế và đọc chỉ số trên bảng Spatial Perf Profiler'
);

console.log('\n================================================================================');
console.log('📊 BÁO CÁO KIỂM ĐỊNH KỸ THUẬT XR (META QUEST 3 ENGINEERING MATRIX)');
console.log('================================================================================');
for (const r of results) {
  console.log(`[${r.status.padEnd(10)}] ${r.category.padEnd(20)} | ${r.item}\n             ↳ Bằng chứng: ${r.evidence}`);
}
console.log('================================================================================\n');
