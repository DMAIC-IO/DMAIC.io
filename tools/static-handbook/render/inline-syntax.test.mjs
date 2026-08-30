/**
 * Guards that the static handbook renders the same inline syntax as the app.
 *
 * Module help content IS inline-markdown — js/core/help-renderer.js states it
 * and routes every string through parseInline(): `**bold**`, `*italic*`,
 * `$latex$` and `{{term:id|label}}`. The handbook generator implemented only
 * escaping plus term links, so the remaining markers were delivered verbatim:
 * 175 literal `**bold**` markers across 34 pages, plus literal `$…$` in the
 * glossary short texts.
 *
 * Because the two renderers disagreed, four MSA help files had been written
 * with raw HTML (`<sub>`, `<em>`, `<strong>`, `<code>`) instead — which BOTH
 * renderers escape, so readers saw `b<sub>ij</sub>` literally. Those files are
 * migrated to the supported syntax; this suite pins the syntax they rely on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock } from './blocks.mjs';

const HREF = { glossaryHref: id => `/de/glossar/${id}.html` };

test('**fett** und *kursiv* werden ausgezeichnet, nicht wörtlich ausgegeben', async () => {
  const html = await renderBlock({ type: 'paragraph', content: 'Ein **wichtiger** und *feiner* Hinweis.' }, HREF);
  assert.ok(html.includes('<strong>wichtiger</strong>'), 'fett fehlt');
  assert.ok(html.includes('<em>feiner</em>'), 'kursiv fehlt');
  assert.equal(html.includes('**'), false, 'literale Sternchen im Output');
});

test('Inline-Mathe wird zu KaTeX gerendert', async () => {
  const html = await renderBlock({ type: 'paragraph', content: 'Der Bias ist $b_{ij} = y_{ij} - x_{ij}$.' }, HREF);
  assert.ok(html.includes('katex'), 'kein KaTeX im Output');
  assert.equal(html.includes('katex-error'), false, 'KaTeX-Parsefehler');
  assert.equal(/\$/.test(html.replace(/&#36;/g, '')), false, 'literale Dollarzeichen im Output');
});

test('Mathe mit Vergleichsoperator überlebt das Escaping', async () => {
  // Dieselbe Falle wie im Glossar-Renderer: erst escapen, dann KaTeX füttern,
  // hätte "&lt;" an den Parser gegeben.
  const html = await renderBlock({ type: 'paragraph', content: 'Gilt $Q_{MS} < 15$ Prozent.' }, HREF);
  assert.equal(html.includes('katex-error'), false);
});

test('rohes HTML im Quelltext bleibt escaped — es ist kein unterstützter Auszeichner', async () => {
  const html = await renderBlock({ type: 'paragraph', content: 'Ein <script>alert(1)</script>-Versuch.' }, HREF);
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('Glossarverweise funktionieren weiterhin, auch neben Fett und Mathe', async () => {
  const html = await renderBlock(
    { type: 'paragraph', content: '**Wichtig:** {{term:cp|Cp}} nutzt $6\\sigma$.' },
    HREF,
  );
  assert.ok(html.includes('/de/glossar/cp.html'), 'Glossarlink fehlt');
  assert.ok(html.includes('<strong>Wichtig:</strong>'));
  assert.ok(html.includes('katex'));
});

test('Listen und Definitions-Überschriften nutzen dieselbe Auszeichnung', async () => {
  const list = await renderBlock({ type: 'list', items: ['**fett** in der Liste'] }, HREF);
  assert.ok(list.includes('<strong>fett</strong>'));
  const def = await renderBlock({ type: 'definition', term: '**Bias**', content: 'Mit $\\sigma$ gerechnet.' }, HREF);
  assert.ok(def.includes('<strong>Bias</strong>'));
  assert.ok(def.includes('katex'));
});
