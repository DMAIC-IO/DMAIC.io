/**
 * D.Mike — FMEA: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js, rating.js oder scales.js (das Schema darf sich
 * ändern, die Migration nicht).
 */

/** Methoden, Arten und besondere Merkmale im Formatstand 1.0. */
const METHODS_1_0 = ['ap', 'rpn'];
const TYPES_1_0 = ['process', 'design'];
const SPECIAL_1_0 = ['', 'CC', 'SC'];

/** Dimensionen und Zeilenschlüssel der Skalen im Formatstand 1.0. */
const RPN_KEYS_1_0 = {
  sev: ['sevNone', 'sevLow', 'sevMod', 'sevHigh', 'sevVHigh'],
  occ: ['occUnlikely', 'occLow', 'occMod', 'occHigh', 'occVHigh'],
  det: ['detCertain', 'detHigh', 'detMod', 'detLow', 'detVLow'],
};
const SECOND_1_0 = { sev: 'Desc', occ: 'Rate', det: 'Desc' };
const AP_KEY_1_0 = /^ap\.(process|design)\.(sev|occ|det)\.([1-9]|10)\.(meaning|criterion)$/;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {string} nur echte Texte, sonst '' (wie das alte `asStr`) */
const asStr = (v) => (typeof v === 'string' ? v : '');

/**
 * Ein Skalenschlüssel im Formatstand 1.0.
 * @param {string} key @returns {boolean}
 */
function isScaleKey(key) {
  if (AP_KEY_1_0.test(key)) return true;
  for (const [dim, keys] of Object.entries(RPN_KEYS_1_0)) {
    for (const k of keys) if (key === k || key === `${k}${SECOND_1_0[/** @type {'sev'|'occ'|'det'} */ (dim)]}`) return true;
  }
  return false;
}

/**
 * Eine Stufe als ganze Zahl im Bereich aus einem Text aus Ziffern (Leerraum
 * am Rand erlaubt, Regel des alten `toRating`); mit `numbers` auch aus einer
 * Zahl (die Senkungen las das alte `asDeltaStr` auch als Zahl, S/O/D las
 * `asStr` nur als Text).
 * @param {unknown} v @param {number} min @param {number} max @param {boolean} [numbers]
 * @returns {number|null} die Zahl, sonst `null`
 */
function asLevel(v, min, max, numbers = false) {
  let n = NaN;
  if (numbers && typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * Ersatz-id `<präfix><position + 1>`, bei Kollision mit `_` ergänzt.
 * @param {string} prefix @param {number} i Position @param {Set<string>} taken
 * @returns {string}
 */
function fallbackId(prefix, i, taken) {
  let out = `${prefix}${i + 1}`;
  while (taken.has(out)) out = `${out}_`;
  return out;
}

/**
 * Die vorhandenen nichtleeren ids einer Liste, je die erste Fundstelle.
 * @param {unknown[]} list @returns {Set<string>}
 */
function ownIds(list) {
  const ids = new Set();
  for (const x of list) if (isObject(x) && typeof x.id === 'string' && x.id !== '') ids.add(x.id);
  return ids;
}

/**
 * Feste ids für eine Altliste: vorhandene bleiben (die erste Fundstelle
 * gewinnt), fehlende und doppelte bekommen `<präfix><position + 1>`.
 * @param {unknown[]} list @param {string} prefix
 * @returns {string[]} id je Position
 */
function assignIds(list, prefix) {
  const reserved = ownIds(list);
  const taken = new Set();
  const seen = new Set();
  return list.map((x, i) => {
    const raw = isObject(x) ? x.id : undefined;
    const keep = typeof raw === 'string' && raw !== '' && !seen.has(raw);
    if (keep) { seen.add(raw); taken.add(raw); return raw; }
    const id = fallbackId(prefix, i, new Set([...reserved, ...taken]));
    taken.add(id);
    return id;
  });
}

/**
 * Eine Altmaßnahme (wie `Action.fromJSON`: Nicht-Objekt → leer).
 * @param {unknown} a @param {string} id
 */
function action(a, id) {
  const o = isObject(a) ? a : {};
  return {
    id,
    text: asStr(o.text),
    resp: asStr(o.resp),
    date: asStr(o.date),
    done: Boolean(o.done),
    deltaS: asLevel(o.deltaS, 0, 9, true) ?? 0,
    deltaO: asLevel(o.deltaO, 0, 9, true) ?? 0,
    deltaD: asLevel(o.deltaD, 0, 9, true) ?? 0,
  };
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb, von Hand, als Beispieldatei oder in fremder Form). Fehlendes oder
 * fremdes `method` wird `rpn` (Altstände vor der Aufgabenpriorität), fremdes
 * `fmeaType` `process`. Texte nur als echte Texte, sonst leer. S/O/D werden
 * die Zahl 1–10, wenn sie ein Ziffertext dieses Werts waren, sonst `null`
 * (eine Zahl las das alte `fromJSON` als leer); die Senkungen 0–9 aus
 * Ziffertext oder Zahl, sonst 0. Risiken behalten vorhandene ids,
 * fehlende oder doppelte bekommen `x<n>` aus der Position, Maßnahmen `a<n>` je
 * Risiko. `collapsed: true` wird die id in `collapsed`. Eigene Skalentexte
 * bleiben unter bekannten Schlüsseln (eine endliche Zahl wird ihr Text).
 * Unbekannte Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {Record<string, any>}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  const list = Array.isArray(o.risks) ? o.risks : [];
  const riskIds = assignIds(list, 'x');
  /** @type {string[]} */
  const collapsed = [];
  const risks = list.map((r, i) => {
    const d = isObject(r) ? r : {};
    const acts = Array.isArray(d.actions) ? d.actions : [];
    const actionIds = assignIds(acts, 'a');
    if (d.collapsed === true) collapsed.push(riskIds[i]);
    return {
      id: riskIds[i],
      step: asStr(d.step),
      failureMode: asStr(d.failureMode),
      effect: asStr(d.effect),
      cause: asStr(d.cause),
      prevention: asStr(d.prevention),
      control: asStr(d.control),
      specialChar: SPECIAL_1_0.includes(d.specialChar) ? d.specialChar : '',
      justification: asStr(d.justification),
      sev: asLevel(d.sev, 1, 10),
      occ: asLevel(d.occ, 1, 10),
      det: asLevel(d.det, 1, 10),
      actions: acts.map((a, j) => action(a, actionIds[j])),
    };
  });
  /** @type {Record<string, string>} */
  const scales = {};
  if (isObject(o.scales)) {
    for (const [key, v] of Object.entries(o.scales)) {
      if (!isScaleKey(key)) continue;
      if (typeof v === 'string') scales[key] = v;
      else if (typeof v === 'number' && Number.isFinite(v)) scales[key] = String(v);
    }
  }
  return {
    method: METHODS_1_0.includes(o.method) ? o.method : 'rpn',
    fmeaType: TYPES_1_0.includes(o.fmeaType) ? o.fmeaType : 'process',
    risks,
    scales,
    collapsed,
  };
}
