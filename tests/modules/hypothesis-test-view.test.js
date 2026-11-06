/**
 * Hypothesentest: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, einem Fake-stateManager mit Arbeitsblatt und einem
 * Fake-chartManager. Prüft die reaktive Ableitung, die vier Residuendiagramme,
 * die Lesefläche und den Fehlerpfad der Ableitung.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/hypothesis-test/viewmodel/viewmodel.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerChartDirective } from '../../js/core/chart-directive.js';

const ID = 'hypothesis-test';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;

const A = [10.1, 10.4, 9.8, 10.2, 10.0, 10.3];
const B = [12.9, 13.2, 12.7, 13.0, 12.8, 13.4];
const C = [11.0, 11.6, 10.7, 11.2, 11.1, 11.5];

const sheetWith = (...cols) => ({
  sheets: [{
    id: 's1',
    state: { columns: cols.map((values, i) => ({ id: `c${i}`, name: `Spalte ${i}`, shortName: `S${i}`, values })) },
  }],
});
const ref = (i, instanceId = 'ws1') => ({ instanceId, sheetId: 's1', columnId: `c${i}` });

const flush = () => new Promise((r) => setTimeout(r, 0));
const mounted = [];

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  registerChartDirective(Alpine);
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  // Schlankes Gerüst mit dem Namen und den x-chart-Bindungen der echten Vorlage
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="hypothesisTest">'
    + '<span class="ht-error" x-text="errorText"></span>'
    + '<div class="ht-fits" x-chart="residFitted"></div>'
    + '<div class="ht-normal" x-chart="residProb"></div>'
    + '<div class="ht-hist" x-chart="residHist"></div>'
    + '<div class="ht-order" x-chart="residOrder"></div>'
    + '</div>';
  document.body.append(tpl);
}

/**
 * Modul mit Fake-Diensten einhängen.
 * @param {object} model gespeicherter Zustand der Instanz
 * @param {Record<string, any>} [sheets] Modulzustände weiterer Instanzen
 */
async function mount(model, sheets = {}) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'ht-1': model, ...sheets };
  const handlers = [];
  const bus = {
    on: (name, fn) => handlers.push([name, fn]),
    off: (name, fn) => { const i = handlers.findIndex(([n, f]) => n === name && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (name, payload) => { for (const [n, f] of [...handlers]) if (n === name) f(payload); },
  };
  installWorksheetRevisions(bus);
  const chartCalls = [];
  const chartManager = {
    create: async (el, type, config) => { chartCalls.push(['create', type, config]); return { el, type }; },
    update: (chart, config) => { chartCalls.push(['update', chart.type, config]); },
    destroy: () => {},
  };
  const context = {
    instanceId: 'ht-1',
    stateManager: {
      getModuleState: (id) => {
        if (id === 'wsBad') throw new Error('Blatt kaputt');
        return states[id] ?? null;
      },
      setModuleState: () => {},
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
    },
    i18n: {
      t: (k) => k,
      tf: () => (k, p) => (p && p.message ? `${k}|${p.message}` : k),
      getLanguage: () => 'de',
    },
    eventBus: bus,
    chartManager,
    notify: () => {},
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await flush();
  return {
    states, bus, chartCalls, container,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
  };
}

const twoSamples = (a = ref(0), b = ref(1)) => ({
  category: 'mean', testType: 'two', direction: 'two-sided', alpha: 0.05, colRef1: a, colRef2: b,
});

suite('hypothesis-test: Viewmodel im Browser', () => {
  test('Wert im Arbeitsblatt ändern rechnet neu', async () => {
    const { vm, states, bus } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    assertEqual(vm().result.status, 'ok');
    const before = vm().result.main.p;
    assertTrue(typeof before === 'number');
    states.ws1 = sheetWith(A, [25, ...B.slice(1)]);
    bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await flush();
    assertEqual(vm().result.status, 'ok');
    assertTrue(vm().result.main.p !== before, 'p-Wert blieb stehen');
    assertEqual(vm().errorText, '');
  });

  test('noch keine Spalten gewählt: insufficient, kein Hinweis, display ist null', async () => {
    const { vm } = await mount({ category: 'mean', testType: 'two' }, { ws1: sheetWith(A, B) });
    assertEqual(vm().result.status, 'insufficient');
    assertEqual(vm().display, null);
    assertEqual(vm().errorText, '');
  });

  test('gepaart mit zu wenigen Paaren: errorText nennt den Grund', async () => {
    const short = [[1, 2, null, null], [2, 3, 4, null]];
    const { vm } = await mount({
      category: 'mean', testType: 'paired', colRef1: ref(0), colRef2: ref(1),
    }, { ws1: sheetWith(...short) });
    assertEqual(vm().result.status, 'insufficient');
    assertEqual(vm().errorText, 'pairedTooFew');
    assertEqual(vm().display, null);
  });

  test('vier Residuendiagramme bei k Stichproben über x-chart, editKey hyptest:*', async () => {
    const { chartCalls, vm } = await mount({
      category: 'mean', testType: 'k', direction: 'two-sided', alpha: 0.05, colRefsK: [ref(0), ref(1), ref(2)],
    }, { ws1: sheetWith(A, B, C) });
    await flush();
    assertEqual(vm().result.status, 'ok');
    const created = chartCalls.filter((c) => c[0] === 'create');
    assertDeepEqual(created.map((c) => c[2].editKey).sort(), [
      'hyptest:chart-resid-fits', 'hyptest:chart-resid-hist', 'hyptest:chart-resid-normal', 'hyptest:chart-resid-order',
    ]);
    assertDeepEqual(created.map((c) => c[1]).sort(), ['histogram', 'probability-plot', 'scatter', 'scatter']);
  });

  test('zwei Stichproben: keine Residuendiagramme', async () => {
    const { chartCalls, vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    await flush();
    assertEqual(vm().residFitted, null);
    assertEqual(chartCalls.filter((c) => c[0] === 'create').length, 0);
  });

  test('read() liefert result als JSON-Kopie mit Zahlen, ohne exampleWorksheetId', async () => {
    const { vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    const out = vm().read();
    assertEqual(typeof out.result.main.statistic, 'number');
    assertEqual(typeof out.result.main.p, 'number');
    assertTrue(!('exampleWorksheetId' in out));
    // Kopie: die Änderung am Lesewert berührt die Ableitung nicht
    out.result.main.p = -1;
    assertTrue(vm().result.main.p !== -1);
    assertDeepEqual(JSON.parse(JSON.stringify(out.result)), out.result);
  });

  test('describe: result ist ein abgeleitetes Feld vom Typ object|null', () => {
    const f = mod.agentEntry.fields.result;
    assertTrue(f !== undefined, 'kein Feld result');
    assertEqual(f.derived, true);
    assertEqual(f.type, 'object|null');
    // die Felder des Models sind nicht abgeleitet
    assertTrue(mod.agentEntry.fields.alpha.derived !== true);
  });

  test('wirft die Ableitung, ist result { error } und errorText zeigt analysisFailed', async () => {
    const { vm } = await mount(twoSamples(ref(0, 'wsBad'), ref(1, 'wsBad')));
    assertDeepEqual(vm().result, { error: 'Blatt kaputt' });
    assertEqual(vm().display, null);
    assertEqual(vm().errorText, 'analysisFailed|Blatt kaputt');
  });
});
