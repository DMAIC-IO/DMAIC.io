/**
 * D.Mike — TRIZ-Funktionsanalyse: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/** Werte im Formatstand 1.0. */
const KINDS_1_0 = ['target', 'system', 'supersystem'];
const TYPES_1_0 = ['useful', 'harmful'];
const LEVELS_1_0 = ['adequate', 'insufficient', 'excessive'];

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** @param {unknown} v @returns {string} der Text, sonst leer */
function str(v) {
  return typeof v === 'string' ? v : '';
}

/** @param {unknown} v @returns {any[]} die Objekte der Liste, sonst leer */
function objects(v) {
  return Array.isArray(v) ? v.filter(isObj) : [];
}

/** @param {unknown} v @returns {number|null} eine endliche Zahl ≥ 0, sonst null */
function cost(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Lagen je id: nur Einträge auf bekannte ids mit endlichen Koordinaten,
 * auf ≥ 0 geklemmt.
 * @param {unknown} v @param {Set<unknown>} known @returns {Record<string, { x: number, y: number }>}
 */
function places(v, known) {
  /** @type {Record<string, { x: number, y: number }>} */
  const out = {};
  if (!isObj(v)) return out;
  for (const [id, p] of Object.entries(v)) {
    if (known.has(id) && isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      out[id] = { x: Math.max(0, p.x), y: Math.max(0, p.y) };
    }
  }
  return out;
}

/**
 * Altform (ohne Formatstand) → 1.0. Das Format ist gleich; gereinigt wird nur
 * die Rohform: Texte, Art, Typ, Stufe und Kosten in ihre Form, Lagen auf
 * unbekannte ids entfallen. Verweise und Doppelte heilen die Invarianten.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {object}
 */
export function from0(old) {
  const o = isObj(old) ? old : {};
  const components = objects(o.components).map((c) => ({
    id: c.id,
    name: str(c.name),
    kind: KINDS_1_0.includes(c.kind) ? c.kind : 'system',
    note: str(c.note),
    cost: cost(c.cost),
  }));
  const functions = objects(o.functions).map((f) => ({
    id: f.id,
    carrier: str(f.carrier),
    verb: str(f.verb),
    object: str(f.object),
    parameter: str(f.parameter),
    type: TYPES_1_0.includes(f.type) ? f.type : 'useful',
    level: LEVELS_1_0.includes(f.level) ? f.level : null,
    note: str(f.note),
  }));
  const pairs = (v) => objects(v).map((p) => ({ a: p.a, b: p.b }));
  const out = {
    components,
    interactions: pairs(o.interactions),
    exclusions: pairs(o.exclusions),
    functions,
    positions: places(o.positions, new Set(components.map((c) => c.id))),
    labels: places(o.labels, new Set(functions.map((f) => f.id))),
    showRanks: o.showRanks === true,
  };
  if (Object.hasOwn(o, 'activeTab')) out.activeTab = o.activeTab;
  return out;
}
