// Stamped by scripts/stamp-version.js — do not edit by hand.
// Changes automatically whenever app shell or question data changes,
// which forces old cached data to be replaced next time we're online.
const CACHE_VERSION = "v1-b5f56a12";

// Per-file content hashes for everything CACHE_VERSION covers. Lets
// precache() tell which files actually changed and copy the rest forward
// from the previous cache instead of re-downloading all of it on every
// ship. Files not listed here (icons, "./") are always re-fetched.
const FILE_HASHES = {
  "index.html": "de20f3b4d7c05b0b",
  "styles.css": "b11676b6cb3b5732",
  "app.js": "ed2404a394ef941d",
  "manifest.webmanifest": "de76ad5da1344100",
  "version.json": "e9da28a17f8d0bf0",
  "data/categories.json": "46577fab4088e580",
  "data/questions/animals-nature.json": "7200981e5b73df46",
  "data/questions/arts-literature.json": "016db45d47685bae",
  "data/questions/big-bang-theory.json": "cb0a0fb9dee38f9b",
  "data/questions/business-brands.json": "3a15d5d083deab0b",
  "data/questions/civics-law-economics.json": "c1b1d4a9b8b2bbf5",
  "data/questions/film-tv.json": "ffb3d5e51db66ae4",
  "data/questions/food-drink.json": "af88f9d2ebf50a24",
  "data/questions/friends.json": "948c85b501ab0eca",
  "data/questions/general.json": "7d51fab899997139",
  "data/questions/geography.json": "a986915e20e749da",
  "data/questions/history.json": "2cf729894e17d42e",
  "data/questions/music.json": "b0a8cee63ae9f411",
  "data/questions/mythology-religion.json": "3047ee99e3aa8fc9",
  "data/questions/science-technology.json": "f417ab542f46ab4a",
  "data/questions/space-astronomy.json": "929ea015052b0716",
  "data/questions/sports.json": "c92e43df8499b8e8",
  "data/questions/world-cultures.json": "956d4d7b2544153f",
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
