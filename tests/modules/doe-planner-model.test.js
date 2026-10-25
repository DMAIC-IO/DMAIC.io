/**
 * Unit tests for the DoE Planner Model (doe-planner-model.js).
 *
 * Covers the version:3 persistence shape, fromJSON migrations/defaults, the
 * round-trip, and the pure business logic (factor/response CRUD, cascading
 * invalidation, active-term filtering, design-signature staleness, hasContent).
 */

import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State, PHASE_DECISIONS } from '../../js/modules/doe-planner/doe-planner-model.js';

function json(v) { return JSON.stringify(v); }

suite('DoE Planner Model — State defaults & serialization', () => {
  test('constructor sets sensible defaults', () => {
    const s = new State();
    assertEqual(s.doeName, '');
    assertEqual(s.designType, 'full');
    assertEqual(s.factors.length, 0);
    assertEqual(s.responses.length, 0);
    assertEqual(s.selectedRes, null);
    assertEqual(s.selectedPBIdx, null);
    assertEqual(s.design, null);
    assertEqual(s.previewDirty, false);
    assertEqual(s.projectMode, false);
    assertEqual(s.activePhaseIdx, -1);
    assertEqual(s.options.randomize, true);
    assertEqual(s.options.replicates, 1);
    assertEqual(json(s.options.forbiddenVertices), '[]');
    assertEqual(s.options.optimalActiveTerms, null);
  });

  test('toJSON returns version 3 with all persistent fields', () => {
    const s = new State();
    s.doeName = 'Test';
    s.addFactor('Temp', 'C');
    const j = s.toJSON();
    assertEqual(j.version, 3);
    assertEqual(j.doeName, 'Test');
    assertEqual(j.factors.length, 1);
    assertEqual(j.factors[0].name, 'Temp');
    assertEqual('selectedRes' in j, true);
    assertEqual('worksheetRef' in j, true);
    assertEqual('sourceWorksheet' in j, true);
    assertEqual('evaluation' in j, true);
    assertEqual('analysisResponseIdx' in j, true);
    assertEqual('projectPhases' in j, true);
  });

  test('toJSON deep-clones nested blobs (no shared reference)', () => {
    const s = new State();
    s.design = { codedMatrix: [[1, -1]], designType: 'full' };
    const j = s.toJSON();
    j.design.codedMatrix[0][0] = 999;
    assertEqual(s.design.codedMatrix[0][0], 1); // original unchanged
  });

  test('fromJSON(null) yields valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.designType, 'full');
    assertEqual(s.factors.length, 0);
  });

  test('fromJSON(undefined) yields valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.designType, 'full');
  });

  test('fromJSON(malformed) yields valid default', () => {
    const s = State.fromJSON('not an object');
    assertEqual(s.designType, 'full');
    assertEqual(s.factors.length, 0);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const a = new State();
    a.doeName = 'Round';
    a.designType = 'dopt';
    a.addFactor('A', 'mm', ['1', '2'], 'continuous');
    a.addFactor('B', '', ['x', 'y'], 'categorical');
    a.addResponse();
    a.responses[0].name = 'Yield';
    a.options.optimalRuns = 12;
    a.selectedPBIdx = 2;
    a.analysisResponseIdx = 1;
    const b = State.fromJSON(a.toJSON());
    assertEqual(json(b.toJSON()), json(a.toJSON()));
  });
});

suite('DoE Planner Model — fromJSON migrations', () => {
  test('v2 wizard fields are dropped', () => {
    const s = State.fromJSON({ currentStep: 2, maxVisitedStep: 3, doeName: 'X' });
    assertEqual(s.doeName, 'X');
    assertEqual('currentStep' in s.toJSON(), false);
  });

  test('legacy lo/hi factor migrates to levels[]', () => {
    const s = State.fromJSON({ factors: [{ id: 1, name: 'A', unit: '', lo: '10', hi: '20' }] });
    assertEqual(json(s.factors[0].levels), json(['10', '20']));
    assertEqual('lo' in s.factors[0], false);
    assertEqual('hi' in s.factors[0], false);
  });

  test('factor without kind defaults to continuous', () => {
    const s = State.fromJSON({ factors: [{ id: 1, name: 'A', levels: ['1', '2'] }] });
    assertEqual(s.factors[0].kind, 'continuous');
  });

  test('categorical kind is preserved', () => {
    const s = State.fromJSON({ factors: [{ id: 1, name: 'A', kind: 'categorical', levels: ['x', 'y'] }] });
    assertEqual(s.factors[0].kind, 'categorical');
  });

  test('legacy optimalQuadratic migrates to optimalActiveTerms', () => {
    const s = State.fromJSON({
      factors: [{ id: 1, name: 'A', levels: ['1', '2'] }, { id: 2, name: 'B', levels: ['1', '2'] }],
      options: { optimalQuadratic: true },
    });
    assertEqual(Array.isArray(s.options.optimalActiveTerms), true);
    assertEqual('optimalQuadratic' in s.options, false);
    assertEqual('optimalExcludedInteractions' in s.options, false);
  });

  test('options merge keeps defaults for absent keys', () => {
    const s = State.fromJSON({ options: { optimalRuns: 7 } });
    assertEqual(s.options.optimalRuns, 7);
    assertEqual(s.options.randomize, true); // default preserved
    assertEqual(s.options.replicates, 1);
  });
});

suite('DoE Planner Model — factor & response CRUD', () => {
  test('addFactor increments fid and stores defaults', () => {
    const s = new State();
    s.addFactor('A', 'mm');
    s.addFactor('B', '');
    assertEqual(s.factors.length, 2);
    assertEqual(s.factors[0].id, 1);
    assertEqual(s.factors[1].id, 2);
    assertEqual(s.fid, 2);
    assertEqual(json(s.factors[0].levels), json(['', '']));
  });

  test('addFactor with explicit levels and categorical kind', () => {
    const s = new State();
    s.addFactor('C', '', ['lo', 'mid', 'hi'], 'categorical');
    assertEqual(s.factors[0].kind, 'categorical');
    assertEqual(s.factors[0].levels.length, 3);
  });

  test('removeFactor drops factor and clears term/forbidden state', () => {
    const s = new State();
    s.addFactor('A');
    s.addFactor('B');
    s.options.optimalActiveTerms = ['0', '1'];
    s.options.forbiddenVertices = [[1, -1]];
    s.removeFactor(1);
    assertEqual(s.factors.length, 1);
    assertEqual(s.factors[0].name, 'B');
    assertEqual(s.options.optimalActiveTerms, null);
    assertEqual(json(s.options.forbiddenVertices), '[]');
  });

  test('addResponse / removeResponse', () => {
    const s = new State();
    s.addResponse();
    s.addResponse();
    assertEqual(s.responses.length, 2);
    s.removeResponse(0);
    assertEqual(s.responses.length, 1);
  });

  test('insertLevel / removeLevel respects ≥2 guard', () => {
    const s = new State();
    s.addFactor('A');
    const id = s.factors[0].id;
    s.insertLevel(id, 1);
    assertEqual(s.factors[0].levels.length, 3);
    s.removeLevel(id, 0);
    assertEqual(s.factors[0].levels.length, 2);
    s.removeLevel(id, 0); // would go below 2 — rejected
    assertEqual(s.factors[0].levels.length, 2);
  });
});

suite('DoE Planner Model — validation & invalidation logic', () => {
  test('hasDuplicateFactorNames detects case-insensitive dupes', () => {
    const s = new State();
    s.addFactor('Temp');
    s.addFactor('temp');
    assertEqual(s.hasDuplicateFactorNames(), true);
    s.factors[1].name = 'Pressure';
    assertEqual(s.hasDuplicateFactorNames(), false);
  });

  test('empty factor names are ignored for dupe check', () => {
    const s = new State();
    s.addFactor('');
    s.addFactor('');
    assertEqual(s.hasDuplicateFactorNames(), false);
  });

  test('autoFixDesignType drops frac/pb when a 3-level factor exists', () => {
    const s = new State();
    s.addFactor('A', '', ['1', '2', '3']);
    s.designType = 'frac';
    s.selectedRes = { k: 1, runs: 4, res: 'III', p: 1 };
    s.autoFixDesignType();
    assertEqual(s.designType, 'full');
    assertEqual(s.selectedRes, null);
  });

  test('invalidateDesign clears design/eval and stale selectedRes', () => {
    const s = new State();
    s.addFactor('A');
    s.addFactor('B');
    s.design = { codedMatrix: [[1, -1]], designType: 'full' };
    s.evaluation = { efficiency: {} };
    s.selectedRes = { k: 5, runs: 16, res: 'V', p: 1 }; // k mismatch (2 factors)
    s.invalidateDesign();
    assertEqual(s.design, null);
    assertEqual(s.evaluation, null);
    assertEqual(s.selectedRes, null);
  });

  test('invalidateDesign keeps matching selectedRes', () => {
    const s = new State();
    s.addFactor('A');
    s.addFactor('B');
    s.selectedRes = { k: 2, runs: 4, res: 'Full', p: 0 };
    s.invalidateDesign();
    assertEqual(s.selectedRes.k, 2);
  });
});

suite('DoE Planner Model — active terms & signature', () => {
  test('getActiveTerms returns default when none chosen', () => {
    const s = new State();
    s.addFactor('A');
    s.addFactor('B');
    const terms = s.getActiveTerms();
    assertEqual(Array.isArray(terms), true);
    assertEqual(terms.length > 0, true);
  });

  test('getActiveTerms filters out-of-range factor indices', () => {
    const s = new State();
    s.addFactor('A');
    s.addFactor('B');
    // include a term referencing factor index 5 (out of range)
    s.options.optimalActiveTerms = ['0', '1', '5'];
    const terms = s.getActiveTerms();
    assertEqual(terms.includes('5'), false);
  });

  test('getActiveTerms empty when no factors', () => {
    const s = new State();
    assertEqual(json(s.getActiveTerms()), '[]');
  });

  test('designSignature null without design', () => {
    const s = new State();
    assertEqual(s.designSignature(), null);
  });

  test('designSignature stable for identical design, changes with matrix', () => {
    const s = new State();
    s.addResponse();
    s.responses[0] = { name: 'Y', unit: '' };
    s.design = { designType: 'full', codedMatrix: [[1, -1], [-1, 1]] };
    const sig1 = s.designSignature();
    const sig2 = s.designSignature();
    assertEqual(sig1, sig2);
    s.design.codedMatrix.push([1, 1]);
    assertEqual(s.designSignature() === sig1, false);
  });

  test('isOptimalType reflects design type', () => {
    const s = new State();
    s.designType = 'dopt';
    assertEqual(s.isOptimalType(), true);
    s.designType = 'full';
    assertEqual(s.isOptimalType(), false);
  });
});

suite('DoE Planner Model — hasContent', () => {
  test('false when empty', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('true when a factor name is set', () => {
    const s = new State();
    s.addFactor('Temp');
    assertEqual(s.hasContent(), true);
  });

  test('true when a design exists', () => {
    const s = new State();
    s.addFactor('');
    s.design = { codedMatrix: [], designType: 'full' };
    assertEqual(s.hasContent(), true);
  });
});

// ─── EVOP phases (spec 2026-10-25 E8) ──────────────────────────────

/** Unrandomised 2² in standard order: Temp 20/40, Druck 1/5. */
function evopState() {
  const s = new State();
  s.addFactor('Temp', 'C', ['20', '40']);
  s.addFactor('Druck', 'bar', ['1', '5']);
  s.addResponse();
  s.responses[0].name = 'Yield';
  s.projectName = 'Ofen';
  s.design = {
    designType: 'full',
    codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    actualMatrix: [[20, 1], [40, 1], [20, 5], [40, 5]],
    runOrder: [1, 2, 3, 4], stdOrder: [1, 2, 3, 4], replicateIds: [1, 1, 1, 1],
  };
  return s;
}

suite('DoE Planner Model — EVOP phases', () => {
  test('decisions are fixed', () => {
    assertDeepEqual([...PHASE_DECISIONS], ['recenter', 'repeat', 'stop']);
  });

  test('setProjectMode(true) opens phase 1 once, with a fallback name', () => {
    const s = evopState();
    s.setProjectMode(true);
    assertEqual(s.projectMode, true);
    assertEqual(s.projectPhases.length, 1);
    assertEqual(s.activePhaseIdx, 0);
    assertEqual(s.projectPhases[0].doeName, 'Ofen - Phase 1');
    assertEqual(s.projectPhases[0].design, null);
    s.setProjectMode(false);
    s.setProjectMode(true);
    assertEqual(s.projectPhases.length, 1);
  });

  test('snapshotPhase copies, never shares', () => {
    const s = evopState();
    const ph = s.snapshotPhase(3);
    assertEqual(ph.cycleNumber, 3);
    assertDeepEqual(Object.keys(ph), ['cycleNumber', 'doeName', 'factors', 'responses', 'designType', 'options', 'design', 'worksheetRef', 'evaluation', 'decision', 'completedAt']);
    ph.factors[0].name = 'X';
    assertEqual(s.factors[0].name, 'Temp');
  });

  test('closeActivePhase stores design and y values; a decided phase stays closed', () => {
    const s = evopState();
    s.setProjectMode(true);
    assertEqual(s.closeActivePhase('repeat', [10, 12, 11, 20], '2026-10-25T10:00:00.000Z'), true);
    const ph = s.projectPhases[0];
    assertEqual(ph.decision, 'repeat');
    assertEqual(ph.completedAt, '2026-10-25T10:00:00.000Z');
    assertDeepEqual(ph.yValues, [10, 12, 11, 20]);
    assertEqual(ph.design.codedMatrix.length, 4);
    assertEqual(s.closeActivePhase('stop'), false);
  });

  test('startPhase without re-centering keeps the factor levels', () => {
    const s = evopState();
    s.setProjectMode(true);
    s.closeActivePhase('repeat', [10, 12, 11, 20]);
    s.startPhase({ recenter: false });
    assertEqual(s.projectPhases.length, 2);
    assertEqual(s.activePhaseIdx, 1);
    assertEqual(s.doeName, 'Ofen - Phase 2');
    assertDeepEqual(s.factors[0].levels, ['20', '40']);
    assertEqual(s.design, null);
    assertEqual(s.worksheetRef, null);
  });

  test('startPhase with re-centering moves the center to the best run', () => {
    const s = evopState();
    s.setProjectMode(true);
    s.closeActivePhase('recenter', [10, 12, 11, 20]);
    s.startPhase({ recenter: true });
    assertDeepEqual(s.factors[0].levels.map(String), ['30', '50']);
    assertDeepEqual(s.factors[1].levels.map(String), ['3', '7']);
  });

  test('evopCycles lists phases with design and y values', () => {
    const s = evopState();
    s.setProjectMode(true);
    assertDeepEqual(s.evopCycles(), []);
    s.closeActivePhase('repeat', [10, 12, 11, 20]);
    const cycles = s.evopCycles();
    assertEqual(cycles.length, 1);
    assertDeepEqual(cycles[0].factorNames, ['Temp', 'Druck']);
    assertDeepEqual(cycles[0].y, [10, 12, 11, 20]);
  });

  test('viewPhase restores a phase; out of range is refused', () => {
    const s = evopState();
    s.setProjectMode(true);
    s.closeActivePhase('repeat', [10, 12, 11, 20]);
    s.startPhase({ recenter: false });
    assertEqual(s.viewPhase(0), true);
    assertEqual(s.activePhaseIdx, 0);
    assertEqual(s.doeName, 'Ofen - Phase 1');
    assertEqual(s.design.codedMatrix.length, 4);
    assertEqual(s.viewPhase(5), false);
    assertEqual(s.viewPhase(-1), false);
    assertEqual(s.activePhaseIdx, 0);
  });

  test('canStartNewPhase: only on a decided phase, never after stop', () => {
    const s = evopState();
    assertEqual(s.canStartNewPhase(), true);
    s.setProjectMode(true);
    assertEqual(s.canStartNewPhase(), false);
    s.closeActivePhase('repeat', [1, 2, 3, 4]);
    assertEqual(s.canStartNewPhase(), true);
    s.startPhase({ recenter: false });
    s.closeActivePhase('stop', [1, 2, 3, 4]);
    assertEqual(s.canStartNewPhase(), false);
  });

  test('syncActivePhase copies the generated design into the active phase', () => {
    const s = evopState();
    s.setProjectMode(true);
    s.syncActivePhase();
    assertEqual(s.projectPhases[0].design.codedMatrix.length, 4);
    assertEqual(s.projectPhases[0].doeName, s.doeName);
  });
});

suite('DoE Planner Model — forbidden vertices and model terms', () => {
  test('addForbiddenVertex refuses duplicates; removeForbiddenVertex checks the index', () => {
    const s = evopState();
    assertEqual(s.addForbiddenVertex([1, null]), true);
    assertEqual(s.addForbiddenVertex([1, null]), false);
    assertEqual(s.addForbiddenVertex([-1, 1]), true);
    assertDeepEqual(s.options.forbiddenVertices, [[1, null], [-1, 1]]);
    assertEqual(s.removeForbiddenVertex(5), false);
    assertEqual(s.removeForbiddenVertex(0), true);
    assertDeepEqual(s.options.forbiddenVertices, [[-1, 1]]);
  });

  test('modelTerms of a 2² design include the interaction', () => {
    const terms = evopState().modelTerms();
    assertTrue(terms.length >= 3);
  });
});

// ─── Auto-generation signatures (spec 2026-10-25 E3) ───────────────

suite('DoE Planner Model — configSignature / scheduleSignature', () => {
  function planned() {
    const s = new State();
    s.addFactor('Temp', 'C', ['20', '40']);
    s.addFactor('Druck', 'bar', ['1', '5']);
    s.addResponse();
    s.responses[0].name = 'Yield';
    return s;
  }

  test('a blank factor or response changes nothing', () => {
    const s = planned();
    const config = s.configSignature();
    const schedule = s.scheduleSignature();
    s.addFactor('', '');
    s.addResponse();
    assertEqual(s.configSignature(), config);
    assertEqual(s.scheduleSignature(), schedule);
  });

  test('factor edits change the config signature', () => {
    for (const edit of [
      (s) => { s.factors[0].name = 'T'; },
      (s) => { s.factors[0].unit = 'K'; },
      (s) => { s.factors[0].kind = 'categorical'; },
      (s) => { s.factors[0].levels[1] = '50'; },
      (s) => { s.insertLevel(s.factors[0].id, 1); },
      (s) => { s.removeFactor(s.factors[1].id); },
    ]) {
      const s = planned();
      const before = s.configSignature();
      edit(s);
      assertTrue(s.configSignature() !== before);
    }
  });

  test('type, type parameters, options and source change the config signature', () => {
    for (const edit of [
      (s) => { s.designType = 'ccd'; },
      (s) => { s.selectedRes = { k: 2, runs: 4, res: 'Full', p: 0 }; },
      (s) => { s.selectedPBIdx = 0; },
      (s) => { s.options.randomize = false; },
      (s) => { s.options.centerPoints = true; },
      (s) => { s.options.replicates = 2; },
      (s) => { s.options.alphaType = 'spherical'; },
      (s) => { s.options.ccdCenterPoints = 5; },
      (s) => { s.options.bbCenterPoints = 5; },
      (s) => { s.options.taguchiArray = 'L4'; },
      (s) => { s.options.optimalRuns = 9; },
      (s) => { s.options.optimalActiveTerms = ['M0', 'M1']; },
      (s) => { s.addForbiddenVertex([1, null]); },
      (s) => { s.sourceWorksheet = { instanceId: 'ws', sheetId: 's' }; },
    ]) {
      const s = planned();
      const before = s.configSignature();
      edit(s);
      assertTrue(s.configSignature() !== before);
    }
  });

  test('responses change only the schedule signature', () => {
    const s = planned();
    const config = s.configSignature();
    const schedule = s.scheduleSignature();
    s.responses[0].name = 'Ausbeute';
    assertTrue(s.scheduleSignature() !== schedule);
    const named = s.scheduleSignature();
    s.responses[0].unit = '%';
    assertTrue(s.scheduleSignature() !== named);
    assertEqual(s.configSignature(), config);
  });

  test('names, project fields, design and preview edits are in neither signature', () => {
    const s = planned();
    const config = s.configSignature();
    const schedule = s.scheduleSignature();
    s.doeName = 'Ofen';
    s.projectName = 'Linie 3';
    s.setProjectMode(true);
    s.design = { designType: 'full', codedMatrix: [[-1, -1]] };
    s.previewEdits = { factors: [], responses: [] };
    s.analysisResponseIdx = 0;
    assertEqual(s.configSignature(), config);
    assertEqual(s.scheduleSignature(), schedule);
  });
});
