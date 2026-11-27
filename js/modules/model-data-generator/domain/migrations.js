/**
 * D.Mike — Modelldaten-Generator: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js. Jeder Schritt liefert ein einfaches Objekt.
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Die Vorgabefaktoren der Altform. */
const DEFAULT_FACTORS = [
  { name: 'Temperatur', min: 150, max: 250 },
  { name: 'Druck', min: 1, max: 10 },
  { name: 'Zeit', min: 5, max: 60 },
];

const METHODS = ['random', 'lhs', 'fullfactorial'];

/**
 * Zahl der Terme aus `n` Faktoren bis zur Ordnung `maxOrder` (Summe der
 * Binomialkoeffizienten), wie `buildTerms` der Altform sie zählte.
 * @param {number} n @param {number} maxOrder @returns {number}
 */
function termCount(n, maxOrder) {
  let total = 0;
  let c = 1;
  for (let k = 1; k <= Math.min(maxOrder, n); k++) {
    c = (c * (n - k + 1)) / k;
    total += c;
  }
  return total;
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (Golden-Fixture, alte Exporte) hat die
 * Form von '1.0'; der folgende Schritt liest ihn wie das alte `fromJSON`.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {Record<string, unknown>}
 */
export function from0(old) {
  return isObject(old) ? { ...old } : {};
}

/**
 * '1.0→1.1': genau wie das alte `State.fromJSON`. Faktoren: leere oder
 * fehlende Liste → Vorgaben; Name kein Text → `''`, Grenze nicht endlich →
 * 0, fremde Schlüssel (`type`, `levels`) entfallen. `maxOrder` endlich →
 * abgerundet, unter 0 → 0, sonst 3. `intercept` nicht endlich → 0. `yName`
 * leer → `'Y'`. Verfahren unbekannt → `'random'`. `sampleSize` endlich →
 * auf 10–100 000 geklemmt und aufgerundet (die Altform zog so viele Zeilen),
 * sonst 100. `noiseStd` nicht endlich oder negativ → 2. `seed` endlich →
 * ganzzahliger Anteil, sonst 42. `betas`: Schlüssel, die `parseInt` als
 * Termindex liest, mit endlichem β ≠ 0; alles andere entfällt.
 * @param {unknown} old gespeicherter Zustand '1.0'
 * @returns {{ factors: { name: string, min: number, max: number }[], maxOrder: number, betas: Record<string, number>, intercept: number, yName: string, samplingMethod: string, sampleSize: number, noiseStd: number, seed: number }}
 */
export function from1_0(old) {
  const o = isObject(old) ? old : {};
  const factors = Array.isArray(o.factors) && o.factors.length
    ? o.factors.map((d) => {
      const f = isObject(d) ? d : {};
      return {
        name: typeof f.name === 'string' ? f.name : '',
        min: Number.isFinite(f.min) ? f.min : 0,
        max: Number.isFinite(f.max) ? f.max : 0,
      };
    })
    : DEFAULT_FACTORS.map((f) => ({ ...f }));
  const maxOrder = Number.isFinite(o.maxOrder) ? Math.max(0, Math.floor(o.maxOrder)) : 3;
  const count = termCount(factors.length, maxOrder);
  /** @type {Record<string, number>} */
  const betas = {};
  if (isObject(o.betas)) {
    for (const [idx, beta] of Object.entries(o.betas)) {
      const i = parseInt(idx, 10);
      if (i >= 0 && i < count && Number.isFinite(beta) && beta !== 0) betas[String(i)] = beta;
      else if (i >= 0 && i < count && Number.isFinite(beta)) delete betas[String(i)];
    }
  }
  return {
    factors,
    maxOrder,
    betas,
    intercept: Number.isFinite(o.intercept) ? o.intercept : 0,
    yName: typeof o.yName === 'string' && o.yName ? o.yName : 'Y',
    samplingMethod: METHODS.includes(o.samplingMethod) ? o.samplingMethod : 'random',
    sampleSize: Number.isFinite(o.sampleSize) ? Math.ceil(Math.min(100000, Math.max(10, o.sampleSize))) : 100,
    noiseStd: Number.isFinite(o.noiseStd) && o.noiseStd >= 0 ? o.noiseStd : 2,
    seed: Number.isFinite(o.seed) ? Math.trunc(o.seed) : 42,
  };
}
