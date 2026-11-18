/**
 * D.Mike — MSA Typ 2: Datenaufbau und Rechnung als reine Funktionen.
 */
import { toNum } from '../../../core/chart/chart-data-prep.js';
import { validate, analyze } from '../../../engines/msa-typ2-engine.js';
import { readColumn } from '../../../core/source-columns.js';

/**
 * Die drei Spaltenwerte zeilenweise zu Rechendaten zusammenführen. Zeilen mit
 * `null` oder nicht numerischem Messwert fallen; ohne Prüferspalte (`operators`
 * ist `null`) entsteht ein Typ-3-Datensatz.
 * @param {{ parts: any[]|null, operators: any[]|null, measurements: any[]|null }} cols
 * @returns {{ parts: string[], operators: string[]|null, measurements: number[] }|null}
 */
export function buildDataArrays({ parts: rawParts, operators: rawOps, measurements: rawMeas }) {
  if (!rawParts || !rawMeas) return null;
  const hasOperator = rawOps != null;
  const parts = [], operators = [], measurements = [];
  const len = hasOperator
    ? Math.min(rawParts.length, rawOps.length, rawMeas.length)
    : Math.min(rawParts.length, rawMeas.length);
  for (let i = 0; i < len; i++) {
    if (rawParts[i] == null || rawMeas[i] == null) continue;
    if (hasOperator && rawOps[i] == null) continue;
    const m = typeof rawMeas[i] === 'number' ? rawMeas[i] : toNum(String(rawMeas[i]).replace(',', '.'));
    if (isNaN(m)) continue;
    parts.push(String(rawParts[i]));
    if (hasOperator) operators.push(String(rawOps[i]));
    measurements.push(m);
  }
  if (parts.length === 0) return null;
  return { parts, operators: hasOperator ? operators : null, measurements };
}

/**
 * Daten prüfen und rechnen.
 * @param {{ parts: string[], operators: string[]|null, measurements: number[] }|null} data
 * @param {{ alpha: number, studyVarMultiplier: number, lsl: number|null, usl: number|null, verdictBasis?: string|null, historicalSigma?: number|null }} opts
 * @param {{ validate: Function, analyze: Function }} [engine] austauschbar für Tests
 * @returns {null | { invalid: { key: string, vars: object|null } } | { error: string } | object}
 */
export function computeAnalysis(data, opts, engine = { validate, analyze }) {
  if (!data) return null;
  const engineOpts = {
    alpha: opts.alpha,
    studyVarMultiplier: opts.studyVarMultiplier,
    lsl: opts.lsl == null ? NaN : opts.lsl,
    usl: opts.usl == null ? NaN : opts.usl,
  };
  if (opts.verdictBasis === 'tolerance' || opts.verdictBasis === 'studyVar') engineOpts.verdictBasis = opts.verdictBasis;
  if (opts.historicalSigma != null) engineOpts.historicalSigma = opts.historicalSigma;
  try {
    const v = engine.validate(data, engineOpts);
    if (!v.valid) return { invalid: { key: v.errorKey, vars: v.errorVars || null } };
    return engine.analyze(data, engineOpts);
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Die Analyse aus Model und Arbeitsblatt. Die Spalten kommen über
 * `readColumn` (Zeilenzuordnung); ohne Prüferspalte rechnet die Engine Typ 3.
 * @param {import('../domain/model.types.js').StateModel} m
 * @param {import('../../../core/source-reader.js').Source} src Leser der Agentenfläche
 * @param {{ validate: Function, analyze: Function }} [engine] austauschbar für Tests
 * @returns {any} null, `{ invalid }`, `{ error }` oder das Ergebnis der Engine
 */
export function readAnalysis(m, src, engine) {
  /** @param {object} ref @returns {any[]|null} */
  const values = (ref) => readColumn(src, ref)?.values ?? null;
  if (!m.part || !m.measurement) return null;
  const cols = {
    parts: values(m.part),
    // Eine gewählte, aber verschwundene Prüferspalte bleibt Typ 2 (ohne Zeilen).
    operators: m.operator ? (values(m.operator) ?? []) : null,
    measurements: values(m.measurement),
  };
  const opts = {
    alpha: m.alpha, studyVarMultiplier: m.k, lsl: m.lsl, usl: m.usl,
    verdictBasis: m.verdictBasis, historicalSigma: m.sigmaHist,
  };
  return computeAnalysis(buildDataArrays(cols), opts, engine);
}
