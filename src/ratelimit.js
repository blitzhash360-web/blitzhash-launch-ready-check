'use strict';

/**
 * Rate-limit signal checks. Polite: at most one extra probe request.
 */

const RATE_HEADERS = [
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'ratelimit-limit',
  'ratelimit-remaining',
  'x-rate-limit-limit',
  'retry-after',
];

/**
 * @param {Record<string,string>} headers
 * @param {object} opts
 * @param {typeof fetch} opts.fetchImpl
 * @param {string} opts.url
 * @param {boolean} opts.probe whether to send one gentle extra GET
 */
async function checkRateLimit(headers, opts = {}) {
  const findings = [];
  const possible = 15;
  let earned = 0;

  const hasSignal = RATE_HEADERS.some((h) => headers[h]);
  if (hasSignal) {
    earned = possible;
    return {
      findings,
      earned,
      possible,
      detail: 'Rate-limit related headers present on primary response.',
      probed: false,
    };
  }

  // Optional gentle probe: one extra GET with a distinctive UA; look for 429 or rate headers
  let probed = false;
  if (opts.probe && opts.fetchImpl && opts.url) {
    probed = true;
    try {
      const res = await opts.fetchImpl(opts.url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'blitzhash-launch-ready-check/1.0 (+https://blitzhash.com; polite-probe)',
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(8000),
      });
      const h = {};
      res.headers.forEach((v, k) => {
        h[k.toLowerCase()] = v;
      });
      if (res.status === 429 || RATE_HEADERS.some((n) => h[n])) {
        earned = possible;
        return {
          findings,
          earned,
          possible,
          detail: res.status === 429
            ? 'Probe received HTTP 429 — rate limiting appears active.'
            : 'Probe response included rate-limit headers.',
          probed,
        };
      }
    } catch {
      // ignore probe errors; treat as unknown/absent
    }
  }

  findings.push({
    category: 'rate_limit',
    id: 'no_rate_limit_signal',
    severity: 'medium',
    title: 'No rate-limit signals detected',
    detail:
      'Primary response (and optional probe) showed no RateLimit / X-RateLimit / Retry-After headers and no HTTP 429. This is a heuristic — your API may still enforce limits elsewhere.',
    fix: 'Add rate limiting on auth, form, and expensive API routes (e.g. Cloudflare Rate Limiting, middleware, or API gateway). Return standard RateLimit headers when possible.',
  });

  // Partial credit: absence is a smell, not proof of vulnerability
  earned = 4;
  return { findings, earned, possible, detail: 'No rate-limit signals.', probed };
}

module.exports = { checkRateLimit, RATE_HEADERS };
