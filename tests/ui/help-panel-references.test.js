import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { HelpPanel } from '../../js/ui/help-panel.js';

/** Minimal i18n stub: returns the key. */
const i18n = { t: (k) => k, getLanguage: () => 'de' };

const REFS = [{
  id: 'aiag-msa-4',
  author: [{ family: 'AIAG' }],
  title: 'Measurement Systems Analysis (MSA)',
  issued: { 'date-parts': [[2010]] },
}];

/** Build a rendered panel on a detached container. */
function panel() {
  const el = document.createElement('div');
  document.body.append(el);
  const p = new HelpPanel(el, i18n);
  p.render();
  return { p, el };
}

suite('help-panel: references tab', () => {
  test('tab button is hidden when the module has no references', () => {
    const { p, el } = panel();
    p.showWithTabs('Modul', { helpNode: document.createTextNode('x'), glossaryGet: () => Promise.resolve(null) });
    const btn = el.querySelector('.help-panel__tab[data-tab="references"]');
    assertTrue(btn != null, 'button exists in the DOM');
    assertEqual(btn.style.display, 'none', 'hidden');
    el.remove();
  });

  test('tab button is shown and the pane filled when references exist', () => {
    const { p, el } = panel();
    p.showWithTabs('Modul', { helpNode: document.createTextNode('x'), references: REFS });
    const btn = el.querySelector('.help-panel__tab[data-tab="references"]');
    assertEqual(btn.style.display, '', 'visible');
    const pane = el.querySelector('[data-pane="references"]');
    assertTrue(pane.textContent.includes('Measurement Systems Analysis (MSA)'), 'entry rendered');
    el.remove();
  });

  test('openReference switches to the tab and highlights the entry', () => {
    const { p, el } = panel();
    p.showWithTabs('Modul', { helpNode: document.createTextNode('x'), references: REFS });
    p.openReference('aiag-msa-4');
    assertEqual(p.getActiveTab(), 'references', 'active tab');
    const entry = el.querySelector('[data-reference-id="aiag-msa-4"]');
    assertTrue(entry.classList.contains('is-highlighted'), 'highlighted');
    el.remove();
  });

  test('openReference with an unknown id still switches the tab', () => {
    const { p, el } = panel();
    p.showWithTabs('Modul', { helpNode: document.createTextNode('x'), references: REFS });
    p.openReference('gibt-es-nicht');
    assertEqual(p.getActiveTab(), 'references', 'active tab');
    el.remove();
  });
});
