/**
 * Unit tests for the DoE Planner Model (doe-planner-model.js).
 *
 * Covers the version:3 persistence shape, fromJSON migrations/defaults, the
 * round-trip, and the pure business logic (factor/response CRUD, cascading
 * invalidation, active-term filtering, design-signature staleness, hasContent).
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/doe-planner/doe-planner-model.js';

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
