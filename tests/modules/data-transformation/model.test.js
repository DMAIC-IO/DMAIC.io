/**
 * Tests for modules/data-transformation/domain/model.js — Vorgaben und
 * gespeicherte Form, Ablehnungen beim Schreiben (λ leer erlaubt, Bereich),
 * `hasContent`, die Ableitungen `effectiveTF`, `activeParams`,
 * `activeColumnSlots`, `targetColumns` (alle Spalten je Blatt) und die
 * Lesefläche.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, sourceValues } from '../../../js/modules/data-transformation/domain/model.js';
import { requireTarget } from '../../../js/core/worksheet-targets.js';
import { setModelName, setFields } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { storedSource } from '../../helpers/stored-source.js';

setModelName(State, 'data-transformation');

const plain = (v) => JSON.parse(JSON.stringify(v));
/** @param {() => any} fn @returns {any} */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Arbeitsblatt `w1`: Blatt `s1` mit C1 positiv, C2 mit negativen Werten und Text '2,5', C3 leer; Blatt `s2` mit C4. */
const WS = {
  sheets: [
    { id: 's1', name: 'Messung', state: { columns: [
      { id: 'c1', name: 'Durchmesser', type: 'numeric', values: [2.3, 3.1, 1.8, 4.6] },
      { id: 'c2', name: 'Abweichung', type: 'numeric', values: [-1, '2,5', 3, null, 'x'] },
      { id: 'c3', name: '', type: 'numeric', values: [] },
    ] } },
    { id: 's2', name: 'Zweites', state: { columns: [{ id: 'c4', name: 'X', type: 'numeric', values: [1] }] } },
  ],
};
const src = storedSource({ w1: WS });
const ref = (columnId) => ({ instanceId: 'w1', sheetId: 's1', columnId });
/** @param {object} m @param {any} [s] */
const derived = (m, s = src) => evaluateDerived(m, s);

suite('data-transformation Model — Vorgaben und Form', () => {
  test('neues Model: Box-Cox, keine Spalte, λ leer, Johnson-Vorgaben', () => {
    const m = new State();
    assertEqual(m.currentTF, 'boxcox');
    assertEqual(m.columnRef, null);
    assertDeepEqual(plain(m.params), {
      boxcox: { lambda: null }, yeojohnson: { lambda: null },
      johnson_su: { gamma: 0, delta: 1, xi: 0, lambdaJ: 1 },
      johnson_sb: { gamma: 0, delta: 1, xi: 0, lambdaJ: 1 },
    });
    assertEqual(m.exampleWorksheetId, null);
  });

  test('gespeicherte Form lädt streng und rund', () => {
    const m = new State();
    setFields(m, { currentTF: 'johnson_sb', columnRef: ref('c1') });
    const j = plain(m.toJSON());
    assertDeepEqual(j._schema, { name: 'data-transformation', version: '1.0' });
    assertDeepEqual(plain(State.fromJSON(j).toJSON()), j);
  });

  test('λ: leer erlaubt, Zahl im Bereich −5…5, sonst abgelehnt', () => {
    const m = new State();
    const p = plain(m.params);
    p.boxcox.lambda = 0.5;
    setFields(m, { params: p });
    assertEqual(m.params.boxcox.lambda, 0.5);
    p.boxcox.lambda = null;
    setFields(m, { params: p });
    assertEqual(m.params.boxcox.lambda, null);
    p.boxcox.lambda = 6;
    assertTrue(thrown(() => setFields(m, { params: p })) !== null);
    assertEqual(m.params.boxcox.lambda, null);
  });

  test('Johnson-Parameter: Bereich je Schlüssel, δ ab 0,1', () => {
    const m = new State();
    const p = plain(m.params);
    p.johnson_su.delta = 0.05;
    assertTrue(thrown(() => setFields(m, { params: p })) !== null);
    p.johnson_su.delta = 2;
    setFields(m, { params: p });
    assertEqual(m.params.johnson_su.delta, 2);
    assertEqual(m.params.johnson_sb.delta, 1);
  });

  test('unbekannte Transformation abgelehnt', () => {
    assertTrue(thrown(() => setFields(new State(), { currentTF: 'cube' })) !== null);
  });

  test('hasContent: jede Abweichung von der Vorgabe, nicht das Beispielblatt', () => {
    const m = State.fromJSON({ ...plain(new State().toJSON()), exampleWorksheetId: 'w9' });
    assertEqual(m.exampleWorksheetId, 'w9');
    assertEqual(m.hasContent(), false);
    setFields(m, { currentTF: 'log' });
    assertEqual(m.hasContent(), true);
    const n = new State();
    setFields(n, { columnRef: ref('c1') });
    assertEqual(n.hasContent(), true);
  });
});

suite('data-transformation Model — Ableitungen', () => {
  test('sourceValues: Zahlen der Spalte, Text 2,5 zählt, Leeres und Text nicht', () => {
    assertDeepEqual(sourceValues(src, ref('c2')), [-1, 2.5, 3]);
    assertDeepEqual(sourceValues(src, null), []);
    assertDeepEqual(sourceValues(src, ref('gone')), []);
  });

  test('effectiveTF: Rückfall nur bei Box-Cox mit einem Wert ≤ 0, gespeichert bleibt Box-Cox', () => {
    const m = new State();
    assertEqual(derived(m).effectiveTF, 'boxcox');
    setFields(m, { columnRef: ref('c1') });
    assertEqual(derived(m).effectiveTF, 'boxcox');
    setFields(m, { columnRef: ref('c2') });
    assertEqual(derived(m).effectiveTF, 'yeojohnson');
    assertEqual(m.currentTF, 'boxcox');
    setFields(m, { currentTF: 'sqrt' });
    assertEqual(derived(m).effectiveTF, 'sqrt');
  });

  test('activeParams: Pfade der wirksamen Transformation', () => {
    const m = new State();
    assertDeepEqual(derived(m).activeParams, ['params.boxcox.lambda']);
    setFields(m, { columnRef: ref('c2') });
    assertDeepEqual(derived(m).activeParams, ['params.yeojohnson.lambda']);
    setFields(m, { currentTF: 'johnson_sb' });
    assertDeepEqual(derived(m).activeParams, ['params.johnson_sb.gamma', 'params.johnson_sb.delta', 'params.johnson_sb.xi', 'params.johnson_sb.lambdaJ']);
    setFields(m, { currentTF: 'log' });
    assertDeepEqual(derived(m).activeParams, []);
    assertDeepEqual(derived(m).activeColumnSlots, ['columnRef']);
  });

  test('targetColumns: je Blatt alle Spalten, dann „neue Spalte“; unbekanntes Ziel abgelehnt', () => {
    const targets = derived(new State()).targetColumns;
    assertDeepEqual(targets.map((t) => t.key), ['w1|s1|c1', 'w1|s1|c2', 'w1|s1|c3', 'w1|s1|__new__', 'w1|s2|c4', 'w1|s2|__new__']);
    assertEqual(targets[0].name, 'Durchmesser');
    assertEqual(targets[3].name, 'Messung');
    assertDeepEqual(derived(new State(), storedSource({})).targetColumns, []);
    requireTarget('w1|s1|c1', targets);
    assertEqual(thrown(() => requireTarget('w1|s1|zz', targets))?.param, 'target');
  });
});

suite('data-transformation Model — Lesefläche', () => {
  const entry = schemaAgentEntry(State);
  const read = (m) => readSchemaModel(entry, m, undefined, evaluateDerived(m, src));

  test('Felder und Ableitungen, ohne Ansichtsfelder', () => {
    const m = new State();
    setFields(m, { columnRef: ref('c2') });
    const r = plain(read(m));
    for (const k of ['currentTF', 'columnRef', 'params', 'effectiveTF', 'activeParams', 'activeColumnSlots', 'targetColumns']) {
      assertTrue(Object.hasOwn(r, k), k);
    }
    for (const k of ['exampleWorksheetId', 'histOrigEdits', 'ppTransEdits', 'transforms', 'pickableColumns', 'result', 'errorMsg']) {
      assertTrue(!Object.hasOwn(r, k), k);
    }
    assertEqual(r.effectiveTF, 'yeojohnson');
    assertEqual(r.params.boxcox.lambda, null);
  });
});
