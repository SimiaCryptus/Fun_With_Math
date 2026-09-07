/* Service worker: precache shell, cache-first for assets, stale-while-revalidate elsewhere. */
const VERSION = 'physviz-v1';

const PRECACHE = [
  './', './index.html', './manifest.webmanifest',
  './css/reset.css', './css/layout.css', './css/chrome.css',
  './src/main.js',
  './src/core/Clock.js', './src/core/EventBus.js', './src/core/SignalBus.js', './src/core/Store.js', './src/core/Capability.js',
  './src/audio/AudioEngine.js', './src/audio/Analyser.js', './src/audio/BeatDetector.js',
  './src/audio/sources/FileSource.js', './src/audio/sources/MicSource.js', './src/audio/sources/ElementSource.js',
  './src/motion/MotionEngine.js', './src/motion/Fusion.js', './src/motion/ShakeDetector.js', './src/motion/VirtualTilt.js',
  './src/gfx/Renderer.js', './src/gfx/Program.js', './src/gfx/Framebuffer.js', './src/gfx/Mesh.js', './src/gfx/Textures.js', './src/gfx/PostChain.js',
  './src/gfx/shaders/common.glsl',
  './src/gfx/shaders/warp/zoom-rotate.frag', './src/gfx/shaders/warp/ripple.frag',
  './src/gfx/shaders/comp/oscilloscope.frag', './src/gfx/shaders/comp/spectrum-bars.frag', './src/gfx/shaders/comp/plasma.frag',
  './src/gfx/shaders/comp/tunnel.frag', './src/gfx/shaders/comp/glitter.frag',
  './src/gfx/shaders/sim/particles-gravity.frag',
  './src/presets/PresetManager.js', './src/presets/schema.js',
  './src/presets/builtin/oscilloscope.json', './src/presets/builtin/spectrum-bars.json', './src/presets/builtin/plasma-storm.json',
  './src/presets/builtin/tunnel-of-love.json', './src/presets/builtin/gravity-well.json',
  './src/ui/Controls.js', './src/ui/Hud.js', './src/ui/Gestures.js',
  './src/pwa/install.js', './src/pwa/wakelock.js',
  './assets/icons/192.png', './assets/icons/512.png', './assets/icons/maskable.png',
  './assets/demo/loop.ogg',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Individually so one missing optional asset (icons/demo) does not fail the install.
    await Promise.allSettled(PRECACHE.map((u) => cache.add(u).catch((err) => console.warn('[sw] precache miss', u, err.message))));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('physviz-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/assets/')) e.respondWith(cacheFirst(request));
  else e.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  const refresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { refresh.catch(() => {}); return hit; }
  const net = await refresh;
  if (net) return net;
  if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
  return Response.error();
}