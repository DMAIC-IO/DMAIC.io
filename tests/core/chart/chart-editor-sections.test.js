/**
 * D.Mike — chart editor: sections collapse, start closed, keep their state.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { edSection } from '../../../js/core/chart/chart-editor.js';

const title = (sec) => sec.querySelector('.dmike-chart-ed-section-title');

suite('chart editor — collapsible sections', () => {
  test('a section starts collapsed', () => {
    const sec = edSection('Collapsed at start');
    assertEqual(sec.classList.contains('open'), false);
    assertEqual(title(sec).getAttribute('aria-expanded'), 'false');
  });

  test('a click on the title opens and closes the section', () => {
    const sec = edSection('Toggle me');
    title(sec).click();
    assertTrue(sec.classList.contains('open'), 'open after first click');
    assertEqual(title(sec).getAttribute('aria-expanded'), 'true');
    title(sec).click();
    assertEqual(sec.classList.contains('open'), false);
  });

  test('a rebuilt section with the same title keeps its open state', () => {
    title(edSection('Survives rebuild')).click();
    assertTrue(edSection('Survives rebuild').classList.contains('open'));
  });

  test('the title text is just the title', () => {
    assertEqual(title(edSection('Plain text')).textContent, 'Plain text');
  });

  test('collapsible: false keeps a static, always visible section', () => {
    const sec = edSection('Static', { collapsible: false });
    assertEqual(title(sec).tagName, 'DIV');
    assertEqual(sec.classList.contains('dmike-chart-ed-section--collapsible'), false);
  });
});
