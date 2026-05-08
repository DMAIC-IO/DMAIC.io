/**
 * D.Mike — Mixed-kind CCD / Box-Behnken Tests (V0.4 Phase 4)
 *
 * Verifies that CCD and Box-Behnken designs handle a mix of continuous and
 * categorical factors by:
 *   - generating the RSM design only over the continuous factors,
 *   - cartesian-crossing it with all combinations of categorical levels.
 *
 * The contract checked here:
 *   1. Total run count = (continuous-only RSM run count) × Πₖ(level count of cat. factor k).
 *   2. Continuous slots in any row carry only RSM-valid coded values
 *      (corner ±1, axial ±α, center 0).
 *   3. Categorical slots in any row carry one of the evenly-spaced coded
 *      level values −1, …, +1 — and each level appears exactly
 *      (continuous-RSM run count) times.
 *   4. Every categorical-level combination has its own full RSM block.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { generateDesign, centralComposite, boxBehnken, ccdAlpha } from '../../js/engines/doe-planner-engine.js';

// ─── CCD with one continuous + one 3-level categorical ────────────

suite('Mixed CCD — 2 continuous + 1 categorical (k=3)', () => {
  const factors = [
    { id: 1, name: 'Temperature', kind: 'continuous',  levels: ['150', '200'] },
    { id: 2, name: 'Pressure',    kind: 'continuous',  levels: ['1', '5'] },
    { id: 3, name: 'Tool',        kind: 'categorical', levels: ['Steel', 'HSS', 'Carbide'] },
  ];
  const design = generateDesign(factors, {
    designType: 'ccd', alphaType: 'rotatable', ccdCenterPoints: 3,
    randomize: false, seed: 1,
  });

  // CCD over 2 continuous: 2² + 2·2 + 3 = 11 runs.
  const contRunCount = centralComposite(2, { alphaType: 'rotatable', centerPoints: 3 }).length;
  test('continuous-only run count is 11', () => {
    assertEqual(contRunCount, 11);
  });

  test('total run count = continuous CCD × categorical level count (33)', () => {
    assertEqual(design.codedMatrix.length, contRunCount * 3);
  });

  test('every continuous slot carries an RSM-valid value', () => {
    const alpha = ccdAlpha(2, 'rotatable');
    const allowed = new Set([-alpha, -1, 0, 1, alpha].map(v => v.toFixed(8)));
    for (const row of design.codedMatrix) {
      for (const idx of [0, 1]) {
        const k = row[idx].toFixed(8);
        if (!allowed.has(k)) throw new Error(`unexpected continuous value ${row[idx]}`);
      }
    }
  });

  test('categorical slot uses evenly-spaced level codings (−1, 0, +1)', () => {
    const expected = new Set([-1, 0, 1].map(v => v.toFixed(8)));
    for (const row of design.codedMatrix) {
      const c = row[2].toFixed(8);
      if (!expected.has(c)) throw new Error(`unexpected categorical code ${row[2]}`);
    }
  });

  test('each categorical level appears exactly (continuous CCD) = 11 times', () => {
    const counts = new Map();
    for (const row of design.codedMatrix) {
      const c = row[2];
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    assertEqual(counts.size, 3);
    for (const c of counts.values()) assertEqual(c, 11);
  });

  test('each categorical level has its own complete RSM block', () => {
    // Group rows by the categorical code, sort each group, check structural identity.
    const groups = new Map();
    for (const row of design.codedMatrix) {
      const key = row[2];
      const stripped = [row[0], row[1]];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(stripped);
    }
    const serialise = (block) => block.map(r => r.map(v => v.toFixed(6)).join(',')).sort().join('|');
    const blocks = [...groups.values()].map(serialise);
    // All three categorical-level blocks should be structurally identical
    // (only the categorical column differs; the continuous RSM portion must match).
    const ref = blocks[0];
    for (const b of blocks) assertEqual(b, ref);
  });
});

// ─── CCD with too-few continuous factors ──────────────────────────

suite('Mixed CCD — guard rails', () => {
  test('throws when fewer than 2 continuous factors are supplied', () => {
    const factors = [
      { id: 1, name: 'X',    kind: 'continuous',  levels: ['1', '2'] },
      { id: 2, name: 'Tool', kind: 'categorical', levels: ['A', 'B'] },
    ];
    let threw = false;
    try {
      generateDesign(factors, { designType: 'ccd', randomize: false });
    } catch { threw = true; }
    assertEqual(threw, true);
  });
});

// ─── Mixed Box-Behnken ────────────────────────────────────────────

suite('Mixed Box-Behnken — 3 continuous + 1 categorical (k=2)', () => {
  const factors = [
    { id: 1, name: 'A',    kind: 'continuous',  levels: ['0', '10'] },
    { id: 2, name: 'B',    kind: 'continuous',  levels: ['0', '10'] },
    { id: 3, name: 'C',    kind: 'continuous',  levels: ['0', '10'] },
    { id: 4, name: 'Tool', kind: 'categorical', levels: ['Old', 'New'] },
  ];
  const design = generateDesign(factors, {
    designType: 'bb', bbCenterPoints: 3, randomize: false, seed: 1,
  });

  const contBaseLength = boxBehnken(3, { centerPoints: 3 }).length;

  test('Box-Behnken (k=3) gives 15 base runs', () => {
    assertEqual(contBaseLength, 15);
  });

  test('mixed Box-Behnken produces continuous-base × 2 categorical levels = 30 runs', () => {
    assertEqual(design.codedMatrix.length, contBaseLength * 2);
  });

  test('continuous slots use only ±1 / 0', () => {
    const allowed = new Set([-1, 0, 1]);
    for (const row of design.codedMatrix) {
      for (const idx of [0, 1, 2]) {
        if (!allowed.has(row[idx])) throw new Error(`unexpected BB value ${row[idx]}`);
      }
    }
  });

  test('categorical column uses ±1 (binary effect coding)', () => {
    const allowed = new Set([-1, 1]);
    for (const row of design.codedMatrix) {
      if (!allowed.has(row[3])) throw new Error(`unexpected categorical value ${row[3]}`);
    }
  });
});

// ─── Pure-continuous parity (regression test) ─────────────────────

suite('Mixed-kind wrapper — pure-continuous path is unchanged', () => {
  const factors = [
    { id: 1, name: 'X1', kind: 'continuous', levels: ['-1', '1'] },
    { id: 2, name: 'X2', kind: 'continuous', levels: ['-1', '1'] },
  ];
  const design = generateDesign(factors, {
    designType: 'ccd', alphaType: 'rotatable', ccdCenterPoints: 3,
    randomize: false, seed: 1,
  });
  test('pure-continuous CCD matches the standalone generator row-for-row', () => {
    const ref = centralComposite(2, { alphaType: 'rotatable', centerPoints: 3 });
    assertEqual(design.codedMatrix.length, ref.length);
    for (let i = 0; i < ref.length; i++) {
      for (let j = 0; j < 2; j++) assertAlmostEqual(design.codedMatrix[i][j], ref[i][j], 1e-9);
    }
  });
});
