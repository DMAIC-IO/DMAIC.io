/**
 * D.Mike — Course widget "sampling distribution" (widgets/sampling-distribution.js)
 *
 * Minimal version: draws samples of size n from a population, hands the
 * summary of the drawn means to the lesson and reports cumulative progress
 * for the insight gates. Charts are added on top of this later.
 */

import { mulberry32 } from '../../../engines/random-variates-engine.js';
import { POPULATIONS, drawSampleMean, meanSd } from '../populations.js';

/** Sample sizes offered when n is not locked. */
export const N_CHOICES = [1, 2, 5, 10, 30, 50];

/** Fixed seed: a lesson behaves the same on every run. */
const SEED = 20261025;

/**
 * Alpine component factory (registered as `trainingSamplingSim`).
 * @param {{i18n: {t: Function}}} ctx page context
 * @returns {object} Alpine data object
 */
export function samplingSimComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.sim.${key}`, vars);
  // The generator and the page API stay outside Alpine's reactive proxy.
  const rng = mulberry32(SEED);
  let root = null;
  let api = null;

  return {
    population: 'normal',
    n: 2,
    lockPopulation: false,
    lockN: false,
    count: 0,
    perN: {},
    populationIds: Object.keys(POPULATIONS),
    nChoices: N_CHOICES,

    /**
     * Initialise from the block's params.
     * @param {HTMLElement} el widget root (event target)
     * @param {{population?: string, n?: number, lockPopulation?: boolean, lockN?: boolean}} params
     * @param {{addResult: Function}} lessonApi the lesson page's API
     */
    setup(el, params, lessonApi) {
      root = el;
      api = lessonApi;
      const p = params || {};
      if (POPULATIONS[p.population]) this.population = p.population;
      if (Number.isInteger(p.n) && p.n > 0) this.n = p.n;
      this.lockPopulation = p.lockPopulation === true;
      this.lockN = p.lockN === true;
    },

    label(key, vars) { return t(key, vars); },
    popLabel(id) { return t(`pop.${id}`); },
    /** A locked select offers only the fixed value. */
    popHidden(id) { return this.lockPopulation && id !== this.population; },
    nHidden(v) { return this.lockN && v !== this.n; },
    countText() { return t('count', { count: this.count }); },

    /**
     * Draw `times` samples of size n and report them.
     * @param {number} times
     */
    draw(times) {
      const population = POPULATIONS[this.population];
      const n = Number(this.n);
      if (!population || !(n > 0)) return;
      const means = [];
      for (let i = 0; i < times; i++) means.push(drawSampleMean(population, n, rng));
      const { mean, sd } = meanSd(means);
      if (api) api.addResult(this.population, n, { mean, sd, count: times });
      this.count += times;
      const byN = this.perN[this.population] || (this.perN[this.population] = {});
      byN[n] = (byN[n] || 0) + times;
      this.report();
    },

    /** Announce cumulative counts of this step visit to the page. */
    report() {
      if (!root) return;
      root.dispatchEvent(new CustomEvent('training-sim-progress', {
        bubbles: true,
        detail: { count: this.count, perN: JSON.parse(JSON.stringify(this.perN)) },
      }));
    },
  };
}
