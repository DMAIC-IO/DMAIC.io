/**
 * Unit tests — Worksheet Column Access Core (js/core/worksheet-columns.js)
 *
 * Pins the shared low-level data-access primitives extracted from the GLM,
 * correlation and column-picker consumers:
 *   - resolveColumnRef  — ref → column object (or null on any missing hop)
 *   - getColumnRawValues — column's raw values array (or [])
 *   - coerceNumeric     — plain, type-agnostic cell → number|null coercion
 *
 * These are pure given a mock stateManager; the per-module row-filters that
 * sit on top (correlation pairwise alignment, glm buildFitData) are tested in
 * the respective module test files.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  resolveColumnRef, getColumnRawValues, coerceNumeric,
} from '../../js/core/worksheet-columns.js';

// ── Mock stateManager backed by a single worksheet ──────────────────────────

function makeStateManager(columns) {
  const wsState = {
    sheets: [{ id: 'sheet-1', name: 'Tabelle', state: { columns } }],
  };
  const phases = { measure: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
  return {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice('phases.'.length)] ?? [];
      return undefined;
    },
    getModuleState(id) {
      return id === 'ws-1' ? wsState : null;
    },
  };
}

const REF = (columnId, over = {}) => ({
  instanceId: 'ws-1', sheetId: 'sheet-1', columnId, ...over,
});

function sm() {
  return makeStateManager([
    { id: 'c-x', name: 'X', shortName: 'X', type: 'numeric', values: [1, 2, 3] },
    { id: 'c-cat', name: 'Cat', shortName: 'C', type: 'text', values: ['a', 'b'] },
    { id: 'c-empty', name: 'E', shortName: 'E', type: 'numeric' }, // no values key
  ]);
}

// ── resolveColumnRef ────────────────────────────────────────────────────────

suite('worksheet-columns: resolveColumnRef', () => {
  test('resolves an existing ref to the column object', () => {
    const col = resolveColumnRef(sm(), REF('c-x'));
    assertEqual(col?.id, 'c-x');
    assertEqual(col?.type, 'numeric');
  });

  test('null ref → null', () => {
    assertEqual(resolveColumnRef(sm(), null), null);
  });

  test('null stateManager → null (no throw)', () => {
    assertEqual(resolveColumnRef(null, REF('c-x')), null);
  });

  test('missing worksheet instance → null', () => {
    assertEqual(resolveColumnRef(sm(), REF('c-x', { instanceId: 'nope' })), null);
  });

  test('missing sheet → null', () => {
    assertEqual(resolveColumnRef(sm(), REF('c-x', { sheetId: 'nope' })), null);
  });

  test('missing column → null', () => {
    assertEqual(resolveColumnRef(sm(), REF('nope')), null);
  });

  test('stateManager returning a worksheet without sheets → null', () => {
    const bad = { getModuleState: () => ({}) };
    assertEqual(resolveColumnRef(bad, REF('c-x')), null);
  });
});

// ── getColumnRawValues ──────────────────────────────────────────────────────

suite('worksheet-columns: getColumnRawValues', () => {
  test('returns the raw values array', () => {
    assertEqual(JSON.stringify(getColumnRawValues(sm(), REF('c-x'))), '[1,2,3]');
  });

  test('column without a values key → []', () => {
    assertEqual(JSON.stringify(getColumnRawValues(sm(), REF('c-empty'))), '[]');
  });

  test('unresolvable ref → []', () => {
    assertEqual(JSON.stringify(getColumnRawValues(sm(), REF('nope'))), '[]');
  });

  test('null ref → []', () => {
    assertEqual(JSON.stringify(getColumnRawValues(sm(), null)), '[]');
  });

  test('keeps null/empty cells in place (no filtering)', () => {
    const m = makeStateManager([
      { id: 'c', name: 'C', shortName: 'C', type: 'numeric', values: [1, null, '', 4] },
    ]);
    assertEqual(JSON.stringify(getColumnRawValues(m, REF('c'))), '[1,null,"",4]');
  });
});

// ── coerceNumeric (plain, type-agnostic) ────────────────────────────────────

suite('worksheet-columns: coerceNumeric', () => {
  test('finite numbers pass through', () => {
    assertEqual(coerceNumeric(7), 7);
    assertEqual(coerceNumeric(0), 0);
    assertEqual(coerceNumeric(-3.5), -3.5);
  });

  test('numeric strings are parsed', () => {
    assertEqual(coerceNumeric('3.5'), 3.5);
    assertEqual(coerceNumeric('42'), 42);
    assertEqual(coerceNumeric('  10  '), 10); // Number() trims
  });

  test('empty / null / undefined → null', () => {
    assertEqual(coerceNumeric(''), null);
    assertEqual(coerceNumeric(null), null);
    assertEqual(coerceNumeric(undefined), null);
  });

  test('non-numeric strings → null', () => {
    assertEqual(coerceNumeric('abc'), null);
    assertEqual(coerceNumeric('1,5'), null); // comma decimals NOT parsed
  });

  test('NaN number → null', () => {
    assertEqual(coerceNumeric(NaN), null);
  });

  test('±Infinity passes through (number, not NaN) — matches legacy toNumeric', () => {
    // A genuine Infinity value is `typeof number` and not NaN, so it falls
    // through the fast-path unchanged. This pins the byte-identical behaviour
    // of the original glm/correlation coercion (no consumer feeds Infinity in
    // practice, but the contract must not silently change).
    assertEqual(coerceNumeric(Infinity), Infinity);
    assertEqual(coerceNumeric(-Infinity), -Infinity);
  });

  test('the string "Infinity" → null (Number() yields a non-finite)', () => {
    assertEqual(coerceNumeric('Infinity'), null);
  });
});
