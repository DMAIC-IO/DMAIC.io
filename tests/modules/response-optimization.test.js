/**
 * D.Mike — Response Optimization Module Tests
 *
 * Model class unit tests. Shell/interface coverage (id, phase, init/destroy,
 * lazy help) lives in the Playwright E2E suite — importing the full module
 * shell here would transitively pull in @alpinejs/csp, which the headless /
 * browser test runner cannot resolve. Sibling migrated modules (xy-plot,
 * probability-plot) follow the same model-only convention.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State, SpecEntry } from '../../js/modules/response-optimization/response-optimization-model.js';

suite('Response Optimization — SpecEntry', () => {
  test('constructor sets default values', () => {
    const s = new SpecEntry();
    assertEqual(s.selected, false);
    assertEqual(s.kind, 'max');
    assertEqual(typeof s.lower, 'number');
    assertEqual(typeof s.upper, 'number');
    assertEqual(typeof s.weight, 'number');
  });

  test('toJSON returns expected shape', () => {
    const s = new SpecEntry();
    s.selected = true;
    s.kind = 'target';
    s.lower = 10;
    s.upper = 100;
    s.target = 50;
    s.weight = 2;
    const j = s.toJSON();
    assertEqual(j.selected, true);
    assertEqual(j.kind, 'target');
    assertEqual(j.lower, 10);
    assertEqual(j.upper, 100);
    assertEqual(j.target, 50);
    assertEqual(j.weight, 2);
  });

  test('fromJSON restores values correctly', () => {
    const j = { selected: true, kind: 'min', lower: 5, upper: 50, target: 25, weight: 3 };
    const s = SpecEntry.fromJSON(j);
    assertEqual(s.selected, true);
    assertEqual(s.kind, 'min');
    assertEqual(s.lower, 5);
    assertEqual(s.upper, 50);
    assertEqual(s.target, 25);
    assertEqual(s.weight, 3);
  });

  test('fromJSON(null) returns valid default', () => {
    const s = SpecEntry.fromJSON(null);
    assertEqual(s.selected, false);
    assertEqual(s.kind, 'max');
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = SpecEntry.fromJSON(undefined);
    assertEqual(s.selected, false);
    assertEqual(s.kind, 'max');
  });

  test('fromJSON sanitizes invalid kind', () => {
    const s = SpecEntry.fromJSON({ kind: 'invalid' });
    assertEqual(s.kind, 'max');
  });

  test('toJSON -> fromJSON roundtrip is lossless', () => {
    const s = new SpecEntry();
    s.selected = true;
    s.kind = 'target';
    s.lower = -5;
    s.upper = 95;
    s.target = 45;
    s.weight = 1.5;
    const r = SpecEntry.fromJSON(s.toJSON());
    assertEqual(r.selected, true);
    assertEqual(r.kind, 'target');
    assertEqual(r.lower, -5);
    assertEqual(r.upper, 95);
    assertEqual(r.target, 45);
    assertEqual(r.weight, 1.5);
  });
});

suite('Response Optimization — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(typeof s.specs, 'object');
    assertEqual(Object.keys(s.specs).length, 0);
    assertEqual(s.optId, null);
  });

  test('hasContent returns false when no selected models', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent returns false when specs empty', () => {
    const s = new State();
    s.specs = {};
    assertEqual(s.hasContent(), false);
  });

  test('hasContent returns true when a model is selected', () => {
    const s = new State();
    const e = new SpecEntry();
    e.selected = true;
    s.specs['m-1'] = e;
    assertEqual(s.hasContent(), true);
  });

  test('hasContent returns true when optId is set', () => {
    const s = new State();
    s.optId = 'opt-abc';
    assertEqual(s.hasContent(), true);
  });

  test('toJSON returns correct shape matching legacy getState()', () => {
    const s = new State();
    const e = new SpecEntry();
    e.selected = true;
    e.kind = 'max';
    e.lower = 0;
    e.upper = 10;
    e.weight = 2;
    s.specs['m-1'] = e;
    s.optId = 'opt-123';
    const j = s.toJSON();
    assertEqual(typeof j.specs, 'object');
    assertEqual(j.specs['m-1'].selected, true);
    assertEqual(j.specs['m-1'].kind, 'max');
    assertEqual(j.specs['m-1'].lower, 0);
    assertEqual(j.specs['m-1'].upper, 10);
    assertEqual(j.specs['m-1'].weight, 2);
    assertEqual(j.optId, 'opt-123');
  });

  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(Object.keys(s.specs).length, 0);
    assertEqual(s.optId, null);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(Object.keys(s.specs).length, 0);
    assertEqual(s.optId, null);
  });

  test('fromJSON restores specs and optId', () => {
    const data = {
      specs: {
        'm-1': { selected: true, kind: 'max', lower: 0, upper: 10, target: 5, weight: 2 },
        'm-2': { selected: false, kind: 'min', lower: 1, upper: 20, target: 10, weight: 1 },
      },
      optId: 'opt-abc',
    };
    const s = State.fromJSON(data);
    assertEqual(s.specs['m-1'].selected, true);
    assertEqual(s.specs['m-1'].kind, 'max');
    assertEqual(s.specs['m-1'].weight, 2);
    assertEqual(s.specs['m-2'].selected, false);
    assertEqual(s.specs['m-2'].kind, 'min');
    assertEqual(s.optId, 'opt-abc');
  });

  test('toJSON -> fromJSON roundtrip is lossless', () => {
    const s = new State();
    const e1 = new SpecEntry();
    e1.selected = true;
    e1.kind = 'target';
    e1.lower = 5;
    e1.upper = 95;
    e1.target = 50;
    e1.weight = 1.5;
    s.specs['model-a'] = e1;
    s.optId = 'opt-xyz';
    const r = State.fromJSON(s.toJSON());
    assertEqual(r.specs['model-a'].selected, true);
    assertEqual(r.specs['model-a'].kind, 'target');
    assertEqual(r.specs['model-a'].lower, 5);
    assertEqual(r.specs['model-a'].target, 50);
    assertEqual(r.optId, 'opt-xyz');
  });

  test('reconcileSpecs seeds missing entries with defaults from model data', () => {
    const s = new State();
    const models = [
      { id: 'm-1', dataSnapshot: { y: [10, 20, 30] } },
      { id: 'm-2', dataSnapshot: { y: [] } },
    ];
    s.reconcileSpecs(models);
    // m-1: seeds with yMin=10, yMax=30
    const e1 = s.specs['m-1'];
    assertEqual(e1.selected, false);
    assertEqual(e1.kind, 'max');
    assertEqual(e1.lower, 10);
    assertEqual(e1.upper, 30);
    // m-2: no data snapshot -> defaults to [0, 1]
    const e2 = s.specs['m-2'];
    assertEqual(e2.lower, 0);
    assertEqual(e2.upper, 1);
  });

  test('reconcileSpecs drops orphaned entries', () => {
    const s = new State();
    const e = new SpecEntry();
    s.specs['old-model'] = e;
    s.reconcileSpecs([{ id: 'new-model', dataSnapshot: { y: [1, 2] } }]);
    assertEqual(s.specs['old-model'], undefined);
    assertEqual(typeof s.specs['new-model'], 'object');
  });

  test('reconcileSpecs preserves existing spec entries', () => {
    const s = new State();
    const e = new SpecEntry();
    e.selected = true;
    e.kind = 'min';
    e.lower = 5;
    e.upper = 50;
    e.weight = 3;
    s.specs['m-1'] = e;
    // reconcile with same model — existing entry must be preserved
    s.reconcileSpecs([{ id: 'm-1', dataSnapshot: { y: [0, 100] } }]);
    assertEqual(s.specs['m-1'].selected, true);
    assertEqual(s.specs['m-1'].kind, 'min');
    assertEqual(s.specs['m-1'].lower, 5);
    assertEqual(s.specs['m-1'].weight, 3);
  });

  test('selectedIds returns ids of selected models', () => {
    const s = new State();
    const e1 = new SpecEntry(); e1.selected = true;
    const e2 = new SpecEntry(); e2.selected = false;
    const e3 = new SpecEntry(); e3.selected = true;
    s.specs['m-1'] = e1;
    s.specs['m-2'] = e2;
    s.specs['m-3'] = e3;
    const ids = s.selectedIds;
    assertEqual(ids.includes('m-1'), true);
    assertEqual(ids.includes('m-2'), false);
    assertEqual(ids.includes('m-3'), true);
    assertEqual(ids.length, 2);
  });

  test('diagnose returns empty array when no models selected', () => {
    const s = new State();
    const reasons = s.diagnose([], []);
    assertEqual(reasons.length, 0);
  });

  test('diagnose detects low R2', () => {
    const s = new State();
    const models = [{ id: 'm-1', name: 'Model 1', rSqAdj: 0.3, factorSpec: [] }];
    const reasons = s.diagnose(['m-1'], models);
    assertEqual(reasons.length, 1);
    assertEqual(reasons[0].type, 'lowR2');
    assertEqual(reasons[0].name, 'Model 1');
  });

  test('diagnose allows good R2', () => {
    const s = new State();
    const models = [{ id: 'm-1', name: 'Model 1', rSqAdj: 0.95, factorSpec: [{ name: 'X1' }] }];
    const reasons = s.diagnose(['m-1'], models);
    assertEqual(reasons.length, 0);
  });

  test('diagnose detects lack of fit', () => {
    const s = new State();
    const models = [{ id: 'm-1', name: 'Model 1', rSqAdj: 0.9, lofPValue: 0.01, factorSpec: [{ name: 'X1' }] }];
    const reasons = s.diagnose(['m-1'], models);
    assertEqual(reasons.some(r => r.type === 'lackOfFit'), true);
  });

  test('diagnose allows missing lofPValue (no replicates)', () => {
    const s = new State();
    const models = [{ id: 'm-1', name: 'Model 1', rSqAdj: 0.9, factorSpec: [{ name: 'X1' }] }];
    const reasons = s.diagnose(['m-1'], models);
    assertEqual(reasons.length, 0);
  });

  test('diagnose detects factor mismatch across two models', () => {
    const s = new State();
    const models = [
      { id: 'm-1', name: 'M1', rSqAdj: 0.9, factorSpec: [{ name: 'X1' }, { name: 'X2' }] },
      { id: 'm-2', name: 'M2', rSqAdj: 0.9, factorSpec: [{ name: 'X1' }, { name: 'X3' }] },
    ];
    const reasons = s.diagnose(['m-1', 'm-2'], models);
    assertEqual(reasons.some(r => r.type === 'factorMismatch'), true);
  });

  test('diagnose allows compatible factor structure', () => {
    const s = new State();
    const models = [
      { id: 'm-1', name: 'M1', rSqAdj: 0.9, factorSpec: [{ name: 'X1' }, { name: 'X2' }] },
      { id: 'm-2', name: 'M2', rSqAdj: 0.9, factorSpec: [{ name: 'X1' }, { name: 'X2' }] },
    ];
    const reasons = s.diagnose(['m-1', 'm-2'], models);
    assertEqual(reasons.length, 0);
  });
});
