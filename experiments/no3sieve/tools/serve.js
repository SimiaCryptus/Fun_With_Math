#!/usr/bin/env node
// tools/serve.js — zero-dependency static server.
//
// Why it exists: module Workers require http(s). Opening index.html over file://
// silently drops the app onto the main-thread fallback path (runner.js), which is
// correct but slow — and "slow for a reason nobody told me" is exactly the class
// of silent degradation this codebase tries to avoid.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const ROOT = resolve(process.argv[3] || '.');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`serve: bad port ${process.argv[2]}`);
  process.exit(2);
}

const server = createServer(async (req, res) => {
  let file = ROOT;
  try {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    file = resolve(ROOT, '.' + normalize(p));
    // Directory traversal is the one thing a dev server must still refuse.
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden\n');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (e) {
    const code = e && e.code === 'ENOENT' ? 404 : 500;
    res.writeHead(code, { 'content-type': 'text/plain' });
    res.end(`${code} ${(e && e.message) || e}\n`);
  }
});

server.listen(PORT, () => console.log(`no3sieve → http://localhost:${PORT}/  (root ${ROOT})`));
