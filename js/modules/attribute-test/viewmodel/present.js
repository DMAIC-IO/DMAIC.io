/**
 * D.Mike — Attributtest: Darstellung des Ergebnisses.
 *
 * Kennzahlen, Entscheidung, Hinweise, Folgeschritte, Kreuztabelle und
 * Hypothesen aus dem Bericht (`domain/report.js`) in der App-Sprache. Rein:
 * Übersetzer und Sprache kommen herein.
 */
import { formatNumber } from '../../../core/number-format.js';
import { formatValue, formatCell, displayPp } from '../domain/format.js';

/** @typedef {import('../domain/report.js').RawReport} RawReport */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} T */

/** Zeichen der Alternativhypothese je Richtung. */
const OPS = Object.freeze({ 'two-sided': '≠', greater: '>', less: '<' });

/** Klasse der Entscheidung je Ausgang. */
const DECISION_CLASS = Object.freeze({
  reject: 'attrtest__decision--reject',
  keep: 'attrtest__decision--keep',
  equivalent: 'attrtest__decision--keep',
  notEquivalent: 'attrtest__decision--inconclusive',
});

/**
 * Platzhalter mit Zahlen in der App-Sprache; Texte bleiben.
 * @param {Record<string, string|number>|undefined} params @param {string} lang
 * @returns {Record<string, string>}
 */
function localParams(params, lang) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(params ?? {})) out[k] = typeof v === 'number' ? formatNumber(v, lang) : v;
  return out;
}

/**
 * @typedef {object} Shown
 * @property {Array<{ key: string, label: string, help: string, value: string }>} stats
 * @property {string} decisionText
 * @property {string} decisionClass
 * @property {string} basisText
 * @property {Array<{ key: string, text: string }>} notes
 * @property {Array<{ key: string, label: string }>} actions
 * @property {{ cols: string[], rows: Array<{ name: string, cells: Array<{ obs: string, exp: string, contrib: string }> }> }|null} table
 */

/**
 * Der Bericht für die Anzeige.
 * @param {RawReport} r @param {number} alpha @param {T} t @param {string} lang
 * @returns {Shown}
 */
export function present(r, alpha, t, lang) {
  const a = formatNumber(alpha, lang);
  let decisionText;
  if (r.kind === 'equiv') {
    const d = r.decisionRaw;
    const params = d ? { lower: displayPp(d.lower, lang), upper: displayPp(d.upper, lang), unit: d.unit, alpha: a } : { alpha: a };
    decisionText = t(r.decision === 'equivalent' ? 'decisionEquivalent' : 'decisionNotEquivalent', params);
  } else {
    decisionText = t(r.decision === 'reject' ? 'decisionReject' : 'decisionKeep', { alpha: a });
  }
  return {
    stats: r.stats.map((s) => ({
      key: s.key,
      label: t(s.labelKey, localParams(s.params, lang)),
      help: `modules.attribute-test.stats.${r.kind}.${s.key}`,
      value: formatValue(s.f, lang, 'display'),
    })),
    decisionText,
    decisionClass: DECISION_CLASS[r.decision] ?? DECISION_CLASS.keep,
    basisText: t(r.basisKey),
    notes: r.notes.map((n) => ({ key: n.key, text: t(n.key, localParams(n.params, lang)) })),
    actions: (r.actions ?? []).map((x) => ({ key: x.key, label: t(x.key) })),
    table: r.table
      ? {
        cols: [...r.table.cols],
        rows: r.table.rows.map((row) => ({
          name: row.name,
          cells: row.cells.map((c) => ({
            obs: formatCell(c.obs, null, lang, 'display'),
            exp: formatCell(c.exp, 2, lang, 'display'),
            contrib: formatCell(c.contrib, 3, lang, 'display'),
          })),
        })),
      }
      : null,
  };
}

/**
 * Nullhypothese und Alternative zur Testart; bei McNemar mit den
 * Bezeichnungen, sobald eine steht.
 * @param {{ testKind: string, direction: string }} m
 * @param {{ before: string, after: string }} labels
 * @param {T} t
 * @returns {string[]}
 */
export function hypotheses(m, labels, t) {
  const op = OPS[/** @type {keyof typeof OPS} */ (m.direction)] ?? OPS['two-sided'];
  switch (m.testKind) {
    case 'one': return [t('h0One'), t('h1One', { op })];
    case 'two': return [t('h0Two'), t('h1Two', { op })];
    case 'rate1': return [t('h0Rate1'), t('h1Rate1', { op })];
    case 'rate2': return [t('h0Rate2'), t('h1Rate2', { op })];
    case 'mcnemar': {
      if (!labels.before && !labels.after) return [t('h0McNemar'), t('h1McNemar', { op })];
      const p = { before: labels.before || t('fallbackBefore'), after: labels.after || t('fallbackAfter'), op };
      return [t('h0McNemarLabeled', p), t('h1McNemarLabeled', p)];
    }
    case 'equiv': return [t('h0Equiv'), t('h1Equiv')];
    default: return [t('h0Assoc'), t('h1Assoc')];
  }
}
