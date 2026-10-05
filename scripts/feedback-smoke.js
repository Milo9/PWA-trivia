#!/usr/bin/env node
// Live check of the published Firebase rules against a real Realtime Database
// URL. This is the ONLY real test of firebase/database.rules.json (and of the
// same-device-overwrite idempotency the upload design depends on) — run it
// once after publishing the rules and BEFORE putting the URL into app.js.
//
// Usage: npm run feedback-smoke -- <dbUrl>
//   e.g. npm run feedback-smoke -- https://my-trivia-default-rtdb.firebaseio.com
//
// Bodies are built with the app's own createReport + toWireBody, so this
// exercises the exact client payload. Needs Node 18+ (built-in fetch); no
// dependencies. Leaves a "smoke-000" record behind — delete it afterwards
// from the console's Data tab.

const crypto = require("crypto");
const { createReport, toWireBody, makeId } = require("../feedback-queue.js");

const rawUrl = process.argv[2];
// http:// is accepted only so the script's own logic can be tried against a
// local stub; a real Realtime Database URL is always https://.
if (!rawUrl || !/^https?:\/\//.test(rawUrl)) {
  console.error("Usage: npm run feedback-smoke -- <https://your-db-url>");
  process.exit(2);
}
const DB_URL = rawUrl.replace(/\/+$/, "");

const randomId = () => makeId(crypto.randomBytes(16));

function buildBody({ id, deviceId }) {
  const report = createReport({
    id,
    question: {
      id: "smoke-000",
      category: "smoke",
      question: "Smoke test — safe to delete",
      options: ["A", "B", "C", "D"],
      answer: "A",
    },
    selected: "B",
    comment: "feedback-smoke.js",
    context: "results",
    deviceId,
    appBuild: 0,
    now: Date.now(),
  });
  return toWireBody(report);
}

async function put(id, body) {
  const res = await fetch(`${DB_URL}/feedback/${encodeURIComponent(id)}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

let failed = false;
async function check(label, expected, run) {
  let result;
  try {
    result = await run();
  } catch (e) {
    result = { status: 0, text: String(e && e.message ? e.message : e) };
  }
  const ok = result.status === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} (expected ${expected}, got ${result.status})`);
  if (!ok) {
    failed = true;
    console.log(`      response body: ${result.text}`);
    console.log("      Did you publish firebase/database.rules.json?");
  }
}

async function main() {
  const id = randomId();
  const deviceId = randomId();
  const body = buildBody({ id, deviceId });

  await check("1. valid report is accepted", 200, () => put(id, body));
  await check("2. identical retry to the same id is accepted (idempotent)", 200, () => put(id, body));
  await check("3. an unexpected extra key is rejected", 401, () => {
    const otherId = randomId();
    return put(otherId, { ...buildBody({ id: otherId, deviceId }), hacked: true });
  });
  await check("4. overwrite from a different deviceId is rejected", 401, () =>
    put(id, buildBody({ id, deviceId: randomId() }))
  );

  console.log(failed ? "\nSome checks FAILED." : "\nAll checks passed. Delete the smoke-000 records from the Data tab.");
  // exitCode, not process.exit(): exiting while fetch sockets are closing
  // trips a libuv assertion on Windows.
  process.exitCode = failed ? 1 : 0;
}

main();
