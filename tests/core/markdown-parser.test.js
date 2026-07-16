import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { parseInline, appendInline } from '../../js/core/markdown-parser.js';
import { h } from '../../js/core/dom.js';

/** Append nodes into a fresh host and return it. */
function host(text, opts) {
  const el = document.createElement('div');
  parseInline(text, opts).forEach(n => el.append(n));
  return el;
}

suite('markdown-parser: parseInline()', () => {
  test('plain text → single text node, exact textContent', () => {
    const nodes = parseInline('just some text');
    assertEqual(nodes.length, 1, 'one node');
    assertEqual(nodes[0].nodeType, Node.TEXT_NODE, 'is text node');
    assertEqual(nodes[0].textContent, 'just some text', 'exact text');
  });

  test('**bold** → <strong> with surrounding text preserved', () => {
    const el = host('a **bold** b');
    const strong = el.querySelector('strong');
    assertTrue(strong != null, 'has strong');
    assertEqual(strong.textContent, 'bold', 'strong text');
    assertEqual(el.textContent, 'a bold b', 'full text preserved');
  });

  test('*italic* → <em>', () => {
    const el = host('an *italic* word');
    const em = el.querySelector('em');
    assertTrue(em != null, 'has em');
    assertEqual(em.textContent, 'italic', 'em text');
    assertEqual(el.textContent, 'an italic word', 'full text');
  });

  test('$\\sigma^2$ → span.dmike-math-inline placeholder, no katex call', () => {
    const el = host('var $\\sigma^2$ here');
    const span = el.querySelector('span.dmike-math-inline');
    assertTrue(span != null, 'has math span');
    assertEqual(span.getAttribute('data-katex-inline'), '\\sigma^2', 'latex attr');
    assertEqual(span.textContent, '\\sigma^2', 'body as text');
    // KaTeX renders later; placeholder must NOT be marked rendered.
    assertEqual(span.getAttribute('data-katex-rendered'), null, 'not pre-rendered');
  });

  test('{{term:foo-bar|Label}} → termRef called with id+label, node inserted', () => {
    let captured = null;
    const el = host('see {{term:foo-bar|Label}} now', {
      termRef: (id, label) => { captured = { id, label }; return h('a', { 'data-id': id }, label); },
    });
    assertEqual(captured.id, 'foo-bar', 'id');
    assertEqual(captured.label, 'Label', 'label');
    const a = el.querySelector('a[data-id="foo-bar"]');
    assertTrue(a != null, 'anchor inserted');
    assertEqual(a.textContent, 'Label', 'anchor text');
    assertEqual(el.textContent, 'see Label now', 'full text');
  });

  test('{{term:foo-bar}} (no label) → termRef called with label=null', () => {
    let captured = null;
    host('x {{term:foo-bar}} y', {
      termRef: (id, label) => { captured = { id, label }; return h('span', null, id); },
    });
    assertEqual(captured.id, 'foo-bar', 'id');
    assertEqual(captured.label, null, 'label is null');
  });

  test('termRef omitted → term renders as text node (label or id), no throw', () => {
    const el1 = host('a {{term:foo-bar|Label}} b');
    assertEqual(el1.querySelector('a, span'), null, 'no element');
    assertEqual(el1.textContent, 'a Label b', 'label as text');
    const el2 = host('a {{term:foo-bar}} b');
    assertEqual(el2.textContent, 'a foo-bar b', 'id as text');
  });

  test('combined string → ordered node sequence + full visible text', () => {
    let calls = [];
    const el = host('see **A** and $x$ and {{term:t|T}}', {
      termRef: (id, label) => { calls.push(id); return h('a', { 'data-id': id }, label); },
    });
    // Element sequence in order.
    const els = [...el.children].map(c => c.tagName.toLowerCase() + ':' + c.textContent);
    assertEqual(els.join('|'), 'strong:A|span:x|a:T', 'ordered elements');
    assertEqual(el.querySelector('span.dmike-math-inline').getAttribute('data-katex-inline'), 'x', 'math body');
    assertEqual(calls.join(','), 't', 'termRef called once');
    assertEqual(el.textContent, 'see A and x and T', 'visible text');
  });

  test('HTML-injection safety: <img onerror> stays literal text node', () => {
    const el = host('<img src=x onerror=1>');
    assertEqual(el.querySelector('img'), null, 'no img element');
    assertEqual(el.childNodes.length, 1, 'single node');
    assertEqual(el.childNodes[0].nodeType, Node.TEXT_NODE, 'text node');
    assertEqual(el.textContent, '<img src=x onerror=1>', 'literal');
  });
});

suite('markdown-parser: appendInline()', () => {
  test('appends parsed nodes into host and returns host', () => {
    const host = document.createElement('p');
    const ret = appendInline(host, 'a **b** c');
    assertEqual(ret, host, 'returns host');
    assertEqual(host.querySelector('strong').textContent, 'b', 'appended');
    assertEqual(host.textContent, 'a b c', 'text');
  });
});
