import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { State, resolveTarget } from '../../js/modules/hypothesis-test/domain/model.js';
import { analyze } from '../../js/modules/hypothesis-test/domain/analyze.js';
import { evaluateDerived } from '../../js/core/derived.js';

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });

suite('hypothesis-test Model', () => {
  test('Vorgaben aus dem Kontext: 90 % → α 0,10, kein Inhalt', () => {
    const m = new State({ cycle: 'dmaic', confidenceLevel: 90, power: 90 });
    assertEqual(m.alpha, 0.1);
    assertEqual(m.powerGoal, 0.9);
    assertEqual(m.hasContent(), false);
  });

  test('Vorgaben aus dem Kontext werden an Extremwerten geklemmt', () => {
    const hi = new State({ cycle: 'dmaic', confidenceLevel: 99.99999, power: 99.9 });
    assertEqual(hi.alpha, 0.0001);
    assertEqual(hi.powerGoal, 0.99);
    const lo = new State({ cycle: 'dmaic', confidenceLevel: 0.5, power: 10 });
    assertEqual(lo.alpha, 0.995);
    assertEqual(lo.powerGoal, 0.5);
  });

  test('Vorgaben', () => {
    const m = new State();
    const json = m.toJSON();
    delete json._schema;
    assertDeepEqual(json, {
      category: 'variance', testType: 'one', direction: 'two-sided', alpha: 0.05, powerGoal: 0.8,
      targetValue: '', targetType: 'variance', colRef1: null, colRef2: null, colRefsK: [], equalVariances: false,
      exampleWorksheetId: null,
      residFittedChart: {}, residProbChart: {}, residHistChart: {}, residOrderChart: {},
    });
    assertEqual(m.hasContent(), false);
  });

  test('gespeicherter Stand ohne Diagramm-Schlüssel lädt unverändert; Diagrammeinstellungen sind kein Inhalt', () => {
    const saved = new State({ cycle: 'dmaic' }).toJSON();
    for (const k of ['residFittedChart', 'residProbChart', 'residHistChart', 'residOrderChart']) delete saved[k];
    const old = State.fromJSON(saved);
    for (const k of ['residFittedChart', 'residProbChart', 'residHistChart', 'residOrderChart']) assertDeepEqual(old.toJSON()[k], {});
    const edited = State.fromJSON({ ...old.toJSON(), residHistChart: { title: 'X' } });
    assertEqual(edited.residHistChart.title, 'X');
    assertEqual(edited.hasContent(), false);
  });

  test('setCategory: Varianz bei gepaart erzwingt two', () => {
    const m = new State();
    m.setCategory({ category: 'mean' });
    m.setTestType({ testType: 'paired' });
    m.setCategory({ category: 'variance' });
    assertEqual(m.testType, 'two');
  });

  test('setCategory behält andere Testarten', () => {
    const m = new State();
    m.setCategory({ category: 'mean' });
    m.setTestType({ testType: 'k' });
    m.setCategory({ category: 'variance' });
    assertEqual(m.testType, 'k');
  });

  test('setTestType: in/aus paired leert targetValue, sonst nicht', () => {
    const m = new State();
    m.setCategory({ category: 'mean' });
    m.targetValue = '5';
    m.setTestType({ testType: 'two' });
    assertEqual(m.targetValue, '5');
    m.setTestType({ testType: 'paired' });
    assertEqual(m.targetValue, '');
    m.targetValue = '1';
    m.setTestType({ testType: 'one' });
    assertEqual(m.targetValue, '');
  });

  test('Invariante: paired nur bei Mittelwerten', () => {
    const m = new State();
    assertThrows(() => { m.testType = 'paired'; }, /invalid testType "paired"; allowed: a value that keeps pairedMeansOnly/);
  });

  test('Grenzen und Spaltenform', () => {
    const m = new State();
    assertThrows(() => { m.alpha = 1; }, /invalid alpha/);
    assertThrows(() => { m.powerGoal = 0.4; }, /invalid powerGoal/);
    assertThrows(() => { m.colRef1 = { instanceId: 'x' }; }, /invalid colRef1/);
    assertThrows(() => { m.colRefsK = [ref('a'), null]; }, /invalid colRefsK\[1\]/);
    m.colRefsK = [ref('a')];
    assertEqual(m.hasContent(), true);
  });

  test('hasContent: colRef1 oder colRef2', () => {
    const a = new State(); a.colRef1 = ref('a');
    const b = new State(); b.colRef2 = ref('b');
    assertEqual(a.hasContent(), true);
    assertEqual(b.hasContent(), true);
  });

  test('resolveTarget liest Dezimalkomma', () => {
    const m = { category: 'mean', testType: 'one', targetType: 'variance', targetValue: '3,5' };
    assertEqual(resolveTarget(m), 3.5);
    assertEqual(resolveTarget({ ...m, category: 'variance', targetType: 'stddev', targetValue: '1,5' }), 2.25);
  });

  test('resolveTarget wie bisher', () => {
    const m = new State();
    assertEqual(resolveTarget(m), null);
    m.targetValue = '4'; m.targetType = 'stddev';
    assertEqual(resolveTarget(m), 16);
    m.targetType = 'variance';
    assertEqual(resolveTarget(m), 4);
    m.targetValue = '-1';
    assertEqual(resolveTarget(m), null);
    m.setCategory({ category: 'mean' });
    assertEqual(resolveTarget(m), -1);
    m.targetValue = 'abc';
    assertEqual(resolveTarget(m), null);
    m.setTestType({ testType: 'paired' });
    assertEqual(resolveTarget(m), 0);
    m.targetValue = '2.5';
    assertEqual(resolveTarget(m), 2.5);
  });

  test('toJSON → fromJSON ist verlustfrei', () => {
    const m = new State();
    m.setCategory({ category: 'mean' });
    m.setTestType({ testType: 'k' });
    m.colRefsK = [ref('a'), ref('b')];
    m.equalVariances = true;
    const back = State.fromJSON(m.toJSON());
    assertDeepEqual(back.toJSON(), m.toJSON());
  });

  test('Migration 0→1.0: Altstand lädt, Unbrauchbares fällt auf die Vorgabe', () => {
    const m = State.fromJSON({
      category: 'variance', testType: 'paired', direction: 'sideways', alpha: null, powerGoal: '0.9',
      targetValue: 3, targetType: 'variance', colRef1: { instanceId: 'ws1', columnId: 'c1' },
      colRef2: { instanceId: null }, colRefsK: [ref('a'), 'x', null], equalVariances: 'yes', exampleWorksheetId: 'ws1',
    });
    assertEqual(m.testType, 'two');
    assertEqual(m.direction, 'two-sided');
    assertEqual(m.alpha, 0.05);
    assertEqual(m.powerGoal, 0.9);
    assertEqual(m.targetValue, '3');
    assertDeepEqual(m.colRef1, { instanceId: 'ws1', columnId: 'c1' });
    assertEqual(m.colRef2, null);
    assertDeepEqual(m.colRefsK, [ref('a')]);
    assertEqual(m.equalVariances, false);
    assertEqual(m.exampleWorksheetId, 'ws1');
    assertEqual(m.toJSON()._schema.version, '1.0');
  });

  test('Migration: leerer Altstand und alpha/powerGoal außerhalb des Bereichs', () => {
    assertEqual(State.fromJSON({}).alpha, 0.05);
    const m = State.fromJSON({ alpha: 1.5, powerGoal: 0.1, category: 'mean', testType: 'paired' });
    assertEqual(m.alpha, 0.05);
    assertEqual(m.powerGoal, 0.8);
    assertEqual(m.testType, 'paired');
  });

  test('Migration: paired ohne gespeicherte Kategorie wird zu two und lädt ohne Reparatur', () => {
    const m = State.fromJSON({ testType: 'paired' });
    assertEqual(m.category, 'variance');
    assertEqual(m.testType, 'two');
  });

  test('Migration: Bezug mit Zusatzschlüssel verliert sie, numerische Ids werden Text, ohne Reparaturwarnung', () => {
    const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
    try {
      const m = State.fromJSON({
        colRef1: { instanceId: 'ws1', sheetId: 's1', columnId: 'c1', label: 'x' },
        colRef2: { instanceId: 7, columnId: 'c2' },
        colRefsK: [{ instanceId: 'ws1', columnId: 'c3', extra: 1 }],
        exampleWorksheetId: 12,
      });
      // Das Feld columnRef lässt nur instanceId/sheetId/columnId zu: Zusatzschlüssel entfallen bewusst
      assertDeepEqual(m.colRef1, { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' });
      assertDeepEqual(m.colRef2, { instanceId: '7', columnId: 'c2' });
      assertDeepEqual(m.colRefsK, [{ instanceId: 'ws1', columnId: 'c3' }]);
      assertEqual(m.exampleWorksheetId, '12');
      assertDeepEqual(seen, []);
    } finally { console.warn = warn; }
  });
});

suite('hypothesis-test Model — derived result', () => {
  const A = [10.1, 10.4, 9.8, 10.2, 10.0, 10.3];
  const B = [12.9, 13.2, 12.7, 13.0, 12.8, 13.4];
  const cols = { c0: A, c1: B };
  const data = {
    name: (r) => (cols[r.columnId] ? `Spalte ${r.columnId}` : null),
    values: (r) => (cols[r.columnId] ? [...cols[r.columnId]] : null),
    numeric: (r) => (cols[r.columnId] ? [...cols[r.columnId]] : null),
  };

  test('ohne Spalten: insufficient, dieselbe Analyse wie der Rechenkern', () => {
    const m = State.fromJSON({ category: 'mean', testType: 'two' });
    const { result } = evaluateDerived(m, data);
    assertEqual(result.status, 'insufficient');
    assertDeepEqual(result, analyze({
      category: 'mean', testType: 'two', direction: m.direction, alpha: m.alpha, powerGoal: m.powerGoal,
      target: null, targetType: m.targetType, equalVariances: m.equalVariances,
      samples: [{ name: '', values: null }, { name: '', values: null }],
    }));
  });

  test('zwei Stichproben: result ist ok und gleicht dem Rechenkern auf denselben Spalten', () => {
    const m = State.fromJSON({ category: 'mean', testType: 'two', colRef1: ref('c0'), colRef2: ref('c1') });
    const { result } = evaluateDerived(m, data);
    assertEqual(result.status, 'ok');
    assertDeepEqual(result, analyze({
      category: m.category, testType: m.testType, direction: m.direction, alpha: m.alpha, powerGoal: m.powerGoal,
      target: resolveTarget(m), targetType: m.targetType, equalVariances: m.equalVariances,
      samples: [{ name: 'Spalte c0', values: A }, { name: 'Spalte c1', values: B }],
    }));
  });

  test('nur result steht in den Ableitungen; ein Fehler wird zu { error }', () => {
    const m = State.fromJSON({ category: 'mean', testType: 'one', colRef1: ref('c0') });
    const out = evaluateDerived(m, { ...data, numeric: () => { throw new Error('kaputt'); } });
    assertDeepEqual(Object.keys(out), ['result']);
    assertDeepEqual(out.result, { error: 'kaputt' });
  });
});
