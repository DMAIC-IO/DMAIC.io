import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/process-capability/domain/model.js';
import { analyze } from '../../../js/modules/process-capability/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields, setModelContext } from '../../../js/core/model.js';
import { sourceColumns } from '../../../js/core/source-columns.js';
import { WITHIN_METHODS } from '../../../js/engines/sigma-within-engine.js';
import histogramChart from '../../../js/widgets/histogram-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c, s = 's') => ({ instanceId: 'w', sheetId: s, columnId: c });
const VALS = [9.8, 10.1, 10.0, 9.9, 10.2, 10.05, 9.95, 10.1, 9.85, 10.0];
const ctx = (confidenceLevel) => ({ cycle: 'dmaic', confidenceLevel, power: 80 });

const data = storedSource({ w: { sheets: [
  { id: 's', name: 'S', state: { rowCount: 10, columns: [
    { id: 'c', name: 'C', values: VALS },
    { id: 'g', name: 'G', type: 'text', values: ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd', 'e', 'e'] },
    { id: 'h', name: 'H', values: VALS },
  ] } },
  { id: 't', name: 'T', state: { rowCount: 10, columns: [{ id: 'x', name: 'X', values: VALS }] } },
] } });

const make = (json = {}) => State.fromJSON({ _schema: { version: '1.0' }, ...json });
const withParams = (p, rest = {}) => {
  const m = make(rest);
  m.params = { ...m.params, ...p };
  return m;
};

suite('process-capability: Model — Schema', () => {
  test('withinMethod-Literal gleich den Schätzern der Engine', () => {
    const options = State.schema.fields.params.shape.withinMethod.values;
    assertDeepEqual([...options].filter((o) => o !== ''), [...WITHIN_METHODS]);
    assertEqual([...options][0], '');
  });
  test('Vorgaben', () => {
    const m = new State();
    assertDeepEqual({ ...m.params }, {
      name: '', unit: 'mm', lsl: null, target: null, usl: null, confidence: 95,
      subgroupMode: 'size', subgroupSize: 1, withinMethod: '', unbiased: true, mrSpan: 2,
    });
    assertEqual(m.columnRef, null);
    assertEqual(m.subgroupColumnRef, null);
    assertEqual(m.embeddedValues, null);
    assertEqual(m.embeddedLabel, '');
    assertEqual(State.schema.view.histogramChart.kind, histogramChart.edits().kind);
  });
});

suite('process-capability: Model — Konfidenz aus dem Kontext', () => {
  test('neue Instanz übernimmt settings.confidenceLevel, später Wechsel ändert nichts', () => {
    const m = new State(ctx(90));
    assertEqual(m.params.confidence, 90);
    setModelContext(m, ctx(99));
    assertEqual(m.params.confidence, 90);
  });
  test('ohne Kontext 95', () => {
    assertEqual(new State().params.confidence, 95);
  });
  test('confidence null rechnet mit 95', () => {
    const base = { embeddedValues: VALS };
    const a95 = analyze(withParams({ confidence: 95, lsl: 9.5, usl: 10.5 }, base), sourceColumns(data));
    const aNull = evaluateDerived(withParams({ confidence: null, lsl: 9.5, usl: 10.5 }, base), data).analysis;
    assertDeepEqual(aNull.result, a95.result);
    assertEqual(aNull.result.confidence, 0.95);
  });
});

suite('process-capability: Model — Invariante und Kommando', () => {
  test('Beispieldaten und Messspalte zugleich: abgelehnt, nach clearEmbedded angenommen', () => {
    const m = make({ embeddedValues: VALS, embeddedLabel: 'Beispiel' });
    let err = null;
    try { setFields(m, { columnRef: ref('c') }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'embeddedOrColumn');
    assertEqual(m.columnRef, null);
    m.clearEmbedded({});
    assertEqual(m.embeddedValues, null);
    assertEqual(m.embeddedLabel, '');
    setFields(m, { columnRef: ref('c') });
    assertDeepEqual(m.columnRef, ref('c'));
  });
  test('Beides im Ladestand wirft', () => {
    let err = null;
    try { make({ embeddedValues: VALS, columnRef: ref('c') }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'embeddedOrColumn');
  });
});

suite('process-capability: Model — derived', () => {
  const d = (m) => evaluateDerived(m, data);

  test('analysis gleich analyze am Leser', () => {
    const m = withParams({ lsl: 9.5, usl: 10.5 }, { columnRef: ref('c') });
    assertDeepEqual(d(m).analysis, analyze(m, sourceColumns(data)));
  });
  test('sbar bei Modus Größe 1: Rückfall mit Hinweis', () => {
    const a = d(withParams({ withinMethod: 'sbar', lsl: 9.5, usl: 10.5 }, { columnRef: ref('c') })).analysis;
    assertEqual(a.hint.key, 'methodFallbackHint');
    assertTrue(a.result !== null);
  });
  test('ID-Spalte auf fremdem Blatt: Hinweis, kein Ergebnis', () => {
    const a = d(withParams({ subgroupMode: 'column' }, { columnRef: ref('c'), subgroupColumnRef: ref('x', 't') })).analysis;
    assertEqual(a.hint.key, 'subgroupColumnMissing');
    assertEqual(a.result, null);
  });
  test('Modus Spalte mit Beispieldaten rechnet nach Größe', () => {
    const m = withParams({ subgroupMode: 'column', lsl: 9.5, usl: 10.5 }, { embeddedValues: VALS });
    const a = d(m).analysis;
    assertEqual(a.hint, null);
    assertEqual(a.result.subgroupSize, 1);
    assertDeepEqual(d(m).subgroupModeValues, ['size']);
  });
  test('subgroupModeValues, activeColumnSlots, activeParams', () => {
    const col = withParams({ subgroupMode: 'column' }, { columnRef: ref('c') });
    assertDeepEqual(d(col).subgroupModeValues, ['size', 'column']);
    assertDeepEqual(d(col).activeColumnSlots, ['value', 'subgroup']);
    assertEqual(d(col).activeParams.includes('subgroupSize'), false);
    const size = make({ columnRef: ref('c') });
    assertDeepEqual(d(size).activeColumnSlots, ['value']);
    assertEqual(d(size).activeParams.includes('subgroupSize'), true);
    assertEqual(d(size).activeParams.includes('mrSpan'), true);
    assertEqual(d(size).activeParams.includes('unbiased'), false);
  });
  test('withinMethodOptions beginnt mit leerem Eintrag und folgt den Daten', () => {
    const o = d(make({ columnRef: ref('c') })).withinMethodOptions;
    assertEqual(o[0], '');
    assertDeepEqual(o.slice(1), d(make({ columnRef: ref('c') })).analysis.methods);
  });
  test('pickableColumns.subgroup: Blatt der Messspalte ohne diese', () => {
    const p = d(make({ columnRef: ref('c') })).pickableColumns;
    assertDeepEqual(p.subgroup.map((c) => c.key).sort(), ['w|s|g', 'w|s|h']);
    assertDeepEqual(p.value.map((c) => c.key).sort(), ['w|s|c', 'w|s|h', 'w|t|x']);
    assertDeepEqual(d(make()).pickableColumns.subgroup, []);
  });
});
