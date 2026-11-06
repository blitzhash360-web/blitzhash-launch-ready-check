'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { scanUrl, normalizeUrl, grade } = require('../src');
const { server, PORT } = require('../fixtures/serve');

describe('normalizeUrl', () => {
  it('adds https when missing', () => {
    assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  });
  it('rejects non-http', () => {
    assert.throws(() => normalizeUrl('ftp://x'), /Only http/);
  });
});

describe('grade', () => {
  it('maps bands', () => {
    assert.equal(grade(95), 'A');
    assert.equal(grade(82), 'B');
    assert.equal(grade(70), 'C');
    assert.equal(grade(55), 'D');
    assert.equal(grade(10), 'F');
  });
});

describe('scan fixture site', () => {
  before(async () => {
    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  });
  after(async () => {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  it('flags headers, secrets, seo, auth, rate_limit', async () => {
    const report = await scanUrl(`http://127.0.0.1:${PORT}/`, {
      probeRateLimit: true,
      fetchScripts: true,
    });
    assert.equal(report.ok, true);
    assert.ok(report.score < 90, `expected low-ish score, got ${report.score}`);
    const cats = new Set(report.findings.map((f) => f.category));
    assert.ok(cats.has('headers'), 'headers findings');
    assert.ok(cats.has('secrets') || report.categories.secrets.count > 0, 'secrets');
    assert.ok(cats.has('seo'), 'seo');
    assert.ok(cats.has('auth'), 'auth');
    assert.ok(cats.has('rate_limit'), 'rate_limit');
    assert.ok(report.categories.secrets.count >= 1);
  });
});

describe('scan against mock good-ish response', () => {
  it('scores higher when headers + seo present and no secrets', async () => {
    const html = `<!doctype html><html><head>
      <title>Acme Launch Pad App</title>
      <meta name="description" content="Acme helps founders ship secure AI-built apps with confidence and speed." />
      <meta property="og:title" content="Acme Launch Pad" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head><body><h1>Hello</h1></body></html>`;

    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      url: 'https://good.example/',
      headers: {
        forEach(cb) {
          const h = {
            'content-type': 'text/html',
            'content-security-policy': "default-src 'self'",
            'strict-transport-security': 'max-age=31536000; includeSubDomains',
            'x-frame-options': 'DENY',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'strict-origin-when-cross-origin',
            'permissions-policy': 'camera=()',
            'x-ratelimit-limit': '100',
            'x-ratelimit-remaining': '99',
          };
          Object.entries(h).forEach(([k, v]) => cb(v, k));
        },
      },
      async text() {
        return html;
      },
    });

    const report = await scanUrl('https://good.example/', {
      fetchImpl,
      probeRateLimit: false,
      fetchScripts: false,
    });
    assert.equal(report.ok, true);
    assert.ok(report.score >= 85, `expected high score, got ${report.score}`);
    assert.equal(report.categories.secrets.count, 0);
  });
});
