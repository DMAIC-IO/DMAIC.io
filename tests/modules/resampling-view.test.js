/**
 * Resampling: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, einem Fake-stateManager mit Arbeitsblatt und einem
 * steuerbaren Runner (`mod.runnerFactory`). Prüft Sperre, Fortschritt über
 * zwei Teil-Läufe, Veraltet-Anzeige, Abbruch, Fehlertext und die Lesefläche.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/resampling/viewmodel/viewmodel.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerAsyncTaskDirectives } from '../../js/core/async-task-directives.js';

const ID = 'resampling';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const I18N = { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' };

const A = [10.1, 10.4, 9.8, 10.2, 10.0, 10.3];
const B = [12.9, 13.2, 12.7, 13.0, 12.8, 13.4];

const sheetWith = (...cols) => ({
  sheets: [{
    id: 's1',
    state: { columns: cols.map((values, i) => ({ id: `c${i}`, name: `Spalte ${i}`, shortName: `S${i}`, values })) },
  }],
});
const ref = (i) => ({ instanceId: 'ws1', sheetId: 's1', columnId: `c${i}` });

const flush = () => new Promise((r) => setTimeout(r, 0));
const mounted = [];

/** Offene Teil-Läufe des Fake-Runners: Job, Fortschritt, Auflösen, Abweisen. */
const calls = [];

/** Ergebnis der Engine je Job-Art, so knapp wie `summarize` es braucht. */
function engineResult(kind) {
  if (kind.startsWith('bootstrap')) {
    return {
      estimate: 1.5, se: 0.2, bias: 0.01,
      ci: { percentile: [1.1, 1.9], bca: [1.1, 1.9], bcaFallback: false },
      replicates: [1.2, 1.4, 1.5, 1.6, 1.8],
    };
  }
  return { test: { observed: 2.8, pValue: 0.002, exact: false, permutations: 10000, distribution: [-1, -0.5, 0, 0.5, 1] } };
}

mod.runnerFactory = () => ({
  run: (job, { signal, onProgress }) => new Promise((resolve, reject) => {
    const call = { job, onProgress, resolve: () => resolve(engineResult(job.kind)), reject };
    calls.push(call);
    signal.addEventListener('abort', () => reject(new DOMException('Resampling aborted', 'AbortError')));
  }),
});

function ensureTemplate() {
  if (!Alpine.version) { registerAsyncTaskDirectives(Alpine, { i18n: I18N }); Alpine.start(); }
  else registerAsyncTaskDirectives(Alpine, { i18n: I18N });
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  // Schlankes Gerüst mit dem Namen und den Task-Bindungen der echten Vorlage
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="resampling">'
    + '<div x-async-task="compute">'
    + '<button type="button" class="rs-start" x-async-task-start></button>'
    + '<progress class="rs-progress" x-async-task-progress></progress>'
    + '<p class="rs-error" x-async-task-error></p>'
    + '</div></div>';
  document.body.append(tpl);
}

/**
 * Modul mit Fake-Diensten einhängen.
 * @param {object|null} model gespeicherter Zustand der Instanz
 * @param {Record<string, any>} [sheets] Modulzustände weiterer Instanzen
 */
async function mount(model, sheets = {}) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  calls.length = 0;
  const states = { 'rs-1': model, ...sheets };
  const handlers = [];
  const bus = {
    on: (name, fn) => handlers.push([name, fn]),
    off: (name, fn) => { const i = handlers.findIndex(([n, f]) => n === name && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (name, payload) => { for (const [n, f] of [...handlers]) if (n === name) f(payload); },
  };
  installWorksheetRevisions(bus);
  const context = {
    instanceId: 'rs-1',
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: () => {},
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
    },
    i18n: I18N,
    eventBus: bus,
    chartManager: { create: async (el, type, config) => ({ el, type, config: { ...config } }), update: () => {}, destroy: () => {} },
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
  return { container, vm: () => Alpine.$data(container.querySelector('[x-data]')) };
}

const twoSamples = () => ({ mode: 'two', statisticId: 'mean', colRef1: ref(0), colRef2: ref(1) });

/** Lauf starten und beide Teil-Läufe zu Ende bringen. */
async function runToEnd(vm) {
  const done = vm()._asyncTaskHost.start('compute');
  await flush();
  calls.shift().resolve(); await flush();
  calls.shift().resolve(); await flush();
  return done;
}

suite('resampling: Viewmodel im Browser', () => {
  test('ohne Spalten: Start gesperrt, Grund im Titel, kein Hinweis', async () => {
    const { container, vm } = await mount(null);
    const start = /** @type {HTMLButtonElement} */ (container.querySelector('.rs-start'));
    assertTrue(start.disabled, 'Start gesperrt');
    assertEqual(start.title, 'errMinValues');
    assertEqual(vm().validationText, 'errMinValues');
    assertEqual(vm().showValidation, false);
    assertEqual(vm().hasResult, false);
    assertEqual(vm().resultView, null);
  });

  test('Lauf über zwei Teil-Läufe: Fortschritt, Ergebnis im Model, nicht veraltet', async () => {
    const { container, vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    assertEqual(vm().validation, null);
    assertEqual(/** @type {HTMLButtonElement} */ (container.querySelector('.rs-start')).disabled, false);
    const done = vm()._asyncTaskHost.start('compute');
    await flush();
    assertEqual(calls.length, 1);
    assertEqual(calls[0].job.kind, 'bootstrapTwo');
    calls[0].onProgress(5, 10);
    assertEqual(vm()._asyncTasks.compute.progress, 0.25);
    calls.shift().resolve(); await flush();
    assertEqual(calls[0].job.kind, 'permutationTwo');
    calls.shift().resolve(); await flush();
    assertEqual((await done).status, 'done');
    assertTrue(vm().model.result !== null, 'Ergebnis gespeichert');
    assertEqual(vm().model.result.labels.join(','), 'Spalte 0,Spalte 1');
    assertEqual(vm().model.result.inputsHash, vm().inputsHash);
    assertEqual(vm().stale, false);
    assertEqual(vm().hasResult, true);
    assertTrue(vm().resultView !== null, 'Ergebnisansicht');
    assertTrue(vm().bootChart !== null && vm().permChart !== null, 'beide Diagramme');
  });

  test('Eingabe ändern: veraltet, Ergebnis bleibt', async () => {
    const { vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    await runToEnd(vm);
    const before = vm().model.result;
    vm().model.B = 2000;
    await flush();
    assertEqual(vm().stale, true);
    assertEqual(vm().showStale, true);
    assertEqual(vm().model.result.inputsHash, before.inputsHash);
  });

  test('Abbruch mitten im Lauf: altes Ergebnis bleibt, keine Fehleranzeige', async () => {
    const { container, vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    await runToEnd(vm);
    const hash = vm().model.result.inputsHash;
    vm().model.seed = 7;
    await flush();
    const done = vm()._asyncTaskHost.start('compute');
    await flush();
    vm()._asyncTaskHost.cancel('compute');
    assertEqual((await done).status, 'cancelled');
    await flush();
    assertEqual(vm().model.result.inputsHash, hash);
    assertEqual(vm()._asyncTasks.compute.error, null);
    assertTrue(/** @type {HTMLElement} */ (container.querySelector('.rs-error')).hidden, 'Fehlerzeile verborgen');
  });

  test('Fehlercode der Engine: Fehlerzeile nennt den Text', async () => {
    const { container, vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    const done = vm()._asyncTaskHost.start('compute');
    await flush();
    calls.shift().reject(Object.assign(new Error('zu wenig'), { code: 'insufficient-data' }));
    assertEqual((await done).status, 'failed');
    await flush();
    assertEqual(container.querySelector('.rs-error').textContent, 'errMinValues');
    assertEqual(vm().model.result, null);
  });

  test('read() enthält decision und asyncTasks.compute', async () => {
    const { vm } = await mount({ mode: 'one', statisticId: 'mean', colRef1: ref(0), target: '1' }, { ws1: sheetWith(A) });
    const done = vm()._asyncTaskHost.start('compute');
    await flush();
    calls.shift().resolve(); await flush();
    await done;
    const r = vm().read();
    assertEqual(r.decision, 'reject');
    assertEqual(vm().decisionText, 'decisionReject');
    assertEqual(vm().showDecision, true);
    assertTrue(r.result !== null, 'result in read()');
    assertEqual(r.asyncTasks.compute.running, false);
    assertEqual(r.asyncTasks.compute.error, null);
  });
  test('view: nie null, trägt jeden Schlüssel, den die Vorlage liest', async () => {
    const { vm } = await mount(null);
    assertEqual(vm().resultView, null);
    const html = await (await fetch(new URL('../../js/modules/resampling/resources/view.html', import.meta.url))).text();
    const keys = [...new Set([...html.matchAll(/\bview\.(\w+)/g)].map((m) => m[1]))];
    assertTrue(keys.length >= 8, 'Vorlage liest Schlüssel von view');
    assertTrue(vm().view !== null && vm().view !== undefined, 'view vorhanden');
    for (const k of keys) assertTrue(k in vm().view, `view.${k} vorhanden`);
    assertEqual(vm().view.hasBoot, false);
    assertEqual(vm().view.groups.length, 0);
  });

  test('view: nach geleertem Ergebnis bleibt die Ansicht lesbar, Ergebnisblock weg', async () => {
    const { vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    await runToEnd(vm);
    assertEqual(vm().hasResult, true);
    assertEqual(vm().view.hasBoot, true);
    vm().model.result = null;
    await flush();
    assertEqual(vm().hasResult, false);
    assertEqual(vm().view.hasBoot, false);
    assertEqual(vm().view.test, null);
  });
});
