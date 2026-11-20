import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/xy-plot/domain/model.js';
import { from0, legacySeriesFrom } from '../../../js/modules/xy-plot/domain/migrations.js';
import { loadModel } from '../../../js/core/initial-model.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const empty = { x: null, y: null, group: null, size: null };

suite('xy-plot: Migration', () => {
  test('v2 datasets → Slots x/y/group/size', () => {
    const out = from0({ datasets: [{ xRef: ref('a'), yRef: ref('b'), groupRef: ref('g'), sizeRef: ref('s') }] });
    assertDeepEqual(out.datasets, [{ x: ref('a'), y: ref('b'), group: ref('g'), size: ref('s') }]);
  });
  test('v1 colRefX + seriesRefs → eine Zeile je Y mit gleichem X', () => {
    const out = from0({ colRefX: ref('x'), seriesRefs: [ref('a'), ref('b')] });
    assertDeepEqual(out.datasets, [
      { x: ref('x'), y: ref('a'), group: null, size: null },
      { x: ref('x'), y: ref('b'), group: null, size: null },
    ]);
  });
  test('Prefill-Form ohne sizeRef und ohne _schema: size null', () => {
    const m = loadModel(State, { datasets: [{ xRef: ref('a'), yRef: ref('b'), groupRef: null }] });
    assertDeepEqual(m.datasets, [{ x: ref('a'), y: ref('b'), group: null, size: null }]);
  });
  test('leere Liste → eine leere Zeile', () => {
    assertDeepEqual(from0({ datasets: [] }).datasets, [empty]);
    assertDeepEqual(from0({ colRefX: ref('x'), seriesRefs: [] }).datasets, [empty]);
    assertDeepEqual(loadModel(State, { datasets: [] }).datasets, [empty]);
  });
  test('kaputter Bezug → null, übrige Felder bleiben', () => {
    const out = from0({ datasets: [{ xRef: { instanceId: 'w', columnId: 'c' }, yRef: ref('b'), groupRef: 'kaputt', sizeRef: { instanceId: '', sheetId: 's', columnId: 'c' } }, null] });
    assertDeepEqual(out.datasets, [{ x: null, y: ref('b'), group: null, size: null }, empty]);
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
