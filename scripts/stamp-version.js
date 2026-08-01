#!/usr/bin/env node
// Recomputes a content hash over the app shell + all question data and
// stamps it into sw.js as CACHE_VERSION. This is what makes the offline
// cache refresh cleanly: whenever data or app code changes, the hash
// changes, the service worker gets a new cache name, old data is dropped
// on next activate. Also stamps a per-file hash manifest (FILE_HASHES)
// so the service worker can tell which individual files actually changed
// and copy the rest forward from the previous cache instead of
// re-downloading everything on every ship. Run this before deploying
// (after validate.js passes).
//
// Note: icons and "./" are part of the cached app shell but aren't in
// HASHED_FILES, so they have no manifest entry — the service worker
// always re-fetches those rather than guessing.
//
// Usage: node scripts/stamp-version.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const SW_FILE = path.join(ROOT, "sw.js");

const HASHED_FILES = ["index.html", "styles.css", "app.js", "manifest.webmanifest", "version.json"];

function collectDataFiles() {
  const dataDir = path.join(ROOT, "data");
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) files.push(full);
    }
  })(dataDir);
  return files.sort();
}

function main() {
  const files = [...HASHED_FILES.map((f) => path.join(ROOT, f)), ...collectDataFiles()];

  const combined = crypto.createHash("sha256");
  const fileHashes = {};
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const content = fs.readFileSync(file);
    combined.update(rel);
    combined.update(content);
    fileHashes[rel] = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
  const digest = combined.digest("hex").slice(0, 8);
  const version = `v1-${digest}`;

  let sw = fs.readFileSync(SW_FILE, "utf8");
  let updated = sw.replace(
    /const CACHE_VERSION = ".*?";/,
    `const CACHE_VERSION = "${version}";`
  );
  updated = updated.replace(
    /const FILE_HASHES = \{[\s\S]*?\};/,
    `const FILE_HASHES = ${JSON.stringify(fileHashes, null, 2)};`
  );

  if (updated === sw) {
    console.log(`Cache version unchanged (${version}) — no edit needed.`);
    return;
  }

  fs.writeFileSync(SW_FILE, updated);
  console.log(`Stamped sw.js with CACHE_VERSION = "${version}"`);
}

main();
