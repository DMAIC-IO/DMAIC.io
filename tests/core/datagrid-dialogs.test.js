/**
 * DataGrid column scan / column stats open through the injected dialog service.
 */
import { suite, test, assertEqual, assertTrue, afterEach } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

function recorder() {
  const calls = [];
  return {
    calls,
    show(opts) {
      const entry = { opts, open: true, titles: [opts.title] };
      calls.push(entry);
      return {
        close() { if (!entry.open) return; entry.open = false; opts.onClose?.(); },
        setTitle(t) { entry.titles.push(t); },
      };
    },
  };
}

function gridWith(dialog) {
  const el = document.createElement('div');
  document.body.append(el);
  const grid = new DataGrid(el, { dialog });
  grid.columns[0].values = [1, 2, 3];
  grid.render();
  return { grid, el };
}

suite('DataGrid — column dialogs', () => {
  let cleanup = [];
  afterEach(() => { for (const f of cleanup) f(); cleanup = []; });

  test('column stats open one compact dialog', () => {
    const d = recorder();
    const { grid, el } = gridWith(d);
    cleanup.push(() => { grid.destroy(); el.remove(); });
    grid._showColumnStats(0);
    assertEqual(d.calls.length, 1);
    assertEqual(d.calls[0].opts.size, 'compact');
    assertTrue(d.calls[0].opts.content.querySelector('.column-scan__subtitle') !== null);
  });

  test('column scan title follows a render; close unregisters the handler', () => {
    const d = recorder();
    const { grid, el } = gridWith(d);
    cleanup.push(() => { grid.destroy(); el.remove(); });
    grid._showColumnScan(0);
    const entry = d.calls[0];
    const before = entry.titles.length;
    grid.columns[0].name = 'Länge';
    grid.render();
    assertTrue(entry.titles.length > before, 'setTitle called on render');
    assertTrue(entry.titles.at(-1).includes('Länge'));
    grid._closeColumnScan();
    assertEqual(entry.open, false);
    assertEqual(grid._columnScanState, null);
    const n = entry.titles.length;
    grid.render();
    assertEqual(entry.titles.length, n, 'no refresh after close');
  });

  test('dismissing the scan dialog (✕/Escape) clears the state', () => {
    const d = recorder();
    const { grid, el } = gridWith(d);
    cleanup.push(() => { grid.destroy(); el.remove(); });
    grid._showColumnScan(0);
    d.calls[0].opts.onClose();                      // what the service calls on ✕/Escape
    assertEqual(grid._columnScanState, null);
    assertEqual(grid._columnScanRenderHandler, null);
  });

  test('without a dialog service nothing opens', () => {
    const { grid, el } = gridWith(undefined);
    cleanup.push(() => { grid.destroy(); el.remove(); });
    grid._showColumnScan(0);
    grid._showColumnStats(0);
    assertEqual(grid._columnScanState ?? null, null);
    assertEqual(document.querySelector('.column-scan-overlay'), null);
  });
});
