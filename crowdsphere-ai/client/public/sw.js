// CrowdSphere AI Service Worker
// Cache strategy: cache-first for static assets, network-first for API calls

const SHELL_CACHE = 'crowdsphere-shell-v1';
const STATIC_CACHE = 'crowdsphere-static-v1';
const API_CACHE = 'crowdsphere-api-v1';

const SHELL_URLS = ['/', '/manifest.json'];

const NO_CACHE_API = ['/api/fan/chat', '/api/ops/'];

const CACHEABLE_API = ['/api/venue', '/api/health'];

// Install: pre-cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_URLS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http
  if (!url.protocol.startsWith('http')) return;

  const path = url.pathname;

  // Check if this is an API call that should never be cached
  const isNoCacheApi = NO_CACHE_API.some((p) => path.startsWith(p));
  if (isNoCacheApi) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ success: false, error: 'Offline – AI features unavailable', offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Check if this is a cacheable API endpoint (network-first)
  const isCacheableApi = CACHEABLE_API.some((p) => path.startsWith(p));
  if (isCacheableApi) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => {
          if (cached) return cached;
          return new Response(
            JSON.stringify({ success: false, error: 'Offline – cached data unavailable', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }))
    );
    return;
  }

  // For all other requests (static assets, navigation): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok && response.status < 400) {
          const cloned = response.clone();
          const cacheKey = path.endsWith('.html') || path === '/' ? SHELL_CACHE : STATIC_CACHE;
          caches.open(cacheKey).then((cache) => cache.put(request, cloned));
        }
        return response;
      }).catch(() => {
        // Navigation request fallback
        if (request.mode === 'navigate') {
          return caches.match('/').then((fallback) => {
            if (fallback) return fallback;
            return new Response(
              `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CrowdSphere AI – Offline</title>
  <style>
    body { background: #0f172a; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .offline-container { text-align: center; padding: 2rem; max-width: 480px; }
    .offline-icon { font-size: 4rem; margin-bottom: 1rem; }
    h1 { color: #06b6d4; font-size: 1.75rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; line-height: 1.6; }
    .banner { background: #1e293b; border: 1px solid #475569; border-radius: 0.5rem; padding: 1rem; margin-top: 1.5rem; }
    .badge { display: inline-block; background: #f59e0b; color: #0f172a; border-radius: 0.25rem; padding: 0.25rem 0.75rem; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; }
    ul { text-align: left; color: #94a3b8; margin-top: 0.5rem; }
    li { margin-bottom: 0.25rem; }
  </style>
</head>
<body>
  <div class="offline-container" role="main">
    <div class="offline-icon" aria-hidden="true">📡</div>
    <h1>CrowdSphere AI</h1>
    <p>You are currently offline. Some features are unavailable.</p>
    <div class="banner">
      <div class="badge">Offline Mode</div>
      <ul>
        <li>✅ Deterministic routing available</li>
        <li>✅ Venue map available</li>
        <li>❌ AI chat features disabled</li>
        <li>❌ Live data disabled</li>
      </ul>
    </div>
    <p style="margin-top:1rem; font-size:0.875rem;">Please reconnect to the internet to access all features.</p>
  </div>
</body>
</html>`,
              { status: 200, headers: { 'Content-Type': 'text/html' } }
            );
          });
        }
        return new Response('Network error', { status: 408 });
      });
    })
  );
});
