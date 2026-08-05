// Stamped by scripts/stamp-version.js — do not edit by hand.
// Changes automatically whenever app shell or question data changes,
// which forces old cached data to be replaced next time we're online.
const CACHE_VERSION = "v1-9e9e1ce7";

// Per-file content hashes for everything CACHE_VERSION covers. Lets
// precache() tell which files actually changed and copy the rest forward
// from the previous cache instead of re-downloading all of it on every
// ship. Files not listed here (icons, "./") are always re-fetched.
const FILE_HASHES = {
  "index.html": "b4cf078634119c65",
  "styles.css": "6bfaba5c340996e8",
  "app.js": "e534480079dd8062",
  "manifest.webmanifest": "de76ad5da1344100",
  "version.json": "8ac3b081160bea6d",
  "data/categories.json": "46577fab4088e580",
  "data/questions/animals-nature.json": "433122b399098b8b",
  "data/questions/arts-literature.json": "22e87c613c491ae7",
  "data/questions/big-bang-theory.json": "8e2fe2c9d2bc3649",
  "data/questions/business-brands.json": "12a1479d2549aa8a",
  "data/questions/civics-law-economics.json": "cc3d90a4d338cfd4",
  "data/questions/film-tv.json": "9ee0e7e49f7cb1b2",
  "data/questions/food-drink.json": "4a3ba1e9d8e41d60",
  "data/questions/friends.json": "047e3ec40b64353c",
  "data/questions/general.json": "6ee7320db271b32b",
  "data/questions/geography.json": "0a913fe3fd69bdbb",
  "data/questions/history.json": "b680a4a3356a3eb1",
  "data/questions/music.json": "708dca45247b5f55",
  "data/questions/mythology-religion.json": "821f0946966d53c5",
  "data/questions/science-technology.json": "8cda8a5e9e0f55cb",
  "data/questions/space-astronomy.json": "09eed4729c4a81dc",
  "data/questions/sports.json": "49250767678504a9",
  "data/questions/world-cultures.json": "843050691d7f9fe0",
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
