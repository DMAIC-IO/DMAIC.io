/**
 * D.Mike — Arbeitsblatt: Migrationen (domain/migrations.js)
 *
 * `0→1.0`: aus der Altform `{ sheets: [{ id, name, state }], activeSheetId,
 * sheetCounter }` mit dem undurchsichtigen Rasterstand `state`
 * (`DataGrid#getState`: `columns[]` mit `values`/`formulas` je Spalte,
 * `rowCount`, `colWidths`, `sortCol`, `sortDir`, `selection`) wird die
 * Zielform: je Blatt Spaltenköpfe, dünne Formeln und die Tabelle `data`;
 * Spaltenbreiten und Auswahl wandern ins Ansichtsfeld `gridView`, der
 * Sortierzustand entfällt.
 *
 * Ids von Blättern und Spalten bleiben erhalten (Spaltenverweise anderer
 * Module zeigen darauf); eine fehlende id wird ersetzt. Nicht strenger als
 * die Altform: Alt-Text in einer Nicht-Textspalte macht sie zur Textspalte
 * (kein Zellwert geht verloren); was die Zielform nicht fassen kann
 * (unbekannte Format- und meta-Schlüssel, ungültige Ansichtswerte), fällt
 * einzeln weg, nie ein Blatt.
 *
 * Importiert nichts aus `model.js` (fester Formatstand). Rein bis auf `uid`.
 */
import { uid } from '../../../core/uid.js';
import { COLUMN_TYPES, DATE_FORMATS, TIME_FORMATS, START_ROW_COUNT } from '../../../core/datagrid/datagrid-utils.js';
import { ALL_ROLES, inferRole, isRoleValidForType } from '../../../core/datagrid/datagrid-roles.js';

/** Startspalten eines frischen Blatts (wie `DataGrid#_initEmptyGrid`). */
const START_COLUMNS = 5;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {boolean} gültiger Zellwert (wie `isCell`, hier fest) */
const isCell = (v) => v === null || typeof v === 'string' || typeof v === 'boolean'
  || (typeof v === 'number' && Number.isFinite(v));

/** @param {unknown} v @returns {boolean} ganze Zahl ≥ 0 */
const isIndex = (v) => Number.isInteger(v) && /** @type {number} */ (v) >= 0;

/**
 * Ein frisches Blatt in der gespeicherten Form 1.0 (C1–C5, leer).
 * @param {string} id @param {string} name @returns {object}
 */
function freshSheet(id, name) {
  const columns = [];
  for (let i = 0; i < START_COLUMNS; i++) {
    columns.push({
      id: uid(), name: '', shortName: `C${i + 1}`, type: 'numeric', unit: null,
      role: 'continuous', roleManual: false, format: {}, meta: null,
    });
  }
  return {
    id, name, columns, formulas: {},
    data: { rowCount: START_ROW_COUNT, columns: columns.map(() => new Array(START_ROW_COUNT).fill(null)) },
  };
}

/**
 * Die Zellwerte einer Altspalte: genau `n` Einträge, Lücken und ungültige
 * Zellen (`undefined`, `NaN`, Objekte) als `null`.
 * @param {unknown} src @param {number} n @returns {any[]}
 */
function cellsOf(src, n) {
  const out = new Array(n);
  const arr = Array.isArray(src) ? src : [];
  for (let r = 0; r < n; r++) out[r] = r < arr.length && isCell(arr[r]) ? arr[r] : null;
  return out;
}

/**
 * Nur die Format-Schlüssel der Zielform mit gültigem Wert (`FORMAT_KEYS` und
 * `currencySymbol`, Ruling R10); Unbekanntes fällt weg.
 * @param {unknown} f @returns {Record<string, any>}
 */
function formatOf(f) {
  const out = {};
  if (!isObject(f)) return out;
  if (isIndex(f.decimals)) out.decimals = f.decimals;
  if (typeof f.dateFormat === 'string' && Object.hasOwn(DATE_FORMATS, f.dateFormat)) out.dateFormat = f.dateFormat;
  if (typeof f.timeFormat === 'string' && Object.hasOwn(TIME_FORMATS, f.timeFormat)) out.timeFormat = f.timeFormat;
  if (typeof f.currencySymbol === 'string') out.currencySymbol = f.currencySymbol;
  return out;
}

/**
 * `meta` mit den Schlüsseln von `COLUMN_META_KEYS`; `null`-Werte und Ungültiges
 * fallen einzeln weg (`setColumnMeta` lehnt `null`-Werte ab).
 * @param {unknown} meta @returns {Record<string, any>|null}
 */
function metaOf(meta) {
  if (!isObject(meta)) return null;
  const out = {};
  if (meta.lock === 'hard' || meta.lock === 'soft') out.lock = meta.lock;
  for (const k of ['reason', 'managedBy', 'managedRef']) if (typeof meta[k] === 'string') out[k] = meta[k];
  if (isObject(meta.categoricalCoding)) {
    out.categoricalCoding = Object.fromEntries(Object.entries(meta.categoricalCoding)
      .filter(([k, v]) => k !== '__proto__' && typeof v === 'number' && Number.isFinite(v)));
  }
  return out;
}

/**
 * Passt der Zellwert zum Spaltentyp? Dieselbe Regel wie die Invariante
 * `cellsFitType` (domain/model.js), hier fest.
 * @param {string} type @param {any} v @returns {boolean}
 */
function fitsType(type, v) {
  if (v === null) return true;
  switch (type) {
    case 'numeric': case 'currency': case 'percent': return typeof v === 'number';
    case 'binary': return typeof v === 'number' || typeof v === 'boolean';
    case 'date': case 'time': return typeof v === 'string' || typeof v === 'number';
    default: return true;
  }
}

/**
 * Die Zellen einer Nicht-Textspalte an ihren Typ anpassen, ohne Daten zu
 * verlieren: `''` wird `null` (wie `DataGrid#setCellValue`); passt danach eine
 * Zelle ohne Formel noch nicht (Alt-Text wie `'2,5'`, den `writeColumns`
 * ungeprüft schrieb), wird die Spalte `text`. Verändert `values`.
 * @param {string} type @param {any[]} values @param {Record<string, string>|undefined} byRow Formeln der Spalte
 * @returns {string} der Typ danach
 */
function settleType(type, values, byRow) {
  if (type === 'text') return type;
  for (let r = 0; r < values.length; r++) if (values[r] === '') values[r] = null;
  for (let r = 0; r < values.length; r++) {
    if (!fitsType(type, values[r]) && !(byRow && Object.hasOwn(byRow, String(r)))) return 'text';
  }
  return type;
}

/**
 * Eine Altspalte als Spaltenkopf der Zielform.
 * @param {any} c Altspalte @param {number} i Position @param {any[]} values ihre Zellen
 * @param {Record<string, string>|undefined} byRow ihre Formeln (dünn)
 * @returns {object}
 */
function columnOf(c, i, values, byRow) {
  const stored = typeof c.type === 'string' && Object.hasOwn(COLUMN_TYPES, c.type) ? c.type : 'numeric';
  const type = settleType(stored, values, byRow);
  let role = ALL_ROLES.includes(c.role) ? c.role : null;
  let roleManual = c.roleManual === true;
  if (type !== stored) {
    // Dieselbe Regel wie `reinferRoleAfterRetype` (core/worksheet-write.js).
    if (!(roleManual && isRoleValidForType(role, type))) { roleManual = false; role = null; }
  }
  return {
    id: typeof c.id === 'string' && c.id !== '' ? c.id : uid(),
    name: typeof c.name === 'string' ? c.name : '',
    shortName: typeof c.shortName === 'string' ? c.shortName : `C${i + 1}`,
    type,
    unit: typeof c.unit === 'string' ? c.unit : null,
    // Wie `DataGrid#setState`: eine Spalte ohne (gültige) Rolle bekommt die abgeleitete.
    role: role ?? inferRole({ type, values }),
    roleManual,
    format: formatOf(c.format),
    meta: metaOf(c.meta),
  };
}

/**
 * Die Auswahl des Rasters, sonst `null`.
 * @param {unknown} s @returns {object|null}
 */
function selectionOf(s) {
  if (!isObject(s) || !['startCol', 'startRow', 'endCol', 'endRow'].every(k => isIndex(s[k]))) return null;
  const out = {
    startCol: s.startCol, startRow: s.startRow, endCol: s.endCol, endRow: s.endRow,
    activeCol: isIndex(s.activeCol) ? s.activeCol : s.startCol,
    activeRow: isIndex(s.activeRow) ? s.activeRow : s.startRow,
  };
  if (Array.isArray(s.extraCols)) out.extraCols = s.extraCols.filter(isIndex);
  return out;
}

/**
 * Ein Altblatt als Blatt der Zielform plus seine Ansicht.
 * @param {any} sh Altblatt `{ id, name, state }`
 * @returns {{ sheet: object, view: object|null }}
 */
function sheetOf(sh) {
  const id = isObject(sh) && typeof sh.id === 'string' && sh.id !== '' ? sh.id : `sheet_${uid()}`;
  const name = isObject(sh) && typeof sh.name === 'string' ? sh.name : '';
  const state = isObject(sh) && isObject(sh.state) ? sh.state : null;
  if (!state) return { sheet: freshSheet(id, name), view: null };

  const old = Array.isArray(state.columns) ? state.columns.filter(isObject) : [];
  // Wie `worksheetSnapshot`: ohne `rowCount` zählt die längste Spalte.
  const rowCount = typeof state.rowCount === 'number' && Number.isFinite(state.rowCount)
    ? Math.max(0, Math.floor(state.rowCount))
    : Math.max(0, ...old.map(c => (Array.isArray(c.values) ? c.values.length : 0)));
  const data = old.map(c => cellsOf(c.values, rowCount));
  const byRows = old.map((c) => {
    if (!Array.isArray(c.formulas)) return undefined;
    /** @type {Record<string, string>} */
    const byRow = {};
    for (let r = 0; r < Math.min(rowCount, c.formulas.length); r++) {
      const f = c.formulas[r];
      if (typeof f === 'string' && f !== '') byRow[String(r)] = f;
    }
    return Object.keys(byRow).length > 0 ? byRow : undefined;
  });
  const columns = old.map((c, i) => columnOf(c, i, data[i], byRows[i]));

  /** @type {Record<string, Record<string, string>>} */
  const formulas = {};
  columns.forEach((c, i) => { if (byRows[i]) formulas[c.id] = byRows[i]; });

  const colWidths = isObject(state.colWidths)
    ? Object.fromEntries(Object.entries(state.colWidths)
      .filter(([k, v]) => k !== '__proto__' && typeof v === 'number' && Number.isFinite(v) && v > 0))
    : {};
  const selection = selectionOf(state.selection);
  const view = Object.keys(colWidths).length > 0 || selection !== null ? { colWidths, selection } : null;
  return { sheet: { id, name, columns, formulas, data: { rowCount, columns: data } }, view };
}

/**
 * Altform (Version 0) → Zielform 1.0. Verändert die Eingabe nicht.
 * @param {any} json gespeicherter Stand der Altform
 * @returns {object} der Stand 1.0 (ohne `_schema`)
 */
export function from0(json) {
  const out = {};
  if (!Array.isArray(json?.sheets)) return out;
  const sheets = [];
  /** @type {Record<string, object>} */
  const gridView = {};
  for (const sh of json.sheets) {
    const { sheet, view } = sheetOf(sh);
    sheets.push(sheet);
    if (view && !Object.hasOwn(gridView, sheet.id)) gridView[sheet.id] = view;
  }
  out.sheets = sheets;
  out.sheetCounter = isIndex(json.sheetCounter) ? json.sheetCounter : sheets.length;
  // Ein unbekanntes aktives Blatt heilt die Invariante `activeSheet` (erstes Blatt).
  out.activeSheetId = typeof json.activeSheetId === 'string' ? json.activeSheetId : '';
  out.gridView = gridView;
  return out;
}
