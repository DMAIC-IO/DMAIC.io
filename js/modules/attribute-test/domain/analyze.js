/**
 * D.Mike — Attributtest: Rechnung zum Stand.
 *
 * Liest im Spaltenmodus die Rohwerte über den Leser des Arbeitsblatts, prüft
 * die Eingaben und baut den Bericht. Die letzte Rechnung wird gemerkt: die
 * Ableitungen des Models und die Ansicht rechnen je Änderung einmal. Rein,
 * ohne DOM und i18n.
 */
import { readColumn } from '../../../core/source-columns.js';
import { normalizeSummary, normalizeColumns, withColumnLabels } from './normalize.js';
import { buildReport } from './report.js';
import { distinctValues, effectiveEvent } from './event.js';

/** @typedef {import('./report.js').RawReport} RawReport */

/** Die Spaltenrollen in der Reihenfolge der Oberfläche, oben nach unten. */
export const COLUMN_SLOTS = Object.freeze(['response', 'counts', 'before', 'after', 'group', 'rowVar', 'colVar']);

/**
 * @typedef {{ status: 'ok', report: RawReport }
 *   | { status: 'insufficient', reason: string, hint: boolean }} Analysis
 */

/**
 * Die Rohwerte einer Spalte; `null` ohne Bezug oder bei gelöschter Spalte.
 * @param {any} src @param {object|null} ref @returns {any[]|null}
 */
function values(src, ref) {
  if (!ref || !src) return null;
  return readColumn(src, ref)?.values ?? null;
}

/**
 * Der Name einer gewählten Spalte, getrimmt; leer ohne Bezug.
 * @param {any} src @param {object|null} ref @returns {string}
 */
function nameOf(src, ref) {
  if (!ref || !src) return '';
  const c = readColumn(src, ref);
  return c ? String(c.name || '').trim() : '';
}

/**
 * Die Rohwerte aller Rollen.
 * @param {any} m @param {any} src
 */
function columnsOf(m, src) {
  /** @type {any} */
  const cols = {};
  for (const slot of COLUMN_SLOTS) cols[slot] = values(src, m.colRefs[slot]);
  return cols;
}

/**
 * Die Werte, unter denen der Ereigniswert gewählt wird: im Spaltenmodus die
 * der Antwortspalte, bei McNemar die beider Paarspalten; sonst keine.
 * @param {any} m Stand des Models @param {any} src Leser des Arbeitsblatts
 * @returns {string[]}
 */
export function eventOptionsOf(m, src) {
  if (m.inputMode !== 'columns') return [];
  if (m.testKind === 'mcnemar') {
    const b = values(src, m.colRefs.before);
    const a = values(src, m.colRefs.after);
    return b && a ? distinctValues([...b, ...a]) : [];
  }
  const r = values(src, m.colRefs.response);
  return r ? distinctValues(r) : [];
}

/** Die Einstellungen, die der Bericht braucht. @param {any} m */
const settingsOf = (m) => ({ direction: m.direction, alpha: m.alpha, pooled: m.pooled, ratePooled: m.ratePooled });

/** @type {{ key: string, value: Analysis }|null} */
let memo = null;

/**
 * Die Rechnung zum Stand: der Bericht oder der Grund, warum es keinen gibt.
 * @param {any} m Stand des Models (`domain/model.js`)
 * @param {any} src Leser des Arbeitsblatts (`src` bzw. `ctx.source`)
 * @returns {Analysis}
 */
export function analyze(m, src) {
  let norm;
  if (m.inputMode === 'columns') {
    const cols = columnsOf(m, src);
    const event = effectiveEvent(m.eventValue, eventOptionsOf(m, src));
    norm = withColumnLabels(normalizeColumns({ ...plainState(m), eventValue: event }, cols), {
      before: nameOf(src, m.colRefs.before), after: nameOf(src, m.colRefs.after),
    });
  } else {
    norm = normalizeSummary(plainState(m));
  }
  const key = JSON.stringify([norm, settingsOf(m)]);
  if (memo && memo.key === key) return memo.value;
  const report = buildReport(settingsOf(m), norm);
  /** @type {Analysis} */
  const value = 'error' in report
    ? { status: 'insufficient', reason: report.error, hint: report.hint === true }
    : { status: 'ok', report };
  memo = { key, value };
  return value;
}

/**
 * Die Felder des Models, die der Normalisierer liest, als einfaches Objekt.
 * @param {any} m
 */
function plainState(m) {
  return {
    testKind: m.testKind,
    p0: m.p0,
    equiv: { samples: m.equiv.samples, symmetric: m.equiv.symmetric, delta: m.equiv.delta, lower: m.equiv.lower, upper: m.equiv.upper },
    exposurePerRow: m.exposurePerRow,
    summary: m.summary,
    eventValue: m.eventValue,
  };
}
