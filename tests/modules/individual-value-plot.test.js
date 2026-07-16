/**
 * D.Mike — Individual Value Plot Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults, toJSON/fromJSON round-trip, robustness,
 *     sanitization, hasContent().
 *   - groupRefs normalization (legacy single-ref / array forms → length-3 arrays).
 *   - buildGroups() grouping algorithm: ungrouped (one column per series),
 *     single grouping column (buckets per unique value, insertion order),
 *     multi-column grouping (tuple keys), numeric filtering, tie/null dropping,
 *     and error conditions (no series / too few values / no data).
 */

import { suite, test, assertEqual, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/individual-value-plot/individual-value-plot-model.js';

const REF = (id) => ({ instanceId: id, sheetId: 's1', columnId: id });

// Message strings used by buildGroups (injected — model carries no i18n).
const MSGS = {
  errNoSeries: 'no-series',
  errNoData: 'no-data',
  errTooFew: (col) => `too-few:${col}`,
};

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('IVP Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(JSON.stringify(s.seriesRefs), '[]');
    assertEqual(JSON.stringify(s.groupRefs), '[]');
    assertEqual(s.showMean, true);
    assertEqual(s.showMedian, false);
    assertEqual(s.connectMeans, false);
    assertEqual(s.showOverallMean, false);
    assertEqual(s.jitter, 0.6);
    assertEqual(s.showStats, true);
    assertEqual(s.confLevel, null);
    assertEqual(JSON.stringify(s.refLines), '[]');
    assertEqual(JSON.stringify(s.refAreas), '[]');
    assertEqual(s.bgColor, null);
    assertEqual(JSON.stringify(s.pointColors), '[]');
    assertEqual(s.pointSymbol, 'circle');
    assertEqual(s.pointSize, 6);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('hasContent is false by default', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent is true once a series is selected', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    assertEqual(s.hasContent(), true);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — serialization
// ─────────────────────────────────────────────────────────────

suite('IVP Model — serialization', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    s.groupRefs = [[REF('g1'), null, null]];
    s.showMean = false;
    s.jitter = 0.3;
    s.confLevel = 90;
    s.pointSymbol = 'square';
    s.pointSize = 8;
    s.exampleWorksheetId = 'ws-1';
    const j = s.toJSON();
    assertEqual(j.showMean, false);
    assertEqual(j.jitter, 0.3);
    assertEqual(j.confLevel, 90);
    assertEqual(j.pointSymbol, 'square');
    assertEqual(j.pointSize, 8);
    assertEqual(j.exampleWorksheetId, 'ws-1');
    assertEqual(j.seriesRefs[0].instanceId, 'c1');
    assertEqual(j.groupRefs[0][0].instanceId, 'g1');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(JSON.stringify(s.seriesRefs), '[]');
    assertEqual(s.showMean, true);
    assertEqual(s.confLevel, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(JSON.stringify(s.seriesRefs), '[]');
    assertEqual(s.jitter, 0.6);
  });

  test('fromJSON restores data', () => {
    const s = State.fromJSON({
      seriesRefs: [REF('c2')],
      groupRefs: [[REF('g1'), REF('g2'), null]],
      showMean: false,
      showMedian: true,
      jitter: 0.2,
      showStats: false,
      confLevel: 99,
      pointSymbol: 'triangle',
      pointSize: 10,
      exampleWorksheetId: 'ws-7',
    });
    assertEqual(s.seriesRefs[0].instanceId, 'c2');
    assertEqual(s.groupRefs[0][1].instanceId, 'g2');
    assertEqual(s.groupRefs[0][2], null);
    assertEqual(s.showMean, false);
    assertEqual(s.showMedian, true);
    assertEqual(s.jitter, 0.2);
    assertEqual(s.showStats, false);
    assertEqual(s.confLevel, 99);
    assertEqual(s.pointSymbol, 'triangle');
    assertEqual(s.pointSize, 10);
    assertEqual(s.exampleWorksheetId, 'ws-7');
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.seriesRefs = [REF('a'), REF('b')];
    s.groupRefs = [[REF('g'), null, null], [null, null, null]];
    s.showMedian = true;
    s.connectMeans = true;
    s.showOverallMean = true;
    s.jitter = 0.45;
    s.showStats = false;
    s.confLevel = 95;
    s.pointSymbol = 'square';
    s.pointSize = 7;
    s.bgColor = '#fff';
    s.pointColors = ['#111'];
    s.refLines = [{ y: 10 }];
    s.refAreas = [{ from: 1, to: 2 }];
    s.exampleWorksheetId = 'ws-3';
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON normalizes legacy single-ref groupRefs to length-3 arrays', () => {
    // Legacy saved a single ref or null per series.
    const s = State.fromJSON({
      seriesRefs: [REF('c1'), REF('c2')],
      groupRefs: [REF('g1'), null],
    });
    assertEqual(s.groupRefs[0].length, 3);
    assertEqual(s.groupRefs[0][0].instanceId, 'g1');
    assertEqual(s.groupRefs[0][1], null);
    assertEqual(s.groupRefs[0][2], null);
    assertEqual(s.groupRefs[1][0], null);
  });

  test('fromJSON normalizes array groupRefs (pads/truncates to 3)', () => {
    const s = State.fromJSON({
      seriesRefs: [REF('c1')],
      groupRefs: [[REF('g1'), REF('g2')]],
    });
    assertEqual(s.groupRefs[0].length, 3);
    assertEqual(s.groupRefs[0][2], null);
  });

  test('fromJSON sanitizes invalid scalar fields to defaults', () => {
    assertEqual(State.fromJSON({ jitter: 'x' }).jitter, 0.6);
    assertEqual(State.fromJSON({ pointSize: 'x' }).pointSize, 6);
    assertEqual(State.fromJSON({ pointSymbol: 42 }).pointSymbol, 'circle');
    assertEqual(State.fromJSON({ showMean: 'x' }).showMean, true);
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });

  test('fromJSON keeps confLevel null when absent (resolved later from settings)', () => {
    assertEqual(State.fromJSON({}).confLevel, null);
    assertEqual(State.fromJSON({ confLevel: 90 }).confLevel, 90);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — groupRefsAt
// ─────────────────────────────────────────────────────────────

suite('IVP Model — groupRefsAt', () => {
  test('returns length-3 array for missing index', () => {
    const s = new State();
    const a = s.groupRefsAt(0);
    assertEqual(a.length, 3);
    assertEqual(a[0], null);
  });

  test('returns normalized array for stored entry', () => {
    const s = new State();
    s.groupRefs = [[REF('g1'), null, null]];
    const a = s.groupRefsAt(0);
    assertEqual(a[0].instanceId, 'g1');
    assertEqual(a.length, 3);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — buildGroups (the grouping algorithm)
// ─────────────────────────────────────────────────────────────

suite('IVP Model — buildGroups (ungrouped)', () => {
  // getValues/getName are injected — model stays DOM-free.
  const values = { c1: [10, 12, 8, 15, 25], c2: [20, 22, 18, 25, 35] };
  const names = { c1: 'C1 col', c2: 'C2 col' };
  const getValues = (ref) => values[ref.instanceId] || [];
  const getName = (ref) => names[ref.instanceId] || '';

  test('one column per series, no grouping', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    s.groupRefs = [[null, null, null]];
    const g = s.buildGroups(getValues, getName, MSGS);
    assertEqual(g.length, 1);
    assertEqual(g[0].name, 'C1 col');
    assertEqual(JSON.stringify(g[0].values), JSON.stringify([10, 12, 8, 15, 25]));
  });

  test('two series → two groups', () => {
    const s = new State();
    s.seriesRefs = [REF('c1'), REF('c2')];
    s.groupRefs = [[null, null, null], [null, null, null]];
    const g = s.buildGroups(getValues, getName, MSGS);
    assertEqual(g.length, 2);
    assertEqual(g[0].name, 'C1 col');
    assertEqual(g[1].name, 'C2 col');
  });

  test('filters non-numeric / NaN / null values', () => {
    const s = new State();
    s.seriesRefs = [REF('mixed')];
    s.groupRefs = [[null, null, null]];
    const gv = (ref) => (ref.instanceId === 'mixed' ? [1, NaN, 2, null, 'x', 3] : []);
    const gn = () => 'Mixed';
    const g = s.buildGroups(gv, gn, MSGS);
    assertEqual(JSON.stringify(g[0].values), JSON.stringify([1, 2, 3]));
  });

  test('single value is allowed (n=1)', () => {
    const s = new State();
    s.seriesRefs = [REF('c4')];
    s.groupRefs = [[null, null, null]];
    const g = s.buildGroups(() => [5], () => 'C4', MSGS);
    assertEqual(g.length, 1);
    assertEqual(JSON.stringify(g[0].values), JSON.stringify([5]));
  });
});

suite('IVP Model — buildGroups (grouped)', () => {
  test('single grouping column buckets by unique value in insertion order', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    s.groupRefs = [[REF('g'), null, null]];
    const values = { c1: [10, 12, 8, 15, 25], g: ['G1', 'G1', 'G1', 'G2', 'G2'] };
    const g = s.buildGroups((r) => values[r.instanceId], () => 'C1', MSGS);
    assertEqual(g.length, 2);
    assertEqual(g[0].name, 'C1 — G1');
    assertEqual(g[1].name, 'C1 — G2');
    assertEqual(JSON.stringify(g[0].values), JSON.stringify([10, 12, 8]));
    assertEqual(JSON.stringify(g[1].values), JSON.stringify([15, 25]));
  });

  test('rows with null group value are skipped', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    s.groupRefs = [[REF('g'), null, null]];
    const values = { c1: [1, 2, 3, 4], g: ['A', null, 'A', 'B'] };
    const g = s.buildGroups((r) => values[r.instanceId], () => 'C', MSGS);
    assertEqual(g.length, 2);
    assertEqual(JSON.stringify(g[0].values), JSON.stringify([1, 3]));
    assertEqual(JSON.stringify(g[1].values), JSON.stringify([4]));
  });

  test('multi-column grouping uses tuple keys joined by " | "', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    s.groupRefs = [[REF('g1'), REF('g2'), null]];
    const values = {
      c1: [1, 2, 3, 4],
      g1: ['A', 'A', 'B', 'B'],
      g2: ['X', 'Y', 'X', 'X'],
    };
    const g = s.buildGroups((r) => values[r.instanceId], () => 'C', MSGS);
    assertEqual(g.length, 3);
    assertEqual(g[0].name, 'C — A | X');
    assertEqual(g[1].name, 'C — A | Y');
    assertEqual(g[2].name, 'C — B | X');
  });

  test('length is clamped to shortest column', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    s.groupRefs = [[REF('g'), null, null]];
    const values = { c1: [1, 2, 3, 4, 5], g: ['A', 'A'] };
    const g = s.buildGroups((r) => values[r.instanceId], () => 'C', MSGS);
    assertEqual(g.length, 1);
    assertEqual(JSON.stringify(g[0].values), JSON.stringify([1, 2]));
  });
});

suite('IVP Model — buildGroups (errors)', () => {
  test('throws errNoSeries when no series', () => {
    const s = new State();
    assertThrows(() => s.buildGroups(() => [], () => '', MSGS), /no-series/);
  });

  test('throws errTooFew when an ungrouped series has no numeric values', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    s.groupRefs = [[null, null, null]];
    assertThrows(
      () => s.buildGroups(() => ['x', null, NaN], () => 'C1', MSGS),
      /too-few:C1/
    );
  });

  test('throws errNoData when grouping yields no buckets', () => {
    const s = new State();
    s.seriesRefs = [REF('c1')];
    s.groupRefs = [[REF('g'), null, null]];
    const values = { c1: [1, 2], g: [null, null] };
    assertThrows(
      () => s.buildGroups((r) => values[r.instanceId], () => 'C', MSGS),
      /no-data/
    );
  });
});
