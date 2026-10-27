/**
 * D.Mike — Ishikawa chart configuration (ishikawa-charts.js)
 *
 * Pure config builders for the Gantt, cumulative-cost and trend chart types,
 * plus the rating-cell colour. No DOM, no state, no Date.now(): `now` and
 * `lang` are injected by the caller.
 *
 * Spec: docs/superpowers/specs/2026-10-25-ishikawa-agent-release-design.md (E2)
 */

import { LINE_COLS } from './ishikawa-constants.js';

/** Rating-cell background gradient (green→amber→red), matches legacy `_ratingBg`. */
export function ratingBg(v) {
  if (v === '' || v === undefined || v === null || isNaN(v)) return '';
  const n = Math.max(0, Math.min(9, Number(v)));
  const t = n / 9;
  let r, g, b;
  if (t < 0.5) {
    const p = t * 2;
    r = Math.round(134 + (253 - 134) * p);
    g = Math.round(239 + (224 - 239) * p);
    b = Math.round(172 + (71 - 172) * p);
  } else {
    const p = (t - 0.5) * 2;
    r = Math.round(253 + (252 - 253) * p);
    g = Math.round(224 + (165 - 224) * p);
    b = Math.round(71 + (165 - 71) * p);
  }
  return `background:rgba(${r},${g},${b},0.35);border-color:rgba(${r},${g},${b},0.5);color:var(--color-text-primary)`;
}

/** Status → bar colour (literal hex, kept for visual parity with the legacy SVG). */
const GANTT_STATUS_COLOR = {
  planned: '#94a3b8', running: '#2563eb', done: '#16a34a', cancelled: '#dc2626',
};

/** Layout constants for the gantt chart type (shared spec — see types/gantt.js). */
export const GANTT_LAYOUT = { labelW: 220, padL: 8, padR: 16, padT: 30, padB: 24, rowH: 26 };

/**
 * Pure config builder for the framework `gantt` chart type.
 *
 * Extracted verbatim (geometry-wise) from the former bespoke `renderGantt`
 * SVG builder: filters experiments to those with parseable start/end dates,
 * normalizes each to `{ start, end }` ms (end clamped to ≥ start + 1 day),
 * computes the time domain, the adaptive tick array and precomputed tick
 * labels. No DOM access, no `Date.now()` — `now` and `lang`
 * are injected by the caller for testability.
 *
 * @param {Array<Object>} experiments - raw experiment records
 * @param {Object} opts
 * @param {number} opts.now - "today" timestamp (ms)
 * @param {string} [opts.lang='de'] - 'de' | 'en' (tick-label locale)
 * @returns {Object} chart config consumed by the Gantt type
 */
export function computeGanttConfig(experiments, opts) {
  const o = opts || {};
  const lang = o.lang || 'de';
  const dayMs = 86400000;

  // Tag each record with its ORIGINAL position in the full input array
  // BEFORE filtering, so the untitled `#N` fallback label matches the legacy
  // `experiments.indexOf(x) + 1` (1-based full-array position) even when a
  // filtered-out (invalid-date) record precedes an untitled one.
  const xs = (experiments || [])
    .map((x, originalIndex) => ({ x, originalIndex }))
    .filter(
      ({ x }) => x.startDate && x.endDate && !isNaN(Date.parse(x.startDate)) && !isNaN(Date.parse(x.endDate)),
    );

  const layout = { ...GANTT_LAYOUT };

  if (xs.length === 0) {
    return { isEmpty: true, tasks: [], xDomain: { minT: 0, maxT: 0 }, ticks: [], tickLabels: [], stepDays: 1, now: o.now, showToday: false, layout };
  }

  const parseD = (s) => new Date(`${s  }T00:00:00`);
  const tasks = xs.map(({ x, originalIndex }) => {
    const s = parseD(x.startDate).getTime();
    const e = parseD(x.endDate).getTime();
    const end = Math.max(e, s + dayMs);
    const labelText = (x.title && x.title.trim()) || `#${originalIndex + 1}`;
    return {
      start: s,
      end,
      label: labelText,
      status: x.status,
      color: GANTT_STATUS_COLOR[x.status] || GANTT_STATUS_COLOR.planned,
      responsible: x.responsible || '',
      startDate: x.startDate,
      endDate: x.endDate,
    };
  });

  const minT = Math.min(...tasks.map((t) => t.start));
  const maxT = Math.max(...tasks.map((t) => t.end));
  const span = Math.max(maxT - minT, dayMs);
  const spanDays = span / dayMs;

  let stepDays;
  if (spanDays <= 14) stepDays = 1;
  else if (spanDays <= 60) stepDays = 7;
  else if (spanDays <= 365) stepDays = 30;
  else stepDays = 90;

  const ticks = [];
  const startD = new Date(minT);
  startD.setHours(0, 0, 0, 0);
  for (let d = startD.getTime(); d <= maxT; d += stepDays * dayMs) ticks.push(d);

  const fmtLocale = lang === 'de' ? 'de-DE' : 'en-GB';
  const tickLabels = ticks.map((t) =>
    new Date(t).toLocaleDateString(fmtLocale, { day: '2-digit', month: '2-digit' }));

  const now = o.now;
  const showToday = typeof now === 'number' && now >= minT && now <= maxT;

  return {
    isEmpty: false,
    tasks,
    xDomain: { minT, maxT },
    ticks,
    tickLabels,
    stepDays,
    now,
    showToday,
    layout,
  };
}

/** Layout constants for the cumulative-cost chart type (shared spec — see types/cumulative-cost.js). */
export const COST_LAYOUT = { labelW: 220, padL: 8, padR: 48, padT: 16, padB: 28, innerH: 140 };

/**
 * Pure config builder for the framework `cumulative-cost` chart type.
 *
 * Extracted verbatim (geometry/math-wise) from the former bespoke
 * `renderCostChart(mode)` SVG builder. Filters experiments to those with
 * parseable start/end dates AND a positive money or hours cost; per item
 * derives `days = round((end-start)/dayMs)` (min 1) and the per-day money/hours
 * rates. Then builds the two point series (money + hours) for the requested
 * `mode`:
 *   - `cumulative`: seed `(minT, 0)` then push `(dayStart+dayMs, runningCum)`
 *     for each day; peak = the final cumulative value.
 *   - `rate`: push TWO step points `(dayStart, rate)` and
 *     `(dayStart+dayMs, rate)` per day; peak = the maximum daily rate.
 *
 * Also computes the pinned time domain, the adaptive date-tick array with
 * precomputed labels, the per-mode unit strings (€/h vs €/d, h/d) and the
 * today flag. No DOM access, no `Date.now()` — `now` and `lang` are injected
 * by the caller for testability.
 *
 * @param {Array<Object>} experiments - raw experiment records
 * @param {('cumulative'|'rate')} mode - which series shape to build
 * @param {Object} opts
 * @param {number} opts.now - "today" timestamp (ms)
 * @param {string} [opts.lang='de'] - 'de' | 'en' (tick-label locale)
 * @returns {Object} chart config consumed by the CumulativeCost type
 */
export function computeCostConfig(experiments, mode = 'cumulative', opts) {
  const o = opts || {};
  const lang = o.lang || 'de';
  const dayMs = 86400000;
  const layout = { ...COST_LAYOUT };
  const moneyUnit = mode === 'rate' ? '€/d' : '€';
  const hoursUnit = mode === 'rate' ? 'h/d' : 'h';

  const xs = (experiments || []).filter(
    (x) => x.startDate && x.endDate && !isNaN(Date.parse(x.startDate)) && !isNaN(Date.parse(x.endDate)),
  );
  const hasAny = xs.some((x) => (parseFloat(x.costMoney) || 0) > 0 || (parseFloat(x.costHours) || 0) > 0);

  if (xs.length === 0 || !hasAny) {
    return {
      isEmpty: true, mode, moneyPts: [], hoursPts: [], peakMoney: 0, peakHours: 0,
      xDomain: { min: 0, max: 0 }, ticks: [], tickLabels: [], stepDays: 1,
      moneyUnit, hoursUnit, now: o.now, showToday: false, layout,
    };
  }

  const parseD = (s) => new Date(`${s  }T00:00:00`).getTime();
  const items = xs.map((x) => {
    const s = parseD(x.startDate);
    const e = Math.max(parseD(x.endDate), s + dayMs);
    const days = Math.max(1, Math.round((e - s) / dayMs));
    return {
      start: s,
      end: e,
      moneyPerDay: (parseFloat(x.costMoney) || 0) / days,
      hoursPerDay: (parseFloat(x.costHours) || 0) / days,
    };
  });

  const minT = Math.min(...items.map((i) => i.start));
  const maxT = Math.max(...items.map((i) => i.end));
  const totalDays = Math.max(1, Math.round((maxT - minT) / dayMs));

  const moneyPts = [];
  const hoursPts = [];
  let cumMoney = 0;
  let cumHours = 0;
  let peakMoney = 0;
  let peakHours = 0;

  if (mode === 'cumulative') {
    moneyPts.push({ t: minT, v: 0 });
    hoursPts.push({ t: minT, v: 0 });
    for (let d = 0; d < totalDays; d++) {
      const dayStart = minT + d * dayMs;
      items.forEach((it) => {
        if (dayStart >= it.start && dayStart < it.end) { cumMoney += it.moneyPerDay; cumHours += it.hoursPerDay; }
      });
      moneyPts.push({ t: dayStart + dayMs, v: cumMoney });
      hoursPts.push({ t: dayStart + dayMs, v: cumHours });
    }
    peakMoney = cumMoney;
    peakHours = cumHours;
  } else {
    for (let d = 0; d < totalDays; d++) {
      const dayStart = minT + d * dayMs;
      let mRate = 0;
      let hRate = 0;
      items.forEach((it) => {
        if (dayStart >= it.start && dayStart < it.end) { mRate += it.moneyPerDay; hRate += it.hoursPerDay; }
      });
      moneyPts.push({ t: dayStart, v: mRate });
      moneyPts.push({ t: dayStart + dayMs, v: mRate });
      hoursPts.push({ t: dayStart, v: hRate });
      hoursPts.push({ t: dayStart + dayMs, v: hRate });
      if (mRate > peakMoney) peakMoney = mRate;
      if (hRate > peakHours) peakHours = hRate;
    }
  }

  const span = Math.max(maxT - minT, dayMs);
  const spanDays = span / dayMs;
  let stepDays;
  if (spanDays <= 14) stepDays = 1;
  else if (spanDays <= 60) stepDays = 7;
  else if (spanDays <= 365) stepDays = 30;
  else stepDays = 90;

  const ticks = [];
  const startD = new Date(minT);
  startD.setHours(0, 0, 0, 0);
  for (let d = startD.getTime(); d <= maxT; d += stepDays * dayMs) ticks.push(d);

  const fmtLocale = lang === 'de' ? 'de-DE' : 'en-GB';
  const tickLabels = ticks.map((t) =>
    new Date(t).toLocaleDateString(fmtLocale, { day: '2-digit', month: '2-digit' }));

  const now = o.now;
  const showToday = typeof now === 'number' && now >= minT && now <= maxT;

  return {
    isEmpty: false,
    mode,
    moneyPts,
    hoursPts,
    peakMoney,
    peakHours,
    xDomain: { min: minT, max: maxT },
    span,
    ticks,
    tickLabels,
    stepDays,
    moneyUnit,
    hoursUnit,
    now,
    showToday,
    lang,
    layout,
  };
}

/** Layout constants for the trend chart type (shared spec — see types/trend.js). */
export const TREND_LAYOUT = { padT: 30, padR: 30, padB: 55, padL: 45 };

/**
 * Pure config builder for the framework `trend` chart type.
 *
 * Extracted (geometry-wise) from the former bespoke canvas `renderTrend()`:
 * given the ordered list of `trendStates` (oldest → current), collects every
 * row `stableId`, builds one series per sid with points `{ x: stateIndex,
 * y: score }` (null scores skipped), derives the latest non-empty hypothesis
 * name as the series label, assigns the `LINE_COLS[i % len]` colour, and
 * precomputes the two-line x-axis labels (locale date + truncated state name).
 *
 * Pure: no DOM, no canvas, no `Date.now()`. Scoring is injected via
 * `opts.calcScore(row, experts)` so the builder stays testable.
 *
 * Returns `{ isEmpty }` when fewer than 2 states are supplied (caller shows the
 * min-snapshots empty state) or when no series carry any points.
 *
 * @param {Array<{name:string,date:string,data:{rows:Array,experts:Array}}>} trendStates
 * @param {Object} opts
 * @param {(row:Object, experts:Array)=>(number|null)} opts.calcScore - score fn
 * @param {string} [opts.lang='de'] - 'de' | 'en' (date-label locale)
 * @returns {Object} chart config consumed by the Trend type
 */
export function computeTrendConfig(trendStates, opts) {
  const o = opts || {};
  const lang = o.lang || 'de';
  const calcScore = o.calcScore;
  const layout = { ...TREND_LAYOUT };
  const states = trendStates || [];

  if (states.length < 2) {
    return { isEmpty: true, reason: 'minSnaps', series: [], xLabels: [], xCount: states.length, yDomain: [0, 9], layout };
  }

  // Collect every stableId across all states (insertion order preserved).
  const allIds = new Set();
  states.forEach((s) => (s.data.rows || []).forEach((r) => { if (r.stableId) allIds.add(r.stableId); }));

  const series = [];
  allIds.forEach((sid) => {
    // Latest non-empty name wins (scan newest → oldest).
    let name = '';
    for (let i = states.length - 1; i >= 0; i--) {
      const r = (states[i].data.rows || []).find((rr) => rr.stableId === sid);
      if (r && r.name && r.name.trim()) { name = r.name.trim(); break; }
    }
    if (!name) name = sid;

    const points = [];
    states.forEach((st, xi) => {
      const r = (st.data.rows || []).find((rr) => rr.stableId === sid);
      if (r) {
        const sc = calcScore(r, st.data.experts || []);
        if (sc !== null && sc !== undefined) points.push({ x: xi, y: sc });
      }
    });
    if (points.length > 0) {
      series.push({ sid, name, color: LINE_COLS[series.length % LINE_COLS.length], points, visible: true });
    }
  });

  if (!series.length) {
    return { isEmpty: true, reason: 'noData', series: [], xLabels: [], xCount: states.length, yDomain: [0, 9], layout };
  }

  const fmtLocale = lang === 'de' ? 'de-DE' : 'en-GB';
  const xLabels = states.map((st) => {
    const d = new Date(st.date);
    const dateStr = isNaN(d.getTime()) ? '' : d.toLocaleDateString(fmtLocale, { day: '2-digit', month: '2-digit' });
    const nm = st.name && st.name.length > 14 ? `${st.name.substring(0, 12)  }…` : (st.name || '');
    return { date: dateStr, name: nm };
  });

  return {
    isEmpty: false,
    series,
    xLabels,
    xCount: states.length,
    yDomain: [0, 9],
    layout,
  };
}
