/**
 * D.Mike — Random Generator Model (random-generator-model.js)
 *
 * Module-specific business logic + state for the random-generator module:
 *   - Categorical (attributive) sampling by weight
 *   - View / CSV helpers (attrProbabilities, frequency, csvEscape)
 *   - State (persistence: currentDist / seed / count / params + attribute defs)
 *
 * The general-purpose statistical RNG — the Mulberry32 PRNG, the distribution
 * registry, per-distribution samplers, `generateRandomVariates`/`generateSamples`
 * and the numeric helpers `resolveParams`/`clampCount` — lives in the canonical
 * engine `js/engines/random-variates-engine.js` and is re-exported below so
 * existing importers (module view + model tests) keep working unchanged.
 *
 * No DOM, no i18n, no CSS, no view flags. View transformations live in the
 * module's data-Fn (random-generator.js). Generated random VALUES are NOT
 * persisted — they are regenerated deterministically from the stored seed.
 */

import {
  mulberry32,
  DISTRIBUTIONS,
  generateRandomVariates,
  generateSamples,
  resolveParams,
  clampCount,
} from '../../engines/random-variates-engine.js';

// Re-export the engine's pure RNG/sampling API so existing importers
// (random-generator.js view + tests/modules/random-generator.test.js) keep
// importing it from the model.
export {
  mulberry32,
  DISTRIBUTIONS,
  generateRandomVariates,
  generateSamples,
  resolveParams,
  clampCount,
};

// Special distribution key for the attribute-based (categorical) generator.
export const ATTRIBUTIVE_KEY = 'attributive';

// ═══════════════════════════════════════════════════════════════
// Sampling helpers (module-specific)
// ═══════════════════════════════════════════════════════════════

/**
 * Categorical (attributive) sampling by weight. Attributes with an empty name
 * or non-positive weight are ignored. Returns an array of category names.
 * @param {{name:string, weight:number}[]} attributes
 * @param {number} count
 * @param {number} seed
 * @returns {string[]}
 */
export function generateAttributive(attributes, count, seed) {
  const valid = (Array.isArray(attributes) ? attributes : []).filter(a => a.name && a.weight > 0);
  if (!valid.length) return [];

  const total = valid.reduce((s, a) => s + a.weight, 0);
  const cum = [];
  let running = 0;
  valid.forEach(a => { running += a.weight / total; cum.push({ name: a.name, threshold: running }); });

  const rng = mulberry32(seed);
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const r = rng();
    for (const c of cum) {
      if (r <= c.threshold) { out[i] = c.name; break; }
    }
  }
  return out;
}

/**
 * Probability shares (%) per attribute, by weight. Negative weights count as 0.
 * @param {{weight:number}[]} attributes
 * @returns {number[]}
 */
export function attrProbabilities(attributes) {
  const list = Array.isArray(attributes) ? attributes : [];
  const total = list.reduce((s, a) => s + Math.max(0, a.weight || 0), 0);
  return list.map(a => {
    const w = Math.max(0, a.weight || 0);
    return total > 0 ? (w / total * 100) : 0;
  });
}

/**
 * Tally categorical values and sort descending by count.
 * @param {Array<string|number>} values
 * @returns {Array<[string, number]>}
 */
export function frequency(values) {
  const freq = {};
  (values || []).forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]);
}

/**
 * CSV-escape a value (quote when it contains comma, quote or newline).
 * @param {any} v
 * @returns {string}
 */
export function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${  s.replace(/"/g, '""')  }"`;
  return s;
}

// ═══════════════════════════════════════════════════════════════
// State (persistence)
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a stable, session-transient id for an attribute row. Used only as a
 * key for the editable attribute grid (Alpine x-for :key) — NOT persisted, so
 * the serialized state shape stays identical to the legacy format.
 * @returns {string}
 */
export function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rg-${  Math.abs(Date.now() ^ (Math.random() * 1e9 | 0)).toString(36)}`;
}

function defaultAttributes() {
  return [
    { id: genId(), name: 'A', weight: 1 },
    { id: genId(), name: 'B', weight: 2 },
    { id: genId(), name: 'C', weight: 7 },
  ];
}

export class State {
  /** Selected distribution key, ATTRIBUTIVE_KEY, or null. */
  currentDist = null;
  /** Seed + count + params for the last continuous/discrete generation. */
  seed = 42;
  count = 1000;
  params = {};
  /** Attributive (categorical) definitions. */
  attributes = defaultAttributes();
  attrCount = 50;
  attrSeed = 42;

  /** True when a distribution has been selected (used by loadExample/confirmPopout). */
  hasContent() {
    return this.currentDist != null;
  }

  toJSON() {
    return {
      currentDist: this.currentDist,
      seed: this.seed,
      count: this.count,
      params: { ...this.params },
      attributes: this.attributes.map(a => ({ name: a.name, weight: a.weight })),
      attrCount: this.attrCount,
      attrSeed: this.attrSeed,
    };
  }

  /**
   * @param {any} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.currentDist = (typeof d.currentDist === 'string') ? d.currentDist : null;
    s.seed = Number.isFinite(d.seed) ? d.seed : 42;
    s.count = Number.isFinite(d.count) ? d.count : 1000;
    s.params = (d.params && typeof d.params === 'object' && !Array.isArray(d.params)) ? { ...d.params } : {};

    if (Array.isArray(d.attributes) && d.attributes.length) {
      s.attributes = d.attributes.map(a => ({
        id: genId(),
        name: typeof a?.name === 'string' ? a.name : '',
        weight: Number.isFinite(a?.weight) ? a.weight : 0,
      }));
    } else {
      s.attributes = defaultAttributes();
    }

    s.attrCount = Number.isFinite(d.attrCount) ? d.attrCount : 50;
    s.attrSeed = Number.isFinite(d.attrSeed) ? d.attrSeed : 42;
    return s;
  }
}
