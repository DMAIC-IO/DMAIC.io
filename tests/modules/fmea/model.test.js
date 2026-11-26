/**
 * FMEA: Model (domain/model.js) — Vorgaben, Invarianten samt Reparatur,
 * Kommandos samt Ablehnungen, Ableitungen und die Agentenfläche.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../../test-utils.js';
import { State, RISK_FIELDS, ACTION_FIELDS } from '../../../js/modules/fmea/domain/model.js';
import { SPECIAL_CHARS } from '../../../js/modules/fmea/domain/rating.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { LEGACY_STATE } from './legacy.js';

setModelName(State, 'fmea');

const SCHEMA = { _schema: { name: 'fmea', version: '1.0' } };
const plain = (v) => JSON.parse(JSON.stringify(v));
const legacy = () => State.fromJSON(LEGACY_STATE);
/** @param {Function} fn @returns {any} der geworfene Fehler */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('nicht geworfen');
}
const RISK = (over = {}) => ({ id: 'r1', step: '', failureMode: '', effect: '', cause: '', prevention: '', control: '',
  specialChar: '', justification: '', sev: null, occ: null, det: null, actions: [], ...over });
const ACT = (over = {}) => ({ id: 'a1', text: '', resp: '', date: '', done: false, deltaS: 0, deltaO: 0, deltaD: 0, ...over });

suite('fmea Model — Vorgaben und Schema', () => {
  test('neue FMEA: ap, process, leer', () => {
    const j = plain(new State().toJSON());
    assertEqual(j.method, 'ap');
    assertEqual(j.fmeaType, 'process');
    assertDeepEqual(j.risks, []);
    assertDeepEqual(j.scales, {});
    assertDeepEqual(j.collapsed, []);
  });
  test('Feldlisten der Setter gleich den Literalen im Schema', () => {
    assertDeepEqual([...State.schema.commands.setRiskValue.params.field.values], [...RISK_FIELDS]);
    assertDeepEqual([...State.schema.commands.setActionValue.params.field.values], [...ACTION_FIELDS]);
    assertDeepEqual([...State.schema.fields.risks.item.shape.specialChar.values], [...SPECIAL_CHARS]);
  });
});

suite('fmea Model — Invarianten', () => {
  test('riskIds: leere und doppelte ids bekommen f<uid>, nichts entfällt', () => {
    const j = { ...SCHEMA, risks: [RISK({ id: '' }), RISK({ id: 'r1' }), RISK({ id: 'r1' })] };
    assertThrows(() => State.fromJSON(j));
    const m = State.fromJSON(j, { repair: true });
    const ids = m.risks.map((r) => r.id);
    assertEqual(ids.length, 3);
    assertEqual(ids[1], 'r1');
    assertTrue(ids[0].startsWith('f') && ids[2].startsWith('f') && ids[0] !== ids[2], ids.join());
  });
  test('actionIds: je Risiko eindeutig und nicht leer', () => {
    const m = State.fromJSON({ ...SCHEMA, risks: [RISK({ actions: [ACT(), ACT(), ACT({ id: '' })] })] }, { repair: true });
    const ids = m.risks[0].actions.map((a) => a.id);
    assertEqual(new Set(ids).size, 3);
    assertEqual(ids[0], 'a1');
    assertTrue(ids.every((id) => id !== ''));
  });
  test('knownCollapsed heilt still (Ansichtsfeld), knownScaleKeys verwirft Fremdes', () => {
    const m = State.fromJSON({ ...SCHEMA, risks: [RISK()], collapsed: ['r1', 'weg'] });
    assertDeepEqual(plain(m.collapsed), ['r1']);
    const s = State.fromJSON({ ...SCHEMA, scales: { sevHigh: 'A', fremd: 'B' } }, { repair: true });
    assertDeepEqual(plain(s.scales), { sevHigh: 'A' });
  });
});

suite('fmea Model — Kommandos', () => {
  test('addRisk liefert die id f<uid>, leeres Risiko am Ende', () => {
    const m = new State();
    const id = m.addRisk({});
    assertTrue(typeof id === 'string' && id.startsWith('f'));
    assertDeepEqual(plain(m.risks[0]), RISK({ id }));
  });
  test('removeRisk nimmt die id auch aus collapsed; unbekannte id wirft', () => {
    const m = legacy();
    m.removeRisk({ id: 'r3' });
    assertDeepEqual(m.risks.map((r) => r.id), ['r1', 'x2']);
    assertDeepEqual(plain(m.collapsed), []);
    assertEqual(thrown(() => m.removeRisk({ id: 'nope' })).param, 'id');
  });
  test('setRiskValue: Text, Merkmal, S/O/D als Zahl, Zahlentext oder leer', () => {
    const m = legacy();
    m.setRiskValue({ riskId: 'x2', field: 'step', value: 'Neu' });
    m.setRiskValue({ riskId: 'x2', field: 'specialChar', value: 'SC' });
    m.setRiskValue({ riskId: 'x2', field: 'sev', value: '5' });
    assertEqual(m.risks[1].sev, 5);
    m.setRiskValue({ riskId: 'x2', field: 'sev', value: 6 });
    assertEqual(m.risks[1].sev, 6);
    m.setRiskValue({ riskId: 'x2', field: 'sev', value: '' });
    assertEqual(m.risks[1].sev, null);
    assertEqual(m.risks[1].step, 'Neu');
    assertEqual(m.risks[1].specialChar, 'SC');
  });
  test('setRiskValue lehnt ab: Bereich, Merkmal, Text, Feld, id', () => {
    const m = legacy();
    const before = JSON.stringify(m.toJSON());
    assertEqual(thrown(() => m.setRiskValue({ riskId: 'r1', field: 'sev', value: 11 })).param, 'value');
    assertEqual(thrown(() => m.setRiskValue({ riskId: 'r1', field: 'occ', value: '2.5' })).param, 'value');
    assertEqual(thrown(() => m.setRiskValue({ riskId: 'r1', field: 'specialChar', value: 'XX' })).param, 'value');
    assertEqual(thrown(() => m.setRiskValue({ riskId: 'r1', field: 'step', value: 5 })).param, 'value');
    assertEqual(thrown(() => m.setRiskValue({ riskId: 'r1', field: 'collapsed', value: true })).param, 'field');
    assertEqual(thrown(() => m.setRiskValue({ riskId: 'zz', field: 'step', value: '' })).param, 'riskId');
    assertEqual(JSON.stringify(m.toJSON()), before);
  });
  test('addRiskAction liefert die id; removeRiskAction über die id', () => {
    const m = legacy();
    const id = m.addRiskAction({ riskId: 'r3' });
    assertDeepEqual(plain(m.risks[2].actions), [ACT({ id })]);
    m.removeRiskAction({ riskId: 'r1', actionId: 'a1' });
    assertDeepEqual(m.risks[0].actions.map((a) => a.id), ['a2']);
    assertEqual(thrown(() => m.removeRiskAction({ riskId: 'r1', actionId: 'a1' })).param, 'actionId');
  });
  test('setActionValue: Felder je Art, Datum ISO oder leer', () => {
    const m = legacy();
    m.setActionValue({ riskId: 'r1', actionId: 'a2', field: 'text', value: 'T' });
    m.setActionValue({ riskId: 'r1', actionId: 'a2', field: 'done', value: true });
    m.setActionValue({ riskId: 'r1', actionId: 'a2', field: 'date', value: '' });
    m.setActionValue({ riskId: 'r1', actionId: 'a2', field: 'deltaD', value: '4' });
    assertDeepEqual(plain(m.risks[0].actions[1]), ACT({ id: 'a2', text: 'T', resp: 'Einkauf', done: true, deltaO: 1, deltaD: 4 }));
    assertEqual(thrown(() => m.setActionValue({ riskId: 'r1', actionId: 'a2', field: 'date', value: '2026-13-01' })).param, 'value');
    assertEqual(thrown(() => m.setActionValue({ riskId: 'r1', actionId: 'a2', field: 'done', value: 'ja' })).param, 'value');
    assertEqual(thrown(() => m.setActionValue({ riskId: 'r1', actionId: 'a2', field: 'deltaS', value: 10 })).param, 'value');
    assertEqual(thrown(() => m.setActionValue({ riskId: 'r1', actionId: 'zz', field: 'text', value: '' })).param, 'actionId');
  });
  test('setScaleValue nur für Skalenschlüssel; resetScales leert', () => {
    const m = legacy();
    m.setScaleValue({ key: 'occLowRate', text: '' });
    assertEqual(m.scales.occLowRate, '');
    assertEqual(thrown(() => m.setScaleValue({ key: 'legacyNote', text: 'x' })).param, 'key');
    m.resetScales({});
    assertDeepEqual(plain(m.scales), {});
  });
  test('sortByPriority nach der aktiven Methode, stabil', () => {
    const m = legacy();
    m.sortByPriority({});
    assertDeepEqual(m.risks.map((r) => r.id), ['r3', 'r1', 'x2']);
    m.method = 'ap';
    m.setRiskValue({ riskId: 'x2', field: 'sev', value: 9 });
    m.sortByPriority({});
    // r3 H S7, r1 H S9, x2 S9 O3 D2 → L: H vor L, bei H die höhere Bedeutung zuerst
    assertDeepEqual(m.risks.map((r) => r.id), ['r1', 'r3', 'x2']);
  });
  test('toggleRiskCollapsed schaltet die id in collapsed', () => {
    const m = legacy();
    m.toggleRiskCollapsed({ riskId: 'r1' });
    assertDeepEqual(plain(m.collapsed), ['r3', 'r1']);
    m.toggleRiskCollapsed({ riskId: 'r3' });
    assertDeepEqual(plain(m.collapsed), ['r1']);
  });
});

suite('fmea Model — Ableitungen', () => {
  test('stats, riskRatings und burndown folgen der Methode', () => {
    const m = legacy();
    let d = evaluateDerived(m, /** @type {any} */ (undefined));
    assertEqual(d.stats.kind, 'rpn');
    assertEqual(d.burndown.kind, 'rpn');
    assertEqual(d.riskRatings.length, 3);
    m.method = 'ap';
    d = evaluateDerived(m, /** @type {any} */ (undefined));
    assertDeepEqual(plain(d.stats), { kind: 'ap', total: 3, rated: 3, high: 2, medium: 0, low: 1, unjustified: 1 });
    const t = new Date('2026-03-02').getTime();
    assertDeepEqual(plain(d.burndown), { kind: 'ap', planX: [t - 86400000, t], planH: [2, 1], planHM: [2, 1], actX: [t - 86400000, t], actH: [2, 1], actHM: [2, 1] });
  });
  test('Datum ohne ISO-Form (Altstand) zählt nicht: kein NaN im Burndown', () => {
    const m = State.fromJSON({ ...SCHEMA, method: 'rpn', risks: [RISK({ sev: 5, occ: 4, det: 3,
      actions: [ACT({ date: 'morgen', deltaS: 1, done: true }), ACT({ id: 'a2', date: '2026-03-02', deltaO: 1 })] })] });
    const d = evaluateDerived(m, /** @type {any} */ (undefined), ['burndown']).burndown;
    const t = new Date('2026-03-02').getTime();
    assertDeepEqual(d.planX, [t - 86400000, t]);
    assertTrue(Object.values(plain(d)).flat().every((v) => typeof v !== 'number' || Number.isFinite(v)));
    const only = State.fromJSON({ ...SCHEMA, risks: [RISK({ sev: 5, occ: 4, det: 3, actions: [ACT({ date: 'morgen', deltaS: 1 })] })] });
    assertEqual(evaluateDerived(only, /** @type {any} */ (undefined), ['burndown']).burndown, null);
  });
  test('burndown null ohne datierte Wirkung', () => {
    assertEqual(evaluateDerived(new State(), /** @type {any} */ (undefined), ['burndown']).burndown, null);
  });
});

suite('fmea Model — Lesefläche und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);
  const read = (m, options) => readSchemaModel(entry, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('read() ohne Parameter: Felder und die drei Ableitungen, ohne Ansichtsfelder', () => {
    const out = read(legacy(), { fields: ['method', 'fmeaType', 'risks', 'scales', 'stats', 'riskRatings', 'burndown'] });
    assertDeepEqual(Object.keys(out), ['method', 'fmeaType', 'risks', 'scales', 'stats', 'riskRatings', 'burndown']);
    assertEqual(out.risks[1].sev, 10, 'S 15 auf 10 geklemmt (A9)');
    assertEqual(out.risks[0].actions[0].id, 'a1');
    assertTrue(!('collapsed' in read(legacy())));
  });
  test('Katalog: read und neun Kommandos; Zuklappen nur Oberfläche', () => {
    assertDeepEqual(Object.keys(entry.actions), ['read', 'addRisk', 'removeRisk', 'setRiskValue', 'addRiskAction',
      'removeRiskAction', 'setActionValue', 'setScaleValue', 'resetScales', 'sortByPriority']);
    assertDeepEqual(Object.keys(entry.actions.setActionValue.keys), ['riskId', 'actionId', 'field', 'value']);
  });
  test('instance.set: method, fmeaType, risks, scales; Invarianten', () => {
    assertDeepEqual(entry.settable, ['method', 'fmeaType', 'risks', 'scales']);
    assertDeepEqual(entry.invariants, ['riskIds', 'actionIds', 'knownCollapsed', 'knownScaleKeys']);
    assertDeepEqual(entry.viewFields, ['collapsed', 'burndownEdits']);
  });
});
