#!/usr/bin/env node
// Bundles the mechanical parts of shipping a change: validate the data,
// bump the visible build number, stamp the offline cache version, stage
// everything, commit, push. Does NOT write the commit message for you —
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

const pendingChanges = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT })
  .toString()
  .trim();
if (!pendingChanges) {
  console.log("Nothing to ship — working tree is already clean.");
  process.exit(0);
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
  console.log("\nNothing to commit (working tree already clean after stamping).");
  process.exit(0);
}

run("git", ["push"]);
console.log("\nShipped.");
