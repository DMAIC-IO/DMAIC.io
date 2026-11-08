import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/histogram/domain/model.js';
import { from0, seriesFrom } from '../../js/modules/histogram/domain/migrations.js';
import { loadModel } from '../../js/core/initial-model.js';

const r = { instanceId: 'w', sheetId: 's', columnId: 'c' };

suite('histogram: Migration', () => {
  test('v1 seriesRefs → datasets', () => {
    assertDeepEqual(from0({ seriesRefs: [r, null, r] }).datasets, [{ valueRef: r, groupRef: null }, { valueRef: r, groupRef: null }]);
  });
  test('flache Diagrammfelder → view.histogramChart, leere Texte und Vorgaben entfallen', () => {
    const out = from0({
      datasets: [{ valueRef: r, groupRef: null }], chartTitleText: 'Mein Titel', chartXLabelText: '', chartYLabelText: 'Anzahl',
      showTitle: true, titleSize: 15, labelSize: 14, tickSize: 11, showXLabel: false, showYLabel: true, showXTicks: true, showYTicks: true,
      bgColor: null, refLines: [], refAreas: [{ dir: 'x', min: 1, max: 2, label: '', color: 'rgba(0,0,0,0.1)' }], barGap: 1,
      showPareto: false, showBoxplot: true, showStats: false, seriesOverrides: [{ fillColor: 'red' }], binMode: 'manual', binWidth: 2, confLevel: 90,
    });
    assertDeepEqual(out.histogramChart, {
      title: 'Mein Titel', yLabel: 'Anzahl', labelSize: 14, showXLabel: false,
      refAreas: [{ dir: 'x', min: 1, max: 2, label: '', color: 'rgba(0,0,0,0.1)' }], pareto: false,
    });
    assertEqual(out.showStats, false);
    assertEqual(out.seriesOverrides, undefined);
    assertEqual(out.binMode, 'manual');
    assertEqual(out.binWidth, 2);
    assertEqual(out.confLevel, 90);
  });
  test('Reihen-Einstellungen mit Namen landen in histogramChart.series', () => {
    const out = from0({ seriesOverrides: [{ name: 'A', visible: false, fillColor: 'red', borderWidth: 2, unbekannt: 1 }] });
    assertDeepEqual(out.histogramChart.series, [{ name: 'A', visible: false, fillColor: 'red', borderWidth: 2 }]);
    assertEqual(out.seriesOverrides, undefined);
  });
  test('Reihen-Einstellungen ohne Namen entfallen, ebenso Einträge ohne gültige Schlüssel', () => {
    const out = from0({ seriesOverrides: [{ fillColor: 'red' }, { name: '', fillColor: 'red' }, { name: 'B', borderWidth: -1 }] });
    assertEqual(out.histogramChart.series, undefined);
  });
  test('ungültiger Einzelwert entfällt, der Rest bleibt', () => {
    const out = from0({ seriesOverrides: [{ name: 'A', borderStyle: 'wellig', patternSolidity: 7, fillColor: 'red', visible: null }] });
    assertDeepEqual(out.histogramChart.series, [{ name: 'A', fillColor: 'red' }]);
  });
  test('Altstand mit Reihen-Einstellung lädt ohne Reparaturwarnung und behält sie', () => {
    const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
    try {
      const m = loadModel(State, { datasets: [{ valueRef: r, groupRef: null }], showStats: true, binMode: 'auto', binWidth: null, confLevel: 95, seriesOverrides: [{ name: 'Spalte 0', visible: false, fillColor: 'red', borderStyle: 'wellig' }] });
      assertDeepEqual(m.histogramChart, { series: [{ name: 'Spalte 0', visible: false, fillColor: 'red' }] });
      assertDeepEqual(seen, []);
    } finally { console.warn = warn; }
  });
  test('Unsinn wird bereinigt, binWidth nur bei manual', () => {
    const out = from0({ binMode: 'weird', binWidth: 3, confLevel: 'x', datasets: 'kaputt' });
    assertEqual(out.binMode, undefined);
    assertEqual(out.binWidth, null);
    assertEqual(out.confLevel, undefined);
    assertEqual(out.datasets, undefined);
  });
  test('Altstand lädt ohne Reparaturwarnung', () => {
    const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
    try {
      const m = loadModel(State, { datasets: [{ valueRef: r, groupRef: null }], chartTitleText: 'T', showStats: true, binMode: 'auto', binWidth: null, confLevel: 95 });
      assertEqual(m.histogramChart.title, 'T');
      assertDeepEqual(seen, []);
    } finally { console.warn = warn; }
  });

  test('umbenannte Reihe: der Index bestimmt den Namen, die Füllfarbe bleibt', () => {
    assertDeepEqual(seriesFrom([{ name: 'Alter Name', fillColor: 'red' }], ['Spalte A']), [{ name: 'Spalte A', fillColor: 'red' }]);
  });
  test('Gruppenreihen: je Index der Gruppenname', () => {
    assertDeepEqual(
      seriesFrom([{ fillColor: 'red' }, { fillColor: 'blue' }], ['Spalte – g1', 'Spalte – g2']),
      [{ name: 'Spalte – g1', fillColor: 'red' }, { name: 'Spalte – g2', fillColor: 'blue' }],
    );
  });
  test('dieselbe Spalte doppelt mit verschiedenen Übersteuerungen bleibt getrennt', () => {
    assertDeepEqual(
      seriesFrom([{ fillColor: 'red' }, { fillColor: 'blue' }], ['A', 'A']),
      [{ name: 'A', fillColor: 'red' }, { name: 'A', fillColor: 'blue' }],
    );
  });
  test('dieselbe Spalte doppelt mit anderen Schlüsseln: beide Einträge bleiben', () => {
    assertDeepEqual(
      seriesFrom([{ fillColor: 'red' }, { borderWidth: 2 }], ['A', 'A']),
      [{ name: 'A', fillColor: 'red' }, { name: 'A', borderWidth: 2 }],
    );
  });
  test('refLines mit einem ungültigen Eintrag: nur dieser fällt weg', () => {
    const good = { dir: 'h', value: 3 };
    const out = from0({ refLines: [good, { dir: 'q', value: 'x' }, { dir: 'v', value: 1 }] });
    assertDeepEqual(out.histogramChart.refLines, [good, { dir: 'v', value: 1 }]);
  });
  test('Größe 99 fällt auf die Vorgabe, der Rest bleibt', () => {
    const out = from0({ labelSize: 99, tickSize: 20, showXLabel: false });
    assertDeepEqual(out.histogramChart, { tickSize: 20, showXLabel: false });
  });
  test('exampleWorksheetId fehlt im Ergebnis, wenn nicht gesetzt', () => {
    assertEqual('exampleWorksheetId' in from0({}), false);
    assertEqual(from0({ exampleWorksheetId: 'ex' }).exampleWorksheetId, 'ex');
  });
  test('Migration eines guten Altstands mit Bezugslinien und Größen ohne Reparaturwarnung', () => {
    const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
    try {
      const m = loadModel(State, { datasets: [{ valueRef: r, groupRef: null }], showStats: true, binMode: 'auto', binWidth: null, confLevel: 95, labelSize: 14, refLines: [{ dir: 'h', value: 2 }] });
      assertEqual(m.histogramChart.labelSize, 14);
      assertDeepEqual(m.histogramChart.refLines, [{ dir: 'h', value: 2 }]);
      assertDeepEqual(seen, []);
    } finally { console.warn = warn; }
  });
});
