const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createServer } = require("../scripts/serve.js");

test("static server confines requests to public app files and survives malformed URLs", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (url, method = "GET") => new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: server.address().port, path: url, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (data) => { body += data; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", reject);
  });

  for (const url of ["/", "/app.js", "/storage-logic.js", "/sw.js", "/data/categories.json", "/data/questions/friends.json", "/icons/icon-32.png"]) {
    assert.equal((await request(url)).status, 200, url);
  }
  for (const url of ["/.git/config", "/package.json", "/scripts/ship.js", "/CLAUDE.md", "/scratchpad_local/private.json", "/../Offline%20Trivia-other/private.json", "/data/questions/../../package.json", "/%2e%2e/.git/config"]) {
    assert.equal((await request(url)).status, 403, url);
  }
  for (const url of ["/%E0%A4%A", "/%", "/app.js%00", "/data%5cquestions%5cfriends.json"]) {
    assert.equal((await request(url)).status, 400, url);
    assert.equal((await request("/")).status, 200, "server stays alive");
  }
  assert.equal((await request("/data/questions/missing.json")).status, 404);
  assert.equal((await request("/app.js", "POST")).status, 405);
  const head = await request("/app.js?cache=test", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  assert.equal(head.headers["x-content-type-options"], "nosniff");
});
