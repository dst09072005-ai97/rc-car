'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const pkg = JSON.parse(read('package.json'));
for (const dependency of ['express', 'ws', 'qrcode-terminal']) {
  assert.ok(pkg.dependencies[dependency], `Missing dependency: ${dependency}`);
}

function requireTokens(file, tokens) {
  const source = read(file);
  for (const token of tokens) {
    assert.ok(source.includes(token), `${file} is missing contract token: ${token}`);
  }
}

requireTokens('server.js', [
  'udpServer.bind(4210', 'PLAYER_HELLO', 'sendRateLimitedEsp32Udp', 'WINMM_USB',
  '/esp32-front-ws', '/esp32-rear-ws', 'FPV_PHONE_PUBLISHER_INIT', 'qrcode.generate',
  '/api/battery/action', 'BATTERY_STATE'
]);
requireTokens('../www/index.html', [
  'smart-vr-btn', 'btn-open-qr-multiplayer', 'btn-board-npc-vehicle', 'minimap-canvas',
  'btn-garage-rr', 'btn-garage-coupe', 'btn-garage-moto', 'top-battery-badge'
]);
requireTokens('../www/app.js', [
  'requestSession', 'immersive-vr', 'renderer.setAnimationLoop', 'CAR_CONTROL',
  'WHEEL_BRIDGE_STATE', 'BATTERY_STATE'
]);
requireTokens('../www/fpv-cam.html', ['FPV_PHONE_PUBLISHER_INIT', 'SWITCH_FPV_SURFACE']);

console.log('[PASS] RC relay and WebXR client contracts');
