const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { canonicalFileBytes } = require("../scripts/stamp-version.js");

test("cache stamping hashes the LF bytes GitHub Pages serves, even from a CRLF working copy", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trivia-stamp-"));
  const file = path.join(directory, "app.js");
  t.after(() => { fs.unlinkSync(file); fs.rmdirSync(directory); });
  fs.writeFileSync(file, 'const message = "é";\r\nconsole.log(message);\r\n');
  const expected = Buffer.from('const message = "é";\nconsole.log(message);\n');
  const actual = canonicalFileBytes(file);
  assert.deepEqual(actual, expected);
  assert.deepEqual(fs.readFileSync(file), expected);
  assert.equal(crypto.createHash("sha256").update(actual).digest("hex"), crypto.createHash("sha256").update(expected).digest("hex"));
  assert.deepEqual(canonicalFileBytes(file), expected);
});
