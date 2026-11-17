/**
 * Tests for table() unter Alpine: TableData bleibt unproxied, $tableRev ist reaktiv.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, table, markTableChanged } from '../../js/core/model.js';
import { TableData } from '../../js/core/table-data.js';

const Doc = defineModel({ fields: { data: table() } });
const ID = 'table-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="tableTest"><span></span></div>';
  document.body.append(tpl);
}

const flush = () => new Promise(r => setTimeout(r, 0));
const mounted = [];

async function mount() {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const context = {
    instanceId: 'tt-1',
    instances: Object.freeze({ list: () => [], read: async () => ({}), interact: async () => ({ ok: true }) }),
    stateManager: { getModuleState: () => ({ data: { rowCount: 2, columns: [[1, 2]] } }), setModuleState: () => {}, getProjectCycle: () => 'dmaic', get: () => undefined },
    i18n: { t: k => k, tf: () => k => k, getLanguage: () => 'de' },
    eventBus: { on: () => {}, off: () => {}, emit: () => {} },
    notify: () => {},
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
  const mod = createModule({
    config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
    Model: Doc,
    view: () => ({}),
  });
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await flush();
  return Alpine.$data(container.querySelector('[x-data]'));
}

suite('table() unter Alpine', () => {
  test('TableData im Model ist kein Proxy', async () => {
    const d = await mount();
    const t = d.model.data;
    assertTrue(t instanceof TableData);
    assertTrue(Alpine.raw(t) === t, 'Alpine.raw(t) === t');
    assertEqual(Alpine.raw(t.columns), t.columns);
  });

  test('effect auf model.$tableRev läuft nach markTableChanged erneut', async () => {
    const d = await mount();
    let runs = 0;
    const stop = Alpine.effect(() => { void d.model.$tableRev; runs += 1; });
    assertEqual(runs, 1);
    markTableChanged(d.model, d.model.data);
    await flush();
    assertEqual(runs, 2);
    stop?.();
  });
});
