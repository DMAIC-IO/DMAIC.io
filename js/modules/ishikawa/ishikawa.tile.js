/**
 * D.Mike — Ishikawa dashboard tile (ishikawa.tile.js)
 *
 * Loaded by the dashboard via the manifest's `loadTile`. Imports only the
 * shared Ishikawa constants, never the module shell; the markup lives in
 * ishikawa.tile.html. Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

import { CATS } from './ishikawa-constants.js';
import { topN, showLegend, distribution } from '../../ui/tile-kit.js';

const STATUS_ORDER = ['open', 'testing', 'confirmed', 'rejected'];
const STATUS_COLORS = {
  open: 'var(--color-text-tertiary)', testing: 'var(--color-info)',
  confirmed: 'var(--color-success)', rejected: 'var(--color-error)',
};

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Ishikawa',
  settings: {
    topN: topN(),
    showLegend: showLegend(),
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

    const cats = distribution(CATS.map(c => ({ key: c.key, label: catLabel(c.key), count: catCounts[c.key], color: c.color })));
    const statusLegend = distribution(STATUS_ORDER.map(s => ({ key: s, label: i18n.t(`modules.ishikawa.status.${s}`),
      count: statusCounts[s], color: STATUS_COLORS[s] }))).legend;
    return {
      empty: null,
      problem: problem || null,
      summary: [
        { label: `${i18n.t('dashboard.ishikawaHypotheses')}: `, value: String(rows.length) },
        { label: `${i18n.t('dashboard.ishikawaExperts')}: `, value: String(experts.length) },
      ],
      segments: cats.segments,
      legend: settings.showLegend ? cats.legend : null,
      statusLegend: settings.showLegend && statusLegend.length ? statusLegend : null,
      topLabel: scored.length ? i18n.t('dashboard.ishikawaTopScored') : null,
      top: scored.map(t => {
        const catObj = CATS.find(c => c.key === t.cat);
        return { name: t.name || '—', score: t.score.toFixed(1),
          style: `color:${catObj ? catObj.color : 'var(--color-text-secondary)'}` };
      }),
    };
  },
};
