/**
 * D.Mike — FMEA dashboard tile (fmea.tile.js)
 *
 * Loaded by the dashboard via the manifest's `loadTile`. Imports only the
 * pure FMEA model, never the module shell; the markup lives in
 * fmea.tile.html. Contract: docs/DASHBOARD.md.
 */

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

  template: 'js/modules/fmea/fmea.tile.html',

  /**
   * Risk summary, category bar, legend and the top risks (RPN or AP rating).
   * @param {{state: object, settings: {topN: number, showLegend: boolean}, i18n: object}} args
   * @returns {object} view model for fmea.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const risks = (state && Array.isArray(state.risks)) ? state.risks : [];
    if (risks.length === 0) {
      return { empty: i18n.t('dashboard.fmeaEmpty'), summary: [], segments: [], legend: null, topLabel: null, top: [] };
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

    const summary = [{ label: `${i18n.t('dashboard.fmeaRisks')}: `, value: String(model.risks.length), style: '', modifier: '' }];
    if (isAp) {
      summary.push({ label: `${catLabels.high}: `, value: String(cats.high),
        style: `color:${catTextColor('high')}`, modifier: '' });
    } else {
      const maxRPN = Math.max(0, ...model.risks.map(r => r.rpn()));
      summary.push({ label: `${i18n.t('dashboard.fmeaMaxRPN')}: `, value: maxRPN ? String(maxRPN) : '—',
        style: `color:${catTextColor(rpnCategory(maxRPN))}`, modifier: '' });
    }
    const st = model.stats();
    const flagCount = isAp ? st.unjustified : st.highSeverity;
    summary.push({
      label: `${i18n.t(isAp ? 'dashboard.fmeaUnjustified' : 'dashboard.fmeaSevere')}: `,
      value: String(flagCount),
      style: flagCount ? `color:${catTextColor(isAp ? 'high' : 'critical')}` : '',
      modifier: 'dashboard-fmea__flag-count',
    });

    return {
      empty: null,
      summary,
      segments: barCats.filter(cat => cats[cat] > 0).map(cat => ({
        style: `width:${cats[cat] / model.risks.length * 100}%;background:${catColor(cat)}`,
        title: `${catLabels[cat]}: ${cats[cat]}`,
      })),
      legend: settings.showLegend
        ? [...barCats, 'none'].filter(c => cats[c] > 0)
          .map(cat => ({ dot: `background:${catColor(cat)}`, text: ` ${catLabels[cat]}: ${cats[cat]}` }))
        : null,
      topLabel: top.length ? i18n.t('dashboard.fmeaTopRisks') : null,
      top: top.map(r => ({
        desc: r.failureMode || r.step || '—',
        flag: r.specialChar || null,
        badge: badge(r),
        style: `color:${catTextColor(rating.category(r))}`,
      })),
    };
  },
};
