/**
 * Tests for js/modules/doe-planner/domain/experiment.js — the snapshot of a
 * datasheet and the experiment built from it, against the records the
 * planner wrote before (without createdAt and experimentId).
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { snapshotOf, experimentOf, appendedRuns } from '../../../js/modules/doe-planner/domain/experiment.js';
import { designSignature } from '../../../js/modules/doe-planner/domain/signatures.js';
import { generateDesign } from '../../../js/engines/doe-planner-engine.js';
import { loadCases, legacyExperiments } from './cases.js';

suite('doe-planner domain — experimentOf', () => {
  test('gleicher Versuch wie der bisherige Eintrag, je Beispielplan', async () => {
    const frozen = await legacyExperiments();
    const cases = await loadCases();
    for (const c of cases) {
      const { worksheetRef, record } = frozen[c.name];
      const ref = { ...worksheetRef, snapshot: snapshotOf(c.model, c.design) };
      assertDeepEqual(experimentOf(ref), record, c.name);
    }
  });

  test('ohne Bindung oder ohne Momentaufnahme null', async () => {
    const frozen = await legacyExperiments();
    assertEqual(experimentOf(null), null);
    assertEqual(experimentOf({ ...frozen.seeded.worksheetRef }), null);
    assertEqual(experimentOf({ ...frozen.seeded.worksheetRef, snapshot: null }), null);
  });

  test('die Momentaufnahme ist reines JSON und hängt nicht am Model', async () => {
    const [c] = await loadCases();
    const snap = snapshotOf(c.model, c.design);
    assertDeepEqual(JSON.parse(JSON.stringify(snap)), snap);
    assertDeepEqual(Object.keys(snap).sort(), ['aliasing', 'centerPointRows', 'designType', 'factors', 'name', 'plannedTerms', 'replicateGroups', 'responses']);
    const before = snap.factors[0].levels[0];
    c.model.factors[0].levels[0] = 'changed';
    c.model.responses[0].name = 'changed';
    assertEqual(snap.factors[0].levels[0], before);
    assertEqual(snap.responses[0].name, 'Ausbeute');
  });

  test('Wiederholungsgruppen aus gleichen Zeilen der kodierten Matrix', async () => {
    const cases = await loadCases();
    const heli = cases.find((c) => c.name === 'doe-planner-hubschrauber-flyer');
    const snap = snapshotOf(heli.model, heli.design);
    assertEqual(snap.replicateGroups.length, 9);
    for (const g of snap.replicateGroups) assertEqual(g.length, 2);
  });

  /** A plain plan model and its CCD design (no randomization). */
  function ccdPlan(factors) {
    const options = { alphaType: 'rotatable', ccdCenterPoints: 3, randomize: false, seed: 1, optimalActiveTerms: null };
    const design = generateDesign(factors, { designType: 'ccd', ...options });
    const model = { doeName: 'CCD', designType: 'ccd', factors, responses: [{ name: 'Y', unit: '' }], options };
    return { model, design };
  }

  test('CCD: die Zentrumspunkte bilden eine Wiederholungsgruppe', () => {
    const { model, design } = ccdPlan([
      { id: 1, name: 'X1', kind: 'continuous', levels: ['-1', '1'] },
      { id: 2, name: 'X2', kind: 'continuous', levels: ['-1', '1'] },
    ]);
    const groups = snapshotOf(model, design).replicateGroups;
    assertEqual(groups.length, 1);
    assertEqual(groups[0].length, 3);
    for (const i of groups[0]) {
      assertEqual(design.codedMatrix[i][0], 0);
      assertEqual(design.codedMatrix[i][1], 0);
    }
  });

  test('gemischtes CCD: Zentrumspunkte je Kategorie gruppiert, nicht übergreifend', () => {
    const { model, design } = ccdPlan([
      { id: 1, name: 'X1', kind: 'continuous', levels: ['-1', '1'] },
      { id: 2, name: 'X2', kind: 'continuous', levels: ['-1', '1'] },
      { id: 3, name: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'] },
    ]);
    const groups = snapshotOf(model, design).replicateGroups;
    // 3 categorical combinations, one center-point group each.
    assertEqual(groups.length, 3);
    for (const g of groups) {
      assertEqual(g.length, 3);
      const first = design.codedMatrix[g[0]];
      for (const i of g) {
        const row = design.codedMatrix[i];
        assertEqual(row[0], 0);
        assertEqual(row[1], 0);
        assertEqual(row[2], first[2]);
      }
    }
    assertEqual(new Set(groups.map((g) => design.codedMatrix[g[0]][2])).size, 3);
  });

  test('Dezimalkomma: „2,5“/„7,5“ wird 2.5/7.5, Stufe 0 bleibt 0', () => {
    const { model, design } = ccdPlan([
      { id: 1, name: 'X1', kind: 'continuous', unit: 'mm', levels: ['2,5', '7,5'] },
      { id: 2, name: 'X2', kind: 'continuous', unit: 's', levels: ['0', '10'] },
    ]);
    const ref = {
      instanceId: 'ws', sheetId: 's', factorColumnIds: ['a', 'b'], responseColumnIds: ['y'], meanColumnIds: [], lnVarColumnIds: [],
      runOrderColumnId: 'run', stdOrderColumnId: 'std', snapshot: snapshotOf(model, design),
    };
    const exp = experimentOf(ref);
    assertEqual(exp.factors[0].low, 2.5);
    assertEqual(exp.factors[0].high, 7.5);
    assertEqual(exp.factors[1].low, 0);
    assertEqual(exp.factors[1].high, 10);
  });

  test('ohne kodierte Matrix keine Wiederholungsgruppen', async () => {
    const [c] = await loadCases();
    const design = { ...c.design, codedMatrix: undefined, actualMatrix: [[1, 2], [1, 2]] };
    assertDeepEqual(snapshotOf(c.model, design).replicateGroups, []);
  });
});

suite('doe-planner domain — appendedRuns', () => {
  /** A bound 2² plan as stored (actual values as text). */
  function bound() {
    const m = {
      doeName: 'Ofen', designType: 'full', responses: [{ name: 'Y', unit: '' }],
      options: { optimalActiveTerms: null },
      factors: [
        { name: 'A', unit: '', kind: 'continuous', levels: ['0', '10'] },
        { name: 'B', unit: '', kind: 'continuous', levels: ['0', '10'] },
      ],
      design: {
        codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]], actualMatrix: [['0', '0'], ['10', '0'], ['0', '10'], ['10', '10']],
        stdOrder: [1, 2, 3, 4], runOrder: [1, 2, 3, 4], replicateIds: [1, 1, 1, 1], resolution: 'Full', p: 3,
        designType: 'full', configSignature: 'cfg',
      },
    };
    m.worksheetRef = {
      instanceId: 'ws', sheetId: 's', factorColumnIds: ['a', 'b'], responseColumnIds: ['y'], meanColumnIds: [], lnVarColumnIds: [],
      runOrderColumnId: 'run', stdOrderColumnId: 'std', designSignature: designSignature(m), snapshot: snapshotOf(m, m.design),
    };
    return m;
  }

  test('the design grows by the rows; signature and replicate groups follow; the input stays', () => {
    const m = bound();
    const before = JSON.stringify(m);
    const { design, worksheetRef } = appendedRuns(m, [[1, 1], [1, 1]]);
    assertEqual(JSON.stringify(m), before);
    assertEqual(design.codedMatrix.length, 6);
    assertDeepEqual(design.actualMatrix.slice(-2), [['10', '10'], ['10', '10']]);
    assertDeepEqual(design.runOrder.slice(-2), [5, 6]);
    assertDeepEqual(design.stdOrder.slice(-2), [5, 6]);
    assertDeepEqual(design.replicateIds.slice(-2), [1, 1]);
    assertEqual(design.configSignature, 'cfg');
    assertEqual(worksheetRef.designSignature, designSignature({ design, factors: m.factors }));
    assert(worksheetRef.designSignature !== m.worksheetRef.designSignature, 'signature changed');
    assertDeepEqual(worksheetRef.snapshot.replicateGroups, [[3, 4, 5]]);
  });

  test('rows of the wrong width, no rows or no binding throw', () => {
    const m = bound();
    const throws = (fn) => { try { fn(); return false; } catch { return true; } };
    assert(throws(() => appendedRuns(m, [[1]])), 'wrong width');
    assert(throws(() => appendedRuns(m, [])), 'no rows');
    assert(throws(() => appendedRuns({ ...m, worksheetRef: null }, [[1, 1]])), 'no binding');
  });
});
