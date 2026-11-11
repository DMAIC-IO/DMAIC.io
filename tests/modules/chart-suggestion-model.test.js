/**
 * Unit tests for chart-suggestion domain/model.js — Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/chart-suggestion/domain/model.js';
import { evaluateDerived } from '../../js/core/derived.js';

const ref = (id) => ({ instanceId: 'ws', sheetId: 's', columnId: id });
function fakeData(cols) {
  return {
    column: (r) => { const c = cols[r.columnId]; return c ? { name: c.name, type: c.type, role: c.role, roleConfirmed: c.roleConfirmed } : null; },
    values: (r) => cols[r.columnId]?.values ?? null,
  };
}
const num = (name, values) => ({ name, type: 'numeric', role: 'continuous', roleConfirmed: true, values });
const twoNumeric = fakeData({ a: num('Länge', [1, 2, 3, 4, 5]), b: num('Breite', [2, 4, 5, 8, 9]) });

suite('chart-suggestion Model — derived', () => {
  test('ohne Spalten: keine Auswahl, keine Vorschläge, keine Wahl, kein Ziel', () => {
    const out = evaluateDerived(State.fromJSON({}), twoNumeric);
    assertDeepEqual(out, { selection: null, suggestions: [], selectedChartType: null, openTarget: null });
  });

  test('zwei numerische Spalten: Auswahl mit Rollen und Quelle', () => {
    const m = State.fromJSON({ columns: [ref('a'), ref('b')] });
    assertDeepEqual(evaluateDerived(m, twoNumeric).selection, {
      sourceInstanceId: 'ws', sourceSheetId: 's',
      columns: [
        { id: 'a', name: 'Länge', role: 'continuous', roleConfirmed: true },
        { id: 'b', name: 'Breite', role: 'continuous', roleConfirmed: true },
      ],
    });
  });

  test('zwei numerische Spalten: Vorschläge als Schlüssel, ohne Texte', () => {
    const m = State.fromJSON({ columns: [ref('a'), ref('b')] });
    const { suggestions } = evaluateDerived(m, twoNumeric);
    assertDeepEqual(suggestions, [
      { chartType: 'scatter', score: 95, titleKey: 'charts.scatter', noteKey: null, vars: {} },
      { chartType: 'scatter-marginal-boxplot', score: 85, titleKey: 'charts.scatterMarginalBoxplot', noteKey: null, vars: {} },
      { chartType: 'scatter-marginal-histogram', score: 80, titleKey: 'charts.scatterMarginalHistogram', noteKey: null, vars: {} },
    ]);
  });

  test('Wahl: Spitzenreiter, die Wahl des Nutzers nur wenn vorgeschlagen', () => {
    const cols = [ref('a'), ref('b')];
    assertEqual(evaluateDerived(State.fromJSON({ columns: cols }), twoNumeric).selectedChartType, 'scatter');
    assertEqual(evaluateDerived(State.fromJSON({ columns: cols, pick: 'scatter-marginal-boxplot' }), twoNumeric).selectedChartType, 'scatter-marginal-boxplot');
    assertEqual(evaluateDerived(State.fromJSON({ columns: cols, pick: 'pareto' }), twoNumeric).selectedChartType, 'scatter');
  });

  test('openTarget: Zielmodul der gezeigten Wahl, null für Typen ohne Ziel', () => {
    const cols = [ref('a'), ref('b')];
    assertEqual(evaluateDerived(State.fromJSON({ columns: cols }), twoNumeric).openTarget, 'xy-plot');
    assertEqual(evaluateDerived(State.fromJSON({ columns: cols, pick: 'scatter-marginal-boxplot' }), twoNumeric).openTarget, null);
  });

  test('nicht auflösbare Bezüge fallen weg', () => {
    const m = State.fromJSON({ columns: [ref('a'), ref('x')] });
    assertEqual(evaluateDerived(m, twoNumeric).selection.columns.length, 1);
  });

  test('ein Fehler beim Lesen wird zu { error }; Texte werden nie übersetzt', () => {
    const m = State.fromJSON({ columns: [ref('a')] });
    const out = evaluateDerived(m, { ...twoNumeric, column: () => { throw new Error('kaputt'); } });
    assertDeepEqual(out.suggestions, { error: 'kaputt' });
  });
});
