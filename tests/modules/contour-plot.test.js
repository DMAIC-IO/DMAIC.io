import { suite, test, assertEqual } from '../test-utils.js';
import { State, DEFAULT_CHART_CONFIG } from '../../js/modules/contour-plot/contour-plot-model.js';

suite('Contour Plot Model — State defaults', () => {
  test('constructor sets default model spec', () => {
    const s = new State();
    assertEqual(s.modelType, 'quadratic');
    assertEqual(s.b.length, 6);
    assertEqual(s.b[0], 50);
    assertEqual(s.b[1], 8);
    assertEqual(s.b[2], 5);
    assertEqual(s.b[3], -3);
    assertEqual(s.b[4], -2);
    assertEqual(s.b[5], 1.5);
    assertEqual(s.customFormula, '50 + 8*x + 5*y - 3*x*x - 2*y*y + 1.5*x*y');
  });

  test('constructor sets default axes', () => {
    const s = new State();
    assertEqual(s.xMin, -3);
    assertEqual(s.xMax, 3);
    assertEqual(s.yMin, -3);
    assertEqual(s.yMax, 3);
  });

  test('constructor sets default display options', () => {
    const s = new State();
    assertEqual(s.numLevels, 10);
    assertEqual(s.gridRes, 100);
    assertEqual(s.colorScheme, 'viridis');
    assertEqual(s.showLines, true);
    assertEqual(s.showLabels, true);
    assertEqual(s.showDataPoints, false);
  });

  test('constructor sets default column refs to null', () => {
    const s = new State();
    assertEqual(s.colRefX, null);
    assertEqual(s.colRefY, null);
    assertEqual(s.colRefZ, null);
  });

  test('constructor sets refLines and refAreas to empty arrays', () => {
    const s = new State();
    assertEqual(Array.isArray(s.refLines), true);
    assertEqual(s.refLines.length, 0);
    assertEqual(Array.isArray(s.refAreas), true);
    assertEqual(s.refAreas.length, 0);
  });

  test('constructor seeds chartConfig from defaults', () => {
    const s = new State();
    assertEqual(s.chartConfig.markerSymbol, 'circle');
    assertEqual(s.chartConfig.markerSize, 10);
    assertEqual(s.chartConfig.showTitle, true);
  });
});

suite('Contour Plot Model — hasContent', () => {
  test('default state reports hasContent true (always has a drawable model)', () => {
    const s = new State();
    assertEqual(s.hasContent(), true);
  });
});

suite('Contour Plot Model — toJSON shape (legacy parity)', () => {
  test('toJSON returns the legacy getState shape', () => {
    const s = new State();
    const j = s.toJSON();
    assertEqual(j.model, 'quadratic');
    assertEqual(Array.isArray(j.b), true);
    assertEqual(j.b.length, 6);
    assertEqual(j.customFormula, '50 + 8*x + 5*y - 3*x*x - 2*y*y + 1.5*x*y');
    assertEqual(j.xMin, -3);
    assertEqual(j.xMax, 3);
    assertEqual(j.yMin, -3);
    assertEqual(j.yMax, 3);
    assertEqual(j.numLevels, 10);
    assertEqual(j.gridRes, 100);
    assertEqual(j.colorScheme, 'viridis');
    assertEqual(j.showLines, true);
    assertEqual(j.showLabels, true);
    assertEqual(j.showDataPoints, false);
    assertEqual(j.colRefX, null);
    assertEqual(j.colRefY, null);
    assertEqual(j.colRefZ, null);
    assertEqual(typeof j.chartConfig, 'object');
    assertEqual(Array.isArray(j.refLines), true);
    assertEqual(Array.isArray(j.refAreas), true);
  });

  test('toJSON uses key "model" (not "modelType") for legacy parity', () => {
    const s = new State();
    s.modelType = 'interaction';
    assertEqual(s.toJSON().model, 'interaction');
  });
});

suite('Contour Plot Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.modelType, 'quadratic');
    assertEqual(s.colorScheme, 'viridis');
    assertEqual(s.numLevels, 10);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.modelType, 'quadratic');
    assertEqual(s.gridRes, 100);
  });

  test('fromJSON({}) returns valid default state', () => {
    const s = State.fromJSON({});
    assertEqual(s.modelType, 'quadratic');
    assertEqual(s.b.length, 6);
  });

  test('fromJSON restores the legacy getState shape (model key)', () => {
    const s = State.fromJSON({
      model: 'custom',
      b: [1, 2, 3, 4, 5, 6],
      customFormula: 'x+y',
      xLabel: 'T', yLabel: 'P', zLabel: 'Yield',
      xMin: 150, xMax: 210, yMin: 1, yMax: 5,
      numLevels: 8, gridRes: 60, colorScheme: 'plasma',
      showLines: false, showLabels: false, showDataPoints: true,
      colRefX: { instanceId: 'i', sheetId: 's', columnId: 'c' },
      colRefY: { instanceId: 'i', sheetId: 's', columnId: 'd' },
      colRefZ: { instanceId: 'i', sheetId: 's', columnId: 'e' },
      chartConfig: { markerSymbol: 'square', markerSize: 14 },
      refLines: [{ dir: 'h', value: 5 }],
      refAreas: [{ dir: 'x', min: 1, max: 2 }],
    });
    assertEqual(s.modelType, 'custom');
    assertEqual(s.b[5], 6);
    assertEqual(s.customFormula, 'x+y');
    assertEqual(s.xLabel, 'T');
    assertEqual(s.yLabel, 'P');
    assertEqual(s.zLabel, 'Yield');
    assertEqual(s.xMin, 150);
    assertEqual(s.yMax, 5);
    assertEqual(s.numLevels, 8);
    assertEqual(s.gridRes, 60);
    assertEqual(s.colorScheme, 'plasma');
    assertEqual(s.showLines, false);
    assertEqual(s.showLabels, false);
    assertEqual(s.showDataPoints, true);
    assertEqual(s.colRefX.columnId, 'c');
    assertEqual(s.colRefZ.columnId, 'e');
    assertEqual(s.chartConfig.markerSymbol, 'square');
    assertEqual(s.chartConfig.markerSize, 14);
    assertEqual(s.refLines.length, 1);
    assertEqual(s.refAreas.length, 1);
  });

  test('fromJSON merges chartConfig over defaults', () => {
    const s = State.fromJSON({ chartConfig: { markerSize: 20 } });
    assertEqual(s.chartConfig.markerSize, 20);
    assertEqual(s.chartConfig.markerSymbol, 'circle'); // default preserved
    assertEqual(s.chartConfig.showTitle, true);        // default preserved
  });

  test('fromJSON sanitizes invalid modelType to quadratic', () => {
    const s = State.fromJSON({ model: 'bogus' });
    assertEqual(s.modelType, 'quadratic');
  });

  test('fromJSON sanitizes invalid colorScheme to viridis', () => {
    const s = State.fromJSON({ colorScheme: 'rainbow-unicorn' });
    assertEqual(s.colorScheme, 'viridis');
  });

  test('fromJSON coerces non-array b to default', () => {
    const s = State.fromJSON({ b: 'nope' });
    assertEqual(s.b.length, 6);
    assertEqual(s.b[0], 50);
  });

  test('fromJSON pads/truncates b to length 6', () => {
    const s = State.fromJSON({ b: [1, 2] });
    assertEqual(s.b.length, 6);
    assertEqual(s.b[0], 1);
    assertEqual(s.b[1], 2);
    assertEqual(s.b[2], 0);
  });

  test('fromJSON coerces non-finite axes to defaults', () => {
    const s = State.fromJSON({ xMin: 'abc', xMax: null, yMin: NaN, yMax: undefined });
    assertEqual(s.xMin, -3);
    assertEqual(s.xMax, 3);
    assertEqual(s.yMin, -3);
    assertEqual(s.yMax, 3);
  });

  test('fromJSON drops malformed colRef', () => {
    const s = State.fromJSON({ colRefX: { instanceId: 'i' } });
    assertEqual(s.colRefX, null);
  });
});

suite('Contour Plot Model — round-trip', () => {
  test('toJSON → fromJSON is lossless', () => {
    const a = State.fromJSON({
      model: 'interaction',
      b: [-638.5, 7.35, 18, -0.02, -1.5, -0.05],
      customFormula: '',
      xLabel: 'Temperatur', yLabel: 'Druck', zLabel: 'Ausbeute',
      xMin: 150, xMax: 210, yMin: 1, yMax: 5,
      numLevels: 12, gridRes: 80, colorScheme: 'thermal',
      showLines: true, showLabels: false, showDataPoints: true,
      colRefX: { instanceId: 'i', sheetId: 's', columnId: 'c' },
      colRefY: null, colRefZ: null,
      chartConfig: { markerSymbol: 'star', markerSize: 12, title: 'X' },
      refLines: [{ dir: 'h', value: 100, label: 'L' }],
      refAreas: [{ dir: 'y', min: 2, max: 4 }],
    });
    const j1 = a.toJSON();
    const j2 = State.fromJSON(j1).toJSON();
    assertEqual(JSON.stringify(j2), JSON.stringify(j1));
  });
});

suite('Contour Plot Model — DEFAULT_CHART_CONFIG export', () => {
  test('exports a default chart config object', () => {
    assertEqual(typeof DEFAULT_CHART_CONFIG, 'object');
    assertEqual(DEFAULT_CHART_CONFIG.markerSymbol, 'circle');
    assertEqual(DEFAULT_CHART_CONFIG.markerStrokeWidth, 2);
  });
});
