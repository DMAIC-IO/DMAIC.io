/**
 * D.Mike — Ishikawa: Konfiguration des Trend-Diagramms.
 *
 * Reine Funktion ohne DOM und ohne Uhr: aus den Ständen (Snapshots, ältester
 * zuerst, zuletzt der aktuelle Stand) wird die Konfiguration für das Widget
 * `trend-chart`. Farben sind die Linienfarben des Moduls als CSS-Variablen.
 */

/** Ränder des Trend-Diagramms. */
const TREND_LAYOUT = Object.freeze({ padT: 30, padR: 30, padB: 55, padL: 45 });
/** Linienfarben im CSS (`--ishikawa-line-1` … `-16`). */
const LINE_COUNT = 16;
/** Längere Namen der Stände werden auf zwölf Zeichen und „…“ gekürzt. */
const NAME_MAX = 14;

/**
 * Ein Stand im Trend.
 * @typedef {object} TrendState
 * @property {string} name Name des Snapshots bzw. „Aktuell“
 * @property {string} date Zeitpunkt (ISO)
 * @property {{ rows: ReadonlyArray<{ stableId: string, name: string, ratings: Record<string, number> }>, experts: ReadonlyArray<{ id: number }> }} data
 */

/**
 * Konfiguration des Widgets `trend-chart`.
 * @typedef {object} TrendConfig
 * @property {Array<{ sid: string, name: string, color: string, points: Array<{ x: number, y: number }> }>} series
 * @property {Array<{ date: string, name: string }>} xLabels
 * @property {number} xCount
 * @property {{ padT: number, padR: number, padB: number, padL: number }} layout
 */

/**
 * Mittel der Bewertungen einer Zeile über die Experten ihres Stands; ohne
 * Bewertung `null`.
 * @param {{ ratings: Record<string, number> }} row @param {ReadonlyArray<{ id: number }>} experts
 * @returns {number|null}
 */
function scoreAmong(row, experts) {
  const v = experts.map((e) => row.ratings?.[e.id]).filter((x) => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Trend der Scores je Ursache (über die stableId) über die Stände.
 * @param {ReadonlyArray<TrendState>} states ältester Stand zuerst
 * @param {{ lang: string }} opts Sprache der Datumsangaben
 * @returns {TrendConfig|null} `null` mit weniger als zwei Ständen oder ohne Bewertung
 */
export function trendConfig(states, { lang }) {
  if (states.length < 2) return null;
  const ids = new Set();
  for (const s of states) for (const r of s.data.rows) if (r.stableId) ids.add(r.stableId);

  const series = [];
  for (const sid of ids) {
    let name = '';
    for (let i = states.length - 1; i >= 0 && !name; i--) {
      const r = states[i].data.rows.find((x) => x.stableId === sid);
      name = (r?.name ?? '').trim();
    }
    const points = [];
    states.forEach((s, x) => {
      const r = s.data.rows.find((rr) => rr.stableId === sid);
      const y = r ? scoreAmong(r, s.data.experts) : null;
      if (y !== null) points.push({ x, y });
    });
    if (points.length) {
      series.push({ sid, name: name || sid, color: `var(--ishikawa-line-${(series.length % LINE_COUNT) + 1})`, points });
    }
  }
  if (!series.length) return null;

  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const xLabels = states.map((s) => {
    const d = new Date(s.date);
    const date = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
    const n = s.name ?? '';
    return { date, name: n.length > NAME_MAX ? `${n.substring(0, NAME_MAX - 2)}…` : n };
  });
  return { series, xLabels, xCount: states.length, layout: { ...TREND_LAYOUT } };
}
