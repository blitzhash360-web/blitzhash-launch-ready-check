(function () {
  const form = document.getElementById('scan-form');
  const statusEl = document.getElementById('status');
  const results = document.getElementById('results');
  const go = document.getElementById('go');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('url').value.trim();
    results.hidden = true;
    statusEl.hidden = false;
    statusEl.textContent = 'Scanning… this usually takes a few seconds.';
    go.disabled = true;
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok && data.error) throw new Error(data.error);
      render(data);
      statusEl.textContent = data.ok
        ? `Done in ${data.durationMs}ms`
        : `Fetch issue: ${data.error || 'unknown'}`;
    } catch (err) {
      statusEl.textContent = err.message || String(err);
      results.hidden = true;
    } finally {
      go.disabled = false;
    }
  });

  function render(report) {
    results.hidden = false;
    const cats = report.categories || {};
    const catRows = Object.entries(cats)
      .map(([k, v]) => `<div>${escapeHtml(k)}</div><div>${v.score} / ${v.max}</div>`)
      .join('');
    const findings = (report.findings || [])
      .map(
        (f) => `<article class="finding">
        <div class="sev ${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</div>
        <h3>[${escapeHtml(f.category)}] ${escapeHtml(f.title)}</h3>
        <p>${escapeHtml(f.detail || '')}</p>
        ${f.fix ? `<p class="fix">fix: ${escapeHtml(f.fix)}</p>` : ''}
      </article>`
      )
      .join('');

    results.innerHTML = `
      <div class="card">
        <div class="score-hero">
          <div class="score-num">${report.score ?? 0}</div>
          <div class="grade">/ ${report.maxScore ?? 100} · grade ${escapeHtml(report.grade || '—')}</div>
        </div>
        <p>Final URL: <code>${escapeHtml(report.finalUrl || report.url || '')}</code></p>
        <div class="cats">${catRows}</div>
        <h2>Findings (${(report.findings || []).length})</h2>
        ${findings || '<p>No findings on this pass.</p>'}
        <p style="margin-top:1rem;color:var(--muted);font-size:0.9rem">
          Going to production? This is a first-pass heuristic.
          <a href="https://blitzhash.com" rel="noopener">Book a free 15-minute launch review</a>.
        </p>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
