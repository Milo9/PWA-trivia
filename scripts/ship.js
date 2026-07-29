#!/usr/bin/env node
// Bundles the mechanical parts of shipping a change: validate the data,
// stamp the offline cache version, stage everything, commit, push.
// Does NOT write the commit message for you — that still requires
// actually understanding the diff, which isn't worth scripting away.
//
// Usage: node scripts/ship.js "commit message"
//    or: npm run ship -- "commit message"

const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

const message = process.argv.slice(2).join(" ").trim();
if (!message) {
  console.error('Usage: node scripts/ship.js "commit message"');
  process.exit(1);
}

try {
  run("node", ["scripts/validate.js"]);
} catch (e) {
  console.error("\nValidation failed — fix the errors above before shipping.");
  process.exit(1);
}

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
