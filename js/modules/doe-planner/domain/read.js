/**
 * D.Mike — DoE Planner: derivations from model and worksheet (domain/read.js)
 *
 * Pure. Inputs are the planner model and the module's worksheet data
 * access (`ctx.data`); the model's `derived` entries call these. The
 * worksheet is only read through `data.sheet` and `data.values`.
 */
import { checkConfig, designOf, plannedRuns } from './designs/index.js';
import { evaluateDesign, computeDispersionAnalysis, computeEVOPEffects } from './analysis.js';
import { designSignature } from './signatures.js';
import { actualRows, activeTerms, modelTerms, isOptimal, letter } from './design.js';
import { runRows } from './runtable.js';
import { numberOf } from './source.js';

/**
 * The part of `ctx.data` the planner reads.
 * @typedef {object} PlannerData
 * @property {(ref: { instanceId: string, sheetId: string }|null) => ({ id: string, name: string, rowCount: number,
 *   columns: Array<{ id: string, name: string, type: string }> }|null)} sheet
 * @property {(ref: { instanceId: string, sheetId: string, columnId: string }|null) => (any[]|null)} values
 */

/**
 * Fill state of the bound datasheet's response columns.
 * @typedef {object} Progress
 * @property {number} filled response cells holding a number
 * @property {number} total response cells (rows × response columns)
 * @property {number} pct filled cells in percent, rounded
 * @property {boolean} complete every response cell holds a number and no column is missing
 * @property {number[]} missing responses whose column is gone from the sheet
 */

/**
 * @param {PlannerData|null|undefined} data
 * @param {{ instanceId: string, sheetId: string }|null} ref
 * @returns {ReturnType<PlannerData['sheet']>}
 */
function sheetOf(data, ref) {
  if (!data || !ref || typeof ref.instanceId !== 'string') return null;
  return data.sheet({ instanceId: ref.instanceId, sheetId: ref.sheetId });
}

/**
 * Validity of the configuration, with the row count of the source sheet.
 * @param {any} m planner model
 * @param {PlannerData|null|undefined} data
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function configCheck(m, data) {
  const source = sheetOf(data, m.sourceWorksheet);
  // An optimal design on a source sheet that is gone has nothing to build on.
  if (data && isOptimal(m) && m.sourceWorksheet && !source) return { ok: false, reason: 'source-not-found' };
  return configCheckWith(m, source ? source.rowCount : 0);
}

/**
 * Validity of the configuration for a known row count of the source sheet.
 * @param {any} m planner model
 * @param {number} sourceRowCount rows of the source sheet, 0 without
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function configCheckWith(m, sourceRowCount) {
  const check = checkConfig(m, { sourceRowCount });
  // A fractional cell chosen for another factor count is no resolution for these factors.
  if (check.ok && m.designType === 'frac' && m.selectedRes && m.selectedRes.k !== m.factors.length) {
    return { ok: false, reason: 'noResolution' };
  }
  return check;
}

/**
 * The type the planner recommends for the factors.
 * @param {any} m planner model
 * @returns {string} a design type
 */
export function recommendation(m) {
  const k = m.factors.length;
  const has3 = m.factors.some((f) => f.levels.length >= 3);
  if (k <= 4 && !has3) return 'full';
  if (k <= 6 && !has3) return 'frac';
  if (k >= 7 && !has3) return 'pb';
  if (k >= 3 && k <= 7 && has3) return 'bb';
  if (has3) return 'taguchi';
  return '';
}

/**
 * Planned and generated runs, resolution.
 * @param {any} m planner model
 * @param {boolean} pending the design does not belong to the configuration
 * @returns {{ runs: number|null, resolution: string, generatedRuns: number }}
 */
export function summaryOf(m, pending) {
  const type = designOf(m);
  return {
    runs: plannedRuns(m),
    resolution: type ? type.resolution(m) : '',
    generatedRuns: !pending && m.design ? m.design.actualMatrix.length : 0,
  };
}

/**
 * Evaluation of the design in its read form: efficiency, VIF, aliasing, power.
 * @param {any} m planner model
 * @param {boolean} pending
 * @returns {{ efficiency: object|null, vif: object[], alias: { generators: string[],
 *   aliases: Array<{ term: string, aliasedWith: string[] }> }|null, power: object[] }|null} null without a current design
 */
export function evaluationOf(m, pending) {
  if (pending || !m.design) return null;
  const d = m.design;
  const ev = evaluateDesign(d.codedMatrix, m.factors.length, d.p, d.designType, 0.05, { terms: modelTerms(m, d) });
  const al = ev.aliasStructure;
  return {
    efficiency: ev.efficiency ?? null,
    vif: ev.vif ?? [],
    alias: al ? {
      generators: [...(al.generatorStrings || [])],
      aliases: (al.aliases || []).map((a) => ({ term: a.term, aliasedWith: [...a.aliasedWith] })),
    } : null,
    power: ev.power ?? [],
  };
}

/**
 * State of the bound datasheet.
 * @param {any} m planner model
 * @param {PlannerData|null|undefined} data
 * @param {boolean} pending
 * @returns {'none'|'bound'|'stale'} none without a binding or when the sheet is gone; stale when plan or
 *   factors changed since the sheet was written, also while a new design is pending
 */
export function stalenessOf(m, data, pending) {
  const ref = m.worksheetRef;
  if (!ref || !sheetOf(data, ref)) return 'none';
  if (pending) return 'stale';
  const current = designSignature(m);
  return current !== null && ref.designSignature === current ? 'bound' : 'stale';
}

/**
 * Values of the bound sheet's response columns, one entry per row.
 * @param {any} m planner model
 * @param {PlannerData|null|undefined} data
 * @returns {Array<Array<number|null>|null>|null} null without a sheet; a missing column is null
 */
export function responseValues(m, data) {
  const ref = m.worksheetRef;
  const sheet = sheetOf(data, ref);
  if (!sheet) return null;
  return ref.responseColumnIds.map((columnId) => {
    const vals = data.values({ instanceId: ref.instanceId, sheetId: ref.sheetId, columnId });
    return vals === null ? null : vals.map(numberOf);
  });
}

/**
 * @param {any} m planner model
 * @param {PlannerData|null|undefined} data
 * @returns {Progress|null} null without a bound sheet
 */
export function progressOf(m, data) {
  const values = responseValues(m, data);
  if (values === null) return null;
  const rows = /** @type {NonNullable<ReturnType<PlannerData['sheet']>>} */ (sheetOf(data, m.worksheetRef)).rowCount;
  const missing = [];
  let filled = 0;
  values.forEach((col, i) => {
    if (col === null) { missing.push(i); return; }
    for (let r = 0; r < rows; r++) if (col[r] !== null && col[r] !== undefined) filled += 1;
  });
  const total = rows * values.length;
  return {
    filled,
    total,
    pct: total > 0 ? Math.round((filled / total) * 100) : 0,
    complete: missing.length === 0 && total > 0 && filled === total,
    missing,
  };
}

/**
 * Dispersion analysis of the replicated runs of the chosen response.
 * @param {any} m planner model
 * @param {PlannerData|null|undefined} data
 * @param {'none'|'bound'|'stale'} staleness
 * @param {Progress|null} progress
 * @returns {object|null} the analysis with `responseName`, `{ noReplicates: true }`, or null
 */
export function dispersionOf(m, data, staleness, progress) {
  if (staleness !== 'bound' || !progress || !progress.complete || !m.design) return null;
  const type = designOf(m);
  if (type && !type.dispersion) return null;
  const values = /** @type {Array<Array<number|null>>} */ (responseValues(m, data));
  if (!values.length) return null;
  const idx = Math.min(m.analysisResponseIdx, values.length - 1);
  const y = values[idx].map((v) => (v === null ? NaN : v));
  const factorNames = m.factors.map((f, i) => f.name || letter(i));
  /** @type {any} */
  const result = computeDispersionAnalysis(m.design, y, factorNames, 0.05, {
    terms: isOptimal(m) ? activeTerms(m) : undefined,
  });
  if (!result.ok) {
    if (result.reason === 'no-replicates' || result.reason === 'insufficient-data') {
      if ((m.options.replicates || 1) < 2) return null;
      return { noReplicates: true };
    }
    return null;
  }
  const r = m.responses[idx];
  return { ...result, responseName: r && r.name ? r.name : `Y${idx + 1}` };
}

/**
 * The closed phases with a design and values of the first response, as cycles of the EVOP effects.
 * @param {any} m planner model
 * @returns {Array<{ cycleNumber: number, codedMatrix: number[][], y: Array<number|null>, factorNames: string[] }>}
 */
export function evopCycles(m) {
  return m.projectPhases
    .filter((ph) => ph.yValues && ph.yValues.length && ph.design)
    .map((ph) => ({
      cycleNumber: ph.cycleNumber,
      codedMatrix: ph.design.codedMatrix,
      y: ph.yValues[0] || [],
      factorNames: (ph.factors || []).map((f, i) => f.name || letter(i)),
    }))
    .filter((c) => c.y.length > 0);
}

/**
 * The EVOP project.
 * @param {any} m planner model
 * @returns {object|null} null outside project mode
 */
export function evopOf(m) {
  if (!m.projectMode) return null;
  const cycles = evopCycles(m);
  let summary = null;
  if (cycles.length) {
    const evop = computeEVOPEffects(cycles);
    summary = evop.effects.length === 0 ? null : evop;
  }
  return {
    projectMode: true,
    projectName: m.projectName,
    activePhaseIdx: Math.max(-1, Math.min(m.activePhaseIdx, m.projectPhases.length - 1)),
    phases: m.projectPhases.map((ph) => ({
      cycleNumber: ph.cycleNumber,
      doeName: ph.doeName,
      decision: ph.decision ?? null,
      completedAt: ph.completedAt ?? null,
      yValues: ph.yValues ? ph.yValues.map((col) => [...col]) : null,
    })),
    summary,
  };
}

/**
 * The run table in run order, keyed by column name.
 * @param {any} m planner model
 * @param {PlannerData|null|undefined} data
 * @param {boolean} pending
 * @param {'none'|'bound'|'stale'} staleness
 * @returns {object[]} [] without a current design
 */
export function runsOf(m, data, pending, staleness) {
  const design = m.design;
  if (pending || !design || !design.actualMatrix.length) return [];
  const view = {
    factors: m.factors,
    responses: m.responses,
    previewEdits: m.previewEdits,
    design: { ...design, actualMatrix: actualRows(design, m.factors) },
  };
  const values = staleness === 'bound' ? responseValues(m, data) : null;
  return runRows(view, values ? values.map((col) => col ?? []) : null);
}
