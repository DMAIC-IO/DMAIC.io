/**
 * xy-plot und individual-value-plot: Beispiele mit eigenem Arbeitsblatt
 * (`sourceWorksheetData`) setzen den Stand erst, wenn das angelegte
 * Arbeitsblatt lesbar ist (`instances.read`). Sonst rechnet das Modul in
 * `setState` gegen `not_loaded`, liest leere Spalten und zeigt bis zur
 * nächsten Eingabe kein Diagramm (Hubschrauber-Beispiele, E2E).
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import xyPlot from '../../js/modules/xy-plot/viewmodel/viewmodel.js';
import ivPlot from '../../js/modules/individual-value-plot/viewmodel/viewmodel.js';

/** Wartet (höchstens 2 s), bis `cond` gilt. */
async function until(cond) {
  const end = Date.now() + 2000;
  while (!cond()) {
    if (Date.now() > end) throw new Error('Bedingung nicht erreicht');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Modul-Kopie mit Stub-Kontext; `instances.read` hängt, bis `release()`. */
function stubbed(base) {
  const store = { phases: { data: [] } };
  const states = {};
  const log = { applied: null, release: undefined };
  const mod = Object.create(base);
  mod._context = {
    instanceId: 'me',
    i18n: { t: (k) => k, getLanguage: () => 'de' },
    notify() {},
    eventBus: { emit() {}, on() {}, off() {} },
    instances: { read: () => new Promise((r) => { log.release = r; }) },
    stateManager: {
      get: (path) => path.split('.').reduce((o, k) => o?.[k], store),
      set(path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), store)[last] = v; },
      setModuleState(id, st) { states[id] = st; },
      getModuleState: (id) => states[id] ?? null,
      removeModuleState(id) { delete states[id]; },
    },
  };
  mod.getState = () => null;
  mod.setState = (s) => { log.applied = s; };
  return { mod, log, store };
}

const WS = { sheets: [{ id: 's1', name: 'S', state: { columns: [], rowCount: 0 } }] };
const SRC = (c) => ({ instanceId: '__source__', sheetId: 's1', columnId: c });

suite('Diagramm-Beispiele warten auf das lesbare Arbeitsblatt', () => {
  test('xy-plot: setState erst nach instances.read, Bezüge umgehängt', async () => {
    const { mod, log, store } = stubbed(xyPlot);
    const done = mod.loadExample({ meta: { id: 'ex' }, data: {
      _schema: { version: '1.0' },
      datasets: [{ x: SRC('x'), y: SRC('y'), group: null, size: null }],
      sourceWorksheetData: WS,
    } });
    await until(() => log.release !== undefined);
    assertEqual(log.applied, null, 'setState vor dem lesbaren Arbeitsblatt');
    log.release({});
    await done;
    assertTrue(log.applied !== null, 'setState wurde nicht aufgerufen');
    const wsId = store.phases.data[0].instanceId;
    assertEqual(log.applied.exampleWorksheetId, wsId);
    assertEqual(log.applied.datasets[0].x.instanceId, wsId);
    assertEqual(log.applied.datasets[0].y.instanceId, wsId);
    assertEqual(log.applied.datasets[0].group, null);
  });

  test('individual-value-plot: setState erst nach instances.read, Bezüge umgehängt', async () => {
    const { mod, log, store } = stubbed(ivPlot);
    const done = mod.loadExample({ meta: { id: 'ex' }, data: {
      _schema: { version: '1.0' },
      datasets: [{ value: SRC('v'), group: SRC('g'), group2: null, group3: null }],
      sourceWorksheetData: WS,
    } });
    await until(() => log.release !== undefined);
    assertEqual(log.applied, null, 'setState vor dem lesbaren Arbeitsblatt');
    log.release({});
    await done;
    assertTrue(log.applied !== null, 'setState wurde nicht aufgerufen');
    const wsId = store.phases.data[0].instanceId;
    assertEqual(log.applied.exampleWorksheetId, wsId);
    assertEqual(log.applied.datasets[0].value.instanceId, wsId);
    assertEqual(log.applied.datasets[0].group.instanceId, wsId);
    assertEqual(log.applied.datasets[0].group2, null);
  });
});
