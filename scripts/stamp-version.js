#!/usr/bin/env node
// Recomputes a content hash over the app shell + all question data and
// stamps it into sw.js as CACHE_VERSION. This is what makes the offline
// cache refresh cleanly: whenever data or app code changes, the hash
// changes, the service worker gets a new cache name, old data is dropped
// on next activate. Run this before deploying (after validate.js passes).
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

  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(ROOT, file));
    hash.update(fs.readFileSync(file));
  }
  const digest = hash.digest("hex").slice(0, 8);
  const version = `v1-${digest}`;

  let sw = fs.readFileSync(SW_FILE, "utf8");
  const updated = sw.replace(
    /const CACHE_VERSION = ".*?";/,
    `const CACHE_VERSION = "${version}";`
  );

  if (updated === sw) {
    console.log(`Cache version unchanged (${version}) — no edit needed.`);
    return;
  }

  fs.writeFileSync(SW_FILE, updated);
  console.log(`Stamped sw.js with CACHE_VERSION = "${version}"`);
}

main();
