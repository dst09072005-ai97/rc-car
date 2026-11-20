/** Four-profile RC battery display, calibration actions and cockpit HUD. */

export function createBatteryUi({ getState, getMpSocket }) {
  let batteryControls;

  function getBatteryControls() {
    if (batteryControls) return batteryControls;
    const root = document.getElementById('rc-battery-panel');
    if (!root) return null;
    const find = id => document.getElementById(id);
    const form = find('battery-setup-form');
    const tracking = find('battery-tracking');
    const load = find('battery-load');
    batteryControls = {
      buttons: root.querySelectorAll('[data-battery-profile]'),
      badge: find('top-battery-badge'), charge: find('battery-charge'), live: find('battery-live'),
      start: find('battery-start'), session: find('battery-session'), runLive: find('battery-run-live'),
      pause: find('battery-pause'), runs: find('battery-runs'), runsTitle: find('battery-runs-title'),
      feedback: find('battery-feedback'), form, tracking, load,
      runKey: '', setupProfileId: null, dirty: new Set()
    };

    root.addEventListener('keydown', event => event.stopPropagation());
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !getState().rcBattery) return;
      const profileId = getState().rcBattery.activeProfileId;
      if (button.dataset.batteryProfile) {
        sendBatteryAction('SELECT', { profileId: Number(button.dataset.batteryProfile) });
        return;
      }
      const action = button.dataset.batteryAction;
      if (!action) return;
      if (action === 'DELETE_RUN' && !window.confirm('Xóa mẫu đo này?')) return;
      if (action === 'RESET_PROFILE' && !window.confirm('Xóa toàn bộ mẫu đo và đặt lại pin này?')) return;
      const fields = { profileId };
      if (action === 'START_CALIBRATION') fields.loadMode = load.value;
      if (action === 'DELETE_RUN') fields.runId = button.dataset.batteryRun;
      if (action === 'TOGGLE_PAUSE' || action === 'FINISH_CALIBRATION' || action === 'CANCEL_CALIBRATION') {
        fields.startedAt = getState().rcBattery.calibrationSession.startedAt;
      }
      sendBatteryAction(action, fields);
    });
    tracking.addEventListener('change', () => sendBatteryAction('SET_TRACKING', { mode: tracking.value }));
    form.addEventListener('input', event => batteryControls.dirty.add(event.target.name));
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!getState().rcBattery || !batteryControls.dirty.size) return;
      const patch = {};
      for (const key of batteryControls.dirty) {
        const field = form.elements.namedItem(key);
        if (!field) continue;
        if (key === 'idleAmps' || key === 'maxMotorAmps') {
          (patch.drainConfig ??= {})[key] = field.valueAsNumber;
        } else if (key === 'healthPercent') {
          patch[key] = field.value === '' ? null : field.valueAsNumber;
        } else {
          patch[key] = field.type === 'number' ? field.valueAsNumber : field.value;
        }
      }
      sendBatteryAction('SETUP_PROFILE', { profileId: batteryControls.setupProfileId, patch });
    });
    return batteryControls;
  }

  async function sendBatteryAction(action, fields) {
    const data = { type: 'BATTERY_' + action, ...fields };
    const mpSocket = getMpSocket();
    if (mpSocket?.readyState === WebSocket.OPEN) {
      mpSocket.send(JSON.stringify(data));
      return;
    }
    try {
      const response = await fetch('/api/battery/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.battery) updateRcBattery(result.battery);
      showBatteryResult({ ...result, action: data.type });
    } catch {
      showBatteryResult({ ok: false, error: 'Không kết nối được máy chủ pin.' });
    }
  }

  function showBatteryResult(result) {
    const ui = getBatteryControls();
    if (!ui) return;
    if (result.ok && (result.action === 'BATTERY_SETUP_PROFILE' || result.action === 'BATTERY_RESET_PROFILE')) {
      ui.dirty.clear();
      if (getState().rcBattery) updateRcBattery(getState().rcBattery);
    }
    ui.feedback.textContent = result.ok
      ? (result.persisted === false ? 'Đã cập nhật. Máy chủ đang thử lưu lại.' : 'Đã cập nhật pin.')
      : result.error;
  }

  function updateRcBattery(battery) {
    const profile = battery?.profiles?.[battery.activeProfileId - 1];
    if (!profile) return;
    getState().rcBattery = battery;
    const session = battery.calibrationSession;
    const percent = Math.floor(profile.currentPercent);
    const critical = profile.currentPercent < battery.criticalBatteryPct;
    const low = profile.currentPercent < battery.lowBatteryWarnPct;
    const color = session.active ? '#d09aff' : critical ? '#ff5252' : low ? '#ffda55' : '#62d98b';
    const voltage = battery.estimatedVoltage.toFixed(2) + ' V';
    const minutes = battery.estimatedMinutesRemaining === null
      ? '—' : battery.estimatedMinutesRemaining.toFixed(1);
    getState().rcBatteryHud = {
      color, critical, barWidth: 9 * profile.currentPercent,
      line: `🔋 ${profile.name}  |  ${percent}%  |  ${voltage}  |  ~${minutes} phút${session.active ? (session.paused ? '  |  Đo tạm dừng' : '  |  Đang đo pin') : ''}`,
      warning: critical ? 'PIN CẠN' : low ? 'PIN YẾU' : ''
    };

    const ui = getBatteryControls();
    if (!ui) return;
    ui.badge.textContent = `🔋 ${profile.name.split(' (')[0]} · ${percent}% · ${voltage}`;
    ui.badge.style.color = color;
    ui.charge.value = profile.currentPercent;
    ui.charge.style.accentColor = color;
    const confidence = { UNMEASURED: 'Chưa đo', LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao' };
    ui.live.textContent = `${percent}% · ${voltage} ảo · ~${minutes} phút · ${battery.instantAmps.toFixed(2)} A · Sức khỏe ${profile.healthPercent}% · Chai ${profile.degradationPercent}% · Tin cậy ${confidence[profile.confidence]} (${profile.calibrationRuns.length} lượt)`;
    ui.tracking.value = battery.trackingMode;
    ui.start.hidden = session.active;
    ui.session.hidden = !session.active;
    ui.load.disabled = session.active;
    if (session.active) {
      ui.load.value = session.loadMode;
      const elapsed = Math.floor(session.elapsedSec);
      const throttle = 100 * session.throttleSum / Math.max(1, session.throttleSamples);
      ui.runLive.textContent = `${Math.floor(elapsed / 60)} phút ${elapsed % 60} giây · ${session.energyMah.toFixed(1)} mAh · Ga TB ${throttle.toFixed(0)}%${battery.trackingMode === 'PAUSED' ? ' · Tính pin đang tạm dừng' : ''}`;
      ui.pause.textContent = session.paused ? '▶ Tiếp Tục' : '⏸ Tạm Dừng';
    }
    for (const button of ui.buttons) {
      const item = battery.profiles[Number(button.dataset.batteryProfile) - 1];
      const active = item.id === profile.id;
      button.textContent = `Pin ${item.id} · ${Math.floor(item.currentPercent)}% · Chai ${item.degradationPercent}%`;
      button.style.color = item.color;
      button.style.outline = active ? '2px solid ' + item.color : '';
      button.setAttribute('aria-pressed', String(active));
    }
    const profileChanged = ui.setupProfileId !== profile.id;
    if (profileChanged) {
      ui.setupProfileId = profile.id;
      ui.dirty.clear();
    }
    const fields = {
      name: profile.name, color: profile.color, chemistry: profile.chemistry,
      ratedCapacityMah: profile.ratedCapacityMah, healthPercent: profile.manualHealthPercent ?? '',
      currentPercent: Math.round(profile.currentPercent * 10) / 10,
      idleAmps: profile.drainConfig.idleAmps, maxMotorAmps: profile.drainConfig.maxMotorAmps
    };
    for (const [key, value] of Object.entries(fields)) {
      const field = ui.form.elements.namedItem(key);
      if (field && (profileChanged || field !== document.activeElement) && !ui.dirty.has(key)) field.value = value;
    }

    const runKey = profile.id + ':' + profile.calibrationRuns.map(run => run.id).join(',');
    if (ui.runKey === runKey) return;
    ui.runKey = runKey;
    ui.runsTitle.textContent = `Mẫu test đã lưu (${profile.calibrationRuns.length})`;
    ui.runs.replaceChildren();
    for (let i = profile.calibrationRuns.length - 1; i >= 0; i--) {
      const run = profile.calibrationRuns[i];
      const li = document.createElement('li');
      const date = new Date(run.timestamp).toLocaleDateString('vi-VN');
      const mode = run.loadMode === 'REAL_GROUND' ? 'Có tải' : 'Không tải';
      li.textContent = `${date} · ${mode} · ${(run.durationSec / 60).toFixed(1)} phút · ${run.measuredMah.toFixed(0)} mAh · ${run.estimatedHealthPct}% ${run.note ? '· ' + run.note + ' ' : ''}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'bar-btn';
      remove.dataset.batteryAction = 'DELETE_RUN';
      remove.dataset.batteryRun = run.id;
      remove.textContent = '🗑 Xóa';
      li.appendChild(remove);
      ui.runs.appendChild(li);
    }
  }
  return { updateRcBattery, showBatteryResult };
}

/** Draw the battery strip on the existing cockpit HUD canvas. */
export function drawBatteryHud(hudCtx, batteryHud) {
  if (batteryHud) {
    hudCtx.fillStyle = '#243042';
    hudCtx.fillRect(20, 428, 900, 12);
    hudCtx.fillStyle = batteryHud.color;
    hudCtx.fillRect(20, 428, batteryHud.barWidth, 12);
    hudCtx.font = 'bold 21px Segoe UI, sans-serif';
    hudCtx.fillText(batteryHud.line, 20, 415, 900);
    if (batteryHud.warning && (!batteryHud.critical || Date.now() % 1000 < 650)) {
      hudCtx.fillStyle = batteryHud.critical ? '#ff5252' : '#ffda55';
      hudCtx.fillText(batteryHud.warning, 20, 474);
    }
  }
}
