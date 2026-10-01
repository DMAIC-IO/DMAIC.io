/**
 * Tests for the column-role heuristics in js/core/datagrid/datagrid-roles.js.
 * DOM-free — runs in the node lane. The DataGrid integration lives in
 * datagrid-roles-grid.test.js (needs a DOM container).
 *
 * The role (continuous / categorical / ordinal / date / identifier /
 * freeText) is the *analytical* interpretation of a column, distinct from
 * its storage type. It feeds the chart-suggestion logic (Phase 3) and
 * downstream stat modules.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  ROLE, ALL_ROLES, inferRole, defaultRoleForType, isRoleValidForType,
} from '../../js/core/datagrid/datagrid-roles.js';

// ─── Pure heuristic tests ──────────────────────────────────────

suite('datagrid-roles — inferRole heuristic', () => {
  test('binary always → categorical', () => {
    assertEqual(inferRole({ type: 'binary', values: [] }), ROLE.CATEGORICAL);
    assertEqual(inferRole({ type: 'binary', values: [0, 1, 0, 1] }), ROLE.CATEGORICAL);
  });

  test('date / time always → date', () => {
    assertEqual(inferRole({ type: 'date', values: ['2026-01-01'] }), ROLE.DATE);
    assertEqual(inferRole({ type: 'time', values: ['12:00:00'] }), ROLE.DATE);
    assertEqual(inferRole({ type: 'date', values: [] }), ROLE.DATE);
  });

  test('numeric with ≤ 10 unique values → categorical (Maschine 1,2,3,4)', () => {
    const values = [];
    for (let i = 0; i < 100; i++) values.push((i % 4) + 1);
    assertEqual(inferRole({ type: 'numeric', values }), ROLE.CATEGORICAL);
  });

  test('numeric with > 10 unique values → continuous', () => {
    const values = [];
    for (let i = 0; i < 50; i++) values.push(i * 1.7);
    assertEqual(inferRole({ type: 'numeric', values }), ROLE.CONTINUOUS);
  });

  test('numeric exactly at threshold (10 unique) → categorical', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3];
    assertEqual(inferRole({ type: 'numeric', values }), ROLE.CATEGORICAL);
  });

  test('empty numeric column → continuous (default)', () => {
    assertEqual(inferRole({ type: 'numeric', values: [] }), ROLE.CONTINUOUS);
    assertEqual(inferRole({ type: 'numeric', values: [null, null] }), ROLE.CONTINUOUS);
  });

  test('currency / percent follow numeric heuristic', () => {
    const few = [1, 2, 1, 2, 1, 2];
    assertEqual(inferRole({ type: 'currency', values: few }), ROLE.CATEGORICAL);
    assertEqual(inferRole({ type: 'percent',  values: few }), ROLE.CATEGORICAL);
    const many = Array.from({ length: 30 }, (_, i) => i * 0.7);
    assertEqual(inferRole({ type: 'currency', values: many }), ROLE.CONTINUOUS);
    assertEqual(inferRole({ type: 'percent',  values: many }), ROLE.CONTINUOUS);
  });

  test('text with low cardinality → categorical', () => {
    const values = [];
    for (let i = 0; i < 100; i++) values.push(['A', 'B', 'C'][i % 3]);
    assertEqual(inferRole({ type: 'text', values }), ROLE.CATEGORICAL);
  });

  test('text with high cardinality → freeText', () => {
    const values = Array.from({ length: 60 }, (_, i) => `note-${i}`);
    assertEqual(inferRole({ type: 'text', values }), ROLE.FREE_TEXT);
  });

  test('text just over unique-count cap (51 unique) → freeText', () => {
    const values = [];
    for (let i = 0; i < 200; i++) values.push(`tag-${i % 51}`);
    // 51 unique > 50 cap → freeText regardless of ratio
    assertEqual(inferRole({ type: 'text', values }), ROLE.FREE_TEXT);
  });

  test('empty text column → freeText (default)', () => {
    assertEqual(inferRole({ type: 'text', values: [] }), ROLE.FREE_TEXT);
  });

  test('null / empty-string entries are ignored', () => {
    // 6 non-null values, 2 unique → ratio 0.33 < 0.5 → categorical.
    const values = [null, '', 'A', 'B', 'A', null, 'B', 'A', 'A'];
    assertEqual(inferRole({ type: 'text', values }), ROLE.CATEGORICAL);
  });
});

suite('datagrid-roles — defaultRoleForType', () => {
  test('returns expected defaults per type', () => {
    assertEqual(defaultRoleForType('numeric'),  ROLE.CONTINUOUS);
    assertEqual(defaultRoleForType('currency'), ROLE.CONTINUOUS);
    assertEqual(defaultRoleForType('percent'),  ROLE.CONTINUOUS);
    assertEqual(defaultRoleForType('binary'),   ROLE.CATEGORICAL);
    assertEqual(defaultRoleForType('date'),     ROLE.DATE);
    assertEqual(defaultRoleForType('time'),     ROLE.DATE);
    assertEqual(defaultRoleForType('text'),     ROLE.FREE_TEXT);
  });
});

suite('datagrid-roles — isRoleValidForType', () => {
  test('continuous is numeric-only', () => {
    assertEqual(isRoleValidForType(ROLE.CONTINUOUS, 'numeric'), true);
    assertEqual(isRoleValidForType(ROLE.CONTINUOUS, 'currency'), true);
    assertEqual(isRoleValidForType(ROLE.CONTINUOUS, 'text'),    false);
    assertEqual(isRoleValidForType(ROLE.CONTINUOUS, 'binary'),  false);
    assertEqual(isRoleValidForType(ROLE.CONTINUOUS, 'date'),    false);
  });

  test('categorical valid for numeric and text but not date', () => {
    assertEqual(isRoleValidForType(ROLE.CATEGORICAL, 'numeric'), true);
    assertEqual(isRoleValidForType(ROLE.CATEGORICAL, 'text'),    true);
    assertEqual(isRoleValidForType(ROLE.CATEGORICAL, 'binary'),  true);
    assertEqual(isRoleValidForType(ROLE.CATEGORICAL, 'date'),    false);
  });

  test('binary only accepts categorical', () => {
    assertEqual(isRoleValidForType(ROLE.CATEGORICAL, 'binary'), true);
    assertEqual(isRoleValidForType(ROLE.ORDINAL,     'binary'), false);
    assertEqual(isRoleValidForType(ROLE.CONTINUOUS,  'binary'), false);
  });

  test('date type only accepts date role', () => {
    assertEqual(isRoleValidForType(ROLE.DATE,        'date'), true);
    assertEqual(isRoleValidForType(ROLE.CATEGORICAL, 'date'), false);
  });

  test('all roles are in ALL_ROLES', () => {
    assertEqual(ALL_ROLES.includes(ROLE.CONTINUOUS),  true);
    assertEqual(ALL_ROLES.includes(ROLE.CATEGORICAL), true);
    assertEqual(ALL_ROLES.includes(ROLE.ORDINAL),     true);
    assertEqual(ALL_ROLES.includes(ROLE.DATE),        true);
    assertEqual(ALL_ROLES.includes(ROLE.IDENTIFIER),  true);
    assertEqual(ALL_ROLES.includes(ROLE.FREE_TEXT),   true);
    assertEqual(ALL_ROLES.length, 6);
  });
});
