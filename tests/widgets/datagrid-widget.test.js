/**
 * Widget datagrid über `table()` (P7): Ansicht und Bedienung des Rasters an
 * einem Model mit `TableData`. Eingaben gehen als Kommandos (Rolle →
 * `config.commands`, `config.commandArgs` eingemischt) hinaus, das Widget
 * zeichnet nach `$tableRev` neu und ändert nie selbst Daten. Mit `config.rows`
 * läuft der Altweg.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import {
  defineModel, command, list, text, number, map, object, table, markTableChanged, recordInverse,
  setCommandObserver, setHistoryMode,
} from '../../js/core/model.js';

const loads = [];
for (const f of ['datagrid.css', 'view/grid-view.css']) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL(`../../js/core/datagrid/${f}`, import.meta.url).href;
  loads.push(new Promise((res) => { l.onload = res; l.onerror = res; }));
  document.head.appendChild(l);
}
const cssReady = Promise.all(loads);

const i18n = { t: (k) => k, getLanguage: () => 'en' };
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Spaltenköpfe in Model-Form: Sperre in `meta`. */
const COLS = [
  { id: 'a', name: 'Wert', shortName: 'A', type: 'numeric', format: {}, meta: null },
  { id: 'b', name: 'Text', shortName: 'B', type: 'text', format: {}, meta: null },
  { id: 'c', name: 'Lauf', shortName: 'C', type: 'numeric', format: {}, meta: { lock: 'hard', reason: 'run-order' } },
];

/** Zellwert aus der Eingabe; Zahlspalten lehnen nicht lesbare Eingaben ab. */
function cellOf(type, raw) {
  if (raw == null || raw === '') return null;
  if (type !== 'numeric') return String(raw);
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`invalid number "${raw}"`);
  return n;
}
const asText = (v) => (v == null ? null : String(v));

/** Aufrufe der Kommandos, je Test geleert. */
const calls = [];
const Sheet = defineModel({
  fields: { data: table() },
  commands: {
    setCells: command({
      params: { sheetId: text(), columnId: text(), startRow: number({ integer: true, min: 0 }), values: list(text({ nullable: true })) },
      run({ sheetId, columnId, startRow, values }) {
        const c = COLS.findIndex((x) => x.id === columnId);
        const next = values.map((v) => cellOf(COLS[c].type, v));
        calls.push(['setCells', { sheetId, columnId, startRow, values }]);
        const col = this.data.columns[c];
        const old = next.map((_, i) => asText(col[startRow + i]));
        next.forEach((v, i) => { col[startRow + i] = v; });
        recordInverse(this, { type: 'setCells', sheetId, columnId, startRow, values: old });
        markTableChanged(this, this.data);
      },
    }),
    pasteBlock: command({
      params: { sheetId: text(), columnId: text(), startRow: number({ integer: true, min: 0 }), rows: list(list(text({ nullable: true }))) },
      run({ sheetId, columnId, startRow, rows }) {
        calls.push(['pasteBlock', { sheetId, columnId, startRow, rows }]);
        const c0 = COLS.findIndex((x) => x.id === columnId);
        const next = rows.map((line) => line.map((v, j) => cellOf(COLS[c0 + j].type, v)));
        const old = next.map((line, i) => line.map((_, j) => asText(this.data.columns[c0 + j][startRow + i])));
        next.forEach((line, i) => line.forEach((v, j) => { this.data.columns[c0 + j][startRow + i] = v; }));
        recordInverse(this, { type: 'pasteBlock', sheetId, columnId, startRow, rows: old });
        markTableChanged(this, this.data);
      },
    }),
    onMenu: command({
      params: { sheetId: text(), id: text(), columnId: text(), row: number({ integer: true, min: 0 }) },
      run(args) { calls.push(['onMenu', args]); },
    }),
    keepView: command({
      params: {
        sheetId: text(),
        colWidths: map(text(), number()),
        selection: object({
          startCol: number(), startRow: number(), endCol: number(), endRow: number(),
          activeCol: number(), activeRow: number(), extraCols: list(number()),
        }, { nullable: true }),
      },
      run(args) { calls.push(['keepView', args]); },
    }),
  },
});

/** Wirte der bisherigen Tests; der nächste baut sie ab. */
const hosts = [];

/**
 * Wirt wie createModule: `_ui` mit Model, Diensten und leeren Viewmodel-Kommandos.
 * @param {object} [opts] `config`: Felder, die die Vorgabe-config ergänzen; `attrs`: Bindungen statt der Vorgabe
 */
async function host(opts = {}) {
  await cssReady;
  if (!Alpine.version) Alpine.start();
  while (hosts.length) { const old = hosts.pop(); Alpine.destroyTree(old); old.remove(); }
  document.querySelectorAll('.context-menu').forEach((m) => m.remove());
  registerWidgetDirective(Alpine, { i18n, widgets: WIDGETS });
  const notes = [];
  const services = {
    eventBus: null, stateManager: null, i18n, chartManager: null, instanceId: 'i1', moduleId: 'demo',
    notify: (message, type) => notes.push([message, type]), dialog: null,
  };
  const model = Sheet.fromJSON({ data: { rowCount: 3, columns: [[1, 2, 3], ['x', 'y', 'z'], [10, 20, 30]] } });
  setHistoryMode(model, 'inverse');
  const observed = [];
  setCommandObserver(model, (name, args, result, inverses) => observed.push([name, inverses]));
  const name = `dgw${Math.random().toString(36).slice(2)}`;
  Alpine.data(name, () => {
    const comp = {
      model,
      cols: COLS,
      formulas: {},
      ro: false,
      legacyRows: [['1'], ['2']],
      get grid() {
        return {
          readOnly: this.ro,
          features: {},
          commands: { setCells: 'setCells', pasteBlock: 'pasteBlock' },
          commandArgs: { sheetId: 's1' },
          contextMenu: [],
          ...(opts.config ?? {}),
        };
      },
      get legacy() {
        return { columns: [{ key: 'a', name: 'A', type: 'numeric', lock: null, format: null }], rows: this.legacyRows, readOnly: false, contextMenu: [] };
      },
      get legacyNoMenu() {
        return { columns: [{ key: 'a', name: 'A', type: 'numeric', lock: null, format: null }], rows: this.legacyRows, readOnly: false };
      },
      get legacyNoColumns() {
        return { rows: this.legacyRows, readOnly: false, contextMenu: [] };
      },
    };
    Object.defineProperty(comp, '_ui', {
      enumerable: false,
      get() {
        return { model: this.model, i18n, dialog: null, notify: services.notify, moduleId: 'demo', vmCommands: {}, component: this, services };
      },
    });
    return comp;
  });
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  const attrs = opts.attrs ?? 'x-widget-table="model.data" x-widget-columns="cols" x-widget-formulas="formulas" x-widget-rev="model.$tableRev" x-widget-config="grid"';
  root.innerHTML = `<div class="g" style="height:400px;width:700px;display:flex;flex-direction:column" x-widget="datagrid" ${attrs}></div>`;
  document.body.append(root);
  hosts.push(root);
  const ow = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
  try {
    Alpine.initTree(root);
    await settle();
  } finally { console.warn = ow; }
  if (seen.length && !opts.warnings) throw new Error(`WARN ${seen.join(' || ')}`);
  calls.length = 0;
  return { root, data: Alpine.$data(root), model, notes, observed, warnings: seen, el: root.querySelector('.g') };
}

const td = (root, c, r) => root.querySelector(`td[data-col-idx="${c}"][data-row-idx="${r}"]`);
const center = (node) => {
  const r = node.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};
function mouse(target, type) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...center(target) }));
}
function key(target, k) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}
function clickCell(root, c, r) {
  mouse(td(root, c, r), 'mousedown');
  mouse(td(root, c, r), 'mouseup');
}
/** Zelle anwählen, tippen, Enter. */
async function type(root, c, r, raw) {
  clickCell(root, c, r);
  key(document.activeElement, raw.charAt(0));
  const ed = root.querySelector('.cell-editor');
  assertTrue(ed !== null, 'Editor offen');
  ed.value = raw;
  key(ed, 'Enter');
  await settle();
}

suite('datagrid widget über table()', () => {
  test('zeichnet die TableData; Sperre aus meta im Kopf und an der Zelle', async () => {
    const { root } = await host();
    assertEqual(root.querySelectorAll('.datagrid__table--virtual').length, 1, 'neues Raster');
    assertEqual(td(root, 0, 1).textContent, '2');
    assertEqual(td(root, 1, 2).textContent, 'z');
    assertTrue(td(root, 2, 0).classList.contains('cell-locked--hard'), 'meta.lock → gesperrte Zelle');
    assertTrue(td(root, 2, 0).title.includes('ui.datagrid.lockReason.run-order'), 'meta.reason in der Kurzinfo');
    assertTrue(root.querySelector('th .col-lock-icon') !== null, 'Schloss im Kopf');
  });

  test('Eingabe → setCells mit commandArgs, Model ändert sich, Widget zeichnet nach $tableRev neu', async () => {
    const { root, model, observed } = await host();
    await type(root, 0, 1, '42');
    assertDeepEqual(calls, [['setCells', { sheetId: 's1', columnId: 'a', startRow: 1, values: ['42'] }]]);
    assertEqual(Alpine.raw(model.data).get(0, 1), 42, 'Model geändert');
    assertEqual(td(root, 0, 1).textContent, '42', 'neu gezeichnet');
    assertDeepEqual(observed.at(-1), ['setCells', [{ type: 'setCells', sheetId: 's1', columnId: 'a', startRow: 1, values: ['2'] }]], 'Umkehrung gesammelt');
  });

  test('Einfügen → pasteBlock, Umkehrung mit dem alten Block, neu gezeichnet', async () => {
    const { root, observed } = await host();
    clickCell(root, 0, 1);
    const dt = new DataTransfer();
    dt.setData('text/plain', '7\tp\n8\tq\n');
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await settle();
    assertDeepEqual(calls, [['pasteBlock', { sheetId: 's1', columnId: 'a', startRow: 1, rows: [['7', 'p'], ['8', 'q']] }]]);
    assertDeepEqual([td(root, 0, 1).textContent, td(root, 1, 1).textContent, td(root, 0, 2).textContent, td(root, 1, 2).textContent], ['7', 'p', '8', 'q']);
    assertDeepEqual(observed.at(-1)[1], [{ type: 'pasteBlock', sheetId: 's1', columnId: 'a', startRow: 1, rows: [['2', 'y'], ['3', 'z']] }]);
  });

  test('abgelehntes Kommando: Meldung über notify, Zelle behält den alten Wert', async () => {
    const { root, model, notes } = await host();
    await type(root, 0, 1, 'abc');
    assertEqual(calls.length, 0, 'Kommando lief nicht durch');
    assertEqual(Alpine.raw(model.data).get(0, 1), 2, 'Model unverändert');
    assertEqual(root.querySelector('.cell-editor'), null, 'Editor zu');
    assertEqual(td(root, 0, 1).textContent, '2', 'alter Wert');
    assertEqual(notes.length, 1, 'eine Meldung');
    assertTrue(notes[0][0].includes('invalid number "abc"'), `Meldung: ${notes[0][0]}`);
    assertEqual(notes[0][1], 'error');
  });

  test('gesperrte Zelle: Sperrmeldung über notify, kein Editor', async () => {
    const { root, notes } = await host();
    mouse(td(root, 2, 0), 'dblclick');
    assertEqual(root.querySelector('.cell-editor'), null);
    assertEqual(notes.length, 1);
    assertTrue(notes[0][0].includes('ui.datagrid.lockReason.run-order'), `Meldung: ${notes[0][0]}`);
  });

  test('readOnly-Wechsel legt die Bedienung neu an', async () => {
    const { root, data } = await host();
    data.ro = true;
    await settle();
    assertTrue(root.querySelector('.widget-datagrid').classList.contains('dmike--readonly'));
    mouse(td(root, 0, 0), 'dblclick');
    assertEqual(root.querySelector('.cell-editor'), null, 'kein Editor im Nur-Lesen');
    data.ro = false;
    await settle();
    assertTrue(!root.querySelector('.widget-datagrid').classList.contains('dmike--readonly'));
    mouse(td(root, 0, 0), 'dblclick');
    assertTrue(root.querySelector('.cell-editor') !== null, 'Editor wieder da');
  });

  test('Zusatzeintrag im Kontextmenü → config.commands.contextMenu mit { id, columnId, row }', async () => {
    const { root } = await host({ config: {
      commands: { setCells: 'setCells', contextMenu: 'onMenu' },
      contextMenu: [{ id: 'forbid', labelKey: 'forbid' }],
    } });
    const cell = td(root, 1, 2);
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...center(cell) }));
    const item = document.querySelector('.context-menu [data-menu-id="forbid"]');
    assertTrue(item !== null, 'Eintrag da');
    assertEqual(item.textContent.trim(), 'modules.demo.forbid', 'Beschriftung unter modules.<id>');
    item.click();
    await settle();
    assertDeepEqual(calls, [['onMenu', { sheetId: 's1', id: 'forbid', columnId: 'b', row: 2 }]]);
  });

  test('unbekannte Rolle in config.commands: Widget im Fehlerzustand', async () => {
    const { el, warnings } = await host({ warnings: true, config: { commands: { setCell: 'setCells' } } });
    assertTrue(warnings.some((w) => w.includes('setCell')), `Warnung nennt die Rolle: ${warnings.join(' | ')}`);
    assertTrue(el.querySelector('.widget-root--error') !== null, 'Fehlerzustand');
  });

  test('Ansichtszustand: gridView entprellt (300 ms) mit commandArgs', async () => {
    const { root } = await host({ config: { commands: { setCells: 'setCells', gridView: 'keepView' } } });
    clickCell(root, 1, 2);
    await settle();
    assertEqual(calls.length, 0, 'nicht sofort');
    await wait(350);
    await settle();
    assertDeepEqual(calls, [['keepView', {
      sheetId: 's1', colWidths: {},
      selection: { startCol: 1, startRow: 2, endCol: 1, endRow: 2, activeCol: 1, activeRow: 2, extraCols: [] },
    }]]);
  });

  test('Test-Haken scrollToRow am Wirtselement', async () => {
    const { el } = await host();
    assertEqual(typeof el._datagrid?.scrollToRow, 'function');
  });

  test('flushView meldet eine ausstehende Ansicht sofort, danach nichts mehr', async () => {
    const { root, el } = await host({ config: { commands: { setCells: 'setCells', gridView: 'keepView' } } });
    clickCell(root, 1, 2);
    assertEqual(el._datagrid.flushView(), true, 'eine Ansicht stand aus');
    await settle();
    assertEqual(calls.length, 1, 'sofort gemeldet');
    assertEqual(calls[0][0], 'keepView');
    assertEqual(el._datagrid.flushView(), false, 'nichts mehr ausstehend');
    await wait(350);
    await settle();
    assertEqual(calls.length, 1, 'der Zeitgeber meldet nicht noch einmal');
  });

  test('takeEditorText: bricht die Zellbearbeitung ab und liefert den Text', async () => {
    const { root, el } = await host();
    assertEqual(el._datagrid.takeEditorText(), null, 'ohne Editor: null');
    clickCell(root, 0, 1);
    key(document.activeElement, '=');
    const ed = root.querySelector('.cell-editor');
    assertTrue(ed !== null, 'Editor offen');
    ed.value = '=SUM(C1)';
    assertEqual(el._datagrid.takeEditorText(), '=SUM(C1)');
    await settle();
    assertEqual(root.querySelector('.cell-editor'), null, 'Editor zu');
    assertEqual(calls.length, 0, 'nichts geschrieben');
    assertEqual(td(root, 0, 1).textContent, '2', 'alter Wert');
  });

  test('mit config.rows läuft der Altweg', async () => {
    const { root } = await host({ attrs: 'x-widget-config="legacy"' });
    assertEqual(root.querySelectorAll('.datagrid__table').length, 1);
    assertEqual(root.querySelectorAll('.datagrid__table--virtual').length, 0, 'kein neues Raster');
    assertEqual(td(root, 0, 1).textContent, '2');
  });

  test('Altweg ohne contextMenu: hängt ein, Rechtsklick auf den Zeilenkopf ohne Fehler', async () => {
    const errors = [];
    const onErr = (e) => errors.push(String(e.message ?? e));
    window.addEventListener('error', onErr);
    try {
      const { root } = await host({ attrs: 'x-widget-config="legacyNoMenu"' });
      assertEqual(root.querySelectorAll('.widget-root--error').length, 0, 'kein Fehlerzustand');
      const rh = root.querySelector('tbody td.datagrid__row-header, tbody th.datagrid__row-header') ?? td(root, 0, 0);
      rh.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...center(rh) }));
      await settle();
      assertDeepEqual(errors, []);
    } finally {
      window.removeEventListener('error', onErr);
      document.querySelectorAll('.context-menu').forEach((m) => m.remove());
    }
  });

  test('Altweg ohne columns: klare Meldung statt Absturz im Altweg', async () => {
    const { el, warnings } = await host({ warnings: true, attrs: 'x-widget-config="legacyNoColumns"' });
    assertTrue(warnings.some((w) => w.includes('config.rows needs config.columns')), `Warnung: ${warnings.join(' | ')}`);
    assertTrue(el.querySelector('.widget-root--error') !== null, 'Fehlerzustand');
  });

  test('ohne x-widget-rev: klare Meldung beim Einhängen', async () => {
    const { el, warnings } = await host({ warnings: true, attrs: 'x-widget-table="model.data" x-widget-columns="cols" x-widget-formulas="formulas" x-widget-config="grid"' });
    assertTrue(warnings.some((w) => w.includes('x-widget-rev')), `Warnung: ${warnings.join(' | ')}`);
    assertTrue(el.querySelector('.widget-root--error') !== null, 'Fehlerzustand');
  });

  test('formulaEditor ohne commands.openFormulaEditor: klare Meldung beim Einhängen', async () => {
    const { el, warnings } = await host({ warnings: true, config: { features: { formulaEditor: true } } });
    assertTrue(warnings.some((w) => w.includes('openFormulaEditor')), `Warnung: ${warnings.join(' | ')}`);
    assertTrue(el.querySelector('.widget-root--error') !== null, 'Fehlerzustand');
  });

  test('contextMenu-Einträge ohne commands.contextMenu: klare Meldung beim Einhängen', async () => {
    const { el, warnings } = await host({ warnings: true, config: { contextMenu: [{ id: 'forbid', labelKey: 'forbid' }] } });
    assertTrue(warnings.some((w) => w.includes('commands.contextMenu')), `Warnung: ${warnings.join(' | ')}`);
    assertTrue(el.querySelector('.widget-root--error') !== null, 'Fehlerzustand');
  });
});
