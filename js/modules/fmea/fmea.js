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
import { State, RPN_CRITICAL, RPN_HIGH, RPN_MEDIUM } from './fmea-model.js';

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

/** RPN badge CSS class for a value. */
function rpnBadgeClass(v) {
  if (!v) return 'fmea__rpn-badge--none';
  if (v > RPN_CRITICAL) return 'fmea__rpn-badge--critical';
  if (v >= RPN_HIGH) return 'fmea__rpn-badge--high';
  if (v >= RPN_MEDIUM) return 'fmea__rpn-badge--medium';
  return 'fmea__rpn-badge--low';
}

/** Card-glow CSS class for a value. */
function cardGlowClass(v) {
  if (!v) return '';
  if (v > RPN_CRITICAL) return 'fmea__risk-card--critical';
  if (v >= RPN_HIGH) return 'fmea__risk-card--high';
  if (v >= RPN_MEDIUM) return 'fmea__risk-card--medium';
  return 'fmea__risk-card--low';
}

// ── Dashboard-tile helpers (static; render from persisted state) ──────────
const RPN_CAT_COLOR = {
  critical: 'var(--color-error)',
  high:     'var(--color-warning)',
  medium:   'var(--color-info)',
  low:      'var(--color-success)',
  none:     'var(--color-text-tertiary)',
};
const rpnCategory = (rpn) => {
  if (!rpn) return 'none';
  if (rpn > RPN_CRITICAL) return 'critical';
  if (rpn >= RPN_HIGH) return 'high';
  if (rpn >= RPN_MEDIUM) return 'medium';
  return 'low';
};
const rpnCatColor = (cat) => RPN_CAT_COLOR[cat] || RPN_CAT_COLOR.none;

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
    icon: 'alert-triangle',
    version: '1.1.0',
    meta: import.meta,
    actions: [
      { icon: 'glossary', title: 'scales', onClick: (d) => d.toggleScale() },
      { icon: 'chart-thumb-run-chart', title: 'burndown', onClick: (d) => d.showBurndown() },
      { icon: 'chevron-down', title: 'sortByRPN', onClick: (d) => d.sortByRPN() },
      { icon: 'download', title: 'export.label', children: [
        { icon: 'export-csv', title: 'export.csv', onClick: (d) => d.exportCSV() },
      ] },
      { icon: 'plus', title: 'addRisk', variant: 'primary', onClick: (d) => d.addRisk() },
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
        const rpns = risks.map(r => {
          const s = parseInt(r.sev) || 0, o = parseInt(r.occ) || 0, d = parseInt(r.det) || 0;
          return (s && o && d) ? s * o * d : 0;
        });
        const cats = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
        rpns.forEach(v => cats[rpnCategory(v)]++);
        const indexed = risks.map((r, i) => ({ risk: r, rpn: rpns[i] }));
        indexed.sort((a, b) => b.rpn - a.rpn);
        const top = indexed.slice(0, 5).filter(t => t.rpn > 0);
        const catLabels = {
          critical: i18n.t('dashboard.fmeaCritical'),
          high:     i18n.t('dashboard.fmeaHigh'),
          medium:   i18n.t('dashboard.fmeaMedium'),
          low:      i18n.t('dashboard.fmeaLow'),
          none:     i18n.t('dashboard.fmeaNotRated'),
        };
        const totalRated = rpns.filter(v => v > 0).length;
        const maxRPN = Math.max(...rpns, 0);
        const summary = h('div', { class: 'dashboard-fmea__summary' },
          h('span', {}, `${i18n.t('dashboard.fmeaRisks')  }: `, h('strong', {}, String(risks.length))),
          h('span', {}, `${i18n.t('dashboard.fmeaMaxRPN')  }: `,
            h('strong', { style: `color:${rpnCatColor(rpnCategory(maxRPN))}` }, maxRPN ? String(maxRPN) : '—')),
        );
        const bar = h('div', { class: 'dashboard-fmea__bar' },
          ...['critical', 'high', 'medium', 'low'].map(cat => {
            const pct = totalRated > 0 ? (cats[cat] / risks.length * 100) : 0;
            if (pct === 0) return null;
            return h('div', { class: 'dashboard-fmea__bar-seg',
              style: `width:${pct}%;background:${rpnCatColor(cat)}`, title: `${catLabels[cat]}: ${cats[cat]}` });
          }).filter(Boolean),
        );
        const legend = h('div', { class: 'dashboard-fmea__legend' },
          ...['critical', 'high', 'medium', 'low', 'none'].filter(c => cats[c] > 0)
            .map(cat => h('span', { class: 'dashboard-fmea__legend-item' },
              h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${rpnCatColor(cat)}` }),
              ` ${catLabels[cat]}: ${cats[cat]}`)),
        );
        const children = [summary, bar, legend];
        if (top.length) {
          children.push(h('div', { class: 'dashboard-fmea__top-label' }, i18n.t('dashboard.fmeaTopRisks')));
          children.push(h('ol', { class: 'dashboard-fmea__top-list' },
            ...top.map(t => {
              const cat = rpnCategory(t.rpn);
              const desc = t.risk.failureMode || t.risk.step || '—';
              return h('li', { class: 'dashboard-fmea__top-item' },
                h('span', { class: 'dashboard-fmea__top-desc' }, desc),
                h('span', { class: 'dashboard-fmea__top-rpn', style: `color:${rpnCatColor(cat)}` }, `RPN ${t.rpn}`));
            })));
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

      rpnBadgeClass,
      riskNum: (i) => `R-${  String(i + 1).padStart(3, '0')}`,
      rpnText: (v) => v ? (`RPN ${  v}`) : 'RPN —',
      addActionLabel: () => `＋ ${  _t('addAction')}`,
      targetText: (v) => v ? (`${_t('target')  } ${  v}`) : (`${_t('target')  } —`),

      /** Combined card class: glow tier + collapsed marker. */
      cardClass(risk) {
        const glow = cardGlowClass(risk.rpn());
        const collapsed = risk.collapsed ? 'fmea__risk-card--collapsed' : '';
        return (`${glow  } ${  collapsed}`).trim();
      },

      projSDisp: (risk) => risk.sev ? String(risk.projS()) : '—',
      projODisp: (risk) => risk.occ ? String(risk.projO()) : '—',
      projDDisp: (risk) => risk.det ? String(risk.projD()) : '—',

      statAvg() { const a = this.model.stats().avg; return a == null ? '—' : String(a); },
      statMax() { const m = this.model.stats().max; return m ? String(m) : '—'; },

      stats() { return this.model.stats(); },

      // ── Scale text (custom override or i18n default) ──────────

      scaleText(key) {
        const custom = this.model.scales && this.model.scales[key];
        if (custom != null) return custom;
        return RATE_KEYS.has(key) ? (RATE_DEFAULTS[key] || '') : _t(key);
      },

      /** Tooltip labels for the S/O/D <option>s (combined meaning + detail). */
      sevTitle(v) {
        const row = scaleRow(v);
        const k = ['sevNone', 'sevLow', 'sevMod', 'sevHigh', 'sevVHigh'][row];
        return `${this.scaleText(k)  } – ${  this.scaleText(`${k  }Desc`)}`;
      },
      occTitle(v) {
        const row = scaleRow(v);
        const k = ['occUnlikely', 'occLow', 'occMod', 'occHigh', 'occVHigh'][row];
        return `${this.scaleText(k)  } (${  this.scaleText(`${k  }Rate`)  })`;
      },
      detTitle(v) {
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

      sortByRPN() {
        this.model.sortByRPN();
        module._context.notify?.(_t('sortedByRPN'));
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
          _t('currentControls'), 'S', 'O', 'D', 'RPN',
          _t('action'), _t('responsible'), _t('dueDate'), _t('done'), 'ΔS', 'ΔO', 'ΔD',
          'Proj.S', 'Proj.O', 'Proj.D', 'Proj.RPN'];
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
          const chart = await module._context.chartManager.create(el, 'scatter', {
            series: [
              {
                name: _t('burndownPlan'),
                x: bd.planX, y: bd.planY,
                color: 'var(--color-text-tertiary)', symbol: 'circle',
                connectLine: { show: true, dash: 'dash', width: 2, color: 'var(--color-text-tertiary)' },
              },
              {
                name: _t('burndownActual'),
                x: bd.actX, y: bd.actY,
                color: 'var(--color-accent)', symbol: 'circle',
                connectLine: { show: true, dash: 'solid', width: 2.5, color: 'var(--color-accent)' },
              },
            ],
            title: _t('burndownTitle'),
            yLabel: 'RPN',
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
