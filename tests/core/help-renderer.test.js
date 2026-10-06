import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { renderModuleHelp } from '../../js/core/help-renderer.js';

/** Render into a host div and return it. */
function render(helpDef, lang = 'en') {
  const el = document.createElement('div');
  el.append(renderModuleHelp(helpDef, lang));
  return el;
}

suite('help-renderer: renderModuleHelp()', () => {
  test('section title → <h3>', () => {
    const el = render({ sections: { s1: { en: { title: 'Overview', blocks: [] } } } });
    const h3 = el.querySelector('h3');
    assertTrue(h3 != null, 'has h3');
    assertEqual(h3.textContent, 'Overview', 'h3 text');
  });

  test('paragraph with {{term:x}} → <p> with span.glossary-term[data-glossary-term="x"]', () => {
    const el = render({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: 'see {{term:x|Foo}} now' },
    ] } } } });
    const p = el.querySelector('p');
    assertTrue(p != null, 'has p');
    const span = p.querySelector('span.glossary-term[data-glossary-term="x"]');
    assertTrue(span != null, 'has glossary-term span');
    assertEqual(span.textContent, 'Foo', 'label');
    assertEqual(p.textContent, 'see Foo now', 'full text');
  });

  test('definition → <p><strong>term:</strong> content', () => {
    const el = render({ sections: { s: { en: { blocks: [
      { type: 'definition', term: 'Cpk', content: 'capability index' },
    ] } } } });
    const p = el.querySelector('p');
    const strong = p.querySelector('strong');
    assertTrue(strong != null, 'has strong');
    assertEqual(strong.textContent, 'Cpk:', 'term + colon in strong');
    assertEqual(p.textContent, 'Cpk: capability index', 'full text');
  });

  test('heading → <h4>', () => {
    const el = render({ sections: { s: { en: { blocks: [
      { type: 'heading', content: 'Steps' },
    ] } } } });
    const h4 = el.querySelector('h4');
    assertTrue(h4 != null, 'has h4');
    assertEqual(h4.textContent, 'Steps', 'h4 text');
  });

  test('list → <ul><li>', () => {
    const el = render({ sections: { s: { en: { blocks: [
      { type: 'list', items: ['one', 'two'] },
    ] } } } });
    const lis = el.querySelectorAll('ul > li');
    assertEqual(lis.length, 2, 'two li');
    assertEqual(lis[0].textContent, 'one', 'li 0');
    assertEqual(lis[1].textContent, 'two', 'li 1');
  });

  test('markdown enhancement: **bold** + $math$ render inside paragraph', () => {
    const el = render({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: 'a **b** $x$' },
    ] } } } });
    assertTrue(el.querySelector('p strong') != null, 'bold rendered');
    assertEqual(el.querySelector('p strong').textContent, 'b', 'bold text');
    assertTrue(el.querySelector('span.dmike-math-inline') != null, 'math placeholder');
  });

  test('empty / no sections → fallback <p>', () => {
    const el1 = render({});
    assertEqual(el1.querySelector('p').textContent, 'No help content.', 'no-sections fallback');
    const el2 = render(null);
    assertEqual(el2.querySelector('p').textContent, 'No help content.', 'null fallback');
    const el3 = render({ sections: {} });
    assertEqual(el3.querySelector('p').textContent, 'No help content.', 'empty-sections fallback');
  });

  test('language fallback: missing lang → en → de', () => {
    const el = render({ sections: { s: { de: { title: 'Übersicht', blocks: [] } } } }, 'en');
    assertEqual(el.querySelector('h3').textContent, 'Übersicht', 'falls back to de');
  });

  test('XSS-y content renders inert (no <img>, literal textContent)', () => {
    const el = render({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: '<img src=x onerror=alert(1)>' },
    ] } } } });
    assertEqual(el.querySelector('img'), null, 'no img element');
    assertEqual(el.querySelector('p').textContent, '<img src=x onerror=alert(1)>', 'literal text');
  });
});

const REFS = [{
  id: 'aiag-msa-4',
  author: [{ family: 'AIAG' }],
  title: 'Measurement Systems Analysis (MSA)',
  issued: { 'date-parts': [[2010]] },
}];

const THREE_AUTHOR_REFS = [{
  id: 'montgomery-2011',
  author: [{ family: 'Montgomery' }, { family: 'Runger' }, { family: 'Hubele' }],
  title: 'Engineering Statistics',
  issued: { 'date-parts': [[2011]] },
}];

suite('help-renderer: inline references', () => {
  test('known {{ref:id}} → link labelled with the author-year form', () => {
    const el = document.createElement('div');
    el.append(renderModuleHelp({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: 'Grenzwert nach {{ref:aiag-msa-4}}.' },
    ] } } } }, 'en', REFS));
    const a = el.querySelector('a.help-panel__ref-xref[data-reference-id="aiag-msa-4"]');
    assertTrue(a != null, 'has ref link');
    assertEqual(a.textContent, '(AIAG 2010)', 'author-year label');
  });

  test('explicit label wins', () => {
    const el = document.createElement('div');
    el.append(renderModuleHelp({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: '{{ref:aiag-msa-4|MSA-Handbuch}}' },
    ] } } } }, 'en', REFS));
    assertEqual(el.querySelector('a.help-panel__ref-xref').textContent, 'MSA-Handbuch', 'label');
  });

  test('unknown id renders as plain text, not a link', () => {
    const el = document.createElement('div');
    el.append(renderModuleHelp({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: 'siehe {{ref:tippfehler}} hier' },
    ] } } } }, 'en', REFS));
    assertEqual(el.querySelectorAll('a.help-panel__ref-xref').length, 0, 'no link');
    assertEqual(el.querySelector('p').textContent, 'siehe tippfehler hier', 'plain text');
  });

  test('called without references behaves as before', () => {
    const el = document.createElement('div');
    el.append(renderModuleHelp({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: 'ohne {{ref:x}}' },
    ] } } } }, 'en'));
    assertEqual(el.querySelector('p').textContent, 'ohne x', 'plain text fallback');
  });

  test('three-or-more-author label uses the German "u. a." without an explicit t', () => {
    const el = document.createElement('div');
    el.append(renderModuleHelp({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: '{{ref:montgomery-2011}}' },
    ] } } } }, 'en', THREE_AUTHOR_REFS));
    assertEqual(el.querySelector('a.help-panel__ref-xref').textContent, '(Montgomery u. a. 2011)', 'German fallback label');
  });

  test('three-or-more-author label is localized to "et al." with an English t', () => {
    const tEn = (k) => ({ 'moduleHelp.referenceEtAl': 'et al.' })[k] ?? k;
    const el = document.createElement('div');
    el.append(renderModuleHelp({ sections: { s: { en: { blocks: [
      { type: 'paragraph', content: '{{ref:montgomery-2011}}' },
    ] } } } }, 'en', THREE_AUTHOR_REFS, tEn));
    assertEqual(el.querySelector('a.help-panel__ref-xref').textContent, '(Montgomery et al. 2011)', 'English label');
  });
});

suite('help-renderer: table blocks', () => {
  test('table → wrapped .dmike-table with inline-parsed header and body cells', () => {
    const el = render({ sections: { s: { en: { blocks: [
      { type: 'table', headers: ['Model', '**Use**'], rows: [
        ['Quadratic', 'see {{term:rsm|RSM}}'],
        ['Linear', 'factorial'],
      ] },
    ] } } } });
    const table = el.querySelector('.dmike-table-wrap > table.dmike-table');
    assertTrue(table != null, 'has wrapped dmike-table');
    const ths = [...table.querySelectorAll('thead th')];
    assertEqual(ths.map(th => th.textContent).join('|'), 'Model|Use', 'header cells');
    assertTrue(ths[1].querySelector('strong') != null, 'header is inline-parsed');
    const rows = table.querySelectorAll('tbody tr');
    assertEqual(rows.length, 2, 'body rows');
    assertEqual(rows[0].querySelectorAll('td').length, 2, 'cells per row');
    assertTrue(rows[0].querySelector('span.glossary-term[data-glossary-term="rsm"]') != null, 'term-ref in cell');
  });

  test('table without rows renders nothing', () => {
    const el = render({ sections: { s: { en: { blocks: [
      { type: 'table', headers: ['A'], rows: [] },
    ] } } } });
    assertTrue(el.querySelector('table') == null, 'no table');
  });
});
