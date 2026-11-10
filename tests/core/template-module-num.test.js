/**
 * Tests for the `num(value, decimals)` template helper on module components:
 * output format follows the app language, also after a language switch
 * rebuilds the tree.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, number } from '../../js/core/model.js';

const Doc = defineModel({ fields: { v: number() } });

const ID = 'num-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;
const flush = () => new Promise(r => setTimeout(r, 0));

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="numTest"><span class="nt-out" x-text="num(model.v, 2)"></span>'
    + '<span class="nt-raw" x-text="num(model.v)"></span>'
    + '<span class="nt-nul" x-text="num(null, 2)"></span></div>';
  document.body.append(tpl);
}

suite('template-module: num()', () => {
  test('formats per app language and follows a language switch rebuild', async () => {
    ensureTemplate();
    let lang = 'de';
    const context = {
      instanceId: 'nt-1',
      stateManager: { getModuleState: () => ({ v: 1234.5 }), setModuleState: () => {}, getProjectCycle: () => 'dmaic', get: () => undefined },
      i18n: { t: k => k, tf: () => k => k, getLanguage: () => lang },
      eventBus: { on: () => {}, off: () => {}, emit: () => {} },
      notify: () => {},
      dialog: { confirm: async () => true },
      theme: 'light',
      get language() { return lang; },
    };
    const mod = createModule({
      config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
      Model: Doc,
      view: () => ({}),
    });
    const container = document.createElement('div');
    document.body.append(container);
    try {
      await mod.init(container, context);
      await flush();
      assertEqual(container.querySelector('.nt-out').textContent, '1.234,50');
      assertEqual(container.querySelector('.nt-nul').textContent, '');
      assertEqual(container.querySelector('.nt-raw').textContent, '1.234,5');
      lang = 'en';
      mod.onLanguageChange('en');
      await flush();
      assertEqual(container.querySelector('.nt-out').textContent, '1,234.50');
      assertEqual(container.querySelector('.nt-raw').textContent, '1,234.5');
    } finally {
      mod.destroy?.();
      container.remove();
    }
  });
});
