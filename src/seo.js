'use strict';

/**
 * Basic SEO / social meta checks from HTML.
 */

function extractTag(html, re) {
  const m = html.match(re);
  return m ? (m[1] || m[2] || '').trim() : '';
}

function checkSeo(html) {
  const findings = [];
  let earned = 0;
  const checks = [];

  const title = extractTag(html, /<title[^>]*>([^<]*)<\/title>/i);
  checks.push({
    id: 'title',
    ok: title.length >= 3 && title.length <= 70,
    weight: 6,
    severity: 'medium',
    title: 'Document <title>',
    detail: title
      ? `Found title (${title.length} chars): "${title.slice(0, 60)}${title.length > 60 ? '…' : ''}"`
      : 'No <title> tag found.',
    fix: 'Add a clear <title> between ~15–60 characters describing the page.',
  });

  const metaDesc = extractTag(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
  ) || extractTag(
    html,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i
  );
  checks.push({
    id: 'meta_description',
    ok: metaDesc.length >= 40,
    weight: 5,
    severity: 'medium',
    title: 'Meta description',
    detail: metaDesc
      ? `Found description (${metaDesc.length} chars).`
      : 'No meta name="description" (or it is too short).',
    fix: 'Add <meta name="description" content="…"> (~50–160 characters).',
  });

  const ogTitle = extractTag(
    html,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i
  ) || extractTag(
    html,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["'][^>]*>/i
  );
  checks.push({
    id: 'og_title',
    ok: ogTitle.length >= 2,
    weight: 3,
    severity: 'low',
    title: 'Open Graph og:title',
    detail: ogTitle ? `Found og:title.` : 'No og:title meta tag.',
    fix: 'Add <meta property="og:title" content="…"> for link previews.',
  });

  const viewport = extractTag(
    html,
    /<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']*)["'][^>]*>/i
  ) || extractTag(
    html,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']viewport["'][^>]*>/i
  );
  checks.push({
    id: 'viewport',
    ok: /width\s*=\s*device-width/i.test(viewport),
    weight: 4,
    severity: 'medium',
    title: 'Viewport meta',
    detail: viewport ? `Found viewport: ${viewport.slice(0, 80)}` : 'No viewport meta tag.',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
  });

  const robots = extractTag(
    html,
    /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/i
  ) || extractTag(
    html,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["'][^>]*>/i
  );
  const robotsBlocks = /noindex/i.test(robots);
  checks.push({
    id: 'robots',
    ok: !robotsBlocks,
    weight: 4,
    severity: robotsBlocks ? 'high' : 'low',
    title: 'Robots meta',
    detail: robots
      ? `robots content="${robots}"${robotsBlocks ? ' — page asks search engines not to index it' : ''}`
      : 'No robots meta (defaults to indexable — OK for public pages).',
    fix: robotsBlocks
      ? 'Remove noindex before a public launch, or keep it only on staging.'
      : 'Optional: set robots explicitly for clarity.',
    // If no robots tag, we still award points (public default is fine)
    awardIfMissing: true,
  });

  let possible = 0;
  for (const c of checks) {
    possible += c.weight;
    const pass = c.ok || (c.awardIfMissing && !robots && c.id === 'robots');
    // Fix robots scoring: if no tag, OK; if noindex, fail
    let ok = c.ok;
    if (c.id === 'robots' && !robots) ok = true;
    if (ok) {
      earned += c.weight;
    } else {
      findings.push({
        category: 'seo',
        id: c.id,
        severity: c.severity,
        title: c.title + ' issue',
        detail: c.detail,
        fix: c.fix,
      });
    }
  }

  return { findings, earned, possible, meta: { title, metaDesc, ogTitle, viewport, robots } };
}

module.exports = { checkSeo };
