/**
 * D.Mike — Ishikawa: Konfiguration der Diagramme.
 *
 * Reine Funktionen ohne DOM und ohne Uhr (`now` gibt der Aufrufer):
 * - `trendConfig`: aus den Ständen (Snapshots, ältester zuerst, zuletzt der
 *   aktuelle Stand) die Konfiguration für das Widget `trend-chart`;
 * - `ganttConfig`: Zeitplan der datierten Experimente für `gantt-chart`;
 * - `costConfig`: Geld und Stunden über die Zeit (kumuliert oder je Tag) für
 *   `cumulative-cost-chart`.
 * Ohne Daten liefern sie `null`. Farben sind CSS-Variablen des Moduls,
 * Daten folgen der Datumsregel aus `dates.js`.
 */
import { dayMonth } from './dates.js';

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

  const xLabels = states.map((s) => {
    const n = s.name ?? '';
    return { date: dayMonth(s.date, lang), name: n.length > NAME_MAX ? `${n.substring(0, NAME_MAX - 2)}…` : n };
  });
  return { series, xLabels, xCount: states.length, layout: { ...TREND_LAYOUT } };
}

const DAY = 86400000;
/** Ränder und Zeilenhöhe des Zeitplans. */
const GANTT_LAYOUT = Object.freeze({ labelW: 220, padL: 8, padR: 16, padT: 30, padB: 24, rowH: 26 });
/** Ränder und Höhe der Zeichenfläche des Kostenverlaufs. */
const COST_LAYOUT = Object.freeze({ labelW: 220, padL: 8, padR: 48, padT: 16, padB: 28, innerH: 140 });

/**
 * Ein Experiment, soweit die Diagramme es lesen.
 * @typedef {object} ExperimentLike
 * @property {string} title
 * @property {string} responsible
 * @property {string} status
 * @property {string} startDate
 * @property {string} endDate
 * @property {number|null} [costMoney]
 * @property {number|null} [costHours]
 */

/**
 * Konfiguration des Widgets `gantt-chart`.
 * @typedef {object} GanttConfig
 * @property {Array<{ start: number, end: number, label: string, status: string, color: string, responsible: string, startDate: string, endDate: string }>} tasks
 * @property {{ minT: number, maxT: number }} xDomain
 * @property {number[]} ticks
 * @property {string[]} tickLabels
 * @property {number} stepDays
 * @property {number} now
 * @property {boolean} showToday
 * @property {string} todayLabel
 * @property {{ labelW: number, padL: number, padR: number, padT: number, padB: number, rowH: number }} layout
 */

/**
 * Konfiguration des Widgets `cumulative-cost-chart`.
 * @typedef {object} CostConfig
 * @property {'cumulative'|'rate'} mode
 * @property {Array<{ t: number, v: number }>} moneyPts
 * @property {Array<{ t: number, v: number }>} hoursPts
 * @property {number} peakMoney
 * @property {number} peakHours
 * @property {{ min: number, max: number }} xDomain
 * @property {number[]} ticks
 * @property {string[]} tickLabels
 * @property {number} stepDays
 * @property {string} moneyUnit
 * @property {string} hoursUnit
 * @property {string} moneyLabel
 * @property {string} hoursLabel
 * @property {number} now
 * @property {boolean} showToday
 * @property {string} lang
 * @property {{ labelW: number, padL: number, padR: number, padT: number, padB: number, innerH: number }} layout
 */

/** ms der lokalen Mitternacht eines Datums `JJJJ-MM-TT`. @param {string} s @returns {number} */
const dayStart = (s) => new Date(`${s}T00:00:00`).getTime();

/** Hat Start und Ende als gültige Daten. @param {ExperimentLike} x @returns {boolean} */
const isDated = (x) => Boolean(x.startDate && x.endDate) && Number.isFinite(dayStart(x.startDate)) && Number.isFinite(dayStart(x.endDate));

/**
 * Teilung und Teilstriche der Zeitachse: täglich bis 14 Tage, wöchentlich bis
 * 60, monatlich bis 365, sonst quartalsweise; ab Mitternacht des Beginns.
 * @param {number} minT @param {number} maxT @param {string} lang
 * @returns {{ stepDays: number, ticks: number[], tickLabels: string[] }}
 */
function timeTicks(minT, maxT, lang) {
  const spanDays = Math.max(maxT - minT, DAY) / DAY;
  let stepDays = 90;
  if (spanDays <= 14) stepDays = 1;
  else if (spanDays <= 60) stepDays = 7;
  else if (spanDays <= 365) stepDays = 30;
  const ticks = [];
  const first = new Date(minT);
  first.setHours(0, 0, 0, 0);
  for (let d = first.getTime(); d <= maxT; d += stepDays * DAY) ticks.push(d);
  return { stepDays, ticks, tickLabels: ticks.map((t) => dayMonth(t, lang)) };
}

/**
 * Zeitplan der Experimente mit Start und Ende; ein Balken dauert mindestens
 * einen Tag. Ohne Titel heißt ein Balken `#<Position in der Liste>`.
 * @param {ReadonlyArray<ExperimentLike>} experiments
 * @param {{ now: number, lang: string, todayLabel: string }} opts
 * @returns {GanttConfig|null} `null` ohne datiertes Experiment
 */
export function ganttConfig(experiments, { now, lang, todayLabel }) {
  const tasks = [];
  experiments.forEach((x, i) => {
    if (!isDated(x)) return;
    const start = dayStart(x.startDate);
    tasks.push({
      start,
      end: Math.max(dayStart(x.endDate), start + DAY),
      label: (x.title && x.title.trim()) || `#${i + 1}`,
      status: x.status,
      color: `var(--ishikawa-status-${x.status})`,
      responsible: x.responsible || '',
      startDate: x.startDate,
      endDate: x.endDate,
    });
  });
  if (!tasks.length) return null;
  const minT = Math.min(...tasks.map((t) => t.start));
  const maxT = Math.max(...tasks.map((t) => t.end));
  return {
    tasks,
    xDomain: { minT, maxT },
    ...timeTicks(minT, maxT, lang),
    now,
    showToday: now >= minT && now <= maxT,
    todayLabel,
    layout: { ...GANTT_LAYOUT },
  };
}

/**
 * Geld und Stunden der datierten Experimente, gleichmäßig über ihre Tage
 * verteilt: `cumulative` summiert auf (beginnt bei 0), `rate` zeigt je Tag
 * eine Stufe. Fehlende Kosten zählen als 0.
 * @param {ReadonlyArray<ExperimentLike>} experiments
 * @param {'cumulative'|'rate'} mode
 * @param {{ now: number, lang: string, moneyUnit: string, hoursUnit: string, moneyLabel: string, hoursLabel: string }} opts
 * @returns {CostConfig|null} `null` ohne datiertes Experiment mit Geld oder Stunden
 */
export function costConfig(experiments, mode, { now, lang, moneyUnit, hoursUnit, moneyLabel, hoursLabel }) {
  const dated = experiments.filter(isDated);
  if (!dated.some((x) => (x.costMoney ?? 0) > 0 || (x.costHours ?? 0) > 0)) return null;
  const items = dated.map((x) => {
    const start = dayStart(x.startDate);
    const end = Math.max(dayStart(x.endDate), start + DAY);
    const days = Math.max(1, Math.round((end - start) / DAY));
    return { start, end, money: (x.costMoney ?? 0) / days, hours: (x.costHours ?? 0) / days };
  });
  const minT = Math.min(...items.map((i) => i.start));
  const maxT = Math.max(...items.map((i) => i.end));
  const totalDays = Math.max(1, Math.round((maxT - minT) / DAY));

  const moneyPts = [];
  const hoursPts = [];
  let peakMoney = 0;
  let peakHours = 0;
  let cumMoney = 0;
  let cumHours = 0;
  if (mode === 'cumulative') {
    moneyPts.push({ t: minT, v: 0 });
    hoursPts.push({ t: minT, v: 0 });
  }
  for (let d = 0; d < totalDays; d++) {
    const t = minT + d * DAY;
    let money = 0;
    let hours = 0;
    for (const it of items) {
      if (t >= it.start && t < it.end) { money += it.money; hours += it.hours; }
    }
    if (mode === 'cumulative') {
      cumMoney += money;
      cumHours += hours;
      moneyPts.push({ t: t + DAY, v: cumMoney });
      hoursPts.push({ t: t + DAY, v: cumHours });
    } else {
      moneyPts.push({ t, v: money }, { t: t + DAY, v: money });
      hoursPts.push({ t, v: hours }, { t: t + DAY, v: hours });
      peakMoney = Math.max(peakMoney, money);
      peakHours = Math.max(peakHours, hours);
    }
  }
  if (mode === 'cumulative') {
    peakMoney = cumMoney;
    peakHours = cumHours;
  }
  return {
    mode,
    moneyPts,
    hoursPts,
    peakMoney,
    peakHours,
    xDomain: { min: minT, max: maxT },
    ...timeTicks(minT, maxT, lang),
    moneyUnit,
    hoursUnit,
    moneyLabel,
    hoursLabel,
    now,
    showToday: now >= minT && now <= maxT,
    lang,
    layout: { ...COST_LAYOUT },
  };
}
