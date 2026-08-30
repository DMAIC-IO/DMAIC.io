/**
 * Guards that `{{term:id|label}}` never reaches the published page as raw text.
 *
 * Regression: the generator resolved the markup only in prose (paragraphs,
 * lists, notes). Everywhere else it merely HTML-escaped the string, so the
 * tokens were printed verbatim — 880 times in visible content across 259
 * pages (section headings, definition labels, table headers) and another
 * 1056 times inside <title>, <meta name="description">, og:description and
 * the JSON-LD, which is what search engines index. The glossary is described
 * in app/dev/glossary/README.md as the SEO entry point into the handbook.
 *
 * Two different treatments are required:
 *   - rendered HTML  → resolve the token into a glossary link
 *   - plain-text slots (title, meta, JSON-LD) → strip to the visible label
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock } from './blocks.mjs';
import { stripTermTokens } from './escape.mjs';
import { renderGlossaryTermPage, renderGlossaryIndex } from './glossary-page.mjs';

const HREF = { glossaryHref: id => `/de/glossar/${id}.html` };

test('stripTermTokens reduziert Markup auf das sichtbare Label', () => {
  assert.equal(stripTermTokens('Streuung gegen {{term:cp|Cp}} und {{term:cpk|Cpk}}'),
    'Streuung gegen Cp und Cpk');
  assert.equal(stripTermTokens('ohne Label: {{term:varianz}}'), 'ohne Label: varianz');
  assert.equal(stripTermTokens('nichts zu tun'), 'nichts zu tun');
  assert.equal(stripTermTokens(null), '');
});

test('die Überschrift eines Definitionsblocks löst Markup auf', async () => {
  const html = await renderBlock(
    { type: 'definition', term: 'p-Karte — siehe {{term:p-chart|p-Karte}}', content: 'Anteil defekter Einheiten.' },
    HREF,
  );
  assert.equal(html.includes('{{term:'), false, 'Rohmarkup in der Überschrift');
  assert.ok(html.includes('/de/glossar/p-chart.html'), 'Glossarlink fehlt');
});

test('Tabellenköpfe lösen Markup auf', async () => {
  const html = await renderBlock(
    { type: 'table', headers: ['Kennzahl {{term:cp|Cp}}'], rows: [['1,33']] },
    HREF,
  );
  assert.equal(html.includes('{{term:'), false);
  assert.ok(html.includes('/de/glossar/cp.html'));
});

/** Minimaler Begriff, dessen Kurztext Markup enthält. */
function term(id = 'test-term') {
  return {
    id,
    category: 'capability',
    title: { de: 'Testbegriff', en: 'Test term' },
    short: { de: 'Vergleicht die Streuung mit den {{term:cp|Cp}}-Grenzen.', en: 'Compares spread with the {{term:cp|Cp}} limits.' },
    definition: { de: [{ type: 'paragraph', text: 'Text.' }], en: [{ type: 'paragraph', text: 'Text.' }] },
    aliases: { de: [], en: [] },
    seeAlso: [], modules: [], algoLab: [], sources: [],
  };
}

const CTX = { glossary: { termById: new Map() }, modules: [], lang: 'de', i18n: {} };

test('der Kurztext einer Begriffsseite erscheint verlinkt, die Metadaten als Klartext', async () => {
  const { html } = await renderGlossaryTermPage({ term: term(), ...CTX });
  const headEnd = html.indexOf('</head>');
  const head = html.slice(0, headEnd);
  const body = html.slice(headEnd);
  assert.equal(body.includes('{{term:'), false, 'Rohmarkup im sichtbaren Inhalt');
  assert.equal(head.includes('{{term:'), false, 'Rohmarkup in <title>/<meta>/JSON-LD');
  assert.ok(head.includes('Cp'), 'das Label muss in den Metadaten erhalten bleiben');
});

test('die Kurztexte auf der Glossar-Übersicht lösen Markup auf', async () => {
  const t = term();
  const glossary = {
    termById: new Map([[t.id, t]]),
    categories: [{ id: 'capability', label: { de: 'Prozessfähigkeit', en: 'Process Capability' } }],
    terms: [t],
  };
  const { html } = await renderGlossaryIndex({ glossary, modules: [], lang: 'de', i18n: {} });
  assert.equal(html.includes('{{term:'), false, 'Rohmarkup in der Übersicht');
});
