/**
 * D.Mike — DoE Planner: Model (domain/model.js)
 *
 * The plan (factors, responses, design type, options, seed), the type's
 * own selection, the generated design with the signature of the
 * configuration it was made for, the preview edits, the bound datasheet
 * with its snapshot, the source worksheet of an optimal design and the
 * EVOP project. No DOM, no i18n.
 *
 * Stored: `{ _schema, doeName, designType, factors, responses, options,
 * seed, selectedRes, selectedPBIdx, design, previewEdits, worksheetRef,
 * sourceWorksheet, projectMode, projectName, projectPhases,
 * analysisResponseIdx, activePhaseIdx }`. The actual matrix of a design is
 * stored as text; readers take its rows from `actualRows` (design.js).
 */
import { defineModel, command, index, list, object, text, number, boolean, oneOf } from '../../../core/model.js';
import { requireKnownId, requireIndex, requireForm } from '../../../core/validate.js';
import { enumerateTerms, activateTerm, deactivateTerm, termSortKey } from '../../../engines/doe-terms.js';
import { from0 } from './migrations.js';
import { activeTerms, isOptimal, modelTerms } from './design.js';
import { configSignature, designSignature } from './signatures.js';
import { experimentOf, snapshotOf } from './experiment.js';
import { codedToActualRows } from './runtable.js';
import { designFor } from './generate.js';
import { evaluateDesign, computeEVOPEffects, recenteredFactors } from './analysis.js';
import { DESIGNS } from './designs/index.js';
import fracType from './designs/frac.js';
import taguchiType from './designs/taguchi.js';
import optimalType from './designs/optimal.js';
import { PB_DESIGNS } from './tables.js';

import {
  configCheck, configCheckWith, recommendation, summaryOf, evaluationOf, stalenessOf, progressOf, dispersionOf,
  evopOf, evopCycles, runsOf,
} from './read.js';

/** The design-type modules with their own helpers (the registry type knows only the common ones). */
const frac = /** @type {any} */ (fracType);
const taguchi = /** @type {any} */ (taguchiType);
const optimal = /** @type {any} */ (optimalType);

/** Fewest levels of a factor. */
export const MIN_LEVELS = 2;
/** Fewest responses of a plan. */
export const MIN_RESPONSES = 1;
/** Most replicates of a design. */
export const MAX_REPLICATES = 10;

/**
 * @param {{ factors: ReadonlyArray<{ levels: ReadonlyArray<string> }> }} m
 * @returns {boolean} a factor has more than two levels
 */
const hasMultiLevel = (m) => m.factors.some((f) => f.levels.length > 2);

/**
 * The selection fits the factors: a fractional cell for their count, no
 * two-level-only type with a multi-level factor.
 * @param {any} m
 * @returns {boolean}
 */
function selectionFits(m) {
  if (m.selectedRes && m.selectedRes.k !== m.factors.length) return false;
  return !(hasMultiLevel(m) && (m.designType === 'frac' || m.designType === 'pb'));
}

/** @param {any} v @returns {any} a plain deep copy */
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Fixed columns of the preview, in their order; they take no edits. */
const LOCKED_COLUMNS = Object.freeze(['run', 'std', 'block', 'rep']);

/**
 * Clears a selection that no longer fits the factors: a fractional cell
 * of another factor count; frac and pb fall back to full with a
 * multi-level factor.
 * @param {any} m
 * @returns {void}
 */
function fitSelection(m) {
  if (m.selectedRes && m.selectedRes.k !== m.factors.length) m.selectedRes = null;
  if (hasMultiLevel(m) && (m.designType === 'frac' || m.designType === 'pb')) {
    m.designType = 'full';
    m.selectedRes = null;
    m.selectedPBIdx = null;
  }
}

/** @param {any} m @returns {void} the analysed response stays one of the responses */
function clampAnalysis(m) {
  if (m.analysisResponseIdx > m.responses.length - 1) m.analysisResponseIdx = Math.max(0, m.responses.length - 1);
}

/**
 * The source sheet the current design was built on, as `instanceId::sheetId`; null without.
 * @param {any} m
 * @returns {string|null}
 */
function designSource(m) {
  if (!m.design) return null;
  try { return JSON.parse(m.design.configSignature).source ?? null; } catch { return null; }
}

/**
 * Fewest new runs of an optimal design. The rows of the source sheet count:
 * the given ones, else those of the current design when it was built on the
 * same source sheet, else none.
 * @param {any} m
 * @param {number} [sourceRowCount] rows of the source sheet
 * @returns {number}
 */
function minOptimalRunsOf(m, sourceRowCount) {
  const src = m.sourceWorksheet;
  let rows = 0;
  if (src && sourceRowCount !== undefined) rows = sourceRowCount;
  else if (src && designSource(m) === `${src.instanceId}::${src.sheetId}`
    && typeof m.design.sourceRowCount === 'number') rows = m.design.sourceRowCount;
  return optimal.minOptimalRuns(m, { sourceRowCount: rows });
}

/**
 * Raises the requested optimal runs to the minimum; never lowers them.
 * @param {any} m @param {number} [sourceRowCount] rows of the source sheet
 * @returns {void}
 */
function raiseOptimalRuns(m, sourceRowCount) {
  const min = minOptimalRunsOf(m, sourceRowCount);
  if ((m.options.optimalRuns || 0) < min) m.options.optimalRuns = min;
}

/**
 * Stores the active terms sorted and raises the runs to the new minimum.
 * @param {any} m @param {Set<string>} active @param {number} [sourceRowCount] rows of the source sheet
 * @returns {void}
 */
function applyActiveTerms(m, active, sourceRowCount) {
  m.options.optimalActiveTerms = [...active].sort((a, b) => termSortKey(a).localeCompare(termSortKey(b)));
  raiseOptimalRuns(m, sourceRowCount);
}

/**
 * @param {{ levels: string[] }} f
 * @returns {number[]} the coded value of each level
 */
const codedLevels = (f) => f.levels.map((_, li) => (f.levels.length === 1 ? 0 : -1 + (2 * li) / (f.levels.length - 1)));

/**
 * Adds a forbidden combination unless it is already forbidden.
 * @param {any} m @param {Array<number|null>} pattern
 * @returns {boolean} false when it was already forbidden
 */
function forbid(m, pattern) {
  const list = m.options.forbiddenVertices;
  const same = (p) => p.length === pattern.length && p.every((v, i) => v === pattern[i]);
  if (list.some(same)) return false;
  m.options.forbiddenVertices = [...plain(list), [...pattern]];
  return true;
}

/**
 * Where a preview column takes its edits: a continuous factor or a response; null for locked
 * columns and categorical factors; undefined for an unknown key.
 * @param {any} m @param {string} key
 * @returns {{ kind: 'factors'|'responses', index: number }|null|undefined}
 */
function editTarget(m, key) {
  if (LOCKED_COLUMNS.includes(key)) return null;
  const f = /^f:(-?\d+)$/.exec(key);
  if (f) {
    const fi = m.factors.findIndex((x) => x.id === Number(f[1]));
    if (fi < 0) return undefined;
    return m.factors[fi].kind === 'categorical' ? null : { kind: 'factors', index: fi };
  }
  const r = /^r:(\d+)$/.exec(key);
  if (r && Number(r[1]) < m.responses.length) return { kind: 'responses', index: Number(r[1]) };
  return undefined;
}

/** @param {any} m @returns {string[]} the preview's column keys in order */
const previewColumns = (m) => [...LOCKED_COLUMNS, ...m.factors.map((f) => `f:${f.id}`), ...m.responses.map((_, i) => `r:${i}`)];

/**
 * Writes cells into the preview edits; all-null edits are none.
 * @param {any} m a model with a design
 * @param {Array<{ row: number, target: { kind: 'factors'|'responses', index: number }, value: number|null }>} cells
 * @returns {void}
 */
function writeEdits(m, cells) {
  const n = m.design.actualMatrix.length;
  const base = m.previewEdits || { factors: [], responses: [] };
  const copy = (lists, count) => Array.from({ length: count }, (_, i) => {
    const col = Array.isArray(lists[i]) ? [...lists[i]] : [];
    while (col.length < n) col.push(null);
    return col.slice(0, n);
  });
  const edits = { factors: copy(base.factors, m.factors.length), responses: copy(base.responses, m.responses.length) };
  for (const { row, target, value } of cells) edits[target.kind][target.index][row] = value;
  const any = [...edits.factors, ...edits.responses].some((col) => col.some((v) => v !== null));
  m.previewEdits = any ? edits : null;
}

/**
 * @param {any} m @param {number} row the row asked for
 * @returns {number} rows of the design, rejection when there is none
 */
function designRows(m, row) {
  requireForm('row', row, Boolean(m.design), 'a row of a generated design; there is none yet');
  return m.design.actualMatrix.length;
}

/**
 * A new, open phase from the current plan.
 * @param {any} m @param {number} cycleNumber @param {string} doeName
 * @returns {object}
 */
function openPhase(m, cycleNumber, doeName) {
  return {
    ...m.phaseState(),
    cycleNumber,
    doeName,
    design: null,
    worksheetRef: null,
    decision: null,
    completedAt: null,
    yValues: null,
  };
}

/**
 * Opens the next phase: re-centered on the best run of all closed cycles, or with the same levels.
 * @param {any} m @param {boolean} recenter
 * @returns {void}
 */
function startPhase(m, recenter) {
  const prev = m.projectPhases[m.activePhaseIdx];
  const n = m.projectPhases.length + 1;
  let factors = plain(m.factors);
  const cycles = evopCycles(m);
  if (recenter && prev && prev.yValues && prev.yValues.length && m.design && cycles.length) {
    factors = plain(recenteredFactors(m.factors, computeEVOPEffects(cycles).bestPointCoded));
  }
  m.doeName = `${m.projectName} - Phase ${n}`;
  m.factors = factors;
  m.design = null;
  m.worksheetRef = null;
  m.previewEdits = null;
  m.projectPhases.push(openPhase(m, n, m.doeName));
  m.activePhaseIdx = m.projectPhases.length - 1;
}

/**
 * The evaluation of a design.
 * @typedef {object} Evaluation
 * @property {{ dEfficiency: number, aEfficiency: number, gEfficiency: number, conditionNumber: number,
 *   maxLeverage: number }|null} efficiency efficiencies in percent
 * @property {Array<{ term: string, vif: number }>} vif per model term
 * @property {{ generators: string[], aliases: Array<{ term: string, aliasedWith: string[] }> }|null} alias
 *   generators and aliases of a fractional design, null without aliasing
 * @property {Array<{ effectSize: number, power: number|null, dfError: number }>} power per effect size,
 *   power null without error degrees of freedom
 */

/**
 * Planned and generated runs.
 * @typedef {object} Summary
 * @property {number|null} runs planned runs including replicates, null while unknown
 * @property {string} resolution 'III', 'IV', 'V', 'Full', 'CCD', … or ''
 * @property {number} generatedRuns runs of the current design, 0 without
 */

/**
 * One EVOP phase as read.
 * @typedef {object} EvopPhase
 * @property {number} cycleNumber phase number, from 1
 * @property {string} doeName the phase name
 * @property {'recenter'|'repeat'|'stop'|null} decision null while open
 * @property {string|null} completedAt ISO time of the decision, null while open
 * @property {Array<Array<number|null>>|null} yValues per response the value of each run at closing, null without
 */

/**
 * The EVOP project.
 * @typedef {object} Evop
 * @property {boolean} projectMode always true; evop is null outside project mode
 * @property {string} projectName
 * @property {number} activePhaseIdx the phase shown, 0 = phase 1
 * @property {EvopPhase[]} phases all phases in order
 * @property {object|null} summary cumulative EVOP effects of the first response, null before the first closed
 *   phase with values
 */

/**
 * One run of the run table.
 * @typedef {object} Run
 * @property {number} run run number in run order
 * @property {number} std standard order
 * @property {number} block block
 * @property {number} replicate replicate
 * @property {Record<string, number|string|null>} factors setting per factor name
 * @property {Record<string, number|null>} responses value per response name, null while empty
 */

/**
 * The dispersion analysis of the chosen response, or `{ noReplicates: true }`
 * when the design has replicates but too few per point.
 * @typedef {object} Dispersion
 * @property {boolean} [ok] the analysis ran
 * @property {boolean} [noReplicates] replicates are missing
 * @property {string} [responseName] the analysed response
 * @property {object|null} [meanModel] model of the mean
 * @property {object|null} [dispersionModel] model of ln(s²)
 * @property {Array<{ term: string, coefficient: number, effect: number, p: number, prefer: 'low'|'high'|'mid' }>}
 *   [significantDispersion] factors that affect the spread
 */

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    doeName: text(),
    designType: oneOf(['full', 'frac', 'pb', 'ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt']),
    factors: list(object({
      id: number({ integer: true }),
      name: text(),
      unit: text(),
      kind: oneOf(['continuous', 'categorical']),
      levels: list(text()),
    }), {
      default: [
        { id: 1, name: '', unit: '', kind: 'continuous', levels: ['', ''] },
        { id: 2, name: '', unit: '', kind: 'continuous', levels: ['', ''] },
      ],
    }),
    responses: list(object({ name: text(), unit: text() }), { default: [{ name: '', unit: '' }] }),
    options: object({
      randomize: boolean({ default: true }),
      centerPoints: boolean(),
      replicates: number({ integer: true, min: 1, max: 10, default: 1 }),
      alphaType: oneOf(['rotatable', 'face-centered', 'spherical']),
      ccdCenterPoints: number({ integer: true, min: 1, max: 100, default: 3 }),
      bbCenterPoints: number({ integer: true, min: 1, max: 100, default: 3 }),
      taguchiArray: text(),
      optimalRuns: number({ integer: true, min: 0 }),
      optimalActiveTerms: list(text(), { nullable: true }),
      forbiddenVertices: list(list(number({ nullable: true }))),
    }),
    seed: number({ integer: true, min: 0, max: 2147483647 }),
    selectedRes: object({
      k: number({ integer: true }),
      runs: number({ integer: true }),
      res: text(),
      p: number({ integer: true, min: 0 }),
    }, { nullable: true }),
    selectedPBIdx: number({ integer: true, min: 0, nullable: true }),
    design: object({
      codedMatrix: list(list(number())),
      actualMatrix: list(list(text())),
      stdOrder: list(number({ integer: true })),
      runOrder: list(number({ integer: true })),
      replicateIds: list(number({ integer: true })),
      resolution: text(),
      p: number({ integer: true, min: 0 }),
      designType: oneOf(['full', 'frac', 'pb', 'ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt']),
      sourceResponseSeeds: list(list(number({ nullable: true })), { optional: true }),
      sourceRowCount: number({ integer: true, min: 0, optional: true }),
      configSignature: text(),
    }, { nullable: true, omitOnRead: true, agentWrite: false }),
    previewEdits: object({
      factors: list(list(number({ nullable: true }))),
      responses: list(list(number({ nullable: true }))),
    }, { nullable: true }),
    worksheetRef: object({
      instanceId: text(),
      sheetId: text(),
      factorColumnIds: list(text()),
      responseColumnIds: list(text()),
      meanColumnIds: list(text()),
      lnVarColumnIds: list(text()),
      runOrderColumnId: text({ nullable: true }),
      stdOrderColumnId: text({ nullable: true }),
      designSignature: text({ nullable: true }),
      snapshot: object({
        name: text(),
        designType: oneOf(['full', 'frac', 'pb', 'ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt'], { nullable: true }),
        factors: list(object({
          name: text(),
          kind: oneOf(['continuous', 'categorical']),
          unit: text({ nullable: true }),
          levels: list(text(), { nullable: true }),
        })),
        plannedTerms: object({ linear: boolean(), terms: list(text()), blockColumn: boolean() }),
        aliasing: object({
          aliases: list(object({ term: text(), aliasedWith: list(text()) })),
          generatorStrings: list(text()),
          definingRelation: list(text()),
        }, { nullable: true }),
        centerPointRows: list(number({ integer: true, min: 0 })),
        replicateGroups: list(list(number({ integer: true, min: 0 }))),
        responses: list(object({ name: text(), unit: text({ nullable: true }) })),
      }, { nullable: true }),
    }, { nullable: true, agentWrite: false }),
    sourceWorksheet: object({ instanceId: text(), sheetId: text() }, { nullable: true }),
    projectMode: boolean(),
    projectName: text(),
    projectPhases: list(object({
      cycleNumber: number({ integer: true, min: 1 }),
      doeName: text(),
      factors: list(object({
        id: number({ integer: true }),
        name: text(),
        unit: text(),
        kind: oneOf(['continuous', 'categorical']),
        levels: list(text()),
      })),
      responses: list(object({ name: text(), unit: text() })),
      designType: oneOf(['full', 'frac', 'pb', 'ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt']),
      options: object({
        randomize: boolean({ default: true }),
        centerPoints: boolean(),
        replicates: number({ integer: true, min: 1, max: 10, default: 1 }),
        alphaType: oneOf(['rotatable', 'face-centered', 'spherical']),
        ccdCenterPoints: number({ integer: true, min: 1, max: 100, default: 3 }),
        bbCenterPoints: number({ integer: true, min: 1, max: 100, default: 3 }),
        taguchiArray: text(),
        optimalRuns: number({ integer: true, min: 0 }),
        optimalActiveTerms: list(text(), { nullable: true }),
        forbiddenVertices: list(list(number({ nullable: true }))),
      }),
      design: object({
        codedMatrix: list(list(number())),
        actualMatrix: list(list(text())),
        stdOrder: list(number({ integer: true })),
        runOrder: list(number({ integer: true })),
        replicateIds: list(number({ integer: true })),
        resolution: text(),
        p: number({ integer: true, min: 0 }),
        designType: oneOf(['full', 'frac', 'pb', 'ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt']),
        sourceResponseSeeds: list(list(number({ nullable: true })), { optional: true }),
        sourceRowCount: number({ integer: true, min: 0, optional: true }),
        configSignature: text(),
      }, { nullable: true, omitOnRead: true, agentWrite: false }),
      worksheetRef: object({
        instanceId: text(),
        sheetId: text(),
        factorColumnIds: list(text()),
        responseColumnIds: list(text()),
        meanColumnIds: list(text()),
        lnVarColumnIds: list(text()),
        runOrderColumnId: text({ nullable: true }),
        stdOrderColumnId: text({ nullable: true }),
        designSignature: text({ nullable: true }),
        snapshot: object({
          name: text(),
          designType: oneOf(['full', 'frac', 'pb', 'ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt'], { nullable: true }),
          factors: list(object({
            name: text(),
            kind: oneOf(['continuous', 'categorical']),
            unit: text({ nullable: true }),
            levels: list(text(), { nullable: true }),
          })),
          plannedTerms: object({ linear: boolean(), terms: list(text()), blockColumn: boolean() }),
          aliasing: object({
            aliases: list(object({ term: text(), aliasedWith: list(text()) })),
            generatorStrings: list(text()),
            definingRelation: list(text()),
          }, { nullable: true }),
          centerPointRows: list(number({ integer: true, min: 0 })),
          replicateGroups: list(list(number({ integer: true, min: 0 }))),
          responses: list(object({ name: text(), unit: text({ nullable: true }) })),
        }, { nullable: true }),
      }, { nullable: true, agentWrite: false }),
      decision: oneOf(['recenter', 'repeat', 'stop'], { nullable: true }),
      completedAt: text({ nullable: true }),
      yValues: list(list(number({ nullable: true })), { nullable: true }),
      selectedRes: object({
        k: number({ integer: true }),
        runs: number({ integer: true }),
        res: text(),
        p: number({ integer: true, min: 0 }),
      }, { nullable: true, optional: true }),
      selectedPBIdx: number({ integer: true, min: 0, nullable: true, optional: true }),
      sourceWorksheet: object({ instanceId: text(), sheetId: text() }, { nullable: true, optional: true }),
      seed: number({ integer: true, min: 0, max: 2147483647, optional: true }),
    })),
  },
  view: {
    analysisResponseIdx: number({ integer: true, min: 0 }),
    activePhaseIdx: number({ integer: true, min: -1, default: -1 }),
  },
  invariants: {
    minResponses: {
      fields: ['responses'],
      test(m) { return m.responses.length >= MIN_RESPONSES; },
      repair(m) { m._v.responses = [{ name: '', unit: '' }]; },
    },
    validSelection: {
      fields: ['selectedRes', 'selectedPBIdx', 'designType'],
      test(m) { return selectionFits(m); },
      repair(m) {
        if (m._v.selectedRes && m._v.selectedRes.k !== m._v.factors.length) m._v.selectedRes = null;
        if (hasMultiLevel(m._v) && (m._v.designType === 'frac' || m._v.designType === 'pb')) {
          m._v.designType = 'full';
          m._v.selectedRes = null;
          m._v.selectedPBIdx = null;
        }
      },
    },
    uniqueFactorIds: {
      fields: ['factors'],
      test(m) { return new Set(m.factors.map((f) => f.id)).size === m.factors.length; },
      repair(m) {
        // Later duplicates get the next free id; no factor is dropped.
        const seen = new Set();
        let next = Math.max(0, ...m._v.factors.map((f) => f.id)) + 1;
        for (const f of m._v.factors) {
          if (seen.has(f.id)) { f.id = next; next += 1; }
          seen.add(f.id);
        }
      },
    },
    analysisResponse: {
      fields: ['analysisResponseIdx'],
      test(m) { return m.analysisResponseIdx < m.responses.length; },
      repair(m) { m._v.analysisResponseIdx = Math.max(0, Math.min(m._v.analysisResponseIdx, m._v.responses.length - 1)); },
    },
    activePhase: {
      fields: ['activePhaseIdx'],
      test(m) { return m.activePhaseIdx === -1 || m.activePhaseIdx < m.projectPhases.length; },
      repair(m) { m._v.activePhaseIdx = Math.min(m._v.activePhaseIdx, m._v.projectPhases.length - 1); },
    },
  },
  commands: {
    addFactor: command({
      returns: number({ integer: true }),
      run() {
        const id = Math.max(0, ...this.factors.map((f) => f.id)) + 1;
        this.factors.push({ id, name: '', unit: '', kind: 'continuous', levels: ['', ''] });
        // A forbidden combination lists one value per factor.
        this.options.forbiddenVertices = [];
        fitSelection(this);
        return id;
      },
    }),
    removeFactor: command({
      params: { id: number({ integer: true }) },
      run({ id }) {
        requireKnownId('id', id, this.factors.map((f) => f.id));
        const fi = this.factors.findIndex((f) => f.id === id);
        this.factors.splice(fi, 1);
        // Term ids name factor positions, forbidden combinations one value per factor.
        this.options.optimalActiveTerms = null;
        this.options.forbiddenVertices = [];
        if (this.previewEdits) this.previewEdits.factors.splice(fi, 1);
        fitSelection(this);
      },
    }),
    insertLevel: command({
      params: { id: number({ integer: true }), at: number({ integer: true }) },
      run({ id, at }) {
        requireKnownId('id', id, this.factors.map((f) => f.id));
        const f = this.factors.find((x) => x.id === id);
        requireIndex('at', at, f.levels.length);
        f.levels.splice(at, 0, '');
        fitSelection(this);
      },
    }),
    removeLevel: command({
      params: { id: number({ integer: true }), index: number({ integer: true }) },
      run({ id, index: li }) {
        requireKnownId('id', id, this.factors.map((f) => f.id));
        const f = this.factors.find((x) => x.id === id);
        requireIndex('index', li, f.levels.length, { existing: true });
        requireForm('index', li, f.levels.length > MIN_LEVELS, `a level of a factor with more than ${MIN_LEVELS} levels`);
        f.levels.splice(li, 1);
        fitSelection(this);
      },
    }),
    addResponse: command({
      returns: index('responses'),
      run() {
        this.responses.push({ name: '', unit: '' });
        return this.responses.length - 1;
      },
    }),
    removeResponse: command({
      params: { index: index('responses', { existing: true }) },
      run({ index: ri }) {
        this.responses.splice(ri, 1);
        if (this.previewEdits) this.previewEdits.responses.splice(ri, 1);
        clampAnalysis(this);
      },
    }),
    setAnalysisResponse: command({
      params: { index: index('responses', { existing: true }) },
      run({ index: ri }) { this.analysisResponseIdx = ri; },
    }),
    selectDesignType: command({
      params: {
        type: oneOf(['full', 'frac', 'pb', 'ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt']),
        sourceRowCount: number({ integer: true, min: 0, optional: true }),
      },
      run({ type, sourceRowCount }) {
        requireForm('type', type, !(DESIGNS[type].twoLevelOnly && hasMultiLevel(this)),
          'a design type for factors with more than two levels: not frac or pb');
        this.designType = type;
        this.selectedRes = null;
        this.selectedPBIdx = null;
        if (isOptimal(this) && !this.options.optimalRuns) this.options.optimalRuns = minOptimalRunsOf(this, sourceRowCount) + 2;
      },
    }),
    applyRecommendation: command({
      returns: text({ nullable: true }),
      run() {
        const rec = recommendation(this);
        if (!rec) return null;
        this.designType = rec;
        this.selectedRes = null;
        this.selectedPBIdx = null;
        return rec;
      },
    }),
    selectResolution: command({
      params: { k: number({ integer: true, min: 2 }), runs: number({ integer: true, min: 4 }) },
      run({ k, runs }) {
        requireForm('k', k, this.designType === 'frac', 'a resolution of the fractional factorial; select design type frac first');
        requireForm('k', k, k === this.factors.length, `the factor count ${this.factors.length}`);
        const d = frac.def(k, runs);
        requireForm('runs', runs, Boolean(d), `a run count of a fractional factorial with ${k} factors`);
        this.selectedRes = { k, runs, res: d.res, p: d.p };
      },
    }),
    selectPB: command({
      params: { index: number({ integer: true, min: 0 }) },
      run({ index: i }) {
        requireIndex('index', i, PB_DESIGNS.length, { existing: true });
        requireForm('index', i, this.designType === 'pb', 'a Plackett-Burman row; select design type pb first');
        this.selectedPBIdx = i;
      },
    }),
    selectTaguchi: command({
      params: { name: text() },
      run({ name }) {
        requireForm('name', name, this.designType === 'taguchi', 'an orthogonal array; select design type taguchi first');
        const names = taguchi.candidates(this).map((c) => c.name);
        requireForm('name', name, names.includes(name), names.join(', '));
        this.options.taguchiArray = name;
      },
    }),
    setTerm: command({
      params: { id: text(), on: boolean(), sourceRowCount: number({ integer: true, min: 0, optional: true }) },
      run({ id, on, sourceRowCount }) {
        const groups = enumerateTerms(this.factors.length);
        const ids = groups.flatMap((g) => g.ids);
        requireForm('id', id, ids.includes(id), ids.join(', '));
        requireForm('id', id, on || !groups[0].ids.includes(id), 'a term that is no main effect; main effects stay in the model');
        const active = new Set(activeTerms(this));
        if (on) activateTerm(active, id);
        else deactivateTerm(active, id);
        applyActiveTerms(this, active, sourceRowCount);
      },
    }),
    setTermGroup: command({
      params: { group: number({ integer: true, min: 0 }), on: boolean(), sourceRowCount: number({ integer: true, min: 0, optional: true }) },
      run({ group, on, sourceRowCount }) {
        const groups = enumerateTerms(this.factors.length);
        requireIndex('group', group, groups.length, { existing: true });
        const g = groups[group];
        requireForm('group', group, g.kind !== 'main', 'a group other than 0; the main effects stay in the model');
        const active = new Set(activeTerms(this));
        for (const id of g.ids) {
          if (on) activateTerm(active, id);
          else deactivateTerm(active, id);
        }
        applyActiveTerms(this, active, sourceRowCount);
      },
    }),
    addForbiddenVertex: command({
      params: { pattern: list(number({ nullable: true })) },
      returns: boolean(),
      run({ pattern }) {
        const k = this.factors.length;
        requireForm('pattern', pattern, pattern.length === k, `one coded level or null per factor (${k})`);
        pattern.forEach((v, fi) => {
          const allowed = codedLevels(this.factors[fi]);
          requireForm('pattern', pattern, v === null || allowed.includes(v),
            `at position ${fi} a coded level ${allowed.join(', ')} or null`);
        });
        requireForm('pattern', pattern, pattern.some((v) => v !== null), 'at least one coded level; null everywhere forbids every run');
        return forbid(this, pattern);
      },
    }),
    removeForbiddenVertex: command({
      params: { index: index('options.forbiddenVertices', { existing: true }) },
      run({ index: i }) {
        this.options.forbiddenVertices = plain(this.options.forbiddenVertices).filter((_, j) => j !== i);
      },
    }),
    setSourceWorksheet: command({
      params: {
        ref: object({ instanceId: text({ nonEmpty: true }), sheetId: text({ nonEmpty: true }) }, { nullable: true }),
        sourceRowCount: number({ integer: true, min: 0, optional: true }),
      },
      run({ ref, sourceRowCount }) {
        const own = this.worksheetRef;
        requireForm('ref', ref, !(ref && own && own.instanceId === ref.instanceId && own.sheetId === ref.sheetId),
          "a sheet other than the planner's own datasheet, or null");
        this.sourceWorksheet = ref ? { instanceId: ref.instanceId, sheetId: ref.sheetId } : null;
        if (isOptimal(this)) raiseOptimalRuns(this, sourceRowCount);
      },
    }),
    regenerate: command({
      params: {
        source: object({
          codedMatrix: list(list(number())),
          actualRows: list(list(text())),
          responseValues: list(list(number({ nullable: true }))),
          rowCount: number({ integer: true, min: 0 }),
          sheetRowCount: number({ integer: true, min: 0 }),
        }, { nullable: true, optional: true }),
      },
      run({ source = null }) {
        const withSource = isOptimal(this) && Boolean(this.sourceWorksheet);
        requireForm('source', source, withSource === (source !== null), withSource
          ? 'the rows of the source worksheet (codedMatrix, actualRows, responseValues, rowCount, sheetRowCount)'
          : 'null; a source belongs to an optimal design with a source worksheet');
        if (source) raiseOptimalRuns(this, source.sheetRowCount);
        const check = configCheckWith(this, source ? source.sheetRowCount : 0);
        if (!check.ok || (source && source.rowCount === 0)) {
          this.design = null;
          this.previewEdits = null;
          return;
        }
        const next = designFor(this, source);
        this.evaluateFor(next);
        this.design = { ...next, configSignature: configSignature(this) };
        this.previewEdits = null;
        if (this.worksheetRef && !this.worksheetRef.designSignature) this.worksheetRef.designSignature = designSignature(this);
        this.syncActivePhase();
      },
    }),
    appendRuns: command({
      params: { rows: list(list(number({ min: -1, max: 1 }))) },
      returns: number({ integer: true }),
      run({ rows }) {
        const k = this.factors.length;
        const ref = this.worksheetRef;
        const current = Boolean(this.design && ref && this.design.configSignature === configSignature(this)
          && ref.designSignature === designSignature(this));
        requireForm('rows', rows, current, 'coded rows of runs already appended to the bound, current datasheet');
        requireForm('rows', rows, rows.length > 0 && rows.every((r) => r.length === k), `one or more rows of ${k} coded values`);
        const d = plain(this.design);
        const n = d.codedMatrix.length;
        const added = codedToActualRows(rows, this.factors).map((row) => row.map((v) => String(v)));
        const numbers = rows.map((_, i) => n + i + 1);
        const next = {
          ...d,
          codedMatrix: [...d.codedMatrix, ...plain(rows)],
          actualMatrix: [...d.actualMatrix, ...added],
          runOrder: [...d.runOrder, ...numbers],
          stdOrder: [...d.stdOrder, ...numbers],
          replicateIds: [...d.replicateIds, ...rows.map(() => 1)],
        };
        this.evaluateFor(next);
        this.design = next;
        const binding = plain(ref);
        binding.designSignature = designSignature(this);
        if (binding.snapshot) binding.snapshot.replicateGroups = snapshotOf(this, next).replicateGroups;
        this.worksheetRef = binding;
        this.syncActivePhase();
        return next.codedMatrix.length;
      },
    }),
    reshuffle: command({
      run() {
        let seed = this.seed;
        while (seed === this.seed) seed = 1 + Math.floor(Math.random() * 2147483647);
        this.seed = seed;
      },
    }),
    setPreviewCell: command({
      params: { row: number({ integer: true, min: 0 }), column: text(), value: number({ nullable: true }) },
      run({ row, column, value }) {
        requireIndex('row', row, designRows(this, row), { existing: true });
        const target = editTarget(this, column);
        const keys = previewColumns(this).filter((key) => editTarget(this, key));
        requireForm('column', column, Boolean(target), keys.join(', '));
        writeEdits(this, [{ row, target, value }]);
      },
    }),
    setPreviewCells: command({
      params: { row: number({ integer: true, min: 0 }), column: text(), values: list(list(number({ nullable: true }))) },
      run({ row, column, values }) {
        const n = designRows(this, row);
        requireIndex('row', row, n, { existing: true });
        const keys = previewColumns(this);
        const start = keys.indexOf(column);
        requireForm('column', column, start >= 0, keys.join(', '));
        const cells = [];
        values.forEach((line, r) => line.forEach((value, c) => {
          const key = keys[start + c];
          const target = key === undefined ? null : editTarget(this, key);
          if (row + r < n && target) cells.push({ row: row + r, target, value });
        }));
        writeEdits(this, cells);
      },
    }),
    forbidRun: command({
      params: { row: number({ integer: true, min: 0 }) },
      returns: boolean(),
      run({ row }) {
        requireForm('row', row, isOptimal(this), 'a row of an optimal design (dopt, aopt, gopt)');
        requireIndex('row', row, designRows(this, row), { existing: true });
        return forbid(this, [...this.design.codedMatrix[row]]);
      },
    }),
    discardPreviewEdits: command({
      run() { this.previewEdits = null; },
    }),
    setProjectMode: command({
      params: { on: boolean() },
      run({ on }) {
        this.projectMode = on;
        if (on && this.projectPhases.length === 0) {
          this.projectPhases.push(openPhase(this, 1, this.doeName || `${this.projectName || 'Projekt'} - Phase 1`));
          this.activePhaseIdx = 0;
        }
      },
    }),
    viewPhase: command({
      params: { index: index('projectPhases', { existing: true }) },
      run({ index: pi }) {
        const ph = plain(this.projectPhases[pi]);
        this.activePhaseIdx = pi;
        this.doeName = ph.doeName;
        this.factors = ph.factors;
        this.responses = ph.responses.length ? ph.responses : [{ name: '', unit: '' }];
        this.designType = ph.designType;
        this.options = { ...plain(this.options), ...ph.options };
        // Phases saved before they kept their selection and seed keep the current ones.
        for (const key of ['seed', 'selectedRes', 'selectedPBIdx', 'sourceWorksheet']) {
          if (ph[key] !== undefined) this[key] = ph[key];
        }
        this.design = ph.design;
        this.worksheetRef = ph.worksheetRef;
        this.previewEdits = null;
        fitSelection(this);
        clampAnalysis(this);
      },
    }),
    newPhase: command({
      returns: number({ integer: true }),
      run() {
        requireForm('activePhaseIdx', this.activePhaseIdx, this.canStartNewPhase(),
          'a decided active phase in a project that was not stopped');
        startPhase(this, false);
        return this.activePhaseIdx;
      },
    }),
    completePhase: command({
      params: {
        decision: oneOf(['recenter', 'repeat', 'stop']),
        yValues: list(list(number({ nullable: true })), { nullable: true, optional: true }),
      },
      confirm({ decision }) {
        const ph = this.projectPhases[this.activePhaseIdx];
        return ph && !ph.decision ? { key: 'confirm.completePhase', params: { decision } } : null;
      },
      run({ decision, yValues = null }) {
        const ph = this.projectPhases[this.activePhaseIdx];
        requireForm('decision', decision, Boolean(ph && !ph.decision), 'a decision for the open active phase of a project');
        this.syncActivePhase();
        ph.decision = decision;
        ph.completedAt = new Date().toISOString();
        ph.yValues = yValues === null ? null : plain(yValues);
        if (decision !== 'stop') startPhase(this, decision === 'recenter');
      },
    }),
  },
  derived: {
    /**
     * The configuration yields a design.
     * @param {any} data worksheet data access
     * @this {import('./model.types.js').StateModel}
     * @returns {boolean}
     */
    valid(data) { return configCheck(this, data).ok; },
    /**
     * Why the configuration yields no design: 'tooFewFactors', 'duplicateFactorNames', 'incompleteFactor',
     * 'noResponse', 'unnamedResponse', 'noDesignType', 'twoLevelOnly', 'noResolution', 'noPBDesign',
     * 'bbUnavailable', 'noTaguchiArray', 'tooFewOptimalRuns' or 'source-not-found'; null while valid.
     * @param {any} data worksheet data access
     * @this {import('./model.types.js').StateModel}
     * @returns {string|null}
     */
    invalidReason(data) { return configCheck(this, data).reason; },
    /**
     * The design does not belong to the configuration: it was made for another one, or there is none
     * although the configuration is valid. `regenerate` makes it current.
     * @param {any} data worksheet data access
     * @param {any} d other derivations
     * @this {import('./model.types.js').StateModel}
     * @returns {boolean}
     */
    pending(data, d) {
      return this.design ? this.design.configSignature !== configSignature(this) : d.valid;
    },
    /**
     * The design type recommended for the factors.
     * @this {import('./model.types.js').StateModel}
     * @returns {string}
     */
    recommendation() { return recommendation(this); },
    /**
     * Planned and generated runs, resolution.
     * @param {any} data worksheet data access
     * @param {any} d other derivations
     * @this {import('./model.types.js').StateModel}
     * @returns {Summary}
     */
    summary(data, d) { return summaryOf(this, d.pending); },
    /**
     * Evaluation of the current design; null without one or while a new one is pending.
     * @param {any} data worksheet data access
     * @param {any} d other derivations
     * @this {import('./model.types.js').StateModel}
     * @returns {Evaluation|null}
     */
    evaluation(data, d) { return evaluationOf(this, d.pending); },
    /**
     * State of the bound datasheet: 'none' without a binding or when the sheet is gone, 'bound' while it
     * matches the design and factors, 'stale' after a change of plan or factors (also while pending).
     * @param {any} data worksheet data access
     * @param {any} d other derivations
     * @this {import('./model.types.js').StateModel}
     * @returns {'none'|'bound'|'stale'}
     */
    staleness(data, d) { return stalenessOf(this, data, d.pending); },
    /**
     * Filled response cells of the bound datasheet; a response whose column is gone is listed in
     * `missing`. null without a bound sheet.
     * @param {any} data worksheet data access
     * @this {import('./model.types.js').StateModel}
     * @returns {import('./read.js').Progress|null}
     */
    progress(data) { return progressOf(this, data); },
    /**
     * Dispersion analysis of the response `analysisResponseIdx` once every response cell is filled;
     * null otherwise.
     * @param {any} data worksheet data access
     * @param {any} d other derivations
     * @this {import('./model.types.js').StateModel}
     * @returns {Dispersion|null}
     */
    dispersion(data, d) { return dispersionOf(this, data, d.staleness, d.progress); },
    /**
     * The experiment of the bound datasheet, as written with it (not the current plan); null without a
     * bound sheet or without a snapshot.
     * @param {any} data worksheet data access
     * @param {any} d other derivations
     * @this {import('./model.types.js').StateModel}
     * @returns {import('./experiment.js').Experiment|null}
     */
    experiment(data, d) { return d.staleness === 'none' ? null : experimentOf(this.worksheetRef); },
    /**
     * The EVOP project; null outside project mode.
     * @this {import('./model.types.js').StateModel}
     * @returns {Evop|null}
     */
    evop() { return evopOf(this); },
    /**
     * The run table in run order: the preview with its edits, the values of the datasheet while bound.
     * [] without a current design.
     * @param {any} data worksheet data access
     * @param {any} d other derivations
     * @this {import('./model.types.js').StateModel}
     * @returns {Run[]}
     */
    runs(data, d) { return runsOf(this, data, d.pending, d.staleness); },
  },
  derivedBulk: ['runs'],
}) {
  /**
   * Two factor names equal apart from case and surrounding blanks; blank names do not count.
   * @returns {boolean}
   */
  hasDuplicateFactorNames() {
    const names = this.factors.map((f) => f.name.trim().toLowerCase()).filter((n) => n !== '');
    return new Set(names).size !== names.length;
  }

  /**
   * Active model terms of an optimal design, cleaned against the factors.
   * @returns {string[]}
   */
  getActiveTerms() {
    return activeTerms(/** @type {any} */ (this));
  }

  /**
   * The evaluation of a design for these factors; throws when the design cannot be evaluated.
   * @param {{ codedMatrix: number[][], p: number, designType: string }} design
   * @returns {object}
   */
  evaluateFor(design) {
    return evaluateDesign(design.codedMatrix, this.factors.length, design.p, design.designType, 0.05,
      { terms: modelTerms(/** @type {any} */ (this), design) });
  }

  /**
   * The plan as a phase keeps it: name, factors, responses, type, options, seed, selection, source,
   * design and datasheet.
   * @returns {any}
   */
  phaseState() {
    const m = /** @type {any} */ (this);
    return plain({
      doeName: m.doeName,
      factors: m.factors,
      responses: m.responses,
      designType: m.designType,
      options: m.options,
      seed: m.seed,
      selectedRes: m.selectedRes,
      selectedPBIdx: m.selectedPBIdx,
      sourceWorksheet: m.sourceWorksheet,
      design: m.design,
      worksheetRef: m.worksheetRef,
    });
  }

  /**
   * Copies the plan into the active phase of a project.
   * @returns {void}
   */
  syncActivePhase() {
    const m = /** @type {any} */ (this);
    if (!m.projectMode) return;
    const ph = m.projectPhases[m.activePhaseIdx];
    if (ph) Object.assign(ph, this.phaseState());
  }

  /**
   * A new phase may start: no phase stopped the project, and the active one is decided.
   * @returns {boolean}
   */
  canStartNewPhase() {
    const m = /** @type {any} */ (this);
    if (m.projectPhases.some((ph) => ph.decision === 'stop')) return false;
    const active = m.projectPhases[m.activePhaseIdx];
    return m.activePhaseIdx === -1 || Boolean(active && active.decision);
  }
}
