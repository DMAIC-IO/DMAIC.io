/**
 * D.Mike — Ziele für das Senden einer Spalte ans Arbeitsblatt.
 *
 * Ein Ziel ist ein Schlüssel `instanceId|sheetId|columnId`: eine Spalte eines
 * Blatts, die der Filter zulässt, oder `instanceId|sheetId|__new__` für eine
 * neue Spalte an diesem Blatt. Angeboten werden nur Blätter mit mindestens
 * einer zulässigen Spalte, in der Reihenfolge, in der der Leser sie findet.
 * `null` heißt „neues Arbeitsblatt“. Der Filter ist der von `listColumns`
 * (`{ maxCount: 0 }` nur leere Spalten, `{}` alle Spalten).
 */
import { listColumns, columnOption } from './source-columns.js';
import { requireForm } from './validate.js';

/** Spalten-id eines Ziels „neue Spalte an diesem Blatt“. */
export const NEW_COLUMN_ID = '__new__';

/**
 * @typedef {object} TargetGroup
 * @property {string} sheetName  Name des Blatts
 * @property {{ key: string, name: string, shortName: string, valueCount: number }[]} columns  die zulässigen Spalten
 * @property {string} newColumnKey  Schlüssel des Ziels „neue Spalte“
 */

/**
 * Die zulässigen Spalten je Blatt.
 * @param {import('./source-reader.js').Source} src
 * @param {Parameters<typeof listColumns>[1]} filter Filter wie bei `listColumns`
 * @returns {TargetGroup[]}
 */
export function targetGroups(src, filter) {
  /** @type {Map<string, TargetGroup>} */
  const groups = new Map();
  for (const c of listColumns(src, filter)) {
    const gk = `${c.instanceId}|${c.sheetId}`;
    if (!groups.has(gk)) groups.set(gk, { sheetName: c.sheetName, columns: [], newColumnKey: `${gk}|${NEW_COLUMN_ID}` });
    groups.get(gk)?.columns.push({ ...columnOption(c), shortName: c.shortName, valueCount: c.valueCount });
  }
  return [...groups.values()];
}

/**
 * Die Ziele als `{ key, name }`: je Blatt seine zulässigen Spalten, danach
 * der Eintrag „neue Spalte“ mit dem Blattnamen.
 * @param {import('./source-reader.js').Source} src
 * @param {Parameters<typeof listColumns>[1]} filter Filter wie bei `listColumns`
 * @returns {{ key: string, name: string }[]}
 */
export function targetList(src, filter) {
  return targetGroups(src, filter).flatMap((g) => [
    ...g.columns.map(({ key, name }) => ({ key, name })),
    { key: g.newColumnKey, name: g.sheetName || g.newColumnKey },
  ]);
}

/**
 * Ein Zielschlüssel als Bezug.
 * @param {string} key @returns {{ instanceId: string, sheetId: string, columnId: string }}
 */
export function parseTarget(key) {
  const [instanceId, sheetId, columnId] = key.split('|');
  return { instanceId, sheetId, columnId };
}

/**
 * Lehnt einen unbekannten Zielschlüssel ab (`param` `target`).
 * @param {string} key @param {ReadonlyArray<{ key: string }>} targets
 * @returns {void}
 */
export function requireTarget(key, targets) {
  requireForm('target', key, targets.some((t) => t.key === key),
    `null or one of ${targets.map((t) => t.key).join(', ') || '(none)'}`);
}
