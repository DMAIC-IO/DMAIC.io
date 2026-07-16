import { suite, test, assertEqual, assertAlmostEqual, assertThrows } from '../test-utils.js';
import {
  State,
  TRANSFORMS,
  applyTransform,
  optimizeBoxCox,
  optimizeYeoJohnson,
} from '../../js/modules/data-transformation/data-transformation-model.js';

// ─── State defaults ──────────────────────────────────────────────
suite('Data Transformation Model — State defaults', () => {
  test('constructor defaults currentTF to boxcox', () => {
    const s = new State();
    assertEqual(s.currentTF, 'boxcox');
  });

  test('constructor sets columnRef and exampleWorksheetId to null', () => {
    const s = new State();
    assertEqual(s.columnRef, null);
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── toJSON ──────────────────────────────────────────────────────
suite('Data Transformation Model — toJSON', () => {
  test('toJSON returns currentTF, columnRef, exampleWorksheetId', () => {
    const s = new State();
    s.currentTF = 'log';
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.exampleWorksheetId = 'ws-1';
    const j = s.toJSON();
    assertEqual(j.currentTF, 'log');
    assertEqual(j.columnRef.instanceId, 'i1');
    assertEqual(j.columnRef.sheetId, 's1');
    assertEqual(j.columnRef.columnId, 'c1');
    assertEqual(j.exampleWorksheetId, 'ws-1');
  });

  test('toJSON columnRef null when unset', () => {
    const j = new State().toJSON();
    assertEqual(j.currentTF, 'boxcox');
    assertEqual(j.columnRef, null);
    assertEqual(j.exampleWorksheetId, null);
  });
});

// ─── fromJSON robustness ─────────────────────────────────────────
suite('Data Transformation Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.currentTF, 'boxcox');
    assertEqual(s.columnRef, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.currentTF, 'boxcox');
  });

  test('fromJSON({}) returns valid default', () => {
    const s = State.fromJSON({});
    assertEqual(s.currentTF, 'boxcox');
    assertEqual(s.columnRef, null);
  });

  test('fromJSON restores known transform', () => {
    const s = State.fromJSON({ currentTF: 'yeojohnson' });
    assertEqual(s.currentTF, 'yeojohnson');
  });

  test('fromJSON falls back unknown transform to boxcox', () => {
    const s = State.fromJSON({ currentTF: 'nonsense' });
    assertEqual(s.currentTF, 'boxcox');
  });

  test('fromJSON restores columnRef', () => {
    const s = State.fromJSON({ columnRef: { instanceId: 'i', sheetId: 's', columnId: 'c' } });
    assertEqual(s.columnRef.instanceId, 'i');
    assertEqual(s.columnRef.sheetId, 's');
    assertEqual(s.columnRef.columnId, 'c');
  });

  test('fromJSON drops malformed columnRef', () => {
    const s = State.fromJSON({ columnRef: { instanceId: 'i' } });
    assertEqual(s.columnRef, null);
  });

  test('fromJSON restores exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 'ws-9' });
    assertEqual(s.exampleWorksheetId, 'ws-9');
  });

  test('roundtrip toJSON -> fromJSON is lossless', () => {
    const s = new State();
    s.currentTF = 'square';
    s.columnRef = { instanceId: 'A', sheetId: 'B', columnId: 'C' };
    s.exampleWorksheetId = 'ws-x';
    const r = State.fromJSON(s.toJSON());
    assertEqual(r.currentTF, 'square');
    assertEqual(r.columnRef.instanceId, 'A');
    assertEqual(r.exampleWorksheetId, 'ws-x');
  });
});

// ─── hasContent ──────────────────────────────────────────────────
suite('Data Transformation Model — hasContent', () => {
  test('hasContent false on fresh state', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent true when columnRef set', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });
});

// ─── TRANSFORMS table ────────────────────────────────────────────
suite('Data Transformation — TRANSFORMS table', () => {
  test('has 9 transforms in fixed order', () => {
    assertEqual(TRANSFORMS.length, 9);
    assertEqual(TRANSFORMS.map(t => t.id).join(','),
      'boxcox,yeojohnson,johnson_su,johnson_sb,log,log10,sqrt,inverse,square');
  });

  test('boxcox has single lambda param defaulting to 0', () => {
    const bc = TRANSFORMS.find(t => t.id === 'boxcox');
    assertEqual(bc.params.length, 1);
    assertEqual(bc.params[0].key, 'lambda');
    assertEqual(bc.params[0].val, 0);
  });

  test('johnson_su has 4 params', () => {
    assertEqual(TRANSFORMS.find(t => t.id === 'johnson_su').params.length, 4);
  });

  test('log/sqrt have no params', () => {
    assertEqual(TRANSFORMS.find(t => t.id === 'log').params.length, 0);
    assertEqual(TRANSFORMS.find(t => t.id === 'sqrt').params.length, 0);
  });
});

// ─── applyTransform math ─────────────────────────────────────────
suite('Data Transformation — applyTransform', () => {
  const pos = [1, 2, 4, 8];

  test('boxcox lambda=0 equals natural log', () => {
    const out = applyTransform(pos, 'boxcox', () => 0);
    assertAlmostEqual(out[0], Math.log(1), 1e-9);
    assertAlmostEqual(out[3], Math.log(8), 1e-9);
  });

  test('boxcox lambda=1 is (x^1 - 1)/1 = x-1', () => {
    const out = applyTransform(pos, 'boxcox', () => 1);
    assertAlmostEqual(out[1], 1, 1e-9); // 2-1
  });

  test('boxcox throws on non-positive data', () => {
    assertThrows(() => applyTransform([1, 0, 2], 'boxcox', () => 1));
  });

  test('log transforms positive data', () => {
    const out = applyTransform(pos, 'log', () => 0);
    assertAlmostEqual(out[2], Math.log(4), 1e-9);
  });

  test('log throws on non-positive data', () => {
    assertThrows(() => applyTransform([1, -1], 'log', () => 0));
  });

  test('log10 transforms positive data', () => {
    const out = applyTransform([10, 100], 'log10', () => 0);
    assertAlmostEqual(out[0], 1, 1e-9);
    assertAlmostEqual(out[1], 2, 1e-9);
  });

  test('sqrt transforms non-negative data', () => {
    const out = applyTransform([0, 4, 9], 'sqrt', () => 0);
    assertAlmostEqual(out[2], 3, 1e-9);
  });

  test('sqrt throws on negative data', () => {
    assertThrows(() => applyTransform([4, -1], 'sqrt', () => 0));
  });

  test('inverse transforms non-zero data', () => {
    const out = applyTransform([2, 4], 'inverse', () => 0);
    assertAlmostEqual(out[0], 0.5, 1e-9);
  });

  test('inverse throws on zero', () => {
    assertThrows(() => applyTransform([1, 0], 'inverse', () => 0));
  });

  test('square squares data', () => {
    const out = applyTransform([2, 3], 'square', () => 0);
    assertAlmostEqual(out[0], 4, 1e-9);
    assertAlmostEqual(out[1], 9, 1e-9);
  });

  test('yeojohnson handles negatives without throwing', () => {
    const out = applyTransform([-1, 0, 1], 'yeojohnson', () => 1);
    assertEqual(out.length, 3);
    assertEqual(out.every(v => isFinite(v)), true);
  });

  test('johnson_su applies gamma+delta*asinh', () => {
    const paramFn = (k) => ({ gamma: 0, delta: 1, xi: 0, lambdaJ: 1 }[k]);
    const out = applyTransform([0], 'johnson_su', paramFn);
    assertAlmostEqual(out[0], 0, 1e-9); // asinh(0)=0
  });

  test('johnson_sb throws when z out of (0,1)', () => {
    const paramFn = (k) => ({ gamma: 0, delta: 1, xi: 0, lambdaJ: 1 }[k]);
    assertThrows(() => applyTransform([5], 'johnson_sb', paramFn));
  });

  test('johnson_sb works within range', () => {
    const paramFn = (k) => ({ gamma: 0, delta: 1, xi: 0, lambdaJ: 20 }[k]);
    const out = applyTransform([5, 10], 'johnson_sb', paramFn);
    assertEqual(out.every(v => isFinite(v)), true);
  });
});

// ─── lambda optimization ─────────────────────────────────────────
suite('Data Transformation — lambda optimization', () => {
  test('optimizeBoxCox returns 1 for non-positive data', () => {
    assertEqual(optimizeBoxCox([1, 0, -1]), 1);
  });

  test('optimizeBoxCox returns a finite rounded lambda for positive data', () => {
    const lam = optimizeBoxCox([1, 2, 4, 8, 16, 32]);
    assertEqual(isFinite(lam), true);
    assertEqual(Math.abs(lam) <= 3, true);
  });

  test('optimizeYeoJohnson returns finite lambda', () => {
    const lam = optimizeYeoJohnson([-2, -1, 0, 1, 2, 3]);
    assertEqual(isFinite(lam), true);
    assertEqual(Math.abs(lam) <= 3, true);
  });
});
