// Stamped by scripts/stamp-version.js — do not edit by hand.
// Changes automatically whenever app shell or question data changes,
// which forces old cached data to be replaced next time we're online.
const CACHE_VERSION = "v1-3a300be4";

// Per-file content hashes for everything CACHE_VERSION covers. Lets
// precache() tell which files actually changed and copy the rest forward
// from the previous cache instead of re-downloading all of it on every
// ship. Files not listed here (icons, "./") are always re-fetched.
const FILE_HASHES = {
  "index.html": "b4cf078634119c65",
  "styles.css": "6bfaba5c340996e8",
  "app.js": "e534480079dd8062",
  "manifest.webmanifest": "de76ad5da1344100",
  "version.json": "483ad08883a319e3",
  "data/categories.json": "46577fab4088e580",
  "data/questions/animals-nature.json": "a4b5b45ced01ea3c",
  "data/questions/arts-literature.json": "1feaf1f9a9049bfa",
  "data/questions/big-bang-theory.json": "0b11b1b39fa26c86",
  "data/questions/business-brands.json": "055969f8e2bd1490",
  "data/questions/civics-law-economics.json": "4d0d074db8e0ec60",
  "data/questions/film-tv.json": "5052c6f93b8b4a43",
  "data/questions/food-drink.json": "5113eec0ab460e0d",
  "data/questions/friends.json": "3cfbebdb41258c5d",
  "data/questions/general.json": "22f41a4390a1ed8d",
  "data/questions/geography.json": "9cee6d3602d1bdb3",
  "data/questions/history.json": "829c111bbe5240a8",
  "data/questions/music.json": "9b1925aeda63abe0",
  "data/questions/mythology-religion.json": "6dde4c79b89bd6e1",
  "data/questions/science-technology.json": "d262b3c0001f178d",
  "data/questions/space-astronomy.json": "401f330de2320757",
  "data/questions/sports.json": "94896a350a32dfde",
  "data/questions/world-cultures.json": "d0800f9b8a1ade53",
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
