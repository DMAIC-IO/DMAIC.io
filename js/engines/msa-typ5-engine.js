/**
 * D.Mike — MSA Typ 5 Engine (msa-typ5-engine.js)
 * Pure computation for Attribute Measurement System Analysis (Type 5):
 * kappa-based agreement between appraisers, binary/nominal/ordinal.
 * No DOM access — testable in isolation.
 *
 * Spec: docs/superpowers/specs/2026-07-15-msa-typ5-design.md
 */

export const ERR = {
  NO_RATINGS:               'E_NO_RATINGS',
  TOO_FEW_PARTS:            'E_TOO_FEW_PARTS',
  TOO_FEW_APPRAISERS:       'E_TOO_FEW_APPRAISERS',
  TOO_FEW_LEVELS:           'E_TOO_FEW_LEVELS',
  UNKNOWN_REFERENCE_LEVEL:  'E_UNKNOWN_REFERENCE_LEVEL',
  INVALID_TYPE:             'E_INVALID_TYPE',
  ORDINAL_LEVELS_UNORDERED: 'E_ORDINAL_LEVELS_UNORDERED',
};

export const WARN = {
  UNBALANCED_REPS:     'W_UNBALANCED_REPS',
  AMBIGUOUS_CONSENSUS: 'W_AMBIGUOUS_CONSENSUS',
  LOW_REP_COUNT:       'W_LOW_REP_COUNT',
};

/**
 * Validate raw analyze() input.
 * @param {object} input {type, levels, ratings, references, params}
 * @returns {{valid: boolean, errors: Array, warnings: Array}}
 */
export function validate(input) {
  const errors = [], warnings = [];
  const push = (arr, code, params = null) => arr.push({ code, params });

  if (!['binary', 'nominal', 'ordinal'].includes(input?.type)) {
    push(errors, ERR.INVALID_TYPE, { got: input?.type });
  }
  const ratings = Array.isArray(input?.ratings) ? input.ratings : [];
  if (ratings.length === 0) {
    push(errors, ERR.NO_RATINGS);
    return { valid: false, errors, warnings };
  }
  const parts = new Set(), appraisers = new Set(), values = new Set();
  for (const r of ratings) {
    parts.add(r.part); appraisers.add(r.appraiser); values.add(r.value);
  }
  if (parts.size < 2)      push(errors, ERR.TOO_FEW_PARTS,      { got: parts.size });
  if (appraisers.size < 2) push(errors, ERR.TOO_FEW_APPRAISERS, { got: appraisers.size });
  if (values.size < 2)     push(errors, ERR.TOO_FEW_LEVELS,     { got: values.size });

  const levels = Array.isArray(input?.levels) ? input.levels : [];
  if (input?.references && typeof input.references === 'object') {
    for (const [part, val] of Object.entries(input.references)) {
      if (!levels.includes(val)) {
        push(errors, ERR.UNKNOWN_REFERENCE_LEVEL, { part, value: val });
        break;
      }
    }
  }

  // Ordinal: levels muss angegeben und mindestens so viele Stufen wie in Bewertungen
  if (input?.type === 'ordinal' && (!Array.isArray(input?.levels) || input.levels.length < 2)) {
    push(errors, ERR.ORDINAL_LEVELS_UNORDERED, { got: input?.levels });
  }

  // Warnungen (blockieren nicht)
  const repCounts = new Map();
  for (const r of ratings) {
    const k = `${r.part}|${r.appraiser}`;
    repCounts.set(k, (repCounts.get(k) || 0) + 1);
  }
  const counts = [...repCounts.values()];
  if (counts.length > 0 && new Set(counts).size > 1) {
    push(warnings, WARN.UNBALANCED_REPS, { min: Math.min(...counts), max: Math.max(...counts) });
  }
  const lowRepAppraisers = new Set();
  for (const [k, c] of repCounts) if (c < 2) lowRepAppraisers.add(k.split('|')[1]);
  if (lowRepAppraisers.size > 0) {
    push(warnings, WARN.LOW_REP_COUNT, { appraisers: [...lowRepAppraisers] });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Two-rater Cohen kappa with optional linear/quadratic weights.
 * Uses observed marginals for expected agreement (Cohen 1960);
 * weighted variant per Cohen (1968) with Fleiss/Cohen/Everitt (1969) SE.
 *
 * @param {Array} a First rater's ratings, length N.
 * @param {Array} b Second rater's ratings, length N (same order as a).
 * @param {object} opts {levels: Array, weights: null|'linear'|'quadratic', alpha: number}
 * @returns {{kappa: number, se: number, ci95: [number, number], method: string, confusion: number[][], levels: Array}}
 */
export function cohenKappa(a, b, opts) {
  const levels = opts.levels;
  const k = levels.length;
  const idx = new Map(levels.map((v, i) => [v, i]));
  const cm = Array.from({ length: k }, () => new Array(k).fill(0));
  const N = a.length;
  for (let i = 0; i < N; i++) cm[idx.get(a[i])][idx.get(b[i])]++;

  // Gewichts-Matrix (Identität wenn unweighted)
  const w = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    if (opts.weights === 'linear')         w[i][j] = 1 - Math.abs(i - j) / (k - 1);
    else if (opts.weights === 'quadratic') w[i][j] = 1 - ((i - j) / (k - 1)) ** 2;
    else                                   w[i][j] = i === j ? 1 : 0;
  }
  const row = cm.map(r => r.reduce((s, v) => s + v, 0) / N);
  const col = new Array(k).fill(0);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) col[j] += cm[i][j] / N;

  let po = 0, pe = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    po += w[i][j] * cm[i][j] / N;
    pe += w[i][j] * row[i] * col[j];
  }
  const kappa = pe < 1 ? (po - pe) / (1 - pe) : 1;
  // Fleiss/Cohen/Everitt (1969) — Standard-SE für (un)gewichtete κ auf Basis
  // der beobachteten Übereinstimmung; deckt sich mit sklearns z-KI-Formel.
  const se = pe < 1 ? Math.sqrt(po * (1 - po) / (N * (1 - pe) ** 2)) : 0;
  const z = zQuantile(1 - opts.alpha / 2);
  const method = opts.weights ? `weighted-${opts.weights}` : 'cohen';
  return {
    kappa, se,
    ci95: [kappa - z * se, kappa + z * se],
    method,
    confusion: cm,
    levels: levels.slice(),
  };
}

/**
 * Standard-normal inverse (Φ^-1) via Peter J. Acklam's approximation.
 * Ausreichend genau für α ∈ [0.001, 0.999]; Fehler < 1e-9 im Zentrum.
 * @param {number} p Wahrscheinlichkeit ∈ (0, 1)
 * @returns {number}
 */
function zQuantile(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= ph) {
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

/**
 * Fleiss kappa (≥ 2 rater, N categories). Auto-switches to Randolph's
 * free-marginal formulation when rater-count per subject varies.
 *
 * Balanced (constant n_i·):
 *   P_i = (Σ_j n_ij² − n_i·) / (n_i· (n_i· − 1))
 *   P̄ = mean(P_i);  p̄_j = Σ_i n_ij / (N · n̄);  P_e = Σ_j p̄_j²
 *   κ = (P̄ − P_e) / (1 − P_e)   — Fleiss 1971 SE geschlossen.
 *
 * Unbalanced:
 *   Randolph free-marginal: P_e = 1/k → κ = (K·P̄ − 1) / (K − 1),
 *   angewandt via allgemeiner Form (P̄ − 1/k) / (1 − 1/k). Kein
 *   geschlossener SE-Ausdruck → se/ci95 = NaN. Matches the same
 *   convention the fixture generator uses (`randolph` method).
 *
 * @param {Map<any, Array>} byPart Bewertungen je Teil (Rater-Dimension flach).
 * @param {object} opts {levels, alpha}
 * @returns {{kappa: number, se: number, ci95: [number, number], method: string}}
 */
export function fleissKappa(byPart, opts) {
  const { levels, alpha } = opts;
  const k = levels.length;
  const idx = new Map(levels.map((v, i) => [v, i]));
  const parts = [...byPart.keys()];
  const N = parts.length;
  const table = parts.map(p => {
    const row = new Array(k).fill(0);
    for (const v of byPart.get(p)) row[idx.get(v)]++;
    return row;
  });
  const rowSums = table.map(r => r.reduce((s, v) => s + v, 0));
  const balanced = rowSums.every(s => s === rowSums[0]);
  const method = balanced ? 'fleiss-1971' : 'randolph';

  let kappa, se = NaN, ci95 = [NaN, NaN];
  if (balanced) {
    const n = rowSums[0];
    const P_i = table.map(row => {
      const sq = row.reduce((s, v) => s + v * v, 0);
      return (sq - n) / (n * (n - 1));
    });
    const P_bar = P_i.reduce((s, v) => s + v, 0) / N;
    const p_j = new Array(k).fill(0);
    for (let i = 0; i < N; i++) for (let j = 0; j < k; j++) p_j[j] += table[i][j] / (N * n);
    const P_e = p_j.reduce((s, v) => s + v * v, 0);
    kappa = P_e < 1 ? (P_bar - P_e) / (1 - P_e) : 1;

    // Fleiss 1971 SE (approximate, unter H0 κ=0).
    // Referenz: Fleiss, Levin & Paik (2003) "Statistical Methods for Rates
    // and Proportions", 3rd ed., §18.2 — Formel (18.8).
    const sq2 = p_j.reduce((s, v) => s + v * v, 0);
    const sq3 = p_j.reduce((s, v) => s + v * v * v, 0);
    const varK = (2 / (N * n * (n - 1))) *
                 (sq2 - (2 * n - 3) * sq2 * sq2 + 2 * (n - 2) * sq3) /
                 ((1 - sq2) ** 2);
    se = Math.sqrt(varK);
    const z = zQuantile(1 - alpha / 2);
    ci95 = [kappa - z * se, kappa + z * se];
  } else {
    // Randolph: uniform marginal → P_e = 1/k
    const P_i = table.map((row, i) => {
      const n = rowSums[i];
      if (n < 2) return NaN;
      const sq = row.reduce((s, v) => s + v * v, 0);
      return (sq - n) / (n * (n - 1));
    }).filter(Number.isFinite);
    const P_bar = P_i.reduce((s, v) => s + v, 0) / P_i.length;
    const P_e = 1 / k;
    kappa = (P_bar - P_e) / (1 - P_e);
  }
  return { kappa, se, ci95, method };
}

/**
 * Wilson-Score-Konfidenzintervall für einen Anteil.
 * Randfall-sicher: k=0 → [0, obere Grenze], k=N → [untere Grenze, 1], n=0 → [0, 0].
 * @param {number} k Erfolge.
 * @param {number} n Versuche.
 * @param {number} alpha Signifikanzniveau (Default 0.05).
 * @returns {{rate: number, ci95: [number, number]}}
 */
export function wilsonCI(k, n, alpha = 0.05) {
  if (n === 0) return { rate: 0, ci95: [0, 0] };
  const z = zQuantile(1 - alpha / 2);
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / n + (z * z) / (4 * n * n)) / denom;
  return { rate: p, ci95: [Math.max(0, centre - half), Math.min(1, centre + half)] };
}

/**
 * Effektivität je Prüfer: Anteil Bewertungen, die mit der Referenz übereinstimmen.
 * Teile in `opts.ambiguousParts` werden übersprungen.
 * @param {Array<{part, appraiser, rep, value}>} ratings
 * @param {Object<any, any>} references {[part]: value}
 * @param {object} opts {alpha, ambiguousParts?}
 * @returns {{perAppraiser: Object<string, {agree:number, total:number, rate:number, ci95:[number,number]}>}}
 */
export function effectiveness(ratings, references, opts) {
  const ambig = new Set(opts.ambiguousParts || []);
  const per = {};
  for (const r of ratings) {
    if (ambig.has(r.part) || references[r.part] === undefined) continue;
    if (!per[r.appraiser]) per[r.appraiser] = { agree: 0, total: 0 };
    per[r.appraiser].total++;
    if (r.value === references[r.part]) per[r.appraiser].agree++;
  }
  const out = {};
  for (const [a, { agree, total }] of Object.entries(per)) {
    const w = wilsonCI(agree, total, opts.alpha);
    out[a] = { agree, total, rate: w.rate, ci95: w.ci95 };
  }
  return { perAppraiser: out };
}

/**
 * Miss-Rate, False-Alarm-Rate und Bias je Prüfer — nur binär mit Referenz.
 * Konvention (Spec §4): positiv = levels[0].
 *   miss = P(rating = pos | ref = neg)   — n.i.O. als i.O. eingestuft.
 *   fa   = P(rating = neg | ref = pos)   — i.O. als n.i.O. eingestuft.
 *   bias = miss − fa                     — > 0: zu tolerant.
 * Teile in `opts.ambiguousParts` werden übersprungen.
 * @param {Array} ratings
 * @param {Object} references
 * @param {object} opts {positive, alpha, ambiguousParts?}
 * @returns {{perAppraiser: Object<string, {missRate, falseAlarmRate, biasRate}>}}
 */
export function missAndFA(ratings, references, opts) {
  const { positive, alpha } = opts;
  const ambig = new Set(opts.ambiguousParts || []);
  const per = {};
  for (const r of ratings) {
    if (ambig.has(r.part) || references[r.part] === undefined) continue;
    const key = r.appraiser;
    if (!per[key]) per[key] = { missNum: 0, missDen: 0, faNum: 0, faDen: 0 };
    const refPos = references[r.part] === positive;
    const ratPos = r.value === positive;
    if (!refPos) { per[key].missDen++; if (ratPos)  per[key].missNum++; }
    if (refPos)  { per[key].faDen++;   if (!ratPos) per[key].faNum++;   }
  }
  const out = {};
  for (const [a, v] of Object.entries(per)) {
    const miss = wilsonCI(v.missNum, v.missDen, alpha);
    const fa   = wilsonCI(v.faNum,   v.faDen,   alpha);
    out[a] = {
      missRate:       { rate: miss.rate, ci95: miss.ci95 },
      falseAlarmRate: { rate: fa.rate,   ci95: fa.ci95   },
      biasRate:       { value: miss.rate - fa.rate },
    };
  }
  return { perAppraiser: out };
}

/**
 * Signal Detection Theory: d' (Sensitivität) und Kriterium c (Bias) je Prüfer.
 * Log-Linear-Korrektur nach Hautus (1995) bei hit ∈ {0, N⁺} oder fa ∈ {0, N⁻}
 * (+0.5/N-Adjustierung), damit d' und c bei Randfällen endlich bleiben.
 *
 *   hit = P(rating = pos | ref = pos)
 *   fa  = P(rating = pos | ref = neg)
 *   d′  = Φ⁻¹(hit) − Φ⁻¹(fa)
 *   c   = −½ · (Φ⁻¹(hit) + Φ⁻¹(fa))
 *
 * @param {Array} ratings Long-Format.
 * @param {Object} references {[part]: value}
 * @param {object} opts {positive}
 * @returns {{perAppraiser: Object<string, {dPrime:number, criterion:number, hitRate:number, falseAlarmRate:number}>}}
 */
export function signalDetection(ratings, references, opts) {
  const { positive } = opts;
  const per = {};
  for (const r of ratings) {
    if (references[r.part] === undefined) continue;
    if (!per[r.appraiser]) per[r.appraiser] = { hits: 0, nPos: 0, fas: 0, nNeg: 0 };
    const refPos = references[r.part] === positive;
    const ratPos = r.value === positive;
    if (refPos)  { per[r.appraiser].nPos++; if (ratPos) per[r.appraiser].hits++; }
    else         { per[r.appraiser].nNeg++; if (ratPos) per[r.appraiser].fas++;  }
  }
  const out = {};
  for (const [a, v] of Object.entries(per)) {
    // Hautus (1995) Log-Linear-Korrektur — nur bei Randfällen anwenden.
    const h = (v.hits === 0 || v.hits === v.nPos)
      ? (v.hits + 0.5) / (v.nPos + 1)
      : v.hits / v.nPos;
    const f = (v.fas === 0 || v.fas === v.nNeg)
      ? (v.fas + 0.5) / (v.nNeg + 1)
      : v.fas / v.nNeg;
    const zh = zQuantile(h);
    const zf = zQuantile(f);
    const dPrime    = zh - zf;
    const criterion = -0.5 * (zh + zf);
    out[a] = { dPrime, criterion, hitRate: h, falseAlarmRate: f };
  }
  return { perAppraiser: out };
}

/**
 * Konsens-Referenz je Teil aus allen Bewertungen aller Prüfer × Wiederholungen ableiten.
 * - Binär/Nominal: Mehrheitsvotum (Mode); Gleichstand → Teil landet in ambiguousParts.
 * - Ordinal: Median (ordinal-Skala). Bei gerader Anzahl mit ungleichen Mittelwerten
 *   entscheidet der Mode als Tie-Breaker; ist auch der ambig → Teil in ambiguousParts.
 *
 * @param {Array<{part, value, ...}>} ratings Long-Format.
 * @param {object} opts {type: 'binary'|'nominal'|'ordinal', levels}
 * @returns {{consensus: Object<any, any>, ambiguousParts: Array}}
 */
export function deriveConsensus(ratings, opts) {
  const { type, levels } = opts;
  const byPart = new Map();
  for (const r of ratings) {
    if (!byPart.has(r.part)) byPart.set(r.part, []);
    byPart.get(r.part).push(r.value);
  }
  const consensus = {};
  const ambig = [];
  for (const [part, vals] of byPart) {
    if (type === 'ordinal') {
      const srt = vals.slice().sort((x, y) => levels.indexOf(x) - levels.indexOf(y));
      const mid = Math.floor(srt.length / 2);
      if (srt.length % 2 === 1) {
        consensus[part] = srt[mid];
      } else {
        const lo = srt[mid - 1], hi = srt[mid];
        if (lo === hi) {
          consensus[part] = lo;
        } else {
          const modeRes = _mode(vals);
          if (modeRes.tied) ambig.push(part);
          else consensus[part] = modeRes.value;
        }
      }
    } else {
      const modeRes = _mode(vals);
      if (modeRes.tied) ambig.push(part);
      else consensus[part] = modeRes.value;
    }
  }
  return { consensus, ambiguousParts: ambig.sort() };
}

/**
 * Mode einer Werteliste. Bei Gleichstand mehrerer Kandidaten → tied = true.
 * @param {Array} values
 * @returns {{value: any, tied: boolean}}
 * @internal
 */
function _mode(values) {
  const c = new Map();
  for (const v of values) c.set(v, (c.get(v) || 0) + 1);
  let best = -1, winner = null, tied = false;
  for (const [v, n] of c) {
    if (n > best)      { best = n; winner = v; tied = false; }
    else if (n === best) tied = true;
  }
  return { value: winner, tied };
}

/**
 * Vollständige Analyse-Orchestrierung gemäß Spec §4.
 * Kombiniert Validierung → Referenz-Ableitung → Wiederholbarkeit, Effektivität,
 * Miss/FA, paarweise Cohen κ, Fleiss κ, Signal Detection und AIAG-Ampel.
 *
 * @param {object} input {type, levels, ratings, references?, params?}
 * @returns {object} Analyse-Objekt (Return-Shape siehe Spec §4).
 */
export function analyze(input) {
  const val = validate(input);
  if (!val.valid) {
    return { meta: { errors: val.errors, warnings: val.warnings } };
  }
  const { type, levels, ratings } = input;
  const params = input.params || {};
  const alpha = params.alpha ?? 0.05;
  const weights = params.weights ?? 'quadratic';
  const warnings = [...val.warnings];

  // ─── Referenz-Ableitung ───
  let references = input.references;
  let referenceSource;
  let ambiguousParts = [];
  if (references && typeof references === 'object' && Object.keys(references).length > 0) {
    referenceSource = 'given';
  } else if (references === null || references === undefined) {
    const c = deriveConsensus(ratings, { type, levels });
    references = c.consensus;
    ambiguousParts = c.ambiguousParts;
    referenceSource = 'consensus';
    if (ambiguousParts.length > 0) {
      warnings.push({ code: WARN.AMBIGUOUS_CONSENSUS, params: { count: ambiguousParts.length, parts: ambiguousParts } });
    }
  } else {
    referenceSource = 'none';
  }

  const appraisers = [...new Set(ratings.map(r => r.appraiser))].sort();
  const parts = [...new Set(ratings.map(r => r.part))];
  const hasReference = references && Object.keys(references).length > 0;

  // ─── Wiederholbarkeit je Prüfer ───
  const perAppr = {};
  for (const a of appraisers) {
    const rep = _repeatabilityFor(ratings, a, alpha);
    perAppr[a] = { ...rep };
  }

  // ─── Effektivität, Miss/FA, κ vs. Referenz ───
  if (hasReference) {
    const eff = effectiveness(ratings, references, { alpha, ambiguousParts });
    for (const a of appraisers) {
      if (!perAppr[a].vsReference) perAppr[a].vsReference = {};
      if (eff.perAppraiser[a]) perAppr[a].vsReference.effectiveness = eff.perAppraiser[a];
    }
    if (type === 'binary') {
      const mf = missAndFA(ratings, references, { positive: levels[0], alpha, ambiguousParts });
      for (const a of appraisers) {
        if (mf.perAppraiser[a]) Object.assign(perAppr[a].vsReference, mf.perAppraiser[a]);
      }
    }
    // κ je Prüfer vs. Referenz
    for (const a of appraisers) {
      const aVals = [], rVals = [];
      for (const r of ratings) {
        if (r.appraiser !== a) continue;
        if (ambiguousParts.includes(r.part)) continue;
        if (references[r.part] === undefined) continue;
        aVals.push(r.value); rVals.push(references[r.part]);
      }
      if (aVals.length > 0) {
        const kOpts = type === 'ordinal'
          ? { levels, weights, alpha }
          : { levels, weights: null, alpha };
        const kappaObj = cohenKappa(aVals, rVals, kOpts);
        perAppr[a].vsReference.kappa = {
          kappa: kappaObj.kappa,
          se: kappaObj.se,
          ci95: kappaObj.ci95,
          method: kappaObj.method,
        };
        perAppr[a].confusionMatrix = {
          rows: levels.slice(),
          cols: levels.slice(),
          counts: kappaObj.confusion,
        };
      }
    }
  }

  // ─── Zwischen Prüfern: paarweise Cohen κ + Fleiss κ ───
  const pairwise = {};
  for (let i = 0; i < appraisers.length; i++) {
    for (let j = i + 1; j < appraisers.length; j++) {
      const A = appraisers[i], B = appraisers[j];
      const { aVals, bVals } = _pairAligned(ratings, A, B, parts);
      if (aVals.length === 0) continue;
      const kOpts = type === 'ordinal'
        ? { levels, weights, alpha }
        : { levels, weights: null, alpha };
      const kappaObj = cohenKappa(aVals, bVals, kOpts);
      pairwise[`${A}|${B}`] = {
        kappa: kappaObj.kappa,
        se: kappaObj.se,
        ci95: kappaObj.ci95,
        method: kappaObj.method,
        confusion: { rows: levels.slice(), cols: levels.slice(), counts: kappaObj.confusion },
      };
    }
  }

  // Fleiss κ (alle Prüfer × Wiederholungen)
  const byPart = new Map();
  for (const p of parts) byPart.set(p, ratings.filter(r => r.part === p).map(r => r.value));
  const fleiss = fleissKappa(byPart, { levels, alpha });

  // Signal Detection (nur binär mit Referenz)
  let sd = null;
  if (type === 'binary' && hasReference) {
    sd = signalDetection(ratings, references, { positive: levels[0] });
  }

  // ─── Verdikt-Ampel (AIAG MSA 4th Ed., Kap. III-B) ───
  const effRates = Object.values(perAppr)
    .map(x => x.vsReference?.effectiveness?.rate)
    .filter(Number.isFinite);
  const minEff = effRates.length ? Math.min(...effRates) : null;
  const kappaVal = Number.isFinite(fleiss.kappa) ? fleiss.kappa : null;

  let level, driver;
  if (kappaVal !== null && kappaVal >= 0.75 && (minEff === null || minEff >= 0.90)) {
    level = 'good';
    driver = 'fleissKappa';
  } else if ((kappaVal !== null && kappaVal < 0.40) || (minEff !== null && minEff < 0.80)) {
    level = 'unacceptable';
    driver = (kappaVal !== null && kappaVal < 0.40) ? 'fleissKappa' : 'effectiveness';
  } else {
    level = 'marginal';
    driver = (minEff !== null && minEff < 0.90) ? 'effectiveness' : 'fleissKappa';
  }

  // ─── reps: höchste (part×appraiser)-Wiederholungszahl im Datensatz ───
  const repMap = new Map();
  for (const r of ratings) {
    const key = `${r.part}|${r.appraiser}`;
    repMap.set(key, (repMap.get(key) || 0) + 1);
  }
  const reps = repMap.size > 0 ? Math.max(...repMap.values()) : 0;

  return {
    meta: {
      type,
      levels: levels.slice(),
      parts: parts.length,
      appraisers: appraisers.length,
      reps,
      referenceSource,
      ambiguousParts,
      warnings,
    },
    perAppraiser: perAppr,
    betweenAppraisers: {
      pairwiseCohenKappa: pairwise,
      fleissKappa: fleiss,
    },
    signalDetection: sd,
    verdict: {
      level,
      driver,
      thresholds: { kappaGood: 0.75, kappaMarginal: 0.40, effectivenessGood: 0.90, effectivenessMarginal: 0.80 },
    },
    interpretation: {
      textKey: `modules.msa-typ5.interp_${level}`,
      params: {
        kappa: kappaVal !== null ? kappaVal.toFixed(3) : '—',
        minEff: minEff !== null ? (minEff * 100).toFixed(1) : '—',
      },
    },
  };
}

/**
 * Wiederholbarkeit für einen Prüfer: Anteil (Teil, Prüfer)-Kombinationen mit ≥ 2
 * Wiederholungen, an denen alle Wiederholungen gleich bewertet wurden. Wilson-KI 95 %.
 * @param {Array} ratings
 * @param {string} appraiser
 * @param {number} alpha
 * @returns {object} {repeatability?: {agree, total, rate, ci95}}
 * @internal
 */
function _repeatabilityFor(ratings, appraiser, alpha) {
  const byPart = new Map();
  for (const r of ratings) {
    if (r.appraiser !== appraiser) continue;
    if (!byPart.has(r.part)) byPart.set(r.part, []);
    byPart.get(r.part).push(r.value);
  }
  let agree = 0, total = 0;
  for (const [, vals] of byPart) {
    if (vals.length < 2) continue;
    total++;
    if (vals.every(v => v === vals[0])) agree++;
  }
  if (total === 0) return {};    // Prüfer hat nur single-reps → W_LOW_REP_COUNT deckt es ab
  const w = wilsonCI(agree, total, alpha);
  return { repeatability: { agree, total, rate: w.rate, ci95: w.ci95 } };
}

/**
 * Zwei-Prüfer-Ausrichtung: kürzt je Teil auf die minimale gemeinsame Wiederholungszahl.
 * @param {Array} ratings
 * @param {string} A
 * @param {string} B
 * @param {Array} parts
 * @returns {{aVals: Array, bVals: Array}}
 * @internal
 */
function _pairAligned(ratings, A, B, parts) {
  const aVals = [], bVals = [];
  for (const p of parts) {
    const ar = ratings.filter(r => r.part === p && r.appraiser === A).map(r => r.value);
    const br = ratings.filter(r => r.part === p && r.appraiser === B).map(r => r.value);
    const n = Math.min(ar.length, br.length);
    for (let i = 0; i < n; i++) { aVals.push(ar[i]); bVals.push(br[i]); }
  }
  return { aVals, bVals };
}
