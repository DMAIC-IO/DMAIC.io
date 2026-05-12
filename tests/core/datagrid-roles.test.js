/**
 * Tests for the column-role mechanism in
 * js/core/datagrid/datagrid-roles.js and the integration in
 * js/core/datagrid/datagrid.js.
 *
 * The role (continuous / categorical / ordinal / date / identifier /
 * freeText) is the *analytical* interpretation of a column, distinct from
 * its storage type. It feeds the chart-suggestion logic (Phase 3) and
 * downstream stat modules.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';
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

// ─── DataGrid integration tests ────────────────────────────────

function newGrid() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  return { grid, dispose: () => container.remove() };
}

suite('DataGrid roles — initial state', () => {
  test('empty grid columns default to continuous + roleManual=false', () => {
    const { grid, dispose } = newGrid();
    const col = grid.getColumnByIndex(0);
    assertEqual(col.role, ROLE.CONTINUOUS);
    assertEqual(col.roleManual, false);
    dispose();
  });

  test('addColumn() with type=text defaults to freeText', () => {
    const { grid, dispose } = newGrid();
    const col = grid.addColumn({ type: 'text' });
    assertEqual(col.role, ROLE.FREE_TEXT);
    assertEqual(col.roleManual, false);
    dispose();
  });

  test('addColumn({ role: ... }) honors explicit role', () => {
    const { grid, dispose } = newGrid();
    const col = grid.addColumn({ type: 'numeric', role: ROLE.IDENTIFIER });
    assertEqual(col.role, ROLE.IDENTIFIER);
    assertEqual(col.roleManual, false);
    dispose();
  });

  test('addColumn({ role, roleManual: true }) pins the role', () => {
    const { grid, dispose } = newGrid();
    const col = grid.addColumn({ type: 'numeric', role: ROLE.IDENTIFIER, roleManual: true });
    assertEqual(col.role, ROLE.IDENTIFIER);
    assertEqual(col.roleManual, true);
    dispose();
  });
});

suite('DataGrid roles — setData inference', () => {
  test('numeric column with few unique values is inferred as categorical', () => {
    const { grid, dispose } = newGrid();
    grid.setData([
      { id: 'col_m', name: 'Maschine', type: 'numeric', values: [1, 2, 3, 4, 1, 2, 3, 4], format: {} },
    ]);
    assertEqual(grid.getColumn('col_m').role, ROLE.CATEGORICAL);
    dispose();
  });

  test('numeric column with many unique values is inferred as continuous', () => {
    const { grid, dispose } = newGrid();
    const values = Array.from({ length: 40 }, (_, i) => 12.3 + i * 0.7);
    grid.setData([{ id: 'col_y', name: 'Yield', type: 'numeric', values, format: {} }]);
    assertEqual(grid.getColumn('col_y').role, ROLE.CONTINUOUS);
    dispose();
  });

  test('explicit role from setData is preserved', () => {
    const { grid, dispose } = newGrid();
    grid.setData([
      { id: 'col_id', name: 'LotID', type: 'numeric', values: [1, 2, 3, 4],
        role: ROLE.IDENTIFIER, roleManual: true, format: {} },
    ]);
    const col = grid.getColumn('col_id');
    assertEqual(col.role, ROLE.IDENTIFIER);
    assertEqual(col.roleManual, true);
    dispose();
  });
});

suite('DataGrid roles — setColumnRole API', () => {
  test('setColumnRole sets role and roleManual=true', () => {
    const { grid, dispose } = newGrid();
    // 20 unique floats > 10-cap → inferred continuous.
    const values = Array.from({ length: 20 }, (_, i) => i * 1.7);
    grid.setData([{ id: 'col_a', name: 'X', type: 'numeric', values, format: {} }]);
    const col = grid.getColumn('col_a');
    assertEqual(col.role, ROLE.CONTINUOUS);
    grid.setColumnRole('col_a', ROLE.CATEGORICAL);
    assertEqual(col.role, ROLE.CATEGORICAL);
    assertEqual(col.roleManual, true);
    dispose();
  });

  test('setColumnRole emits column:role-changed', () => {
    const { grid, dispose } = newGrid();
    grid.setData([
      { id: 'col_a', name: 'X', type: 'numeric', values: [1, 2, 3, 4], format: {} },
    ]);
    let payload = null;
    grid.on('column:role-changed', (p) => { payload = p; });
    grid.setColumnRole('col_a', ROLE.IDENTIFIER);
    assertEqual(payload?.columnId, 'col_a');
    assertEqual(payload?.newRole, ROLE.IDENTIFIER);
    assertEqual(payload?.auto, false);
    dispose();
  });

  test('setColumnRole rejects invalid role for type (continuous on text)', () => {
    const { grid, dispose } = newGrid();
    // 8 entries, 3 unique → ratio 0.375 < 0.5 → categorical.
    grid.setData([
      { id: 'col_t', name: 'Note', type: 'text',
        values: ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b'], format: {} },
    ]);
    assertEqual(grid.getColumn('col_t').role, ROLE.CATEGORICAL);
    grid.setColumnRole('col_t', ROLE.CONTINUOUS);
    // Role unchanged because continuous is invalid for text columns.
    assertEqual(grid.getColumn('col_t').role, ROLE.CATEGORICAL);
    assertEqual(grid.getColumn('col_t').roleManual, false);
    dispose();
  });

  test('setColumnRole ignores unknown role identifiers', () => {
    const { grid, dispose } = newGrid();
    grid.setData([
      { id: 'col_a', name: 'X', type: 'numeric', values: [1, 2, 3, 4], format: {} },
    ]);
    grid.setColumnRole('col_a', 'bogus-role');
    // Was inferred as categorical (4 unique ≤ 10); should remain so.
    assertEqual(grid.getColumn('col_a').role, ROLE.CATEGORICAL);
    dispose();
  });
});

suite('DataGrid roles — type-change re-inference', () => {
  test('auto-detected role updates when type switches (cell edit)', () => {
    const { grid, dispose } = newGrid();
    grid.setData([
      { id: 'col_a', name: 'X', type: 'numeric', values: [1, 2, 3], format: {} },
    ]);
    assertEqual(grid.getColumn('col_a').role, ROLE.CATEGORICAL);
    // Force a type switch by writing text into the numeric column.
    grid.setCellValue('col_a', 0, 'abc');
    const col = grid.getColumn('col_a');
    assertEqual(col.type, 'text');
    // Role should be re-inferred for the new type.
    assertEqual(['categorical', 'freeText'].includes(col.role), true);
    dispose();
  });

  test('manual role survives type change if still valid', () => {
    const { grid, dispose } = newGrid();
    grid.setData([
      { id: 'col_a', name: 'X', type: 'numeric', values: [1, 2, 1, 2, 1, 2], format: {} },
    ]);
    grid.setColumnRole('col_a', ROLE.IDENTIFIER); // valid for numeric AND text
    assertEqual(grid.getColumn('col_a').roleManual, true);
    grid.setCellValue('col_a', 0, 'abc'); // → text
    const col = grid.getColumn('col_a');
    assertEqual(col.type, 'text');
    assertEqual(col.role, ROLE.IDENTIFIER);
    assertEqual(col.roleManual, true);
    dispose();
  });

  test('manual role is reset if invalid for new type', () => {
    const { grid, dispose } = newGrid();
    grid.setData([
      { id: 'col_a', name: 'X', type: 'numeric', values: [1.1, 2.2, 3.3, 4.4], format: {} },
    ]);
    grid.setColumnRole('col_a', ROLE.CONTINUOUS); // valid for numeric, NOT for text
    assertEqual(grid.getColumn('col_a').roleManual, true);
    grid.setCellValue('col_a', 0, 'abc'); // → text
    const col = grid.getColumn('col_a');
    assertEqual(col.type, 'text');
    assertEqual(col.roleManual, false);
    // Re-inferred to something text-valid
    assertEqual(isRoleValidForType(col.role, 'text'), true);
    dispose();
  });
});

suite('DataGrid roles — persistence and migration', () => {
  test('getState / setState preserve role and roleManual', () => {
    const { grid: g1, dispose: d1 } = newGrid();
    g1.setData([
      { id: 'col_a', name: 'X', type: 'numeric', values: [1, 2, 1, 2], format: {} },
    ]);
    g1.setColumnRole('col_a', ROLE.IDENTIFIER);
    const state = g1.getState();
    d1();

    const { grid: g2, dispose: d2 } = newGrid();
    g2.setState(state);
    const col = g2.getColumn('col_a');
    assertEqual(col.role, ROLE.IDENTIFIER);
    assertEqual(col.roleManual, true);
    d2();
  });

  test('setState infers role for legacy columns lacking the field', () => {
    const { grid, dispose } = newGrid();
    const legacyState = {
      columns: [
        // No role / roleManual — simulates a worksheet saved before this feature.
        { id: 'col_y', name: 'Yield', type: 'numeric',
          values: Array.from({ length: 40 }, (_, i) => 10 + i * 0.5),
          formulas: null, format: {}, shortName: 'C1' },
        { id: 'col_m', name: 'Maschine', type: 'numeric',
          values: [1, 2, 3, 4, 1, 2, 3, 4, 1, 2],
          formulas: null, format: {}, shortName: 'C2' },
      ],
      rowCount: 40,
      colWidths: {},
      sortCol: null,
      sortDir: null,
      selection: null,
    };
    grid.setState(legacyState);
    assertEqual(grid.getColumn('col_y').role, ROLE.CONTINUOUS);
    assertEqual(grid.getColumn('col_m').role, ROLE.CATEGORICAL);
    assertEqual(grid.getColumn('col_y').roleManual, false);
    assertEqual(grid.getColumn('col_m').roleManual, false);
    dispose();
  });
});
