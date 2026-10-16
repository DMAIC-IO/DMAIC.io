/**
 * D.Mike — VoC → CTx dashboard tile (voc-ctx-tree.tile.js)
 *
 * One tile for the first VoC instance (fixed id `voc-ctx-tree`). Loaded via
 * the manifest's `loadTile`. The markup lives in voc-ctx-tree.tile.html.
 * Contract: docs/DASHBOARD.md.
 */

const DRIVERS = [
  { type: 'ctq', label: 'CTQ', color: 'var(--color-voc-ctq, rgba(39,174,96,1))' },
  { type: 'ctd', label: 'CTD', color: 'var(--color-voc-ctd, rgba(41,128,185,1))' },
  { type: 'ctc', label: 'CTC', color: 'var(--color-voc-ctc, rgba(231,76,139,1))' },
];

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

  template: 'js/modules/voc-ctx-tree/voc-ctx-tree.tile.html',

  /**
   * Tree counts, CTQ/CTD/CTC distribution and the first statements.
   * @param {{state: object, settings: {topN: number, showLegend: boolean}, i18n: object}} args
   * @returns {object} view model for voc-ctx-tree.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const vocs = (state && Array.isArray(state.vocs)) ? state.vocs : [];
    if (vocs.length === 0) {
      return { empty: i18n.t('dashboard.vocEmpty'), stats: [], segments: [], legend: null,
        listLabel: null, items: [], more: null };
    }

    let needs = 0, reqs = 0;
    const byType = { ctq: 0, ctd: 0, ctc: 0 };
    for (const voc of vocs) {
      for (const need of (voc.needs || [])) {
        needs++;
        for (const drv of (need.drivers || [])) {
          if (Object.hasOwn(byType, drv.type)) byType[drv.type]++;
          reqs += (drv.requirements || []).length;
        }
      }
    }
    const drivers = byType.ctq + byType.ctd + byType.ctc;
    const used = DRIVERS.filter(d => byType[d.type] > 0);

    return {
      empty: null,
      stats: [
        { value: String(vocs.length), label: ' VoC' },
        { value: String(needs), label: ` ${i18n.t('dashboard.vocNeeds')}` },
        { value: String(drivers), label: ` ${i18n.t('dashboard.vocDrivers')}` },
        { value: String(reqs), label: ` ${i18n.t('dashboard.vocReqs')}` },
      ],
      segments: used.map(d => ({ style: `flex:${byType[d.type]};background:${d.color}`, title: `${d.label}: ${byType[d.type]}` })),
      legend: settings.showLegend && drivers > 0
        ? used.map(d => ({ dot: `background:${d.color}`, text: `${d.label}: ${byType[d.type]}` }))
        : null,
      listLabel: i18n.t('dashboard.vocStatements'),
      items: vocs.slice(0, settings.topN).map(v => ({
        quote: v.source ? `„${v.text || '—'}“ ` : `„${v.text || '—'}“`,
        source: v.source ? `(${v.source})` : null,
      })),
      more: vocs.length > settings.topN ? `… +${vocs.length - settings.topN}` : null,
    };
  },
};
