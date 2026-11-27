/**
 * Attributtest: Model (domain/model.js) — Vorgaben, Kontextvorgabe α,
 * Grenzen, Ableitungen je Stand, Invarianten mit Reparatur, Kommandos,
 * `hasContent`, gelöschte Spalte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, MIN_DIM } from '../../../js/modules/attribute-test/domain/model.js';
import { analyze } from '../../../js/modules/attribute-test/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields, setModelName } from '../../../js/core/model.js';
import { sheetSource } from '../../helpers/sheet-source.js';

setModelName(State, 'attribute-test');

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const T = (k) => `«${k}»`;
const plain = (v) => JSON.parse(JSON.stringify(v));
const NO_SRC = sheetSource({});
const derived = (m, src = NO_SRC) => evaluateDerived(m, src, undefined, T);
const ref = (columnId) => ({ instanceId: 'ws1', sheetId: 's1', columnId });
/** @param {() => void} fn */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('kein Fehler');
}

suite('attribute-test: Model — Vorgaben', () => {
  test('Vorgaben: zwei Anteile, Zusammenfassung, zweiseitig, α aus dem Kontext, leere Tafeln', () => {
    const m = new State(CTX);
    assertEqual(m.testKind, 'two');
    assertEqual(m.inputMode, 'summary');
    assertEqual(m.direction, 'two-sided');
    assertEqual(m.alpha, 0.05);
    assertEqual(m.p0, 0.5);
    assertEqual(m.exposurePerRow, 1);
    assertEqual(m.summary.diff0, 0);
    assertDeepEqual(plain(m.summary.table), { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[null, null], [null, null]] });
    assertDeepEqual(plain(m.summary.pairs), { labels: { before: '', after: '' }, counts: [[null, null], [null, null]] });
    assertDeepEqual(plain(m.equiv), { samples: 2, symmetric: true, delta: null, lower: null, upper: null });
    assertEqual(m.eventValue, null);
    assertEqual(m.hasContent(), false);
  });
  test('Kontextvorgabe: Konfidenz 90 → α 0,1; auf (0; 1) geklemmt', () => {
    assertEqual(new State({ ...CTX, confidenceLevel: 90 }).alpha, 0.1);
    assertEqual(new State({ ...CTX, confidenceLevel: 99.999 }).alpha, 0.0001);
  });
  test('Grenzen: α, p₀, Anzahlen, Umfang werden abgelehnt, null bleibt erlaubt', () => {
    const m = new State(CTX);
    for (const v of [0, 1, 1.5]) assertThrows(() => setFields(m, { alpha: v }), /alpha/);
    for (const v of [0, 1]) assertThrows(() => setFields(m, { p0: v }), /p0/);
    assertThrows(() => setFields(m, { summary: { ...plain(m.summary), x: -1 } }), /summary/);
    assertThrows(() => setFields(m, { summary: { ...plain(m.summary), x: 1.5 } }), /summary/);
    assertThrows(() => setFields(m, { exposurePerRow: 0 }), /exposurePerRow/);
    setFields(m, { p0: null, exposurePerRow: null, summary: { ...plain(m.summary), x: 3, t: 2.5 } });
    assertEqual(m.summary.x, 3);
    assertEqual(m.p0, null);
  });
});

suite('attribute-test: Model — Ableitungen', () => {
  test('activeParams und activeColumnSlots je Testart und Eingabeart', () => {
    const m = new State(CTX);
    assertDeepEqual(derived(m).activeParams, ['testKind', 'inputMode', 'alpha', 'summary.x1', 'summary.n1', 'summary.x2', 'summary.n2', 'direction', 'pooled']);
    assertDeepEqual(derived(m).activeColumnSlots, []);
    setFields(m, { testKind: 'equiv', equiv: { ...plain(m.equiv), samples: 1, symmetric: false } });
    assertDeepEqual(derived(m).activeParams, ['testKind', 'inputMode', 'alpha', 'equiv.samples', 'equiv.symmetric', 'equiv.lower', 'equiv.upper', 'summary.x', 'summary.n', 'p0']);
    setFields(m, { inputMode: 'columns' });
    assertDeepEqual(derived(m).activeColumnSlots, ['response']);
    setFields(m, { testKind: 'rate2' });
    assertDeepEqual(derived(m).activeParams, ['testKind', 'inputMode', 'alpha', 'exposurePerRow', 'summary.diff0', 'ratePooled', 'direction']);
    assertDeepEqual(derived(m).activeColumnSlots, ['counts', 'group']);
    setFields(m, { testKind: 'mcnemar' });
    assertDeepEqual(derived(m).activeColumnSlots, ['before', 'after']);
    setFields(m, { testKind: 'assoc' });
    assertDeepEqual(derived(m).activeColumnSlots, ['rowVar', 'colVar']);
    // Ohne Ergebnis keine Richtung beim Zusammenhang.
    assertDeepEqual(derived(m).activeParams, ['testKind', 'inputMode', 'alpha']);
  });
  test('Zusammenhang: Richtung wirkt nur bei einem Ergebnis für 2 × 2', () => {
    const m = new State(CTX);
    setFields(m, { testKind: 'assoc', summary: { ...plain(m.summary), table: { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[8, 2], [3, 7]] } } });
    assertTrue(derived(m).activeParams.includes('direction'));
    m.addCol();
    m.setTableCell({ row: 0, col: 2, value: 4 });
    m.setTableCell({ row: 1, col: 2, value: 5 });
    assertTrue(!derived(m).activeParams.includes('direction'));
  });
  test('result: ohne Eingaben „insufficient“ mit Grund und Text, mit Eingaben „ok“', () => {
    const m = new State(CTX);
    assertDeepEqual(derived(m).result, { status: 'insufficient', reason: 'hintEnterCounts', hint: true, message: '«hintEnterCounts»' });
    setFields(m, { summary: { ...plain(m.summary), x1: 5, n1: 4, x2: 1, n2: 10 } });
    assertDeepEqual(derived(m).result, { status: 'insufficient', reason: 'errXGreaterN', hint: false, message: '«errXGreaterN»' });
    setFields(m, { summary: { ...plain(m.summary), x1: 46, n1: 1200, x2: 21, n2: 1150 } });
    const r = derived(m).result;
    assertEqual(r.status, 'ok');
    assertEqual(r.kind, 'two');
    assertEqual(r.stats.find((s) => s.key === 'counts1').value, '46 / 1200');
  });
  test('Ereigniswert: Optionen aus der Spalte, gespeicherter Altwert bleibt, wirksam ist der letzte', () => {
    const src = sheetSource({ r: ['a', 'b', 'b', 'a', 'b'], g: ['x', 'x', 'y', 'y', 'y'] });
    const m = new State(CTX);
    setFields(m, { testKind: 'one', inputMode: 'columns', colRefs: { ...plain(m.colRefs), response: ref('r') }, eventValue: 'gone' });
    const d = derived(m, src);
    assertDeepEqual(d.eventValueOptions, ['a', 'b']);
    assertEqual(d.effectiveEventValue, 'b');
    assertEqual(d.result.stats.find((s) => s.key === 'counts').value, '3 / 5');
    assertEqual(m.eventValue, 'gone');
    setFields(m, { eventValue: 'a' });
    assertEqual(derived(m, src).effectiveEventValue, 'a');
    assertEqual(derived(m, src).result.stats.find((s) => s.key === 'counts').value, '2 / 5');
    setFields(m, { inputMode: 'summary' });
    assertDeepEqual(derived(m, src).eventValueOptions, []);
    assertEqual(derived(m, src).effectiveEventValue, 'a');
  });
  test('Merker je Model: zwei Instanzen verdrängen einander nicht', () => {
    const a = new State(CTX);
    const b = new State(CTX);
    setFields(a, { summary: { ...plain(a.summary), x1: 46, n1: 1200, x2: 21, n2: 1150 } });
    setFields(b, { summary: { ...plain(b.summary), x1: 5, n1: 50, x2: 9, n2: 60 } });
    const first = analyze(a, NO_SRC);
    const other = analyze(b, NO_SRC);
    assertTrue(analyze(a, NO_SRC) === first, 'Treffer für a nach b');
    assertTrue(analyze(b, NO_SRC) === other, 'Treffer für b nach a');
    setFields(a, { summary: { ...plain(a.summary), x1: 47 } });
    assertTrue(analyze(a, NO_SRC) !== first, 'geänderter Stand rechnet neu');
  });
  test('McNemar über Spalten: Bezeichnungen aus den Spaltennamen', () => {
    const src = sheetSource({ b: ['i', 'i', 'n', 'n', 'n'], a: ['n', 'i', 'i', 'i', 'n'] }, { names: { b: 'Vorher', a: 'Nachher' } });
    const m = new State(CTX);
    setFields(m, { testKind: 'mcnemar', inputMode: 'columns', colRefs: { ...plain(m.colRefs), before: ref('b'), after: ref('a') } });
    const r = derived(m, src).result;
    assertDeepEqual(r.stats.find((s) => s.key === 'pBefore').params, { label: 'Vorher' });
    assertDeepEqual(derived(m, src).eventValueOptions, ['i', 'n']);
  });
  test('referenzierte Spalte gelöscht: Bezug bleibt, Hinweis, keine Rechnung', () => {
    const sheet = { r: ['a', 'b', 'b'], g: ['x', 'y', 'y'] };
    const src = sheetSource(sheet);
    const m = new State(CTX);
    setFields(m, { inputMode: 'columns', colRefs: { ...plain(m.colRefs), response: ref('r'), group: ref('g') } });
    assertEqual(derived(m, src).result.status, 'ok');
    delete sheet.g;
    const r = derived(m, src).result;
    assertEqual(r.status, 'insufficient');
    assertEqual(r.reason, 'hintPickColumns');
    assertDeepEqual(plain(m.colRefs.group), ref('g'));
  });
});

suite('attribute-test: Model — Kommandos und Invarianten', () => {
  test('Zellen, Namen und McNemar-Zellen über Kommandos; Ablehnungen', () => {
    const m = new State(CTX);
    m.setTableCell({ row: 1, col: 0, value: 7 });
    m.setTableRowName({ row: 0, name: 'Früh' });
    m.setTableColName({ col: 1, name: 'n.i.O.' });
    m.setPairCell({ row: 0, col: 1, value: 4 });
    assertDeepEqual(plain(m.summary.table), { rows: ['Früh', 'B'], cols: ['X', 'n.i.O.'], counts: [[null, null], [7, null]] });
    assertDeepEqual(plain(m.summary.pairs.counts), [[null, 4], [null, null]]);
    m.setTableCell({ row: 1, col: 0, value: null });
    assertEqual(m.summary.table.counts[1][0], null);
    assertEqual(thrown(() => m.setTableCell({ row: 2, col: 0, value: 1 })).param, 'row');
    assertEqual(thrown(() => m.setTableCell({ row: 0, col: 0, value: 1.5 })).param, 'value');
    assertEqual(thrown(() => m.setPairCell({ row: 0, col: 2, value: 1 })).param, 'col');
    assertEqual(thrown(() => m.setPairCell({ row: 0, col: 0, value: -1 })).param, 'value');
  });
  test('Zeilen und Spalten anhängen und entfernen; nie unter 2 × 2', () => {
    const m = new State(CTX);
    m.addRow();
    m.addCol();
    assertDeepEqual(plain(m.summary.table.rows), ['A', 'B', 'C']);
    assertDeepEqual(plain(m.summary.table.cols), ['X', 'Y', 'Z']);
    m.addCol();
    assertEqual(m.summary.table.cols[3], 'C4');
    assertEqual(m.summary.table.counts[2].length, 4);
    m.setTableCell({ row: 2, col: 3, value: 9 });
    m.removeRow({ row: 0 });
    m.removeCol({ col: 0 });
    assertDeepEqual(plain(m.summary.table.counts), [[null, null, null], [null, null, 9]]);
    m.removeCol({ col: 0 });
    assertEqual(MIN_DIM, 2);
    assertEqual(thrown(() => m.removeRow({ row: 0 })).param, 'row');
    assertEqual(thrown(() => m.removeCol({ col: 0 })).param, 'col');
    assertEqual(m.summary.table.cols.length, 2);
  });
  test('checkEquivalence wechselt auf zwei Stichproben und lässt Anzahlen, Spalten und Grenzen stehen', () => {
    const m = new State(CTX);
    setFields(m, {
      summary: { ...plain(m.summary), x1: 46, n1: 1200 },
      equiv: { samples: 1, symmetric: false, delta: null, lower: -1, upper: 2 },
      colRefs: { ...plain(m.colRefs), response: ref('r') },
    });
    m.checkEquivalence({});
    assertEqual(m.testKind, 'equiv');
    assertEqual(m.equiv.samples, 2);
    assertEqual(m.equiv.lower, -1);
    assertEqual(m.summary.x1, 46);
    assertDeepEqual(plain(m.colRefs.response), ref('r'));
  });
  test('Invarianten: falsche Tafelform wird beim Schreiben abgelehnt und beim Laden repariert', () => {
    const m = new State(CTX);
    assertThrows(() => setFields(m, { summary: { ...plain(m.summary), table: { rows: ['A'], cols: ['X', 'Y'], counts: [[1, 2]] } } }));
    assertThrows(() => setFields(m, { summary: { ...plain(m.summary), pairs: { labels: { before: '', after: '' }, counts: [[1, 2]] } } }));
    const json = plain(m.toJSON());
    json.summary.table = { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[1, 2]] };
    json.summary.pairs.counts = [[1], [2]];
    json.summary.pairs.labels.before = 'Alt';
    const fields = [];
    const r = State.fromJSON(json, { repair: true, onRepair: (f) => fields.push(f), context: CTX });
    assertDeepEqual(plain(r.summary.table), { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[null, null], [null, null]] });
    assertDeepEqual(plain(r.summary.pairs), { labels: { before: 'Alt', after: '' }, counts: [[null, null], [null, null]] });
    assertTrue(fields.length > 0);
  });
  test('hasContent: Anzahl, Grenze, Δ₀ ≠ 0, Zelle, Spaltenbezug; nicht Testart oder α', () => {
    const check = (patch) => { const m = new State(CTX); patch(m); return m.hasContent(); };
    assertEqual(check((m) => setFields(m, { testKind: 'assoc', alpha: 0.01, direction: 'less' })), false);
    assertEqual(check((m) => setFields(m, { summary: { ...plain(m.summary), diff0: 0 } })), false);
    assertEqual(check((m) => setFields(m, { summary: { ...plain(m.summary), diff0: 0.5 } })), true);
    assertEqual(check((m) => setFields(m, { summary: { ...plain(m.summary), x: 0 } })), true);
    assertEqual(check((m) => setFields(m, { equiv: { ...plain(m.equiv), delta: 1 } })), true);
    assertEqual(check((m) => m.setTableCell({ row: 0, col: 0, value: 0 })), true);
    assertEqual(check((m) => m.setPairCell({ row: 1, col: 1, value: 2 })), true);
    assertEqual(check((m) => setFields(m, { colRefs: { ...plain(m.colRefs), after: ref('a') } })), true);
  });
});
