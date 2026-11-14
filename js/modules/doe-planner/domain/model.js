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
import { defineModel, list, object, text, number, boolean, oneOf } from '../../../core/model.js';
import { from0 } from './migrations.js';
import { activeTerms } from './design.js';
import { configSignature } from './signatures.js';
import { experimentOf } from './experiment.js';
import {
  configCheck, recommendation, summaryOf, evaluationOf, stalenessOf, progressOf, dispersionOf, evopOf, runsOf,
} from './read.js';

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
     * 'bbUnavailable', 'noTaguchiArray', 'tooFewOptimalRuns' or a source reason; null while valid.
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
}
