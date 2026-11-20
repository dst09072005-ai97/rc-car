'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const CHEMISTRIES = {
  LIPO_2S: [8.4, 7.4, 6.6, 6.4],
  LIION_2S: [8.4, 7.4, 6.6, 6.4],
  LIPO_3S: [12.6, 11.1, 9.9, 9.6],
  NIMH_6S: [8.7, 7.2, 6.3, 6]
};
const LOAD_MODES = ['REAL_GROUND', 'NO_LOAD_BENCH'];
const TRACKING_MODES = ['AUTO_ESP32', 'ALWAYS_DRIVE', 'PAUSED'];
const DRAIN = {
  idleAmps: [0.35, 0, 10],
  maxMotorAmps: [10, 0.1, 200],
  steerAmps: [0.75, 0, 20],
  surgeAmps: [3, 0, 100],
  reverseMultiplier: [1.1, 0.1, 3],
  peukertBase: [1.05, 1, 2],
  noLoadScale: [0.30, 0.01, 1]
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback, min, max) => Number.isFinite(value) ? clamp(value, min, max) : fallback;
const fail = error => ({ ok: false, error });
const validId = id => Number.isInteger(id) && id >= 1 && id <= 4;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const chemistryExists = value => typeof value === 'string' && Object.hasOwn(CHEMISTRIES, value);

function voltageAtPercent(chemistry, percent) {
  const [full, nominal, knee, empty] = CHEMISTRIES[chemistry];
  const soc = clamp(percent, 0, 100);
  if (soc >= 50) return nominal + (full - nominal) * (soc - 50) / 50;
  if (soc >= 10) return knee + (nominal - knee) * (soc - 10) / 40;
  return empty + (knee - empty) * soc / 10;
}

function normalizeDrive(pulse, reverseMultiplier) {
  if (pulse > 1518) return (pulse - 1518) / 332;
  if (pulse < 1482) return (1482 - pulse) / 382 * reverseMultiplier;
  return 0;
}

function learnedCapacity(runs, rated) {
  const mode = runs.some(run => run.loadMode === LOAD_MODES[0]) ? LOAD_MODES[0] : LOAD_MODES[1];
  let weighted = 0;
  let totalWeight = 0;
  for (const run of runs) {
    if (run.loadMode !== mode) continue;
    totalWeight++;
    weighted += run.measuredMah * totalWeight;
  }
  return totalWeight ? weighted / (totalWeight * (totalWeight + 1) / 2) : rated;
}

function updateHealth(profile) {
  const rated = profile.ratedCapacityMah;
  const capacity = profile.manualHealthPercent === null
    ? learnedCapacity(profile.calibrationRuns, rated)
    : rated * profile.manualHealthPercent / 100;
  profile.learnedCapacityMah = clamp(capacity, rated * 0.15, rated * 1.2);
  profile.healthPercent = Math.round(profile.learnedCapacityMah / rated * 100);
  profile.degradationPercent = Math.max(0, 100 - profile.healthPercent);
  profile.confidence = ['UNMEASURED', 'LOW', 'MEDIUM', 'HIGH'][Math.min(3, profile.calibrationRuns.length)];
}

function setPercent(profile, percent) {
  profile.currentPercent = percent;
  profile.consumedMah = profile.learnedCapacityMah * (1 - percent / 100);
}

function defaultProfile(id) {
  const names = ['Xanh Lá', 'Xanh Dương', 'Vàng', 'Cam Đỏ'];
  const colors = ['#62d98b', '#64afff', '#ffdb63', '#ff7656'];
  const profile = {
    id, name: `Pin ${id} (${names[id - 1]})`, color: colors[id - 1],
    chemistry: 'LIPO_2S', ratedCapacityMah: 2000, manualHealthPercent: null, cycleCount: 0,
    drainConfig: Object.fromEntries(Object.entries(DRAIN).map(([key, [initial]]) => [key, initial])),
    calibrationRuns: []
  };
  updateHealth(profile);
  setPercent(profile, 100);
  return profile;
}

function emptySession() {
  return {
    active: false, profileId: null, loadMode: 'REAL_GROUND', startedAt: null,
    elapsedSec: 0, activeDriveSec: 0, energyMah: 0, throttleSum: 0, throttleSamples: 0, paused: false
  };
}

function validateSetup(patch) {
  if (!object(patch)) return false;
  const rules = {
    name: v => typeof v === 'string' && v.trim().length > 0 && v.length <= 60,
    color: v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
    chemistry: chemistryExists,
    ratedCapacityMah: v => Number.isFinite(v) && v >= 100 && v <= 50000,
    healthPercent: v => v === null || (Number.isFinite(v) && v >= 15 && v <= 120),
    currentPercent: v => Number.isFinite(v) && v >= 0 && v <= 100,
    targetRunMinutes: v => Number.isFinite(v) && v >= 1 && v <= 1440,
    drainConfig: v => object(v) && Object.entries(v).every(([key, n]) =>
      Object.hasOwn(DRAIN, key) && Number.isFinite(n) && n >= DRAIN[key][1] && n <= DRAIN[key][2])
  };
  return Object.entries(patch).every(([key, value]) => Object.hasOwn(rules, key) && rules[key](value));
}

function applySetup(profile, patch) {
  for (const key of ['name', 'color', 'chemistry', 'ratedCapacityMah']) {
    if (Object.hasOwn(patch, key)) profile[key] = patch[key];
  }
  if (Object.hasOwn(patch, 'healthPercent')) profile.manualHealthPercent = patch.healthPercent;
  Object.assign(profile.drainConfig, patch.drainConfig);
  updateHealth(profile);
  if (patch.targetRunMinutes !== undefined) {
    const config = profile.drainConfig;
    const targetAmps = profile.learnedCapacityMah * 0.06 / patch.targetRunMinutes;
    config.maxMotorAmps = clamp(targetAmps - config.idleAmps, 0.1, 200);
  }
  setPercent(profile, patch.currentPercent ?? profile.currentPercent);
}

function validRun(run) {
  return object(run) && typeof run.id === 'string' && run.id.length <= 64 &&
    LOAD_MODES.includes(run.loadMode) && typeof run.note === 'string' && run.note.length <= 500 &&
    ['timestamp', 'durationSec', 'activeDriveSec', 'avgThrottlePct', 'measuredMah', 'estimatedHealthPct']
      .every(key => Number.isFinite(run[key]) && run[key] >= 0) &&
    run.avgThrottlePct <= 100 && run.activeDriveSec <= run.durationSec;
}

class RcBatteryEstimator {
  constructor({ filePath = path.join(__dirname, 'battery-profiles.json') } = {}) {
    this.filePath = filePath;
    this.profiles = [1, 2, 3, 4].map(defaultProfile);
    this.activeProfileId = 1;
    this.trackingMode = 'AUTO_ESP32';
    this.calibrationSession = emptySession();
    this.lowBatteryWarnPct = 20;
    this.criticalBatteryPct = 10;
    this.command = { escPulseUs: 1500, steerDeg: 90, gear: 'D', source: '' };
    this.resetTelemetry();
    this.load();
  }

  get activeProfile() {
    return this.profiles[this.activeProfileId - 1];
  }

  resetTelemetry() {
    this.lastCommandAt = -Infinity;
    this.prevDriveNorm = 0;
    this.prevSteerDeg = 90;
    this.instantAmps = 0;
    this.averageAmps = 0;
  }

  load() {
    if (!this.filePath) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!Array.isArray(saved.profiles) || saved.profiles.length !== 4) return;
      for (const profile of this.profiles) {
        const data = saved.profiles[profile.id - 1];
        if (!object(data) || data.id !== profile.id) continue;
        const patch = {
          name: data.name, color: data.color, chemistry: data.chemistry,
          ratedCapacityMah: data.ratedCapacityMah, healthPercent: data.manualHealthPercent ?? null,
          currentPercent: data.currentPercent, drainConfig: data.drainConfig
        };
        if (!validateSetup(patch)) continue;
        profile.calibrationRuns = Array.isArray(data.calibrationRuns)
          ? data.calibrationRuns.filter(validRun).slice(-15) : [];
        profile.cycleCount = Math.floor(finite(data.cycleCount, 0, 0, Number.MAX_SAFE_INTEGER));
        applySetup(profile, patch);
      }
      if (validId(saved.activeProfileId)) this.activeProfileId = saved.activeProfileId;
      if (TRACKING_MODES.includes(saved.trackingMode)) this.trackingMode = saved.trackingMode;
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[Battery] Profile load failed:', error.message);
    }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.filePath) return true;
    const temp = `${this.filePath}.tmp`;
    try {
      const { profiles, activeProfileId, trackingMode } = this;
      fs.writeFileSync(temp, JSON.stringify({ profiles, activeProfileId, trackingMode }, null, 2));
      fs.renameSync(temp, this.filePath);
      return true;
    } catch (error) {
      console.warn('[Battery] Profile save failed:', error.message);
      this.queueSave();
      return false;
    }
  }

  queueSave() {
    if (this.filePath && !this.saveTimer) {
      this.saveTimer = setTimeout(() => this.save(), 5000);
      this.saveTimer.unref();
    }
  }

  changed() {
    return { ok: true, persisted: this.save() };
  }

  recordControlInput({ escPulseUs, steerDeg, gear, source, nowMs = Date.now() }) {
    this.command.escPulseUs = finite(escPulseUs, 1500, 1100, 1850);
    this.command.steerDeg = finite(steerDeg, 90, 45, 135);
    this.command.gear = gear;
    this.command.source = source;
    if (Number.isFinite(nowMs)) this.lastCommandAt = nowMs;
  }

  tick(dtSec, nowMs, isEsp32Online) {
    const dt = finite(dtSec, 0, 0, 1);
    const profile = this.activeProfile;
    const config = profile.drainConfig;
    const session = this.calibrationSession;
    const age = nowMs - this.lastCommandAt;
    const fresh = age >= 0 && age < 1000;
    const pulse = fresh ? this.command.escPulseUs : 1500;
    const steer = fresh ? this.command.steerDeg : 90;
    const drive = normalizeDrive(pulse, config.reverseMultiplier);
    const active = drive > 0 || steer !== 90;
    const allowed = this.trackingMode === 'AUTO_ESP32' ? isEsp32Online || active : fresh;
    if (!dt || !allowed || this.trackingMode === 'PAUSED' || session.paused) {
      this.instantAmps = 0;
      this.averageAmps = 0;
      this.prevDriveNorm = 0;
      this.prevSteerDeg = 90;
      return;
    }
    const steering = Math.min(1, (Math.abs(steer - 90) + Math.abs(steer - this.prevSteerDeg)) / 45);
    const surge = Math.max(0, drive - this.prevDriveNorm);
    this.prevDriveNorm = drive;
    this.prevSteerDeg = steer;
    const motorAmps = drive * config.maxMotorAmps + surge * config.surgeAmps;
    const scale = session.active && session.loadMode === 'NO_LOAD_BENCH' ? config.noLoadScale : 1;
    this.instantAmps = config.idleAmps + steering * config.steerAmps + motorAmps * scale;
    const exponent = config.peukertBase + profile.degradationPercent / 400;
    const effectiveAmps = this.instantAmps * Math.pow(Math.max(1, this.instantAmps), exponent - 1);
    const deltaMah = effectiveAmps * dt / 3.6;
    this.averageAmps = this.averageAmps > 0
      ? this.averageAmps + (effectiveAmps - this.averageAmps) * (1 - Math.exp(-dt / 12))
      : effectiveAmps;
    const consumed = Math.min(profile.learnedCapacityMah, profile.consumedMah + deltaMah);
    if (consumed !== profile.consumedMah) {
      profile.consumedMah = consumed;
      profile.currentPercent = clamp(100 * (1 - consumed / profile.learnedCapacityMah), 0, 100);
      this.queueSave();
    }
    if (session.active) {
      session.energyMah += deltaMah;
      session.elapsedSec += dt;
      if (drive > 0) session.activeDriveSec += dt;
      session.throttleSum += Math.min(1, pulse < 1482 ? drive / config.reverseMultiplier : drive);
      session.throttleSamples++;
    }
  }

  selectProfile(id) {
    if (!validId(id)) return fail('Profile không hợp lệ.');
    if (id !== this.activeProfileId) {
      this.calibrationSession = emptySession();
      this.activeProfileId = id;
      this.resetTelemetry();
    }
    return this.changed();
  }

  markFullyCharged(id, startPercent = 100) {
    if (!validId(id) || !Number.isFinite(startPercent) || startPercent < 0 || startPercent > 100) {
      return fail('Profile hoặc phần trăm pin không hợp lệ.');
    }
    if (this.calibrationSession.profileId === id) this.calibrationSession = emptySession();
    const profile = this.profiles[id - 1];
    if (profile.currentPercent < 85 && startPercent > profile.currentPercent) profile.cycleCount++;
    setPercent(profile, startPercent);
    if (id === this.activeProfileId) this.resetTelemetry();
    return this.changed();
  }

  startCalibration(id, loadMode = 'REAL_GROUND') {
    if (!validId(id) || !LOAD_MODES.includes(loadMode)) return fail('Profile hoặc chế độ tải không hợp lệ.');
    this.activeProfileId = id;
    const result = this.markFullyCharged(id);
    this.calibrationSession = { ...emptySession(), active: true, profileId: id, loadMode, startedAt: Date.now() };
    return result;
  }

  toggleCalibrationPause() {
    if (!this.calibrationSession.active) return fail('Chưa có lượt đo đang chạy.');
    this.calibrationSession.paused = !this.calibrationSession.paused;
    if (this.calibrationSession.paused) this.resetTelemetry();
    return this.changed();
  }

  cancelCalibration() {
    this.calibrationSession = emptySession();
    return this.changed();
  }

  finishCalibrationEmpty(note = '', { force = false } = {}) {
    const session = this.calibrationSession;
    if (!session.active) return fail('Chưa có lượt đo đang chạy.');
    if (typeof note !== 'string' || note.length > 500) return fail('Ghi chú tối đa 500 ký tự.');
    if (!force && session.energyMah < 5 && session.elapsedSec < 10) return fail('Lượt đo quá ngắn.');
    const profile = this.activeProfile;
    profile.calibrationRuns.push({
      id: randomUUID(), timestamp: Date.now(), loadMode: session.loadMode,
      durationSec: session.elapsedSec, activeDriveSec: session.activeDriveSec,
      avgThrottlePct: 100 * session.throttleSum / Math.max(1, session.throttleSamples),
      measuredMah: session.energyMah,
      estimatedHealthPct: clamp(Math.round(session.energyMah / profile.ratedCapacityMah * 100), 15, 120),
      note
    });
    if (profile.calibrationRuns.length > 15) profile.calibrationRuns.shift();
    profile.manualHealthPercent = null;
    updateHealth(profile);
    setPercent(profile, 0);
    this.calibrationSession = emptySession();
    this.resetTelemetry();
    return this.changed();
  }

  deleteCalibrationRun(id, runId) {
    if (!validId(id) || typeof runId !== 'string' || runId.length > 64) return fail('Mẫu đo không hợp lệ.');
    const profile = this.profiles[id - 1];
    const index = profile.calibrationRuns.findIndex(run => run.id === runId);
    if (index < 0) return fail('Không tìm thấy mẫu đo.');
    profile.calibrationRuns.splice(index, 1);
    profile.manualHealthPercent = null;
    updateHealth(profile);
    setPercent(profile, profile.currentPercent);
    return this.changed();
  }

  setupProfile(id, patch) {
    if (!validId(id) || !validateSetup(patch)) return fail('Thông số profile không hợp lệ.');
    if (this.calibrationSession.profileId === id) this.calibrationSession = emptySession();
    applySetup(this.profiles[id - 1], patch);
    if (id === this.activeProfileId) this.resetTelemetry();
    return this.changed();
  }

  resetProfile(id) {
    if (!validId(id)) return fail('Profile không hợp lệ.');
    if (this.calibrationSession.profileId === id) this.calibrationSession = emptySession();
    const profile = this.profiles[id - 1];
    profile.calibrationRuns = [];
    profile.manualHealthPercent = null;
    profile.cycleCount = 0;
    updateHealth(profile);
    setPercent(profile, 100);
    if (id === this.activeProfileId) this.resetTelemetry();
    return this.changed();
  }

  setTrackingMode(mode) {
    if (!TRACKING_MODES.includes(mode)) return fail('Chế độ tính pin không hợp lệ.');
    this.trackingMode = mode;
    if (mode === 'PAUSED') this.resetTelemetry();
    return this.changed();
  }

  getPublicState() {
    const { activeProfileId, trackingMode, calibrationSession, lowBatteryWarnPct, criticalBatteryPct,
      profiles, instantAmps, averageAmps } = this;
    const profile = this.activeProfile;
    return {
      activeProfileId, trackingMode, calibrationSession, lowBatteryWarnPct, criticalBatteryPct, profiles,
      instantAmps, estimatedVoltage: voltageAtPercent(profile.chemistry, profile.currentPercent),
      estimatedMinutesRemaining: averageAmps >= 0.05
        ? (profile.learnedCapacityMah - profile.consumedMah) * 0.06 / averageAmps : null
    };
  }
}

const ACTION_FIELDS = {
  BATTERY_GET: [],
  BATTERY_SELECT: ['profileId'],
  BATTERY_RECHARGE: ['profileId', 'startPercent'],
  BATTERY_START_CALIBRATION: ['profileId', 'loadMode'],
  BATTERY_TOGGLE_PAUSE: ['profileId', 'startedAt'],
  BATTERY_FINISH_CALIBRATION: ['profileId', 'startedAt', 'note', 'force'],
  BATTERY_CANCEL_CALIBRATION: ['profileId', 'startedAt'],
  BATTERY_DELETE_RUN: ['profileId', 'runId'],
  BATTERY_SETUP_PROFILE: ['profileId', 'patch'],
  BATTERY_RESET_PROFILE: ['profileId'],
  BATTERY_SET_TRACKING: ['mode']
};

function dispatchBatteryAction(estimator, data) {
  if (!object(data)) return fail('Lệnh pin không hợp lệ.');
  const { type, profileId, note, force } = data;
  if (typeof type !== 'string' || !Object.hasOwn(ACTION_FIELDS, type) ||
      Object.keys(data).some(key => key !== 'type' && !ACTION_FIELDS[type].includes(key))) {
    return fail('Lệnh pin không hợp lệ.');
  }
  const sessionAction = type === 'BATTERY_TOGGLE_PAUSE' || type === 'BATTERY_FINISH_CALIBRATION' ||
    type === 'BATTERY_CANCEL_CALIBRATION';
  if (sessionAction && ((profileId !== undefined && profileId !== estimator.calibrationSession.profileId) ||
      (data.startedAt !== undefined && data.startedAt !== estimator.calibrationSession.startedAt))) {
    return fail('Lượt đo đã thay đổi. Kiểm tra lại trạng thái pin.');
  }
  switch (type) {
    case 'BATTERY_GET': return { ok: true };
    case 'BATTERY_SELECT': return estimator.selectProfile(profileId);
    case 'BATTERY_RECHARGE': return estimator.markFullyCharged(profileId, data.startPercent);
    case 'BATTERY_START_CALIBRATION': return estimator.startCalibration(profileId, data.loadMode);
    case 'BATTERY_TOGGLE_PAUSE': return estimator.toggleCalibrationPause();
    case 'BATTERY_FINISH_CALIBRATION':
      if (force !== undefined && typeof force !== 'boolean') return fail('Lệnh pin không hợp lệ.');
      return estimator.finishCalibrationEmpty(note, { force });
    case 'BATTERY_CANCEL_CALIBRATION': return estimator.cancelCalibration();
    case 'BATTERY_DELETE_RUN': return estimator.deleteCalibrationRun(profileId, data.runId);
    case 'BATTERY_SETUP_PROFILE': return estimator.setupProfile(profileId, data.patch);
    case 'BATTERY_RESET_PROFILE': return estimator.resetProfile(profileId);
    case 'BATTERY_SET_TRACKING': return estimator.setTrackingMode(data.mode);
    default: return fail('Lệnh pin không hợp lệ.');
  }
}

module.exports = { RcBatteryEstimator, dispatchBatteryAction, learnedCapacity, normalizeDrive, voltageAtPercent };
