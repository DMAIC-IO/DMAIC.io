/**
 * D.Mike — Insight gates (gates.js)
 *
 * Decides when a gated `insight` block opens. Counts are kept per step by the
 * caller and cover only the current visit of that step.
 *
 * `values` maps a setting name (lesson 6: drift, n, alpha) to {value: checks}.
 *
 * @typedef {{ count: number, perN: Object<string, Object<string, number>>, choices: number, values: Object<string, Object<string, number>> }} StepCounts
 */

/** Draws needed for one sample size n to count towards a gate. */
export const MIN_DRAWS_PER_N = 100;

/**
 * Fresh counts for a step visit.
 * @returns {StepCounts}
 */
export function emptyStepCounts() {
  return { count: 0, perN: {}, choices: 0, values: {} };
}

/**
 * Merge a cumulative progress event into the counts, keeping maxima.
 * @param {StepCounts} prev
 * @param {{count?: number, perN?: Object<string, Object<string, number>>, choices?: number, values?: Object<string, Object<string, number>>}} detail
 * @returns {StepCounts}
 */
export function mergeCounts(prev, detail) {
  return {
    count: Math.max(prev.count || 0, (detail && detail.count) || 0),
    perN: mergeNested(prev.perN, detail && detail.perN),
    choices: Math.max(prev.choices || 0, (detail && detail.choices) || 0),
    values: mergeNested(prev.values, detail && detail.values),
  };
}

/** Merge two {outer: {inner: number}} maps, keeping the maximum per entry. */
function mergeNested(prev, next) {
  const out = {};
  for (const [key, inner] of Object.entries(prev || {})) out[key] = { ...inner };
  for (const [key, inner] of Object.entries(next || {})) {
    const target = out[key] || (out[key] = {});
    for (const [k, v] of Object.entries(inner)) target[k] = Math.max(target[k] || 0, v);
  }
  return out;
}

/** Number of n values with enough draws in one population. */
function enoughNs(byN) {
  return Object.values(byN || {}).filter((draws) => draws >= MIN_DRAWS_PER_N).length;
}

/**
 * Distinct levels and distinct n among the settings with enough draws.
 * Lesson 4 reports perN as {[level]: {[n]: samples}}.
 * @param {Object<string, Object<string, number>>} perN
 * @returns {{levels: number, ns: number}}
 */
function settingsTried(perN) {
  const levels = new Set();
  const ns = new Set();
  for (const [level, byN] of Object.entries(perN || {})) {
    for (const [n, draws] of Object.entries(byN || {})) {
      if (draws >= MIN_DRAWS_PER_N) { levels.add(level); ns.add(n); }
    }
  }
  return { levels: levels.size, ns: ns.size };
}

/**
 * Is the block's gate open for the given step counts?
 * @param {object} block
 * @param {StepCounts} counts
 * @returns {boolean}
 */
export function isGateOpen(block, counts) {
  if (block.revealAfterSamples != null && !(counts.count >= block.revealAfterSamples)) return false;
  if (block.revealAfterChecks != null && !(counts.count >= block.revealAfterChecks)) return false;
  if (block.revealAfterEachValue != null) {
    const { of, k, min } = block.revealAfterEachValue;
    const enough = Object.values((counts.values || {})[of] || {}).filter((checks) => checks >= min).length;
    if (enough < k) return false;
  }
  if (block.revealAfterValues != null && !(counts.count >= block.revealAfterValues)) return false;
  if (block.revealAfterChoices != null && !((counts.choices || 0) >= block.revealAfterChoices)) return false;
  if (block.revealAfterSettings != null) {
    const tried = settingsTried(counts.perN);
    if (tried.levels < block.revealAfterSettings || tried.ns < block.revealAfterSettings) return false;
  }
  if (block.revealAfterEach != null) {
    const perProcess = Object.values(counts.perN || {});
    if (!perProcess.length || perProcess.some((byN) => !((byN[1] || 0) >= block.revealAfterEach))) return false;
  }
  if (block.revealAfter != null && !(counts.count >= block.revealAfter)) return false;
  if (block.revealAfterN != null) {
    const pops = Object.values(counts.perN || {}).filter((byN) => enoughNs(byN) >= block.revealAfterN);
    const needed = block.revealAfterShapes != null ? block.revealAfterShapes : 1;
    if (pops.length < needed) return false;
  }
  return true;
}

/**
 * i18n key and parameters for the locked-state hint.
 * @param {object} block
 * @returns {{key: string, params: object}}
 */
export function gateHint(block) {
  // Lesson 6 asks for several values of the setting its step frees.
  if (block.revealAfterEachValue != null) {
    const { of, k, min } = block.revealAfterEachValue;
    return { key: `course.insightLockedEachValue.${of}`, params: { k, min } };
  }
  // Lesson 6 counts whole checks, not samples.
  if (block.revealAfterChecks != null) {
    return { key: 'course.insightLockedChecks', params: { k: block.revealAfterChecks } };
  }
  // Lesson 5 asks for every offered choice on top of the samples.
  if (block.revealAfterChoices != null) {
    if (block.revealAfterSamples == null) {
      return { key: 'course.insightLockedChoicesOnly', params: { k: block.revealAfterChoices } };
    }
    return {
      key: 'course.insightLockedChoices',
      params: { k: block.revealAfterChoices, n: block.revealAfterSamples },
    };
  }
  // Lesson 2 counts whole samples; its buttons draw one or a few at a time.
  if (block.revealAfterSamples != null) {
    return { key: 'course.insightLockedSamples', params: { k: block.revealAfterSamples } };
  }
  // Lesson 4 asks for several n and several confidence levels.
  if (block.revealAfterSettings != null) {
    return { key: 'course.insightLockedSettings', params: { k: block.revealAfterSettings } };
  }
  // Value gates (lesson 1) speak of measured values, not samples.
  if (block.revealAfterEach != null) {
    return { key: 'course.insightLockedEach', params: { k: block.revealAfterEach } };
  }
  if (block.revealAfterValues != null) {
    return { key: 'course.insightLockedValues', params: { k: block.revealAfterValues } };
  }
  if (block.revealAfterShapes != null) {
    return {
      key: 'course.insightLockedShapes',
      params: { shapes: block.revealAfterShapes, n: block.revealAfterN },
    };
  }
  if (block.revealAfterN != null) {
    return { key: 'course.insightLockedN', params: { n: block.revealAfterN } };
  }
  return { key: 'course.insightLocked', params: {} };
}
