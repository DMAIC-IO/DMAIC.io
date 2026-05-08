/**
 * Tests for js/modules/doe-planner/doe-planner-worksheet.js
 *
 * Covers:
 *   - createDesignWorksheet writes structural columns with hard locks
 *   - response columns stay unlocked
 *   - replicate-aggregate helper columns appear only when replicates > 1
 *   - helper formulas have correct shape (AVERAGEIF / LN(VARIF))
 *   - createExperimentRecord persists a record matching the V0.4 schema
 *   - removeExperimentRecord cleans up
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  createDesignWorksheet,
  createExperimentRecord,
  removeExperimentRecord,
} from '../../js/modules/doe-planner/doe-planner-worksheet.js';
import { generateDesign } from '../../js/engines/doe-planner-engine.js';

// ─── Mocks ─────────────────────────────────────────────────────────

function makeContext() {
  const state = {};
  const moduleStates = new Map();
  const events = [];
  const ctx = {
    stateManager: {
      get(path) {
        return path.split('.').reduce((o, k) => o?.[k], state);
      },
      set(path, value) {
        const keys = path.split('.');
        let obj = state;
        for (let i = 0; i < keys.length - 1; i++) {
          obj[keys[i]] = obj[keys[i]] ?? {};
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
      },
      getModuleState(id) { return moduleStates.get(id); },
      setModuleState(id, val) { moduleStates.set(id, val); },
    },
    eventBus: {
      emit(name, payload) { events.push({ name, payload }); },
    },
    i18n: {
      // Minimal localizer — return the last segment for unknown keys, but provide
      // friendly names for the columns the worksheet helper actually requests.
      t(key) {
        const map = {
          'modules.doe-planner.colRunOrder':    'RunOrder',
          'modules.doe-planner.colStdOrder':    'StdOrder',
          'modules.doe-planner.colBlock':       'Block',
          'modules.doe-planner.colReplicate':   'Replicate',
          'modules.doe-planner.colMeanSuffix':  'Mean',
          'modules.doe-planner.colLnVarSuffix': 'lnVar',
          'modules.doe-planner.factor':         'Factor',
        };
        return map[key] ?? key.split('.').pop();
      },
    },
  };
  return { ctx, state, moduleStates, events };
}

/** A 2² × 3 replicates design fragment — only fields createDesignWorksheet reads. */
const designReplicated = {
  designType: 'full',
  actualMatrix: [
    [-1, -1], [-1, -1], [-1, -1],
    [-1, +1], [-1, +1], [-1, +1],
    [+1, -1], [+1, -1], [+1, -1],
    [+1, +1], [+1, +1], [+1, +1],
  ],
  runOrder:    [1,2,3,4,5,6,7,8,9,10,11,12],
  stdOrder:    [1,1,1,2,2,2,3,3,3,4,4,4],
  replicateIds:[1,2,3,1,2,3,1,2,3,1,2,3],
};

const designSingle = {
  designType: 'full',
  actualMatrix: [[-1,-1], [-1,+1], [+1,-1], [+1,+1]],
  runOrder:    [1,2,3,4],
  stdOrder:    [1,2,3,4],
  replicateIds:[1,1,1,1],
};

const factors = [
  { name: 'X1', unit: 'mm', levels: [10, 20] },
  { name: 'X2', unit: 's',  levels: [60, 120] },
];
const responses = [{ name: 'Yield', unit: '%', goal: { kind: 'max' } }];

// ─── createDesignWorksheet — locks ─────────────────────────────────

suite('DoE Worksheet — structural locks', () => {
  test('RunOrder, StdOrder, Block, Replicate are hard-locked', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designSingle, factors, responses, 'Test', 'improve', 'exp-123');
    const ws = moduleStates.get(ref.instanceId);
    const sheet = ws.sheets[0].state;
    const byName = (n) => sheet.columns.find(c => c.name === n);

    for (const name of ['RunOrder', 'StdOrder', 'Block', 'Replicate']) {
      const col = byName(name);
      assertEqual(col.meta?.lock, 'hard');
      assertEqual(col.meta?.managedBy, 'doe-planner');
      assertEqual(col.meta?.managedRef, 'experiment:exp-123');
    }
  });

  test('factor columns are hard-locked with reason="design-factor"', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designSingle, factors, responses, 'Test', 'improve', 'exp-1');
    const ws = moduleStates.get(ref.instanceId);
    for (const colId of ref.factorColumnIds) {
      const col = ws.sheets[0].state.columns.find(c => c.id === colId);
      assertEqual(col.meta?.lock, 'hard');
      assertEqual(col.meta?.reason, 'design-factor');
    }
  });

  test('response columns are NOT locked', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designSingle, factors, responses, 'Test');
    const ws = moduleStates.get(ref.instanceId);
    for (const colId of ref.responseColumnIds) {
      const col = ws.sheets[0].state.columns.find(c => c.id === colId);
      assertEqual(col.meta, null);
    }
  });
});

// ─── Replicate-aggregate helper columns ────────────────────────────

suite('DoE Worksheet — replicate-aggregate helpers', () => {
  test('no helpers when replicates = 1', () => {
    const { ctx } = makeContext();
    const ref = createDesignWorksheet(ctx, designSingle, factors, responses, 'Test');
    assertEqual(ref.meanColumnIds.length, 0);
    assertEqual(ref.lnVarColumnIds.length, 0);
  });

  test('helpers appear when replicates > 1', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designReplicated, factors, responses, 'Test');
    assertEqual(ref.meanColumnIds.length, 1);
    assertEqual(ref.lnVarColumnIds.length, 1);

    const ws = moduleStates.get(ref.instanceId);
    const mean  = ws.sheets[0].state.columns.find(c => c.id === ref.meanColumnIds[0]);
    const lnVar = ws.sheets[0].state.columns.find(c => c.id === ref.lnVarColumnIds[0]);
    assertEqual(mean.name,  'Yield Mean');
    assertEqual(lnVar.name, 'Yield lnVar');
  });

  test('helper columns are soft-locked with reason="replicate-aggregate"', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designReplicated, factors, responses, 'Test', 'improve', 'exp-1');
    const ws = moduleStates.get(ref.instanceId);
    const mean  = ws.sheets[0].state.columns.find(c => c.id === ref.meanColumnIds[0]);
    const lnVar = ws.sheets[0].state.columns.find(c => c.id === ref.lnVarColumnIds[0]);
    for (const col of [mean, lnVar]) {
      assertEqual(col.meta?.lock, 'soft');
      assertEqual(col.meta?.reason, 'replicate-aggregate');
      assertEqual(col.meta?.managedRef, 'experiment:exp-1');
    }
  });

  test('mean formula references StdOrder and the row-specific group', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designReplicated, factors, responses, 'Test');
    const ws = moduleStates.get(ref.instanceId);
    const mean = ws.sheets[0].state.columns.find(c => c.id === ref.meanColumnIds[0]);
    assertEqual(mean.formulas[0],  "=AVERAGEIF('StdOrder'; 'StdOrder'[1]; 'Yield')");
    assertEqual(mean.formulas[5],  "=AVERAGEIF('StdOrder'; 'StdOrder'[6]; 'Yield')");
    assertEqual(mean.formulas[11], "=AVERAGEIF('StdOrder'; 'StdOrder'[12]; 'Yield')");
  });

  test('ln(var) formula uses VARIF wrapped in LN', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designReplicated, factors, responses, 'Test');
    const ws = moduleStates.get(ref.instanceId);
    const lnVar = ws.sheets[0].state.columns.find(c => c.id === ref.lnVarColumnIds[0]);
    assertEqual(lnVar.formulas[0], "=LN(VARIF('StdOrder'; 'StdOrder'[1]; 'Yield'))");
    assertEqual(lnVar.formulas[7], "=LN(VARIF('StdOrder'; 'StdOrder'[8]; 'Yield'))");
  });
});

// ─── createExperimentRecord ────────────────────────────────────────

suite('DoE Worksheet — experiment record', () => {
  test('persists record under state.experiments[id] with V0.4 schema', () => {
    const { ctx, state } = makeContext();
    const ref = createDesignWorksheet(ctx, designReplicated, factors, responses, 'My DoE', 'improve', 'exp-42');
    createExperimentRecord(ctx, 'exp-42', designReplicated, factors, responses, 'My DoE', ref);

    const rec = state.experiments['exp-42'];
    assertEqual(rec.name, 'My DoE');
    assertEqual(rec.designType, 'full');
    assertEqual(rec.factors.length, 2);
    assertEqual(rec.factors[0].kind, 'continuous');
    assertEqual(rec.factors[0].low, 10);
    assertEqual(rec.factors[0].high, 20);
    assertEqual(rec.runMatrix.worksheetRef.instanceId, ref.instanceId);
    assertEqual(rec.runMatrix.columnTags.responses.length, 1);
    assertEqual(rec.runMatrix.columnTags.means.length, 1);
    assertEqual(rec.responseColumns[0].name, 'Yield');
    assertEqual(rec.responseColumns[0].columnId, ref.responseColumnIds[0]);
    assertEqual(rec.responseColumns[0].meanColumnId, ref.meanColumnIds[0]);
  });

  test('replicateGroups holds only the truly-replicated std-order groups', () => {
    const { ctx, state } = makeContext();
    const ref = createDesignWorksheet(ctx, designReplicated, factors, responses, 'My DoE', 'improve', 'exp-42');
    createExperimentRecord(ctx, 'exp-42', designReplicated, factors, responses, 'My DoE', ref);

    const groups = state.experiments['exp-42'].replicateGroups;
    assertEqual(groups.length, 4);                  // four std-order groups, each replicated 3×
    assertEqual(groups[0].length, 3);
  });

  test('no replicate groups when replicates = 1', () => {
    const { ctx, state } = makeContext();
    const ref = createDesignWorksheet(ctx, designSingle, factors, responses, 'My DoE', 'improve', 'exp-1');
    createExperimentRecord(ctx, 'exp-1', designSingle, factors, responses, 'My DoE', ref);
    assertEqual(state.experiments['exp-1'].replicateGroups.length, 0);
  });

  test('removeExperimentRecord deletes the entry', () => {
    const { ctx, state } = makeContext();
    const ref = createDesignWorksheet(ctx, designSingle, factors, responses, 'X', 'improve', 'exp-x');
    createExperimentRecord(ctx, 'exp-x', designSingle, factors, responses, 'X', ref);
    assertEqual(!!state.experiments['exp-x'], true);
    removeExperimentRecord(ctx, 'exp-x');
    assertEqual(state.experiments['exp-x'], undefined);
  });
});

// ─── Categorical factors (V0.4 Phase 2) ────────────────────────────

const designBinaryCategorical = {
  designType: 'full',
  // codedMatrix is what the worksheet uses for categorical columns; actualMatrix
  // mirrors it for continuous factors. With one continuous + one categorical
  // factor and 4 std-order groups, both matrices look the same here.
  codedMatrix:  [[-1,-1], [-1,+1], [+1,-1], [+1,+1]],
  actualMatrix: [[-1,-1], [-1,+1], [+1,-1], [+1,+1]],
  runOrder:    [1,2,3,4],
  stdOrder:    [1,2,3,4],
  replicateIds:[1,1,1,1],
};

const factorsBinary = [
  { name: 'Temperature', kind: 'continuous',  unit: '°C',  levels: [150, 200] },
  { name: 'Tool',        kind: 'categorical', unit: '',    levels: ['Steel', 'HSS'] },
];

suite('DoE Worksheet — binary categorical factor', () => {
  test('categorical factor column is text-typed and contains the level labels', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designBinaryCategorical, factorsBinary, responses, 'Cat', 'improve', 'exp-c1');
    const ws = moduleStates.get(ref.instanceId);
    const toolCol = ws.sheets[0].state.columns.find(c => c.name === 'Tool');
    assertEqual(toolCol.type, 'text');
    assertEqual(toolCol.unit, '');
    // codedMatrix: [[-1,-1],[-1,+1],[+1,-1],[+1,+1]] → Tool col is the second.
    assertEqual(toolCol.values[0], 'Steel');   // row 0: coded -1 → first level
    assertEqual(toolCol.values[1], 'HSS');     // row 1: coded +1 → second level
    assertEqual(toolCol.values[2], 'Steel');
    assertEqual(toolCol.values[3], 'HSS');
  });

  test('continuous factor column stays numeric with its actual values', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designBinaryCategorical, factorsBinary, responses, 'Cat', 'improve', 'exp-c2');
    const ws = moduleStates.get(ref.instanceId);
    const tCol = ws.sheets[0].state.columns.find(c => c.name === 'Temperature');
    assertEqual(tCol.type, 'numeric');
    assertEqual(tCol.unit, '°C');
  });

  test('categorical column meta carries label → coded translation', () => {
    const { ctx, moduleStates } = makeContext();
    const ref = createDesignWorksheet(ctx, designBinaryCategorical, factorsBinary, responses, 'Cat', 'improve', 'exp-c3');
    const ws = moduleStates.get(ref.instanceId);
    const toolCol = ws.sheets[0].state.columns.find(c => c.name === 'Tool');
    assertEqual(toolCol.meta?.lock, 'hard');
    assertEqual(toolCol.meta?.categoricalCoding?.['Steel'], -1);
    assertEqual(toolCol.meta?.categoricalCoding?.['HSS'],    1);
  });

  test('experiment record preserves kind, levels, and reference per factor', () => {
    const { ctx, state } = makeContext();
    const ref = createDesignWorksheet(ctx, designBinaryCategorical, factorsBinary, responses, 'Cat', 'improve', 'exp-c4');
    createExperimentRecord(ctx, 'exp-c4', designBinaryCategorical, factorsBinary, responses, 'Cat', ref);
    const exp = state.experiments['exp-c4'];

    const t = exp.factors[0];
    assertEqual(t.kind, 'continuous');
    assertEqual(t.unit, '°C');
    assertEqual(t.low,  150);
    assertEqual(t.high, 200);

    const tool = exp.factors[1];
    assertEqual(tool.kind, 'categorical');
    assertEqual(tool.unit, null);            // categorical → no physical unit
    assertEqual(tool.levels[0], 'Steel');
    assertEqual(tool.levels[1], 'HSS');
    assertEqual(tool.reference, 'Steel');    // first level becomes the reference
  });
});

// ─── Replicate grouping by factor value (V0.4 Phase 4) ─────────────

suite('Replicate grouping — by factor-value, not by stdOrder', () => {
  test('CCD center points form one replicate group', () => {
    // Pure-continuous CCD: factorial corners + axial points + 3 center points.
    const design = generateDesign(
      [
        { id: 1, name: 'X1', kind: 'continuous', levels: ['-1', '1'] },
        { id: 2, name: 'X2', kind: 'continuous', levels: ['-1', '1'] },
      ],
      { designType: 'ccd', alphaType: 'rotatable', ccdCenterPoints: 3, randomize: false, seed: 1 }
    );
    const { ctx, state } = makeContext();
    const ref = createDesignWorksheet(ctx, design, [
      { name: 'X1', unit: '', kind: 'continuous', levels: [-1, 1] },
      { name: 'X2', unit: '', kind: 'continuous', levels: [-1, 1] },
    ], responses, 'CCD', 'improve', 'exp-ccd');
    createExperimentRecord(ctx, 'exp-ccd', design, [
      { name: 'X1', unit: '', kind: 'continuous', levels: [-1, 1] },
      { name: 'X2', unit: '', kind: 'continuous', levels: [-1, 1] },
    ], responses, 'CCD', ref);

    const groups = state.experiments['exp-ccd'].replicateGroups;
    // Exactly one group expected — the 3 center-point rows at (0, 0).
    assertEqual(groups.length, 1);
    assertEqual(groups[0].length, 3);
    // All three rows in the group must have value (0, 0).
    for (const i of groups[0]) {
      const row = design.codedMatrix[i];
      assertEqual(row[0], 0);
      assertEqual(row[1], 0);
    }
  });

  test('mixed CCD: center points are grouped within each categorical combo, not across', () => {
    const factors = [
      { id: 1, name: 'X1',   kind: 'continuous',  levels: ['-1', '1'] },
      { id: 2, name: 'X2',   kind: 'continuous',  levels: ['-1', '1'] },
      { id: 3, name: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'] },
    ];
    const design = generateDesign(factors, {
      designType: 'ccd', alphaType: 'rotatable', ccdCenterPoints: 3,
      randomize: false, seed: 1,
    });
    const { ctx, state } = makeContext();
    const ref = createDesignWorksheet(ctx, design, factors, responses, 'Mixed', 'improve', 'exp-mix');
    createExperimentRecord(ctx, 'exp-mix', design, factors, responses, 'Mixed', ref);

    const groups = state.experiments['exp-mix'].replicateGroups;
    // 3 categorical combinations × one center-point group each = 3 groups of 3.
    assertEqual(groups.length, 3);
    for (const g of groups) {
      assertEqual(g.length, 3);
      // Every member of a group must share both the (0,0) center and the same Tool level.
      const ref = design.codedMatrix[g[0]];
      for (const i of g) {
        const row = design.codedMatrix[i];
        assertEqual(row[0], 0);
        assertEqual(row[1], 0);
        assertEqual(row[2], ref[2], 'same categorical level within a group');
      }
    }
    // No two groups may share the same Tool level.
    const toolCodes = groups.map(g => design.codedMatrix[g[0]][2]);
    assertEqual(new Set(toolCodes).size, 3, 'three distinct categorical levels across groups');
  });

  test('explicit replicates still yield identical grouping as before', () => {
    const factors = [
      { id: 1, name: 'X1', kind: 'continuous', levels: ['-1', '1'] },
      { id: 2, name: 'X2', kind: 'continuous', levels: ['-1', '1'] },
    ];
    const design = generateDesign(factors, {
      designType: 'full', replicates: 3, randomize: false, seed: 1,
    });
    const { ctx, state } = makeContext();
    const ref = createDesignWorksheet(ctx, design, factors, responses, 'Rep', 'improve', 'exp-rep');
    createExperimentRecord(ctx, 'exp-rep', design, factors, responses, 'Rep', ref);

    const groups = state.experiments['exp-rep'].replicateGroups;
    assertEqual(groups.length, 4);                     // 4 unique design points
    for (const g of groups) assertEqual(g.length, 3);  // each replicated 3×
  });
});
