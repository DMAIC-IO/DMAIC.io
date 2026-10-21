import { suite, test, assertEqual } from '../test-utils.js';
import { labInlineNodes } from '../../js/algorithm-lab/lab-inline.js';

// Bug 027: Lab doc texts carry {{term:id|label}} tokens that used to reach the
// DOM verbatim. labInlineNodes() turns them into the app-wide glossary marker.
function host(text) {
  const el = document.createElement('div');
  el.append(...labInlineNodes(text));
  return el;
}

suite('lab-inline: labInlineNodes()', () => {
  test('term token with label becomes a glossary marker span', () => {
    const el = host('Uses {{term:cg|Cg}} here');
    const span = el.querySelector('.glossary-term');
    assertEqual(span?.tagName, 'SPAN', 'marker span');
    assertEqual(span.dataset.glossaryTerm, 'cg', 'term id');
    assertEqual(span.textContent, 'Cg', 'label shown');
    assertEqual(el.textContent, 'Uses Cg here', 'no raw token left');
  });

  test('term token without label shows the id', () => {
    const el = host('{{term:kappa}}');
    assertEqual(el.querySelector('.glossary-term')?.textContent, 'kappa', 'id as label');
  });

  test('bold renders as strong, lone asterisk stays text', () => {
    const el = host('**D-efficiency** and A²* stay');
    assertEqual(el.querySelector('strong')?.textContent, 'D-efficiency', 'bold');
    assertEqual(el.textContent, 'D-efficiency and A²* stay', 'text intact');
  });

  test('empty input yields no nodes', () => {
    assertEqual(labInlineNodes('').length, 0, 'empty string');
    assertEqual(labInlineNodes(null).length, 0, 'null');
  });
});
