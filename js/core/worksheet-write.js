/**
 * D.Mike — Spalten in einen Worksheet schreiben (worksheet-write.js)
 *
 * Ein Werkzeug beschreibt mit `worksheetWrite()`, was es schreiben will; der
 * Builder macht daraus einen Stapel der Agentenfläche, `commitWorksheetWrite`
 * schickt ihn über `ctx.instances.interact`. Der Stapel wird ganz oder gar
 * nicht geschrieben: scheitert eine Aktion, nimmt die Agentenschicht alles
 * zurück, auch einen eigens angelegten Worksheet. Ein Strg+Z im Worksheet
 * nimmt das ganze Schreiben zurück.
 *
 *   const plan = worksheetWrite()
 *     .newWorksheet({ name: 'Import' })
 *     .column({ name: 'Preis', type: 'currency', values, format: { decimals: 2 } })
 *     .build(ctx);
 *   const { instanceId, columnIds } = await commitWorksheetWrite(ctx, plan);
 *
 * Plan: `{ stack, created, sheetId }`. Der Stapel ist
 *   - neu: `module.add` (`id: 'ws'`), `renameSheet` auf den Wunschnamen,
 *     `writeColumns` (`id: 'write'`) — Spalten mit `to: 'start'`;
 *   - vorhanden: ein `writeColumns` (`id: 'write'`) — `column()` mit
 *     `to: 'append'`, `overwrite(colId)` mit `to: colId`.
 *
 * Rein bzw. DOM-frei: kein DOM, kein `window`.
 */
import { uid } from './uid.js';
import { inferRole, isRoleValidForType } from './datagrid/datagrid-roles.js';
import { recalcAllFormulas } from './datagrid/datagrid-formula.js';
import { COLUMN_TYPES } from './datagrid/datagrid-utils.js';
import { findOwnPhase } from './instance-handoff.js';
import { uniqueSheetName } from './worksheet-sheets.js';

/** Blatt eines neu angelegten Worksheets. */
const NEW_SHEET_ID = 'sheet_1';

/** Meldungstexte je Grund; Planfehler tragen den Grund als Text. */
const REASON_MESSAGES = {
  unknown_instance: ['modules.worksheet.appendTargetUnknown', 'Target column not found in the worksheet'],
  unknown_sheet: ['modules.worksheet.appendTargetUnknown', 'Target column not found in the worksheet'],
  unknown_column: ['modules.worksheet.appendTargetUnknown', 'Target column not found in the worksheet'],
  write_failed: ['modules.worksheet.writeFailed', 'The worksheet could not write the columns'],
};

/**
 * Fehler beim Bauen oder Schreiben eines Plans. `reason` ist einer von
 * `missing_target`, `missing_sheet`, `empty_plan`, `unknown_type`,
 * `unknown_instance`, `unknown_sheet`, `unknown_column`, `write_failed`.
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

/**
 * @param {{ i18n?: { t?: (key: string) => string } }|null|undefined} ctx
 * @param {string} reason
 * @returns {WriteError}
 */
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
 * Einen Eintrag für `worksheet.writeColumns` als reines JSON festhalten;
 * fehlende Angaben entfallen.
 * @param {string} to `'start'`, `'append'` oder eine Spalten-id
 * @param {{ name?: string, type?: string, values?: any[], format?: object, discrete?: boolean }} spec
 * @returns {{ to: string, name: string, type: string, values: any[], format?: object, discrete?: boolean }}
 */
function makeColumn(to, { name, type, values, format, discrete }) {
  /** @type {{ to: string, name: string, type: string, values: any[], format?: object, discrete?: boolean }} */
  const column = { to, name: name ?? '', type: type ?? 'numeric', values: [...(values ?? [])] };
  if (format !== undefined) column.format = cloneFormat(format);
  if (discrete !== undefined) column.discrete = !!discrete;
  return column;
}

/**
 * @typedef {{ stack: import('./agent/agent-types.generated.js').ModuleStack,
 *   created: boolean, sheetId: string }} WorksheetWritePlan
 */

/**
 * @typedef {{ name?: string, type?: string, values: any[], format?: object, discrete?: boolean }} ColumnInput
 */

/**
 * @typedef {object} WorksheetWriteBuilder
 * @property {(opts?: { name?: string }) => WorksheetWriteBuilder} newWorksheet
 * @property {(instanceId: string) => WorksheetWriteBuilder} worksheet
 * @property {(id: string) => WorksheetWriteBuilder} sheet
 * @property {(input: ColumnInput) => WorksheetWriteBuilder} column
 * @property {(colId: string, input: ColumnInput) => WorksheetWriteBuilder} overwrite
 * @property {(ctx?: { stateManager?: object, instanceId?: string }) => WorksheetWritePlan} build
 */

/**
 * Einen Schreibplan bauen.
 *
 * - `.newWorksheet({ name })`: ein neuer Worksheet in der Phase des
 *   Aufrufers, Blatt `sheet_1` mit dem Wunschnamen (eindeutig gemacht);
 *   die Spalten füllen erst die leeren Startspalten, weitere werden
 *   angehängt.
 * - `.worksheet(instanceId).sheet(sheetId)`: ein bestehender Worksheet;
 *   `.column()` hängt immer an.
 * - `.overwrite(colId, …)`: eine bestehende Spalte überschreiben.
 * - `.build(ctx)` liefert den Plan und wirft `WriteError` mit
 *   `missing_target`, `missing_sheet`, `empty_plan` oder `unknown_type`.
 *   `ctx` (`stateManager`, `instanceId` des Aufrufers) bestimmt Phase und
 *   eindeutigen Blattnamen eines neuen Worksheets; ohne ihn entfällt die
 *   Phase und der Name bleibt, wie er ist.
 *
 * @returns {WorksheetWriteBuilder}
 */
export function worksheetWrite() {
  /** @type {{ kind: 'new', name: string } | { kind: 'existing', instanceId: string } | null} */
  let target = null;
  /** @type {string|null} */
  let sheetId = null;
  /** @type {Array<{ kind: 'column'|'overwrite', colId?: string, spec: ColumnInput }>} */
  const steps = [];

  /** @type {WorksheetWriteBuilder} */
  const api = {
    newWorksheet({ name } = {}) {
      target = { kind: 'new', name: name ?? '' };
      sheetId = NEW_SHEET_ID;
      return api;
    },
    worksheet(instanceId) {
      target = { kind: 'existing', instanceId };
      return api;
    },
    sheet(id) {
      sheetId = id;
      return api;
    },
    column(spec) {
      steps.push({ kind: 'column', spec: spec ?? { values: [] } });
      return api;
    },
    overwrite(colId, spec) {
      steps.push({ kind: 'overwrite', colId, spec: spec ?? { values: [] } });
      return api;
    },
    build(ctx) {
      if (!target) throw new WriteError('missing_target');
      if (!sheetId) throw new WriteError('missing_sheet');
      if (steps.length === 0) throw new WriteError('empty_plan');
      const created = target.kind === 'new';
      const columns = steps.map((step) => {
        const { type } = step.spec;
        if (type !== undefined && !Object.hasOwn(COLUMN_TYPES, type)) throw new WriteError('unknown_type');
        if (step.kind === 'overwrite') return makeColumn(String(step.colId), step.spec);
        return makeColumn(created ? 'start' : 'append', step.spec);
      });

      if (target.kind === 'existing') {
        return {
          created: false,
          sheetId,
          stack: [{
            op: 'instance.call', id: 'write', module: 'worksheet', instance: target.instanceId,
            method: 'writeColumns', args: [sheetId, columns],
          }],
        };
      }

      const sm = /** @type {any} */ (ctx?.stateManager);
      /** @type {import('./agent/agent-types.generated.js').ModuleStack} */
      const stack = [sm && ctx?.instanceId
        ? { op: 'module.add', id: 'ws', module: 'worksheet', phase: findOwnPhase(sm, ctx.instanceId) }
        : { op: 'module.add', id: 'ws', module: 'worksheet' }];
      const ws = { $from: 'ws', path: 'instanceId' };
      if (target.name.trim() !== '') {
        const name = sm ? uniqueSheetName(sm, target.name) : target.name;
        stack.push({ op: 'instance.call', module: 'worksheet', instance: ws, method: 'renameSheet', args: [NEW_SHEET_ID, name] });
      }
      stack.push({ op: 'instance.call', id: 'write', module: 'worksheet', instance: ws, method: 'writeColumns', args: [NEW_SHEET_ID, columns] });
      return { created: true, sheetId: NEW_SHEET_ID, stack };
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
  // Die Formeln lesen Nachbarspalten über `getColumnByIndex`.
  const grid = {
    columns: state.columns,
    rowCount: state.rowCount,
    getColumnByIndex: (i) => state.columns[i],
  };
  recalcAllFormulas(grid);
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

/** Fehlercodes der Agentenschicht, die ein unbekanntes Ziel bedeuten. */
const TARGET_ERRORS = new Set(['unknown_instance', 'instance_module_mismatch']);

/** Präfixe der Wurfmeldungen von `worksheet.writeColumns`. */
const WRITE_PREFIX = /\b(unknown_sheet|unknown_column): /;

/**
 * Die Fehlerantwort eines Stapels auf einen `reason` abbilden.
 * @param {any} res die Antwort von `interact`
 * @returns {string}
 */
function reasonOf(res) {
  if (res?.error === 'validation_failed') {
    return TARGET_ERRORS.has(res.cause?.error) ? 'unknown_instance' : 'write_failed';
  }
  const failed = Array.isArray(res?.results) ? res.results.find((r) => r?.ok === false) : null;
  if (!failed) return 'write_failed';
  if (failed.error === 'instance_module_mismatch') return 'unknown_instance';
  const prefix = WRITE_PREFIX.exec(String(failed.message ?? ''));
  return prefix ? prefix[1] : 'write_failed';
}

/**
 * Einen Plan aus `worksheetWrite().build()` ganz oder gar nicht schreiben:
 * der Stapel läuft über `ctx.instances.interact`. Scheitert er, hat die
 * Agentenschicht alles zurückgenommen, auch einen eben angelegten
 * Worksheet. Die Meldung des Fehlers kommt aus den eigenen Texten, nie aus
 * der Antwort der Agentenschicht; deren Ursache steht in der Konsole.
 *
 * @param {{ instances: { interact: (stack: import('./agent/agent-types.generated.js').ModuleStack) => Promise<any> },
 *   i18n?: object }} ctx der Kontext (bzw. `services`) der aufrufenden Instanz
 * @param {WorksheetWritePlan} plan der Plan
 * @returns {Promise<{ instanceId: string, sheetId: string, columnIds: string[], created: boolean }>}
 * @throws {WriteError} (abgelehnt) mit `reason` `unknown_instance`,
 *   `unknown_sheet`, `unknown_column` oder `write_failed`
 */
export async function commitWorksheetWrite(ctx, plan) {
  const res = await ctx.instances.interact(plan.stack);
  if (res?.ok !== true) {
    console.warn('[worksheet-write] stack failed', res);
    throw writeError(ctx, reasonOf(res));
  }
  const byId = new Map(res.results.map((r) => [r.id, r.result]));
  const write = byId.get('write');
  const instanceId = plan.created ? byId.get('ws')?.instanceId : write?.instanceId;
  return {
    instanceId,
    sheetId: plan.sheetId,
    columnIds: [...(write?.value ?? [])],
    created: plan.created,
  };
}
