/**
 * D.Mike — Makigami: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration
 * nicht). Die Vorgaben stehen deshalb hier als Literal.
 */

/** Textschlüssel der mitgelieferten Arten im Formatstand 1.0. */
const MUDA_LABEL_KEYS_1_0 = [
  'muda.transport', 'muda.inventory', 'muda.motion', 'muda.waiting',
  'muda.overproduction', 'muda.overprocessing', 'muda.defects', 'muda.skills',
];

/** @returns {Array<{ id: string, code: string, labelKey: string, label: string, color: string }>} */
const defaultMuda = () => [
  { id: 'muda-transport', code: 'T', labelKey: 'muda.transport', label: '', color: '#4a90e2' },
  { id: 'muda-inventory', code: 'I', labelKey: 'muda.inventory', label: '', color: '#f5a623' },
  { id: 'muda-motion', code: 'M', labelKey: 'muda.motion', label: '', color: '#9b59b6' },
  { id: 'muda-waiting', code: 'W', labelKey: 'muda.waiting', label: '', color: '#d0021b' },
  { id: 'muda-overproduction', code: 'O', labelKey: 'muda.overproduction', label: '', color: '#50e3c2' },
  { id: 'muda-overprocessing', code: 'O+', labelKey: 'muda.overprocessing', label: '', color: '#f8a01c' },
  { id: 'muda-defects', code: 'D', labelKey: 'muda.defects', label: '', color: '#bd10e0' },
  { id: 'muda-skills', code: 'S', labelKey: 'muda.skills', label: '', color: '#7ed321' },
];

/** @returns {Array<{ id: string, label: string, factorSeconds: number }>} */
const defaultUnits = () => [
  { id: 'unit-s', label: 's', factorSeconds: 1 },
  { id: 'unit-min', label: 'min', factorSeconds: 60 },
  { id: 'unit-h', label: 'h', factorSeconds: 3600 },
  { id: 'unit-d', label: 'd', factorSeconds: 28800 },
];

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Ein Alttext wie `String(x || '')` im alten `fromJSON`. @param {unknown} v @returns {string} */
const textOf = (v) => String(v || '');

/**
 * Eine id aus dem Altstand; fehlt sie (falsy), die feste Ersatz-id
 * `<prefix><position>` statt einer zufälligen. Nur der Ersatz wird bei
 * Kollision mit `_` ergänzt, nie eine vorhandene id.
 * @param {unknown} id @param {string} prefix @param {number} pos ab 1 @param {Set<string>} taken
 * @returns {string}
 */
function idOrFixed(id, prefix, pos, taken) {
  if (id) return String(id);
  let out = `${prefix}${pos}`;
  while (taken.has(out)) out += '_';
  return out;
}

/**
 * '0→1.0': jeder Stand ohne `_schema`, wie ihn das alte `State.toJSON`
 * schrieb (auch Beispieldateien), genau so gelesen wie das alte `fromJSON`:
 * Rollen und Schritte ohne Text-id (auch leer) entfallen, Textfelder werden Text;
 * `roleIds`/`mudaIds` behalten nur Texte, die eine vorhandene Rolle bzw. Art
 * nennen (die Altform zeigte verwaiste nirgends); `expanded === false` wird
 * die id in `collapsed`. Leere oder fehlende Arten bzw. Einheiten werden die
 * Vorgaben; Arten und Einheiten ohne id bekommen eine feste id aus ihrer
 * Position (`muda-<n>`, `unit-<n>`), Einheiten ohne endlichen Faktor über 0
 * entfallen. Ein `labelKey` bleibt nur, wenn er eine mitgelieferte Art nennt.
 * `settingsOpen` bleibt nur als Wahrheitswert. Fremde Schlüssel entfallen;
 * doppelte ids repariert die Invariante `uniqueIds`.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {Record<string, unknown>}
 */
export function from0(old) {
  const d = isObject(old) ? old : {};

  /** @type {Array<{ id: string, code: string, labelKey?: string, label: string, color: string }>} */
  let mudaCategories = [];
  if (Array.isArray(d.mudaCategories) && d.mudaCategories.length > 0) {
    const taken = new Set(d.mudaCategories.filter(isObject).map((m) => (m.id ? String(m.id) : '')));
    d.mudaCategories.forEach((m, i) => {
      if (!isObject(m)) return;
      /** @type {{ id: string, code: string, labelKey?: string, label: string, color: string }} */
      const cat = {
        id: idOrFixed(m.id, 'muda-', i + 1, taken),
        code: textOf(m.code),
        label: textOf(m.label),
        color: String(m.color || '#888888'),
      };
      taken.add(cat.id);
      if (typeof m.labelKey === 'string' && MUDA_LABEL_KEYS_1_0.includes(m.labelKey)) cat.labelKey = m.labelKey;
      mudaCategories.push(cat);
    });
  }
  if (mudaCategories.length === 0) mudaCategories = defaultMuda();

  /** @type {Array<{ id: string, label: string, factorSeconds: number }>} */
  let timeUnits = [];
  if (Array.isArray(d.timeUnits) && d.timeUnits.length > 0) {
    const taken = new Set(d.timeUnits.filter(isObject).map((u) => (u.id ? String(u.id) : '')));
    d.timeUnits.forEach((u, i) => {
      if (!isObject(u)) return;
      const factor = Number(u.factorSeconds);
      if (!Number.isFinite(factor) || factor <= 0) return;
      const unit = { id: idOrFixed(u.id, 'unit-', i + 1, taken), label: textOf(u.label), factorSeconds: factor };
      taken.add(unit.id);
      timeUnits.push(unit);
    });
  }
  if (timeUnits.length === 0) timeUnits = defaultUnits();

  const roles = (Array.isArray(d.roles) ? d.roles : [])
    .filter((r) => isObject(r) && typeof r.id === 'string' && r.id !== '')
    .map((r) => ({ id: r.id, label: textOf(r.label) }));

  const roleIds = new Set(roles.map((r) => r.id));
  const mudaIds = new Set(mudaCategories.map((m) => m.id));
  /** @type {string[]} */
  const collapsed = [];
  const steps = (Array.isArray(d.steps) ? d.steps : [])
    .filter((s) => isObject(s) && typeof s.id === 'string' && s.id !== '')
    .map((s) => {
      if (s.expanded === false && !collapsed.includes(s.id)) collapsed.push(s.id);
      return {
        id: s.id,
        title: textOf(s.title),
        description: textOf(s.description),
        roleIds: Array.isArray(s.roleIds) ? s.roleIds.filter((x) => typeof x === 'string' && roleIds.has(x)) : [],
        processTime: textOf(s.processTime),
        waitTime: textOf(s.waitTime),
        mudaIds: Array.isArray(s.mudaIds) ? s.mudaIds.filter((x) => typeof x === 'string' && mudaIds.has(x)) : [],
        notes: textOf(s.notes),
      };
    });

  /** @type {Record<string, unknown>} */
  const out = {
    title: typeof d.title === 'string' ? d.title : '',
    roles,
    steps,
    mudaCategories,
    timeUnits,
    collapsed,
  };
  if (typeof d.settingsOpen === 'boolean') out.settingsOpen = d.settingsOpen;
  return out;
}
