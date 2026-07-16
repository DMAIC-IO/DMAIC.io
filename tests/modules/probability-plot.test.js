/**
 * D.Mike — Probability Plot Model Tests (probability-plot.test.js)
 *
 * TDD spec for the probability-plot-model.js State class.
 * Tests cover constructor defaults, toJSON/fromJSON roundtrip,
 * hasContent(), backward-compat dataset loading, and edge cases.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/probability-plot/probability-plot-model.js';

// ─── State: Defaults ─────────────────────────────────────────────────────────

suite('Probability Plot Model — State defaults', () => {
  test('constructor initializes datasets with one empty entry', () => {
    const s = new State();
    assertEqual(Array.isArray(s.datasets), true);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].valueRef, null);
    assertEqual(s.datasets[0].groupRef, null);
  });

  test('constructor sets seriesOverrides to empty array', () => {
    const s = new State();
    assertEqual(Array.isArray(s.seriesOverrides), true);
    assertEqual(s.seriesOverrides.length, 0);
  });

  test('constructor sets refLines to empty array', () => {
    const s = new State();
    assertEqual(Array.isArray(s.refLines), true);
    assertEqual(s.refLines.length, 0);
  });

  test('constructor sets refAreas to empty array', () => {
    const s = new State();
    assertEqual(Array.isArray(s.refAreas), true);
    assertEqual(s.refAreas.length, 0);
  });

  test('constructor sets bgColor to null', () => {
    const s = new State();
    assertEqual(s.bgColor, null);
  });

  test('constructor sets showStats to true', () => {
    const s = new State();
    assertEqual(s.showStats, true);
  });

  test('constructor sets confLevel to 95', () => {
    const s = new State();
    assertEqual(s.confLevel, 95);
  });

  test('constructor sets exampleWorksheetId to null', () => {
    const s = new State();
    assertEqual(s.exampleWorksheetId, null);
  });

  test('hasContent() returns false for fresh state', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent() returns true when a dataset has a valueRef', () => {
    const s = new State();
    s.datasets[0].valueRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c0' };
    assertEqual(s.hasContent(), true);
  });

  test('hasContent() returns false when all datasets have null valueRef', () => {
    const s = new State();
    s.datasets = [{ valueRef: null, groupRef: null }, { valueRef: null, groupRef: null }];
    assertEqual(s.hasContent(), false);
  });
});

// ─── State: toJSON ────────────────────────────────────────────────────────────

suite('Probability Plot Model — toJSON', () => {
  test('toJSON returns expected shape with defaults', () => {
    const s = new State();
    const j = s.toJSON();
    assertEqual(Array.isArray(j.datasets), true);
    assertEqual(j.datasets.length, 1);
    assertEqual(j.datasets[0].valueRef, null);
    assertEqual(j.datasets[0].groupRef, null);
    assertEqual(Array.isArray(j.seriesOverrides), true);
    assertEqual(Array.isArray(j.refLines), true);
    assertEqual(Array.isArray(j.refAreas), true);
    assertEqual(j.bgColor, null);
    assertEqual(j.showStats, true);
    assertEqual(j.confLevel, 95);
    assertEqual(j.exampleWorksheetId, null);
  });

  test('toJSON serializes datasets with valueRef set', () => {
    const s = new State();
    s.datasets[0].valueRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c0' };
    const j = s.toJSON();
    assertEqual(j.datasets[0].valueRef.instanceId, 'i1');
    assertEqual(j.datasets[0].valueRef.sheetId, 's1');
    assertEqual(j.datasets[0].valueRef.columnId, 'c0');
  });

  test('toJSON serializes multiple datasets', () => {
    const s = new State();
    s.datasets = [
      { valueRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' }, groupRef: null },
      { valueRef: { instanceId: 'i2', sheetId: 's1', columnId: 'c1' }, groupRef: null },
    ];
    const j = s.toJSON();
    assertEqual(j.datasets.length, 2);
    assertEqual(j.datasets[1].valueRef.columnId, 'c1');
  });

  test('toJSON preserves showStats = false', () => {
    const s = new State();
    s.showStats = false;
    assertEqual(s.toJSON().showStats, false);
  });

  test('toJSON preserves confLevel', () => {
    const s = new State();
    s.confLevel = 99;
    assertEqual(s.toJSON().confLevel, 99);
  });

  test('toJSON preserves bgColor', () => {
    const s = new State();
    s.bgColor = '#ff0000';
    assertEqual(s.toJSON().bgColor, '#ff0000');
  });

  test('toJSON preserves exampleWorksheetId', () => {
    const s = new State();
    s.exampleWorksheetId = 'ws-123';
    assertEqual(s.toJSON().exampleWorksheetId, 'ws-123');
  });
});

// ─── State: fromJSON ─────────────────────────────────────────────────────────

suite('Probability Plot Model — fromJSON', () => {
  test('fromJSON(null) returns valid default State', () => {
    const s = State.fromJSON(null);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].valueRef, null);
    assertEqual(s.showStats, true);
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON(undefined) returns valid default State', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.showStats, true);
  });

  test('fromJSON({}) returns valid default State', () => {
    const s = State.fromJSON({});
    assertEqual(s.datasets.length, 1);
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON restores datasets', () => {
    const s = State.fromJSON({
      datasets: [
        { valueRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' }, groupRef: null },
      ],
    });
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].valueRef.instanceId, 'i1');
  });

  test('fromJSON restores multiple datasets', () => {
    const s = State.fromJSON({
      datasets: [
        { valueRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' }, groupRef: null },
        { valueRef: { instanceId: 'i2', sheetId: 's1', columnId: 'c1' }, groupRef: null },
      ],
    });
    assertEqual(s.datasets.length, 2);
    assertEqual(s.datasets[1].valueRef.columnId, 'c1');
  });

  test('fromJSON backward-compat: legacy columnRef → single dataset', () => {
    const s = State.fromJSON({
      columnRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' },
    });
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].valueRef.instanceId, 'i1');
    assertEqual(s.datasets[0].groupRef, null);
  });

  test('fromJSON backward-compat: datasets takes precedence over columnRef', () => {
    const s = State.fromJSON({
      datasets: [{ valueRef: { instanceId: 'i2', sheetId: 's1', columnId: 'c1' }, groupRef: null }],
      columnRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' },
    });
    assertEqual(s.datasets[0].valueRef.instanceId, 'i2');
  });

  test('fromJSON restores showStats = false', () => {
    const s = State.fromJSON({ showStats: false });
    assertEqual(s.showStats, false);
  });

  test('fromJSON restores confLevel', () => {
    const s = State.fromJSON({ confLevel: 99 });
    assertEqual(s.confLevel, 99);
  });

  test('fromJSON defaults invalid confLevel to 95', () => {
    const s = State.fromJSON({ confLevel: 'bad' });
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON restores bgColor', () => {
    const s = State.fromJSON({ bgColor: '#ff0000' });
    assertEqual(s.bgColor, '#ff0000');
  });

  test('fromJSON handles null bgColor', () => {
    const s = State.fromJSON({ bgColor: null });
    assertEqual(s.bgColor, null);
  });

  test('fromJSON restores exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 'ws-abc' });
    assertEqual(s.exampleWorksheetId, 'ws-abc');
  });

  test('fromJSON handles null exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: null });
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON handles non-string exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 42 });
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON restores seriesOverrides', () => {
    const s = State.fromJSON({
      seriesOverrides: [{ name: 'S1', color: '#ff0000' }],
    });
    assertEqual(s.seriesOverrides.length, 1);
    assertEqual(s.seriesOverrides[0].name, 'S1');
  });

  test('fromJSON handles invalid seriesOverrides (non-array)', () => {
    const s = State.fromJSON({ seriesOverrides: 'bad' });
    assertEqual(Array.isArray(s.seriesOverrides), true);
    assertEqual(s.seriesOverrides.length, 0);
  });

  test('fromJSON restores refLines', () => {
    const s = State.fromJSON({
      refLines: [{ dir: 'h', value: 10, label: 'Ref' }],
    });
    assertEqual(s.refLines.length, 1);
    assertEqual(s.refLines[0].value, 10);
  });

  test('fromJSON handles invalid datasets (non-array) → default', () => {
    const s = State.fromJSON({ datasets: 'bad' });
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].valueRef, null);
  });
});

// ─── State: Round-trip ────────────────────────────────────────────────────────

suite('Probability Plot Model — toJSON/fromJSON roundtrip', () => {
  test('roundtrip with default state', () => {
    const s = new State();
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.datasets.length, 1);
    assertEqual(s2.datasets[0].valueRef, null);
    assertEqual(s2.showStats, true);
    assertEqual(s2.confLevel, 95);
    assertEqual(s2.bgColor, null);
    assertEqual(s2.exampleWorksheetId, null);
  });

  test('roundtrip with datasets set', () => {
    const s = new State();
    s.datasets = [
      { valueRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' }, groupRef: null },
    ];
    s.showStats = false;
    s.confLevel = 99;
    s.bgColor = '#aabbcc';
    s.exampleWorksheetId = 'ws-test';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.datasets[0].valueRef.instanceId, 'i1');
    assertEqual(s2.showStats, false);
    assertEqual(s2.confLevel, 99);
    assertEqual(s2.bgColor, '#aabbcc');
    assertEqual(s2.exampleWorksheetId, 'ws-test');
  });

  test('roundtrip with seriesOverrides', () => {
    const s = new State();
    s.seriesOverrides = [{ name: 'Grp1', color: '#11aa33', visible: true }];
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.seriesOverrides.length, 1);
    assertEqual(s2.seriesOverrides[0].name, 'Grp1');
  });

  test('roundtrip preserves refLines', () => {
    const s = new State();
    s.refLines = [{ dir: 'h', value: 42, label: 'Target' }];
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.refLines.length, 1);
    assertEqual(s2.refLines[0].value, 42);
  });
});

// ─── hasContent ──────────────────────────────────────────────────────────────

suite('Probability Plot Model — hasContent', () => {
  test('returns false with fresh state (no valueRef)', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('returns true when first dataset has valueRef', () => {
    const s = State.fromJSON({
      datasets: [{ valueRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' }, groupRef: null }],
    });
    assertEqual(s.hasContent(), true);
  });

  test('returns true when second dataset has valueRef', () => {
    const s = State.fromJSON({
      datasets: [
        { valueRef: null, groupRef: null },
        { valueRef: { instanceId: 'i2', sheetId: 's1', columnId: 'c1' }, groupRef: null },
      ],
    });
    assertEqual(s.hasContent(), true);
  });

  test('returns false after fromJSON with legacy columnRef=null', () => {
    const s = State.fromJSON({ columnRef: null });
    assertEqual(s.hasContent(), false);
  });
});
