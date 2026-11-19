/** Bedienung des Rasters (core/datagrid/view/grid-input.js). Läuft im Browser. */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { TableData } from '../../../js/core/table-data.js';
import { createGridView } from '../../../js/core/datagrid/view/grid-view.js';
import { createGridInput } from '../../../js/core/datagrid/view/grid-input.js';

const N = 10000;
const mkCols = () => [
  { id: 'a', name: 'Wert', shortName: 'A', type: 'numeric', format: {} },
  { id: 'b', name: 'Text', shortName: 'B', type: 'text', format: {} },
  { id: 'c', name: 'Gesperrt', shortName: 'C', type: 'numeric', format: {}, lock: 'hard', reason: 'run-order' },
];
function mkTable(n = N) {
  return new TableData(n, [
    Array.from({ length: n }, (_, i) => i),
    Array.from({ length: n }, (_, i) => `t${i}`),
    Array.from({ length: n }, (_, i) => i * 2),
  ]);
}
const loads = [];
for (const f of ['datagrid.css', 'view/grid-view.css']) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL(`../../../js/core/datagrid/${f}`, import.meta.url).href;
  loads.push(new Promise((res) => { l.onload = res; l.onerror = res; }));
  document.head.appendChild(l);
}
const cssReady = Promise.all(loads);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(opts = {}) {
  await cssReady;
  const host = document.createElement('div');
  host.style.cssText = 'height:400px;width:700px;display:flex;flex-direction:column';
  document.body.appendChild(host);
  const view = createGridView(host, { t: (k) => k.split('.').pop(), lang: 'en' });
  const calls = [];
  const emit = (role, args) => { calls.push([role, args]); };
  const input = createGridInput(view, {
    emit, features: opts.features || {}, readOnly: Boolean(opts.readOnly),
    contextMenu: opts.contextMenu || [], t: (k) => k.split('.').pop(), dialog: opts.dialog || null,
    roles: opts.roles || null,
  });
  const table = mkTable(opts.n);
  input.setView({ table, columns: mkCols(), formulas: opts.formulas || {}, colWidths: {}, selection: null, lang: 'en' });
  const el = view.el;
  const roles = () => calls.map((c) => c[0]);
  return {
    host, view, input, el, calls, roles, table, cols: mkCols(),
    done: () => { input.destroy(); view.destroy(); host.remove(); document.querySelectorAll('.context-menu, .attr-picker').forEach((m) => m.remove()); },
  };
}

const center = (node) => {
  const r = node.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};
function mouse(target, type, extra = {}) {
  const pos = extra.clientX != null ? {} : center(target);
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...pos, ...extra }));
}
function key(target, k, extra = {}) {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(ev);
  return ev;
}
const cell = (s, c, r) => s.view.cellAt(c, r);
function clickCell(s, c, r, extra = {}) {
  const td = cell(s, c, r);
  mouse(td, 'mousedown', extra);
  mouse(td, 'mouseup', extra);
}

suite('GridInput — Bedienung meldet Kommandos', () => {
  test('Tippen und Enter meldet setCells', async () => {
    const s = await setup();
    try {
      clickCell(s, 0, 2);
      key(document.activeElement, '4');
      const ed = s.el.querySelector('.cell-editor');
      assertTrue(ed !== null, 'Editor offen');
      assertEqual(ed.value, '4');
      ed.value = '42';
      key(ed, 'Enter');
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['setCells', { columnId: 'a', startRow: 2, values: ['42'] }]]);
      assertEqual(s.el.querySelector('.cell-editor'), null);
      assertTrue(cell(s, 0, 3).classList.contains('cell-active'), 'Auswahl eine Zeile tiefer');
    } finally { s.done(); }
  });

  test('Text mit = meldet setFormula', async () => {
    const s = await setup();
    try {
      clickCell(s, 1, 0);
      key(document.activeElement, '=');
      const ed = s.el.querySelector('.cell-editor');
      ed.value = '=A1*2';
      key(ed, 'Enter');
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['setFormula', { columnId: 'b', row: 0, formula: '=A1*2' }]]);
    } finally { s.done(); }
  });

  test('Strg+V mit TSV meldet pasteBlock', async () => {
    const s = await setup();
    try {
      clickCell(s, 0, 5);
      const dt = new DataTransfer();
      dt.setData('text/plain', '1\tx\n2\ty\n');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['pasteBlock', { columnId: 'a', startRow: 5, rows: [['1', 'x'], ['2', 'y']] }]]);
    } finally { s.done(); }
  });

  test('Einfügen über eine gesperrte Spalte meldet die Sperre und sendet trotzdem pasteBlock', async () => {
    const s = await setup();
    try {
      const seen = [];
      s.el.addEventListener('cell:edit-blocked', (e) => seen.push(e.detail));
      clickCell(s, 1, 3);
      const dt = new DataTransfer();
      dt.setData('text/plain', 'x\t9\ny\t8\n');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      assertEqual(seen.length, 1);
      assertEqual(seen[0].columnId, 'c');
      assertEqual(seen[0].action, 'paste');
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['pasteBlock', { columnId: 'b', startRow: 3, rows: [['x', '9'], ['y', '8']] }]]);
    } finally { s.done(); }
  });

  test('Einfügen nur in gesperrte Spalten meldet die Sperre und sendet nichts', async () => {
    const s = await setup();
    try {
      const seen = [];
      s.el.addEventListener('cell:edit-blocked', (e) => seen.push(e.detail));
      clickCell(s, 2, 3);
      const dt = new DataTransfer();
      dt.setData('text/plain', '9\n8\n');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      assertEqual(seen.length, 1);
      assertEqual(seen[0].action, 'paste');
      assertEqual(s.calls.filter((c) => c[0] !== 'gridView').length, 0);
    } finally { s.done(); }
  });

  test('Strg+C schreibt die Auswahl als TSV', async () => {
    const s = await setup();
    try {
      clickCell(s, 0, 1);
      mouse(cell(s, 1, 2), 'mousedown', { shiftKey: true });
      const dt = new DataTransfer();
      document.activeElement.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      assertEqual(dt.getData('text/plain'), '1\tt1\n2\tt2');
      assertEqual(s.calls.filter((c) => c[0] !== 'gridView').length, 0);
    } finally { s.done(); }
  });

  test('Ziehen am Ausfüllgriff über drei Zeilen meldet fillRange', async () => {
    const s = await setup();
    try {
      clickCell(s, 0, 1);
      mouse(cell(s, 0, 2), 'mousedown', { shiftKey: true });
      mouse(cell(s, 0, 2), 'mouseup');
      const handle = s.el.querySelector('.datagrid__fill-handle');
      assertTrue(handle !== null, 'Griff vorhanden');
      mouse(handle, 'mousedown');
      mouse(document, 'mousemove', center(cell(s, 0, 5)));
      assertTrue(s.el.querySelector('.datagrid__fill-preview')?.style.display !== 'none', 'Vorschau sichtbar');
      mouse(document, 'mouseup', center(cell(s, 0, 5)));
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['fillRange', {
        source: { c0: 0, r0: 1, c1: 0, r1: 2 }, target: { c0: 0, r0: 1, c1: 0, r1: 5 }, ctrl: false,
      }]]);
    } finally { s.done(); }
  });

  test('Esc bricht das Ausfüllziehen ab', async () => {
    const s = await setup();
    try {
      clickCell(s, 0, 1);
      mouse(s.el.querySelector('.datagrid__fill-handle'), 'mousedown');
      mouse(document, 'mousemove', center(cell(s, 0, 4)));
      key(document.activeElement, 'Escape');
      mouse(document, 'mouseup', center(cell(s, 0, 4)));
      assertEqual(s.calls.filter((c) => c[0] === 'fillRange').length, 0);
    } finally { s.done(); }
  });

  test('Entf meldet clearRange', async () => {
    const s = await setup();
    try {
      clickCell(s, 0, 3);
      mouse(cell(s, 1, 4), 'mousedown', { shiftKey: true });
      key(document.activeElement, 'Delete');
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['clearRange', { c0: 0, r0: 3, c1: 1, r1: 4 }]]);
    } finally { s.done(); }
  });

  test('Shift+Klick über eine nicht gezeichnete Zeile rahmt beide ein', async () => {
    const s = await setup();
    try {
      clickCell(s, 0, 2);
      s.view.scrollToRow(5000);
      assertEqual(cell(s, 0, 2), null, 'Zeile 2 ist nicht mehr gezeichnet');
      mouse(cell(s, 1, 5000), 'mousedown', { shiftKey: true });
      assertTrue(cell(s, 1, 5000).classList.contains('cell-selected'), 'Endzelle gewählt');
      assertTrue(cell(s, 0, 4990).classList.contains('cell-selected'), 'Zwischenzelle gewählt');
      const frame = s.el.querySelector('.datagrid__selection-frame');
      const rh = s.view.rowHeight();
      assertEqual(Math.round(parseFloat(frame.style.height)), Math.round(4999 * rh));
      s.view.scrollToRow(0);
      assertTrue(cell(s, 0, 2).classList.contains('cell-active'), 'Anker bleibt aktiv');
      assertTrue(cell(s, 1, 3).classList.contains('cell-selected'));
      await wait(350);
      const gv = s.calls.filter((c) => c[0] === 'gridView').pop();
      assertTrue(Boolean(gv), 'gridView gemeldet');
      assertDeepEqual(gv[1].selection, { startCol: 0, startRow: 2, endCol: 1, endRow: 5000, activeCol: 0, activeRow: 2, extraCols: [] });
    } finally { s.done(); }
  });

  test('Strg+Z im Raster meldet nichts (globaler Verlauf, R8)', async () => {
    const s = await setup();
    try {
      clickCell(s, 0, 0);
      const ev = key(document.activeElement, 'z', { ctrlKey: true });
      assertEqual(s.calls.filter((c) => c[0] !== 'gridView').length, 0);
      assertEqual(ev.defaultPrevented, false);
    } finally { s.done(); }
  });

  test('readOnly: keine Eingabe meldet etwas', async () => {
    const s = await setup({ readOnly: true });
    try {
      clickCell(s, 0, 1);
      key(document.activeElement, '5');
      assertEqual(s.el.querySelector('.cell-editor'), null, 'kein Editor');
      key(document.activeElement, 'Delete');
      const dt = new DataTransfer();
      dt.setData('text/plain', '1\n2');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      mouse(cell(s, 0, 1), 'dblclick');
      const fh = s.el.querySelector('.datagrid__fill-handle');
      assertTrue(!fh || fh.hidden, 'kein Griff');
      await wait(350);
      assertDeepEqual(s.calls, []);
    } finally { s.done(); }
  });

  test('gesperrte Spalte: kein Editor, sondern cell:edit-blocked', async () => {
    const s = await setup();
    try {
      const seen = [];
      s.el.addEventListener('cell:edit-blocked', (e) => seen.push(e.detail));
      clickCell(s, 2, 1);
      key(document.activeElement, '7');
      mouse(cell(s, 2, 1), 'dblclick');
      assertEqual(s.el.querySelector('.cell-editor'), null);
      assertEqual(seen.length, 2);
      assertEqual(seen[0].columnId, 'c');
      assertEqual(seen[0].rowIndex, 1);
      assertEqual(seen[0].lock, 'hard');
      assertTrue(typeof seen[0].message === 'string' && seen[0].message.length > 0, 'Meldungstext');
      assertEqual(s.calls.filter((c) => c[0] !== 'gridView').length, 0);
    } finally { s.done(); }
  });

  test('fehlendes Merkmal structure blendet Menüeinträge aus', async () => {
    const on = await setup();
    let ids;
    try {
      cell(on, 0, 1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...center(cell(on, 0, 1)) }));
      ids = [...document.querySelectorAll('.context-menu [data-menu-id]')].map((m) => m.dataset.menuId);
      assertTrue(ids.includes('insertRowAbove'), `mit structure: ${ids}`);
    } finally { on.done(); }
    const off = await setup({ features: { structure: false } });
    try {
      cell(off, 0, 1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...center(cell(off, 0, 1)) }));
      ids = [...document.querySelectorAll('.context-menu [data-menu-id]')].map((m) => m.dataset.menuId);
      assertTrue(!ids.includes('insertRowAbove') && !ids.includes('deleteSelectedRows'), `ohne structure: ${ids}`);
      assertTrue(ids.includes('clearSelection'), 'Leeren bleibt');
    } finally { off.done(); }
  });

  test('Zusatzeintrag aus contextMenu meldet seine Id', async () => {
    const s = await setup({ contextMenu: [{ id: 'forbid', labelKey: 'modules.doe.forbid' }] });
    try {
      cell(s, 1, 4).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...center(cell(s, 1, 4)) }));
      const item = document.querySelector('.context-menu [data-menu-id="forbid"]');
      assertTrue(item !== null, 'Eintrag da');
      item.click();
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['contextMenu', { id: 'forbid', columnId: 'b', row: 4 }]]);
    } finally { s.done(); }
  });

  test('Spaltenkopf: Shift+Klick sortiert, Strg+Klick ergänzt extraCols', async () => {
    const s = await setup();
    try {
      const th = (c) => s.el.querySelector(`thead th[data-col-idx="${c}"]`);
      mouse(th(1), 'mousedown', { shiftKey: true });
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['sortRows', { columnId: 'b', direction: 'asc' }]]);
      mouse(th(0), 'mousedown');
      mouse(document, 'mouseup', { clientX: 0, clientY: 0 });
      mouse(th(2), 'mousedown', { ctrlKey: true });
      assertTrue(th(0).classList.contains('col-selected') && th(2).classList.contains('col-selected'), 'beide Köpfe gewählt');
      await wait(350);
      const gv = s.calls.filter((c) => c[0] === 'gridView').pop();
      assertEqual(gv[1].selection.startCol, 2);
      assertDeepEqual(gv[1].selection.extraCols, [0]);
    } finally { s.done(); }
  });

  test('Spaltenbreite ziehen meldet gridView mit colWidths', async () => {
    const s = await setup();
    try {
      const handle = s.el.querySelector('.col-resize-handle[data-col-idx="0"]');
      const p = center(handle);
      mouse(handle, 'mousedown', p);
      mouse(document, 'mousemove', { clientX: p.clientX + 40, clientY: p.clientY });
      mouse(document, 'mouseup', { clientX: p.clientX + 40, clientY: p.clientY });
      await wait(350);
      const gv = s.calls.filter((c) => c[0] === 'gridView').pop();
      assertTrue(Boolean(gv) && gv[1].colWidths.a >= 160, `colWidths: ${JSON.stringify(gv?.[1].colWidths)}`);
    } finally { s.done(); }
  });

  test('Typ-Kürzel öffnet die Auswahl, Typwahl meldet setColumnType', async () => {
    const s = await setup();
    try {
      s.el.querySelector('thead .col-type-badge[data-col-idx="1"]').click();
      const item = document.querySelector('.attr-picker .attr-picker__item[data-type="numeric"]');
      assertTrue(item !== null, 'Typauswahl offen');
      item.click();
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['setColumnType', { columnId: 'b', columnType: 'numeric' }]]);
    } finally { s.done(); }
  });

  test('fehlende Rolle (roles) schaltet ab, Ansichtsereignisse bleiben', async () => {
    const s = await setup({ roles: ['setCells'], contextMenu: [{ id: 'forbid', labelKey: 'x.forbid' }] });
    try {
      clickCell(s, 0, 2);
      key(document.activeElement, 'Delete');
      assertEqual(s.calls.filter((c) => c[0] === 'clearRange').length, 0, 'kein clearRange');
      cell(s, 1, 4).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...center(cell(s, 1, 4)) }));
      const ids = [...document.querySelectorAll('.context-menu [data-menu-id]')].map((m) => m.dataset.menuId);
      assertTrue(!ids.includes('insertRowAbove') && !ids.includes('clearSelection'), `Einträge: ${ids}`);
      document.querySelector('.context-menu [data-menu-id="forbid"]').click();
      assertDeepEqual(s.calls.filter((c) => c[0] === 'contextMenu'), [['contextMenu', { id: 'forbid', columnId: 'b', row: 4 }]]);
    } finally { s.done(); }
  });

  test('roles ohne openFormulaEditor: Doppelklick auf Formelzelle meldet das Ansichtsereignis', async () => {
    const s = await setup({ roles: ['setCells'], features: { formulaEditor: true }, formulas: { b: { 3: '=A1' } } });
    try {
      mouse(cell(s, 1, 3), 'dblclick');
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['openFormulaEditor', { columnId: 'b', row: 3 }]]);
    } finally { s.done(); }
  });

  test('Esc (datagrid.cancelEdit) schließt das Menü und verhindert die Vorgabe', async () => {
    const s = await setup();
    try {
      cell(s, 0, 1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...center(cell(s, 0, 1)) }));
      assertTrue(document.querySelector('.context-menu') !== null, 'Menü offen');
      const ev = key(document.activeElement, 'Escape');
      assertEqual(document.querySelector('.context-menu'), null, 'Menü zu');
      assertTrue(ev.defaultPrevented, 'preventDefault');
    } finally { s.done(); }
  });

  test('offener Scan rechnet nur neu, wenn sich die Spalte ändert', async () => {
    let shows = 0;
    const handle = { close() {}, setTitle() {} };
    const dialog = { show: (o) => { shows++; handle.body = o.content; return handle; } };
    const s = await setup({ dialog, n: 50 });
    try {
      s.el.querySelector('thead th[data-col-idx="1"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
      document.querySelector('.context-menu [data-menu-id="columnScan"]').click();
      assertEqual(shows, 1);
      const before = handle.body.firstChild;
      s.input.setView({ table: s.table, columns: s.cols, formulas: {}, colWidths: {}, selection: null, lang: 'en' });
      assertTrue(handle.body.firstChild === before, 'kein Neuzeichnen ohne Änderung');
      s.table.columns[1][0] = 'neu'; s.table.rev++;
      s.input.setView({ table: s.table, columns: s.cols, formulas: {}, colWidths: {}, selection: null, lang: 'en' });
      assertTrue(handle.body.firstChild !== before, 'Neuzeichnen nach Änderung');
    } finally { s.done(); }
  });

  // Vor einem Agentenstapel legt das Modul eine offene Eingabe ab (settle →
  // flushPendingWork): sie wird ihr eigener Schritt, statt dass der Stapel sie
  // verwirft (Zeilen verschoben) oder sie danach seinen Wert überschreibt.
  test('commitEditor übernimmt eine offene Eingabe wie Enter, ohne Editor nichts', async () => {
    const s = await setup();
    try {
      assertEqual(s.input.commitEditor(), false, 'ohne Editor nichts');
      clickCell(s, 0, 4);
      key(document.activeElement, '7');
      const ed = s.el.querySelector('.cell-editor');
      ed.value = '77';
      assertEqual(s.input.commitEditor(), true);
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['setCells', { columnId: 'a', startRow: 4, values: ['77'] }]]);
      assertEqual(s.el.querySelector('.cell-editor'), null, 'Editor zu');
    } finally { s.done(); }
  });

  // Eckknopf links oben wie im Altraster (`_showExportMenu`): nur mit der Rolle
  // exportAs, auch im Nur-Lese-Zustand (Export ändert nichts).
  test('Eckknopf Export: Menü mit drei Formaten meldet exportAs', async () => {
    const s = await setup({ roles: ['setCells', 'exportAs'], readOnly: true });
    try {
      const btn = s.host.querySelector('thead th.datagrid__corner .datagrid__export-btn');
      assertTrue(btn !== null, 'Exportknopf in der Ecke');
      btn.click();
      const items = [...document.querySelectorAll('.context-menu [role="menuitem"]')].map((m) => m.textContent);
      assertDeepEqual(items, ['Excel (.xlsx)', 'CSV (.csv)', 'JSON (.json)']);
      document.querySelector('.context-menu [data-menu-id="export-csv"]').click();
      assertDeepEqual(s.calls.filter((c) => c[0] !== 'gridView'), [['exportAs', { format: 'csv' }]]);
    } finally { s.done(); }
  });

  test('jede Auswahländerung meldet sofort datagrid-selection (vor gridView)', async () => {
    const s = await setup();
    try {
      const seen = [];
      s.host.addEventListener('datagrid-selection', (e) => seen.push(e.detail.selection));
      clickCell(s, 1, 3);
      assertEqual(seen.length >= 1, true, 'Ereignis kam');
      const last = seen[seen.length - 1];
      assertEqual(`${last.activeCol}/${last.activeRow}`, '1/3');
      assertEqual(s.roles().includes('gridView'), false, 'gridView noch entprellt');
    } finally { s.done(); }
  });

  test('ohne Rolle exportAs keine Knöpfe in der Ecke', async () => {
    const s = await setup({ roles: ['setCells'] });
    try {
      assertEqual(s.host.querySelector('thead th.datagrid__corner .datagrid__export-btn'), null);
    } finally { s.done(); }
  });

  test('Zeilen oberhalb eingefügt: offener Editor schließt ohne Meldung', async () => {
    const s = await setup({ n: 50 });
    try {
      clickCell(s, 0, 5);
      key(document.activeElement, '9');
      assertTrue(s.el.querySelector('.cell-editor') !== null, 'Editor offen');
      const t2 = mkTable(51);
      s.input.setView({ table: t2, columns: s.cols, formulas: {}, colWidths: {}, selection: null, lang: 'en' });
      assertEqual(s.el.querySelector('.cell-editor'), null, 'Editor zu');
      assertEqual(s.calls.filter((c) => c[0] === 'setCells').length, 0, 'keine Meldung');
    } finally { s.done(); }
  });
});

