/**
 * D.Mike — Ishikawa 6M Module (ishikawa.js)
 *
 * Cause & Effect (Fishbone) diagram structured as a hypothesis table with
 * expert scoring, 6M categories, snapshots + diff, Pareto/Trend/Gantt/Cost
 * charts, image galleries and CSV export. DMAIC phase: Analyze.
 *
 * Migrated to createModule + Alpine CSP. All business logic (cause-tree ops,
 * scoring, snapshots/diff, CRUD, pareto data) lives in ishikawa-model.js and is
 * unit-tested. This file holds only view transformations (i18n category labels,
 * CSS classes, rating-cell colours, glyphs, '–' formatting), event handlers, and
 * the imperative chart widgets (Pareto, Gantt and dual-axis Cost via chartManager;
 * Trend canvas — chart-tier, not pure-template concerns). The three form modals
 * (cat rename, link-experiments, choose-hypotheses) are authored as Alpine
 * templates in ishikawa.html (hidden home, `x-ref`), bound to draft state, and
 * borrowed into the shared `showModal.form` overlay (restored to home on close).
 */

import { createModule } from '../../core/template-module.js';
import { resolveDateOffset } from '../../core/date-offset.js';
import { h } from '../../core/dom.js';
import { compressImageToBudget } from '../../core/image-upload.js';
import { draggableRows } from '../../ui/draggable-list.js';
import { State, MAX_DEPTH_CLASS } from './ishikawa-model.js';
import { CATS, STATUS_CSS, LINE_COLS } from './ishikawa-constants.js';

/** Rating-cell background gradient (green→amber→red), matches legacy `_ratingBg`. */
function ratingBg(v) {
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

// ── Dashboard tile descriptor (6M categories, status + top-scored) ──
// 6M category palette — keys/colors/order mirror the persisted state model.
const ISHIKAWA_CATS = CATS;

/** Collect all Ishikawa instances across phases (phase-set is cycle-agnostic). */
function enumerateIshikawa(ctx) {
  const phases = ctx.stateManager.get('phases') || {};
  const out = [];
  for (const list of Object.values(phases)) {
    for (const inst of (list || [])) {
      if (inst.moduleId !== 'ishikawa') continue;
      const label = inst.customName || ctx.i18n.t('modules.ishikawa.name');
      out.push({
        tileId: `ishikawa:${inst.instanceId}`,
        instanceId: inst.instanceId,
        title: `Ishikawa — ${label}`,
      });
    }
  }
  return out;
}

const mod = createModule({
  config: {
    id: 'ishikawa',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.ishikawa',
    version: '2.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.csv', title: 'export.csv', onClick: (d) => d.exportCSV() },
      ] },
    ],
    dashboardTile: {
      defaultW: 3, defaultH: 10, minW: 2, minH: 6,
      enumerate: enumerateIshikawa,
      /** @param {HTMLElement} host  @param {{tileId,instanceId,state,i18n,theme,chartManager}} args */
      render(host, { state, i18n }) {
        const rows    = (state && Array.isArray(state.rows)) ? state.rows : [];
        const experts = (state && Array.isArray(state.experts)) ? state.experts : [];
        const problem = (state && state.problem) || '';
        const catLabels = (state && state.catLabels) || {};
        const catLabel = (key) => {
          const c = catLabels[key];
          return (c && c.trim()) ? c.trim() : i18n.t(`modules.ishikawa.cat.${key}`);
        };

        if (rows.length === 0) {
          host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.ishikawaEmpty')));
          return;
        }

        const effCat = (r) => {
          if (r.category) return r.category;
          if (r.parentId !== null) {
            const p = rows.find(x => x.id === r.parentId);
            if (p) return effCat(p);
          }
          return '';
        };

        const catCounts = {};
        ISHIKAWA_CATS.forEach(c => catCounts[c.key] = 0);
        rows.forEach(r => { const ec = effCat(r); if (ec && Object.hasOwn(catCounts, ec)) catCounts[ec]++; });
        const totalCategorized = Object.values(catCounts).reduce((a, b) => a + b, 0);

        const statusCounts = { open: 0, testing: 0, confirmed: 0, rejected: 0 };
        rows.forEach(r => { const s = r.status || 'open'; if (Object.hasOwn(statusCounts, s)) statusCounts[s]++; });

        const children = [];
        if (problem) {
          children.push(h('div', {
            class: 'dashboard-charter__problem',
            style: 'margin-bottom:8px;font-size:var(--font-size-sm);opacity:0.8',
          }, problem));
        }

        children.push(h('div', { class: 'dashboard-fmea__summary' },
          h('span', {}, `${i18n.t('dashboard.ishikawaHypotheses')  }: `, h('strong', {}, String(rows.length))),
          h('span', {}, `${i18n.t('dashboard.ishikawaExperts')  }: `, h('strong', {}, String(experts.length))),
        ));

        if (totalCategorized > 0) {
          children.push(h('div', { class: 'dashboard-fmea__bar' },
            ...ISHIKAWA_CATS.map(c => {
              const pct = catCounts[c.key] / totalCategorized * 100;
              if (pct === 0) return null;
              return h('div', {
                class: 'dashboard-fmea__bar-seg',
                style: `width:${pct}%;background:${c.color}`,
                title: `${catLabel(c.key)}: ${catCounts[c.key]}`,
              });
            }).filter(Boolean)));
        }

        children.push(h('div', { class: 'dashboard-fmea__legend' },
          ...ISHIKAWA_CATS.filter(c => catCounts[c.key] > 0).map(c =>
            h('span', { class: 'dashboard-fmea__legend-item' },
              h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${c.color}` }),
              ` ${catLabel(c.key)}: ${catCounts[c.key]}`))));

        const statusColors = {
          open: 'var(--color-text-tertiary)', testing: 'var(--color-info)',
          confirmed: 'var(--color-success)', rejected: 'var(--color-error)',
        };
        const statusItems = ['open', 'testing', 'confirmed', 'rejected'].filter(s => statusCounts[s] > 0);
        if (statusItems.length) {
          children.push(h('div', { class: 'dashboard-fmea__legend', style: 'margin-top:4px' },
            ...statusItems.map(s => h('span', { class: 'dashboard-fmea__legend-item' },
              h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${statusColors[s]}` }),
              ` ${i18n.t(`modules.ishikawa.status.${s}`)}: ${statusCounts[s]}`))));
        }

        const scored = rows
          .filter(r => experts.length && experts.map(e => r.ratings?.[e.id]).filter(x => x != null && x !== '').length > 0)
          .map(r => {
            const vals = experts.map(e => r.ratings?.[e.id]).filter(x => x != null && x !== '');
            return { name: r.name, score: vals.reduce((a, b) => a + b, 0) / vals.length, cat: effCat(r) };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        if (scored.length) {
          children.push(h('div', { class: 'dashboard-fmea__top-label' }, i18n.t('dashboard.ishikawaTopScored')));
          children.push(h('ol', { class: 'dashboard-fmea__top-list' },
            ...scored.map(t => {
              const catObj = ISHIKAWA_CATS.find(c => c.key === t.cat);
              const color = catObj ? catObj.color : 'var(--color-text-secondary)';
              return h('li', { class: 'dashboard-fmea__top-item' },
                h('span', { class: 'dashboard-fmea__top-desc' }, t.name || '—'),
                h('span', { class: 'dashboard-fmea__top-rpn', style: `color:${color}` }, t.score.toFixed(1)));
            })));
        }

        host.replaceChildren(...children);
      },
    },
  },
  Model: State,

  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.experiments)) {
      result.experiments.forEach(e => {
        e.startDate = resolveDateOffset(e.startDate);
        e.endDate = resolveDateOffset(e.endDate);
      });
    }
    if (Array.isArray(result.facts)) {
      result.facts.forEach(f => { f.date = resolveDateOffset(f.date); });
    }
    return result;
  },

  data(module, _t) {
    const i18n = () => module._context.i18n;
    return {
      // Reorderable rows for all three tables (.dmike-table--draggable). The
      // mixin owns the drag plumbing and Alt+Arrow; the move semantics stay in
      // the model. `causes` is a tree, so keyboard movement there is confined
      // to siblings — the rendered list is a flattened tree and a raw index
      // step would jump into a foreign parent. Facts and experiments are flat.
      ...draggableRows({
        onMove({ group, sourceId, targetId }) {
          if (group === 'causes') this.model.moveRowBefore(sourceId, targetId);
          else if (group === 'experiments') this.model.moveExperimentBefore(sourceId, targetId);
          else if (group === 'facts') this.model.moveFactBefore(sourceId, targetId);
        },
        rowIds(group, id) {
          if (group === 'experiments') return this.model.experiments.map(x => x.id);
          if (group === 'facts') return this.model.facts.map(f => f.id);
          const row = this.model.rows.find(r => r.id === id);
          if (!row) return [];
          return this.model.ordered()
            .filter(r => r.parentId === row.parentId)
            .map(r => r.id);
        },
        t: (key, params) => i18n().t(key, params),
      }),

      // ── Transient UI state (never persisted) ──────────────────
      activeTab: 'problem',
      expertDraft: '',
      snapDraft: '',
      collapsed: {},          // { [rowId]: true }
      activeFilter: 'all',
      compareSnapId: null,
      trendVisible: false,
      hiddenLines: {},        // { [stableId]: true }
      paretoSource: 'current',
      _paretoChart: null,
      _ganttChart: null,
      _costCumChart: null,
      _costRateChart: null,
      _trendChart: null,
      // Dedicated stale-guard for the trend chart. The trend (hypotheses tab)
      // can render concurrently with the pareto chart, and shares no lifecycle
      // with the experiment-tab charts — its own counter avoids cross-chart
      // create() cannibalization.
      _trendGen: 0,
      _renderGen: 0,
      // Per-mode stale-guard counters for the two cost-chart instances. Kept
      // separate from `_renderGen` (gantt/pareto) because all three experiment-
      // tab charts render concurrently — a shared counter would let one
      // instance's async create() cannibalize another's freshly mounted chart.
      _costGen: { cumulative: 0, rate: 0 },
      _activeColorPicker: null,
      paretoEmptyMsg: '',     // empty-state message for pareto chart (sibling anchor)
      trendEmptyMsg: '',      // empty-state message for trend chart (sibling anchor)
      ganttEmptyMsg: '',      // empty-state message for gantt chart (sibling anchor)
      costEmptyMsg: '',       // empty-state message for cumulative cost chart (sibling anchor)
      costRateEmptyMsg: '',   // empty-state message for cost-rate chart (sibling anchor)

      // ── Modal-form drafts (bound to the borrowed in-template forms) ──
      catRenameDraft: [],     // [{ key, color, def, name }]
      expLinkDraft: { hint: '', items: [] }, // link experiments → a hypothesis
      hypLinkDraft: { items: [] },           // choose hypotheses → an experiment

      cats: CATS,

      // ── Lifecycle ─────────────────────────────────────────────

      init() {
        this.dragRowsInit();
        // Render the active tab's charts after first paint.
        this.$nextTick(() => this.renderTabCharts());
      },

      destroy() {
        this.dragRowsDestroy();
        this._destroyPareto();
        this._destroyGantt();
        this._destroyCostCharts();
        this._destroyTrend();
      },

      // ── Tabs ──────────────────────────────────────────────────

      tabClass(tab) { return this.activeTab === tab ? 'ishikawa__tab ishikawa__tab--active' : 'ishikawa__tab'; },
      setTab(tab) {
        if (tab === this.activeTab) return;
        this.activeTab = tab;
        this.$nextTick(() => this.renderTabCharts());
      },
      onRouteChanged(sub) {
        const key = Array.isArray(sub) && sub.length ? sub[0] : null;
        if (!key || key === this.activeTab) return;
        if (!['problem', 'facts', 'hypotheses', 'experiments'].includes(key)) return;
        this.setTab(key);
      },
      renderTabCharts() {
        if (this.activeTab === 'hypotheses') {
          this.renderPareto();
          if (this.trendVisible) this.renderTrend();
        } else if (this.activeTab === 'experiments') {
          this.renderGantt();
          this.renderCostChart('cumulative');
          this.renderCostChart('rate');
        }
      },

      // ── Glyphs (Unicode via data-Fn, never \u in template) ────

      glyphNdash() { return '–'; },
      glyphMinus() { return '−'; },
      glyphTriangle() { return '▼'; },
      glyphDupe() { return '⎘'; },

      // ── Category / expert view helpers ────────────────────────

      catColor(key) {
        const c = CATS.find(cat => cat.key === key);
        return c ? c.color : 'var(--color-border-secondary)';
      },
      catLabel(key) {
        const custom = this.model.catLabels && this.model.catLabels[key];
        if (custom && custom.trim()) return custom.trim();
        return i18n().t(`modules.ishikawa.cat.${  key}`);
      },
      ini(name) {
        const p = (name || '').trim().split(/\s+/);
        return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : (name || '').substring(0, 2).toUpperCase();
      },
      catCount(key) {
        let n = 0;
        this.model.rows.forEach(r => { if (this.model.effCat(r) === key) n++; });
        return n;
      },
      catBarPct(key) {
        const total = this.model.rows.length;
        return total > 0 ? this.catCount(key) / total * 100 : 0;
      },

      // ── Problem-tab galleries ─────────────────────────────────

      galleryModifier(kind) { return kind === 'inScope' ? 'in' : 'out'; },
      galleryLabel(kind) { return _t(kind === 'inScope' ? 'problemScopeInLabel' : 'problemScopeOutLabel'); },
      galleryHint(kind) { return _t(kind === 'inScope' ? 'problemScopeInHint' : 'problemScopeOutHint'); },
      formatImgSize(dataUrl) {
        const bytes = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / 1024).toFixed(0)} KB`;
      },

      async uploadImages(kind, $event) {
        const inp = $event.target;
        const files = Array.from(inp.files || []);
        if (!files.length) return;
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          try {
            const { dataUrl, bytes } = await compressImageToBudget(file, { maxBytes: 100 * 1024 });
            this.model.addImage(kind, dataUrl, '');
            if (bytes > 100 * 1024) module._context.notify?.(_t('imageTooLarge', { name: file.name }));
          } catch (err) {
            console.error('Image compression failed', err);
            module._context.notify?.(_t('imageLoadFailed', { name: file.name }));
          }
        }
        inp.value = '';
      },

      openImage(kind, id) {
        const img = (this.model.images[kind] || []).find(x => x.id === id);
        if (!img) return;
        const content = h('div', { class: 'ishikawa__img-lightbox' },
          h('img', { src: img.dataUrl, alt: img.caption || '' }),
          img.caption ? h('p', { class: 'ishikawa__img-lightbox-caption' }, img.caption) : null);
        module._context.showModal.show(_t('openImage'), content, { wide: true });
      },

      async deleteImage(kind, id) {
        const list = this.model.images[kind] || [];
        const img = list.find(x => x.id === id);
        if (!img) return;
        const label = (img.caption && img.caption.trim()) || `#${list.indexOf(img) + 1}`;
        const ok = await module._context.confirmPopout(_t('delImageConfirm', { name: label }), {
          title: i18n().t('common.delete'),
          confirmLabel: i18n().t('common.delete'),
          danger: true,
        });
        if (!ok) return;
        this.model.removeImage(kind, id);
      },

      // ── Experts ───────────────────────────────────────────────

      addExpert() {
        const name = (this.expertDraft || '').trim();
        if (!name) return;
        const added = this.model.addExpert(name);
        if (!added) { module._context.notify(_t('expertDuplicate')); return; }
        this.expertDraft = '';
      },
      removeExpert(id) { this.model.removeExpert(id); },
      expertEditKey(id, $event) {
        if ($event.key === 'Enter') { $event.preventDefault(); $event.target.blur(); }
        else if ($event.key === 'Escape') {
          const exp = this.model.experts.find(x => x.id === id);
          if (exp) $event.target.value = exp.name;
          $event.target.blur();
        }
      },
      commitExpertRename(id, $event) {
        const exp = this.model.experts.find(e => e.id === id);
        if (!exp) return;
        const newName = ($event.target.value || '').trim();
        if (!newName) { $event.target.value = exp.name; return; }
        if (newName === exp.name) return;
        const ok = this.model.renameExpert(id, newName);
        if (!ok) {
          module._context.notify(_t('expertDuplicate'));
          $event.target.value = exp.name;
          $event.target.focus();
          $event.target.select();
        }
      },

      // ── Rows / tree ───────────────────────────────────────────

      isCollapsed(id) { return Boolean(this.collapsed[id]); },
      isHidden(row) {
        let c = row;
        while (c && c.parentId !== null) {
          if (this.collapsed[c.parentId]) return true;
          c = this.model.rows.find(x => x.id === c.parentId);
        }
        return false;
      },
      diff() { return this.compareSnapId !== null ? this.model.getDiff(this.compareSnapId) : null; },

      /** Enriched, filtered, ordered rows for the table x-for. */
      visibleRows() {
        const ord = this.model.ordered();
        const nums = this.model.buildNums();
        const d = this.diff();
        return ord
          .filter(r => this.activeFilter === 'all' || this.model.effCat(r) === this.activeFilter)
          .filter(r => !this.isHidden(r))
          .map(r => {
            const depth = this.model.getDepth(r);
            const ec = this.model.effCat(r);
            const chg = d ? d.changedMap[r.stableId] : null;
            return {
              row: r,
              depth,
              num: nums[r.id] || '',
              hasKids: this.model.hasKids(r.id),
              collapsed: Boolean(this.collapsed[r.id]),
              effCatLabel: ec ? this.catLabel(ec) : '',
              borderColor: ec ? this.catColor(ec) : 'var(--color-border-secondary)',
              defOpt: (!r.category && ec) ? (`↳ ${  this.catLabel(ec)}`) : _t('catChoose'),
              score: this.model.calcScore(r),
              chg,
            };
          });
      },
      rowClass(vr) {
        const d = this.diff();
        let diffCls = '';
        if (d) {
          if (d.addedSet.has(vr.row.stableId)) diffCls = 'ishikawa__diff-new';
          else if (d.changedMap[vr.row.stableId]) diffCls = 'ishikawa__diff-chg';
        }
        return `ishikawa__depth-${Math.min(vr.depth, MAX_DEPTH_CLASS)} ${diffCls}`.trim();
      },
      // grip + nr + category + name + description + experts + score + status + actions
      emptyColspan() { return 6 + this.model.experts.length + 2; },
      emptyMessage() { return this.model.rows.length ? _t('noCategoryHyp') : _t('emptyHint'); },
      isNameDup(row) { return this.model.isNameDuplicate(row.name, row.id); },

      addRow() { this._addAndFocus(null); },
      addSub(pid) { this.collapsed[pid] = false; this._addAndFocus(pid); },
      _addAndFocus(pid) {
        const nr = this.model.addRow(pid);
        this.$nextTick(() => {
          const inp = module._container.querySelector(`tr[data-id="${nr.id}"] .ishikawa__name-input`);
          if (inp) inp.focus();
        });
      },
      dupeRow(id) { this.model.dupeRow(id, ` (${_t('copy')})`); },

      async deleteRow(id) {
        const row = this.model.rows.find(r => r.id === id);
        if (!row) return;
        const descIds = this.model.descIds(id);
        const label = this.model.dName(row);
        const message = descIds.length > 0
          ? _t('delRowConfirmWithSubs', { name: label, count: descIds.length })
          : _t('delRowConfirm', { name: label });
        const confirmed = await module._context.confirmPopout(message, {
          title: i18n().t('common.delete'),
          confirmLabel: i18n().t('common.delete'),
          danger: true,
        });
        if (!confirmed) return;
        this.model.descIds(id).concat(id).forEach(x => delete this.collapsed[x]);
        this.model.delRow(id);
      },

      toggleRow(id) {
        if (this.collapsed[id]) delete this.collapsed[id];
        else this.collapsed[id] = true;
      },
      expandAll() { this.collapsed = {}; },
      collapseAll() {
        const next = {};
        this.model.rows.forEach(r => { if (this.model.hasKids(r.id)) next[r.id] = true; });
        this.collapsed = next;
      },
      setFilter(f) { this.activeFilter = f; },

      // ── Ratings ───────────────────────────────────────────────

      ratingVal(row, expertId) {
        return row.ratings[expertId] !== undefined ? row.ratings[expertId] : '';
      },
      ratingStyle(row, expertId) {
        const v = row.ratings[expertId];
        return (v !== undefined && v !== '') ? ratingBg(v) : '';
      },
      ratingKeydown($event) {
        if (['e', 'E', '+', '-', '.', ','].includes($event.key)) $event.preventDefault();
      },
      ratingChanged(rowId, expertId, $event) {
        this.model.setRating(rowId, expertId, $event.target.value);
        const r = this.model.rows.find(x => x.id === rowId);
        const val = r && r.ratings[expertId] !== undefined ? r.ratings[expertId] : '';
        $event.target.value = val;
        $event.target.style.cssText = val !== '' ? ratingBg(val) : '';
        // Refresh derived chart panels without rebuilding the table.
        this.renderPareto();
        if (this.trendVisible) this.renderTrend();
      },

      // ── Score cell view helpers ───────────────────────────────

      scoreCls(score) {
        return score >= 6 ? 'ishikawa__score-high' : score >= 3 ? 'ishikawa__score-mid' : 'ishikawa__score-low';
      },
      scoreBarStyle(score) {
        const pct = score / 9 * 100;
        const barCol = score >= 6 ? '#dc2626' : score >= 3 ? '#d97706' : '#16a34a';
        return `width:${pct}%;background:${barCol}`;
      },
      deltaCls(chg) { return chg.delta > 0 ? 'ishikawa__delta-up' : 'ishikawa__delta-down'; },
      deltaText(chg) { return (chg.delta > 0 ? '+' : '') + chg.delta.toFixed(1); },
      statusCss(status) { return STATUS_CSS[status] || ''; },

      // ── Linked experiments (row) ──────────────────────────────

      linkedExpCount(row) {
        return this.model.experiments.reduce(
          (acc, x) => acc + (Array.isArray(x.hypothesisIds) && x.hypothesisIds.includes(row.stableId) ? 1 : 0), 0);
      },
      linkExpTitle(row) {
        const c = this.linkedExpCount(row);
        return c > 0 ? _t('linkedExperimentsTooltip', { count: c }) : _t('linkExperimentsTitle');
      },

      // ── Summary ───────────────────────────────────────────────

      summaryBreakdown() {
        const total = this.model.rows.length;
        const roots = this.model.rows.filter(r => r.parentId === null).length;
        return `(${roots} ${_t('main')} · ${total - roots} ${_t('sub')})`;
      },
      topScore() {
        const scored = this.model.rows
          .map(r => this.model.calcScore(r))
          .filter(s => s !== null)
          .sort((a, b) => b - a);
        return scored.length ? scored[0].toFixed(1) : '–';
      },
      confirmedCount() { return this.model.rows.filter(r => r.status === 'confirmed').length; },

      // ── Snapshots ─────────────────────────────────────────────

      snapDate(s) {
        const d = new Date(s.date);
        return `${d.toLocaleDateString('de-DE')  } ${  d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
      },
      snapBadge(s) { return `${(s.data.rows || []).length  } ${  _t('hyp')}`; },
      compareLabel() {
        const s = this.model.snapshots.find(x => x.id === this.compareSnapId);
        return s ? `vs. „${s.name}“` : '';
      },

      saveSnapshot() {
        const name = (this.snapDraft || '').trim() || (`Snapshot ${  new Date().toLocaleDateString('de-DE')}`);
        this.model.saveSnapshot(name);
        this.snapDraft = '';
        this.$nextTick(() => this.renderTabCharts());
      },
      deleteSnapshot(id, $event) {
        $event.stopPropagation();
        this.model.removeSnapshot(id);
        if (this.compareSnapId === id) this.compareSnapId = null;
        if (this.paretoSource === `snap-${  id}`) this.paretoSource = 'current';
        this.$nextTick(() => this.renderTabCharts());
      },
      snapClick(id, $event) {
        if ($event.target.closest('.ishikawa__snap-del')) return;
        this.compareSnapId = (this.compareSnapId === id) ? null : id;
      },
      async loadSnapshot(id) {
        const confirmed = await module._context.confirmPopout(_t('loadSnapConfirm'));
        if (!confirmed) return;
        this.model.loadSnapshot(id);
        this.collapsed = {};
        this.$nextTick(() => this.renderTabCharts());
      },
      closeDiff() { this.compareSnapId = null; },

      // ── Trend ─────────────────────────────────────────────────

      toggleTrend() {
        this.trendVisible = !this.trendVisible;
        if (this.trendVisible) this.$nextTick(() => this.renderTrend());
      },
      closeTrend() { this.trendVisible = false; },

      // ── Category rename modal ─────────────────────────────────

      openCatRename() {
        this.catRenameDraft = CATS.map(c => ({
          key: c.key,
          color: c.color,
          def: i18n().t(`modules.ishikawa.cat.${  c.key}`),
          name: (this.model.catLabels && this.model.catLabels[c.key]) || '',
        }));
        module._context.showModal.form(_t('renameCatsTitle'), this.$refs.catRenameForm, {
          confirmLabel: i18n().t('common.save'),
          onConfirm: () => {
            const next = {};
            const seen = new Map();
            let dup = false;
            this.catRenameDraft.forEach(c => { next[c.key] = (c.name || '').trim(); });
            for (const c of CATS) {
              const eff = (next[c.key] || i18n().t(`modules.ishikawa.cat.${  c.key}`)).toLowerCase();
              if (seen.has(eff)) { dup = true; break; }
              seen.set(eff, c.key);
            }
            if (dup) { module._context.notify(_t('renameCatsDuplicate')); return false; }
            this.model.catLabels = next;
          },
        });
      },

      // ── Experiments ───────────────────────────────────────────

      addExperiment() { this.model.addExperiment(); this.$nextTick(() => this.renderTabCharts()); },
      deleteExperiment: async function (id) {
        const x = this.model.experiments.find(y => y.id === id);
        if (!x) return;
        const label = (x.title && x.title.trim()) || `#${this.model.experiments.indexOf(x) + 1}`;
        const ok = await module._context.confirmPopout(_t('delExperimentConfirm', { name: label }), {
          title: i18n().t('common.delete'),
          confirmLabel: i18n().t('common.delete'),
          danger: true,
        });
        if (!ok) return;
        this.model.removeExperiment(id);
        this.$nextTick(() => this.renderTabCharts());
      },
      expLinkText(x) {
        const n = (x.hypothesisIds || []).length;
        return n > 0 ? `${n} ${_t('linked')}` : _t('chooseHypotheses');
      },
      expDatesChanged() { this.$nextTick(() => { this.renderGantt(); this.renderCostChart('cumulative'); this.renderCostChart('rate'); }); },
      expStatusChanged() { this.$nextTick(() => this.renderGantt()); },
      expCostChanged() {
        // Normalize empty → null, numeric strings → number (legacy parity).
        this.model.experiments.forEach(x => {
          x.costMoney = this._normNum(x.costMoney);
          x.costHours = this._normNum(x.costHours);
        });
        this.$nextTick(() => { this.renderCostChart('cumulative'); this.renderCostChart('rate'); });
      },
      _normNum(v) {
        if (v === '' || v === null || v === undefined) return null;
        const n = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.'));
        return isNaN(n) ? null : n;
      },

      // ── Facts ─────────────────────────────────────────────────

      addFact() { this.model.addFact(); },
      deleteFact: async function (id) {
        const f = this.model.facts.find(x => x.id === id);
        if (!f) return;
        const label = (f.name && f.name.trim()) || `#${this.model.facts.indexOf(f) + 1}`;
        const ok = await module._context.confirmPopout(_t('delFactConfirm', { name: label }), {
          title: i18n().t('common.delete'),
          confirmLabel: i18n().t('common.delete'),
          danger: true,
        });
        if (!ok) return;
        this.model.removeFact(id);
      },
      ownerNames() { return this.model.experts.map(e => e.name).filter(Boolean); },

      // ── Hypothesis / Experiment link modals ───────────────────

      openExpLink(rowId) {
        const row = this.model.rows.find(r => r.id === rowId);
        if (!row || !row.stableId) return;
        const sid = row.stableId;
        this.expLinkDraft = {
          hint: _t('chooseExperimentsHint', { name: this.model.dName(row) }),
          items: this.model.experiments.map((x, idx) => {
            const status = x.status || 'planned';
            return {
              xId: x.id,
              num: idx + 1,
              label: (x.title && x.title.trim()) || `${_t('experiment')} #${idx + 1}`,
              dateRange: (x.startDate || x.endDate) ? `${x.startDate || '?'} → ${x.endDate || '?'}` : '',
              status,
              statusLabel: _t(`expStatus.${  status}`),
              checked: Array.isArray(x.hypothesisIds) && x.hypothesisIds.includes(sid),
            };
          }),
        };
        module._context.showModal.form(_t('linkExperimentsTitle'), this.$refs.expLinkForm, {
          confirmLabel: i18n().t('common.save'),
          onConfirm: () => {
            this.expLinkDraft.items.forEach(it => {
              const exp = this.model.experiments.find(x => x.id === it.xId);
              if (!exp) return;
              if (!Array.isArray(exp.hypothesisIds)) exp.hypothesisIds = [];
              const has = exp.hypothesisIds.includes(sid);
              if (it.checked && !has) exp.hypothesisIds.push(sid);
              else if (!it.checked && has) exp.hypothesisIds = exp.hypothesisIds.filter(s => s !== sid);
            });
          },
        });
      },

      openHypLink(expId) {
        const experiment = this.model.experiments.find(x => x.id === expId);
        if (!experiment) return;
        const ord = this.model.ordered();
        const nums = this.model.buildNums();
        const linked = new Set(experiment.hypothesisIds || []);
        this.hypLinkDraft = {
          items: ord.map(r => {
            const ec = this.model.effCat(r);
            return {
              stableId: r.stableId,
              num: nums[r.id] || '',
              cat: Boolean(ec),
              catColor: ec ? this.catColor(ec) : '',
              catLabel: ec ? this.catLabel(ec) : '',
              name: this.model.dName(r),
              checked: linked.has(r.stableId),
            };
          }),
        };
        module._context.showModal.form(_t('chooseHypotheses'), this.$refs.hypLinkForm, {
          confirmLabel: i18n().t('common.save'),
          onConfirm: () => {
            experiment.hypothesisIds = this.hypLinkDraft.items
              .filter(it => it.checked)
              .map(it => it.stableId);
          },
        });
      },

      // ── CSV export ────────────────────────────────────────────

      exportCSV() {
        const ord = this.model.ordered();
        const nums = this.model.buildNums();
        let csv = '﻿';
        csv += `"${_t('problemStatement')}","${(this.model.problem || '').replace(/"/g, '""')}"\n\n`;
        csv += `"#","${_t('level')}","${_t('category')}","${_t('effCat')}","${_t('name')}","${_t('description')}"`;
        this.model.experts.forEach(e => { csv += `,"${e.name.replace(/"/g, '""')}"`; });
        csv += `,"${_t('avgScore')}","${_t('status')}"\n`;
        ord.forEach(r => {
          const d = this.model.getDepth(r);
          const s = this.model.calcScore(r);
          const catName = r.category ? this.catLabel(r.category) : '';
          const effCatName = this.model.effCat(r) ? this.catLabel(this.model.effCat(r)) : '';
          const lvl = d === 0 ? _t('main') : 'Sub';
          csv += `"${nums[r.id]}","${lvl}","${catName}","${effCatName}","${(r.name || '').replace(/"/g, '""')}","${'  '.repeat(d)}${(r.description || '').replace(/"/g, '""')}"`;
          this.model.experts.forEach(e => { csv += `,"${r.ratings[e.id] !== undefined ? r.ratings[e.id] : ''}"`; });
          csv += `,"${s !== null ? s.toFixed(1) : ''}","${r.status ? _t(`status.${  r.status}`) : ''}"\n`;
        });
        if (this.model.facts.length) {
          csv += '\n';
          csv += `"${_t('tabFacts')}"\n`;
          csv += `"#","${_t('factName')}","${_t('factDescription')}","${_t('factDate')}","${_t('factOwner')}"\n`;
          this.model.facts.forEach((f, idx) => {
            const e = (v) => String(v ?? '').replace(/"/g, '""');
            csv += `"${idx + 1}","${e(f.name)}","${e(f.description)}","${e(f.date)}","${e(f.owner)}"\n`;
          });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ishikawa-6m-export.csv';
        a.click();
        URL.revokeObjectURL(url);
        module._context.notify(_t('exportedCSV'));
      },

      // ── Pareto chart (chartManager) ───────────────────────────

      _destroyPareto() {
        if (this._paretoChart) {
          try { module._context.chartManager.destroy(this._paretoChart); } catch { /* ignore */ }
          this._paretoChart = null;
        }
      },
      async renderPareto() {
        const container = module._container.querySelector('[data-ref="paretoContent"]');
        if (!container) return;
        this._destroyPareto();
        const data = this.model.paretoData(this.paretoSource);
        if (!data.length) {
          container.replaceChildren();
          this.paretoEmptyMsg = _t('paretoNoData');
          return;
        }
        this.paretoEmptyMsg = '';
        const items = data.slice(0, 20).map(d => {
          const catObj = CATS.find(c => c.key === d.cat);
          return { name: d.name, value: d.avg, color: catObj ? catObj.color : undefined };
        });
        container.replaceChildren();
        const gen = ++this._renderGen;
        const chart = await module._context.chartManager.create(container, 'pareto', {
          items,
          title: _t('paretoTitle'),
          yLabel: _t('paretoYAxisLabel'),
          rightYLabel: _t('paretoCumLabel'),
          showXTicks: false,
          onEditorToggle: (open) => {
            const panel = module._container.querySelector('[data-ref="paretoEditorPanel"]');
            const body = module._container.querySelector('.ishikawa__pareto-body');
            if (panel) panel.classList.toggle('open', open);
            if (body) body.classList.toggle('ishikawa__pareto-body--editor-open', open);
            if (open) this._buildParetoEditor();
            setTimeout(() => { if (this._paretoChart) this._paretoChart.render(); }, 340);
          },
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._paretoChart = chart;
      },

      _buildParetoEditor() {
        const inner = module._container.querySelector('[data-ref="paretoEditorInner"]');
        if (!inner || !this._paretoChart) return;
        inner.replaceChildren();
        const chart = this._paretoChart;
        const cfg = chart.config;
        const te = (k) => i18n().t(`chart.editor.${  k}`);
        const rerender = () => chart.render();
        import('../../core/chart/chart-editor.js').then(({
          edTitleSection, edFontSizeSection, edCheckboxRow, edSection,
          edRangeRow, edSelectRow, edColorPair, openColorPicker,
        }) => {
          const cpOpen = (e, color, cb) => {
            if (this._activeColorPicker) this._activeColorPicker.close();
            this._activeColorPicker = openColorPicker(e, color, cb);
          };
          const DASH_OPTS = [
            { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
            { value: 'dot', label: 'Dot' }, { value: 'dashdot', label: 'Dash-Dot' },
            { value: 'longdash', label: 'Long Dash' },
          ];
          const MARKER_OPTS = [
            { value: 'circle', label: '● Circle' }, { value: 'square', label: '■ Square' },
            { value: 'diamond', label: '◆ Diamond' }, { value: 'triangle', label: '▲ Triangle' },
            { value: 'triangle-down', label: '▼ Triangle ▼' }, { value: 'cross', label: '✚ Cross' },
            { value: 'star', label: '★ Star' },
          ];
          inner.appendChild(edTitleSection(cfg, rerender, te));
          inner.appendChild(edFontSizeSection(cfg, rerender, te));
          const axSec = edSection(_t('paretoAxes'));
          axSec.appendChild(edCheckboxRow(te('showYLabel'), cfg.showYLabel !== false, (v) => { cfg.showYLabel = v; rerender(); }));
          axSec.appendChild(edCheckboxRow(te('showYTicks'), cfg.showYTicks !== false, (v) => { cfg.showYTicks = v; rerender(); }));
          inner.appendChild(axSec);
          const PATTERN_OPTS = [
            { value: '', label: _t('paretoPatNone') }, { value: '/', label: `/ ${  _t('paretoPatDiag')}` },
            { value: '\\', label: `\\ ${  _t('paretoPatDiagR')}` }, { value: '-', label: `— ${  _t('paretoPatHoriz')}` },
            { value: '|', label: `| ${  _t('paretoPatVert')}` }, { value: 'x', label: `× ${  _t('paretoPatCross')}` },
            { value: '+', label: `+ ${  _t('paretoPatPlus')}` }, { value: '.', label: `· ${  _t('paretoPatDots')}` },
          ];
          const barSec = edSection(_t('paretoBars'));
          barSec.appendChild(edRangeRow(_t('paretoBarOpacity'), Math.round((cfg.barOpacity ?? 0.75) * 100), (v) => { cfg.barOpacity = v / 100; rerender(); }, 10, 100, 5));
          (cfg.items || []).forEach((d) => {
            const barItem = document.createElement('div');
            barItem.className = 'dmike-chart-ed-ref-item';
            const header = document.createElement('div');
            header.className = 'dmike-chart-ed-ref-header';
            const colorBar = document.createElement('div');
            colorBar.className = 'dmike-chart-ed-ref-color';
            colorBar.style.background = d.color || 'var(--color-chart-1)';
            const info = document.createElement('div');
            info.className = 'dmike-chart-ed-ref-info';
            const label = d.name.length > 20 ? `${d.name.substring(0, 18)  }…` : d.name;
            info.replaceChildren(
              h('div', { class: 'name' }, label),
              h('div', { class: 'detail' }, d.value.toFixed(1)));
            header.appendChild(colorBar);
            header.appendChild(info);
            barItem.appendChild(header);
            const detail = document.createElement('div');
            detail.className = 'dmike-chart-ed-inline-editor open';
            const { el: cEl, swatch: cSw } = edColorPair(te('color'), d.color || 'rgba(100,100,100,1)', (ev) => {
              cpOpen(ev, d.color || 'rgba(100,100,100,1)', (c) => { d.color = c; cSw.style.background = c; colorBar.style.background = c; rerender(); });
            });
            detail.appendChild(cEl);
            detail.appendChild(edSelectRow(_t('paretoPattern'), PATTERN_OPTS, d.pattern || '', (v) => { d.pattern = v; rerender(); }));
            barItem.appendChild(detail);
            barSec.appendChild(barItem);
          });
          inner.appendChild(barSec);
          const refSec = edSection(_t('paretoRefLine'));
          refSec.appendChild(edRangeRow(_t('paretoRefValue'), cfg.refLineValue ?? 80, (v) => { cfg.refLineValue = v; rerender(); }, 0, 100, 5));
          refSec.appendChild(edSelectRow(te('lineStyle'), DASH_OPTS, cfg.refLineDash || 'dash', (v) => { cfg.refLineDash = v; rerender(); }));
          refSec.appendChild(edRangeRow(_t('paretoRefWidth'), cfg.refLineWidth ?? 1, (v) => { cfg.refLineWidth = v; rerender(); }, 0.5, 5, 0.5));
          const { el: refColorEl, swatch: refSw } = edColorPair(te('color'), cfg.refLineColor || '#ef4444', (e) => {
            cpOpen(e, cfg.refLineColor || '#ef4444', (c) => { cfg.refLineColor = c; refSw.style.background = c; rerender(); });
          });
          refSec.appendChild(refColorEl);
          inner.appendChild(refSec);
          const lineSec = edSection(_t('paretoCumLine'));
          lineSec.appendChild(edSelectRow(te('lineStyle'), DASH_OPTS, cfg.cumDash || 'solid', (v) => { cfg.cumDash = v; rerender(); }));
          lineSec.appendChild(edRangeRow(_t('paretoCumWidth'), cfg.cumWidth ?? 2, (v) => { cfg.cumWidth = v; rerender(); }, 0.5, 6, 0.5));
          const { el: cumColorEl, swatch: cumSw } = edColorPair(te('color'), cfg.cumulativeColor || '#ef4444', (e) => {
            cpOpen(e, cfg.cumulativeColor || '#ef4444', (c) => { cfg.cumulativeColor = c; cumSw.style.background = c; rerender(); });
          });
          lineSec.appendChild(cumColorEl);
          inner.appendChild(lineSec);
          const dotSec = edSection(_t('paretoCumDots'));
          dotSec.appendChild(edSelectRow(_t('paretoDotSymbol'), MARKER_OPTS, cfg.cumDotSymbol || 'circle', (v) => { cfg.cumDotSymbol = v; rerender(); }));
          dotSec.appendChild(edRangeRow(_t('paretoDotSize'), cfg.cumDotSize ?? 3.5, (v) => { cfg.cumDotSize = v; rerender(); }, 1, 10, 0.5));
          const { el: dotFillEl, swatch: dotFillSw } = edColorPair(_t('paretoDotFill'), cfg.cumDotFill || '#ef4444', (e) => {
            cpOpen(e, cfg.cumDotFill || '#ef4444', (c) => { cfg.cumDotFill = c; dotFillSw.style.background = c; rerender(); });
          });
          dotSec.appendChild(dotFillEl);
          const { el: dotStrokeEl, swatch: dotStrokeSw } = edColorPair(_t('paretoDotStroke'), cfg.cumDotStroke || '#ffffff', (e) => {
            cpOpen(e, cfg.cumDotStroke || '#ffffff', (c) => { cfg.cumDotStroke = c; dotStrokeSw.style.background = c; rerender(); });
          });
          dotSec.appendChild(dotStrokeEl);
          dotSec.appendChild(edRangeRow(_t('paretoDotStrokeWidth'), cfg.cumDotStrokeWidth ?? 1.5, (v) => { cfg.cumDotStrokeWidth = v; rerender(); }, 0, 5, 0.5));
          inner.appendChild(dotSec);
        });
      },

      // ── Trend chart (chartManager — framework `trend` type) ───────

      _destroyTrend() {
        if (this._trendChart) {
          try { module._context.chartManager.destroy(this._trendChart); } catch { /* ignore */ }
          this._trendChart = null;
        }
      },
      async renderTrend() {
        const container = module._container.querySelector('[data-ref="trendContent"]');
        if (!container) return;
        this._destroyTrend();
        // Note: trend axis dates are intentionally formatted by locale (de/en) —
        // behaviour-preserving from the legacy canvas render.
        const timeline = [...this.model.snapshots].reverse();
        const currentState = {
          name: _t('trendCurrent'),
          date: new Date().toISOString(),
          data: { problem: this.model.problem, experts: JSON.parse(JSON.stringify(this.model.experts)), rows: JSON.parse(JSON.stringify(this.model.rows)) },
        };
        const trendStates = [...timeline.map(s => ({ name: s.name, date: s.date, data: s.data })), currentState];
        const lang = module._context.language || 'de';
        const config = computeTrendConfig(trendStates, {
          calcScore: (row, experts) => this.model.calcScoreFor(row, experts),
          lang,
        });
        if (config.isEmpty) {
          container.replaceChildren();
          this.trendEmptyMsg = config.reason === 'noData' ? _t('trendNoData') : _t('trendMinSnaps');
          return;
        }
        this.trendEmptyMsg = '';
        // Re-apply any persisted per-series toggles (survive data-driven re-renders).
        config.series.forEach(s => { if (this.hiddenLines[s.sid]) s.visible = false; });
        container.replaceChildren();
        const gen = ++this._trendGen;
        const chart = await module._context.chartManager.create(container, 'trend', {
          ...config,
          onToggle: (sid, hidden) => {
            if (hidden) this.hiddenLines[sid] = true; else delete this.hiddenLines[sid];
          },
        });
        if (gen !== this._trendGen) { module._context.chartManager.destroy(chart); return; }
        this._trendChart = chart;
      },

      // ── Gantt chart (chartManager) ────────────────────────────

      _destroyGantt() {
        if (this._ganttChart) {
          try { module._context.chartManager.destroy(this._ganttChart); } catch { /* ignore */ }
          this._ganttChart = null;
        }
      },
      async renderGantt() {
        const host = module._container.querySelector('[data-ref="ganttCanvas"]');
        if (!host) return;
        this._destroyGantt();
        const lang = module._context.language || 'de';
        const config = computeGanttConfig(this.model.experiments, {
          now: Date.now(),
          lang,
        });
        if (config.isEmpty) { host.style.height = ''; host.replaceChildren(); this.ganttEmptyMsg = _t('ganttNoData'); return; }
        this.ganttEmptyMsg = '';
        host.replaceChildren();
        // The chart framework sizes its SVG to the host via a height:100% chain +
        // ResizeObserver — the host MUST carry a definite height or the measured
        // height has no stable basis and drifts on every re-render. Pin it to the
        // gantt's content height (padT + rows·rowH + padB).
        const gl = config.layout;
        host.style.height = `${gl.padT + config.tasks.length * gl.rowH + gl.padB}px`;
        const gen = ++this._renderGen;
        const chart = await module._context.chartManager.create(host, 'gantt', {
          ...config,
          todayLabel: _t('today'),
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._ganttChart = chart;
      },

      // ── Cost chart (chartManager — dual-axis cumulative-cost type) ──

      _destroyCostCharts() {
        ['_costCumChart', '_costRateChart'].forEach((key) => {
          if (this[key]) {
            try { module._context.chartManager.destroy(this[key]); } catch { /* ignore */ }
            this[key] = null;
          }
        });
      },
      async renderCostChart(mode = 'cumulative') {
        const hostRef = mode === 'rate' ? 'costRateChartCanvas' : 'costChartCanvas';
        const host = module._container.querySelector(`[data-ref="${hostRef}"]`);
        if (!host) return;
        const handleKey = mode === 'rate' ? '_costRateChart' : '_costCumChart';
        const emptyField = mode === 'rate' ? 'costRateEmptyMsg' : 'costEmptyMsg';
        // Tear down only this mode's prior instance.
        if (this[handleKey]) {
          try { module._context.chartManager.destroy(this[handleKey]); } catch { /* ignore */ }
          this[handleKey] = null;
        }
        const lang = module._context.language || 'de';
        const config = computeCostConfig(this.model.experiments, mode, { now: Date.now(), lang });
        if (config.isEmpty) { host.style.height = ''; host.replaceChildren(); this[emptyField] = _t('costChartNoData'); return; }
        this[emptyField] = '';
        host.replaceChildren();
        // Pin a definite host height (padT + innerH + padB) — see renderGantt for
        // why the framework's height:100% chain needs a definite basis.
        const cl = config.layout;
        host.style.height = `${cl.padT + cl.innerH + cl.padB}px`;
        const genKey = mode === 'rate' ? 'rate' : 'cumulative';
        const gen = ++this._costGen[genKey];
        const chart = await module._context.chartManager.create(host, 'cumulative-cost', {
          ...config,
          moneyLabel: _t('costMoney'),
          hoursLabel: _t('costHours'),
        });
        if (gen !== this._costGen[genKey]) { module._context.chartManager.destroy(chart); return; }
        this[handleKey] = chart;
      },
    };
  },
});

export default mod;
