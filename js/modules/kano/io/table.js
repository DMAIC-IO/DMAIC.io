/**
 * D.Mike — Kano Export: die Ergebnistabelle als Zeilen (für `exports.table()`);
 * der Exporter macht daraus CSV und XLSX.
 */
import { roundTo } from '../../../core/number-format.js';
import { evaluation } from '../domain/evaluate.js';

/** @param {number|null} v @param {number} n @returns {number|null} */
const round = (v, n) => (v === null ? null : roundTo(v, n));

/**
 * Kopf und je Merkmal eine Zeile in der Reihenfolge der Auswertung: Zählung je
 * Kategorie, Kategorie als Text (`—` ohne Kategorie), CS und DS auf zwei,
 * die mittlere Wichtigkeit (nur mit eingeschalteter Wichtigkeit) auf eine
 * Stelle gerundet; fehlende Werte bleiben leere Zellen. Ohne Merkmale `null`:
 * dann entsteht keine Datei.
 * @param {import('../domain/evaluate.js').EvalInput} m
 * @param {(key: string) => string} t Übersetzer des Moduls
 * @returns {Array<Array<string|number|null>>|null}
 */
export function toRows(m, t) {
  const { rows } = evaluation(m);
  if (rows.length === 0) return null;
  const importance = m.options.importance;
  const head = [t('colItem'), 'M', 'O', 'A', 'I', 'R', 'Q', t('colCategory'), t('colCs'), t('colDs')];
  if (importance) head.push(t('colImportanceMean'));
  return [head, ...rows.map((r) => {
    const row = [r.label, r.counts.M, r.counts.O, r.counts.A, r.counts.I, r.counts.R, r.counts.Q,
      r.category ? t(`cat${r.category}`) : '—', round(r.cs, 2), round(r.ds, 2)];
    if (importance) row.push(round(r.importanceMean, 1));
    return row;
  })];
}
