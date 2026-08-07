import { suite, test, assertEqual } from '../test-utils.js';
import { tokensToNodes } from '../../js/algorithm-lab/lab-renderer-tokens.js';

// Build a Prism-shaped token (duck-typed: has .type / .content / optional .alias).
function tok(type, content, alias) {
  return { type, content, alias };
}

suite('lab-renderer: tokensToNodes()', () => {
  test('plain string token becomes a single text node', () => {
    const nodes = tokensToNodes([' = ']);
    assertEqual(nodes.length, 1, 'one node');
    assertEqual(nodes[0].nodeType, 3, 'text node (nodeType 3)');
    assertEqual(nodes[0].textContent, ' = ', 'text preserved verbatim');
  });

  test('Token with string content becomes span.token.<type>', () => {
    const [span] = tokensToNodes([tok('keyword', 'const')]);
    assertEqual(span.tagName, 'SPAN', 'span element');
    assertEqual(span.getAttribute('class'), 'token keyword', 'class is "token <type>"');
    assertEqual(span.textContent, 'const', 'inner text');
    assertEqual(span.querySelector('*'), null, 'no nested markup parsed');
  });

  test('mixed array of strings and tokens preserves order and count', () => {
    const nodes = tokensToNodes([
      tok('keyword', 'const'),
      ' x ',
      tok('operator', '='),
      tok('number', '5'),
    ]);
    assertEqual(nodes.length, 4, 'four top-level nodes');
    assertEqual(nodes[0].getAttribute('class'), 'token keyword', 'first is keyword span');
    assertEqual(nodes[1].nodeType, 3, 'second is text node');
    assertEqual(nodes[1].textContent, ' x ', 'whitespace text preserved');
    assertEqual(nodes[2].getAttribute('class'), 'token operator', 'third is operator span');
    assertEqual(nodes[3].getAttribute('class'), 'token number', 'fourth is number span');
  });

  test('string alias is appended after the type class', () => {
    const [span] = tokensToNodes([tok('function', 'sqrt', 'method')]);
    assertEqual(span.getAttribute('class'), 'token function method', 'type + single alias');
  });

  test('array alias appends every alias in order', () => {
    const [span] = tokensToNodes([tok('class-name', 'Foo', ['type', 'bar'])]);
    assertEqual(span.getAttribute('class'), 'token class-name type bar', 'type + all aliases');
  });

  test('missing/empty alias yields just "token <type>"', () => {
    const [a] = tokensToNodes([tok('comment', '// hi')]);
    assertEqual(a.getAttribute('class'), 'token comment', 'no trailing space, no alias');
    const [b] = tokensToNodes([tok('comment', '// hi', [])]);
    assertEqual(b.getAttribute('class'), 'token comment', 'empty-array alias ignored');
  });

  test('nested array content recurses into child spans', () => {
    const [outer] = tokensToNodes([
      tok('template-string', ['`a', tok('interpolation', '${x}'), 'b`']),
    ]);
    assertEqual(outer.getAttribute('class'), 'token template-string', 'outer class');
    assertEqual(outer.childNodes.length, 3, 'three children');
    assertEqual(outer.childNodes[0].nodeType, 3, 'first child text');
    assertEqual(outer.childNodes[0].textContent, '`a', 'first child text content');
    assertEqual(outer.childNodes[1].getAttribute('class'), 'token interpolation', 'middle child span');
    assertEqual(outer.childNodes[2].textContent, 'b`', 'last child text content');
    assertEqual(outer.textContent, '`a${x}b`', 'flattened text matches source');
  });

  test('empty token array yields no nodes', () => {
    assertEqual(tokensToNodes([]).length, 0, 'no nodes');
  });
});
