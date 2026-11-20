'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const { Readable } = require('node:stream');

const blockedPorts = new Set(['21', '22', '23', '25', '53', '110', '135', '137', '138', '139', '445', '1433', '1521', '3306', '5432', '6379', '11211', '27017']);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function isForbiddenSsrfIp(ipOrHost, { blockPrivateLan = false } = {}) {
  if (!ipOrHost) return true;
  let host = String(ipOrHost).trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (net.isIPv6(host)) {
    if (host.includes('%')) return true;
    host = new URL('http://[' + host + ']').hostname.slice(1, -1);
    const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(host);
    if (mapped) {
      const high = parseInt(mapped[1], 16);
      const low = parseInt(mapped[2], 16);
      return isForbiddenSsrfIp([high >> 8, high & 255, low >> 8, low & 255].join('.'), { blockPrivateLan });
    }
    return host === '::' || host === '::1' || /^(?:fe[89ab]|f[cd]|ff)/.test(host);
  }

  try { host = new URL('http://' + host).hostname.replace(/\.$/, ''); } catch { return true; }
  if (!net.isIPv4(host)) {
    return host === 'localhost' || host.endsWith('.localhost') ||
      ['metadata.google.internal', 'metadata', 'instance-data'].includes(host);
  }

  const [a, b] = host.split('.').map(Number);
  return a === 0 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) ||
    (blockPrivateLan && (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)));
}

function validateProxyTargetUrl(rawUrl, options = {}) {
  if (typeof rawUrl !== 'string' || !rawUrl) return { valid: false, reason: 'Invalid URL' };
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        isForbiddenSsrfIp(parsed.hostname, options) || blockedPorts.has(parsed.port)) {
      return { valid: false, reason: 'Forbidden proxy target' };
    }
    return { valid: true, parsed };
  } catch {
    return { valid: false, reason: 'Invalid URL' };
  }
}

async function validateProxyTargetUrlWithDns(rawUrl, options = {}) {
  const check = validateProxyTargetUrl(rawUrl, options);
  if (!check.valid) return check;
  const host = check.parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return check;
  try {
    const addresses = await dns.lookup(host, { all: true });
    if (addresses.length && addresses.every(({ address }) => net.isIP(address) && !isForbiddenSsrfIp(address, options))) {
      return { ...check, addresses };
    }
  } catch {
    return { valid: false, reason: 'Proxy DNS lookup failed' };
  }
  return { valid: false, reason: 'Forbidden proxy DNS result' };
}

async function fetchWithSsrfGuard(rawUrl, fetchOptions = {}, guardOptions = {}) {
  let nextUrl = rawUrl;
  for (let hops = 0; hops <= 3; hops++) {
    fetchOptions.signal?.throwIfAborted();
    const check = await validateProxyTargetUrlWithDns(nextUrl, guardOptions);
    if (!check.valid) throw new Error('SSRF Guard: ' + check.reason);
    const { parsed, addresses } = check;
    const transport = parsed.protocol === 'https:' ? https : http;
    // Node HTTP leaves redirects manual and lets the connection use only approved DNS answers.
    const upstream = await new Promise((resolve, reject) => {
      const request = transport.request(parsed, {
        ...fetchOptions,
        agent: false,
        lookup: addresses && ((_host, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        })
      }, resolve);
      request.on('error', reject);
      request.end();
    });
    if (!redirectStatuses.has(upstream.statusCode) || !upstream.headers.location) {
      const body = Readable.toWeb(upstream, {
        strategy: { highWaterMark: upstream.readableHighWaterMark, size: (chunk) => chunk.byteLength }
      });
      return {
        status: upstream.statusCode,
        ok: upstream.statusCode >= 200 && upstream.statusCode < 300,
        headers: new Headers(upstream.headers),
        body,
        text: () => new Response(body).text()
      };
    }

    upstream.destroy();
    if (hops === 3) throw new Error('SSRF Guard: Too many redirects');
    nextUrl = new URL(upstream.headers.location, parsed).href;
  }
}

function clampFinite(val, min, max, fallback = 0) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

module.exports = { isForbiddenSsrfIp, validateProxyTargetUrl, validateProxyTargetUrlWithDns, fetchWithSsrfGuard, clampFinite };
