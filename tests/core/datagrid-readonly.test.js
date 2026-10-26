/**
 * Tests for DataGrid behaviour inside a read-only project (Bug 023).
 *
 * The grid listens on `document` for keys and paste and renders its context
 * menu into `body`, so the generic module-area lock cannot reach it — the grid
 * has to check `isReadOnly()` itself.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

function newGrid({ readOnly = true } = {}) {
  const wrapper = document.createElement('div');
  if (readOnly) wrapper.classList.add('dmike--readonly');
  const container = document.createElement('div');
  wrapper.append(container);
  document.body.appendChild(wrapper);
  // The grid ignores keys while focus sits in other UI (e.g. the runner page).
  document.activeElement?.blur?.();
  const grid = new DataGrid(container);
  grid.setData([
    { id: 'col_a', name: 'Yield', type: 'numeric', values: [10, 20, 30], format: {} },
  ]);
  grid.setSelection({ startCol: 0, startRow: 0, endCol: 0, endRow: 0, activeCol: 0, activeRow: 0 });
  return {
    grid,
    value: (row) => grid.getColumn('col_a').values[row],
    dispose: () => { grid._closeContextMenu(); grid.destroy?.(); wrapper.remove(); },
  };
}

function key(k, opts = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
}

function clipboardEvent(type, text = '') {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  return new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true });
}

function menuLabels() {
  return [...document.querySelectorAll('.context-menu .context-menu__item')].map(el => el.textContent);
}

suite('DataGrid read-only — edits refused', () => {
  test('no cell editor opens', () => {
    const { grid, dispose } = newGrid();
    grid._startEdit(0, 0);
    assertEqual(grid.editingCell, null);
    key('7');
    assertEqual(grid.editingCell, null);
    dispose();
  });

  test('Delete leaves the cell untouched', () => {
    const { value, dispose } = newGrid();
    key('Delete');
    assertEqual(value(0), 10);
    dispose();
  });

  test('paste leaves the cell untouched', () => {
    const { grid, value, dispose } = newGrid();
    grid._onPaste(clipboardEvent('paste', '99'));
    assertEqual(value(0), 10);
    dispose();
  });

  test('cut copies but does not clear', () => {
    const { grid, value, dispose } = newGrid();
    const ev = clipboardEvent('cut');
    grid._onCut(ev);
    assertEqual(value(0), 10);
    assertEqual(ev.clipboardData.getData('text/plain').includes('10'), true);
    dispose();
  });

  test('no header rename editor opens', () => {
    const { grid, dispose } = newGrid();
    const th = grid.container.querySelector('th[data-col-idx="0"]');
    grid._startHeaderEdit(0, th);
    assertEqual(Boolean(grid._editingHeader), false);
    dispose();
  });

  test('body context menu is not shown', () => {
    const { grid, dispose } = newGrid();
    const td = grid.container.querySelector('td[data-col-idx="0"][data-row-idx="0"]')
      ?? grid.container.querySelector('td');
    grid._onBodyContextMenu({ preventDefault() {}, target: td, clientX: 0, clientY: 0 });
    assertEqual(menuLabels().length, 0);
    dispose();
  });

  test('header context menu offers only stats and scan', () => {
    const { grid, dispose } = newGrid();
    const th = grid.container.querySelector('th[data-col-idx="0"]');
    grid._onHeaderContextMenu({ preventDefault() {}, target: th, clientX: 0, clientY: 0 });
    assertEqual(menuLabels().length, 2);
    dispose();
  });
});

suite('DataGrid read-only — viewing still works', () => {
  test('arrow keys still move the selection', () => {
    const { grid, dispose } = newGrid();
    key('ArrowDown');
    assertEqual(grid.selection.activeRow, 1);
    dispose();
  });

  test('outside read-only the editor opens as before', () => {
    const { grid, dispose } = newGrid({ readOnly: false });
    grid._startEdit(0, 0);
    assertEqual(grid.editingCell !== null, true);
    dispose();
  });
});

suite('DataGrid — nicht reaktiv (Bug 14)', () => {
  test('eine neue Instanz ist als nicht reaktiv markiert', () => {
    const { grid, dispose } = newGrid({ readOnly: false });
    assertEqual(grid.__v_skip, true);
    dispose();
  });
});
