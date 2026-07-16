import { suite, test, assertEqual, assertThrows } from '../test-utils.js';
import { h, svg, s, templateKey, cloneTemplate } from '../../js/core/dom.js';

suite('dom: h() builder', () => {
  test('creates element with tag', () => {
    assertEqual(h('div').tagName, 'DIV', 'tag');
  });
  test('sets attributes via setAttribute', () => {
    const el = h('button', { class: 'x', 'data-id': '7', disabled: '' });
    assertEqual(el.getAttribute('class'), 'x', 'class attr');
    assertEqual(el.getAttribute('data-id'), '7', 'data attr');
    assertEqual(el.hasAttribute('disabled'), true, 'bool attr');
  });
  test('string/number children become text (escaped natively)', () => {
    const el = h('span', null, 'a<b>', 5);
    assertEqual(el.childNodes.length, 2, 'two text nodes');
    assertEqual(el.textContent, 'a<b>5', 'text content literal');
    assertEqual(el.querySelector('b'), null, 'no parsed markup');
  });
  test('node children are appended', () => {
    const child = h('i');
    const el = h('div', null, child);
    assertEqual(el.firstChild, child, 'node appended');
  });
  test('null/undefined/false children are skipped', () => {
    const el = h('div', null, null, undefined, false, 'ok');
    assertEqual(el.textContent, 'ok', 'falsy skipped');
  });
});

suite('dom: svg() builder', () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  test('creates SVG-namespaced element', () => {
    const el = svg('rect');
    assertEqual(el.namespaceURI, SVG_NS, 'namespace');
    assertEqual(el.tagName, 'rect', 'tag (lowercase in SVG ns)');
  });
  test('sets attributes via setAttribute', () => {
    const el = svg('rect', { x: 3, width: '4', 'stroke-width': 2 });
    assertEqual(el.getAttribute('x'), '3', 'numeric attr coerced');
    assertEqual(el.getAttribute('width'), '4', 'string attr');
    assertEqual(el.getAttribute('stroke-width'), '2', 'dashed attr');
  });
  test('skips null/undefined/false attrs; true → empty string', () => {
    const el = svg('rect', { a: null, b: undefined, c: false, d: true });
    assertEqual(el.hasAttribute('a'), false, 'null skipped');
    assertEqual(el.hasAttribute('b'), false, 'undefined skipped');
    assertEqual(el.hasAttribute('c'), false, 'false skipped');
    assertEqual(el.getAttribute('d'), '', 'true → empty');
  });
  test('children are SVG-namespaced and nested', () => {
    const child = svg('line');
    const g = svg('g', null, child);
    assertEqual(g.firstChild, child, 'node child appended');
    assertEqual(g.firstChild.namespaceURI, SVG_NS, 'child namespace');
  });
  test('string/number children become text', () => {
    const t = svg('text', null, 'A', 5);
    assertEqual(t.textContent, 'A5', 'text content');
  });
  test('null/undefined/false children skipped; arrays flattened', () => {
    const g = svg('g', null, null, false, [svg('a'), svg('b')], undefined);
    assertEqual(g.childNodes.length, 2, 'two element children');
  });
});

suite('dom: s() inline-CSS serializer', () => {
  test('camelCase → dash-case', () => {
    assertEqual(s({ strokeWidth: 2 }), 'stroke-width:2', 'one prop');
  });
  test('multiple props joined with semicolons', () => {
    assertEqual(s({ fill: 'red', strokeWidth: 1 }), 'fill:red;stroke-width:1', 'joined');
  });
  test('skips null and undefined values', () => {
    assertEqual(s({ fill: 'red', stroke: null, opacity: undefined }), 'fill:red', 'skips nullish');
  });
  test('keeps already-dashed keys', () => {
    assertEqual(s({ 'stroke-dasharray': '6 4' }), 'stroke-dasharray:6 4', 'dashed key kept');
  });
  test('empty object → empty string', () => {
    assertEqual(s({}), '', 'empty');
  });
});

suite('dom: templateKey + cloneTemplate', () => {
  test('templateKey strips /app/dev/ deployment prefix', () => {
    assertEqual(
      templateKey('http://x/app/dev/js/modules/sipoc/sipoc.html'),
      'js/modules/sipoc/sipoc.html',
      'dev prefix stripped',
    );
  });
  test('templateKey strips /app/<tag>/ deployment prefix', () => {
    assertEqual(
      templateKey('http://x/app/v1.2.3/js/pages/cycle/cycle.html'),
      'js/pages/cycle/cycle.html',
      'tag prefix stripped',
    );
  });
  test('cloneTemplate clones an inlined <template> into independent live nodes', () => {
    const t = document.createElement('template');
    t.setAttribute('data-tpl', 'test/key.html');
    const root = document.createElement('div');
    const span = document.createElement('span');
    span.className = 'x';
    span.textContent = 'hi';
    root.appendChild(span);
    t.content.appendChild(root);
    document.body.appendChild(t);
    try {
      const nodes = cloneTemplate('test/key.html');
      assertEqual(nodes.length, 1, 'one node');
      assertEqual(nodes[0].querySelector('.x').textContent, 'hi', 'content cloned');
      nodes[0].querySelector('.x').textContent = 'changed';
      assertEqual(
        cloneTemplate('test/key.html')[0].querySelector('.x').textContent,
        'hi',
        'independent clone',
      );
    } finally { t.remove(); }
  });
  test('cloneTemplate throws for unknown key', () => {
    assertThrows(() => cloneTemplate('does/not/exist.html'));
  });
});
