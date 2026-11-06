/**
 * dmaic-calendar: das mitgelieferte Projektbeispiel lädt über
 * `beforeLoadExample` und das strenge Laden des Models (Migration 0 → aktuell).
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { loadModel } from '../../js/core/initial-model.js';
import { State } from '../../js/modules/dmaic-calendar/domain/model.js';
import calendar from '../../js/modules/dmaic-calendar/viewmodel/viewmodel.js';
import { getPhaseIds } from '../../js/core/cycles/cycles.js';

const FILE = '../../js/modules/dmaic-calendar/resources/examples/projects/dmaic-calendar-pizza-projekt.json';

suite('dmaic-calendar Beispiel: Pizza-Projekt', () => {
  test('lädt über loadExample und das strenge Model-Laden, alle 32 Termine bleiben', async () => {
    const res = await fetch(new URL(FILE, import.meta.url), { cache: 'no-cache' });
    assertTrue(res.ok, `HTTP ${res.status}`);
    const data = await res.json();
    let applied = null;
    const mod = Object.create(calendar);
    mod._context = {
      stateManager: { getProjectCycle: () => 'dmaic', setModuleState() {} },
      i18n: { getLanguage: () => 'de', t: (k) => k },
      instanceId: 'x',
    };
    mod.getState = () => null;
    mod.setState = (s) => { applied = s; };
    await mod.loadExample({ data, meta: { id: 'dmaic-calendar-pizza-projekt' } });
    assertTrue(applied !== null, 'setState wurde nicht aufgerufen');
    const model = loadModel(State, applied);
    assertEqual(model.events.length, data.events.length);
    assertEqual(model.events.length, 32);
    const phases = new Set(getPhaseIds('dmaic'));
    assertTrue(model.events.every((e) => phases.has(e.phase) && /^\d{4}-\d\d-\d\d$/.test(e.date)));
  });
});
