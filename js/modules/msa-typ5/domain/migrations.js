/**
 * D.Mike — MSA Typ 5: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/**
 * Zahl aus einem alten Parameter: endliche Zahl oder Text mit Dezimalpunkt
 * oder -komma; Leeres und Ungültiges werden null.
 * @param {unknown} v
 * @returns {number|null}
 */
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Spaltenbezug aus persistiertem JSON, oder null.
 * @param {any} d
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refFrom(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return { instanceId: String(d.instanceId), sheetId: String(d.sheetId), columnId: String(d.columnId) };
}

/** @param {unknown} v @param {readonly string[]} allowed @returns {string|null} */
function pick(v, allowed) {
  return allowed.includes(/** @type {string} */ (v)) ? /** @type {any} */ (v) : null;
}

/**
 * '0→1.0': Altform ohne `_schema` — `params` (Texte oder Zahlen) und `columns`
 * werden zu flachen Feldern. Unbekannte Auswahlwerte, ein ungültiges `alpha`
 * und ungültige `trials` entfallen, dann greift die Vorgabe. `ordinalOrder`
 * entfällt ersatzlos.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {Record<string, any>} Zustand im Formatstand 1.0
 */
export function from0(json) {
  const p = json.params && typeof json.params === 'object' ? json.params : {};
  const c = json.columns && typeof json.columns === 'object' ? json.columns : {};
  const out = {};
  const type = pick(p.type, ['binary', 'nominal', 'ordinal']);
  const weights = pick(p.weights, ['linear', 'quadratic']);
  const ruleSet = pick(p.ruleSet, ['aiag', 'bosch']);
  const layout = pick(p.layout, ['long', 'wide']);
  if (type) out.type = type;
  if (weights) out.weights = weights;
  if (ruleSet) out.ruleSet = ruleSet;
  if (layout) out.layout = layout;
  const alpha = num(p.alpha);
  if (alpha !== null && [0.01, 0.05, 0.1].includes(alpha)) out.alpha = alpha;
  const trials = num(p.trials);
  if (trials !== null && Number.isInteger(trials) && trials >= 1) out.trials = trials;
  out.positiveLevel = typeof p.positiveLevel === 'string' ? p.positiveLevel : null;
  for (const k of ['part', 'appraiser', 'rating', 'reference', 'replicate']) out[k] = refFrom(c[k]);
  out.ratings = Array.isArray(c.ratings) ? c.ratings.map(refFrom).filter(Boolean) : [];
  out.exampleWorksheetId = typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null;
  return out;
}
