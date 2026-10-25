/**
 * D.Mike — Insight gates (gates.js)
 *
 * Decides when a gated `insight` block opens. Counts are kept per step by the
 * caller and cover only the current visit of that step.
 *
 * @typedef {{ count: number, perN: Object<string, Object<string, number>> }} StepCounts
 */

/** Draws needed for one sample size n to count towards a gate. */
export const MIN_DRAWS_PER_N = 100;

/**
 * Fresh counts for a step visit.
 * @returns {StepCounts}
 */
export function emptyStepCounts() {
  return { count: 0, perN: {} };
}

/**
 * Merge a cumulative progress event into the counts, keeping maxima.
 * @param {StepCounts} prev
 * @param {{count?: number, perN?: Object<string, Object<string, number>>}} detail
 * @returns {StepCounts}
 */
export function mergeCounts(prev, detail) {
  const perN = {};
  for (const [pop, byN] of Object.entries(prev.perN || {})) perN[pop] = { ...byN };
  for (const [pop, byN] of Object.entries((detail && detail.perN) || {})) {
    const target = perN[pop] || (perN[pop] = {});
    for (const [n, draws] of Object.entries(byN)) {
      target[n] = Math.max(target[n] || 0, draws);
    }
  }
  return { count: Math.max(prev.count || 0, (detail && detail.count) || 0), perN };
}

/** Number of n values with enough draws in one population. */
function enoughNs(byN) {
  return Object.values(byN || {}).filter((draws) => draws >= MIN_DRAWS_PER_N).length;
}

/**
 * Is the block's gate open for the given step counts?
 * @param {object} block
 * @param {StepCounts} counts
 * @returns {boolean}
 */
export function isGateOpen(block, counts) {
  if (block.revealAfterSamples != null && !(counts.count >= block.revealAfterSamples)) return false;
  if (block.revealAfterValues != null && !(counts.count >= block.revealAfterValues)) return false;
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
  // Lesson 2 counts whole samples; its buttons draw one or a few at a time.
  if (block.revealAfterSamples != null) {
    return { key: 'course.insightLockedSamples', params: { k: block.revealAfterSamples } };
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
