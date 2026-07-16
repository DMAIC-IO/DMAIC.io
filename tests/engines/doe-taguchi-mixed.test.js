/**
 * D.Mike — Taguchi Mixed-Level Tests (V0.4 Phase 4)
 *
 * Verifies that a 2¹·3⁷ Taguchi design (L18) is correctly selected when
 * factors mix two- and three-level levels. The earlier "all-2 or all-3"
 * heuristic falsely classified L18 as a uniform 3-level array.
 *
 * Contract checked here:
 *   1. taguchiCandidates returns L18 for 1×2-level + n×3-level factor sets.
 *   2. Auto-selection routes the same factor sets to L18.
 *   3. Per-factor coding: 2-level columns produce ±1, 3-level columns
 *      produce -1/0/+1 — within the same row.
 *   4. The two-level factor lands in L18's column 0 (the only 2-level slot).
 *   5. Pure 3-level factor sets still use L9 (or L18 when ≥ 5 factors); the
 *      legacy uniform-level call signature still works for back-compat.
 *   6. Pure 2-level factor sets keep using L4 / L8 / L12 / L16 unchanged.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  generateDesign, taguchiDesign, selectTaguchiArray, taguchiCandidates,
} from '../../js/engines/doe-planner-engine.js';

// ─── taguchiCandidates ─────────────────────────────────────────────

suite('taguchiCandidates — picks compatible OAs by level structure', () => {
  test('1×2-level + 3×3-level → L18 is among candidates', () => {
    const cands = taguchiCandidates([2, 3, 3, 3]);
    const names = cands.map(c => c.name);
    assertEqual(names.includes('L18'), true,
      `expected L18 among candidates, got ${JSON.stringify(names)}`);
  });

  test('all 2-level → L4, L8, L12, L16 (depending on count) — never L18', () => {
    const cands = taguchiCandidates([2, 2, 2]);
    const names = cands.map(c => c.name);
    assertEqual(names[0], 'L4');                    // smallest first
    assertEqual(names.includes('L18'), false);      // L18 has only one 2-level column
  });

  test('all 3-level (4 factors) → L9 is the smallest; L18 also valid', () => {
    const cands = taguchiCandidates([3, 3, 3, 3]);
    const names = cands.map(c => c.name);
    assertEqual(names[0], 'L9');
    assertEqual(names.includes('L18'), true);       // L18 has 7 three-level columns
  });

  test('mixed factor count exceeding L18 capacity → empty list', () => {
    // Two 2-level factors cannot fit into L18 (only one 2-level column).
    const cands = taguchiCandidates([2, 2, 3]);
    assertEqual(cands.length, 0);
  });
});

// ─── selectTaguchiArray with mixed factors ─────────────────────────

suite('selectTaguchiArray — mixed-level routing', () => {
  test('1×2-level + 4×3-level routes to L18 with column 0 reserved for the 2-level factor', () => {
    const sel = selectTaguchiArray([2, 3, 3, 3, 3]);
    assertEqual(sel.name, 'L18');
    assertEqual(sel.columnAssignment[0], 0);          // 2-level factor → column 0
    // Remaining factors take columns 1, 2, 3, 4 (the first four 3-level slots).
    for (let i = 1; i < 5; i++) assertEqual(sel.columnAssignment[i], i);
  });

  test('legacy positional call still works: selectTaguchiArray(k, nLevels)', () => {
    const legacy = selectTaguchiArray(3, 2);
    assertEqual(legacy.name, 'L4');                   // smallest 2-level OA covering 3 factors
    assertEqual(legacy.matrix.length, 4);
    assertEqual(legacy.matrix[0].length, 3);
  });
});

// ─── taguchiDesign with mixed factors ──────────────────────────────

suite('taguchiDesign — coded values respect per-column level counts', () => {
  const { codedMatrix, arrayName } = taguchiDesign([2, 3, 3, 3, 3]);

  test('selected array is L18', () => {
    assertEqual(arrayName, 'L18');
    assertEqual(codedMatrix.length, 18);
  });

  test('column 0 (2-level factor) only ever has ±1', () => {
    const allowed = new Set([-1, 1]);
    for (const row of codedMatrix) {
      if (!allowed.has(row[0])) throw new Error(`unexpected 2-level coding ${row[0]}`);
    }
  });

  test('columns 1–4 (3-level factors) only ever have -1, 0, +1', () => {
    const allowed = new Set([-1, 0, 1]);
    for (const row of codedMatrix) {
      for (let j = 1; j < 5; j++) {
        if (!allowed.has(row[j])) throw new Error(`unexpected 3-level coding ${row[j]} at col ${j}`);
      }
    }
  });

  test('each level appears the correct number of times in its column', () => {
    // L18 is balanced: column 0 has 9 zeros and 9 ones (→ 9 of -1 and 9 of +1).
    let neg = 0, pos = 0;
    for (const row of codedMatrix) (row[0] === -1 ? neg++ : pos++);
    assertEqual(neg, 9);
    assertEqual(pos, 9);
    // Every 3-level column must show 6 of each level.
    for (let j = 1; j < 5; j++) {
      const counts = { '-1': 0, '0': 0, '1': 0 };
      for (const row of codedMatrix) counts[String(row[j])]++;
      for (const k of Object.keys(counts)) assertEqual(counts[k], 6, `col ${j} unbalanced at level ${k}`);
    }
  });
});

// ─── End-to-end via generateDesign ────────────────────────────────

suite('generateDesign — Taguchi auto-routes mixed factors to L18', () => {
  const factors = [
    { id: 1, name: 'Tool',  kind: 'categorical', levels: ['Steel', 'HSS'] },
    { id: 2, name: 'Speed', kind: 'continuous',  levels: ['low', 'mid', 'high'] },
    { id: 3, name: 'Feed',  kind: 'continuous',  levels: ['low', 'mid', 'high'] },
  ];
  const design = generateDesign(factors, { designType: 'taguchi', randomize: false, seed: 1 });

  test('resolution label is L18', () => {
    assertEqual(design.resolution, 'L18');
    assertEqual(design.codedMatrix.length, 18);
  });

  test('coded matrix has 3 columns (one per factor)', () => {
    assertEqual(design.codedMatrix[0].length, 3);
  });

  test('Tool column carries ±1, Speed and Feed carry -1/0/+1', () => {
    for (const row of design.codedMatrix) {
      assertEqual([-1, 1].includes(row[0]), true,    `unexpected Tool value ${row[0]}`);
      assertEqual([-1, 0, 1].includes(row[1]), true, `unexpected Speed value ${row[1]}`);
      assertEqual([-1, 0, 1].includes(row[2]), true, `unexpected Feed value ${row[2]}`);
    }
  });
});

// ─── Pure-uniform regression check ────────────────────────────────

suite('Taguchi — uniform factor sets unchanged', () => {
  test('3 × 2-level → L4 (legacy behaviour)', () => {
    const { codedMatrix, arrayName } = taguchiDesign([2, 2, 2]);
    assertEqual(arrayName, 'L4');
    assertEqual(codedMatrix.length, 4);
    for (const row of codedMatrix) for (const v of row) {
      if (v !== -1 && v !== 1) throw new Error(`unexpected value ${v}`);
    }
  });

  test('4 × 3-level → L9 (legacy behaviour)', () => {
    const { codedMatrix, arrayName } = taguchiDesign([3, 3, 3, 3]);
    assertEqual(arrayName, 'L9');
    assertEqual(codedMatrix.length, 9);
    for (const row of codedMatrix) for (const v of row) {
      if (![-1, 0, 1].includes(v)) throw new Error(`unexpected value ${v}`);
    }
  });
});
