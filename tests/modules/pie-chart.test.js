/**
 * D.Mike — Pie Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults (incl. chartConfig defaults), toJSON/fromJSON
 *     round-trip (incl. chartConfig), null/undefined robustness, ref + config
 *     sanitization, hasContent() (requires value column).
 *   - Pie slice computation (`buildSlices`, moved out of the legacy
 *     `_buildSlicesFromWorksheet`):
 *       · value only          → frequency count per distinct value (first-seen order)
 *       · value + label       → sum of value per label (parseFloat, neg/NaN dropped)
 *       · blank/empty value rows dropped
 *       · PALETTE color assignment per slice
 *     asserted against hand-computed reference values.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State, PALETTE } from '../../js/modules/pie-chart/pie-chart-model.js';

const REF_VALUE = { instanceId: 'i1', sheetId: 's1', columnId: 'cv' };
const REF_LABEL = { instanceId: 'i1', sheetId: 's1', columnId: 'cl' };

/** Build a getValues(ref) accessor over the fixture columns. */
function makeGetValues(map) {
  return (ref) => {
    if (!ref) return null;
    if (ref.columnId === 'cv') return map.value;
    if (ref.columnId === 'cl') return map.label;
    return null;
  };
}

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('Pie Chart Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.valueRef, null);
    assertEqual(s.labelRef, null);
    assertEqual(s.exampleWorksheetId, null);
    assertEqual(s.chartConfig.showTitle, true);
    assertEqual(s.chartConfig.title, '');
    assertEqual(s.chartConfig.titleSize, 15);
    assertEqual(s.chartConfig.showLegend, true);
    assertEqual(s.chartConfig.showLabels, true);
    assertEqual(s.chartConfig.labelMode, 'both');
    assertEqual(s.chartConfig.labelSize, 11);
    assertEqual(s.chartConfig.innerRadius, 0);
    assertEqual(s.chartConfig.padAngle, 0.8);
    assertEqual(s.chartConfig.startAngle, -90);
    assertEqual(s.chartConfig.explodeDistance, 12);
    assertEqual(s.chartConfig.strokeColor, 'rgba(255,255,255,1)');
    assertEqual(s.chartConfig.strokeWidth, 2);
    assertEqual(s.chartConfig.sortSlices, 'none');
    assertEqual(s.chartConfig.centerLabel, '');
    assertEqual(s.chartConfig.centerSub, '');
    assertEqual(s.chartConfig.bgColor, null);
  });

  test('hasContent is false by default', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent requires value ref only', () => {
    const sv = new State();
    sv.valueRef = { ...REF_VALUE };
    assertEqual(sv.hasContent(), true);

    const sl = new State();
    sl.labelRef = { ...REF_LABEL };
    assertEqual(sl.hasContent(), false);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — serialization
// ─────────────────────────────────────────────────────────────

suite('Pie Chart Model — serialization', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.valueRef = { ...REF_VALUE };
    s.labelRef = { ...REF_LABEL };
    s.chartConfig.showLegend = false;
    s.chartConfig.sortSlices = 'desc';
    s.exampleWorksheetId = 'ws-9';
    const j = s.toJSON();
    assertEqual(JSON.stringify(j.valueRef), JSON.stringify(REF_VALUE));
    assertEqual(JSON.stringify(j.labelRef), JSON.stringify(REF_LABEL));
    assertEqual(j.chartConfig.showLegend, false);
    assertEqual(j.chartConfig.sortSlices, 'desc');
    assertEqual(j.exampleWorksheetId, 'ws-9');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.valueRef, null);
    assertEqual(s.labelRef, null);
    assertEqual(s.chartConfig.showLabels, true);
    assertEqual(s.chartConfig.labelMode, 'both');
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.valueRef, null);
    assertEqual(s.chartConfig.padAngle, 0.8);
  });

  test('fromJSON restores data (legacy shape, incl. redundant slices)', () => {
    const s = State.fromJSON({
      labelRef: { ...REF_LABEL },
      valueRef: { ...REF_VALUE },
      slices: [{ name: 'A', value: 3, color: 'x' }],
      chartConfig: { title: 'T', showLegend: false, innerRadius: 0.5, bgColor: '#fff' },
    });
    assertEqual(s.valueRef.columnId, 'cv');
    assertEqual(s.labelRef.columnId, 'cl');
    assertEqual(s.chartConfig.title, 'T');
    assertEqual(s.chartConfig.showLegend, false);
    assertEqual(s.chartConfig.innerRadius, 0.5);
    assertEqual(s.chartConfig.bgColor, '#fff');
    // unspecified chartConfig fields fall back to defaults
    assertEqual(s.chartConfig.showTitle, true);
    assertEqual(s.chartConfig.labelSize, 11);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.valueRef = { ...REF_VALUE };
    s.labelRef = { ...REF_LABEL };
    s.chartConfig.title = 'Hello';
    s.chartConfig.sortSlices = 'asc';
    s.chartConfig.labelMode = 'percent';
    s.exampleWorksheetId = 'ws-7';
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON ignores malformed refs', () => {
    assertEqual(State.fromJSON({ valueRef: 'nope' }).valueRef, null);
    assertEqual(State.fromJSON({ labelRef: 5 }).labelRef, null);
    assertEqual(JSON.stringify(State.fromJSON({ valueRef: {} }).valueRef), JSON.stringify({}));
  });

  test('fromJSON ignores malformed chartConfig', () => {
    const s = State.fromJSON({ chartConfig: 'nope' });
    assertEqual(s.chartConfig.labelMode, 'both');
    assertEqual(s.chartConfig.showLegend, true);
  });

  test('fromJSON ignores non-string exampleWorksheetId', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — value only (frequency count)
// ─────────────────────────────────────────────────────────────

suite('Pie Chart Model — buildSlices (value only / frequency)', () => {
  const DATA_V = [10, 20, 10, 30, 20];

  test('counts distinct values in first-seen order', () => {
    const s = new State();
    s.valueRef = { ...REF_VALUE };
    const slices = s.buildSlices(makeGetValues({ value: DATA_V }));
    assertEqual(slices.map((x) => x.name).join(','), '10,20,30');
    // 10=2, 20=2, 30=1
    assertEqual(JSON.stringify(slices.map((x) => x.value)), JSON.stringify([2, 2, 1]));
    assertEqual(slices[0].color, PALETTE[0]);
    assertEqual(slices[1].color, PALETTE[1]);
    assertEqual(slices[2].color, PALETTE[2]);
  });

  test('skips null and empty value cells', () => {
    const s = new State();
    s.valueRef = { ...REF_VALUE };
    const slices = s.buildSlices(makeGetValues({ value: ['A', '', null, 'B', 'A'] }));
    assertEqual(slices.map((x) => x.name).join(','), 'A,B');
    assertEqual(JSON.stringify(slices.map((x) => x.value)), JSON.stringify([2, 1]));
  });

  test('returns empty when no value ref', () => {
    const s = new State();
    assertEqual(s.buildSlices(makeGetValues({ value: DATA_V })).length, 0);
  });

  test('returns empty when value column empty', () => {
    const s = new State();
    s.valueRef = { ...REF_VALUE };
    assertEqual(s.buildSlices(makeGetValues({ value: [] })).length, 0);
    assertEqual(s.buildSlices(() => null).length, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — value + label (sum per label)
// ─────────────────────────────────────────────────────────────

suite('Pie Chart Model — buildSlices (value + label / sum)', () => {
  const DATA_V = [10, 20, 10, 30, 20];
  const DATA_L = ['A', 'B', 'A', 'B', 'C'];

  test('sums value per label in first-seen order', () => {
    const s = new State();
    s.valueRef = { ...REF_VALUE };
    s.labelRef = { ...REF_LABEL };
    const slices = s.buildSlices(makeGetValues({ value: DATA_V, label: DATA_L }));
    // A: 10+10=20, B: 20+30=50, C: 20
    assertEqual(slices.map((x) => x.name).join(','), 'A,B,C');
    assertEqual(JSON.stringify(slices.map((x) => x.value)), JSON.stringify([20, 50, 20]));
    assertEqual(slices[0].color, PALETTE[0]);
  });

  test('drops NaN and negative values', () => {
    const s = new State();
    s.valueRef = { ...REF_VALUE };
    s.labelRef = { ...REF_LABEL };
    const slices = s.buildSlices(
      makeGetValues({ value: [10, 'x', -5, 20], label: ['A', 'A', 'A', 'B'] }),
    );
    // A: 10 (x → NaN dropped, -5 dropped); B: 20
    assertEqual(slices.map((x) => x.name).join(','), 'A,B');
    assertEqual(JSON.stringify(slices.map((x) => x.value)), JSON.stringify([10, 20]));
  });

  test('falls back to row index name when label missing', () => {
    const s = new State();
    s.valueRef = { ...REF_VALUE };
    s.labelRef = { ...REF_LABEL };
    // label shorter than value → indices 3,4 (1-based) used as names
    const slices = s.buildSlices(
      makeGetValues({ value: [10, 20, 30], label: ['A'] }),
    );
    // i=0 → 'A'=10 ; i=1 → '2'=20 ; i=2 → '3'=30
    assertEqual(slices.map((x) => x.name).join(','), 'A,2,3');
    assertEqual(JSON.stringify(slices.map((x) => x.value)), JSON.stringify([10, 20, 30]));
  });
});
