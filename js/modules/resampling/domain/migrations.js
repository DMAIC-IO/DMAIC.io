/**
 * D.Mike — Resampling: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js.
 */

const MODES = ['one', 'two', 'paired', 'k'];
const CONTRASTS = ['difference', 'ratio'];
const DIRECTIONS = ['two-sided', 'greater', 'less'];
const CI_METHODS = ['bca', 'percentile'];
const ALL = ['mean', 'median', 'stddev', 'variance', 'trimmedMean', 'quantile', 'cv', 'ppk'];
const STATS = { one: ALL, two: ALL, paired: ['mean', 'median', 'trimmedMean'], k: ALL.filter((s) => s !== 'ppk') };
const SEED_MAX = 2147483647;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isAbsent = (v) => v === null || v === undefined;
const hasCi = (v) => isObj(v) && isObj(v.ci);

/**
 * Gespeicherter Spaltenbezug oder null.
 * @param {any} r
 * @returns {object|null}
 */
function refOrNull(r) {
  if (r && typeof r === 'object' && r.instanceId != null && r.columnId != null) return { ...r };
  return null;
}

/**
 * Grenzen werden als Text eingegeben; Zahlen aus älteren Dateien werden Text.
 * @param {unknown} v
 * @returns {string}
 */
function limitText(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/**
 * Formprüfung eines gespeicherten Ergebnisses: genau das, was Darstellung und
 * Diagramme lesen. Alles andere wird verworfen, nie repariert.
 * @param {*} r
 * @returns {boolean}
 */
export function isValidResult(r) {
  if (!isObj(r) || typeof r.inputsHash !== 'string' || !MODES.includes(r.mode)) return false;
  if (!Array.isArray(r.labels) || !Array.isArray(r.n)) return false;
  const { boot, perm, k } = r;
  if (!isAbsent(boot) && !(isObj(boot) && isObj(boot.ci) && Array.isArray(boot.bins))) return false;
  if (!isAbsent(perm) && !(isObj(perm) && Array.isArray(perm.bins))) return false;
  if (!isAbsent(k)) {
    if (!isObj(k) || !Array.isArray(k.bins) || !Array.isArray(k.groups) || !Array.isArray(k.posthoc)) return false;
    if (!k.groups.every(hasCi) || !k.posthoc.every(hasCi)) return false;
  }
  return true;
}

/**
 * Ergebnis auf die bekannten Schlüssel zurückschneiden (gespeichert ohne `boot.decision`).
 * @param {any} r
 * @returns {object|null} null, wenn das Ergebnis nicht gültig ist
 */
export function normalizeResult(r) {
  if (!isValidResult(r)) return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const ivl = (ci) => ({ percentile: ci?.percentile ?? null, bca: ci?.bca ?? null, bcaFallback: ci?.bcaFallback === true });
  const bins = (b) => b.map((x) => ({ x0: x.x0, x1: x.x1, count: x.count }));
  return {
    inputsHash: r.inputsHash, mode: r.mode, statisticId: r.statisticId, contrast: r.contrast, direction: r.direction,
    confidence: r.confidence, B: r.B, seed: r.seed, labels: r.labels.map(String), n: r.n.slice(),
    boot: isAbsent(r.boot) ? null : { estimate: num(r.boot.estimate), se: num(r.boot.se), bias: num(r.boot.bias), ci: ivl(r.boot.ci), bins: bins(r.boot.bins) },
    perm: isAbsent(r.perm) ? null : { observed: num(r.perm.observed), pValue: num(r.perm.pValue), exact: r.perm.exact === true, permutations: r.perm.permutations, bins: bins(r.perm.bins) },
    k: isAbsent(r.k) ? null : {
      estimate: num(r.k.estimate), observed: num(r.k.observed), pValue: num(r.k.pValue), exact: r.k.exact === true,
      permutations: r.k.permutations, bins: bins(r.k.bins),
      groups: r.k.groups.map((g) => ({ estimate: num(g.estimate), ci: ivl(g.ci) })),
      posthoc: r.k.posthoc.map((h) => ({ i: h.i, j: h.j, contrast: num(h.contrast), ci: ivl(h.ci), pRaw: num(h.pRaw), pHolm: num(h.pHolm), exact: h.exact === true })),
    },
  };
}

/**
 * Altstand (ohne `_schema`) → 1.0: die Bereinigung des alten Laders.
 * Fehlende Schlüssel nimmt das Model als Vorgabe.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {Record<string, any>}
 */
export function from0(json) {
  const d = isObj(json) ? json : {};
  const out = {};
  if (MODES.includes(d.mode)) out.mode = d.mode;
  if (STATS[out.mode ?? 'one'].includes(d.statisticId)) out.statisticId = d.statisticId;
  const sp = isObj(d.statParams) ? d.statParams : {};
  out.statParams = {
    trim: typeof sp.trim === 'number' && sp.trim >= 0 && sp.trim < 0.5 ? sp.trim : 0.1,
    p: typeof sp.p === 'number' && sp.p > 0 && sp.p < 1 ? sp.p : 0.95,
    lsl: limitText(sp.lsl),
    usl: limitText(sp.usl),
  };
  if (CONTRASTS.includes(d.contrast)) out.contrast = d.contrast;
  if (DIRECTIONS.includes(d.direction)) out.direction = d.direction;
  if (typeof d.target === 'string') out.target = d.target;
  out.colRef1 = refOrNull(d.colRef1);
  out.colRef2 = refOrNull(d.colRef2);
  out.colRefsK = Array.isArray(d.colRefsK) ? d.colRefsK.map(refOrNull).filter(Boolean) : [];
  if (Number.isInteger(d.B) && d.B > 0) out.B = d.B;
  if (Number.isInteger(d.seed) && d.seed >= 0 && d.seed <= SEED_MAX) out.seed = d.seed;
  if (typeof d.confidence === 'number' && d.confidence > 0 && d.confidence < 1) out.confidence = d.confidence;
  if (CI_METHODS.includes(d.ciMethod)) out.ciMethod = d.ciMethod;
  out.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;
  out.result = normalizeResult(d.result);
  return out;
}
