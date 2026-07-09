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
