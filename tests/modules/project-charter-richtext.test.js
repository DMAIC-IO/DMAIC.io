import { suite, test, assertEqual } from '../test-utils.js';
import {
  htmlToMarkdown,
  isLegacyHtml,
  normalizeProblemStatement,
  markdownToFragment,
  domToMarkdown,
} from '../../js/modules/project-charter/project-charter-richtext.js';

/** Build a div holding the fragment parsed from `md`. */
function el(md) {
  const d = document.createElement('div');
  d.append(markdownToFragment(md));
  return d;
}

suite('project-charter-richtext: pure helpers', () => {
  test('isLegacyHtml detects tags, ignores plain text', () => {
    assertEqual(isLegacyHtml('<b>x</b>'), true, 'tag');
    assertEqual(isLegacyHtml('plain * text'), false, 'plain');
    assertEqual(isLegacyHtml(''), false, 'empty');
  });

  test('htmlToMarkdown converts bold/italic/breaks/divs', () => {
    assertEqual(htmlToMarkdown('<b>bold</b> and <i>it</i>'), '**bold** and *it*', 'b+i');
    assertEqual(htmlToMarkdown('<strong>a</strong><em>b</em>'), '**a***b*', 'strong+em');
    assertEqual(htmlToMarkdown('line1<br>line2'), 'line1\nline2', 'br');
    assertEqual(htmlToMarkdown('<div>a</div><div>b</div>'), 'a\nb', 'divs');
  });

  test('htmlToMarkdown decodes entities (amp last)', () => {
    assertEqual(
      htmlToMarkdown('a &amp; b &lt; c &gt; d &nbsp;e'),
      'a & b < c > d  e',
      'entities',
    );
  });

  test('htmlToMarkdown strips unknown tags but keeps text', () => {
    assertEqual(htmlToMarkdown('<span style="x"><b>k</b></span>'), '**k**', 'span stripped');
  });

  test('normalizeProblemStatement converts legacy, passes markdown, handles null', () => {
    assertEqual(normalizeProblemStatement('<b>x</b>'), '**x**', 'legacy html');
    assertEqual(normalizeProblemStatement('**x**'), '**x**', 'markdown passthrough');
    assertEqual(normalizeProblemStatement(null), '', 'null');
  });
});

suite('project-charter-richtext: parse + serialize round-trip', () => {
  test('markdownToFragment builds one <strong> and one <em>', () => {
    const d = el('**b** and *i*');
    const strong = d.querySelectorAll('strong');
    const em = d.querySelectorAll('em');
    assertEqual(strong.length, 1, 'one strong');
    assertEqual(strong[0].textContent, 'b', 'strong text');
    assertEqual(em.length, 1, 'one em');
    assertEqual(em[0].textContent, 'i', 'em text');
  });

  test('markdownToFragment turns \\n into a <br>', () => {
    const d = el('a\nb');
    assertEqual(d.querySelectorAll('br').length, 1, 'one br');
    assertEqual(d.textContent, 'ab', 'combined text');
  });

  test('escaped marks render literally (no strong/em)', () => {
    const d = el('2 \\* 3 \\*\\* 4');
    assertEqual(d.textContent, '2 * 3 ** 4', 'literal text');
    assertEqual(d.querySelectorAll('em').length, 0, 'no em');
    assertEqual(d.querySelectorAll('strong').length, 0, 'no strong');
  });

  test('domToMarkdown serializes text + <b> to **', () => {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode('hi '));
    const b = document.createElement('b');
    b.textContent = 'bold';
    d.appendChild(b);
    assertEqual(domToMarkdown(d), 'hi **bold**', 'bold serialized');
  });

  test('domToMarkdown escapes literal asterisk', () => {
    const d = document.createElement('div');
    d.textContent = '2 * 3';
    assertEqual(domToMarkdown(d), '2 \\* 3', 'escaped asterisk');
  });

  test('round-trip md → fragment → markdown is stable', () => {
    const md = 'keep **b** and 2 \\* 3 and *i*';
    assertEqual(domToMarkdown(el(md)), md, 'stable round-trip');
  });

  test('domToMarkdown turns <br> into \\n', () => {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode('a'));
    d.appendChild(document.createElement('br'));
    d.appendChild(document.createTextNode('b'));
    assertEqual(domToMarkdown(d), 'a\nb', 'br to newline');
  });

  test('domToMarkdown inserts \\n before a DIV that follows leading text', () => {
    const ed = document.createElement('div');
    ed.append('line1');
    const inner = document.createElement('div');
    inner.textContent = 'line2';
    ed.append(inner);
    assertEqual(domToMarkdown(ed), 'line1\nline2', 'leading text + div');
  });

  test('domToMarkdown joins two sibling DIVs with \\n', () => {
    const ed = document.createElement('div');
    const a = document.createElement('div');
    a.textContent = 'a';
    const b = document.createElement('div');
    b.textContent = 'b';
    ed.append(a, b);
    assertEqual(domToMarkdown(ed), 'a\nb', 'two sibling divs');
  });
});
