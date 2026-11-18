// Change this only if you ever need every phone to throw away its saved copy.
// Normal code changes don't need it: app files are fetched fresh whenever there's signal.
const CACHE_NAME = 'ironman-v3';

// The app's own files. Paths are relative to this file, so the app works from any folder
// (e.g. example.com/ or example.com/ironman/).
const APP_FILES = [
    './',
    './index.html',
    './styles.css',
    './script.js',
    './manifest.json',
    './logo.png',
    './image/reactor.png',
    './icon512_maskable.png'
];

// Libraries from CDNs. These must match the URLs in index.html exactly.
const CDN_FILES = [
    'https://unpkg.com/lucide@1.67.0/dist/umd/lucide.min.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap'
];

// With weak gym signal, show the saved copy instead of waiting longer than this.
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // 'reload' skips the browser's own HTTP cache so we save the real latest files.
        await cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })));
        // 'no-cors' matches how the page's <script>/<link> tags load them. Never block the install on these.
        await Promise.all(CDN_FILES.map((url) =>
            fetch(url, { mode: 'no-cors' })
                .then((response) => cache.put(url, response))
                .catch(() => {})
        ));
        await self.skipWaiting();
    })());
});

// Delete old versions' caches and take over open pages right away.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    // Audio asks for byte ranges; iPhone Safari won't play a song answered from the cache, so let it go straight to the network.
    if (request.headers.has('range')) return;

    if (new URL(request.url).origin !== self.location.origin) {
        event.respondWith(cacheFirst(request));
        return;
    }

    const fresh = fetchAndSave(request);
    event.waitUntil(fresh.catch(() => {})); // keep saving the new copy even if we answered from the cache
    event.respondWith(freshOrSaved(request, fresh));
});

// App files: get the latest from the network and save it for offline use.
function fetchAndSave(request) {
    return fetch(request, { cache: 'no-cache' }).then(async (response) => {
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    });
}

// Prefer the fresh copy; fall back to the saved one when offline, on a server error, or when the network is too slow.
async function freshOrSaved(request, fresh) {
    const saved = await caches.match(request);
    if (!saved) return fresh;
    const tooSlow = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, saved));
    const freshOrFallback = fresh.then((response) => (response.ok ? response : saved), () => saved);
    return Promise.race([freshOrFallback, tooSlow]);
}

// CDN libraries and fonts are pinned to fixed versions, so the saved copy is always right.
async function cacheFirst(request) {
    const saved = await caches.match(request);
    if (saved) return saved;
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    }
    return response;
}
