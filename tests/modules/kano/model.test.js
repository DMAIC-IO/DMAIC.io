/**
 * Kano: Model (domain/model.js) — Vorgaben, gespeicherte Stände '1.0', die
 * drei Invarianten (streng, mit Reparatur, beim Schreiben), alle Kommandos
 * samt Ablehnungen und `confirm`, die Ableitungen `evaluation` und
 * `sourceHint`, `hasContent`, Lesefläche und Agentenkatalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, hasAnswers, ANSWER_MAX } from '../../../js/modules/kano/domain/model.js';
import { setModelName, confirmOf } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { evaluate } from '../../../js/engines/kano-engine.js';

setModelName(State, 'kano');

const SCHEMA = { _schema: { name: 'kano', version: '1.0' } };
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));
const ans = (f, d, w = null) => ({ f, d, w });
const item = (id, nodeId = null, label = id.toUpperCase()) => ({ id, nodeId, label, path: 'VoC', missing: false });

const STORED = {
  ...SCHEMA,
  source: { instanceId: 'tree', level: 'need' },
  options: { importance: true },
  items: [item('i1', 'n1'), item('i2', 'n2'), item('i3')],
  respondents: [{ id: 'r1', name: 'Anna' }, { id: 'r2', name: 'Ben' }],
  answers: { r1: { i1: ans(1, 5, 9), i2: ans(3, 5, 4) }, r2: { i1: ans(1, 5, 7), i3: ans(1, 3, null) } },
  activeRespondentId: 'r2',
  scatterEdits: {},
};
/** @returns {any} */
const stored = () => State.fromJSON(plain(STORED));
const T = (k) => `T:${k}`;
const src = (ids) => ({ list: () => ids.map(([instanceId, moduleId]) => ({ instanceId, moduleId, phase: 'define' })), read() { throw new Error('x'); } });

suite('kano Model — Vorgaben und Stände', () => {
  test('neu: keine Quelle, Ebene need, Wichtigkeit an, leer', () => {
    assertEqual(json(new State().toJSON()), json({
      ...SCHEMA, source: { instanceId: null, level: 'need' }, options: { importance: true },
      items: [], respondents: [], answers: {}, activeRespondentId: null, scatterEdits: {},
    }));
  });
  test('gespeicherter Stand 1.0 lädt unverändert', () => {
    assertEqual(json(stored().toJSON()), json(STORED));
  });
  test('unbekannte Version wirft', () => {
    assertThrows(() => State.fromJSON({ ...STORED, _schema: { name: 'kano', version: '9.0' } }), /version/);
  });
  test('Schema-Literale gleich der Engine-Skala', () => {
    const shape = State.schema.fields.answers.value.value.shape;
    assertDeepEqual([shape.f.max, shape.d.max, shape.w.max], [ANSWER_MAX.f, ANSWER_MAX.d, ANSWER_MAX.w]);
    assertDeepEqual([...State.schema.fields.source.shape.level.values], ['need', 'driver', 'req']);
  });
});

suite('kano Model — Invarianten', () => {
  test('doppelte Merkmal- und Befragten-ids: beim Laden mit Reparatur entfällt die spätere', () => {
    const m = /** @type {any} */ (loadModel(State, plain({
      ...STORED,
      items: [item('i1'), { ...item('i1'), label: 'zwei' }, item('i2'), item('i3')],
      respondents: [{ id: 'r1', name: 'A' }, { id: 'r1', name: 'B' }, { id: 'r2', name: 'C' }],
    })));
    assertDeepEqual(m.items.map((i) => i.label), ['I1', 'I2', 'I3']);
    assertDeepEqual(m.respondents.map((r) => r.name), ['A', 'C']);
  });
  test('unbekannte aktive Befragte: Reparatur wählt die erste', () => {
    const m = /** @type {any} */ (loadModel(State, plain({ ...STORED, activeRespondentId: 'weg' })));
    assertEqual(m.activeRespondentId, 'r1');
  });
  test('Antworten auf unbekannte Befragte oder Merkmale entfallen beim Reparieren einzeln', () => {
    const m = /** @type {any} */ (loadModel(State, plain({
      ...STORED, answers: { r1: { i1: ans(1, 5), weg: ans(2, 2) }, rx: { i1: ans(1, 1) } },
    })));
    assertEqual(json(m.answers), json({ r1: { i1: ans(1, 5) } }));
  });
  test('Schreiben einer unbekannten aktiven Befragten wird abgelehnt', () => {
    const m = stored();
    assertThrows(() => { m.activeRespondentId = 'weg'; }, /knownActive/);
    assertEqual(m.activeRespondentId, 'r2');
  });
});

suite('kano Model — Kommandos', () => {
  test('setSourceTree setzt jede id und löst mit null', () => {
    const m = stored();
    m.setSourceTree({ instanceId: 'unbekannt' });
    assertEqual(m.source.instanceId, 'unbekannt');
    m.setSourceTree({ instanceId: null });
    assertEqual(m.source.instanceId, null);
    assertEqual(m.source.level, 'need');
  });
  test('setSourceLevel leert Merkmale und Antworten; confirm nur bei gesetzter Antwort', () => {
    const m = stored();
    assertDeepEqual(confirmOf(m, 'setSourceLevel', { level: 'req' }), { key: 'confirm.setSourceLevel' });
    m.setSourceLevel({ level: 'req' });
    assertDeepEqual([m.source.level, m.items.length, json(m.answers)], ['req', 0, '{}']);
    assertEqual(confirmOf(m, 'setSourceLevel', { level: 'need' }), null);
    assertThrows(() => m.setSourceLevel({ level: 'xyz' }), /level/);
  });
  test('syncItems: neue anhängen, umbenannte nachziehen, verschwundene markieren, Baum verknüpfen', () => {
    const m = stored();
    m.setSourceTree({ instanceId: null });
    const n = m.syncItems({ instanceId: 't2', candidates: [
      { nodeId: 'n1', label: 'Neu benannt', path: 'P' },
      { nodeId: 'n3', label: 'Ganz neu', path: 'P' },
    ] });
    assertEqual(n, 4);
    assertEqual(m.source.instanceId, 't2');
    assertDeepEqual(m.items.map((i) => [i.nodeId, i.label, i.missing]), [
      ['n1', 'Neu benannt', false], ['n2', 'I2', true], [null, 'I3', false], ['n3', 'Ganz neu', false]]);
    assertTrue(!['i1', 'i2', 'i3'].includes(m.items[3].id), 'neue id');
    assertEqual(json(m.answers.r1.i1), json(ans(1, 5, 9)), 'Antworten bleiben');
  });
  test('syncItems lehnt eine leere Instanz ab', () => {
    assertThrows(() => stored().syncItems({ instanceId: '', candidates: [] }), /instanceId/);
  });
  test('setItems: Vorgaben, Antworten verschwundener Merkmale entfallen, liefert die Zahl', () => {
    const m = stored();
    assertEqual(m.setItems({ items: [{ id: 'i1' }, { id: 'neu', label: 'N', missing: true }] }), 2);
    assertEqual(json(m.items[0]), json({ id: 'i1', nodeId: null, label: '', path: '', missing: false }));
    assertEqual(json(m.answers), json({ r1: { i1: ans(1, 5, 9) }, r2: { i1: ans(1, 5, 7) } }));
  });
  test('setItems lehnt doppelte ids, fremde Schlüssel und leere id ab, ohne etwas zu ändern', () => {
    const m = stored();
    assertThrows(() => m.setItems({ items: [{ id: 'a' }, { id: 'a' }] }), /distinct/);
    assertThrows(() => m.setItems({ items: [{ id: 'a', foo: 1 }] }), /foo/);
    assertThrows(() => m.setItems({ items: [{ id: '' }] }), /id/);
    assertThrows(() => m.setItems({ items: [{ id: 'a', nodeId: 3 }] }), /nodeId/);
    assertEqual(json(m.toJSON()), json(STORED));
  });
  test('removeItem entfernt das Merkmal samt Antworten; unbekannte id abgelehnt', () => {
    const m = stored();
    m.removeItem({ id: 'i1' });
    assertDeepEqual(m.items.map((i) => i.id), ['i2', 'i3']);
    assertEqual(json(m.answers), json({ r1: { i2: ans(3, 5, 4) }, r2: { i3: ans(1, 3) } }));
    assertThrows(() => m.removeItem({ id: 'weg' }), /id/);
  });
  test('addRespondent: Name Pflicht und getrimmt, die erste wird aktiv, liefert die id', () => {
    const m = new State();
    const a = m.addRespondent({ name: '  Anna ' });
    const b = m.addRespondent({ name: 'Ben' });
    assertDeepEqual(m.respondents.map((r) => r.name), ['Anna', 'Ben']);
    assertEqual(m.activeRespondentId, a);
    assertTrue(a !== b);
    assertThrows(() => m.addRespondent({ name: '  ' }), /name/);
    assertThrows(() => m.addRespondent({}), /name/);
  });
  test('renameRespondent: getrimmt, leer abgelehnt, unbekannte id abgelehnt', () => {
    const m = stored();
    m.renameRespondent({ id: 'r1', name: ' Anne ' });
    assertEqual(m.respondents[0].name, 'Anne');
    assertThrows(() => m.renameRespondent({ id: 'r1', name: '' }), /name/);
    assertThrows(() => m.renameRespondent({ id: 'rx', name: 'X' }), /id/);
    assertEqual(m.respondents[0].name, 'Anne');
  });
  test('removeRespondent: Antworten mit, aktive rückt auf die erste; confirm immer', () => {
    const m = stored();
    assertDeepEqual(confirmOf(m, 'removeRespondent', { id: 'r2' }), { key: 'confirm.removeRespondent' });
    m.removeRespondent({ id: 'r2' });
    assertEqual(m.activeRespondentId, 'r1');
    assertTrue(!Object.hasOwn(m.answers, 'r2'));
    m.removeRespondent({ id: 'r1' });
    assertEqual(m.activeRespondentId, null);
    assertThrows(() => m.removeRespondent({ id: 'r1' }), /id/);
  });
  test('setAnswer: legt Ebenen an, nimmt Zahlentext und null, prüft die Skala je Frage', () => {
    const m = stored();
    m.setAnswer({ respondentId: 'r2', itemId: 'i2', field: 'w', value: '9' });
    assertEqual(json(m.answers.r2.i2), json(ans(null, null, 9)));
    m.setAnswer({ respondentId: 'r1', itemId: 'i1', field: 'f', value: null });
    assertEqual(m.answers.r1.i1.f, null);
    assertThrows(() => m.setAnswer({ respondentId: 'r1', itemId: 'i1', field: 'f', value: 6 }), /value/);
    assertThrows(() => m.setAnswer({ respondentId: 'r1', itemId: 'i1', field: 'd', value: 0 }), /value/);
    assertThrows(() => m.setAnswer({ respondentId: 'r1', itemId: 'i1', field: 'w', value: 10 }), /value/);
    assertThrows(() => m.setAnswer({ respondentId: 'r1', itemId: 'i1', field: 'w', value: 2.5 }), /value/);
    assertThrows(() => m.setAnswer({ respondentId: 'r1', itemId: 'i1', field: 'x', value: 1 }), /field/);
    assertThrows(() => m.setAnswer({ respondentId: 'rx', itemId: 'i1', field: 'f', value: 1 }), /respondentId/);
    assertThrows(() => m.setAnswer({ respondentId: 'r1', itemId: 'ix', field: 'f', value: 1 }), /itemId/);
    assertThrows(() => m.setAnswer({ respondentId: 'r1', itemId: 'i1', field: 'f' }), /value/);
    m.setAnswer({ respondentId: 'r1', itemId: 'i1', field: 'w', value: 9 });
    assertEqual(m.answers.r1.i1.w, 9);
  });
  test('hasAnswers und hasContent', () => {
    assertEqual(hasAnswers({ r: { i: ans(null, null, null) } }), false);
    assertEqual(hasAnswers({ r: { i: ans(null, null, 3) } }), true);
    const m = new State();
    assertEqual(m.hasContent(), false);
    m.addRespondent({ name: 'A' });
    assertEqual(m.hasContent(), true);
  });
});

suite('kano Model — Ableitungen', () => {
  test('evaluation ist die Engine über Merkmale, Befragte, Antworten und Optionen', () => {
    const m = stored();
    const { evaluation } = evaluateDerived(m, /** @type {any} */ (src([])), ['evaluation'], T);
    assertEqual(json(evaluation), json(evaluate(m.items, m.respondents, m.answers, m.options)));
  });
  test('sourceHint: null ohne Quelle oder mit bekanntem Baum, sonst übersetzter Hinweis', () => {
    const m = stored();
    const hint = (s) => evaluateDerived(m, /** @type {any} */ (s), ['sourceHint'], T).sourceHint;
    assertEqual(hint(src([['tree', 'voc-ctx-tree']])), null);
    assertEqual(hint(src([['tree', 'worksheet']])), 'T:sourceHint.unknownTree');
    assertEqual(hint(src([])), 'T:sourceHint.unknownTree');
    m.setSourceTree({ instanceId: null });
    assertEqual(hint(src([])), null);
  });
});

suite('kano Model — Lesefläche und Katalog', () => {
  const entryOf = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entryOf, m, options, evaluateDerived(m, /** @type {any} */ (src([['tree', 'voc-ctx-tree']])), undefined, T));

  test('read() mit fields: gespeicherte Form ohne Ansichtsfelder, mit Ableitungen', () => {
    const out = read(stored(), { fields: ['source', 'options', 'items', 'respondents', 'answers', 'evaluation', 'sourceHint'] });
    assertEqual(json(out.items), json(STORED.items));
    assertEqual(json(out.answers), json(STORED.answers));
    assertEqual(out.sourceHint, null);
    assertTrue(!Object.hasOwn(read(stored()), 'activeRespondentId'));
    assertTrue(!Object.hasOwn(read(stored()), 'treeList'));
  });
  test('read() ohne Option: items nur als Umfang', () => {
    assertTrue(!Array.isArray(read(stored()).items));
  });
  test('Katalog: read und die Model-Kommandos; settable nur options', () => {
    assertDeepEqual(Object.keys(entryOf.actions), ['read', 'setSourceTree', 'setSourceLevel', 'syncItems', 'setItems',
      'removeItem', 'addRespondent', 'renameRespondent', 'removeRespondent', 'setAnswer']);
    assertDeepEqual(entryOf.settable, ['options']);
    assertDeepEqual(entryOf.invariants, ['uniqueItemIds', 'uniqueRespondentIds', 'knownActive']);
  });
});
