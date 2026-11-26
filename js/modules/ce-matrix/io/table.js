/**
 * D.Mike — C&E-Matrix Export: die Matrix als Zeilen (für `exports.table()`);
 * der Exporter macht daraus CSV und XLSX.
 */
import { scoreOf, rowSum, colSum } from '../domain/matrix.js';

/**
 * Gewichtszeile `[Wichtigkeit, …Gewichte, '']`, Kopf `['', …Ergebnisgrößen,
 * Σ Zeile]`, je Eingangsgröße `[Name, …Bewertungen, Zeilensumme]` und die
 * Fußzeile `[Σ Spalte, …Spaltensummen]` ohne Gesamtsumme — wie der Altexport.
 * @param {import('../domain/matrix.js').MatrixLike} m
 * @param {(key: string) => string} t Übersetzer des Moduls
 * @returns {(string|number)[][]}
 */
export function toRows(m, t) {
  return [
    [t('weight'), ...m.outputs.map((o) => o.weight), ''],
    ['', ...m.outputs.map((o) => o.name), t('rowSum')],
    ...m.inputs.map((i) => [i.name, ...m.outputs.map((o) => scoreOf(m, i.id, o.id)), rowSum(m, i.id)]),
    [t('colSum'), ...m.outputs.map((o) => colSum(m, o.id))],
  ];
}
