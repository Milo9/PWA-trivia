#!/usr/bin/env node
// Bundles the mechanical parts of shipping a change: validate the data,
// bump the visible build number, stamp the offline cache version, stage
// everything, commit, push. Does NOT write the commit message for you —
// that still requires actually understanding the diff, which isn't worth
// scripting away.
//
// Usage: node scripts/ship.js "commit message"
//    or: npm run ship -- "commit message"

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

const message = process.argv.slice(2).join(" ").trim();
if (!message) {
  console.error('Usage: node scripts/ship.js "commit message"');
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
