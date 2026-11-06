'use strict';

/**
 * Auth / cookie / open-redirect smell checks.
 */

function checkAuthSmells(html, headers, finalUrl) {
  const findings = [];
  let earned = 12; // start full; deduct
  const possible = 12;

  // Set-Cookie Secure / HttpOnly
  const rawSetCookie = headers['set-cookie'];
  const cookies = [];
  if (rawSetCookie) {
    // node fetch may join; also support array from undici
    const parts = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie];
    for (const p of parts) {
      // split on comma carefully is hard; treat whole as one or split on ", " before next name=
      String(p)
        .split(/,(?=\s*[^;=]+=[^;=]+)/)
        .forEach((c) => cookies.push(c.trim()));
    }
  }

  if (cookies.length) {
    for (const c of cookies) {
      const name = c.split('=')[0];
      const lower = c.toLowerCase();
      const hasHttpOnly = /;\s*httponly\b/i.test(c);
      const hasSecure = /;\s*secure\b/i.test(c);
      if (!hasHttpOnly) {
        findings.push({
          category: 'auth',
          id: 'cookie_httponly',
          severity: 'high',
          title: `Cookie "${name}" missing HttpOnly`,
          detail: 'Without HttpOnly, JavaScript can read the cookie (XSS → session theft).',
          fix: 'Set HttpOnly on session cookies.',
        });
        earned -= 3;
      }
      if (!hasSecure && finalUrl.startsWith('https:')) {
        findings.push({
          category: 'auth',
          id: 'cookie_secure',
          severity: 'high',
          title: `Cookie "${name}" missing Secure`,
          detail: 'Cookie can be sent over plain HTTP.',
          fix: 'Set Secure on cookies when serving HTTPS.',
        });
        earned -= 3;
      }
    }
  }

  // Open redirect smells: login links with next=/redirect=/returnUrl=/continue= to external or protocol-relative
  const attrRe = /(?:href|action)=["']([^"']+)["']/gi;
  let m;
  const seen = new Set();
  while ((m = attrRe.exec(html)) !== null) {
    const href = m[1];
    let parsed;
    try {
      // Support relative URLs with query strings
      parsed = new URL(href, 'https://example.invalid');
    } catch {
      continue;
    }
    for (const key of ['next', 'redirect', 'returnUrl', 'return_to', 'continue', 'url']) {
      if (!parsed.searchParams.has(key)) continue;
      const target = parsed.searchParams.get(key) || '';
      if (!/^(https?:\/\/|\/\/)/i.test(target)) continue;
      if (seen.has(target)) continue;
      seen.add(target);
      findings.push({
        category: 'auth',
        id: 'open_redirect',
        severity: 'high',
        title: 'Possible open redirect on login/return param',
        detail: `Found ${key}= pointing at: ${target.slice(0, 120)}`,
        fix: 'Only allow relative same-origin paths for next/redirect params. Reject absolute external URLs.',
      });
      earned -= 4;
    }
  }

  // Login page without HTTPS final URL
  const looksLikeLogin =
    /<form[^>]+(?:login|signin|sign-in|auth)/i.test(html) ||
    /\b(?:log[\s-]?in|sign[\s-]?in)\b/i.test(html.slice(0, 5000));
  if (looksLikeLogin && finalUrl.startsWith('http:')) {
    findings.push({
      category: 'auth',
      id: 'login_over_http',
      severity: 'critical',
      title: 'Login-like page served over HTTP',
      detail: 'Credentials may be sent in cleartext.',
      fix: 'Force HTTPS (redirect) before any auth form.',
    });
    earned -= 6;
  }

  if (earned < 0) earned = 0;
  // If nothing bad found, keep full points
  if (!findings.length) earned = possible;

  return { findings, earned, possible };
}

module.exports = { checkAuthSmells };
