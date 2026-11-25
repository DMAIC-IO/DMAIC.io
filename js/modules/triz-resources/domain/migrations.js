/**
 * D.Mike — TRIZ-Ressourcen: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder resources.js (das Schema darf sich ändern,
 * die Migration nicht).
 */

/** Kategorien im Formatstand 1.0, in gespeicherter Reihenfolge. */
const CATEGORIES_1_0 = ['substance', 'field', 'space', 'time', 'info', 'function'];
/** Ebenen im Formatstand 1.0, in gespeicherter Reihenfolge. */
const LEVELS_1_0 = ['sub', 'sys', 'super'];
/** Füllstände im Formatstand 1.0. */
const STATUSES_1_0 = ['unknown', 'unused', 'partial', 'full'];

/**
 * '0→1.0': Altstände ohne `_schema` (Beispieldatei, von Hand). `system` als
 * Text oder leer; je bekannter Zelle, wenn ein Wert da ist, die Notiz als
 * Text oder leer und der Füllstand aus der Liste oder `unknown`, sonst die
 * Vorgabe. Fremde Kategorien, Ebenen und Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {{ system: string, cells: Record<string, Record<string, { notes: string, status: string }>> }}
 */
export function from0(old) {
  const o = /** @type {Record<string, any>} */ (old && typeof old === 'object' ? old : {});
  const inCells = o.cells && typeof o.cells === 'object' ? o.cells : null;
  /** @type {Record<string, Record<string, { notes: string, status: string }>>} */
  const cells = {};
  for (const cat of CATEGORIES_1_0) {
    cells[cat] = {};
    for (const lvl of LEVELS_1_0) {
      const src = inCells ? inCells[cat]?.[lvl] : undefined;
      cells[cat][lvl] = src
        ? {
          notes: typeof src.notes === 'string' ? src.notes : '',
          status: STATUSES_1_0.includes(src.status) ? src.status : 'unknown',
        }
        : { notes: '', status: 'unknown' };
    }
  }
  return { system: typeof o.system === 'string' ? o.system : '', cells };
}
