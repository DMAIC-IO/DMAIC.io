/**
 * Ishikawa: Konfiguration des Trend-Diagramms (viewmodel/charts.js) — rein,
 * ohne DOM und ohne Uhr. Prüft Reihen, Punkte, Beschriftungen und Farben, die
 * das Widget `trend-chart` bekommt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { trendConfig } from '../../../js/modules/ishikawa/viewmodel/charts.js';
import trendWidget from '../../../js/widgets/trend-chart/schema.js';
import { checkValue } from '../../../js/core/model.js';

const EXPERTS = [{ id: 1 }, { id: 2 }];

/** Ein Stand mit Zeilen; Experten nach Vorgabe EXPERTS. */
function state(name, date, rows, experts = EXPERTS) {
  return { name, date, data: { rows, experts } };
}

suite('ishikawa charts: trendConfig', () => {
  test('weniger als zwei Stände: kein Diagramm', () => {
    assertEqual(trendConfig([state('S1', '2020-01-01', [])], { lang: 'de' }), null);
    assertEqual(trendConfig([], { lang: 'de' }), null);
  });

  test('Zeilen ohne Bewertung: kein Diagramm', () => {
    const rows = [{ stableId: 'a', name: 'A', ratings: {} }];
    assertEqual(trendConfig([state('S1', '2020-01-01', rows), state('S2', '2020-01-02', rows)], { lang: 'de' }), null);
  });

  test('eine Reihe je stableId mit Punkten', () => {
    const s1 = state('S1', '2020-01-01', [
      { stableId: 'a', name: 'Hyp A', ratings: { 1: 4, 2: 6 } },
      { stableId: 'b', name: 'Hyp B', ratings: { 1: 2, 2: 2 } },
    ]);
    const s2 = state('S2', '2020-01-02', [
      { stableId: 'a', name: 'Hyp A', ratings: { 1: 8, 2: 8 } },
      { stableId: 'b', name: 'Hyp B', ratings: { 1: 5, 2: 7 } },
    ]);
    const cfg = trendConfig([s1, s2], { lang: 'de' });
    assertDeepEqual(cfg.series.map((s) => s.sid), ['a', 'b']);
    assertEqual(cfg.xCount, 2);
  });

  test('Punkte: x = Index des Stands, y = Score', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'A', ratings: { 1: 4, 2: 6 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'A', ratings: { 1: 8, 2: 8 } }]);
    assertDeepEqual(trendConfig([s1, s2], { lang: 'de' }).series[0].points, [{ x: 0, y: 5 }, { x: 1, y: 8 }]);
  });

  test('Stand ohne Score fehlt in der Reihe', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'A', ratings: {} }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'A', ratings: { 1: 6, 2: 6 } }]);
    const s3 = state('S3', '2020-01-03', [{ stableId: 'a', name: 'A', ratings: { 1: 9, 2: 9 } }]);
    assertDeepEqual(trendConfig([s1, s2, s3], { lang: 'de' }).series[0].points.map((p) => p.x), [1, 2]);
  });

  test('Score nur über die Experten des Stands', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'A', ratings: { 1: 2, 9: 9 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'A', ratings: { 1: 4 } }], []);
    const cfg = trendConfig([s1, s2], { lang: 'de' });
    assertDeepEqual(cfg.series[0].points, [{ x: 0, y: 2 }]);
  });

  test('Name der Reihe: jüngster nicht leerer Name', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'Old name', ratings: { 1: 5 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'New name', ratings: { 1: 5 } }]);
    assertEqual(trendConfig([s1, s2], { lang: 'de' }).series[0].name, 'New name');
    const s3 = state('S3', '2020-01-03', [{ stableId: 'a', name: '   ', ratings: { 1: 5 } }]);
    assertEqual(trendConfig([s1, s3], { lang: 'de' }).series[0].name, 'Old name');
    const s4 = state('S4', '2020-01-04', [{ stableId: 'a', name: '', ratings: { 1: 5 } }]);
    assertEqual(trendConfig([s4, s4], { lang: 'de' }).series[0].name, 'a');
  });

  test('Farbe der Reihe aus den Linienfarben des Moduls, der Reihe nach, nach 16 von vorn', () => {
    const rows = Array.from({ length: 17 }, (_, i) => ({ stableId: `s${i}`, name: `R${i}`, ratings: { 1: 5 } }));
    const cfg = trendConfig([state('S1', '2020-01-01', rows), state('S2', '2020-01-02', rows)], { lang: 'de' });
    assertEqual(cfg.series[0].color, 'var(--ishikawa-line-1)');
    assertEqual(cfg.series[1].color, 'var(--ishikawa-line-2)');
    assertEqual(cfg.series[15].color, 'var(--ishikawa-line-16)');
    assertEqual(cfg.series[16].color, 'var(--ishikawa-line-1)');
  });

  test('Beschriftung der Stände: Datum in der Sprache, langer Name gekürzt', () => {
    const s1 = state('S1 with a very long name indeed', '2020-03-09', [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }]);
    const s2 = state('Short', '2020-04-15', [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }]);
    const de = trendConfig([s1, s2], { lang: 'de' });
    assertEqual(de.xLabels.length, 2);
    assertEqual(de.xLabels[0].date, '09.03.');
    assertTrue(de.xLabels[0].name.length <= 13, 'gekürzt');
    assertTrue(de.xLabels[0].name.endsWith('…'), 'Auslassungszeichen');
    assertEqual(de.xLabels[1].name, 'Short');
    assertEqual(trendConfig([s1, s2], { lang: 'en' }).xLabels[0].date, '09/03');
    assertEqual(trendConfig([state('X', 'kein Datum', s1.data.rows), s2], { lang: 'de' }).xLabels[0].date, '');
  });

  test('nur Schlüssel des Widgets, Ränder wie bisher', () => {
    const rows = [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }];
    const cfg = trendConfig([state('S1', '2020-01-01', rows), state('S2', '2020-01-02', rows)], { lang: 'de' });
    checkValue(trendWidget.props.config, 'config', cfg);
    assertDeepEqual(Object.keys(cfg).sort(), ['layout', 'series', 'xCount', 'xLabels']);
    assertDeepEqual(cfg.layout, { padT: 30, padR: 30, padB: 55, padL: 45 });
  });
});
