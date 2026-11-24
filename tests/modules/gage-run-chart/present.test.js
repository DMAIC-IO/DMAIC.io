/**
 * Messverlaufsdiagramm: der Presenter (viewmodel/present.js) — KPI-Leiste,
 * Hinweise und je Streifen die Widget-Konfiguration aus dem Rohergebnis. Die
 * Zahlen gleichen der Altform (Altprojekt-Fixture: 15 Messwerte, 4 Teile,
 * 2 Prüfer, Bezugswert 10,5, Gesamtmittel 10,1027).
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { fmt, refLabelOf, kpiOf, warningTextsOf, runStripsOf } from '../../../js/modules/gage-run-chart/viewmodel/present.js';
import { analyze } from '../../../js/modules/gage-run-chart/domain/analyze.js';
import GageRunChart from '../../../js/widgets/gage-run-chart/schema.js';
import { checkValue } from '../../../js/core/model.js';

/** Übersetzer-Stub: Schlüssel mit Parametern, damit die Texte prüfbar sind. */
const T = (k, p) => (p ? `${k}(${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(',')})` : k);

const TEIL = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const PRUEFER = ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'];
const DURCHMESSER = [
  10.02, 10.04, 10.06, 10.08, 10.12, 10.1, 10.14, null,
  9.98, 10, 10.03, 10.05, 10.2, 10.22, 10.24, 10.26,
];
const A = analyze({ parts: TEIL, operators: PRUEFER, measurements: DURCHMESSER });
const A_NO_OP = analyze({ parts: TEIL, operators: null, measurements: DURCHMESSER });
const MODEL = { refValue: 10.5, partsPerRow: 2, showOperatorMean: false, connectWithin: false };
const NAMES = { part: 'Teil', measurement: 'Durchmesser' };

/** Prüft rekursiv: keine Funktionen, kein NaN, kein undefined. */
function assertPlainData(v, path = 'config') {
  if (typeof v === 'function') throw new Error(`${path}: Funktion`);
  if (typeof v === 'number') assert(Number.isFinite(v), `${path}: nicht endlich`);
  if (v === undefined) throw new Error(`${path}: undefined`);
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) assertPlainData(x, `${path}.${k}`);
}

suite('gage-run-chart: Presenter — Zahlen', () => {
  test('vier Nachkommastellen in der Sprache, „–“ für nicht endlich', () => {
    assertEqual(fmt(10.5, 'en'), '10.5000');
    assertEqual(fmt(10.5, 'de'), '10,5000');
    assertEqual(fmt(10.102666666666668, 'de'), '10,1027');
    assertEqual(fmt(1234.5, 'de'), '1.234,5000');
    assertEqual(fmt(NaN, 'de'), '–');
    assertEqual(fmt(Infinity, 'en'), '–');
    assertEqual(fmt(null, 'en'), '–');
  });

  test('Beschriftung der Bezugslinie: Mittelwert ohne eigenen Wert', () => {
    assertEqual(refLabelOf(null, T), 'refMean');
    assertEqual(refLabelOf(0, T), 'refCustom');
    assertEqual(refLabelOf(10.5, T), 'refCustom');
  });
});

suite('gage-run-chart: Presenter — KPI-Leiste', () => {
  test('Altprojekt mit eigenem Bezugswert: Unterzeile ist das Gesamtmittel', () => {
    assertDeepEqual(kpiOf(A, MODEL, 2, T, 'en'), {
      n: 15, partsText: 'statParts(count=4)', operatorCount: 2, rowsText: 'statRows(count=2)',
      refText: '10.5000', refLabel: 'refCustom', refSubText: 'statGrandMean(v=10.1027)',
    });
    assertEqual(kpiOf(A, MODEL, 2, T, 'de').refText, '10,5000');
    assertEqual(kpiOf(A, MODEL, 2, T, 'de').refSubText, 'statGrandMean(v=10,1027)');
  });

  test('ohne eigenen Bezugswert: Gesamtmittel als Wert, Spanne als Unterzeile', () => {
    const k = kpiOf(A, { ...MODEL, refValue: null }, 2, T, 'de');
    assertEqual(k.refText, '10,1027');
    assertEqual(k.refLabel, 'refMean');
    assertEqual(k.refSubText, 'statSpan(min=9,9800,max=10,2600)');
  });

  test('ohne Prüferspalte: Prüfer 0', () => {
    assertEqual(kpiOf(A_NO_OP, MODEL, 2, T, 'en').operatorCount, 0);
  });
});

suite('gage-run-chart: Presenter — Hinweise', () => {
  test('Reihenfolge der Rechnung: unbalanced, dann droppedRows mit Zahl', () => {
    assertDeepEqual(warningTextsOf(A, T), ['warn_unbalanced', 'warnDroppedRows(count=1)']);
  });

  test('ohne Hinweise leer', () => {
    const full = analyze({ parts: [1, 1, 2, 2], operators: null, measurements: [1, 2, 3, 4] });
    assertDeepEqual(warningTextsOf(full, T), []);
  });
});

suite('gage-run-chart: Presenter — Streifen', () => {
  test('Konfiguration wie die Altform, Altschlüssel je Index', () => {
    const strips = runStripsOf(A, MODEL, NAMES, T);
    assertEqual(strips.length, 2);
    assertDeepEqual(strips.map((s) => s.key), ['strip-0', 'strip-1']);
    assertDeepEqual(strips.map((s) => s.legacyEditKey), ['gage-run-chart', 'gage-run-chart#2']);
    const [first, last] = strips.map((s) => s.config);
    assertDeepEqual(first, {
      title: '', showTitle: false, xLabel: '', showXLabel: false, yLabel: 'Durchmesser', showLegend: true,
      panels: [
        { part: '1', series: [{ operator: 'A', values: [10.02, 10.04], mean: 10.03 }, { operator: 'B', values: [10.06, 10.08], mean: 10.07 }] },
        { part: '2', series: [{ operator: 'A', values: [10.12, 10.1], mean: 10.11 }, { operator: 'B', values: [10.14], mean: 10.14 }] },
      ],
      operators: ['A', 'B'], refValue: 10.5, refLabel: 'refCustom',
      showOperatorMean: false, connectWithin: false, sharedYMin: 9.98, sharedYMax: 10.26,
    });
    assertEqual(last.xLabel, 'Teil');
    assertEqual(last.showXLabel, true);
    assertDeepEqual(last.panels.map((p) => p.part), ['3', '4']);
    assertEqual(last.sharedYMin, first.sharedYMin);
    assertEqual(last.refValue, first.refValue);
  });

  test('ohne eigenen Bezugswert liegt die Linie auf dem Gesamtmittel', () => {
    const [s] = runStripsOf(A, { ...MODEL, refValue: null, partsPerRow: 7 }, NAMES, T);
    assertEqual(s.config.refValue, A.grandMean);
    assertEqual(s.config.refLabel, 'refMean');
    assertEqual(s.config.xLabel, 'Teil', 'ein Streifen ist der letzte');
  });

  test('ohne Prüferspalte keine Legende', () => {
    const strips = runStripsOf(A_NO_OP, MODEL, NAMES, T);
    assertDeepEqual(strips.map((s) => s.config.showLegend), [false, false]);
    assertDeepEqual(strips[0].config.operators, ['']);
  });

  test('nur Schlüssel des Widget-Schemas, keine Funktionen, kein NaN', () => {
    const spec = GageRunChart.props.config;
    const keys = new Set(Object.keys(spec.shape));
    for (const s of runStripsOf(A, MODEL, NAMES, T)) {
      for (const k of Object.keys(s.config)) assert(keys.has(k), `fremder Schlüssel ${k}`);
      assertPlainData(s.config);
      checkValue(spec, 'config', s.config);
    }
  });

  test('ohne Ergebnis oder ohne Messwerte keine Streifen', () => {
    assertDeepEqual(runStripsOf(null, MODEL, NAMES, T), []);
    const empty = analyze({ parts: [1, 2], operators: null, measurements: [null, 'x'] });
    assertEqual(empty.n, 0);
    assertDeepEqual(runStripsOf(empty, MODEL, NAMES, T), []);
  });
});
