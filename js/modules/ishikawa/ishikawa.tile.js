/**
 * D.Mike — Ishikawa dashboard tile (ishikawa.tile.js)
 *
 * Loaded by the dashboard via the manifest's `loadTile`. Imports only the
 * shared Ishikawa constants, never the module shell; the markup lives in
 * ishikawa.tile.html. Contract: docs/DASHBOARD.md.
 */

import { CATS } from './ishikawa-constants.js';

const STATUS_ORDER = ['open', 'testing', 'confirmed', 'rejected'];
const STATUS_COLORS = {
  open: 'var(--color-text-tertiary)', testing: 'var(--color-info)',
  confirmed: 'var(--color-success)', rejected: 'var(--color-error)',
};

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Ishikawa',
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'dashboard.tileSettings.topN' },
    showLegend: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showLegend' },
  },

  template: 'js/modules/ishikawa/ishikawa.tile.html',

  /**
   * Problem line, hypothesis/expert counts, category and status legends,
   * and the hypotheses with the highest mean expert rating.
   * @param {{state: object, settings: {topN: number, showLegend: boolean}, i18n: object}} args
   * @returns {object} view model for ishikawa.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const rows    = (state && Array.isArray(state.rows)) ? state.rows : [];
    const experts = (state && Array.isArray(state.experts)) ? state.experts : [];
    const problem = (state && state.problem) || '';
    const catLabels = (state && state.catLabels) || {};
    const catLabel = (key) => {
      const c = catLabels[key];
      return (c && c.trim()) ? c.trim() : i18n.t(`modules.ishikawa.cat.${key}`);
    };

    if (rows.length === 0) {
      return { empty: i18n.t('dashboard.ishikawaEmpty'), problem: null, summary: [], segments: [],
        legend: null, statusLegend: null, topLabel: null, top: [] };
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
    CATS.forEach(c => catCounts[c.key] = 0);
    rows.forEach(r => { const ec = effCat(r); if (ec && Object.hasOwn(catCounts, ec)) catCounts[ec]++; });
    const totalCategorized = Object.values(catCounts).reduce((a, b) => a + b, 0);

    const statusCounts = { open: 0, testing: 0, confirmed: 0, rejected: 0 };
    rows.forEach(r => { const s = r.status || 'open'; if (Object.hasOwn(statusCounts, s)) statusCounts[s]++; });

    const scored = rows
      .filter(r => experts.length && experts.map(e => r.ratings?.[e.id]).filter(x => x != null && x !== '').length > 0)
      .map(r => {
        const vals = experts.map(e => r.ratings?.[e.id]).filter(x => x != null && x !== '');
        return { name: r.name, score: vals.reduce((a, b) => a + b, 0) / vals.length, cat: effCat(r) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, settings.topN);

    const usedCats = CATS.filter(c => catCounts[c.key] > 0);
    const statusItems = STATUS_ORDER.filter(s => statusCounts[s] > 0);
    return {
      empty: null,
      problem: problem || null,
      summary: [
        { label: `${i18n.t('dashboard.ishikawaHypotheses')}: `, value: String(rows.length) },
        { label: `${i18n.t('dashboard.ishikawaExperts')}: `, value: String(experts.length) },
      ],
      segments: totalCategorized > 0
        ? usedCats.map(c => ({
          style: `width:${catCounts[c.key] / totalCategorized * 100}%;background:${c.color}`,
          title: `${catLabel(c.key)}: ${catCounts[c.key]}`,
        }))
        : [],
      legend: settings.showLegend
        ? usedCats.map(c => ({ dot: `background:${c.color}`, text: ` ${catLabel(c.key)}: ${catCounts[c.key]}` }))
        : null,
      statusLegend: settings.showLegend && statusItems.length
        ? statusItems.map(s => ({ dot: `background:${STATUS_COLORS[s]}`,
          text: ` ${i18n.t(`modules.ishikawa.status.${s}`)}: ${statusCounts[s]}` }))
        : null,
      topLabel: scored.length ? i18n.t('dashboard.ishikawaTopScored') : null,
      top: scored.map(t => {
        const catObj = CATS.find(c => c.key === t.cat);
        return { name: t.name || '—', score: t.score.toFixed(1),
          style: `color:${catObj ? catObj.color : 'var(--color-text-secondary)'}` };
      }),
    };
  },
};
