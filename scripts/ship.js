#!/usr/bin/env node
// Bundles the mechanical parts of shipping a change: run the unit tests,
// validate the data, bump the visible build number (only when a file the
// phone downloads changed — see shouldBumpBuild), stamp the offline cache
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
const { HASHED_FILES } = require("./stamp-version.js");

const ROOT = path.join(__dirname, "..");
const VERSION_FILE = path.join(ROOT, "version.json");

// Files a phone actually downloads. A ship that touches none of them (docs,
// templates, tooling, audit progress) doesn't bump the build, so phones don't
// get an "update ready" toast for a change they can't see. sw.js and icons/
// aren't in HASHED_FILES but still change what the phone runs.
function isServedPath(p) {
  return (HASHED_FILES.includes(p) && p !== "version.json")
    || p === "sw.js"
    || p === "data/categories.json"
    || p.startsWith("data/questions/")
    || p.startsWith("icons/");
}

// `porcelain` is `git status --porcelain --untracked-files=all` output, i.e.
// every path that differs from HEAD (staged, unstaged or untracked).
function changedPaths(porcelain) {
  return porcelain.split("\n").filter(Boolean).flatMap((line) =>
    line.slice(3).split(" -> ").map((p) => p.replace(/^"|"$/g, "")));
}

// Bump only for a served change, and only once: version.json already
// differing from HEAD means an earlier ship attempt bumped it and then failed.
function shouldBumpBuild(porcelain) {
  const paths = changedPaths(porcelain);
  return !paths.includes("version.json") && paths.some(isServedPath);
}

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT }).toString().trimEnd();
}

function bumpVersion() {
  const data = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
  data.build += 1;
  fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`Bumped version.json to build ${data.build}`);
}

function push() {
  try {
    run("git", ["push"]);
  } catch (e) {
    console.error("\nCommitted locally, but the push failed. Fix the cause (network/auth) and rerun ship — it pushes unpushed commits even when there's nothing new to commit.");
    process.exit(1);
  }
}

const USAGE =
  'Usage: node scripts/ship.js "commit message"\n' +
  "   or: node scripts/ship.js --file <path-to-message-file>  (for multi-line messages)";

function main() {
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

  const pendingChanges = git(["status", "--porcelain", "--untracked-files=all"]);
  if (!pendingChanges.trim()) {
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

  if (shouldBumpBuild(pendingChanges)) bumpVersion();
  else console.log("No app/data files changed (or the build was already bumped) — keeping the current build number.");
  run("node", ["scripts/stamp-version.js"]);
  run("git", ["add", "-A"]);

  try {
    run("git", ["commit", "-m", message]);
  } catch (e) {
    // There's always something staged here (the tree wasn't clean), so a
    // failed commit is a real failure (hook, signing, identity), not "clean".
    console.error("\ngit commit failed — see the output above. Everything is still staged; fix the cause and rerun ship (it won't bump the build a second time).");
    process.exit(1);
  }

  push();
  console.log("\nShipped.");
}

if (require.main === module) main();
module.exports = { isServedPath, changedPaths, shouldBumpBuild };
