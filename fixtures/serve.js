'use strict';

/**
 * Tiny static fixture server with intentionally weak security headers.
 * Used by CI and local demos. No secrets required.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'bad-site');
const PORT = Number(process.env.FIXTURE_PORT) || 8765;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // Deliberately omit security headers. Set a weak cookie for auth checks.
  res.setHeader('Set-Cookie', 'session=fixture; Path=/'); // missing HttpOnly + Secure
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Fixture server http://127.0.0.1:${PORT}`);
  });
}

module.exports = { server, PORT, ROOT };
