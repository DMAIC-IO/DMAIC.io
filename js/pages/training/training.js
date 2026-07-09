/**
 * D.Mike — Training page (training.js)
 * Fully-Alpine conversion of the former _initTraining overlay. The data-fn
 * produces block arrays from i18n; training.html renders them generically.
 *
 * Behavior is a 1:1 port of the legacy _initTraining overlay (same tabs, same
 * i18n keys, same table structure, ordering and modules-overview logic). HTML
 * escaping is no longer needed in the producers — Alpine's x-text auto-escapes.
 */

import { createPage } from '../../core/create-page.js';
import { CYCLES, getCycle, getPhaseIds, getPhaseDef } from '../../core/cycles/cycles.js';

const cell = (segs, cls) => (cls ? { segs, cls } : { segs });
const cellOf = (text) => cell([{ text }]);

/** Cycle methodology primer (DMAIC / DMADV / 8D). `t` is prefixed to `training`. */
export function cycleBlocks(t, cycleId) {
  const blocks = [
    { type: 'p',  text: t(`${cycleId}.intro`) },
    { type: 'h3', text: t(`${cycleId}.whyTitle`) },
    { type: 'p',  text: t(`${cycleId}.whyBody`) },
    { type: 'h3', text: t(`${cycleId}.phasesTitle`) },
  ];
  getPhaseIds(cycleId).forEach(id => {
    blocks.push({ type: 'h4', text: t(`${cycleId}.${id}Title`) });
    blocks.push({ type: 'p',  text: t(`${cycleId}.${id}Body`) });
  });
  blocks.push({ type: 'h3', text: t(`${cycleId}.whenTitle`) });
  blocks.push({ type: 'p',  text: t(`${cycleId}.whenBody`) });
  blocks.push({ type: 'h3', text: t(`${cycleId}.pitfallsTitle`) });
  blocks.push({ type: 'ul', items: [1, 2, 3, 4].map(n => t(`${cycleId}.pitfall${n}`)) });
  blocks.push({ type: 'h3', text: t(`${cycleId}.appTitle`) });
  blocks.push({ type: 'p',  text: t(`${cycleId}.appBody`) });
  return blocks;
}

/** TRIZ primer. */
export function trizBlocks(t) {
  return [
    { type: 'p',  text: t('triz.intro') },
    { type: 'h3', text: t('triz.whyTitle') },
    { type: 'p',  text: t('triz.whyBody') },
    { type: 'h3', text: t('triz.conceptsTitle') },
    { type: 'h4', text: t('triz.contradictionTitle') },
    { type: 'p',  text: t('triz.contradictionBody') },
    { type: 'h4', text: t('triz.idealityTitle') },
    { type: 'p',  text: t('triz.idealityBody') },
    { type: 'h4', text: t('triz.evolutionTitle') },
    { type: 'p',  text: t('triz.evolutionBody') },
    { type: 'h3', text: t('triz.toolsTitle') },
    { type: 'h4', text: t('triz.tool40Title') },
    { type: 'p',  text: t('triz.tool40Body') },
    { type: 'h4', text: t('triz.toolMatrixTitle') },
    { type: 'p',  text: t('triz.toolMatrixBody') },
    { type: 'h4', text: t('triz.tool9WindowsTitle') },
    { type: 'p',  text: t('triz.tool9WindowsBody') },
    { type: 'h4', text: t('triz.toolArizTitle') },
    { type: 'p',  text: t('triz.toolArizBody') },
    { type: 'h3', text: t('triz.whenTitle') },
    { type: 'p',  text: t('triz.whenBody') },
    { type: 'h3', text: t('triz.pitfallsTitle') },
    { type: 'ul', items: [1, 2, 3, 4].map(n => t(`triz.pitfall${n}`)) },
    { type: 'h3', text: t('triz.appTitle') },
    { type: 'p',  text: t('triz.appBody') },
  ];
}

/** Tool-comparison primer (Minitab / JMP). `ns` is the i18n sub-namespace. */
export function toolBlocks(t, ns) {
  const rows = [];
  for (let i = 1; i <= 8; i++) {
    rows.push([cellOf(t(`${ns}.row${i}a`)), cellOf(t(`${ns}.row${i}b`)), cellOf(t(`${ns}.row${i}c`))]);
  }
  return [
    { type: 'p',  text: t(`${ns}.intro`) },
    { type: 'h3', text: t(`${ns}.conceptsTitle`) },
    { type: 'p',  text: t(`${ns}.conceptsIntro`) },
    { type: 'h3', text: t(`${ns}.mappingTitle`) },
    { type: 'p',  text: t(`${ns}.mappingIntro`) },
    { type: 'table',
      cols: [{ label: t(`${ns}.col1`) }, { label: t(`${ns}.col2`) }, { label: t(`${ns}.col3`) }],
      rows },
    { type: 'h3', text: t(`${ns}.workflowTitle`) },
    { type: 'p',  text: t(`${ns}.workflowIntro`) },
    { type: 'ol', items: [1, 2, 3, 4, 5].map(n => t(`${ns}.workflow${n}`)) },
    { type: 'h3', text: t(`${ns}.dataTitle`) },
    { type: 'p',  text: t(`${ns}.dataBody`) },
    { type: 'h3', text: t(`${ns}.tipsTitle`) },
    { type: 'ul', items: [1, 2, 3, 4].map(n => t(`${ns}.tip${n}`)) },
  ];
}

/** Module-overview primer: data groups + a phase→modules table per cycle. */
export function modulesBlocks(i18n, t, moduleRegistry) {
  const tm = (k, vars) => t(`modules.${  k}`, vars);            // training.modules.*
  const moduleName = (m) => {
    const key = `modules.${m.id}.name`;
    return i18n.exists(key) ? i18n.t(key) : m.id;
  };
  const visibleModules = moduleRegistry.getAll().filter(m => !m.hiddenFromMenu);

  const dataGroupOrder = ['collect', 'visualize', 'process'];
  const dataGroupLabels = {
    collect: tm('groupCollect'), visualize: tm('groupVisualize'), process: tm('groupProcess'),
  };
  const byGroup = new Map();
  visibleModules.filter(m => m.phase === 'data')
    .sort((a, b) => moduleName(a).localeCompare(moduleName(b)))
    .forEach(m => {
      const g = m.group || 'other';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(m);
    });
  const orderedGroups = [
    ...dataGroupOrder.filter(g => byGroup.has(g)),
    ...[...byGroup.keys()].filter(g => !dataGroupOrder.includes(g)),
  ];
  const dataRows = orderedGroups.map(g => ([
    cellOf(dataGroupLabels[g] || tm('groupOther')),
    cellOf(byGroup.get(g).map(moduleName).join(', ')),
  ]));

  const blocks = [
    { type: 'p',  text: tm('intro') },
    { type: 'h3', text: tm('dataTitle') },
    { type: 'p',  text: tm('dataIntro') },
    { type: 'table',
      cols: [{ label: tm('colGroup'), style: 'width: 22%;' }, { label: tm('colModules') }],
      rows: dataRows },
    { type: 'h3', text: tm('cyclesTitle') },
    { type: 'p',  text: tm('cyclesIntro') },
  ];

  Object.keys(CYCLES).forEach(cycleId => {
    const cycle = getCycle(cycleId);
    const phaseBuckets = new Map();
    const extras = [];
    visibleModules.filter(m => m.phase !== 'data').forEach(m => {
      const mapping = m.cycles?.[cycleId];
      if (!mapping) { extras.push(m); return; }
      const list = phaseBuckets.get(mapping.phase) || [];
      list.push(m);
      phaseBuckets.set(mapping.phase, list);
    });

    const rows = cycle.phases.map(phase => {
      const mods = (phaseBuckets.get(phase.id) || [])
        .sort((a, b) => moduleName(a).localeCompare(moduleName(b)));
      const segs = [];
      mods.forEach((m, idx) => {
        if (idx > 0) segs.push({ text: ', ' });
        segs.push({ text: moduleName(m) });
        const allowed = m.cycles?.[cycleId]?.allowedPhases || [];
        const extraPhases = allowed.filter(p => p !== phase.id);
        if (extraPhases.length) {
          const labels = extraPhases.map(pid => {
            const pdef = getPhaseDef(cycleId, pid);
            return pdef ? pdef.letter : pid;
          }).join(', ');
          segs.push({ text: ` (${  tm('alsoAllowed', { phases: labels })  })`, cls: 'hint' });
        }
      });
      const phaseCell = cell(
        [{ text: phase.letter, cls: 'em' }, { text: ` — ${  i18n.t(phase.i18nKey)}` }],
        'training-area__phase-col',
      );
      const modsCell = segs.length ? cell(segs) : cell([{ text: tm('phaseEmpty'), cls: 'hint' }]);
      return [phaseCell, modsCell];
    });

    const extrasNames = extras
      .sort((a, b) => moduleName(a).localeCompare(moduleName(b)))
      .map(moduleName).join(', ');
    rows.push([
      cell([{ text: '⋯', cls: 'em' }, { text: ` — ${  tm('extras')}` }], 'training-area__phase-col'),
      extrasNames ? cellOf(extrasNames) : cell([{ text: tm('phaseEmpty'), cls: 'hint' }]),
    ]);

    blocks.push({ type: 'h3', text: i18n.t(`cycles.${cycleId}.name`) });
    blocks.push({ type: 'table',
      cols: [{ label: tm('colPhase'), style: 'width: 22%;' }, { label: tm('colModules') }],
      rows });
  });

  return blocks;
}

const TABS = [
  { id: 'dmaic',  labelKey: 'tabDmaic' },
  { id: 'dmadv',  labelKey: 'tabDmadv' },
  { id: 'eightd', labelKey: 'tabEightd' },
  { id: 'triz',   labelKey: 'tabTriz' },
  { id: 'modules', labelKey: 'tabModules' },
  { id: 'minitab', labelKey: 'tabMinitab' },
  { id: 'jmp',    labelKey: 'tabJmp' },
];

export default createPage({
  id: 'training',
  templateUrl: new URL('js/pages/training/training.html', document.baseURI).href,
  container: '#training-area',
  button: '#training-btn',
  overlay: 'training',
  bodyClass: 'training-area-open',
  i18nKey: 'training',
  data(context, t) {
    const i18n = context.i18n;
    const moduleRegistry = context.moduleRegistry;
    return {
      activeTab: 'dmaic',
      tabs: TABS.map(x => ({ id: x.id, label: t(x.labelKey) })),
      pageTitle: () => t('title'),
      pageSubtitle: () => t('subtitle'),
      tabClass(id) {
        return id === this.activeTab
          ? 'training-area__tab training-area__tab--active'
          : 'training-area__tab';
      },
      selectTab(id) { this.activeTab = id; },
      tdClass(c) { return c.cls || ''; },
      thStyle(col) { return col.style || ''; },
      isType(b, type) { return b.type === type; },
      isEm(seg) { return seg.cls === 'em'; },
      isHint(seg) { return seg.cls === 'hint'; },
      isPlain(seg) { return !seg.cls; },
      blocks() {
        switch (this.activeTab) {
          case 'triz':    return trizBlocks(t);
          case 'modules': return modulesBlocks(i18n, t, moduleRegistry);
          case 'minitab': return toolBlocks(t, 'minitab');
          case 'jmp':     return toolBlocks(t, 'jmp');
          default:        return cycleBlocks(t, this.activeTab);
        }
      },
    };
  },
});
