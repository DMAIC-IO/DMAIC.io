/**
 * D.Mike — FMEA Module (fmea.js)
 *
 * Failure Mode and Effects Analysis with RPN calculation (S×O×D), projected
 * RPN via per-action S/O/D deltas, an action burndown chart, and CSV export.
 * DMAIC phase: Analyze.
 *
 * Migrated to createModule + Alpine CSP. All business logic (RPN, projected
 * RPN, statistics, burndown series, CSV row matrix) lives in fmea-model.js and
 * is unit-tested. This file holds only view transformations (badge classes,
 * scale i18n text, '—' formatting), event handlers, and the imperative
 * burndown chart lifecycle (chartManager is not a pure-template concern).
 */

import { createModule } from '../../core/template-module.js';
import { h } from '../../core/dom.js';
import { resolveDateOffset } from '../../core/date-offset.js';
import { draggablePopout } from '../../ui/draggable-popout.js';
import { State, METHODS, FMEA_TYPES, rpnCategory } from './fmea-model.js';
import { S_BANDS, O_BANDS, D_BANDS, AP_TABLE, AP_CATEGORY, bandLabel } from './fmea-ap.js';

/** Map a 1–10 rating to its scale-row index (0–4). */
function scaleRow(v) {
  if (v <= 1) return 0;
  if (v <= 3) return 1;
  if (v <= 6) return 2;
  if (v <= 8) return 3;
  return 4;
}

/** Hardcoded default failure-rate ranges for the Occurrence scale. */
const RATE_DEFAULTS = {
  occUnlikelyRate: '< 1 / 1.500.000',
  occLowRate: '1 / 150.000 – 15.000',
  occModRate: '1 / 2.000 – 80',
  occHighRate: '1 / 20 – 8',
  occVHighRate: '≥ 1 / 3',
};

/** Keys that have no i18n entry — only the hardcoded rate defaults above. */
const RATE_KEYS = new Set(Object.keys(RATE_DEFAULTS));

// ── Dashboard-tile helpers (static; render from persisted state) ──────────
const CAT_COLOR = {
  critical: 'var(--color-error)',
  high:     'var(--color-warning)',
  medium:   'var(--color-info)',
  low:      'var(--color-success)',
  none:     'var(--color-text-tertiary)',
};
const catColor = (cat) => CAT_COLOR[cat] || CAT_COLOR.none;

/** Collect all FMEA instances across phases (phase-set is cycle-agnostic). */
function enumerateFmea(ctx) {
  const phases = ctx.stateManager.get('phases') || {};
  const out = [];
  for (const list of Object.values(phases)) {
    for (const inst of (list || [])) {
      if (inst.moduleId !== 'fmea') continue;
      const label = inst.customName || ctx.i18n.t('modules.fmea.name');
      out.push({
        tileId: `fmea:${inst.instanceId}`,
        instanceId: inst.instanceId,
        title: `FMEA — ${label}`,
      });
    }
  }
  return out;
}

const mod = createModule({
  config: {
    id: 'fmea',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.fmea',
    version: '1.2.0',
    meta: import.meta,
    actions: [
      { icon: 'action.glossary', title: 'scales', onClick: (d) => d.toggleScale() },
      { icon: 'chart.run-chart', title: 'burndown', onClick: (d) => d.showBurndown() },
      { icon: 'nav.expand-down', title: 'sortByPriority', onClick: (d) => d.sortByPriority() },
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.csv', title: 'export.csv', onClick: (d) => d.exportCSV() },
      ] },
      { icon: 'action.add', title: 'addRisk', variant: 'primary', onClick: (d) => d.addRisk() },
    ],
    dashboardTile: {
      defaultW: 3, defaultH: 10, minW: 2, minH: 6,
      enumerate: enumerateFmea,
      /** @param {HTMLElement} host  @param {{tileId,instanceId,state,i18n,theme,chartManager}} args */
      render(host, { state, i18n }) {
        const risks = (state && Array.isArray(state.risks)) ? state.risks : [];
        if (risks.length === 0) {
          host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.fmeaEmpty')));
          return;
        }
        const model = State.fromJSON(state);
        const rating = model.rating();
        const isAp = model.method === 'ap';
        const cats = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
        model.risks.forEach(r => cats[rating.category(r)]++);
        const ranked = [...model.risks].sort(rating.compare).filter(r => rating.category(r) !== 'none');
        const top = ranked.slice(0, 5);
        const catLabels = isAp
          ? { high: i18n.t('dashboard.fmeaApHigh'), medium: i18n.t('dashboard.fmeaApMedium'),
            low: i18n.t('dashboard.fmeaApLow'), none: i18n.t('dashboard.fmeaNotRated') }
          : { critical: i18n.t('dashboard.fmeaCritical'), high: i18n.t('dashboard.fmeaHigh'),
            medium: i18n.t('dashboard.fmeaMedium'), low: i18n.t('dashboard.fmeaLow'),
            none: i18n.t('dashboard.fmeaNotRated') };
        const barCats = isAp ? ['high', 'medium', 'low'] : ['critical', 'high', 'medium', 'low'];
        const badge = (r) => (isAp ? `AP ${r.ap()}` : `RPN ${r.rpn()}`);

        const summaryParts = [h('span', {}, `${i18n.t('dashboard.fmeaRisks')}: `, h('strong', {}, String(model.risks.length)))];
        if (isAp) {
          summaryParts.push(h('span', {}, `${catLabels.high}: `,
            h('strong', { style: `color:${catColor('high')}` }, String(cats.high))));
        } else {
          const maxRPN = Math.max(0, ...model.risks.map(r => r.rpn()));
          summaryParts.push(h('span', {}, `${i18n.t('dashboard.fmeaMaxRPN')}: `,
            h('strong', { style: `color:${catColor(rpnCategory(maxRPN))}` }, maxRPN ? String(maxRPN) : '—')));
        }
        const summary = h('div', { class: 'dashboard-fmea__summary' }, ...summaryParts);
        const bar = h('div', { class: 'dashboard-fmea__bar' },
          ...barCats.map(cat => {
            const pct = model.risks.length ? (cats[cat] / model.risks.length * 100) : 0;
            if (pct === 0) return null;
            return h('div', { class: 'dashboard-fmea__bar-seg',
              style: `width:${pct}%;background:${catColor(cat)}`, title: `${catLabels[cat]}: ${cats[cat]}` });
          }).filter(Boolean),
        );
        const legend = h('div', { class: 'dashboard-fmea__legend' },
          ...[...barCats, 'none'].filter(c => cats[c] > 0)
            .map(cat => h('span', { class: 'dashboard-fmea__legend-item' },
              h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${catColor(cat)}` }),
              ` ${catLabels[cat]}: ${cats[cat]}`)),
        );
        const children = [summary, bar, legend];
        if (top.length) {
          children.push(h('div', { class: 'dashboard-fmea__top-label' }, i18n.t('dashboard.fmeaTopRisks')));
          children.push(h('ol', { class: 'dashboard-fmea__top-list' },
            ...top.map(r => h('li', { class: 'dashboard-fmea__top-item' },
              h('span', { class: 'dashboard-fmea__top-desc' }, r.failureMode || r.step || '—'),
              h('span', { class: 'dashboard-fmea__top-rpn', style: `color:${catColor(rating.category(r))}` }, badge(r))))));
        }
        host.replaceChildren(...children);
      },
    },
  },
  Model: State,

  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.risks)) {
      result.risks.forEach(r => {
        if (Array.isArray(r.actions)) {
          r.actions.forEach(a => { a.date = resolveDateOffset(a.date); });
        }
      });
    }
    return result;
  },

  data(module, _t) {
    return {
      // ── Transient UI state (never persisted) ──────────────────
      ...draggablePopout({ size: 'width:680px;height:auto;max-height:85vh;' }),
      scaleVisible: false,
      burndownOpen: false,
      _chart: null,
      _renderGen: 0,

      // ── View transformations (CSS / i18n / formatting) ────────

      riskNum: (i) => `R-${  String(i + 1).padStart(3, '0')}`,
      rpnText: (v) => v ? (`RPN ${  v}`) : 'RPN —',
      targetText: (v) => v ? (`${_t('target')  } ${  v}`) : (`${_t('target')  } —`),

      /** @returns {boolean} true when the FMEA is rated by action priority */
      isAp() { return this.model.method === 'ap'; },
      /** @returns {boolean} true for a design FMEA */
      isDesign() { return this.model.fmeaType === 'design'; },
      /** @param {string} m 'ap' | 'rpn' */
      setMethod(m) { if (METHODS.includes(m)) this.model.method = m; },
      /** @param {string} type 'process' | 'design' */
      setFmeaType(type) { if (FMEA_TYPES.includes(type)) this.model.fmeaType = type; },

      badgeClass(risk) { return `fmea__rpn-badge--${this.model.rating().category(risk)}`; },
      projBadgeClass(risk) { return `fmea__rpn-badge--${this.model.rating().projCategory(risk)}`; },
      /** Main badge: 'AP H' in AP mode, 'RPN 504' in RPN mode. */
      badgeText(risk) { return this.isAp() ? `AP ${risk.ap() || '—'}` : this.rpnText(risk.rpn()); },
      /** Header target badge: 'Target AP M' / 'Target 120'. */
      projBadgeText(risk) {
        return this.isAp() ? `${_t('target')} AP ${risk.projAp() || '—'}` : this.targetText(risk.projRpn());
      },
      /** Projected-bar badge: 'AP M' / 'RPN 120'. */
      projValueText(risk) { return this.isAp() ? `AP ${risk.projAp() || '—'}` : this.rpnText(risk.projRpn()); },

      /** Combined card class: glow tier + collapsed marker. */
      cardClass(risk) {
        const cat = this.model.rating().category(risk);
        const glow = cat === 'none' ? '' : `fmea__risk-card--${cat}`;
        const collapsed = risk.collapsed ? 'fmea__risk-card--collapsed' : '';
        return (`${glow} ${collapsed}`).trim();
      },

      projSDisp: (risk) => risk.sev ? String(risk.projS()) : '—',
      projODisp: (risk) => risk.occ ? String(risk.projO()) : '—',
      projDDisp: (risk) => risk.det ? String(risk.projD()) : '—',

      statAvg() { const a = this.model.stats().avg; return a == null ? '—' : String(a); },
      statMax() { const m = this.model.stats().max; return m ? String(m) : '—'; },
      statRated() { const st = this.model.stats(); return String(st.rated ?? 0); },

      stats() { return this.model.stats(); },

      // ── Scale text (custom override or i18n default) ──────────

      scaleText(key) {
        const custom = this.model.scales && this.model.scales[key];
        if (custom != null) return custom;
        return RATE_KEYS.has(key) ? (RATE_DEFAULTS[key] || '') : _t(key);
      },

      // ── AP scale reference ────────────────────────────────────

      apDims: ['sev', 'occ', 'det'],

      /** @param {'sev'|'occ'|'det'} dim @returns {string} i18n key of the table heading */
      apDimTitle(dim) {
        return { sev: 'scaleSeverity', occ: 'scaleOccurrence', det: 'scaleDetection' }[dim];
      },

      /** Rows 10 → 1 of one AP scale for the active FMEA type. */
      apScaleRows(dim) {
        const rows = [];
        for (let v = 10; v >= 1; v--) {
          const base = `ap.${this.model.fmeaType}.${dim}.${v}`;
          rows.push({ key: base, value: v, meaningKey: `${base}.meaning`, criterionKey: `${base}.criterion` });
        }
        return rows;
      },

      /** @returns {string[]} column labels of the AP matrix (D bands) */
      apDBandLabels() { return D_BANDS.map(bandLabel); },

      /** AP lookup matrix: one row per S band × O band; S 1 collapsed into one row. */
      apMatrixRows() {
        const rows = [];
        S_BANDS.forEach((sb, si) => {
          if (sb[0] === 1) {
            rows.push({ key: 's1', s: '1', o: '1–10',
              cells: D_BANDS.map((_, di) => ({ key: `s1-${di}`, ap: 'L', cat: AP_CATEGORY.L })) });
            return;
          }
          O_BANDS.forEach((ob, oi) => {
            rows.push({ key: `${si}-${oi}`, s: bandLabel(sb), o: bandLabel(ob),
              cells: [...AP_TABLE[si][oi]].map((ap, di) => ({ key: `${si}-${oi}-${di}`, ap, cat: AP_CATEGORY[ap] })) });
          });
        });
        return rows;
      },

      /** Tooltip text for rating v of one dimension in AP mode. */
      _apTitle(dim, v) {
        const base = `ap.${this.model.fmeaType}.${dim}.${v}`;
        return `${this.scaleText(`${base}.meaning`)} – ${this.scaleText(`${base}.criterion`)}`;
      },

      /** Tooltip labels for the S/O/D <option>s (combined meaning + detail). */
      sevTitle(v) {
        if (this.isAp()) return this._apTitle('sev', v);
        const row = scaleRow(v);
        const k = ['sevNone', 'sevLow', 'sevMod', 'sevHigh', 'sevVHigh'][row];
        return `${this.scaleText(k)  } – ${  this.scaleText(`${k  }Desc`)}`;
      },
      occTitle(v) {
        if (this.isAp()) return this._apTitle('occ', v);
        const row = scaleRow(v);
        const k = ['occUnlikely', 'occLow', 'occMod', 'occHigh', 'occVHigh'][row];
        return `${this.scaleText(k)  } (${  this.scaleText(`${k  }Rate`)  })`;
      },
      detTitle(v) {
        if (this.isAp()) return this._apTitle('det', v);
        const row = scaleRow(v);
        const k = ['detCertain', 'detHigh', 'detMod', 'detLow', 'detVLow'][row];
        return `${this.scaleText(k)  } – ${  this.scaleText(`${k  }Desc`)}`;
      },

      // ── Event handlers ────────────────────────────────────────

      addRisk() { this.model.addRisk(); },
      deleteRisk(id) { this.model.removeRisk(id); },
      addAction(risk) { this.model.addAction(risk.id); },
      deleteAction(risk, idx) { this.model.removeAction(risk.id, idx); },
      toggleCollapse(risk) { risk.collapsed = !risk.collapsed; },
      toggleScale() { this.scaleVisible = !this.scaleVisible; },
      resetScales() { this.model.resetScales(); },

      sortByPriority() {
        this.model.sortByPriority();
        module._context.notify?.(_t(this.isAp() ? 'sortedByAP' : 'sortedByRPN'));
      },

      /** Persist an edited contenteditable scale cell back to the model. */
      scaleEdited(key, $event) {
        const text = ($event.target.textContent || '').trim();
        if (!this.model.scales) this.model.scales = {};
        this.model.scales[key] = text;
      },

      // ── CSV export (file download — not UI markup) ────────────

      exportCSV() {
        const lang = module._context.i18n.getLanguage();
        const yes = lang === 'de' ? 'Ja' : 'Yes';
        const no = lang === 'de' ? 'Nein' : 'No';
        const headers = ['#', _t('step'), _t('failureMode'), _t('effect'), _t('cause'),
          _t('currentControls'), 'S', 'O', 'D', 'RPN', 'AP',
          _t('action'), _t('responsible'), _t('dueDate'), _t('done'), 'ΔS', 'ΔO', 'ΔD',
          'Proj.S', 'Proj.O', 'Proj.D', 'Proj.RPN', 'Proj.AP'];
        const cell = (v) => `"${  String(v == null ? '' : v).replace(/"/g, '""')  }"`;
        let csv = `sep=;\n${  headers.map(cell).join(';')  }\n`;
        for (const row of this.model.csvRows({ yes, no })) {
          csv += `${row.map(cell).join(';')  }\n`;
        }
        const blob = new Blob([`\uFEFF${  csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fmea_export_${  new Date().toISOString().slice(0, 10)  }.csv`;
        a.click();
        URL.revokeObjectURL(url);
        module._context.notify?.(_t('exportedCSV'));
      },

      // ── Burndown chart (imperative via chartManager) ──────────

      async showBurndown() {
        const bd = this.model.burndownSeries();
        if (!bd) {
          module._context.notify?.(_t('burndownNoData'));
          return;
        }
        this.popoutResetPosition();
        this.burndownOpen = true;
        const lang = module._context.language || 'de';
        const dateFmt = (ms) => new Date(ms).toLocaleDateString(
          lang === 'de' ? 'de-DE' : 'en-GB',
          { day: '2-digit', month: '2-digit', year: '2-digit' });

        // Wait for the x-if popout to render, then mount the chart into its anchor.
        this.$nextTick(async () => {
          const el = module._container.querySelector('[data-ref="burndown-chart"]');
          if (!el) return;
          this._destroyChart();
          const gen = ++this._renderGen;
          const line = (name, x, y, color, dash) => ({
            name, x, y, color, symbol: 'circle',
            connectLine: { show: true, dash, width: dash === 'solid' ? 2.5 : 2, color },
          });
          const series = bd.kind === 'ap'
            ? [
              line(_t('burndownHPlan'), bd.planX, bd.planH, 'var(--color-warning)', 'dash'),
              line(_t('burndownHActual'), bd.actX, bd.actH, 'var(--color-warning)', 'solid'),
              line(_t('burndownHmPlan'), bd.planX, bd.planHM, 'var(--color-info)', 'dash'),
              line(_t('burndownHmActual'), bd.actX, bd.actHM, 'var(--color-info)', 'solid'),
            ]
            : [
              line(_t('burndownPlan'), bd.planX, bd.planY, 'var(--color-text-tertiary)', 'dash'),
              line(_t('burndownActual'), bd.actX, bd.actY, 'var(--color-accent)', 'solid'),
            ];
          const chart = await module._context.chartManager.create(el, 'scatter', {
            series,
            title: _t('burndownTitle'),
            yLabel: bd.kind === 'ap' ? _t('burndownRiskCount') : 'RPN',
            yMin: 0,
            showLegend: true,
            xTickFormat: dateFmt,
          });
          if (gen !== this._renderGen || !this.burndownOpen) {
            module._context.chartManager.destroy(chart);
            return;
          }
          this._chart = chart;
        });
      },

      closeBurndown() {
        this._destroyChart();
        this.burndownOpen = false;
        this.popoutResetPosition();
      },

      _destroyChart() {
        if (this._chart) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
          this._chart = null;
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      destroy() {
        this._destroyChart();
      },
    };
  },
});

export default mod;
