/**
 * D.Mike — REST API: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js. Listen und Vorgaben stehen hier als Literal.
 */

const WRITE_MODES_1_0 = ['replace', 'append', 'prepend'];
const UNITS_1_0 = ['minutes', 'hours'];
const INTERVAL_DEFAULT = 5;
const INTERVAL_MAX = 999;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Text oder `''` wie im alten `fromJSON`. @param {unknown} v @returns {string} */
const textOf = (v) => (typeof v === 'string' ? v : '');

/** @param {unknown} v @returns {v is string} */
const isNonEmptyText = (v) => typeof v === 'string' && v !== '';

/**
 * Ein Spaltenbezug, wenn er die Form `{ instanceId, sheetId?, columnId }`
 * mit Texten hat, sonst `null`.
 * @param {unknown} ref
 * @returns {{ instanceId: string, sheetId?: string, columnId: string }|null}
 */
function columnRefOf(ref) {
  if (!isObject(ref) || !isNonEmptyText(ref.instanceId) || !isNonEmptyText(ref.columnId)) return null;
  if (ref.sheetId !== undefined && typeof ref.sheetId !== 'string') return null;
  return {
    instanceId: ref.instanceId,
    ...(ref.sheetId !== undefined ? { sheetId: ref.sheetId } : {}),
    columnId: ref.columnId,
  };
}

/**
 * Ein Abstand wie im alten `sanitizeSchedule`, zusätzlich auf eine ganze Zahl
 * von 1 bis 999 gebracht: unlesbar oder unter 1 → 5, gerundet, über 999 → 999.
 * @param {unknown} v @returns {number}
 */
function intervalOf(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return INTERVAL_DEFAULT;
  return Math.min(INTERVAL_MAX, Math.round(n));
}

/**
 * Der Zeitplan wie im alten `sanitizeSchedule`: `intervalMinutes` (ohne
 * `intervalValue`) wird der Abstand in Minuten; eine unbekannte Einheit wird
 * Minuten.
 * @param {unknown} s
 * @returns {{ enabled: boolean, intervalValue: number, intervalUnit: string }}
 */
function scheduleOf(s) {
  if (!isObject(s)) return { enabled: false, intervalValue: INTERVAL_DEFAULT, intervalUnit: 'minutes' };
  const enabled = Boolean(s.enabled);
  if (s.intervalMinutes != null && s.intervalValue == null) {
    return { enabled, intervalValue: intervalOf(Number(s.intervalMinutes) || INTERVAL_DEFAULT), intervalUnit: 'minutes' };
  }
  return {
    enabled,
    intervalValue: intervalOf(s.intervalValue),
    intervalUnit: UNITS_1_0.includes(s.intervalUnit) ? s.intervalUnit : 'minutes',
  };
}

/**
 * Eine id aus dem Altstand; fehlt sie, die feste Ersatz-id `ep-<position>`,
 * bei Kollision mit `_` ergänzt (nie eine vorhandene umbenannt).
 * @param {unknown} id @param {number} pos ab 1 @param {Set<string>} taken
 * @returns {string}
 */
function idOrFixed(id, pos, taken) {
  if (isNonEmptyText(id)) return id;
  let out = `ep-${pos}`;
  while (taken.has(out)) out += '_';
  taken.add(out);
  return out;
}

/**
 * '0→1.0': jeder Stand ohne `_schema`, wie ihn das alte `State.toJSON`
 * schrieb, gelesen wie das alte `fromJSON`. Abweichungen: Endpunkte, Header
 * und Zuordnungen, die keine Objekte sind, entfallen (die Altform machte
 * leere daraus); ein Spaltenbezug ohne gültige Form wird `null`; der Abstand
 * wird eine ganze Zahl von 1 bis 999. Doppelte ids, doppelte Spalten und ein
 * unbekannter aktiver Endpunkt bleiben stehen — das heilen die Invarianten.
 * @param {unknown} d
 * @returns {{ endpoints: object[], activeId: string|null }}
 */
export function from0(d) {
  const src = isObject(d) ? d : {};
  const raw = Array.isArray(src.endpoints) ? src.endpoints.filter(isObject) : [];
  const taken = new Set(raw.map((e) => e.id).filter(isNonEmptyText));
  const endpoints = raw.map((e, i) => ({
    id: idOrFixed(e.id, i + 1, taken),
    name: textOf(e.name),
    url: textOf(e.url),
    headers: Array.isArray(e.headers)
      ? e.headers.filter(isObject).map((h) => ({ key: textOf(h.key), value: textOf(h.value) }))
      : [],
    mappings: Array.isArray(e.mappings)
      ? e.mappings.filter(isObject).map((m) => ({ jsonPath: textOf(m.jsonPath), columnRef: columnRefOf(m.columnRef) }))
      : [],
    writeMode: WRITE_MODES_1_0.includes(e.writeMode) ? e.writeMode : 'replace',
    schedule: scheduleOf(e.schedule),
  }));
  return { endpoints, activeId: typeof src.activeId === 'string' ? src.activeId : null };
}
