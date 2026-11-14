/**
 * D.Mike — DoE Planner: migrations of the stored state (domain/migrations.js)
 *
 * Pure. Each step describes a FIXED format and imports nothing from
 * model.js. Values that cannot be brought into the new form stay as they
 * are; the model then decides (never stricter than the earlier planner).
 */
import { termsFromLegacyOptions } from '../../../engines/doe-terms.js';
import { configSignature, designSignature, legacyDesignSignature } from './signatures.js';
import { snapshotOf } from './experiment.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/** Option defaults of format 1.0. */
const OPTIONS_1_0 = Object.freeze({
  randomize: true,
  centerPoints: false,
  replicates: 1,
  alphaType: 'rotatable',
  ccdCenterPoints: 3,
  bbCenterPoints: 3,
  taguchiArray: '',
  optimalRuns: 0,
  optimalActiveTerms: null,
  forbiddenVertices: [],
});

/** Keys a generated design carries, besides the signature. */
const DESIGN_KEYS_1_0 = ['codedMatrix', 'actualMatrix', 'stdOrder', 'runOrder', 'replicateIds', 'resolution', 'p',
  'designType', 'sourceResponseSeeds', 'sourceRowCount'];

/** Keys of a datasheet binding in format 1.0. */
const BINDING_KEYS_1_0 = ['instanceId', 'sheetId', 'factorColumnIds', 'responseColumnIds', 'meanColumnIds',
  'lnVarColumnIds', 'runOrderColumnId', 'stdOrderColumnId', 'designSignature', 'snapshot'];

/**
 * @template T
 * @param {() => T} fn
 * @param {T} fallback
 * @returns {T} the value of fn, the fallback when it throws on a value the new form cannot read
 */
function attempt(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

/** @param {unknown} v @returns {boolean} */
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {unknown} text as is, a number or a missing value as text, anything else unchanged */
function textOf(v) {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return v;
}

/** @param {unknown} v @returns {unknown} a number as is, a numeric text as number, anything else unchanged */
function numberOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseDecimalInput(v);
    if (Number.isFinite(n)) return n;
  }
  return v;
}

/** @param {unknown} v @returns {number|null} a measured value: numbers and numeric text count, anything else is empty */
function measuredOf(v) {
  const n = numberOf(v);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Factors with levels, kind and unit; a missing id is replaced by the
 * next free whole number, existing ids stay.
 * @param {unknown} source
 * @returns {object[]}
 */
function factorsOf(source) {
  const list = Array.isArray(source) ? source.filter(isObject) : [];
  /** @type {Array<number|null>} */
  const kept = list.map((f) => {
    const id = numberOf(f.id);
    return typeof id === 'number' && Number.isInteger(id) ? id : null;
  });
  let next = Math.max(0, ...kept.filter((id) => id !== null)) + 1;
  return list.map((f, i) => {
    const levels = Array.isArray(f.levels) ? f.levels.map(textOf) : [textOf(f.lo), textOf(f.hi)];
    let id = kept[i];
    if (id === null) { id = next; next += 1; }
    return {
      id,
      name: textOf(f.name),
      unit: textOf(f.unit),
      kind: f.kind === 'categorical' ? 'categorical' : 'continuous',
      levels,
    };
  });
}

/** @param {unknown} source @returns {Array<{ name: unknown, unit: unknown }>} */
function responsesOf(source) {
  const list = Array.isArray(source) ? source.filter(isObject) : [];
  return list.map((r) => ({ name: textOf(r.name), unit: textOf(r.unit) }));
}

/**
 * Options with the defaults for absent keys; the old pair of quadratic
 * flag and excluded interactions becomes the active terms.
 * @param {unknown} source
 * @param {number} k factor count
 * @param {object} [base] options the source is laid over
 * @returns {object}
 */
function optionsOf(source, k, base = OPTIONS_1_0) {
  const o = isObject(source) ? /** @type {any} */ (source) : {};
  const out = { ...JSON.parse(JSON.stringify(base)) };
  for (const key of Object.keys(OPTIONS_1_0)) if (Object.hasOwn(o, key)) out[key] = o[key];
  if (!Array.isArray(o.optimalActiveTerms) && k >= 2
    && (o.optimalQuadratic || Array.isArray(o.optimalExcludedInteractions))) {
    out.optimalActiveTerms = termsFromLegacyOptions(k, Boolean(o.optimalQuadratic), o.optimalExcludedInteractions);
  }
  // A center-point count meant "with center points".
  if (typeof out.centerPoints === 'number') out.centerPoints = out.centerPoints > 0;
  for (const key of ['replicates', 'ccdCenterPoints', 'bbCenterPoints', 'optimalRuns']) out[key] = numberOf(out[key]);
  if (out.optimalRuns === null) out.optimalRuns = 0;
  return out;
}

/**
 * A design in format 1.0: the actual matrix as text, only the keys the
 * generator writes.
 * @param {unknown} source
 * @returns {object|null|unknown} null without a design
 */
function designOf(source) {
  if (!source) return null;
  if (!isObject(source)) return source;
  const d = /** @type {any} */ (source);
  /** @type {any} */
  const out = {};
  for (const key of DESIGN_KEYS_1_0) if (Object.hasOwn(d, key)) out[key] = d[key];
  if (Array.isArray(d.actualMatrix)) {
    out.actualMatrix = d.actualMatrix.map((row) => (Array.isArray(row) ? row.map((v) => (typeof v === 'number' ? String(v) : v)) : row));
  }
  if (Array.isArray(d.sourceResponseSeeds)) {
    out.sourceResponseSeeds = d.sourceResponseSeeds.map((col) => (Array.isArray(col) ? col.map((v) => (v === undefined ? null : v)) : col));
  }
  return out;
}

/** @param {unknown} source @returns {object|null|unknown} */
function previewEditsOf(source) {
  if (!source) return null;
  if (!isObject(source)) return source;
  const e = /** @type {any} */ (source);
  return { factors: e.factors ?? [], responses: e.responses ?? [] };
}

/** @param {unknown} source @returns {object|null|unknown} */
function refOf(source) {
  if (!source) return null;
  if (!isObject(source)) return source;
  const r = /** @type {any} */ (source);
  return { instanceId: r.instanceId, sheetId: r.sheetId };
}

/**
 * The datasheet binding of a plan: the old signature with responses is
 * rewritten when it belongs to the stored design; a binding without a
 * signature takes the design's (the earlier planner adopted it on the next
 * generation); without a snapshot the stored design gives one when the
 * signatures match.
 * @param {unknown} source stored binding
 * @param {any} plan migrated plan (its design without the signature check)
 * @param {unknown} oldResponses responses as stored
 * @returns {object|null|unknown}
 */
function bindingOf(source, plan, oldResponses) {
  if (!source) return null;
  if (!isObject(source)) return source;
  const r = /** @type {any} */ (source);
  /** @type {any} */
  const out = {};
  for (const key of BINDING_KEYS_1_0) if (Object.hasOwn(r, key)) out[key] = r[key];
  out.meanColumnIds ??= [];
  out.lnVarColumnIds ??= [];
  out.runOrderColumnId ??= null;
  out.stdOrderColumnId ??= null;
  const current = plan.design && Array.isArray(plan.design.codedMatrix) ? attempt(() => designSignature(plan), null) : null;
  const legacy = current === null ? null : attempt(() => legacyDesignSignature({
    design: plan.design, responses: Array.isArray(oldResponses) ? responsesOf(oldResponses) : plan.responses,
  }), null);
  if (typeof out.designSignature !== 'string' || out.designSignature === '') out.designSignature = current;
  else if (out.designSignature === legacy) out.designSignature = current;
  if (!Object.hasOwn(out, 'snapshot')) {
    out.snapshot = current !== null && out.designSignature === current ? attempt(() => snapshotOf(plan, plan.design), null) : null;
  }
  return out;
}

/**
 * The plan part of a state or a phase, with its design and binding.
 * @param {any} s stored plan
 * @param {any} top migrated selection the plan is generated with
 * @param {boolean} [fill] without factors two blank ones, without responses a blank one
 * @returns {any}
 */
function planOf(s, top, fill = false) {
  let factors = factorsOf(s.factors);
  let responses = responsesOf(s.responses);
  if (fill && factors.length === 0) {
    factors = [1, 2].map((id) => ({ id, name: '', unit: '', kind: 'continuous', levels: ['', ''] }));
  }
  if (fill && responses.length === 0) responses = [{ name: '', unit: '' }];
  const plan = {
    doeName: textOf(s.doeName),
    designType: s.designType ? s.designType : 'full',
    factors,
    responses,
    options: optionsOf(s.options, Array.isArray(s.factors) ? s.factors.length : 0, top.options),
    seed: 0,
    selectedRes: top.selectedRes,
    selectedPBIdx: top.selectedPBIdx,
    sourceWorksheet: top.sourceWorksheet,
    design: designOf(s.design),
  };
  // A plan the signature cannot read gets none: it then counts as pending.
  if (isObject(plan.design)) plan.design.configSignature = attempt(() => configSignature(plan), '');
  return plan;
}

/**
 * One EVOP phase: its plan as `viewPhase` restores it, the first-response
 * values as a list per response.
 * @param {any} ph stored phase
 * @param {any} top migrated plan of the state
 * @returns {object}
 */
function phaseOf(ph, top) {
  const plan = planOf({ ...ph, options: ph.options ?? {} }, top);
  const yValues = Array.isArray(ph.yValues) ? [ph.yValues.map(measuredOf)] : null;
  return {
    cycleNumber: numberOf(ph.cycleNumber),
    doeName: plan.doeName,
    factors: plan.factors,
    responses: plan.responses,
    designType: plan.designType,
    options: plan.options,
    design: plan.design,
    worksheetRef: bindingOf(ph.worksheetRef, plan, ph.responses),
    decision: ph.decision ?? null,
    completedAt: ph.completedAt ?? null,
    yValues,
  };
}

/**
 * '0→1.0': stored states without `_schema` (`version: 3` and older).
 * Drops the wizard fields, `version`, `previewDirty`, `evaluation`, `fid`,
 * `worksheetRef.experimentId` and the phases' evaluation; `lo`/`hi` become
 * levels, a missing kind is continuous, the old optimal-term options become
 * active terms, a center-point count becomes the switch. `seed` is 0. The
 * stored design keeps its runs and gets the signature of the migrated plan,
 * so it counts as current. Without factors two blank ones, without
 * responses a blank one, as a fresh planner shows them.
 * @param {any} json copy of the stored state
 * @returns {object}
 */
export function from0(json) {
  const s = json;
  const top = {
    options: OPTIONS_1_0,
    selectedRes: isObject(s.selectedRes)
      ? { k: s.selectedRes.k, runs: s.selectedRes.runs, res: s.selectedRes.res, p: s.selectedRes.p }
      : (s.selectedRes || null),
    selectedPBIdx: s.selectedPBIdx ?? null,
    sourceWorksheet: refOf(s.sourceWorksheet),
  };
  const plan = planOf(s, top, true);
  const phaseTop = { ...top, options: plan.options };
  return {
    doeName: plan.doeName,
    designType: plan.designType,
    factors: plan.factors,
    responses: plan.responses,
    options: plan.options,
    seed: 0,
    selectedRes: plan.selectedRes,
    selectedPBIdx: plan.selectedPBIdx,
    design: plan.design,
    previewEdits: previewEditsOf(s.previewEdits),
    worksheetRef: bindingOf(s.worksheetRef, plan, s.responses),
    sourceWorksheet: plan.sourceWorksheet,
    projectMode: s.projectMode === true,
    projectName: textOf(s.projectName),
    projectPhases: Array.isArray(s.projectPhases) ? s.projectPhases.filter(isObject).map((ph) => phaseOf(ph, phaseTop)) : [],
    analysisResponseIdx: Number.isInteger(s.analysisResponseIdx) ? s.analysisResponseIdx : 0,
    activePhaseIdx: Number.isInteger(s.activePhaseIdx) ? s.activePhaseIdx : -1,
  };
}
