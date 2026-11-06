/**
 * D.Mike — Hypothesentest: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js.
 */

const CATEGORIES_0 = ['variance', 'mean'];
const TEST_TYPES_0 = ['one', 'two', 'paired', 'k'];
const DIRECTIONS_0 = ['two-sided', 'greater', 'less'];
const TARGET_TYPES_0 = ['variance', 'stddev'];

/**
 * Eine Zahl (oder ein alter Zahlentext), die `ok` erfüllt, sonst undefined.
 * @param {unknown} v
 * @param {(n: number) => boolean} ok
 * @returns {number|undefined}
 */
function numberOr(v, ok) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) && ok(n) ? n : undefined;
}

/**
 * @param {any} r
 * @returns {object|null}
 */
function refOrNull(r) {
  if (!r || typeof r !== 'object' || typeof r.instanceId !== 'string' || typeof r.columnId !== 'string') return null;
  return { instanceId: r.instanceId, ...(typeof r.sheetId === 'string' ? { sheetId: r.sheetId } : {}), columnId: r.columnId };
}

/**
 * '0→1.0': Altstände ohne `_schema`. Die Form bleibt; bereinigt wird, was der
 * alte Lader bereinigt hat. Fehlende Schlüssel nimmt das Model als Vorgabe.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {Record<string, any>}
 */
export function from0(json) {
  const out = {};
  if (CATEGORIES_0.includes(json.category)) out.category = json.category;
  if (TEST_TYPES_0.includes(json.testType)) out.testType = json.testType;
  if (DIRECTIONS_0.includes(json.direction)) out.direction = json.direction;
  if (TARGET_TYPES_0.includes(json.targetType)) out.targetType = json.targetType;
  const alpha = numberOr(json.alpha, (n) => n > 0 && n < 1);
  if (alpha !== undefined) out.alpha = alpha;
  const powerGoal = numberOr(json.powerGoal, (n) => n >= 0.5 && n <= 0.99);
  if (powerGoal !== undefined) out.powerGoal = powerGoal;
  if (typeof json.targetValue === 'string') out.targetValue = json.targetValue;
  else if (typeof json.targetValue === 'number' && Number.isFinite(json.targetValue)) out.targetValue = String(json.targetValue);
  out.colRef1 = refOrNull(json.colRef1);
  out.colRef2 = refOrNull(json.colRef2);
  out.colRefsK = Array.isArray(json.colRefsK) ? json.colRefsK.map(refOrNull).filter((r) => r !== null) : [];
  if (typeof json.equalVariances === 'boolean') out.equalVariances = json.equalVariances;
  out.exampleWorksheetId = typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null;
  if ((out.category ?? 'variance') === 'variance' && out.testType === 'paired') out.testType = 'two';
  return out;
}
