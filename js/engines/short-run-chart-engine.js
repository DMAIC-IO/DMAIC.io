/**
 * D.Mike — Short-Run (Z-MR) Control Chart Engine (short-run-chart-engine.js)
 *
 * Z-MR chart: standardize each value within its part (group) via the part's
 * mean and within-part σ̂ (from MR̄/d₂), then plot the resulting z-values on
 * a single I-MR-style chart. Allows mixing parts with different targets and
 * spreads on one chart — the standard tool for short production runs.
 *
 *   z_ij = (x_ij - x̄_j) / σ̂_j
 *   σ̂_j = MR̄_j / d₂(2)
 *
 * Limits on z: CL=0, UCL=3, LCL=−3 (z is N(0,1) under stable conditions).
 * Limits on MR_z: CL=MR̄_z, UCL=D₄·MR̄_z, LCL=D₃·MR̄_z (D₃[2]=0, D₄[2]=3.267).
 *
 * No DOM, no state — pure stateless functions.
 */

const D2_N2 = 1.128;
const D3_N2 = 0;
const D4_N2 = 3.267;

/**
 * @typedef {Object} GroupStat
 * @property {string} group
 * @property {number[]} indices   — original indices belonging to this group
 * @property {number} mean        — within-group mean (target)
 * @property {number} sigma       — within-group σ̂ from MR̄/d₂; 0 if group has < 2 points
 * @property {number} mrBar       — within-group MR̄
 * @property {number} count
 */

/**
 * @typedef {Object} ZMRResult
 * @property {number[]} z         — standardized values, one per input row
 * @property {(number|null)[]} mr — moving range of z, leading null
 * @property {GroupStat[]} groups — per-group statistics, in encounter order
 * @property {number} clZ
 * @property {number} uclZ
 * @property {number} lclZ
 * @property {number} mrBarZ
 * @property {number} uclMR
 * @property {number} lclMR
 * @property {number[]} signalsZ  — indices where z exceeds ±3
 * @property {number[]} signalsMR — indices where MR_z exceeds UCL_MR
 * @property {number} skipped     — count of values that could not be standardized
 *                                  (group has σ̂ = 0)
 */

/**
 * Compute Z-MR for short-run data.
 *
 * @param {number[]} values  — measurement series in time order
 * @param {(string|number)[]} groups — same length, identifies the part each
 *   measurement belongs to. Different parts can have different targets/spreads.
 * @returns {ZMRResult}
 */
export function computeZMR(values, groups) {
  if (!Array.isArray(values) || !Array.isArray(groups)) {
    throw new Error('computeZMR: values and groups must be arrays');
  }
  if (values.length !== groups.length) {
    throw new Error('computeZMR: values and groups must have the same length');
  }
  const n = values.length;

  // Bucket indices by group (preserve encounter order for the result)
  /** @type {Map<string, number[]>} */
  const groupOrderMap = new Map();
  for (let i = 0; i < n; i++) {
    const g = String(groups[i]);
    if (!groupOrderMap.has(g)) groupOrderMap.set(g, []);
    groupOrderMap.get(g).push(i);
  }

  // Compute per-group mean + within-group MR̄ → σ̂
  /** @type {GroupStat[]} */
  const groupStats = [];
  for (const [g, indices] of groupOrderMap.entries()) {
    const xs = indices.map(i => values[i]);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    let mrSum = 0, mrCount = 0;
    for (let k = 1; k < xs.length; k++) {
      mrSum += Math.abs(xs[k] - xs[k - 1]);
      mrCount++;
    }
    const mrBar = mrCount > 0 ? mrSum / mrCount : 0;
    const sigma = mrBar / D2_N2;
    groupStats.push({ group: g, indices, mean, sigma, mrBar, count: xs.length });
  }

  const sigmaByGroup = Object.create(null);
  const meanByGroup  = Object.create(null);
  for (const gs of groupStats) {
    sigmaByGroup[gs.group] = gs.sigma;
    meanByGroup[gs.group]  = gs.mean;
  }

  // Standardize
  let skipped = 0;
  const z = new Array(n);
  for (let i = 0; i < n; i++) {
    const g = String(groups[i]);
    const s = sigmaByGroup[g];
    if (!Number.isFinite(s) || s === 0) {
      // Group has 0 or 1 point — cannot estimate σ. Output 0 (centered) and
      // count the skip in the diagnostics so the UI can warn.
      z[i] = 0;
      skipped++;
    } else {
      z[i] = (values[i] - meanByGroup[g]) / s;
    }
  }

  // MR of z
  const mr = [null];
  for (let i = 1; i < n; i++) mr.push(Math.abs(z[i] - z[i - 1]));
  const mrClean = mr.slice(1).filter(v => v !== null);
  const mrBarZ = mrClean.length > 0 ? mrClean.reduce((a, b) => a + b, 0) / mrClean.length : 0;
  const uclMR = D4_N2 * mrBarZ;
  const lclMR = D3_N2 * mrBarZ;

  const signalsZ = [];
  for (let i = 0; i < n; i++) if (z[i] > 3 || z[i] < -3) signalsZ.push(i);
  const signalsMR = [];
  for (let i = 1; i < n; i++) if (mr[i] !== null && mr[i] > uclMR) signalsMR.push(i);

  return {
    z, mr,
    groups: groupStats,
    clZ: 0, uclZ: 3, lclZ: -3,
    mrBarZ, uclMR, lclMR,
    signalsZ, signalsMR,
    skipped,
  };
}

// ── Unified Dispatcher ───────────────────────────────────────────────

/**
 * Unified dispatcher.
 *   "z-mr" → flat {z.cl, z.ucl, z.lcl, mr.cl, mr.ucl, mr.lcl, signal_count, group_count}
 *
 * @param {Object} inputs
 * @param {"z-mr"} inputs.mode
 * @param {number[]} inputs.values
 * @param {(string|number)[]} inputs.groups
 * @returns {Object}
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  if (inputs.mode !== 'z-mr') {
    throw new Error(`analyze: unknown mode '${inputs.mode}'`);
  }
  const r = computeZMR(inputs.values || [], inputs.groups || []);
  return {
    'z.cl':  r.clZ,
    'z.ucl': r.uclZ,
    'z.lcl': r.lclZ,
    'mr.cl': r.mrBarZ,
    'mr.ucl': r.uclMR,
    'mr.lcl': r.lclMR,
    'signal_count': r.signalsZ.length + r.signalsMR.length,
    'group_count': r.groups.length,
    'skipped':     r.skipped,
  };
}
