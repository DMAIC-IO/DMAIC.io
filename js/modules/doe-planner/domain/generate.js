/**
 * D.Mike — DoE Planner: generating a design (domain/generate.js)
 *
 * Pure. The design for a configuration: from the engine, or for an
 * optimal design on a source worksheet, the measured runs of the source
 * followed by the optimal runs added to them. The actual matrix comes
 * back as text, the stored form of a design. A seed of 0 lets the engine
 * derive its seed from the configuration.
 */
import { generateDesign, augmentOptimalDesign, minRunsForTerms } from '../../../engines/doe-planner-engine.js';
import optimal from './designs/optimal.js';
import { activeTerms, isOptimal } from './design.js';
import { codedToActualRows } from './runtable.js';

/**
 * The measured rows of a source worksheet, as the viewmodel reads them.
 * @typedef {object} DesignSource
 * @property {number[][]} codedMatrix coded factor values per valid row
 * @property {string[][]} actualRows actual values per valid row, as text
 * @property {Array<Array<number|null>>} responseValues per response, one value per valid row
 * @property {number} rowCount valid rows
 * @property {number} [sheetRowCount] all rows of the source sheet
 */

/**
 * @param {Array<Array<number|string|null>>} rows
 * @returns {string[][]} every cell as text
 */
const asText = (rows) => rows.map((row) => row.map((v) => (v === null || v === undefined ? '' : String(v))));

/**
 * The design of an optimal type on top of the rows of a source worksheet.
 * New runs: the requested ones, at least as many as the model terms still need.
 * @param {any} m planner model
 * @param {DesignSource} source
 * @returns {object} the design without its signature
 */
export function designFromSource(m, source) {
  const factors = m.factors;
  const k = factors.length;
  const terms = activeTerms(m);
  const minR = minRunsForTerms(terms);
  const rows = source.rowCount;
  const addRuns = Math.max(m.options.optimalRuns || 0, Math.max(0, minR - rows));
  let newCoded = [];
  let newRows = [];
  if (addRuns > 0) {
    /** @type {any} the engine's JSDoc predates term lists */
    const opts = {
      terms,
      levelCounts: factors.map((f) => f.levels.length),
      categoricalFlags: factors.map((f) => f.kind === 'categorical'),
      seed: m.seed || 1,
      forbiddenVertices: m.options.forbiddenVertices,
    };
    newCoded = augmentOptimalDesign(source.codedMatrix, k, addRuns, m.designType, opts);
    newRows = codedToActualRows(newCoded, factors);
  }
  const total = rows + addRuns;
  return {
    codedMatrix: [...source.codedMatrix.map((r) => [...r]), ...newCoded],
    actualMatrix: [...asText(source.actualRows), ...asText(newRows)],
    stdOrder: Array.from({ length: total }, (_, i) => i + 1),
    runOrder: Array.from({ length: total }, (_, i) => i + 1),
    replicateIds: new Array(total).fill(1),
    resolution: optimal.resolution(m),
    p: minR,
    designType: m.designType,
    sourceResponseSeeds: source.responseValues.map((col) => [...col]),
    sourceRowCount: rows,
  };
}

/**
 * The design for the configuration, without its signature.
 * @param {any} m planner model
 * @param {DesignSource|null} source the source rows of an optimal design on a source worksheet
 * @returns {object}
 * @throws {Error} when the engine cannot make the design
 */
export function designFor(m, source) {
  if (source) return designFromSource(m, source);
  const o = m.options;
  const opt = isOptimal(m);
  /** @type {any} the engine's JSDoc predates term lists and forbidden combinations */
  const opts = {
    designType: m.designType,
    selectedRes: m.selectedRes,
    randomize: o.randomize,
    centerPoints: o.centerPoints,
    replicates: o.replicates || 1,
    alphaType: o.alphaType,
    ccdCenterPoints: o.ccdCenterPoints,
    bbCenterPoints: o.bbCenterPoints,
    taguchiArray: o.taguchiArray || undefined,
    optimalRuns: o.optimalRuns || undefined,
    optimalActiveTerms: opt ? activeTerms(m) : undefined,
    forbiddenVertices: o.forbiddenVertices,
    seed: m.seed === 0 ? undefined : m.seed,
  };
  const d = generateDesign(m.factors, opts);
  return {
    codedMatrix: d.codedMatrix,
    actualMatrix: asText(d.actualMatrix),
    stdOrder: d.stdOrder,
    runOrder: d.runOrder,
    replicateIds: d.replicateIds,
    resolution: d.resolution,
    p: d.p,
    designType: d.designType,
  };
}

/**
 * New optimal runs for the current design: the engine adds them to the
 * design's coded rows with the plan's terms, forbidden combinations and
 * seed (`seed || 1`, so the same plan gives the same runs).
 * @param {any} m planner model with a design of an optimal type
 * @param {number} count new runs, at least 1
 * @returns {number[][]} coded rows of the new runs
 * @throws {Error} when the engine cannot add the runs
 */
export function augmentRows(m, count) {
  const factors = m.factors;
  /** @type {any} the engine's JSDoc predates term lists */
  const opts = {
    terms: activeTerms(m),
    levelCounts: factors.map((f) => f.levels.length),
    categoricalFlags: factors.map((f) => f.kind === 'categorical'),
    seed: m.seed || 1,
    forbiddenVertices: m.options.forbiddenVertices,
  };
  return augmentOptimalDesign(m.design.codedMatrix, factors.length, count, m.designType, opts);
}
