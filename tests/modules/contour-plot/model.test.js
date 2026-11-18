import { suite, test, assert, assertEqual, assertDeepEqual, assertClose } from '../../test-utils.js';
import { State, MODEL_TYPES } from '../../../js/modules/contour-plot/domain/model.js';
import { setFields } from '../../../js/core/model.js';
import { from0 } from '../../../js/modules/contour-plot/domain/migrations.js';
import { scanSurface, evalModel, sampleSurface } from '../../../js/modules/contour-plot/domain/surface.js';
import { storedSource } from '../../helpers/stored-source.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import contourChart from '../../../js/widgets/contour-chart/schema.js';
import { COLOR_SCHEMES } from '../../../js/core/chart/color-schemes.js';

const DEFAULT_B = [50, 8, 5, -3, -2, 1.5];
const DEFAULT_FORMULA = '50 + 8*x + 5*y - 3*x*x - 2*y*y + 1.5*x*y';

/** Die alten Vorgaben von `chartConfig`. */
const OLD_CHART_CONFIG = {
  showTitle: true, title: '',
  titleSize: 15, labelSize: 13, tickSize: 11,
  showXLabel: true, showYLabel: true,
  showXTicks: true, showYTicks: true,
  bgColor: '',
  markerSymbol: 'circle', markerSize: 10, markerColor: '',
  markerStroke: 'rgba(255,255,255,1)', markerStrokeWidth: 2, markerStrokeDash: 'solid',
};

const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });

/** @param {() => void} fn @returns {any} der geworfene Fehler */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

suite('contour-plot Model — Vorgaben', () => {
  test('Vorgaben wie die alte Form, chartEdits leer, hasContent immer wahr', () => {
    const m = new State();
    assertEqual(m.modelType, 'quadratic');
    assertDeepEqual(m.b, DEFAULT_B);
    assertEqual(m.customFormula, DEFAULT_FORMULA);
    assertEqual(m.xMin, -3); assertEqual(m.xMax, 3);
    assertEqual(m.yMin, -3); assertEqual(m.yMax, 3);
    assertEqual(m.xLabel, ''); assertEqual(m.yLabel, ''); assertEqual(m.zLabel, '');
    assertDeepEqual(m.datasets, [{ x: null, y: null, z: null }]);
    assertDeepEqual(m.chartEdits, {});
    assertEqual(m.exampleWorksheetId, null);
    assertEqual(m.hasContent(), true);
  });

  test('die Modellformen im Schema sind MODEL_TYPES', () => {
    assertDeepEqual([...State.schema.fields.modelType.values], [...MODEL_TYPES]);
  });
});

suite('contour-plot Model — Invarianten', () => {
  test('xMin über xMax wird mit axisOrder abgewiesen, Wert bleibt', () => {
    const m = new State();
    const err = thrown(() => { m.xMin = 5; });
    assertEqual(err?.invariant, 'axisOrder');
    assertEqual(m.xMin, -3);
    assertEqual(m.xMax, 3);
  });

  test('yMax unter yMin wird mit axisOrder abgewiesen, Wert bleibt', () => {
    const m = new State();
    const err = thrown(() => { m.yMax = -4; });
    assertEqual(err?.invariant, 'axisOrder');
    assertEqual(m.yMax, 3);
    assertEqual(m.yMin, -3);
  });

  test('xMin = xMax wird abgewiesen', () => {
    const m = new State();
    assertEqual(thrown(() => { m.xMin = 3; })?.invariant, 'axisOrder');
  });

  test('b mit zwei Einträgen wird mit coefficientCount abgewiesen', () => {
    const m = new State();
    const err = thrown(() => { m.b = [1, 2]; });
    assertEqual(err?.invariant, 'coefficientCount');
    assertDeepEqual(m.b, DEFAULT_B);
  });

  test('sechs Koeffizienten werden angenommen', () => {
    const m = new State();
    m.b = [1, 2, 3, 4, 5, 6];
    assertDeepEqual(m.b, [1, 2, 3, 4, 5, 6]);
  });

  test('setFields: xMin und xMax zusammen verschoben, in einem Aufruf angenommen', () => {
    const m = new State();
    const out = setFields(m, { xMin: 150, xMax: 210 });
    assertDeepEqual(out, { xMin: 150, xMax: 210 });
    assertEqual(m.xMin, 150);
    assertEqual(m.xMax, 210);
  });

  test('setFields: abgewiesener Aufruf schreibt nichts, auch kein anderes Feld', () => {
    const m = new State();
    const err = thrown(() => setFields(m, { xMin: 1, xMax: 0.5, zLabel: 'Q' }));
    assertEqual(err?.invariant, 'axisOrder');
    assert(/^invalid xMin 1; allowed: a value that keeps axisOrder$/.test(err.message), err?.message);
    assertEqual(m.xMin, -3);
    assertEqual(m.xMax, 3);
    assertEqual(m.zLabel, '');
  });
});

suite('contour-plot Migration', () => {
  test('Beispiel contour-rsm-yield: Modell, b, Beschriftung, keine Diagrammeinstellungen', async () => {
    const res = await fetch(new URL('../../../js/modules/contour-plot/resources/examples/projects/contour-rsm-yield.json', import.meta.url));
    const old = await res.json();
    const m = State.fromJSON(old);
    assertEqual(m.modelType, 'quadratic');
    assertDeepEqual(m.b, old.b);
    assertEqual(m.xLabel, 'Temperatur');
    assertEqual(m.xMin, 150); assertEqual(m.xMax, 210);
    assertEqual(m.yMin, 1); assertEqual(m.yMax, 5);
    assertDeepEqual(m.chartEdits, {});
  });

  test('nur Abweichungen von den alten Vorgaben landen in chartEdits', () => {
    const refLines = [{ dir: 'h', value: 1 }];
    const m = State.fromJSON({
      model: 'custom', customFormula: 'x*y', numLevels: 12, colorScheme: 'plasma', showLabels: false,
      chartConfig: { ...OLD_CHART_CONFIG, titleSize: 18, bgColor: '' }, refLines,
    });
    assertEqual(m.modelType, 'custom');
    assertEqual(m.customFormula, 'x*y');
    assertDeepEqual(m.chartEdits, { numLevels: 12, colorScheme: 'plasma', showLabels: false, titleSize: 18, refLines });
  });

  test('Randwerte: gridRes 1 → 40, numLevels 50 → 20, b auf sechs aufgefüllt, Vorgaben entfallen', () => {
    const m = State.fromJSON({ gridRes: 1, numLevels: 50, b: [1, 2], chartConfig: { ...OLD_CHART_CONFIG } });
    assertDeepEqual(m.b, [1, 2, 0, 0, 0, 0]);
    assertDeepEqual(m.chartEdits, { gridRes: 40, numLevels: 20 });
  });

  test('gridRes 137 → 140; mehr als sechs Koeffizienten werden gekürzt', () => {
    const out = from0({ gridRes: 137, b: [1, 2, 3, 4, 5, 6, 7] });
    assertEqual(out.chartEdits.gridRes, 140);
    assertDeepEqual(out.b, [1, 2, 3, 4, 5, 6]);
    assertEqual(State.fromJSON({ gridRes: 137 }).chartEdits.gridRes, 140);
  });

  test('Vorgabe-Werte bei Raster und Stufen entfallen', () => {
    assertDeepEqual(from0({ gridRes: 100, numLevels: 10, colorScheme: 'viridis', showLines: true, showLabels: true, showDataPoints: false }).chartEdits, {});
  });

  test('colRefX/Y/Z → datasets[0]', () => {
    const m = State.fromJSON({ colRefX: ref('a'), colRefY: ref('b'), colRefZ: ref('c') });
    assertDeepEqual(m.datasets, [{ x: ref('a'), y: ref('b'), z: ref('c') }]);
  });

  test('alle Spaltenbezüge null → eine leere Zeile', () => {
    const m = State.fromJSON({ colRefX: null, colRefY: null, colRefZ: null });
    assertDeepEqual(m.datasets, [{ x: null, y: null, z: null }]);
  });

  test('chartConfig.xLabelText und yLabelText fallen weg', () => {
    const out = from0({ chartConfig: { ...OLD_CHART_CONFIG, xLabelText: 'X-Achse', yLabelText: 'Y-Achse', title: 'Titel' } });
    assertDeepEqual(out.chartEdits, { title: 'Titel' });
  });

  test('ungültige Diagrammwerte entfallen einzeln', () => {
    const out = from0({ chartConfig: { ...OLD_CHART_CONFIG, titleSize: 'groß', markerStrokeDash: 'wellig', labelSize: 20 } });
    assertDeepEqual(out.chartEdits, { labelSize: 20 });
  });

  test('gespeicherter Stand mit xMin ≥ xMax lädt mit Reparatur ohne Wurf', () => {
    const reports = [];
    const m = State.fromJSON({ xMin: 5, xMax: 1, yMin: 0, yMax: 2 }, { repair: true, onRepair: (n) => reports.push(n) });
    assertDeepEqual([m.xMin, m.xMax, m.yMin, m.yMax], [-3, 3, -3, 3]);
    assert(reports.length > 0, 'onRepair gemeldet');
  });

  test('Migration liefert ein einfaches Objekt ohne Altschlüssel', () => {
    const out = from0({ model: 'interaction', colRefX: ref('a'), chartConfig: {}, refLines: [], refAreas: [] });
    assertEqual(out.modelType, 'interaction');
    for (const k of ['model', 'colRefX', 'colRefY', 'colRefZ', 'chartConfig', 'refLines', 'refAreas', 'numLevels', 'gridRes']) {
      assertEqual(k in out, false, k);
    }
  });
});

suite('contour-plot Model — Ableitungen', () => {
  test('activeParams: quadratic mit b, custom mit customFormula', () => {
    const m = new State();
    const q = evaluateDerived(m, null, ['activeParams']).activeParams;
    assert(q.includes('b'), 'b');
    assert(!q.includes('customFormula'), 'customFormula');
    m.modelType = 'custom';
    const c = evaluateDerived(m, null, ['activeParams']).activeParams;
    assert(c.includes('customFormula'), 'customFormula');
    assert(!c.includes('b'), 'b');
    assertDeepEqual(c, ['modelType', 'customFormula', 'xLabel', 'yLabel', 'zLabel', 'xMin', 'xMax', 'yMin', 'yMax', 'datasets']);
  });

  test('formulaError: unbekannte Funktion bei custom, null bei quadratic', () => {
    const m = new State();
    m.customFormula = 'foo(x)';
    assertEqual(evaluateDerived(m, null, ['formulaError']).formulaError, null);
    m.modelType = 'custom';
    assertDeepEqual(evaluateDerived(m, null, ['formulaError']).formulaError, { code: 'UNKNOWN_FUNCTION', token: 'foo' });
  });

  test('surface mit Vorgaben = scanSurface bei 100', () => {
    const m = new State();
    const s = evaluateDerived(m, null, ['surface']).surface;
    const want = scanSurface((x, y) => evalModel(m, x, y), { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, 100);
    assertClose(s.zMax, want.zMax, 1e-12);
    assertClose(s.zMin, want.zMin, 1e-12);
    assertDeepEqual(s.optimum, want.optimum);
    assertClose(s.range, want.zMax - want.zMin, 1e-12);
    assertDeepEqual(Object.keys(s).sort(), ['optimum', 'range', 'zMax', 'zMin']);
  });

  test('surface folgt chartEdits.gridRes', () => {
    const m = new State();
    m.chartEdits = { gridRes: 40 };
    const s = evaluateDerived(m, null, ['surface']).surface;
    const want = scanSurface((x, y) => evalModel(m, x, y), { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, 40);
    assertDeepEqual(s, { zMin: want.zMin, zMax: want.zMax, range: want.zMax - want.zMin, optimum: want.optimum });
  });

  test('surface ist null bei Formelfehler', () => {
    const m = new State();
    m.modelType = 'custom';
    m.customFormula = 'foo(x)';
    assertEqual(evaluateDerived(m, null, ['surface']).surface, null);
  });

  test('sampleSurface tastet auch bei Formelfehler ab (Fläche 0), in der Auflösung der Einstellungen', () => {
    const m = new State();
    m.modelType = 'custom';
    m.customFormula = 'foo(x)';
    m.chartEdits = { gridRes: 40 };
    const g = sampleSurface(m);
    assertEqual(g.grid.length, 40);
    assertEqual(g.zMin, 0);
    assertEqual(g.zMax, 0);
  });

  test('evalModel: interaction rechnet wie quadratic, custom über die Formel', () => {
    const b = [1, 2, 3, 4, 5, 6];
    const poly = 1 + 2 * 2 + 3 * 3 + 4 * 4 + 5 * 9 + 6 * 6;
    assertEqual(evalModel({ modelType: 'quadratic', b, customFormula: '' }, 2, 3), poly);
    assertEqual(evalModel({ modelType: 'interaction', b, customFormula: '' }, 2, 3), poly);
    assertEqual(evalModel({ modelType: 'custom', b, customFormula: 'x*y' }, 2, 3), 6);
    assertEqual(evalModel({ modelType: 'custom', b, customFormula: 'foo(x)' }, 2, 3), 0);
  });

  test('dataPoints: nur Zeilen mit drei endlichen Zahlen', () => {
    const cols = { a: [1, 2, null, 4, 5], b: [10, 'x', 30, 40, NaN], c: [100, 200, 300, Infinity] };
    const data = storedSource({ ws1: { sheets: [{ id: 's1', name: 'S', state: {
      rowCount: 5, columns: Object.entries(cols).map(([id, values]) => ({ id, name: id, values })),
    } }] } });
    const m = new State();
    assertDeepEqual(evaluateDerived(m, data, ['dataPoints']).dataPoints, []);
    m.datasets = [{ x: ref('a'), y: ref('b'), z: ref('c') }];
    assertDeepEqual(evaluateDerived(m, data, ['dataPoints']).dataPoints, [{ x: 1, y: 10, z: 100 }]);
  });

  test('dataPoints liest nur über src.read', () => {
    const cols = { a: [1, 2], b: [10, 20], c: [100, 200] };
    const base = storedSource({ ws1: { sheets: [{ id: 's1', name: 'S', state: {
      rowCount: 2, columns: Object.entries(cols).map(([id, values]) => ({ id, name: id, values })),
    } }] } });
    const spy = new Proxy({}, { get(_t, k) {
      if (k === 'read') return (...a) => base.read(...a);
      if (k === 'list') return () => base.list();
      throw new Error(`derived greift auf src.${String(k)} zu`);
    } });
    const m = new State();
    m.datasets = [{ x: ref('a'), y: ref('b'), z: ref('c') }];
    assertDeepEqual(evaluateDerived(m, spy, ['dataPoints']).dataPoints, [{ x: 1, y: 10, z: 100 }, { x: 2, y: 20, z: 200 }]);
  });

  test('dataPoints steht in derivedBulk', () => {
    assertDeepEqual(State.schema.derivedBulk, ['dataPoints']);
  });
});

suite('contour-plot — Farbschemata', () => {
  test('colorScheme im Widget = COLOR_SCHEMES', () => {
    const values = /** @type {any} */ (contourChart.edits()).shape.colorScheme.values;
    assertDeepEqual([...values], Object.keys(COLOR_SCHEMES));
  });
});
