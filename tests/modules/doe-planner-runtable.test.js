/**
 * D.Mike — DoE Planner run table (doe-planner-runtable.js)
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E4)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import {
  FACTOR_OFFSET, codedToActualRows, buildRunTable, captureEdits, applyEdits,
  columnNames, resolveColumn, runRows, withEdit, editsDirty,
} from '../../js/modules/doe-planner/doe-planner-runtable.js';
import { stateWith } from './doe-planner-designs/state.js';

const t = (key) => `t:${key}`;

/** A 2×2 design with real values, unrandomised. */
function designed(extra = {}) {
  const s = stateWith({
    factors: [['Temp', ['20', '40']], ['Druck', ['1', '5']]],
    responses: ['Ausbeute'],
    ...extra,
  });
  s.design = {
    designType: 'full',
    codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    actualMatrix: [[20, 1], [40, 1], [20, 5], [40, 5]],
    runOrder: [1, 2, 3, 4],
    stdOrder: [1, 2, 3, 4],
    replicateIds: [1, 1, 1, 1],
  };
  return s;
}

suite('doe-planner runtable — coded to actual', () => {
  test('two-level continuous maps -1/+1 to low/high', () => {
    const s = designed();
    assertDeepEqual(codedToActualRows([[-1, 1], [1, -1]], s.factors), [[20, 5], [40, 1]]);
  });

  test('categorical picks the level label', () => {
    const s = stateWith({ factors: [['Material', ['Stahl', 'Alu', 'Kupfer'], 'categorical'], ['B', ['1', '2']]] });
    assertDeepEqual(codedToActualRows([[0, -1]], s.factors)[0][0], 'Alu');
  });
});

suite('doe-planner runtable — grid columns', () => {
  test('four locked order columns, then factors, then responses', () => {
    const cols = buildRunTable(designed(), t);
    assertDeepEqual(cols.map((c) => c.id), ['__run', '__std', '__blk', '__rep', '__f0', '__f1', '__r0']);
    assertEqual(cols[0].name, 't:colRunOrder');
    assertEqual(cols[0].meta.lock, 'hard');
    assertDeepEqual(cols[FACTOR_OFFSET].values, [20, 40, 20, 40]);
    assertDeepEqual(cols[6].values, [null, null, null, null]);
  });

  test('no design → no columns', () => {
    assertDeepEqual(buildRunTable(stateWith(), t), []);
  });

  test('edits and source seeds show up', () => {
    const s = designed();
    s.design.sourceResponseSeeds = [[7, null, null, null]];
    s.design.sourceRowCount = 1;
    s.previewEdits = { factors: [[25, null, null, null], [null, null, null, null]], responses: [[null, 9, null, null]] };
    const cols = buildRunTable(s, t);
    assertDeepEqual(cols[4].values, [25, 40, 20, 40]);
    assertDeepEqual(cols[6].values, [7, 9, null, null]);
  });
});

suite('doe-planner runtable — edits', () => {
  test('captureEdits reads factor and response columns; dirty only for changed factors', () => {
    const s = designed();
    const cols = buildRunTable(s, t);
    cols[6].values = [1, 2, null, null];
    const same = captureEdits(s, cols);
    assertEqual(same.dirty, false);
    assertDeepEqual(same.edits.responses, [[1, 2, null, null]]);
    cols[4].values = [21, 40, 20, 40];
    assertEqual(captureEdits(s, cols).dirty, true);
    assertEqual(captureEdits(stateWith(), cols), null);
  });

  test('applyEdits writes factor edits into the design and response edits as seeds', () => {
    const s = designed();
    s.previewEdits = { factors: [[25, null, null, null], [null, null, null, null]], responses: [[null, 9, null, null]] };
    applyEdits(s);
    assertDeepEqual(s.design.actualMatrix[0], [25, 1]);
    assertDeepEqual(s.design.sourceResponseSeeds, [[null, 9, null, null]]);
    assertEqual(s.design.sourceRowCount, 4);
  });

  test('withEdit sets one cell and recomputes dirty', () => {
    const s = designed();
    const a = withEdit(s, 1, { kind: 'response', index: 0 }, 12.5);
    assertDeepEqual(a.edits.responses, [[null, 12.5, null, null]]);
    assertEqual(a.dirty, false);
    s.previewEdits = a.edits;
    const b = withEdit(s, 0, { kind: 'factor', index: 0 }, 22);
    assertDeepEqual(b.edits.factors[0], [22, null, null, null]);
    assertDeepEqual(b.edits.responses, [[null, 12.5, null, null]]);
    assertEqual(b.dirty, true);
    assertEqual(editsDirty(s, b.edits), true);
  });
});

suite('doe-planner runtable — rows', () => {
  test('column names: trimmed name, else letter or Y<n>', () => {
    const s = designed();
    s.factors[1].name = '  ';
    s.responses[0].name = '';
    assertDeepEqual(columnNames(s), { factors: ['Temp', 'B'], responses: ['Y1'] });
    assertDeepEqual(resolveColumn(s, 'B'), { kind: 'factor', index: 1 });
    assertDeepEqual(resolveColumn(s, 'Y1'), { kind: 'response', index: 0 });
    assertEqual(resolveColumn(s, 'X'), null);
  });

  test('runRows: one row per run with names as keys', () => {
    const rows = runRows(designed());
    assertEqual(rows.length, 4);
    assertDeepEqual(rows[1], {
      run: 2, std: 2, block: 1, replicate: 1,
      factors: { Temp: 40, Druck: 1 },
      responses: { Ausbeute: null },
    });
  });

  test('runRows: linked response values replace the preview', () => {
    const rows = runRows(designed(), [[10, 12, 11, 20]]);
    assertDeepEqual(rows.map((r) => r.responses.Ausbeute), [10, 12, 11, 20]);
  });

  test('runRows: empty without a design', () => {
    assertDeepEqual(runRows(stateWith()), []);
  });
});

suite('DoE run table: Stufen mit Dezimalkomma und Stufe 0 (Bug 4)', () => {
  test('Stufe 0 bleibt 0, nicht −1', () => {
    const fx = [{ kind: 'continuous', levels: ['0', '10'] }, { kind: 'continuous', levels: ['-5', '0'] }];
    assertDeepEqual(codedToActualRows([[-1, -1], [1, 1]], fx), [[0, -5], [10, 0]]);
  });

  test('„2,5“/„7,5“ ergeben 2.5/7.5', () => {
    const fx = [{ kind: 'continuous', levels: ['2,5', '7,5'] }];
    assertDeepEqual(codedToActualRows([[-1], [1], [0]], fx), [[2.5], [7.5], [5]]);
  });

  test('mehrstufig: Mittelstufe „5,5“ ergibt 5.5, Stufe 0 bleibt 0', () => {
    const fx = [{ kind: 'continuous', levels: ['0', '5,5', '10'] }];
    assertDeepEqual(codedToActualRows([[-1], [0], [1]], fx), [[0], [5.5], [10]]);
  });
});
