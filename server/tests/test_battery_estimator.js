'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RcBatteryEstimator, dispatchBatteryAction, voltageAtPercent } = require('../rc-battery-estimator');

let now = 10000;
function drive(estimator, seconds, escPulseUs = 1850, steerDeg = 90, online = false) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.25) {
    now += 250;
    estimator.recordControlInput({ escPulseUs, steerDeg, gear: escPulseUs < 1482 ? 'R' : 'D', nowMs: now });
    estimator.tick(0.25, now, online);
  }
}

function sample(estimator, id, seconds, mode) {
  assert.equal(estimator.startCalibration(id, mode).ok, true);
  drive(estimator, seconds);
  assert.equal(estimator.finishCalibrationEmpty('test').ok, true);
  return estimator.activeProfile.calibrationRuns.at(-1);
}

const estimator = new RcBatteryEstimator({ filePath: null });
assert.deepEqual(estimator.profiles.map(p => p.id), [1, 2, 3, 4]);
for (const profile of estimator.profiles) {
  assert.equal(profile.chemistry, 'LIPO_2S');
  assert.equal(profile.ratedCapacityMah, 2000);
  assert.equal(profile.learnedCapacityMah, 2000);
  assert.equal(profile.confidence, 'UNMEASURED');
}
assert.equal(voltageAtPercent('LIPO_2S', 100), 8.4);
assert.equal(voltageAtPercent('LIPO_2S', 50), 7.4);
assert.equal(voltageAtPercent('LIPO_2S', 10), 6.6);
assert.equal(voltageAtPercent('LIPO_2S', 0), 6.4);

function drain(pulse, steer, health = 100) {
  estimator.setupProfile(1, { healthPercent: health, currentPercent: 100 });
  drive(estimator, 8, pulse, steer);
  return estimator.activeProfile.consumedMah;
}
assert.ok(drain(1850, 90) > drain(1700, 90));
assert.ok(drain(1100, 90) > drain(1850, 90));
assert.ok(drain(1850, 135) > drain(1850, 90));
assert.ok(drain(1850, 90, 60) > drain(1850, 90, 100));
estimator.resetProfile(1);

for (const id of [1, 2, 3, 4]) {
  const seconds = 210 + id * 80;
  const first = sample(estimator, id, seconds);
  assert.equal(estimator.activeProfile.confidence, 'LOW');
  assert.equal(estimator.activeProfile.learnedCapacityMah, first.measuredMah);
  const second = sample(estimator, id, seconds + 5);
  assert.equal(estimator.activeProfile.confidence, 'MEDIUM');
  const third = sample(estimator, id, seconds + 10);
  const capacity = (first.measuredMah + 2 * second.measuredMah + 3 * third.measuredMah) / 6;
  assert.equal(estimator.activeProfile.confidence, 'HIGH');
  assert.equal(estimator.activeProfile.learnedCapacityMah, capacity);
  assert.equal(estimator.activeProfile.healthPercent, Math.round(capacity / 20));
  assert.equal(estimator.activeProfile.currentPercent, 0);
}
assert.equal(new Set(estimator.profiles.map(p => p.healthPercent)).size, 4);

const profile = estimator.activeProfile;
const capacity = profile.learnedCapacityMah;
const bench = sample(estimator, 4, 100, 'NO_LOAD_BENCH');
assert.ok(bench.measuredMah < capacity);
assert.equal(profile.learnedCapacityMah, capacity);
assert.equal(estimator.deleteCalibrationRun(4, bench.id).ok, true);
const bad = sample(estimator, 4, 100);
assert.ok(profile.learnedCapacityMah < capacity);
assert.equal(estimator.deleteCalibrationRun(4, bad.id).ok, true);
assert.equal(profile.learnedCapacityMah, capacity);

const untouched = JSON.stringify(estimator.profiles.slice(0, 3));
assert.equal(estimator.setupProfile(4, { name: 'Test', healthPercent: 62, ratedCapacityMah: 2200 }).ok, true);
assert.equal(profile.learnedCapacityMah, 1364);
assert.equal(estimator.setupProfile(4, { chemistry: 'LIION_2S', drainConfig: { idleAmps: 0.6 } }).ok, true);
assert.equal(profile.drainConfig.maxMotorAmps, 10);
assert.equal(estimator.resetProfile(4).ok, true);
assert.equal(profile.learnedCapacityMah, 2200);
assert.equal(profile.currentPercent, 100);
assert.equal(profile.cycleCount, 0);
assert.equal(profile.confidence, 'UNMEASURED');
assert.equal(JSON.stringify(estimator.profiles.slice(0, 3)), untouched);

estimator.startCalibration(4);
assert.equal(estimator.finishCalibrationEmpty().ok, false);
estimator.toggleCalibrationPause();
drive(estimator, 2);
assert.equal(estimator.calibrationSession.energyMah, 0);
assert.equal(estimator.selectProfile(1).ok, true);
assert.equal(estimator.calibrationSession.active, false);
assert.equal(dispatchBatteryAction(estimator, { type: 'BATTERY_SELECT', profileId: '2' }).ok, false);
assert.equal(dispatchBatteryAction(estimator, {
  type: 'BATTERY_SETUP_PROFILE', profileId: 1, patch: { drainConfig: { idleAmps: '0.5' } }
}).ok, false);

const tracking = new RcBatteryEstimator({ filePath: null });
drive(tracking, 2, 1500);
assert.equal(tracking.activeProfile.consumedMah, 0);
drive(tracking, 2, 1500, 90, true);
assert.ok(tracking.activeProfile.consumedMah > 0);
tracking.markFullyCharged(1);
drive(tracking, 2, 1800);
assert.ok(tracking.activeProfile.consumedMah > 0);
trackerMode('ALWAYS_DRIVE', true);
trackerMode('PAUSED', false);

function trackerMode(mode, expectDrain) {
  tracking.setTrackingMode(mode);
  tracking.markFullyCharged(1);
  tracking.tick(0.25, now + 2500, false);
  assert.equal(tracking.activeProfile.consumedMah, 0);
  drive(tracking, 2);
  assert.equal(tracking.activeProfile.consumedMah > 0, expectDrain);
  const consumed = tracking.activeProfile.consumedMah;
  tracking.tick(0.25, now + 2500, false);
  assert.equal(tracking.activeProfile.consumedMah, consumed);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-battery-test-'));
try {
  const filePath = path.join(dir, 'battery-profiles.json');
  const saved = new RcBatteryEstimator({ filePath });
  saved.setTrackingMode('ALWAYS_DRIVE');
  sample(saved, 3, 100);
  saved.markFullyCharged(3, 88);
  const loaded = new RcBatteryEstimator({ filePath });
  assert.equal(loaded.activeProfileId, 3);
  assert.equal(loaded.trackingMode, 'ALWAYS_DRIVE');
  assert.deepEqual(loaded.profiles, saved.profiles);
  assert.equal(fs.existsSync(filePath + '.tmp'), false);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('Battery estimator tests passed.');
