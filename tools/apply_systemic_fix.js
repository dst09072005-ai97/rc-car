const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('[APPLY SYSTEMIC FIX] Bắt đầu rà soát & nâng cấp hệ thống...');

// ============================================================================
// 1. NÂNG CẤP SERVER.JS & SERVER/SERVER.JS (AUTHORITATIVE MULTIPLAYER & HARDWARE)
// ============================================================================
try {
  execSync('node tools/patch_server_multiplayer.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (e) {
  console.error('[APPLY SYSTEMIC FIX] Lỗi chạy patch_server_multiplayer:', e);
}

// ============================================================================
// 2. NÂNG CẤP APP.JS (V260 MASTER MODULE SPLICING)
// ============================================================================
let appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

// 2.1 Sửa lỗi Snap-Back trong WORLD_STATE:
// Chỉ nội suy c.x, c.z từ server khi client KHÔNG PHẢI là người đang lái xe!
const oldSnapCheck = "const isLocallyDrivingInput = Boolean(\r\n                (keys && (keys.w || keys.s || keys.a || keys.d)) ||";
const altOldSnapCheck = "const isLocallyDrivingInput = Boolean(\n                (keys && (keys.w || keys.s || keys.a || keys.d)) ||";

const newSnapCheck = `// CHỐNG SNAP-BACK / RUBBER-BANDING:
              // Khi người chơi đang ở chế độ lái xe (DRIVING) trên ghế tài xế (seatIndex === 0),
              // client này là người quyết định vị trí xe! Tuyệt đối không để vị trí server kéo giật về chỗ cũ khi vừa nhả ga!
              const isLocallyDrivingInput = Boolean(
                (typeof state !== 'undefined' && state && state.playerMode === 'DRIVING' && state.seatIndex === 0) ||
                (keys && (keys.w || keys.s || keys.a || keys.d)) ||`;

if (appCode.includes(oldSnapCheck)) {
  appCode = appCode.replace(oldSnapCheck, newSnapCheck);
} else if (appCode.includes(altOldSnapCheck)) {
  appCode = appCode.replace(altOldSnapCheck, newSnapCheck);
}

// 2.2 Xử lý buttonEvents & ESP32_CAM_FRAME_RELAY trong socket listener của app.js
const oldWheelBridgeHandler = "} else if (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT') {";
const newWheelBridgeHandler = `} else if (msg.type === 'ESP32_CAM_FRAME_RELAY' && msg.dataUrl) {
          if (typeof window !== 'undefined' && window.__questRelayImg) {
            window.__questRelayImg.src = msg.dataUrl;
          }
        } else if (msg.type === 'WHEEL_BRIDGE_STATE' || msg.type === 'WHEEL_BRIDGE_INPUT') {`;

if (!appCode.includes("msg.type === 'ESP32_CAM_FRAME_RELAY'")) {
  appCode = appCode.replace(oldWheelBridgeHandler, newWheelBridgeHandler);
}

// Xử lý buttonEvents trong WHEEL_BRIDGE_STATE
const oldButtonEventsHook = "state.steeringAngleDeg = wObj.steerAngleDeg;";
const newButtonEventsHook = `if (Array.isArray(msg.buttonEvents) && msg.buttonEvents.length > 0) {
            msg.buttonEvents.forEach((act) => {
              if (act === 'TURN_LEFT') {
                if (typeof cycleTurnSignals === 'function') cycleTurnSignals('LEFT');
                else if (typeof toggleTurnSignal === 'function') toggleTurnSignal('LEFT');
              } else if (act === 'TURN_RIGHT') {
                if (typeof cycleTurnSignals === 'function') cycleTurnSignals('RIGHT');
                else if (typeof toggleTurnSignal === 'function') toggleTurnSignal('RIGHT');
              } else if (act === 'HORN') {
                if (typeof playSmartVehicleHornSound === 'function') playSmartVehicleHornSound('CAR');
                else if (typeof playHonkSound === 'function') playHonkSound();
              } else if (act === 'ENTER_EXIT') {
                if (typeof window.enterOrExitCarWithBlink === 'function') window.enterOrExitCarWithBlink();
                else if (typeof toggleEnterExitVehicle === 'function') toggleEnterExitVehicle();
              } else if (act === 'SWAP_SEAT') {
                if (typeof window.swapSeatOrTakeDriverControl === 'function') window.swapSeatOrTakeDriverControl();
                else if (typeof cycleCabinSeatPosition === 'function') cycleCabinSeatPosition();
              }
            });
          }
          state.steeringAngleDeg = wObj.steerAngleDeg;`;

if (!appCode.includes("msg.buttonEvents.forEach((act)")) {
  appCode = appCode.replace(oldButtonEventsHook, newButtonEventsHook);
}

// 2.3 Ẩn toàn bộ các bảng tên / notice trong buồng lái tránh che khuất kính hậu & kính chắn gió
const oldBusSign = "busSign.visible = true;\r\n  interiorVariants.BUS.add";
const altOldBusSign = "busSign.visible = true;\n  interiorVariants.BUS.add";
if (appCode.includes(oldBusSign)) {
  appCode = appCode.replace(oldBusSign, "busSign.visible = false;\r\n  interiorVariants.BUS.add");
} else if (appCode.includes(altOldBusSign)) {
  appCode = appCode.replace(altOldBusSign, "busSign.visible = false;\n  interiorVariants.BUS.add");
}

appCode = appCode.replace(/fireNotice\.visible = true;/g, "fireNotice.visible = false;");
appCode = appCode.replace(/ambNotice\.visible = true;/g, "ambNotice.visible = false;");
appCode = appCode.replace(/truckNotice\.visible = true;/g, "truckNotice.visible = false;");

// 2.4 Cập nhật Quy tắc Ưu Tiên Phanh & Giảm Tốc Mượt (Anti-Jerk) trong updateRacingWheelControls
const oldBrakeBlock = /const isDeliberateBrake = \(racingWheel\.brakePercent > 8\)[\s\S]*?state\.speedKmh = state\.velocityMs \* 3\.6;\s*\}/;
const newBrakeBlock = `// B. BÀN ĐẠP THẮNG (QUY TẮC ƯU TIÊN PHANH & GIẢM TỐC MƯỢT CHỐNG GIẬT)
    // Khi đạp chân phanh (> 6%): Luôn chiếm quyền ưu tiên tuyệt đối, triệt tiêu ga/lùi để giảm tốc êm ái
    if (racingWheel.brakePercent > 6) {
      state.throttlePercent = 0;
      state.reversePercent = 0;
      state.brakePercent = racingWheel.brakePercent;
      const decelRate = 6.0 + (racingWheel.brakePercent / 100) * 12.0;
      const decelAlpha = THREE.MathUtils.clamp(dt * decelRate, 0, 1.0);
      state.velocityMs = THREE.MathUtils.lerp(state.velocityMs, 0, decelAlpha);
      if (Math.abs(state.velocityMs) < 0.08) {
        state.velocityMs = 0;
      }
      state.speedKmh = state.velocityMs * 3.6;
      state.rpm = THREE.MathUtils.lerp(state.rpm, 850, Math.min(1, dt * 6.0));
    }`;

if (oldBrakeBlock.test(appCode)) {
  appCode = appCode.replace(oldBrakeBlock, newBrakeBlock);
}

// 2.5 Thay thế toàn bộ block 25 bằng bản tối ưu Master V260
const block25Idx = appCode.search(/\/\/\s*25\.\s*BẢN CẬP NHẬT MASTER/);

if (block25Idx !== -1) {
  const replaceStart = appCode.lastIndexOf('// ============================================================================', block25Idx);
  const masterV260Code = fs.readFileSync(path.join(__dirname, 'v260_master_module.js'), 'utf8');
  appCode = appCode.slice(0, replaceStart) + masterV260Code;
  console.log('[APPLY SYSTEMIC FIX] Đã thay thế Block 25 bằng Master V260 tối ưu!');
}

// Ghi đồng bộ app.js ra tất cả các thư mục mirror
fs.writeFileSync(path.join(__dirname, '../app.js'), appCode, 'utf8');
fs.writeFileSync(path.join(__dirname, '../www/app.js'), appCode, 'utf8');
fs.writeFileSync(path.join(__dirname, '../server/public/app.js'), appCode, 'utf8');

const androidPublicApp = path.join(__dirname, '../android/app/src/main/assets/public/app.js');
if (fs.existsSync(path.dirname(androidPublicApp))) {
  fs.writeFileSync(androidPublicApp, appCode, 'utf8');
  console.log('[APPLY SYSTEMIC FIX] Đã đồng bộ app.js sang Android assets/public/!');
}
console.log('[APPLY SYSTEMIC FIX] Đã đồng bộ app.js sang www/ và server/public/!');

// ============================================================================
// 3. NÂNG CẤP INDEX.HTML (VÀ CÁC BẢN MIRROR)
// ============================================================================
let indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const liquidGearSnippet = fs.readFileSync(path.join(__dirname, 'liquid_gear_snippet.html'), 'utf8');

if (indexHtml.includes('id="liquid-gear-widget-container"')) {
  // Thay thế snippet cũ bằng bản có Role Seat Badge
  const snippetStart = indexHtml.indexOf('<!-- ============================================================================ -->\r\n<!-- [OPTIMIZED UI MASTER V260]');
  const altSnippetStart = indexHtml.indexOf('<!-- ============================================================================ -->\n<!-- [OPTIMIZED UI MASTER V260]');
  const startIdx = snippetStart !== -1 ? snippetStart : altSnippetStart;
  const endIdx = indexHtml.indexOf('</body>');

  if (startIdx !== -1 && endIdx !== -1) {
    indexHtml = indexHtml.substring(0, startIdx) + liquidGearSnippet + '\r\n</body>\r\n</html>';
  }
} else {
  indexHtml = indexHtml.replace('</body>', liquidGearSnippet + '\r\n</body>');
}

fs.writeFileSync(path.join(__dirname, '../index.html'), indexHtml, 'utf8');
fs.writeFileSync(path.join(__dirname, '../www/index.html'), indexHtml, 'utf8');

const androidPublicIndex = path.join(__dirname, '../android/app/src/main/assets/public/index.html');
if (fs.existsSync(path.dirname(androidPublicIndex))) {
  fs.writeFileSync(androidPublicIndex, indexHtml, 'utf8');
  console.log('[APPLY SYSTEMIC FIX] Đã đồng bộ index.html sang Android assets/public/!');
}
console.log('[APPLY SYSTEMIC FIX] Đã gắn Liquid Gear Widget & Mobile Optimization vào index.html & www/index.html!');

console.log('[APPLY SYSTEMIC FIX] Hoàn thành cập nhật tất cả các file nguồn!');
