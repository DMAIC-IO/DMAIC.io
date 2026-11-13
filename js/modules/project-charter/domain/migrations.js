/**
 * D.Mike — Project charter: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */
import { normalizeProblemStatement, plainLength } from '../../../core/rich-text.js';
import { isIsoDate } from '../../../core/local-date.js';
import { uid } from '../../../core/uid.js';

/** Vorgaben des globalen Organigrammstils im Formatstand 1.0. */
const ORG_STYLE_1_0 = Object.freeze({
  nodeBg: '',
  nodeBorderColor: '',
  nodeBorderStyle: 'solid',
  nodeBorderWidth: 1,
  lineColor: '',
  lineStyle: 'solid',
  lineWidth: 2,
});

/** Höchstzahl Klartextzeichen der Problembeschreibung im Formatstand 1.0. */
const PROBLEM_MAX = 10000;

const LINE_STYLES = ['solid', 'dashed', 'dotted'];

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** @param {unknown} v @returns {string} der Text, sonst leer */
function str(v) {
  return typeof v === 'string' ? v : '';
}

/** @param {unknown} v @returns {string} die id, sonst eine neue */
function idOrNew(v) {
  return typeof v === 'string' && v !== '' ? v : uid();
}

/**
 * Breite auf 1..8 klemmen; unlesbar → `fallback`.
 * @param {unknown} v @param {number} fallback @returns {number}
 */
function width(v, fallback) {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(8, n));
}

/**
 * Problembeschreibung auf höchstens PROBLEM_MAX Klartextzeichen kürzen; eine
 * dabei offene `**`/`*`-Markierung wird geschlossen, ein einzelner
 * Rückstrich am Ende entfällt.
 * @param {string} md @returns {string}
 */
function clipProblem(md) {
  if (plainLength(md) <= PROBLEM_MAX) return md;
  let lo = 0;
  let hi = md.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (plainLength(md.slice(0, mid)) <= PROBLEM_MAX) lo = mid; else hi = mid - 1;
  }
  for (let k = Math.min(md.length, lo + 3); k >= 0; k--) {
    let p = md.slice(0, k);
    if (/(^|[^\\])(\\\\)*\\$/.test(p)) p = p.slice(0, -1);
    const here = plainLength(p);
    for (const mark of ['**', '*']) {
      const closed = p + mark;
      const len = plainLength(closed);
      if (len <= PROBLEM_MAX && len < here) return closed;
    }
    if (here <= PROBLEM_MAX) return p;
  }
  return '';
}

/**
 * Zieldatum: `YYYY-MM-DD` bleibt, ein gültiges `D.M.YYYY` wird nach ISO
 * umgeschrieben, alles andere (Freitext wie „KW 23“, auch ein nicht
 * existierendes Datum) bleibt unverändert (getrimmt); Nicht-Strings werden leer.
 * @param {unknown} v @returns {string}
 */
function targetDate(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (isIsoDate(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (!m) return s;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : s;
}

/**
 * Ziele: nur Objekte, fremde Schlüssel entfallen; `text` der Altform wird
 * `description`; fehlende id → neue; Erreichung auf 0..100.
 * @param {unknown} list @returns {object[]}
 */
function goals(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(isObj).map((g) => {
    const lvl = Number(g.achievementLevel);
    return {
      id: idOrNew(g.id),
      description: str(g.description ?? g.text),
      targetDate: targetDate(g.targetDate),
      metric: str(g.metric),
      targetValue: str(g.targetValue),
      achievementLevel: Number.isFinite(lvl) ? Math.max(0, Math.min(100, Math.round(lvl))) : 0,
    };
  });
}

/**
 * Ein Knoten im Formatstand 1.0; Stilschlüssel nur, wenn gesetzt.
 * @param {Record<string, any>} n @param {string} id @param {string|null} pid @returns {object}
 */
function node(n, id, pid) {
  const o = { id, title: str(n.title), desc: str(n.desc ?? n.description), pid };
  if (n.bg && typeof n.bg === 'string') o.bg = n.bg;
  if (n.borderColor && typeof n.borderColor === 'string') o.borderColor = n.borderColor;
  if (n.borderStyle === 'dashed' || n.borderStyle === 'dotted') o.borderStyle = n.borderStyle;
  const bw = parseInt(n.borderWidth, 10);
  if (Number.isFinite(bw) && bw > 0 && bw !== 1) o.borderWidth = Math.min(8, bw);
  return o;
}

/**
 * Organigramm: flache Liste oder rekursives Format mit `children` (an jedem
 * Element, auf jeder Ebene) → flache Liste in Reihenfolge der Tiefensuche;
 * verwaiste `pid` → Wurzel.
 * @param {unknown} data @returns {object[]}
 */
function orgChart(data) {
  if (!Array.isArray(data)) return [];
  const flat = [];
  const walk = (nodes, parent) => {
    for (const n of nodes) {
      if (!isObj(n)) continue;
      const id = idOrNew(n.id);
      flat.push(node(n, id, parent ?? (typeof n.pid === 'string' ? n.pid : null)));
      if (Array.isArray(n.children) && n.children.length) walk(n.children, id);
    }
  };
  walk(data, null);
  const ids = new Set(flat.map((n) => n.id));
  for (const n of flat) if (n.pid !== null && !ids.has(n.pid)) n.pid = null;
  return flat;
}

/**
 * Globaler Stil: Altschlüssel `bgColor`/`borderColor`/`borderWidth` →
 * `nodeBg`/`nodeBorderColor`/`nodeBorderWidth`; unbekannte Schlüssel entfallen,
 * Breiten auf 1..8, fehlende Werte aus den Vorgaben.
 * @param {unknown} s @returns {object}
 */
function orgStyle(s) {
  const src = isObj(s) ? s : {};
  const pick = (key, ...old) => [key, ...old].map((k) => src[k]).find((v) => v !== undefined);
  const color = (v, d) => (typeof v === 'string' ? v : d);
  const style = (v, d) => (LINE_STYLES.includes(v) ? v : d);
  const d = ORG_STYLE_1_0;
  return {
    nodeBg: color(pick('nodeBg', 'bgColor'), d.nodeBg),
    nodeBorderColor: color(pick('nodeBorderColor', 'borderColor'), d.nodeBorderColor),
    nodeBorderStyle: style(pick('nodeBorderStyle', 'borderStyle'), d.nodeBorderStyle),
    nodeBorderWidth: width(pick('nodeBorderWidth', 'borderWidth'), d.nodeBorderWidth),
    lineColor: color(src.lineColor, d.lineColor),
    lineStyle: style(src.lineStyle, d.lineStyle),
    lineWidth: width(src.lineWidth, d.lineWidth),
  };
}

/**
 * Altform (ohne Formatstand) → 1.0.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {object}
 */
export function from0(old) {
  const o = isObj(old) ? old : {};
  return {
    problemStatement: clipProblem(normalizeProblemStatement(o.problemStatement)),
    goals: goals(o.goals),
    orgChart: orgChart(o.orgChart),
    orgStyle: orgStyle(o.orgStyle),
  };
}
