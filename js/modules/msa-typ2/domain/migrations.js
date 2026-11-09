/**
 * D.Mike — MSA Typ 2: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/**
 * Zahl aus einem alten Parameter: endliche Zahl oder Text mit Dezimalpunkt
 * oder -komma; Leeres, Ungültiges und NaN werden null.
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

/**
 * '0→1.0': Altform ohne `_schema` — `params` (Texte oder Zahlen, alt auch
 * NaN) und `columnRefs` werden zu flachen Feldern. Ein leeres oder ungültiges
 * `alpha` entfällt, dann greift die Vorgabe des Kontexts. `k` kommt aus
 * `params.k`, sonst aus dem alten `studyVarMultiplier`, sonst 5.15 (Altstudien
 * vor dem Faktor 6). Eine unbekannte oder fehlende Urteilsgrundlage wird
 * `'studyVar'`, damit Altstudien Zahlen und Urteil behalten.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {Record<string, any>} Zustand im Formatstand 1.0
 */
export function from0(json) {
  const p = json.params && typeof json.params === 'object' ? json.params : {};
  const refs = json.columnRefs && typeof json.columnRefs === 'object' ? json.columnRefs : {};
  const alpha = num(p.alpha);
  const sigma = num(p.sigmaHist);
  const kRaw = num(p.k ?? p.studyVarMultiplier);
  return {
    part: refFrom(refs.part),
    operator: refFrom(refs.operator),
    measurement: refFrom(refs.measurement),
    lsl: num(p.lsl),
    usl: num(p.usl),
    ...(alpha !== null && alpha > 0 && alpha < 1 ? { alpha } : {}),
    k: kRaw === 6 ? 6 : 5.15,
    verdictBasis: ['auto', 'tolerance', 'studyVar'].includes(p.verdictBasis) ? p.verdictBasis : 'studyVar',
    sigmaHist: sigma !== null && sigma > 0 ? sigma : null,
    exampleWorksheetId: typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null,
  };
}
