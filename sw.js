// Stamped by scripts/stamp-version.js — do not edit by hand.
// Changes automatically whenever app shell or question data changes,
// which forces old cached data to be replaced next time we're online.
const CACHE_VERSION = "v1-c6f64b99";

// Per-file content hashes for everything CACHE_VERSION covers. Lets
// precache() tell which files actually changed and copy the rest forward
// from the previous cache instead of re-downloading all of it on every
// ship. Files not listed here (icons, "./") are always re-fetched.
const FILE_HASHES = {
  "index.html": "55f2d4a1c9f10d6f",
  "styles.css": "01092583ebdee441",
  "storage-logic.js": "f370171755d96ad1",
  "game-logic.js": "ddaf34b27bf8a9fc",
  "feedback-queue.js": "13e63d5409e12eb2",
  "app.js": "89a214fb7aeaeada",
  "manifest.webmanifest": "2a35dc54d2e4d65e",
  "version.json": "8b875d4df24b90cf",
  "data/categories.json": "0d01f574061f8e2b",
  "data/questions/animals-nature.json": "776a4cc7859f4bdf",
  "data/questions/arts-literature.json": "c2a1cae706e6afd4",
  "data/questions/big-bang-theory.json": "382b3424037f1244",
  "data/questions/business-brands.json": "ec733500e0d57056",
  "data/questions/catchphrases.json": "f14bc1f0ef0fdaeb",
  "data/questions/civics-law-economics.json": "f2ed07c0c2bd39c2",
  "data/questions/film-tv.json": "ec69414dced2b4b1",
  "data/questions/food-drink.json": "701b90b81211bb00",
  "data/questions/friends.json": "34ed9de170ca1fcb",
  "data/questions/general.json": "c3963a36cb069e58",
  "data/questions/geography.json": "e6e2ca79b2529f6b",
  "data/questions/history.json": "11b5b59022e0a519",
  "data/questions/music.json": "c11d2bb1067b38ca",
  "data/questions/mythology-religion.json": "c47f8f1c28067a9f",
  "data/questions/science-technology.json": "0f1c06357dc3caef",
  "data/questions/space-astronomy.json": "61fff7f4c763432f",
  "data/questions/sports.json": "9fc2805d8dbcdd72",
  "data/questions/tv-catchphrases.json": "f1ac168ffa2f1c0d",
  "data/questions/world-cultures.json": "7fa0d17e2f7375f2",
  "data/topics.json": "00c6219fb318d9de"
};

const CACHE_NAME = `trivia-cache-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "index.html",
  "styles.css",
  "game-logic.js",
  "storage-logic.js",
  "feedback-queue.js",
  "app.js",
  "manifest.webmanifest",
  "version.json",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "data/categories.json",
];

const MANIFEST_KEY = "__manifest__";
let offlineState = { type: "OFFLINE_STATUS", status: "checking", completed: 0, total: 0 };

async function fetchForOffline(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    // Keep the timeout active through the body download, including stalled wifi.
    const body = await response.arrayBuffer();
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { clearTimeout(timeout); }
}

async function publishOfflineStatus(status, completed = 0, total = 0) {
  offlineState = { type: "OFFLINE_STATUS", status, completed, total };
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) if (client.url.startsWith(self.registration.scope)) client.postMessage(offlineState);
}

async function offlineStatus() {
  if (offlineState.status === "downloading") return offlineState;
  const cache = await caches.open(CACHE_NAME);
  const urls = [...new Set([...APP_SHELL, ...Object.keys(FILE_HASHES).filter(url => url.startsWith("data/questions/"))])];
  const present = await Promise.all(urls.map(url => cache.match(url)));
  const ready = await cache.match(MANIFEST_KEY) && present.every(Boolean);
  return { type: "OFFLINE_STATUS", status: ready ? "ready" : "failed", completed: present.filter(Boolean).length, total: urls.length };
}

// Picks the previous cache that actually carries a hash manifest (an
// interrupted install can leave a partial, manifest-less cache behind that
// would otherwise win by being listed first).
async function findPreviousCache() {
  const names = (await caches.keys()).filter((n) => n.startsWith("trivia-cache-") && n !== CACHE_NAME);
  for (const name of names) {
    const cache = await caches.open(name);
    if (await cache.match(MANIFEST_KEY)) return cache;
  }
  return names.length ? caches.open(names[0]) : null;
}

async function readManifest(cache) {
  const res = await cache.match(MANIFEST_KEY);
  if (!res) return null;
  try {
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function precache() {
  await publishOfflineStatus("downloading");
  const cache = await caches.open(CACHE_NAME);

  // Pull in every category's question file too, so a fresh install has
  // all data cached before the user ever opens a category.
  const res = await fetchForOffline("data/categories.json");
  if (!res.ok) throw new Error("Couldn't load the question manifest");
  const categories = await res.json();
  const dataUrls = categories.map((c) => `data/${c.file}`);

  const oldCache = await findPreviousCache();
  const oldManifest = oldCache ? await readManifest(oldCache) : null;
  const urls = [...new Set([...APP_SHELL, ...dataUrls])];
  let completed = 0;
  await publishOfflineStatus("downloading", completed, urls.length);

  const downloads = await Promise.allSettled(
    urls.map(async (url) => {
      const hash = FILE_HASHES[url === "./" ? "index.html" : url];
      if (oldCache && oldManifest && hash && oldManifest[url] === hash) {
        const cached = await oldCache.match(url);
        if (cached) {
          await cache.put(url, cached.clone());
          await publishOfflineStatus("downloading", ++completed, urls.length);
          return;
        }
      }
      // Deliberately NOT caught here: if this fails, install must fail
      // too, so the browser keeps the previous (working) cache instead
      // of activating a new one that's missing app shell or question data.
      const fresh = await fetchForOffline(url);
      if (!fresh.ok) throw new Error(`Precache fetch failed for ${url}: ${fresh.status}`);
      if (hash) {
        const digest = await crypto.subtle.digest("SHA-256", await fresh.clone().arrayBuffer());
        const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
        if (actual !== hash) throw new Error(`File changed during download: ${url}`);
      }
      await cache.put(url, fresh);
      await publishOfflineStatus("downloading", ++completed, urls.length);
    })
  );
  const failed = downloads.find(result => result.status === "rejected");
  if (failed) throw failed.reason;

  await cache.put(MANIFEST_KEY, new Response(JSON.stringify(FILE_HASHES)));
  await publishOfflineStatus("ready", completed, urls.length);
}

// No skipWaiting() here: a new build installs (and precaches) in the
// background, then waits until either the page asks for it (the "update
// ready" toast in app.js posts SKIP_WAITING) or every tab of the old version
// is closed — so a session never runs the old app.js against a swapped-out
// cache, and a fresh launch always comes up on the newest version.
let precacheTask = null;
function downloadOffline() {
  if (!precacheTask) precacheTask = precache().catch(async error => {
    await publishOfflineStatus("failed");
    throw error;
  }).finally(() => { precacheTask = null; });
  return precacheTask;
}

self.addEventListener("install", (event) => {
  event.waitUntil(downloadOffline());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "GET_OFFLINE_STATUS") {
    event.waitUntil(offlineStatus().then(status => {
      if (event.ports[0]) event.ports[0].postMessage(status);
      else if (event.source) event.source.postMessage(status);
    }));
  }
  if (event.data && event.data.type === "REPAIR_OFFLINE_CACHE") {
    event.waitUntil(downloadOffline().catch(() => {}));
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("trivia-cache-") && n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// Cache-first, no background revalidation. Everything the app needs is
// precached and content-hashed: freshness comes from a new build stamping a
// new CACHE_VERSION (the browser re-checks sw.js on every launch), not from
// re-fetching files that can't have changed under the same version. The old
// stale-while-revalidate handler re-downloaded the entire ~7.6MB question
// corpus in the background on every single online launch.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;

      // Not precached (or precache still in flight on a first visit): go to
      // the network and keep a copy so a later offline load has it.
      try {
        const res = await fetch(event.request);
        if (res && res.ok && new URL(event.request.url).origin === self.location.origin) {
          cache.put(event.request, res.clone());
        }
        return res;
      } catch (e) {
        if (event.request.mode === "navigate") {
          const fallback = await cache.match("index.html");
          if (fallback) return fallback;
        }
        return new Response("Offline and not cached.", { status: 503 });
      }
    })()
  );
});
