/**
 * D.Mike — TRIZ Trends of Technical Evolution Module (triz-evolution-trends.js)
 * Improve / Innovation: place the system on each of eight classical Altschuller
 * evolution trends and capture next-stage opportunities.
 *
 * Spec: docs/modules/TRIZ-EVOLUTION-TRENDS.md
 */

// Trend definitions: id → { stageCount }.  Stage labels and descriptions live
// in i18n so they can be translated.  Trend "uneven" has no stages — just a
// qualitative notes field.
const TRENDS = [
  { id: 'aggregation',     stages: 4 },
  { id: 'dynamism',        stages: 5 },
  { id: 'scale',           stages: 4 },
  { id: 'automation',      stages: 4 },
  { id: 'completeness',    stages: 4 },
  { id: 'controllability', stages: 4 },
  { id: 'matching',        stages: 4 },
  { id: 'uneven',          stages: 0 },
];

function emptyTrends() {
  const out = {};
  for (const t of TRENDS) {
    out[t.id] = t.stages > 0 ? { stage: -1, notes: '' } : { notes: '' };
  }
  return out;
}

export default {
  id: 'triz-evolution-trends',
  phase: 'improve',
  icon: 'trending-up',
  i18nKey: 'modules.triz-evolution-trends',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,

  /** @type {string} */ _system: '',
  /** @type {Record<string, {stage?:number, notes:string}>} */
  _trends: emptyTrends(),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._restore(saved);

    this._render();
  },

  async destroy() {
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS custom properties handle theme changes.
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      system: this._system,
      trends: this._cloneTrends(this._trends),
    };
  },

  setState(data) {
    this._restore(data);
    if (this._container) this._render();
  },

  _restore(data) {
    this._system = typeof data?.system === 'string' ? data.system : '';
    const trends = emptyTrends();
    if (data?.trends && typeof data.trends === 'object') {
      for (const t of TRENDS) {
        const src = data.trends[t.id];
        if (!src) continue;
        if (t.stages > 0) {
          const s = Number(src.stage);
          trends[t.id].stage = Number.isInteger(s) && s >= -1 && s < t.stages ? s : -1;
        }
        trends[t.id].notes = typeof src.notes === 'string' ? src.notes : '';
      }
    }
    this._trends = trends;
  },

  _cloneTrends(trends) {
    const out = {};
    for (const t of TRENDS) {
      out[t.id] = t.stages > 0
        ? { stage: trends[t.id].stage, notes: trends[t.id].notes }
        : { notes: trends[t.id].notes };
    }
    return out;
  },

  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!this._system || this._anyFilled();
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    this.setState(payload.data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  _anyFilled() {
    for (const t of TRENDS) {
      const entry = this._trends[t.id];
      if (entry.notes) return true;
      if (t.stages > 0 && entry.stage >= 0) return true;
    }
    return false;
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./triz-evolution-trends-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const i18n = this._context.i18n;
    const t = (key, params) => i18n.t(`modules.triz-evolution-trends.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container triz-evo">
        <div class="module-container__header">
          <h2 class="module-container__title">${i18n.t('modules.triz-evolution-trends.name')}</h2>
          <div class="module-container__subtitle">${t('subtitle')}</div>
        </div>

        <div class="module-container__body triz-evo__body">

          <section class="triz-evo__topbar">
            <label class="triz-evo__label" for="triz-evo-system">${t('systemLabel')}</label>
            <input id="triz-evo-system" class="field triz-evo__system-input" type="text"
              data-role="system"
              value="${this._escape(this._system)}"
              placeholder="${t('systemPlaceholder')}" />
          </section>

          ${TRENDS.map((trend, idx) => this._renderTrend(trend, idx + 1, t)).join('')}

        </div>
      </div>
    `;

    this._wire();
  },

  _renderTrend(trend, num, t) {
    const id = trend.id;
    const entry = this._trends[id];
    const stages = trend.stages;

    // Trend 8 (uneven) — qualitative card, no radios.
    if (stages === 0) {
      return `
        <section class="triz-evo__trend triz-evo__trend--qualitative">
          <header class="triz-evo__trend-head">
            <span class="triz-evo__trend-num">${num}</span>
            <h3 class="triz-evo__trend-title">${t(`trend.${id}.name`)}</h3>
          </header>
          <p class="triz-evo__trend-desc">${t(`trend.${id}.description`)}</p>
          <textarea
            class="field triz-evo__notes"
            rows="3"
            data-role="notes"
            data-trend="${id}"
            placeholder="${t(`trend.${id}.notesPlaceholder`)}"
          >${this._escape(entry.notes)}</textarea>
        </section>
      `;
    }

    // Standard trend card: radio group + notes textarea.
    const radios = Array.from({ length: stages }, (_, i) => {
      const checked = entry.stage === i ? 'checked' : '';
      const label = t(`trend.${id}.stages.${i}`);
      return `
        <label class="triz-evo__stage${entry.stage === i ? ' is-selected' : ''}">
          <input
            type="radio"
            name="triz-evo-${id}-${this._context.instanceId}"
            value="${i}"
            data-role="stage"
            data-trend="${id}"
            ${checked}
          />
          <span class="triz-evo__stage-idx">${i + 1}</span>
          <span class="triz-evo__stage-label">${label}</span>
        </label>
      `;
    }).join('');

    return `
      <section class="triz-evo__trend">
        <header class="triz-evo__trend-head">
          <span class="triz-evo__trend-num">${num}</span>
          <h3 class="triz-evo__trend-title">${t(`trend.${id}.name`)}</h3>
        </header>
        <p class="triz-evo__trend-desc">${t(`trend.${id}.description`)}</p>
        <div class="triz-evo__stages" role="radiogroup" aria-label="${t(`trend.${id}.name`)}">
          ${radios}
        </div>
        <textarea
          class="field triz-evo__notes"
          rows="2"
          data-role="notes"
          data-trend="${id}"
          placeholder="${t('notesPlaceholder')}"
        >${this._escape(entry.notes)}</textarea>
      </section>
    `;
  },

  // ─── Wiring ─────────────────────────────────────────────────

  _wire() {
    const c = this._container;

    c.querySelector('[data-role="system"]')?.addEventListener('input', (e) => {
      this._system = e.target.value;
      this._persist();
    });

    c.querySelectorAll('[data-role="stage"]').forEach(el => {
      el.addEventListener('change', (e) => {
        const trendId = e.currentTarget.dataset.trend;
        const stage = Number(e.target.value);
        if (!this._trends[trendId] || !Number.isInteger(stage)) return;
        this._trends[trendId].stage = stage;
        this._persist();
        this._render();
      });
    });

    c.querySelectorAll('[data-role="notes"]').forEach(el => {
      el.addEventListener('input', (e) => {
        const trendId = e.currentTarget.dataset.trend;
        if (!this._trends[trendId]) return;
        this._trends[trendId].notes = e.target.value;
        this._persist();
      });
    });
  },

  _persist() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  },
};
