/**
 * D.Mike — Attribute Control Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults, toJSON/fromJSON round-trip, robustness,
 *     sanitization, hasContent().
 *   - SPC math (engine, reused by the module): control limits CL/UCL/LCL for
 *     p / np / c / u charts and Nelson-rule violation detection, asserted
 *     against hand-computed reference values.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State } from '../../js/modules/attribute-control-chart/attribute-control-chart-model.js';
import {
  computeP, computeNP, computeC, computeU,
  evaluateAttributeRules, ATTR_DEFAULT_ENABLED_RULES,
} from '../../js/engines/attribute-control-chart-engine.js';

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('Attribute CC Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.chartTypeId, 'p');
    assertEqual(s.defectsRef, null);
    assertEqual(s.sizeRef, null);
    assertEqual(s.constantN, 50);
    assertEqual(s.baselineCount, null);
    assertEqual(JSON.stringify(s.enabledRules), JSON.stringify([1, 2, 3]));
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — toJSON
// ─────────────────────────────────────────────────────────────

suite('Attribute CC Model — toJSON', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.chartTypeId = 'np';
    s.defectsRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.sizeRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c2' };
    s.constantN = 100;
    s.baselineCount = 5;
    s.enabledRules = [1, 2, 3, 5];
    s.exampleWorksheetId = 'ws-1';
    const j = s.toJSON();
    assertEqual(j.chartTypeId, 'np');
    assertEqual(j.defectsRef.columnId, 'c1');
    assertEqual(j.sizeRef.columnId, 'c2');
    assertEqual(j.constantN, 100);
    assertEqual(j.baselineCount, 5);
    assertEqual(JSON.stringify(j.enabledRules), JSON.stringify([1, 2, 3, 5]));
    assertEqual(j.exampleWorksheetId, 'ws-1');
  });

  test('toJSON refs are null when unset', () => {
    const j = new State().toJSON();
    assertEqual(j.defectsRef, null);
    assertEqual(j.sizeRef, null);
    assertEqual(j.baselineCount, null);
    assertEqual(j.exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — fromJSON robustness
// ─────────────────────────────────────────────────────────────

suite('Attribute CC Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.chartTypeId, 'p');
    assertEqual(s.constantN, 50);
    assertEqual(s.defectsRef, null);
    assertEqual(JSON.stringify(s.enabledRules), JSON.stringify([1, 2, 3]));
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.chartTypeId, 'p');
    assertEqual(s.baselineCount, null);
  });

  test('fromJSON restores all fields', () => {
    const s = State.fromJSON({
      chartTypeId: 'c',
      defectsRef: { instanceId: 'i', sheetId: 's', columnId: 'c' },
      sizeRef: { instanceId: 'i', sheetId: 's', columnId: 'c2' },
      constantN: 80,
      baselineCount: 10,
      enabledRules: [1, 3],
      exampleWorksheetId: 'ws',
    });
    assertEqual(s.chartTypeId, 'c');
    assertEqual(s.defectsRef.columnId, 'c');
    assertEqual(s.sizeRef.columnId, 'c2');
    assertEqual(s.constantN, 80);
    assertEqual(s.baselineCount, 10);
    assertEqual(JSON.stringify(s.enabledRules), JSON.stringify([1, 3]));
    assertEqual(s.exampleWorksheetId, 'ws');
  });

  test('fromJSON sanitises invalid chartTypeId to default', () => {
    assertEqual(State.fromJSON({ chartTypeId: 'bogus' }).chartTypeId, 'p');
    assertEqual(State.fromJSON({ chartTypeId: 42 }).chartTypeId, 'p');
  });

  test('fromJSON sanitises invalid constantN to default', () => {
    assertEqual(State.fromJSON({ constantN: 0 }).constantN, 50);
    assertEqual(State.fromJSON({ constantN: -5 }).constantN, 50);
    assertEqual(State.fromJSON({ constantN: 'x' }).constantN, 50);
  });

  test('fromJSON keeps valid constantN', () => {
    assertEqual(State.fromJSON({ constantN: 25 }).constantN, 25);
  });

  test('fromJSON baselineCount null/invalid stays null', () => {
    assertEqual(State.fromJSON({ baselineCount: null }).baselineCount, null);
    assertEqual(State.fromJSON({ baselineCount: 'x' }).baselineCount, null);
    assertEqual(State.fromJSON({}).baselineCount, null);
  });

  test('fromJSON keeps numeric baselineCount', () => {
    assertEqual(State.fromJSON({ baselineCount: 7 }).baselineCount, 7);
  });

  test('fromJSON enabledRules invalid falls back to default', () => {
    assertEqual(
      JSON.stringify(State.fromJSON({ enabledRules: 'x' }).enabledRules),
      JSON.stringify([1, 2, 3]),
    );
    assertEqual(
      JSON.stringify(State.fromJSON({ enabledRules: null }).enabledRules),
      JSON.stringify([1, 2, 3]),
    );
  });

  test('fromJSON malformed refs become null', () => {
    assertEqual(State.fromJSON({ defectsRef: 'not-an-object' }).defectsRef, null);
    assertEqual(State.fromJSON({ sizeRef: { instanceId: 'i' } }).sizeRef, null);
  });

  test('fromJSON exampleWorksheetId non-string becomes null', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 42 }).exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — round-trip
// ─────────────────────────────────────────────────────────────

suite('Attribute CC Model — round-trip', () => {
  test('toJSON → fromJSON is lossless', () => {
    const s = new State();
    s.chartTypeId = 'u';
    s.defectsRef = { instanceId: 'a', sheetId: 'b', columnId: 'c' };
    s.sizeRef = { instanceId: 'a', sheetId: 'b', columnId: 'd' };
    s.constantN = 33;
    s.baselineCount = 4;
    s.enabledRules = [1, 2, 3, 5, 6];
    s.exampleWorksheetId = 'ws-9';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });
});

// ─────────────────────────────────────────────────────────────
// Model — hasContent
// ─────────────────────────────────────────────────────────────

suite('Attribute CC Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('defectsRef set means content', () => {
    const s = new State();
    s.defectsRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('sizeRef set means content', () => {
    const s = new State();
    s.sizeRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });
});

// ─────────────────────────────────────────────────────────────
// SPC math — p-chart (constant n)
// ─────────────────────────────────────────────────────────────

suite('Attribute CC SPC — p-chart', () => {
  test('constant n: CL/UCL/LCL match hand-computed', () => {
    // defects=[1,2,1,3,2], n=20 each → ΣD=9, Σn=100, pBar=0.09
    // sigma=sqrt(0.09*0.91/20)=0.06399219; UCL=0.2819766; LCL=max(0,-0.10198)=0
    const r = computeP([1, 2, 1, 3, 2], [20, 20, 20, 20, 20]);
    assertEqual(r.variableLimits, false);
    assertAlmostEqual(r.cl, 0.09, 1e-9);
    assertAlmostEqual(r.sigma, 0.06399219, 1e-6);
    assertAlmostEqual(r.ucl, 0.28197658, 1e-6);
    assertEqual(r.lcl, 0);
    assertArrayClose(r.values, [0.05, 0.10, 0.05, 0.15, 0.10]);
  });

  test('variable n: per-point limits (arrays) and variableLimits flag', () => {
    // defects=[2,4], sizes=[20,50] → pBar=6/70=0.0857142857
    const r = computeP([2, 4], [20, 50]);
    assertEqual(r.variableLimits, true);
    assertEqual(Array.isArray(r.ucl), true);
    assertEqual(Array.isArray(r.lcl), true);
    assertAlmostEqual(r.cl, 6 / 70, 1e-9);
    const pBar = 6 / 70;
    const s0 = Math.sqrt(pBar * (1 - pBar) / 20);
    const s1 = Math.sqrt(pBar * (1 - pBar) / 50);
    assertAlmostEqual(r.ucl[0], pBar + 3 * s0, 1e-9);
    assertAlmostEqual(r.ucl[1], pBar + 3 * s1, 1e-9);
  });
});

// ─────────────────────────────────────────────────────────────
// SPC math — np-chart
// ─────────────────────────────────────────────────────────────

suite('Attribute CC SPC — np-chart', () => {
  test('CL/UCL/LCL match hand-computed', () => {
    // defects=[3,5,2,4,6], n=50 → ΣD=20, blEnd=5, pBar=20/250=0.08
    // cl=50*0.08=4; sigma=sqrt(50*0.08*0.92)=sqrt(3.68)=1.91833261
    // UCL=4+5.75499784=9.75499784; LCL=max(0,4-5.755)=0
    const r = computeNP([3, 5, 2, 4, 6], 50);
    assertEqual(r.variableLimits, false);
    assertAlmostEqual(r.cl, 4, 1e-9);
    assertAlmostEqual(r.sigma, 1.91833261, 1e-6);
    assertAlmostEqual(r.ucl, 9.75499784, 1e-6);
    assertEqual(r.lcl, 0);
    assertArrayClose(r.values, [3, 5, 2, 4, 6]);
  });

  test('baselineEnd restricts the pBar window', () => {
    // baseline first 2 of [3,5,2,4,6], n=50 → pBar=(3+5)/(50*2)=0.08
    const r = computeNP([3, 5, 2, 4, 6], 50, 2);
    assertAlmostEqual(r.cl, 4, 1e-9);
  });
});

// ─────────────────────────────────────────────────────────────
// SPC math — c-chart
// ─────────────────────────────────────────────────────────────

suite('Attribute CC SPC — c-chart', () => {
  test('CL/UCL/LCL match hand-computed', () => {
    // counts=[2,3,1,4,2] → cBar=12/5=2.4; sigma=sqrt(2.4)=1.54919334
    // UCL=2.4+4.64758001=7.04758001; LCL=max(0,2.4-4.6476)=0
    const r = computeC([2, 3, 1, 4, 2]);
    assertEqual(r.variableLimits, false);
    assertAlmostEqual(r.cl, 2.4, 1e-9);
    assertAlmostEqual(r.sigma, 1.54919334, 1e-6);
    assertAlmostEqual(r.ucl, 7.04758001, 1e-6);
    assertEqual(r.lcl, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// SPC math — u-chart
// ─────────────────────────────────────────────────────────────

suite('Attribute CC SPC — u-chart', () => {
  test('constant sizes: CL/UCL/LCL match hand-computed', () => {
    // counts=[4,6,2,8], sizes=[2,2,2,2] → uBar=20/8=2.5; sigma=sqrt(2.5/2)=1.11803399
    // UCL=2.5+3.35410197=5.85410197; LCL=max(0,2.5-3.354)=0
    const r = computeU([4, 6, 2, 8], [2, 2, 2, 2]);
    assertEqual(r.variableLimits, false);
    assertAlmostEqual(r.cl, 2.5, 1e-9);
    assertAlmostEqual(r.sigma, 1.11803399, 1e-6);
    assertAlmostEqual(r.ucl, 5.85410197, 1e-6);
    assertEqual(r.lcl, 0);
    assertArrayClose(r.values, [2, 3, 1, 4]);
  });

  test('variable sizes: per-point limits and variableLimits flag', () => {
    const r = computeU([4, 6], [2, 3]);
    assertEqual(r.variableLimits, true);
    assertEqual(Array.isArray(r.ucl), true);
    assertAlmostEqual(r.cl, 10 / 5, 1e-9); // uBar = 10/5 = 2
  });
});

// ─────────────────────────────────────────────────────────────
// SPC math — Nelson rule violation detection
// ─────────────────────────────────────────────────────────────

suite('Attribute CC SPC — violation detection', () => {
  test('Rule 1: point beyond UCL flagged', () => {
    // CL=2, UCL=5, LCL=0; value 7 at index 3 is beyond
    const v = evaluateAttributeRules([1, 2, 3, 7, 2], 2, 5, 0, 1, [1]);
    assertEqual(v.length, 1);
    assertEqual(v[0].index, 3);
    assertEqual(v[0].ruleId, 1);
  });

  test('Rule 1: no violation when all within limits', () => {
    const v = evaluateAttributeRules([1, 2, 3, 4, 2], 2, 5, 0, 1, [1]);
    assertEqual(v.length, 0);
  });

  test('Rule 2: 9 consecutive on same side of CL flagged', () => {
    // CL=5; nine points all > 5
    const vals = [6, 6, 6, 6, 6, 6, 6, 6, 6];
    const v = evaluateAttributeRules(vals, 5, 20, 0, 1, [2]);
    const idxs = [...new Set(v.map(x => x.index))].sort((a, b) => a - b);
    assertEqual(JSON.stringify(idxs), JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8]));
  });

  test('Rule 3: 6 consecutive increasing flagged', () => {
    const v = evaluateAttributeRules([1, 2, 3, 4, 5, 6, 7], 4, 100, 0, 1, [3]);
    const ruleIds = [...new Set(v.map(x => x.ruleId))];
    assertEqual(ruleIds.includes(3), true);
  });

  test('per-point (variable) limits flag a point beyond its own UCL', () => {
    // value 0.30 at index 1 beyond its UCL 0.25
    const v = evaluateAttributeRules([0.10, 0.30], 0.1, [0.20, 0.25], [0, 0], [0.03, 0.05], [1]);
    assertEqual(v.length, 1);
    assertEqual(v[0].index, 1);
  });

  test('default enabled rules are 1,2,3', () => {
    assertEqual(JSON.stringify(ATTR_DEFAULT_ENABLED_RULES), JSON.stringify([1, 2, 3]));
  });
});

/** @param {number[]} a @param {number[]} b */
function assertArrayClose(a, b, tol = 1e-9) {
  assertEqual(a.length, b.length);
  for (let i = 0; i < a.length; i++) assertAlmostEqual(a[i], b[i], tol);
}
