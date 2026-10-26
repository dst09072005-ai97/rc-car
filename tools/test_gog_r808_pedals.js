const assert = require('assert');

console.log('>>> [TEST] Kiểm tra logic 3 Bàn Đạp Độc Lập cho Vô Lăng GOG R808...');

// 1. Kiểm tra thuật toán chuẩn hóa trục pedal
function calcAxisPct(cur, base, invert = false) {
  let val = 0;
  if (base > 0.4) {
    val = (1.0 - cur) / 2.0;
  } else if (base < -0.4) {
    val = (cur + 1.0) / 2.0;
  } else {
    val = Math.abs(cur - base);
  }
  val = Math.min(1, Math.max(0, val));
  if (invert) val = 1.0 - val;
  return val < 0.035 ? 0 : val;
}

// Test trường hợp A: Chuẩn Logitech / D-Input nghỉ ở -1.0, đạp kịch lên 1.0
assert.strictEqual(calcAxisPct(-1.0, -1.0), 0, 'Nghỉ ở -1.0 phải ra 0%');
assert.strictEqual(calcAxisPct(1.0, -1.0), 1, 'Đạp kịch 1.0 phải ra 100%');
assert.strictEqual(calcAxisPct(0.0, -1.0), 0.5, 'Đạp nửa chừng 0.0 phải ra 50%');

// Test trường hợp B: Chuẩn nghỉ ở +1.0, đạp kịch về -1.0
assert.strictEqual(calcAxisPct(1.0, 1.0), 0, 'Nghỉ ở 1.0 phải ra 0%');
assert.strictEqual(calcAxisPct(-1.0, 1.0), 1, 'Đạp kịch -1.0 phải ra 100%');

// Test trường hợp C: Chuẩn nghỉ ở 0.0, đạp kịch lên 1.0
assert.strictEqual(calcAxisPct(0.0, 0.0), 0, 'Nghỉ ở 0.0 phải ra 0%');
assert.strictEqual(calcAxisPct(1.0, 0.0), 1, 'Đạp kịch 1.0 phải ra 100%');

// 2. Kiểm tra tính xung ESC cho ESP32 Car
function calculateEscThrottle(engineRunning, brakePercent, reversePercent, gasPercent, gearIndex) {
  if (!engineRunning || brakePercent > 8) {
    return 1500;
  } else if (reversePercent > 3 || gearIndex === 1) {
    const revPct = reversePercent > 3 ? reversePercent : 0;
    const pct = Math.min(100, Math.max(0, revPct));
    return Math.round(1500 - (pct / 100.0) * 200);
  } else if (gearIndex === 3) {
    const pct = Math.min(100, Math.max(0, gasPercent));
    return Math.round(1500 + (pct / 100.0) * 200);
  }
  return 1500;
}

// Khi đạp chân ga 100%: Xung ga tiến 1700us
assert.strictEqual(calculateEscThrottle(true, 0, 0, 100, 3), 1700, 'Ga 100% phải ra xung 1700µs');

// Khi đạp chân lùi 100%: Xung ga lùi 1300us (tự động theo bàn đạp lùi kể cả gearIndex chưa đổi)
assert.strictEqual(calculateEscThrottle(true, 0, 100, 0, 3), 1300, 'Đạp chân lùi 100% phải ra xung 1300µs');

// Khi đạp chân phanh > 8%: Dừng khẩn cấp 1500us
assert.strictEqual(calculateEscThrottle(true, 50, 100, 0, 1), 1500, 'Đạp phanh phải ngắt ga về 1500µs');
assert.strictEqual(calculateEscThrottle(true, 50, 0, 100, 3), 1500, 'Đạp phanh phải ngắt ga về 1500µs');

// Khi nhả cả 3 chân: Xung cầm chừng 1500us
assert.strictEqual(calculateEscThrottle(true, 0, 0, 0, 3), 1500, 'Thả 3 chân phải về 1500µs');

console.log('✅ TẤT CẢ CÁC BÀI TEST ĐẠT KẾT QUẢ CHUẨN XÁC 100%!');
