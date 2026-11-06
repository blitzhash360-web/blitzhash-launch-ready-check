'use strict';

/**
 * Heuristic secret / credential patterns in HTML and JS text.
 * Not a full crawler — scans the HTML body and a few linked same-origin scripts.
 */

const PATTERNS = [
  {
    id: 'aws_access_key',
    label: 'AWS access key id',
    re: /\bAKIA[0-9A-Z]{16}\b/g,
    severity: 'critical',
  },
  {
    id: 'stripe_secret',
    label: 'Stripe secret key',
    re: /\bsk_(live|test)_[0-9a-zA-Z]{16,}\b/g,
    severity: 'critical',
  },
  {
    id: 'stripe_restricted',
    label: 'Stripe restricted key',
    re: /\brk_(live|test)_[0-9a-zA-Z]{16,}\b/g,
    severity: 'high',
  },
  {
    id: 'github_pat',
    label: 'GitHub personal access token',
    re: /\bghp_[0-9A-Za-z]{36}\b/g,
    severity: 'critical',
  },
  {
    id: 'github_oauth',
    label: 'GitHub OAuth token',
    re: /\bgho_[0-9A-Za-z]{36}\b/g,
    severity: 'critical',
  },
  {
    id: 'openai_key',
    label: 'OpenAI API key',
    re: /\bsk-[a-zA-Z0-9]{20,}\b/g,
    severity: 'critical',
  },
  {
    id: 'private_key',
    label: 'Private key block',
    re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    severity: 'critical',
  },
  {
    id: 'supabase_service_role',
    label: 'Supabase service-role style JWT or env name',
    re: /\b(SUPABASE_SERVICE_ROLE_KEY|service_role)\b|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    severity: 'high',
    // JWT heuristic is noisy; we filter below for service_role claims or long tokens near SUPABASE
  },
  {
    id: 'env_leak',
    label: 'Inline .env-style assignment',
    re: /\b(?:API_KEY|SECRET_KEY|PRIVATE_KEY|DATABASE_URL|DB_PASSWORD|AWS_SECRET_ACCESS_KEY)\s*=\s*['"][^'"]{8,}['"]/gi,
    severity: 'critical',
  },
  {
    id: 'generic_secret_assign',
    label: 'Hard-coded secret-looking assignment',
    re: /\b(?:secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/gi,
    severity: 'high',
  },
];

function redact(match) {
  if (!match || match.length < 8) return '***';
  return match.slice(0, 4) + '…' + match.slice(-2);
}

/**
 * @param {string} text
 * @param {string} source label (html | script:url)
 * @returns {Array<object>}
 */
function scanText(text, source) {
  if (!text || typeof text !== 'string') return [];
  const findings = [];
  const seen = new Set();

  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text)) !== null) {
      const raw = m[0];
      // Soften JWT false positives: only flag long JWTs when near service_role / SUPABASE / secret
      if (p.id === 'supabase_service_role') {
        const window = text.slice(Math.max(0, m.index - 80), m.index + raw.length + 40);
        const looksSensitive =
          /service_role|SUPABASE_SERVICE|SECRET|PRIVATE/i.test(window) ||
          /service_role/.test(raw);
        if (!looksSensitive && raw.startsWith('eyJ')) continue;
      }
      const key = `${p.id}:${redact(raw)}:${source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        category: 'secrets',
        id: p.id,
        severity: p.severity,
        title: `Possible ${p.label} in ${source}`,
        detail: `Matched pattern near: ${redact(raw)}`,
        fix: 'Remove secrets from client bundles and HTML. Move them to server-only env vars and rotate the exposed key.',
        source,
      });
      if (findings.length > 40) return findings;
    }
  }
  return findings;
}

module.exports = { scanText, PATTERNS };
