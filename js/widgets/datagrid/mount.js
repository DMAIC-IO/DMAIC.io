/**
 * Widget datagrid — Weiche zwischen dem Raster über `table()` (P7) und dem
 * Altweg (`config.rows`, legacy-mount.js, bis F1.14f).
 *
 * Über `table()`: GridView (Zeichnen, virtualisiert) und GridInput (Bedienung)
 * über der `TableData` des Models. Das Widget ändert nie selbst Daten: jede
 * Bedienung meldet eine Rolle, das Widget ruft `command(config.commands[role],
 * { ...config.commandArgs, ...args })`. Fehlt die Rolle in `commands`, ist ihr
 * Merkmal aus. Die Ansichtsereignisse `contextMenu { id, columnId, row }` und
 * `openFormulaEditor { columnId, row }` sind keine Datenrollen; sie gehen an
 * `config.commands.contextMenu` bzw. `.openFormulaEditor`, falls hinterlegt.
 *
 * Neu gezeichnet wird, wenn sich `table.rev` (über die Eingabe `rev` =
 * `model.$tableRev`), die Tabelle selbst, Spaltenköpfe, Formeln oder `config`
 * geändert haben. Ein abgelehntes Kommando (`ok: false`) meldet seinen Fehler
 * über `notify`; die Zelle zeigt weiter den Wert des unveränderten Models.
 * Sperrmeldungen der Bedienung (`cell:edit-blocked`, `column:edit-blocked`)
 * gehen ebenfalls über `notify`. Strg+Z/Y behandelt das Widget nicht (R8).
 */
import Alpine from '@alpinejs/csp';
import { TableData } from '../../core/table-data.js';
import { createGridView } from '../../core/datagrid/view/grid-view.js';
import { createGridInput } from '../../core/datagrid/view/grid-input.js';
import { mount as mountLegacy } from './legacy-mount.js';

/** Klasse, an der Raster und Stile den Nur-Lese-Zustand erkennen (wie im Altweg). */
const READONLY = 'dmike--readonly';

/** Rollen aus P7 und die beiden Ansichtsereignisse. */
const ROLES = new Set([
  'setCells', 'setFormula', 'pasteBlock', 'fillRange', 'clearRange', 'addColumn', 'removeColumn',
  'moveColumn', 'renameColumn', 'addRows', 'removeRows', 'moveRow', 'sortRows', 'setColumnType',
  'setColumnFormat', 'setColumnRole', 'undo', 'redo', 'gridView', 'contextMenu', 'openFormulaEditor',
]);

const EMPTY = Object.freeze({});

/**
 * Spaltenköpfe für die Ansicht: Sperre aus `meta` nach oben (`lock`, `reason`,
 * `managedBy`), wie GridView und GridInput sie lesen.
 * @param {any[]} columns Spaltenköpfe in Model-Form
 * @returns {object[]}
 */
export function headerColumns(columns) {
  return columns.map((c) => {
    const { meta, ...head } = c;
    if (!meta) return head;
    const out = { ...head };
    if (meta.lock) out.lock = meta.lock;
    if (meta.reason) out.reason = meta.reason;
    if (meta.managedBy) out.managedBy = meta.managedBy;
    return out;
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ props: any, services: any, effect: Function, command: (name: string, args: object) => Promise<any> }} w
 * @returns {{ destroy: () => void }}
 */
export function mount(root, w) {
  const config = Alpine.raw(w.props.config);
  if (Array.isArray(config?.rows) && Array.isArray(config?.columns)) return mountLegacy(root, { ...w, props: legacyProps(w.props) });
  if (Array.isArray(config?.rows)) throw new Error('datagrid: config.rows needs config.columns (legacy form)');
  return mountTable(root, w);
}

/**
 * Eingaben für den Altweg: `legacy-mount.js` bleibt unverändert und liest
 * `config.contextMenu` ohne Absicherung; im Schema ist es inzwischen optional.
 * Die Getter lesen die reaktiven Props weiter (Effekte des Altwegs verfolgen sie).
 * @param {any} props @returns {any}
 */
function legacyProps(props) {
  return {
    get config() {
      const c = props.config;
      return c && !Array.isArray(c.contextMenu) ? { ...c, contextMenu: [] } : c;
    },
    get onCell() { return props.onCell; },
    get onPaste() { return props.onPaste; },
  };
}

/**
 * Ansichtsereignisse brauchen ein Ziel: sonst gingen Doppelklick auf eine
 * Formelzelle bzw. ein Zusatzeintrag im Menü still verloren.
 * @param {any} config @returns {void}
 * @throws {Error} bei Ereignis ohne Kommando
 */
function checkViewEvents(config) {
  const commands = config.commands ?? EMPTY;
  if (config.features?.formulaEditor === true && !commands.openFormulaEditor) {
    throw new Error('datagrid: config.features.formulaEditor needs config.commands.openFormulaEditor');
  }
  if ((config.contextMenu ?? []).length > 0 && !commands.contextMenu) {
    throw new Error('datagrid: config.contextMenu entries need config.commands.contextMenu');
  }
}

/**
 * Raster über `table()`.
 * @param {HTMLElement} root
 * @param {{ props: any, services: any, effect: Function, command: (name: string, args: object) => Promise<any> }} w
 * @returns {{ destroy: () => void }}
 */
function mountTable(root, { props, services, effect, command }) {
  const { i18n, moduleId = null } = services;
  if (!(Alpine.raw(props.table) instanceof TableData)) {
    throw new Error('datagrid: x-widget-table must name a TableData (or config.rows for the legacy form)');
  }
  if (!Array.isArray(Alpine.raw(props.columns))) throw new Error('datagrid: x-widget-columns is required with x-widget-table');
  if (typeof props.rev !== 'number') throw new Error('datagrid: x-widget-rev="model.$tableRev" is required with x-widget-table (otherwise the grid never redraws)');
  const t = (key) => i18n.t(key);
  const lang = () => i18n.getLanguage?.() ?? 'en';
  const notify = (message, type) => services.notify?.(message, type);

  const slot = document.createElement('div');
  slot.className = 'widget-datagrid';
  root.append(slot);
  const view = createGridView(slot, { t, lang: lang() });
  // Test-Haken (P8): die POMs holen eine Zeile in den Sichtbereich, bevor sie eine Zelle ansprechen.
  const hostEl = /** @type {any} */ (root.parentElement ?? root);
  hostEl._datagrid = { scrollToRow: (r) => view.scrollToRow(r) };

  const onBlocked = (e) => { if (e.detail?.message) notify(e.detail.message, 'warning'); };
  view.el.addEventListener('cell:edit-blocked', onBlocked);
  view.el.addEventListener('column:edit-blocked', onBlocked);

  /** @type {any} zuletzt gelesene config (roh) */
  let cfg = null;
  /** @type {ReturnType<typeof createGridInput>|null} */
  let input = null;
  let inputSig = '';
  const drawn = { table: null, rev: -1, columns: null, formulas: null, config: null, lang: '' };
  let alive = true;

  /** Bedienung meldet eine Rolle: Kommando des Moduls, Fehler über notify. */
  const emit = async (role, args) => {
    const name = cfg?.commands?.[role];
    if (!name) return;
    const r = await command(name, { ...(cfg.commandArgs ?? EMPTY), ...args });
    if (alive && r && r.ok === false && !r.cancelled) notify(r.error?.message ?? String(r.error), 'error');
  };

  /**
   * Bedienung anlegen oder neu anlegen: `readOnly`, Merkmale, Rollen und
   * Zusatzeinträge gelten ab ihrer Erzeugung.
   * @returns {boolean} neu angelegt
   */
  const ensureInput = () => {
    const roles = Object.keys(cfg.commands ?? EMPTY);
    const contextMenu = (cfg.contextMenu ?? []).map(({ id, labelKey }) => ({
      id, labelKey: moduleId ? `modules.${moduleId}.${labelKey}` : labelKey,
    }));
    const sig = JSON.stringify([cfg.readOnly, cfg.features ?? null, roles, contextMenu]);
    if (input && sig === inputSig) return false;
    input?.destroy();
    input = createGridInput(view, {
      emit: (role, args) => { emit(role, args); },
      features: cfg.features ?? {}, readOnly: cfg.readOnly, contextMenu, t, dialog: services.dialog ?? null, roles,
    });
    inputSig = sig;
    slot.classList.toggle(READONLY, cfg.readOnly);
    return true;
  };

  effect(() => {
    void props.rev; // P2: Neuzeichnen nach markTableChanged
    const table = Alpine.raw(props.table);
    const columns = Alpine.raw(props.columns);
    const formulas = Alpine.raw(props.formulas) ?? EMPTY;
    const config = Alpine.raw(props.config);
    if (!(table instanceof TableData)) throw new Error('datagrid: x-widget-table must name a TableData');
    for (const role of Object.keys(config.commands ?? EMPTY)) {
      if (!ROLES.has(role)) throw new Error(`datagrid: unknown role ${JSON.stringify(role)} in config.commands; allowed: ${[...ROLES].join(', ')}`);
    }
    checkViewEvents(config);
    cfg = config;
    const created = ensureInput();
    const lng = lang();
    if (!created && table === drawn.table && table.rev === drawn.rev && columns === drawn.columns
      && formulas === drawn.formulas && config === drawn.config && lng === drawn.lang) return;
    input.setView({
      table, columns: headerColumns(columns ?? []), formulas,
      colWidths: config.view?.colWidths ?? {}, selection: config.view?.selection ?? null, lang: lng,
    });
    Object.assign(drawn, { table, rev: table.rev, columns, formulas, config, lang: lng });
  });

  return {
    destroy: () => {
      input?.destroy();
      alive = false;
      input = null;
      view.el.removeEventListener('cell:edit-blocked', onBlocked);
      view.el.removeEventListener('column:edit-blocked', onBlocked);
      view.destroy();
      slot.remove();
      if (hostEl._datagrid) delete hostEl._datagrid;
    },
  };
}
