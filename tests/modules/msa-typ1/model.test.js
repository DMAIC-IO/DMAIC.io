/**
 * MSA Typ 1: Model — Schema, Vorgaben, Invariante, Ableitungen, gespeicherte Form.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, K1_OPTIONS, K2_OPTIONS } from '../../../js/modules/msa-typ1/domain/model.js';
import { analyze, mean, stddev } from '../../../js/engines/msa-typ1-engine.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { sheetSource, spySource } from '../../helpers/sheet-source.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const VALUES = Array.from({ length: 30 }, (_, i) => 10 + ((i % 7) - 3) * 0.001);
const strip = ({ _schema, ...rest }) => rest;
/** Eingaben schreiben wie `instance.set` und `x-field`: das ganze Objekt `params`. */
const setP = (m, p) => { m.params = { ...m.params, ...p }; };

suite('MSA Typ 1 Model — Vorgaben', () => {
  test('Vorgaben wie die Altform, als Zahlen; kein Inhalt', () => {
    const m = new State(CTX);
    assertDeepEqual({ ...m.params }, { name: '', unit: 'mm', ref: null, lsl: null, usl: null, k1: 0.2, k2: 3 });
    assertEqual(m.columnRef, null);
    assertEqual(m.exampleWorksheetId, null);
    assertEqual(m.hasContent(), false);
  });
  test('Auswahllisten gleich dem Schema', () => {
    assertDeepEqual(K1_OPTIONS, [0.2, 0.15, 0.1]);
    assertDeepEqual(K2_OPTIONS, [3, 4, 6]);
  });
});

suite('MSA Typ 1 Model — hasContent', () => {
  test('Spalte, Name, Referenzwert oder eine Grenze zählt; Einheit und k nicht', () => {
    const cases = [
      [(m) => { m.columnRef = ref('c'); }, true],
      [(m) => setP(m, { name: 'x' }), true],
      [(m) => setP(m, { ref: 0 }), true],
      [(m) => setP(m, { lsl: 1 }), true],
      [(m) => setP(m, { usl: 1 }), true],
      [(m) => setP(m, { unit: 'µm' }), false],
      [(m) => setP(m, { k1: 0.1 }), false],
      [(m) => setP(m, { k2: 6 }), false],
    ];
    for (const [fn, want] of cases) {
      const m = new State(CTX);
      fn(m);
      assertEqual(m.hasContent(), want, fn.toString());
    }
  });
});

suite('MSA Typ 1 Model — Feldbereiche', () => {
  test('k₁/k₂ außerhalb der Liste werden abgelehnt', () => {
    const m = new State(CTX);
    let err;
    try { setP(m, { k1: 0.25 }); } catch (e) { err = e; }
    assert(err, 'k1 0.25 abgelehnt');
    assertEqual(m.params.k1, 0.2);
    err = null;
    try { setP(m, { k2: 5 }); } catch (e) { err = e; }
    assert(err, 'k2 5 abgelehnt');
    assertEqual(m.params.k2, 3);
  });
  test('Text im Zahlfeld wird abgelehnt', () => {
    const m = new State(CTX);
    let err;
    try { setP(m, { ref: /** @type {any} */ ('abc') }); } catch (e) { err = e; }
    assert(err, 'Text abgelehnt');
    assertEqual(m.params.ref, null);
  });
});

suite('MSA Typ 1 Model — Invariante limitsOrder', () => {
  test('usl gleich lsl wird abgelehnt, Model unverändert', () => {
    const m = new State(CTX);
    setP(m, { lsl: 5 });
    let err;
    try { setP(m, { usl: 5 }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'limitsOrder');
    assertEqual(m.params.usl, null);
    assertEqual(m.params.lsl, 5);
  });
  test('lsl über usl wird abgelehnt; ohne usl gilt jedes lsl', () => {
    const m = new State(CTX);
    setP(m, { usl: 3 });
    let err;
    try { setP(m, { lsl: 9 }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'limitsOrder');
    assertEqual(m.params.lsl, null);
    setP(m, { usl: null });
    setP(m, { lsl: 9 });
    assertEqual(m.params.lsl, 9);
  });
  test('setFields schreibt beide Grenzen über die alten hinweg', () => {
    const m = new State(CTX);
    setFields(m, { params: { ...m.params, lsl: 1, usl: 2 } });
    setFields(m, { params: { ...m.params, lsl: 10, usl: 20 } });
    assertEqual(m.params.lsl, 10);
    assertEqual(m.params.usl, 20);
  });
  test('Laden mit Reparatur: usl ≤ lsl → usl leer, gemeldet', () => {
    const reports = [];
    const m = State.fromJSON({ _schema: { version: '1.0' }, params: { ...new State(CTX).params, lsl: 9, usl: 3 } },
      { repair: true, onRepair: (n) => reports.push(n), context: CTX });
    assertEqual(m.params.lsl, 9);
    assertEqual(m.params.usl, null);
    assertTrue(reports.length > 0, 'onRepair gemeldet');
  });
  test('Altform mit usl ≤ lsl lädt repariert (Migration, dann Reparatur)', () => {
    const m = State.fromJSON({ params: { lsl: '10', usl: '9' } }, { repair: true, context: CTX });
    assertEqual(m.params.lsl, 10);
    assertEqual(m.params.usl, null);
  });
});

suite('MSA Typ 1 Model — gespeicherte Form', () => {
  test('params.name und columnRef an den Pfaden der Altform', () => {
    const m = new State(CTX);
    setP(m, { name: 'Bohrung' });
    m.columnRef = ref('c');
    const json = m.toJSON();
    assertEqual(json.params.name, 'Bohrung');
    assertDeepEqual(json.columnRef, ref('c'));
    assertDeepEqual(Object.keys(json.params).sort(), ['k1', 'k2', 'lsl', 'name', 'ref', 'unit', 'usl']);
  });
  test('toJSON → fromJSON verlustfrei', () => {
    const m = new State(CTX);
    setFields(m, { params: { name: 'A', unit: 'µm', ref: 10, lsl: 9.9, usl: 10.1, k1: 0.15, k2: 4 }, columnRef: ref('c'), exampleWorksheetId: 'ws9' });
    const back = State.fromJSON(m.toJSON(), { context: CTX });
    assertDeepEqual(strip(back.toJSON()), strip(m.toJSON()));
  });
});

suite('MSA Typ 1 Model — Ableitungen', () => {
  const src = sheetSource({ c: VALUES, few: [1, 2, 3], one: [7] });
  const full = () => {
    const m = new State(CTX);
    setFields(m, { params: { ...m.params, ref: 10, lsl: 9.9, usl: 10.1 }, columnRef: ref('c') });
    return m;
  };

  test('analysis gleich der Engine, liest die Spalte über den Leser', () => {
    const m = full();
    const spy = spySource(src);
    const { analysis } = evaluateDerived(m, spy);
    assertDeepEqual(analysis, analyze({ ref: 10, lsl: 9.9, usl: 10.1, k1: 0.2, k2: 3 }, VALUES));
  });
  test('analysis null ohne Spalte und bei gelöschter Spalte', () => {
    assertEqual(evaluateDerived(new State(CTX), src).analysis, null);
    const m = full();
    m.columnRef = ref('weg');
    assertEqual(evaluateDerived(m, src).analysis, null);
  });
  test('analysis invalid bei fehlendem Referenzwert', () => {
    const m = full();
    setP(m, { ref: null });
    assertEqual(evaluateDerived(m, src).analysis.invalid.key, 'modules.msa-typ1.errRefMissing');
  });
  test('columnStats ab 2 Werten, ohne Grenzen und Referenz', () => {
    const m = new State(CTX);
    m.columnRef = ref('few');
    assertDeepEqual(evaluateDerived(m, src).columnStats, { n: 3, mean: mean([1, 2, 3]), stdDev: stddev([1, 2, 3]) });
    m.columnRef = ref('one');
    assertEqual(evaluateDerived(m, src).columnStats, null);
    m.columnRef = null;
    assertEqual(evaluateDerived(m, src).columnStats, null);
  });
  test('activeParams: alle sieben; activeColumnSlots: value', () => {
    const d = evaluateDerived(new State(CTX), src);
    assertDeepEqual(d.activeParams, ['name', 'ref', 'unit', 'lsl', 'usl', 'k1', 'k2']);
    assertDeepEqual(d.activeColumnSlots, ['value']);
  });
});
