/* ─────────────────────────────────────────────────────────────
   Service worker for Cognotik Games (PWA)

   Strategy map
     navigations ............ network-first → runtime cache → offline.html
     manifest.json / *.json . stale-while-revalidate (fresh index ASAP)
     css / js / images ...... stale-while-revalidate (no hashed names)
     markdown (READMEs) ..... stale-while-revalidate
     google fonts ........... stale-while-revalidate (separate cache)
     video / range requests . bypassed entirely (streaming + seeking)

   Bump CACHE_VERSION to invalidate every cache on the next deploy.
   ───────────────────────────────────────────────────────────── */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `cognotik-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `cognotik-runtime-${CACHE_VERSION}`;
const FONT_CACHE = `cognotik-fonts-${CACHE_VERSION}`;
const OWNED_CACHES = new Set([STATIC_CACHE, RUNTIME_CACHE, FONT_CACHE]);

const OFFLINE_URL = '/offline.html';
const MAX_RUNTIME_ENTRIES = 160;

/* App shell — everything needed to boot the index with no network. */
const PRECACHE_URLS = [
    '/',
    '/index.html',
    OFFLINE_URL,
    '/app.webmanifest',
    '/manifest.json',
    '/css/style.css',
    '/css/home.css',
    '/css/videos.css',
    '/css/browse.css',
    '/css/pwa.css',
    '/js/index.js',
    '/js/home-browse.js',
    '/js/pwa.js',
    '/lib/marked.min.js',
    '/icon.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv|ogg)$/i;
const ASSET_RE = /\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|wasm)$/i;
const DATA_RE = /\.(json|webmanifest|md|txt|csv)$/i;
const FONT_HOST_RE = /^fonts\.(googleapis|gstatic)\.com$/i;

/* ── Install: precache the shell, tolerating individual misses ── */

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(STATIC_CACHE);
            const results = await Promise.allSettled(
                PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
            );
            results.forEach((r, i) => {
                if (r.status === 'rejected') {
                    console.warn('[sw] precache miss:', PRECACHE_URLS[i], r.reason && r.reason.message);
                }
            });
            // Do NOT skipWaiting automatically: js/pwa.js surfaces an
            // "update available" prompt and posts SKIP_WAITING on confirm.
        })()
    );
});

/* ── Activate: drop stale caches, enable navigation preload ───── */

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            if (self.registration.navigationPreload) {
                try {
                    await self.registration.navigationPreload.enable();
                } catch {
                    /* not supported — ignore */
                }
            }
            const keys = await caches.keys();
            await Promise.all(
                keys.filter((k) => k.startsWith('cognotik-') && !OWNED_CACHES.has(k)).map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

/* ── Messages from the page ───────────────────────────────────── */

self.addEventListener('message', (event) => {
    const type = event.data && event.data.type;
    if (type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (type === 'GET_VERSION') {
        event.source && event.source.postMessage({ type: 'VERSION', version: CACHE_VERSION });
    } else if (type === 'CLEAR_CACHES') {
        event.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
    }
});

/* ── Helpers ──────────────────────────────────────────────────── */

function isCacheable(res) {
    return res && res.ok && (res.type === 'basic' || res.type === 'cors' || res.type === 'default');
}

async function trimCache(name, max) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    if (keys.length <= max) return;
    // Oldest-first (Cache API preserves insertion order).
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function staleWhileRevalidate(event, cacheName) {
    const request = event.request;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const revalidate = fetch(request)
        .then(async (res) => {
            if (isCacheable(res)) {
                await cache.put(request, res.clone());
                if (cacheName === RUNTIME_CACHE) await trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES);
            }
            return res;
        })
        .catch(() => null);

    if (cached) {
        event.waitUntil(revalidate);
        return cached;
    }
    const fresh = await revalidate;
    if (fresh) return fresh;
    return new Response('Offline and not cached.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}

async function handleNavigate(event) {
    const request = event.request;
    const cache = await caches.open(RUNTIME_CACHE);
    try {
        const preloaded = event.preloadResponse ? await event.preloadResponse : null;
        const res = preloaded || (await fetch(request));
        if (isCacheable(res)) {
            const copy = res.clone();
            event.waitUntil(
                cache.put(request, copy).then(() => trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES))
            );
        }
        return res;
    } catch {
        const cached =
            (await cache.match(request, { ignoreSearch: true })) ||
            (await caches.match(request, { ignoreSearch: true }));
        if (cached) return cached;
        const shell = await caches.match('/index.html');
        const offline = await caches.match(OFFLINE_URL);
        return (
            offline ||
            shell ||
            new Response('<!doctype html><title>Offline</title><h1>Offline</h1>', {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
        );
    }
}

/* ── Fetch router ─────────────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Video streaming / partial content: let the network handle it.
    if (request.headers.has('range') || VIDEO_RE.test(url.pathname)) return;

    // Cross-origin: only Google Fonts is worth caching.
    if (url.origin !== self.location.origin) {
        if (FONT_HOST_RE.test(url.hostname)) {
            event.respondWith(staleWhileRevalidate(event, FONT_CACHE));
        }
        return;
    }

    // Never cache the service worker itself.
    if (url.pathname === '/sw.js') return;

    if (request.mode === 'navigate' || (request.destination === '' && request.headers.get('accept')?.includes('text/html'))) {
        event.respondWith(handleNavigate(event));
        return;
    }

    if (DATA_RE.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
        return;
    }

    if (ASSET_RE.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(event, STATIC_CACHE));
        return;
    }

    // Anything else (extensionless routes, etc.) — runtime SWR.
    event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
});
