'use strict';

const { checkSecurityHeaders } = require('./headers');
const { scanText } = require('./secrets');
const { checkSeo } = require('./seo');
const { checkAuthSmells } = require('./auth');
const { checkRateLimit } = require('./ratelimit');

const DEFAULT_UA =
  'blitzhash-launch-ready-check/1.0 (+https://blitzhash.com; launch-readiness scanner)';

function normalizeUrl(input) {
  let u = String(input || '').trim();
  if (!u) throw new Error('URL is required');
  // Reject other schemes before we accidentally prepend https://
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(u) && !/^https?:\/\//i.test(u)) {
    throw new Error('Only http and https URLs are supported');
  }
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are supported');
  }
  return parsed.toString();
}

function collectScriptSrcs(html, baseUrl) {
  const srcs = [];
  const re = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    srcs.push(m[1]);
    if (srcs.length >= 8) break;
  }
  const out = [];
  const base = new URL(baseUrl);
  for (const s of srcs) {
    try {
      const abs = new URL(s, base);
      // Same-origin only (avoid scanning CDNs / third parties)
      if (abs.origin === base.origin) out.push(abs.toString());
    } catch {
      /* skip */
    }
  }
  return out.slice(0, 5);
}

/**
 * @param {string} urlInput
 * @param {object} [options]
 * @param {boolean} [options.probeRateLimit=true]
 * @param {boolean} [options.fetchScripts=true]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs=12000]
 */
async function scanUrl(urlInput, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch is not available (need Node 18+)');

  const url = normalizeUrl(urlInput);
  const timeoutMs = options.timeoutMs ?? 12000;
  const started = Date.now();

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': DEFAULT_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return {
      ok: false,
      url,
      error: err.message || String(err),
      score: 0,
      maxScore: 100,
      categories: {},
      findings: [
        {
          category: 'fetch',
          id: 'fetch_failed',
          severity: 'critical',
          title: 'Could not fetch URL',
          detail: err.message || String(err),
          fix: 'Check the URL is publicly reachable and allows simple GET requests.',
        },
      ],
      durationMs: Date.now() - started,
    };
  }

  const headers = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  const finalUrl = res.url || url;
  const isHttps = finalUrl.startsWith('https:');
  const html = await res.text();
  const contentType = headers['content-type'] || '';

  const findings = [];

  // --- Headers (max 35) ---
  const headerResult = checkSecurityHeaders(headers, isHttps);
  findings.push(...headerResult.findings);
  const headersScore = scale(headerResult.earned, headerResult.possible, 35);

  // --- Secrets (max 25) ---
  const secretFindings = scanText(html, 'html');
  if (options.fetchScripts !== false) {
    const scripts = collectScriptSrcs(html, finalUrl);
    for (const src of scripts) {
      try {
        const sRes = await fetchImpl(src, {
          headers: { 'user-agent': DEFAULT_UA, accept: '*/*' },
          signal: AbortSignal.timeout(Math.min(timeoutMs, 8000)),
        });
        if (sRes.ok) {
          const body = await sRes.text();
          // Cap scan size
          secretFindings.push(...scanText(body.slice(0, 500_000), `script:${src}`));
        }
      } catch {
        /* skip unreachable scripts */
      }
    }
  }
  findings.push(...secretFindings);
  // Dedupe by id+source+title
  const secretsCritical = secretFindings.filter((f) => f.severity === 'critical').length;
  const secretsHigh = secretFindings.filter((f) => f.severity === 'high').length;
  let secretsEarned = 25;
  secretsEarned -= Math.min(25, secretsCritical * 10 + secretsHigh * 5);
  if (secretsEarned < 0) secretsEarned = 0;
  const secretsScore = secretsEarned;

  // --- Rate limit (max 15) ---
  const rl = await checkRateLimit(headers, {
    probe: options.probeRateLimit !== false,
    fetchImpl,
    url: finalUrl,
  });
  findings.push(...rl.findings);
  const rateScore = scale(rl.earned, rl.possible, 15);

  // --- SEO (max 15) ---
  let seoScore = 0;
  let seoMeta = {};
  if (/html/i.test(contentType) || /<html/i.test(html.slice(0, 500))) {
    const seo = checkSeo(html);
    findings.push(...seo.findings);
    seoScore = scale(seo.earned, seo.possible, 15);
    seoMeta = seo.meta;
  } else {
    findings.push({
      category: 'seo',
      id: 'not_html',
      severity: 'low',
      title: 'Response is not HTML',
      detail: `Content-Type: ${contentType || '(none)'}. SEO checks skipped.`,
      fix: 'Point the scanner at a public HTML page for SEO checks.',
    });
    seoScore = 8; // partial — N/A
  }

  // --- Auth (max 10) ---
  const auth = checkAuthSmells(html, headers, finalUrl);
  findings.push(...auth.findings);
  const authScore = scale(auth.earned, auth.possible, 10);

  const score = Math.round(
    Math.max(0, Math.min(100, headersScore + secretsScore + rateScore + seoScore + authScore))
  );

  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort(
    (a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
  );

  return {
    ok: true,
    url,
    finalUrl,
    status: res.status,
    isHttps,
    score,
    maxScore: 100,
    grade: grade(score),
    categories: {
      headers: { score: Math.round(headersScore), max: 35 },
      secrets: { score: Math.round(secretsScore), max: 25, count: secretFindings.length },
      rate_limit: { score: Math.round(rateScore), max: 15, detail: rl.detail, probed: rl.probed },
      seo: { score: Math.round(seoScore), max: 15, meta: seoMeta },
      auth: { score: Math.round(authScore), max: 10 },
    },
    findings,
    durationMs: Date.now() - started,
    scannedAt: new Date().toISOString(),
  };
}

function scale(earned, possible, max) {
  if (!possible) return max;
  return (earned / possible) * max;
}

function grade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

module.exports = { scanUrl, normalizeUrl, grade };
