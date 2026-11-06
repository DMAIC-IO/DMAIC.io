/**
 * D.Mike — Hypothesentest: Paarvergleiche nach der k-Gruppen-Prüfung
 * (domain/posthoc.js). Reine Rechnung auf den Engines.
 */
import {
  fTest, leveneTest, mannWhitneyU, hodgesLehmann, tukeyHSD, gamesHowell,
} from '../../../engines/hypothesis-test-engine.js';

/**
 * Simultaneous all-pairs comparisons for the parametric k-group routes:
 * Tukey HSD with Fisher, Games-Howell with Welch. Throws when the
 * engine does (zero variance, n_i < 2).
 * @param {number[][]} groups
 * @param {number} alpha
 * @param {'fisher'|'welch'} meanTest
 */
export function simultaneousPairwise(groups, alpha, meanTest) {
  const res = meanTest === 'fisher' ? tukeyHSD(groups, alpha) : gamesHowell(groups, alpha);
  const comparisons = res.comparisons.map(c => ({
    i: c.i, j: c.j, p: null, pAdj: c.pAdj, ci: c.ci, equal: c.pAdj >= alpha,
  }));
  const letters = compactLetterDisplay(groups.length, comparisons);
  return { comparisons, letters, m: comparisons.length, methodName: res.testName, isRank: false, simultaneous: true };
}

/**
 * Bonferroni-Paarvergleiche: Varianzfragen und der Rangweg.
 * @param {number[][]} groups
 * @param {number} alpha
 * @param {boolean} isVariance
 * @param {boolean} isNormal
 */
export function bonferroniPairwise(groups, alpha, isVariance, isNormal) {
  const k = groups.length;
  const m = k * (k - 1) / 2;
  const methodName = isVariance
    ? (isNormal ? 'F-Test' : 'Levene Test (Brown-Forsythe)')
    : 'Mann-Whitney U Test';

  const comparisons = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      let r;
      if (isVariance) {
        r = isNormal ? fTest(groups[i], groups[j], 'two-sided', alpha) : leveneTest(groups[i], groups[j], alpha);
      } else {
        r = mannWhitneyU(groups[i], groups[j], 'two-sided', alpha);
      }
      const p = r.pValue;
      const pAdj = Math.min(1, p * m);
      // Bonferroni Hodges-Lehmann CI of the shift at alpha/m (rank path)
      let ci = null;
      if (!isVariance) {
        const hl = hodgesLehmann(groups[i], groups[j], alpha / m);
        ci = [hl.lower, hl.upper];
      }
      comparisons.push({ i, j, p, pAdj, ci, equal: pAdj >= alpha });
    }
  }
  const letters = compactLetterDisplay(k, comparisons);
  return { comparisons, letters, m, methodName, isRank: !isVariance, simultaneous: false };
}

/**
 * Buchstaben für gleichwertige Gruppen (maximale Cliquen der Gleichheitsrelation).
 * @param {number} k Anzahl Gruppen
 * @param {{i:number,j:number,equal:boolean}[]} comparisons
 * @returns {string[]}
 */
export function compactLetterDisplay(k, comparisons) {
  const adj = Array.from({ length: k }, () => new Set());
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) adj[i].add(j);
  for (const c of comparisons) {
    if (!c.equal) { adj[c.i].delete(c.j); adj[c.j].delete(c.i); }
  }
  const cliques = [];
  const bk = (R, P, X) => {
    if (P.size === 0 && X.size === 0) { cliques.push([...R].sort((a, b) => a - b)); return; }
    for (const v of [...P]) {
      const N = adj[v];
      bk(new Set([...R, v]), new Set([...P].filter(x => N.has(x))), new Set([...X].filter(x => N.has(x))));
      P.delete(v); X.add(v);
    }
  };
  bk(new Set(), new Set(Array.from({ length: k }, (_, i) => i)), new Set());
  const seen = new Set();
  const unique = [];
  for (const c of cliques) {
    const key = c.join(',');
    if (!seen.has(key)) { seen.add(key); unique.push(c); }
  }
  unique.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
  const letters = Array.from({ length: k }, () => '');
  for (let c = 0; c < unique.length; c++) {
    const letter = String.fromCharCode(97 + c);
    for (const v of unique[c]) letters[v] += letter;
  }
  for (let i = 0; i < k; i++) {
    if (letters[i] === '') letters[i] = String.fromCharCode(97 + unique.length + i);
  }
  return letters;
}
