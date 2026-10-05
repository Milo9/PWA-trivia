#!/usr/bin/env node
// Pulls player thumbs-down reports straight from the Firebase Realtime
// Database (using a service-account key, since the public rules deny all
// reads) and prints the same triage view as feedback-report.js. Also clears
// reports once the question has been dealt with.
//
// Usage:
//   npm run feedback-pull                         triage view, most-reported first
//   npm run feedback-pull -- --json               the same, as JSON
//   npm run feedback-pull -- --resolve <questionId> [<questionId> ...]
//                                                  archive, then delete, every
//                                                  report for those questions
//
// Setup (one time, by a person): Firebase console -> Project settings ->
// Service accounts -> Generate new private key. Save the JSON OUTSIDE this
// repo (it grants full access to the project) at
//   ~/.offline-trivia/firebase-service-account.json
// or point at it with --key <path> or $FEEDBACK_SERVICE_ACCOUNT.
//
// The database URL is read from FEEDBACK_DB_URL in app.js (override: --db).
// Resolved reports are appended to ~/.offline-trivia/feedback-archive.jsonl
// before they're deleted. Zero dependencies (Node 18+): the OAuth token is
// minted with a hand-signed service-account JWT.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadCorpus, extractReports, group, printText } = require("./feedback-report.js");

const ROOT = path.join(__dirname, "..");
const HOME_DIR = path.join(os.homedir(), ".offline-trivia");
const DEFAULT_KEY = path.join(HOME_DIR, "firebase-service-account.json");
const ARCHIVE_FILE = process.env.FEEDBACK_ARCHIVE || path.join(HOME_DIR, "feedback-archive.jsonl");
const SCOPES = "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email";

const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function dbUrl() {
  const override = flagValue("--db");
  if (override) return override.replace(/\/+$/, "");
  const m = fs.readFileSync(path.join(ROOT, "app.js"), "utf8").match(/const FEEDBACK_DB_URL = "(https:\/\/[^"]+)";/);
  if (!m) fail("FEEDBACK_DB_URL isn't set in app.js (pass --db <url> to override).");
  return m[1].replace(/\/+$/, "");
}

function loadKey() {
  const file = flagValue("--key") || process.env.FEEDBACK_SERVICE_ACCOUNT || DEFAULT_KEY;
  if (!fs.existsSync(file)) {
    fail(
      `No service-account key at ${file}\n\n` +
        "Create one: Firebase console -> Project settings -> Service accounts ->\n" +
        "Generate new private key. Save the JSON OUTSIDE this repo at that path\n" +
        "(or pass --key <path> / set $FEEDBACK_SERVICE_ACCOUNT)."
    );
  }
  const key = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!key.client_email || !key.private_key) fail(`${file} doesn't look like a service-account key.`);
  return key;
}

const b64url = (input) => Buffer.from(input).toString("base64url");

async function accessToken(key) {
  const tokenUri = key.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPES, aud: tokenUri, iat: now, exp: now + 3600 })
  );
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key).toString("base64url");
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) fail(`Couldn't get an access token (HTTP ${res.status}): ${JSON.stringify(body)}`);
  return body.access_token;
}

async function rtdb(method, url, token) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) fail(`${method} ${url} failed (HTTP ${res.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const base = dbUrl();
  const token = await accessToken(loadKey());
  const feedback = (await rtdb("GET", `${base}/feedback.json`, token)) || {};
  const entries = Object.entries(feedback).filter(([, r]) => r && typeof r.questionId === "string");

  const resolveAt = args.indexOf("--resolve");
  if (resolveAt !== -1) {
    const ids = new Set(args.slice(resolveAt + 1).filter((a) => !a.startsWith("--")));
    if (!ids.size) fail("Usage: npm run feedback-pull -- --resolve <questionId> [<questionId> ...]");
    const matching = entries.filter(([, r]) => ids.has(r.questionId));
    if (!matching.length) {
      console.log(`No reports found for: ${[...ids].join(", ")}`);
      return;
    }
    // Archive first, so nothing is lost if a later delete fails.
    fs.mkdirSync(HOME_DIR, { recursive: true });
    const stamp = new Date().toISOString();
    fs.appendFileSync(ARCHIVE_FILE, matching.map(([key, r]) => JSON.stringify({ resolvedAt: stamp, key, ...r })).join("\n") + "\n");
    for (const [key] of matching) await rtdb("DELETE", `${base}/feedback/${encodeURIComponent(key)}.json`, token);
    console.log(`Resolved ${matching.length} report(s) for ${new Set(matching.map(([, r]) => r.questionId)).size} question(s); archived to ${ARCHIVE_FILE}`);
    return;
  }

  const reports = extractReports(feedback);
  const groups = group(reports, loadCorpus());
  if (args.includes("--json")) console.log(JSON.stringify({ total: reports.length, questions: groups }, null, 2));
  else if (!reports.length) console.log("No feedback reports waiting.");
  else printText(groups, reports.length);
}

main().catch((e) => fail(e.message));
