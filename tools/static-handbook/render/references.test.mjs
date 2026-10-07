/**
 * Module references in the static handbook: the per-page section and the
 * loader that attaches `<id>-references.js` to each module.
 * @see docs/superpowers/specs/2026-10-07-handbook-references-design.md
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { renderReferencesSection, i18nT, makeRefLink } from './references.mjs';
import { renderInline, renderInlineSync } from './inline.mjs';
import { renderModulePage } from './pages.mjs';
import { loadModules } from '../loaders/load-sources.mjs';

const NELSON = {
  id: 'nelson-1984', type: 'article-journal',
  author: [{ family: 'Nelson', given: 'Lloyd S.' }],
  title: 'The Shewhart Control Chart—Tests for Special Causes',
  'container-title': 'Journal of Quality Technology',
  volume: '16', issue: '4', page: '237–239',
  issued: { 'date-parts': [[1984]] },
  DOI: '10.1080/00224065.1984.11978921',
  note: { de: 'Die acht Tests', en: 'The eight tests' },
};
const AIAG = {
  id: 'aiag-msa-4', type: 'book', author: [{ family: 'AIAG' }],
  title: 'MSA', publisher: 'A & B <Press>', issued: { 'date-parts': [[2010]] },
  URL: 'https://example.test/?a=1&b=2',
};
const I18N = {
  de: { moduleHelp: { referenceVolume: 'Bd.', referenceIssue: 'Nr.', referencePage: 'S.', referenceEdition: 'Aufl.', referenceEtAl: 'u. a.' } },
  en: { moduleHelp: { referenceVolume: 'Vol.', referenceIssue: 'No.', referencePage: 'p.', referenceEdition: 'ed.', referenceEtAl: 'et al.' } },
};

test('i18nT reads dotted keys and falls back to the key', () => {
  const t = i18nT(I18N, 'en');
  assert.equal(t('moduleHelp.referenceVolume'), 'Vol.');
  assert.equal(t('moduleHelp.nope'), 'moduleHelp.nope');
});

test('section lists entries sorted, with #ref-<id> anchors', () => {
  const html = renderReferencesSection([NELSON, AIAG], 'en', i18nT(I18N, 'en'), 'References');
  assert.ok(html.startsWith('<section class="handbook-section handbook-references" id="module-references">'));
  assert.ok(html.includes('<h2>References</h2>'));
  const a = html.indexOf('id="ref-aiag-msa-4"');
  const n = html.indexOf('id="ref-nelson-1984"');
  assert.ok(a > 0 && n > a, 'AIAG sorts before Nelson');
  assert.ok(html.includes('Journal of Quality Technology, Vol. 16, No. 4, p. 237–239'));
  assert.ok(html.includes('<span class="handbook-reference__note">The eight tests</span>'));
});

test('empty list renders nothing', () => {
  assert.equal(renderReferencesSection([], 'de', i18nT(I18N, 'de'), 'Referenzen'), '');
});

test('fields are escaped, DOI and URL become external links', () => {
  const html = renderReferencesSection([NELSON, AIAG], 'de', i18nT(I18N, 'de'), 'Referenzen');
  assert.ok(html.includes('A &amp; B &lt;Press&gt;'), 'publisher escaped');
  assert.equal(html.includes('<Press>'), false);
  assert.ok(html.includes('href="https://doi.org/10.1080/00224065.1984.11978921"'));
  assert.ok(html.includes('>doi:10.1080/00224065.1984.11978921</a>'));
  assert.ok(html.includes('href="https://example.test/?a=1&amp;b=2"'), 'URL attribute-escaped');
  assert.ok(html.includes('target="_blank" rel="noopener"'));
});

test('module page shows the section only when the module has references', async () => {
  const base = { id: 'msa-typ6', phase: 'measure', cycles: null,
    help: { sections: { goal: { de: { title: 'Ziel', blocks: [{ type: 'paragraph', content: 'Text.' }] } } } } };
  const withRefs = await renderModulePage({ module: { ...base, references: [NELSON] }, lang: 'de', i18n: I18N });
  assert.ok(withRefs.html.includes('id="module-references"'));
  assert.ok(withRefs.html.includes('<h2>Referenzen</h2>'));
  const without = await renderModulePage({ module: { ...base, references: [] }, lang: 'de', i18n: I18N });
  assert.equal(without.html.includes('id="module-references"'), false);
});

test('loader attaches references, [] when the file is missing or broken', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'handbook-refs-'));
  for (const id of ['with-refs', 'no-refs', 'broken-refs']) {
    await mkdir(path.join(root, 'js/modules', id), { recursive: true });
    await writeFile(path.join(root, 'js/modules', id, `${id}-help.js`),
      `export default { moduleId: '${id}', sections: {} };`);
  }
  await writeFile(path.join(root, 'js/modules/with-refs/with-refs-references.js'),
    `export default [{ id: 'x', title: 'X' }];`);
  await writeFile(path.join(root, 'js/modules/broken-refs/broken-refs-references.js'),
    `export default [ this is not javascript`);
  const manifest = ['with-refs', 'no-refs', 'broken-refs'].map(id => ({ id, phase: 'measure' }));

  const mods = await loadModules(root, manifest);
  const byId = Object.fromEntries(mods.map(m => [m.id, m]));
  assert.deepEqual(byId['with-refs'].references.map(r => r.id), ['x']);
  assert.deepEqual(byId['no-refs'].references, []);
  assert.deepEqual(byId['broken-refs'].references, []);
});

const refLink = makeRefLink([NELSON, AIAG], i18nT(I18N, 'de'));

test('{{ref:id}} becomes an anchor with "(Author Year)"', async () => {
  const html = await renderInline('Regeln {{ref:nelson-1984}}.', { refLink });
  assert.ok(html.includes('<a class="handbook-ref" href="#ref-nelson-1984">(Nelson 1984)</a>'));
  assert.equal(renderInlineSync('Regeln {{ref:nelson-1984}}.', { refLink }).includes('href="#ref-nelson-1984"'), true);
});

test('explicit label wins and is shown without added parentheses', async () => {
  const html = await renderInline('Siehe {{ref:aiag-msa-4|AIAG-Handbuch}}.', { refLink });
  assert.ok(html.includes('<a class="handbook-ref" href="#ref-aiag-msa-4">AIAG-Handbuch</a>'));
});

test('explicit label is escaped exactly once', async () => {
  const html = await renderInline('{{ref:aiag-msa-4|A & B}}', { refLink });
  assert.ok(html.includes('>A &amp; B</a>'), html);
  assert.equal(html.includes('&amp;amp;'), false);
});

test('unknown id stays plain text even with refLink', async () => {
  const html = await renderInline('Siehe {{ref:nope-1999}} und {{ref:nope-2000|Label}}.', { refLink });
  assert.equal(html.includes('<a '), false);
  assert.ok(html.includes('nope-1999') && html.includes('Label'));
});

test('module page links inline citations to its own references', async () => {
  const module = {
    id: 'msa-typ6', phase: 'measure', cycles: null, references: [NELSON],
    help: { sections: { goal: { en: { title: 'Goal', blocks: [{ type: 'paragraph', content: 'Rules {{ref:nelson-1984}}.' }] } } } },
  };
  const { html } = await renderModulePage({ module, lang: 'en', i18n: I18N });
  assert.ok(html.includes('href="#ref-nelson-1984">(Nelson 1984)</a>'));
  assert.ok(html.includes('id="ref-nelson-1984"'));
});

test('a help section keyed "references" does not collide with the list', async () => {
  const module = {
    id: 'triz-x', phase: 'analyze', cycles: null, references: [NELSON],
    help: { sections: { references: { de: { title: 'Quellen', blocks: [{ type: 'paragraph', content: 'Text.' }] } } } },
  };
  const { html } = await renderModulePage({ module, lang: 'de', i18n: I18N });
  assert.equal(html.split('id="references"').length - 1, 1, 'help section keeps its id');
  assert.equal(html.split('id="module-references"').length - 1, 1, 'list has its own id');
});

test('null and non-object entries are skipped, not fatal', () => {
  const t = i18nT(I18N, 'en');
  const html = renderReferencesSection([null, NELSON, undefined, 'x'], 'en', t, 'References');
  assert.equal(html.split('class="handbook-reference"').length - 1, 1);
  assert.equal(renderReferencesSection([null], 'en', t, 'References'), '');
  const link = makeRefLink([null, NELSON, 7], t);
  assert.ok(link('nelson-1984').includes('href="#ref-nelson-1984"'));
});

test('{{ref:…}} inside bold and italic text stays a well-formed anchor', async () => {
  const bold = await renderInline('**Regeln {{ref:nelson-1984}}**', { refLink });
  assert.ok(bold.includes('<strong>Regeln <a class="handbook-ref" href="#ref-nelson-1984">(Nelson 1984)</a></strong>'), bold);
  const italic = await renderInline('*siehe {{ref:nelson-1984}}*', { refLink });
  assert.ok(italic.includes('<em>siehe <a class="handbook-ref" href="#ref-nelson-1984">(Nelson 1984)</a></em>'), italic);
});

test('label with "*" or "$…$" keeps the anchor intact', async () => {
  const star = await renderInline('{{ref:aiag-msa-4|AIAG *MSA*}}', { refLink });
  assert.ok(star.includes('href="#ref-aiag-msa-4">AIAG <em>MSA</em></a>'), star);
  const math = await renderInline('{{ref:aiag-msa-4|$c_g$ nach AIAG}}', { refLink });
  assert.ok(/href="#ref-aiag-msa-4">[^]*katex[^]*nach AIAG<\/a>/.test(math), math);
  assert.equal(math.includes('$c_g$'), false, 'formula rendered, not raw');
});
