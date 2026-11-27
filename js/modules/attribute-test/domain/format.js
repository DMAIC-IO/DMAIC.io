/**
 * D.Mike — Attributtest: Zahlen des Berichts als Text.
 *
 * Zwei Arten: `read` liefert die Texte der Agentenfläche zeichengleich mit
 * der Altform (Punkt als Dezimalzeichen, keine Gruppierung, Intervalle
 * `[a, b]`); `display` formatiert in der App-Sprache (Dezimalzeichen und
 * Gruppierung der Sprache, Intervalle `[a; b]` in beiden Sprachen). Rein.
 */
import { formatNumber, roundTo } from '../../../core/number-format.js';

/** @typedef {import('./report.js').Fmt} Fmt */
/** @typedef {import('./report.js').RawReport} RawReport */
/** @typedef {import('./report.js').Result} Result */
/** @typedef {'read'|'display'} Mode */

const DASH = '–';

/**
 * Eine Zahl mit festen Stellen.
 * @param {number} v @param {number} d @param {string} lang @param {Mode} mode
 */
const fixed = (v, d, lang, mode) => (mode === 'read'
  ? formatNumber(v, 'en', { profile: 'input', decimals: d })
  : formatNumber(v, lang, { decimals: d }));

/**
 * Eine freie Zahl ohne Rundungsrauschen (0.30000000000000004 → 0.3).
 * @param {number} v @param {string} lang @param {Mode} mode
 */
const free = (v, lang, mode) => {
  const n = Number(v.toPrecision(10));
  return mode === 'read' ? String(n) : formatNumber(n, lang);
};

/** @param {number|null} v @returns {v is number} */
const ok = (v) => v != null && Number.isFinite(v);

/** @param {number|null} v @param {number} d @param {string} lang @param {Mode} mode */
function fmtFix(v, d, lang, mode) {
  return ok(v) ? fixed(v, d, lang, mode) : DASH;
}

/** p-Wert: vier Stellen, sehr kleine als „< 0.0001“. */
function fmtP(v, lang, mode) {
  if (!ok(v)) return DASH;
  return v < 0.0001 ? `< ${fixed(0.0001, 4, lang, mode)}` : fixed(v, 4, lang, mode);
}

/**
 * Wert auf der Ratenskala: mindestens vier Stellen, bei kleinen Werten mehr,
 * damit vier gültige Ziffern bleiben; unter 1e-5 in Exponentschreibweise.
 */
function fmtRate(v, lang, mode) {
  if (!ok(v)) return DASH;
  if (v === 0) return fixed(v, 4, lang, mode);
  const mag = Math.floor(Math.log10(Math.abs(v)));
  if (mag < -5) {
    const s = v.toExponential(3);
    return mode === 'read' || lang !== 'de' ? s : s.replace('.', ',');
  }
  return fixed(v, Math.max(4, 3 - mag), lang, mode);
}

/** Anteil als Prozentpunkte mit zwei Stellen (kein „-0.00“). */
function fmtPp(v, lang, mode) {
  return fixed(roundTo(v * 100, 2) === 0 ? 0 : v * 100, 2, lang, mode);
}

/** Intervallgrenze: ±∞ als Zeichen. */
function bound(v, f) {
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  return f(v);
}

/**
 * Ein Wert des Berichts als Text.
 * @param {Fmt} f
 * @param {string} lang Sprache der Anzeige (bei `read` ohne Wirkung)
 * @param {Mode} mode
 * @returns {string}
 */
export function formatValue(f, lang, mode) {
  switch (f.t) {
    case 'fix': return fmtFix(f.v, f.d, lang, mode);
    case 'p': return fmtP(f.v, lang, mode);
    case 'rate': return fmtRate(f.v, lang, mode);
    case 'pp': return fmtPp(f.v, lang, mode);
    case 'counts': {
      const a = mode === 'read' ? String(f.a) : formatNumber(f.a, lang);
      const b = f.exposure ? free(f.b, lang, mode) : (mode === 'read' ? String(f.b) : formatNumber(f.b, lang));
      return `${a} / ${b}`;
    }
    case 'ci': {
      const one = (v) => (f.of === 'rate' ? fmtRate(v, lang, mode) : fmtFix(v, f.d ?? 4, lang, mode));
      const sep = mode === 'read' ? ', ' : '; ';
      return `[${bound(f.lo, one)}${sep}${bound(f.hi, one)}]`;
    }
    case 'ppci': return `[${fmtPp(f.lo, lang, mode)}; ${fmtPp(f.hi, lang, mode)}]`;
    default: return DASH;
  }
}

/**
 * Eine Zahl einer Zelle der Kreuztabelle.
 * @param {number} v @param {number|null} d Stellen; `null` für die beobachtete Anzahl
 * @param {string} lang @param {Mode} mode
 */
export function formatCell(v, d, lang, mode) {
  if (d === null) return mode === 'read' ? String(v) : formatNumber(v, lang);
  return fmtFix(v, d, lang, mode);
}

/**
 * Der Bericht in der Form von `read().result` (Texte wie die Altform) mit
 * `status: 'ok'`.
 * @param {RawReport} raw
 * @returns {Result}
 */
export function toReadResult(raw) {
  /** @type {Record<string, any>} */
  const out = {
    status: 'ok',
    kind: raw.kind,
    stats: raw.stats.map((s) => (s.params
      ? { num: s.num, key: s.key, labelKey: s.labelKey, params: { ...s.params }, value: formatValue(s.f, 'en', 'read') }
      : { num: s.num, key: s.key, labelKey: s.labelKey, value: formatValue(s.f, 'en', 'read') })),
    notes: raw.notes.map((n) => (n.params ? { key: n.key, params: { ...n.params } } : { key: n.key })),
    pValue: raw.pValue,
    ci: raw.ci ? [...raw.ci] : null,
    noteDetails: raw.noteDetails.map((w) => ({ code: w.code, values: { ...w.values } })),
    decision: raw.decision,
  };
  if (raw.decisionRaw) {
    const d = raw.decisionRaw;
    out.decisionParams = {
      lower: fmtPp(d.lower, 'en', 'read'), upper: fmtPp(d.upper, 'en', 'read'), unit: d.unit, alpha: d.alpha,
    };
  }
  out.basisKey = raw.basisKey;
  out.table = raw.table
    ? {
      cols: [...raw.table.cols],
      rows: raw.table.rows.map((r) => ({
        name: r.name,
        cells: r.cells.map((c) => ({
          obs: formatCell(c.obs, null, 'en', 'read'),
          exp: formatCell(c.exp, 2, 'en', 'read'),
          contrib: formatCell(c.contrib, 3, 'en', 'read'),
        })),
      })),
    }
    : null;
  if (raw.actions) out.actions = raw.actions.map((a) => ({ key: a.key }));
  return /** @type {Result} */ (out);
}

/**
 * Die Äquivalenzgrenze der Entscheidung in Prozentpunkten für die Anzeige.
 * @param {number} v Anteil @param {string} lang
 */
export function displayPp(v, lang) {
  return fmtPp(v, lang, 'display');
}
