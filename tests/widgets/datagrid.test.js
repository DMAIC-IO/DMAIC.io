/**
 * Widget datagrid — Tabelle aus der Eingabe `config`, Zelländerung, Einfügen und
 * Zeilenmenü als Kommandos des Moduls, Neuzeichnen ohne zweite Instanz,
 * Sperrdarstellung wie im Arbeitsblatt, Nur-Lesen.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { defineModel, command, list, text, number } from '../../js/core/model.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

const i18n = { t: (k) => k, getLanguage: () => 'de' };
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };

/** Wirte der bisherigen Tests; der nächste baut sie ab. */
const hosts = [];
/** Aufrufe der Kommandos, je Test geleert. */
const calls = [];
const cell = list(list(number({ nullable: true })));
const Doc = defineModel({
  fields: { rows: list(list(text({ nullable: true })), { default: [['1', '1.5'], ['2', '3'], ['3', null]] }) },
  commands: {
    setX: command({
      params: { row: number({ integer: true, min: 0 }), column: text(), value: number({ nullable: true, max: 100 }) },
      run(args) { calls.push(['setX', args]); this.rows[args.row][1] = args.value == null ? null : String(args.value); },
    }),
    setBlock: command({
      params: { row: number({ integer: true, min: 0 }), column: text(), values: cell },
      run(args) { calls.push(['setBlock', args]); },
    }),
    keep: command({
      params: { row: number({ integer: true, min: 0 }), column: text(), value: number({ nullable: true }) },
      run(args) { calls.push(['keep', args]); },
    }),
    forbidRun: command({
      params: { row: number({ integer: true, min: 0 }) },
      run(args) { calls.push(['forbidRun', args]); },
    }),
  },
});

const COLUMNS = [
  { key: 'run', name: 'Lauf', type: 'numeric', lock: 'hard', format: { decimals: 0 }, reason: 'run-order' },
  { key: 'f:a', name: 'A', type: 'numeric', lock: null, format: { decimals: 2 }, unit: 'mm' },
];

/**
 * Wirt wie createModule: `_ui` mit Model, Diensten und leeren Viewmodel-Kommandos.
 * @param {string} attrs zusätzliche Attribute am Wirts-Tag
 * @param {object} [extra] Komponentenfelder
 */
async function host(attrs = 'x-widget-on-cell="\'setX\'" x-widget-on-paste="\'setBlock\'"', extra = {}) {
  if (!Alpine.version) Alpine.start();
  // Grids of earlier tests go for good: a grid keeps its selection and would take a paste meant for this one.
  while (hosts.length) { const old = hosts.pop(); Alpine.destroyTree(old); old.remove(); }
  registerWidgetDirective(Alpine, { i18n, widgets: WIDGETS });
  const services = { eventBus: null, stateManager: null, i18n, chartManager: null, instanceId: 'i1', moduleId: 'demo' };
  const name = `dg${Math.random().toString(36).slice(2)}`;
  Alpine.data(name, () => {
    const comp = {
      model: new Doc(),
      ro: false,
      get grid() {
        return { columns: COLUMNS, rows: this.model.rows, readOnly: this.ro, contextMenu: [{ id: 'forbidRun', labelKey: 'forbid' }] };
      },
      ...extra,
    };
    Object.defineProperty(comp, '_ui', {
      enumerable: false,
      get() {
        return { model: this.model, i18n, dialog: null, notify: () => {}, moduleId: 'demo', vmCommands: {}, component: this, services };
      },
    });
    return comp;
  });
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  root.innerHTML = `<div class="g" x-widget="datagrid" x-widget-config="grid" ${attrs}></div>`;
  document.body.append(root);
  hosts.push(root);
  const ow = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
  try {
    Alpine.initTree(root);
    await settle();
  } finally { console.warn = ow; }
  if (seen.length) throw new Error(`WARN ${seen.join(' || ')}`);
  calls.length = 0;
  return { root, data: Alpine.$data(root) };
}

const td = (root, r, c) => root.querySelector(`td[data-row-idx="${r}"][data-col-idx="${c}"]`);
const texts = (root) => [...root.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td[data-col-idx]')].map((x) => x.textContent));

/** Zelle per Doppelklick bearbeiten und mit Verlassen übernehmen. */
async function edit(root, r, c, raw) {
  td(root, r, c).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const input = root.querySelector('input.cell-editor');
  assertTrue(input !== null, 'Editor offen');
  input.value = raw;
  input.blur();
  await settle();
}

suite('datagrid widget', () => {
  test('zeigt Spalten und Zeilen aus config, Zahlen nach Format', async () => {
    const { root } = await host();
    assertEqual(root.querySelectorAll('.datagrid__table').length, 1);
    assertDeepEqual(texts(root), [['1', '1,50'], ['2', '3,00'], ['3', '']]);
    root.remove();
  });

  test('gesperrte Spalte: nicht editierbar, Kurzinfo wie im Arbeitsblatt', async () => {
    const { root } = await host();
    const locked = td(root, 0, 0);
    assertTrue(locked.classList.contains('cell-locked--hard'));
    td(root, 0, 0).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    assertEqual(root.querySelector('input.cell-editor'), null, 'kein Editor in gesperrter Spalte');
    const ref = document.createElement('div');
    document.body.append(ref);
    const g = new DataGrid(ref, { t: (k) => k });
    g.setData([{ id: 'run', name: 'Lauf', type: 'numeric', values: [1], meta: { lock: 'hard', managedBy: 'demo', reason: 'run-order' } }]);
    assertEqual(locked.title, ref.querySelector('td[data-col-idx="0"]').title);
    assertTrue(locked.title.includes('ui.datagrid.lockReason.run-order'), 'Sperrgrund in der Kurzinfo');
    assertEqual(root.querySelector('th .col-lock-icon').title, locked.title, 'dieselbe Kurzinfo am Schloss');
    g.destroy(); ref.remove();
    root.remove();
  });

  test('Einheit im Spaltenkopf wie im Arbeitsblatt', async () => {
    const { root } = await host();
    const units = [...root.querySelectorAll('th .col-name')].map((x) => x.querySelector('.col-unit')?.textContent ?? null);
    assertDeepEqual(units, [null, '[mm]']);
    root.remove();
  });

  test('Zelle ändern → onCell mit Zahl, Modell zeichnet neu', async () => {
    const { root } = await host();
    await edit(root, 1, 1, '2,5');
    assertDeepEqual(calls, [['setX', { row: 1, column: 'f:a', value: 2.5 }]]);
    assertEqual(td(root, 1, 1).textContent, '2,50');
    calls.length = 0;
    await edit(root, 0, 1, '');
    assertDeepEqual(calls, [['setX', { row: 0, column: 'f:a', value: null }]]);
    root.remove();
  });

  test('abgelehntes Kommando: Zelle zeigt wieder den Wert aus config', async () => {
    const { root } = await host();
    await edit(root, 1, 1, '500');
    assertEqual(calls.length, 0, 'Kommando abgelehnt (max 100)');
    assertEqual(td(root, 1, 1).textContent, '3,00');
    root.remove();
  });

  test('Kommando erfolgreich, Model unverändert: Zelle zeigt den Wert aus config', async () => {
    const { root } = await host('x-widget-on-cell="\'keep\'"');
    await edit(root, 1, 1, '42');
    assertDeepEqual(calls, [['keep', { row: 1, column: 'f:a', value: 42 }]]);
    assertEqual(td(root, 1, 1).textContent, '3,00');
    root.remove();
  });

  test('Einfügen über den Rand: angehängte Zeilen verschwinden nach dem Kommando', async () => {
    const { root } = await host();
    td(root, 2, 1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.activeElement?.blur?.();
    const dt = new DataTransfer();
    dt.setData('text/plain', '5\n6\n7');
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await settle();
    assertDeepEqual(calls, [['setBlock', { row: 2, column: 'f:a', values: [[5], [6], [7]] }]]);
    assertEqual(root.querySelectorAll('tbody tr').length, 3);
    root.remove();
  });

  test('Einfügen eines 2×2-Blocks → ein Aufruf onPaste, values zeilenweise', async () => {
    const { root } = await host('x-widget-on-cell="\'setX\'" x-widget-on-paste="\'setBlock\'"', {
      get grid() {
        return { columns: [COLUMNS[1], { key: 'r:0', name: 'Y', type: 'numeric', lock: null, format: null }], rows: [['1', '2'], ['3', '4'], [null, null]], readOnly: false, contextMenu: [] };
      },
    });
    td(root, 0, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.activeElement?.blur?.();
    const dt = new DataTransfer();
    dt.setData('text/plain', '5\t6\n7,5\t');
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await settle();
    assertDeepEqual(calls, [['setBlock', { row: 0, column: 'f:a', values: [[5, 6], [7.5, null]] }]]);
    root.remove();
  });

  test('Zeilenmenü → Kommando mit { row }', async () => {
    const { root } = await host();
    td(root, 2, 1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    const item = [...document.querySelectorAll('.context-menu .context-menu__item')].find((x) => x.textContent === 'modules.demo.forbid');
    assertTrue(item !== undefined, 'Menüeintrag mit Modultext');
    item.click();
    await settle();
    assertDeepEqual(calls, [['forbidRun', { row: 2 }]]);
    root.remove();
  });

  test('neue config → neu gezeichnet, keine zweite Instanz', async () => {
    const { root, data } = await host();
    const table = root.querySelector('.datagrid__table');
    data.model.rows = [['1', '9'], ['2', '8']];
    await settle();
    assertDeepEqual(texts(root), [['1', '9,00'], ['2', '8,00']]);
    assertEqual(root.querySelectorAll('.datagrid__table').length, 1);
    assertTrue(root.querySelector('.datagrid__table') === table, 'dieselbe Tabelle');
    root.remove();
  });

  test('Auswahl bleibt beim Neuzeichnen gleicher Form, sonst nicht', async () => {
    const { root, data } = await host();
    td(root, 1, 1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    assertTrue(td(root, 1, 1).classList.contains('cell-active'), 'gewählt');
    await edit(root, 1, 1, '4');
    assertTrue(td(root, 1, 1).classList.contains('cell-active'), 'nach dem Kommando noch gewählt');
    data.model.rows = [['1', '9'], ['2', '8'], ['3', '7']];
    await settle();
    assertTrue(td(root, 1, 1).classList.contains('cell-active'), 'neue Werte, gleiche Form');
    data.model.rows = [['1', '9'], ['2', '8']];
    await settle();
    assertEqual(root.querySelectorAll('td.cell-active').length, 0, 'andere Form: keine Auswahl');
    root.remove();
  });

  test('Löschen, Ausschneiden, Ausfüllen, Tippen: jede Änderung geht als Kommando hinaus', async () => {
    const { root } = await host();
    const sel = (r, c, shift = false) => {
      td(root, r, c).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: shift }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    };
    const key = (k, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
    document.activeElement?.blur?.();
    // Entf auf zwei Zellen → ein Block (setBlock ändert nichts, die Werte kommen zurück).
    sel(0, 1); sel(1, 1, true);
    key('Delete');
    await settle();
    assertDeepEqual(calls, [['setBlock', { row: 0, column: 'f:a', values: [[null], [null]] }]]);
    assertEqual(td(root, 0, 1).textContent, '1,50');
    // Entf auf einer Zelle → onCell mit null.
    calls.length = 0;
    sel(0, 1);
    key('Delete');
    await settle();
    assertDeepEqual(calls, [['setX', { row: 0, column: 'f:a', value: null }]]);
    // Ausschneiden leert wie Entf.
    calls.length = 0;
    sel(1, 1);
    document.dispatchEvent(new ClipboardEvent('cut', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }));
    await settle();
    assertDeepEqual(calls, [['setX', { row: 1, column: 'f:a', value: null }]]);
    // Tippen auf einer gewählten Zelle, Enter übernimmt.
    calls.length = 0;
    sel(2, 1);
    key('8');
    const input = root.querySelector('input.cell-editor');
    assertTrue(input !== null, 'Editor durch Tippen');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    assertDeepEqual(calls, [['setX', { row: 2, column: 'f:a', value: 8 }]]);
    // Ausfüllen mit dem Griff von Zeile 1 nach unten.
    calls.length = 0;
    sel(1, 1);
    root.querySelector('.datagrid__fill-handle').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    td(root, 2, 1).dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await settle();
    assertEqual(calls.length, 1, JSON.stringify(calls));
    assertEqual(calls[0][1].row, 2);
    assertEqual(calls[0][1].column, 'f:a');
    root.remove();
  });

  test('gehaltene Auswahl wird auf die Tabelle gekappt', async () => {
    const { root } = await host('x-widget-on-cell="\'keep\'" x-widget-on-paste="\'setBlock\'"');
    td(root, 2, 1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.activeElement?.blur?.();
    const dt = new DataTransfer();
    dt.setData('text/plain', '5\n6\n7');
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await settle();
    assertEqual(root.querySelectorAll('tbody tr').length, 3);
    assertEqual(root.querySelectorAll('td.cell-selected[data-row-idx="3"], td.cell-selected[data-row-idx="4"]').length, 0);
    calls.length = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    await settle();
    assertTrue(calls.every(([, a]) => a.row <= 2 && (!a.values || a.row + a.values.length <= 3)), JSON.stringify(calls));
    root.remove();
  });

  test('readOnly: kein Editor, kein Zeilenmenü, keine Aufrufe', async () => {
    const { root, data } = await host();
    data.ro = true;
    await settle();
    td(root, 1, 1).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    assertEqual(root.querySelector('input.cell-editor'), null);
    td(root, 1, 1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    assertEqual([...document.querySelectorAll('.context-menu .context-menu__item')].filter((x) => x.textContent === 'modules.demo.forbid').length, 0);
    assertEqual(calls.length, 0);
    root.remove();
  });

  test('ohne onCell: Änderung wird verworfen, kein Aufruf', async () => {
    const { root } = await host('');
    await edit(root, 1, 1, '7');
    assertEqual(calls.length, 0);
    assertEqual(td(root, 1, 1).textContent, '3,00');
    root.remove();
  });
});
