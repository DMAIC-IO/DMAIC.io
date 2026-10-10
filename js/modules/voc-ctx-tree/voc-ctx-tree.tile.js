/**
 * D.Mike — VoC → CTx dashboard tile (voc-ctx-tree.tile.js)
 *
 * One tile for the first VoC instance (fixed id `voc-ctx-tree`). Loaded via
 * the manifest's `loadTile`. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titleKey: 'dashboard.vocTitle',
  settings: {
    topN: { type: 'number', min: 1, max: 20, step: 1, default: 6, label: 'dashboard.tileSettings.topStatements' },
    showLegend: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showLegend' },
  },

  /**
   * One tile for the first VoC instance only.
   * @param {{i18n: object, findInstances: function}} ctx
   * @returns {Array<{tileId: string, instanceId: string, title: string}>}
   */
  enumerate(ctx) {
    const [first] = ctx.findInstances('voc-ctx-tree');
    return first ? [{ tileId: 'voc-ctx-tree', instanceId: first.instanceId, title: ctx.i18n.t('dashboard.vocTitle') }] : [];
  },

  /**
   * @param {HTMLElement} host
   * @param {{state: object, settings: {topN: number, showLegend: boolean}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
    const vocs = (state && Array.isArray(state.vocs)) ? state.vocs : [];

    if (vocs.length === 0) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.vocEmpty')));
      return;
    }

    let needs = 0, ctq = 0, ctd = 0, ctc = 0, reqs = 0;
    for (const voc of vocs) {
      for (const need of (voc.needs || [])) {
        needs++;
        for (const drv of (need.drivers || [])) {
          if (drv.type === 'ctq') ctq++;
          else if (drv.type === 'ctd') ctd++;
          else if (drv.type === 'ctc') ctc++;
          reqs += (drv.requirements || []).length;
        }
      }
    }
    const drivers = ctq + ctd + ctc;

    const summary = h('div', { class: 'dashboard-voc__summary' },
      h('span', { class: 'dashboard-voc__stat' }, h('strong', null, String(vocs.length)), ' VoC'),
      h('span', { class: 'dashboard-voc__stat' }, h('strong', null, String(needs)), ` ${  i18n.t('dashboard.vocNeeds')}`),
      h('span', { class: 'dashboard-voc__stat' }, h('strong', null, String(drivers)), ` ${  i18n.t('dashboard.vocDrivers')}`),
      h('span', { class: 'dashboard-voc__stat' }, h('strong', null, String(reqs)), ` ${  i18n.t('dashboard.vocReqs')}`),
    );

    const children = [summary];

    if (drivers > 0) {
      const bar = h('div', { class: 'dashboard-voc__driver-bar' });
      if (ctq > 0) bar.append(h('div', { class: 'dashboard-voc__bar-seg', style: `flex:${ctq};background:var(--color-voc-ctq, rgba(39,174,96,1))`, title: `CTQ: ${ctq}` }));
      if (ctd > 0) bar.append(h('div', { class: 'dashboard-voc__bar-seg', style: `flex:${ctd};background:var(--color-voc-ctd, rgba(41,128,185,1))`, title: `CTD: ${ctd}` }));
      if (ctc > 0) bar.append(h('div', { class: 'dashboard-voc__bar-seg', style: `flex:${ctc};background:var(--color-voc-ctc, rgba(231,76,139,1))`, title: `CTC: ${ctc}` }));
      children.push(bar);

      const legend = h('div', { class: 'dashboard-voc__driver-legend' });
      if (ctq > 0) legend.append(h('span', { class: 'dashboard-voc__legend-item' }, h('span', { class: 'dashboard-fmea__legend-dot', style: 'background:var(--color-voc-ctq, rgba(39,174,96,1))' }), `CTQ: ${ctq}`));
      if (ctd > 0) legend.append(h('span', { class: 'dashboard-voc__legend-item' }, h('span', { class: 'dashboard-fmea__legend-dot', style: 'background:var(--color-voc-ctd, rgba(41,128,185,1))' }), `CTD: ${ctd}`));
      if (ctc > 0) legend.append(h('span', { class: 'dashboard-voc__legend-item' }, h('span', { class: 'dashboard-fmea__legend-dot', style: 'background:var(--color-voc-ctc, rgba(231,76,139,1))' }), `CTC: ${ctc}`));
      if (settings.showLegend) children.push(legend);
    }

    children.push(h('div', { class: 'dashboard-voc__list-label' }, i18n.t('dashboard.vocStatements')));

    const list = h('ul', { class: 'dashboard-voc__list' });
    vocs.slice(0, settings.topN).forEach(v => {
      const li = h('li', { class: 'dashboard-voc__item' }, `„${v.text || '—'}“`);
      if (v.source) {
        li.append(' ', h('span', { class: 'dashboard-area__muted' }, `(${v.source})`));
      }
      list.append(li);
    });
    if (vocs.length > settings.topN) {
      list.append(h('li', { class: 'dashboard-voc__item dashboard-area__muted' }, `… +${vocs.length - settings.topN}`));
    }
    children.push(list);

    host.replaceChildren(...children);
  },
};
