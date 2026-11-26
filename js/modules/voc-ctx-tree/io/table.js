/**
 * D.Mike — VoC → CTx-Baum Export: der Baum als Zeilen (für `exports.table()`);
 * der Exporter macht daraus CSV und XLSX.
 */
import { exportRows } from '../domain/tree.js';

/**
 * Kopf und je Anforderung (bzw. je Ebene ohne Kinder) eine Zeile, über alle
 * Kundenstimmen. Ohne Kundenstimmen `null`: dann entsteht keine Datei.
 * @param {{ vocs: ReadonlyArray<import('../domain/tree.js').Voc> }} m
 * @param {(key: string) => string} t Übersetzer des Moduls
 * @returns {string[][]|null}
 */
export function toRows(m, t) {
  const rows = exportRows(m.vocs);
  if (rows.length === 0) return null;
  return [
    [t('legendVoc'), t('vocSource'), t('legendNeed'), t('driverType'), t('exportCtx'), t('legendReq'), t('target'), t('measurement')],
    ...rows,
  ];
}
