#!/usr/bin/env node
// Zero-dependency static file server for local testing.
// The app must be loaded over http:// (not file://) for the service
// worker and fetch() calls to work.
//
// Usage: node scripts/serve.js [port]

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = process.argv[2] === undefined ? 8080 : Number(process.argv[2]);

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Serve only files shipped with the PWA. The repository also contains git
// metadata, local drafts, and tooling that must never be exposed over HTTP.
const PUBLIC_FILES = new Set([
  "index.html", "styles.css", "app.js", "storage-logic.js", "game-logic.js", "feedback-queue.js",
  "manifest.webmanifest", "version.json", "sw.js",
]);

function isWithin(root, file) {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function createServer(root = ROOT) {
  const realRoot = fs.realpathSync(root);
  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("Method not allowed");
      return;
    }
    let urlPath;
    try {
      urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (!urlPath.startsWith("/") || /[\\\0]/.test(urlPath)) throw new Error("Invalid path");
    } catch (e) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }
    if (urlPath === "/") urlPath = "/index.html";

    const publicPath = urlPath.slice(1);
    const allowed = PUBLIC_FILES.has(publicPath)
      || /^icons\/icon-(32|180|192|512)\.png$/.test(publicPath)
      || /^data\/(categories|topics)\.json$/.test(publicPath)
      || /^data\/questions\/[a-z0-9-]+\.json$/.test(publicPath);
    const filePath = path.resolve(realRoot, publicPath);
    if (!allowed || !isWithin(realRoot, filePath)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Check real paths as well, so a symlink inside a public directory cannot
    // turn an allowed URL into a read outside the served directory.
    fs.realpath(filePath, (err, realFile) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      if (!isWithin(realRoot, realFile)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      fs.readFile(realFile, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(req.method === "HEAD" ? undefined : data);
      });
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, "localhost", () => {
    console.log(`Serving ${ROOT} at http://localhost:${server.address().port}`);
    console.log("Press Ctrl+C to stop.");
  });
}

module.exports = { createServer };
