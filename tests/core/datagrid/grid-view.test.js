/** Virtualisiertes Zeichnen (core/datagrid/view/grid-view.js). Läuft im Browser. */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { TableData } from '../../../js/core/table-data.js';
import { createGridView } from '../../../js/core/datagrid/view/grid-view.js';

const N = 100000;
const mkCols = () => [
  { id: 'a', name: 'Wert', shortName: 'A', type: 'numeric', unit: 'mm', format: { decimals: 1 }, role: 'continuous' },
  { id: 'b', name: 'Text', shortName: 'B', type: 'text', format: {}, lock: 'hard' },
];
function mk(n = N) {
  const a = Array.from({ length: n }, (_, i) => i);
  const b = Array.from({ length: n }, (_, i) => `t${i}`);
  return new TableData(n, [a, b]);
}
// Der Runner lädt die Datagrid-Stylesheets nicht; ohne sie ist der Scrollbereich nicht begrenzt.
const loads = [];
for (const f of ['datagrid.css', 'view/grid-view.css']) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL(`../../../js/core/datagrid/${f}`, import.meta.url).href;
  loads.push(new Promise((res) => { l.onload = res; l.onerror = res; }));
  document.head.appendChild(l);
}
const cssReady = Promise.all(loads);
function setup(n = N) {
  const host = document.createElement('div');
  host.style.cssText = 'height:400px;width:600px;display:flex;flex-direction:column';
  document.body.appendChild(host);
  const view = createGridView(host, { t: (k) => k.split('.').pop(), lang: 'en' });
  const table = mk(n);
  const cols = mkCols();
  const f = {};
  view.draw(table, cols, f, {});
  return { host, view, table, cols, f, done: () => { view.destroy(); host.remove(); } };
}

suite('GridView — virtualisiertes Zeichnen', () => {
  test('bei 100 000 Zeilen stehen nur wenige Zeilen im DOM', async () => {
    await cssReady;
    const s = setup();
    try {
      const rows = s.host.querySelectorAll('tbody tr[data-pool]').length;
      assertTrue(rows > 0 && rows <= 400 / 20 + 20 + 2, `Zeilen im DOM: ${rows}`);
    } finally { s.done(); }
  });

  test('scrollToRow(50000) zeigt die Zeile mit formatiertem Wert', async () => {
    await cssReady;
    const s = setup();
    try {
      s.view.scrollToRow(50000);
      const td = s.view.cellAt(0, 50000);
      assertTrue(td !== null, 'Zelle vorhanden');
      assertEqual(td.dataset.rowIdx, '50000');
      assertEqual(td.textContent, '50000.0');
      assertEqual(s.host.querySelector('td[data-col-idx="1"][data-row-idx="50000"]').textContent, 't50000');
      assertEqual(s.view.cellAt(0, 5), null);
    } finally { s.done(); }
  });

  test('draw mit gleicher rev setzt keinen Text neu', async () => {
    await cssReady;
    const s = setup();
    try {
      const td = s.view.cellAt(0, 3);
      let writes = 0;
      const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty(td, 'textContent', { configurable: true, get() { return desc.get.call(this); }, set(v) { writes++; desc.set.call(this, v); } });
      s.view.draw(s.table, s.cols, s.f, {});
      assertEqual(writes, 0);
      s.view.draw(s.table, s.cols);
      assertEqual(writes, 0);
      s.table.columns[0][3] = 99; s.table.rev++;
      s.view.draw(s.table, s.cols, s.f, {});
      assertEqual(writes, 1);
      assertEqual(td.textContent, '99.0');
    } finally { s.done(); }
  });

  test('Kopf mit Typabzeichen, Einheit und Sperre wie heute', async () => {
    await cssReady;
    const s = setup();
    try {
      const th = s.host.querySelector('thead th[data-col-idx="0"]');
      assertTrue(th !== null);
      assertTrue(th.querySelector('.col-type-badge') !== null, 'Typabzeichen');
      assertEqual(th.querySelector('.col-unit').textContent, '[mm]');
      assertEqual(th.querySelector('.col-id').textContent, 'A');
      const locked = s.host.querySelector('thead th[data-col-idx="1"]');
      assertTrue(locked.classList.contains('col-locked'));
      assertTrue(locked.classList.contains('col-locked--hard'));
      assertTrue(locked.querySelector('.col-lock-icon') !== null);
      assertTrue(s.view.cellAt(1, 0).classList.contains('cell-locked--hard'));
    } finally { s.done(); }
  });

  test('Formelzelle trägt Klasse und Titel; rowAtY liefert Datenindex', async () => {
    await cssReady;
    const s = setup(50);
    try {
      s.view.draw(s.table, s.cols, { a: { 2: '=1+1' } }, {});
      const td = s.view.cellAt(0, 2);
      assertTrue(td.classList.contains('cell-formula'));
      assertEqual(td.title, '=1+1');
      assertEqual(s.view.rowAtY(0), 0);
    } finally { s.done(); }
  });

  test('bei ungerader Zeilenzahl wird die letzte Zeile gezeichnet', async () => {
    await cssReady;
    const s = setup(100001);
    try {
      s.view.scrollToRow(100000);
      const td = s.view.cellAt(0, 100000);
      assertTrue(td !== null, 'letzte Zelle vorhanden');
      assertEqual(td.textContent, '100000.0');
    } finally { s.done(); }
  });

  test('geändertes Format zeichnet bei gleicher rev neu', async () => {
    await cssReady;
    const s = setup(50);
    try {
      assertEqual(s.view.cellAt(0, 3).textContent, '3.0');
      const cols = [{ ...s.cols[0], format: { decimals: 2 } }, s.cols[1]];
      s.view.draw(s.table, cols, s.f, {});
      assertEqual(s.view.cellAt(0, 3).textContent, '3.00');
    } finally { s.done(); }
  });
});
