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
// Also rewrites every data/questions/*.json into the canonical compact
// format (see formatQuestionFile): one question per line, no indentation,
// and no per-question "category" field (it's implied by the containing file
// and re-attached by every reader — app.js's ensureLoaded and the scripts'
// loaders). Pretty-printed or category-tagged files (a hand-merged batch)
// are accepted as input and normalized here, so merge in whatever format
// is convenient. This cut the served corpus from 7.6MB to 5.5MB raw
// (2026-09-18) — what a phone stores in its cache and JSON.parses per
// round — while keeping git diffs readable at one question per line.
//
// Also stamps per-category question counts (total and per difficulty) into
// data/categories.json, so the app can render the category picker without
// downloading and parsing a single question file — those are fetched lazily
// when a round needs them. This runs *before* hashing, so the stamped
// counts are part of what the cache version covers.
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

const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");
const HASHED_FILES = ["index.html", "styles.css", "storage-logic.js", "game-logic.js", "feedback-queue.js", "app.js", "manifest.webmanifest", "version.json"];

// GitHub Pages serves Git's LF blobs. Normalize the working copy before
// hashing too, so Windows CRLF checkouts cannot stamp a different byte stream.
function lfBytes(file) {
  return Buffer.from(fs.readFileSync(file).toString("utf8").replace(/\r\n/g, "\n"));
}

function canonicalFileBytes(file) {
  const content = lfBytes(file);
  if (!content.equals(fs.readFileSync(file))) fs.writeFileSync(file, content);
  return content;
}

// Canonical on-disk format for a question file: a JSON array, one compact
// question object per line, fixed key order, "category" dropped.
function formatQuestionFile(questions) {
  const lines = questions.map((q) => {
    const { category, ...rest } = q;
    const ordered = {
      id: rest.id,
      difficulty: rest.difficulty,
      question: rest.question,
      options: rest.options,
      answer: rest.answer,
    };
    for (const k of Object.keys(rest)) if (!(k in ordered)) ordered[k] = rest[k];
    return JSON.stringify(ordered);
  });
  return "[\n" + lines.join(",\n") + "\n]\n";
}

// Rewrites each question file in canonical format and categories.json with
// a questionCount and difficultyCounts per category. Returns the number of
// files changed.
function stampCategoryCounts() {
  let changed = 0;
  const raw = fs.readFileSync(CATEGORIES_FILE, "utf8");
  const categories = JSON.parse(raw);
  for (const cat of categories) {
    const filePath = path.join(ROOT, "data", cat.file);
    const fileRaw = fs.readFileSync(filePath, "utf8");
    const questions = JSON.parse(fileRaw);
    const formatted = formatQuestionFile(questions);
    if (formatted !== fileRaw) {
      fs.writeFileSync(filePath, formatted);
      changed += 1;
    }
    const difficultyCounts = { easy: 0, medium: 0, hard: 0 };
    for (const q of questions) {
      if (q.difficulty in difficultyCounts) difficultyCounts[q.difficulty] += 1;
    }
    cat.questionCount = questions.length;
    cat.difficultyCounts = difficultyCounts;
  }
  const updated = JSON.stringify(categories, null, 2) + "\n";
  if (updated !== raw) {
    fs.writeFileSync(CATEGORIES_FILE, updated);
    changed += 1;
  }
  return changed;
}

// Only the data files the app actually loads: categories.json and each
// category's question file. Dev-only data (data/topics.json, used by
// analyze/find-gaps) stays out, so editing it doesn't push an app update.
function collectDataFiles() {
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf8"));
  return [CATEGORIES_FILE, ...categories.map((c) => path.join(ROOT, "data", c.file))].sort();
}

function computeHashes(readBytes) {
  const files = [...HASHED_FILES.map((f) => path.join(ROOT, f)), ...collectDataFiles()];
  const combined = crypto.createHash("sha256");
  const fileHashes = {};
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const content = readBytes(file);
    combined.update(rel);
    combined.update(content);
    fileHashes[rel] = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
  return { version: `v1-${combined.digest("hex").slice(0, 8)}`, fileHashes };
}

// Read-only check for the browser suites. The service worker rejects any
// download whose hash doesn't match FILE_HASHES, so an edit to app.js that
// wasn't followed by `npm run stamp` makes offline installs fail with
// nothing but a timeout. Returns the stale file names (empty = current).
function staleStampedFiles() {
  const match = fs.readFileSync(SW_FILE, "utf8").match(/const FILE_HASHES = (\{[\s\S]*?\});/);
  const stamped = match ? JSON.parse(match[1]) : {};
  const { fileHashes } = computeHashes(lfBytes);
  const names = new Set([...Object.keys(stamped), ...Object.keys(fileHashes)]);
  return [...names].filter((name) => stamped[name] !== fileHashes[name]);
}

function assertStampCurrent() {
  const stale = staleStampedFiles();
  if (stale.length) {
    throw new Error(`sw.js FILE_HASHES is stale for: ${stale.join(", ")}. Run "npm run stamp" first; the service worker rejects files that don't match.`);
  }
}

function main() {
  const changedFiles = stampCategoryCounts();
  if (changedFiles) console.log(`Normalized question files / stamped counts (${changedFiles} file(s) rewritten)`);

  const { version, fileHashes } = computeHashes(canonicalFileBytes);

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

if (require.main === module) main();
module.exports = { canonicalFileBytes, staleStampedFiles, assertStampCurrent };
