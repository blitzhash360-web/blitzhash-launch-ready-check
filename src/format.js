'use strict';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function colorize(enabled, code, text) {
  if (!enabled) return text;
  return `${code}${text}${RESET}`;
}

function severityColor(enabled, sev, text) {
  const map = {
    critical: RED,
    high: MAGENTA,
    medium: YELLOW,
    low: CYAN,
  };
  return colorize(enabled, map[sev] || DIM, text);
}

function formatReport(report, { color = true, json = false } = {}) {
  if (json) return JSON.stringify(report, null, 2);

  const lines = [];
  const c = (code, t) => colorize(color, code, t);

  lines.push(c(BOLD, 'BlitzHash Launch-Ready Check'));
  lines.push(c(DIM, 'Security headers · secrets · rate limits · SEO · auth smells'));
  lines.push('');

  if (!report.ok) {
    lines.push(c(RED, `FETCH FAILED: ${report.error}`));
    lines.push(`URL: ${report.url}`);
    lines.push(`Score: 0 / 100`);
    return lines.join('\n');
  }

  lines.push(`URL:      ${report.finalUrl || report.url}`);
  lines.push(`Status:   ${report.status}${report.isHttps ? ' · HTTPS' : ' · HTTP'}`);
  lines.push(`Duration: ${report.durationMs}ms`);
  lines.push('');

  const scoreColor =
    report.score >= 80 ? GREEN : report.score >= 50 ? YELLOW : RED;
  lines.push(
    c(BOLD, 'Launch score: ') +
      c(scoreColor, `${report.score} / ${report.maxScore}`) +
      c(DIM, `  (grade ${report.grade})`)
  );
  lines.push('');
  lines.push(c(BOLD, 'Category breakdown'));
  const cats = report.categories || {};
  for (const [name, data] of Object.entries(cats)) {
    const label = name.padEnd(12);
    lines.push(`  ${label} ${String(data.score).padStart(2)} / ${data.max}`);
  }
  lines.push('');

  if (!report.findings.length) {
    lines.push(c(GREEN, 'No findings. Looking solid for a first-pass launch check.'));
  } else {
    lines.push(c(BOLD, `Findings (${report.findings.length})`));
    for (const f of report.findings) {
      const sev = severityColor(color, f.severity, f.severity.toUpperCase().padEnd(8));
      lines.push(`  ${sev} [${f.category}] ${f.title}`);
      if (f.detail) lines.push(c(DIM, `           ${f.detail}`));
      if (f.fix) lines.push(c(CYAN, `           fix: ${f.fix}`));
    }
  }

  lines.push('');
  lines.push(
    c(DIM, 'Heuristic scan — not a penetration test. Built by BlitzHash · https://blitzhash.com')
  );
  return lines.join('\n');
}

module.exports = { formatReport };
