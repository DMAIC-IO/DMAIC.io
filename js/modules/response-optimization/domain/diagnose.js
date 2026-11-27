/**
 * D.Mike — Zielgrößenoptimierung: Gründe, die das Optimieren sperren. Rein.
 *
 * Wie die Altform (`State.diagnose`): R²adj unter 0,5, signifikanter
 * Anpassungsmangel (p unter 0,05), und bei mehreren gewählten Modellen eine
 * andere Faktorstruktur als die des ersten.
 */
import { formatNumber } from '../../../core/number-format.js';

/** Unter diesem R²adj wird nicht optimiert. */
export const MIN_R2_ADJ = 0.5;

/** Signifikanzniveau des Anpassungsmangels. */
export const LOF_ALPHA = 0.05;

/**
 * @typedef {{ type: 'lowR2'|'lackOfFit'|'factorMismatch', name: string, value?: number }} Reason
 * @typedef {{ id: string, name: string, rSqAdj: number|null, lofPValue: number|null, factorNames: string[] }} DiagnoseModel
 */

/**
 * Die sperrenden Gründe für die gewählten Modelle; leer ohne Wahl.
 * @param {string[]} selectedIds in Optimierungsreihenfolge
 * @param {DiagnoseModel[]} models
 * @returns {Reason[]}
 */
export function diagnose(selectedIds, models) {
  /** @type {Reason[]} */
  const reasons = [];
  if (selectedIds.length === 0) return reasons;
  const byId = new Map(models.map((m) => [m.id, m]));
  const chosen = selectedIds.map((id) => byId.get(id)).filter((m) => m !== undefined);
  for (const m of chosen) {
    const r2 = m.rSqAdj ?? 0;
    if (r2 < MIN_R2_ADJ) reasons.push({ type: 'lowR2', name: m.name, value: r2 });
    if (typeof m.lofPValue === 'number' && Number.isFinite(m.lofPValue) && m.lofPValue < LOF_ALPHA) {
      reasons.push({ type: 'lackOfFit', name: m.name, value: m.lofPValue });
    }
  }
  if (chosen.length > 1) {
    const ref = chosen[0].factorNames.join('|');
    const other = chosen.slice(1).find((m) => m.factorNames.join('|') !== ref);
    if (other) reasons.push({ type: 'factorMismatch', name: other.name });
  }
  return reasons;
}

/**
 * Ein Grund als Text; Zahlen mit drei Nachkommastellen ohne Gruppierung.
 * @param {Reason} r
 * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
 * @param {string} lang Sprache der Zahlen
 * @returns {string}
 */
export function reasonText(r, t, lang) {
  if (r.type === 'factorMismatch') return t('factorMismatch', { name: r.name });
  return t(r.type, { name: r.name, value: formatNumber(r.value ?? 0, lang, { profile: 'input', decimals: 3 }) });
}
