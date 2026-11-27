/**
 * REST API: Migration '0→1.0' (domain/migrations.js) — jeder Fall des alten
 * `State.fromJSON`/`sanitizeSchedule`, die Klemmregeln, die Golden-Fixture
 * v0.3.0 und das Altprojekt aus Task 0 (Vergleich mit dem `read()` der Altform).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/rest-api/domain/migrations.js';
import { State } from '../../../js/modules/rest-api/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'rest-api');

const plain = (v) => JSON.parse(JSON.stringify(v));
const IDS = { a: '3f9b2c10-4d5e-4a61-8b72-9c0d1e2f3a01', b: '3f9b2c10-4d5e-4a61-8b72-9c0d1e2f3a02' };
const SCHED = { enabled: false, intervalValue: 5, intervalUnit: 'minutes' };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);

/** @param {string|URL} url */
async function fetchJSON(url) {
  const res = await fetch(new URL(url, import.meta.url), { cache: 'no-cache' });
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function load(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Ein Endpunkt der Migration aus einem Altendpunkt. @param {object} e */
const one = (e) => from0({ endpoints: [e] }).endpoints[0];

suite('rest-api Migration 0→1.0', () => {
  test('leerer, fehlender und kaputter Altstand: keine Endpunkte, nichts aktiv', () => {
    for (const old of [{}, null, undefined, 42, 'x', [], { endpoints: 'nope', activeId: 5 }]) {
      assertDeepEqual(from0(old), { endpoints: [], activeId: null }, JSON.stringify(old));
    }
  });
  test('Endpunkt ohne Angaben: Vorgaben wie das alte Endpoint', () => {
    assertDeepEqual(one({ id: 'e' }), {
      id: 'e', name: '', url: '', headers: [], mappings: [], writeMode: 'replace', schedule: SCHED,
    });
  });
  test('Nicht-Text wird leerer Text; ids bleiben, fehlende werden ep-<position>', () => {
    const out = from0({ endpoints: [{ id: 'x', name: 42, url: null }, { name: 'ohne' }, { id: '' }, { id: 7 }, { id: 'ep-2' }] });
    assertDeepEqual(out.endpoints.map((e) => e.id), ['x', 'ep-2_', 'ep-3', 'ep-4', 'ep-2']);
    assertDeepEqual([out.endpoints[0].name, out.endpoints[0].url], ['', '']);
  });
  test('Nicht-Objekte in Endpunkten, Kopfzeilen und Zuordnungen entfallen', () => {
    const out = from0({ endpoints: [null, 'x', { id: 'e', headers: [null, 5, { key: 'K', value: 3 }], mappings: ['m', { jsonPath: 7 }] }] });
    assertEqual(out.endpoints.length, 1);
    assertDeepEqual(out.endpoints[0].headers, [{ key: 'K', value: '' }]);
    assertDeepEqual(out.endpoints[0].mappings, [{ jsonPath: '', columnRef: null }]);
  });
  test('Kopfzeilen oder Zuordnungen, die keine Liste sind, werden leer', () => {
    const e = one({ id: 'e', headers: { Accept: 'x' }, mappings: { a: 1 } });
    assertDeepEqual([e.headers, e.mappings], [[], []]);
  });
  test('Spaltenbezug: gültige Form bleibt (auch ohne Blatt), sonst null', () => {
    const ok = { instanceId: 'w', sheetId: 's', columnId: 'c' };
    const e = one({ id: 'e', mappings: [
      { jsonPath: 'a', columnRef: ok },
      { jsonPath: 'b', columnRef: { instanceId: 'w', columnId: 'c' } },
      { jsonPath: 'c', columnRef: { instanceId: 'w', sheetId: 3, columnId: 'c' } },
      { jsonPath: 'd', columnRef: { instanceId: '', columnId: 'c' } },
      { jsonPath: 'e', columnRef: 'w|s|c' },
      { jsonPath: 'f', columnRef: { ...ok, fremd: 1 } },
    ] });
    assertDeepEqual(e.mappings.map((m) => m.columnRef), [ok, { instanceId: 'w', columnId: 'c' }, null, null, null, ok]);
  });
  test('Schreibmodus: bekannte bleiben, sonst replace', () => {
    for (const w of ['replace', 'append', 'prepend']) assertEqual(one({ id: 'e', writeMode: w }).writeMode, w);
    for (const w of ['x', undefined, 3]) assertEqual(one({ id: 'e', writeMode: w }).writeMode, 'replace');
  });
  test('Zeitplan: intervalMinutes ohne intervalValue wird Minuten', () => {
    assertDeepEqual(one({ id: 'e', schedule: { enabled: 1, intervalMinutes: 10, intervalUnit: 'hours' } }).schedule,
      { enabled: true, intervalValue: 10, intervalUnit: 'minutes' });
    assertDeepEqual(one({ id: 'e', schedule: { intervalMinutes: 'x' } }).schedule, SCHED);
    // mit intervalValue gilt der Wert, intervalMinutes wird ignoriert
    assertEqual(one({ id: 'e', schedule: { intervalMinutes: 10, intervalValue: 3 } }).schedule.intervalValue, 3);
  });
  test('Zeitplan: unlesbar oder unter 1 → 5, gerundet, über 999 → 999; unbekannte Einheit → Minuten', () => {
    const iv = (v) => one({ id: 'e', schedule: { intervalValue: v, intervalUnit: 'hours' } }).schedule.intervalValue;
    assertDeepEqual([0, -3, 'x', null, Infinity, 0.4, 1.4, 2.6, '7', 999, 1000, 1500].map(iv),
      [5, 5, 5, 5, 5, 5, 1, 3, 7, 999, 999, 999]);
    assertEqual(one({ id: 'e', schedule: { intervalUnit: 'min' } }).schedule.intervalUnit, 'minutes');
    assertEqual(one({ id: 'e', schedule: 'kaputt' }).schedule.intervalUnit, 'minutes');
  });
  test('activeId: Text bleibt (auch unbekannt), sonst null', () => {
    assertEqual(from0({ activeId: 'weg' }).activeId, 'weg');
    assertEqual(from0({ activeId: 3 }).activeId, null);
  });
  test('ohne _schema über fromJSON: unbekanntes activeId heilt still', () => {
    const { m, fields } = load({ endpoints: [{ id: 'e1' }, { id: 'e2' }], activeId: 'weg' });
    assertEqual(m.activeId, 'e1');
    assertDeepEqual(fields, []);
  });
});

suite('rest-api Migration — Golden und Altprojekt', () => {
  test('v0.3.0_all_projects.json: fremde Form (Header als Objekt, path/colId) geht wie in der Altform verloren', async () => {
    const file = await fetchJSON(new URL('v0.3.0_all_projects.json', FIXTURES));
    const states = [];
    for (const p of file.projects) {
      for (const list of Object.values(p.phases ?? {})) {
        for (const e of list) if (e.moduleId === 'rest-api') states.push(p.moduleStates[e.instanceId]);
      }
    }
    assertEqual(states.length, 1);
    const { m, fields } = load(states[0]);
    assertDeepEqual(fields, []);
    assertEqual(m.activeId, 'ep1');
    assertDeepEqual(plain(m.endpoints), [{
      id: 'ep1', name: '', url: 'https://api.example.com/v1/transactions?limit=100', headers: [],
      mappings: [{ jsonPath: '', columnRef: null }, { jsonPath: '', columnRef: null }, { jsonPath: '', columnRef: null }],
      writeMode: 'replace', schedule: { enabled: false, intervalValue: 15, intervalUnit: 'minutes' },
    }]);
  });
  test('Altprojekt A lädt ohne Reparatur, Endpunkte gleich dem read() der Altform', async () => {
    const states = (await fetchJSON('./legacy-project.json')).moduleStates;
    const old = await fetchJSON('./legacy-read.json');
    const { m, fields } = load(states[IDS.a]);
    assertDeepEqual(fields, []);
    assertEqual(m.activeId, 'ep-a2');
    const strip = ({ lastResponse: _l, scheduleRunning: _s, ...rest }) => rest;
    assertDeepEqual(plain(m.endpoints), old.a.endpoints.map(strip));
  });
  test('Altprojekt B: Abstand 1500 → 999, spätere Doppelspalte leer, activeId der erste; sonst gleich der Altform', async () => {
    const states = (await fetchJSON('./legacy-project.json')).moduleStates;
    const old = await fetchJSON('./legacy-read.json');
    const { m, fields } = load(states[IDS.b]);
    assertDeepEqual(fields, ['endpoints']);
    assertEqual(m.activeId, 'ep-b1');
    const want = old.b.endpoints.map(({ lastResponse: _l, scheduleRunning: _s, ...rest }) => rest);
    want[0].schedule.intervalValue = 999;              // Feldgrenze
    want[0].mappings[1].columnRef = null;              // mappingColumnFree
    assertDeepEqual(plain(m.endpoints), want);
  });
});
