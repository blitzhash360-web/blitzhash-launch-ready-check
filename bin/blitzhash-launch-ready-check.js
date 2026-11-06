#!/usr/bin/env node
'use strict';

const { scanUrl, formatReport } = require('../src');

function printHelp() {
  console.log(`BlitzHash Launch-Ready Check — scan a live URL for launch readiness

Usage:
  blitzhash-launch-ready-check --url <https://your-app.example>
  launch-ready-check --url <https://your-app.example>
  npm start -- --url <https://...>     (also starts web UI when no --url; see README)

Options:
  --url, -u <url>     Target URL (required for CLI scan)
  --json              Machine-readable JSON report
  --no-color          Disable ANSI colors
  --no-probe          Skip the gentle rate-limit probe request
  --no-scripts        Do not fetch same-origin <script src> bundles
  --fail-under <n>    Exit 1 if score is below n (default: disabled)
  --help, -h          Show help

Exit codes:
  0  Success (and score >= fail-under when set)
  1  Score below --fail-under, or scan reported fetch failure
  2  Usage / argument error

Built by BlitzHash · https://blitzhash.com
`);
}

function parseArgs(argv) {
  const opts = {
    url: null,
    json: false,
    color: true,
    probe: true,
    scripts: true,
    failUnder: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--no-color') opts.color = false;
    else if (a === '--no-probe') opts.probe = false;
    else if (a === '--no-scripts') opts.scripts = false;
    else if (a === '--url' || a === '-u') opts.url = argv[++i];
    else if (a === '--fail-under') opts.failUnder = Number(argv[++i]);
    else if (a.startsWith('--url=')) opts.url = a.slice(6);
    else if (!a.startsWith('-') && !opts.url) opts.url = a;
    else {
      console.error(`Unknown argument: ${a}`);
      opts.help = true;
      opts.bad = true;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.url) {
    printHelp();
    process.exit(opts.bad || !opts.url ? 2 : 0);
  }

  if (process.env.NO_COLOR) opts.color = false;

  const report = await scanUrl(opts.url, {
    probeRateLimit: opts.probe,
    fetchScripts: opts.scripts,
  });

  console.log(formatReport(report, { color: opts.color && !opts.json, json: opts.json }));

  if (!report.ok) process.exit(1);
  if (opts.failUnder != null && !Number.isNaN(opts.failUnder) && report.score < opts.failUnder) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
