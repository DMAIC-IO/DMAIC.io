/**
 * D.Mike — Spalten in einen Worksheet schreiben (worksheet-write.js)
 *
 * Ein Werkzeug beschreibt, was es schreiben will, als Plan (reines JSON) und
 * übergibt ihn `commitWorksheetWrite`. Der Plan wird ganz oder gar nicht
 * geschrieben: Ein Schritt mit unbekanntem Blatt oder unbekannter Spalte
 * verhindert jede Schreibung, und ein dafür eigens angelegter Worksheet wird
 * wieder entfernt.
 *
 *   const plan = worksheetWrite()
 *     .newWorksheet({ name: 'Import' })
 *     .column({ name: 'Preis', type: 'currency', values, format: { decimals: 2 } })
 *     .build();
 *   const { instanceId, columnIds } = await commitWorksheetWrite(ctx, plan);
 *
 * Plan:
 *   { target: { kind: 'new', name } | { kind: 'existing', instanceId },
 *     sheetId,
 *     ops: [{ to: { kind: 'append' } | { kind: 'slot', slot } | { kind: 'column', colId },
 *             name, type, values, format?, discrete? }] }
 *
 * Ein eingehängter Worksheet empfängt den Plan über `worksheet:writeColumns`
 * und quittiert per `reply`. Ein nicht eingehängter wird über den Store
 * geschrieben (`applyWriteColumn` je Schritt, dann einmal speichern).
 *
 * Rein bzw. DOM-frei: kein DOM, kein `window`.
 */
import { uid } from './uid.js';
import { inferRole, isRoleValidForType } from './datagrid/datagrid-roles.js';
import { recalcAllFormulas } from './datagrid/datagrid-formula.js';
import { COLUMN_TYPES } from './datagrid/datagrid-utils.js';
import { findOwnPhase } from './instance-handoff.js';
import { uniqueSheetName, buildInitialWorksheetState } from './worksheet-sheets.js';
import { removeProvisionedWorksheet } from './examples-registry.js';

/** Zahl der leeren Spalten, die ein neuer Worksheet mitbringt. */
export const START_SLOTS = 5;

/**
 * Obergrenze für das Warten auf `module:activated`. Wechselt der Nutzer
 * während des Einhängens den Tab, meldet die Workspace die Aktivierung nie —
 * ohne Frist hinge das Versprechen und mit ihm jede wartende `@agent`-Aktion.
 * 20 s wie `MOUNT_TIMEOUT_MS` in `ui/workspace.js`.
 */
const OPEN_TIMEOUT_MS = 20000;

/** Meldungstexte je Grund; Planfehler tragen den Grund als Text. */
const REASON_MESSAGES = {
  unknown_instance: ['modules.worksheet.appendTargetUnknown', 'Target column not found in the worksheet'],
  unknown_sheet: ['modules.worksheet.appendTargetUnknown', 'Target column not found in the worksheet'],
  unknown_column: ['modules.worksheet.appendTargetUnknown', 'Target column not found in the worksheet'],
  open_timeout: ['modules.worksheet.openTimeout', 'The new worksheet did not open in time'],
  write_failed: ['modules.worksheet.writeFailed', 'The worksheet could not write the columns'],
};

/**
 * Fehler beim Bauen oder Schreiben eines Plans. `reason` ist einer von
 * `missing_target`, `missing_sheet`, `empty_plan`, `unknown_type`,
 * `unknown_instance`, `unknown_sheet`, `unknown_column`, `open_timeout`,
 * `write_failed`.
 */
export class WriteError extends Error {
  /**
   * @param {string} reason maschinenlesbarer Grund
   * @param {string} [message] Meldungstext, ohne ihn der Grund
   */
  constructor(reason, message) {
    super(message || reason);
    this.name = 'WriteError';
    this.reason = reason;
  }
}

function writeError(ctx, reason) {
  const [key, fallback] = REASON_MESSAGES[reason] ?? [null, reason];
  const msg = (key && ctx?.i18n?.t?.(key)) || fallback;
  return new WriteError(reason, msg);
}

// ─── Builder ─────────────────────────────────────────────────────

/**
 * Ein Format als reines JSON kopieren. Nicht `structuredClone`: Aufrufer
 * reichen oft reaktive Proxys (Alpine) herein, die sich nicht klonen lassen.
 * @param {object} format
 * @returns {object}
 */
function cloneFormat(format) {
  return JSON.parse(JSON.stringify(format ?? {}));
}

/**
 * Einen Schritt als reines JSON festhalten; fehlende Angaben entfallen.
 * @returns {object}
 */
function makeOp(to, { name, type, values, format, discrete }) {
  const op = { to, name: name ?? '', type: type ?? 'numeric', values: [...(values ?? [])] };
  if (format !== undefined) op.format = cloneFormat(format);
  if (discrete !== undefined) op.discrete = !!discrete;
  return op;
}

/**
 * Einen Schreibplan bauen.
 *
 * - `.newWorksheet({ name })`: ein neuer Worksheet, Blatt `sheet_1`; die
 *   ersten `START_SLOTS` Spalten füllen die leeren Startspalten, weitere
 *   werden angehängt.
 * - `.worksheet(instanceId).sheet(sheetId)`: ein bestehender Worksheet;
 *   `.column()` hängt immer an.
 * - `.overwrite(colId, …)`: eine bestehende Spalte überschreiben.
 * - `.build()` liefert den Plan und wirft `WriteError` mit `missing_target`,
 *   `missing_sheet`, `empty_plan` oder `unknown_type`.
 *
 * @returns {{ newWorksheet: Function, worksheet: Function, sheet: Function,
 *   column: Function, overwrite: Function, build: () => object }}
 */
export function worksheetWrite() {
  let target = null;
  let sheetId = null;
  /** @type {Array<{ kind: 'column'|'overwrite', colId?: string, spec: object }>} */
  const steps = [];

  const api = {
    /** @param {{ name?: string }} [opts] gewünschter Blattname (wird eindeutig gemacht) */
    newWorksheet({ name } = {}) {
      target = { kind: 'new', name: name ?? '' };
      sheetId = 'sheet_1';
      return api;
    },
    /** @param {string} instanceId ein bestehender Worksheet */
    worksheet(instanceId) {
      target = { kind: 'existing', instanceId };
      return api;
    },
    /** @param {string} id Blatt des Worksheets */
    sheet(id) {
      sheetId = id;
      return api;
    },
    /** @param {{ name: string, type?: string, values: any[], format?: object, discrete?: boolean }} spec */
    column(spec) {
      steps.push({ kind: 'column', spec: spec ?? {} });
      return api;
    },
    /**
     * @param {string} colId die Zielspalte
     * @param {{ type?: string, values: any[], format?: object, discrete?: boolean }} spec
     */
    overwrite(colId, spec) {
      steps.push({ kind: 'overwrite', colId, spec: spec ?? {} });
      return api;
    },
    /** @returns {object} der Plan als reines JSON */
    build() {
      if (!target) throw new WriteError('missing_target');
      if (!sheetId) throw new WriteError('missing_sheet');
      if (steps.length === 0) throw new WriteError('empty_plan');
      let colIndex = 0;
      const ops = steps.map((step) => {
        const { type } = step.spec;
        if (type !== undefined && !Object.hasOwn(COLUMN_TYPES, type)) throw new WriteError('unknown_type');
        if (step.kind === 'overwrite') return makeOp({ kind: 'column', colId: step.colId }, step.spec);
        const i = colIndex++;
        const to = target.kind === 'new' && i < START_SLOTS ? { kind: 'slot', slot: i } : { kind: 'append' };
        return makeOp(to, step.spec);
      });
      return { target: { ...target }, sheetId, ops };
    },
  };
  return api;
}

// ─── Schreibregel ────────────────────────────────────────────────

/**
 * Vorgabeformat einer neuen Spalte.
 * @param {string} type Spaltentyp
 * @param {boolean} [discrete] ganze Zahlen
 * @returns {object}
 */
export function defaultColumnFormat(type, discrete) {
  return type === 'text' ? {} : { decimals: discrete ? 0 : 6 };
}

/**
 * Typ und Format, die ein Schritt einer BESTEHENDEN Spalte gibt.
 * Mit `format` oder einem Typ außer `numeric`/`text` werden beide
 * übernommen; `text` macht die Spalte zur Textspalte; `numeric` ohne Format
 * lässt Typ und Format der Spalte.
 * @param {{ type?: string, format?: object, discrete?: boolean }} op
 * @returns {{ type: string, format: object }|null} null = unverändert lassen
 */
export function retypeForWrite(op) {
  const type = op.type ?? 'numeric';
  if (op.format !== undefined || (type !== 'numeric' && type !== 'text')) {
    return { type, format: op.format !== undefined ? cloneFormat(op.format) : defaultColumnFormat(type, op.discrete) };
  }
  if (type === 'text') return { type: 'text', format: {} };
  return null;
}

/**
 * Die Rolle einer Spalte nach einem Typwechsel neu bestimmen: Eine von Hand
 * gesetzte Rolle bleibt, solange sie zum neuen Typ passt; sonst entscheidet
 * `inferRole` über die Werte, und die Hand-Markierung fällt weg. Dieselbe
 * Regel wie `DataGrid._reinferRoleAfterTypeChange`. Verändert `col`.
 * @param {{ type: string, values?: any[], role?: string, roleManual?: boolean }} col
 * @returns {void}
 */
export function reinferRoleAfterRetype(col) {
  if (col.roleManual && isRoleValidForType(col.role, col.type)) return;
  if (col.roleManual) col.roleManual = false;
  col.role = inferRole(col);
}

/** Leerer Blattzustand, wie ihn der Worksheet für ein neues Blatt anlegt. */
function emptySheetState() {
  return { columns: [], rowCount: 0, colWidths: {}, sortCol: null, sortDir: null, selection: null };
}

/**
 * Formelspalten kopieren und neu rechnen, wie es das Grid beim Rendern täte —
 * ein inaktives Blatt zeigte sonst bis zum Öffnen veraltete Werte. Kopiert,
 * weil `recalcAllFormulas` in `col.values` schreibt.
 * @param {{ columns: object[], rowCount: number }} state
 * @returns {void}
 */
function recalcSheetState(state) {
  state.columns = state.columns.map(c => (c?.formulas?.some(Boolean) ? { ...c, values: [...(c.values ?? [])] } : c));
  recalcAllFormulas({
    columns: state.columns,
    rowCount: state.rowCount,
    getColumnByIndex: (i) => state.columns[i],
  });
}

/**
 * Einen Schritt eines Plans in ein Blatt eines gespeicherten
 * Worksheet-Zustands schreiben.
 *
 * Verändert die Eingabe nicht: Blattliste, Zielblatt, Spaltenliste und
 * Zielspalte werden neu angelegt, alles andere geteilt.
 *
 * @param {{ sheets: Array<{ id: string, name: string, state: object|null }> }|null} wsState
 *   der Worksheet-Zustand (`toJSON()` bzw. `stateManager.getModuleState`)
 * @param {{ sheetId: string, to: { kind: 'append' } | { kind: 'slot', slot: number }
 *   | { kind: 'column', colId: string }, name: string, type?: string,
 *   values: any[], format?: object, discrete?: boolean }} op
 * @returns {{ ok: true, state: object, colId: string }
 *   | { ok: false, reason: 'unknown_sheet'|'unknown_column' }}
 */
export function applyWriteColumn(wsState, op) {
  const { sheetId, to, name, values, discrete } = op;
  const sheets = Array.isArray(wsState?.sheets) ? wsState.sheets : [];
  const sheetIdx = sheets.findIndex(s => s?.id === sheetId);
  if (sheetIdx < 0) return { ok: false, reason: 'unknown_sheet' };

  const vals = [...(values ?? [])];
  const sheet = sheets[sheetIdx];
  const state = { ...(sheet.state ?? emptySheetState()) };
  const cols = [...(state.columns ?? [])];

  let idx = -1;
  if (to?.kind === 'slot' && Number.isInteger(to.slot) && to.slot >= 0) {
    idx = cols[to.slot] ? to.slot : -1;
  } else if (to?.kind === 'column') {
    idx = cols.findIndex(c => c?.id === to.colId);
    if (idx < 0) return { ok: false, reason: 'unknown_column' };
  }

  let colId;
  if (idx < 0) {
    const type = op.type ?? 'numeric';
    colId = uid();
    // `role` und `roleManual` wie `DataGrid.setState` sie beim Einhängen setzt,
    // damit ein späterer Tab-Klick die Revision nicht dreht.
    const fresh = {
      id: colId,
      name,
      shortName: `C${cols.length + 1}`,
      type,
      unit: '',
      values: vals,
      formulas: new Array(vals.length).fill(null),
      format: op.format !== undefined ? cloneFormat(op.format) : defaultColumnFormat(type, discrete),
      roleManual: false,
    };
    fresh.role = inferRole(fresh);
    cols.push(fresh);
  } else {
    const col = { ...cols[idx] };
    if (to.kind === 'slot' && name) col.name = name;
    const next = retypeForWrite(op);
    if (next) { col.type = next.type; col.format = next.format; }
    col.values = vals;
    col.formulas = new Array(vals.length).fill(null);
    if (next) reinferRoleAfterRetype(col);
    cols[idx] = col;
    colId = col.id;
  }

  state.columns = cols;
  state.rowCount = Math.max(state.rowCount || 0, vals.length);
  recalcSheetState(state);
  const nextSheets = [...sheets];
  nextSheets[sheetIdx] = { ...sheet, state };
  return { ok: true, state: { ...wsState, sheets: nextSheets }, colId };
}

// ─── Commit ──────────────────────────────────────────────────────

/** Ist `instanceId` ein Worksheet des Projekts? */
function isWorksheetInstance(stateManager, instanceId) {
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    const items = stateManager.get(`phases.${phase}`) ?? [];
    if (items.some(i => i.instanceId === instanceId && i.moduleId === 'worksheet')) return true;
  }
  return false;
}

/**
 * Einen neuen Worksheet in der Phase der aufrufenden Instanz anlegen und auf
 * seine Aktivierung warten. Bleibt sie innerhalb der Frist aus, wird er
 * wieder entfernt.
 * @returns {Promise<string>} die id des aktiven Worksheets
 */
function openNewWorksheet(ctx, sheetName, timeoutMs) {
  const sm = ctx.stateManager;
  const eb = ctx.eventBus;
  const phase = findOwnPhase(sm, ctx.instanceId);
  const wsId = `worksheet_${uid()}`;

  const existing = sm.get(`phases.${phase}`) ?? [];
  sm.set(`phases.${phase}`, [
    ...existing,
    { instanceId: wsId, moduleId: 'worksheet', order: existing.length, state: {} },
  ]);
  sm.setModuleState(wsId, buildInitialWorksheetState(uniqueSheetName(sm, sheetName)));

  const active = new Promise((resolve, reject) => {
    let timer = null;
    const onActivated = ({ instanceId }) => {
      if (instanceId !== wsId) return;
      eb.off('module:activated', onActivated);
      clearTimeout(timer);
      resolve(wsId);
    };
    eb.on('module:activated', onActivated);
    timer = setTimeout(() => {
      eb.off('module:activated', onActivated);
      removeProvisionedWorksheet(ctx, wsId);
      reject(writeError(ctx, 'open_timeout'));
    }, timeoutMs);
  });
  eb.emit('module:added', { moduleId: 'worksheet', phase, instanceId: wsId });
  return active;
}

/**
 * Alle Schritte in einen bestehenden Worksheet schreiben — eingehängt per
 * Ereignis, sonst über den Store.
 * @returns {string[]} die ids der geschriebenen Spalten, in Schrittfolge
 * @throws {WriteError} ohne etwas geschrieben zu haben
 */
function writeOps(ctx, instanceId, plan) {
  const sm = ctx.stateManager;
  const eb = ctx.eventBus;
  const { sheetId, ops } = plan;

  let answer = null;
  eb.emit('worksheet:writeColumns', { instanceId, sheetId, ops, reply: (res) => { answer = res; } });
  if (answer) {
    if (!answer.ok) throw writeError(ctx, answer.reason ?? 'unknown_column');
    return [...(answer.columnIds ?? [])];
  }

  let state = sm.getModuleState(instanceId);
  const columnIds = [];
  for (const op of ops) {
    const res = applyWriteColumn(state, { ...op, sheetId });
    if (!res.ok) throw writeError(ctx, res.reason);
    state = res.state;
    columnIds.push(res.colId);
  }
  sm.setModuleState(instanceId, state);
  eb.emit('worksheet:dataChanged', { instanceId });
  return columnIds;
}

/**
 * Einen Plan aus `worksheetWrite().build()` ganz oder gar nicht schreiben.
 *
 * - Bestehender Worksheet: eingehängt über `worksheet:writeColumns`
 *   (`{ instanceId, sheetId, ops, reply }`, der Worksheet prüft alle Schritte
 *   vor dem ersten Schreiben), sonst `applyWriteColumn` je Schritt auf einer
 *   Kopie des Zustands, dann ein `setModuleState` und ein
 *   `worksheet:dataChanged`.
 * - Neuer Worksheet: anlegen, auf `module:activated` warten, dann wie oben.
 *   Scheitert danach etwas, wird er wieder entfernt.
 *
 * @param {{ stateManager: object, eventBus: object, instanceId: string, i18n?: object }} ctx
 *   `module._context` der aufrufenden Instanz
 * @param {object} plan der Plan
 * @param {{ timeoutMs?: number }} [opts] Frist für die Aktivierung eines neuen Worksheets
 * @returns {Promise<{ instanceId: string, sheetId: string, columnIds: string[], created: boolean }>}
 * @throws {WriteError} (abgelehnt) mit `reason`
 */
export async function commitWorksheetWrite(ctx, plan, { timeoutMs = OPEN_TIMEOUT_MS } = {}) {
  const sm = ctx.stateManager;
  if (plan?.target?.kind === 'new') {
    const instanceId = await openNewWorksheet(ctx, plan.target.name, timeoutMs);
    try {
      const columnIds = writeOps(ctx, instanceId, plan);
      return { instanceId, sheetId: plan.sheetId, columnIds, created: true };
    } catch (err) {
      removeProvisionedWorksheet(ctx, instanceId);
      throw err;
    }
  }
  const instanceId = plan?.target?.instanceId;
  if (!instanceId || !isWorksheetInstance(sm, instanceId)) throw writeError(ctx, 'unknown_instance');
  const columnIds = writeOps(ctx, instanceId, plan);
  return { instanceId, sheetId: plan.sheetId, columnIds, created: false };
}
