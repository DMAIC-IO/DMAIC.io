/**
 * D.Mike — Eine Spalte in einen Worksheet schreiben (worksheet-append.js)
 *
 * `worksheet:appendColumn` erreicht nur einen EINGEHÄNGTEN Worksheet — der
 * Listener lebt in dessen Viewmodel, und die Workspace hängt Module lazy ein.
 * Ein Ziel, das in dieser Sitzung noch nicht geöffnet war, verpasste das
 * Event still, und der Sender meldete trotzdem Erfolg (Bug 13).
 *
 * Hier stehen deshalb zwei Dinge:
 * - `applyAppendColumn` — die reine Schreibregel auf dem gespeicherten
 *   Worksheet-Zustand. Der Worksheet nutzt sie selbst für inaktive Blätter.
 * - `sendColumnToWorksheet` — der eine Weg für Sender: Event an den
 *   eingehängten Worksheet (der per `reply` quittiert), sonst Schreiben in
 *   den Store, sonst ein ehrlicher Fehler.
 *
 * Rein bzw. DOM-frei: kein DOM, kein `window`.
 */
import { uid } from './uid.js';

/** Leerer Blattzustand, wie ihn der Worksheet für ein neues Blatt anlegt. */
function emptySheetState() {
  return { columns: [], rowCount: 0, colWidths: {}, sortCol: null, sortDir: null, selection: null };
}

/**
 * Eine Spalte in ein Blatt eines gespeicherten Worksheet-Zustands schreiben.
 *
 * Verändert die Eingabe nicht: Blattliste, Zielblatt, Spaltenliste und
 * Zielspalte werden neu angelegt, alles andere geteilt.
 *
 * @param {{ sheets: Array<{ id: string, name: string, state: object|null }> }|null} wsState
 *   der Worksheet-Zustand (`toJSON()` bzw. `stateManager.getModuleState`)
 * @param {{ sheetId: string, colId: string, slot?: number, name: string,
 *   values: any[], discrete?: boolean, type?: string }} payload
 *   die Nutzlast von `worksheet:appendColumn` (ohne `instanceId`); `colId`
 *   ist eine Spalten-id, `'__new__'`, `'__first__'` oder `'__slot__'` (mit `slot`)
 * @returns {{ ok: true, state: object, colId: string }
 *   | { ok: false, reason: 'unknown_sheet'|'unknown_column' }}
 */
export function applyAppendColumn(wsState, { sheetId, colId, slot, name, values, discrete, type }) {
  const sheets = Array.isArray(wsState?.sheets) ? wsState.sheets : [];
  const sheetIdx = sheets.findIndex(s => s?.id === sheetId);
  if (sheetIdx < 0) return { ok: false, reason: 'unknown_sheet' };

  const isText = type === 'text';
  const colType = isText ? 'text' : 'numeric';
  const format = isText ? {} : { decimals: discrete ? 0 : 6 };
  const vals = [...(values ?? [])];

  const sheet = sheets[sheetIdx];
  const state = { ...(sheet.state ?? emptySheetState()) };
  const cols = [...(state.columns ?? [])];

  const isFirstSlot = colId === '__first__';
  const isSlotIndex = colId === '__slot__' && Number.isInteger(slot) && slot >= 0;
  let resolved = colId;
  if (isFirstSlot) resolved = cols[0]?.id;
  else if (isSlotIndex) resolved = cols[slot]?.id;
  const overwriteName = isFirstSlot || isSlotIndex;

  if (!resolved || resolved === '__new__') {
    resolved = uid();
    cols.push({
      id: resolved,
      name,
      shortName: `C${cols.length + 1}`,
      type: colType,
      unit: '',
      values: vals,
      formulas: new Array(vals.length).fill(null),
      format,
    });
  } else {
    const idx = cols.findIndex(c => c?.id === resolved);
    if (idx < 0) return { ok: false, reason: 'unknown_column' };
    const col = { ...cols[idx] };
    if (overwriteName && name) col.name = name;
    if (isText) { col.type = 'text'; col.format = {}; }
    col.values = vals;
    col.formulas = new Array(vals.length).fill(null);
    cols[idx] = col;
  }

  state.columns = cols;
  state.rowCount = Math.max(state.rowCount || 0, vals.length);
  const nextSheets = [...sheets];
  nextSheets[sheetIdx] = { ...sheet, state };
  return { ok: true, state: { ...wsState, sheets: nextSheets }, colId: resolved };
}

/** Ist `instanceId` ein Worksheet des Projekts? */
function isWorksheetInstance(stateManager, instanceId) {
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    const items = stateManager.get(`phases.${phase}`) ?? [];
    if (items.some(i => i.instanceId === instanceId && i.moduleId === 'worksheet')) return true;
  }
  return false;
}

function targetError(context, reason) {
  const msg = context.i18n?.t?.('modules.worksheet.appendTargetUnknown') || 'Target column not found in the worksheet';
  const err = new Error(msg);
  err.reason = reason;
  return err;
}

/**
 * Eine Spalte an einen Worksheet senden — eingehängt oder nicht.
 *
 * - Eingehängt: `worksheet:appendColumn` mit einem `reply`-Rückruf. Der
 *   Worksheet quittiert synchron (der EventBus ruft Listener synchron); den
 *   Store schreibt er selbst. Ein Schreiben hier würde seine nächste
 *   Sicherung ohnehin überschreiben.
 * - Nicht eingehängt (keine Quittung): `applyAppendColumn` auf den
 *   gespeicherten Zustand, speichern, `worksheet:dataChanged` melden. Beim
 *   späteren Einhängen spielt die Workspace genau diesen Zustand ein.
 * - Kein Worksheet dieses Projekts, Blatt oder Spalte fehlt: Fehler. Der
 *   Aufrufer meldet ihn; eine Erfolgsmeldung gibt es nur nach echtem Erfolg.
 *
 * @param {object} context `module._context` (stateManager, eventBus, i18n)
 * @param {string} instanceId der Ziel-Worksheet
 * @param {{ sheetId: string, colId: string, slot?: number, name: string,
 *   values: any[], discrete?: boolean, type?: string }} payload
 * @returns {{ instanceId: string, mounted: boolean }}
 * @throws {Error} wenn das Ziel unbekannt ist (`err.reason`)
 */
export function sendColumnToWorksheet(context, instanceId, payload) {
  const sm = context.stateManager;
  const eb = context.eventBus;
  if (!isWorksheetInstance(sm, instanceId)) throw targetError(context, 'unknown_instance');

  let answer = null;
  eb.emit('worksheet:appendColumn', {
    ...payload,
    instanceId,
    reply: (res) => { answer = res; },
  });
  if (answer) {
    if (!answer.ok) throw targetError(context, answer.reason ?? 'unknown_column');
    return { instanceId, mounted: true };
  }

  const res = applyAppendColumn(sm.getModuleState(instanceId), payload);
  if (!res.ok) throw targetError(context, res.reason);
  sm.setModuleState(instanceId, res.state);
  eb.emit('worksheet:dataChanged', { instanceId });
  return { instanceId, mounted: false };
}
