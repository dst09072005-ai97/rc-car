'use strict';

const net = require('node:net');

const hardwareActions = new Set([
  'CAR_CONTROL', 'RC_CONTROL_CMD', 'WHEEL_BRIDGE_INPUT', 'WHEEL_BRIDGE_STATE',
  'TEST_ESP32_PULSE', 'TEST_ESP32_MOTOR', 'SET_ESP32_CAR_IP'
]);

function isTrustedLocalControlRequest(req) {
  if (req.headers['cf-connecting-ip'] !== undefined || req.headers['cf-ray'] !== undefined) return false;
  if (req.headers.origin !== undefined) {
    try {
      const url = new URL(req.headers.origin);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.host === req.headers.host;
    } catch {
      return false;
    }
  }

  let address = req.socket.remoteAddress;
  if (net.isIPv6(address)) {
    const host = new URL('http://[' + address.split('%')[0] + ']').hostname;
    if (host === '[::1]') return true;
    const mapped = /^\[::ffff:([\da-f]+):([\da-f]+)\]$/.exec(host);
    if (!mapped) return false;
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    address = [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  if (!net.isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

module.exports = { isTrustedLocalControlRequest, hardwareActions };
