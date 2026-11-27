/**
 * REST API: Model (domain/model.js) — Schema und Vorgaben, Invarianten
 * (streng, mit Reparatur, beim Schreiben), jedes Kommando samt Ablehnung,
 * Rückfrage, Ableitung, Lesefläche und Agentenkatalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, columnKey, INTERVAL_MIN, INTERVAL_MAX } from '../../../js/modules/rest-api/domain/model.js';
import { setModelName, confirmOf } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'rest-api');

const SCHEMA = { _schema: { name: 'rest-api', version: '1.0' } };
const plain = (v) => JSON.parse(JSON.stringify(v));
/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

const COL_A = { instanceId: 'ws', sheetId: 's1', columnId: 'a' };
const COL_B = { instanceId: 'ws', sheetId: 's1', columnId: 'b' };
const SCHED = { enabled: false, intervalValue: 5, intervalUnit: 'minutes' };
/** Ein Endpunkt im gespeicherten Format. */
const ep = (id, over = {}) => ({
  id, name: '', url: '', headers: [], mappings: [], writeMode: 'replace', schedule: { ...SCHED }, ...over,
});
const BASE = {
  endpoints: [
    ep('e1', { name: 'Messwerte', url: 'rest/a', headers: [{ key: 'Accept', value: 'application/json' }],
      mappings: [{ jsonPath: 'a', columnRef: COL_A }, { jsonPath: 'b', columnRef: null }], writeMode: 'append' }),
    ep('e2', { url: 'rest/b', schedule: { enabled: true, intervalValue: 2, intervalUnit: 'hours' } }),
    ep('e3', { schedule: { enabled: true, intervalValue: 1, intervalUnit: 'minutes' } }),
  ],
  activeId: 'e2',
};
/** @returns {any} */
const base = () => State.fromJSON(plain({ ...SCHEMA, ...BASE }));
/** @param {object} j */
function load(j) {
  const fields = [];
  const m = State.fromJSON(plain({ ...SCHEMA, ...j }), { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

suite('rest-api Model — Schema und Vorgaben', () => {
  test('Felder, Ansichtsfeld, Kommandos, Invarianten, Ableitung', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['endpoints']);
    assertDeepEqual(Object.keys(State.schema.view), ['activeId']);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'addEndpoint', 'selectEndpoint', 'renameEndpoint', 'removeEndpoint', 'addHeader', 'setHeader', 'removeHeader',
      'addMapping', 'setMapping', 'removeMapping',
    ]);
    assertDeepEqual(Object.keys(State.schema.invariants), ['uniqueIds', 'mappingColumnFree', 'noMaskedValue', 'knownActive']);
    assertDeepEqual(Object.keys(State.schema.derived), ['scheduleWithoutUrl', 'secretHeadersEmpty']);
  });
  test('Vorgabe: keine Endpunkte, nichts aktiv', () => {
    const m = new State();
    assertDeepEqual(plain(m.toJSON()), { ...SCHEMA, endpoints: [], activeId: null });
  });
  test('Grenzen des Abstands gleichen dem Schema', () => {
    const s = State.schema.fields.endpoints.item.shape.schedule.shape.intervalValue;
    assertDeepEqual([s.min, s.max, s.integer], [INTERVAL_MIN, INTERVAL_MAX, true]);
  });
  test('Abstand außerhalb 1–999 oder nicht ganzzahlig wird abgelehnt', () => {
    for (const v of [0, 1000, 2.5]) {
      const m = base();
      const eps = plain(m.endpoints);
      eps[0].schedule.intervalValue = v;
      assertTrue(thrown(() => { m.endpoints = eps; }) instanceof Error, String(v));
      assertEqual(m.endpoints[0].schedule.intervalValue, 5);
    }
  });
});

suite('rest-api Model — Invarianten', () => {
  test('streng: doppelte id, doppelte Spalte und unbekanntes activeId werfen bzw. heilen', () => {
    assertEqual(thrown(() => State.fromJSON(plain({ ...SCHEMA, endpoints: [ep('x'), ep('x')], activeId: null })))?.invariant, 'uniqueIds');
    const dup = { endpoints: [ep('x', { mappings: [{ jsonPath: '', columnRef: COL_A }, { jsonPath: '', columnRef: COL_A }] })], activeId: null };
    assertEqual(thrown(() => State.fromJSON(plain({ ...SCHEMA, ...dup })))?.invariant, 'mappingColumnFree');
    // Das Ansichtsfeld heilt auch beim strengen Laden still.
    const m = State.fromJSON(plain({ ...SCHEMA, endpoints: [ep('x')], activeId: 'weg' }));
    assertEqual(m.activeId, 'x');
  });
  test('Reparatur: spätere Doppel-ids bekommen _, spätere Doppelspalten werden leer, activeId der erste', () => {
    const { m, fields } = load({
      endpoints: [
        ep('x', { name: 'eins' }), ep('x', { name: 'zwei' }), ep('x_', { name: 'drei' }),
        ep('y', { mappings: [
          { jsonPath: 'a', columnRef: COL_A }, { jsonPath: 'b', columnRef: COL_B }, { jsonPath: 'c', columnRef: COL_A },
        ] }),
      ],
      activeId: 'weg',
    });
    assertDeepEqual(m.endpoints.map((e) => e.id), ['x', 'x_', 'x__', 'y']);
    assertDeepEqual(m.endpoints.map((e) => e.name), ['eins', 'zwei', 'drei', '']);
    assertDeepEqual(plain(m.endpoints[3].mappings), [
      { jsonPath: 'a', columnRef: COL_A }, { jsonPath: 'b', columnRef: COL_B }, { jsonPath: 'c', columnRef: null },
    ]);
    assertEqual(m.activeId, 'x');
    assertTrue(fields.includes('endpoints'), 'endpoints repariert');
  });
  test('ohne Endpunkte wird activeId null', () => {
    assertEqual(load({ endpoints: [], activeId: 'weg' }).m.activeId, null);
  });
  test('gleiche Spalte in verschiedenen Endpunkten ist erlaubt; null zählt nicht', () => {
    const m = load({ endpoints: [
      ep('a', { mappings: [{ jsonPath: '', columnRef: COL_A }, { jsonPath: '', columnRef: null }, { jsonPath: '', columnRef: null }] }),
      ep('b', { mappings: [{ jsonPath: '', columnRef: COL_A }] }),
    ], activeId: null });
    assertDeepEqual(m.fields, []);
  });
  test('Spaltenschlüssel mit und ohne Blatt', () => {
    assertEqual(columnKey(COL_A), 'ws|s1|a');
    assertEqual(columnKey({ instanceId: 'ws', columnId: 'a' }), 'ws||a');
  });
  test('beim Schreiben abgelehnt: activeId auf Unbekanntes, Doppel-id', () => {
    const m = base();
    assertEqual(thrown(() => { m.activeId = 'weg'; })?.invariant, 'knownActive');
    assertEqual(thrown(() => { m.endpoints = [ep('a'), ep('a')]; })?.invariant, 'uniqueIds');
    assertEqual(m.activeId, 'e2');
  });
});

suite('rest-api Model — Platzhalter maskierter Werte', () => {
  test('Import mit Platzhalter: Reparatur leert den Wert, andere Werte bleiben', () => {
    const { m, fields } = load({ endpoints: [ep('e', { headers: [
      { key: 'Authorization', value: '••••' }, { key: 'Accept', value: 'application/json' }, { key: 'X-Note', value: '••••' },
    ] })], activeId: 'e' });
    assertDeepEqual(plain(m.endpoints[0].headers), [
      { key: 'Authorization', value: '' }, { key: 'Accept', value: 'application/json' }, { key: 'X-Note', value: '' },
    ]);
    assertDeepEqual(fields, ['endpoints']);
    assertDeepEqual(evaluateDerived(m, /** @type {any} */ (undefined)).secretHeadersEmpty, [{ endpointId: 'e', index: 0, key: 'Authorization' }]);
  });
  test('streng geladen wirft der Platzhalter', () => {
    const j = { ...SCHEMA, endpoints: [ep('e', { headers: [{ key: 'Cookie', value: '••••' }] })], activeId: null };
    assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'noMaskedValue');
  });
  test('Schreiben des Platzhalters abgelehnt (Agent kann maskierte Werte nicht zurückschreiben)', () => {
    const m = base();
    assertEqual(thrown(() => m.setHeader({ endpointId: 'e1', index: 0, key: 'Authorization', value: '••••' }))?.invariant, 'noMaskedValue');
    assertEqual(m.endpoints[0].headers[0].value, 'application/json');
    const eps = plain(m.endpoints);
    eps[0].headers[0].value = '••••';
    assertEqual(thrown(() => { m.endpoints = eps; })?.invariant, 'noMaskedValue');
  });
});

suite('rest-api Model — Kommandos', () => {
  test('addEndpoint legt leer an, macht aktiv und liefert die id', () => {
    const m = base();
    const id = m.addEndpoint();
    assertTrue(typeof id === 'string' && id.length > 0, 'id');
    assertEqual(m.activeId, id);
    assertDeepEqual(plain(m.endpoints.at(-1)), ep(id));
  });
  test('selectEndpoint setzt activeId, unbekannte id abgelehnt', () => {
    const m = base();
    m.selectEndpoint({ endpointId: 'e1' });
    assertEqual(m.activeId, 'e1');
    assertEqual(thrown(() => m.selectEndpoint({ endpointId: 'weg' }))?.param, 'endpointId');
  });
  test('renameEndpoint wirkt auf nicht aktive Endpunkte; Nicht-Text abgelehnt', () => {
    const m = base();
    m.renameEndpoint({ endpointId: 'e1', name: 'Neu' });
    assertEqual(m.endpoints[0].name, 'Neu');
    assertTrue(thrown(() => m.renameEndpoint({ endpointId: 'e1', name: 5 })) instanceof Error, 'Zahl');
  });
  test('removeEndpoint: aktiver weg → erster übriger, letzter weg → null', () => {
    const m = base();
    m.removeEndpoint({ endpointId: 'e1' });
    assertEqual(m.activeId, 'e2');
    m.removeEndpoint({ endpointId: 'e2' });
    assertEqual(m.activeId, 'e3');
    m.removeEndpoint({ endpointId: 'e3' });
    assertEqual(m.activeId, null);
    assertDeepEqual(plain(m.endpoints), []);
  });
  test('removeEndpoint eines nicht aktiven lässt activeId', () => {
    const m = base();
    m.removeEndpoint({ endpointId: 'e3' });
    assertEqual(m.activeId, 'e2');
  });
  test('Rückfrage nennt Name, sonst URL, ohne beides eigener Text', () => {
    const m = base();
    assertDeepEqual(confirmOf(m, 'removeEndpoint', { endpointId: 'e1' }), { key: 'confirm.removeEndpoint', params: { name: 'Messwerte' } });
    assertDeepEqual(confirmOf(m, 'removeEndpoint', { endpointId: 'e2' }), { key: 'confirm.removeEndpoint', params: { name: 'rest/b' } });
    assertDeepEqual(confirmOf(m, 'removeEndpoint', { endpointId: 'e3' }), { key: 'confirm.removeEndpointUnnamed' });
  });
  test('Kopfzeilen: anhängen liefert den Index, setzen, löschen, Index geprüft', () => {
    const m = base();
    assertEqual(m.addHeader({ endpointId: 'e1' }), 1);
    m.setHeader({ endpointId: 'e1', index: 1, key: 'X-Key', value: 'geheim' });
    assertDeepEqual(plain(m.endpoints[0].headers), [{ key: 'Accept', value: 'application/json' }, { key: 'X-Key', value: 'geheim' }]);
    m.removeHeader({ endpointId: 'e1', index: 0 });
    assertDeepEqual(plain(m.endpoints[0].headers), [{ key: 'X-Key', value: 'geheim' }]);
    assertEqual(thrown(() => m.setHeader({ endpointId: 'e1', index: 1, key: 'a', value: 'b' }))?.param, 'index');
    assertEqual(thrown(() => m.removeHeader({ endpointId: 'e2', index: 0 }))?.param, 'index');
    assertTrue(thrown(() => m.setHeader({ endpointId: 'e1', index: -1, key: 'a', value: 'b' })) instanceof Error, 'negativ');
    assertTrue(thrown(() => m.setHeader({ endpointId: 'e1', index: 0, key: 'a', value: 42 })) instanceof Error, 'Zahlwert');
    assertEqual(thrown(() => m.addHeader({ endpointId: 'weg' }))?.param, 'endpointId');
  });
  test('Zuordnungen: anhängen, setzen, lösen, löschen, Index geprüft', () => {
    const m = base();
    assertEqual(m.addMapping({ endpointId: 'e1' }), 2);
    m.setMapping({ endpointId: 'e1', index: 2, jsonPath: 'data.c', ref: COL_B });
    assertDeepEqual(plain(m.endpoints[0].mappings[2]), { jsonPath: 'data.c', columnRef: COL_B });
    m.setMapping({ endpointId: 'e1', index: 2, jsonPath: 'data.c', ref: null });
    assertDeepEqual(plain(m.endpoints[0].mappings[2]), { jsonPath: 'data.c', columnRef: null });
    m.removeMapping({ endpointId: 'e1', index: 1 });
    assertDeepEqual(plain(m.endpoints[0].mappings).map((x) => x.jsonPath), ['a', 'data.c']);
    assertEqual(thrown(() => m.setMapping({ endpointId: 'e1', index: 5, jsonPath: '', ref: null }))?.param, 'index');
    assertTrue(thrown(() => m.setMapping({ endpointId: 'e1', index: 0, jsonPath: '', ref: { columnId: 'x' } })) instanceof Error, 'Form');
  });
  test('doppelte Spalte je Endpunkt: Ablehnung mit invariant mappingColumnFree, nichts geschrieben', () => {
    const m = base();
    const before = plain(m.endpoints);
    const err = thrown(() => m.setMapping({ endpointId: 'e1', index: 1, jsonPath: 'neu', ref: COL_A }));
    assertEqual(err?.invariant, 'mappingColumnFree');
    assertDeepEqual(plain(m.endpoints), before);
    // dieselbe Spalte an derselben Zuordnung erneut ist erlaubt
    m.setMapping({ endpointId: 'e1', index: 0, jsonPath: 'a2', ref: COL_A });
    assertEqual(m.endpoints[0].mappings[0].jsonPath, 'a2');
  });
});

suite('rest-api Model — Ableitung, Lesefläche, Katalog', () => {
  const entry = schemaAgentEntry(State);
  /** @param {object} m */
  const read = (m) => readSchemaModel(entry, m, undefined, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('scheduleWithoutUrl: Schalter an ohne URL', () => {
    assertDeepEqual(evaluateDerived(base(), /** @type {any} */ (undefined)).scheduleWithoutUrl, ['e3']);
    assertDeepEqual(evaluateDerived(new State(), /** @type {any} */ (undefined)).scheduleWithoutUrl, []);
  });
  test('read(): Endpunkte und Ableitungen, ohne activeId', () => {
    const r = read(base());
    assertDeepEqual(Object.keys(r), ['endpoints', 'scheduleWithoutUrl', 'secretHeadersEmpty']);
    assertDeepEqual(r.endpoints, BASE.endpoints);
  });
  test('secretHeadersEmpty: geheime Header ohne Wert, je Endpunkt mit Position', () => {
    const m = base();
    m.addHeader({ endpointId: 'e1' });
    m.setHeader({ endpointId: 'e1', index: 1, key: 'Authorization', value: '' });
    m.addHeader({ endpointId: 'e2' });
    m.setHeader({ endpointId: 'e2', index: 0, key: 'X-Trace', value: '' });
    m.addHeader({ endpointId: 'e2' });
    m.setHeader({ endpointId: 'e2', index: 1, key: 'x-session-token', value: '' });
    assertDeepEqual(evaluateDerived(m, /** @type {any} */ (undefined)).secretHeadersEmpty, [
      { endpointId: 'e1', index: 1, key: 'Authorization' }, { endpointId: 'e2', index: 1, key: 'x-session-token' },
    ]);
  });
  test('Katalog: alle Kommandos außer selectEndpoint, kein Setter, activeId nicht schreibbar', () => {
    assertDeepEqual(Object.keys(entry.actions), [
      'read', 'addEndpoint', 'renameEndpoint', 'removeEndpoint', 'addHeader', 'setHeader', 'removeHeader',
      'addMapping', 'setMapping', 'removeMapping',
    ]);
    assertTrue(!JSON.stringify(entry.settable ?? {}).includes('activeId'), 'activeId nicht schreibbar');
  });
});
