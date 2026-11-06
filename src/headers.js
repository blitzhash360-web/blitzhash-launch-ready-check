'use strict';

/** Security response headers we expect on a production site. */

const EXPECTED = [
  {
    id: 'content-security-policy',
    names: ['content-security-policy', 'content-security-policy-report-only'],
    label: 'Content-Security-Policy',
    weight: 8,
    severity: 'high',
    fix: 'Add a Content-Security-Policy header that restricts scripts, frames, and connect-src to trusted origins.',
  },
  {
    id: 'strict-transport-security',
    names: ['strict-transport-security'],
    label: 'Strict-Transport-Security (HSTS)',
    weight: 8,
    severity: 'high',
    httpsOnly: true,
    fix: 'Serve over HTTPS and set Strict-Transport-Security: max-age=31536000; includeSubDomains',
  },
  {
    id: 'x-frame-options',
    names: ['x-frame-options'],
    // CSP frame-ancestors also counts
    altCheck: (headers) => {
      const csp = (headers['content-security-policy'] || headers['content-security-policy-report-only'] || '').toLowerCase();
      return /\bframe-ancestors\b/.test(csp);
    },
    label: 'X-Frame-Options / frame-ancestors',
    weight: 6,
    severity: 'medium',
    fix: 'Set X-Frame-Options: DENY (or SAMEORIGIN), or CSP frame-ancestors.',
  },
  {
    id: 'x-content-type-options',
    names: ['x-content-type-options'],
    label: 'X-Content-Type-Options',
    weight: 5,
    severity: 'medium',
    fix: 'Set X-Content-Type-Options: nosniff',
  },
  {
    id: 'referrer-policy',
    names: ['referrer-policy'],
    label: 'Referrer-Policy',
    weight: 4,
    severity: 'low',
    fix: 'Set Referrer-Policy: strict-origin-when-cross-origin (or stricter).',
  },
  {
    id: 'permissions-policy',
    names: ['permissions-policy', 'feature-policy'],
    label: 'Permissions-Policy',
    weight: 4,
    severity: 'low',
    fix: 'Set Permissions-Policy to disable unused browser features (camera, mic, geolocation, etc.).',
  },
];

/**
 * @param {Record<string,string>} headers lowercased keys
 * @param {boolean} isHttps
 */
function checkSecurityHeaders(headers, isHttps) {
  const findings = [];
  let earned = 0;
  let possible = 0;

  for (const h of EXPECTED) {
    if (h.httpsOnly && !isHttps) {
      // Still count as missing on http targets, but note it
      possible += h.weight;
      findings.push({
        category: 'headers',
        id: h.id,
        severity: h.severity,
        title: `Missing ${h.label}`,
        detail: 'Target is HTTP — HSTS only applies over HTTPS. Use HTTPS in production.',
        fix: h.fix,
        present: false,
      });
      continue;
    }
    possible += h.weight;
    const present =
      h.names.some((n) => headers[n] && String(headers[n]).trim()) ||
      (typeof h.altCheck === 'function' && h.altCheck(headers));
    if (present) {
      earned += h.weight;
    } else {
      findings.push({
        category: 'headers',
        id: h.id,
        severity: h.severity,
        title: `Missing ${h.label}`,
        detail: `Response did not include ${h.label}.`,
        fix: h.fix,
        present: false,
      });
    }
  }

  return { findings, earned, possible };
}

module.exports = { checkSecurityHeaders, EXPECTED };
