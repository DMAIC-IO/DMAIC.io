/**
 * D.Mike — Ishikawa dashboard tile (ishikawa.tile.js)
 *
 * Loaded by the dashboard via the manifest's `loadTile`. Imports only the
 * shared Ishikawa constants, never the module shell. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
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

  /**
   * @param {HTMLElement} host
   * @param {{state: object, settings: {topN: number, showLegend: boolean}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
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
    CATS.forEach(c => catCounts[c.key] = 0);
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
      h('span', {}, `${i18n.t('dashboard.ishikawaHypotheses')}: `, h('strong', {}, String(rows.length))),
      h('span', {}, `${i18n.t('dashboard.ishikawaExperts')}: `, h('strong', {}, String(experts.length))),
    ));

    if (totalCategorized > 0) {
      children.push(h('div', { class: 'dashboard-fmea__bar' },
        ...CATS.map(c => {
          const pct = catCounts[c.key] / totalCategorized * 100;
          if (pct === 0) return null;
          return h('div', {
            class: 'dashboard-fmea__bar-seg',
            style: `width:${pct}%;background:${c.color}`,
            title: `${catLabel(c.key)}: ${catCounts[c.key]}`,
          });
        }).filter(Boolean)));
    }

    if (settings.showLegend) {
      children.push(h('div', { class: 'dashboard-fmea__legend' },
        ...CATS.filter(c => catCounts[c.key] > 0).map(c =>
          h('span', { class: 'dashboard-fmea__legend-item' },
            h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${c.color}` }),
            ` ${catLabel(c.key)}: ${catCounts[c.key]}`))));

      const statusItems = STATUS_ORDER.filter(s => statusCounts[s] > 0);
      if (statusItems.length) {
        children.push(h('div', { class: 'dashboard-fmea__legend', style: 'margin-top:4px' },
          ...statusItems.map(s => h('span', { class: 'dashboard-fmea__legend-item' },
            h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${STATUS_COLORS[s]}` }),
            ` ${i18n.t(`modules.ishikawa.status.${s}`)}: ${statusCounts[s]}`))));
      }
    }

    const scored = rows
      .filter(r => experts.length && experts.map(e => r.ratings?.[e.id]).filter(x => x != null && x !== '').length > 0)
      .map(r => {
        const vals = experts.map(e => r.ratings?.[e.id]).filter(x => x != null && x !== '');
        return { name: r.name, score: vals.reduce((a, b) => a + b, 0) / vals.length, cat: effCat(r) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, settings.topN);

    if (scored.length) {
      children.push(h('div', { class: 'dashboard-fmea__top-label' }, i18n.t('dashboard.ishikawaTopScored')));
      children.push(h('ol', { class: 'dashboard-fmea__top-list' },
        ...scored.map(t => {
          const catObj = CATS.find(c => c.key === t.cat);
          const color = catObj ? catObj.color : 'var(--color-text-secondary)';
          return h('li', { class: 'dashboard-fmea__top-item' },
            h('span', { class: 'dashboard-fmea__top-desc' }, t.name || '—'),
            h('span', { class: 'dashboard-fmea__top-rpn', style: `color:${color}` }, t.score.toFixed(1)));
        })));
    }

    host.replaceChildren(...children);
  },
};
