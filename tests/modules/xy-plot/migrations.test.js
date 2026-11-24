import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/xy-plot/domain/model.js';
import { from0, from10, legacySeriesFrom, errorBarsFrom } from '../../../js/modules/xy-plot/domain/migrations.js';
import { loadModel } from '../../../js/core/initial-model.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const NONE = { mode: 'none' };
const empty = { x: null, y: null, group: null, size: null, errorBars: NONE };

suite('xy-plot: Migration', () => {
  test('v2 datasets → Slots x/y/group/size', () => {
    const out = from0({ datasets: [{ xRef: ref('a'), yRef: ref('b'), groupRef: ref('g'), sizeRef: ref('s') }] });
    assertDeepEqual(out.datasets, [{ x: ref('a'), y: ref('b'), group: ref('g'), size: ref('s'), errorBars: NONE }]);
  });
  test('v1 colRefX + seriesRefs → eine Zeile je Y mit gleichem X', () => {
    const out = from0({ colRefX: ref('x'), seriesRefs: [ref('a'), ref('b')] });
    assertDeepEqual(out.datasets, [
      { x: ref('x'), y: ref('a'), group: null, size: null, errorBars: NONE },
      { x: ref('x'), y: ref('b'), group: null, size: null, errorBars: NONE },
    ]);
  });
  test('Prefill-Form ohne sizeRef und ohne _schema: size null', () => {
    const m = loadModel(State, { datasets: [{ xRef: ref('a'), yRef: ref('b'), groupRef: null }] });
    assertDeepEqual(m.datasets, [{ x: ref('a'), y: ref('b'), group: null, size: null, errorBars: NONE }]);
  });
  test('leere Liste → eine leere Zeile', () => {
    assertDeepEqual(from0({ datasets: [] }).datasets, [empty]);
    assertDeepEqual(from0({ colRefX: ref('x'), seriesRefs: [] }).datasets, [empty]);
    assertDeepEqual(loadModel(State, { datasets: [] }).datasets, [empty]);
  });
  test('kaputter Bezug → null, übrige Felder bleiben', () => {
    const out = from0({ datasets: [{ xRef: { instanceId: 'w', columnId: 'c' }, yRef: ref('b'), groupRef: 'kaputt', sizeRef: { instanceId: '', sheetId: 's', columnId: 'c' } }, null] });
    assertDeepEqual(out.datasets, [{ x: null, y: ref('b'), group: null, size: null, errorBars: NONE }, empty]);
  });
  test('refLines (gültig, kaputt) und bgColor → chart', () => {
    const line = { dir: 'h', value: 3, label: 'Soll', dash: 'dash', color: 'red' };
    const out = from0({ refLines: [line, { dir: 'schräg', value: 'x' }], bgColor: '#eee' });
    assertDeepEqual(out.chart.refLines, [line]);
    assertEqual(out.chart.bgColor, '#eee');
    assertEqual(out.refLines, undefined);
    assertEqual(out.bgColor, undefined);
  });
  test('seriesOverrides → legacySeries, unbekannte Schlüssel entfallen, Index bleibt', () => {
    const connectLine = { show: true, dash: 'dot', width: 3, color: 'blue' };
    const out = from0({ seriesOverrides: [{ name: 'N', connectLine, foo: 1 }, {}] });
    assertDeepEqual(out.legacySeries, [{ name: 'N', connectLine }, {}]);
    assertEqual(out.seriesOverrides, undefined);
  });
  test('leerer Name (vom Altmodul ignoriert) entfällt', () => {
    assertDeepEqual(legacySeriesFrom([{ name: '', color: 'red' }, { name: 'B' }]), [{ color: 'red' }, { name: 'B' }]);
    assertDeepEqual(legacySeriesFrom([{ name: '' }]), []);
  });
  test('leere Farbe, Randfarbe und Symbol (vom Altmodul ignoriert) entfallen', () => {
    assertDeepEqual(legacySeriesFrom([{ color: '', stroke: '', symbol: '', strokeWidth: 0 }]), [{ strokeWidth: 0 }]);
  });
  test('connectLine mit fremden Schlüsseln behält die gültigen', () => {
    assertDeepEqual(legacySeriesFrom([{ connectLine: { show: true, width: 'breit', dash: 'dash', foreground: true } }]), [{ connectLine: { show: true, dash: 'dash' } }]);
    assertDeepEqual(legacySeriesFrom([{ connectLine: { width: 2 } }]), [{ connectLine: { show: false, width: 2 } }]);
  });
  test('Ansichtsfelder wie im alten fromJSON', () => {
    assertEqual(from0({ confLevel: 150 }).confLevel, 150);
    assertEqual(from0({ confLevel: 'x' }).confLevel, undefined);
    assertEqual(loadModel(State, { confLevel: 'x' }).confLevel, 95);
    assertEqual(from0({ showLines: 'ja' }).showLines, false);
    assertEqual(from0({ showLines: true }).showLines, true);
    assertEqual(from0({ showMarkers: 'nein' }).showMarkers, true);
    assertEqual(from0({ showMarkers: false }).showMarkers, false);
    assertEqual(from0({ showStats: false }).showStats, false);
    assertEqual(from0({ showStats: 0 }).showStats, false);
    assertEqual(from0({ showStats: null }).showStats, true);
    assertEqual(from0({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
  });
  test('gespeicherter Altstand lädt ohne Reparaturwarnung', () => {
    const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
    try {
      const m = loadModel(State, {
        datasets: [{ xRef: ref('a'), yRef: ref('b'), groupRef: null, sizeRef: null }],
        showLines: true, showMarkers: true, seriesOverrides: [{ name: 'N', connectLine: { show: true, color: 'red', dash: 'solid', width: 2 } }],
        refLines: [{ dir: 'v', value: 1 }], refAreas: [], bgColor: null, showStats: true, confLevel: 90, exampleWorksheetId: null,
      });
      assertDeepEqual(seen, []);
      assertEqual(m.showLines, true);
      assertEqual(m.confLevel, 90);
      assertDeepEqual(m.legacySeries, [{ name: 'N', connectLine: { show: true, color: 'red', dash: 'solid', width: 2 } }]);
      assertDeepEqual(m.chart.refLines, [{ dir: 'v', value: 1 }]);
    } finally { console.warn = warn; }
  });
});

suite('xy-plot: Migration der Fehlerbalken (1.9.x → 1.1)', () => {
  // Stand der Altform 1.9.x (ohne _schema), wie ihn xy-plot-model.js geschrieben hat.
  const STATE_19 = {
    datasets: [
      { xRef: ref('x'), yRef: ref('y'), groupRef: null, sizeRef: null,
        errorBars: { mode: 'constant', xPlus: null, xMinus: 0.5, yPlus: 2, yMinus: -1 } },
      { xRef: ref('x'), yRef: ref('y'), groupRef: null, sizeRef: null,
        errorBars: { mode: 'columns', xPlus: null, xMinus: null, yPlus: ref('e'), yMinus: { instanceId: '', sheetId: 's', columnId: 'f' } } },
      { xRef: ref('x'), yRef: ref('y'), groupRef: null, sizeRef: null },
      { xRef: ref('x'), yRef: ref('y'), groupRef: null, sizeRef: null, errorBars: { mode: 'band', yPlus: 1 } },
      { xRef: ref('x'), yRef: ref('y'), groupRef: null, sizeRef: null,
        errorBars: { mode: 'constant', xPlus: NaN, xMinus: '3', yPlus: ref('e'), yMinus: Infinity } },
    ],
    showLines: false, showMarkers: true, showStats: true, confLevel: 95,
  };

  test('1.9.x-Stand: verschachtelte Form, Unpassendes fehlt, negativer Betrag bleibt', () => {
    const m = loadModel(State, STATE_19);
    assertDeepEqual(m.datasets.map((d) => d.errorBars), [
      { mode: 'constant', constant: { xMinus: 0.5, yPlus: 2, yMinus: -1 } },
      { mode: 'columns', columns: { yPlus: ref('e') } },
      NONE,
      NONE,
      { mode: 'constant', constant: {} },
    ]);
  });

  test('errorBarsFrom: none und Unbekanntes', () => {
    assertDeepEqual(errorBarsFrom(null), NONE);
    assertDeepEqual(errorBarsFrom({ mode: 'none', yPlus: 3 }), NONE);
    assertDeepEqual(errorBarsFrom({ mode: 'columns', yPlus: 3 }), { mode: 'columns', columns: {} });
  });

  test("'1.0→1.1' setzt none in jede Zeile", () => {
    assertDeepEqual(from10({ datasets: [{ x: null, y: null, group: null, size: null }] }).datasets[0].errorBars, NONE);
    const m = loadModel(State, { _schema: { name: 'xy-plot', version: '1.0' }, datasets: [{ x: ref('a'), y: ref('b'), group: null, size: null }] });
    assertDeepEqual(m.datasets, [{ x: ref('a'), y: ref('b'), group: null, size: null, errorBars: NONE }]);
  });
});

suite('xy-plot: Beispiel mit Fehlerbalken (Altform aus origin)', () => {
  // Byte-Fixture: das Beispielprojekt, wie es origin (1.9.x, Altform) ausliefert.
  const load = async (path) => (await fetch(new URL(path, import.meta.url))).json();

  test('xy-plot-hubschrauber-fehlerbalken (origin 1.9) lädt über 0→1.1 mit Spalten-Fehlerbalken', async () => {
    const m = loadModel(State, await load('./fixtures/xy-plot-hubschrauber-fehlerbalken-1.9.json'));
    const sd = { instanceId: '__source__', sheetId: 'sheet-hubschrauber-mittelwerte', columnId: 'c-stdabw' };
    assertEqual(m.datasets.length, 1);
    assertDeepEqual(m.datasets[0].errorBars, { mode: 'columns', columns: { yPlus: sd, yMinus: sd } });
    assertEqual(m.datasets[0].group.columnId, 'c-rotorlaenge');
    assertEqual(m.showLines, true);
  });

  test('das ausgelieferte Beispiel in der neuen Form ergibt denselben Stand', async () => {
    const old = loadModel(State, await load('./fixtures/xy-plot-hubschrauber-fehlerbalken-1.9.json')).toJSON();
    const now = loadModel(State, await load('../../../js/modules/xy-plot/resources/examples/projects/xy-plot-hubschrauber-fehlerbalken.json')).toJSON();
    assertDeepEqual(now.datasets, old.datasets);
    assertEqual(now.showLines, old.showLines);
    assertEqual(now.showStats, old.showStats);
  });
});
