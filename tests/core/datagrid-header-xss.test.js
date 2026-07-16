/**
 * XSS regression for the DataGrid header.
 *
 * The legacy header renderer interpolated `col.name`, `col.unit`, and
 * `col.shortName` RAW into a string assigned to `thead.innerHTML`. A column
 * named `<img src=x onerror=…>` therefore created a live <img> in the DOM and
 * executed the handler. After the DOM-builder rewrite the column name must be
 * inserted as text only: no <img>, no handler firing, literal text preserved.
 *
 * Runs in the browser test runner with a detached <div> host.
 */

import { suite, test, assertTrue, assertEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

const XSS_NAME = '<img src=x onerror="window.__xss=1">';

function newGrid(colName) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  grid.setData([
    { id: 'col_x', name: colName, type: 'text', values: ['a', 'b'], format: {} },
  ]);
  grid.render();
  return { grid, container, dispose: () => container.remove() };
}

suite('DataGrid header — XSS hardening', () => {
  test('malicious column name does not create an <img> in the header', () => {
    window.__xss = 0;
    const { grid, dispose } = newGrid(XSS_NAME);
    try {
      const img = grid.theadEl.querySelector('img:not([data-icon])');
      assertEqual(img, null, 'no raw <img> element must exist in the header');
    } finally {
      dispose();
    }
  });

  test('malicious column name does not execute its handler', async () => {
    window.__xss = 0;
    const { dispose } = newGrid(XSS_NAME);
    // Give any (erroneously created) <img> a tick to fire onerror.
    await new Promise((r) => setTimeout(r, 0));
    try {
      assertTrue(!window.__xss, 'window.__xss must stay falsy (handler did not run)');
    } finally {
      dispose();
    }
  });

  test('malicious column name is preserved as literal text', () => {
    const { grid, dispose } = newGrid(XSS_NAME);
    try {
      const th = grid.theadEl.querySelector('th[data-col-idx="0"]');
      assertTrue(th != null, 'data column header <th> must exist');
      assertTrue(
        th.textContent.includes('onerror'),
        'the literal column-name string must appear as text content',
      );
    } finally {
      dispose();
    }
  });
});
