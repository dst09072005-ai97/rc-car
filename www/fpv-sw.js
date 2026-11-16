const CACHE_PREFIX = 'fpv-cam-';
const CACHE_NAME = 'fpv-cam-3d-v2';

const SHELL_ASSETS = [
  '/fpv-cam.html',
  '/fpv-manifest.json',
  '/icons/fpv-icon-192.png',
  '/icons/fpv-icon-512.png',
  '/libs/three/three.module.js',
  '/libs/three/addons/controls/OrbitControls.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        // Namespace Isolation: Chỉ xóa cache có tiền tố 'fpv-cam-', tuyệt đối KHÔNG đụng đến cache của WebXR/Three.js chính
        const ownedCaches = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME);
        return Promise.all(ownedCaches.map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // URL Isolation: Chỉ can thiệp các tài nguyên do FPV Phone PWA sở hữu, để mặc định mạng cho app chính
  const isFpvResource = url.pathname === '/fpv-cam.html' || SHELL_ASSETS.includes(url.pathname);
  if (!isFpvResource) return;

  // Network-first so updates from server always arrive immediately, fallback to cache if offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
