/**
 * D.Mike — Modelldaten-Generator: die erzeugten Daten.
 *
 * Die Zeilen sind nie gespeichert, sondern eine reine Funktion von Faktoren,
 * Termen, Koeffizienten, Verfahren, Umfang, Rauschen und Startwert
 * (Mulberry32, Box-Muller). Die Faktoren gehen auf 0…1 normiert in das
 * Modell ein. Ein Merker für den letzten Stand sorgt dafür, dass Lesefläche,
 * Vorschau und Lauf nicht mehrfach erzeugen. Ohne DOM, ohne i18n.
 */
import { descriptiveStats } from '../../../engines/normality-test-engine.js';

/**
 * Zufallsgenerator Mulberry32 mit 32-Bit-Startwert.
 * @param {number} seed @returns {() => number} Zahlen in [0, 1)
 */
export function mulberry32(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Eine standardnormalverteilte Zahl (Box-Muller).
 * @param {() => number} rng @returns {number}
 */
export function boxMuller(rng) {
  let u1;
  do { u1 = rng(); } while (u1 === 0);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Alle Terme aus `nFactors` Faktoren bis zur Ordnung `maxOrder`, je Term die
 * Faktorindizes, in Tiefensuche (A, A×B, A×B×C, …, B, …).
 * @param {number} nFactors @param {number} maxOrder @returns {number[][]}
 */
export function buildTerms(nFactors, maxOrder) {
  /** @type {number[][]} */
  const results = [];
  const mo = Math.min(maxOrder, nFactors);
  /** @param {number} start @param {number[]} cur */
  function recurse(start, cur) {
    if (cur.length > 0 && cur.length <= mo) results.push([...cur]);
    if (cur.length >= mo) return;
    for (let i = start; i < nFactors; i++) {
      cur.push(i);
      recurse(i + 1, cur);
      cur.pop();
    }
  }
  recurse(0, []);
  return results;
}

/**
 * Der Name eines Faktors in Gleichung und Termnamen: der eigene Name oder
 * `X<n>`.
 * @param {ReadonlyArray<{ name: string }>} factors @param {number} i @returns {string}
 */
export function factorLabel(factors, i) {
  return factors[i]?.name || `X${i + 1}`;
}

/**
 * Der Name eines Terms, z. B. „A“ oder „A × B“.
 * @param {ReadonlyArray<number>} indices @param {ReadonlyArray<{ name: string }>} factors
 * @returns {string}
 */
export function termLabel(indices, factors) {
  return indices.map((i) => factorLabel(factors, i)).join(' × ');
}

/**
 * Die Spaltennamen der Ausgabe: je Faktor sein Name (leer `X<n>`), zuletzt
 * Y (leer `Y`); ein schon vergebener Name bekommt `_2`, `_3`, … angehängt.
 * @param {ReadonlyArray<{ name: string }>} factors @param {string} yName
 * @returns {string[]}
 */
export function outputNames(factors, yName) {
  const raw = [...factors.map((_, i) => factorLabel(factors, i)), yName || 'Y'];
  const used = new Set();
  return raw.map((name) => {
    let out = name;
    for (let k = 2; used.has(out); k++) out = `${name}_${k}`;
    used.add(out);
    return out;
  });
}

/**
 * @typedef {object} SampleState
 * @property {ReadonlyArray<{ name: string, min: number, max: number }>} factors
 * @property {number} maxOrder
 * @property {Readonly<Record<string, number>>} betas  Termindex (als Text) → β ≠ 0
 * @property {number} intercept
 * @property {string} yName
 * @property {string} samplingMethod
 * @property {number} sampleSize
 * @property {number} noiseStd
 * @property {number} seed
 */

/**
 * @typedef {object} Rows
 * @property {string[]} names  die Spaltennamen (Faktoren, zuletzt Y), eindeutig
 * @property {number[][]} columns  je Spalte die Werte, gleich lang
 */

/**
 * Die Terme mit Koeffizient ≠ 0.
 * @param {SampleState} m @returns {{ indices: number[], beta: number }[]}
 */
function activeTerms(m) {
  return buildTerms(m.factors.length, m.maxOrder)
    .map((indices, i) => ({ indices, beta: m.betas[String(i)] ?? 0 }))
    .filter((t) => t.beta !== 0);
}

/**
 * Antwort des Modells zum normierten Faktorvektor `xn`, mit Rauschen.
 * @param {{ indices: number[], beta: number }[]} terms @param {number} intercept
 * @param {number[]} xn @param {() => number} rng @param {number} noiseStd
 */
function evalResponse(terms, intercept, xn, rng, noiseStd) {
  let y = intercept;
  for (const term of terms) y += term.beta * term.indices.reduce((a, fi) => a * xn[fi], 1);
  return y + boxMuller(rng) * noiseStd;
}

/** @param {{ min: number, max: number }} f @param {number} v */
const norm = (f, v) => (f.max !== f.min ? (v - f.min) / (f.max - f.min) : 0);

/**
 * Eine Zeile anhängen: Faktorwerte, dann Y.
 * @param {number[][]} cols @param {number[]} values @param {number} y
 */
function pushRow(cols, values, y) {
  values.forEach((v, fi) => cols[fi].push(v));
  cols[values.length].push(y);
}

/** @param {SampleState} m @param {ReturnType<typeof activeTerms>} terms @param {() => number} rng @param {number[][]} cols */
function sampleRandom(m, terms, rng, cols) {
  for (let i = 0; i < m.sampleSize; i++) {
    const values = []; const xn = [];
    for (const f of m.factors) {
      const v = f.min + rng() * (f.max - f.min);
      values.push(v); xn.push(norm(f, v));
    }
    pushRow(cols, values, evalResponse(terms, m.intercept, xn, rng, m.noiseStd));
  }
}

/** @param {SampleState} m @param {ReturnType<typeof activeTerms>} terms @param {() => number} rng @param {number[][]} cols */
function sampleLHS(m, terms, rng, cols) {
  const n = m.sampleSize;
  const perms = m.factors.map(() => {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  });
  for (let i = 0; i < n; i++) {
    const values = []; const xn = [];
    m.factors.forEach((f, fi) => {
      const lo = perms[fi][i] / n;
      const hi = (perms[fi][i] + 1) / n;
      const v = f.min + (lo + rng() * (hi - lo)) * (f.max - f.min);
      values.push(v); xn.push(norm(f, v));
    });
    pushRow(cols, values, evalResponse(terms, m.intercept, xn, rng, m.noiseStd));
  }
}

/** @param {SampleState} m @param {ReturnType<typeof activeTerms>} terms @param {() => number} rng @param {number[][]} cols */
function sampleFullFactorial(m, terms, rng, cols) {
  const levels = m.factors.length <= 4 ? 3 : 2;
  const lvlVals = m.factors.map((f) => Array.from({ length: levels }, (_, l) => f.min + (l / (levels - 1)) * (f.max - f.min)));
  /** @type {number[][]} */
  const combos = lvlVals.reduce((acc, arr) => acc.flatMap((x) => arr.map((y) => [...x, y])), /** @type {number[][]} */ ([[]]));
  const reps = Math.max(1, Math.round(m.sampleSize / combos.length));
  for (const combo of combos) {
    for (let r = 0; r < reps; r++) {
      const xn = combo.map((v, fi) => norm(m.factors[fi], v));
      pushRow(cols, combo, evalResponse(terms, m.intercept, xn, rng, m.noiseStd));
    }
  }
}

/** @type {{ key: string, result: Rows }|null} */
let memo = null;

/**
 * Die erzeugten Daten eines Stands, spaltenweise. Gleiche Werte wie die
 * Altform (`State.generate`), nur ohne Namenskollision.
 * @param {SampleState} m @returns {Rows}
 */
export function rowsOf(m) {
  const key = JSON.stringify([
    m.factors.map((f) => [f.name, f.min, f.max]), m.maxOrder, m.betas, m.intercept, m.yName,
    m.samplingMethod, m.sampleSize, m.noiseStd, m.seed,
  ]);
  if (memo?.key === key) return memo.result;
  const rng = mulberry32(m.seed);
  const terms = activeTerms(m);
  /** @type {number[][]} */
  const cols = Array.from({ length: m.factors.length + 1 }, () => []);
  if (m.samplingMethod === 'lhs') sampleLHS(m, terms, rng, cols);
  else if (m.samplingMethod === 'fullfactorial') sampleFullFactorial(m, terms, rng, cols);
  else sampleRandom(m, terms, rng, cols);
  const result = { names: outputNames(m.factors, m.yName), columns: cols };
  memo = { key, result };
  return result;
}

/**
 * Die Zusammenfassung der Y-Werte wie die Kennzahlen der Altform.
 * @param {ReadonlyArray<number>} y
 * @returns {{ n: number, mean: number, sd: number, min: number, max: number }}
 */
export function summaryOf(y) {
  const ds = descriptiveStats(/** @type {number[]} */ (y));
  return { n: ds.n, mean: ds.mean, sd: ds.stdDev, min: ds.min, max: ds.max };
}
