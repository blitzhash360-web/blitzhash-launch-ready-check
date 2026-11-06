'use strict';

const path = require('path');
const express = require('express');
const { scanUrl } = require('./scanner');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'blitzhash-launch-ready-check' });
});

function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal' ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
  );
}

async function handleScan(req, res) {
  const url = (req.body && req.body.url) || req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ ok: false, error: 'url is required' });
  }

  try {
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const parsed = new URL(u);
    if (isPrivateHost(parsed.hostname) && process.env.ALLOW_PRIVATE !== '1') {
      return res.status(400).json({
        ok: false,
        error:
          'Private/local URLs are blocked on the hosted demo. Run the CLI locally for those.',
      });
    }
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid URL' });
  }

  try {
    const report = await scanUrl(url, {
      probeRateLimit: true,
      fetchScripts: true,
      timeoutMs: 15000,
    });
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

app.post('/api/scan', handleScan);
app.get('/api/scan', handleScan);
app.get('/scan', handleScan);

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`BlitzHash Launch-Ready Check UI listening on http://${HOST}:${PORT}`);
    console.log(`Health: http://${HOST}:${PORT}/health`);
  });
}

module.exports = { app };
