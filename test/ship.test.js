const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldBumpBuild, changedPaths } = require("../scripts/ship.js");

test("ship bumps the build only when a file phones download changed", () => {
  const status = (...lines) => lines.join("\n");
  // Docs, templates, tooling and audit bookkeeping: no app update.
  assert.equal(shouldBumpBuild(status(" M CLAUDE.md", " M templates/sports.md", " M scripts/ship.js", " M audit/progress.json", "?? test/new.test.js", " M data/topics.json")), false);
  // Anything served does bump, including sw.js and icons (not in FILE_HASHES).
  for (const p of ["app.js", "styles.css", "index.html", "sw.js", "manifest.webmanifest", "data/categories.json", "data/questions/friends.json", "icons/icon-192.png"]) {
    assert.equal(shouldBumpBuild(status(" M CLAUDE.md", ` M ${p}`)), true, p);
  }
  assert.equal(shouldBumpBuild("?? data/questions/new-category.json"), true);
  assert.equal(shouldBumpBuild("R  old.md -> data/questions/x.json"), true);
  // Already bumped by a ship whose commit failed: don't bump twice.
  assert.equal(shouldBumpBuild(status(" M version.json", " M app.js")), false);
  assert.deepEqual(changedPaths('R  a.js -> "b c.js"\n M d.js'), ["a.js", "b c.js", "d.js"]);
});
