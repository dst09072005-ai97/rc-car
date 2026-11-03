// tools/apply_reverse_limit_1100.js
const fs = require('fs');
const path = require('path');

console.log('🚀 Bắt đầu cập nhật giới hạn xung ga lùi xuống 1100µs...');

// 1. CẬP NHẬT APP.JS (gốc, www, server/public)
const appFiles = ['app.js', 'www/app.js', 'server/public/app.js'];
appFiles.forEach(f => {
  if (!fs.existsSync(f)) return;
  let s = fs.readFileSync(f, 'utf8');

  // Đổi giá trị mặc định rcMaxReversePulse thành 1100
  s = s.replace(/rcMaxReversePulse:\s*\d+,/g, 'rcMaxReversePulse: 1100,');

  // Đổi maxRevDelta cho phép min(400, 1500 - rcMaxReversePulse) để lùi đạt tới 1100us
  s = s.replace(
    /const maxRevDelta = Math\.max\(40,\s*Math\.min\(\d+,\s*1500 - \(state\.rcMaxReversePulse \|\| \d+\)\)\);/g,
    'const maxRevDelta = Math.max(40, Math.min(400, 1500 - (state.rcMaxReversePulse || 1100)));'
  );

  // Đổi preset thể thao / tùy chỉnh
  s = s.replace(
    /setRcSpeedPreset\(1640,\s*18\.0,\s*'🏎️ Thể Thao',\s*btnSpeedFast,\s*\d+\);/g,
    "setRcSpeedPreset(1640, 18.0, '🏎️ Thể Thao', btnSpeedFast, 1100);"
  );

  s = s.replace(
    /const revPulse = parseInt\(e\.target\.value,\s*10\) \|\| \d+;/g,
    'const revPulse = parseInt(e.target.value, 10) || 1100;'
  );

  // Cập nhật tính xung lùi với tỷ lệ 400us cho dNorm < 0
  s = s.replace(
    /const escUs = Math\.round\(1500 \+ dNorm \* 260\);/g,
    'const escUs = Math.round(1500 + (dNorm < 0 ? dNorm * 400 : dNorm * 260));'
  );

  s = s.replace(
    /throttle: Math\.max\(1000,\s*Math\.min\(2000,\s*Math\.round\(1500 \+ wheel\.driveNorm \* 260\)\)\),/g,
    'throttle: Math.max(1000, Math.min(2000, Math.round(1500 + (wheel.driveNorm < 0 ? wheel.driveNorm * 400 : wheel.driveNorm * 260)))),'
  );

  fs.writeFileSync(f, s, 'utf8');
  console.log(`✅ Đã cập nhật ${f}`);
});

// 2. CẬP NHẬT INDEX.HTML (gốc, www, server/public)
const htmlFiles = ['index.html', 'www/index.html', 'server/public/index.html'];
htmlFiles.forEach(f => {
  if (!fs.existsSync(f)) return;
  let s = fs.readFileSync(f, 'utf8');

  // Đổi min của slider-rc-max-reverse thành 1100 và value thành 1100
  s = s.replace(
    /id="slider-rc-max-reverse"\s+type="range"\s+min="\d+"\s+max="\d+"\s+step="5"\s+value="\d+"/g,
    'id="slider-rc-max-reverse" type="range" min="1100" max="1440" step="5" value="1100"'
  );

  s = s.replace(
    /id="val-rc-max-reverse"[^>]*>\d+µs<\/span>/g,
    'id="val-rc-max-reverse" style="font-family:monospace;color:#ffd60a;font-weight:bold;min-width:42px;">1100µs</span>'
  );

  fs.writeFileSync(f, s, 'utf8');
  console.log(`✅ Đã cập nhật ${f}`);
});

// 3. CẬP NHẬT SERVER.JS & SERVER/SERVER.JS
const serverFiles = ['server.js', 'server/server.js'];
serverFiles.forEach(f => {
  if (!fs.existsSync(f)) return;
  let s = fs.readFileSync(f, 'utf8');

  // Nới giới hạn dưới của xung ga từ 1150us xuống 1100us
  s = s.replace(/Math\.max\(1150,/g, 'Math.max(1100,');
  s = s.replace(/clampNum\(msg\.escPulseUs \?\? msg\.throttle,\s*1150,/g, 'clampNum(msg.escPulseUs ?? msg.throttle, 1100,');

  // Cập nhật công thức tính xung lùi [1500..1100us] thay vì [1500..1300us]
  s = s.replace(
    /return Math\.round\(1500 - normDrive \* 200\);/g,
    'return Math.round(1500 - normDrive * 400); // Lùi tối đa 1100µs khi đạp kịch ga'
  );

  s = s.replace(
    /return Math\.round\(1500 \+ normDrive \* 200\); \/\/ normDrive âm -> \[1500\.\.1300 µs\]/g,
    'return Math.round(1500 + normDrive * 400); // normDrive âm (-1..0) -> Lùi tối đa 1100µs'
  );

  // sendRateLimitedEsp32Udp
  s = s.replace(
    /const escUs = Math\.max\(1000,\s*Math\.min\(2000,\s*Math\.round\(1500 \+ d \* 220\)\)\);/g,
    'const escUs = Math.max(1100, Math.min(2000, Math.round(1500 + (d < 0 ? d * 400 : d * 220))));'
  );

  // throttle calculation trong bridge broadcast
  s = s.replace(
    /throttle: Math\.max\(1000,\s*Math\.min\(2000,\s*Math\.round\(1500 \+ driveNorm \* 260\)\)\),/g,
    'throttle: Math.max(1000, Math.min(2000, Math.round(1500 + (driveNorm < 0 ? driveNorm * 400 : driveNorm * 260)))),'
  );

  s = s.replace(
    /throttle: Math\.max\(1000,\s*Math\.min\(2000,\s*Math\.round\(1500 \+ data\.driveNorm \* 260\)\)\),/g,
    'throttle: Math.max(1000, Math.min(2000, Math.round(1500 + (data.driveNorm < 0 ? data.driveNorm * 400 : data.driveNorm * 260)))),'
  );

  fs.writeFileSync(f, s, 'utf8');
  console.log(`✅ Đã cập nhật ${f}`);
});

// 4. CẬP NHẬT ESP32_CAR_CONTROLLER.INO
const inoFile = 'esp32_car_controller/esp32_car_controller.ino';
if (fs.existsSync(inoFile)) {
  let s = fs.readFileSync(inoFile, 'utf8');
  s = s.replace(/constrain\(tVal,\s*1150,\s*1850\);/g, 'constrain(tVal, 1100, 1850);');
  s = s.replace(
    /constrain\(throttle,\s*1150,\s*1850\);\s*\/\/\s*1150us \(lùi\)/g,
    'constrain(throttle, 1100, 1850); // 1100us (lùi)'
  );
  fs.writeFileSync(inoFile, s, 'utf8');
  console.log(`✅ Đã cập nhật ${inoFile}`);
}

console.log('🎉 Hoàn tất cập nhật dải ga lùi 1100µs!');
