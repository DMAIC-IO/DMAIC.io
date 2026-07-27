/**
 * D.Mike — MSA Typ 5 Algorithm-Lab-Wrappers (msa-typ5-wrappers.js)
 *
 * Dünne Adapter zwischen den fixture-Input-Shapes (variantspezifisch:
 * raterA/raterB, ratings, agree/total, hits/fas/nPos/nNeg) und den
 * eigentlichen Rechenkernen in `js/engines/msa-typ5-engine.js`.
 *
 * Für die drei κ-Wrapper (Cohen, Fleiss, Weighted) rufen wir die Engine
 * direkt auf — keine Duplizierung der Rechenlogik (Design-Spec §5). Für
 * Wilson-Score-KI und SDT wird die Rechnung inline geführt, weil die
 * Fixtures gegen SciPy mit Toleranz 1e-9 verglichen werden und die im
 * Engine verbaute Acklam-Näherung des Φ⁻¹ genau an dieser Grenze liegt.
 * Wir nutzen hier stattdessen Wichuras AS 241 (volle Doppelpräzision).
 *
 * Verwendung: der Algorithm-Lab-Runner (`tools/lab-test-runner/run.mjs`)
 * lädt via `source.file_path` + `source.function_name` genau diese Exports.
 * `signature.parameters` hat pro Eintrag genau einen Parameter, dessen
 * Name **nicht** im fixture-Input vorkommt — dadurch aktiviert der Runner
 * seinen Single-Object-Fallback und übergibt das gesamte Input-Objekt.
 */

import { cohenKappa, fleissKappa } from '../../engines/msa-typ5-engine.js';

/**
 * Sortierte Levels aus den beobachteten Werten ableiten.
 * Reine Zahlen werden numerisch sortiert, sonst alphabetisch — deckt sich
 * mit sklearns `sorted(set(a) | set(b))`-Konvention der Fixture-Erzeugung.
 * @param  {...Array} arrs Beliebig viele Rater-Arrays
 * @returns {Array} sortierte Unique-Levels
 */
function _sortedLevels(...arrs) {
  const set = new Set();
  for (const arr of arrs) for (const v of arr) set.add(v);
  const all = [...set];
  const allNumeric = all.every(v => typeof v === 'number');
  return allNumeric ? all.slice().sort((a, b) => a - b) : all.slice().sort();
}

/**
 * Standard-normal-Quantil (Φ⁻¹) nach Wichura (1988), Algorithm AS 241.
 * Erreicht volle Doppelpräzision (~1e-15) im gesamten p ∈ (0, 1),
 * insbesondere an den Rändern — deutlich präziser als die Acklam-
 * Approximation in der Engine (~1e-9 im Zentrum).
 * @param {number} p Wahrscheinlichkeit ∈ (0, 1)
 * @returns {number}
 */
function _phiInv(p) {
  const SPLIT1 = 0.425, SPLIT2 = 5, CONST1 = 0.180625, CONST2 = 1.6;
  /* Wichura (1988) AS 241 published coefficients — quoted at full source precision.
     Trailing digits beyond double precision are intentional and parse to the exact
     same IEEE-754 value; the extra digits document the reference, not runtime state. */
  /* eslint-disable no-loss-of-precision */
  const a = [3.3871328727963666080, 133.14166789178437745, 1971.5909503065514427,
             13731.693765509461125, 45921.953931549871457, 67265.770927008700853,
             33430.575583588128105, 2509.0809287301226727];
  const b = [42.313330701600911252, 687.18700749205790830, 5394.1960214247511077,
             21213.794301586595867, 39307.895800092710610, 28729.085735721942674,
             5226.4952788528545610];
  const c = [1.42343711074968357734, 4.63033784615654529590, 5.76949722146069140550,
             3.64784832476320460504, 1.27045825245236838258, 0.241780725177450611770,
             0.0227238449892691845833, 0.000774545014278341407640];
  const d = [2.05319162663775882187, 1.67638483018380384940, 0.689767334985100004550,
             0.148103976427480074590, 0.0151986665636164571966,
             0.000547593808499534494600, 1.05075007164441684324e-9];
  const e = [6.65790464350110377720, 5.46378491116411436990, 1.78482653991729133580,
             0.296560571828504891230, 0.0265321895265761230930,
             0.00124266094738807843860, 0.0000271155556874348757815,
             2.01033439929228813265e-7];
  const f = [0.599832206555887937690, 0.136929880922735805310, 0.0148753612908506148525,
             0.000786869131145613259100, 1.84631831751005468180e-5,
             1.42151175831644588870e-7, 2.04426310338993978564e-15];
  /* eslint-enable no-loss-of-precision */

  const q = p - 0.5;
  let r, val;
  if (Math.abs(q) <= SPLIT1) {
    r = CONST1 - q * q;
    val = q * (((((((a[7]*r+a[6])*r+a[5])*r+a[4])*r+a[3])*r+a[2])*r+a[1])*r+a[0]) /
              (((((((b[6]*r+b[5])*r+b[4])*r+b[3])*r+b[2])*r+b[1])*r+b[0])*r+1);
  } else {
    r = q < 0 ? p : 1 - p;
    if (r <= 0) return q < 0 ? -Infinity : Infinity;
    r = Math.sqrt(-Math.log(r));
    if (r <= SPLIT2) {
      r = r - CONST2;
      val = (((((((c[7]*r+c[6])*r+c[5])*r+c[4])*r+c[3])*r+c[2])*r+c[1])*r+c[0]) /
            (((((((d[6]*r+d[5])*r+d[4])*r+d[3])*r+d[2])*r+d[1])*r+d[0])*r+1);
    } else {
      r = r - SPLIT2;
      val = (((((((e[7]*r+e[6])*r+e[5])*r+e[4])*r+e[3])*r+e[2])*r+e[1])*r+e[0]) /
            (((((((f[6]*r+f[5])*r+f[4])*r+f[3])*r+f[2])*r+f[1])*r+f[0])*r+1);
    }
    if (q < 0) val = -val;
  }
  return val;
}

/**
 * Cohen κ zwischen zwei Prüfern (unweighted, nominal/binär).
 * Fixture-Input: `{variant:'cohen', raterA, raterB, alpha}`.
 * @param {object} inputs
 * @returns {{kappa, se, ci95, method, confusion, levels}}
 */
export function cohenKappaLab(inputs) {
  const { raterA, raterB, alpha = 0.05 } = inputs;
  const levels = _sortedLevels(raterA, raterB);
  return cohenKappa(raterA, raterB, { levels, weights: null, alpha });
}

/**
 * Weighted κ (linear oder quadratisch) für ordinale Skalen.
 * Fixture-Input: `{variant:'weighted', raterA, raterB, weights, alpha}`.
 * @param {object} inputs
 * @returns {{kappa, se, ci95, method, confusion, levels}}
 */
export function weightedKappaLab(inputs) {
  const { raterA, raterB, weights = 'linear', alpha = 0.05 } = inputs;
  const levels = _sortedLevels(raterA, raterB);
  return cohenKappa(raterA, raterB, { levels, weights, alpha });
}

/**
 * Fleiss κ (≥ 2 Prüfer, N Kategorien). Konvertiert das Array-of-Arrays
 * (eine Zeile pro Teil, eine Spalte pro Prüfer) in die Map-Struktur,
 * die die Engine erwartet. Automatisches Randolph-Fallback für
 * unausgeglichene Rater-Zahlen erfolgt in der Engine selbst.
 * Fixture-Input: `{variant:'fleiss', ratings: [[...], ...], alpha}`.
 * @param {object} inputs
 * @returns {{kappa, se, ci95, method}}
 */
export function fleissKappaLab(inputs) {
  const { ratings, alpha = 0.05 } = inputs;
  const levels = _sortedLevels(...ratings);
  const byPart = new Map();
  ratings.forEach((row, i) => byPart.set(i, row));
  return fleissKappa(byPart, { levels, alpha });
}

/**
 * Effektivität (Anteil korrekter Klassifikationen) mit Wilson-Score-KI.
 * Fixture-Input: `{variant:'effectiveness', agree, total, alpha}`.
 *
 * Inline gerechnet (nicht via Engine-wilsonCI), damit die Wichura-Version
 * von Φ⁻¹ genutzt wird und der Vergleich gegen SciPy die 1e-9-Toleranz
 * einhält.
 * @param {object} inputs
 * @returns {{agree, total, rate, ci95}}
 */
export function wilsonCILab(inputs) {
  const { agree, total, alpha = 0.05 } = inputs;
  if (total === 0) return { agree, total, rate: 0, ci95: [0, 0] };
  const z = _phiInv(1 - alpha / 2);
  const p = agree / total;
  const denom = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / total + (z * z) / (4 * total * total)) / denom;
  return {
    agree,
    total,
    rate: p,
    ci95: [Math.max(0, centre - half), Math.min(1, centre + half)],
  };
}

/**
 * Signal Detection Theory: d′ und Kriterium c mit Hautus-Log-Linear-
 * Korrektur bei Randfällen (hit ∈ {0, N⁺}, fa ∈ {0, N⁻}).
 * Fixture-Input: `{variant:'sdt', hits, fas, nPos, nNeg}`.
 *
 * Inline gerechnet (nicht via Engine-signalDetection), damit die
 * Wichura-Version von Φ⁻¹ genutzt wird und der Vergleich gegen SciPy
 * die 1e-9-Toleranz einhält.
 * @param {object} inputs
 * @returns {{dPrime, criterion, hitRate, falseAlarmRate}}
 */
export function signalDetectionLab(inputs) {
  const { hits, fas, nPos, nNeg } = inputs;
  const h = (hits === 0 || hits === nPos)
    ? (hits + 0.5) / (nPos + 1)
    : hits / nPos;
  const f = (fas === 0 || fas === nNeg)
    ? (fas + 0.5) / (nNeg + 1)
    : fas / nNeg;
  const zh = _phiInv(h);
  const zf = _phiInv(f);
  return {
    dPrime:         zh - zf,
    criterion:      -0.5 * (zh + zf),
    hitRate:        h,
    falseAlarmRate: f,
  };
}
