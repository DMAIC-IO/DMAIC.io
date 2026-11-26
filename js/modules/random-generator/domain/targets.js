/**
 * D.Mike — Zufallsgenerator: Ziele für das Senden ans Arbeitsblatt.
 *
 * Ein Ziel ist ein Schlüssel `instanceId|sheetId|columnId`: eine leere Spalte
 * eines Blatts oder `instanceId|sheetId|__new__` für eine neue Spalte an
 * diesem Blatt. Angeboten werden nur Blätter mit mindestens einer leeren
 * Spalte, in der Reihenfolge, in der der Leser sie findet. `null` heißt
 * „neues Arbeitsblatt“.
 */
import { listColumns, columnOption } from '../../../core/source-columns.js';
import { requireForm } from '../../../core/validate.js';

/** Spalten-id eines Ziels „neue Spalte an diesem Blatt“. */
export const NEW_COLUMN_ID = '__new__';

/** Nur leere Spalten nehmen Werte auf. */
const TARGET_FILTER = Object.freeze({ maxCount: 0 });

/**
 * @typedef {object} TargetGroup
 * @property {string} sheetName  Name des Blatts
 * @property {{ key: string, name: string, shortName: string, valueCount: number }[]} columns  die leeren Spalten
 * @property {string} newColumnKey  Schlüssel des Ziels „neue Spalte“
 */

/**
 * Die leeren Spalten je Blatt.
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {TargetGroup[]}
 */
export function targetGroups(src) {
  /** @type {Map<string, TargetGroup>} */
  const groups = new Map();
  for (const c of listColumns(src, TARGET_FILTER)) {
    const gk = `${c.instanceId}|${c.sheetId}`;
    if (!groups.has(gk)) groups.set(gk, { sheetName: c.sheetName, columns: [], newColumnKey: `${gk}|${NEW_COLUMN_ID}` });
    groups.get(gk)?.columns.push({ ...columnOption(c), shortName: c.shortName, valueCount: c.valueCount });
  }
  return [...groups.values()];
}

/**
 * Die Ziele als `{ key, name }`: je Blatt seine leeren Spalten, danach der
 * Eintrag „neue Spalte“ mit dem Blattnamen.
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {{ key: string, name: string }[]}
 */
export function targetList(src) {
  return targetGroups(src).flatMap((g) => [
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
