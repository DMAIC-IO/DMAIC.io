/**
 * Guards the inline pipeline of the glossary page renderer.
 *
 * Regression: `escAndLinkAndMath()` HTML-escaped the whole text BEFORE it
 * extracted the `$…$` bodies, so KaTeX received `&lt;` / `&gt;` / `&#39;`
 * instead of `<` / `>` / `'` and bailed out with
 * "Expected 'EOF', got '&'". That produced 37 red katex-error spans across
 * 20 published pages (cusum-chart, odds-ratio, d-prime, poisson-regression,
 * ueberdispersion, …) — every glossary term whose inline math contained a
 * comparison operator or a prime.
 *
 * The in-app renderer (js/core/markdown-parser.js) gets the order right:
 * it tokenizes first and never escapes a math body.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderGlossaryTermPage } from './glossary-page.mjs';

/** Minimal term fixture; only the fields the renderer touches. */
function term(blocks) {
  return {
    id: 'test-term',
    category: 'msa',
    title: { de: 'Testbegriff', en: 'Test term' },
    short: { de: 'kurz', en: 'short' },
    definition: { de: blocks, en: blocks },
    aliases: { de: [], en: [] },
    seeAlso: [], modules: [], algoLab: [], sources: [],
  };
}

const CTX = { glossary: { termById: new Map() }, modules: [], lang: 'de', i18n: {} };

async function render(blocks) {
  const { html } = await renderGlossaryTermPage({ term: term(blocks), ...CTX });
  return html;
}

test('inline math with a comparison operator renders without a KaTeX error', async () => {
  const html = await render([{ type: 'paragraph', text: 'Kriterium: $c < 0$ deutet auf Bias.' }]);
  assert.equal(html.includes('katex-error'), false, 'KaTeX bekam einen escapten Body');
  assert.equal(html.includes('&amp;lt;'), false, 'doppelt escapte Entity im Output');
});

test('inline math with a prime renders without a KaTeX error', async () => {
  const html = await render([{ type: 'paragraph', text: "Der Kennwert $d' = 1$ ist grenzwertig." }]);
  assert.equal(html.includes('katex-error'), false);
});

test('inline math in list items and notes is unescaped too', async () => {
  const html = await render([
    { type: 'list', items: ['$p < 10\\,\\%$ ist signifikant'] },
    { type: 'note', text: 'Faustregel: $\\text{Var}(Y) > \\mathbb{E}[Y]$.' },
  ]);
  assert.equal(html.includes('katex-error'), false);
});

test('prose around the math is still HTML-escaped', async () => {
  const html = await render([{ type: 'paragraph', text: 'Ein <script>-Tag & ein $x < y$.' }]);
  assert.equal(html.includes('<script>'), false, 'Prosa wurde nicht escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'erwartete escapte Prosa fehlt');
  assert.equal(html.includes('katex-error'), false);
});

test('prose containing the placeholder word does not swallow a formula', async () => {
  const html = await render([{ type: 'paragraph', text: 'MATH ist ein Wort. Hier $a < b$ und $c > d$.' }]);
  assert.equal(html.includes('katex-error'), false);
  assert.equal((html.match(/class="katex"/g) || []).length, 2, 'beide Formeln müssen gerendert sein');
  assert.ok(html.includes('MATH ist ein Wort'), 'das Wort MATH muss stehen bleiben');
});

test('bold and italic still render around inline math', async () => {
  const html = await render([{ type: 'paragraph', text: '**fett** und *kursiv* mit $x < y$.' }]);
  assert.ok(html.includes('<strong>fett</strong>'));
  assert.ok(html.includes('<em>kursiv</em>'));
  assert.equal(html.includes('katex-error'), false);
});
