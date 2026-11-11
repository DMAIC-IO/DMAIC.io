/**
 * Unit tests for chart-suggestion domain/model.js — Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/chart-suggestion/domain/model.js';
import { evaluateDerived } from '../../js/core/derived.js';
import { RULES } from '../../js/core/chart-suggestions/chart-suggestions.js';
import uiDe from '../../js/modules/chart-suggestion/resources/i18n/ui.de.json' with { type: 'json' };
import uiEn from '../../js/modules/chart-suggestion/resources/i18n/ui.en.json' with { type: 'json' };

/** Übersetzt einen Schlüssel wie `t` des Viewmodels: Pfad in der Sprachdatei, `{x}` aus vars. */
const translate = (ui, key, vars = {}) => String(key.split('.').reduce((o, k) => o?.[k], ui)).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const hasKey = (ui, key) => typeof key.split('.').reduce((o, k) => o?.[k], ui) === 'string';

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

  test('t(titleKey, vars) ergibt die bisherigen Titel (de und en)', () => {
    const m = State.fromJSON({ columns: [ref('a'), ref('b')] });
    const { suggestions } = evaluateDerived(m, twoNumeric);
    assertDeepEqual(suggestions.map((s) => translate(uiEn, s.titleKey, s.vars)),
      ['Scatter plot', 'Scatter plot with marginal boxplots', 'Scatter plot with marginal histograms']);
    assertDeepEqual(suggestions.map((s) => translate(uiDe, s.titleKey, s.vars)),
      ['Streudiagramm', 'Streudiagramm mit Boxplot-Randverteilungen', 'Streudiagramm mit Histogramm-Randverteilungen']);
  });

  test('Vorschläge enthalten nur Schlüssel, die es in beiden Sprachdateien gibt, keine übersetzten Sätze', () => {
    const keyShape = /^(charts|notes)\.[A-Za-z0-9]+$/;
    for (const rule of RULES.rules ?? RULES) {
      for (const c of rule.charts) {
        assertEqual(hasKey(uiEn, `charts.${c.i18nKey}`) && hasKey(uiDe, `charts.${c.i18nKey}`), true);
        if (c.notesKey) assertEqual(hasKey(uiEn, `notes.${c.notesKey}`) && hasKey(uiDe, `notes.${c.notesKey}`), true);
      }
    }
    const m = State.fromJSON({ columns: [ref('a'), ref('b')] });
    for (const s of evaluateDerived(m, twoNumeric).suggestions) {
      assertEqual(keyShape.test(s.titleKey), true);
      assertEqual(s.noteKey === null || keyShape.test(s.noteKey), true);
      assertEqual(hasKey(uiEn, s.titleKey) && hasKey(uiDe, s.titleKey), true);
      assertEqual(/\s/.test(s.chartType), false);
    }
  });

  test('ein Fehler beim Lesen wird zu { error }', () => {
    const m = State.fromJSON({ columns: [ref('a')] });
    const out = evaluateDerived(m, { ...twoNumeric, column: () => { throw new Error('kaputt'); } });
    assertDeepEqual(out.suggestions, { error: 'kaputt' });
  });
});
