/**
 * MSA Typ 5: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul und einem Fake-stateManager mit dem Arbeitsblatt eines Beispiels.
 * Prüft die Verdrahtung des view-Blocks: computed levels/analysis, Getter der
 * Diagramme und das Viewmodel-Kommando swapPositive.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/msa-typ5/viewmodel/viewmodel.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { fromExample } from '../../js/modules/msa-typ5/io/example.js';

const ID = 'msa-typ5';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const mounted = [];

/** @param {string} path relativ zu resources/examples des Moduls */
async function json(path) {
  return (await fetch(new URL(`../../js/modules/msa-typ5/resources/examples/${path}`, import.meta.url))).json();
}

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="msaTyp5"><span class="msa5-msg" x-text="analysisMessage"></span></div>';
  document.body.append(tpl);
}

/**
 * Beispiel einhängen; das Arbeitsblatt liegt unter der Instanz `ws1`.
 * @param {string} name Beispiel-Id
 * @param {(sheet: any) => void} [editSheet] Blatt vor dem Einhängen ändern
 */
async function mount(name, editSheet) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const sheet = await json(`worksheets/${name}.json`);
  if (editSheet) editSheet(sheet);
  const model = JSON.parse(JSON.stringify(fromExample(await json(`projects/${name}.json`))).replaceAll('__source__', 'ws1'));
  const states = { 'msa5-1': model, ws1: sheet };
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  installWorksheetRevisions(bus);
  const context = {
    instanceId: 'msa5-1',
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: () => {},
      getProjectCycle: () => 'dmaic',
      get: (k) => ({ phases: { measure: [] }, 'phases.measure': [{ instanceId: 'ws1', moduleId: 'worksheet' }] })[k],
    },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
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
  return { vm: () => Alpine.$data(container.querySelector('[x-data]')) };
}

suite('msa-typ5: Viewmodel im Browser', () => {
  test('binär gut: Getter liefern Urteil, Fehlerbalken, Heatmaps und Streifen', async () => {
    const { vm } = await mount('msa-typ5-binary-good');
    assertTrue(vm().hasVerdict);
    assertEqual(vm().analysisMessage, '');
    assertEqual(vm().kappaChart.series[0].errorBars.yMode, 'relative');
    assertEqual(vm().heatmaps[1].legacyEditKey, 'heatmap#2');
    assertEqual(vm().runStrips.length, 3);
    assertEqual(vm().levels.positive, 'ok');
    assertTrue(vm().canSwap, 'Tauschknopf bei zwei Stufen');
  });

  test('swapPositive über das Viewmodel-Kommando: positive = vorherige negative', async () => {
    const { vm } = await mount('msa-typ5-binary-good');
    const before = vm().levels.negative;
    assertEqual(before, 'nok');
    vm().swapPositive({});
    assertEqual(vm().model.positiveLevel, before);
    assertEqual(vm().levels.positive, 'nok');
  });

  test('nur eine Stufe: swapPositive wirft mit param positiveLevel, kein Messverlauf', async () => {
    const { vm } = await mount('msa-typ5-binary-good', (sheet) => {
      const col = sheet.sheets[0].state.columns.find((c) => c.id === 'c-rating');
      col.values = col.values.map(() => 'ok');
    });
    assertEqual(vm().levels.negative, null);
    assertEqual(vm().canSwap, false);
    assertEqual(vm().runStrips.length, 0);
    let err = null;
    try { vm().swapPositive({}); } catch (e) { err = e; }
    assertTrue(err !== null, 'kein Fehler');
    assertEqual(err.param, 'positiveLevel');
    assertEqual(vm().model.positiveLevel, 'ok');
  });
});
