#!/usr/bin/env node
// Bundles the mechanical parts of shipping a change: run the unit tests,
// validate the data, bump the visible build number, stamp the offline cache
// version (and the per-category question counts), stage everything, commit,
// push. Does NOT write the commit message for you —
// that still requires actually understanding the diff, which isn't worth
// scripting away.
//
// Usage: node scripts/ship.js "commit message"
//    or: npm run ship -- "commit message"
//
// For a multi-line commit message, don't pass it as an inline argument:
// on Windows, `npm run` relaunches the script through cmd.exe, whose
// command-line parsing truncates at the first raw newline inside a
// quoted argument, silently dropping everything after the first line.
// Write the message to a file *outside this repo* (`ship` runs
// `git add -A`, so a file left inside the repo gets swept into the
// commit) and pass it instead:
//   node scripts/ship.js --file /path/to/message.txt
//   npm run ship -- --file /path/to/message.txt

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VERSION_FILE = path.join(ROOT, "version.json");

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

function bumpVersion() {
  const data = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
  data.build += 1;
  fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`Bumped version.json to build ${data.build}`);
}

const USAGE =
  'Usage: node scripts/ship.js "commit message"\n' +
  "   or: node scripts/ship.js --file <path-to-message-file>  (for multi-line messages)";

const args = process.argv.slice(2);
let message;
const fileFlagIndex = args.indexOf("--file");
if (fileFlagIndex !== -1) {
  const filePath = args[fileFlagIndex + 1];
  if (!filePath) {
    console.error(USAGE);
    process.exit(1);
  }
  message = fs.readFileSync(path.resolve(filePath), "utf8").trim();
} else {
  message = args.join(" ").trim();
}
if (!message) {
  console.error(USAGE);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT }).toString().trim();
}

function push() {
  try {
    run("git", ["push"]);
  } catch (e) {
    console.error("\nCommitted locally, but the push failed. Fix the cause (network/auth) and rerun ship — it pushes unpushed commits even when there's nothing new to commit.");
    process.exit(1);
  }
}

const pendingChanges = git(["status", "--porcelain"]);
if (!pendingChanges) {
  // A previous ship may have committed and then failed to push.
  let unpushed = 0;
  try {
    unpushed = Number(git(["rev-list", "--count", "@{u}..HEAD"]));
  } catch (e) {
    // no upstream configured — nothing we can push to
  }
  if (unpushed > 0) {
    console.log(`Working tree is clean, but ${unpushed} commit(s) haven't been pushed yet.`);
    push();
    console.log("\nShipped.");
    process.exit(0);
  }
  console.log("Nothing to ship — working tree is already clean.");
  process.exit(0);
}

try {
  run("node", ["--test"]);
} catch (e) {
  console.error("\nUnit tests failed — fix them before shipping.");
  process.exit(1);
}

try {
  run("node", ["scripts/validate.js"]);
} catch (e) {
  console.error("\nValidation failed — fix the errors above before shipping.");
  process.exit(1);
}

bumpVersion();
run("node", ["scripts/stamp-version.js"]);
run("git", ["add", "-A"]);

try {
  run("git", ["commit", "-m", message]);
} catch (e) {
  // There is always something staged here (at minimum the version bump), so
  // a failed commit is a real failure (hook, signing, identity), not "clean".
  console.error("\ngit commit failed — see the output above. Everything is still staged; fix the cause and rerun ship (it will bump the build number again).");
  process.exit(1);
}

push();
console.log("\nShipped.");
