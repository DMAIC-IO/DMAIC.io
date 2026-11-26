/**
 * D.Mike — Aufgabenliste: Beispielform. Rein.
 *
 * Beispiele tragen Zieldaten als Versatz zu heute (`+5d`, `-3d`), damit sie
 * nicht veralten; hier werden sie zu `JJJJ-MM-TT`. Der Hinweisschlüssel
 * `_dateNote` und andere fremde Schlüssel fallen weg; den Rest übernimmt
 * die Migration der Stände ohne `_schema`.
 */
import { resolveDateOffset } from '../../../core/date-offset.js';

/**
 * Beispielform in die gespeicherte Altform übersetzen.
 * @param {Record<string, any>} data
 * @returns {Record<string, any>}
 */
export function fromExample(data) {
  const rest = { ...(data ?? {}) };
  delete rest._dateNote;
  if (!Array.isArray(rest.items)) return rest;
  return {
    ...rest,
    items: rest.items.map((item) => (item && typeof item === 'object' ? { ...item, due: resolveDateOffset(item.due) } : item)),
  };
}
