// Stamped by scripts/stamp-version.js — do not edit by hand.
// Changes automatically whenever app shell or question data changes,
// which forces old cached data to be replaced next time we're online.
const CACHE_VERSION = "v1-4ef2b43f";

// Per-file content hashes for everything CACHE_VERSION covers. Lets
// precache() tell which files actually changed and copy the rest forward
// from the previous cache instead of re-downloading all of it on every
// ship. Files not listed here (icons, "./") are always re-fetched.
const FILE_HASHES = {
  "index.html": "ac0c469c4624bfbc",
  "styles.css": "9d16926338bddade",
  "app.js": "3ac18fc011578be7",
  "manifest.webmanifest": "de76ad5da1344100",
  "version.json": "12d4d1cba9405afd",
  "data/categories.json": "46577fab4088e580",
  "data/questions/animals-nature.json": "ae7431b6431776a4",
  "data/questions/arts-literature.json": "9eeb06dc0a91af2c",
  "data/questions/big-bang-theory.json": "b7f252e80a2e751a",
  "data/questions/business-brands.json": "47232bab421b5eb1",
  "data/questions/civics-law-economics.json": "8412b38b70661dc0",
  "data/questions/film-tv.json": "2ecb96a61ec4196a",
  "data/questions/food-drink.json": "8dae0ef64ee0701d",
  "data/questions/friends.json": "a32ead0cff33d8b1",
  "data/questions/general.json": "60bab4f3fa0e5fce",
  "data/questions/geography.json": "98bf0cada05fecd5",
  "data/questions/history.json": "0c2dee08b9e86064",
  "data/questions/music.json": "752e434b45ca61a8",
  "data/questions/mythology-religion.json": "38e6b44743b8a561",
  "data/questions/science-technology.json": "0ffa619fddecb505",
  "data/questions/space-astronomy.json": "424fb2a1fe5459ed",
  "data/questions/sports.json": "7d69200bccb5b88f",
  "data/questions/world-cultures.json": "05478c2344250508",
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
