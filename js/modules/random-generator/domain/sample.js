/**
 * D.Mike — Zufallsgenerator: die erzeugten Werte.
 *
 * Die Werte sind nie gespeichert, sondern eine reine Funktion von Verteilung,
 * Parametern, Umfang und Startwert (Mulberry32 der Engine). Ein leerer
 * Startwert gilt als 42. Ein Merker für den letzten Stand sorgt dafür, dass
 * Lesefläche und Ansicht nicht zweimal ziehen.
 */
import { mulberry32, generateSamples } from '../../../engines/random-variates-engine.js';
import { descriptiveStats } from '../../../engines/normality-test-engine.js';
import { ATTRIBUTIVE_KEY, isNumericDist } from './distributions.js';

/** Startwert, wenn das Feld leer ist. */
export const DEFAULT_SEED = 42;

/**
 * Der wirksame Startwert: der gespeicherte, leer (`null`) die Vorgabe 42.
 * @param {number|null|undefined} seed @returns {number}
 */
export function effectiveSeed(seed) {
  return typeof seed === 'number' && Number.isFinite(seed) ? seed : DEFAULT_SEED;
}

/**
 * Kategorial nach Gewicht ziehen. Kategorien ohne Namen oder mit Gewicht ≤ 0
 * zählen nicht. Liefert die Namen der gezogenen Kategorien.
 * @param {ReadonlyArray<{ name: string, weight: number }>} attributes
 * @param {number} count @param {number} seed
 * @returns {string[]}
 */
export function generateAttributive(attributes, count, seed) {
  const valid = (Array.isArray(attributes) ? attributes : []).filter((a) => a.name && a.weight > 0);
  if (!valid.length) return [];
  const total = valid.reduce((s, a) => s + a.weight, 0);
  const cum = [];
  let running = 0;
  for (const a of valid) { running += a.weight / total; cum.push({ name: a.name, threshold: running }); }
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
 * Anteil je Kategorie in Prozent nach Gewicht; negative Gewichte zählen 0.
 * @param {ReadonlyArray<{ weight: number }>} attributes @returns {number[]}
 */
export function attrProbabilities(attributes) {
  const list = Array.isArray(attributes) ? attributes : [];
  const total = list.reduce((s, a) => s + Math.max(0, a.weight || 0), 0);
  return list.map((a) => {
    const w = Math.max(0, a.weight || 0);
    return total > 0 ? (w / total * 100) : 0;
  });
}

/**
 * Häufigkeit je Wert, absteigend nach Anzahl (gleiche Anzahl in der Folge
 * des ersten Auftretens).
 * @param {ReadonlyArray<string|number>} values @returns {Array<[string, number]>}
 */
export function frequency(values) {
  /** @type {Record<string, number>} */
  const freq = {};
  for (const v of values || []) freq[v] = (freq[v] || 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1]);
}

/**
 * Häufigkeit je Kategorie samt Anteil (0–1), absteigend nach Anzahl.
 * @param {ReadonlyArray<string>} values
 * @returns {{ name: string, count: number, share: number }[]}
 */
export function frequencyShares(values) {
  const total = values.length;
  return frequency(values).map(([name, count]) => ({ name, count, share: count / total }));
}

/**
 * @typedef {object} SampleState
 * @property {string|null} currentDist
 * @property {Record<string, Record<string, number>>} params
 * @property {number} count
 * @property {number|null} seed
 * @property {ReadonlyArray<{ name: string, weight: number }>} attributes
 * @property {number} attrCount
 * @property {number|null} attrSeed
 */

/**
 * @typedef {object} Samples
 * @property {Array<number|string>} values  die erzeugten Werte (leer ohne Verteilung)
 * @property {string|null} error  die Meldung der Engine, wenn die Ziehung scheiterte
 */

/** @type {{ key: string, result: Samples }|null} */
let memo = null;

/**
 * Die Signatur eines Stands: alles, wovon die Werte abhängen.
 * @param {SampleState} m @returns {string|null}
 */
function signature(m) {
  if (m.currentDist === ATTRIBUTIVE_KEY) {
    return JSON.stringify(['attr', m.attributes.map((a) => [a.name, a.weight]), m.attrCount, effectiveSeed(m.attrSeed)]);
  }
  if (!isNumericDist(m.currentDist)) return null;
  const dist = /** @type {string} */ (m.currentDist);
  return JSON.stringify(['num', dist, m.params[dist], m.count, effectiveSeed(m.seed)]);
}

/**
 * Die erzeugten Werte eines Stands. Ohne Verteilung leer; wirft die Engine,
 * sind die Werte leer und `error` nennt die Meldung.
 * @param {SampleState} m @returns {Samples}
 */
export function samplesOf(m) {
  const key = signature(m);
  if (key === null) return { values: [], error: null };
  if (memo?.key === key) return memo.result;
  /** @type {Samples} */
  let result;
  try {
    const values = m.currentDist === ATTRIBUTIVE_KEY
      ? generateAttributive(m.attributes, m.attrCount, effectiveSeed(m.attrSeed))
      : generateSamples(/** @type {string} */ (m.currentDist), { ...m.params[/** @type {string} */ (m.currentDist)] },
        m.count, effectiveSeed(m.seed));
    result = { values, error: null };
  } catch (err) {
    result = { values: [], error: err instanceof Error ? err.message : String(err) };
  }
  memo = { key, result };
  return result;
}

/**
 * Die Zusammenfassung der erzeugten Werte wie die Lesefläche der Altform:
 * stetig/diskret n bis Kurtosis, attributiv n und Häufigkeiten. Ohne Werte
 * `null`.
 * @param {ReadonlyArray<number|string>} values @param {boolean} attributive
 * @returns {object|null}
 */
export function summaryOf(values, attributive) {
  if (!values.length) return null;
  if (attributive) {
    return { n: values.length, frequency: frequencyShares(/** @type {string[]} */ (values)) };
  }
  const ds = descriptiveStats(/** @type {number[]} */ (values));
  return {
    n: ds.n, mean: ds.mean, sd: ds.stdDev, median: ds.median,
    min: ds.min, max: ds.max, skewness: ds.skewness, kurtosis: ds.kurtosis,
  };
}
