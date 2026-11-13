/**
 * DataGrid: Tastenkürzel nur bei sichtbarem Container oder Fokus darin.
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import { DataGrid } from '../../../js/core/datagrid/datagrid.js';

function newGrid({ hidden }) {
  const container = document.createElement('div');
  if (hidden) container.style.display = 'none';
  document.body.appendChild(container);
  document.activeElement?.blur?.();
  const grid = new DataGrid(container);
  grid.setData([{ id: 'col_a', name: 'Yield', type: 'numeric', values: [1, 2], format: {} }]);
  let undone = 0;
  grid.undo = () => { undone += 1; };
  return { grid, undone: () => undone, dispose: () => { grid.destroy?.(); container.remove(); } };
}

const ctrlZ = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));

suite('DataGrid — Tastatur bei verstecktem Container', () => {
  test('Container display:none, Fokus body: Strg+Z ruft undo nicht', () => {
    const g = newGrid({ hidden: true });
    try { ctrlZ(); assertEqual(g.undone(), 0); } finally { g.dispose(); }
  });

  test('Container sichtbar, Fokus body: Strg+Z ruft undo', () => {
    const g = newGrid({ hidden: false });
    try { ctrlZ(); assertEqual(g.undone(), 1); } finally { g.dispose(); }
  });
});
