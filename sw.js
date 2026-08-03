// Stamped by scripts/stamp-version.js — do not edit by hand.
// Changes automatically whenever app shell or question data changes,
// which forces old cached data to be replaced next time we're online.
const CACHE_VERSION = "v1-72a1e260";

// Per-file content hashes for everything CACHE_VERSION covers. Lets
// precache() tell which files actually changed and copy the rest forward
// from the previous cache instead of re-downloading all of it on every
// ship. Files not listed here (icons, "./") are always re-fetched.
const FILE_HASHES = {
  "index.html": "2b96b1331c50db9f",
  "styles.css": "9899f80d58aa0fca",
  "app.js": "c0c4943a9d5ce87a",
  "manifest.webmanifest": "de76ad5da1344100",
  "version.json": "ea600920acabd26b",
  "data/categories.json": "1f7bc0decd1e780a",
  "data/questions/animals-nature.json": "1b397da2f9cd4c80",
  "data/questions/arts-literature.json": "1c2be0c07307024d",
  "data/questions/big-bang-theory.json": "8e2fe2c9d2bc3649",
  "data/questions/business-brands.json": "7ad1426d8df641e8",
  "data/questions/film-tv.json": "b8d985771cf2474a",
  "data/questions/food-drink.json": "b1fc5237fda34004",
  "data/questions/friends.json": "047e3ec40b64353c",
  "data/questions/general.json": "58193c3a3864c64a",
  "data/questions/geography.json": "2fa15af92cca137a",
  "data/questions/history.json": "980438c3be7cca9c",
  "data/questions/music.json": "77fa635542b4f413",
  "data/questions/mythology-religion.json": "821f0946966d53c5",
  "data/questions/science-technology.json": "a7884bd576e6f7dc",
  "data/questions/space-astronomy.json": "3516c3b83c2bc417",
  "data/questions/sports.json": "161e5b27adbe6280",
  "data/questions/world-cultures.json": "605b7a787c9d4fa2",
  "data/topics.json": "00c6219fb318d9de"
};

const CACHE_NAME = `trivia-cache-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "version.json",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "data/categories.json",
];

const MANIFEST_KEY = "__manifest__";

async function findPreviousCache() {
  const names = await caches.keys();
  const prevName = names.find((n) => n.startsWith("trivia-cache-") && n !== CACHE_NAME);
  return prevName ? caches.open(prevName) : null;
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
  const cache = await caches.open(CACHE_NAME);

  // Pull in every category's question file too, so a fresh install has
  // all data cached before the user ever opens a category.
  const res = await fetch("data/categories.json");
  const categories = await res.json();
  const dataUrls = categories.map((c) => `data/${c.file}`);

  const oldCache = await findPreviousCache();
  const oldManifest = oldCache ? await readManifest(oldCache) : null;

  await Promise.all(
    [...APP_SHELL, ...dataUrls].map(async (url) => {
      const hash = FILE_HASHES[url];
      if (oldCache && oldManifest && hash && oldManifest[url] === hash) {
        const cached = await oldCache.match(url);
        if (cached) {
          await cache.put(url, cached.clone());
          return;
        }
      }
      // Deliberately NOT caught here: if this fails, install must fail
      // too, so the browser keeps the previous (working) cache instead
      // of activating a new one that's missing app shell or question data.
      const fresh = await fetch(url);
      if (!fresh.ok) throw new Error(`Precache fetch failed for ${url}: ${fresh.status}`);
      await cache.put(url, fresh);
    })
  );

  await cache.put(MANIFEST_KEY, new Response(JSON.stringify(FILE_HASHES)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
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

// Cache-first, with a background revalidate so the cache quietly
// stays fresh whenever we do have a connection.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);

      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res && res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Update the cache in the background without blocking the
        // response — but keep the worker alive long enough to finish,
        // otherwise it can be killed right after respondWith() resolves.
        event.waitUntil(networkFetch);
        return cached;
      }

      const networkRes = await networkFetch;
      if (networkRes) return networkRes;

      if (event.request.mode === "navigate") {
        const fallback = await cache.match("index.html");
        if (fallback) return fallback;
      }

      return new Response("Offline and not cached.", { status: 503 });
    })()
  );
});
