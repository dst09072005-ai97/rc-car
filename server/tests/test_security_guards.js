'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const dns = require('node:dns').promises;
const { once } = require('node:events');
const http = require('node:http');
const net = require('node:net');
const { test } = require('node:test');
const WebSocket = require('ws');
const {
  isForbiddenSsrfIp, validateProxyTargetUrl, validateProxyTargetUrlWithDns, fetchWithSsrfGuard
} = require('../modules/ssrf-guard');
const { isTrustedLocalControlRequest } = require('../modules/local-control-guard');

if (process.argv.includes('--isolated-server')) {
  // Run the real HTTP and WebSocket handlers with no hardware, tunnel or persistent battery state.
  const dgram = require('node:dgram');
  dgram.Socket.prototype.bind = function () {
    return this;
  };
  dgram.Socket.prototype.send = () => process.send('unexpected-udp-send');

  const fs = require('node:fs');
  const exists = fs.existsSync;
  fs.existsSync = (file) => /(?:gog808_native_bridge\.exe|(?:cert|key)\.pem)$/i.test(String(file))
    ? false : exists(file);

  const battery = require('../rc-battery-estimator');
  const Estimator = battery.RcBatteryEstimator;
  battery.RcBatteryEstimator = class extends Estimator {
    constructor() { super({ filePath: null }); }
  };

  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (_port, _host, callback) {
    this.once('listening', () => process.send(this.address().port));
    return listen.call(this, 0, '127.0.0.1', callback);
  };
  require('../server');
} else {
  test('YouTube IDs cannot reach the shell or network, and valid IDs use argv', async (t) => {
    let calls = 0;
    t.mock.method(childProcess, 'exec', () => assert.fail('Shell execution'));
    t.mock.method(require('node:https'), 'request', () => assert.fail('Unexpected Innertube request'));
    const execFile = childProcess.execFile;
    t.after(() => { childProcess.execFile = execFile; });
    childProcess.execFile = (file, argv, options, callback) => {
      calls++;
      assert.equal(file, 'yt-dlp');
      assert.deepEqual(argv, [
        '-f', 'bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b',
        '-g', '--no-warnings', '--', 'https://youtube.com/watch?v=0sfDth4lMLc'
      ]);
      assert.deepEqual(options, { shell: false, timeout: calls === 1 ? 12000 : 15000, maxBuffer: 1024 * 1024 });
      callback(null, 'https://example.com/video.mp4');
    };
    const resolverPath = require.resolve('../modules/youtube-resolver');
    t.after(() => { delete require.cache[resolverPath]; });
    const { tryResolveYtDlpStream, resolveDirectMp4FromVideoId } = require(resolverPath);
    for (const resolve of [tryResolveYtDlpStream, resolveDirectMp4FromVideoId]) {
      for (const id of ['abc"&whoami', '../foo', 'bad;whoami', '0sfDth4lMLc\n', ['0sfDth4lMLc']]) {
        assert.equal(await resolve(id), null);
      }
    }
    assert.equal(calls, 0);
    assert.equal(await tryResolveYtDlpStream('0sfDth4lMLc'), 'https://example.com/video.mp4');
    assert.equal(await resolveDirectMp4FromVideoId('0sfDth4lMLc'), 'https://example.com/video.mp4');
    assert.equal(calls, 2);
  });

  test('SSRF validation rejects special networks, aliases, credentials and blocked ports', () => {
    for (const ip of [
      '127.0.0.1', '127.1.2.3', '0.0.0.0', '0.3.2.1', '169.254.169.254',
      '100.64.0.1', '100.127.255.254', '224.0.0.1', '255.255.255.255',
      '::', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::ffff:7f00:1',
      '::ffff:a9fe:a9fe', '::ffff:0.0.0.0', 'fc00::1', 'fd00::1', 'fe80::1', 'febf::1',
      '2130706433', '0177.0.0.1', '0x7f000001', 'x.localhost.', 'metadata.google.internal', 'instance-data'
    ]) assert.equal(isForbiddenSsrfIp(ip), true, ip);

    for (const url of ['http://2130706433/', 'ftp://example.com/', 'http://a:b@example.com/', ...[22, 3306, 6379].map(port => 'http://example.com:' + port)]) {
      assert.equal(validateProxyTargetUrl(url).valid, false, url);
    }
    for (const ip of ['192.168.1.50', '10.5.10.1', '172.31.255.1', '[::ffff:c0a8:132]']) {
      const url = 'http://' + ip + ':81/';
      assert.equal(validateProxyTargetUrl(url, { blockPrivateLan: false }).valid, true, url);
      assert.equal(validateProxyTargetUrl(url, { blockPrivateLan: true }).valid, false, url);
    }
  });

  test('DNS validation rejects mixed address sets and honors the LAN policy', async (t) => {
    t.mock.method(dns, 'lookup', async (_host, options) => {
      assert.deepEqual(options, { all: true });
      return [{ address: '93.184.216.34', family: 4 }, { address: '192.168.1.50', family: 4 }];
    });
    assert.equal((await validateProxyTargetUrlWithDns('http://camera.example/')).valid, true);
    assert.equal((await validateProxyTargetUrlWithDns('http://camera.example/', { blockPrivateLan: true })).valid, false);
  });

  test('proxy validates redirect destinations and caps redirects at three hops', async (t) => {
    let hits = 0;
    const upstream = http.createServer((req, res) => {
      hits++;
      if (req.url === '/ok') return res.end('ok');
      res.writeHead(302, {
        Location: req.url === '/blocked' ? 'http://127.0.0.1:' + upstream.address().port + '/ok'
          : req.url === '/relative' ? '/ok' : '/loop'
      }).end();
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    t.after(() => upstream.close());

    const request = http.request;
    t.mock.method(dns, 'lookup', async () => [{ address: '192.168.1.50', family: 4 }]);
    t.mock.method(http, 'request', (url, options, callback) => {
      // Route the approved synthetic camera address to the local fixture only after checking the pin.
      assert.equal(url.hostname, 'camera.example');
      options.lookup(url.hostname, { all: true }, (err, records) => {
        assert.ifError(err);
        assert.deepEqual(records, [{ address: '192.168.1.50', family: 4 }]);
      });
      return request(new URL(url.pathname, 'http://127.0.0.1:' + upstream.address().port), { ...options, lookup: undefined }, callback);
    });
    const base = 'http://camera.example:' + upstream.address().port;
    assert.equal(await (await fetchWithSsrfGuard(base + '/relative')).text(), 'ok');
    await assert.rejects(fetchWithSsrfGuard(base + '/blocked'), /Forbidden proxy target/);
    assert.equal(hits, 3);
    await assert.rejects(fetchWithSsrfGuard(base + '/loop'), /Too many redirects/);
    assert.equal(hits, 7);
  });

  test('browser media allowlist rejects active and off-origin relative URLs', async () => {
    const source = require('node:fs').readFileSync(require.resolve('../../www/modules/safe-media.js'));
    const { sanitizeSafeMediaUrl, YT_VIDEO_ID_RE } = await import('data:text/javascript;base64,' + source.toString('base64'));
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', '//example.com/image', '/api/../private']) {
      assert.equal(sanitizeSafeMediaUrl(url), '', url);
    }
    assert.equal(sanitizeSafeMediaUrl('/api/esp32-proxy?url=camera'), '/api/esp32-proxy?url=camera');
    assert.equal(sanitizeSafeMediaUrl('https://example.com/image'), 'https://example.com/image');
    assert.equal(YT_VIDEO_ID_RE.test('0sfDth4lMLc'), true);
    assert.equal(YT_VIDEO_ID_RE.test('0sfDth4lMLc?x'), false);
  });

  test('local control distinguishes LAN clients, same-origin browsers and tunnels', () => {
    function trusted(headers, remoteAddress = '::ffff:192.168.1.20') {
      return isTrustedLocalControlRequest({ headers, socket: { remoteAddress } });
    }
    assert.equal(trusted({}), true);
    assert.equal(trusted({}, '::1'), true);
    assert.equal(trusted({}, '203.0.113.20'), false);
    assert.equal(trusted({ host: '192.168.1.20:8443', origin: 'https://192.168.1.20:8443' }), true);
    assert.equal(trusted({ host: '192.168.1.20:8443', origin: 'https://example.com' }), false);
    assert.equal(trusted({ 'cf-ray': '' }), false);
  });

  test('live HTTP and WebSocket security, including tunnel phone publishing', { timeout: 15000 }, async (t) => {
    const child = childProcess.fork(__filename, ['--isolated-server'], { silent: true });
    t.after(() => child.kill());
    const port = await new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error('Isolated server exited with code ' + code)));
    });
    assert.equal(typeof port, 'number');
    const unexpectedSends = [];
    child.on('message', (data) => unexpectedSends.push(data));
    const base = 'http://127.0.0.1:' + port;
    const request = (path, options) => fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(5000), ...options });
    const tunnel = { 'cf-connecting-ip': '1.2.3.4' };
    const post = (body, headers) => ({ method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });
    for (const path of ['/rc-battery-estimator.js', '/server.js', '/battery-profiles.json', '/tests/test_contract.js']) {
      assert.ok([403, 404].includes((await request(path)).status), path);
    }
    assert.equal((await request('/fpv-cam.html', { headers: tunnel })).status, 200);
    for (const [path, options] of [
      ['/api/set-esp32-car-ip', { method: 'POST', headers: tunnel }],
      ['/api/scan-esp32', { headers: tunnel }],
      ['/api/register-esp32', { headers: tunnel }],
      ['/api/yt-sync-state', post('{}', tunnel)],
      ['/api/battery/action', post('{"type":"BATTERY_SELECT"}', tunnel)],
      ['/api/rc-control?throttle=1650', { headers: tunnel }],
      ['/api/esp32-config?ctrlIp=192.168.1.50', { headers: { origin: 'https://example.com' } }]
    ]) {
      const response = await request(path, options);
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.get('access-control-allow-origin'), null, path);
    }
    assert.equal((await request('/api/bridge-ping')).headers.get('access-control-allow-origin'), '*');

    const sync = '/api/yt-sync-state';
    const response = await request(sync, post('{"__proto__":{"polluted":true},"evilKey":1,"updatedAt":1,"videoId":"0sfDth4lMLc","title":"' + 'x'.repeat(240) + '","currentTime":999999,"isPlaying":false,"streamUrl":"https://example.com/video.mp4"}', { origin: base }));
    assert.equal(response.status, 200);
    const { state } = await response.json();
    assert.equal(Object.hasOwn(state, '__proto__'), false);
    assert.equal(Object.hasOwn(state, 'evilKey'), false);
    assert.equal(Object.hasOwn(state, 'polluted'), false);
    assert.ok(state.updatedAt > 1);
    assert.equal(state.videoId, '0sfDth4lMLc');
    assert.equal(state.title.length, 200);
    assert.equal(state.currentTime, 86400);
    assert.equal(state.isPlaying, false);
    assert.equal(state.streamUrl, 'https://example.com/video.mp4');
    const invalid = await request(sync, post('{"videoId":"bad;whoami","title":{},"isPlaying":"true","streamUrl":"javascript:alert(1)"}'));
    const invalidState = (await invalid.json()).state;
    for (const key of ['videoId', 'title', 'isPlaying', 'streamUrl']) assert.equal(invalidState[key], state[key]);
    assert.equal((await request(sync, post(JSON.stringify({ title: 'x'.repeat(65536) })))).status, 413);
    assert.equal((await request('/api/yt-mp4-direct?videoId=bad;whoami')).status, 400);
    assert.equal((await request('/api/yt-long-stream?videoId=bad;whoami')).status, 400);
    assert.equal((await request('/api/yt-mp4-direct?url=http://192.168.1.50/video.mp4')).status, 400);
    assert.equal((await request('/api/yt-mp4-direct?url=https://example.com/video.mp4')).status, 302);

    const wsBase = base.replace('http:', 'ws:');
    const phone = new WebSocket(wsBase, { headers: tunnel });
    const camera = new WebSocket(wsBase + '/esp32-front-ws');
    t.after(() => { phone.terminate(); camera.terminate(); });
    const ack = new Promise((resolve) => {
      phone.on('message', (msg, isBinary) => {
        if (!isBinary && JSON.parse(msg).type === 'FPV_PHONE_PUBLISHER_ACK') resolve();
      });
    });
    await Promise.all([once(phone, 'open'), once(camera, 'open')]);
    phone.send(JSON.stringify({ type: 'TEST_ESP32_MOTOR' }));
    phone.send(JSON.stringify({ type: 'WHEEL_BRIDGE_INPUT', steerNorm: 0.5, gasNorm: 0.8 }));
    phone.send(JSON.stringify({ type: 'FPV_PHONE_PUBLISHER_INIT', surface: 'front' }));
    await ack;
    const jpeg = Buffer.from([255, 216, 255, 217]);
    const frame = once(camera, 'message');
    phone.send(jpeg);
    assert.deepEqual(await frame, [jpeg, true]);
    const closed = once(phone, 'close');
    phone.send(Buffer.alloc(2 * 1024 * 1024 + 1));
    assert.equal((await closed)[0], 1009);
    assert.deepEqual(unexpectedSends, []);
  });
}
