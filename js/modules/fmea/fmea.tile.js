/**
 * D.Mike — FMEA dashboard tile (fmea.tile.js)
 *
 * Loaded by the dashboard via the manifest's `loadTile`. Imports only the
 * pure FMEA model, never the module shell. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
import { State, rpnCategory } from './fmea-model.js';

const CATS = new Set(['critical', 'high', 'medium', 'low']);
/** Fill colour of a category — the module's palette from fmea.css. */
const catColor = (cat) => `var(--fmea-cat-${CATS.has(cat) ? cat : 'none'})`;
/** Readable text colour of a category (contrast ≥ 4.5:1 in both themes). */
const catTextColor = (cat) => (CATS.has(cat) ? `var(--fmea-cat-${cat}-text)` : 'var(--fmea-cat-none)');

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'FMEA',
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'dashboard.tileSettings.topN' },
    showLegend: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showLegend' },
  },

  /**
   * @param {HTMLElement} host
   * @param {{state: object, settings: {topN: number, showLegend: boolean}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
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
    const top = ranked.slice(0, settings.topN);
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
        h('strong', { style: `color:${catTextColor('high')}` }, String(cats.high))));
    } else {
      const maxRPN = Math.max(0, ...model.risks.map(r => r.rpn()));
      summaryParts.push(h('span', {}, `${i18n.t('dashboard.fmeaMaxRPN')}: `,
        h('strong', { style: `color:${catTextColor(rpnCategory(maxRPN))}` }, maxRPN ? String(maxRPN) : '—')));
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
    const children = [summary, bar];
    if (settings.showLegend) {
      children.push(h('div', { class: 'dashboard-fmea__legend' },
        ...[...barCats, 'none'].filter(c => cats[c] > 0)
          .map(cat => h('span', { class: 'dashboard-fmea__legend-item' },
            h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${catColor(cat)}` }),
            ` ${catLabels[cat]}: ${cats[cat]}`)),
      ));
    }
    if (top.length) {
      children.push(h('div', { class: 'dashboard-fmea__top-label' }, i18n.t('dashboard.fmeaTopRisks')));
      children.push(h('ol', { class: 'dashboard-fmea__top-list' },
        ...top.map(r => h('li', { class: 'dashboard-fmea__top-item' },
          h('span', { class: 'dashboard-fmea__top-desc' }, r.failureMode || r.step || '—'),
          h('span', { class: 'dashboard-fmea__top-rpn', style: `color:${catTextColor(rating.category(r))}` }, badge(r))))));
    }
    host.replaceChildren(...children);
  },
};
